'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// 🚀 CLIENTE DIOS: Para operaciones masivas pesadas (evita cortes de permisos)
const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

// 1. CREAR COMPAÑÍA (Solo Admin/Coord)
export async function crearCompaniaAction(payload: { nombre: string, descripcion: string, coordinador_id: string }) {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        // 🔒 Verificamos Rol
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        if (!profile || !['admin', 'coordinador', 'profesor', 'recepcion'].includes(profile.rol)) {
            throw new Error('Solo administradores o coordinadores pueden crear grupos.')
        }

        const { error } = await supabase.from('companias').insert([payload])
        if (error) throw error

        revalidatePath('/companias')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// 2. AGREGAR/QUITAR MIEMBROS (Con Auto-Asignación a Clases)
export async function toggleMiembroCompaniaAction(companiaId: string, alumnoId: string, accion: 'agregar' | 'remover') {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        if (!profile || !['admin', 'coordinador', 'profesor', 'recepcion'].includes(profile.rol)) {
            throw new Error('No tenés permisos para modificar miembros.')
        }

        const hoy = new Date().toISOString()

        if (accion === 'remover') {
            // 1. Lo sacamos del grupo
            const { error } = await supabase.from('perfiles_companias').delete().match({ perfil_id: alumnoId, compania_id: companiaId })
            if (error) throw error

            // 🚀 2. AUTO-DESASIGNACIÓN: Buscamos clases futuras con 'inicio'
            const { data: clasesFuturas } = await supabase.from('clases').select('id').eq('compania_id', companiaId).gte('inicio', hoy)

            if (clasesFuturas && clasesFuturas.length > 0) {
                const clasesIds = clasesFuturas.map(c => c.id)
                await supabase.from('inscripciones')
                    .delete()
                    .eq('user_id', alumnoId)
                    .in('clase_id', clasesIds)
            }

        } else {
            // 1. Lo agregamos al grupo
            const { error } = await supabase.from('perfiles_companias').insert([{ perfil_id: alumnoId, compania_id: companiaId }])
            if (error) throw error

            // 🚀 2. AUTO-ASIGNACIÓN: Buscamos clases futuras con 'inicio'
            const { data: clasesFuturas } = await supabase.from('clases').select('id').eq('compania_id', companiaId).gte('inicio', hoy)

            if (clasesFuturas && clasesFuturas.length > 0) {
                const clasesIds = clasesFuturas.map(c => c.id)

                const { data: reservasExistentes } = await supabase.from('inscripciones').select('clase_id').eq('user_id', alumnoId).in('clase_id', clasesIds)
                const idsReservados = reservasExistentes?.map(r => r.clase_id) || []

                const nuevasReservas = clasesFuturas
                    .filter(c => !idsReservados.includes(c.id))
                    .map(c => ({
                        clase_id: c.id,
                        user_id: alumnoId,
                        modalidad: 'Compañía', // Aseguramos el nombre correcto en la tabla
                        valor_credito: 0,
                        metodo_pago: 'credito',
                        presente: false
                    }))

                // Si hay clases nuevas, lo anotamos de una
                if (nuevasReservas.length > 0) {
                    await supabase.from('inscripciones').insert(nuevasReservas)
                }
            }
        }

        revalidatePath(`/companias/${companiaId}`)
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarCompaniaAction(companiaId: string) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        if (!profile || !['admin', 'recepcion', 'coordinador'].includes(profile.rol)) throw new Error('Solo un Admin puede eliminar grupos')

        const { error } = await supabase.from('companias').delete().eq('id', companiaId)
        if (error) throw new Error(error.message)

        revalidatePath('/companias')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// ============================================================================
// 🚀 BOTÓN MÁGICO: INSCRIBIR A TODO EL PADRÓN A LAS CLASES DEL MES SELECCIONADO
// ============================================================================
export async function gestionarClasesCompaniaMiembroAction(
    perfilId: string,
    companiaId: string,
    claseIdsSeleccionadas: string[],
    todasLasClasesDelMes: string[]
) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const admin = getAdminClient()

    // Inscripciones actuales del miembro en las clases del mes
    const { data: inscripcionesActuales } = await admin
        .from('inscripciones')
        .select('id, clase_id')
        .eq('user_id', perfilId)
        .in('clase_id', todasLasClasesDelMes)

    const idsActuales = new Set((inscripcionesActuales || []).map((i: any) => i.clase_id))
    const idsNuevas = new Set(claseIdsSeleccionadas)

    // Eliminar las que ya no están seleccionadas
    const eliminar = (inscripcionesActuales || []).filter((i: any) => !idsNuevas.has(i.clase_id)).map((i: any) => i.id)
    if (eliminar.length > 0) {
        await admin.from('inscripciones').delete().in('id', eliminar)
    }

    // Agregar las nuevas
    const agregar = claseIdsSeleccionadas.filter(id => !idsActuales.has(id))
    if (agregar.length > 0) {
        await admin.from('inscripciones').insert(agregar.map(clase_id => ({
            user_id: perfilId,
            clase_id,
            modalidad: 'Compañía',
            valor_credito: 0,
            metodo_pago: 'credito',
            presente: false,
            es_invitado: false
        })))
    }

    revalidatePath(`/companias/${companiaId}`)
    return { success: true }
}

export async function inscribirPadronCompaniaAction(companiaId: string, mes: number, anio: number) {
    const supabaseAdmin = getAdminClient()

    try {
        // 1. Traemos solo los miembros con plan Full o sin plan asignado
        const { data: padron, error: errPadron } = await supabaseAdmin
            .from('perfiles_companias')
            .select('perfil_id, plan_id, plan:companias_planes(tipo)')
            .eq('compania_id', companiaId)

        if (errPadron || !padron || padron.length === 0) {
            return { success: false, error: 'El padrón está vacío o hubo un error al leerlo.' }
        }

        // Solo inscribir miembros Full o sin plan (los de "dias" eligen sus clases manualmente)
        const alumnosIds = padron
            .filter((p: any) => {
                const plan = Array.isArray(p.plan) ? p.plan[0] : p.plan
                return !plan || plan.tipo === 'full'
            })
            .map((p: any) => p.perfil_id)

        if (alumnosIds.length === 0) {
            return { success: false, error: 'Todos los miembros tienen plan por días. Asigná sus clases manualmente.' }
        }

        // 2. Buscamos todas las clases de ese mes exacto
        const primerDiaMes = new Date(anio, mes - 1, 1).toISOString()
        const ultimoDiaMes = new Date(anio, mes, 0, 23, 59, 59, 999).toISOString()

        const { data: clases, error: errClases } = await supabaseAdmin
            .from('clases')
            .select('id')
            .eq('compania_id', companiaId)
            .gte('inicio', primerDiaMes)
            .lte('inicio', ultimoDiaMes)
            .neq('estado', 'cancelada')

        if (errClases || !clases || clases.length === 0) {
            return { success: false, error: `No hay clases programadas para el mes ${mes}/${anio}.` }
        }

        const clasesIds = clases.map(c => c.id)

        // 3. Traemos todas las inscripciones que ya existen (para no duplicar)
        const { data: inscripcionesExistentes, error: errInsc } = await supabaseAdmin
            .from('inscripciones')
            .select('user_id, clase_id')
            .in('clase_id', clasesIds)
            .in('user_id', alumnosIds)

        // Creamos un Set "Set('user_id-clase_id')" para búsqueda ultrarrápida
        const inscripcionesSet = new Set(
            (inscripcionesExistentes || []).map(i => `${i.user_id}-${i.clase_id}`)
        )

        // 4. Preparamos la matriculación masiva
        const batchInscripciones: any[] = []

        alumnosIds.forEach(alumnoId => {
            clasesIds.forEach(claseId => {
                const llave = `${alumnoId}-${claseId}`
                if (!inscripcionesSet.has(llave)) {
                    batchInscripciones.push({
                        user_id: alumnoId,
                        clase_id: claseId,
                        modalidad: 'Compañía',
                        valor_credito: 0, // 💰 CRUCIAL: $0 para no inflar la caja
                        metodo_pago: 'credito',
                        presente: false,
                        es_invitado: false
                    })
                }
            })
        })

        // 5. Insertamos de golpe (Batch Insert)
        if (batchInscripciones.length > 0) {
            const { error: errInsert } = await supabaseAdmin.from('inscripciones').insert(batchInscripciones)
            if (errInsert) throw new Error(`Fallo masivo al insertar: ${errInsert.message}`)
            return { success: true, message: `Se generaron ${batchInscripciones.length} inscripciones nuevas en el mes.` }
        } else {
            return { success: true, message: 'Todos los alumnos ya estaban inscriptos en todas las clases del mes.' }
        }

    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// ============================================================================
// 🚀 OBTENER PRECIOS DE COMPAÑÍA (Bypass RLS para saltar bloqueos de seguridad)
// ============================================================================
export async function registrarPagoProfeCompaniaAction(
    companiaId: string,
    claseId: string,
    nombreClase: string,
    fecha: string,
    monto: number,
    metodoPago: string
) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!profile || !['admin', 'recepcion'].includes(profile.rol)) {
        return { success: false, error: 'Sin permisos' }
    }

    const concepto = `Pago Docentes | Clase: ${claseId} | Grupo: ${companiaId} | ${nombreClase} (${fecha})`
    const esEfectivo = (metodoPago || '').toLowerCase() === 'efectivo'

    if (profile.rol === 'recepcion' && esEfectivo) {
        // Recepción + efectivo: sale de la CAJA (turno abierto), descuenta el efectivo del cajón.
        const { data: turno } = await supabase.from('caja_turnos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'abierta')
            .maybeSingle()

        if (!turno) return { success: false, error: '¡Caja Cerrada! Abrí tu turno para pagar en efectivo.' }

        const { error } = await supabase.from('caja_movimientos').insert({
            turno_id: turno.id,
            tipo: 'egreso',
            concepto,
            monto,
            metodo_pago: metodoPago,
            origen_referencia: 'pago_profe_compania'
        })
        if (error) return { success: false, error: error.message }
    } else {
        // Admin (cualquier método) o transferencia: sale del POZO (sin turno).
        const admin = getAdminClient()
        const { error } = await admin.from('caja_movimientos').insert({
            turno_id: null,
            tipo: 'egreso',
            concepto,
            monto,
            metodo_pago: metodoPago,
            origen_referencia: 'pago_profe_compania'
        })
        if (error) return { success: false, error: error.message }
    }

    revalidatePath(`/companias/${companiaId}`)
    revalidatePath('/caja')
    return { success: true }
}

// ============================================================================
// PLANES DE COMPAÑÍA
// ============================================================================
export async function getPlanesCompaniaAction(companiaId: string) {
    const admin = getAdminClient()
    const { data } = await admin
        .from('companias_planes')
        .select('*')
        .eq('compania_id', companiaId)
        .order('tipo', { ascending: false }) // full primero
    return data || []
}

export async function upsertPlanCompaniaAction(plan: {
    id?: string
    compania_id: string
    nombre: string
    tipo: 'full' | 'dias'
    dias_semana: number | null
    precio_transf: number
    precio_efvo: number
}) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!profile || !['admin', 'recepcion'].includes(profile.rol)) return { success: false, error: 'Sin permisos' }

    const admin = getAdminClient()
    const { error } = plan.id
        ? await admin.from('companias_planes').update({
            nombre: plan.nombre,
            tipo: plan.tipo,
            dias_semana: plan.dias_semana,
            precio_transf: plan.precio_transf,
            precio_efvo: plan.precio_efvo
        }).eq('id', plan.id)
        : await admin.from('companias_planes').insert({
            compania_id: plan.compania_id,
            nombre: plan.nombre,
            tipo: plan.tipo,
            dias_semana: plan.dias_semana,
            precio_transf: plan.precio_transf,
            precio_efvo: plan.precio_efvo
        })

    if (error) return { success: false, error: error.message }
    revalidatePath(`/companias/${plan.compania_id}`)
    return { success: true }
}

