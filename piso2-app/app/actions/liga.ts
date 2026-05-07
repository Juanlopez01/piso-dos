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