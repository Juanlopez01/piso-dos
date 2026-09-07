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

export async function adminRetirarAction(monto: number, concepto: string) {
    const supabase = await createClient()
    const adminSupabase = getAdminClient()

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        if (perfil?.rol !== 'admin') throw new Error('Solo administradores pueden hacer retiros al pozo.')

        if (monto <= 0) throw new Error('El monto debe ser mayor a cero.')

        const { error } = await adminSupabase.from('caja_movimientos').insert({
            turno_id: null,
            tipo: 'egreso',
            concepto: concepto?.trim() || 'Retiro Admin → Pozo',
            monto,
            metodo_pago: 'efectivo',
            origen_referencia: 'retiro_pozo_liq'
        })

        if (error) throw new Error(error.message)
        revalidatePath('/caja')
        revalidatePath('/liquidaciones')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// Solo admin. Valida la sesión real (no el admin-client).
async function requireAdmin() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false as const, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (perfil?.rol !== 'admin') return { ok: false as const, error: 'Solo un admin puede hacer esto.' }
    return { ok: true as const, userId: session.user.id }
}

export async function editarHorarioTurnoAction(turnoId: string, tipo: 'apertura' | 'cierre', nuevaFechaISO: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const supabaseAdmin = getAdminClient()
    try {
        const campoActualizar = tipo === 'apertura' ? { fecha_apertura: nuevaFechaISO } : { fecha_cierre: nuevaFechaISO };
        const { error } = await supabaseAdmin.from('caja_turnos').update(campoActualizar).eq('id', turnoId)
        if (error) throw new Error(error.message)
        revalidatePath('/liquidaciones')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// Turnos de una recep en un mes (para el editor de horas del admin). Incluye
// abiertos, con horas topeadas a 12 (para que no inflen ni se pierdan).
export async function getTurnosRecepMesAction(anio: number, mes: number, recepId: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false as const, error: perm.error, turnos: [] as any[] }
    const admin = getAdminClient()
    const desde = new Date(anio, mes - 1, 1).toISOString()
    const hasta = new Date(anio, mes, 1).toISOString()
    const { data } = await admin.from('caja_turnos')
        .select('id, fecha_apertura, fecha_cierre, estado, sede:sedes(nombre)')
        .eq('usuario_id', recepId).gte('fecha_apertura', desde).lt('fecha_apertura', hasta)
        .order('fecha_apertura', { ascending: true })
    const MAX = 12
    const turnos = (data || []).map((t: any) => {
        const abierto = !t.fecha_cierre
        const fin = abierto ? Date.now() : new Date(t.fecha_cierre).getTime()
        let horas = (fin - new Date(t.fecha_apertura).getTime()) / 3600000
        if (horas < 0) horas = 0
        const topeado = horas > MAX
        if (topeado) horas = MAX
        return {
            id: t.id, fecha_apertura: t.fecha_apertura, fecha_cierre: t.fecha_cierre,
            abierto, horas: Math.round(horas * 100) / 100, topeado,
            sede: Array.isArray(t.sede) ? t.sede[0]?.nombre : t.sede?.nombre,
        }
    })
    return { success: true as const, turnos }
}

// Cierra manualmente un turno (setea fecha_cierre + estado). Solo admin.
export async function cerrarTurnoRecepAction(turnoId: string, fechaCierreISO: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('caja_turnos')
        .update({ fecha_cierre: fechaCierreISO, estado: 'cerrada' }).eq('id', turnoId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/liquidaciones')
    return { success: true }
}

// Fuerza el auto-cierre de turnos abandonados (>12h abiertos). Solo admin.
// Mismo criterio que el cron; sirve para correrlo a mano cuando haga falta.
export async function autocerrarTurnosAction() {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error, cerrados: 0 }
    const admin = getAdminClient()
    const { data, error } = await admin.rpc('autocerrar_turnos_caja')
    if (error) return { success: false, error: error.message, cerrados: 0 }
    revalidatePath('/liquidaciones')
    return { success: true, cerrados: Number(data) || 0 }
}
// ============================================================================
// Reporte mensual de caja (por día · efectivo/transferencia · ingreso/egreso).
// Se calcula solo de caja_movimientos; los overrides manuales por celda mandan.
// Solo admin.
// ============================================================================

// Fecha en ART (UTC-3) para agrupar por día correctamente.
function diaART(iso: string): number {
    const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
    return d.getUTCDate()
}

export async function getReporteMensualCajaAction(anio: number, mes: number) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false as const, error: perm.error, dias: [] as any[], totales: null }
    const admin = getAdminClient()

    const desde = new Date(anio, mes - 1, 1).toISOString()
    const hasta = new Date(anio, mes, 1).toISOString()
    const { data: movs } = await admin.from('caja_movimientos')
        .select('tipo, metodo_pago, monto, created_at').gte('created_at', desde).lt('created_at', hasta)

    const nDias = new Date(anio, mes, 0).getDate()
    // auto[dia] = { ie, it, ee, et } (ingreso/egreso × efectivo/transferencia)
    const auto: Record<number, { ie: number; it: number; ee: number; et: number }> = {}
    for (let d = 1; d <= nDias; d++) auto[d] = { ie: 0, it: 0, ee: 0, et: 0 }
    for (const m of (movs || []) as any[]) {
        const d = diaART(m.created_at)
        if (!auto[d]) continue
        const esEfvo = (m.metodo_pago || 'efectivo') === 'efectivo'
        const monto = Number(m.monto || 0)
        if (m.tipo === 'egreso') { if (esEfvo) auto[d].ee += monto; else auto[d].et += monto }
        else { if (esEfvo) auto[d].ie += monto; else auto[d].it += monto }
    }

    const { data: ovs } = await admin.from('caja_reporte_override').select('dia, tipo, metodo, monto').eq('anio', anio).eq('mes', mes)
    const ovMap: Record<string, number> = {}
    for (const o of (ovs || []) as any[]) ovMap[`${o.dia}|${o.tipo}|${o.metodo}`] = Number(o.monto)

    const val = (dia: number, tipo: string, metodo: string, autoVal: number) => {
        const k = `${dia}|${tipo}|${metodo}`
        return k in ovMap ? ovMap[k] : autoVal
    }

    const dias = []
    const tot = { ie: 0, it: 0, ee: 0, et: 0 }
    for (let d = 1; d <= nDias; d++) {
        const a = auto[d]
        const ie = val(d, 'ingreso', 'efectivo', a.ie)
        const it = val(d, 'ingreso', 'transferencia', a.it)
        const ee = val(d, 'egreso', 'efectivo', a.ee)
        const et = val(d, 'egreso', 'transferencia', a.et)
        tot.ie += ie; tot.it += it; tot.ee += ee; tot.et += et
        dias.push({
            dia: d, ie, it, ee, et,
            neto: ie + it - ee - et,
            auto: a,
            editado: {
                ie: `${d}|ingreso|efectivo` in ovMap, it: `${d}|ingreso|transferencia` in ovMap,
                ee: `${d}|egreso|efectivo` in ovMap, et: `${d}|egreso|transferencia` in ovMap,
            },
        })
    }
    const totales = { ...tot, neto: tot.ie + tot.it - tot.ee - tot.et }
    return { success: true as const, dias, totales }
}

// Guarda (o borra si monto es null) una corrección manual de una celda.
export async function setOverrideCajaAction(anio: number, mes: number, dia: number, tipo: 'ingreso' | 'egreso', metodo: 'efectivo' | 'transferencia', monto: number | null) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    if (monto === null || monto === undefined || (monto as any) === '') {
        const { error } = await admin.from('caja_reporte_override').delete()
            .eq('anio', anio).eq('mes', mes).eq('dia', dia).eq('tipo', tipo).eq('metodo', metodo)
        if (error) return { success: false, error: error.message }
        return { success: true }
    }
    const { error } = await admin.from('caja_reporte_override').upsert(
        { anio, mes, dia, tipo, metodo, monto: Math.max(0, Number(monto) || 0), updated_at: new Date().toISOString(), updated_by: perm.userId },
        { onConflict: 'anio,mes,dia,tipo,metodo' }
    )
    if (error) return { success: false, error: error.message }
    return { success: true }
}
