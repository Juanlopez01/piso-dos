// ============================================================================
// Cerebro del Asistente — núcleo compartido (SIN 'use server', SIN auth).
// ----------------------------------------------------------------------------
// Contiene las "herramientas" (clasesAgenda / preciosPacks / tarifasAlquiler /
// disponibilidadAlquiler) y el router `responderAsistente`. Lo usan:
//   - la server action con sesión (panel interno de prueba),
//   - la API pública /api/asistente (que llama ManyChat con token).
// En la Fase 2, la IA se apoya sobre estas mismas herramientas.
// ============================================================================

import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const TZ = 'America/Argentina/Buenos_Aires'
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')

function fechaART(addDays = 0): string {
    const t = Date.now() - 3 * 3600_000 + addDays * 86400_000
    return new Date(t).toISOString().slice(0, 10)
}
function rangoDia(addDays = 0) {
    return { desde: `${fechaART(addDays)}T03:00:00.000Z`, hasta: `${fechaART(addDays + 1)}T03:00:00.000Z` }
}
function fmtDia(iso: string) {
    return new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ })
}
function fmtHora(iso: string) {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}
const nombreDe = (rel: any) => Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre
const nombreCompletoDe = (rel: any) => Array.isArray(rel) ? rel[0]?.nombre_completo : rel?.nombre_completo

// ---------------------------------------------------------------------------
// HERRAMIENTAS (reutilizables por la IA en Fase 2)
// ---------------------------------------------------------------------------
export async function clasesAgenda(opts: { cuando?: 'hoy' | 'manana' | 'semana'; texto?: string } = {}): Promise<string> {
    const admin = getAdminClient()
    const cuando = opts.cuando || 'hoy'
    const hasta = cuando === 'hoy' ? rangoDia(0).hasta : cuando === 'manana' ? rangoDia(1).hasta : rangoDia(7).hasta
    const desdeReal = cuando === 'manana' ? rangoDia(1).desde : rangoDia(0).desde

    const { data } = await admin.from('clases')
        .select('nombre, inicio, tipo_clase, profesor:profiles!clases_profesor_id_fkey(nombre_completo), sala:salas(nombre, sede:sedes(nombre))')
        .gte('inicio', desdeReal).lt('inicio', hasta)
        .neq('estado', 'cancelada').eq('es_alquiler', false)
        .order('inicio')

    let clases = (data || []) as any[]
    if (opts.texto) {
        const q = norm(opts.texto)
        clases = clases.filter(c => norm(c.nombre).includes(q))
    }
    if (clases.length === 0) {
        const cuandoTxt = cuando === 'hoy' ? 'hoy' : cuando === 'manana' ? 'mañana' : 'esta semana'
        return `No encuentro clases${opts.texto ? ` de "${opts.texto}"` : ''} ${cuandoTxt}. ¿Querés que busque en otro día?`
    }

    const titulo = cuando === 'hoy' ? '🗓️ *Clases de hoy*' : cuando === 'manana' ? '🗓️ *Clases de mañana*' : '🗓️ *Clases de esta semana*'
    const lineas = clases.slice(0, 25).map(c => {
        const profe = nombreCompletoDe(c.profesor)?.trim()
        const sala = nombreDe(c.sala)
        const sede = nombreDe((Array.isArray(c.sala) ? c.sala[0] : c.sala)?.sede)
        const lugar = [sala, sede].filter(Boolean).join(', ')
        return `• ${fmtDia(c.inicio)} ${fmtHora(c.inicio)}hs — *${c.nombre.trim()}*${profe ? ` (${profe})` : ''}${lugar ? ` · ${lugar}` : ''}`
    })
    return `${titulo}\n${lineas.join('\n')}`
}

