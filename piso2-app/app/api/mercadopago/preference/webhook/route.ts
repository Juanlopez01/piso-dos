import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usamos el Service Role para operar en la base de datos de fondo de forma segura
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        // Mercado Pago puede mandar el ID en la URL de diferentes formas
        const url = new URL(request.url);
        const id = url.searchParams.get('data.id') || url.searchParams.get('id');
        const type = url.searchParams.get('type') || url.searchParams.get('topic');

        // Solo nos interesan las notificaciones que sean de "pagos"
        if (type !== 'payment' || !id) {
            return NextResponse.json({ message: 'Evento ignorado' }, { status: 200 });
        }

        // 1. Buscar los detalles reales del pago en la API de Mercado Pago (por seguridad anti-hackers)
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
            headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
        });

        if (!mpResponse.ok) throw new Error('No se pudo validar el pago en MP');

        const payment = await mpResponse.json();

        // 2. Si el pago está APROBADO, hacemos la magia
        if (payment.status === 'approved') {
            const metadata = payment.metadata; // Esta es la info que mandamos desde la Tienda

            if (!metadata) return NextResponse.json({ message: 'Sin metadata' }, { status: 200 });

            const { user_id, producto_id, cupon_id, tipo_clase, creditos } = metadata;
            const montoAbonado = payment.transaction_amount;

            // 3. Verificamos que no hayamos procesado este pago antes
            const { data: pagoExistente } = await supabase
                .from('alumno_packs')
                .select('id')
                .eq('mp_payment_id', id.toString())
                .maybeSingle();

            if (pagoExistente) {
                // Si ya existe, le decimos a MP "Todo OK, ya lo recibí" para que deje de avisar
                return NextResponse.json({ message: 'Pago ya procesado' }, { status: 200 });
            }

            // 4. Calculamos vencimiento (Hoy + 30 días)
            const fechaVencimiento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            // 5. Creamos la "Bolsita" en el historial
            const { error: errPack } = await supabase.from('alumno_packs').insert({
                user_id: user_id,
                producto_id: producto_id,
                tipo_clase: tipo_clase,
                cantidad_inicial: Number(creditos),
                creditos_restantes: Number(creditos),
                monto_abonado: montoAbonado,
                fecha_vencimiento: fechaVencimiento,
                estado: 'activo',
                mp_payment_id: id.toString() // Guardamos el ID para bloquear futuros reintentos
            });

            if (errPack) throw errPack;

            // 6. Le sumamos los créditos visuales al perfil
            const fieldToUpdate = tipo_clase === 'regular' ? 'creditos_regulares' : 'creditos_seminarios';

            const { data: profile } = await supabase.from('profiles').select(fieldToUpdate).eq('id', user_id).single();

            // Le agregamos "(profile as any)" para que TypeScript nos deje leer la propiedad sin quejarse
            const currentCreds = (profile as any)?.[fieldToUpdate] || 0;

            await supabase.from('profiles').update({
                [fieldToUpdate]: currentCreds + Number(creditos)
            }).eq('id', user_id);

            // 7. Quemamos el cupón para que no lo pueda volver a usar
            if (cupon_id) {
                await supabase.from('cupones_usados').insert({
                    cupon_id: cupon_id,
                    user_id: user_id
                });
            }
        }

        // Siempre devolver 200 OK a Mercado Pago para que se quede tranquilo
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error: any) {
        console.error('Error procesando Webhook:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}