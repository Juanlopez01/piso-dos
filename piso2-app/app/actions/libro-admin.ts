'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

// Solo usuarios con el flag admin_finanzas (Nico / Santi). Valida la sesión real.
async function requireFinanzas() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false as const, error: 'No autorizado' }
    const { data: p } = await supabase.from('profiles')
        .select('admin_finanzas, nombre_completo').eq('id', session.user.id).single()
    if (!p?.admin_finanzas) return { ok: false as const, error: 'No tenés acceso al libro de administración.' }
    return { ok: true as const, userId: session.user.id, nombre: (p.nombre_completo || 'Usuario') as string }
}

// Día del mes en ART (UTC-3) a partir de un timestamp de caja.
function diaART(iso: string): number {
    return new Date(new Date(iso).getTime() - 3 * 3600_000).getUTCDate()
}

type Buckets = { ef_ing: number; ef_egr: number; tr_ing: number; tr_egr: number; usd_ing: number; usd_egr: number }
const cero = (): Buckets => ({ ef_ing: 0, ef_egr: 0, tr_ing: 0, tr_egr: 0, usd_ing: 0, usd_egr: 0 })
const netoPesos = (b: Buckets) => (b.ef_ing + b.tr_ing) - (b.ef_egr + b.tr_egr)
const netoDolares = (b: Buckets) => b.usd_ing - b.usd_egr

