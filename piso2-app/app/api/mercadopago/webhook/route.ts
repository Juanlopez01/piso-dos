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

        if (type.includes('payment')) {
            paymentIdToProcess = id;
            console.log(`[WEBHOOK] Es un Pago directo. ID: ${paymentIdToProcess}`);
        } else if (type.includes('merchant_order')) {
            console.log(`[WEBHOOK] Es una Orden (Merchant Order). Entrando a buscar el pago...`);

            const moResponse = await fetch(`https://api.mercadopago.com/merchant_orders/${id}`, {
                headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
            });

            if (moResponse.ok) {
                const moData = await moResponse.json();
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

        if (!paymentIdToProcess) {
            return NextResponse.json({ message: 'No hay pago para procesar' }, { status: 200 });
        }

        // ==========================================
        // 2. VALIDAMOS EL PAGO REAL EN MP
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

            const mpPaymentIdStr = paymentIdToProcess.toString();
            const montoAbonado = payment.transaction_amount;

            // 🚀 PREVENCIÓN DE DUPLICADOS: Chequeamos si MercadoPago nos está avisando dos veces lo mismo
            const { data: pagoYaGuardado } = await supabase
                .from('pagos_online')
                .select('id')
                .eq('mp_payment_id', mpPaymentIdStr)
                .maybeSingle();

            if (pagoYaGuardado) {
                console.log(`✅ [WEBHOOK] El pago ${mpPaymentIdStr} ya fue procesado anteriormente en el historial.`);
                return NextResponse.json({ message: 'Pago ya procesado' }, { status: 200 });
            }

            // ==========================================
            // DESVÍO A: PAGO DE CUOTA DE LA LIGA
            // ==========================================
            if (metadata.tipo_pago === 'cuota_liga') {
                const { usuario_id, mes, anio } = metadata;
                console.log(`[WEBHOOK LIGA] Cobrando La Liga para Usuario: ${usuario_id}, Mes: ${mes}/${anio}`);

                // 1. Guardar en tabla específica de Liga (Sumamos si ya existe, creamos si no)
                const { data: pagoExisLiga } = await supabase.from('liga_pagos').select('id, monto').eq('alumno_id', usuario_id).eq('mes', mes).eq('anio', anio).maybeSingle();
                if (pagoExisLiga) {
                    await supabase.from('liga_pagos').update({ monto: Number(pagoExisLiga.monto) + montoAbonado }).eq('id', pagoExisLiga.id);
                } else {
                    await supabase.from('liga_pagos').insert({ alumno_id: usuario_id, mes: Number(mes), anio: Number(anio), monto: montoAbonado, metodo_pago: 'mercadopago' });
                }

                // 2. 🚀 GUARDAR EN EL HISTORIAL GENERAL (pagos_online)
                await supabase.from('pagos_online').insert({
                    user_id: usuario_id,
                    mp_payment_id: mpPaymentIdStr,
                    monto: montoAbonado,
                    concepto: `Pago Cuota La Liga (Mes ${mes}/${anio})`,
                    tipo_pago: 'liga',
                    estado: 'approved'
                });

                console.log("🌟 [WEBHOOK LIGA] ¡Cuota registrada y guardada en el historial!");
                return NextResponse.json({ success: true }, { status: 200 });
            }

            // ==========================================
            // DESVÍO A.2: PAGO DE CUOTA DE COMPAÑÍA 🚀
            // ==========================================
            if (metadata.tipo_pago === 'cuota_compania') {
                const { usuario_id, user_id, producto_id, mes, anio } = metadata;
                const alumnoId = usuario_id || user_id;

                console.log(`[WEBHOOK COMPAÑIA] Cobrando Compañía ${producto_id} para Usuario: ${alumnoId}, Mes: ${mes}/${anio}`);

                // 1. Guardar en tabla específica de Compañias
                const { data: pagoExisCia } = await supabase.from('companias_pagos').select('id, monto').eq('alumno_id', alumnoId).eq('compania_id', producto_id).eq('mes', mes).eq('anio', anio).maybeSingle();
                if (pagoExisCia) {
                    await supabase.from('companias_pagos').update({ monto: Number(pagoExisCia.monto) + montoAbonado }).eq('id', pagoExisCia.id);
                } else {
                    await supabase.from('companias_pagos').insert({ alumno_id: alumnoId, compania_id: producto_id, mes: Number(mes), anio: Number(anio), monto: montoAbonado, metodo_pago: 'mercadopago' });
                }

                // 2. 🚀 GUARDAR EN EL HISTORIAL GENERAL (pagos_online)
                await supabase.from('pagos_online').insert({
                    user_id: alumnoId,
                    mp_payment_id: mpPaymentIdStr,
                    monto: montoAbonado,
                    concepto: `Pago Cuota Grupo Exclusivo (Mes ${mes}/${anio})`,
                    tipo_pago: 'compania',
                    producto_id: producto_id,
                    estado: 'approved'
                });

                console.log("🌟 [WEBHOOK COMPAÑIA] ¡Cuota de Compañía registrada y guardada en el historial!");
                return NextResponse.json({ success: true }, { status: 200 });
            }

            // ==========================================
            // DESVÍO B: COMPRA DE PACK (Normal o Exclusivo)
            // ==========================================
            const { user_id, producto_id, cupon_id, tipo_clase, creditos, pase_referencia } = metadata;

            console.log(`[WEBHOOK PACK] Procesando carga: User ${user_id}, Tipo ${tipo_clase}, Ref: ${pase_referencia}`);

            // 1. Registrar el pack en alumno_packs (SOLO SI NO ES EXCLUSIVO)
            if (String(tipo_clase) !== 'exclusivo') {
                await supabase.from('alumno_packs').insert({
                    user_id, producto_id, tipo_clase,
                    cantidad_inicial: Number(creditos),
                    creditos_restantes: Number(creditos),
                    monto_abonado: montoAbonado,
                    estado: 'activo',
                    mp_payment_id: mpPaymentIdStr
                });
            }

            // 2. CARGA DE SALDO INTELIGENTE
            if (String(tipo_clase) === 'exclusivo') {
                const { error: errPase } = await supabase.rpc('cargar_pase_exclusivo_manual', {
                    p_usuario_id: user_id,
                    p_referencia: pase_referencia,
                    p_cantidad: Number(creditos)
                });
                if (errPase) console.error("Error cargando pase exclusivo:", errPase);
            } else {
                const field = tipo_clase === 'regular' ? 'creditos_regulares' : 'creditos_especiales';
                const { data: prof } = await supabase.from('profiles').select(field).eq('id', user_id).single();
                await supabase.from('profiles').update({
                    [field]: ((prof as any)?.[field] || 0) + Number(creditos)
                }).eq('id', user_id);
            }

            if (cupon_id) {
                await supabase.from('cupones_usados').insert({ cupon_id: cupon_id, user_id: user_id });
            }

            // 3. 🚀 GUARDAR EN EL HISTORIAL GENERAL (pagos_online)
            const nombrePack = String(tipo_clase) === 'exclusivo' ? 'Pase Exclusivo' : `Pack de Clases (${tipo_clase})`;
            await supabase.from('pagos_online').insert({
                user_id: user_id,
                mp_payment_id: mpPaymentIdStr,
                monto: montoAbonado,
                concepto: `Compra online: ${nombrePack} - ${creditos} créditos`,
                tipo_pago: 'pack',
                producto_id: producto_id,
                estado: 'approved'
            });

            console.log("🌟 [WEBHOOK PACK] ¡Pack acreditado y guardado en el historial con éxito!");
        }

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error: any) {
        console.error('❌ [WEBHOOK] Error general:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}