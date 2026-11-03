'use server'

// ============================================================================
// ALQUILER DE SALA AUTOMÁTICO (online) — Fase 1
// Autoservicio para el USUARIO LOGUEADO de 2M: elige sala + fecha + horario,
// ve el precio en vivo y reserva pagando la SEÑA (50%) por MP. La seña le guarda
// la sala; el saldo se paga después (online o en el lugar).
//
// Disponibilidad = cruza clases + otros alquileres + obras (eventos con sala).
// El cobro lo confirma el webhook (tipo_pago='alquiler') y cae en el pozo.
// ============================================================================

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { montoAlquiler, senaDe } from '@/lib/alquiler-tarifa'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const TIPOS_USO = ['ensayo', 'clase', 'produccion']
const HOLD_MIN = 15 // minutos que se guarda la sala sin pagar la seña

async function usuario(): Promise<{ id: string; nombre: string; email: string | null; telefono: string | null } | null> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return null
    const { data: p } = await supabase.from('profiles').select('nombre_completo, email, telefono').eq('id', session.user.id).maybeSingle()
    return { id: session.user.id, nombre: p?.nombre_completo || 'Usuario', email: p?.email || session.user.email || null, telefono: p?.telefono || null }
}

// Salas (con sede + tarifas) para el wizard. Requiere sesión.
export async function getSalasAlquilerAction() {
    if (!(await usuario())) return []
    const admin = getAdminClient()
    const { data } = await admin.from('salas').select('*, sede:sedes(nombre)').order('nombre', { ascending: true })
    return data || []
}

const fmtAR = (iso: string) => new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso))

// Rangos ocupados de una sala en una fecha (YYYY-MM-DD), en hora de pared AR.
// Cruza clases + alquileres activos (no vencidos) + obras (eventos con sala).
export async function getOcupacionAlquilerAction(salaId: string, fecha: string): Promise<{ ini: string; fin: string; motivo: string }[]> {
    if (!salaId || !fecha || !(await usuario())) return []
    const admin = getAdminClient()
    const desde = `${fecha}T00:00:00-03:00`
    const hasta = `${fecha}T23:59:59-03:00`
    const out: { ini: string; fin: string; motivo: string }[] = []

    // Clases (timestamptz)
    const { data: clases } = await admin.from('clases')
        .select('inicio, fin, nombre').eq('sala_id', salaId).neq('estado', 'cancelada')
        .gte('inicio', desde).lte('inicio', hasta)
    for (const c of (clases || [])) out.push({ ini: fmtAR(c.inicio), fin: fmtAR(c.fin), motivo: 'Clase' })

    // Alquileres (fecha + horas de pared); pendientes vencidos NO bloquean.
    const ahora = Date.now()
    const { data: alqs } = await admin.from('alquileres')
        .select('hora_inicio, hora_fin, estado, reservado_hasta')
        .eq('sala_id', salaId).eq('fecha', fecha).in('estado', ['confirmado', 'pagado', 'pendiente'])
    for (const a of (alqs || [])) {
        if (a.estado === 'pendiente' && a.reservado_hasta && new Date(a.reservado_hasta).getTime() < ahora) continue
        if (a.hora_inicio && a.hora_fin) out.push({ ini: a.hora_inicio.slice(0, 5), fin: a.hora_fin.slice(0, 5), motivo: 'Alquiler' })
    }

    // Obras (eventos con sala asignada). Si no tienen fin, asumimos 3hs.
    const { data: obras } = await admin.from('eventos')
        .select('fecha, fecha_fin, nombre').eq('sala_id', salaId).eq('cancelado', false)
        .gte('fecha', desde).lte('fecha', hasta)
    for (const o of (obras || [])) {
        const fin = o.fecha_fin || new Date(new Date(o.fecha).getTime() + 3 * 60 * 60 * 1000).toISOString()
        out.push({ ini: fmtAR(o.fecha), fin: fmtAR(fin), motivo: 'Obra' })
    }

    return out.sort((a, b) => a.ini.localeCompare(b.ini))
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0) }

