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
import crypto from 'crypto'

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

type SlotInput = { salaId: string; tipoUso: string; fecha: string; horaInicio: string; horaFin: string; personas?: number }
type UsuarioRow = NonNullable<Awaited<ReturnType<typeof usuario>>>

// Valida un slot y arma la fila de insert (sin group_id/reservado_hasta, que se setean afuera).
// `otros` = slots ya aceptados en el MISMO batch, para detectar superposición intra-reserva.
async function prepararSlot(admin: ReturnType<typeof getAdminClient>, u: UsuarioRow, s: SlotInput, otros: { salaId: string; fecha: string; ini: number; fin: number }[]): Promise<
    { ok: true; row: Record<string, any>; sena: number; monto: number; ini: number; fin: number } | { ok: false; error: string }
> {
    if (!s.salaId || !s.fecha || !s.horaInicio || !s.horaFin) return { ok: false, error: 'Faltan datos de la reserva.' }
    if (!TIPOS_USO.includes(s.tipoUso)) return { ok: false, error: 'Actividad inválida.' }
    const ini = toMin(s.horaInicio), fin = toMin(s.horaFin)
    const etq = `(${s.fecha} ${s.horaInicio}) `
    if (fin - ini < 60) return { ok: false, error: etq + 'El mínimo es 1 hora.' }
    if (ini % 30 !== 0 || fin % 30 !== 0) return { ok: false, error: etq + 'Los bloques son de 30 minutos.' }
    const hoy = fmtFechaHoy()
    if (s.fecha < hoy) return { ok: false, error: etq + 'Elegí una fecha futura.' }
    if (s.fecha === hoy && ini <= ahoraMinAR()) return { ok: false, error: etq + 'Ese horario ya pasó.' }

    const { data: sala } = await admin.from('salas').select('*').eq('id', s.salaId).maybeSingle()
    if (!sala) return { ok: false, error: 'Sala no encontrada.' }
    const monto = montoAlquiler(sala, s.tipoUso, s.fecha, s.horaInicio, s.horaFin)
    if (monto <= 0) return { ok: false, error: etq + 'No se pudo calcular la tarifa de esta sala.' }
    const sena = senaDe(monto)

    // Choque contra la DB.
    const ocup = await getOcupacionAlquilerAction(s.salaId, s.fecha)
    if (ocup.some(o => ini < toMin(o.fin) && fin > toMin(o.ini))) return { ok: false, error: etq + 'Ese horario ya no está disponible.' }
    // Choque contra otros slots del mismo batch (misma sala + fecha).
    if (otros.some(o => o.salaId === s.salaId && o.fecha === s.fecha && ini < o.fin && fin > o.ini)) return { ok: false, error: etq + 'Se superpone con otra fecha que agregaste.' }

    const row: Record<string, any> = {
        sala_id: s.salaId, fecha: s.fecha, hora_inicio: s.horaInicio, hora_fin: s.horaFin,
        tipo_uso: s.tipoUso,
        cantidad_personas: s.personas && s.personas > 0 ? Math.floor(s.personas) : 1,
        monto_total: monto, monto_pagado: 0, sena_monto: sena,
        estado: 'pendiente', estado_pago: 'pendiente',
        user_id: u.id, cliente_nombre: u.nombre, cliente_email: u.email,
        cliente_telefono: u.telefono, cliente_contacto: u.telefono || u.email,
        origen: 'online',
    }
    return { ok: true, row, sena, monto, ini, fin }
}

// Crea 1..N reservas (multi-día) en estado 'pendiente' con hold de 15 min. Si son
// varias comparten group_id. Valida y recalcula todo en el server; si algún slot
// falla, NO inserta nada (todo o nada). Devuelve la seña total a pagar por MP.
export async function crearReservasAlquilerGrupoAction(slots: SlotInput[]): Promise<{
    ok: boolean; error?: string; groupId?: string; alquilerIds?: string[]; sena?: number; monto?: number; count?: number
}> {
    const u = await usuario()
    if (!u) return { ok: false, error: 'Tenés que iniciar sesión.' }
    if (!Array.isArray(slots) || slots.length === 0) return { ok: false, error: 'Agregá al menos una fecha.' }
    if (slots.length > 12) return { ok: false, error: 'Máximo 12 reservas por operación.' }

    const admin = getAdminClient()
    const aceptados: { salaId: string; fecha: string; ini: number; fin: number }[] = []
    const filas: Record<string, any>[] = []
    let totalSena = 0, totalMonto = 0
    for (const s of slots) {
        const r = await prepararSlot(admin, u, s, aceptados)
        if (!r.ok) return { ok: false, error: r.error }
        aceptados.push({ salaId: s.salaId, fecha: s.fecha, ini: r.ini, fin: r.fin })
        filas.push(r.row)
        totalSena += r.sena
        totalMonto += r.monto
    }

    const reservadoHasta = new Date(Date.now() + HOLD_MIN * 60 * 1000).toISOString()
    const groupId = filas.length > 1 ? crypto.randomUUID() : null
    for (const f of filas) { f.reservado_hasta = reservadoHasta; if (groupId) f.group_id = groupId }

    const { data: ins, error } = await admin.from('alquileres').insert(filas).select('id')
    if (error) return { ok: false, error: error.message }

    return { ok: true, groupId: groupId || undefined, alquilerIds: (ins || []).map((r: any) => r.id), sena: totalSena, monto: totalMonto, count: filas.length }
}

