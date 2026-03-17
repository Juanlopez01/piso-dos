import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 1. Inicializamos los clientes de Mercado Pago y Supabase
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN || ''
})

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
// Usamos el Service Role o la Anon Key dependiendo de tus permisos en la BD
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(request: Request) {
    try {
        const body = await request.json()

        // Extraemos los datos del fetch del frontend
        const { userId, productoId, cuponId, tipo_pago, mes, anio } = body

        if (!userId) {
            return NextResponse.json({ error: "Falta el ID del alumno" }, { status: 400 })
        }

        let tituloFinal = ""
        let precioFinal = 0
        let metadataCustom: any = { usuario_id: userId, user_id: userId }

        // ==========================================
        // 2. BUSCAMOS EL PRECIO EN SUPABASE
        // ==========================================
        if (tipo_pago === 'cuota_liga') {
            // Si el precio de la liga es fijo, lo podés dejar acá, o también buscarlo en una tabla
            tituloFinal = `Cuota La Liga - ${mes}/${anio}`
            precioFinal = 5000 // Podés cambiar esto para que también venga de Supabase si querés

            metadataCustom.tipo_pago = 'cuota_liga'
            metadataCustom.mes = mes
            metadataCustom.anio = anio
        } else {
            // Buscamos el pack específico en la tabla de Supabase (ej: 'packs')
            const { data: pack, error } = await supabase
                .from('productos') // ⚠️ CAMBIÁ ESTO por el nombre real de tu tabla
                .select('nombre, precio, creditos, tipo_clase') // ⚠️ Chequeá que estas columnas se llamen así
                .eq('id', productoId)
                .single()
            console.log(pack);

            if (error || !pack) {
                console.error("❌ Error buscando en Supabase:", error.message)
                return NextResponse.json({ error: "El producto no existe o fue eliminado" }, { status: 400 })
            }

            // Asignamos los datos reales sacados de la base de datos
            tituloFinal = pack.nombre
            precioFinal = pack.precio

            metadataCustom.producto_id = productoId
            metadataCustom.tipo_clase = pack.tipo_clase
            metadataCustom.creditos = pack.creditos
            if (cuponId) metadataCustom.cupon_id = cuponId
        }

        // ==========================================
        // 3. CREAMOS LA PREFERENCIA CON LOS DATOS DE LA BD
        // ==========================================
        const preference = new Preference(client)
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
                    success: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/la-liga?pago=exito`,
                    failure: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/la-liga?pago=error`,
                    pending: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/la-liga?pago=pendiente`
                },
                auto_return: 'approved',
            }
        })

        return NextResponse.json({ url: result.init_point })

    } catch (error) {
        console.error("❌ Error en el servidor:", error)
        return NextResponse.json({ error: "Error interno al procesar el pago" }, { status: 500 })
    }
}