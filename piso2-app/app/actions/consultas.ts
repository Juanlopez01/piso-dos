'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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

// Envía un mensaje al contacto vía la API de ManyChat (llega a su DM de IG/WhatsApp).
// Requiere env MANYCHAT_API_KEY. Devuelve { ok, error }.
async function enviarPorManyChat(subscriberId: string, texto: string, canal = 'instagram'): Promise<{ ok: boolean; error?: string }> {
    const key = process.env.MANYCHAT_API_KEY
    if (!key) return { ok: false, error: 'Falta configurar MANYCHAT_API_KEY.' }
    if (!subscriberId) return { ok: false, error: 'La consulta no tiene ID de contacto (respondé desde ManyChat).' }
    try {
        const tipo = canal === 'whatsapp' ? 'whatsapp' : 'instagram'
        const resp = await fetch('https://api.manychat.com/fb/sending/sendContent', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // Sin message_tag (HUMAN_AGENT no está soportado): envío estándar,
                // válido dentro de las 24hs del último mensaje de la persona.
                subscriber_id: /^\d+$/.test(subscriberId) ? Number(subscriberId) : subscriberId,
                data: { version: 'v2', content: { type: tipo, messages: [{ type: 'text', text: texto }] } },
            }),
        })
        const json: any = await resp.json().catch(() => ({}))
        if (!resp.ok || json?.status === 'error') {
            return { ok: false, error: json?.message || json?.details || `ManyChat respondió ${resp.status}` }
        }
        return { ok: true }
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Error al enviar por ManyChat' }
    }
}

export async function getConsultasAction(soloPendientes = true) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, error: perm.error, consultas: [] as any[] }

    const admin = getAdminClient()
    let q = admin.from('asistente_consultas')
        .select('id, created_at, canal, contacto_nombre, contacto_usuario, subscriber_id, consulta, estado, resuelta_at')
        .order('created_at', { ascending: false }).limit(200)
    if (soloPendientes) q = q.eq('estado', 'pendiente')
    const { data: consultas } = await q

    const ids = (consultas || []).map((c: any) => c.id)
    let mensajes: any[] = []
    if (ids.length) {
        const { data } = await admin.from('asistente_consulta_mensajes')
            .select('consulta_id, de, texto, created_at').in('consulta_id', ids).order('created_at')
        mensajes = data || []
    }
    const conHilo = (consultas || []).map((c: any) => ({
        ...c, mensajes: mensajes.filter(m => m.consulta_id === c.id),
    }))
    return { ok: true, consultas: conHilo }
}

export async function responderConsultaAction(consultaId: string, texto: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, error: perm.error }
    if (!texto?.trim()) return { ok: false, error: 'Escribí una respuesta.' }

    const admin = getAdminClient()
    const { data: consulta } = await admin.from('asistente_consultas')
        .select('id, subscriber_id, canal').eq('id', consultaId).single()
    if (!consulta) return { ok: false, error: 'Consulta no encontrada.' }

    // 1. Enviar al DM del contacto vía ManyChat
    const envio = await enviarPorManyChat(consulta.subscriber_id, texto.trim(), consulta.canal)
    if (!envio.ok) return { ok: false, error: envio.error }

    // 2. Guardar en el hilo + tocar la consulta
    await admin.from('asistente_consulta_mensajes').insert({
        consulta_id: consultaId, de: 'recep', texto: texto.trim(), autor_id: perm.userId,
    })
    await admin.from('asistente_consultas').update({ updated_at: new Date().toISOString() }).eq('id', consultaId)
    return { ok: true }
}

export async function marcarResueltaAction(consultaId: string, resuelta = true) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('asistente_consultas').update({
        estado: resuelta ? 'resuelta' : 'pendiente',
        resuelta_at: resuelta ? new Date().toISOString() : null,
        resuelta_por: resuelta ? perm.userId : null,
    }).eq('id', consultaId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
}
