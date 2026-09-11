// app/actions/tienda.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

// Cupos de los productos con tope (para marcar "completo" en la Tienda). Devuelve
// { productoId: { cupo, vendidos, agotado } }. Cualquier usuario logueado puede leerlo.
export async function getCuposTiendaAction(): Promise<Record<string, { cupo: number; vendidos: number; agotado: boolean }>> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return {}
    const admin = getAdminClient()
    const { data: prods } = await admin.from('productos').select('id, cupo').not('cupo', 'is', null).eq('activo', true)
    const out: Record<string, { cupo: number; vendidos: number; agotado: boolean }> = {}
    for (const p of (prods || []) as any[]) {
        const { count } = await admin.from('alumno_packs').select('*', { count: 'exact', head: true }).eq('producto_id', p.id)
        const vendidos = count || 0
        out[p.id] = { cupo: p.cupo, vendidos, agotado: vendidos >= p.cupo }
    }
    return out
}

// --- ACCIONES PARA PRODUCTOS ---

export async function guardarProductoAction(payload: any, id?: string) {
    const supabase = await createClient()
    try {
        // 🚀 BLINDAJE: getSession en lugar de getUser
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        if (id) {
            const { error } = await supabase.from('productos').update(payload).eq('id', id)
            if (error) throw new Error(error.message)
        } else {
            const { error } = await supabase.from('productos').insert(payload)
            if (error) throw new Error(error.message)
        }

        revalidatePath('/productos') // 👈 Cambiá esto si tu ruta es diferente (ej: '/tienda')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function toggleProductoAction(id: string, currentStatus: boolean) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('productos').update({ activo: !currentStatus }).eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/productos')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// --- ACCIONES PARA CUPONES ---

export async function guardarCuponAction(codigo: string, porcentaje: number) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('cupones').insert({
            codigo,
            porcentaje,
            activo: true
        })

        if (error) {
            if (error.code === '23505') throw new Error('Ese código de cupón ya existe')
            throw new Error(error.message)
        }

        revalidatePath('/productos')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function toggleCuponAction(id: string, currentStatus: boolean) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('cupones').update({ activo: !currentStatus }).eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/productos')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarCuponAction(id: string) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('cupones').delete().eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/productos')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// --- ACCIONES PARA PASES EXCLUSIVOS ---

export async function cargarPaseExclusivoAction(usuarioId: string, paseReferencia: string, cantidadComprada: number) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        // 1. Buscamos si el usuario ya tiene pases para esta clase
        const { data: paseExistente } = await supabase
            .from('pases_exclusivos')
            .select('id, cantidad')
            .eq('usuario_id', usuarioId)
            .eq('pase_referencia', paseReferencia)
            .single()

        if (paseExistente) {
            // 2A. Si ya tiene, le sumamos los nuevos
            const { error } = await supabase
                .from('pases_exclusivos')
                .update({ cantidad: paseExistente.cantidad + cantidadComprada })
                .eq('id', paseExistente.id)

            if (error) throw new Error(error.message)
        } else {
            // 2B. Si es la primera vez, le creamos la fila
            const { error } = await supabase
                .from('pases_exclusivos')
                .insert([{
                    usuario_id: usuarioId,
                    pase_referencia: paseReferencia,
                    cantidad: cantidadComprada
                }])

            if (error) throw new Error(error.message)
        }

        return { success: true, message: 'Pase exclusivo cargado con éxito' }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarProductoAction(id: string) {
    try {
        const supabase = await createClient()

        // Eliminamos el producto de la base de datos
        const { error } = await supabase.from('productos').delete().eq('id', id)

        if (error) throw error

        return { success: true, message: 'Producto eliminado correctamente' }
    } catch (error: any) {
        console.error("Error eliminando producto:", error)
        return { success: false, error: 'No se pudo eliminar el producto. Revisá si hay compras asociadas a este pack.' }
    }
}