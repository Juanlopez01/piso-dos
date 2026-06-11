'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { abrirCajaSchema, cerrarCajaSchema, movimientoSchema, editarMovimientoSchema } from '@/lib/validations/caja'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function abrirCajaAction(sedeId: string, montoInicial: number) {
    const parsed = abrirCajaSchema.safeParse({ sedeId, montoInicial })
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { data: cajaAbierta } = await supabase
            .from('caja_turnos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'abierta')
            .limit(1)
            .maybeSingle()

        if (cajaAbierta) throw new Error('Ya tenés un turno de caja abierto. Cerralo antes de abrir uno nuevo.')

        const { error } = await supabase.from('caja_turnos').insert({
            usuario_id: session.user.id,
            sede_id: parsed.data.sedeId,
            monto_inicial: parsed.data.montoInicial,
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

export async function cerrarCajaAction(turnoId: string, efectivoReal?: number) {
    const parsed = cerrarCajaSchema.safeParse({ turnoId, efectivoReal })
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { data: res, error } = await supabase.rpc('cerrar_turno_caja', { p_turno_id: parsed.data.turnoId })
        if (error || !res?.success) throw new Error(res?.message || 'Error al procesar el cierre de caja.')

        if (parsed.data.efectivoReal !== undefined) {
            await supabase.from('caja_turnos').update({ monto_final: parsed.data.efectivoReal }).eq('id', parsed.data.turnoId)
        }

        revalidatePath('/caja')
        return { success: true, message: res.message }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function registrarMovimientoAction(payload: unknown) {
    const parsed = movimientoSchema.safeParse(payload)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('caja_movimientos').insert(parsed.data)
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

export async function editarMovimientoAction(
    movimientoId: string,
    payload: { concepto: string; monto: number; metodo_pago: string; tipo: string; turno_id: string }
) {
    const parsed = editarMovimientoSchema.safeParse({ movimientoId, ...payload })
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    try {
        const supabaseAdmin = getAdminClient()
        const { error } = await supabaseAdmin
            .from('caja_movimientos')
            .update({
                concepto: parsed.data.concepto,
                monto: parsed.data.monto,
                metodo_pago: parsed.data.metodo_pago,
                tipo: parsed.data.tipo,
                turno_id: parsed.data.turno_id,
            })
            .eq('id', parsed.data.movimientoId)

        if (error) throw new Error(error.message)

        revalidatePath('/caja')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarMovimientoCajaAction(movimientoId: string) {
    const supabase = await createClient()

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        // 🔒 SEGURIDAD: Solo Admin puede borrar movimientos
        const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        if (perfil?.rol !== 'admin') throw new Error('Solo un administrador puede borrar movimientos de caja.')

        // Borramos el movimiento
        const { error } = await supabase
            .from('caja_movimientos')
            .delete()
            .eq('id', movimientoId)

        if (error) throw error

        revalidatePath('/finanzas') // Ajustá esta ruta a donde tengas la vista de caja
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function editarMontoInicialAction(turnoId: string, nuevoMonto: number) {
    const supabase = await createClient()

    try {
        const { error } = await supabase
            .from('caja_turnos')
            .update({ monto_inicial: nuevoMonto })
            .eq('id', turnoId)

        if (error) throw error

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function editarHorarioTurnoAction(turnoId: string, tipo: 'apertura' | 'cierre', nuevaFechaISO: string) {
    const supabaseAdmin = getAdminClient()

    try {
        const campoActualizar = tipo === 'apertura' ? { fecha_apertura: nuevaFechaISO } : { fecha_cierre: nuevaFechaISO };

        const { error } = await supabaseAdmin
            .from('caja_turnos')
            .update(campoActualizar)
            .eq('id', turnoId)

        if (error) throw new Error(error.message)

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}