// Crea la reserva en estado 'pendiente' con hold de 15 min y devuelve la seña.
// Revalida disponibilidad y recalcula el monto en el server (no confía en el cliente).
export async function crearReservaAlquilerAction(payload: {
    salaId: string; tipoUso: string; fecha: string; horaInicio: string; horaFin: string; personas?: number
}): Promise<{ ok: boolean; error?: string; alquilerId?: string; sena?: number; monto?: number }> {
    const u = await usuario()
    if (!u) return { ok: false, error: 'Tenés que iniciar sesión.' }
    const { salaId, tipoUso, fecha, horaInicio, horaFin } = payload
    if (!salaId || !fecha || !horaInicio || !horaFin) return { ok: false, error: 'Faltan datos de la reserva.' }
    if (!TIPOS_USO.includes(tipoUso)) return { ok: false, error: 'Actividad inválida.' }

    const ini = toMin(horaInicio), fin = toMin(horaFin)
    if (fin - ini < 60) return { ok: false, error: 'El mínimo es 1 hora.' }
    if (ini % 30 !== 0 || fin % 30 !== 0) return { ok: false, error: 'Los bloques son de 30 minutos.' }
    // No permitir fechas pasadas, ni horarios ya pasados si la fecha es hoy.
    const hoy = fmtFechaHoy()
    if (fecha < hoy) return { ok: false, error: 'Elegí una fecha futura.' }
    if (fecha === hoy && ini <= ahoraMinAR()) return { ok: false, error: 'Ese horario ya pasó. Elegí uno más tarde.' }

    const admin = getAdminClient()
    const { data: sala } = await admin.from('salas').select('*').eq('id', salaId).maybeSingle()
    if (!sala) return { ok: false, error: 'Sala no encontrada.' }

    const monto = montoAlquiler(sala, tipoUso, fecha, horaInicio, horaFin)
    if (monto <= 0) return { ok: false, error: 'No se pudo calcular la tarifa de esta sala.' }
    const sena = senaDe(monto)

    // Re-chequeo de disponibilidad (por si tomaron el slot mientras elegía).
    const ocup = await getOcupacionAlquilerAction(salaId, fecha)
    const pisa = ocup.some(o => ini < toMin(o.fin) && fin > toMin(o.ini))
    if (pisa) return { ok: false, error: 'Ese horario ya no está disponible. Elegí otro.' }

    const reservadoHasta = new Date(Date.now() + HOLD_MIN * 60 * 1000).toISOString()
    const { data: ins, error } = await admin.from('alquileres').insert({
        sala_id: salaId,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        tipo_uso: tipoUso,
        cantidad_personas: payload.personas && payload.personas > 0 ? Math.floor(payload.personas) : 1,
        monto_total: monto,
        monto_pagado: 0,
        sena_monto: sena,
        estado: 'pendiente',
        estado_pago: 'pendiente',
        user_id: u.id,
        cliente_nombre: u.nombre,
        cliente_email: u.email,
        cliente_telefono: u.telefono,
        cliente_contacto: u.telefono || u.email,
        origen: 'online',
        reservado_hasta: reservadoHasta,
    }).select('id').single()
    if (error) return { ok: false, error: error.message }

    return { ok: true, alquilerId: ins.id, sena, monto }
}

function fmtFechaHoy(): string {
    // Fecha de hoy en AR como YYYY-MM-DD.
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    return partes // en-CA da YYYY-MM-DD
}

function ahoraMinAR(): number {
    // Minutos transcurridos del día actual en hora AR.
    const [h, m] = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number)
    return h * 60 + (m || 0)
}

// Lectura para la página de pago / resultado: la reserva del usuario logueado.
export async function getMiReservaAlquilerAction(alquilerId: string) {
    const u = await usuario()
    if (!u || !alquilerId) return null
    const admin = getAdminClient()
    const { data } = await admin.from('alquileres')
        .select('id, fecha, hora_inicio, hora_fin, monto_total, monto_pagado, sena_monto, estado, estado_pago, user_id, sala:salas(nombre, sede:sedes(nombre))')
        .eq('id', alquilerId).maybeSingle()
    if (!data || data.user_id !== u.id) return null
    return data
}
