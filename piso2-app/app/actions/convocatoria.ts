'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// ============================================================================
// PISO2E · Fase 1 — Convocatoria de obras + curaduría.
// ============================================================================
const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const ROLES_STAFF = ['admin', 'recepcion']
async function requireStaff() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false as const, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !ROLES_STAFF.includes(perfil.rol)) return { ok: false as const, error: 'Sin permisos' }
    return { ok: true as const, userId: session.user.id, rol: perfil.rol as string }
}

// ---- Público: proponer una obra ----
export async function crearPropuestaObraAction(payload: {
    titulo: string; director?: string; compania?: string; tipo_obra?: string
    participantes?: number; duracion_min?: number; descripcion?: string
    instagram?: string; email?: string; telefono?: string
    videos?: string[]; imagenes?: string[]; convocatoria_id?: string
}) {
    if (!payload.titulo?.trim()) return { ok: false as const, error: 'Poné el nombre de la obra.' }
    if (!payload.email?.includes('@') && !payload.telefono?.trim()) return { ok: false as const, error: 'Dejanos un email o teléfono de contacto.' }
    // Obligatorios: al menos 1 foto (flyer) y 1 video.
    if (!(payload.imagenes || []).filter(Boolean).length) return { ok: false as const, error: 'Subí al menos una foto de la obra (flyer).' }
    if (!(payload.videos || []).filter(Boolean).length) return { ok: false as const, error: 'Dejá al menos un link de video.' }
    const admin = getAdminClient()

    // Si viene atada a un ciclo, validamos que exista y esté abierto.
    let convocatoriaId: string | null = null
    if (payload.convocatoria_id) {
        const { data: c } = await admin.from('convocatorias').select('id, activa, fecha_limite').eq('id', payload.convocatoria_id).maybeSingle()
        if (!c || !cicloAbierto(c)) return { ok: false as const, error: 'Esta convocatoria ya está cerrada.' }
        convocatoriaId = c.id
    }

    const { error } = await admin.from('obra_propuestas').insert({
        titulo: payload.titulo.trim(),
        director: payload.director?.trim() || null,
        compania: payload.compania?.trim() || null,
        tipo_obra: payload.tipo_obra || null,
        participantes: payload.participantes ?? null,
        duracion_min: payload.duracion_min ?? null,
        descripcion: payload.descripcion?.trim() || null,
        instagram: payload.instagram?.trim() || null,
        email: payload.email?.trim() || null,
        telefono: payload.telefono?.trim() || null,
        videos: (payload.videos || []).filter(Boolean),
        imagenes: (payload.imagenes || []).filter(Boolean),
        convocatoria_id: convocatoriaId,
    })
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Ciclos / búsquedas puntuales ----
// Un ciclo está "abierto" si está activo y (sin fecha límite o la fecha no pasó).
function cicloAbierto(c: { activa: boolean; fecha_limite: string | null }) {
    if (!c.activa) return false
    if (!c.fecha_limite) return true
    // Comparación por fecha ART (inclusive del día límite).
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    return c.fecha_limite >= hoy
}

function slugify(s: string) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ciclo'
}

// Público: trae un ciclo por slug (para el form dirigido).
export async function getConvocatoriaBySlugAction(slug: string) {
    const admin = getAdminClient()
    const { data: c } = await admin.from('convocatorias')
        .select('id, titulo, descripcion, activa, fecha_limite, slug, flyer_url').eq('slug', slug).maybeSingle()
    if (!c) return null
    return { ...c, abierta: cicloAbierto(c) }
}

// Público: lista los ciclos abiertos (para mostrarlos en la convocatoria general).
export async function getCiclosActivosAction() {
    const admin = getAdminClient()
    const { data } = await admin.from('convocatorias')
        .select('id, titulo, descripcion, slug, activa, fecha_limite').eq('activa', true).order('created_at', { ascending: false })
    return (data || []).filter((c: any) => cicloAbierto(c))
}

// Admin: todos los ciclos.
export async function getConvocatoriasAction() {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, ciclos: [] as any[] }
    const admin = getAdminClient()
    const { data } = await admin.from('convocatorias')
        .select('id, titulo, descripcion, slug, activa, fecha_limite, flyer_url, created_at').order('created_at', { ascending: false })
    const ciclos = (data || []).map((c: any) => ({ ...c, abierta: cicloAbierto(c) }))
    return { ok: true as const, ciclos }
}

export async function crearConvocatoriaAction(data: { titulo: string; descripcion?: string; fecha_limite?: string; flyer_url?: string }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.titulo?.trim()) return { ok: false as const, error: 'Poné un título al ciclo.' }
    const admin = getAdminClient()
    const base = slugify(data.titulo)
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
    const { error } = await admin.from('convocatorias').insert({
        titulo: data.titulo.trim(),
        descripcion: data.descripcion?.trim() || null,
        fecha_limite: data.fecha_limite || null,
        flyer_url: data.flyer_url?.trim() || null,
        slug,
        created_by: perm.userId,
    })
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, slug }
}

export async function toggleConvocatoriaActivaAction(id: string, activa: boolean) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('convocatorias').update({ activa: !!activa }).eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarConvocatoriaAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    // Las propuestas ya recibidas quedan (convocatoria_id pasa a null por el FK).
    const { error } = await admin.from('convocatorias').delete().eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Admin: curaduría ----
