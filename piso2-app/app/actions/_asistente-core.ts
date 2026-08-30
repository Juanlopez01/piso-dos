// ============================================================================
// Cerebro del Asistente — núcleo compartido (SIN 'use server', SIN auth).
// Responde con datos REALES de Piso 2 (clases, formaciones, precios, alquileres,
// ubicación, FAQs) y detecta cuándo derivar a una persona.
// Lo usan la server action del panel y la API pública /api/asistente.
// ============================================================================

import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const TZ = 'America/Argentina/Buenos_Aires'
const WEB = 'piso2multiespacio.com'
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

// --- Tolerancia a errores de tipeo (la gente escribe rápido y con faltas) ---
function lev(a: string, b: string): number {
    const m = a.length, n = b.length
    if (!m) return n; if (!n) return m
    const dp = Array.from({ length: n + 1 }, (_, j) => j)
    for (let i = 1; i <= m; i++) {
        let prev = dp[0]; dp[0] = i
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j]
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
            prev = tmp
        }
    }
    return dp[n]
}
// Dos palabras "parecen la misma" si son iguales, una contiene a la otra, o la
// distancia de edición es chica (tolera 1-2 typos según el largo).
function pareceIgual(a: string, b: string): boolean {
    if (!a || !b) return false
    if (a === b || a.includes(b) || b.includes(a)) return true
    const min = Math.min(a.length, b.length)
    if (min < 4) return false
    return lev(a, b) <= (min <= 6 ? 1 : 2)
}
const STOP_FILTRO = new Set(['clase', 'clases', 'profe', 'profes', 'profesor', 'profesora', 'con', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'dia', 'dias', 'hay', 'tenes', 'tienen', 'tiene', 'danza', 'baile', 'estilo', 'ritmo', 'para', 'que', 'cual', 'cuales', 'cuando', 'donde', 'como', 'quiero', 'saber', 'averiguar', 'info', 'informacion', 'sobre', 'dan', 'anotar', 'anotarme', 'hacer'])

// ---- Fechas / horas en horario Argentina ----
function fechaART(addDays = 0): string {
    return new Date(Date.now() - 3 * 3600_000 + addDays * 86400_000).toISOString().slice(0, 10)
}
function rangoDia(addDays = 0) {
    return { desde: `${fechaART(addDays)}T03:00:00.000Z`, hasta: `${fechaART(addDays + 1)}T03:00:00.000Z` }
}
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ })
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
const nombreDe = (rel: any) => Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre
const nombreCompletoDe = (rel: any) => Array.isArray(rel) ? rel[0]?.nombre_completo : rel?.nombre_completo
const profeDe = (c: any) => (nombreCompletoDe(c.profesor) || '').trim()
const salaSedeDe = (c: any) => {
    const sala = nombreDe(c.sala); const sede = nombreDe((Array.isArray(c.sala) ? c.sala[0] : c.sala)?.sede)
    return [sala, sede].filter(Boolean).join(', ')
}

