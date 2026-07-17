'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const ROLES_HABILITADOS = ['vendedor', 'admin']

// Deja solo los dígitos: "11 5555-4444" -> "1155554444"
const limpiarWhatsapp = (v: string) => v.replace(/\D/g, '')

async function getVendedor() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { error: 'No autorizado' as const }

    const { data: perfil } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', session.user.id)
        .single()

    if (!perfil || !ROLES_HABILITADOS.includes(perfil.rol)) {
        return { error: 'No tenés permisos para generar links de pago' as const }
    }
    return { userId: session.user.id, rol: perfil.rol }
}

// Techo de descuento configurable. Si no está seteado, 0 (nadie descuenta nada).
async function getDescuentoMax(admin: ReturnType<typeof getAdminClient>) {
    const { data } = await admin
        .from('configuraciones')
        .select('valor')
        .eq('clave', 'vendedor_descuento_max')
        .maybeSingle()
    const max = data?.valor ? Number(data.valor) : 0
    return isNaN(max) ? 0 : Math.min(Math.max(max, 0), 100)
}

export async function crearLinkPagoAction(
    productoId: string,
    descuentoPct: number,
    clienteNombre: string,
    clienteWhatsapp: string
) {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error }

    if (!productoId) return { success: false, error: 'Elegí un producto' }
    if (!clienteNombre?.trim()) return { success: false, error: 'Falta el nombre del cliente' }

    const whatsapp = limpiarWhatsapp(clienteWhatsapp || '')
    if (whatsapp.length < 8) return { success: false, error: 'El WhatsApp no parece válido' }

    const admin = getAdminClient()

    const { data: producto } = await admin
        .from('productos')
        .select('id, nombre, precio')
        .eq('id', productoId)
        .single()

    if (!producto) return { success: false, error: 'El producto no existe' }

    // ── El precio sale del catálogo, nunca del navegador ──────────────────
    const precioBase = Number(producto.precio)
    if (!precioBase || precioBase <= 0) {
        return { success: false, error: 'El producto no tiene un precio válido' }
    }

    // El descuento se recorta al techo. Un vendedor no puede regalar el producto.
    const descuentoMax = await getDescuentoMax(admin)
    const descPedido = Number(descuentoPct) || 0
    if (descPedido < 0) return { success: false, error: 'Descuento inválido' }
    if (descPedido > descuentoMax) {
        return { success: false, error: `El descuento máximo habilitado es ${descuentoMax}%` }
    }

    const montoFinal = Math.round(precioBase - (precioBase * descPedido / 100))
    // Mercado Pago no acepta links en $0.
    if (montoFinal <= 0) return { success: false, error: 'El monto final no puede ser $0' }

    const { data: link, error } = await admin
        .from('links_pago')
        .insert({
            vendedor_id: auth.userId,
            producto_id: productoId,
            precio_base: precioBase,
            descuento_pct: descPedido,
            monto_final: montoFinal,
            cliente_nombre: clienteNombre.trim(),
            cliente_whatsapp: whatsapp
        })
        .select('id')
        .single()

    if (error) return { success: false, error: error.message }

    return { success: true, linkId: link.id as string }
}

export async function anularLinkPagoAction(linkId: string) {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error }

    const admin = getAdminClient()

    const { data: link } = await admin
        .from('links_pago')
        .select('vendedor_id, estado')
        .eq('id', linkId)
        .single()

    if (!link) return { success: false, error: 'El link no existe' }
    // El vendedor solo puede anular lo suyo; el admin, cualquier cosa.
    if (auth.rol !== 'admin' && link.vendedor_id !== auth.userId) {
        return { success: false, error: 'Ese link no es tuyo' }
    }
    if (link.estado === 'pagado') return { success: false, error: 'Ese link ya fue pagado' }

    const { error } = await admin
        .from('links_pago')
        .update({ estado: 'anulado' })
        .eq('id', linkId)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

// Links del vendedor logueado (el admin ve todos).
export async function misLinksPagoAction() {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error, links: [] }

    const admin = getAdminClient()

    let query = admin
        .from('links_pago')
        .select('id, created_at, producto_id, precio_base, descuento_pct, monto_final, cliente_nombre, cliente_whatsapp, estado, pagado_at, expira_at, productos(nombre)')
        .order('created_at', { ascending: false })
        .limit(100)

    if (auth.rol !== 'admin') query = query.eq('vendedor_id', auth.userId)

    const { data, error } = await query
    if (error) return { success: false, error: error.message, links: [] }

    return { success: true, links: data || [] }
}

// Lectura PÚBLICA del link (la ve el cliente en /pagar/[id], sin cuenta).
// Solo devuelve lo que el cliente necesita ver: qué compra y cuánto sale.
export async function getLinkPublicoAction(linkId: string) {
    const admin = getAdminClient()

    const { data: link } = await admin
        .from('links_pago')
        .select('id, monto_final, precio_base, descuento_pct, cliente_nombre, estado, expira_at, productos(nombre, creditos, tipo_clase)')
        .eq('id', linkId)
        .maybeSingle()

    if (!link) return { ok: false as const, motivo: 'inexistente' as const }
    if (link.estado === 'pagado') return { ok: false as const, motivo: 'pagado' as const }
    if (link.estado === 'anulado') return { ok: false as const, motivo: 'anulado' as const }
    if (new Date(link.expira_at) < new Date()) return { ok: false as const, motivo: 'expirado' as const }

    const producto: any = Array.isArray(link.productos) ? link.productos[0] : link.productos

    return {
        ok: true as const,
        link: {
            id: link.id as string,
            monto_final: Number(link.monto_final),
            precio_base: Number(link.precio_base),
            descuento_pct: Number(link.descuento_pct),
            cliente_nombre: link.cliente_nombre as string,
            producto_nombre: producto?.nombre || 'Producto',
            creditos: producto?.creditos ?? null,
            tipo_clase: producto?.tipo_clase ?? null
        }
    }
}

// Catálogo para el formulario del vendedor.
export async function productosVendiblesAction() {
    const auth = await getVendedor()
    if ('error' in auth) return { success: false, error: auth.error, productos: [], descuentoMax: 0 }

    const admin = getAdminClient()
    // Los packs 'exclusivo' quedan afuera: se entregan con una RPC que necesita
    // un pase_referencia que este flujo no tiene. Se siguen vendiendo a mano.
    const { data } = await admin
        .from('productos')
        .select('id, nombre, precio, creditos, tipo_clase')
        .neq('tipo_clase', 'exclusivo')
        .order('precio', { ascending: true })

    return {
        success: true,
        productos: data || [],
        descuentoMax: await getDescuentoMax(admin)
    }
}
