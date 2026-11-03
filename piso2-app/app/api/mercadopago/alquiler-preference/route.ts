import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// ============================================================================
// Preferencia de MercadoPago para el ALQUILER de sala (seña o saldo).
// El que reserva es un USUARIO LOGUEADO de 2M: validamos que la reserva sea suya.
// El webhook (tipo_pago='alquiler') confirma y asienta el ingreso en el pozo.
// ============================================================================
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' })
const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: Request) {
    try {
        const { alquilerId, concepto } = await request.json()
        if (!alquilerId || !['sena', 'saldo'].includes(concepto)) {
            return NextResponse.json({ error: 'Faltan datos del pago' }, { status: 400 })
        }

        // El pago lo pide el dueño de la reserva (usuario logueado).
        const supabase = await createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return NextResponse.json({ error: 'Iniciá sesión' }, { status: 401 })

        const admin = getAdminClient()
        const { data: alq } = await admin.from('alquileres')
            .select('id, user_id, fecha, monto_total, monto_pagado, sena_monto, estado_pago, sala:salas(nombre)')
            .eq('id', alquilerId).maybeSingle()
        if (!alq || alq.user_id !== session.user.id) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

        let monto = 0
        if (concepto === 'sena') {
            if (alq.estado_pago !== 'pendiente') return NextResponse.json({ error: 'La seña ya fue pagada' }, { status: 400 })
            monto = Number(alq.sena_monto || 0)
        } else {
            if (alq.estado_pago === 'pagado') return NextResponse.json({ error: 'La reserva ya está paga' }, { status: 400 })
            monto = Number(alq.monto_total || 0) - Number(alq.monto_pagado || 0)
        }
        if (monto <= 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })

        const salaNombre = (alq as any).sala?.nombre || 'Sala'
        const title = `Alquiler ${salaNombre} — ${concepto === 'sena' ? 'Seña' : 'Saldo'} (${alq.fecha})`
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const back = (estado: string) => `${baseUrl}/alquilar-sala?pago=${estado}&id=${alq.id}`

        const mpPayload: any = {
            body: {
                items: [{ id: String(alq.id), title, quantity: 1, unit_price: Math.round(monto), currency_id: 'ARS' }],
                metadata: { tipo_pago: 'alquiler', alquiler_id: String(alq.id), concepto },
                back_urls: { success: back('ok'), failure: back('error'), pending: back('pendiente') },
                auto_return: 'approved',
            },
        }
        if (!baseUrl.includes('localhost')) mpPayload.body.notification_url = `${baseUrl}/api/mercadopago/webhook`

        const preference = new Preference(client)
        const result = await preference.create(mpPayload)
        await admin.from('alquileres').update({ mp_ref: result.id }).eq('id', alq.id)

        return NextResponse.json({ url: result.init_point })
    } catch (error: any) {
        console.error('❌ Error en alquiler-preference:', error?.message || error)
        return NextResponse.json({ error: 'Error al procesar el pago' }, { status: 500 })
    }
}
