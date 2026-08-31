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

// ── Acortador de links ───────────────────────────────────────────────────────
// Alfabeto sin caracteres confusos (0/o, 1/l/i) para que el link corto sea fácil
// de leer y dictar.
const SHORT_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
function generarCodigoCorto(len: number): string {
    let s = ''
    for (let i = 0; i < len; i++) s += SHORT_ALPHABET[Math.floor(Math.random() * SHORT_ALPHABET.length)]
    return s
}

// Devuelve (creando si hace falta) un código corto para una ruta. Reusa el mismo
// código si ese destino ya fue acortado, así el link es estable.
export async function acortarLinkAction(destino: string): Promise<{ ok: boolean; codigo?: string; error?: string }> {
    // Se llama desde el panel: pedimos sesión (cualquier staff logueado).
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }

    // Guardamos solo la ruta relativa (sin dominio), para que funcione en cualquier entorno.
    let path = (destino || '').trim()
    if (/^https?:\/\//i.test(path)) {
        try { const u = new URL(path); path = u.pathname + u.search } catch { /* se usa tal cual */ }
    }
    if (!path.startsWith('/')) path = '/' + path
    if (path.length < 2) return { ok: false, error: 'Destino inválido' }

    const admin = getAdminClient()

    // ¿Ya existe un código para este destino? Lo reusamos.
    const { data: existente } = await admin.from('short_links').select('codigo').eq('destino', path).limit(1).maybeSingle()
    if (existente?.codigo) return { ok: true, codigo: existente.codigo }

    // Generamos uno único (reintenta si choca contra el PK).
    for (let intento = 0; intento < 8; intento++) {
        const codigo = generarCodigoCorto(intento < 5 ? 5 : 6)
        const { error } = await admin.from('short_links').insert({ codigo, destino: path })
        if (!error) return { ok: true, codigo }
        if (error.code !== '23505') return { ok: false, error: error.message } // no era colisión
    }
    return { ok: false, error: 'No se pudo generar el código' }
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
    nacionalidad?: string
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
        nacionalidad: payload.nacionalidad?.trim() || null,
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

// Adjunta el teléfono del perfil del usuario logueado (para contacto por WhatsApp
// desde el admin). Las postulaciones generales no piden teléfono; lo tomamos del perfil.
async function adjuntarTelefonoPerfil(admin: ReturnType<typeof getAdminClient>, posts: any[]): Promise<any[]> {
    const ids = [...new Set(posts.map(p => p.user_id).filter(Boolean))]
    if (!ids.length) return posts
    const { data: perfiles } = await admin.from('profiles').select('id, telefono').in('id', ids)
    const telPorId: Record<string, string | null> = {}
    for (const pf of (perfiles || [])) telPorId[pf.id] = pf.telefono
    return posts.map(p => ({ ...p, telefono: telPorId[p.user_id] || null }))
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
    return adjuntarTelefonoPerfil(admin, data || [])
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
        nacionalidad: p.nacionalidad,
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

// ============================================================================
// SHOWS — obras/producciones con video resumen y descripción
// ============================================================================
export type ShowPublico = { id: string; titulo: string; descripcion: string | null; video_url: string | null; portada_url: string | null }

export async function getShowsPublicosAction(): Promise<ShowPublico[]> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_shows')
        .select('id, titulo, descripcion, video_url, portada_url')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('created_at', { ascending: false })
    return (data || []) as ShowPublico[]
}

export async function listShowsAdminAction() {
    const perm = await requireAdmin()
    if (!perm.ok) return []
    const admin = getAdminClient()
    const { data } = await admin.from('talent_shows').select('*').order('orden', { ascending: true }).order('created_at', { ascending: false })
    return data || []
}

export async function upsertShowAction(payload: { id?: string; titulo: string; descripcion?: string; video_url?: string; portada_url?: string; orden?: number; activo?: boolean }) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    if (!payload.titulo?.trim()) return { success: false, error: 'Falta el título' }
    const admin = getAdminClient()
    const row = {
        titulo: payload.titulo.trim(),
        descripcion: payload.descripcion?.trim() || null,
        video_url: payload.video_url?.trim() || null,
        portada_url: payload.portada_url?.trim() || null,
        orden: Number(payload.orden) || 0,
        activo: payload.activo !== false,
    }
    const { error } = payload.id
        ? await admin.from('talent_shows').update(row).eq('id', payload.id)
        : await admin.from('talent_shows').insert(row)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function toggleShowActivoAction(id: string, activo: boolean) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talent_shows').update({ activo }).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function eliminarShowAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { data: s } = await admin.from('talent_shows').select('portada_url').eq('id', id).single()
    const { error } = await admin.from('talent_shows').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    const path = s?.portada_url?.split('/talent/')[1]
    if (path) await admin.storage.from('talent').remove([decodeURIComponent(path)])
    return { success: true }
}

