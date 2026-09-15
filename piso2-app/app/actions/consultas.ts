'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { responderAsistente } from '@/app/actions/_asistente-core'

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
async function enviarPorManyChat(subscriberId: string, texto: string, canal = 'instagram', imagenUrl?: string): Promise<{ ok: boolean; error?: string }> {
    const key = process.env.MANYCHAT_API_KEY
    if (!key) return { ok: false, error: 'Falta configurar MANYCHAT_API_KEY.' }
    if (!subscriberId) return { ok: false, error: 'La consulta no tiene ID de contacto (respondé desde ManyChat).' }
    try {
        const tipo = canal === 'whatsapp' ? 'whatsapp' : 'instagram'
        const mensajes = imagenUrl
            ? [{ type: 'image', url: imagenUrl }]
            : [{ type: 'text', text: texto }]
        const resp = await fetch('https://api.manychat.com/fb/sending/sendContent', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // Sin message_tag (HUMAN_AGENT no está soportado): envío estándar,
                // válido dentro de las 24hs del último mensaje de la persona.
                subscriber_id: /^\d+$/.test(subscriberId) ? Number(subscriberId) : subscriberId,
                data: { version: 'v2', content: { type: tipo, messages: mensajes } },
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

// ============================================================================
// FICHA DEL ALUMNO EN EL CHAT — matchear el contacto con un perfil y mostrar
// créditos / deudas / packs / próximas clases al lado de la conversación.
// ============================================================================

// Busca perfiles por nombre, email o teléfono (para vincular a mano).
export async function buscarPerfilesAction(q: string): Promise<{ ok: boolean; perfiles: any[] }> {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, perfiles: [] }
    const term = (q || '').trim()
    if (term.length < 2) return { ok: true, perfiles: [] }
    const admin = getAdminClient()
    const soloDigitos = term.replace(/\D/g, '')
    let query = admin.from('profiles').select('id, nombre_completo, email, telefono').limit(8)
    if (soloDigitos.length >= 6) {
        query = query.ilike('telefono', `%${soloDigitos.slice(-8)}%`)
    } else {
        query = query.or(`nombre_completo.ilike.%${term}%,email.ilike.%${term}%`)
    }
    const { data } = await query
    return { ok: true, perfiles: data || [] }
}

// Devuelve el perfil vinculado a un contacto (si ya se vinculó antes).
export async function getVinculoContactoAction(subscriberId: string): Promise<{ ok: boolean; perfilId: string | null }> {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, perfilId: null }
    if (!subscriberId) return { ok: true, perfilId: null }
    const admin = getAdminClient()
    const { data } = await admin.from('asistente_contacto_perfil').select('perfil_id').eq('subscriber_id', subscriberId).maybeSingle()
    return { ok: true, perfilId: data?.perfil_id || null }
}

export async function vincularContactoAction(subscriberId: string, canal: string, perfilId: string): Promise<{ ok: boolean; error?: string }> {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, error: perm.error }
    if (!subscriberId || !perfilId) return { ok: false, error: 'Faltan datos.' }
    const admin = getAdminClient()
    const { error } = await admin.from('asistente_contacto_perfil').upsert({
        subscriber_id: subscriberId, canal, perfil_id: perfilId, vinculado_por: perm.userId, created_at: new Date().toISOString(),
    }, { onConflict: 'subscriber_id' })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
}

export async function desvincularContactoAction(subscriberId: string): Promise<{ ok: boolean }> {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false }
    const admin = getAdminClient()
    await admin.from('asistente_contacto_perfil').delete().eq('subscriber_id', subscriberId)
    return { ok: true }
}

