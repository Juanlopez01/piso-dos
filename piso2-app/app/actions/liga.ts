'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// 🚀 CLIENTE DIOS: Para bypass de RLS en inscripciones masivas
const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

// Nombres de perfiles por ID (bypass RLS). Para mostrar alumnos dados de baja
// de la liga en las estadísticas por rango. Solo staff.
export async function getNombresPerfilesAction(ids: string[]) {
    if (!ids || ids.length === 0) return {}

    // Sin gate de sesión a propósito: solo resuelve nombres por UUID (no sensible) y
    // se la invoca desde el fetcher de SWR donde el chequeo de sesión devolvía {} vacío.
    const admin = getAdminClient()
    const { data } = await admin.from('profiles').select('id, nombre, apellido, nombre_completo, nivel_liga').in('id', ids)

    const map: Record<string, { nombre_completo: string; nivel_liga: number | null }> = {}
    data?.forEach((p: any) => {
        const nombre = p.nombre_completo || [p.nombre, p.apellido].filter(Boolean).join(' ').trim() || 'Alumno'
        map[p.id] = { nombre_completo: nombre, nivel_liga: p.nivel_liga }
    })
    return map
}

// Guarda la cuota de liga para un mes puntual (override del precio global).
export async function guardarCuotaLigaMesAction(
    anio: number, mes: number, nivel: number, precioTransf: number, precioEfvo: number
) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !['admin', 'recepcion'].includes(perfil.rol)) return { success: false, error: 'Sin permisos' }

    const admin = getAdminClient()
    const { error } = await admin.from('liga_cuotas').upsert({
        anio, mes, nivel,
        precio_transf: precioTransf,
        precio_efvo: precioEfvo,
        updated_at: new Date().toISOString()
    }, { onConflict: 'anio,mes,nivel' })

    if (error) return { success: false, error: error.message }
    return { success: true }
}

// Quita el override de un mes/nivel → vuelve a usar el precio global por defecto.
export async function eliminarCuotaLigaMesAction(anio: number, mes: number, nivel: number) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !['admin', 'recepcion'].includes(perfil.rol)) return { success: false, error: 'Sin permisos' }

    const admin = getAdminClient()
    const { error } = await admin.from('liga_cuotas').delete().eq('anio', anio).eq('mes', mes).eq('nivel', nivel)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// Estadísticas de asistencia por RANGO para staff, calculadas con admin client
// (bypass RLS): garantiza que aparezcan TODOS los niveles sin importar el rol del que mira.
export async function getAsistenciasRangoStaffAction(desde: string, hasta: string) {
    // Sin gate de sesión a propósito: llamada desde el fetcher de SWR, donde el chequeo
    // de sesión devolvía {} vacío (mismo problema que getNombresPerfilesAction).
    // Solo devuelve estadísticas de asistencia por fecha (no sensible).
    const admin = getAdminClient()
    const desdeIso = new Date(`${desde}T00:00:00`).toISOString()
    const hastaIso = new Date(`${hasta}T23:59:59`).toISOString()

    const { data: clases } = await admin.from('clases')
        .select('id, nombre, inicio')
        .eq('es_la_liga', true)
        .gte('inicio', desdeIso)
        .lte('inicio', hastaIso)
        .neq('estado', 'cancelada')

    const stats: Record<string, any> = {}
    if (clases && clases.length > 0) {
        const ids = clases.map((c: any) => c.id)
        const claseMap: Record<string, any> = Object.fromEntries(clases.map((c: any) => [c.id, c]))

        const insc: any[] = []
        let from = 0
        while (true) {
            const { data: pagina } = await admin.from('inscripciones')
                .select('user_id, clase_id, estado_asistencia')
                .in('clase_id', ids)
                .order('id', { ascending: true })
                .range(from, from + 999)
            if (!pagina || pagina.length === 0) break
            insc.push(...pagina)
            if (pagina.length < 1000) break
            from += 1000
        }

        const ahora = Date.now()
        const keyMap: Record<string, string> = { presente: 'presentes', ausente: 'ausentes', justificada: 'justificadas', saf: 'saf', media_falta: 'medias_faltas' }

        insc.forEach((i: any) => {
            const c = claseMap[i.clase_id]
            if (!c || new Date(c.inicio).getTime() > ahora || !i.user_id) return
            const mat = c.nombre
            if (!stats[i.user_id]) stats[i.user_id] = { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0, desglose: {} }
            if (!stats[i.user_id].desglose[mat]) stats[i.user_id].desglose[mat] = { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0 }
            stats[i.user_id].total++
            stats[i.user_id].desglose[mat].total++
            const k = keyMap[i.estado_asistencia]
            if (k) { stats[i.user_id][k]++; stats[i.user_id].desglose[mat][k]++ }
        })
    }

    const ids = Object.keys(stats)
    const perfilesRango: Record<string, { nombre_completo: string; nivel_liga: number | null }> = {}
    if (ids.length > 0) {
        const { data: perfiles } = await admin.from('profiles').select('id, nombre, apellido, nombre_completo, nivel_liga').in('id', ids)
        perfiles?.forEach((p: any) => {
            perfilesRango[p.id] = {
                nombre_completo: p.nombre_completo || [p.nombre, p.apellido].filter(Boolean).join(' ').trim() || 'Alumno',
                nivel_liga: p.nivel_liga
            }
        })
    }

    return { statsAsistencia: stats, perfilesRango }
}