export async function eliminarPlanCompaniaAction(planId: string, companiaId: string) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!profile || !['admin', 'recepcion'].includes(profile.rol)) return { success: false, error: 'Sin permisos' }

    const admin = getAdminClient()
    // Desasignar el plan de todos los miembros que lo tengan
    await admin.from('perfiles_companias').update({ plan_id: null }).eq('plan_id', planId)
    const { error } = await admin.from('companias_planes').delete().eq('id', planId)

    if (error) return { success: false, error: error.message }
    revalidatePath(`/companias/${companiaId}`)
    return { success: true }
}

export async function asignarPlanMiembroAction(perfilId: string, companiaId: string, planId: string | null) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { data: profile } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!profile || !['admin', 'recepcion'].includes(profile.rol)) return { success: false, error: 'Sin permisos' }

    const admin = getAdminClient()
    const { error } = await admin.from('perfiles_companias')
        .update({ plan_id: planId })
        .eq('perfil_id', perfilId)
        .eq('compania_id', companiaId)

    if (error) return { success: false, error: error.message }
    revalidatePath(`/companias/${companiaId}`)
    return { success: true }
}

export async function obtenerPreciosCompaniaAction(companiaId: string) {
    const supabaseAdmin = getAdminClient()
    const { data } = await supabaseAdmin.from('configuraciones').select('clave, valor').in('clave', [
        `cuota_compania_${companiaId}`,
        `cuota_compania_${companiaId}_transf`,
        `cuota_compania_${companiaId}_efvo`
    ])
    return data || []
}

