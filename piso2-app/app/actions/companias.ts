'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// 🚀 CLIENTE DIOS: Para operaciones masivas pesadas (evita cortes de permisos)
const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

// 1. CREAR COMPAÑÍA (Solo Admin/Coord)
export async function crearCompaniaAction(payload: { nombre: string, descripcion: string, coordinador_id: string }) {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        // 🔒 Verificamos Rol
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        if (!profile || !['admin', 'coordinador', 'profesor', 'recepcion'].includes(profile.rol)) {
            throw new Error('Solo administradores o coordinadores pueden crear grupos.')
        }

        const { error } = await supabase.from('companias').insert([payload])
        if (error) throw error

        revalidatePath('/companias')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// 2. AGREGAR/QUITAR MIEMBROS (Con Auto-Asignación a Clases)
export async function toggleMiembroCompaniaAction(companiaId: string, alumnoId: string, accion: 'agregar' | 'remover') {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        if (!profile || !['admin', 'coordinador', 'profesor', 'recepcion'].includes(profile.rol)) {
            throw new Error('No tenés permisos para modificar miembros.')
        }

        const hoy = new Date().toISOString()

        if (accion === 'remover') {
            // 1. Lo sacamos del grupo
            const { error } = await supabase.from('perfiles_companias').delete().match({ perfil_id: alumnoId, compania_id: companiaId })
            if (error) throw error

            // 🚀 2. AUTO-DESASIGNACIÓN: Buscamos clases futuras con 'inicio'
            const { data: clasesFuturas } = await supabase.from('clases').select('id').eq('compania_id', companiaId).gte('inicio', hoy)

            if (clasesFuturas && clasesFuturas.length > 0) {
                const clasesIds = clasesFuturas.map(c => c.id)
                await supabase.from('inscripciones')
                    .delete()
                    .eq('user_id', alumnoId)
                    .in('clase_id', clasesIds)
            }

        } else {
            // 1. Lo agregamos al grupo
            const { error } = await supabase.from('perfiles_companias').insert([{ perfil_id: alumnoId, compania_id: companiaId }])
            if (error) throw error

            // 🚀 2. AUTO-ASIGNACIÓN: Buscamos clases futuras con 'inicio'
            const { data: clasesFuturas } = await supabase.from('clases').select('id').eq('compania_id', companiaId).gte('inicio', hoy)

            if (clasesFuturas && clasesFuturas.length > 0) {
                const clasesIds = clasesFuturas.map(c => c.id)

                const { data: reservasExistentes } = await supabase.from('inscripciones').select('clase_id').eq('user_id', alumnoId).in('clase_id', clasesIds)
                const idsReservados = reservasExistentes?.map(r => r.clase_id) || []

                const nuevasReservas = clasesFuturas
                    .filter(c => !idsReservados.includes(c.id))
                    .map(c => ({
                        clase_id: c.id,
                        user_id: alumnoId,
                        modalidad: 'Compañía', // Aseguramos el nombre correcto en la tabla
                        valor_credito: 0,
                        metodo_pago: 'credito',
                        presente: false
                    }))

                // Si hay clases nuevas, lo anotamos de una
                if (nuevasReservas.length > 0) {
                    await supabase.from('inscripciones').insert(nuevasReservas)
                }
            }
        }

        revalidatePath(`/companias/${companiaId}`)
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarCompaniaAction(companiaId: string) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        if (!profile || !['admin', 'recepcion', 'coordinador'].includes(profile.rol)) throw new Error('Solo un Admin puede eliminar grupos')

        const { error } = await supabase.from('companias').delete().eq('id', companiaId)
        if (error) throw new Error(error.message)

        revalidatePath('/companias')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// ============================================================================
// 🚀 BOTÓN MÁGICO: INSCRIBIR A TODO EL PADRÓN A LAS CLASES DEL MES SELECCIONADO
// ============================================================================
export async function inscribirPadronCompaniaAction(companiaId: string, mes: number, anio: number) {
    const supabaseAdmin = getAdminClient()

    try {
        // 1. Traemos todo el padrón de la compañía
        const { data: padron, error: errPadron } = await supabaseAdmin
            .from('perfiles_companias')
            .select('perfil_id')
            .eq('compania_id', companiaId)

        if (errPadron || !padron || padron.length === 0) {
            return { success: false, error: 'El padrón está vacío o hubo un error al leerlo.' }
        }

        const alumnosIds = padron.map(p => p.perfil_id)

        // 2. Buscamos todas las clases de ese mes exacto
        const primerDiaMes = new Date(anio, mes - 1, 1).toISOString()
        const ultimoDiaMes = new Date(anio, mes, 0, 23, 59, 59, 999).toISOString()

        const { data: clases, error: errClases } = await supabaseAdmin
            .from('clases')
            .select('id')
            .eq('compania_id', companiaId)
            .gte('inicio', primerDiaMes)
            .lte('inicio', ultimoDiaMes)
            .neq('estado', 'cancelada')

        if (errClases || !clases || clases.length === 0) {
            return { success: false, error: `No hay clases programadas para el mes ${mes}/${anio}.` }
        }

        const clasesIds = clases.map(c => c.id)

        // 3. Traemos todas las inscripciones que ya existen (para no duplicar)
        const { data: inscripcionesExistentes, error: errInsc } = await supabaseAdmin
            .from('inscripciones')
            .select('user_id, clase_id')
            .in('clase_id', clasesIds)
            .in('user_id', alumnosIds)

        // Creamos un Set "Set('user_id-clase_id')" para búsqueda ultrarrápida
        const inscripcionesSet = new Set(
            (inscripcionesExistentes || []).map(i => `${i.user_id}-${i.clase_id}`)
        )

        // 4. Preparamos la matriculación masiva
        const batchInscripciones: any[] = []

        alumnosIds.forEach(alumnoId => {
            clasesIds.forEach(claseId => {
                const llave = `${alumnoId}-${claseId}`
                if (!inscripcionesSet.has(llave)) {
                    batchInscripciones.push({
                        user_id: alumnoId,
                        clase_id: claseId,
                        modalidad: 'Compañía',
                        valor_credito: 0, // 💰 CRUCIAL: $0 para no inflar la caja
                        metodo_pago: 'credito',
                        presente: false,
                        es_invitado: false
                    })
                }
            })
        })

        // 5. Insertamos de golpe (Batch Insert)
        if (batchInscripciones.length > 0) {
            const { error: errInsert } = await supabaseAdmin.from('inscripciones').insert(batchInscripciones)
            if (errInsert) throw new Error(`Fallo masivo al insertar: ${errInsert.message}`)
            return { success: true, message: `Se generaron ${batchInscripciones.length} inscripciones nuevas en el mes.` }
        } else {
            return { success: true, message: 'Todos los alumnos ya estaban inscriptos en todas las clases del mes.' }
        }

    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// ============================================================================
// 🚀 OBTENER PRECIOS DE COMPAÑÍA (Bypass RLS para saltar bloqueos de seguridad)
// ============================================================================
export async function obtenerPreciosCompaniaAction(companiaId: string) {
    const supabaseAdmin = getAdminClient()
    const { data } = await supabaseAdmin.from('configuraciones').select('clave, valor').in('clave', [
        `cuota_compania_${companiaId}`,
        `cuota_compania_${companiaId}_transf`,
        `cuota_compania_${companiaId}_efvo`
    ])
    return data || []
}