export async function preciosPacks(opts: { texto?: string } = {}): Promise<string> {
    const admin = getAdminClient()
    const { data } = await admin.from('productos')
        .select('nombre, precio, creditos, categoria')
        .eq('activo', true).eq('visible_tienda', true)
        .order('precio', { ascending: true })

    let prods = (data || []) as any[]
    if (opts.texto) {
        const q = norm(opts.texto)
        prods = prods.filter(p => norm(p.nombre).includes(q) || norm(p.categoria || '').includes(q))
    }
    if (prods.length === 0) return 'No encontré precios para eso. ¿Querés que te muestre todos los packs disponibles?'

    const lineas = prods.slice(0, 30).map(p => {
        const cred = p.creditos ? ` — ${p.creditos} ${p.creditos === 1 ? 'clase' : 'clases'}` : ''
        return `• *${p.nombre}*${cred}: ${pesos(p.precio)}`
    })
    return `💲 *Precios y packs*\n${lineas.join('\n')}\n\n_Los precios pueden variar según promociones vigentes._`
}

export async function tarifasAlquiler(opts: { salaTexto?: string } = {}): Promise<string> {
    const admin = getAdminClient()
    const { data } = await admin.from('salas')
        .select('nombre, sede:sedes(nombre), p_ensayo_manana, p_ensayo_noche, p_ensayo_finde')
        .order('nombre')

    let salas = (data || []) as any[]
    if (opts.salaTexto) {
        const q = norm(opts.salaTexto)
        const f = salas.filter(s => norm(s.nombre).includes(q))
        if (f.length) salas = f
    }
    if (salas.length === 0) return 'No tengo salas cargadas para mostrar tarifas.'

    const lineas = salas.map(s => {
        const sede = nombreDe(s.sede)
        return `• *${s.nombre}*${sede ? ` (${sede})` : ''} — mañana ${pesos(s.p_ensayo_manana)} · noche ${pesos(s.p_ensayo_noche)} · finde ${pesos(s.p_ensayo_finde)} (por hora)`
    })
    return `🏢 *Alquiler de salas — tarifas de ensayo*\n${lineas.join('\n')}\n\n_La franja "noche" arranca a las 18hs. Para clases o producciones el valor puede variar. Consultá disponibilidad de un día puntual y te confirmamos._`
}

export async function disponibilidadAlquiler(opts: { salaTexto: string; addDays?: number }): Promise<string> {
    const admin = getAdminClient()
    const add = opts.addDays || 0
    const fecha = fechaART(add)
    const { desde, hasta } = rangoDia(add)

    const { data: salas } = await admin.from('salas').select('id, nombre, sede:sedes(nombre)')
    const q = norm(opts.salaTexto)
    const sala = (salas || []).find((s: any) => norm(s.nombre).includes(q))
    if (!sala) return `No encontré una sala que coincida con "${opts.salaTexto}". Las salas son: ${(salas || []).map((s: any) => s.nombre).join(', ')}.`

    const { data: clases } = await admin.from('clases')
        .select('nombre, inicio, fin').eq('sala_id', sala.id).neq('estado', 'cancelada')
        .gte('inicio', desde).lt('inicio', hasta).order('inicio')
    const { data: alqs } = await admin.from('alquileres')
        .select('hora_inicio, hora_fin').eq('sala_id', sala.id).eq('fecha', fecha)
        .in('estado', ['confirmado', 'pagado', 'pendiente'])

    const ocup: { ini: string; fin: string }[] = []
    ;(clases || []).forEach((c: any) => ocup.push({ ini: fmtHora(c.inicio), fin: fmtHora(c.fin) }))
    ;(alqs || []).forEach((a: any) => ocup.push({ ini: (a.hora_inicio || '').slice(0, 5), fin: (a.hora_fin || '').slice(0, 5) }))
    ocup.sort((a, b) => a.ini.localeCompare(b.ini))

    const cuandoTxt = add === 0 ? 'hoy' : add === 1 ? 'mañana' : fecha
    const sede = nombreDe(sala.sede)
    if (ocup.length === 0) {
        return `✅ *${sala.nombre}*${sede ? ` (${sede})` : ''} está *libre todo el día* ${cuandoTxt}. Para reservar, decime el horario y te paso el presupuesto.`
    }
    const lineas = ocup.map(o => `• ${o.ini} a ${o.fin}hs`)
    return `🏢 *${sala.nombre}*${sede ? ` (${sede})` : ''} — ${cuandoTxt}\nHorarios *ocupados*:\n${lineas.join('\n')}\n\n_El resto del día está libre. Decime qué horario querés y te paso el presupuesto._`
}

