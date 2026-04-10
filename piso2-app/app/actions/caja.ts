// app/actions/caja.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function abrirCajaAction(sedeId: string, montoInicial: number) {
    const supabase = await createClient()
    try {
        // 🚀 BLINDAJE: getSession en lugar de getUser
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('caja_turnos').insert({
            usuario_id: session.user.id, // Usamos el id de la session
            sede_id: sedeId,
            monto_inicial: montoInicial,
            estado: 'abierta',
            fecha_apertura: new Date().toISOString()
        })

        if (error) throw new Error(error.message)

        revalidatePath('/caja')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cerrarCajaAction(turnoId: string) {
    const supabase = await createClient()
    try {
        // 🚀 BLINDAJE: getSession
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { data: res, error } = await supabase.rpc('cerrar_turno_caja', { p_turno_id: turnoId })
        if (error || !res?.success) throw new Error(res?.message || 'Error al procesar el cierre de caja en la base de datos.')

        revalidatePath('/caja')
        return { success: true, message: res.message }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function registrarMovimientoAction(payload: any) {
    const supabase = await createClient()
    try {
        // 🚀 BLINDAJE: getSession
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('caja_movimientos').insert(payload)
        if (error) throw new Error(error.message)

        revalidatePath('/caja')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
export async function cerrarTodasLasCajasAction() {
    const supabase = await createClient()
    try {
        // 🔒 BLINDAJE: Verificamos sesión segura
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        // 🔒 VERIFICACIÓN DE ROL: Solo el Admin puede apretar el botón de pánico
        const { data: profile } = await supabase
            .from('profiles')
            .select('rol')
            .eq('id', session.user.id)
            .single()

        if (!profile || profile.rol !== 'admin') {
            throw new Error('Solo un Administrador puede forzar el cierre global.')
        }

        // 🕒 Calculamos la fecha y hora actual para el registro
        const fechaCierre = new Date().toISOString()

        // 🚀 ACCIÓN: Actualizamos todas las cajas abiertas a cerradas
        const { error } = await supabase
            .from('caja_turnos')
            .update({
                estado: 'cerrada',
                fecha_cierre: fechaCierre
            })
            .eq('estado', 'abierta')

        if (error) throw new Error(error.message)

        // Refrescamos la vista (cambiá '/finanzas' por la ruta donde esté tu panel de cajas)
        revalidatePath('/finanzas')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}