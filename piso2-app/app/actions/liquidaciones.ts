'use server'

import { createClient } from '@/utils/supabase/server-helper' // Ajustá esta ruta si tu helper está en otro lado

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
        // 1. Verificamos que el recepcionista tenga una caja abierta
        const { data: turno } = await supabase.from('caja_turnos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'abierta')
            .maybeSingle()

        if (!turno) return { success: false, error: '¡Caja Cerrada! Abrí tu turno en Finanzas para poder pagar.' }

        // 2. Anotamos el egreso en la caja
        const { error: errCaja } = await supabase.from('caja_movimientos').insert({
            turno_id: turno.id,
            tipo: 'egreso',
            concepto: `Liquidación Profe: ${nombreProfe} (${nombreClase})`,
            monto: monto,
            metodo_pago: metodoPago,
            origen_referencia: 'liquidacion_profe'
        })
        if (errCaja) throw new Error('Error al registrar la salida de dinero en la caja.')

        // 3. Marcamos la clase como "Pagada" para que se bloquee el botón
        const { error: errClase } = await supabase.from('clases')
            .update({ pagado_profe: true })
            .eq('id', claseId)

        if (errClase) throw new Error('Error al actualizar el estado de la clase.')

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}