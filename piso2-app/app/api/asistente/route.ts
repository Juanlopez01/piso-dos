import { NextRequest, NextResponse, after } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { responderAsistente } from '@/app/actions/_asistente-core'
import { clasificarChatCrm } from '@/lib/crm-ia'

// ============================================================================
// API pública del Asistente — la consume ManyChat (nodo "Acción externa").
// Protegida por token (env ASISTENTE_API_TOKEN). Recibe la pregunta del usuario
// y devuelve { ok, respuesta, derivar }. Cuando derivar=true (la persona pide
// hablar con alguien), guarda la consulta + el contacto en asistente_consultas
// y notifica a recepción/admin.
// ============================================================================

export const dynamic = 'force-dynamic'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

function tokenValido(req: NextRequest, bodyToken?: string): boolean {
    const esperado = process.env.ASISTENTE_API_TOKEN
    if (!esperado) return false
    const auth = req.headers.get('authorization') || ''
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
    const qToken = req.nextUrl.searchParams.get('token') || ''
    return [bearer, qToken, bodyToken].some(t => t && t === esperado)
}

function extraerPregunta(body: any, req: NextRequest): string {
    return (
        body?.pregunta ?? body?.mensaje ?? body?.message ?? body?.text ?? body?.q ??
        req.nextUrl.searchParams.get('q') ?? req.nextUrl.searchParams.get('pregunta') ?? ''
    ).toString()
}

// Historial reciente de un contacto (para dar contexto a la IA y armar el hilo).
// Devuelve en orden cronológico (más viejo → más nuevo).
async function getHistorial(subId: string): Promise<{ de: string; texto: string; created_at: string }[]> {
    try {
        const admin = getAdminClient()
        // Ventana amplia para que el bot NO pierda el contexto de la charla:
        // últimos 7 días y hasta 30 mensajes (antes eran 3hs / 12, se olvidaba
        // apenas la conversación se estiraba o el contacto volvía más tarde).
        const desde = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
        const { data } = await admin.from('asistente_historial')
            .select('de, texto, created_at')
            .eq('subscriber_id', subId).gte('created_at', desde)
            .order('created_at', { ascending: false }).limit(30)
        return (data || []).reverse()
    } catch { return [] }
}

// Registra el turno (mensaje del usuario + respuesta del bot). Best-effort.
// created_at explícito y distinto: el usuario SIEMPRE antes que el bot (si no,
// con timestamps iguales el orden queda indefinido y se lee al revés).
async function logInteraccion(subId: string, canal: string, pregunta: string, respuesta: string) {
    try {
        const admin = getAdminClient()
        const now = Date.now()
        const rows: any[] = []
        if (pregunta?.trim()) rows.push({ subscriber_id: subId, canal, de: 'usuario', texto: pregunta, created_at: new Date(now).toISOString() })
        if (respuesta?.trim()) rows.push({ subscriber_id: subId, canal, de: 'bot', texto: respuesta, created_at: new Date(now + 100).toISOString() })
        if (rows.length) await admin.from('asistente_historial').insert(rows)
    } catch (e: any) {
        console.error('[asistente] no se pudo loguear el historial:', e?.message)
    }
}

// Guarda la consulta derivada + arma el hilo con la conversación previa (contexto
// para recep) + avisa a recep/admin. Best-effort.
// ManyChat manda el literal "{{full_name}}" (o similar) cuando no puede resolver
// la variable. Eso NO es un nombre: lo tratamos como vacío.
function limpioODefault(v: any): string | null {
    const s = (v ?? '').toString().trim()
    if (!s) return null
    if (/\{\{.*\}\}/.test(s)) return null // placeholder de ManyChat sin resolver
    return s
}