// ============================================================================
// LIBRO DE ADMINISTRACIÓN — vista mensual, por día.
//   · Automático: las cajas (Obelisco/Congreso) salen de caja_movimientos,
//     una línea por sede y día (efectivo + transferencia).
//   · Manual: lo que cargan Nico/Santi (admin_movimientos), con autor.
//   · Apertura = saldo acumulado del mes anterior (pesos y dólares por separado).
//   · Cierre  = apertura + neto del mes.
// ============================================================================
export async function getLibroAdminAction(anio: number, mes: number) {
    const perm = await requireFinanzas()
    if (!perm.ok) return { success: false as const, error: perm.error }
    const admin = getAdminClient()

    const desdeISO = new Date(anio, mes - 1, 1).toISOString()
    const hastaISO = new Date(anio, mes, 1).toISOString()
    const desdeFecha = `${anio}-${String(mes).padStart(2, '0')}-01`

    // --- Sedes (para nombrar las cajas) ---
    const { data: sedes } = await admin.from('sedes').select('id, nombre')
    const sedeNombre = new Map<string, string>()
    for (const s of (sedes || []) as any[]) sedeNombre.set(s.id, s.nombre)

    // --- APERTURA (saldo mes anterior) ---
    // Caja (siempre pesos): ingreso - egreso de todo lo anterior al mes.
    const { data: cajaPrev } = await admin.from('caja_movimientos')
        .select('tipo, monto').lt('created_at', desdeISO)
    let aperturaPesos = 0
    for (const m of (cajaPrev || []) as any[]) aperturaPesos += (m.tipo === 'egreso' ? -1 : 1) * Number(m.monto || 0)
    // Movimientos manuales anteriores (pesos y dólares por separado).
    const { data: manPrev } = await admin.from('admin_movimientos')
        .select('tipo, metodo, monto').lt('fecha', desdeFecha)
    let aperturaDolares = 0
    for (const m of (manPrev || []) as any[]) {
        const signo = m.tipo === 'egreso' ? -1 : 1
        const monto = signo * Number(m.monto || 0)
        if (m.metodo === 'dolares') aperturaDolares += monto; else aperturaPesos += monto
    }

    // --- CAJAS del mes (automático), agrupadas por día + sede ---
    const { data: cajaMovs } = await admin.from('caja_movimientos')
        .select('tipo, metodo_pago, monto, created_at, turno:caja_turnos(sede_id)')
        .gte('created_at', desdeISO).lt('created_at', hastaISO)

    // key = `${dia}|${sedeId ?? 'pozo'}`
    const cajaAgrup = new Map<string, Buckets>()
    for (const m of (cajaMovs || []) as any[]) {
        const dia = diaART(m.created_at)
        const turno = Array.isArray(m.turno) ? m.turno[0] : m.turno
        const sedeId = turno?.sede_id ?? 'pozo'
        const key = `${dia}|${sedeId}`
        if (!cajaAgrup.has(key)) cajaAgrup.set(key, cero())
        const b = cajaAgrup.get(key)!
        const esEfvo = (m.metodo_pago || 'efectivo') === 'efectivo'
        const monto = Number(m.monto || 0)
        if (m.tipo === 'egreso') { if (esEfvo) b.ef_egr += monto; else b.tr_egr += monto }
        else { if (esEfvo) b.ef_ing += monto; else b.tr_ing += monto }
    }

    // --- MOVIMIENTOS MANUALES del mes ---
    const { data: manMovs } = await admin.from('admin_movimientos')
        .select('id, fecha, concepto, tipo, metodo, monto, created_by, created_at')
        .gte('fecha', desdeFecha).lt('fecha', hastaISO.slice(0, 10))
        .order('created_at', { ascending: true })

    // Nombres de autores
    const autorIds = [...new Set((manMovs || []).map((m: any) => m.created_by).filter(Boolean))]
    const autorNombre = new Map<string, string>()
    if (autorIds.length) {
        const { data: autores } = await admin.from('profiles').select('id, nombre_completo').in('id', autorIds)
        for (const a of (autores || []) as any[]) autorNombre.set(a.id, a.nombre_completo || 'Usuario')
    }

    // --- Armamos entradas por día ---
    type Entrada = Buckets & {
        key: string; auto: boolean; concepto: string
        id?: string; autor?: string; hora?: string
        // datos crudos (solo manuales) para poder editar
        fecha?: string; tipoMov?: string; metodoMov?: string; montoMov?: number
    }
    const porDia = new Map<number, Entrada[]>()
    const push = (dia: number, e: Entrada) => {
        if (!porDia.has(dia)) porDia.set(dia, [])
        porDia.get(dia)!.push(e)
    }

    // Cajas automáticas
    for (const [key, b] of cajaAgrup) {
        const [diaStr, sedeId] = key.split('|')
        const dia = Number(diaStr)
        const nombre = sedeId === 'pozo' ? 'Administración (pozo)' : (sedeNombre.get(sedeId) || 'Caja')
        push(dia, { key: `caja-${key}`, auto: true, concepto: `Caja ${nombre}`, ...b })
    }
    // Manuales
    for (const m of (manMovs || []) as any[]) {
        const dia = new Date(m.fecha + 'T12:00:00').getUTCDate()
        const b = cero()
        const monto = Number(m.monto || 0)
        if (m.metodo === 'dolares') { if (m.tipo === 'egreso') b.usd_egr = monto; else b.usd_ing = monto }
        else if (m.metodo === 'transferencia') { if (m.tipo === 'egreso') b.tr_egr = monto; else b.tr_ing = monto }
        else { if (m.tipo === 'egreso') b.ef_egr = monto; else b.ef_ing = monto }
        push(dia, {
            key: `man-${m.id}`, auto: false, id: m.id, concepto: m.concepto,
            autor: autorNombre.get(m.created_by) || '—',
            hora: new Date(new Date(m.created_at).getTime() - 3 * 3600_000).toISOString().slice(11, 16),
            fecha: m.fecha, tipoMov: m.tipo, metodoMov: m.metodo, montoMov: monto,
            ...b,
        })
    }

    // --- Ordenamos por día y acumulamos saldos ---
    const totales = cero()
    let saldoPesos = aperturaPesos
    let saldoDolares = aperturaDolares
    const dias = [...porDia.keys()].sort((a, b) => a - b).map(dia => {
        const entries = porDia.get(dia)!.sort((a, b) => (a.auto === b.auto ? 0 : a.auto ? -1 : 1))
        const sub = cero()
        for (const e of entries) {
            sub.ef_ing += e.ef_ing; sub.ef_egr += e.ef_egr
            sub.tr_ing += e.tr_ing; sub.tr_egr += e.tr_egr
            sub.usd_ing += e.usd_ing; sub.usd_egr += e.usd_egr
        }
        totales.ef_ing += sub.ef_ing; totales.ef_egr += sub.ef_egr
        totales.tr_ing += sub.tr_ing; totales.tr_egr += sub.tr_egr
        totales.usd_ing += sub.usd_ing; totales.usd_egr += sub.usd_egr
        saldoPesos += netoPesos(sub)
        saldoDolares += netoDolares(sub)
        return { dia, entries, sub, saldoPesos, saldoDolares }
    })

    return {
        success: true as const,
        apertura: { pesos: aperturaPesos, dolares: aperturaDolares },
        dias,
        totales: { ...totales, netoPesos: netoPesos(totales), netoDolares: netoDolares(totales) },
        cierre: { pesos: saldoPesos, dolares: saldoDolares },
    }
}

