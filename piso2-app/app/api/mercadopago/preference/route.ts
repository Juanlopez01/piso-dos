import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

// Usamos el cliente de Supabase de Admin para poder verificar datos de forma segura
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { productoId, userId, cuponId } = body;

        if (!productoId || !userId) {
            return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
        }

        // 1. Verificamos el producto en la BD para asegurar que el precio es real (evita hackeos)
        const { data: producto, error: errProd } = await supabase
            .from('productos')
            .select('*')
            .eq('id', productoId)
            .single();

        if (errProd || !producto) throw new Error('Producto no encontrado');

        let precioFinal = producto.precio;
        let codigoCupon = '';

        // 2. Si mandó un cupón, lo validamos y aplicamos el descuento matemáticamente
        if (cuponId) {
            const { data: cupon } = await supabase
                .from('cupones')
                .select('*')
                .eq('id', cuponId)
                .eq('activo', true)
                .single();

            if (cupon) {
                // Chequeamos que no lo haya usado ya
                const { data: yaUsado } = await supabase
                    .from('cupones_usados')
                    .select('id')
                    .eq('cupon_id', cupon.id)
                    .eq('user_id', userId)
                    .maybeSingle();

                if (!yaUsado) {
                    const descuento = precioFinal * (cupon.porcentaje / 100);
                    precioFinal = precioFinal - descuento;
                    codigoCupon = cupon.codigo;
                }
            }
        }

        // 3. Inicializamos Mercado Pago con nuestro Token
        const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
        const preference = new Preference(client);

        // 4. Creamos la preferencia (el link de pago)
        // Usamos metadata para pasarle al Webhook la info de a quién hay que darle los créditos después
        const response = await preference.create({
            body: {
                items: [
                    {
                        id: producto.id,
                        title: `${producto.nombre} ${codigoCupon ? `(Cupón: ${codigoCupon})` : ''}`,
                        quantity: 1,
                        unit_price: Number(precioFinal),
                        currency_id: 'ARS',
                    }
                ],
                metadata: {
                    user_id: userId,
                    producto_id: producto.id,
                    cupon_id: cuponId || null,
                    tipo_clase: producto.tipo_clase,
                    creditos: producto.creditos
                },
                // URLs a donde vuelve el usuario después de pagar o cancelar
                back_urls: {
                    success: `${process.env.NEXT_PUBLIC_SITE_URL}/tienda?status=success`,
                    failure: `${process.env.NEXT_PUBLIC_SITE_URL}/tienda?status=failure`,
                    pending: `${process.env.NEXT_PUBLIC_SITE_URL}/tienda?status=pending`,
                },
                auto_return: 'approved',
                // ACÁ ENVIARÁ MP EL AVISO SILENCIOSO CUANDO SE APRUEBE
                notification_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/mercadopago/webhook`,
            }
        });

        // Devolvemos el ID de la preferencia para que el frontend abra la ventana de pago
        return NextResponse.json({ id: response.id, init_point: response.init_point });

    } catch (error: any) {
        console.error('Error generando preferencia:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}