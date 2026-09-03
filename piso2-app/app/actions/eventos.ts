'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { montoServicio } from '@/utils/servicio'

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

    // Si pertenece a un ciclo, adjuntamos su nombre + slug (para el link público).
    if (evento.ciclo_id) {
        const { data: ciclo } = await admin.from('evento_ciclos').select('nombre, slug').eq('id', evento.ciclo_id).maybeSingle()
        ;(evento as any).ciclo = ciclo || null
    }

    const { data: entradas } = await admin.from('evento_entradas').select('*').eq('evento_id', eventoId).order('orden')
    const vendidas = await vendidasPorEntrada(admin, eventoId)
    const entradasConDisp = (entradas || []).map((e: any) => ({
        ...e, vendidas: vendidas[e.id] || 0, disponible: Math.max(0, (e.cupo || 0) - (vendidas[e.id] || 0)),
    }))

    const { data: ventas } = await admin.from('evento_ventas')
        .select('id, comprador_nombre, comprador_contacto, medio_pago, total, estado, canal, reembolsada, created_at')
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

export async function crearEventoAction(data: { nombre: string; descripcion?: string; fecha?: string | null; lugar?: string; flyer_url?: string }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.nombre?.trim()) return { ok: false as const, error: 'Poné un nombre al evento.' }
    const admin = getAdminClient()
    const { data: ev, error } = await admin.from('eventos').insert({
        nombre: data.nombre.trim(),
        descripcion: data.descripcion?.trim() || null,
        fecha: data.fecha || null,
        lugar: data.lugar?.trim() || null,
        flyer_url: data.flyer_url?.trim() || null,
        created_by: perm.userId,
    }).select('id').single()
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, id: ev.id }
}

