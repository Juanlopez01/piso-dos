'use server'

// ============================================================================
// CRM del asistente (embudo). La lista de leads se DERIVA de las conversaciones
// (asistente_historial + asistente_consultas) y se cruza con la capa editable
// crm_leads (etapa, producto, estilo, profe, notas). Todo se completa solo a
// medida que llegan las consultas; recep corrige/anota al finalizar.
// ============================================================================

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { calcAlerta } from '@/lib/crm'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const ROLES_STAFF = ['admin', 'recepcion', 'auxiliar']
async function requireStaff() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false as const, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !ROLES_STAFF.includes(perfil.rol)) return { ok: false as const, error: 'Sin permisos' }
    return { ok: true as const, userId: session.user.id }
}

export type CrmLead = {
    subscriber_id: string
    canal: string | null
    nombre: string | null
    instagram: string | null
    whatsapp: string | null
    mail: string | null
    perfil_id: string | null
    perfil_nombre: string | null
    etapa: string
    producto: string | null
    estilo: string | null
    profe: string | null
    notas: string | null
    ultimoAt: string | null
    mensajes: number
    derivada: boolean
    alerta: 'ok' | 'seguir' | 'urgente'
    diasSinContacto: number
}

// Lista de leads del embudo: contactos reales (de las conversaciones) + overlay CRM.
export async function getCrmLeadsAction(dias = 120) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, leads: [] as CrmLead[] }
    const admin = getAdminClient()
    const desde = new Date(Date.now() - dias * 86400_000).toISOString()

    const [{ data: hist }, { data: cons }, { data: overlay }, { data: vinc }] = await Promise.all([
        admin.from('asistente_historial').select('subscriber_id, canal, de, texto, created_at').gte('created_at', desde).order('created_at', { ascending: true }),
        admin.from('asistente_consultas').select('subscriber_id, contacto_nombre, contacto_usuario, estado, canal, created_at'),
        admin.from('crm_leads').select('*'),
        admin.from('asistente_contacto_perfil').select('subscriber_id, perfil_id'),
    ])

    // Alumno vinculado por contacto (reusa el vínculo que ya usa la bandeja/ficha).
    const perfilDe: Record<string, string> = {}
    for (const v of (vinc || []) as any[]) if (v.subscriber_id && v.perfil_id) perfilDe[v.subscriber_id] = v.perfil_id
    const perfilIds = [...new Set(Object.values(perfilDe))]
    const nombrePerfil: Record<string, string> = {}
    if (perfilIds.length) {
        const { data: perfiles } = await admin.from('profiles').select('id, nombre_completo').in('id', perfilIds)
        for (const p of (perfiles || []) as any[]) nombrePerfil[p.id] = p.nombre_completo || ''
    }

    // Datos de contacto derivados de las consultas (nombre/usuario/canal/pendiente).
    const info: Record<string, { nombre?: string; usuario?: string; canal?: string; derivada?: boolean; pendiente?: boolean }> = {}
    for (const c of (cons || []) as any[]) {
        if (!c.subscriber_id) continue
        const prev = info[c.subscriber_id] || {}
        info[c.subscriber_id] = {
            nombre: prev.nombre || c.contacto_nombre,
            usuario: prev.usuario || c.contacto_usuario,
            canal: prev.canal || c.canal,
            derivada: true,
            pendiente: prev.pendiente || c.estado === 'pendiente',
        }
    }

    // Contactos que efectivamente chatearon (fuente principal de la lista).
    const map: Record<string, any> = {}
    for (const m of (hist || []) as any[]) {
        const k = m.subscriber_id; if (!k) continue
        if (!map[k]) map[k] = { subscriber_id: k, canal: m.canal || info[k]?.canal || null, mensajes: 0, ultimoAt: m.created_at }
        if (m.de === 'usuario') map[k].mensajes++
        map[k].ultimoAt = m.created_at
    }

    const ov: Record<string, any> = {}
    for (const o of (overlay || []) as any[]) ov[o.subscriber_id] = o
    // Incluimos también leads guardados aunque no tengan historial reciente.
    for (const o of (overlay || []) as any[]) {
        if (!map[o.subscriber_id]) map[o.subscriber_id] = { subscriber_id: o.subscriber_id, canal: o.canal, mensajes: 0, ultimoAt: o.ultimo_contacto || o.updated_at }
    }

    const leads: CrmLead[] = Object.values(map).map((b: any) => {
        const o = ov[b.subscriber_id] || {}
        const i = info[b.subscriber_id] || {}
        const etapa = o.etapa || 'nuevo'
        const ultimoAt = b.ultimoAt || o.ultimo_contacto || null
        const a = calcAlerta(ultimoAt, etapa)
        return {
            subscriber_id: b.subscriber_id,
            canal: b.canal || o.canal || i.canal || null,
            nombre: o.nombre || i.nombre || null,
            instagram: o.instagram || i.usuario || null,
            whatsapp: o.whatsapp || null,
            mail: o.mail || null,
            perfil_id: perfilDe[b.subscriber_id] || o.perfil_id || null,
            perfil_nombre: perfilDe[b.subscriber_id] ? (nombrePerfil[perfilDe[b.subscriber_id]] || null) : null,
            etapa,
            producto: o.producto || null,
            estilo: o.estilo || null,
            profe: o.profe || null,
            notas: o.notas || null,
            ultimoAt,
            mensajes: b.mensajes || 0,
            derivada: !!i.derivada,
            alerta: a.nivel,
            diasSinContacto: a.dias,
        }
    })

    // Orden: primero los más urgentes de seguir, luego por actividad reciente.
    const rank = { urgente: 0, seguir: 1, ok: 2 } as Record<string, number>
    leads.sort((x, y) => (rank[x.alerta] - rank[y.alerta]) || ((x.ultimoAt || '') < (y.ultimoAt || '') ? 1 : -1))
    return { ok: true as const, leads }
}