// ============================================================================
// OBRAS — castings de obras/producciones con flyer o video + requisitos
// ============================================================================
export type ObraPublica = {
    id: string
    titulo: string
    descripcion: string | null
    requisitos: string | null
    ubicacion: string | null
    flyer_url: string | null
    video_url: string | null
    fecha_limite: string | null
    slug: string
}

export async function getObrasActivasAction(): Promise<ObraPublica[]> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_obras')
        .select('id, titulo, descripcion, requisitos, ubicacion, flyer_url, video_url, fecha_limite, slug')
        .eq('activa', true)
        .order('created_at', { ascending: false })
    return (data || []) as ObraPublica[]
}

export async function getObraBySlugAction(slug: string): Promise<ObraPublica | null> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_obras')
        .select('id, titulo, descripcion, requisitos, ubicacion, flyer_url, video_url, fecha_limite, slug')
        .eq('slug', slug)
        .eq('activa', true)
        .maybeSingle()
    return (data as ObraPublica) || null
}

export async function crearPostulacionObraAction(payload: {
    obraId: string
    nombre: string
    email: string
    telefono?: string
    rubro?: string
    descripcion?: string
    edad?: number
    altura?: number
    nacionalidad?: string
    sexo?: string
    fotos?: string[]
    videos?: string[]
}) {
    if (!payload.nombre?.trim()) return { success: false, error: 'Falta tu nombre completo.' }
    if (!payload.email?.trim()) return { success: false, error: 'Falta tu email.' }

    const fotos = (payload.fotos || []).filter(Boolean).slice(0, 3)
    const videos = (payload.videos || []).map(v => v?.trim()).filter(Boolean).slice(0, 3)
    if (!fotos.length) return { success: false, error: 'Subi al menos una foto.' }

    const admin = getAdminClient()
    const { data: obra } = await admin.from('talent_obras').select('id, activa').eq('id', payload.obraId).maybeSingle()
    if (!obra) return { success: false, error: 'La obra no existe.' }
    if (!obra.activa) return { success: false, error: 'Esta convocatoria ya está cerrada.' }

    const { error } = await admin.from('talent_obra_postulaciones').insert({
        obra_id: payload.obraId,
        nombre: payload.nombre.trim(),
        email: payload.email.trim(),
        telefono: payload.telefono?.trim() || null,
        rubro: payload.rubro?.trim() || null,
        descripcion: payload.descripcion?.trim() || null,
        edad: payload.edad ? Number(payload.edad) : null,
        altura: payload.altura ? Number(payload.altura) : null,
        nacionalidad: payload.nacionalidad?.trim() || null,
        sexo: payload.sexo || null,
        fotos, videos, estado: 'pendiente'
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// --- Admin ---
export async function listObrasAdminAction() {
    const perm = await requireAdmin()
    if (!perm.ok) return []
    const admin = getAdminClient()
    const { data } = await admin.from('talent_obras').select('*').order('activa', { ascending: false }).order('created_at', { ascending: false })
    return data || []
}

export async function upsertObraAction(payload: {
    id?: string
    titulo: string
    descripcion?: string
    requisitos?: string
    ubicacion?: string
    flyer_url?: string
    video_url?: string
    fecha_limite?: string | null
    activa?: boolean
}) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    if (!payload.titulo?.trim()) return { success: false, error: 'Falta el título' }
    const admin = getAdminClient()
    const row: Record<string, unknown> = {
        titulo: payload.titulo.trim(),
        descripcion: payload.descripcion?.trim() || null,
        requisitos: payload.requisitos?.trim() || null,
        ubicacion: payload.ubicacion?.trim() || null,
        flyer_url: payload.flyer_url?.trim() || null,
        video_url: payload.video_url?.trim() || null,
        fecha_limite: payload.fecha_limite || null,
        activa: payload.activa !== false,
    }
    if (!payload.id) row.slug = generarSlug(payload.titulo)
    const { error } = payload.id
        ? await admin.from('talent_obras').update(row).eq('id', payload.id)
        : await admin.from('talent_obras').insert(row)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function toggleObraActivaAction(id: string, activa: boolean) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talent_obras').update({ activa }).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function eliminarObraAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { data: o } = await admin.from('talent_obras').select('flyer_url').eq('id', id).maybeSingle()
    const { error } = await admin.from('talent_obras').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    const path = o?.flyer_url?.split('/talent/')[1]
    if (path) await admin.storage.from('talent').remove([decodeURIComponent(path)])
    return { success: true }
}

export async function listPostulacionesObraAction(obraId: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return []
    const admin = getAdminClient()
    const { data } = await admin.from('talent_obra_postulaciones').select('*').eq('obra_id', obraId)
        .order('estado', { ascending: true }).order('created_at', { ascending: false })
    return data || []
}

export async function cambiarEstadoPostObraAction(id: string, estado: 'pendiente' | 'standby' | 'descartado') {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talent_obra_postulaciones').update({ estado }).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function eliminarPostObraAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { data: p } = await admin.from('talent_obra_postulaciones').select('fotos').eq('id', id).single()
    const { error } = await admin.from('talent_obra_postulaciones').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    const paths = (p?.fotos || []).map((u: string) => u?.split('/talent/')[1]).filter(Boolean).map((x: string) => decodeURIComponent(x))
    if (paths.length) await admin.storage.from('talent').remove(paths)
    return { success: true }
}

// ============================================================================
// BÚSQUEDAS PERSONALIZADAS (audiciones / castings)
// ============================================================================

export type BusquedaPublica = {
    id: string
    titulo: string
    descripcion: string | null
    requisitos: string | null
    ubicacion: string | null
    categoria: string | null
    fecha_limite: string | null
    slug: string
    activa: boolean
}

function generarSlug(titulo: string): string {
    return titulo.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        + '-' + Math.random().toString(36).slice(2, 6)
}

// Devuelve TODAS las búsquedas (activas primero, luego cerradas) para la portada:
// las cerradas se muestran con cartel "Cerrada" para mantener el interés.
export async function getBusquedasActivasAction(): Promise<BusquedaPublica[]> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_busquedas')
        .select('id, titulo, descripcion, requisitos, ubicacion, categoria, fecha_limite, slug, activa')
        .order('activa', { ascending: false })
        .order('created_at', { ascending: false })
    return (data || []) as BusquedaPublica[]
}

export async function getBusquedaBySlugAction(slug: string): Promise<BusquedaPublica | null> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_busquedas')
        .select('id, titulo, descripcion, requisitos, ubicacion, categoria, fecha_limite, slug, activa')
        .eq('slug', slug)
        .eq('activa', true)
        .maybeSingle()
    return (data as BusquedaPublica) || null
}