// ---------------------------------------------------------------------------
// ROUTER: entiende por palabras clave y llama a la herramienta.
// ---------------------------------------------------------------------------
export const MENU = `¡Hola! 👋 Soy el asistente de *Piso 2*. Puedo ayudarte con:

1️⃣ *Clases* — horarios y profesores (ej: "¿qué clases hay hoy?", "clases de jazz")
2️⃣ *Precios y packs* — cuánto sale cada cosa (ej: "precios de los packs")
3️⃣ *Alquiler de salas* — tarifas y disponibilidad (ej: "tarifas de alquiler", "¿está libre la Sala 1 mañana?")
4️⃣ *Asistencia personalizada* — te contacta una persona del equipo
5️⃣ *Ir a la página* — piso2multiespacio.com

¿Con qué te ayudo?`

function detectarDia(q: string): 'hoy' | 'manana' | 'semana' {
    if (/\bmanana\b/.test(q)) return 'manana'
    if (/(semana|proxim)/.test(q)) return 'semana'
    return 'hoy'
}

// Router interno: dada una pregunta en texto, arma la respuesta (con formato *negrita*).
async function textoRuteado(pregunta: string): Promise<string> {
    const q = norm(pregunta || '')
    if (!q.trim()) return MENU

    const esAlquiler = /(alquil|reserv)/.test(q) || (/\bsala\b/.test(q) && /(libre|disponib|precio|tarifa|reserv|horario|ocupad)/.test(q))
    const esDisponibilidad = /(libre|disponib|ocupad|reserv)/.test(q)
    const esPrecio = /(precio|cuesta|cuanto|valor|abono|pack|salen?)/.test(q)
    const esClase = /(clase|horario|agenda|cuando|profe|hoy|manana|semana|jazz|contempo|ballet|tecnic|heels|reggaeton|urban|salsa|ritmo|hay clase)/.test(q)
    const esMenu = /(hola|buenas|menu|ayuda|opciones|que podes|que podés)/.test(q)

    if (esAlquiler) {
        const m = q.match(/sala\s*([a-z0-9]+)/)
        const salaTexto = m ? `sala ${m[1]}` : (/(pasillo|blanca|negra|completa)/.exec(q)?.[0] || '')
        if (salaTexto && esDisponibilidad) {
            const add = /\bmanana\b/.test(q) ? 1 : 0
            return disponibilidadAlquiler({ salaTexto, addDays: add })
        }
        return tarifasAlquiler({ salaTexto: salaTexto || undefined })
    }

    if (esPrecio && !esClase) return preciosPacks()

    if (esClase) {
        const ritmo = /(jazz contempo|contempo|jazz|ballet|tecnic\w*|heels|reggaeton|urban|salsa)/.exec(q)?.[0]
        return clasesAgenda({ cuando: detectarDia(q), texto: ritmo })
    }

    if (esPrecio) return preciosPacks()
    if (esMenu) return MENU

    return `No estoy seguro de haber entendido 🤔\n\n${MENU}`
}

const DERIVAR_MSG = `🙋 Te derivo con una persona del equipo de Piso 2.
Contanos tu consulta y dejanos un teléfono o mail, y te respondemos apenas podamos. ¡Gracias!`

// ¿La persona pide hablar con alguien del equipo (asistencia personalizada)?
function esPedidoHumano(q: string): boolean {
    if (q.trim() === '4') return true
    return /(asesor|una persona|con alguien|humano|recepci|reclamo|queja|asistencia personalizada|hablar con|atencion personal|opcion 4)/.test(q)
}

// Núcleo público: rutea, detecta derivación a una persona, y limpia el formato
// de negrita (*asteriscos*), que en Instagram se ve literal. Devuelve también
// `derivar` para que ManyChat avise a recepción cuando se pide una persona.
export async function responderAsistente(pregunta: string): Promise<{ respuesta: string; derivar: boolean }> {
    const q = norm(pregunta || '')
    const derivar = esPedidoHumano(q)
    const texto = derivar ? DERIVAR_MSG : await textoRuteado(pregunta)
    return { respuesta: texto.replace(/\*/g, ''), derivar }
}
