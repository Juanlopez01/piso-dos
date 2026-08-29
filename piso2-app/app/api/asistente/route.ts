import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { responderAsistente } from '@/app/actions/_asistente-core'

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
        const desde = new Date(Date.now() - 3 * 3600_000).toISOString() // últimas 3hs
        const { data } = await admin.from('asistente_historial')
            .select('de, texto, created_at')
            .eq('subscriber_id', subId).gte('created_at', desde)
            .order('created_at', { ascending: false }).limit(12)
        return (data || []).reverse()
    } catch { return [] }
}

// Registra el turno (mensaje del usuario + respuesta del bot). Best-effort.
async function logInteraccion(subId: string, canal: string, pregunta: string, respuesta: string) {
    try {
        const admin = getAdminClient()
        const rows: any[] = []
        if (pregunta?.trim()) rows.push({ subscriber_id: subId, canal, de: 'usuario', texto: pregunta })
        if (respuesta?.trim()) rows.push({ subscriber_id: subId, canal, de: 'bot', texto: respuesta })
        if (rows.length) await admin.from('asistente_historial').insert(rows)
    } catch (e: any) {
        console.error('[asistente] no se pudo loguear el historial:', e?.message)
    }
}

// Guarda la consulta derivada + arma el hilo con la conversación previa (contexto
// para recep) + avisa a recep/admin. Best-effort.
async function capturarConsulta(body: any, pregunta: string, subId: string | null, canal: string) {
    try {
        const admin = getAdminClient()
        const { data: consulta } = await admin.from('asistente_consultas').insert({
            canal,
            contacto_nombre: body?.contacto_nombre?.toString() || null,
            contacto_usuario: body?.contacto_usuario?.toString() || null,
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
            const quien = body?.contacto_nombre || body?.contacto_usuario || 'Alguien'
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
        // Contexto: turnos previos de este contacto (memoria de conversación).
        const historial = subId ? await getHistorial(subId) : []
        const { respuesta, derivar } = await responderAsistente(pregunta, historial)
        // Registrar este turno (para el próximo contexto y el hilo de recep).
        if (subId) await logInteraccion(subId, canal, pregunta, respuesta)
        if (derivar) await capturarConsulta(body, pregunta, subId, canal)
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
