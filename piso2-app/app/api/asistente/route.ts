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

// Guarda la consulta derivada + primer mensaje + avisa a recep/admin. Best-effort.
async function capturarConsulta(body: any, pregunta: string) {
    try {
        const admin = getAdminClient()
        const canal = (body?.canal || 'instagram').toString()
        const { data: consulta } = await admin.from('asistente_consultas').insert({
            canal,
            contacto_nombre: body?.contacto_nombre?.toString() || null,
            contacto_usuario: body?.contacto_usuario?.toString() || null,
            subscriber_id: body?.subscriber_id?.toString() || body?.contacto_id?.toString() || null,
            consulta: pregunta || null,
        }).select('id').single()

        if (consulta?.id && pregunta) {
            await admin.from('asistente_consulta_mensajes').insert({
                consulta_id: consulta.id, de: 'usuario', texto: pregunta,
            })
        }

        // Notificar a admin + recepción (campanita)
        const { data: staff } = await admin.from('profiles').select('id').in('rol', ['admin', 'recepcion'])
        if (staff?.length) {
            const quien = body?.contacto_nombre || body?.contacto_usuario || 'Alguien'
            await admin.from('notificaciones').insert(staff.map((s: any) => ({
                usuario_id: s.id,
                titulo: '🙋 Nueva consulta del asistente',
                mensaje: `${quien} pidió hablar con una persona (${canal}): "${(pregunta || '').slice(0, 120)}"`,
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
    try {
        const { respuesta, derivar } = await responderAsistente(pregunta)
        if (derivar) await capturarConsulta(body, pregunta)
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
