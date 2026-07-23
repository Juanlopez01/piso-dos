'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const limpiarTel = (v: string) => (v || '').replace(/\D/g, '')

// ── Autorización ────────────────────────────────────────────────────────────
async function getVendedor() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { error: 'No autorizado' as const }

    const { data: perfil } = await supabase
        .from('profiles')
        .select('rol, vendedor_activo')
        .eq('id', session.user.id)
        .single()

    if (!perfil) return { error: 'No autorizado' as const }
    const esAdmin = perfil.rol === 'admin'
    const esVendedor = perfil.rol === 'vendedor'
    if (!esAdmin && !esVendedor) return { error: 'No tenés permisos para vender' as const }
    // Un vendedor desactivado no puede operar; el admin siempre puede.
    if (esVendedor && perfil.vendedor_activo === false) {
        return { error: 'Tu usuario de vendedor está desactivado' as const }
    }
    return { userId: session.user.id, esAdmin }
}

// ── Crear venta + link de pago ──────────────────────────────────────────────
export async function crearVentaAction(input: {
    items: { productoId: string; cantidad: number; precioUnitario?: number }[]
    compradorNombre: string
    compradorTelefono: string
    compradorEmail?: string
    observaciones?: string
}) {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error }

    const items = (input.items || []).filter(i => i?.productoId)
    if (!items.length) return { success: false, error: 'Agregá al menos un producto' }
    if (!input.compradorNombre?.trim()) return { success: false, error: 'Falta el nombre del comprador' }

    const telefono = limpiarTel(input.compradorTelefono)
    if (telefono.length < 8) return { success: false, error: 'El teléfono no parece válido' }

    const admin = getAdminClient()
    const ids = [...new Set(items.map(i => i.productoId))]
    const { data: productos } = await admin
        .from('productos')
        .select('id, nombre, precio, categoria, comision_pct, comision_tipo, comision_monto, permite_editar_precio, activo')
        .in('id', ids)
    const pmap: Record<string, any> = Object.fromEntries((productos || []).map((p: any) => [p.id, p]))

    // Calculamos cada ítem (precio + comisión congelados).
    const itemsCalc: any[] = []
    let montoTotal = 0, comisionTotal = 0, cantidadTotal = 0
    for (const it of items) {
        const p = pmap[it.productoId]
        if (!p) return { success: false, error: 'Un producto del carrito no existe' }
        if (p.activo === false) return { success: false, error: `"${p.nombre}" está inactivo` }

        const cantidad = Math.max(1, Math.floor(Number(it.cantidad) || 1))
        // El precio sale del catálogo; solo se puede pisar si el admin lo habilitó.
        let precioUnitario = Number(p.precio)
        if (p.permite_editar_precio && it.precioUnitario != null) {
            const pe = Number(it.precioUnitario)
            if (!pe || pe <= 0) return { success: false, error: `Precio inválido en "${p.nombre}"` }
            precioUnitario = Math.round(pe)
        }
        if (!precioUnitario || precioUnitario <= 0) return { success: false, error: `"${p.nombre}" no tiene precio válido` }

        const subtotal = Math.round(precioUnitario * cantidad)
        const tipo = p.comision_tipo === 'monto_fijo' ? 'monto_fijo' : 'porcentaje'
        let cPct = 0, cMonto = 0
        if (tipo === 'monto_fijo') cMonto = Math.round((Number(p.comision_monto) || 0) * cantidad)
        else { cPct = Number(p.comision_pct) || 0; cMonto = Math.round(subtotal * cPct / 100) }

        itemsCalc.push({
            producto_id: p.id, producto_nombre: p.nombre, categoria: p.categoria || 'Otros',
            cantidad, precio_unitario: precioUnitario, subtotal,
            comision_tipo: tipo, comision_pct: cPct, comision_monto: cMonto
        })
        montoTotal += subtotal; comisionTotal += cMonto; cantidadTotal += cantidad
    }
    if (montoTotal <= 0) return { success: false, error: 'El monto final no puede ser $0' }

    const esMulti = itemsCalc.length > 1
    const first = itemsCalc[0]

    // La venta guarda el resumen; el detalle va en ventas_items.
    const { data: venta, error } = await admin
        .from('ventas_externas')
        .insert({
            vendedor_id: auth.userId,
            producto_id: first.producto_id,
            producto_nombre: esMulti ? `${itemsCalc.length} productos` : first.producto_nombre,
            categoria: esMulti ? 'Varios' : first.categoria,
            cantidad: cantidadTotal,
            precio_unitario: esMulti ? 0 : first.precio_unitario,
            monto_total: montoTotal,
            comision_tipo: esMulti ? 'mixto' : first.comision_tipo,
            comision_pct: esMulti ? 0 : first.comision_pct,
            comision_monto: comisionTotal,
            comprador_nombre: input.compradorNombre.trim(),
            comprador_telefono: telefono,
            comprador_email: input.compradorEmail?.trim().toLowerCase() || null,
            observaciones: input.observaciones?.trim() || null
        })
        .select('id')
        .single()
    if (error) return { success: false, error: error.message }

    const { error: e2 } = await admin
        .from('ventas_items')
        .insert(itemsCalc.map(i => ({ ...i, venta_id: venta.id })))
    if (e2) {
        await admin.from('ventas_externas').delete().eq('id', venta.id)
        return { success: false, error: e2.message }
    }

    return { success: true, ventaId: venta.id as string }
}