const hhmmToMin = (s: string) => { const [h, m] = (s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const fmtMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const minDeISO = (iso: string) => hhmmToMin(fmtHora(iso))

const DIAS_SEMANA: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 }
const MESES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 }
const dowDeFecha = (fecha: string) => new Date(fecha + 'T12:00:00Z').getUTCDay()
function offsetDeFecha(y: number, m: number, d: number): number {
    const [hy, hm, hd] = fechaART(0).split('-').map(Number)
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86400000)
}
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
    return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][dt.getUTCDay()]} ${f.split('-')[2]}/${f.split('-')[1]}`
}

// Ritmos/estilos que la gente nombra (para filtrar clases)
const RITMOS = 'jazz contempo|contempo|contemporaneo|contenporaneo|jazz fusion|jazz|ballet|clasico|tecnica clasica|tecnica|heels|hells|stiletto|reggaeton|reggeton|regueton|regaeton|regaton|urban|urbano|comercial|lyrical|hip hop|hiphop|dancehall|salsa|bachata|folclore|folklore|elongacion|stretching|acrobacia|coreografia|coreo|dance|entrenamiento|pole|telas|flexibilidad|ritmos latinos|latinos'

// ---------------------------------------------------------------------------
// HERRAMIENTAS
// ---------------------------------------------------------------------------

// Agenda de clases (Regular/Especial), filtrable por día, ritmo o profesor.
export async function clasesAgenda(opts: { cuando?: 'hoy' | 'manana' | 'semana'; addDays?: number; q?: string; filtro?: string } = {}): Promise<string> {
    const admin = getAdminClient()
    const q = norm(opts.q || '')
    const diaEsp = typeof opts.addDays === 'number'
    const cuando = opts.cuando || 'hoy'
    const desde = diaEsp ? rangoDia(opts.addDays!).desde : cuando === 'manana' ? rangoDia(1).desde : rangoDia(0).desde
    const hasta = diaEsp ? rangoDia(opts.addDays!).hasta : cuando === 'hoy' ? rangoDia(0).hasta : cuando === 'manana' ? rangoDia(1).hasta : rangoDia(7).hasta

    const { data } = await admin.from('clases')
        .select('nombre, inicio, tipo_clase, profesor:profiles!clases_profesor_id_fkey(nombre_completo), sala:salas(nombre, sede:sedes(nombre))')
        .gte('inicio', desde).lt('inicio', hasta)
        .neq('estado', 'cancelada').eq('es_alquiler', false)
        .in('tipo_clase', ['Regular', 'Especial'])
        .order('inicio')

    let clases = (data || []) as any[]
    const cuandoTxt = diaEsp ? etiquetaDia(opts.addDays!) : cuando === 'hoy' ? 'hoy' : cuando === 'manana' ? 'mañana' : 'esta semana'

    // Aplica un filtro (ritmo o profesor) sobre las clases. Devuelve la etiqueta
    // (" de jazz" / " con Nico"), o '__nomatch__' si no encontró nada, o '' si no había filtro.
    // `todos`=true (filtro explícito de la IA): TODOS los tokens deben matchear
    // (más preciso). `todos`=false (q del router por reglas): alcanza con uno.
    // El match es tolerante a errores de tipeo (pareceIgual).
    const aplicarFiltro = (texto: string, todos: boolean): string => {
        const fq = norm(texto)
        const ritmo = new RegExp(`(${RITMOS})`).exec(fq)?.[0]
        if (ritmo) {
            const r = norm(ritmo); const f = clases.filter(c => norm(c.nombre).includes(r))
            if (f.length) { clases = f; return ` de ${ritmo}` }
            return '__nomatch__'
        }
        const toks = fq.split(/\s+/).filter(t => t.length >= 3 && !STOP_FILTRO.has(t))
        if (!toks.length) return ''
        const palabrasDe = (c: any) => (norm(c.nombre) + ' ' + norm(profeDe(c))).split(/\s+/).filter(Boolean)
        const f = clases.filter(c => {
            const pal = palabrasDe(c)
            return todos ? toks.every(t => pal.some(w => pareceIgual(w, t))) : toks.some(t => pal.some(w => pareceIgual(w, t)))
        })
        if (f.length) {
            clases = f
            const profe = profeDe(f[0])
            const matchProfe = !!profe && norm(profe).split(/\s+/).some(w => toks.some(t => pareceIgual(w, t)))
            return matchProfe ? ` con ${profe}` : ` de ${texto.trim()}`
        }
        return '__nomatch__'
    }

    // Filtro por ritmo o profesor. `filtro` explícito (de la IA) informa cuando no
    // encuentra; el `q` (router por reglas) filtra si puede, sin avisar no-match.
    let filtroTxt = ''
    if (opts.filtro && norm(opts.filtro).trim()) {
        const res = aplicarFiltro(opts.filtro, true)
        if (res === '__nomatch__') return `No encontré clases de ${opts.filtro.trim()} en la agenda de los próximos días. ¿Querés que te contacte con alguien del equipo para confirmarte sus horarios?`
        filtroTxt = res
    } else if (q.trim()) {
        const res = aplicarFiltro(q, false)
        filtroTxt = res === '__nomatch__' ? '' : res
    }

    if (clases.length === 0) return `No encontré clases${filtroTxt} ${cuandoTxt}. ¿Querés que busque otro día, o te muestro toda la agenda?`

    const lineas = clases.slice(0, 30).map(c => {
        const lugar = salaSedeDe(c); const profe = profeDe(c)
        return `• ${fmtDia(c.inicio)} ${fmtHora(c.inicio)}hs — *${c.nombre.trim()}*${profe ? ` (${profe})` : ''}${lugar ? ` · ${lugar}` : ''}`
    })
    const titulo = diaEsp ? `🗓️ *Clases — ${etiquetaDia(opts.addDays!)}*` : cuando === 'hoy' ? '🗓️ *Clases de hoy*' : cuando === 'manana' ? '🗓️ *Clases de mañana*' : '🗓️ *Clases de esta semana*'
    return `${titulo}${filtroTxt}\n${lineas.join('\n')}`
}

// Formaciones (cursos): lista las disponibles (nombre + profe), sin repetir.
export async function formaciones(): Promise<string> {
    const admin = getAdminClient()
    const { data } = await admin.from('clases')
        .select('nombre, inicio, profesor:profiles!clases_profesor_id_fkey(nombre_completo)')
        .gte('inicio', rangoDia(0).desde).neq('estado', 'cancelada').eq('tipo_clase', 'Formacion')
        .order('inicio').limit(300)

    const vistos = new Set<string>(); const items: string[] = []
    for (const c of (data || []) as any[]) {
        const key = norm(c.nombre) + '|' + norm(profeDe(c))
        if (vistos.has(key)) continue
        vistos.add(key)
        const dt = new Date(c.inicio)
        const dia = dt.toLocaleDateString('es-AR', { weekday: 'long', timeZone: TZ })
        items.push(`• *${c.nombre.trim()}*${profeDe(c) ? ` (${profeDe(c)})` : ''} — ${dia} ${fmtHora(c.inicio)}hs`)
        if (items.length >= 20) break
    }
    if (items.length === 0) return 'Por ahora no tengo formaciones cargadas. Si querés, te contacto con una persona del equipo para más info.'
    return `🎓 *Formaciones disponibles*\n${items.join('\n')}\n\n_Para info de inscripción, fechas de inicio y requisitos, decime "quiero hablar con una persona" y te contacta el equipo._`
}

// Precios de packs / productos activos y visibles, filtrable por texto.
export async function preciosPacks(opts: { q?: string } = {}): Promise<string> {
    const admin = getAdminClient()
    const { data } = await admin.from('productos')
        .select('nombre, precio, creditos, categoria')
        .eq('activo', true).eq('visible_tienda', true).order('precio', { ascending: true })

    let prods = (data || []) as any[]
    const q = norm(opts.q || '')
    // filtro por término relevante (suelta, pack, x4, ballroom, nombre de producto...)
    const term = /(suelta|x\s?4|x\s?8|x\s?12|ballroom|seminario|intensivo|especial|regular|nueva generacion)/.exec(q)?.[0]
    if (term) {
        const tt = norm(term).replace(/\s/g, '')
        const f = prods.filter(p => norm(p.nombre).replace(/\s/g, '').includes(tt) || norm(p.categoria || '').includes(tt))
        if (f.length) prods = f
    }
    if (prods.length === 0) return 'No encontré ese precio puntual. ¿Querés que te muestre todos los packs y clases sueltas?'

    const lineas = prods.slice(0, 30).map(p => {
        const cred = p.creditos ? ` — ${p.creditos} ${p.creditos === 1 ? 'clase' : 'clases'}` : ''
        return `• *${p.nombre.trim()}*${cred}: ${pesos(p.precio)}`
    })
    return `💲 *Precios${term ? ` (${term})` : ' y packs'}*\n${lineas.join('\n')}\n\n_Los precios pueden variar según promociones vigentes. Pago: efectivo, transferencia o MercadoPago._`
}

// Tarifas de alquiler por sala y franja.
export async function tarifasAlquiler(opts: { salaTexto?: string } = {}): Promise<string> {
    const admin = getAdminClient()
    const { data } = await admin.from('salas')
        .select('nombre, sede:sedes(nombre), p_ensayo_manana, p_ensayo_noche, p_ensayo_finde').order('nombre')
    let salas = (data || []) as any[]
    if (opts.salaTexto) {
        const qs = norm(opts.salaTexto); const f = salas.filter(s => norm(s.nombre).includes(qs)); if (f.length) salas = f
    }
    if (salas.length === 0) return 'No tengo salas cargadas para mostrar tarifas.'
    const lineas = salas.map(s => `• *${s.nombre}*${nombreDe(s.sede) ? ` (${nombreDe(s.sede)})` : ''} — mañana ${pesos(s.p_ensayo_manana)} · noche ${pesos(s.p_ensayo_noche)} · finde ${pesos(s.p_ensayo_finde)} (por hora)`)
    return `🏢 *Alquiler de salas — tarifas de ensayo*\n${lineas.join('\n')}\n\n_La franja "noche" arranca a las 18hs. Para clases/producciones el valor puede variar. Decime la sala y el día y te paso los horarios libres._`
}

// Disponibilidad de una sala un día: horarios libres + tarifa del día.
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

    const { data: clases } = await admin.from('clases').select('inicio, fin').eq('sala_id', sala.id).neq('estado', 'cancelada').gte('inicio', desde).lt('inicio', hasta)
    const { data: alqs } = await admin.from('alquileres').select('hora_inicio, hora_fin').eq('sala_id', sala.id).eq('fecha', fecha).in('estado', ['confirmado', 'pagado', 'pendiente'])

    const ocup: { ini: number; fin: number }[] = []
    ;(clases || []).forEach((c: any) => ocup.push({ ini: minDeISO(c.inicio), fin: minDeISO(c.fin) }))
    ;(alqs || []).forEach((a: any) => ocup.push({ ini: hhmmToMin(a.hora_inicio), fin: hhmmToMin(a.hora_fin) }))
    ocup.sort((a, b) => a.ini - b.ini)

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
    const tarifa = dowDeFecha(fecha) === 0
        ? `💲 Tarifa (domingo): ${pesos(sala.p_ensayo_finde)} por hora`
        : `💲 Tarifas: mañana ${pesos(sala.p_ensayo_manana)}/h · noche —desde 18hs— ${pesos(sala.p_ensayo_noche)}/h`
    const cab = `🏢 *${sala.nombre}*${sede ? ` (${sede})` : ''} — ${etiquetaDia(add)}`
    if (libresF.length === 0) return `${cab}\nEse día está *completo*, no quedan horarios libres.\n\n${tarifa}`
    return `${cab}\n*Horarios libres:*\n${libresF.map(l => `• ${fmtMin(l.ini)} a ${fmtMin(l.fin)}hs`).join('\n')}\n\n${tarifa}\n\n_Decime qué horario querés y te paso el presupuesto._`
}

// Ubicación / direcciones de las sedes.
export async function ubicacion(): Promise<string> {
    const admin = getAdminClient()
    const { data } = await admin.from('sedes').select('nombre, direccion').order('nombre')
    if (!data?.length) return `Podés encontrarnos en ${WEB}.`
    const lineas = data.map((s: any) => `📍 *${s.nombre}*${s.direccion ? `: ${s.direccion}, CABA` : ''}`)
    return `Estamos en:\n${lineas.join('\n')}\n\n_Más info en ${WEB}_`
}

// ---------------------------------------------------------------------------
// ROUTER
// ---------------------------------------------------------------------------
const MENU = `¡Hola! 👋 Soy el asistente de *Piso 2*. Puedo ayudarte con:

