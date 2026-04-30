// app/actions/companias.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

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
                // ⚠️ CORRECCIÓN: Tabla 'inscripciones' y columna 'user_id'
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

                // ⚠️ CORRECCIÓN: Buscamos en 'inscripciones' usando 'user_id' para no duplicar
                const { data: reservasExistentes } = await supabase.from('inscripciones').select('clase_id').eq('user_id', alumnoId).in('clase_id', clasesIds)
                const idsReservados = reservasExistentes?.map(r => r.clase_id) || []

                const nuevasReservas = clasesFuturas
                    .filter(c => !idsReservados.includes(c.id))
                    .map(c => ({
                        clase_id: c.id,
                        user_id: alumnoId, // ⚠️ CORRECCIÓN: El ID del alumno va en 'user_id'
                        // Si tu tabla inscripciones requiere otros campos obligatorios por defecto,
                        // como 'modalidad' o 'estado', agregalos acá. Por ahora asumo que solo con estos 2 funciona.
                    }))

                // Si hay clases nuevas, lo anotamos de una
                if (nuevasReservas.length > 0) {
                    await supabase.from('inscripciones').insert(nuevasReservas)
                }
            }
        }

        revalidatePath('/companias')
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