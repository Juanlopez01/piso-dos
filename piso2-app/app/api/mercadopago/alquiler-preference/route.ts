import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// ============================================================================
// Preferencia de MercadoPago para el ALQUILER de sala.
// - Single: { alquilerId, concepto: 'sena' | 'saldo' }
// - Grupo (multi-día): { groupId }  → paga la SEÑA de todas las reservas del grupo.
// El que reserva es un USUARIO LOGUEADO de 2M: validamos que sea suya.
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
        const { alquilerId, groupId, concepto } = await request.json()

        // El pago lo pide el dueño de la(s) reserva(s) (usuario logueado).
        const supabase = await createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return NextResponse.json({ error: 'Iniciá sesión' }, { status: 401 })

        const admin = getAdminClient()
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        let monto = 0
        let title = ''
        let metadata: Record<string, any> = {}
        let back: (estado: string) => string

        if (groupId) {
            // Grupo multi-día: seña de todas las reservas pendientes del grupo.
            const { data: alqs } = await admin.from('alquileres')
                .select('id, user_id, sena_monto, estado_pago')
                .eq('group_id', groupId).eq('user_id', session.user.id)
            const pend = (alqs || []).filter((a: any) => a.estado_pago === 'pendiente')
            if (!pend.length) return NextResponse.json({ error: 'No hay reservas pendientes en este grupo' }, { status: 404 })
            monto = pend.reduce((s: number, a: any) => s + Number(a.sena_monto || 0), 0)
            title = `Alquiler (${pend.length} reservas) — Seña`
            metadata = { tipo_pago: 'alquiler', group_id: String(groupId), concepto: 'sena' }
            back = (estado: string) => `${baseUrl}/alquilar-sala?pago=${estado}&group=${groupId}`
        } else {
            if (!alquilerId || !['sena', 'saldo'].includes(concepto)) {
                return NextResponse.json({ error: 'Faltan datos del pago' }, { status: 400 })
            }
            const { data: alq } = await admin.from('alquileres')
                .select('id, user_id, fecha, monto_total, monto_pagado, sena_monto, estado_pago, sala:salas(nombre)')
                .eq('id', alquilerId).maybeSingle()
            if (!alq || alq.user_id !== session.user.id) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

            if (concepto === 'sena') {
                if (alq.estado_pago !== 'pendiente') return NextResponse.json({ error: 'La seña ya fue pagada' }, { status: 400 })
                monto = Number(alq.sena_monto || 0)
            } else {
                if (alq.estado_pago === 'pagado') return NextResponse.json({ error: 'La reserva ya está paga' }, { status: 400 })
                monto = Number(alq.monto_total || 0) - Number(alq.monto_pagado || 0)
            }
            const salaNombre = (alq as any).sala?.nombre || 'Sala'
            title = `Alquiler ${salaNombre} — ${concepto === 'sena' ? 'Seña' : 'Saldo'} (${alq.fecha})`
            metadata = { tipo_pago: 'alquiler', alquiler_id: String(alq.id), concepto }
            back = (estado: string) => `${baseUrl}/alquilar-sala?pago=${estado}&id=${alq.id}`
        }

        if (monto <= 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })

        const mpPayload: any = {
            body: {
                items: [{ id: String(alquilerId || groupId), title, quantity: 1, unit_price: Math.round(monto), currency_id: 'ARS' }],
                metadata,
                back_urls: { success: back('ok'), failure: back('error'), pending: back('pendiente') },
            },
        }
        // auto_return + webhook solo con URL pública (MP rechaza auto_return con back_urls localhost).
        if (!baseUrl.includes('localhost')) {
            mpPayload.body.auto_return = 'approved'
            mpPayload.body.notification_url = `${baseUrl}/api/mercadopago/webhook`
        }

        const preference = new Preference(client)
        const result = await preference.create(mpPayload)
        if (groupId) await admin.from('alquileres').update({ mp_ref: result.id }).eq('group_id', groupId)
        else await admin.from('alquileres').update({ mp_ref: result.id }).eq('id', alquilerId)

        return NextResponse.json({ url: result.init_point })
    } catch (error: any) {
        console.error('❌ Error en alquiler-preference:', error?.message || error)
        return NextResponse.json({ error: 'Error al procesar el pago' }, { status: 500 })
    }
}