// Guarda/actualiza la capa CRM de un contacto (upsert por subscriber_id).
export async function guardarLeadAction(subscriberId: string, patch: {
    canal?: string | null; nombre?: string | null; whatsapp?: string | null; instagram?: string | null; mail?: string | null;
    perfil_id?: string | null; etapa?: string; producto?: string | null; estilo?: string | null; profe?: string | null;
    notas?: string | null; ultimo_contacto?: string | null; proximo_contacto?: string | null;
}) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!subscriberId) return { ok: false as const, error: 'Falta el contacto' }
    const admin = getAdminClient()
    const row: any = { subscriber_id: subscriberId, updated_at: new Date().toISOString() }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) row[k] = v
    const { error } = await admin.from('crm_leads').upsert(row, { onConflict: 'subscriber_id' })
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

// Marca la consulta como resuelta Y guarda la ficha del CRM en un solo paso
// (lo que dispara el "cartelito" al finalizar).
export async function finalizarConsultaCrmAction(consultaId: string, subscriberId: string | null, patch: Parameters<typeof guardarLeadAction>[1]) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    if (consultaId) {
        await admin.from('asistente_consultas').update({
            estado: 'resuelta', resuelta_at: new Date().toISOString(), resuelta_por: perm.userId,
        }).eq('id', consultaId)
    }
    if (subscriberId) {
        const row: any = { subscriber_id: subscriberId, ultimo_contacto: new Date().toISOString(), updated_at: new Date().toISOString() }
        for (const [k, v] of Object.entries(patch || {})) if (v !== undefined) row[k] = v
        const { error } = await admin.from('crm_leads').upsert(row, { onConflict: 'subscriber_id' })
        if (error) return { ok: false as const, error: error.message }
    }
    return { ok: true as const }
}

// Resumen del chat + sugerencias de CRM (producto/estilo/profe) con IA.
// Best-effort: si no hay OPENAI_API_KEY, devuelve un resumen simple del chat.
export async function resumirChatCrmAction(subscriberId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    if (!subscriberId) return { ok: false as const, error: 'Falta el contacto' }
    const admin = getAdminClient()
    const { data } = await admin.from('asistente_historial')
        .select('de, texto, created_at').eq('subscriber_id', subscriberId)
        .order('created_at', { ascending: false }).limit(40)
    const msgs = ((data || []) as any[]).reverse().filter(m => (m.texto || '').trim())

    const fallback = () => {
        const delUsuario = msgs.filter(m => m.de === 'usuario').map(m => m.texto)
        return delUsuario.slice(-6).join(' · ').slice(0, 400)
    }

    const key = process.env.OPENAI_API_KEY
    if (!key || !msgs.length) {
        return { ok: true as const, resumen: fallback(), producto: '', estilo: '', profe: '' }
    }
    try {
        const conversacion = msgs.map(m => `${m.de === 'usuario' ? 'Cliente' : (m.de === 'recep' ? 'Recepción' : 'Bot')}: ${m.texto}`).join('\n').slice(0, 6000)
        const sys = `Sos analista de un CRM de un estudio de danza (Piso 2). Te paso una conversación de Instagram/WhatsApp entre un prospecto y el estudio. Devolvé SOLO un JSON con:
- "resumen": 1 a 3 frases, en español rioplatense, con lo importante para recepción (qué pidió, qué se le pasó, qué quedó pendiente).
- "producto": el interés principal, ELEGÍ UNO de: "Clases regulares", "Alquiler salas", "Clase especial", "Clases NG", "La Liga", "IA", "Compañías / Grupos", "Formaciones", "Otro". Si no está claro, "".
- "estilo": estilo/ritmo de danza mencionado (ej "Jazz", "Contemporáneo", "Heels"), o "".
- "profe": nombre del profe mencionado, o "".
No inventes datos que no estén en la charla. Devolvé solo el JSON.`
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                temperature: 0.2,
                response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: sys }, { role: 'user', content: conversacion }],
            }),
        })
        if (!resp.ok) return { ok: true as const, resumen: fallback(), producto: '', estilo: '', profe: '' }
        const json: any = await resp.json().catch(() => null)
        const raw = json?.choices?.[0]?.message?.content || '{}'
        let parsed: any = {}
        try { parsed = JSON.parse(raw) } catch { parsed = {} }
        return {
            ok: true as const,
            resumen: (parsed.resumen || fallback() || '').toString().slice(0, 500),
            producto: (parsed.producto || '').toString(),
            estilo: (parsed.estilo || '').toString(),
            profe: (parsed.profe || '').toString(),
        }
    } catch {
        return { ok: true as const, resumen: fallback(), producto: '', estilo: '', profe: '' }
    }
}
