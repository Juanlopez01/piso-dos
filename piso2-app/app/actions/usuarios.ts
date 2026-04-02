// app/actions/usuarios.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function cambiarRolAction(usuarioId: string, nuevoRol: string) {
    const supabase = await createClient()
    try {
        const { error } = await supabase.from('profiles').update({ rol: nuevoRol as any }).eq('id', usuarioId)
        if (error) throw new Error(error.message)
        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cambiarLigaAction(usuarioId: string, nuevoNivel: number | null) {
    const supabase = await createClient()
    try {
        const { error } = await supabase.from('profiles').update({ nivel_liga: nuevoNivel }).eq('id', usuarioId)
        if (error) throw new Error(error.message)
        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function guardarPerfilAction(usuarioId: string, obs: string, intereses: string[]) {
    const supabase = await createClient()
    try {
        const { error } = await supabase.from('profiles').update({
            staff_observations: obs,
            intereses_ritmos: intereses
        }).eq('id', usuarioId)
        if (error) throw new Error(error.message)
        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function asignarPackAction(usuarioId: string, tipoClase: string, creditos: number, monto: number, metodoPago: string) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        let turnoActivoId = null
        if (monto > 0) {
            const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
            if (!turno) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')
            turnoActivoId = turno.id
        }

        const { data, error } = await supabase.rpc('asignar_pack_manual', {
            p_user_id: usuarioId,
            p_turno_caja_id: turnoActivoId,
            p_tipo_clase: tipoClase,
            p_cantidad: creditos,
            p_monto: monto,
            p_metodo_pago: metodoPago
        })

        if (error) throw new Error('Error de conexión al cargar el pack.')
        if (!data.success) throw new Error(data.message)

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cobrarLigaAction(usuarioId: string, monto: number, metodoPago: string) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
        if (!turno) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')

        const hoy = new Date()
        const payload = {
            alumno_id: usuarioId,
            mes: hoy.getMonth() + 1,
            anio: hoy.getFullYear(),
            monto: monto,
            metodo_pago: metodoPago,
            turno_caja_id: turno.id
        }

        const { error } = await supabase.from('liga_pagos').insert(payload)
        if (error) {
            if (error.code === '23505') throw new Error('Este alumno ya tiene pagada la cuota de este mes.')
            throw new Error(error.message)
        }

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}