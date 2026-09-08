// Envío de mails vía Resend (por API REST, sin dependencia npm).
// APAGADO si no están las envs RESEND_API_KEY + MAIL_FROM: no rompe nada,
// devuelve { ok:false, skipped:true }. Se "prende" cargando esas envs en Vercel.
//   RESEND_API_KEY = re_xxx (dashboard de Resend)
//   MAIL_FROM      = "Piso 2 <entradas@piso2multiespacio.com>"  (dominio verificado en Resend)

type MailArgs = { to: string | string[]; subject: string; html: string; replyTo?: string }

export async function enviarMail({ to, subject, html, replyTo }: MailArgs): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY
    const from = process.env.MAIL_FROM
    if (!key || !from) return { ok: false, skipped: true }
    const destinos = (Array.isArray(to) ? to : [to]).filter(x => x && x.includes('@'))
    if (!destinos.length) return { ok: false, error: 'Sin destinatario válido' }
    try {
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: destinos, subject, html, reply_to: replyTo }),
        })
        if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` }
        return { ok: true }
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Error de red' }
    }
}

export function mailEnabled() {
    return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.piso2multiespacio.com'

// Plantilla HTML simple y prolija (inline styles, sin depender de CSS externo).
function layout(inner: string) {
    return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
      <div style="font-size:22px;font-weight:800;letter-spacing:-.5px;margin-bottom:16px">PISO<span style="color:#8ab800">2</span></div>
      ${inner}
      <p style="margin-top:28px;font-size:11px;color:#999">Piso 2 Multiespacio · Este mail es automático.</p>
    </div>`
}

// Mail con la entrada + link a los QR.
export function mailEntradaHTML(opts: { comprador?: string | null; evento: string; ventaId: string; token: string; cantidad: number }) {
    const link = `${BASE}/entradas/${opts.ventaId}?t=${opts.token}`
    return layout(`
      <h2 style="font-size:18px;margin:0 0 8px">¡Gracias por tu compra! 🎟️</h2>
      <p style="margin:0 0 4px">Hola ${opts.comprador || ''},</p>
      <p style="margin:0 0 16px">Tu compra para <b>${opts.evento}</b> está confirmada (${opts.cantidad} entrada${opts.cantidad === 1 ? '' : 's'}).</p>
      <a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Ver mis entradas (QR)</a>
      <p style="margin:16px 0 0;font-size:12px;color:#666">Mostrá el código QR en la puerta. Si el botón no abre, copiá este link:<br>${link}</p>
    `)
}

// Mail de encuesta / reseña post-función.
export function mailEncuestaHTML(opts: { comprador?: string | null; evento: string; eventoId: string }) {
    const link = `${BASE}/resena/${opts.eventoId}`
    return layout(`
      <h2 style="font-size:18px;margin:0 0 8px">¿Qué te pareció ${opts.evento}? ⭐</h2>
      <p style="margin:0 0 16px">Hola ${opts.comprador || ''}, nos encantaría saber tu opinión. Te lleva 30 segundos y nos ayuda un montón.</p>
      <a href="${link}" style="display:inline-block;background:#8ab800;color:#111;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:800">Dejar mi reseña</a>
      <p style="margin:16px 0 0;font-size:12px;color:#666">O copiá este link:<br>${link}</p>
    `)
}