export async function enviarAvisoAction(payload: any) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('liga_avisos').insert({ ...payload, autor_id: session.user.id })
        if (error) throw new Error(error.message)

        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarAvisoAction(id: string) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('liga_avisos').delete().eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function guardarEvaluacionAction(payload: any) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('liga_evaluaciones').upsert(
            { ...payload, profesor_id: session.user.id },
            { onConflict: 'alumno_id,clase_id,cuatrimestre' }
        )

        if (error) throw new Error(error.message)

        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cambiarNivelLigaAction(alumnoId: string, nuevoNivel: number | null) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('profiles').update({ nivel_liga: nuevoNivel }).eq('id', alumnoId)
        if (error) throw new Error(error.message)

        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function actualizarPrecioGlobalAction(clave: string, valor: number) {
    const supabase = await createClient()
    try {
        const { error } = await supabase
            .from('configuraciones')
            .upsert({ clave, valor }, { onConflict: 'clave' })

        if (error) throw error;

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getPreciosLigaAction() {
    const supabase = await createClient()
    const { data } = await supabase.from('configuraciones').select('*')
    return data || []
}

export async function asignarBecaAction(usuarioId: string, porcentaje: number) {
    const supabase = await createClient()
    try {
        // 🚀 CORRECCIÓN: La columna es 'porcentaje_beca_liga'
        const { error } = await supabase.from('profiles').update({ porcentaje_beca_liga: porcentaje }).eq('id', usuarioId)
        if (error) throw new Error(error.message)
        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// ============================================================================
// 🚀 BOTÓN MÁGICO LIGA: INSCRIBIR POR NIVEL A LAS CLASES DEL MES
// ============================================================================
export async function inscribirPadronLigaAction(nivel: number, mes: number, anio: number) {
    const supabaseAdmin = getAdminClient()

    try {
        // 1. Traemos a todos los alumnos que pertenecen a este nivel
        const { data: alumnos, error: errAlumnos } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('rol', 'alumno')
            .eq('nivel_liga', nivel)

        if (errAlumnos || !alumnos || alumnos.length === 0) {
            return { success: false, error: `No hay alumnos en el Nivel ${nivel}.` }
        }

        const alumnosIds = alumnos.map(a => a.id)

        // 2. Buscamos todas las clases de La Liga para ese nivel y ese mes
        const primerDiaMes = new Date(anio, mes - 1, 1).toISOString()
        const ultimoDiaMes = new Date(anio, mes, 0, 23, 59, 59, 999).toISOString()

        const { data: clases, error: errClases } = await supabaseAdmin
            .from('clases')
            .select('id')
            .eq('es_la_liga', true)
            .eq('liga_nivel', nivel)
            .gte('inicio', primerDiaMes)
            .lte('inicio', ultimoDiaMes)
            .neq('estado', 'cancelada')

        if (errClases || !clases || clases.length === 0) {
            return { success: false, error: `No hay clases de Nivel ${nivel} en ${mes}/${anio}.` }
        }

        const clasesIds = clases.map(c => c.id)

        // 3. Cruzamos para ver quién ya está inscripto y evitar duplicados
        const { data: inscripcionesExistentes } = await supabaseAdmin
            .from('inscripciones')
            .select('user_id, clase_id')
            .in('clase_id', clasesIds)
            .in('user_id', alumnosIds)

        const inscripcionesSet = new Set(
            (inscripcionesExistentes || []).map(i => `${i.user_id}-${i.clase_id}`)
        )

        // 4. Armamos el lote de inscripciones faltantes
        const batchInscripciones: any[] = []

        alumnosIds.forEach(alumnoId => {
            clasesIds.forEach(claseId => {
                const llave = `${alumnoId}-${claseId}`
                if (!inscripcionesSet.has(llave)) {
                    batchInscripciones.push({
                        user_id: alumnoId,
                        clase_id: claseId,
                        modalidad: 'La Liga',
                        valor_credito: 0, // 💰 $0 para estadística pura
                        metodo_pago: 'credito',
                        presente: false,
                        es_invitado: false
                    })
                }
            })
        })

        // 5. Inserción masiva
        if (batchInscripciones.length > 0) {
            const { error: errInsert } = await supabaseAdmin.from('inscripciones').insert(batchInscripciones)
            if (errInsert) throw new Error(`Error en inserción masiva: ${errInsert.message}`)
            revalidatePath('/la-liga')
            return { success: true, message: `Se inscribieron ${batchInscripciones.length} alumnos en las clases del nivel ${nivel}.` }
        } else {
            return { success: true, message: 'Todos los alumnos del nivel ya estaban inscriptos.' }
        }

    } catch (error: any) {
        return { success: false, error: error.message }
    }
}