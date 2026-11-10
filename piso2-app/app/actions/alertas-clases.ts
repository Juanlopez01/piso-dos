'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

async function requireStaff() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false as const, error: 'No autorizado' }
    const { data: p } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!['admin', 'recepcion', 'auxiliar'].includes(p?.rol || '')) return { ok: false as const, error: 'Sin permisos' }
    return { ok: true as const }
}

// Umbral: clases con MENOS de esta cantidad de alumnos pagos (en el mes) saltan.
const UMBRAL_ALERTA = 5

const profeDe = (rel: any) => (Array.isArray(rel) ? rel[0]?.nombre_completo : rel?.nombre_completo) || ''

export type ClaseAlerta = {
    key: string            // serie_id o N:nombre|profe (mismo criterio que Resumen)
    nombre: string
    profe: string
    sedeNombre: string
    nPagos: number         // alumnos DISTINTOS que pagaron (crédito consumido) en el mes
    nInscriptos: number    // alumnos distintos anotados (pagos o no), para contexto
    nSesiones: number
    receps: string[]       // quién estaba en caja (cubrió) en las sesiones del mes
    proximaSesion: string | null
    claseIds: string[]     // ids de las sesiones del mes (para marcar en el calendario)
}

// Clases (agrupadas por serie) que en el mes tuvieron MENOS de UMBRAL alumnos
// pagos. Para cada una, deriva quién la cubrió (la recep con caja abierta en esa
// sede a la hora de la clase). Pensado para el panel "Clases en alerta" del admin.
export async function getClasesEnAlertaAction(anio: number, mes: number, umbral: number = UMBRAL_ALERTA) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, alertas: [] as ClaseAlerta[], umbral }
    const admin = getAdminClient()

    const desde = new Date(Date.UTC(anio, mes - 1, 1, 3)).toISOString()
    const hasta = new Date(Date.UTC(anio, mes, 1, 3)).toISOString()

    // Clases del mes (regulares/especiales, no canceladas, no alquiler).
    const { data: clases } = await admin.from('clases')
        .select('id, nombre, serie_id, profesor_id, inicio, sala_id, tipo_clase, profesor:profiles!clases_profesor_id_fkey(nombre_completo)')
        .gte('inicio', desde).lt('inicio', hasta)
        .eq('es_alquiler', false).neq('estado', 'cancelada')
        .in('tipo_clase', ['Regular', 'Especial'])
        .order('inicio', { ascending: true })

    const clasesArr = (clases || []) as any[]
    if (!clasesArr.length) return { ok: true as const, alertas: [], umbral }

    // Salas → sede (para nombrar y para cruzar con los turnos de caja).
    const { data: salas } = await admin.from('salas').select('id, sede_id')
    const salaSede = new Map<string, string>()
    for (const s of (salas || []) as any[]) salaSede.set(s.id, s.sede_id)
    const { data: sedes } = await admin.from('sedes').select('id, nombre')
    const sedeNombre = new Map<string, string>()
    for (const s of (sedes || []) as any[]) sedeNombre.set(s.id, s.nombre)

    // Turnos de caja que podrían solapar con el mes (para derivar quién cubrió).
    const desdeTurnos = new Date(Date.UTC(anio, mes - 1, 1, 3) - 24 * 3600_000).toISOString()
    const { data: turnos } = await admin.from('caja_turnos')
        .select('usuario_id, sede_id, fecha_apertura, fecha_cierre')
        .gte('fecha_apertura', desdeTurnos).lt('fecha_apertura', hasta)
    const turnosArr = (turnos || []) as any[]
    const recepIds = [...new Set(turnosArr.map(t => t.usuario_id).filter(Boolean))]
    const recepNombre = new Map<string, string>()
    if (recepIds.length) {
        const { data: ps } = await admin.from('profiles').select('id, nombre_completo').in('id', recepIds)
        for (const p of (ps || []) as any[]) recepNombre.set(p.id, p.nombre_completo || 'Recep')
    }
    // La recep que estaba en una sede a una hora: turno de esa sede cuya ventana
    // (apertura → cierre, o abierto) contiene el inicio de la clase.
    const recepEnMomento = (sedeId: string | undefined, inicioISO: string): string | null => {
        if (!sedeId) return null
        const t = new Date(inicioISO).getTime()
        for (const tr of turnosArr) {
            if (tr.sede_id !== sedeId) continue
            const ap = new Date(tr.fecha_apertura).getTime()
            const ci = tr.fecha_cierre ? new Date(tr.fecha_cierre).getTime() : Infinity
            if (ap <= t && t <= ci) return recepNombre.get(tr.usuario_id) || null
        }
        return null
    }

    // Agrupamos por serie (una "clase" = serie_id, o nombre+profe si no tiene serie).
    type Grupo = {
        key: string; nombre: string; profe: string; sedeId?: string
        sesiones: { id: string; inicio: string }[]
    }
    const grupos = new Map<string, Grupo>()
    for (const c of clasesArr) {
        const key = c.serie_id || `N:${c.nombre}|${c.profesor_id}`
        if (!grupos.has(key)) {
            grupos.set(key, { key, nombre: c.nombre, profe: profeDe(c.profesor), sedeId: salaSede.get(c.sala_id), sesiones: [] })
        }
        grupos.get(key)!.sesiones.push({ id: c.id, inicio: c.inicio })
    }

    // Inscripciones de todas las sesiones del mes (para contar alumnos pagos/anotados).
    const todosIds = clasesArr.map(c => c.id)
    const inscPorClase = new Map<string, { user: string; pago: boolean }[]>()
    if (todosIds.length) {
        const { data: insc } = await admin.from('inscripciones')
            .select('clase_id, user_id, nombre_invitado, valor_credito')
            .in('clase_id', todosIds)
        for (const i of (insc || []) as any[]) {
            const arr = inscPorClase.get(i.clase_id) || []
            arr.push({ user: i.user_id || `inv:${i.nombre_invitado || 's/n'}`, pago: Number(i.valor_credito || 0) > 0 })
            inscPorClase.set(i.clase_id, arr)
        }
    }

    const alertas: ClaseAlerta[] = []
    for (const g of grupos.values()) {
        const pagos = new Set<string>()
        const inscriptos = new Set<string>()
        const receps = new Set<string>()
        let proxima: string | null = null
        for (const s of g.sesiones) {
            for (const r of (inscPorClase.get(s.id) || [])) {
                inscriptos.add(r.user)
                if (r.pago) pagos.add(r.user)
            }
            const rec = recepEnMomento(g.sedeId, s.inicio)
            if (rec) receps.add(rec)
            if (!proxima || s.inicio < proxima) proxima = s.inicio
        }
        if (pagos.size < umbral) {
            alertas.push({
                key: g.key, nombre: g.nombre, profe: g.profe,
                sedeNombre: g.sedeId ? (sedeNombre.get(g.sedeId) || '—') : '—',
                nPagos: pagos.size, nInscriptos: inscriptos.size, nSesiones: g.sesiones.length,
                receps: [...receps], proximaSesion: proxima,
                claseIds: g.sesiones.map(s => s.id),
            })
        }
    }

    // Más flojas primero (menos pagos), después alfabético.
    alertas.sort((a, b) => a.nPagos - b.nPagos || a.nombre.localeCompare(b.nombre))
    return { ok: true as const, alertas, umbral }
}
