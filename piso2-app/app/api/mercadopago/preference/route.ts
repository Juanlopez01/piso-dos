import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextResponse } from 'next/server'

// Inicializamos el cliente con tu token de MercadoPago
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN || ''
})

export async function POST(request: Request) {
    try {
        const body = await request.json()

        // Extraemos los datos que nos manda el botón del Frontend
        const { titulo, precio, userId, tipo_pago } = body

        if (!titulo || !precio || !userId) {
            return NextResponse.json({ error: "Faltan datos para cobrar" }, { status: 400 })
        }

        // ==========================================
        // ARMADO DEL "PAPELITO OCULTO" (METADATA)
        // ==========================================
        let metadataCustom: any = {
            usuario_id: userId, // Para La Liga
            user_id: userId     // Para los Packs (tu webhook original usa este)
        }

        if (tipo_pago === 'cuota_liga') {
            // Si están pagando la liga, mandamos el mes y el año
            metadataCustom.tipo_pago = 'cuota_liga'
            metadataCustom.mes = body.mes
            metadataCustom.anio = body.anio
        } else {
            // Si están pagando un pack normal, pasamos los datos que requiere tu código original
            metadataCustom.producto_id = body.packId
            metadataCustom.tipo_clase = body.tipo_clase
            metadataCustom.creditos = body.creditos
            if (body.cupon_id) metadataCustom.cupon_id = body.cupon_id
        }

        // Creamos la preferencia de cobro en MercadoPago
        const preference = new Preference(client)
        const result = await preference.create({
            body: {
                items: [
                    {
                        id: tipo_pago === 'cuota_liga' ? 'LIGA_CUOTA' : (body.packId || 'PACK'),
                        title: titulo,
                        quantity: 1,
                        unit_price: Number(precio),
                        currency_id: 'ARS',
                    }
                ],
                metadata: metadataCustom,
                back_urls: {
                    // A dónde vuelve el alumno después de pasar la tarjeta
                    success: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/la-liga?pago=exito`,
                    failure: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/la-liga?pago=error`,
                    pending: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/la-liga?pago=pendiente`
                },
                auto_return: 'approved',
            }
        })

        // Devolvemos el link mágico generado por MercadoPago
        return NextResponse.json({ url: result.init_point })

    } catch (error) {
        console.error("❌ Error creando preferencia MP:", error)
        return NextResponse.json({ error: "Error al crear el link de pago" }, { status: 500 })
    }
}