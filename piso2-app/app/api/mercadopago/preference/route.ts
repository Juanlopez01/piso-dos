// app/api/mercadopago/preference/route.ts
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server-helper'

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN || ''
})

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { userId, productoId, cuponId, tipo_pago, mes, anio } = body

        if (!userId) {
            return NextResponse.json({ error: "Falta el ID del alumno" }, { status: 400 })
        }

        const supabase = await createClient()

        // 🚀 BLINDAJE: getSession en lugar de getUser
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user

        if (!user || user.id !== userId) {
            console.error("❌ Intento de pago sin sesión válida o cruzada")
            return NextResponse.json({ error: "Sesión inválida" }, { status: 401 })
        }

        let tituloFinal = ""
        let precioFinal = 0
        let metadataCustom: any = { usuario_id: userId, user_id: userId }

        // ==========================================
        // 2. BUSCAMOS EL PRECIO EN SUPABASE
        // ==========================================
        if (tipo_pago === 'cuota_liga') {
            tituloFinal = `Cuota La Liga - ${mes}/${anio}`
            precioFinal = 15000 // ⚠️ CAMBIÁ ESTO POR EL VALOR REAL DE TU CUOTA DE LA LIGA

            metadataCustom.tipo_pago = 'cuota_liga'
            metadataCustom.mes = mes
            metadataCustom.anio = anio
        } else {
            const { data: pack, error } = await supabase
                .from('productos')
                .select('nombre, precio, creditos, tipo_clase')
                .eq('id', productoId)
                .single()

            if (error || !pack) {
                console.error("❌ Error buscando producto en Supabase:", error?.message)
                return NextResponse.json({ error: "El producto no existe o fue eliminado" }, { status: 400 })
            }

            tituloFinal = pack.nombre
            precioFinal = pack.precio

            metadataCustom.producto_id = productoId
            metadataCustom.tipo_clase = pack.tipo_clase
            metadataCustom.creditos = pack.creditos
            if (cuponId) metadataCustom.cupon_id = cuponId
        }

        // ==========================================
        // 3. CREAMOS LA PREFERENCIA DE MERCADO PAGO
        // ==========================================
        const preference = new Preference(client)
        let rutaDestino = "/perfil"

        if (tipo_pago === 'cuota_liga') {
            rutaDestino = "/la-liga"
        }

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        const result = await preference.create({
            body: {
                items: [
                    {
                        id: tipo_pago === 'cuota_liga' ? 'LIGA_CUOTA' : productoId,
                        title: tituloFinal,
                        quantity: 1,
                        unit_price: Number(precioFinal),
                        currency_id: 'ARS',
                    }
                ],
                metadata: metadataCustom,
                back_urls: {
                    success: `${baseUrl}${rutaDestino}?pago=exito`,
                    failure: `${baseUrl}${rutaDestino}?pago=error`,
                    pending: `${baseUrl}${rutaDestino}?pago=pendiente`
                },
                auto_return: 'approved',
                notification_url: `${baseUrl}/api/mercadopago/webhook` // 👈 Descomentar para producción
            }
        })

        return NextResponse.json({ url: result.init_point })

    } catch (error) {
        console.error("❌ Error grave en la API de Mercado Pago:", error)
        return NextResponse.json({ error: "Error interno al procesar el pago" }, { status: 500 })
    }
}