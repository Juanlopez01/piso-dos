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
    videos: string[]
    destacado: boolean
}

// Vitrina pública: solo talentos activos, ordenados (destacados primero).
export async function getTalentosPublicosAction(): Promise<TalentoPublico[]> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talentos')
        .select('id, nombre, categoria, disciplina, bio, fotos, video_url, videos, destacado')
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
        .select('id, nombre, categoria, disciplina, bio, fotos, video_url, videos, destacado')
        .eq('id', id)
        .eq('activo', true)
        .maybeSingle()
    return (data as TalentoPublico) || null
}

export type MarcaPublica = { id: string; nombre: string; logo_url: string; link: string | null }

export async function getMarcasPublicasAction(): Promise<MarcaPublica[]> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_marcas')
        .select('id, nombre, logo_url, link')
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
// POSTULACIONES — gente logueada que quiere SER talento
// ============================================================================

// Cualquier usuario logueado puede postularse.
export async function crearPostulacionTalentoAction(payload: {
    nombre: string
    rubro?: string
    descripcion?: string
    edad?: number
    altura?: number
    sexo?: string          // 'mujeres' | 'varones'
    fotos?: string[]       // hasta 3
    videos?: string[]      // hasta 3
}) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'Tenés que iniciar sesión para postularte.' }

    if (!payload.nombre?.trim()) return { success: false, error: 'Falta tu nombre completo.' }
    if (!['mujeres', 'varones'].includes(payload.sexo || '')) return { success: false, error: 'Seleccioná el sexo.' }

    const fotos = (payload.fotos || []).filter(Boolean).slice(0, 3)
    const videos = (payload.videos || []).map(v => v?.trim()).filter(Boolean).slice(0, 3)
    if (!fotos.length) return { success: false, error: 'Subí al menos una foto.' }

    const admin = getAdminClient()
    const { error } = await admin.from('talent_postulaciones').insert({
        user_id: session.user.id,
        nombre: payload.nombre.trim(),
        rubro: payload.rubro?.trim() || null,
        descripcion: payload.descripcion?.trim() || null,
        edad: payload.edad ? Number(payload.edad) : null,
        altura: payload.altura ? Number(payload.altura) : null,
        sexo: payload.sexo,
        fotos,
        videos,
        foto_url: fotos[0] || null,     // compat con la columna vieja
        video_url: videos[0] || null,
        estado: 'pendiente'
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function listPostulacionesAction() {
    const perm = await requireAdmin()
    if (!perm.ok) return []
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_postulaciones')
        .select('*')
        .order('estado', { ascending: true })       // 'pendiente' antes que 'standby'
        .order('created_at', { ascending: false })
    return data || []
}

// Aceptar → crea el talento en la vitrina y borra la postulación (la foto queda,
// la usa el talento). Eliminar → borra postulación + foto para no ocupar espacio.
export async function aceptarPostulacionAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()

    const { data: p } = await admin.from('talent_postulaciones').select('*').eq('id', id).single()
    if (!p) return { success: false, error: 'La postulación no existe' }

    const categoria = ['mujeres', 'varones', 'obras'].includes(p.sexo) ? p.sexo : 'mujeres'
    const fotos = (p.fotos && p.fotos.length) ? p.fotos : (p.foto_url ? [p.foto_url] : [])
    const videos = (p.videos && p.videos.length) ? p.videos : (p.video_url ? [p.video_url] : [])
    const { error: e1 } = await admin.from('talentos').insert({
        nombre: p.nombre,
        categoria,
        disciplina: p.rubro,
        bio: p.descripcion,
        fotos,
        videos,
        video_url: videos[0] || null,   // compat con el reproductor actual de la ficha
        edad: p.edad,
        altura: p.altura,
        destacado: false,
        activo: true,
        orden: 0
    })
    if (e1) return { success: false, error: e1.message }

    await admin.from('talent_postulaciones').delete().eq('id', id)
    return { success: true }
}

export async function standbyPostulacionAction(id: string, standby: boolean) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talent_postulaciones').update({ estado: standby ? 'standby' : 'pendiente' }).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function eliminarPostulacionAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()

    const { data: p } = await admin.from('talent_postulaciones').select('foto_url, fotos').eq('id', id).single()
    const { error } = await admin.from('talent_postulaciones').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    // Borramos TODAS las fotos del storage para no consumir espacio.
    const urls: string[] = [...(p?.fotos || [])]
    if (p?.foto_url) urls.push(p.foto_url)
    const paths = [...new Set(urls)].map(u => u?.split('/talent/')[1]).filter(Boolean).map((x: string) => decodeURIComponent(x))
    if (paths.length) await admin.storage.from('talent').remove(paths)
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
    videos?: string[]
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

    const videos = (payload.videos && payload.videos.length ? payload.videos : (payload.video_url ? [payload.video_url] : []))
        .map(v => v?.trim()).filter(Boolean).slice(0, 3)
    const row = {
        nombre: payload.nombre.trim(),
        categoria: payload.categoria,
        disciplina: payload.disciplina?.trim() || null,
        bio: payload.bio?.trim() || null,
        fotos: payload.fotos || [],
        videos,
        video_url: videos[0] || null,   // compat con el reproductor actual
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

export async function upsertMarcaAction(payload: { id?: string; nombre: string; logo_url: string; link?: string; orden?: number; activo?: boolean }) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    if (!payload.nombre?.trim() || !payload.logo_url) return { success: false, error: 'Falta nombre o logo' }
    const admin = getAdminClient()
    const row = { nombre: payload.nombre.trim(), logo_url: payload.logo_url, link: payload.link?.trim() || null, orden: Number(payload.orden) || 0, activo: payload.activo !== false }
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
