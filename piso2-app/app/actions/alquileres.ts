// app/actions/alquileres.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'
// Importamos format y en-US para que la fecha quede en el formato gringo que pide la BDD (YYYY-MM-DD)
import { format } from 'date-fns'

// Solo staff puede gestionar alquileres (crear/cobrar/editar/borrar/tarifas).
// Sin esto, cualquier usuario logueado podría invocar estas actions y tocar
// reservas, tarifas o la caja.
const ROLES_ALQUILERES = ['admin', 'recepcion', 'auxiliar']
async function requireStaffAlquileres(): Promise<{ ok: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !ROLES_ALQUILERES.includes(perfil.rol)) return { ok: false, error: 'Sin permisos' }
    return { ok: true }
}

export async function crearAlquileresAction(inserts: any[]) {
    const perm = await requireStaffAlquileres()
    if (!perm.ok) return { success: false, error: perm.error }

    const supabase = await createClient()

    try {
        // 🚀 MAGIA ANTI-ZONAS HORARIAS
        const insertsLimpios = inserts.map(item => {
            let fechaLimpia = item.fecha;

            // 1. Si llega como objeto Date nativo de JS (ej: desde el MultiDatePicker)
            if (fechaLimpia instanceof Date) {
                // Forzamos el formato usando date-fns, que respeta la zona horaria local
                fechaLimpia = format(fechaLimpia, 'yyyy-MM-dd');
            }
            // 2. Si llega como String con zona horaria (ej: "2026-05-24T03:00:00Z")
            else if (typeof fechaLimpia === 'string') {
                fechaLimpia = fechaLimpia.split('T')[0];
            }

            return {
                ...item,
                fecha: fechaLimpia
            };
        });

        const { error } = await supabase.from('alquileres').insert(insertsLimpios)
        if (error) throw error

        revalidatePath('/alquileres')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cobrarAlquilerAction(updates: any[], movimientoCaja: any) {
    const perm = await requireStaffAlquileres()
    if (!perm.ok) return { success: false, error: perm.error }

    const supabase = await createClient()

    try {
        const promesas = updates.map(u => supabase.from('alquileres').update({
            monto_total: u.monto_total, // 🚀 FIX: AHORA SÍ GUARDAMOS EL NUEVO TOTAL CON EL RECARGO
            monto_pagado: u.monto_pagado,
            estado_pago: u.estado_pago,
            estado: u.estado,
            metodo_pago: u.metodo_pago
        }).eq('id', u.id))

        await Promise.all(promesas)

        const { error: errorMov } = await supabase.from('caja_movimientos').insert(movimientoCaja)
        if (errorMov) throw new Error('Error al registrar el movimiento en caja')

        revalidatePath('/alquileres')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarReservaAction(ids: string[]) {
    const perm = await requireStaffAlquileres()
    if (!perm.ok) return { success: false, error: perm.error }

    const supabase = await createClient()

    try {
        const { error } = await supabase.from('alquileres').delete().in('id', ids)
        if (error) throw error

        revalidatePath('/alquileres')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function editarAlquilerFechaHoraAction(
    id: string,
    nuevaFecha: string,
    horaInicio: string,
    horaFin: string,
    montoTotal?: number
) {
    const perm = await requireStaffAlquileres()
    if (!perm.ok) return { success: false, error: perm.error }

    const supabase = await createClient()

    try {
        const { data: alquiler } = await supabase
            .from('alquileres')
            .select('fecha, hora_inicio, hora_fin, sala_id, monto_pagado')
            .eq('id', id)
            .single()

        if (!alquiler) return { success: false, error: 'Reserva no encontrada' }

        // ¿Cambió el día o la hora? Solo en ese caso chequeamos que no se pise con
        // otra actividad. (El precio se puede editar siempre; es staff.)
        const cambioFechaHora = nuevaFecha !== alquiler.fecha || horaInicio !== alquiler.hora_inicio || horaFin !== alquiler.hora_fin

        if (cambioFechaHora) {
            const reqStart = `${nuevaFecha}T${horaInicio}:00-03:00`
            const reqEnd = `${nuevaFecha}T${horaFin}:00-03:00`

            const { data: claseChoque } = await supabase.from('clases')
                .select('nombre')
                .eq('sala_id', alquiler.sala_id)
                .neq('estado', 'cancelada')
                .lt('inicio', reqEnd)
                .gt('fin', reqStart)
                .maybeSingle()
            if (claseChoque) return { success: false, error: `Se pisa con una clase: ${claseChoque.nombre}` }

            const { data: alqChoque } = await supabase.from('alquileres')
                .select('cliente_nombre')
                .eq('sala_id', alquiler.sala_id)
                .eq('fecha', nuevaFecha)
                .in('estado', ['confirmado', 'pagado', 'pendiente'])
                .lt('hora_inicio', horaFin)
                .gt('hora_fin', horaInicio)
                .neq('id', id) // excluimos la propia reserva que estamos moviendo
                .maybeSingle()
            if (alqChoque) return { success: false, error: `Se pisa con otro alquiler: ${alqChoque.cliente_nombre}` }
        }

        const update: any = { fecha: nuevaFecha, hora_inicio: horaInicio, hora_fin: horaFin }
        if (montoTotal !== undefined && montoTotal !== null && !isNaN(Number(montoTotal))) {
            const nuevoTotal = Math.max(0, Number(montoTotal))
            update.monto_total = nuevoTotal
            // Reajustamos el estado de pago según lo ya abonado y el nuevo total.
            const pagado = Number(alquiler.monto_pagado || 0)
            if (pagado <= 0) update.estado_pago = 'pendiente'
            else if (pagado >= nuevoTotal) { update.estado_pago = 'pagado'; update.estado = 'pagado' }
            else { update.estado_pago = 'seña_pagada'; update.estado = 'confirmado' }
        }

        const { error } = await supabase.from('alquileres').update(update).eq('id', id)
        if (error) throw error

        revalidatePath('/alquileres')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function actualizarTarifaAction(salaId: string, field: string, value: number) {
    const perm = await requireStaffAlquileres()
    if (!perm.ok) return { success: false, error: perm.error }

    const supabase = await createClient()

    try {
        const { error } = await supabase.from('salas').update({ [field]: value }).eq('id', salaId)
        if (error) throw error

        revalidatePath('/alquileres')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}