import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server-helper'

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN || ''
})

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { userId, productoId, cuponId, tipo_pago, mes, anio, pase_referencia, precio } = body

        if (!userId) {
            console.error("❌ MP Preference: Falta userId en el request")
            return NextResponse.json({ error: "Falta el ID del alumno" }, { status: 400 })
        }

        // 🚀 1. Instanciamos Supabase acá arriba para usarlo en todos lados
        const supabase = await createClient()

        let tituloFinal = ""
        let precioFinal = 0

        let metadataCustom: Record<string, string> = {
            usuario_id: String(userId),
            user_id: String(userId)
        }

        // ==========================================
        // 1. ASIGNACIÓN DE PRECIOS Y METADATA
        // ==========================================
        if (tipo_pago === 'cuota_liga') {
            tituloFinal = `Cuota La Liga - Mes ${mes}/${anio}`

            // 🚀 2. MAGIA: Buscamos nivel y beca reales en la BD
            const { data: perfil, error: perfilError } = await supabase
                .from('profiles')
                .select('nivel_liga, porcentaje_beca')
                .eq('id', userId)
                .single()

            if (perfilError || !perfil || !perfil.nivel_liga) {
                return NextResponse.json({ error: "El alumno no tiene un nivel de Liga válido." }, { status: 400 })
            }

            // 🚀 3. Buscamos cuánto sale la cuota para ese nivel en las configuraciones
            const clavePrecio = `cuota_liga_${perfil.nivel_liga}`
            const { data: config } = await supabase
                .from('configuraciones')
                .select('valor')
                .eq('clave', clavePrecio)
                .single()

            const precioBase = config?.valor ? Number(config.valor) : 15000 // Fallback por si no hay config
            const porcentajeBeca = perfil.porcentaje_beca ? Number(perfil.porcentaje_beca) : 0

            // 🚀 4. Aplicamos el descuento y fijamos el precio final de forma 100% segura
            precioFinal = precioBase - (precioBase * porcentajeBeca / 100)

            if (!precioFinal || precioFinal <= 0) {
                return NextResponse.json({ error: "El precio calculado es inválido o negativo" }, { status: 400 })
            }

            metadataCustom.tipo_pago = 'cuota_liga'
            if (mes) metadataCustom.mes = String(mes)
            if (anio) metadataCustom.anio = String(anio)
        } else {
            if (!productoId) {
                console.error("❌ MP Preference: Falta productoId para pago regular")
                return NextResponse.json({ error: "Falta producto a comprar" }, { status: 400 })
            }

            const { data: pack, error } = await supabase
                .from('productos')
                .select('nombre, precio, creditos, tipo_clase')
                .eq('id', productoId)
                .single()

            if (error || !pack) {
                console.error("❌ MP Preference: Producto no existe en DB:", error?.message)
                return NextResponse.json({ error: "El producto no existe o fue eliminado" }, { status: 400 })
            }

            tituloFinal = pack.nombre
            precioFinal = pack.precio

            metadataCustom.tipo_pago = String(tipo_pago) // Puede ser 'pack' o 'exclusivo'
            metadataCustom.producto_id = String(productoId)
            metadataCustom.tipo_clase = String(pack.tipo_clase)
            metadataCustom.creditos = String(pack.creditos)
            if (cuponId) metadataCustom.cupon_id = String(cuponId)
            if (pase_referencia) metadataCustom.pase_referencia = String(pase_referencia)
        }

        // ==========================================
        // 2. CREAMOS LA PREFERENCIA DE MERCADO PAGO
        // ==========================================
        const preference = new Preference(client)
        let rutaDestino = tipo_pago === 'cuota_liga' ? "/la-liga" : "/perfil"

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        const mpPayload: any = {
            body: {
                items: [
                    {
                        id: tipo_pago === 'cuota_liga' ? 'LIGA_CUOTA' : String(productoId),
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
                auto_return: 'approved'
            }
        }

        if (!baseUrl.includes('localhost')) {
            mpPayload.body.notification_url = `${baseUrl}/api/mercadopago/webhook`
        }

        console.log(`🟠 Enviando payload a MP: ${tituloFinal} a $${precioFinal}`)

        const result = await preference.create(mpPayload)

        console.log("✅ Preferencia creada con éxito:", result.id)
        return NextResponse.json({ url: result.init_point })

    } catch (error: any) {
        console.error("❌ Error grave en la API de Mercado Pago:", error?.message || error)
        if (error?.cause) console.error("🔍 Causa detallada MP:", error.cause)
        return NextResponse.json({ error: "Error interno al procesar el pago" }, { status: 500 })
    }
}