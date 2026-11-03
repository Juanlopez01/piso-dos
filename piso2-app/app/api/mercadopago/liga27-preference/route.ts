import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cuotasHabilitadas, CUOTAS_DESDE_LABEL } from '@/lib/liga27'

// ============================================================================
// Preferencia de MercadoPago para un pago de LA LIGA 2027 (matrícula / cuota /
// examen libre). El alumno de La Liga 2027 tiene cuenta propia (no es auth.users),
// así que este flujo es standalone y se protege con el token del liga27_pago
// (igual que evento-preference). El webhook (tipo_pago='liga27') lo confirma.
// ============================================================================
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' })
const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const CONCEPTO_LABEL: Record<string, string> = {
    matricula: 'Matrícula La Liga 2027',
    cuota: 'Cuota La Liga 2027',
    examen_libre: 'Examen libre La Liga 2027',
}

export async function POST(request: Request) {
    try {
        const { pagoId, token } = await request.json()
        if (!pagoId || !token) return NextResponse.json({ error: 'Faltan datos del pago' }, { status: 400 })

        const admin = getAdminClient()
        const { data: pago } = await admin.from('liga27_pagos')
            .select('id, inscripcion_id, concepto, mes, anio, monto, estado, token').eq('id', pagoId).maybeSingle()
        if (!pago || pago.token !== token) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
        if (pago.estado === 'pagado') return NextResponse.json({ error: 'Este pago ya fue registrado' }, { status: 400 })
        if (pago.estado === 'anulado') return NextResponse.json({ error: 'Este pago fue anulado' }, { status: 400 })
        // Las cuotas recién se pagan a partir de enero 2027.
        if (pago.concepto === 'cuota' && !cuotasHabilitadas()) {
            return NextResponse.json({ error: `Las cuotas se pagan a partir de ${CUOTAS_DESDE_LABEL}.` }, { status: 400 })
        }

        const label = CONCEPTO_LABEL[pago.concepto] || 'Pago La Liga 2027'
        const title = pago.concepto === 'cuota' && pago.mes
            ? `${label} — Mes ${pago.mes}/${pago.anio}` : label

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const mpPayload: any = {
            body: {
                items: [{ id: String(pago.id), title, quantity: 1, unit_price: Number(pago.monto), currency_id: 'ARS' }],
                metadata: { tipo_pago: 'liga27', liga27_pago_id: String(pago.id) },
                back_urls: {
                    success: `${baseUrl}/liga2027/pagar/${pago.id}?t=${token}&pago=ok`,
                    failure: `${baseUrl}/liga2027/pagar/${pago.id}?t=${token}&pago=error`,
                    pending: `${baseUrl}/liga2027/pagar/${pago.id}?t=${token}&pago=pendiente`,
                },
                auto_return: 'approved',
            },
        }
        if (!baseUrl.includes('localhost')) mpPayload.body.notification_url = `${baseUrl}/api/mercadopago/webhook`

        const preference = new Preference(client)
        const result = await preference.create(mpPayload)
        await admin.from('liga27_pagos').update({ mp_ref: result.id }).eq('id', pago.id)

        return NextResponse.json({ url: result.init_point })
    } catch (error: any) {
        console.error('❌ Error en liga27-preference:', error?.message || error)
        return NextResponse.json({ error: 'Error al procesar el pago' }, { status: 500 })
    }
}