// Compat: reserva de un solo slot (usa el flujo de grupo con 1 elemento).
export async function crearReservaAlquilerAction(payload: SlotInput): Promise<{ ok: boolean; error?: string; alquilerId?: string; sena?: number; monto?: number }> {
    const r = await crearReservasAlquilerGrupoAction([payload])
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, alquilerId: r.alquilerIds?.[0], sena: r.sena, monto: r.monto }
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
        .select('id, fecha, hora_inicio, hora_fin, monto_total, monto_pagado, sena_monto, estado, estado_pago, user_id, group_id, sala:salas(nombre, sede:sedes(nombre))')
        .eq('id', alquilerId).maybeSingle()
    if (!data || data.user_id !== u.id) return null
    return data
}

// ── FASE 2: Mis reservas + cancelación (política 48hs) + saldo ────────────────

// Horas (AR) desde ahora hasta el inicio de una reserva. Negativo = ya pasó.
function horasHastaAR(fecha: string, horaInicio: string): number {
    const inicio = new Date(`${fecha}T${(horaInicio || '00:00').slice(0, 5)}:00-03:00`).getTime()
    return (inicio - Date.now()) / 3_600_000
}

export type MiReservaAlquiler = {
    id: string; fecha: string; hora_inicio: string; hora_fin: string; tipo_uso: string | null
    monto_total: number; monto_pagado: number; sena_monto: number; estado: string; estado_pago: string
    group_id: string | null; sala: any
    saldo: number; horasHasta: number; puedeCancelar: boolean; puedePagarSaldo: boolean; senaSeDevuelve: boolean
}

// Reservas del usuario logueado (sin las canceladas), próximas primero, con los
// flags de acción ya calculados (pagar saldo / cancelar / si la seña se devuelve).
export async function getMisReservasAlquilerAction(): Promise<MiReservaAlquiler[]> {
    const u = await usuario()
    if (!u) return []
    const admin = getAdminClient()
    const { data } = await admin.from('alquileres')
        .select('id, fecha, hora_inicio, hora_fin, tipo_uso, monto_total, monto_pagado, sena_monto, estado, estado_pago, group_id, sala:salas(nombre, sede:sedes(nombre))')
        .eq('user_id', u.id).neq('estado', 'cancelado')
        .order('fecha', { ascending: true }).order('hora_inicio', { ascending: true })
    return (data || []).map((r: any) => {
        const saldo = Math.max(0, Number(r.monto_total || 0) - Number(r.monto_pagado || 0))
        const horasHasta = horasHastaAR(r.fecha, r.hora_inicio)
        const activa = r.estado !== 'cancelado' && horasHasta > 0
        return {
            ...r,
            saldo,
            horasHasta,
            puedeCancelar: activa,
            // Puede pagar saldo online si ya confirmó (pagó seña) y le falta plata.
            puedePagarSaldo: activa && saldo > 0 && r.estado_pago === 'seña_pagada',
            senaSeDevuelve: horasHasta >= 48,
        }
    })
}

// Cancela una reserva del usuario. Política: con 48hs+ de anticipación la seña
// queda a favor (la devolución la coordina recepción); dentro de 48hs se pierde.
// La reserva pasa a 'cancelado' y libera el horario automáticamente.
export async function cancelarReservaAlquilerAction(alquilerId: string): Promise<{ ok: boolean; error?: string; senaSeDevuelve?: boolean }> {
    const u = await usuario()
    if (!u || !alquilerId) return { ok: false, error: 'Iniciá sesión.' }
    const admin = getAdminClient()
    const { data: alq } = await admin.from('alquileres')
        .select('id, user_id, fecha, hora_inicio, estado, sena_monto, notas, cliente_nombre, sala:salas(nombre)')
        .eq('id', alquilerId).maybeSingle()
    if (!alq || alq.user_id !== u.id) return { ok: false, error: 'Reserva no encontrada.' }
    if (alq.estado === 'cancelado') return { ok: false, error: 'La reserva ya está cancelada.' }

    const horasHasta = horasHastaAR(alq.fecha, alq.hora_inicio)
    if (horasHasta <= 0) return { ok: false, error: 'La reserva ya pasó, no se puede cancelar.' }
    const senaSeDevuelve = horasHasta >= 48

    const hoyAR = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
    const nota = `[Cancelado por el usuario ${hoyAR}] Seña: ${senaSeDevuelve ? 'a favor (coordinar devolución)' : 'perdida (<48hs)'}.`
    const { error } = await admin.from('alquileres').update({
        estado: 'cancelado',
        reservado_hasta: null,
        notas: alq.notas ? `${alq.notas}\n${nota}` : nota,
    }).eq('id', alquilerId)
    if (error) return { ok: false, error: error.message }

    // Avisar a recepción/admin (para gestionar la devolución si corresponde).
    try {
        const salaNombre = (alq as any).sala?.nombre || 'sala'
        const { data: staff } = await admin.from('profiles').select('id').in('rol', ['admin', 'recepcion'])
        if (staff?.length) await admin.from('notificaciones').insert(staff.map((s: any) => ({
            usuario_id: s.id,
            titulo: '🏠 Alquiler cancelado',
            mensaje: `${alq.cliente_nombre || 'Un usuario'} canceló su alquiler (${salaNombre}, ${alq.fecha}). Seña: ${senaSeDevuelve ? 'a favor' : 'perdida'}.`,
            link: '/alquileres',
            leido: false,
        })))
    } catch { /* best-effort */ }

    return { ok: true, senaSeDevuelve }
}
