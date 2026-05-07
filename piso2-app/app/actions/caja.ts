'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// 🚀 CLIENTE DIOS: Bypassea la seguridad RLS para poder mover plata entre distintas cajas/sedes libremente
const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

export async function abrirCajaAction(sedeId: string, montoInicial: number) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        // 🚀 ACÁ ESTABA EL ERROR DE LAS SEDES CRUZADAS
        // Verificamos que el usuario NO tenga otra caja abierta antes de dejarlo abrir una nueva.
        const { data: cajaAbierta } = await supabase
            .from('caja_turnos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'abierta')
            .limit(1)
            .maybeSingle()

        if (cajaAbierta) {
            throw new Error('Ya tenés un turno de caja abierto. Por favor, cerralo antes de abrir uno nuevo en otra sede.')
        }

        const { error } = await supabase.from('caja_turnos').insert({
            usuario_id: session.user.id,
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

        revalidatePath('/finanzas')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// 🚀 NUEVA ACCIÓN: EDITAR Y REUBICAR MOVIMIENTOS
export async function editarMovimientoAction(
    movimientoId: string,
    payload: { concepto: string, monto: number, metodo_pago: string, tipo: string, turno_id: string }
) {
    try {
        // Usamos el cliente Dios (Admin) para que el escudo de seguridad (RLS) no bloquee
        // la capacidad del administrador de sacar plata de un turno_id y meterlo en otro distinto.
        const supabaseAdmin = getAdminClient()

        const { error } = await supabaseAdmin
            .from('caja_movimientos')
            .update({
                concepto: payload.concepto,
                monto: payload.monto,
                metodo_pago: payload.metodo_pago,
                tipo: payload.tipo,
                turno_id: payload.turno_id
            })
            .eq('id', movimientoId)

        if (error) throw new Error(error.message)

        revalidatePath('/caja')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}