1️⃣ *Clases* — horarios y profesores (ej: "clases de hoy", "clases de jazz", "clases con Pedro")
2️⃣ *Precios y packs* — cuánto sale cada cosa (ej: "precio de la clase suelta")
3️⃣ *Alquiler de salas* — tarifas y disponibilidad (ej: "alquilar la Sala 1 el sábado")
4️⃣ *Formaciones* — nuestros cursos
5️⃣ *Ubicación* — dónde estamos
6️⃣ *Hablar con una persona* del equipo

¿Con qué te ayudo?`

// Horario de atención de recepción (ART). Lun-Vie 8-21, Sáb 10-14, Dom cerrado.
const HORARIO_TXT = 'Lun a Vie de 8 a 21 hs y Sáb de 10 a 14 hs (domingos cerrado)'
function enHorarioAtencion(): boolean {
    const now = new Date(Date.now() - 3 * 3600_000)
    const dow = now.getUTCDay(); const h = now.getUTCHours()
    if (dow === 0) return false            // domingo
    if (dow === 6) return h >= 10 && h < 14 // sábado
    return h >= 8 && h < 21                 // lun-vie
}
function derivarMsg(): string {
    if (enHorarioAtencion()) return `¡Dale! Eso lo dejo coordinado con el equipo y te escribimos en un rato 🙌
