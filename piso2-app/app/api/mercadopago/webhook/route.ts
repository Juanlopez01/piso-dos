// app/api/mercadopago/webhook/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Inicializamos el cliente en modo ADMIN para saltarnos las reglas de sesión (RLS)
// ya que Mercado Pago no tiene las cookies del usuario.
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        console.log("🔔 [WEBHOOK] Recibiendo notificación de Mercado Pago...");

        const url = new URL(request.url);
        let id = url.searchParams.get('data.id') || url.searchParams.get('id');
        let type = url.searchParams.get('type') || url.searchParams.get('topic');

        let body: any = {};
        try {
            body = await request.json();
            id = id || body?.data?.id || body?.id;
            type = type || body?.type || body?.topic || body?.action;
        } catch (e) {
            console.log("No hay body o no se pudo parsear");
        }

        console.log(`[WEBHOOK] RAW DATA -> Tipo detectado: ${type} | ID detectado: ${id}`);
        console.log(`[WEBHOOK] JSON Completo recibido:`, JSON.stringify(body));

        // 🚀 BLINDAJE AMPLIADO: Aceptamos cualquier variación de la palabra "payment"
        if (!id || !type || !type.includes('payment')) {
            console.log("❌ [WEBHOOK] Evento ignorado (No es pago o es un aviso secundario).");
            return NextResponse.json({ message: 'Evento ignorado' }, { status: 200 });
        }

        // 2. Buscar los detalles reales del pago en la API de Mercado Pago
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
            headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
        });

        if (!mpResponse.ok) {
            console.error("❌ [WEBHOOK] Error al consultar MP:", await mpResponse.text());
            throw new Error('No se pudo validar el pago en MP');
        }

        const payment = await mpResponse.json();
        console.log(`[WEBHOOK] Estado del pago en MP: ${payment.status}`);

        // 3. Si el pago está APROBADO, hacemos la magia
        if (payment.status === 'approved') {
            const metadata = payment.metadata;

            if (!metadata) {
                console.error("❌ [WEBHOOK] El pago no tiene metadata.");
                return NextResponse.json({ message: 'Sin metadata' }, { status: 200 });
            }

            // ==========================================
            // DESVÍO A: PAGO DE CUOTA DE LA LIGA
            // ==========================================
            if (metadata.tipo_pago === 'cuota_liga') {
                const { usuario_id, mes, anio } = metadata;
                const montoAbonado = payment.transaction_amount;
                console.log(`[WEBHOOK LIGA] Cobrando La Liga para Usuario: ${usuario_id}, Mes: ${mes}/${anio}`);

                const { data: pagoExistenteLiga } = await supabase
                    .from('liga_pagos')
                    .select('id')
                    .eq('alumno_id', usuario_id)
                    .eq('mes', mes)
                    .eq('anio', anio)
                    .maybeSingle();

                if (pagoExistenteLiga) {
                    console.log("✅ [WEBHOOK LIGA] Esta cuota ya estaba paga.");
                    return NextResponse.json({ message: 'Cuota ya pagada' }, { status: 200 });
                }

                const { error: errLiga } = await supabase.from('liga_pagos').insert({
                    alumno_id: usuario_id,
                    mes: Number(mes),
                    anio: Number(anio),
                    monto: montoAbonado,
                    metodo_pago: 'mercadopago',
                    turno_caja_id: null
                });

                if (errLiga) throw errLiga;

                console.log("🌟 [WEBHOOK LIGA] ¡Cuota de La Liga registrada con éxito!");
                return NextResponse.json({ success: true }, { status: 200 });
            }

            // ==========================================
            // DESVÍO B: COMPRA DE PACK NORMAL
            // ==========================================
            const { user_id, producto_id, cupon_id, tipo_clase, creditos } = metadata;
            const montoAbonado = payment.transaction_amount;

            console.log(`[WEBHOOK] Procesando carga para Usuario: ${user_id}, Pack: ${producto_id}`);

            const { data: pagoExistente } = await supabase
                .from('alumno_packs')
                .select('id')
                .eq('mp_payment_id', id.toString())
                .maybeSingle();

            if (pagoExistente) {
                console.log("✅ [WEBHOOK] Este pago ya estaba acreditado.");
                return NextResponse.json({ message: 'Pago ya procesado' }, { status: 200 });
            }

            // Calculamos exactamente 30 días a partir de ahora
            const fechaActual = new Date();
            fechaActual.setDate(fechaActual.getDate() + 30);
            const fechaVencimiento = fechaActual.toISOString();

            const { error: errPack } = await supabase.from('alumno_packs').insert({
                user_id: user_id,
                producto_id: producto_id,
                tipo_clase: tipo_clase,
                cantidad_inicial: Number(creditos),
                creditos_restantes: Number(creditos),
                monto_abonado: montoAbonado,
                fecha_vencimiento: fechaVencimiento,
                estado: 'activo',
                mp_payment_id: id.toString()
            });

            if (errPack) throw errPack;

            const fieldToUpdate = tipo_clase === 'regular' ? 'creditos_regulares' : 'creditos_seminarios';

            // Leemos el saldo actual y le sumamos los créditos nuevos
            const { data: profile } = await supabase.from('profiles').select(fieldToUpdate).eq('id', user_id).single();
            const currentCreds = (profile as any)?.[fieldToUpdate] || 0;

            await supabase.from('profiles').update({
                [fieldToUpdate]: currentCreds + Number(creditos)
            }).eq('id', user_id);

            // Quemamos el cupón (si usó)
            if (cupon_id) {
                await supabase.from('cupones_usados').insert({ cupon_id: cupon_id, user_id: user_id });
            }

            console.log("🌟 [WEBHOOK] ¡Clases acreditadas con éxito!");
        }

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error: any) {
        console.error('❌ [WEBHOOK] Error general:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        mensaje: "¡El Webhook existe y está vivo, esperando a Mercado Pago!"
    }, { status: 200 });
}