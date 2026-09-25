import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// ============================================================================
// PISO2 · Asistente — HAND-OFF manual.
// Lo llama ManyChat cuando un HUMANO (recep) responde la conversación por fuera
// del sistema (Instagram/WhatsApp directo, o el inbox de ManyChat). Sirve para
// que NUESTRO sistema se entere de que recep tomó la charla:
//   1) pausa el bot para ese contacto (no le pisa la respuesta a recep), y
//   2) si viene el texto de recep, lo registra en el hilo para que la bandeja
//      quede completa.
// Protegido por el mismo token que el webhook (ASISTENTE_API_TOKEN).
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

// ManyChat manda "{{full_name}}" cuando no puede resolver la variable → vacío.
function limpio(v: any): string | null {
    const s = (v ?? '').toString().trim()
    if (!s || /\{\{.*\}\}/.test(s)) return null
    return s
}

async function manejar(req: NextRequest, body: any) {
    if (!process.env.ASISTENTE_API_TOKEN) {
        return NextResponse.json({ ok: false, error: 'API no configurada (falta ASISTENTE_API_TOKEN).' }, { status: 500 })
    }
    if (!tokenValido(req, body?.token)) {
        return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 })
    }
    const subId = (body?.subscriber_id ?? body?.contacto_id ?? req.nextUrl.searchParams.get('subscriber_id') ?? '').toString() || null
    if (!subId) return NextResponse.json({ ok: false, error: 'Falta subscriber_id.' }, { status: 400 })

    const canal = (body?.canal || 'instagram').toString()
    const texto = limpio(body?.texto ?? body?.mensaje ?? body?.message)
    const horas = Math.min(72, Math.max(1, Number(body?.horas) || 24)) // pausa 1–72hs (default 24)

    try {
        const admin = getAdminClient()

        // 1) Pausar el bot para este contacto (rolling): recep tomó la charla.
        await admin.from('asistente_pausa').upsert({
            subscriber_id: subId,
            pausado_hasta: new Date(Date.now() + horas * 3600_000).toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'subscriber_id' })

        // 2) Si vino el texto de recep, lo dejamos en el historial + en el hilo de
        //    la consulta pendiente (si hay), para que la bandeja quede completa.
        if (texto) {
            await admin.from('asistente_historial').insert({
                subscriber_id: subId, canal, de: 'recep', texto, created_at: new Date().toISOString(),
            })
            const { data: consulta } = await admin.from('asistente_consultas')
                .select('id').eq('subscriber_id', subId).eq('estado', 'pendiente')
                .order('created_at', { ascending: false }).limit(1).maybeSingle()
            if (consulta?.id) {
                await admin.from('asistente_consulta_mensajes').insert({ consulta_id: consulta.id, de: 'recep', texto })
                await admin.from('asistente_consultas').update({ updated_at: new Date().toISOString() }).eq('id', consulta.id)
            }
        }

        return NextResponse.json({ ok: true, pausado_horas: horas })
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || 'Error en el hand-off' }, { status: 500 })
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
