'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

// Verifica si el usuario puede gestionar material para un ámbito dado.
// Grupos: admin/recepcion, o el profesor coordinador de ESE grupo.
// Liga: admin/recepcion/coordinador/profesor.
async function puedeGestionar(
    scope: { companiaId?: string | null; ligaNivel?: number | null }
): Promise<{ ok: boolean; userId?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }

    const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    const rol = profile?.rol
    if (!rol) return { ok: false, error: 'Sin perfil' }

    if (['admin', 'recepcion'].includes(rol)) return { ok: true, userId: session.user.id }

    if (scope.companiaId) {
        if (rol !== 'profesor') return { ok: false, error: 'Sin permisos para este grupo' }
        const { data: comp } = await supabase.from('companias').select('coordinador_id').eq('id', scope.companiaId).single()
        if (comp?.coordinador_id === session.user.id) return { ok: true, userId: session.user.id }
        return { ok: false, error: 'Solo el profe coordinador del grupo puede cargar material' }
    }

    // Liga
    if (['coordinador', 'profesor'].includes(rol)) return { ok: true, userId: session.user.id }
    return { ok: false, error: 'Sin permisos' }
}

// Listar material para un ámbito. Solo requiere estar logueado.
export async function listarMaterialesAction(scope: { companiaId?: string; ligaNivel?: number }) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return []

    const admin = getAdminClient()
    let query = admin
        .from('materiales')
        .select('id, created_at, titulo, descripcion, archivo_url, subido_por, compania_id, liga_nivel, autor:profiles!subido_por(nombre_completo)')
        .order('created_at', { ascending: false })

    if (scope.companiaId) query = query.eq('compania_id', scope.companiaId)
    else if (typeof scope.ligaNivel === 'number') query = query.eq('liga_nivel', scope.ligaNivel)
    else return []

    const { data } = await query
    return data || []
}

export async function crearMaterialAction(payload: {
    titulo: string
    descripcion?: string
    archivo_url: string
    companiaId?: string
    ligaNivel?: number
}) {
    const scope = { companiaId: payload.companiaId, ligaNivel: payload.ligaNivel }
    const perm = await puedeGestionar(scope)
    if (!perm.ok) return { success: false, error: perm.error }

    if (!payload.titulo?.trim() || !payload.archivo_url) {
        return { success: false, error: 'Falta título o archivo' }
    }
    if (!payload.companiaId && typeof payload.ligaNivel !== 'number') {
        return { success: false, error: 'Falta el ámbito (grupo o nivel de liga)' }
    }

    const admin = getAdminClient()
    const { error } = await admin.from('materiales').insert({
        titulo: payload.titulo.trim(),
        descripcion: payload.descripcion?.trim() || null,
        archivo_url: payload.archivo_url,
        subido_por: perm.userId,
        compania_id: payload.companiaId || null,
        liga_nivel: payload.companiaId ? null : (payload.ligaNivel ?? null)
    })

    if (error) return { success: false, error: error.message }

    if (payload.companiaId) revalidatePath(`/companias/${payload.companiaId}`)
    else revalidatePath('/la-liga')
    return { success: true }
}

export async function eliminarMaterialAction(id: string) {
    const admin = getAdminClient()
    const { data: mat } = await admin.from('materiales').select('*').eq('id', id).single()
    if (!mat) return { success: false, error: 'No existe el material' }

    const perm = await puedeGestionar({ companiaId: mat.compania_id, ligaNivel: mat.liga_nivel })
    if (!perm.ok) return { success: false, error: perm.error }

    const { error } = await admin.from('materiales').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    // Intentamos borrar también el archivo del Storage (best-effort)
    const path = mat.archivo_url?.split('/materiales/')[1]
    if (path) {
        await admin.storage.from('materiales').remove([decodeURIComponent(path)])
    }

    if (mat.compania_id) revalidatePath(`/companias/${mat.compania_id}`)
    else revalidatePath('/la-liga')
    return { success: true }
}
