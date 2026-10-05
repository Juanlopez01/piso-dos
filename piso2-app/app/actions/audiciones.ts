'use server'

// ============================================================================
// Piso 2 On Tour — audiciones de gira (una sola cosa). Cada audición = ciudad +
// fecha. Los participantes se cargan por un LINK PÚBLICO (se inscriben solos) o
// a mano por el staff de gira. Al seleccionar a alguien se define su DESTINO:
// La Liga (formación del año próximo, con beca / media beca) o Talents (Latin).
// ============================================================================

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const ROLES = ['admin', 'audiciones', 'recepcion']
async function requireStaff() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false as const, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !ROLES.includes(perfil.rol)) return { ok: false as const, error: 'Sin permisos' }
    return { ok: true as const, userId: session.user.id, rol: perfil.rol as string }
}

const nuevoToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2, 8)

export type Tipo = 'latin' | 'liga'
export type Participante = {
    id: string; audicion_id: string; numero: number | null
    nombre: string; instagram: string | null; telefono: string | null; mail: string | null
    fecha_nacimiento: string | null; ciudad_origen: string | null
    resultado: string; presente: boolean; notas: string | null; origen: string; created_at: string
}

// Próximo número de la audición (orden de llegada).
async function siguienteNumero(admin: any, audicionId: string): Promise<number> {
    const { data } = await admin.from('audicion_participantes')
        .select('numero').eq('audicion_id', audicionId)
        .order('numero', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
    return (Number(data?.numero) || 0) + 1
}

// ---- Admin / staff ----
export async function getAudicionesAction() {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, audiciones: [] as any[] }
    const admin = getAdminClient()
    const { data } = await admin.from('audiciones').select('*')
        .order('fecha', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    const ids = (data || []).map((a: any) => a.id)
    const counts: Record<string, number> = {}
    if (ids.length) {
        const { data: parts } = await admin.from('audicion_participantes').select('audicion_id').in('audicion_id', ids)
        for (const p of (parts || []) as any[]) counts[p.audicion_id] = (counts[p.audicion_id] || 0) + 1
    }
    const audiciones = (data || []).map((a: any) => ({ ...a, participantes: counts[a.id] || 0 }))
    return { ok: true as const, audiciones }
}

export async function crearAudicionAction(data: { ciudad: string; lugar?: string; fecha?: string | null }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.ciudad?.trim()) return { ok: false as const, error: 'Poné la ciudad.' }
    const admin = getAdminClient()
    const { data: a, error } = await admin.from('audiciones').insert({
        tipo: 'latin', // columna vestigial (On Tour es una sola cosa)
        ciudad: data.ciudad.trim(), lugar: data.lugar?.trim() || null,
        fecha: data.fecha || null, token: nuevoToken(), created_by: perm.userId,
    }).select('id').single()
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, id: a.id }
}

export async function toggleAudicionEstadoAction(id: string, estado: 'abierta' | 'cerrada') {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('audiciones').update({ estado }).eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarAudicionAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('audiciones').delete().eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function getAudicionAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { data: audicion } = await admin.from('audiciones').select('*').eq('id', id).maybeSingle()
    if (!audicion) return { ok: false as const, error: 'Audición no encontrada' }
    const { data: participantes } = await admin.from('audicion_participantes').select('*')
        .eq('audicion_id', id).order('numero', { ascending: true, nullsFirst: false }).order('created_at')
    return { ok: true as const, audicion, participantes: (participantes || []) as Participante[] }
}

type PatchParticipante = {
    numero?: number | null; nombre?: string; instagram?: string | null; telefono?: string | null; mail?: string | null
    fecha_nacimiento?: string | null; ciudad_origen?: string | null; resultado?: string; presente?: boolean; notas?: string | null
}

export async function agregarParticipanteAction(audicionId: string, data: PatchParticipante) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!data.nombre?.trim()) return { ok: false as const, error: 'Poné el nombre.' }
    const admin = getAdminClient()
    const numero = (data.numero === undefined || data.numero === null) ? await siguienteNumero(admin, audicionId) : data.numero
    const { error } = await admin.from('audicion_participantes').insert({
        audicion_id: audicionId, numero,
        nombre: data.nombre.trim(), instagram: data.instagram?.trim() || null, telefono: data.telefono?.trim() || null,
        mail: data.mail?.trim() || null, fecha_nacimiento: data.fecha_nacimiento || null, ciudad_origen: data.ciudad_origen?.trim() || null,
        notas: data.notas?.trim() || null, origen: 'recep',
    })
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function editarParticipanteAction(id: string, patch: PatchParticipante) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const row: any = {}
    for (const k of ['numero', 'nombre', 'instagram', 'telefono', 'mail', 'fecha_nacimiento', 'ciudad_origen', 'resultado', 'presente', 'notas'] as const) {
        if (patch[k] !== undefined) row[k] = typeof patch[k] === 'string' ? (patch[k] as string).trim() || null : patch[k]
    }
    if (row.nombre === null) return { ok: false as const, error: 'El nombre no puede quedar vacío.' }
    const { error } = await admin.from('audicion_participantes').update(row).eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarParticipanteAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('audicion_participantes').delete().eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// ---- Público (sin login): el participante se inscribe con el link ----
export async function getAudicionPublicaAction(id: string, token: string) {
    const admin = getAdminClient()
    const { data } = await admin.from('audiciones').select('id, tipo, ciudad, lugar, fecha, estado, token').eq('id', id).maybeSingle()
    if (!data || data.token !== token) return { ok: false as const, error: 'Link inválido.' }
    return { ok: true as const, audicion: { tipo: data.tipo, ciudad: data.ciudad, lugar: data.lugar, fecha: data.fecha, estado: data.estado } }
}

export async function inscribirPublicoAction(id: string, token: string, data: {
    nombre: string; instagram?: string; telefono?: string; mail?: string; fecha_nacimiento?: string; ciudad_origen?: string
}) {
    const admin = getAdminClient()
    const { data: a } = await admin.from('audiciones').select('id, token, estado').eq('id', id).maybeSingle()
    if (!a || a.token !== token) return { ok: false as const, error: 'Link inválido.' }
    if (a.estado !== 'abierta') return { ok: false as const, error: 'Las inscripciones de esta audición están cerradas.' }
    if (!data.nombre?.trim()) return { ok: false as const, error: 'Poné tu nombre.' }
    const numero = await siguienteNumero(admin, id)
    const { error } = await admin.from('audicion_participantes').insert({
        audicion_id: id, numero,
        nombre: data.nombre.trim(), instagram: data.instagram?.trim() || null, telefono: data.telefono?.trim() || null,
        mail: data.mail?.trim() || null, fecha_nacimiento: data.fecha_nacimiento || null, ciudad_origen: data.ciudad_origen?.trim() || null,
        origen: 'publico',
    })
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, numero }
}