// ── Cancelar una venta pendiente ────────────────────────────────────────────
export async function cancelarVentaAction(ventaId: string) {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error }

    const admin = getAdminClient()
    const { data: venta } = await admin
        .from('ventas_externas')
        .select('vendedor_id, estado')
        .eq('id', ventaId)
        .single()

    if (!venta) return { success: false, error: 'La venta no existe' }
    if (!auth.esAdmin && venta.vendedor_id !== auth.userId) {
        return { success: false, error: 'Esa venta no es tuya' }
    }
    if (venta.estado === 'pagado') return { success: false, error: 'Esa venta ya fue pagada' }

    const { error } = await admin
        .from('ventas_externas')
        .update({ estado: 'cancelado' })
        .eq('id', ventaId)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

// ── Listado (vendedor: solo lo suyo; admin: todo, con filtros) ──────────────
export async function listarVentasAction(filtros?: {
    vendedorId?: string
    estado?: string
    categoria?: string
    desde?: string
    hasta?: string
}) {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error, ventas: [], esAdmin: false }

    const admin = getAdminClient()
    // Barremos vencidas antes de mostrar.
    await admin.rpc('marcar_ventas_vencidas')

    let query = admin
        .from('ventas_externas')
        .select('*, vendedor:profiles!ventas_externas_vendedor_id_fkey(nombre_completo)')
        .order('created_at', { ascending: false })
        .limit(500)

    if (!auth.esAdmin) {
        // El vendedor solo ve lo suyo, pase lo que pase.
        query = query.eq('vendedor_id', auth.userId)
    } else if (filtros?.vendedorId) {
        query = query.eq('vendedor_id', filtros.vendedorId)
    }

    if (filtros?.estado) query = query.eq('estado', filtros.estado)
    if (filtros?.categoria) query = query.eq('categoria', filtros.categoria)
    if (filtros?.desde) query = query.gte('created_at', filtros.desde)
    if (filtros?.hasta) query = query.lte('created_at', filtros.hasta)

    const { data, error } = await query
    if (error) return { success: false, error: error.message, ventas: [], esAdmin: auth.esAdmin }

    return { success: true, ventas: data || [], esAdmin: auth.esAdmin }
}

// ── Catálogo para el formulario ─────────────────────────────────────────────
export async function catalogoVentasAction() {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error, productos: [], esAdmin: false, vendedores: [] }

    const admin = getAdminClient()
    const { data: productos } = await admin
        .from('productos')
        .select('id, nombre, precio, categoria, comision_pct, permite_editar_precio, entrega_tipo')
        .eq('activo', true)
        .eq('visible_vendedor', true) // Solo lo que el admin habilitó para vender
        .order('categoria', { ascending: true })
        .order('nombre', { ascending: true })

    // Para el filtro por vendedor del panel admin.
    let vendedores: any[] = []
    if (auth.esAdmin) {
        const { data } = await admin
            .from('profiles')
            .select('id, nombre_completo, vendedor_activo')
            .eq('rol', 'vendedor')
            .order('nombre_completo', { ascending: true })
        vendedores = data || []
    }

    return { success: true, productos: productos || [], esAdmin: auth.esAdmin, vendedores }
}

// ── Activar/desactivar un vendedor (solo admin) ─────────────────────────────
export async function toggleVendedorActivoAction(vendedorId: string, activar: boolean) {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error }
    if (!auth.esAdmin) return { success: false, error: 'Solo administradores' }

    const admin = getAdminClient()
    const { error } = await admin
        .from('profiles')
        .update({ vendedor_activo: activar })
        .eq('id', vendedorId)
        .eq('rol', 'vendedor')

    if (error) return { success: false, error: error.message }
    return { success: true }
}

