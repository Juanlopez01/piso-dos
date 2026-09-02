'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// ============================================================================
// PISO2E · Ticketera (Fase 1 interna). Gestión de eventos (muestras/shows),
// tipos de entrada con cupo, y registro de ventas desde recepción.
// ============================================================================

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const ROLES_STAFF = ['admin', 'recepcion']
async function requireStaff() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false as const, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !ROLES_STAFF.includes(perfil.rol)) return { ok: false as const, error: 'Sin permisos' }
    return { ok: true as const, userId: session.user.id }
}

// Suma de entradas vendidas (confirmadas) por entrada_id, para un evento.
async function vendidasPorEntrada(admin: any, eventoId: string): Promise<Record<string, number>> {
    const { data: ventas } = await admin.from('evento_ventas').select('id').eq('evento_id', eventoId).eq('estado', 'confirmada')
    const ids = (ventas || []).map((v: any) => v.id)
    const acc: Record<string, number> = {}
    if (!ids.length) return acc
    const { data: items } = await admin.from('evento_venta_items').select('entrada_id, cantidad').in('venta_id', ids)
    for (const it of (items || []) as any[]) acc[it.entrada_id] = (acc[it.entrada_id] || 0) + (it.cantidad || 0)
    return acc
}

// ---- Lectura ----------------------------------------------------------------

export async function getEventosAction() {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, eventos: [] as any[] }
    const admin = getAdminClient()

    const { data: eventos } = await admin.from('eventos')
        .select('id, nombre, fecha, lugar, estado, venta_online, created_at').order('fecha', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })

    const ids = (eventos || []).map((e: any) => e.id)
    const recaudado: Record<string, number> = {}
    const vendidas: Record<string, number> = {}
    if (ids.length) {
        const { data: ventas } = await admin.from('evento_ventas').select('evento_id, total, id').eq('estado', 'confirmada').in('evento_id', ids)
        const ventaIds = (ventas || []).map((v: any) => v.id)
        for (const v of (ventas || []) as any[]) recaudado[v.evento_id] = (recaudado[v.evento_id] || 0) + Number(v.total || 0)
        if (ventaIds.length) {
            const { data: items } = await admin.from('evento_venta_items').select('venta_id, cantidad').in('venta_id', ventaIds)
            const ventaEvento: Record<string, string> = {}
            for (const v of (ventas || []) as any[]) ventaEvento[v.id] = v.evento_id
            for (const it of (items || []) as any[]) { const ev = ventaEvento[it.venta_id]; if (ev) vendidas[ev] = (vendidas[ev] || 0) + (it.cantidad || 0) }
        }
    }
    const conStats = (eventos || []).map((e: any) => ({ ...e, recaudado: recaudado[e.id] || 0, vendidas: vendidas[e.id] || 0 }))
    return { ok: true as const, eventos: conStats }
}

export async function getEventoAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()

    const { data: evento } = await admin.from('eventos').select('*').eq('id', eventoId).single()
    if (!evento) return { ok: false as const, error: 'Evento no encontrado' }

    const { data: entradas } = await admin.from('evento_entradas').select('*').eq('evento_id', eventoId).order('orden')
    const vendidas = await vendidasPorEntrada(admin, eventoId)
    const entradasConDisp = (entradas || []).map((e: any) => ({
        ...e, vendidas: vendidas[e.id] || 0, disponible: Math.max(0, (e.cupo || 0) - (vendidas[e.id] || 0)),
    }))

    const { data: ventas } = await admin.from('evento_ventas')
        .select('id, comprador_nombre, comprador_contacto, medio_pago, total, estado, created_at')
        .eq('evento_id', eventoId).order('created_at', { ascending: false })
    const ventaIds = (ventas || []).map((v: any) => v.id)
    let itemsByVenta: Record<string, any[]> = {}
    if (ventaIds.length) {
        const { data: items } = await admin.from('evento_venta_items').select('venta_id, entrada_id, cantidad, precio_unit').in('venta_id', ventaIds)
        const nombreEntrada: Record<string, string> = {}
        for (const e of (entradas || []) as any[]) nombreEntrada[e.id] = e.nombre
        for (const it of (items || []) as any[]) {
            (itemsByVenta[it.venta_id] ||= []).push({ ...it, nombre: nombreEntrada[it.entrada_id] || 'Entrada' })
        }
    }
    const ventasConItems = (ventas || []).map((v: any) => ({ ...v, items: itemsByVenta[v.id] || [] }))

    return { ok: true as const, evento, entradas: entradasConDisp, ventas: ventasConItems }
}