async function capturarConsulta(body: any, pregunta: string, subId: string | null, canal: string) {
    try {
        const admin = getAdminClient()
        const nombre = limpioODefault(body?.contacto_nombre)
        const usuario = limpioODefault(body?.contacto_usuario)

        // Si el contacto ya tiene una consulta PENDIENTE, la reusamos (no duplicar):
        // le sumamos al hilo solo los mensajes nuevos y actualizamos el preview.
        if (subId) {
            const { data: existente } = await admin.from('asistente_consultas')
                .select('id').eq('subscriber_id', subId).eq('estado', 'pendiente')
                .order('created_at', { ascending: false }).limit(1).maybeSingle()
            if (existente?.id) {
                const { data: ult } = await admin.from('asistente_consulta_mensajes')
                    .select('created_at').eq('consulta_id', existente.id)
                    .order('created_at', { ascending: false }).limit(1).maybeSingle()
                const desde = ult?.created_at || '1970-01-01T00:00:00Z'
                const historial = await getHistorial(subId)
                const nuevos = historial
                    .filter(h => (h.texto || '').trim() && h.created_at > desde)
                    .map(h => ({ consulta_id: existente.id, de: h.de, texto: h.texto, created_at: h.created_at }))
                if (nuevos.length) await admin.from('asistente_consulta_mensajes').insert(nuevos)
                await admin.from('asistente_consultas').update({ updated_at: new Date().toISOString(), consulta: pregunta || null }).eq('id', existente.id)
                return
            }
        }

        const { data: consulta } = await admin.from('asistente_consultas').insert({
            canal,
            contacto_nombre: nombre,
            contacto_usuario: usuario,
            subscriber_id: subId,
            consulta: pregunta || null,
        }).select('id').single()

        if (consulta?.id) {
            // Hilo = toda la charla previa con el bot (ya incluye el turno actual).
            const historial = subId ? await getHistorial(subId) : []
            const msgs = historial
                .filter(h => (h.texto || '').trim())
                .map(h => ({ consulta_id: consulta.id, de: h.de, texto: h.texto, created_at: h.created_at }))
            if (msgs.length === 0 && pregunta) msgs.push({ consulta_id: consulta.id, de: 'usuario', texto: pregunta } as any)
            if (msgs.length) await admin.from('asistente_consulta_mensajes').insert(msgs)
        }

        // Notificar a admin + recepción (campanita)
        const { data: staff } = await admin.from('profiles').select('id').in('rol', ['admin', 'recepcion'])
        if (staff?.length) {
            const quien = nombre || usuario || 'Alguien'
            await admin.from('notificaciones').insert(staff.map((s: any) => ({
                usuario_id: s.id,
                titulo: '🙋 Nueva consulta del asistente',
                mensaje: `${quien} dejó una consulta (${canal}): "${(pregunta || '').slice(0, 120)}"`,
                link: '/consultas',
                categoria: 'consulta',
            })))
        }
    } catch (e: any) {
        console.error('[asistente] no se pudo capturar la consulta:', e?.message)
    }
}

