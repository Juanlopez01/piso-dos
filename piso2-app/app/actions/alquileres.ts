// app/actions/alquileres.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function crearAlquileresAction(inserts: any[]) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        const { error } = await supabase.from('alquileres').insert(inserts)
        if (error) throw error

        revalidatePath('/alquileres')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cobrarAlquilerAction(updates: any[], movimientoCaja: any) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        // Actualizamos cada ítem del grupo
        const promesas = updates.map(u => supabase.from('alquileres').update({
            monto_pagado: u.monto_pagado,
            estado_pago: u.estado_pago,
            estado: u.estado,
            metodo_pago: u.metodo_pago
        }).eq('id', u.id))

        await Promise.all(promesas)

        // Registramos el ingreso en la caja
        const { error: errorMov } = await supabase.from('caja_movimientos').insert(movimientoCaja)
        if (errorMov) throw new Error('Error al registrar el movimiento en caja')

        revalidatePath('/alquileres')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarReservaAction(ids: string[]) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        const { error } = await supabase.from('alquileres').delete().in('id', ids)
        if (error) throw error

        revalidatePath('/alquileres')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function actualizarTarifaAction(salaId: string, field: string, value: number) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        const { error } = await supabase.from('salas').update({ [field]: value }).eq('id', salaId)
        if (error) throw error

        revalidatePath('/alquileres')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}