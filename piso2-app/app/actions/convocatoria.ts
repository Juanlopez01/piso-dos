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
    videos?: string[]; imagenes?: string[]
}) {
    if (!payload.titulo?.trim()) return { ok: false as const, error: 'Poné el nombre de la obra.' }
    if (!payload.email?.includes('@') && !payload.telefono?.trim()) return { ok: false as const, error: 'Dejanos un email o teléfono de contacto.' }
    const admin = getAdminClient()
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
    })
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
    return { ok: true as const, propuestas: (data || []) as any[], esAdmin: perm.rol === 'admin' }
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
        }).select('id').single()
        if (ev?.id) patch.evento_id = ev.id
    }

    const { error } = await admin.from('obra_propuestas').update(patch).eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, eventoId: patch.evento_id || p.evento_id || null }
}

export async function eliminarPropuestaAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('obra_propuestas').delete().eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}