// Ficha resumida del alumno: créditos, packs (con deuda), próximas clases.
export async function getFichaAlumnoAction(perfilId: string): Promise<{ ok: boolean; ficha?: any; error?: string }> {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, error: perm.error }
    if (!perfilId) return { ok: false, error: 'Falta el alumno.' }
    const admin = getAdminClient()

    const { data: p } = await admin.from('profiles')
        .select('id, nombre_completo, email, telefono, creditos_regulares, creditos_especiales')
        .eq('id', perfilId).maybeSingle()
    if (!p) return { ok: false, error: 'Perfil no encontrado.' }

    const [{ data: pases }, { data: packs }, { data: insc }] = await Promise.all([
        admin.from('pases_exclusivos').select('pase_referencia, cantidad').eq('usuario_id', perfilId).gt('cantidad', 0),
        admin.from('alumno_packs').select('id, tipo_clase, creditos_restantes, cantidad_inicial, precio_total, monto_abonado, estado, fecha_compra, producto:productos(nombre)').eq('user_id', perfilId).order('fecha_compra', { ascending: false }).limit(12),
        admin.from('inscripciones').select('clase_id, clase:clases(nombre, inicio, cancelada)').eq('user_id', perfilId).limit(200),
    ])

    const ahora = Date.now()
    const packsResumen = (packs || [])
        .map((pk: any) => {
            const total = Number(pk.precio_total ?? pk.monto_abonado) || 0
            const deuda = Math.max(0, total - (Number(pk.monto_abonado) || 0))
            const nombre = Array.isArray(pk.producto) ? pk.producto[0]?.nombre : pk.producto?.nombre
            return { nombre: nombre || `Pack ${pk.tipo_clase}`, restantes: pk.creditos_restantes, inicial: pk.cantidad_inicial, deuda, estado: pk.estado }
        })
        .filter((pk: any) => pk.restantes > 0 || pk.deuda > 0)
    const deudaTotal = packsResumen.reduce((s: number, pk: any) => s + pk.deuda, 0)

    const proximas = (insc || [])
        .map((i: any) => (Array.isArray(i.clase) ? i.clase[0] : i.clase))
        .filter((c: any) => c && !c.cancelada && new Date(c.inicio).getTime() >= ahora)
        .sort((a: any, b: any) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
        .slice(0, 6)
        .map((c: any) => ({ nombre: c.nombre, inicio: c.inicio }))

    return {
        ok: true,
        ficha: {
            id: p.id,
            nombre: p.nombre_completo,
            email: p.email,
            telefono: p.telefono,
            creditos: {
                regulares: p.creditos_regulares || 0,
                especiales: p.creditos_especiales || 0,
                pases: (pases || []).map((x: any) => ({ referencia: x.pase_referencia, cantidad: x.cantidad })),
            },
            packs: packsResumen,
            deudaTotal,
            proximas,
        },
    }
}

// Borrador sugerido por la IA: usa el mismo cerebro del bot sobre la
// conversación para dejar escrita una respuesta que recep edita y envía.
export async function sugerirRespuestaAction(consultaId: string): Promise<{ ok: boolean; texto?: string; error?: string }> {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, error: perm.error }
    const admin = getAdminClient()
    const { data: msgs } = await admin.from('asistente_consulta_mensajes')
        .select('de, texto, created_at').eq('consulta_id', consultaId).order('created_at')
    const historial = (msgs || []).map((m: any) => ({ de: m.de as string, texto: m.texto as string }))

    // La pregunta = último mensaje del usuario; si no hay, la consulta original.
    const ultimoUsuario = [...(msgs || [])].reverse().find((m: any) => m.de === 'usuario')
    let pregunta = ultimoUsuario?.texto || ''
    if (!pregunta) {
        const { data: c } = await admin.from('asistente_consultas').select('consulta').eq('id', consultaId).maybeSingle()
        pregunta = c?.consulta || ''
    }
    if (!pregunta) return { ok: false, error: 'No hay una pregunta para sugerir una respuesta.' }

    // Historial sin el último mensaje (que es la pregunta actual).
    const hist = historial.slice(0, Math.max(0, historial.length - 1))
    try {
        const r = await responderAsistente(pregunta, hist)
        return { ok: true, texto: r.respuesta }
    } catch (e: any) {
        return { ok: false, error: e?.message || 'No se pudo generar la sugerencia.' }
    }
}

// Conteo liviano de consultas pendientes (para el contador del menú, polleado).
export async function getConsultasPendientesCountAction(): Promise<{ ok: boolean; count: number }> {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, count: 0 }
    const admin = getAdminClient()
    const { count } = await admin.from('asistente_consultas')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente')
    return { ok: true, count: count || 0 }
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

    // 3. HAND-OFF: respondió un humano → pausamos el bot para ese contacto por un
    //    rato (rolling), así no le pisa la conversación a la recep.
    if (consulta.subscriber_id) {
        const PAUSA_HORAS = 24
        await admin.from('asistente_pausa').upsert({
            subscriber_id: consulta.subscriber_id,
            pausado_hasta: new Date(Date.now() + PAUSA_HORAS * 3600_000).toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'subscriber_id' })
    }
    return { ok: true }
}

// Envía una IMAGEN al contacto (ya subida a Storage; recibimos la URL pública).
export async function responderImagenAction(consultaId: string, imagenUrl: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, error: perm.error }
    if (!imagenUrl) return { ok: false, error: 'Falta la imagen.' }

    const admin = getAdminClient()
    const { data: consulta } = await admin.from('asistente_consultas')
        .select('id, subscriber_id, canal').eq('id', consultaId).single()
    if (!consulta) return { ok: false, error: 'Consulta no encontrada.' }

    const envio = await enviarPorManyChat(consulta.subscriber_id, '', consulta.canal, imagenUrl)
    if (!envio.ok) return { ok: false, error: envio.error }

    // Guardamos el mensaje (el texto es la URL; el panel la muestra como imagen).
    await admin.from('asistente_consulta_mensajes').insert({
        consulta_id: consultaId, de: 'recep', texto: imagenUrl, autor_id: perm.userId,
    })
    await admin.from('asistente_consultas').update({ updated_at: new Date().toISOString() }).eq('id', consultaId)

    // Mismo hand-off que al responder texto: pausamos el bot 24hs.
    if (consulta.subscriber_id) {
        await admin.from('asistente_pausa').upsert({
            subscriber_id: consulta.subscriber_id,
            pausado_hasta: new Date(Date.now() + 24 * 3600_000).toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'subscriber_id' })
    }
    return { ok: true }
}

