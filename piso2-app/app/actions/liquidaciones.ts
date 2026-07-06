'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

// Guarda un ajuste manual de horas de una recep para un mes (override del cálculo por turnos).
export async function guardarHorasRecepAction(anio: number, mes: number, recepId: string, horas: number) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (perfil?.rol !== 'admin') return { success: false, error: 'Solo administradores pueden ajustar horas' }
    if (isNaN(horas) || horas < 0) return { success: false, error: 'Horas inválidas' }

    const admin = getAdminClient()
    const { error } = await admin.from('recep_horas_ajuste').upsert(
        { anio, mes, recep_id: recepId, horas, updated_at: new Date().toISOString() },
        { onConflict: 'anio,mes,recep_id' }
    )
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// Quita el ajuste → vuelve a las horas calculadas por los turnos.
export async function eliminarHorasRecepAction(anio: number, mes: number, recepId: string) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (perfil?.rol !== 'admin') return { success: false, error: 'Solo administradores' }

    const admin = getAdminClient()
    const { error } = await admin.from('recep_horas_ajuste').delete().eq('anio', anio).eq('mes', mes).eq('recep_id', recepId)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function pagarClaseProfeAction(
    claseId: string,
    monto: number,
    metodoPago: string,
    nombreClase: string,
    nombreProfe: string
) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) return { success: false, error: 'No autorizado' }

    try {
        const { data: perfil } = await supabase
            .from('profiles')
            .select('rol')
            .eq('id', session.user.id)
            .single()

        const rol = perfil?.rol

        if (rol === 'recepcion') {
            // Recepción: requiere caja abierta y registra el egreso
            const { data: turno } = await supabase.from('caja_turnos')
                .select('id')
                .eq('usuario_id', session.user.id)
                .eq('estado', 'abierta')
                .maybeSingle()

            if (!turno) return { success: false, error: '¡Caja Cerrada! Abrí tu turno en Finanzas para poder pagar.' }

            const { error: errCaja } = await supabase.from('caja_movimientos').insert({
                turno_id: turno.id,
                tipo: 'egreso',
                concepto: `Liquidación Profe: ${nombreProfe} (${nombreClase})`,
                monto: monto,
                metodo_pago: metodoPago,
                origen_referencia: 'liquidacion_profe'
            })
            if (errCaja) throw new Error('Error al registrar la salida de dinero en la caja.')
        } else if (rol === 'admin') {
            // Admin: registra el pago en el pozo (sin turno)
            const adminSupabase = getAdminClient()
            await adminSupabase.from('caja_movimientos').insert({
                turno_id: null,
                tipo: 'egreso',
                concepto: `Liq Admin: ${nombreProfe} (${nombreClase})`,
                monto,
                metodo_pago: metodoPago,
                origen_referencia: 'pago_profe_admin'
            })
        } else {
            return { success: false, error: 'No tenés permisos para realizar esta acción.' }
        }

        const { error: errClase } = await supabase.from('clases')
            .update({ pagado_profe: true })
            .eq('id', claseId)

        if (errClase) throw new Error('Error al actualizar el estado de la clase.')

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
// Guarda el valor de la hora en la tabla configuraciones
export async function guardarValorHoraRecepAction(valor: number) {
    const supabase = await createClient() // <--- EL AWAIT VA ACÁ

    const { error } = await supabase
        .from('configuraciones')
        .upsert({ clave: 'valor_hora_recepcion', valor: valor.toString() }, { onConflict: 'clave' })

    if (error) return { success: false, error: error.message }
    return { success: true }
}

// Registra el pago al staff como un egreso en la caja activa
export async function pagarStaffAction(uid: string, nombre: string, monto: number, metodo: string, mesKey: string) {
    const supabase = await createClient() // <--- EL AWAIT VA ACÁ TAMBIÉN

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "No autenticado" }

    // Buscar si el admin tiene un turno de caja abierto
    const { data: caja } = await supabase
        .from('caja_turnos')
        .select('id')
        .eq('usuario_id', user.id)
        .eq('estado', 'abierta')
        .single()

    if (!caja) return { success: false, error: "Debes tener un turno de caja abierto para registrar un egreso." }

    // El concepto tiene un formato específico para que el sistema lo reconozca después
    const concepto = `Pago Staff | ID: ${uid} | Mes: ${mesKey} | ${nombre}`

    const { error } = await supabase
        .from('caja_movimientos')
        .insert({
            turno_id: caja.id,
            tipo: 'egreso',
            monto: monto,
            metodo_pago: metodo,
            concepto: concepto
        })

    if (error) return { success: false, error: error.message }
    return { success: true }
}