export async function getPropuestasObraAction() {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, propuestas: [] as any[], esAdmin: false }
    const admin = getAdminClient()
    let q = admin.from('obra_propuestas').select('*').order('created_at', { ascending: false })
    // Las rechazadas ("no aprobadas") quedan reservadas SOLO para admin.
    if (perm.rol !== 'admin') q = q.neq('estado', 'rechazada')
    const { data } = await q
    const propuestas = (data || []) as any[]

    // Adjuntamos el título del ciclo al que pertenece cada propuesta (si tiene).
    const cicloIds = [...new Set(propuestas.map(p => p.convocatoria_id).filter(Boolean))]
    if (cicloIds.length) {
        const { data: ciclos } = await admin.from('convocatorias').select('id, titulo').in('id', cicloIds)
        const titulo: Record<string, string> = {}
        for (const c of (ciclos || []) as any[]) titulo[c.id] = c.titulo
        for (const p of propuestas) p.convocatoria_titulo = p.convocatoria_id ? (titulo[p.convocatoria_id] || null) : null
    }
    return { ok: true as const, propuestas, esAdmin: perm.rol === 'admin' }
}

export async function curarPropuestaAction(id: string, decision: 'aceptada' | 'rechazada', nota?: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { data: p } = await admin.from('obra_propuestas').select('*').eq('id', id).maybeSingle()
    if (!p) return { ok: false as const, error: 'Propuesta no encontrada.' }

    const patch: any = { estado: decision, nota_curaduria: nota?.trim() || null, curada_at: new Date().toISOString(), curada_por: perm.userId }

    // Al ACEPTAR se abre la "función": creamos el evento (borrador) con los datos ya cargados.
    if (decision === 'aceptada' && !p.evento_id) {
        const desc = [p.descripcion, p.director ? `Dirección: ${p.director}` : '', p.compania ? `Compañía: ${p.compania}` : '', p.duracion_min ? `Duración: ${p.duracion_min} min` : '']
            .filter(Boolean).join('\n')
        const { data: ev } = await admin.from('eventos').insert({
            nombre: p.titulo, descripcion: desc || null, estado: 'borrador', created_by: perm.userId,
            flyer_url: (p.imagenes || [])[0] || null, // primera foto de la obra = flyer del evento
        }).select('id').single()
        if (ev?.id) patch.evento_id = ev.id
    }

    const { error } = await admin.from('obra_propuestas').update(patch).eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, eventoId: patch.evento_id || p.evento_id || null }
}

// ---- Varias obras en un evento ----
// Un evento (función) puede juntar más de una obra aprobada (un programa).
// Las obras se vinculan por obra_propuestas.evento_id.

export async function getObrasDeEventoAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, obras: [] as any[] }
    const admin = getAdminClient()
    const { data } = await admin.from('obra_propuestas')
        .select('id, titulo, director, compania, duracion_min, imagenes')
        .eq('evento_id', eventoId).eq('estado', 'aceptada').order('created_at')
    return { ok: true as const, obras: (data || []) as any[] }
}

// Obras aceptadas que se pueden sumar (no están ya en este evento).
export async function getObrasAceptadasDisponiblesAction(eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, obras: [] as any[] }
    const admin = getAdminClient()
    const { data } = await admin.from('obra_propuestas')
        .select('id, titulo, compania, evento_id')
        .eq('estado', 'aceptada').order('created_at', { ascending: false })
    const obras = (data || []).filter((o: any) => o.evento_id !== eventoId)
    return { ok: true as const, obras }
}

export async function vincularObraAEventoAction(propuestaId: string, eventoId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    // Si la obra tenía su propio evento auto-creado y quedó vacío (sin entradas ni
    // ventas, en borrador), lo limpiamos para no dejar funciones huérfanas.
    const { data: obra } = await admin.from('obra_propuestas').select('evento_id').eq('id', propuestaId).maybeSingle()
    const anterior = obra?.evento_id
    const { error } = await admin.from('obra_propuestas').update({ evento_id: eventoId }).eq('id', propuestaId)
    if (error) return { ok: false as const, error: error.message }
    if (anterior && anterior !== eventoId) {
        const [{ count: ents }, { count: vts }, { data: evPrev }] = await Promise.all([
            admin.from('evento_entradas').select('id', { count: 'exact', head: true }).eq('evento_id', anterior),
            admin.from('evento_ventas').select('id', { count: 'exact', head: true }).eq('evento_id', anterior),
            admin.from('eventos').select('estado, ciclo_id').eq('id', anterior).maybeSingle(),
        ])
        const { count: otras } = await admin.from('obra_propuestas').select('id', { count: 'exact', head: true }).eq('evento_id', anterior)
        if ((ents || 0) === 0 && (vts || 0) === 0 && (otras || 0) === 0 && evPrev?.estado === 'borrador' && !evPrev?.ciclo_id) {
            await admin.from('eventos').delete().eq('id', anterior)
        }
    }
    return { ok: true as const }
}

export async function desvincularObraAction(propuestaId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('obra_propuestas').update({ evento_id: null }).eq('id', propuestaId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarPropuestaAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('obra_propuestas').delete().eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}