// Reactiva el bot para un contacto (saca la pausa manualmente).
export async function reactivarBotAction(subscriberId: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false, error: perm.error }
    const admin = getAdminClient()
    await admin.from('asistente_pausa').delete().eq('subscriber_id', subscriberId)
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
        admin.from('asistente_historial').select('subscriber_id, canal, de, texto, created_at').gte('created_at', desde),
        admin.from('asistente_consultas').select('subscriber_id, canal, estado, created_at').gte('created_at', desde),
    ])
    const H = (hist || []) as any[], C = (cons || []) as any[]

    // Desglose por canal (Instagram vs WhatsApp).
    const porCanal = (['instagram', 'whatsapp'] as const).map(cn => {
        const hc = H.filter(m => m.canal === cn)
        const contactosC = new Set(hc.map(m => m.subscriber_id).filter(Boolean))
        const mensajesC = hc.filter(m => m.de === 'usuario').length
        const derivadosC = new Set(C.filter(c => c.canal === cn).map(c => c.subscriber_id).filter(Boolean).filter((s: string) => contactosC.has(s)))
        return { canal: cn, contactos: contactosC.size, mensajes: mensajesC, derivados: derivadosC.size }
    })
    const usuarioMsgs = H.filter(m => m.de === 'usuario')
    const contactos = new Set(H.map(m => m.subscriber_id).filter(Boolean))
    // Solo derivaciones de contactos que efectivamente chatearon (mismo universo),
    // para que el % quede acotado 0–100 (evita >100% con consultas viejas sin historial).
    const derivados = new Set(C.map(c => c.subscriber_id).filter(Boolean).filter((s: string) => contactos.has(s)))
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
        totales: { contactos: contactos.size, mensajesUsuario: usuarioMsgs.length, consultas: C.length, derivados: derivados.size, pendientes, resueltas, pctDerivado },
        porCanal, porDia, porHora, temas,
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
    // Traemos los 300 MÁS RECIENTES (desc + limit) y los devolvemos en orden
    // cronológico. Antes traía los 300 más viejos → en contactos muy charlatanes
    // se perdían los mensajes recientes.
    const { data } = await admin.from('asistente_historial')
        .select('de, texto, created_at').eq('subscriber_id', subscriberId)
        .order('created_at', { ascending: false }).limit(300)
    return { ok: true as const, mensajes: ((data || []) as any[]).reverse() }
}

// ============================================================================
// BASE DE CONOCIMIENTO DEL ASISTENTE (la carga el equipo desde /consultas)
//  - 'info'         → dato/contexto que el bot debe saber (se inyecta a la IA)
//  - 'no_responder' → tema del que el bot NO habla (deriva al equipo)
// ============================================================================
export async function getConocimientoAction() {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, items: [] as any[] }
    const admin = getAdminClient()
    const { data } = await admin.from('asistente_conocimiento')
        .select('id, tipo, texto, activo, created_at').order('created_at', { ascending: false })
    return { ok: true as const, items: (data || []) as any[] }
}

export async function guardarConocimientoAction(input: { id?: string; tipo: 'info' | 'no_responder' | 'respuesta'; texto: string }) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const texto = (input.texto || '').trim()
    if (!texto) return { ok: false as const, error: 'Escribí el texto.' }
    if (!['info', 'no_responder', 'respuesta'].includes(input.tipo)) return { ok: false as const, error: 'Tipo inválido.' }
    const admin = getAdminClient()
    if (input.id) {
        const { error } = await admin.from('asistente_conocimiento').update({ tipo: input.tipo, texto }).eq('id', input.id)
        if (error) return { ok: false as const, error: error.message }
    } else {
        const { error } = await admin.from('asistente_conocimiento').insert({ tipo: input.tipo, texto, created_by: perm.userId })
        if (error) return { ok: false as const, error: error.message }
    }
    return { ok: true as const }
}

export async function toggleConocimientoAction(id: string, activo: boolean) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('asistente_conocimiento').update({ activo }).eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}

export async function eliminarConocimientoAction(id: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('asistente_conocimiento').delete().eq('id', id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
}
