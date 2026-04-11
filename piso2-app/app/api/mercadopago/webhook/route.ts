// app/api/mercadopago/webhook/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

        if (!id || !type) {
            return NextResponse.json({ message: 'Faltan datos' }, { status: 400 });
        }

        let paymentIdToProcess = null;

        // 🚀 EL BLINDAJE DEFINITIVO: Atrapamos Pagos O Órdenes
        if (type.includes('payment')) {
            // Caso 1: Mercado Pago nos mandó el pago directo (Ideal)
            paymentIdToProcess = id;
            console.log(`[WEBHOOK] Es un Pago directo. ID: ${paymentIdToProcess}`);

        } else if (type.includes('merchant_order')) {
            // Caso 2: Mercado Pago nos mandó la orden (El problema que tenías)
            console.log(`[WEBHOOK] Es una Orden (Merchant Order). Entrando a buscar el pago...`);

            const moResponse = await fetch(`https://api.mercadopago.com/merchant_orders/${id}`, {
                headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
            });

            if (moResponse.ok) {
                const moData = await moResponse.json();
                // Buscamos si adentro de esta orden hay algún pago aprobado
                const pagoAprobado = moData.payments?.find((p: any) => p.status === 'approved');

                if (pagoAprobado) {
                    paymentIdToProcess = pagoAprobado.id;
                    console.log(`[WEBHOOK] ¡ÉXITO! Encontramos el pago aprobado adentro de la orden. ID: ${paymentIdToProcess}`);
                } else {
                    console.log("[WEBHOOK] La orden no tiene pagos aprobados aún.");
                    return NextResponse.json({ message: 'Sin pagos aprobados en orden' }, { status: 200 });
                }
            } else {
                throw new Error('No se pudo leer la merchant order');
            }
        } else {
            console.log("❌ [WEBHOOK] Evento ignorado (No es pago ni orden).");
            return NextResponse.json({ message: 'Evento ignorado' }, { status: 200 });
        }

        // Si llegamos acá y no tenemos un ID de pago, cortamos
        if (!paymentIdToProcess) {
            return NextResponse.json({ message: 'No hay pago para procesar' }, { status: 200 });
        }

        // ==========================================
        // 2. AHORA SÍ, VALIDAMOS EL PAGO REAL
        // ==========================================
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentIdToProcess}`, {
            headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
        });

        if (!mpResponse.ok) {
            console.error("❌ [WEBHOOK] Error al consultar MP:", await mpResponse.text());
            throw new Error('No se pudo validar el pago en MP');
        }

        const payment = await mpResponse.json();
        console.log(`[WEBHOOK] Estado definitivo del pago: ${payment.status}`);

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

                console.log("🌟 [WEBHOOK LIGA] ¡Cuota registrada con éxito!");
                return NextResponse.json({ success: true }, { status: 200 });
            }

            // ==========================================
            // DESVÍO B: COMPRA DE PACK NORMAL
            // ==========================================
            const { user_id, producto_id, cupon_id, tipo_clase, creditos } = metadata;
            const montoAbonado = payment.transaction_amount;

            console.log(`[WEBHOOK] Procesando carga para Usuario: ${user_id}, Pack: ${producto_id}`);

            // Validamos que no hayamos cargado ESTE MISMO PAGO antes (por si MP avisa 2 veces)
            const { data: pagoExistente } = await supabase
                .from('alumno_packs')
                .select('id')
                .eq('mp_payment_id', paymentIdToProcess.toString())
                .maybeSingle();

            if (pagoExistente) {
                console.log("✅ [WEBHOOK] Este pago ya estaba acreditado.");
                return NextResponse.json({ message: 'Pago ya procesado' }, { status: 200 });
            }

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
                mp_payment_id: paymentIdToProcess.toString()
            });

            if (errPack) throw errPack;

            const fieldToUpdate = tipo_clase === 'regular' ? 'creditos_regulares' : 'creditos_seminarios';

            const { data: profile } = await supabase.from('profiles').select(fieldToUpdate).eq('id', user_id).single();
            const currentCreds = (profile as any)?.[fieldToUpdate] || 0;

            await supabase.from('profiles').update({
                [fieldToUpdate]: currentCreds + Number(creditos)
            }).eq('id', user_id);

            if (cupon_id) {
                await supabase.from('cupones_usados').insert({ cupon_id: cupon_id, user_id: user_id });
            }

            console.log("🌟 [WEBHOOK] ¡Clases acreditadas con éxito en Supabase!");
        }

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error: any) {
        console.error('❌ [WEBHOOK] Error general:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}