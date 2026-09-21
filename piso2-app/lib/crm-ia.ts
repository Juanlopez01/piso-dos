// ============================================================================
// CRM · clasificación de un chat con IA (helper server-side, SIN 'use server').
// Lo usan tanto la acción resumirChatCrmAction (recep pide el resumen a mano)
// como el webhook del asistente (clasifica solo cuando el bot atiende una charla
// sin derivar a un humano). No hace auth: quien lo llama ya validó permisos o es
// un proceso interno (el webhook). Recibe un admin client ya construido.
// ============================================================================

type AdminLike = {
    from: (t: string) => any
}

export type ClasificacionCrm = {
    resumen: string
    producto: string
    estilo: string
    profe: string
}

// Trae los últimos mensajes del chat y devuelve un resumen + sugerencias de CRM.
// Best-effort: si no hay OPENAI_API_KEY o falla la IA, cae a un resumen simple
// con los últimos mensajes del usuario (nunca tira error).
export async function clasificarChatCrm(admin: AdminLike, subscriberId: string): Promise<ClasificacionCrm> {
    const vacio: ClasificacionCrm = { resumen: '', producto: '', estilo: '', profe: '' }
    if (!subscriberId) return vacio

    const { data } = await admin.from('asistente_historial')
        .select('de, texto, created_at').eq('subscriber_id', subscriberId)
        .order('created_at', { ascending: false }).limit(40)
    const msgs = ((data || []) as any[]).reverse().filter(m => (m.texto || '').trim())

    const fallback = () => {
        const delUsuario = msgs.filter(m => m.de === 'usuario').map(m => m.texto)
        return delUsuario.slice(-6).join(' · ').slice(0, 400)
    }

    const key = process.env.OPENAI_API_KEY
    if (!key || !msgs.length) return { ...vacio, resumen: fallback() }

    try {
        const conversacion = msgs
            .map(m => `${m.de === 'usuario' ? 'Cliente' : (m.de === 'recep' ? 'Recepción' : 'Bot')}: ${m.texto}`)
            .join('\n').slice(0, 6000)
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
        if (!resp.ok) return { ...vacio, resumen: fallback() }
        const json: any = await resp.json().catch(() => null)
        const raw = json?.choices?.[0]?.message?.content || '{}'
        let parsed: any = {}
        try { parsed = JSON.parse(raw) } catch { parsed = {} }
        return {
            resumen: (parsed.resumen || fallback() || '').toString().slice(0, 500),
            producto: (parsed.producto || '').toString(),
            estilo: (parsed.estilo || '').toString(),
            profe: (parsed.profe || '').toString(),
        }
    } catch {
        return { ...vacio, resumen: fallback() }
    }
}