// ── Resumen de comisiones: pendientes por vendedor + historial de cierres ───
// "Pendiente" = ventas pagadas todavía no liquidadas (el período corre de una
// liquidación a la siguiente, no por mes calendario).
export async function resumenComisionesAction() {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error, pendientes: [], historial: [], esAdmin: false }

    const admin = getAdminClient()

    let q = admin
        .from('ventas_externas')
        .select('vendedor_id, comision_monto, pagado_at, vendedor:profiles!ventas_externas_vendedor_id_fkey(nombre_completo)')
        .eq('estado', 'pagado')
        .is('liquidacion_id', null)
    if (!auth.esAdmin) q = q.eq('vendedor_id', auth.userId)
    const { data: pend } = await q

    const map: Record<string, any> = {}
    for (const v of (pend || []) as any[]) {
        const nom = Array.isArray(v.vendedor) ? v.vendedor[0]?.nombre_completo : v.vendedor?.nombre_completo
        if (!map[v.vendedor_id]) map[v.vendedor_id] = { vendedor_id: v.vendedor_id, nombre: nom || '—', total: 0, cantidad: 0, desde: v.pagado_at, hasta: v.pagado_at }
        map[v.vendedor_id].total += Number(v.comision_monto) || 0
        map[v.vendedor_id].cantidad += 1
        if (v.pagado_at && v.pagado_at < map[v.vendedor_id].desde) map[v.vendedor_id].desde = v.pagado_at
        if (v.pagado_at && v.pagado_at > map[v.vendedor_id].hasta) map[v.vendedor_id].hasta = v.pagado_at
    }
    const pendientes = Object.values(map).sort((a: any, b: any) => b.total - a.total)

    let hq = admin
        .from('vendedor_liquidaciones')
        .select('*, vendedor:profiles!vendedor_liquidaciones_vendedor_id_fkey(nombre_completo)')
        .order('created_at', { ascending: false })
        .limit(100)
    if (!auth.esAdmin) hq = hq.eq('vendedor_id', auth.userId)
    const { data: historial } = await hq

    return { success: true, esAdmin: auth.esAdmin, pendientes, historial: historial || [] }
}

// ── Liquidar (cerrar comisiones) de un vendedor — solo admin ────────────────
export async function liquidarVendedorAction(vendedorId: string) {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error }
    if (!auth.esAdmin) return { success: false, error: 'Solo administradores' }

    const admin = getAdminClient()
    const { data: ventas } = await admin
        .from('ventas_externas')
        .select('id, comision_monto, pagado_at')
        .eq('vendedor_id', vendedorId)
        .eq('estado', 'pagado')
        .is('liquidacion_id', null)

    if (!ventas || !ventas.length) return { success: false, error: 'No hay comisiones pendientes para liquidar' }

    const total = ventas.reduce((a, v) => a + (Number(v.comision_monto) || 0), 0)
    const fechas = ventas.map(v => v.pagado_at).filter(Boolean).sort() as string[]

    const { data: liq, error } = await admin
        .from('vendedor_liquidaciones')
        .insert({
            vendedor_id: vendedorId,
            liquidado_por: auth.userId,
            total_comision: total,
            cantidad_ventas: ventas.length,
            desde: fechas[0] || null,
            hasta: fechas[fechas.length - 1] || null
        })
        .select('id')
        .single()
    if (error) return { success: false, error: error.message }

    // Atamos esas ventas a la liquidación → arranca un período nuevo.
    const { error: e2 } = await admin
        .from('ventas_externas')
        .update({ liquidacion_id: liq.id })
        .in('id', ventas.map(v => v.id))
    if (e2) return { success: false, error: e2.message }

    return { success: true, total, cantidad: ventas.length }
}

// ── Lectura PÚBLICA de la venta (la ve el cliente en /pagar/[id]) ───────────
export async function getVentaPublicaAction(ventaId: string) {
    const admin = getAdminClient()
    const { data: v } = await admin
        .from('ventas_externas')
        .select('id, producto_nombre, cantidad, precio_unitario, monto_total, comprador_nombre, estado, expira_at, vendedor:profiles!ventas_externas_vendedor_id_fkey(nombre_completo)')
        .eq('id', ventaId)
        .maybeSingle()

    if (!v) return { ok: false as const, motivo: 'inexistente' as const }
    if (v.estado === 'pagado') return { ok: false as const, motivo: 'pagado' as const }
    if (v.estado === 'cancelado') return { ok: false as const, motivo: 'cancelado' as const }
    if (v.estado === 'vencido' || new Date(v.expira_at) < new Date()) {
        return { ok: false as const, motivo: 'vencido' as const }
    }

    const vendedorNom = Array.isArray(v.vendedor)
        ? (v.vendedor[0] as any)?.nombre_completo
        : (v.vendedor as any)?.nombre_completo

    const { data: items } = await admin
        .from('ventas_items')
        .select('producto_nombre, cantidad, precio_unitario, subtotal')
        .eq('venta_id', ventaId)

    return {
        ok: true as const,
        venta: {
            id: v.id as string,
            producto_nombre: v.producto_nombre as string,
            cantidad: Number(v.cantidad),
            precio_unitario: Number(v.precio_unitario),
            monto_total: Number(v.monto_total),
            comprador_nombre: v.comprador_nombre as string,
            vendedor_nombre: (vendedorNom || null) as string | null,
            items: (items || []).map((i: any) => ({
                producto_nombre: i.producto_nombre as string,
                cantidad: Number(i.cantidad),
                precio_unitario: Number(i.precio_unitario),
                subtotal: Number(i.subtotal)
            }))
        }
    }
}