// ============================================================================
// VISTA SELECCIONADORES — link público anonimizado para pasar al cliente/casting.
// Solo muestra material artístico. NUNCA sale del server el apellido completo,
// el email ni el teléfono del postulante.
// ============================================================================
export type BusquedaSeleccion = {
    titulo: string
    ubicacion: string | null
    categoria: string | null
    descripcion: string | null
    requisitos: string | null
    postulantes: {
        id: string               // id real (uuid, sin PII) — para marcar preselección
        codigo: string           // referencia estable p/ que el cliente diga "me interesa el AB12"
        nombre: string           // enmascarado: "Melina G."
        rubro: string | null
        edad: number | null
        altura: number | null
        nacionalidad: string | null
        sexo: string | null
        descripcion: string | null
        fotos: string[]
        videos: string[]
        preseleccionado: boolean
        contactoLiberado: boolean
        // Contacto: SOLO si Piso 2 lo liberó para este candidato. Si no, null.
        email: string | null
        telefono: string | null
    }[]
}

// "Melina Gómez Pérez" -> "Melina P."  |  "Melina" -> "Melina"
function enmascararNombre(full: string): string {
    const parts = (full || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'Anónimo'
    if (parts.length === 1) return parts[0]
    const inicial = parts[parts.length - 1][0]?.toUpperCase() || ''
    return `${parts[0]} ${inicial}.`
}

export async function getBusquedaSeleccionAction(slug: string): Promise<BusquedaSeleccion | null> {
    const admin = getAdminClient()
    const { data: b } = await admin
        .from('talent_busquedas')
        .select('id, titulo, ubicacion, categoria, descripcion, requisitos')
        .eq('slug', slug)
        .maybeSingle()
    if (!b) return null

    const { data: posts } = await admin
        .from('talent_busqueda_postulaciones')
        .select('id, nombre, rubro, edad, altura, nacionalidad, sexo, descripcion, fotos, videos, estado, created_at, preseleccionado, contacto_liberado, email, telefono')
        .eq('busqueda_id', b.id)
        .neq('estado', 'descartado')   // el seleccionador no ve los descartados
        .order('created_at', { ascending: true })

    const postulantes = (posts || []).map((p: any) => ({
        id: p.id,
        codigo: String(p.id).replace(/-/g, '').slice(0, 4).toUpperCase(),
        nombre: enmascararNombre(p.nombre),
        rubro: p.rubro,
        edad: p.edad,
        altura: p.altura,
        nacionalidad: p.nacionalidad,
        sexo: p.sexo,
        descripcion: p.descripcion,
        fotos: p.fotos || [],
        videos: p.videos || [],
        preseleccionado: !!p.preseleccionado,
        contactoLiberado: !!p.contacto_liberado,
        // Contacto liberado por Piso 2 → recién ahí se comparte. Si no, null.
        email: p.contacto_liberado ? (p.email || null) : null,
        telefono: p.contacto_liberado ? (p.telefono || null) : null,
    }))

    return {
        titulo: b.titulo,
        ubicacion: b.ubicacion,
        categoria: b.categoria,
        descripcion: b.descripcion,
        requisitos: b.requisitos,
        postulantes,
    }
}

// Marca/desmarca la preselección (⭐) de un candidato desde el link de selección.
// Sin login: el acceso lo da el link de la búsqueda (verificamos que el candidato
// pertenezca a esa búsqueda por slug).
export async function togglePreseleccionBusquedaAction(slug: string, postulacionId: string, valor: boolean) {
    const admin = getAdminClient()
    const { data: b } = await admin.from('talent_busquedas').select('id').eq('slug', slug).maybeSingle()
    if (!b) return { success: false, error: 'Búsqueda no encontrada.' }
    const { data: p } = await admin.from('talent_busqueda_postulaciones').select('id').eq('id', postulacionId).eq('busqueda_id', b.id).maybeSingle()
    if (!p) return { success: false, error: 'Candidato no encontrado.' }
    const { error } = await admin.from('talent_busqueda_postulaciones').update({
        preseleccionado: valor,
        preseleccionado_at: valor ? new Date().toISOString() : null,
    }).eq('id', postulacionId)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// Piso 2 (admin) libera / oculta el contacto de un candidato. Solo con contacto
// liberado el seleccionador ve email/teléfono en el link de selección.
export async function toggleContactoLiberadoBusquedaAction(id: string, valor: boolean) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talent_busqueda_postulaciones').update({
        contacto_liberado: valor,
        contacto_liberado_at: valor ? new Date().toISOString() : null,
    }).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// ============================================================================
