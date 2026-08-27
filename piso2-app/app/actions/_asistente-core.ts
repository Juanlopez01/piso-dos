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

// ---- Horas y días (para disponibilidad de alquiler) ----
const hhmmToMin = (s: string) => { const [h, m] = (s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const fmtMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const minDeISO = (iso: string) => hhmmToMin(fmtHora(iso)) // minuto del día en horario Argentina

const DIAS_SEMANA: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 }
const MESES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 }

const dowDeFecha = (fecha: string) => new Date(fecha + 'T12:00:00Z').getUTCDay()
function offsetDeFecha(y: number, m: number, d: number): number {
    const [hy, hm, hd] = fechaART(0).split('-').map(Number)
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86400000)
}

// Devuelve el offset de días (0..~120) para el día mencionado en el texto, o null.
function parsearDiaOffset(q: string): number | null {
    if (/pasado\s*manana/.test(q)) return 2
    if (/\bmanana\b/.test(q)) return 1
    if (/\bhoy\b/.test(q)) return 0
    for (const [nombre, dow] of Object.entries(DIAS_SEMANA)) {
        if (q.includes(nombre)) { const hoy = dowDeFecha(fechaART(0)); return (dow - hoy + 7) % 7 }
    }
    let m = q.match(/(\d{1,2})\s*de\s*([a-z]+)/)
    if (m && MESES[m[2]]) { const [hy] = fechaART(0).split('-').map(Number); const off = offsetDeFecha(hy, MESES[m[2]], +m[1]); if (off >= 0 && off <= 120) return off }
    m = q.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/)
    if (m) { const [hy] = fechaART(0).split('-').map(Number); const off = offsetDeFecha(hy, +m[2], +m[1]); if (off >= 0 && off <= 120) return off }
    m = q.match(/\bel\s*(\d{1,2})\b/)
    if (m) { const [hy, hm, hd] = fechaART(0).split('-').map(Number); const d = +m[1]; let mes = d < hd ? hm + 1 : hm; let y = hy; if (mes > 12) { mes = 1; y++ }; const off = offsetDeFecha(y, mes, d); if (off >= 0 && off <= 120) return off }
    return null
}

function etiquetaDia(add: number): string {
    if (add === 0) return 'hoy'; if (add === 1) return 'mañana'; if (add === 2) return 'pasado mañana'
    const f = fechaART(add); const dt = new Date(f + 'T12:00:00Z')
    const dia = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][dt.getUTCDay()]
    const [, m, d] = f.split('-')
    return `${dia} ${d}/${m}`
}

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

    const { data: salas } = await admin.from('salas')
        .select('id, nombre, sede:sedes(nombre), p_ensayo_manana, p_ensayo_noche, p_ensayo_finde')
    const q = norm(opts.salaTexto)
    const sala: any = (salas || []).find((s: any) => norm(s.nombre).includes(q))
    if (!sala) return `No encontré esa sala. Las salas son: ${(salas || []).map((s: any) => s.nombre).join(', ')}. ¿Cuál te interesa?`

    const { data: clases } = await admin.from('clases')
        .select('inicio, fin').eq('sala_id', sala.id).neq('estado', 'cancelada')
        .gte('inicio', desde).lt('inicio', hasta)
    const { data: alqs } = await admin.from('alquileres')
        .select('hora_inicio, hora_fin').eq('sala_id', sala.id).eq('fecha', fecha)
        .in('estado', ['confirmado', 'pagado', 'pendiente'])

    // Ocupaciones en minutos del día (ART)
    const ocup: { ini: number; fin: number }[] = []
    ;(clases || []).forEach((c: any) => ocup.push({ ini: minDeISO(c.inicio), fin: minDeISO(c.fin) }))
    ;(alqs || []).forEach((a: any) => ocup.push({ ini: hhmmToMin(a.hora_inicio), fin: hhmmToMin(a.hora_fin) }))
    ocup.sort((a, b) => a.ini - b.ini)

    // Ventana de atención y cálculo de huecos libres
    const APERTURA = 8 * 60, CIERRE = 23 * 60
    const libres: { ini: number; fin: number }[] = []
    let cursor = APERTURA
    for (const o of ocup) {
        const ini = Math.max(o.ini, APERTURA), fin = Math.min(o.fin, CIERRE)
        if (fin <= APERTURA || ini >= CIERRE) continue
        if (ini > cursor) libres.push({ ini: cursor, fin: ini })
        cursor = Math.max(cursor, fin)
    }
    if (cursor < CIERRE) libres.push({ ini: cursor, fin: CIERRE })
    const libresF = libres.filter(l => l.fin - l.ini >= 30)

    const sede = nombreDe(sala.sede)
    const esDomingo = dowDeFecha(fecha) === 0
    const tarifa = esDomingo
        ? `💲 Tarifa (domingo): ${pesos(sala.p_ensayo_finde)} por hora`
        : `💲 Tarifas: mañana ${pesos(sala.p_ensayo_manana)}/h · noche —desde 18hs— ${pesos(sala.p_ensayo_noche)}/h`

    const cab = `🏢 *${sala.nombre}*${sede ? ` (${sede})` : ''} — ${etiquetaDia(add)}`
    if (libresF.length === 0) {
        return `${cab}\nEse día está *completo*, no quedan horarios libres.\n\n${tarifa}`
    }
    const lineas = libresF.map(l => `• ${fmtMin(l.ini)} a ${fmtMin(l.fin)}hs`)
    return `${cab}\n*Horarios libres:*\n${lineas.join('\n')}\n\n${tarifa}\n\n_Decime qué horario querés y te paso el presupuesto._`
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
        // Sala nombrada explícitamente (Sala 1/2, blanca, negra, completa, pasillo rojo)
        const mSala = q.match(/sala\s*(\d+|blanca|negra|completa)/)
        const salaTexto = mSala ? mSala[0] : (/pasillo/.test(q) ? 'pasillo' : '')
        const off = parsearDiaOffset(q) // día pedido, o null

        // Con sala + día (o pedido de disponibilidad) → horarios libres + tarifa de ese día
        if (salaTexto && (off !== null || esDisponibilidad)) {
            return disponibilidadAlquiler({ salaTexto, addDays: off ?? 0 })
        }
        const base = await tarifasAlquiler({ salaTexto: salaTexto || undefined })
        // Pidió un día pero no dijo qué sala → tarifas + invitación a elegir sala
        if (off !== null && !salaTexto) {
            return base + '\n\n¿De qué sala? Decime la sala (ej: "Sala 1") y te paso los horarios libres de ese día.'
        }
        return base
    }

    // Un pedido de precio gana sobre "clase" (ej: "cuánto sale una clase" → precios).
    if (esPrecio) return preciosPacks()

    if (esClase) {
        const ritmo = /(jazz contempo|contempo|jazz|ballet|tecnic\w*|heels|reggaeton|urban|salsa)/.exec(q)?.[0]
        return clasesAgenda({ cuando: detectarDia(q), texto: ritmo })
    }

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
