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
            const userIdFinal = metadata.usuario_id || metadata.user_id;

            // PREPARAMOS LA INFORMACIÓN DEL RECIBO
            let conceptoFinal = '';
            let tipoPagoFinal = metadata.tipo_pago || 'pack';

            if (tipoPagoFinal === 'cuota_liga') {
                conceptoFinal = `Pago Cuota La Liga (Mes ${metadata.mes}/${metadata.anio})`;
            } else if (tipoPagoFinal === 'cuota_compania') {
                conceptoFinal = `Pago Cuota Grupo Exclusivo (Mes ${metadata.mes}/${metadata.anio})`;
            } else {
                const nombrePack = String(metadata.tipo_clase) === 'exclusivo' ? 'Pase Exclusivo' : `Pack de Clases (${metadata.tipo_clase})`;
                conceptoFinal = `Compra online: ${nombrePack} - ${metadata.creditos} créditos`;
                tipoPagoFinal = 'pack';
            }

            // =========================================================================
            // 🚀 BARRERA ANTI-CLONES (El INSERT choca contra el UNIQUE de la BD)
            // =========================================================================
            const { error: errControl } = await supabase.from('pagos_online').insert({
                user_id: userIdFinal,
                mp_payment_id: mpPaymentIdStr,
                monto: montoAbonado,
                concepto: conceptoFinal,
                tipo_pago: tipoPagoFinal,
                // Limpieza de UUID: Si MP nos manda un string vacío, lo forzamos a null
                producto_id: (metadata.producto_id && metadata.producto_id.trim() !== '') ? metadata.producto_id : null,
                estado: 'approved'
            });

            if (errControl) {
                if (errControl.code === '23505') { // Violación de unicidad
                    console.log(`✅ [WEBHOOK] Candado activado. El pago ${mpPaymentIdStr} intentó procesarse doble y fue bloqueado.`);
                    return NextResponse.json({ message: 'Pago ya procesado' }, { status: 200 });
                }
                throw new Error(`Fallo al guardar en pagos_online: ${errControl.message}`);
            }

            // =========================================================================
            // 🚀 OPERACIONES SEGÚN EL TIPO DE COMPRA
            // =========================================================================

            if (tipoPagoFinal === 'cuota_liga') {
                const { mes, anio } = metadata;
                const { data: pagoExisLiga } = await supabase.from('liga_pagos').select('id, monto').eq('alumno_id', userIdFinal).eq('mes', mes).eq('anio', anio).maybeSingle();

                if (pagoExisLiga) {
                    const { error: e1 } = await supabase.from('liga_pagos').update({ monto: Number(pagoExisLiga.monto) + montoAbonado }).eq('id', pagoExisLiga.id);
                    if (e1) throw new Error(`Fallo al actualizar pago liga: ${e1.message}`);
                } else {
                    const { error: e2 } = await supabase.from('liga_pagos').insert({ alumno_id: userIdFinal, mes: Number(mes), anio: Number(anio), monto: montoAbonado, metodo_pago: 'mercadopago' });
                    if (e2) throw new Error(`Fallo al insertar pago liga: ${e2.message}`);
                }
                console.log("🌟 [WEBHOOK] Cuota Liga procesada.");

            } else if (tipoPagoFinal === 'cuota_compania') {
                const { producto_id, mes, anio } = metadata;
                const ciaIdLimpio = (producto_id && producto_id.trim() !== '') ? producto_id : null;

                const { data: pagoExisCia } = await supabase.from('companias_pagos').select('id, monto').eq('alumno_id', userIdFinal).eq('compania_id', ciaIdLimpio).eq('mes', mes).eq('anio', anio).maybeSingle();

                if (pagoExisCia) {
                    const { error: e1 } = await supabase.from('companias_pagos').update({ monto: Number(pagoExisCia.monto) + montoAbonado }).eq('id', pagoExisCia.id);
                    if (e1) throw new Error(`Fallo al actualizar pago compañía: ${e1.message}`);
                } else {
                    const { error: e2 } = await supabase.from('companias_pagos').insert({ alumno_id: userIdFinal, compania_id: ciaIdLimpio, mes: Number(mes), anio: Number(anio), monto: montoAbonado, metodo_pago: 'mercadopago' });
                    if (e2) throw new Error(`Fallo al insertar pago compañía: ${e2.message}`);
                }
                console.log("🌟 [WEBHOOK] Cuota Compañía procesada.");

            } else {
                // =========================================================================
                // 🚀 FLUJO DE VENTA DE PACKS (CON ESTÁNDAR DE ORO)
                // =========================================================================
                const { producto_id, cupon_id, tipo_clase, creditos, pase_referencia } = metadata;

                const productoIdLimpio = (producto_id && producto_id.trim() !== '') ? producto_id : null;
                const tipoClaseSeguro = tipo_clase || 'regular';

                const ahora = new Date();
                const fechaVencimiento = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

                // 1. Guardar info del pack (¡AHORA PARA TODOS LOS TIPOS DE PACKS!)
                const { error: errPack } = await supabase.from('alumno_packs').insert({
                    user_id: userIdFinal,
                    producto_id: productoIdLimpio,
                    tipo_clase: tipoClaseSeguro,
                    cantidad_inicial: Number(creditos),
                    creditos_restantes: Number(creditos), // Al comprar, le quedan todos
                    monto_abonado: montoAbonado,
                    estado: 'activo',
                    mp_payment_id: mpPaymentIdStr,
                    fecha_compra: ahora.toISOString(),
                    fecha_vencimiento: fechaVencimiento
                });

                // 🚀 FRENO DE EMERGENCIA
                if (errPack) {
                    console.error("❌ ERROR CRÍTICO AL INSERTAR ALUMNO_PACKS:", errPack);
                    throw new Error(`No se pudo guardar el pack en la base de datos: ${errPack.message}`);
                }

                // 2. Cargar créditos a la cuenta (RPC para exclusivos, Update para regulares/especiales)
                if (String(tipoClaseSeguro) === 'exclusivo') {
                    const { error: errEx } = await supabase.rpc('cargar_pase_exclusivo_manual', {
                        p_usuario_id: userIdFinal,
                        p_referencia: pase_referencia,
                        p_cantidad: Number(creditos)
                    });
                    if (errEx) throw new Error(`Fallo al dar pase exclusivo: ${errEx.message}`);
                } else {
                    const field = tipoClaseSeguro === 'regular' ? 'creditos_regulares' : 'creditos_especiales';

                    const { data: prof, error: errProf } = await supabase.from('profiles').select(field).eq('id', userIdFinal).single();
                    if (errProf || !prof) throw new Error(`Fallo al leer perfil del alumno: ${errProf?.message}`);

                    const { error: errUpd } = await supabase.from('profiles').update({
                        [field]: ((prof as any)[field] || 0) + Number(creditos)
                    }).eq('id', userIdFinal);

                    if (errUpd) throw new Error(`Fallo al sumar créditos al perfil: ${errUpd.message}`);
                }

                // 3. Quemar cupón si usó uno
                if (cupon_id) {
                    await supabase.from('cupones_usados').insert({ cupon_id: cupon_id, user_id: userIdFinal });
                }
                console.log("🌟 [WEBHOOK] Pack de créditos entregado y guardado con éxito.");
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error: any) {
        console.error('❌ [WEBHOOK] Error general:', error);
        // Si lanzamos status 500, Mercado Pago sabe que falló y lo vuelve a intentar luego
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}