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
        if (!profile || !['admin', 'coordinador'].includes(profile.rol)) {
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

// 2. AGREGAR/QUITAR MIEMBROS (Solo Admin/Coord)
export async function toggleMiembroCompaniaAction(companiaId: string, alumnoId: string, accion: 'agregar' | 'remover') {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        // 🔒 Verificamos Rol
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        if (!profile || !['admin', 'coordinador'].includes(profile.rol)) {
            throw new Error('No tenés permisos para modificar miembros.')
        }

        if (accion === 'remover') {
            const { error } = await supabase.from('perfiles_companias').delete().match({ perfil_id: alumnoId, compania_id: companiaId })
            if (error) throw error
        } else {
            const { error } = await supabase.from('perfiles_companias').insert([{ perfil_id: alumnoId, compania_id: companiaId }])
            if (error) throw error
        }

        revalidatePath('/companias')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}