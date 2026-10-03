'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// ============================================================================
// MÉTRICAS DE RECEPCIÓN — recuento de lo que hizo cada recep/aux a través de la
// página en un rango de fechas: turnos y horas, plata movida en su caja, ventas
// de clases en su turno, y mensajes respondidos a consultas. Solo admin.
//
// Todo lo que medimos se ATRIBUYE por datos reales del sistema:
//   · Turnos y horas:            caja_turnos.usuario_id
//   · Plata / ventas en su caja: caja_movimientos.turno_id -> caja_turnos.usuario_id
//   · Mensajes respondidos:      asistente_consulta_mensajes (de='recep', autor_id)
// ============================================================================

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

async function requireAdmin() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false as const, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol, admin_finanzas').eq('id', session.user.id).single()
    if (perfil?.rol !== 'admin' && !perfil?.admin_finanzas) return { ok: false as const, error: 'Solo administración puede ver las métricas.' }
    return { ok: true as const, userId: session.user.id }
}

const MAX_HORAS = 12 // mismo tope que el editor de horas (abiertos no inflan)

export type MetricaRecep = {
    id: string
    nombre: string
    rol: string
    turnos: number
    turnosAbiertos: number     // turnos que quedaron sin cerrar (mala práctica)
    horas: number
    ingresos: number           // plata que entró en su caja
    egresos: number
    ventas: number             // cantidad de ventas de clases/packs en su turno
    ventasMonto: number        // $ de esas ventas
    movimientos: number        // cantidad de movimientos de caja cargados
    mensajes: number           // respuestas enviadas a consultas
    contactos: number          // contactos distintos atendidos
    sedes: string[]
}

export async function getMetricasRecepAction(desdeISO: string, hastaISO: string) {
    const perm = await requireAdmin()
    if (!perm.ok) return { ok: false as const, error: perm.error, recep: [] as MetricaRecep[] }
    const admin = getAdminClient()

    // 1) Staff de recepción (recep + auxiliar).
    const { data: staff } = await admin.from('profiles')
        .select('id, nombre_completo, rol').in('rol', ['recepcion', 'auxiliar']).order('nombre_completo')
    const personas = (staff || []) as any[]
    if (!personas.length) return { ok: true as const, desde: desdeISO, hasta: hastaISO, recep: [] }
    const ids = personas.map(p => p.id)

    // 2) Turnos de caja en el rango (por apertura).
    const { data: turnosData } = await admin.from('caja_turnos')
        .select('id, usuario_id, fecha_apertura, fecha_cierre, estado, sede:sedes(nombre)')
        .in('usuario_id', ids).gte('fecha_apertura', desdeISO).lt('fecha_apertura', hastaISO)

    const turnoUsuario: Record<string, string> = {}
    const base: Record<string, MetricaRecep> = {}
    for (const p of personas) {
        base[p.id] = {
            id: p.id, nombre: p.nombre_completo || 'Sin nombre', rol: p.rol,
            turnos: 0, turnosAbiertos: 0, horas: 0, ingresos: 0, egresos: 0,
            ventas: 0, ventasMonto: 0, movimientos: 0, mensajes: 0, contactos: 0, sedes: [],
        }
    }
    for (const t of (turnosData || []) as any[]) {
        const m = base[t.usuario_id]; if (!m) continue
        turnoUsuario[t.id] = t.usuario_id
        m.turnos++
        const abierto = !t.fecha_cierre
        if (abierto) m.turnosAbiertos++
        const fin = abierto ? Date.now() : new Date(t.fecha_cierre).getTime()
        let horas = (fin - new Date(t.fecha_apertura).getTime()) / 3600000
        if (horas < 0) horas = 0
        if (horas > MAX_HORAS) horas = MAX_HORAS
        m.horas += horas
        const sede = Array.isArray(t.sede) ? t.sede[0]?.nombre : t.sede?.nombre
        if (sede && !m.sedes.includes(sede)) m.sedes.push(sede)
    }

    // 3) Movimientos de caja de esos turnos (plata + ventas de clases).
    const turnoIds = Object.keys(turnoUsuario)
    if (turnoIds.length) {
        const { data: movs } = await admin.from('caja_movimientos')
            .select('turno_id, tipo, monto, origen_referencia').in('turno_id', turnoIds)
        for (const mv of (movs || []) as any[]) {
            const uid = turnoUsuario[mv.turno_id]; const m = uid && base[uid]; if (!m) continue
            m.movimientos++
            const monto = Number(mv.monto || 0)
            if (mv.tipo === 'egreso') m.egresos += monto
            else {
                m.ingresos += monto
                if (mv.origen_referencia === 'inscripcion') { m.ventas++; m.ventasMonto += monto }
            }
        }
    }

    // 4) Respuestas a consultas (mensajes de la recep en la bandeja).
    const { data: msgs } = await admin.from('asistente_consulta_mensajes')
        .select('autor_id, consulta_id').eq('de', 'recep').in('autor_id', ids)
        .gte('created_at', desdeISO).lt('created_at', hastaISO)
    const contactosSet: Record<string, Set<string>> = {}
    for (const msg of (msgs || []) as any[]) {
        const m = base[msg.autor_id]; if (!m) continue
        m.mensajes++
        ;(contactosSet[msg.autor_id] ||= new Set()).add(msg.consulta_id)
    }
    for (const uid of Object.keys(contactosSet)) base[uid].contactos = contactosSet[uid].size

    // Redondeo de horas y orden por horas trabajadas (más activo primero).
    const recep = Object.values(base)
        .map(m => ({ ...m, horas: Math.round(m.horas * 10) / 10, ingresos: Math.round(m.ingresos), egresos: Math.round(m.egresos), ventasMonto: Math.round(m.ventasMonto) }))
        .sort((a, b) => b.horas - a.horas || b.ingresos - a.ingresos)

    return { ok: true as const, desde: desdeISO, hasta: hastaISO, recep }
}
