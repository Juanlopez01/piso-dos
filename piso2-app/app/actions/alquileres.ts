// app/actions/alquileres.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'
// Importamos format y en-US para que la fecha quede en el formato gringo que pide la BDD (YYYY-MM-DD)
import { format } from 'date-fns'

export async function crearAlquileresAction(inserts: any[]) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        // 🚀 MAGIA ANTI-ZONAS HORARIAS
        const insertsLimpios = inserts.map(item => {
            let fechaLimpia = item.fecha;

            // 1. Si llega como objeto Date nativo de JS (ej: desde el MultiDatePicker)
            if (fechaLimpia instanceof Date) {
                // Forzamos el formato usando date-fns, que respeta la zona horaria local
                fechaLimpia = format(fechaLimpia, 'yyyy-MM-dd');
            }
            // 2. Si llega como String con zona horaria (ej: "2026-05-24T03:00:00Z")
            else if (typeof fechaLimpia === 'string') {
                fechaLimpia = fechaLimpia.split('T')[0];
            }

            return {
                ...item,
                fecha: fechaLimpia
            };
        });

        const { error } = await supabase.from('alquileres').insert(insertsLimpios)
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
        const promesas = updates.map(u => supabase.from('alquileres').update({
            monto_total: u.monto_total, // 🚀 FIX: AHORA SÍ GUARDAMOS EL NUEVO TOTAL CON EL RECARGO
            monto_pagado: u.monto_pagado,
            estado_pago: u.estado_pago,
            estado: u.estado,
            metodo_pago: u.metodo_pago
        }).eq('id', u.id))

        await Promise.all(promesas)

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

export async function editarAlquilerFechaHoraAction(
    id: string,
    nuevaFecha: string,
    horaInicio: string,
    horaFin: string
) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        // Validar que el alquiler original sea a más de 24h
        const { data: alquiler } = await supabase
            .from('alquileres')
            .select('fecha, hora_inicio')
            .eq('id', id)
            .single()

        if (!alquiler) return { success: false, error: 'Reserva no encontrada' }

        const fechaOriginal = new Date(`${alquiler.fecha}T${alquiler.hora_inicio}`)
        const diff = fechaOriginal.getTime() - Date.now()
        if (diff < 24 * 60 * 60 * 1000) {
            return { success: false, error: 'Solo se puede editar con más de 24 horas de anticipación.' }
        }

        const { error } = await supabase
            .from('alquileres')
            .update({ fecha: nuevaFecha, hora_inicio: horaInicio, hora_fin: horaFin })
            .eq('id', id)

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