export async function editarEventoAction(eventoId: string, patch: { nombre?: string; descripcion?: string; fecha?: string | null; lugar?: string; flyer_url?: string | null }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const upd: any = {}
    if (patch.nombre !== undefined) upd.nombre = patch.nombre.trim()
    if (patch.descripcion !== undefined) upd.descripcion = patch.descripcion?.trim() || null
    if (patch.fecha !== undefined) upd.fecha = patch.fecha || null
    if (patch.lugar !== undefined) upd.lugar = patch.lugar?.trim() || null
    if (patch.flyer_url !== undefined) upd.flyer_url = patch.flyer_url || null
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

    const { data: evChk } = await admin.from('eventos').select('cancelado').eq('id', data.evento_id).maybeSingle()
    if (evChk?.cancelado) return { ok: false as const, error: 'Esta función está cancelada.' }

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
    // El 10% de servicio se suma arriba del valor de las entradas.
    const totalFinal = total + montoServicio(total)
    const token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))

    const { data: venta, error } = await admin.from('evento_ventas').insert({
        evento_id: data.evento_id,
        comprador_nombre: data.comprador_nombre?.trim() || null,
        comprador_contacto: data.comprador_contacto?.trim() || null,
        medio_pago: data.medio_pago || 'efectivo',
        total: totalFinal,
        estado: 'confirmada', canal: 'mostrador', token,
        vendido_por: perm.userId,
    }).select('id').single()
    if (error || !venta) return { ok: false as const, error: error?.message || 'No se pudo registrar la venta.' }

    const { error: errItems } = await admin.from('evento_venta_items').insert(rows.map(r => ({ ...r, venta_id: venta.id })))
    if (errItems) {
        await admin.from('evento_ventas').delete().eq('id', venta.id) // rollback best-effort
        return { ok: false as const, error: errItems.message }
    }

    // Generamos un ticket con QR por cada unidad, para que el check-in valga
    // también para las ventas de mostrador (mismo formato que las online).
    const ticketsMostrador: any[] = []
    for (const r of rows) {
        for (let n = 0; n < r.cantidad; n++) {
            ticketsMostrador.push({
                venta_id: venta.id, entrada_id: r.entrada_id,
                codigo: `E-${String(venta.id).slice(0, 8)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            })
        }
    }
    if (ticketsMostrador.length) await admin.from('evento_tickets').insert(ticketsMostrador)

    return { ok: true as const, id: venta.id, total: totalFinal, token }
}

export async function anularVentaAction(ventaId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('evento_ventas').update({ estado: 'anulada' }).eq('id', ventaId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Reembolsos / devoluciones ----------------------------------------------

// Devuelve el pago en Mercado Pago (refund total). Idempotente por venta.
async function reembolsarPagoMP(paymentId: string, ventaId: string): Promise<{ ok: boolean; refundId?: string; error?: string }> {
    try {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN || ''}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': `refund-${ventaId}`,
            },
            body: JSON.stringify({}), // sin amount = reembolso total
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: data?.message || `MP respondió ${res.status}` }
        return { ok: true, refundId: String(data?.id ?? '') }
    } catch (e: any) {
        return { ok: false, error: e?.message || 'No se pudo contactar a Mercado Pago' }
    }
}

// Reembolsa UNA venta: online -> refund por MP; mostrador -> devolución en mano.
// En ambos casos la venta queda 'anulada' (libera cupo + invalida sus QR).
export async function reembolsarVentaAction(ventaId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()

    const { data: v } = await admin.from('evento_ventas')
        .select('id, estado, canal, mp_payment_id, total, reembolsada').eq('id', ventaId).maybeSingle()
    if (!v) return { ok: false as const, error: 'Venta no encontrada.' }
    if (v.reembolsada) return { ok: false as const, error: 'Esta venta ya fue reembolsada.' }

    let ref = 'manual'
    if (v.canal === 'online' && v.mp_payment_id) {
        const r = await reembolsarPagoMP(v.mp_payment_id, v.id)
        if (!r.ok) return { ok: false as const, error: `No se pudo reembolsar en Mercado Pago: ${r.error}` }
        ref = r.refundId || 'mp'
    }

    const { error } = await admin.from('evento_ventas')
        .update({ estado: 'anulada', reembolsada: true, reembolso_at: new Date().toISOString(), reembolso_ref: ref })
        .eq('id', ventaId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, canal: v.canal, total: Number(v.total || 0), viaMP: ref !== 'manual' }
}

// Cancela la función entera: reembolsa todas las ventas confirmadas, marca la
// función cancelada (corta ventas nuevas) y devuelve la lista de compradores
// (con contacto) para avisarles + un mensaje listo.
export async function cancelarEventoAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()

    const { data: ev } = await admin.from('eventos').select('id, nombre, fecha, cancelado').eq('id', eventoId).maybeSingle()
    if (!ev) return { ok: false as const, error: 'Función no encontrada.' }

    const { data: ventas } = await admin.from('evento_ventas')
        .select('id, comprador_nombre, comprador_contacto, canal, mp_payment_id, total, reembolsada')
        .eq('evento_id', eventoId).eq('estado', 'confirmada')

    const afectados: any[] = []
    let reembolsadasOk = 0, fallidas = 0, montoTotal = 0
    for (const v of (ventas || []) as any[]) {
        let ref = 'manual', okRef = true, err = ''
        if (v.canal === 'online' && v.mp_payment_id && !v.reembolsada) {
            const r = await reembolsarPagoMP(v.mp_payment_id, v.id)
            if (r.ok) ref = r.refundId || 'mp'; else { okRef = false; err = r.error || 'Error MP' }
        }
        if (okRef) {
            await admin.from('evento_ventas').update({
                estado: 'anulada', reembolsada: true, reembolso_at: new Date().toISOString(), reembolso_ref: ref,
            }).eq('id', v.id)
            reembolsadasOk++; montoTotal += Number(v.total || 0)
        } else {
            // No pudimos reembolsar en MP: la dejamos confirmada para reintentar a mano.
            fallidas++
        }
        afectados.push({
            nombre: v.comprador_nombre || 'Sin nombre', contacto: v.comprador_contacto || '',
            canal: v.canal || 'mostrador', total: Number(v.total || 0), reembolso: okRef ? (ref === 'manual' ? 'en mano' : 'MP') : `FALLÓ (${err})`,
        })
    }

    await admin.from('eventos').update({
        cancelado: true, cancelado_at: new Date().toISOString(), estado: 'finalizado', venta_online: false,
    }).eq('id', eventoId)

    // Aviso a recep/admin (los compradores no son suscriptores de ManyChat:
    // el aviso a ellos se manda a mano con la lista que devolvemos).
    try {
        const { data: staff } = await admin.from('profiles').select('id').in('rol', ['admin', 'recepcion'])
        if (staff?.length) await admin.from('notificaciones').insert(staff.map((s: any) => ({
            usuario_id: s.id, titulo: '⛔ Función cancelada',
            mensaje: `Se canceló "${ev.nombre}". ${reembolsadasOk} venta(s) reembolsada(s)${fallidas ? `, ${fallidas} con error de MP` : ''}.`,
            link: '/eventos', categoria: 'evento',
        })))
    } catch { /* best-effort */ }

    return { ok: true as const, nombre: ev.nombre, reembolsadasOk, fallidas, montoTotal, afectados }
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
        .select('id, nombre, descripcion, fecha, lugar, estado, venta_online, flyer_url').eq('id', eventoId).maybeSingle()
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
        fecha: evento.fecha, lugar: evento.lugar, flyer_url: evento.flyer_url, entradas: entradasDisp,
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
    // El 10% de servicio se suma arriba del valor de las entradas.
    const totalFinal = total + montoServicio(total)

    const token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
    const { data: venta, error } = await admin.from('evento_ventas').insert({
        evento_id: payload.evento_id,
        comprador_nombre: payload.comprador_nombre.trim(),
        comprador_contacto: payload.comprador_contacto?.trim() || payload.comprador_email.trim(),
        medio_pago: 'mercadopago', total: totalFinal, estado: 'pendiente', canal: 'online', token,
    }).select('id').single()
    if (error || !venta) return { ok: false as const, error: error?.message || 'No se pudo crear la orden.' }

    const { error: errItems } = await admin.from('evento_venta_items').insert(filas.map(f => ({ ...f, venta_id: venta.id })))
    if (errItems) { await admin.from('evento_ventas').delete().eq('id', venta.id); return { ok: false as const, error: errItems.message } }

    return { ok: true as const, ventaId: venta.id, token, total: totalFinal }
}

// ============================================================================
// CHECK-IN (Fase 3) — escaneo del QR en la puerta + reportes
// ============================================================================

// Lógica de validación de un ticket (compartida por el check-in del staff y el
// de la puerta externa). Recibe el admin ya resuelto.
async function validarTicketConAdmin(admin: any, eventoId: string, codigo: string) {
    const cod = (codigo || '').trim()
    if (!cod) return { estado: 'error' as const, msg: 'Código vacío' }

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

// Valida un ticket por su código (lo que trae el QR) para un evento dado.
// Si es válido y no usado, lo marca usado. Devuelve el resultado para la UI.
export async function validarTicketAction(eventoId: string, codigo: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { estado: 'error' as const, msg: perm.error || 'Sin permisos' }
    const admin = getAdminClient()
    return await validarTicketConAdmin(admin, eventoId, codigo)
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
    // Recaudación que ve la compañía = valor de las entradas (base), SIN el 10%
    // de servicio (ese cargo es de Piso 2 y no forma parte del reparto).
    const recaudado = porTipo.reduce((s, t) => s + t.recaudado, 0)
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
        .select('id, total, estado').eq('evento_id', eventoId).eq('estado', 'confirmada')
    const ingresos = (ventas || []).reduce((a: number, v: any) => a + Number(v.total || 0), 0)
    const ventasCount = (ventas || []).length

    // Separamos el valor base de las entradas (lo que se reparte) del 10% de
    // servicio (que es de Piso 2). base = suma de los ítems; servicio = lo cobrado
    // por encima. Robusto también para ventas viejas sin servicio (servicio = 0).
    const ventaIds = (ventas || []).map((v: any) => v.id)
    let baseEntradas = 0
    if (ventaIds.length) {
        const { data: items } = await admin.from('evento_venta_items').select('cantidad, precio_unit').in('venta_id', ventaIds)
        baseEntradas = (items || []).reduce((a: number, it: any) => a + Number(it.cantidad || 0) * Number(it.precio_unit || 0), 0)
    }
    const servicio = Math.max(0, ingresos - baseEntradas)

    const { data: equipoRows } = await admin.from('evento_equipo').select('monto').eq('evento_id', eventoId)
    const totalEquipo = (equipoRows || []).reduce((a: number, m: any) => a + Number(m.monto || 0), 0)

    const { data: gastos } = await admin.from('evento_gastos')
        .select('id, concepto, monto, created_at').eq('evento_id', eventoId).order('created_at')
    const totalGastos = (gastos || []).reduce((a: number, g: any) => a + Number(g.monto || 0), 0)

    const incluirEquipo = ev.borderaux_incluir_equipo !== false
    const deducido = totalGastos + (incluirEquipo ? totalEquipo : 0)
    // El reparto se hace sobre el VALOR BASE de las entradas (sin el servicio).
    const neto = baseEntradas - deducido
    const pct = Number(ev.reparto_compania_pct ?? 70)
    const compania = Math.round(neto * pct) / 100
    const piso2Reparto = neto - compania
    // El 10% de servicio va entero a Piso 2, aparte del reparto.
    const piso2 = piso2Reparto + servicio

    return {
        ok: true as const,
        nombre: ev.nombre,
        ingresos, ventasCount,
        baseEntradas, servicio,
        totalEquipo, incluirEquipo,
        gastos: (gastos || []) as any[], totalGastos,
        deducido, neto, pct, compania, piso2Reparto, piso2,
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

// ---- Carritos abandonados ---------------------------------------------------
// Órdenes online que iniciaron el checkout (estado 'pendiente') y no se pagaron.
// Ya tienen nombre + contacto + qué eligieron: sirve para recuperarlas.

export async function getCarritosAbandonadosAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, carritos: [] as any[] }
    const admin = getAdminClient()

    const { data: ventas } = await admin.from('evento_ventas')
        .select('id, comprador_nombre, comprador_contacto, total, created_at')
        .eq('evento_id', eventoId).eq('estado', 'pendiente').order('created_at', { ascending: false })
    const ids = (ventas || []).map((v: any) => v.id)
    if (!ids.length) return { ok: true as const, carritos: [] as any[] }

    const { data: entradas } = await admin.from('evento_entradas').select('id, nombre').eq('evento_id', eventoId)
    const nombreEnt: Record<string, string> = {}
    for (const e of (entradas || []) as any[]) nombreEnt[e.id] = e.nombre
    const { data: items } = await admin.from('evento_venta_items').select('venta_id, entrada_id, cantidad').in('venta_id', ids)
    const itemsByVenta: Record<string, string[]> = {}
    for (const it of (items || []) as any[]) {
        (itemsByVenta[it.venta_id] ||= []).push(`${it.cantidad}× ${nombreEnt[it.entrada_id] || 'Entrada'}`)
    }
    const carritos = (ventas || []).map((v: any) => ({
        id: v.id,
        nombre: v.comprador_nombre || 'Sin nombre',
        contacto: v.comprador_contacto || '',
        detalle: (itemsByVenta[v.id] || []).join(' · '),
        total: Number(v.total || 0),
        created_at: v.created_at,
    }))
    return { ok: true as const, carritos }
}

export async function descartarCarritoAction(ventaId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    // Solo se descartan órdenes que nunca se pagaron.
    const { data: v } = await admin.from('evento_ventas').select('estado').eq('id', ventaId).maybeSingle()
    if (!v) return { ok: false as const, error: 'Orden no encontrada.' }
    if (v.estado !== 'pendiente') return { ok: false as const, error: 'Esta orden ya no está pendiente.' }
    await admin.from('evento_venta_items').delete().eq('venta_id', ventaId)
    const { error } = await admin.from('evento_ventas').delete().eq('id', ventaId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Ciclos de varias fechas ------------------------------------------------
// Un ciclo agrupa varias funciones (cada una es un evento hermano). El público
// entra por /ciclo/[slug] y elige la fecha.

function slugCiclo(nombre: string) {
    const base = (nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ciclo'
    return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

export async function getCiclosEventoAction() {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, ciclos: [] as any[] }
    const admin = getAdminClient()
    const { data } = await admin.from('evento_ciclos').select('id, nombre, slug, flyer_url, activo, created_at').order('created_at', { ascending: false })
    return { ok: true as const, ciclos: (data || []) as any[] }
}

// Crea un ciclo. Si viene eventoId, ata esa función al ciclo recién creado.
export async function crearCicloEventoAction(data: { nombre: string; descripcion?: string; flyer_url?: string; eventoId?: string }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.nombre?.trim()) return { ok: false as const, error: 'Poné un nombre al ciclo.' }
    const admin = getAdminClient()
    const slug = slugCiclo(data.nombre)
    const { data: c, error } = await admin.from('evento_ciclos').insert({
        nombre: data.nombre.trim(), descripcion: data.descripcion?.trim() || null,
        flyer_url: data.flyer_url?.trim() || null, slug, created_by: perm.userId,
    }).select('id, slug').single()
    if (error || !c) return { ok: false as const, error: error?.message || 'No se pudo crear el ciclo.' }
    if (data.eventoId) await admin.from('eventos').update({ ciclo_id: c.id }).eq('id', data.eventoId)
    return { ok: true as const, id: c.id, slug: c.slug }
}

export async function asignarCicloAction(eventoId: string, cicloId: string | null) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('eventos').update({ ciclo_id: cicloId }).eq('id', eventoId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// Duplica una función a otra fecha (mismo ciclo), clonando sus tipos de entrada.
// La copia queda en borrador para revisarla antes de activarla.
export async function duplicarEventoAction(eventoId: string, fecha: string | null) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { data: ev } = await admin.from('eventos').select('*').eq('id', eventoId).single()
    if (!ev) return { ok: false as const, error: 'Función no encontrada.' }

    const { data: nueva, error } = await admin.from('eventos').insert({
        nombre: ev.nombre, descripcion: ev.descripcion, lugar: ev.lugar,
        ciclo_id: ev.ciclo_id, flyer_url: ev.flyer_url, fecha: fecha || null,
        estado: 'borrador', venta_online: ev.venta_online, created_by: perm.userId,
    }).select('id').single()
    if (error || !nueva) return { ok: false as const, error: error?.message || 'No se pudo duplicar.' }

    const { data: entradas } = await admin.from('evento_entradas').select('nombre, precio, cupo, orden, oculta, codigo_promo, activo').eq('evento_id', eventoId)
    if (entradas?.length) {
        await admin.from('evento_entradas').insert(entradas.map((e: any) => ({ ...e, evento_id: nueva.id })))
    }
    return { ok: true as const, id: nueva.id }
}

// Público (por slug): el ciclo + sus fechas activas (para elegir cuál comprar).
export async function getCicloPublicoAction(slug: string) {
    const admin = getAdminClient()
    const { data: c } = await admin.from('evento_ciclos')
        .select('id, nombre, descripcion, flyer_url, activo, slug').eq('slug', slug).maybeSingle()
    if (!c || !c.activo) return null

    const { data: eventos } = await admin.from('eventos')
        .select('id, fecha, lugar, venta_online')
        .eq('ciclo_id', c.id).eq('estado', 'activo').eq('cancelado', false)
        .order('fecha', { ascending: true, nullsFirst: false })

    const fechas: any[] = []
    for (const e of (eventos || []) as any[]) {
        const { data: ents } = await admin.from('evento_entradas').select('id, cupo').eq('evento_id', e.id).eq('activo', true)
        const vendidas = await vendidasPorEntrada(admin, e.id)
        const cupo = (ents || []).reduce((a: number, x: any) => a + (x.cupo || 0), 0)
        const vend = (ents || []).reduce((a: number, x: any) => a + (vendidas[x.id] || 0), 0)
        fechas.push({
            id: e.id, fecha: e.fecha, lugar: e.lugar,
            comprable: !!e.venta_online, agotado: cupo > 0 && vend >= cupo,
        })
    }
    return { nombre: c.nombre, descripcion: c.descripcion, flyer_url: c.flyer_url, slug: c.slug, fechas }
}

// ---- Traspaso de fecha de entradas (#7) -------------------------------------
// Mueve una venta confirmada a otra función del mismo ciclo (mapeando los tipos
// de entrada por nombre y validando cupo en el destino).

export async function getFechasHermanasAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, fechas: [] as any[] }
    const admin = getAdminClient()
    const { data: ev } = await admin.from('eventos').select('ciclo_id').eq('id', eventoId).maybeSingle()
    if (!ev?.ciclo_id) return { ok: true as const, fechas: [] as any[] }
    const { data } = await admin.from('eventos')
        .select('id, fecha, lugar').eq('ciclo_id', ev.ciclo_id).neq('id', eventoId).eq('cancelado', false).order('fecha')
    return { ok: true as const, fechas: (data || []) as any[] }
}

export async function traspasarVentaAction(ventaId: string, destinoEventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()

    const { data: venta } = await admin.from('evento_ventas').select('id, evento_id, estado').eq('id', ventaId).maybeSingle()
    if (!venta) return { ok: false as const, error: 'Venta no encontrada.' }
    if (venta.estado !== 'confirmada') return { ok: false as const, error: 'Solo se traspasan ventas confirmadas.' }
    if (venta.evento_id === destinoEventoId) return { ok: false as const, error: 'Ya es la misma fecha.' }

    const { data: origen } = await admin.from('eventos').select('ciclo_id').eq('id', venta.evento_id).maybeSingle()
    const { data: destino } = await admin.from('eventos').select('id, ciclo_id, cancelado').eq('id', destinoEventoId).maybeSingle()
    if (!destino || destino.cancelado) return { ok: false as const, error: 'La fecha de destino no está disponible.' }
    if (!origen?.ciclo_id || origen.ciclo_id !== destino.ciclo_id) return { ok: false as const, error: 'Solo se traspasa entre fechas del mismo ciclo.' }

    const { data: items } = await admin.from('evento_venta_items').select('id, entrada_id, cantidad').eq('venta_id', ventaId)
    const { data: entOrigen } = await admin.from('evento_entradas').select('id, nombre').eq('evento_id', venta.evento_id)
    const { data: entDestino } = await admin.from('evento_entradas').select('id, nombre, cupo').eq('evento_id', destinoEventoId)
    const nombreDeOrigen: Record<string, string> = {}
    for (const e of (entOrigen || []) as any[]) nombreDeOrigen[e.id] = e.nombre
    const destinoPorNombre: Record<string, any> = {}
    for (const e of (entDestino || []) as any[]) destinoPorNombre[e.nombre] = e
    const vendidasDestino = await vendidasPorEntrada(admin, destinoEventoId)

    const mapeo: { itemId: string; nuevaEntrada: string }[] = []
    for (const it of (items || []) as any[]) {
        const nombre = nombreDeOrigen[it.entrada_id]
        const dest = destinoPorNombre[nombre]
        if (!dest) return { ok: false as const, error: `La fecha de destino no tiene el tipo "${nombre}".` }
        const disp = Math.max(0, (dest.cupo || 0) - (vendidasDestino[dest.id] || 0))
        if (it.cantidad > disp) return { ok: false as const, error: `No hay cupo de "${nombre}" en la fecha destino (quedan ${disp}).` }
        mapeo.push({ itemId: it.id, nuevaEntrada: dest.id })
    }

    await admin.from('evento_ventas').update({ evento_id: destinoEventoId }).eq('id', ventaId)
    for (const m of mapeo) await admin.from('evento_venta_items').update({ entrada_id: m.nuevaEntrada }).eq('id', m.itemId)
    const { data: tks } = await admin.from('evento_tickets').select('id, entrada_id').eq('venta_id', ventaId)
    for (const t of (tks || []) as any[]) {
        const dest = destinoPorNombre[nombreDeOrigen[t.entrada_id]]
        if (dest) await admin.from('evento_tickets').update({ entrada_id: dest.id, usado: false, usado_at: null }).eq('id', t.id)
    }
    return { ok: true as const }
}

// ---- Link de puerta para gente externa (#9) ---------------------------------
// Un token por evento habilita /puerta/[eventoId]?t=token para leer QR + cargar
// ventas en la puerta, sin cuenta. Autoriza por token (no por sesión).

async function puertaAutorizada(admin: any, eventoId: string, token: string) {
    if (!token) return false
    const { data: ev } = await admin.from('eventos').select('token_puerta').eq('id', eventoId).maybeSingle()
    return !!ev && ev.token_puerta === token
}

export async function getLinkPuertaAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { data: ev } = await admin.from('eventos').select('token_puerta').eq('id', eventoId).maybeSingle()
    if (!ev) return { ok: false as const, error: 'Evento no encontrado' }
    let token = ev.token_puerta
    if (!token) {
        token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
        await admin.from('eventos').update({ token_puerta: token }).eq('id', eventoId)
    }
    return { ok: true as const, token }
}

export async function getPuertaDataAction(eventoId: string, token: string) {
    const admin = getAdminClient()
    if (!(await puertaAutorizada(admin, eventoId, token))) return { ok: false as const, error: 'Link inválido' }
    const { data: ev } = await admin.from('eventos').select('nombre, fecha, lugar, cancelado').eq('id', eventoId).maybeSingle()
    if (!ev || ev.cancelado) return { ok: false as const, error: 'Este evento no está disponible.' }
    const { data: entradas } = await admin.from('evento_entradas').select('id, nombre, precio, cupo').eq('evento_id', eventoId).eq('activo', true).order('orden')
    const vendidas = await vendidasPorEntrada(admin, eventoId)
    const ents = (entradas || []).map((e: any) => ({ id: e.id, nombre: e.nombre, precio: Number(e.precio), disponible: Math.max(0, (e.cupo || 0) - (vendidas[e.id] || 0)) }))
    const { data: ventas } = await admin.from('evento_ventas').select('id').eq('evento_id', eventoId).eq('estado', 'confirmada')
    const ids = (ventas || []).map((v: any) => v.id)
    let total = 0, usados = 0
    if (ids.length) { const { data: tks } = await admin.from('evento_tickets').select('usado').in('venta_id', ids); total = (tks || []).length; usados = (tks || []).filter((t: any) => t.usado).length }
    return { ok: true as const, nombre: ev.nombre, fecha: ev.fecha, lugar: ev.lugar, entradas: ents, stats: { total, usados } }
}

export async function validarTicketPuertaAction(eventoId: string, token: string, codigo: string) {
    const admin = getAdminClient()
    if (!(await puertaAutorizada(admin, eventoId, token))) return { estado: 'error' as const, msg: 'Link inválido' }
    return await validarTicketConAdmin(admin, eventoId, codigo)
}

export async function registrarVentaPuertaAction(payload: { eventoId: string; token: string; comprador_nombre?: string; medio_pago?: string; items: { entrada_id: string; cantidad: number }[] }) {
    const admin = getAdminClient()
    if (!(await puertaAutorizada(admin, payload.eventoId, payload.token))) return { ok: false as const, error: 'Link inválido' }
    const { data: evChk } = await admin.from('eventos').select('cancelado').eq('id', payload.eventoId).maybeSingle()
    if (evChk?.cancelado) return { ok: false as const, error: 'Esta función está cancelada.' }

    const items = (payload.items || []).filter(i => i.entrada_id && Number(i.cantidad) > 0)
    if (!items.length) return { ok: false as const, error: 'Elegí al menos una entrada.' }
    const { data: entradas } = await admin.from('evento_entradas').select('id, nombre, precio, cupo').eq('evento_id', payload.eventoId)
    const mapa: Record<string, any> = {}
    for (const e of (entradas || []) as any[]) mapa[e.id] = e
    const vendidas = await vendidasPorEntrada(admin, payload.eventoId)
    let total = 0
    const rows: any[] = []
    for (const it of items) {
        const e = mapa[it.entrada_id]
        if (!e) return { ok: false as const, error: 'Entrada inválida.' }
        const disp = Math.max(0, (e.cupo || 0) - (vendidas[e.id] || 0))
        const cant = Math.floor(Number(it.cantidad))
        if (cant > disp) return { ok: false as const, error: `No hay cupo de "${e.nombre}" (quedan ${disp}).` }
        total += cant * Number(e.precio || 0)
        rows.push({ entrada_id: e.id, cantidad: cant, precio_unit: Number(e.precio || 0) })
    }
    const totalFinal = total + montoServicio(total)
    const tk = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
    const { data: venta, error } = await admin.from('evento_ventas').insert({
        evento_id: payload.eventoId, comprador_nombre: payload.comprador_nombre?.trim() || null,
        medio_pago: payload.medio_pago || 'efectivo', total: totalFinal, estado: 'confirmada', canal: 'puerta', token: tk,
    }).select('id').single()
    if (error || !venta) return { ok: false as const, error: error?.message || 'No se pudo registrar la venta.' }
    await admin.from('evento_venta_items').insert(rows.map(r => ({ ...r, venta_id: venta.id })))
    const tickets: any[] = []
    for (const r of rows) for (let n = 0; n < r.cantidad; n++) tickets.push({ venta_id: venta.id, entrada_id: r.entrada_id, codigo: `E-${String(venta.id).slice(0, 8)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}` })
    if (tickets.length) await admin.from('evento_tickets').insert(tickets)
    return { ok: true as const, id: venta.id, token: tk, total: totalFinal }
}

// ---- Cartelera pública de Escena (obras/funciones a la venta) ---------------
// Muestra los eventos activos (agrupando los ciclos en una sola tarjeta).
// Sin login. Si no hay nada, el front muestra "Próximamente".
export async function getCarteleraEscenaAction() {
    const admin = getAdminClient()
    const { data: eventos } = await admin.from('eventos')
        .select('id, nombre, fecha, lugar, flyer_url, venta_online, ciclo_id')
        .eq('estado', 'activo').eq('cancelado', false)
        .order('fecha', { ascending: true, nullsFirst: false })

    const cicloIds = [...new Set((eventos || []).map((e: any) => e.ciclo_id).filter(Boolean))]
    const ciclos: Record<string, any> = {}
    if (cicloIds.length) {
        const { data } = await admin.from('evento_ciclos').select('id, nombre, slug, flyer_url, activo').in('id', cicloIds)
        for (const c of (data || []) as any[]) ciclos[c.id] = c
    }

    const cards: any[] = []
    const ciclosVistos = new Set<string>()
    for (const e of (eventos || []) as any[]) {
        if (e.ciclo_id && ciclos[e.ciclo_id]?.activo) {
            if (ciclosVistos.has(e.ciclo_id)) continue // el ciclo se muestra una sola vez
            ciclosVistos.add(e.ciclo_id)
            const c = ciclos[e.ciclo_id]
            cards.push({
                tipo: 'ciclo', titulo: c.nombre, fecha: e.fecha, lugar: e.lugar,
                flyer: c.flyer_url || e.flyer_url || null,
                href: `/ciclo/${c.slug}`, comprable: true,
            })
        } else {
            cards.push({
                tipo: 'evento', titulo: e.nombre, fecha: e.fecha, lugar: e.lugar,
                flyer: e.flyer_url || null,
                href: e.venta_online ? `/evento/${e.id}` : null, comprable: !!e.venta_online,
            })
        }
    }
    return { cards }
}