Contanos tu consulta y dejanos un teléfono o mail así te respondemos. ¡Gracias!`
    return `¡Dale! Eso lo dejo anotado para el equipo 🙌 Ahora estamos fuera del horario de atención (${HORARIO_TXT}), así que te escribimos apenas abramos.
Dejanos tu consulta y un teléfono o mail así te respondemos. ¡Gracias!`
}
function noEntiendoMsg(): string {
    if (enHorarioAtencion()) return `Dejame chequear eso con el equipo y te escribimos en un ratito 🙌
Contanos un poco más y dejanos un teléfono o mail así te respondemos. ¡Gracias!`
    return `Dejame que lo vea con el equipo 🙌 Ahora estamos fuera del horario de atención (${HORARIO_TXT}), así que te escribimos apenas abramos.
Contanos un poco más y dejanos un teléfono o mail así te respondemos. ¡Gracias!`
}

function esPedidoHumano(q: string): boolean {
    if (q.trim() === '4' || q.trim() === '6') return true
    return /(asesor|un[ao] persona|con alguien|con una persona|humano|recepci|reclamo|queja|asistencia personalizada|hablar con|atencion personal|me (pueden |podrian )?(llama|contact)|contact(en|arme|enme|ar con)|derivar|representante|encargad|quiero que me (atiendan|llamen|contacten))/.test(q)
}

// Intención de CONCRETAR (anotarse/reservar/pagar/cancelar/factura): fuerza
// derivación a recep aunque la IA no la haya marcado. Nadie pide "hablar con
// una persona": la señal es que quiere HACER algo, no solo informarse.
function esIntencionConcretar(q: string): boolean {
    return /(me quiero|quiero|quisiera|necesito|me gustaria|me interesa|como (hago|puedo) para)\s*(anotar|inscrib|reservar|pagar|senar|abonar|sacar\s*(un\s*)?(turno|lugar|cupo))/.test(q)
        || /(reservame|anotame|inscribime|reservar\s*(la|una|el)?\s*(sala|clase|lugar|turno|cupo)|sacar\s*(un\s*)?turno|guardar(me)?\s*(un\s*)?(lugar|cupo)|lo tomo|me lo (guardas|reservas|guardan)|dame un turno)/.test(q)
        || /(cancelar|reprogramar|pedir factura|quiero factura|necesito factura|hacer(me)? (la )?factura|dar de baja)/.test(q)
}

// Red de seguridad: la IA a veces redacta una derivación pero NO llama a la
// herramienta (queda derivar=false). Si la RESPUESTA suena a derivación, forzamos.
function pareceDerivacion(respuesta: string): boolean {
    const q = norm(respuesta || '')
    return /(dejame|dejanos|pasame|paseme|deja(r|nos)?)\s+(un|tu|el)?\s*(telefono|tel|mail|email|numero|contacto)/.test(q)
        || /(el equipo|la recepcion|una persona del equipo)\s+(te|le)?\s*(escrib|confirm|contact|respond|coordin|ayud)/.test(q)
        || /(te escribimos|te contactamos|te contactan|apenas abramos|cuando abran|lo dejo anotado para el equipo|lo (coordino|dejo coordinado) con el equipo)/.test(q)
}

async function textoRuteado(pregunta: string): Promise<string | null> {
    const q = norm(pregunta || '')
    if (!q.trim()) return MENU

    // Saludo/menú puro (mensajes muy cortos tipo "hola", "buenas")
    if (/^(hola|holis|buenas|buenos dias|buenas tardes|buenas noches|hey|menu|ayuda|opciones|informacion|info)\b[\s!.]*$/.test(q)) return MENU

    // Ubicación
    if (/(donde (estan|queda|es|los encuentro)|direccion|ubicacion|como llego|donde nos|en que (zona|barrio)|mapa|sede)/.test(q) && !/(sala|alquil)/.test(q)) {
        return ubicacion()
    }

    // FAQs (políticas de la escuela)
    if (/(vence|vencimiento|caduc|vigencia|cuanto dura|duran los credito|expira)/.test(q)) {
        return 'Los créditos/packs vencen a los *30 días corridos* desde la compra. ¿Te muestro los precios o las clases?'
    }
    if (/(recuper|si falto|si no voy|si no puedo ir|retirar (la|mi) inscrip|me puedo bajar|darme de baja de la clase)/.test(q)) {
        return 'Si faltás a una clase no se recupera, pero podés *retirar tu inscripción hasta 24 hs antes* de la clase. ¿Te ayudo con algo más?'
    }
    if (/(combinable|no combinable|se combina|puedo usar cualquier pack|pase exclusivo)/.test(q)) {
        return 'Las clases *combinables* se canjean con cualquier pack común. Las *no combinables* tienen sus propios créditos y packs (aparte). ¿Querés que te muestre los precios?'
    }
    if (/(clase de prueba|prueba gratis|puedo probar|una clase gratis|clase gratuita)/.test(q)) {
        return 'No tenemos clase de prueba, pero podés tomar una *clase suelta* cuando quieras. ¿Te muestro los precios o las clases?'
    }
    if (/(que llevo|que llevar|que necesito llevar|que ropa|con que voy|requisitos? para)/.test(q)) {
        return 'Para tu primera clase vení con *ropa cómoda*. ¿Te muestro las clases o los precios?'
    }

    // Alquiler de salas
    const esAlquiler = /(alquil|reserv)/.test(q) || (/\bsala\b/.test(q) && !/clase/.test(q))
    if (esAlquiler) {
        const esDisp = /(libre|disponib|ocupad|reserv|horario)/.test(q)
        const mSala = q.match(/sala\s*(\d+|blanca|negra|completa)/)
        const salaTexto = mSala ? mSala[0] : (/pasillo/.test(q) ? 'pasillo' : '')
        const off = parsearDiaOffset(q)
        if (salaTexto && (off !== null || esDisp)) return disponibilidadAlquiler({ salaTexto, addDays: off ?? 0 })
        const base = await tarifasAlquiler({ salaTexto: salaTexto || undefined })
        if (off !== null && !salaTexto) return base + '\n\n¿De qué sala? Decime la sala (ej: "Sala 1") y te paso los horarios libres de ese día.'
        return base
    }

    // Precios (gana sobre "clase": "cuánto sale una clase" → precios)
    const esPrecio = /(precio|cuesta|cuanto (sale|vale|cuesta|es|sal)|cuanto\s|valor|abono|cuota|pack|salen?|tarifa de clase|arancel)/.test(q)
    if (esPrecio) {
        return preciosPacks({ q })
    }

    // Formaciones
    if (/(formacion|formaciones|curso|carrera|profesorado|elenco de formacion)/.test(q)) {
        return formaciones()
    }

    // Clases (agenda), con filtro por ritmo/profe/día
    const esClase = new RegExp(`(clase|horario|agenda|cartelera|que hay|profe|profesor|hay clase|${RITMOS})`).test(q) || /\b(hoy|manana|semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(q)
    if (esClase) {
        const off = parsearDiaOffset(q)
        if (off !== null) return clasesAgenda({ addDays: off, q })
        if (/(semana|proxim|toda|cartelera|que dias)/.test(q) || new RegExp(`(${RITMOS})`).test(q)) return clasesAgenda({ cuando: 'semana', q })
        return clasesAgenda({ cuando: 'hoy', q })
    }

    // Cómo anotarse / inscribirse
    if (/(como me (anoto|inscribo|sumo)|como anotarme|inscribir|quiero anotarme|quiero tomar clases|empezar clases|probar una clase)/.test(q)) {
        return `Para anotarte podés: entrar a *${WEB}* (ahí ves la cartelera y comprás tu clase/pack), o pasar por recepción. ¿Querés que te muestre las *clases* o los *precios*? También te puedo contactar con una persona.`
    }
    // Medios de pago
    if (/(pagar|como (se )?pag|puedo pag|medios? de pago|forma de pago|acepta|mercado ?pago|transferencia|debito|credito|tarjeta|efectivo|abonar)/.test(q)) {
        return `Podés pagar en *efectivo*, por *transferencia* o con *MercadoPago* (online desde ${WEB}). ¿Te muestro los precios?`
    }
    // Web / redes / tienda
    if (/(pagina|página|web|sitio|link|tienda|comprar online|instagram|redes)/.test(q)) {
        return `🌐 Nuestra web: *${WEB}* — ahí ves la cartelera, comprás clases/packs y más. ¿Buscás algo puntual (clases, precios, alquiler)?`
    }

    // Agradecimiento / cierre
    if (/^(gracias|muchas gracias|joya|genial|perfecto|buenisimo|dale|ok|listo|barbaro|de una)\b[\s!.]*$/.test(q)) {
        return '¡De nada! 😊 Cualquier cosa, escribime. Y si querés hablar con una persona del equipo, decime "quiero hablar con alguien".'
    }

    // No se entendió la consulta → señal para derivar a recepción.
    return null
}

// Router por reglas (fallback): rutea, detecta derivación y limpia *negrita*.
async function responderPorReglas(pregunta: string): Promise<{ respuesta: string; derivar: boolean }> {
    const q = norm(pregunta || '')
    // 1. Pedido explícito de humano → derivar.
    if (esPedidoHumano(q)) return { respuesta: derivarMsg(), derivar: true }
    // 2. Se entendió → responder. No se entendió (null) → derivar a recepción.
    const texto = await textoRuteado(pregunta)
    if (texto === null) return { respuesta: noEntiendoMsg(), derivar: true }
    return { respuesta: texto.replace(/\*/g, ''), derivar: false }
}

// ---------------------------------------------------------------------------
// FASE 2 — Capa de IA (OpenAI function-calling sobre las herramientas reales)
// ---------------------------------------------------------------------------
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const IA_TOOLS = [
    { type: 'function', function: { name: 'clases', description: 'Horarios de clases (Regular/Especial) por día, ritmo o profesor. Usar para "qué clases hay", horarios, profes, "qué días da clase X", cartelera.', parameters: { type: 'object', properties: { dia: { type: 'string', description: 'Completar SOLO si el usuario menciona un día concreto ("hoy", "manana", "sabado", "30/08"). Si el usuario NO menciona un día (ej "clases de jazz", "qué días da clase Nico", "cuándo hay reggaeton"), dejar VACÍO o poner "semana" para ver toda la agenda de la semana. Nunca asumas "hoy".' }, filtro: { type: 'string', description: 'Opcional: estilo/ritmo (ej "jazz", "heels", "ballet") o nombre del profe (ej "Nico Chávez"). Poné el estilo O el nombre del profe, no toda la frase.' } } } } },
    { type: 'function', function: { name: 'formaciones', description: 'Lista las formaciones/cursos disponibles.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'precios', description: 'Precios de clases sueltas y packs. Usar para "cuánto sale/vale", valores, abonos, packs.', parameters: { type: 'object', properties: { termino: { type: 'string', description: 'Opcional: filtro como "suelta", "x4", "ballroom".' } } } } },
    { type: 'function', function: { name: 'alquiler_tarifas', description: 'Tarifas de alquiler de salas (por hora: mañana/noche/finde).', parameters: { type: 'object', properties: { sala: { type: 'string', description: 'Opcional: nombre de sala (ej "sala 1", "blanca", "negra").' } } } } },
    { type: 'function', function: { name: 'alquiler_disponibilidad', description: 'Horarios LIBRES de una sala en un día puntual, con su tarifa. Requiere la sala; el día por defecto es hoy.', parameters: { type: 'object', properties: { sala: { type: 'string', description: 'Nombre de sala (ej "sala 1", "blanca").' }, dia: { type: 'string', description: '"hoy", "manana", día de la semana o fecha "30/08".' } }, required: ['sala'] } } },
    { type: 'function', function: { name: 'ubicacion', description: 'Direcciones de las sedes.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'derivar_a_recepcion', description: 'Derivar a una persona del equipo. Usar PROACTIVAMENTE (la persona no va a pedirlo) cuando: quiere CONCRETAR algo, no solo informarse (anotarse/reservar en firme, sacar un lugar, pagar, señar, coordinar un horario o fecha puntual, cancelar/cambiar, pedir factura, temas de su cuenta o pago); hay un reclamo, queja o problema; es un caso personal o que requiere criterio humano (lesiones, recomendaciones a medida, convenios, eventos, prensa, edades/casos no cubiertos por los datos); o cualquier consulta que las herramientas no puedan responder con certeza. Ante la duda, derivar.', parameters: { type: 'object', properties: { motivo: { type: 'string', description: 'Breve motivo de la derivación.' } } } } },
]

async function ejecutarToolIA(name: string, args: any): Promise<string> {
    try {
        if (name === 'clases') {
            const diaArg = norm(args?.dia || '')
            const filtro = (args?.filtro || '').toString().trim()
            if (/semana|toda|proxim|cartelera|dias|cualquier/.test(diaArg)) return await clasesAgenda({ cuando: 'semana', filtro })
            const off = parsearDiaOffset(diaArg)
            if (off !== null) return await clasesAgenda({ addDays: off, filtro })
            // Sin día explícito: con filtro (profe/estilo) buscamos la semana; si no, hoy.
            if (filtro) return await clasesAgenda({ cuando: 'semana', filtro })
            return await clasesAgenda({ cuando: 'hoy' })
        }
        if (name === 'formaciones') return await formaciones()
        if (name === 'precios') return await preciosPacks({ q: norm(args?.termino || '') })
        if (name === 'alquiler_tarifas') return await tarifasAlquiler({ salaTexto: args?.sala || undefined })
        if (name === 'alquiler_disponibilidad') {
            const off = parsearDiaOffset(norm(args?.dia || ''))
            return await disponibilidadAlquiler({ salaTexto: args?.sala || '', addDays: off ?? 0 })
        }
        if (name === 'ubicacion') return await ubicacion()
        if (name === 'derivar_a_recepcion') return 'DERIVAR'
        return 'Herramienta desconocida.'
    } catch { return 'No pude obtener ese dato en este momento.' }
}

function systemIA(): string {
    const fechaTxt = new Date(Date.now() - 3 * 3600_000).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: TZ })
    return `Sos la atención por chat (Instagram/WhatsApp) de Piso 2, un estudio de danza en CABA con dos sedes (Congreso y Obelisco). Hoy es ${fechaTxt}.