// ---- Eventos ----------------------------------------------------------------

export async function crearEventoAction(data: { nombre: string; descripcion?: string; fecha?: string | null; lugar?: string }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.nombre?.trim()) return { ok: false as const, error: 'Poné un nombre al evento.' }
    const admin = getAdminClient()
    const { data: ev, error } = await admin.from('eventos').insert({
        nombre: data.nombre.trim(),
        descripcion: data.descripcion?.trim() || null,
        fecha: data.fecha || null,
        lugar: data.lugar?.trim() || null,
        created_by: perm.userId,
    }).select('id').single()
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, id: ev.id }
}

export async function editarEventoAction(eventoId: string, patch: { nombre?: string; descripcion?: string; fecha?: string | null; lugar?: string }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const upd: any = {}
    if (patch.nombre !== undefined) upd.nombre = patch.nombre.trim()
    if (patch.descripcion !== undefined) upd.descripcion = patch.descripcion?.trim() || null
    if (patch.fecha !== undefined) upd.fecha = patch.fecha || null
    if (patch.lugar !== undefined) upd.lugar = patch.lugar?.trim() || null
    const { error } = await admin.from('eventos').update(upd).eq('id', eventoId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function cambiarEstadoEventoAction(eventoId: string, estado: 'borrador' | 'activo' | 'finalizado') {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('eventos').update({ estado }).eq('id', eventoId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarEventoAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { count } = await admin.from('evento_ventas').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId).eq('estado', 'confirmada')
    if ((count || 0) > 0) return { ok: false as const, error: 'No se puede borrar: el evento ya tiene ventas. Marcalo como finalizado.' }
    const { error } = await admin.from('eventos').delete().eq('id', eventoId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Tipos de entrada -------------------------------------------------------

export async function guardarEntradaAction(data: { id?: string; evento_id: string; nombre: string; precio: number; cupo: number; orden?: number; oculta?: boolean; codigo_promo?: string }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.nombre?.trim()) return { ok: false as const, error: 'Poné un nombre a la entrada.' }
    const admin = getAdminClient()
    const oculta = !!data.oculta
    const row = {
        evento_id: data.evento_id,
        nombre: data.nombre.trim(),
        precio: Number(data.precio) || 0,
        cupo: Math.max(0, Math.floor(Number(data.cupo) || 0)),
        orden: Number(data.orden) || 0,
        oculta,
        // Solo las ocultas usan código de promo; para las visibles lo limpiamos.
        codigo_promo: oculta ? (data.codigo_promo?.trim() || null) : null,
    }
    if (data.id) {
        const { error } = await admin.from('evento_entradas').update(row).eq('id', data.id)
        if (error) return { ok: false as const, error: error.message }
        return { ok: true as const }
    }
    const { error } = await admin.from('evento_entradas').insert(row)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarEntradaAction(entradaId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { count } = await admin.from('evento_venta_items').select('id', { count: 'exact', head: true }).eq('entrada_id', entradaId)
    if ((count || 0) > 0) return { ok: false as const, error: 'No se puede borrar: ya tiene ventas. Podés poner el cupo en 0.' }
    const { error } = await admin.from('evento_entradas').delete().eq('id', entradaId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Ventas -----------------------------------------------------------------

export async function registrarVentaAction(data: {
    evento_id: string
    comprador_nombre?: string
    comprador_contacto?: string
    medio_pago?: string
    items: { entrada_id: string; cantidad: number }[]
}) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()

    const items = (data.items || []).filter(i => i.entrada_id && Number(i.cantidad) > 0)
    if (!items.length) return { ok: false as const, error: 'Elegí al menos una entrada.' }

    // Traer entradas + validar cupo disponible
    const { data: entradas } = await admin.from('evento_entradas').select('id, nombre, precio, cupo').eq('evento_id', data.evento_id)
    const mapa: Record<string, any> = {}
    for (const e of (entradas || []) as any[]) mapa[e.id] = e
    const vendidas = await vendidasPorEntrada(admin, data.evento_id)

    let total = 0
    const rows: any[] = []
    for (const it of items) {
        const e = mapa[it.entrada_id]
        if (!e) return { ok: false as const, error: 'Entrada inválida.' }
        const disp = Math.max(0, (e.cupo || 0) - (vendidas[e.id] || 0))
        const cant = Math.floor(Number(it.cantidad))
        if (cant > disp) return { ok: false as const, error: `No hay cupo suficiente de "${e.nombre}" (quedan ${disp}).` }
        total += cant * Number(e.precio || 0)
        rows.push({ entrada_id: e.id, cantidad: cant, precio_unit: Number(e.precio || 0) })
    }

    const { data: venta, error } = await admin.from('evento_ventas').insert({
        evento_id: data.evento_id,
        comprador_nombre: data.comprador_nombre?.trim() || null,
        comprador_contacto: data.comprador_contacto?.trim() || null,
        medio_pago: data.medio_pago || 'efectivo',
        total,
        vendido_por: perm.userId,
    }).select('id').single()
    if (error || !venta) return { ok: false as const, error: error?.message || 'No se pudo registrar la venta.' }

    const { error: errItems } = await admin.from('evento_venta_items').insert(rows.map(r => ({ ...r, venta_id: venta.id })))
    if (errItems) {
        await admin.from('evento_ventas').delete().eq('id', venta.id) // rollback best-effort
        return { ok: false as const, error: errItems.message }
    }
    return { ok: true as const, id: venta.id, total }
}

export async function anularVentaAction(ventaId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('evento_ventas').update({ estado: 'anulada' }).eq('id', ventaId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function toggleVentaOnlineAction(eventoId: string, valor: boolean) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('eventos').update({ venta_online: valor }).eq('id', eventoId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ============================================================================
// PÚBLICO — venta online de entradas (sin cuenta)
// ============================================================================

// Evento + entradas disponibles, SOLO si está activo y con venta online habilitada.
export async function getEventoPublicoAction(eventoId: string, promo?: string) {
    const admin = getAdminClient()
    const { data: evento } = await admin.from('eventos')
        .select('id, nombre, descripcion, fecha, lugar, estado, venta_online').eq('id', eventoId).maybeSingle()
    if (!evento || !evento.venta_online || evento.estado !== 'activo') return null

    const { data: entradas } = await admin.from('evento_entradas').select('*').eq('evento_id', eventoId).eq('activo', true).order('orden')
    const vendidas = await vendidasPorEntrada(admin, eventoId)
    const promoCode = (promo || '').trim()
    const entradasDisp = (entradas || [])
        // Las ocultas solo aparecen si el link trae su código de promo.
        .filter((e: any) => !e.oculta || (!!promoCode && e.codigo_promo === promoCode))
        .map((e: any) => ({
            id: e.id, nombre: e.nombre, precio: Number(e.precio),
            disponible: Math.max(0, (e.cupo || 0) - (vendidas[e.id] || 0)),
        }))
    return {
        id: evento.id, nombre: evento.nombre, descripcion: evento.descripcion,
        fecha: evento.fecha, lugar: evento.lugar, entradas: entradasDisp,
    }
}

// Crea la orden (venta pendiente) online y devuelve el id + token para el pago.
export async function crearOrdenEventoAction(payload: {
    evento_id: string
    comprador_nombre: string
    comprador_email: string
    comprador_contacto?: string
    items: { entrada_id: string; cantidad: number }[]
}) {
    const admin = getAdminClient()
    const { data: evento } = await admin.from('eventos').select('id, estado, venta_online').eq('id', payload.evento_id).maybeSingle()
    if (!evento || !evento.venta_online || evento.estado !== 'activo') return { ok: false as const, error: 'El evento no está disponible para compra online.' }
    if (!payload.comprador_nombre?.trim()) return { ok: false as const, error: 'Completá tu nombre.' }
    if (!payload.comprador_email?.includes('@')) return { ok: false as const, error: 'Completá un email válido.' }

    const items = (payload.items || []).filter(i => i.entrada_id && Number(i.cantidad) > 0)
    if (!items.length) return { ok: false as const, error: 'Elegí al menos una entrada.' }

    const { data: entradas } = await admin.from('evento_entradas').select('id, nombre, precio, cupo').eq('evento_id', payload.evento_id)
    const mapa: Record<string, any> = {}
    for (const e of (entradas || []) as any[]) mapa[e.id] = e
    const vendidas = await vendidasPorEntrada(admin, payload.evento_id)

    let total = 0
    const filas: any[] = []
    for (const it of items) {
        const e = mapa[it.entrada_id]
        if (!e) return { ok: false as const, error: 'Entrada inválida.' }
        const disp = Math.max(0, (e.cupo || 0) - (vendidas[e.id] || 0))
        const cant = Math.floor(Number(it.cantidad))
        if (cant > disp) return { ok: false as const, error: `No hay cupo suficiente de "${e.nombre}" (quedan ${disp}).` }
        total += cant * Number(e.precio || 0)
        filas.push({ entrada_id: e.id, cantidad: cant, precio_unit: Number(e.precio || 0) })
    }
    if (total <= 0) return { ok: false as const, error: 'El total debe ser mayor a 0.' }

    const token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
    const { data: venta, error } = await admin.from('evento_ventas').insert({
        evento_id: payload.evento_id,
        comprador_nombre: payload.comprador_nombre.trim(),
        comprador_contacto: payload.comprador_contacto?.trim() || payload.comprador_email.trim(),
        medio_pago: 'mercadopago', total, estado: 'pendiente', canal: 'online', token,
    }).select('id').single()
    if (error || !venta) return { ok: false as const, error: error?.message || 'No se pudo crear la orden.' }

    const { error: errItems } = await admin.from('evento_venta_items').insert(filas.map(f => ({ ...f, venta_id: venta.id })))
    if (errItems) { await admin.from('evento_ventas').delete().eq('id', venta.id); return { ok: false as const, error: errItems.message } }

    return { ok: true as const, ventaId: venta.id, token, total }
}

// ============================================================================
// CHECK-IN (Fase 3) — escaneo del QR en la puerta + reportes
// ============================================================================

// Valida un ticket por su código (lo que trae el QR) para un evento dado.
// Si es válido y no usado, lo marca usado. Devuelve el resultado para la UI.
export async function validarTicketAction(eventoId: string, codigo: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { estado: 'error' as const, msg: perm.error || 'Sin permisos' }
    const cod = (codigo || '').trim()
    if (!cod) return { estado: 'error' as const, msg: 'Código vacío' }
    const admin = getAdminClient()

    const { data: tk } = await admin.from('evento_tickets').select('id, venta_id, entrada_id, usado, usado_at').eq('codigo', cod).maybeSingle()
    if (!tk) return { estado: 'invalida' as const, msg: 'Entrada no encontrada' }

    const { data: venta } = await admin.from('evento_ventas').select('evento_id, comprador_nombre, estado').eq('id', tk.venta_id).maybeSingle()
    if (!venta || venta.evento_id !== eventoId) return { estado: 'otro_evento' as const, msg: 'Esta entrada es de otro evento' }
    if (venta.estado === 'anulada') return { estado: 'anulada' as const, msg: 'La venta de esta entrada fue anulada' }

    const { data: ent } = await admin.from('evento_entradas').select('nombre').eq('id', tk.entrada_id).maybeSingle()
    const info = { entrada: ent?.nombre || 'Entrada', comprador: venta.comprador_nombre || 'Sin nombre' }

    if (tk.usado) return { estado: 'usada' as const, msg: 'Esta entrada YA fue usada', usadoAt: tk.usado_at, ...info }

    await admin.from('evento_tickets').update({ usado: true, usado_at: new Date().toISOString() }).eq('id', tk.id)
    return { estado: 'valida' as const, msg: '¡Adelante!', ...info }
}

// Deshace un check-in (por si escanearon de más).
export async function desmarcarTicketAction(codigo: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('evento_tickets').update({ usado: false, usado_at: null }).eq('codigo', (codigo || '').trim())
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// Progreso de check-in de un evento (usadas / total de entradas confirmadas).
export async function getCheckinStatsAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, nombre: '', total: 0, usados: 0 }
    const admin = getAdminClient()
    const { data: ev } = await admin.from('eventos').select('nombre').eq('id', eventoId).maybeSingle()
    const { data: ventas } = await admin.from('evento_ventas').select('id').eq('evento_id', eventoId).eq('estado', 'confirmada')
    const ids = (ventas || []).map((v: any) => v.id)
    if (!ids.length) return { ok: true as const, nombre: ev?.nombre || 'Evento', total: 0, usados: 0 }
    const { data: tks } = await admin.from('evento_tickets').select('usado').in('venta_id', ids)
    const total = (tks || []).length
    const usados = (tks || []).filter((t: any) => t.usado).length
    return { ok: true as const, nombre: ev?.nombre || 'Evento', total, usados }
}

// Reporte completo de un evento: desglose por tipo/canal/medio, check-in y
// listado de compradores (para ver en pantalla y exportar a CSV).
export async function getReporteEventoAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()

    const { data: evento } = await admin.from('eventos').select('nombre, fecha, lugar').eq('id', eventoId).maybeSingle()
    const { data: entradas } = await admin.from('evento_entradas').select('id, nombre, precio, cupo, orden').eq('evento_id', eventoId).order('orden')
    const { data: ventas } = await admin.from('evento_ventas')
        .select('id, comprador_nombre, comprador_contacto, medio_pago, total, canal, created_at')
        .eq('evento_id', eventoId).eq('estado', 'confirmada').order('created_at', { ascending: false })

    const ventaIds = (ventas || []).map((v: any) => v.id)
    let items: any[] = [], tickets: any[] = []
    if (ventaIds.length) {
        const [it, tk] = await Promise.all([
            admin.from('evento_venta_items').select('venta_id, entrada_id, cantidad, precio_unit').in('venta_id', ventaIds),
            admin.from('evento_tickets').select('venta_id, usado').in('venta_id', ventaIds),
        ])
        items = it.data || []; tickets = tk.data || []
    }

    const nombreEnt: Record<string, string> = {}
    for (const e of (entradas || []) as any[]) nombreEnt[e.id] = e.nombre

    // Por tipo de entrada
    const porTipo = (entradas || []).map((e: any) => {
        const its = items.filter(i => i.entrada_id === e.id)
        const vendidas = its.reduce((s, i) => s + (i.cantidad || 0), 0)
        const recaudado = its.reduce((s, i) => s + (i.cantidad || 0) * Number(i.precio_unit || 0), 0)
        return { nombre: e.nombre, precio: Number(e.precio), cupo: e.cupo || 0, vendidas, disponible: Math.max(0, (e.cupo || 0) - vendidas), recaudado }
    })

    // Por canal y medio de pago
    const porCanal: Record<string, { cant: number; monto: number }> = {}
    const porMedio: Record<string, { cant: number; monto: number }> = {}
    for (const v of (ventas || []) as any[]) {
        const c = v.canal || 'mostrador', m = v.medio_pago || 'efectivo'
        porCanal[c] = { cant: (porCanal[c]?.cant || 0) + 1, monto: (porCanal[c]?.monto || 0) + Number(v.total || 0) }
        porMedio[m] = { cant: (porMedio[m]?.cant || 0) + 1, monto: (porMedio[m]?.monto || 0) + Number(v.total || 0) }
    }

    // Check-in
    const totalTickets = tickets.length
    const usados = tickets.filter(t => t.usado).length

    // Filas (listado de compradores) para pantalla / CSV
    const filas = (ventas || []).map((v: any) => {
        const its = items.filter(i => i.venta_id === v.id)
        const tks = tickets.filter(t => t.venta_id === v.id)
        return {
            comprador: v.comprador_nombre || 'Sin nombre',
            contacto: v.comprador_contacto || '',
            detalle: its.map(i => `${i.cantidad}× ${nombreEnt[i.entrada_id] || 'Entrada'}`).join(' · '),
            entradas: its.reduce((s, i) => s + (i.cantidad || 0), 0),
            total: Number(v.total || 0),
            canal: v.canal || 'mostrador',
            medio: v.medio_pago || 'efectivo',
            ingresados: `${tks.filter(t => t.usado).length}/${tks.length}`,
            fecha: v.created_at,
        }
    })

    const recaudado = (ventas || []).reduce((s: number, v: any) => s + Number(v.total || 0), 0)
    const vendidasTot = porTipo.reduce((s, t) => s + t.vendidas, 0)
    const cupoTot = porTipo.reduce((s, t) => s + t.cupo, 0)

    return {
        ok: true as const,
        evento: { nombre: evento?.nombre || 'Evento', fecha: evento?.fecha || null, lugar: evento?.lugar || null },
        totales: { recaudado, vendidas: vendidasTot, cupo: cupoTot, ventas: (ventas || []).length, ingresados: usados, tickets: totalTickets },
        porTipo, porCanal, porMedio, filas,
    }
}

// ============================================================================
// ACCESO DE LA COMPAÑÍA — link propio por función; el elenco ve SUS ventas en
// vivo, sin acceso al resto del sistema.
// ============================================================================

// Admin: obtiene (o genera) el token del link de la compañía para un evento.
export async function getLinkCompaniaAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { data: ev } = await admin.from('eventos').select('token_compania').eq('id', eventoId).maybeSingle()
    if (!ev) return { ok: false as const, error: 'Evento no encontrado' }
    let token = ev.token_compania
    if (!token) {
        token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
        await admin.from('eventos').update({ token_compania: token }).eq('id', eventoId)
    }
    return { ok: true as const, token }
}

// Público (por token): ventas del evento en vivo, SOLO agregados (sin datos de
// los compradores ni acceso a otra cosa).
export async function getVentasCompaniaAction(eventoId: string, token: string) {
    const admin = getAdminClient()
    const { data: ev } = await admin.from('eventos').select('nombre, fecha, lugar, token_compania').eq('id', eventoId).maybeSingle()
    if (!ev || !token || ev.token_compania !== token) return { ok: false as const, error: 'Link inválido' }

    const { data: entradas } = await admin.from('evento_entradas').select('id, nombre, precio, cupo, orden').eq('evento_id', eventoId).order('orden')
    const { data: ventas } = await admin.from('evento_ventas').select('id, total').eq('evento_id', eventoId).eq('estado', 'confirmada')
    const vids = (ventas || []).map((v: any) => v.id)
    let items: any[] = []
    if (vids.length) { const { data } = await admin.from('evento_venta_items').select('entrada_id, cantidad, precio_unit').in('venta_id', vids); items = data || [] }

    const porTipo = (entradas || []).map((e: any) => {
        const its = items.filter(i => i.entrada_id === e.id)
        const vend = its.reduce((s, i) => s + (i.cantidad || 0), 0)
        return { nombre: e.nombre, precio: Number(e.precio), cupo: e.cupo || 0, vendidas: vend, disponible: Math.max(0, (e.cupo || 0) - vend), recaudado: its.reduce((s, i) => s + (i.cantidad || 0) * Number(i.precio_unit || 0), 0) }
    })
    const recaudado = (ventas || []).reduce((s: number, v: any) => s + Number(v.total || 0), 0)
    const vendidas = porTipo.reduce((s, t) => s + t.vendidas, 0)
    const cupo = porTipo.reduce((s, t) => s + t.cupo, 0)
    return {
        ok: true as const,
        evento: { nombre: ev.nombre, fecha: ev.fecha, lugar: ev.lugar },
        porTipo, recaudado, vendidas, cupo, soldOut: cupo > 0 && vendidas >= cupo,
    }
}

// Entradas (con su código para el QR) de una venta pagada — página pública por token.
export async function getEntradasPublicasAction(ventaId: string, token: string) {
    const admin = getAdminClient()
    const { data: venta } = await admin.from('evento_ventas')
        .select('id, evento_id, comprador_nombre, estado, total, token').eq('id', ventaId).maybeSingle()
    if (!venta || !token || venta.token !== token) return { ok: false as const, error: 'Entradas no encontradas.' }

    const { data: evento } = await admin.from('eventos').select('nombre, fecha, lugar').eq('id', venta.evento_id).maybeSingle()
    const { data: tickets } = await admin.from('evento_tickets')
        .select('codigo, entrada_id, usado').eq('venta_id', ventaId).order('created_at')
    const entradaIds = [...new Set((tickets || []).map((t: any) => t.entrada_id))]
    const nombreEntrada: Record<string, string> = {}
    if (entradaIds.length) {
        const { data: ents } = await admin.from('evento_entradas').select('id, nombre').in('id', entradaIds)
        for (const e of (ents || []) as any[]) nombreEntrada[e.id] = e.nombre
    }
    return {
        ok: true as const,
        estado: venta.estado, comprador: venta.comprador_nombre, total: Number(venta.total),
        evento: { nombre: evento?.nombre || 'Evento', fecha: evento?.fecha || null, lugar: evento?.lugar || null },
        tickets: (tickets || []).map((t: any) => ({ codigo: t.codigo, entrada: nombreEntrada[t.entrada_id] || 'Entrada', usado: t.usado })),
    }
}

// ---- Ficha técnica (Fase 2) -------------------------------------------------
// El "perfil vivo" de la obra: sonido, luces, proyecciones, armado, datos de
// función y acuerdo de sala. Se guarda como JSON en el evento y el equipo la
// edita las veces que haga falta.

export async function getFichaTecnicaAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { data: evento } = await admin.from('eventos')
        .select('id, nombre, ficha_tecnica').eq('id', eventoId).single()
    if (!evento) return { ok: false as const, error: 'Evento no encontrado' }
    return { ok: true as const, nombre: evento.nombre, ficha: evento.ficha_tecnica || {} }
}

export async function guardarFichaTecnicaAction(eventoId: string, ficha: Record<string, any>) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const payload = { ...(ficha || {}), _updated_at: new Date().toISOString(), _updated_by: perm.userId }
    const { error } = await admin.from('eventos').update({ ficha_tecnica: payload }).eq('id', eventoId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Equipo de función ------------------------------------------------------
// Quién trabajó en la función y su cachet. Son los gastos que alimentan el Borderaux.

export async function getEquipoAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, equipo: [] as any[], totalEquipo: 0 }
    const admin = getAdminClient()
    const { data } = await admin.from('evento_equipo')
        .select('id, nombre, rol, monto, notas, created_at').eq('evento_id', eventoId).order('created_at')
    const equipo = (data || []) as any[]
    const totalEquipo = equipo.reduce((a, m) => a + Number(m.monto || 0), 0)
    return { ok: true as const, equipo, totalEquipo }
}

export async function guardarMiembroEquipoAction(data: { id?: string; evento_id: string; nombre: string; rol?: string; monto?: number; notas?: string }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.nombre?.trim()) return { ok: false as const, error: 'Poné el nombre de quien trabajó.' }
    const admin = getAdminClient()
    const row = {
        evento_id: data.evento_id,
        nombre: data.nombre.trim(),
        rol: data.rol?.trim() || null,
        monto: Math.max(0, Number(data.monto) || 0),
        notas: data.notas?.trim() || null,
    }
    if (data.id) {
        const { error } = await admin.from('evento_equipo').update(row).eq('id', data.id)
        if (error) return { ok: false as const, error: error.message }
        return { ok: true as const }
    }
    const { error } = await admin.from('evento_equipo').insert({ ...row, created_by: perm.userId })
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarMiembroEquipoAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('evento_equipo').delete().eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Borderaux / liquidación ------------------------------------------------
// Ingresos (ventas confirmadas) menos deducciones (equipo de función + gastos)
// y reparto del neto entre compañía y Piso 2 según un % configurable.
// Pendiente (para el final): tratamiento del 10% de servicio.

export async function getBorderauxAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()

    const { data: ev } = await admin.from('eventos')
        .select('nombre, reparto_compania_pct, borderaux_incluir_equipo').eq('id', eventoId).single()
    if (!ev) return { ok: false as const, error: 'Evento no encontrado' }

    const { data: ventas } = await admin.from('evento_ventas')
        .select('total, estado').eq('evento_id', eventoId).eq('estado', 'confirmada')
    const ingresos = (ventas || []).reduce((a: number, v: any) => a + Number(v.total || 0), 0)
    const ventasCount = (ventas || []).length

    const { data: equipoRows } = await admin.from('evento_equipo').select('monto').eq('evento_id', eventoId)
    const totalEquipo = (equipoRows || []).reduce((a: number, m: any) => a + Number(m.monto || 0), 0)

    const { data: gastos } = await admin.from('evento_gastos')
        .select('id, concepto, monto, created_at').eq('evento_id', eventoId).order('created_at')
    const totalGastos = (gastos || []).reduce((a: number, g: any) => a + Number(g.monto || 0), 0)

    const incluirEquipo = ev.borderaux_incluir_equipo !== false
    const deducido = totalGastos + (incluirEquipo ? totalEquipo : 0)
    const neto = ingresos - deducido
    const pct = Number(ev.reparto_compania_pct ?? 70)
    const compania = Math.round(neto * pct) / 100
    const piso2 = neto - compania

    return {
        ok: true as const,
        nombre: ev.nombre,
        ingresos, ventasCount,
        totalEquipo, incluirEquipo,
        gastos: (gastos || []) as any[], totalGastos,
        deducido, neto, pct, compania, piso2,
    }
}

export async function setRepartoPctAction(eventoId: string, pct: number) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const p = Math.max(0, Math.min(100, Number(pct) || 0))
    const admin = getAdminClient()
    const { error } = await admin.from('eventos').update({ reparto_compania_pct: p }).eq('id', eventoId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function toggleIncluirEquipoAction(eventoId: string, valor: boolean) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('eventos').update({ borderaux_incluir_equipo: !!valor }).eq('id', eventoId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function guardarGastoAction(data: { id?: string; evento_id: string; concepto: string; monto?: number }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.concepto?.trim()) return { ok: false as const, error: 'Poné un concepto al gasto.' }
    const admin = getAdminClient()
    const row = { evento_id: data.evento_id, concepto: data.concepto.trim(), monto: Math.max(0, Number(data.monto) || 0) }
    if (data.id) {
        const { error } = await admin.from('evento_gastos').update(row).eq('id', data.id)
        if (error) return { ok: false as const, error: error.message }
        return { ok: true as const }
    }
    const { error } = await admin.from('evento_gastos').insert({ ...row, created_by: perm.userId })
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarGastoAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('evento_gastos').delete().eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Listas de invitados ----------------------------------------------------
// Cupos sin cargo por función. El jefe de sala marca "presente" al ingresar.

export async function getInvitadosAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, invitados: [] as any[], totalInvitados: 0, presentes: 0 }
    const admin = getAdminClient()
    const { data } = await admin.from('evento_invitados')
        .select('id, nombre, contacto, cantidad, notas, presente, created_at').eq('evento_id', eventoId).order('created_at')
    const invitados = (data || []) as any[]
    const totalInvitados = invitados.reduce((a, i) => a + Number(i.cantidad || 1), 0)
    const presentes = invitados.filter(i => i.presente).reduce((a, i) => a + Number(i.cantidad || 1), 0)
    return { ok: true as const, invitados, totalInvitados, presentes }
}

export async function guardarInvitadoAction(data: { id?: string; evento_id: string; nombre: string; contacto?: string; cantidad?: number; notas?: string }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.nombre?.trim()) return { ok: false as const, error: 'Poné el nombre del invitado.' }
    const admin = getAdminClient()
    const row = {
        evento_id: data.evento_id,
        nombre: data.nombre.trim(),
        contacto: data.contacto?.trim() || null,
        cantidad: Math.max(1, Math.floor(Number(data.cantidad) || 1)),
        notas: data.notas?.trim() || null,
    }
    if (data.id) {
        const { error } = await admin.from('evento_invitados').update(row).eq('id', data.id)
        if (error) return { ok: false as const, error: error.message }
        return { ok: true as const }
    }
    const { error } = await admin.from('evento_invitados').insert({ ...row, created_by: perm.userId })
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function togglePresenteInvitadoAction(id: string, valor: boolean) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('evento_invitados').update({ presente: !!valor }).eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarInvitadoAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('evento_invitados').delete().eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}
