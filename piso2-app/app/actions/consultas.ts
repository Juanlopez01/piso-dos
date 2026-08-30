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

// ============================================================================
// CRM del asistente: métricas + historial por contacto (usa asistente_historial)
// ============================================================================
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const msART = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000) // fecha en ART
const diaKey = (iso: string) => { const d = msART(iso); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

function clasificarTema(t: string): string {
    const q = norm(t)
    if (/(alquil|reserv|\bsala\b)/.test(q)) return 'Alquiler'
    if (/(formacion|curso|carrera|profesorado)/.test(q)) return 'Formaciones'
    if (/(anot|inscrib|sumar|empezar|probar)/.test(q)) return 'Inscripción'
    if (/(precio|cuanto|cuesta|vale|sale|pack|abono|tarifa|cuota|valor)/.test(q)) return 'Precios'
    if (/(donde|direccion|ubicacion|\bsede\b|como llego)/.test(q)) return 'Ubicación'
    if (/(pag|transferencia|mercado|efectivo|tarjeta)/.test(q)) return 'Pagos'
    if (/(clase|horario|profe|jazz|ballet|heels|reggaeton|contempo|hoy|manana|semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)/.test(q)) return 'Clases'
    return 'Otros'
}

export async function getAsistenteStatsAction(dias = 30) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const desde = new Date(Date.now() - dias * 86400_000).toISOString()
    const [{ data: hist }, { data: cons }] = await Promise.all([
        admin.from('asistente_historial').select('subscriber_id, de, texto, created_at').gte('created_at', desde),
        admin.from('asistente_consultas').select('subscriber_id, estado, created_at').gte('created_at', desde),
    ])
    const H = (hist || []) as any[], C = (cons || []) as any[]
    const usuarioMsgs = H.filter(m => m.de === 'usuario')
    const contactos = new Set(H.map(m => m.subscriber_id).filter(Boolean))
    const derivados = new Set(C.map(c => c.subscriber_id).filter(Boolean))
    const pendientes = C.filter(c => c.estado === 'pendiente').length
    const resueltas = C.filter(c => c.estado === 'resuelta').length
    const pctDerivado = contactos.size ? Math.round((derivados.size / contactos.size) * 100) : 0

    const nDias = Math.min(dias, 14)
    const claves: string[] = []
    for (let i = nDias - 1; i >= 0; i--) { const d = new Date(Date.now() - 3 * 3600_000 - i * 86400_000); claves.push(`${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`) }
    const porDia = claves.map(k => ({
        dia: k,
        mensajes: usuarioMsgs.filter(m => diaKey(m.created_at) === k).length,
        consultas: C.filter(c => diaKey(c.created_at) === k).length,
    }))

    const porHora = Array.from({ length: 24 }, (_, h) => ({ h, n: usuarioMsgs.filter(m => msART(m.created_at).getUTCHours() === h).length }))

    const temasMap: Record<string, number> = {}
    for (const m of usuarioMsgs) { const t = clasificarTema(m.texto); temasMap[t] = (temasMap[t] || 0) + 1 }
    const temas = Object.entries(temasMap).map(([tema, n]) => ({ tema, n })).sort((a, b) => b.n - a.n)

    return {
        ok: true as const, dias,
        totales: { contactos: contactos.size, mensajesUsuario: usuarioMsgs.length, consultas: C.length, pendientes, resueltas, pctDerivado },
        porDia, porHora, temas,
    }
}

export async function getContactosAction(dias = 30) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, contactos: [] as any[] }
    const admin = getAdminClient()
    const desde = new Date(Date.now() - dias * 86400_000).toISOString()
    const [{ data: hist }, { data: cons }] = await Promise.all([
        admin.from('asistente_historial').select('subscriber_id, canal, de, texto, created_at').gte('created_at', desde).order('created_at', { ascending: true }),
        admin.from('asistente_consultas').select('subscriber_id, contacto_nombre, contacto_usuario, estado'),
    ])
    const info: Record<string, { nombre?: string; usuario?: string; derivada?: boolean }> = {}
    for (const c of (cons || []) as any[]) {
        if (!c.subscriber_id) continue
        const prev = info[c.subscriber_id] || {}
        info[c.subscriber_id] = { nombre: prev.nombre || c.contacto_nombre, usuario: prev.usuario || c.contacto_usuario, derivada: true }
    }
    const map: Record<string, any> = {}
    for (const m of (hist || []) as any[]) {
        const k = m.subscriber_id; if (!k) continue
        if (!map[k]) map[k] = { subscriber_id: k, canal: m.canal, nombre: info[k]?.nombre || null, usuario: info[k]?.usuario || null, derivada: !!info[k]?.derivada, mensajes: 0, ultimo: '', ultimoAt: m.created_at }
        if (m.de === 'usuario') map[k].mensajes++
        map[k].ultimo = m.texto; map[k].ultimoAt = m.created_at
    }
    const contactos = Object.values(map).sort((a: any, b: any) => (a.ultimoAt < b.ultimoAt ? 1 : -1))
    return { ok: true as const, contactos }
}

export async function getConversacionContactoAction(subscriberId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, mensajes: [] as any[] }
    if (!subscriberId) return { ok: false as const, error: 'Falta el contacto', mensajes: [] as any[] }
    const admin = getAdminClient()
    const { data } = await admin.from('asistente_historial')
        .select('de, texto, created_at').eq('subscriber_id', subscriberId)
        .order('created_at', { ascending: true }).limit(300)
    return { ok: true as const, mensajes: (data || []) as any[] }
}