La persona que escribe cree que habla con alguien del estudio (NO sabe que sos un asistente). Mantené ese tono humano, cálido y argentino (de "vos"). Nunca digas que sos un bot/asistente ni "te derivo con una persona": cuando haga falta que siga alguien del equipo, se hace con naturalidad y sin cortar la charla (una persona real del equipo continúa el mismo chat).

ESCRITURA INFORMAL: la gente escribe rápido, con faltas de ortografía, sin tildes, sin signos de interrogación, en minúscula, con abreviaturas ("q", "xq", "pq", "x", "tmb", "dsp", "porfa") y a veces todo junto. Interpretá la INTENCIÓN igual y respondé; NUNCA les pidas que reescriban ni les corrijas la ortografía. Al pasar datos a las herramientas (día, estilo, nombre de profe), escribilos BIEN corregidos (ej: "regeton"→"reggaeton", "contenporaneo"→"contemporáneo", "jaz"→"jazz", "savado"→"sábado", "nyco chaves"→"Nico Chávez").

Respondé con datos REALES obtenidos SOLO con las herramientas. Nunca inventes horarios, precios, profes ni direcciones.

QUÉ RESOLVÉS VOS (respondé directo con las herramientas):
- Información: qué clases/horarios/profes hay, precios y packs, tarifas de alquiler, horarios libres de una sala, formaciones, direcciones, medios de pago, cómo funciona la web.
- Mapeo: clases/horarios/profes → "clases"; cuánto sale/valores → "precios"; alquiler → "alquiler_tarifas", o "alquiler_disponibilidad" si dan una sala y un día; direcciones → "ubicacion"; cursos → "formaciones". Podés encadenar herramientas si hay varias partes.
- IMPORTANTE con "clases": NO asumas "hoy". Si el usuario pregunta por un profe o un estilo, o "qué días/cuándo da clase X", llamá a "clases" SIN "dia" (o dia="semana") para ver toda la semana. Solo poné "dia" si el usuario nombra un día puntual. Si la herramienta dice que no encontró a ese profe/estilo, no muestres otras clases como si nada: contale que no lo encontraste y ofrecé derivar.