// PERFIL DE TALENTO + firma del acuerdo (requisito para postularse a búsquedas)
// ============================================================================
export type PerfilEstado = { existe: boolean; id: string | null; nombre: string | null; completo: boolean }

export async function getPerfilEstadoAction(email: string): Promise<PerfilEstado> {
    const e = (email || '').trim().toLowerCase()
    if (!e) return { existe: false, id: null, nombre: null, completo: false }
    const admin = getAdminClient()
    const { data } = await admin.from('talent_perfiles').select('id, nombre, completo').eq('email', e).maybeSingle()
    if (!data) return { existe: false, id: null, nombre: null, completo: false }
    return { existe: true, id: data.id, nombre: data.nombre, completo: !!data.completo }
}

const HOST_STREAMING = /(youtube\.com|youtu\.be|vimeo\.com|instagram\.com|tiktok\.com|facebook\.com|fb\.watch)/i
function videoDescargable(url: string): boolean {
    const u = (url || '').trim()
    if (!u || HOST_STREAMING.test(u)) return false
    return /^https?:\/\//i.test(u)
}

export async function guardarPerfilTalentoAction(payload: {
    email: string; nombre: string; dni?: string; telefono?: string; disciplina?: string
    sexo?: string; edad?: number; altura?: number; nacionalidad?: string
    residenteArgentina: boolean; direccion?: string; descripcion?: string
    fotoCuerpoEntero: string; fotoPrimerPlano: string; fotoPlanoAmericano: string; fotosExtra?: string[]
    videos: string[]
    acuerdoAceptado: boolean; firmaUrl: string; firmaAclaracion: string; firmaDni: string
    representanteNombre?: string; representanteDni?: string; firmaUbicacion?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
    const admin = getAdminClient()
    const email = (payload.email || '').trim().toLowerCase()
    if (!email) return { success: false, error: 'Falta el email.' }
    if (!payload.nombre?.trim()) return { success: false, error: 'Falta el nombre.' }
    if (!payload.fotoCuerpoEntero || !payload.fotoPrimerPlano || !payload.fotoPlanoAmericano)
        return { success: false, error: 'Faltan las 3 fotos requeridas (cuerpo entero, primer plano y plano americano).' }
    const videos = (payload.videos || []).map(v => v.trim()).filter(Boolean)
    if (videos.length < 3) return { success: false, error: 'Cargá 3 videos (links de Google Drive o archivos subidos).' }
    if (videos.some(v => !videoDescargable(v))) return { success: false, error: 'Los videos deben ser descargables (Google Drive o archivo subido). No se aceptan links de YouTube ni de streaming.' }
    if (!payload.acuerdoAceptado) return { success: false, error: 'Tenés que aceptar el acuerdo.' }
    if (!payload.firmaUrl) return { success: false, error: 'Falta tu firma.' }
    if (!payload.firmaAclaracion?.trim() || !payload.firmaDni?.trim()) return { success: false, error: 'Completá la aclaración (nombre) y el DNI de la firma.' }

    const row: any = {
        email, nombre: payload.nombre.trim(), dni: payload.dni?.trim() || null,
        telefono: payload.telefono?.trim() || null, disciplina: payload.disciplina?.trim() || null,
        sexo: payload.sexo || null, edad: payload.edad ?? null, altura: payload.altura ?? null,
        nacionalidad: payload.nacionalidad?.trim() || (payload.residenteArgentina ? 'Argentina' : null),
        reside_argentina: payload.residenteArgentina, direccion: payload.direccion?.trim() || null,
        descripcion: payload.descripcion?.trim() || null,
        foto_cuerpo_entero: payload.fotoCuerpoEntero, foto_primer_plano: payload.fotoPrimerPlano,
        foto_plano_americano: payload.fotoPlanoAmericano, fotos_extra: payload.fotosExtra || [],
        videos,
        acuerdo_version: payload.residenteArgentina ? 'residente' : 'no_residente',
        acuerdo_aceptado: true, firma_url: payload.firmaUrl,
        firma_aclaracion: payload.firmaAclaracion.trim(), firma_dni: payload.firmaDni.trim(),
        representante_nombre: payload.representanteNombre?.trim() || null,
        representante_dni: payload.representanteDni?.trim() || null,
        firma_fecha: new Date().toISOString(), firma_ubicacion: payload.firmaUbicacion?.trim() || null,
        completo: true, updated_at: new Date().toISOString(),
    }

    const { data: existente } = await admin.from('talent_perfiles').select('id').eq('email', email).maybeSingle()
    if (existente?.id) {
        const { error } = await admin.from('talent_perfiles').update(row).eq('id', existente.id)
        if (error) return { success: false, error: error.message }
        return { success: true, id: existente.id }
    }
    const { data, error } = await admin.from('talent_perfiles').insert(row).select('id').single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: data.id }
}

