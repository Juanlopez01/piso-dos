import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { montoServicio, SERVICIO_PCT } from '@/utils/servicio'

// ============================================================================
// Preferencia de MercadoPago para la compra de ENTRADAS de un evento (PISO2E).
// Recibe { ventaId, token } de una orden pendiente, arma el pago y devuelve el
// init_point. El webhook (tipo_pago='evento_entrada') confirma y genera los QR.
// ============================================================================
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' })
const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: Request) {
    try {
        const { ventaId, token } = await request.json()
        if (!ventaId || !token) return NextResponse.json({ error: 'Faltan datos de la orden' }, { status: 400 })

        const admin = getAdminClient()
        const { data: venta } = await admin.from('evento_ventas')
            .select('id, evento_id, total, estado, token').eq('id', ventaId).maybeSingle()
        if (!venta || venta.token !== token) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
        if (venta.estado === 'confirmada') return NextResponse.json({ error: 'Esta compra ya fue pagada' }, { status: 400 })
        if (venta.estado === 'anulada') return NextResponse.json({ error: 'Esta orden fue anulada' }, { status: 400 })

        const { data: evento } = await admin.from('eventos').select('nombre').eq('id', venta.evento_id).maybeSingle()
        const { data: items } = await admin.from('evento_venta_items').select('entrada_id, cantidad, precio_unit').eq('venta_id', ventaId)
        if (!items || !items.length) return NextResponse.json({ error: 'La orden no tiene entradas' }, { status: 400 })

        const entradaIds = [...new Set(items.map((i: any) => i.entrada_id))]
        const nombreEnt: Record<string, string> = {}
        const { data: ents } = await admin.from('evento_entradas').select('id, nombre').in('id', entradaIds)
        for (const e of (ents || []) as any[]) nombreEnt[e.id] = e.nombre

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const mpItems = items.map((it: any) => ({
            id: String(it.entrada_id),
            title: `${evento?.nombre || 'Evento'} — ${nombreEnt[it.entrada_id] || 'Entrada'}`,
            quantity: Number(it.cantidad) || 1,
            unit_price: Number(it.precio_unit),
            currency_id: 'ARS',
        }))
        // 10% de servicio, sumado arriba del valor de las entradas.
        const base = items.reduce((a: number, it: any) => a + (Number(it.cantidad) || 1) * Number(it.precio_unit || 0), 0)
        const servicio = montoServicio(base)
        if (servicio > 0) mpItems.push({ id: 'servicio', title: `Cargo de servicio (${SERVICIO_PCT}%)`, quantity: 1, unit_price: servicio, currency_id: 'ARS' })

        const mpPayload: any = {
            body: {
                items: mpItems,
                metadata: { tipo_pago: 'evento_entrada', evento_venta_id: String(ventaId) },
                back_urls: {
                    success: `${baseUrl}/entradas/${ventaId}?t=${token}`,
                    failure: `${baseUrl}/evento/${venta.evento_id}?pago=error`,
                    pending: `${baseUrl}/entradas/${ventaId}?t=${token}&pago=pendiente`,
                },
                auto_return: 'approved',
            },
        }
        if (!baseUrl.includes('localhost')) mpPayload.body.notification_url = `${baseUrl}/api/mercadopago/webhook`

        const preference = new Preference(client)
        const result = await preference.create(mpPayload)
        await admin.from('evento_ventas').update({ mp_preference_id: result.id }).eq('id', ventaId)

        return NextResponse.json({ url: result.init_point })
    } catch (error: any) {
        console.error('❌ Error en evento-preference:', error?.message || error)
        return NextResponse.json({ error: 'Error al procesar el pago' }, { status: 500 })
    }
}
