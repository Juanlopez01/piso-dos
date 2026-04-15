// app/actions/tienda.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

// --- ACCIONES PARA PRODUCTOS ---

export async function guardarProductoAction(payload: any, id?: string) {
    const supabase = await createClient()
    try {
        // 🚀 BLINDAJE: getSession en lugar de getUser
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

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
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('productos').update({ activo: !currentStatus }).eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/productos')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// --- ACCIONES PARA CUPONES ---

export async function guardarCuponAction(codigo: string, porcentaje: number) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('cupones').insert({
            codigo,
            porcentaje,
            activo: true
        })

        if (error) {
            if (error.code === '23505') throw new Error('Ese código de cupón ya existe')
            throw new Error(error.message)
        }

        revalidatePath('/productos')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function toggleCuponAction(id: string, currentStatus: boolean) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('cupones').update({ activo: !currentStatus }).eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/productos')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarCuponAction(id: string) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('cupones').delete().eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/productos')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// --- ACCIONES PARA PASES EXCLUSIVOS ---

export async function cargarPaseExclusivoAction(usuarioId: string, paseReferencia: string, cantidadComprada: number) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        // 1. Buscamos si el usuario ya tiene pases para esta clase
        const { data: paseExistente } = await supabase
            .from('pases_exclusivos')
            .select('id, cantidad')
            .eq('usuario_id', usuarioId)
            .eq('pase_referencia', paseReferencia)
            .single()

        if (paseExistente) {
            // 2A. Si ya tiene, le sumamos los nuevos
            const { error } = await supabase
                .from('pases_exclusivos')
                .update({ cantidad: paseExistente.cantidad + cantidadComprada })
                .eq('id', paseExistente.id)

            if (error) throw new Error(error.message)
        } else {
            // 2B. Si es la primera vez, le creamos la fila
            const { error } = await supabase
                .from('pases_exclusivos')
                .insert([{
                    usuario_id: usuarioId,
                    pase_referencia: paseReferencia,
                    cantidad: cantidadComprada
                }])

            if (error) throw new Error(error.message)
        }

        return { success: true, message: 'Pase exclusivo cargado con éxito' }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}