export async function postularConPerfilAction(busquedaId: string, perfilId: string): Promise<{ success: boolean; error?: string }> {
    const admin = getAdminClient()
    const { data: bus } = await admin.from('talent_busquedas').select('id, activa').eq('id', busquedaId).maybeSingle()
    if (!bus) return { success: false, error: 'La búsqueda no existe.' }
    if (!bus.activa) return { success: false, error: 'Esta búsqueda ya está cerrada.' }
    const { data: p } = await admin.from('talent_perfiles').select('*').eq('id', perfilId).maybeSingle()
    if (!p) return { success: false, error: 'Perfil no encontrado.' }
    if (!p.completo || !p.acuerdo_aceptado) return { success: false, error: 'Tu perfil no está completo o no firmaste el acuerdo.' }

    const { data: yaExiste } = await admin.from('talent_busqueda_postulaciones').select('id').eq('busqueda_id', busquedaId).eq('perfil_id', perfilId).maybeSingle()
    if (yaExiste) return { success: false, error: 'Ya te postulaste a esta búsqueda.' }

    const fotos = [p.foto_cuerpo_entero, p.foto_primer_plano, p.foto_plano_americano, ...(p.fotos_extra || [])].filter(Boolean)
    const { error } = await admin.from('talent_busqueda_postulaciones').insert({
        busqueda_id: busquedaId, perfil_id: perfilId,
        nombre: p.nombre, email: p.email, telefono: p.telefono, rubro: p.disciplina,
        descripcion: p.descripcion, edad: p.edad, altura: p.altura, nacionalidad: p.nacionalidad,
        sexo: p.sexo, fotos, videos: p.videos || [],
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function crearPostulacionBusquedaAction(payload: {
    busquedaId: string
    nombre: string
    email: string
    telefono?: string
    rubro?: string
    descripcion?: string
    edad?: number
    altura?: number
    nacionalidad?: string
    sexo?: string
    fotos?: string[]
    videos?: string[]
}) {
    if (!payload.nombre?.trim()) return { success: false, error: 'Falta tu nombre completo.' }
    if (!payload.email?.trim()) return { success: false, error: 'Falta tu email.' }

    const fotos = (payload.fotos || []).filter(Boolean).slice(0, 6)
    const videos = (payload.videos || []).map(v => v?.trim()).filter(Boolean).slice(0, 3)
    if (!fotos.length) return { success: false, error: 'Subi al menos una foto.' }

    const admin = getAdminClient()

    const { data: busqueda } = await admin.from('talent_busquedas').select('id, activa').eq('id', payload.busquedaId).maybeSingle()
    if (!busqueda) return { success: false, error: 'La busqueda no existe.' }
    if (!busqueda.activa) return { success: false, error: 'Esta busqueda ya esta cerrada.' }

    const { error } = await admin.from('talent_busqueda_postulaciones').insert({
        busqueda_id: payload.busquedaId,
        nombre: payload.nombre.trim(),
        email: payload.email.trim(),
        telefono: payload.telefono?.trim() || null,
        rubro: payload.rubro?.trim() || null,
        descripcion: payload.descripcion?.trim() || null,
        edad: payload.edad ? Number(payload.edad) : null,
        altura: payload.altura ? Number(payload.altura) : null,
        nacionalidad: payload.nacionalidad?.trim() || null,
        sexo: payload.sexo || null,
        fotos,
        videos,
        estado: 'pendiente'
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// ============================================================================
// Agregar a una búsqueda un talento YA existente (de la vitrina o de una
// postulación general), para que el cliente lo vea sin que la persona se
// tenga que postular de nuevo a esa búsqueda.
// ============================================================================
export type TalentoParaBusqueda = {
    origen: 'vitrina' | 'postulacion'
    refId: string
    nombre: string
    rubro: string | null
    edad: number | null
    altura: number | null
    nacionalidad: string | null
    sexo: string | null
    descripcion: string | null
    fotos: string[]
    videos: string[]
}

export async function listTalentosParaBusquedaAction(): Promise<TalentoParaBusqueda[]> {
    const perm = await requireAdmin()
    if (!perm.ok) return []
    const admin = getAdminClient()

    const [tal, post] = await Promise.all([
        admin.from('talentos')
            .select('id, nombre, disciplina, edad, altura, nacionalidad, categoria, bio, fotos, videos')
            .eq('activo', true)
            .order('nombre', { ascending: true }),
        admin.from('talent_postulaciones')
            .select('id, nombre, rubro, edad, altura, nacionalidad, sexo, descripcion, fotos, videos, foto_url, video_url, estado')
            .neq('estado', 'descartado')
            .order('created_at', { ascending: false }),
    ])

    const deVitrina: TalentoParaBusqueda[] = (tal.data || []).map((t: any) => ({
        origen: 'vitrina',
        refId: t.id,
        nombre: t.nombre,
        rubro: t.disciplina,
        edad: t.edad,
        altura: t.altura,
        nacionalidad: t.nacionalidad,
        sexo: ['mujeres', 'varones'].includes(t.categoria) ? t.categoria : null,
        descripcion: t.bio,
        fotos: t.fotos || [],
        videos: t.videos || [],
    }))

    const dePostulacion: TalentoParaBusqueda[] = (post.data || []).map((p: any) => ({
        origen: 'postulacion',
        refId: p.id,
        nombre: p.nombre,
        rubro: p.rubro,
        edad: p.edad,
        altura: p.altura,
        nacionalidad: p.nacionalidad,
        sexo: p.sexo,
        descripcion: p.descripcion,
        fotos: (p.fotos && p.fotos.length) ? p.fotos : (p.foto_url ? [p.foto_url] : []),
        videos: (p.videos && p.videos.length) ? p.videos : (p.video_url ? [p.video_url] : []),
    }))

    return [...deVitrina, ...dePostulacion]
}

export async function agregarTalentoABusquedaAction(busquedaId: string, origen: 'vitrina' | 'postulacion', refId: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()

    // Traemos el perfil origen
    let row: any = null
    if (origen === 'vitrina') {
        const { data } = await admin.from('talentos')
            .select('nombre, disciplina, edad, altura, nacionalidad, categoria, bio, fotos, videos')
            .eq('id', refId).maybeSingle()
        if (data) row = {
            nombre: data.nombre, rubro: data.disciplina, edad: data.edad, altura: data.altura,
            nacionalidad: data.nacionalidad, sexo: ['mujeres', 'varones'].includes(data.categoria) ? data.categoria : null,
            descripcion: data.bio, fotos: data.fotos || [], videos: data.videos || [],
        }
    } else {
        const { data } = await admin.from('talent_postulaciones')
            .select('nombre, rubro, edad, altura, nacionalidad, sexo, descripcion, fotos, videos, foto_url, video_url, user_id')
            .eq('id', refId).maybeSingle()
        if (data) {
            // El contacto vive en el perfil del usuario que se postuló (no en la postulación).
            let email: string | null = null, telefono: string | null = null
            if (data.user_id) {
                const { data: prof } = await admin.from('profiles').select('email, telefono').eq('id', data.user_id).maybeSingle()
                email = prof?.email || null; telefono = prof?.telefono || null
            }
            row = {
                nombre: data.nombre, rubro: data.rubro, edad: data.edad, altura: data.altura,
                nacionalidad: data.nacionalidad, sexo: data.sexo, descripcion: data.descripcion,
                fotos: (data.fotos && data.fotos.length) ? data.fotos : (data.foto_url ? [data.foto_url] : []),
                videos: (data.videos && data.videos.length) ? data.videos : (data.video_url ? [data.video_url] : []),
                email, telefono,
            }
        }
    }
    if (!row) return { success: false, error: 'No se encontró el perfil.' }

    // Evitar duplicados dentro de la misma búsqueda (por nombre)
    const { data: existentes } = await admin.from('talent_busqueda_postulaciones')
        .select('nombre').eq('busqueda_id', busquedaId)
    const yaEsta = (existentes || []).some((e: any) => (e.nombre || '').trim().toLowerCase() === (row.nombre || '').trim().toLowerCase())
    if (yaEsta) return { success: false, error: `"${row.nombre}" ya está en esta búsqueda.` }

    const { error } = await admin.from('talent_busqueda_postulaciones').insert({
        busqueda_id: busquedaId,
        nombre: row.nombre,
        email: row.email || null,
        telefono: row.telefono || null,
        rubro: row.rubro || null,
        descripcion: row.descripcion || null,
        edad: row.edad,
        altura: row.altura,
        nacionalidad: row.nacionalidad || null,
        sexo: row.sexo || null,
        fotos: row.fotos,
        videos: row.videos,
        estado: 'pendiente',
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// --- Admin ---

export async function listBusquedasAdminAction() {
    const perm = await requireAdmin()
    if (!perm.ok) return []
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_busquedas')
        .select('*')
        .order('activa', { ascending: false })
        .order('created_at', { ascending: false })
    return data || []
}

export async function upsertBusquedaAction(payload: {
    id?: string
    titulo: string
    descripcion?: string
    requisitos?: string
    ubicacion?: string
    categoria?: string | null
    fecha_limite?: string | null
    activa?: boolean
}) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    if (!payload.titulo?.trim()) return { success: false, error: 'Falta el titulo' }

    const admin = getAdminClient()
    const row: Record<string, unknown> = {
        titulo: payload.titulo.trim(),
        descripcion: payload.descripcion?.trim() || null,
        requisitos: payload.requisitos?.trim() || null,
        ubicacion: payload.ubicacion?.trim() || null,
        categoria: payload.categoria || null,
        fecha_limite: payload.fecha_limite || null,
        activa: payload.activa !== false,
    }

    if (!payload.id) {
        row.slug = generarSlug(payload.titulo)
    }

    const { error } = payload.id
        ? await admin.from('talent_busquedas').update(row).eq('id', payload.id)
        : await admin.from('talent_busquedas').insert(row)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function toggleBusquedaActivaAction(id: string, activa: boolean) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talent_busquedas').update({ activa }).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function eliminarBusquedaAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talent_busquedas').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function listPostulacionesBusquedaAction(busquedaId: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return []
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_busqueda_postulaciones')
        .select('*')
        .eq('busqueda_id', busquedaId)
        .order('estado', { ascending: true })
        .order('created_at', { ascending: false })
    const posts = data || []
    // Adjuntar el acuerdo firmado del perfil vinculado (si postuló con perfil).
    const perfilIds = [...new Set(posts.map((p: any) => p.perfil_id).filter(Boolean))]
    if (perfilIds.length) {
        const { data: perfiles } = await admin.from('talent_perfiles')
            .select('id, acuerdo_version, acuerdo_aceptado, firma_url, firma_aclaracion, firma_dni, firma_fecha, firma_ubicacion, dni, direccion, representante_nombre, representante_dni, reside_argentina')
            .in('id', perfilIds)
        const map: Record<string, any> = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p]))
        return posts.map((p: any) => ({ ...p, perfil: p.perfil_id ? (map[p.perfil_id] || null) : null }))
    }
    return posts
}

export async function cambiarEstadoPostBusquedaAction(id: string, estado: 'pendiente' | 'standby' | 'descartado') {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('talent_busqueda_postulaciones').update({ estado }).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function eliminarPostBusquedaAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { data: p } = await admin.from('talent_busqueda_postulaciones').select('fotos').eq('id', id).single()
    const { error } = await admin.from('talent_busqueda_postulaciones').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    const paths = (p?.fotos || []).map((u: string) => u?.split('/talent/')[1]).filter(Boolean).map((x: string) => decodeURIComponent(x))
    if (paths.length) await admin.storage.from('talent').remove(paths)
    return { success: true }
}

export async function aceptarPostBusquedaAction(id: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()

    const { data: p } = await admin.from('talent_busqueda_postulaciones').select('*').eq('id', id).single()
    if (!p) return { success: false, error: 'La postulacion no existe' }

    const categoria = ['mujeres', 'varones'].includes(p.sexo) ? p.sexo : 'mujeres'
    const fotos = (p.fotos && p.fotos.length) ? p.fotos : []
    const videos = (p.videos && p.videos.length) ? p.videos : []
    const { error: e1 } = await admin.from('talentos').insert({
        nombre: p.nombre,
        categoria,
        disciplina: p.rubro,
        bio: p.descripcion,
        fotos,
        videos,
        video_url: videos[0] || null,
        edad: p.edad,
        altura: p.altura,
        nacionalidad: p.nacionalidad,
        destacado: false,
        activo: true,
        orden: 0
    })
    if (e1) return { success: false, error: e1.message }

    await admin.from('talent_busqueda_postulaciones').update({ estado: 'standby' }).eq('id', id)
    return { success: true }
}

// ============================================================================
// CARGA INICIAL DEL PANEL — una sola action, autentica 1 vez y trae todo en
// paralelo (evita la cola de 4 server actions serializadas al montar).
// ============================================================================
export async function getTalentDashboardDataAction() {
    const perm = await requireAdmin()
    if (!perm.ok) return { talentos: [], marcas: [], postulaciones: [], busquedas: [], shows: [], obras: [] }
    const admin = getAdminClient()
    const [talentos, marcas, postulaciones, busquedas, shows, obras] = await Promise.all([
        admin.from('talentos').select('*')
            .order('categoria', { ascending: true }).order('destacado', { ascending: false })
            .order('orden', { ascending: true }).order('nombre', { ascending: true }),
        admin.from('talent_marcas').select('*')
            .order('orden', { ascending: true }).order('nombre', { ascending: true }),
        admin.from('talent_postulaciones').select('*')
            .order('estado', { ascending: true }).order('created_at', { ascending: false }),
        admin.from('talent_busquedas').select('*')
            .order('activa', { ascending: false }).order('created_at', { ascending: false }),
        admin.from('talent_shows').select('*')
            .order('orden', { ascending: true }).order('created_at', { ascending: false }),
        admin.from('talent_obras').select('*')
            .order('activa', { ascending: false }).order('created_at', { ascending: false }),
    ])
    return {
        talentos: talentos.data || [],
        marcas: marcas.data || [],
        postulaciones: await adjuntarTelefonoPerfil(admin, postulaciones.data || []),
        busquedas: busquedas.data || [],
        shows: shows.data || [],
        obras: obras.data || [],
    }
}