// El bot atendió una charla SIN derivar a un humano → no se crea consulta, así que
// el lead nunca pasaría por el "cartelito" de recep. Acá lo mantenemos vivo en el
// CRM y, si todavía no tiene producto cargado, lo clasificamos con IA
// (producto/estilo/profe). Throttle de 6hs para no llamar a la IA en cada mensaje,
// y NO pisa lo que recep haya cargado a mano. Corre en after() (post-respuesta).
async function clasificarLeadBot(subId: string, canal: string, body: any) {
    try {
        const admin = getAdminClient()
        const { data: lead } = await admin.from('crm_leads')
            .select('etapa, producto, clasificado_auto, auto_resumen_at')
            .eq('subscriber_id', subId).maybeSingle()

        const ahora = new Date().toISOString()
        const base: any = { subscriber_id: subId, canal, ultimo_contacto: ahora, updated_at: ahora }
        const nombre = limpioODefault(body?.contacto_nombre)
        const usuario = limpioODefault(body?.contacto_usuario)
        if (nombre) base.nombre = nombre
        if (usuario) base.instagram = usuario

        // Recep ya cargó el producto a mano → intocable. Si no, respetar el throttle.
        const yaCargadoAMano = !!(lead?.producto && !lead?.clasificado_auto)
        const throttleVencido = !lead?.auto_resumen_at ||
            (Date.now() - new Date(lead.auto_resumen_at).getTime() > 6 * 3600_000)

        if (!yaCargadoAMano && throttleVencido) {
            const c = await clasificarChatCrm(admin, subId)
            base.auto_resumen_at = ahora
            if (c.producto || c.estilo || c.profe) {
                if (c.producto) base.producto = c.producto
                if (c.estilo) base.estilo = c.estilo
                if (c.profe) base.profe = c.profe
                base.clasificado_auto = true
                // El bot ya lo contactó: si seguía en 'nuevo', pasa a 'contactado'.
                if (!lead?.etapa || lead.etapa === 'nuevo') base.etapa = 'contactado'
            }
        }

        await admin.from('crm_leads').upsert(base, { onConflict: 'subscriber_id' })
    } catch (e: any) {
        console.error('[asistente] no se pudo clasificar el lead del bot:', e?.message)
    }
}

// Hand-off: ¿el bot está en pausa para este contacto? (la recep respondió hace poco)
async function estaPausado(subId: string | null): Promise<boolean> {
    if (!subId) return false
    try {
        const admin = getAdminClient()
        const { data } = await admin.from('asistente_pausa')
            .select('pausado_hasta').eq('subscriber_id', subId).maybeSingle()
        return !!(data?.pausado_hasta && new Date(data.pausado_hasta).getTime() > Date.now())
    } catch { return false }
}

async function manejar(req: NextRequest, body: any) {
    if (!process.env.ASISTENTE_API_TOKEN) {
        return NextResponse.json({ ok: false, error: 'API no configurada (falta ASISTENTE_API_TOKEN).' }, { status: 500 })
    }
    if (!tokenValido(req, body?.token)) {
        return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 })
    }
    const pregunta = extraerPregunta(body, req)
    const subId = body?.subscriber_id?.toString() || body?.contacto_id?.toString() || null
    const canal = (body?.canal || 'instagram').toString()
    try {
        // HAND-OFF: si la recep tomó la conversación (respondió hace poco), el bot
        // NO contesta. Pero el mensaje que manda el cliente TIENE que llegarle a la
        // recep para que pueda responder: lo sumamos al hilo de la consulta y la
        // reabrimos/notificamos en la bandeja (si no, quedaba solo en el historial y
        // recep nunca lo veía). Devolvemos respuesta vacía (ManyChat no envía nada).
        if (await estaPausado(subId)) {
            if (subId) {
                await logInteraccion(subId, canal, pregunta, '')
                if (pregunta.trim()) await capturarConsulta(body, pregunta, subId, canal)
            }
            return NextResponse.json({ ok: true, respuesta: '', derivar: false, pausado: true })
        }
        // Contexto: turnos previos de este contacto (memoria de conversación).
        const historial = subId ? await getHistorial(subId) : []
        const { respuesta, derivar } = await responderAsistente(pregunta, historial)
        // Registrar este turno (para el próximo contexto y el hilo de recep).
        if (subId) await logInteraccion(subId, canal, pregunta, respuesta)
        if (derivar) await capturarConsulta(body, pregunta, subId, canal)
        // Bot resolvió solo (no derivó): mantener/clasificar el lead del CRM en
        // segundo plano, sin sumarle latencia a la respuesta que espera ManyChat.
        else if (subId && pregunta.trim()) after(() => clasificarLeadBot(subId, canal, body))
        return NextResponse.json({ ok: true, respuesta, derivar })
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || 'Error del asistente' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    let body: any = {}
    try { body = await req.json() } catch { body = {} }
    return manejar(req, body)
}

export async function GET(req: NextRequest) {
    return manejar(req, {})
}
