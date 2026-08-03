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
}

function generarSlug(titulo: string): string {
    return titulo.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        + '-' + Math.random().toString(36).slice(2, 6)
}

export async function getBusquedasActivasAction(): Promise<BusquedaPublica[]> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_busquedas')
        .select('id, titulo, descripcion, requisitos, ubicacion, categoria, fecha_limite, slug')
        .eq('activa', true)
        .order('created_at', { ascending: false })
    return (data || []) as BusquedaPublica[]
}

export async function getBusquedaBySlugAction(slug: string): Promise<BusquedaPublica | null> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talent_busquedas')
        .select('id, titulo, descripcion, requisitos, ubicacion, categoria, fecha_limite, slug')
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
        .select('id, nombre, rubro, edad, altura, nacionalidad, sexo, descripcion, fotos, videos, estado, created_at')
        .eq('busqueda_id', b.id)
        .neq('estado', 'descartado')   // el seleccionador no ve los descartados
        .order('created_at', { ascending: true })

    const postulantes = (posts || []).map((p: any) => ({
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

    const fotos = (payload.fotos || []).filter(Boolean).slice(0, 3)
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
    return data || []
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
    if (!perm.ok) return { talentos: [], marcas: [], postulaciones: [], busquedas: [] }
    const admin = getAdminClient()
    const [talentos, marcas, postulaciones, busquedas] = await Promise.all([
        admin.from('talentos').select('*')
            .order('categoria', { ascending: true }).order('destacado', { ascending: false })
            .order('orden', { ascending: true }).order('nombre', { ascending: true }),
        admin.from('talent_marcas').select('*')
            .order('orden', { ascending: true }).order('nombre', { ascending: true }),
        admin.from('talent_postulaciones').select('*')
            .order('estado', { ascending: true }).order('created_at', { ascending: false }),
        admin.from('talent_busquedas').select('*')
            .order('activa', { ascending: false }).order('created_at', { ascending: false }),
    ])
    return {
        talentos: talentos.data || [],
        marcas: marcas.data || [],
        postulaciones: postulaciones.data || [],
        busquedas: busquedas.data || [],
    }
}