export async function fetchGruposLiquidacionAction(mes: number, anio: number) {
    const admin = getAdminClient()

    const [
        { data: companias },
        { data: pagos },
        { data: clasesMes },
        { data: movLiquidadas },
        { data: configsGrupos },
        { data: miembrosData },
        { data: planesData },
        { data: egresosProfeData }
    ] = await Promise.all([
        admin.from('companias').select('id, nombre').order('nombre'),
        admin.from('companias_pagos').select('compania_id, alumno_id, monto').eq('mes', mes).eq('anio', anio),
        admin.from('clases').select('compania_id')
            .not('compania_id', 'is', null)
            .gte('inicio', new Date(anio, mes - 1, 1).toISOString())
            .lte('inicio', new Date(anio, mes, 0, 23, 59, 59, 999).toISOString())
            .neq('estado', 'cancelada'),
        admin.from('caja_movimientos').select('concepto')
            .eq('tipo', 'egreso')
            .ilike('concepto', `%Liquidación Grupo | ID: % | Mes: ${mes}-${anio}%`),
        admin.from('configuraciones').select('clave, valor').ilike('clave', 'cuota_compania_%'),
        admin.from('perfiles_companias').select('compania_id, perfil_id, plan_id, perfil:profiles(id, porcentaje_beca_compania)'),
        admin.from('companias_planes').select('id, precio_efvo'),
        // Pagos a docentes registrados por clase (egresos) en el mes liquidado
        admin.from('caja_movimientos').select('concepto, monto, metodo_pago, created_at')
            .eq('tipo', 'egreso')
            .eq('origen_referencia', 'pago_profe_compania')
            .gte('created_at', new Date(anio, mes - 1, 1).toISOString())
            .lte('created_at', new Date(anio, mes, 0, 23, 59, 59, 999).toISOString())
    ])

    // Egresos a docentes por compañía (parseados del concepto)
    const egresosPorCompania: Record<string, { clase: string; fecha: string; monto: number; metodo: string }[]> = {}
    egresosProfeData?.forEach((e: any) => {
        const idMatch = e.concepto?.match(/Grupo:\s*([\w-]+)/)
        const companiaId = idMatch?.[1]
        if (!companiaId) return
        const detMatch = e.concepto?.match(/Grupo:\s*[\w-]+\s*\|\s*(.+?)\s*\(([^)]*)\)\s*$/)
        if (!egresosPorCompania[companiaId]) egresosPorCompania[companiaId] = []
        egresosPorCompania[companiaId].push({
            clase: detMatch?.[1]?.trim() || 'Clase',
            fecha: detMatch?.[2] || '',
            monto: Number(e.monto),
            metodo: e.metodo_pago || 'efectivo'
        })
    })

    if (!companias) return []

    const liquidadasIds = new Set<string>()
    movLiquidadas?.forEach((l: any) => {
        const match = l.concepto?.match(/ID: ([a-zA-Z0-9-]+) /)
        if (match?.[1]) liquidadasIds.add(match[1])
    })

    const precioEfvoMap: Record<string, number> = {}
    const baseMap: Record<string, number> = {}
    configsGrupos?.forEach((c: any) => {
        const key = c.clave.replace('cuota_compania_', '')
        const val = Number(String(c.valor).replace(/\./g, '').trim())
        if (key.endsWith('_efvo')) {
            precioEfvoMap[key.replace('_efvo', '')] = val
        } else if (!key.endsWith('_transf')) {
            baseMap[key] = val
        }
    })

    // Precio efvo por plan_id
    const planPrecioMap: Record<string, number> = {}
    planesData?.forEach((p: any) => { planPrecioMap[p.id] = p.precio_efvo })

    // Beca y plan por miembro
    const becaMap: Record<string, Record<string, number>> = {}
    const planMiembroMap: Record<string, Record<string, string | null>> = {}
    miembrosData?.forEach((m: any) => {
        const perfil = Array.isArray(m.perfil) ? m.perfil[0] : m.perfil
        const beca = perfil?.porcentaje_beca_compania || 0
        if (beca > 0) {
            if (!becaMap[m.compania_id]) becaMap[m.compania_id] = {}
            becaMap[m.compania_id][m.perfil_id] = beca
        }
        if (!planMiembroMap[m.compania_id]) planMiembroMap[m.compania_id] = {}
        planMiembroMap[m.compania_id][m.perfil_id] = m.plan_id || null
    })

    const pagosPorCompania: Record<string, Record<string, number>> = {}
    pagos?.forEach((p: any) => {
        if (!pagosPorCompania[p.compania_id]) pagosPorCompania[p.compania_id] = {}
        pagosPorCompania[p.compania_id][p.alumno_id] =
            (pagosPorCompania[p.compania_id][p.alumno_id] || 0) + Number(p.monto)
    })

    const miembrosPorCompania: Record<string, Set<string>> = {}
    miembrosData?.forEach((m: any) => {
        if (!miembrosPorCompania[m.compania_id]) miembrosPorCompania[m.compania_id] = new Set()
        miembrosPorCompania[m.compania_id].add(m.perfil_id)
    })

    return companias.map((c: any) => {
        const precioEfvoGrupo = precioEfvoMap[c.id] ?? baseMap[c.id] ?? 15000
        const memberPayments = pagosPorCompania[c.id] || {}
        const miembrosActuales = miembrosPorCompania[c.id] || new Set()
        const totalRecaudado = Object.entries(memberPayments)
            .reduce((acc, [alumnoId, memberTotal]) => {
                // Drop-in (clase suelta): no figura en el padrón → se suma a valor pleno.
                if (!miembrosActuales.has(alumnoId)) {
                    return acc + (memberTotal as number)
                }
                const beca = becaMap[c.id]?.[alumnoId] || 0
                const planId = planMiembroMap[c.id]?.[alumnoId]
                const precioEfvo = planId ? (planPrecioMap[planId] ?? precioEfvoGrupo) : precioEfvoGrupo
                const precioConBeca = precioEfvo * (1 - beca / 100)
                return acc + Math.min(memberTotal as number, precioConBeca)
            }, 0)
        const egresosProfe = egresosPorCompania[c.id] || []
        const totalEgresosProfe = egresosProfe.reduce((acc, e) => acc + e.monto, 0)

        return {
            id: c.id,
            nombre: c.nombre,
            totalRecaudado,
            cantClases: clasesMes?.filter((cl: any) => cl.compania_id === c.id).length || 0,
            yaLiquidado: liquidadasIds.has(c.id),
            egresosProfe,
            totalEgresosProfe
        }
    }).filter((g: any) => g.totalRecaudado > 0 || g.cantClases > 0 || g.totalEgresosProfe > 0)
}