// Carga un movimiento manual (queda registrado quién lo hizo).
export async function agregarMovimientoAdminAction(input: {
    fecha: string; concepto: string; tipo: 'ingreso' | 'egreso'
    metodo: 'efectivo' | 'transferencia' | 'dolares'; monto: number
}) {
    const perm = await requireFinanzas()
    if (!perm.ok) return { success: false, error: perm.error }
    const concepto = (input.concepto || '').trim()
    if (!concepto) return { success: false, error: 'Poné un concepto.' }
    if (!input.fecha) return { success: false, error: 'Elegí una fecha.' }
    const monto = Number(input.monto)
    if (!monto || monto <= 0) return { success: false, error: 'El monto tiene que ser mayor a 0.' }
    if (!['ingreso', 'egreso'].includes(input.tipo)) return { success: false, error: 'Tipo inválido.' }
    if (!['efectivo', 'transferencia', 'dolares'].includes(input.metodo)) return { success: false, error: 'Método inválido.' }

    const admin = getAdminClient()
    const { error } = await admin.from('admin_movimientos').insert({
        fecha: input.fecha, concepto, tipo: input.tipo, metodo: input.metodo,
        monto, created_by: perm.userId,
    })
    if (error) return { success: false, error: error.message }
    revalidatePath('/reporte-caja')
    return { success: true }
}

// Edita un movimiento manual (compartido: cualquiera de los dos puede).
export async function editarMovimientoAdminAction(id: string, input: {
    fecha: string; concepto: string; tipo: 'ingreso' | 'egreso'
    metodo: 'efectivo' | 'transferencia' | 'dolares'; monto: number
}) {
    const perm = await requireFinanzas()
    if (!perm.ok) return { success: false, error: perm.error }
    const concepto = (input.concepto || '').trim()
    if (!concepto) return { success: false, error: 'Poné un concepto.' }
    if (!input.fecha) return { success: false, error: 'Elegí una fecha.' }
    const monto = Number(input.monto)
    if (!monto || monto <= 0) return { success: false, error: 'El monto tiene que ser mayor a 0.' }
    if (!['ingreso', 'egreso'].includes(input.tipo)) return { success: false, error: 'Tipo inválido.' }
    if (!['efectivo', 'transferencia', 'dolares'].includes(input.metodo)) return { success: false, error: 'Método inválido.' }

    const admin = getAdminClient()
    const { error } = await admin.from('admin_movimientos').update({
        fecha: input.fecha, concepto, tipo: input.tipo, metodo: input.metodo, monto,
    }).eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/reporte-caja')
    return { success: true }
}

// Borra un movimiento manual (compartido: cualquiera de los dos puede).
export async function eliminarMovimientoAdminAction(id: string) {
    const perm = await requireFinanzas()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('admin_movimientos').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/reporte-caja')
    return { success: true }
}

// Toggle del acceso al libro (solo un admin lo puede prender/apagar).
export async function toggleFinanzasAction(usuarioId: string, valor: boolean) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }
    const { data: actor } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (actor?.rol !== 'admin') return { success: false, error: 'Solo un admin puede dar este acceso.' }
    const admin = getAdminClient()
    const { error } = await admin.from('profiles').update({ admin_finanzas: valor }).eq('id', usuarioId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/usuarios')
    return { success: true }
}
