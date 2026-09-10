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
    if (!['admin', 'recepcion'].includes(p?.rol || '')) return { ok: false as const, error: 'Sin permisos' }
    return { ok: true as const }
}

const labelFecha = (iso: string) => {
    const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}
const profeDe = (rel: any) => (Array.isArray(rel) ? rel[0]?.nombre_completo : rel?.nombre_completo) || ''

// Lista de clases (agrupadas por serie) que tuvieron sesiones en el mes, para el
// selector. Una "clase" = serie_id (o nombre+profe si no tiene serie).
export async function getResumenClasesListaAction(anio: number, mes: number) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, grupos: [] as any[] }
    const admin = getAdminClient()
    const desde = new Date(Date.UTC(anio, mes - 1, 1, 3)).toISOString()
    const hasta = new Date(Date.UTC(anio, mes, 1, 3)).toISOString()

    const { data: clases } = await admin.from('clases')
        .select('id, nombre, serie_id, profesor_id, inicio, tipo_clase, profesor:profiles!clases_profesor_id_fkey(nombre_completo)')
        .gte('inicio', desde).lt('inicio', hasta)
        .eq('es_alquiler', false).neq('estado', 'cancelada')
        .in('tipo_clase', ['Regular', 'Especial'])
        .order('inicio', { ascending: true })

    const grupos: Record<string, any> = {}
    for (const c of (clases || []) as any[]) {
        const key = c.serie_id || `N:${c.nombre}|${c.profesor_id}`
        if (!grupos[key]) grupos[key] = { key, nombre: c.nombre, profe: profeDe(c.profesor), sesiones: [] }
        grupos[key].sesiones.push({ id: c.id, inicio: c.inicio, label: labelFecha(c.inicio) })
    }

    // Inscriptos por grupo (para mostrar un contador en el selector).
    const todosIds = (clases || []).map((c: any) => c.id)
    const inscPorClase: Record<string, number> = {}
    if (todosIds.length) {
        const { data: insc } = await admin.from('inscripciones').select('clase_id').in('clase_id', todosIds)
        for (const i of (insc || []) as any[]) inscPorClase[i.clase_id] = (inscPorClase[i.clase_id] || 0) + 1
    }
    const lista = Object.values(grupos).map((g: any) => {
        const ins = g.sesiones.reduce((a: number, s: any) => a + (inscPorClase[s.id] || 0), 0)
        return { ...g, nSesiones: g.sesiones.length, nInscripciones: ins }
    }).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre))

    return { ok: true as const, grupos: lista }
}

// Detalle de una clase (grilla alumnos × fechas). Recibe los clase_id de las
// sesiones del mes (los trae el selector). Recaudado = valor por clase usada.
export async function getResumenClaseAction(claseIds: string[]) {
    const perm = await requireStaff()
    if (!perm.ok) return { ok: false as const, error: perm.error, alumnos: [] as any[] }
    const admin = getAdminClient()
    if (!claseIds?.length) return { ok: true as const, alumnos: [], totalesPorFecha: {}, recaudado: 0, totalAlumnos: 0 }

    const { data: insc } = await admin.from('inscripciones')
        .select('clase_id, user_id, nombre_invitado, estado_asistencia, presente, modalidad, valor_credito, pack_usado_id')
        .in('clase_id', claseIds)

    const rows = (insc || []) as any[]
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))]
    const packIds = [...new Set(rows.map(r => r.pack_usado_id).filter(Boolean))]

    const prof: Record<string, any> = {}
    if (userIds.length) {
        const { data: p } = await admin.from('profiles').select('id, nombre_completo, telefono, email').in('id', userIds)
        for (const x of (p || []) as any[]) prof[x.id] = x
    }
    const packSize: Record<string, number> = {}
    if (packIds.length) {
        const { data: pk } = await admin.from('alumno_packs').select('id, cantidad_inicial').in('id', packIds)
        for (const x of (pk || []) as any[]) packSize[x.id] = x.cantidad_inicial
    }

    // estado_asistencia → marca compacta para la grilla
    const marca = (e: string, presente: boolean) => {
        if (e === 'presente' || (presente && !e)) return '1'
        if (e === 'media_falta') return '½'
        if (e === 'justificada') return 'J'
        if (e === 'ausente') return '·'
        return presente ? '1' : ''
    }

    const alumnos: Record<string, any> = {}
    const totalesPorFecha: Record<string, number> = {}
    let recaudado = 0

    for (const r of rows) {
        const key = r.user_id || `inv:${r.nombre_invitado || 's/n'}`
        if (!alumnos[key]) {
            const p = r.user_id ? prof[r.user_id] : null
            alumnos[key] = {
                key, userId: r.user_id || null,
                nombre: p?.nombre_completo || r.nombre_invitado || 'Invitado',
                telefono: p?.telefono || null, email: p?.email || null,
                medios: new Set<string>(), pago: 0, asistencias: 0, celdas: {} as Record<string, string>,
            }
        }
        const a = alumnos[key]
        const m = marca(r.estado_asistencia, r.presente)
        a.celdas[r.clase_id] = m
        const asistio = r.estado_asistencia === 'presente' || (r.presente && r.estado_asistencia !== 'ausente')
        if (asistio) { a.asistencias += 1; totalesPorFecha[r.clase_id] = (totalesPorFecha[r.clase_id] || 0) + 1 }
        // Valor por clase usada: cada inscripción que consumió crédito/pago suma.
        const v = Number(r.valor_credito || 0)
        a.pago += v; recaudado += v
        if (r.pack_usado_id && packSize[r.pack_usado_id]) a.medios.add(`X${packSize[r.pack_usado_id]}`)
        else if (r.modalidad) a.medios.add(r.modalidad === 'Pack' ? 'Pack' : r.modalidad === 'Crédito' ? 'Créd.' : r.modalidad === 'Suelta' ? 'Suelta' : r.modalidad)
    }

    const listaAlumnos = Object.values(alumnos)
        .map((a: any) => ({ ...a, medio: [...a.medios].join(' / ') || '—' }))
        .sort((a: any, b: any) => b.pago - a.pago || a.nombre.localeCompare(b.nombre))
        .map(({ medios, ...a }: any) => a)

    return {
        ok: true as const,
        alumnos: listaAlumnos,
        totalesPorFecha,
        recaudado,
        totalAlumnos: listaAlumnos.length,
    }
}
