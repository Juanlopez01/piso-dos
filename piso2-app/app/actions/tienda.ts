// app/actions/tienda.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

// --- ACCIONES PARA PRODUCTOS ---

export async function guardarProductoAction(payload: any, id?: string) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        if (id) {
            const { error } = await supabase.from('productos').update(payload).eq('id', id)
            if (error) throw new Error(error.message)
        } else {
            const { error } = await supabase.from('productos').insert(payload)
            if (error) throw new Error(error.message)
        }

        revalidatePath('/productos') // 👈 Cambiá esto si tu ruta es diferente (ej: '/tienda')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function toggleProductoAction(id: string, currentStatus: boolean) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        const { error } = await supabase.from('productos').update({ activo: !currentStatus }).eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/productos') // 👈 Cambiá esto si tu ruta es diferente
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// --- ACCIONES PARA CUPONES ---

export async function guardarCuponAction(codigo: string, porcentaje: number) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        const { error } = await supabase.from('cupones').insert({
            codigo,
            porcentaje,
            activo: true
        })

        if (error) {
            if (error.code === '23505') throw new Error('Ese código de cupón ya existe')
            throw new Error(error.message)
        }

        revalidatePath('/productos') // 👈 Cambiá esto si tu ruta es diferente
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function toggleCuponAction(id: string, currentStatus: boolean) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        const { error } = await supabase.from('cupones').update({ activo: !currentStatus }).eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/productos') // 👈 Cambiá esto si tu ruta es diferente
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarCuponAction(id: string) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        const { error } = await supabase.from('cupones').delete().eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/productos') // 👈 Cambiá esto si tu ruta es diferente
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}