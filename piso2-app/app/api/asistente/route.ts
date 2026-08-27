import { NextRequest, NextResponse } from 'next/server'
import { responderAsistente } from '@/app/actions/_asistente-core'

// ============================================================================
// API pública del Asistente — la consume ManyChat (nodo "Acción externa").
// ----------------------------------------------------------------------------
// Protegida por token (env ASISTENTE_API_TOKEN). Recibe la pregunta del usuario
// y devuelve { ok, respuesta } en JSON, con los datos reales de Piso 2.
//
// POST  /api/asistente   body: { "pregunta": "..." }   header: Authorization: Bearer <token>
// GET   /api/asistente?q=...&token=<token>            (cómodo para probar con el navegador/curl)
// ============================================================================

export const dynamic = 'force-dynamic'

function tokenValido(req: NextRequest, bodyToken?: string): boolean {
    const esperado = process.env.ASISTENTE_API_TOKEN
    if (!esperado) return false // sin token configurado, no atendemos (seguro por defecto)
    const auth = req.headers.get('authorization') || ''
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
    const qToken = req.nextUrl.searchParams.get('token') || ''
    return [bearer, qToken, bodyToken].some(t => t && t === esperado)
}

// Saca la pregunta de los nombres de campo más comunes que puede mandar ManyChat.
function extraerPregunta(body: any, req: NextRequest): string {
    return (
        body?.pregunta ?? body?.mensaje ?? body?.message ?? body?.text ?? body?.q ??
        req.nextUrl.searchParams.get('q') ?? req.nextUrl.searchParams.get('pregunta') ?? ''
    ).toString()
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
        const respuesta = await responderAsistente(pregunta)
        return NextResponse.json({ ok: true, respuesta })
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