CUÁNDO DERIVÁS (usá "derivar_a_recepcion" — la persona no lo va a pedir, detectalo vos):
- INTENCIÓN DE CONCRETAR: si expresa que quiere HACER o CERRAR algo, derivá siempre (aunque ya le hayas dado info). Señales: "me quiero anotar", "quiero reservar/reservame/me lo guardás", "lo tomo", "quiero pagar/señar", "cómo me inscribo en X", da un horario o fecha puntual para reservar, quiere cancelar o cambiar, o pide factura.
- PROBLEMAS: reclamos, quejas, "pagué y no me llegó", "me cobraron mal", "no puedo entrar a la web", temas de su cuenta o pago.
- FUERA DE LOS DATOS: si preguntan algo puntual que las herramientas NO cubren (edades/niños, niveles, si es apto principiantes, requisitos, lesiones, convenios, eventos, prensa), NO lo afirmes ni lo niegues (no inventes): derivá para que el equipo confirme.
- Cualquier cosa que no puedas responder con certeza. Ante la duda entre responder o derivar, DERIVÁ.

Para dudas de SOLO información (qué clases hay, precios, horarios libres, direcciones, formaciones) respondé vos directo, sin derivar.

CÓMO DERIVAR (sin romper el tono humano): respondé lo que puedas al toque y ofrecé seguir; pedile un teléfono o mail y un horario, y decile que en un rato le confirman. Ej: "Buenísimo, eso lo dejo coordinado con el equipo y te escribimos en un rato 🙌 ¿me pasás un teléfono o mail por las dudas?".

