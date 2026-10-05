'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

// ============================================================================
// PAGOS LA LIGA — panel para recepción/admin: por cada profe de La Liga, su
// Alias/CBU y cuánto pagarle en el mes (clases × valor fijo), qué está pagado y
// cómo. Reemplaza el Excel que se lleva a mano. Recep + admin.
// ============================================================================
export async function getPagosLigaAction(anio: number, mes: number) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false as const, error: 'No autorizado', profes: [] as any[] }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !['admin', 'recepcion'].includes(perfil.rol)) return { ok: false as const, error: 'Sin permisos', profes: [] as any[] }

    const admin = getAdminClient()
    const desde = new Date(anio, mes - 1, 1).toISOString()
    const hasta = new Date(anio, mes, 1).toISOString()

    // Clases de La Liga del mes (cada una paga un monto fijo = valor_acuerdo).
    const { data: clases } = await admin.from('clases')
        .select('id, nombre, inicio, valor_acuerdo, pagado_profe, profesor_id')
        .eq('es_la_liga', true).gte('inicio', desde).lt('inicio', hasta)
        .order('inicio', { ascending: true })

    const porProfe: Record<string, any> = {}
    for (const c of (clases || []) as any[]) {
        if (!c.profesor_id) continue
        const p = (porProfe[c.profesor_id] ||= { profesor_id: c.profesor_id, clases: 0, total: 0, pagadas: 0, pendientes: 0, montoPagado: 0, montoPendiente: 0, detalle: [] })
        const valor = Number(c.valor_acuerdo || 0)
        p.clases++; p.total += valor
        if (c.pagado_profe) { p.pagadas++; p.montoPagado += valor }
        else { p.pendientes++; p.montoPendiente += valor }
        p.detalle.push({ id: c.id, nombre: c.nombre, fecha: c.inicio, valor, pagado: !!c.pagado_profe })
    }

    const ids = Object.keys(porProfe)
    if (!ids.length) return { ok: true as const, profes: [] }

    // Datos de los profes (nombre + alias/cbu).
    const { data: perfiles } = await admin.from('profiles').select('id, nombre_completo, alias_cbu').in('id', ids)
    const info: Record<string, any> = {}
    for (const pf of (perfiles || []) as any[]) info[pf.id] = pf

    // Medio con el que ya se pagó (best-effort: egresos de liquidación de profe del
    // mes, cruzados por nombre). Sirve para ver cómo se abonó (efectivo/transferencia).
    const { data: egresos } = await admin.from('caja_movimientos')
        .select('concepto, monto, metodo_pago, origen_referencia, created_at')
        .in('origen_referencia', ['liquidacion_profe', 'pago_profe_admin'])
        .gte('created_at', desde).lt('created_at', hasta)

    const profes = ids.map(id => {
        const p = porProfe[id]
        const nombre = info[id]?.nombre_completo || 'Profe'
        const medio: Record<string, number> = {}
        for (const e of (egresos || []) as any[]) {
            if ((e.concepto || '').toLowerCase().includes(nombre.toLowerCase())) {
                const m = e.metodo_pago || 'efectivo'
                medio[m] = (medio[m] || 0) + Number(e.monto || 0)
            }
        }
        return {
            profesor_id: id, nombre, alias_cbu: info[id]?.alias_cbu || null,
            clases: p.clases, total: p.total, pagadas: p.pagadas, pendientes: p.pendientes,
            montoPagado: p.montoPagado, montoPendiente: p.montoPendiente,
            medio, detalle: p.detalle,
        }
    }).sort((a, b) => b.montoPendiente - a.montoPendiente || a.nombre.localeCompare(b.nombre))

    return { ok: true as const, profes }
}

