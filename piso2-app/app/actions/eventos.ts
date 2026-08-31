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
        .select('id, nombre, fecha, lugar, estado, created_at').order('fecha', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })

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

export async function guardarEntradaAction(data: { id?: string; evento_id: string; nombre: string; precio: number; cupo: number; orden?: number }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.nombre?.trim()) return { ok: false as const, error: 'Poné un nombre a la entrada.' }
    const admin = getAdminClient()
    const row = {
        evento_id: data.evento_id,
        nombre: data.nombre.trim(),
        precio: Number(data.precio) || 0,
        cupo: Math.max(0, Math.floor(Number(data.cupo) || 0)),
        orden: Number(data.orden) || 0,
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
