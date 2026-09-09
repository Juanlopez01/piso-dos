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

    // --- SALDO INICIAL (cierre mensual): se carga A MANO por mes, NO se acumula
    // solo. El saldo final del mes = este saldo inicial + los movimientos del mes.
    const { data: si } = await admin.from('admin_saldo_inicial')
        .select('pesos, dolares').eq('anio', anio).eq('mes', mes).maybeSingle()
    const aperturaPesos = Number(si?.pesos || 0)
    const aperturaDolares = Number(si?.dolares || 0)

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

    // --- Overrides de caja (correcciones manuales de las líneas automáticas) ---
    const { data: cajaOvs } = await admin.from('admin_caja_override')
        .select('dia, sede_key, ef_ing, ef_egr, tr_ing, tr_egr').eq('anio', anio).eq('mes', mes)
    const cajaOvMap = new Map<string, Buckets & { editado: true }>()
    for (const o of (cajaOvs || []) as any[]) {
        cajaOvMap.set(`${o.dia}|${o.sede_key}`, {
            ef_ing: Number(o.ef_ing || 0), ef_egr: Number(o.ef_egr || 0),
            tr_ing: Number(o.tr_ing || 0), tr_egr: Number(o.tr_egr || 0),
            usd_ing: 0, usd_egr: 0, editado: true,
        })
        // Si el override es de un día/sede sin movimientos, igual tiene que figurar.
        if (!cajaAgrup.has(`${o.dia}|${o.sede_key}`)) cajaAgrup.set(`${o.dia}|${o.sede_key}`, cero())
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
        // solo líneas de caja: para poder corregirlas (override)
        diaNum?: number; sedeKey?: string; editadoCaja?: boolean
    }
    const porDia = new Map<number, Entrada[]>()
    const push = (dia: number, e: Entrada) => {
        if (!porDia.has(dia)) porDia.set(dia, [])
        porDia.get(dia)!.push(e)
    }

    // Cajas (automáticas, o corregidas si hay override)
    for (const [key, b] of cajaAgrup) {
        const [diaStr, sedeId] = key.split('|')
        const dia = Number(diaStr)
        const nombre = sedeId === 'pozo' ? 'Administración (pozo)' : (sedeNombre.get(sedeId) || 'Caja')
        const ov = cajaOvMap.get(key)
        const vals: Buckets = ov ? ov : b
        push(dia, {
            key: `caja-${key}`, auto: true, concepto: `Caja ${nombre}`,
            diaNum: dia, sedeKey: sedeId, editadoCaja: !!ov, ...vals,
        })
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

// Corrige una línea de caja (override por día/sede). vals = null → vuelve al automático.
export async function setCajaOverrideAction(
    anio: number, mes: number, dia: number, sedeKey: string,
    vals: { ef_ing: number; ef_egr: number; tr_ing: number; tr_egr: number } | null
) {
    const perm = await requireFinanzas()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    if (!vals) {
        const { error } = await admin.from('admin_caja_override').delete()
            .eq('anio', anio).eq('mes', mes).eq('dia', dia).eq('sede_key', sedeKey)
        if (error) return { success: false, error: error.message }
        revalidatePath('/reporte-caja')
        return { success: true }
    }
    const clean = {
        ef_ing: Math.max(0, Number(vals.ef_ing) || 0), ef_egr: Math.max(0, Number(vals.ef_egr) || 0),
        tr_ing: Math.max(0, Number(vals.tr_ing) || 0), tr_egr: Math.max(0, Number(vals.tr_egr) || 0),
    }
    const { error } = await admin.from('admin_caja_override').upsert(
        { anio, mes, dia, sede_key: sedeKey, ...clean, updated_by: perm.userId, updated_at: new Date().toISOString() },
        { onConflict: 'anio,mes,dia,sede_key' }
    )
    if (error) return { success: false, error: error.message }
    revalidatePath('/reporte-caja')
    return { success: true }
}

// Guarda el saldo inicial del mes (cierre mensual, carga a mano).
export async function setSaldoInicialAction(anio: number, mes: number, pesos: number, dolares: number) {
    const perm = await requireFinanzas()
    if (!perm.ok) return { success: false, error: perm.error }
    const admin = getAdminClient()
    const { error } = await admin.from('admin_saldo_inicial').upsert(
        { anio, mes, pesos: Number(pesos) || 0, dolares: Number(dolares) || 0, updated_by: perm.userId, updated_at: new Date().toISOString() },
        { onConflict: 'anio,mes' }
    )
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// Detalle de una línea de caja (día + sede): cada movimiento con concepto, método,
// monto y QUIÉN lo hizo (dueño del turno). Para el "clickear y ver qué es".
export async function getDetalleCajaDiaAction(anio: number, mes: number, dia: number, sedeKey: string) {
    const perm = await requireFinanzas()
    if (!perm.ok) return { success: false as const, error: perm.error, movimientos: [] as any[] }
    const admin = getAdminClient()
    // El día en ART (UTC-3) va de las 03:00 UTC de ese día a las 03:00 del siguiente.
    const desde = new Date(Date.UTC(anio, mes - 1, dia, 3, 0, 0)).toISOString()
    const hasta = new Date(Date.UTC(anio, mes - 1, dia + 1, 3, 0, 0)).toISOString()
    const { data: movs } = await admin.from('caja_movimientos')
        .select('tipo, metodo_pago, monto, concepto, created_at, turno:caja_turnos(sede_id, usuario_id)')
        .gte('created_at', desde).lt('created_at', hasta).order('created_at', { ascending: true })

    // Filtramos por sede y juntamos los usuario_id de los turnos.
    const filtrados = (movs || []).filter((m: any) => {
        const t = Array.isArray(m.turno) ? m.turno[0] : m.turno
        return (t?.sede_id ?? 'pozo') === sedeKey
    })
    const userIds = [...new Set(filtrados.map((m: any) => {
        const t = Array.isArray(m.turno) ? m.turno[0] : m.turno
        return t?.usuario_id
    }).filter(Boolean))]
    const nombre = new Map<string, string>()
    if (userIds.length) {
        const { data: perfiles } = await admin.from('profiles').select('id, nombre_completo').in('id', userIds)
        for (const p of (perfiles || []) as any[]) nombre.set(p.id, p.nombre_completo || 'Usuario')
    }
    const movimientos = filtrados.map((m: any) => {
        const t = Array.isArray(m.turno) ? m.turno[0] : m.turno
        return {
            tipo: m.tipo, metodo: m.metodo_pago || 'efectivo', monto: Number(m.monto || 0),
            concepto: m.concepto || '(sin concepto)',
            usuario: t?.usuario_id ? (nombre.get(t.usuario_id) || 'Usuario') : 'Administración',
            hora: new Date(new Date(m.created_at).getTime() - 3 * 3600_000).toISOString().slice(11, 16),
        }
    })
    return { success: true as const, movimientos }
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