// Guarda un ajuste manual de horas de una recep para un mes (override del cálculo por turnos).
export async function guardarHorasRecepAction(anio: number, mes: number, recepId: string, horas: number) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (perfil?.rol !== 'admin') return { success: false, error: 'Solo administradores pueden ajustar horas' }
    if (isNaN(horas) || horas < 0) return { success: false, error: 'Horas inválidas' }

    const admin = getAdminClient()
    const { error } = await admin.from('recep_horas_ajuste').upsert(
        { anio, mes, recep_id: recepId, horas, updated_at: new Date().toISOString() },
        { onConflict: 'anio,mes,recep_id' }
    )
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// Quita el ajuste → vuelve a las horas calculadas por los turnos.
export async function eliminarHorasRecepAction(anio: number, mes: number, recepId: string) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (perfil?.rol !== 'admin') return { success: false, error: 'Solo administradores' }

    const admin = getAdminClient()
    const { error } = await admin.from('recep_horas_ajuste').delete().eq('anio', anio).eq('mes', mes).eq('recep_id', recepId)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function pagarClaseProfeAction(
    claseId: string,
    monto: number,
    metodoPago: string,
    nombreClase: string,
    nombreProfe: string,
    fechaRef?: string  // ISO dentro del mes que se liquida (para atribuir el egreso al pozo correcto)
) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        const { data: perfil } = await supabase
            .from('profiles')
            .select('rol')
            .eq('id', session.user.id)
            .single()

        const rol = perfil?.rol

        if (rol === 'recepcion') {
            // Recepción: requiere caja abierta y registra el egreso
            const { data: turno } = await supabase.from('caja_turnos')
                .select('id')
                .eq('usuario_id', session.user.id)
                .eq('estado', 'abierta')
                .maybeSingle()

            if (!turno) return { success: false, error: '¡Caja Cerrada! Abrí tu turno en Finanzas para poder pagar.' }

            const { error: errCaja } = await supabase.from('caja_movimientos').insert({
                turno_id: turno.id,
                tipo: 'egreso',
                concepto: `Liquidación Profe: ${nombreProfe} (${nombreClase})`,
                monto: monto,
                metodo_pago: metodoPago,
                origen_referencia: 'liquidacion_profe'
            })
            if (errCaja) throw new Error('Error al registrar la salida de dinero en la caja.')
        } else if (rol === 'admin') {
            // Admin: registra el pago en el pozo (sin turno)
            const adminSupabase = getAdminClient()
            await adminSupabase.from('caja_movimientos').insert({
                turno_id: null,
                tipo: 'egreso',
                concepto: `Liq Admin: ${nombreProfe} (${nombreClase})`,
                monto,
                metodo_pago: metodoPago,
                origen_referencia: 'pago_profe_admin',
                ...(fechaRef ? { created_at: fechaRef } : {})
            })
        } else {
            return { success: false, error: 'No tenés permisos para realizar esta acción.' }
        }

        const { error: errClase } = await supabase.from('clases')
            .update({ pagado_profe: true })
            .eq('id', claseId)

        if (errClase) throw new Error('Error al actualizar el estado de la clase.')

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
// Guarda el valor de la hora en la tabla configuraciones
export async function guardarValorHoraRecepAction(valor: number) {
    const supabase = await createClient() // <--- EL AWAIT VA ACÁ

    const { error } = await supabase
        .from('configuraciones')
        .upsert({ clave: 'valor_hora_recepcion', valor: valor.toString() }, { onConflict: 'clave' })

    if (error) return { success: false, error: error.message }
    return { success: true }
}

// Registra el pago al staff como egreso. Admin → sale del pozo (turno_id null,
// sin caja). Recepción → requiere su turno de caja abierto.
export async function pagarStaffAction(uid: string, nombre: string, monto: number, metodo: string, mesKey: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "No autenticado" }

    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
    const rol = perfil?.rol

    // El concepto tiene un formato específico para que el sistema lo reconozca después
    const concepto = `Pago Staff | ID: ${uid} | Mes: ${mesKey} | ${nombre}`

    if (rol === 'admin') {
        // Admin: el pago resta directo del pozo (dinero digital recaudado), sin caja.
        const adminSupabase = getAdminClient()
        const { error } = await adminSupabase.from('caja_movimientos').insert({
            turno_id: null, tipo: 'egreso', monto, metodo_pago: metodo, concepto,
            origen_referencia: 'pago_staff_admin',
        })
        if (error) return { success: false, error: error.message }
        return { success: true }
    }

    if (rol === 'recepcion') {
        const { data: caja } = await supabase
            .from('caja_turnos').select('id')
            .eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
        if (!caja) return { success: false, error: "¡Caja Cerrada! Abrí tu turno en Finanzas para poder pagar." }

        const { error } = await supabase.from('caja_movimientos').insert({
            turno_id: caja.id, tipo: 'egreso', monto, metodo_pago: metodo, concepto,
        })
        if (error) return { success: false, error: error.message }
        return { success: true }
    }

    return { success: false, error: 'No tenés permisos para realizar esta acción.' }
}