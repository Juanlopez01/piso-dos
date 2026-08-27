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
const RITMOS = 'jazz contempo|contempo|contemporaneo|jazz fusion|jazz|ballet|clasico|tecnica clasica|tecnica|heels|stiletto|reggaeton|urban|comercial|lyrical|hip hop|dancehall|salsa|folclore|folklore|elongacion|stretching|acrobacia|coreografia|dance|entrenamiento|pole|telas|flexibilidad|ritmos latinos|latinos'

// ---------------------------------------------------------------------------
// HERRAMIENTAS
// ---------------------------------------------------------------------------

// Agenda de clases (Regular/Especial), filtrable por día, ritmo o profesor.
export async function clasesAgenda(opts: { cuando?: 'hoy' | 'manana' | 'semana'; addDays?: number; q?: string } = {}): Promise<string> {
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

    // Filtro por ritmo o por profesor mencionado
    let filtroTxt = ''
    const ritmo = new RegExp(`(${RITMOS})`).exec(q)?.[0]
    if (ritmo) {
        const r = norm(ritmo)
        const f = clases.filter(c => norm(c.nombre).includes(r))
        if (f.length) { clases = f; filtroTxt = ` de ${ritmo}` }
    } else {
        const profeMatch = clases.find(c => {
            const p = norm(profeDe(c)); const pn = p.split(' ')[0]
            return p && (q.includes(p) || (pn.length >= 4 && q.includes(pn)))
        })
        if (profeMatch) {
            const pn = norm(profeDe(profeMatch)).split(' ')[0]
            clases = clases.filter(c => norm(profeDe(c)).includes(pn))
            filtroTxt = ` con ${profeDe(profeMatch)}`
        }
    }

    const cuandoTxt = diaEsp ? etiquetaDia(opts.addDays!) : cuando === 'hoy' ? 'hoy' : cuando === 'manana' ? 'mañana' : 'esta semana'
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

const DERIVAR_MSG = `🙋 Te derivo con una persona del equipo de Piso 2.
Contanos tu consulta y dejanos un teléfono o mail, y te respondemos apenas podamos. ¡Gracias!`

const NO_ENTIENDO_MSG = `Uf, esa consulta no la entendí bien 🤔 Te derivo con una persona del equipo de Piso 2 para que te ayude.
Contanos un poco más y dejanos un teléfono o mail, y te respondemos apenas podamos. ¡Gracias!`

function esPedidoHumano(q: string): boolean {
    if (q.trim() === '4' || q.trim() === '6') return true
    return /(asesor|un[ao] persona|con alguien|con una persona|humano|recepci|reclamo|queja|asistencia personalizada|hablar con|atencion personal|me (pueden |podrian )?(llama|contact)|contact(en|arme|enme|ar con)|derivar|representante|encargad|quiero que me (atiendan|llamen|contacten))/.test(q)
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

// Núcleo público: rutea, detecta derivación, y limpia el formato *negrita*
// (en Instagram los asteriscos se ven literales). Devuelve `derivar` para que
// ManyChat/nuestra API avisen a recepción.
export async function responderAsistente(pregunta: string): Promise<{ respuesta: string; derivar: boolean }> {
    const q = norm(pregunta || '')
    // 1. Pedido explícito de humano → derivar.
    if (esPedidoHumano(q)) return { respuesta: DERIVAR_MSG.replace(/\*/g, ''), derivar: true }
    // 2. Se entendió → responder. No se entendió (null) → derivar a recepción.
    const texto = await textoRuteado(pregunta)
    if (texto === null) return { respuesta: NO_ENTIENDO_MSG.replace(/\*/g, ''), derivar: true }
    return { respuesta: texto.replace(/\*/g, ''), derivar: false }
}
