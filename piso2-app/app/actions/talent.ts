'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

// Solo admin puede gestionar talentos
async function requireAdmin(): Promise<{ ok: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (perfil?.rol !== 'admin') return { ok: false, error: 'Solo administradores' }
    return { ok: true }
}

export type TalentoPublico = {
    id: string
    nombre: string
    categoria: 'mujeres' | 'varones' | 'obras'
    disciplina: string | null
    bio: string | null
    fotos: string[]
    video_url: string | null
    destacado: boolean
}

// Vitrina pública: solo talentos activos, ordenados (destacados primero).
export async function getTalentosPublicosAction(): Promise<TalentoPublico[]> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talentos')
        .select('id, nombre, categoria, disciplina, bio, fotos, video_url, destacado')
        .eq('activo', true)
        .order('destacado', { ascending: false })
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })
    return (data || []) as TalentoPublico[]
}

export async function getTalentoAction(id: string): Promise<TalentoPublico | null> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talentos')
        .select('id, nombre, categoria, disciplina, bio, fotos, video_url, destacado')
        .eq('id', id)
        .eq('activo', true)
        .maybeSingle()
    return (data as TalentoPublico) || null
}

export type MarcaPublica = { id: string; nombre: string; logo_url: string }

export async function getMarcasPublicasAction(): Promise<MarcaPublica[]> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_marcas')
        .select('id, nombre, logo_url')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })
    return (data || []) as MarcaPublica[]
}

// El cliente elige un talento y envía la solicitud → queda registrada para Piso 2.
export async function crearSolicitudTalentoAction(payload: {
    talentoId: string
    talentoNombre: string
    clienteNombre: string
    clienteContacto: string
    clienteEmpresa?: string
    mensaje?: string
}) {
    if (!payload.clienteNombre?.trim() || !payload.clienteContacto?.trim()) {
        return { success: false, error: 'Completá tu nombre y un medio de contacto.' }
    }

    const admin = getAdminClient()
    const { error } = await admin.from('talent_solicitudes').insert({
        talento_id: payload.talentoId || null,
        talento_nombre: payload.talentoNombre || null,
        cliente_nombre: payload.clienteNombre.trim(),
        cliente_contacto: payload.clienteContacto.trim(),
        cliente_empresa: payload.clienteEmpresa?.trim() || null,
        mensaje: payload.mensaje?.trim() || null
    })

    if (error) return { success: false, error: error.message }
    return { success: true }
}

// ============================================================================
// ADMIN — ABM de talentos
// ============================================================================
export async function listTalentosAdminAction() {
    const perm = await requireAdmin()
    if (!perm.ok) return []
    const admin = getAdminClient()
    const { data } = await admin
        .from('talentos')
        .select('*')
        .order('categoria', { ascending: true })
        .order('destacado', { ascending: false })
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })
    return data || []
}

export async function upsertTalentoAction(payload: {
    id?: string
    nombre: string
    categoria: 'mujeres' | 'varones' | 'obras'
    disciplina?: string
    bio?: string
    fotos?: string[]
    video_url?: string
    destacado?: boolean
    activo?: boolean
    orden?: number
}) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    if (!payload.nombre?.trim()) return { success: false, error: 'Falta el nombre' }
    if (!['mujeres', 'varones', 'obras'].includes(payload.categoria)) return { success: false, error: 'Categoría inválida' }

    const admin = getAdminClient()

    // Máximo 5 destacados (los que van en la fila top de la home).
    if (payload.destacado) {
        let q = admin.from('talentos').select('id', { count: 'exact', head: true }).eq('destacado', true)
        if (payload.id) q = q.neq('id', payload.id)
        const { count } = await q
        if ((count || 0) >= 5) return { success: false, error: 'Ya hay 5 destacados (el máximo). Quitá uno antes de destacar otro.' }
    }

    const row = {
        nombre: payload.nombre.trim(),
        categoria: payload.categoria,
        disciplina: payload.disciplina?.trim() || null,
        bio: payload.bio?.trim() || null,
        fotos: payload.fotos || [],
        video_url: payload.video_url?.trim() || null,
        destacado: !!payload.destacado,
        activo: payload.activo !== false,
        orden: Number(payload.orden) || 0
    }

    const { error } = payload.id
        ? await admin.from('talentos').update(row).eq('id', payload.id)
        : await admin.from('talentos').insert(row)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function toggleTalentoActivoAction(id: string, activo: boolean) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talentos').update({ activo }).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function eliminarTalentoAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()

    const { data: t } = await admin.from('talentos').select('fotos').eq('id', id).single()
    const { error } = await admin.from('talentos').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    // Best-effort: borrar las fotos del storage
    const paths = (t?.fotos || []).map((u: string) => u.split('/talent/')[1]).filter(Boolean).map((p: string) => decodeURIComponent(p))
    if (paths.length) await admin.storage.from('talent').remove(paths)

    return { success: true }
}

// ============================================================================
// ADMIN — ABM de marcas (logos)
// ============================================================================
export async function listMarcasAdminAction() {
    const perm = await requireAdmin()
    if (!perm.ok) return []
    const admin = getAdminClient()
    const { data } = await admin.from('talent_marcas').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true })
    return data || []
}

export async function upsertMarcaAction(payload: { id?: string; nombre: string; logo_url: string; orden?: number; activo?: boolean }) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    if (!payload.nombre?.trim() || !payload.logo_url) return { success: false, error: 'Falta nombre o logo' }
    const admin = getAdminClient()
    const row = { nombre: payload.nombre.trim(), logo_url: payload.logo_url, orden: Number(payload.orden) || 0, activo: payload.activo !== false }
    const { error } = payload.id
        ? await admin.from('talent_marcas').update(row).eq('id', payload.id)
        : await admin.from('talent_marcas').insert(row)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function toggleMarcaActivoAction(id: string, activo: boolean) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talent_marcas').update({ activo }).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function eliminarMarcaAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { data: m } = await admin.from('talent_marcas').select('logo_url').eq('id', id).single()
    const { error } = await admin.from('talent_marcas').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    const path = m?.logo_url?.split('/talent/')[1]
    if (path) await admin.storage.from('talent').remove([decodeURIComponent(path)])
    return { success: true }
}