FAQs (respondé directo con estos datos, sin derivar):
- Créditos/packs: vencen a los 30 días corridos desde la compra.
- Inasistencias: si faltás NO se recupera; podés retirar tu inscripción a una clase hasta 24 hs antes.
- Clases "combinables": se canjean con cualquier pack común. "No combinables": tienen sus propios créditos y packs (aparte).
- No hay clase de prueba (pueden tomar una clase suelta).
- Primera clase: ropa cómoda. Si preguntan por edad mínima o clases para niños, NO lo afirmes ni lo niegues: derivá.
- Para packs y valores usá la herramienta "precios".

HORARIO de recepción: ${HORARIO_TXT}. Ahora mismo recepción está ${enHorarioAtencion() ? 'ABIERTA' : 'CERRADA'}. Cuando derives con recepción CERRADA, NO digas "en un rato": aclarale con amabilidad que el equipo le responde en el horario de atención (apenas abran), y pedile igual un teléfono o mail.

ESTILO: respuestas breves y claras, listas para un chat. Emojis con moderación. Sin asteriscos ni markdown. Si es solo un saludo, saludá cálido y preguntá en qué ayudás. La web es ${WEB}; se paga en efectivo, transferencia o MercadoPago.`
}

// Devuelve null si no hay key o la IA falla → el llamador cae a reglas.
// `historial` = turnos previos de ESTE contacto (para conversación con contexto).
async function responderConIA(pregunta: string, historial: { de: string; texto: string }[] = []): Promise<{ respuesta: string; derivar: boolean } | null> {
    const key = process.env.OPENAI_API_KEY
    if (!key || !pregunta?.trim()) return null
    try {
        const messages: any[] = [{ role: 'system', content: systemIA() }]
        for (const h of historial.slice(-8)) {
            const t = (h?.texto || '').trim()
            if (t) messages.push({ role: h.de === 'bot' ? 'assistant' : 'user', content: t })
        }
        messages.push({ role: 'user', content: pregunta })
        let derivar = false
        for (let paso = 0; paso < 4; paso++) {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: OPENAI_MODEL, temperature: 0.3, messages, tools: IA_TOOLS, tool_choice: 'auto' }),
            })
            if (!resp.ok) return null
            const json: any = await resp.json().catch(() => null)
            const msg = json?.choices?.[0]?.message
            if (!msg) return null
            messages.push(msg)
            const calls = msg.tool_calls || []
            if (calls.length) {
                for (const tc of calls) {
                    let args: any = {}
                    try { args = JSON.parse(tc.function?.arguments || '{}') } catch { /* args vacíos */ }
                    const out = await ejecutarToolIA(tc.function?.name, args)
                    if (tc.function?.name === 'derivar_a_recepcion') derivar = true
                    messages.push({ role: 'tool', tool_call_id: tc.id, content: out === 'DERIVAR' ? 'La consulta necesita seguimiento de una persona del equipo. Respondé con naturalidad, SIN decir que sos un bot ni "te derivo con una persona": ofrecé que el equipo lo sigue/coordina, pedile un teléfono o mail y un horario, y decile que en un rato le escriben.' : out })
                }
                continue
            }
            const texto = (msg.content || '').replace(/\*/g, '').trim()
            if (!texto) return null
            return { respuesta: texto, derivar }
        }
        return null
    } catch { return null }
}

// Núcleo público: intenta la IA (Fase 2); si no hay key o falla, cae al router
// por reglas. Devuelve `derivar` para que ManyChat/la API avisen a recepción.
export async function responderAsistente(pregunta: string, historial: { de: string; texto: string }[] = []): Promise<{ respuesta: string; derivar: boolean }> {
    const q = norm(pregunta || '')
    // Pedido explícito de humano → derivar sí o sí (no depende de la IA).
    if (esPedidoHumano(q)) return { respuesta: derivarMsg(), derivar: true }
    // Intención de concretar → forzamos derivar aunque la IA no lo marque.
    const forzarDerivar = esIntencionConcretar(q)
    const ia = await responderConIA(pregunta, historial)
    if (ia) return { respuesta: ia.respuesta, derivar: ia.derivar || forzarDerivar || pareceDerivacion(ia.respuesta) }
    const reglas = await responderPorReglas(pregunta)
    return { respuesta: reglas.respuesta, derivar: reglas.derivar || forzarDerivar }
}
