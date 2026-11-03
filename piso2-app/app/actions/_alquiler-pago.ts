// Efecto de un pago de alquiler (seña o saldo), aplicado desde el webhook de MP.
// NO es 'use server' (recibe el admin client, que no es serializable).
//
// - Actualiza la reserva: suma lo pagado, pasa a 'confirmado' (seña) o 'pagado'
//   (saldo completo), y limpia el hold de 15 min.
// - Asienta el ingreso en el POZO de los admins: caja_movimientos con
//   turno_id = null (dinero digital) y origen_referencia = 'alquiler'.
// - Idempotente por estado (un webhook repetido no vuelve a cobrar).

type Concepto = 'sena' | 'saldo'

export async function aplicarEfectoPagoAlquiler(
    admin: any,
    alquilerId: string,
    concepto: Concepto,
    montoPagadoAhora: number,
): Promise<{ ok: boolean; yaAplicado?: boolean; error?: string }> {
    const { data: alq } = await admin.from('alquileres')
        .select('id, monto_total, monto_pagado, estado_pago, cliente_nombre, sala_id')
        .eq('id', alquilerId).maybeSingle()
    if (!alq) return { ok: false, error: 'Reserva no encontrada' }

    // Guard de idempotencia por estado.
    if (concepto === 'sena' && alq.estado_pago !== 'pendiente') return { ok: true, yaAplicado: true }
    if (concepto === 'saldo' && alq.estado_pago === 'pagado') return { ok: true, yaAplicado: true }

    const total = Number(alq.monto_total || 0)
    const nuevoPagado = Math.min(total, Number(alq.monto_pagado || 0) + Number(montoPagadoAhora || 0))
    const pagadoCompleto = nuevoPagado >= total && total > 0

    const { error: eUpd } = await admin.from('alquileres').update({
        monto_pagado: nuevoPagado,
        estado_pago: pagadoCompleto ? 'pagado' : 'seña_pagada',
        estado: pagadoCompleto ? 'pagado' : 'confirmado',
        metodo_pago: 'mercadopago',
        reservado_hasta: null,
    }).eq('id', alquilerId)
    if (eUpd) return { ok: false, error: eUpd.message }

    // Ingreso al pozo de admins (sin turno de recepción), con origen específico de alquiler.
    await admin.from('caja_movimientos').insert({
        turno_id: null,
        tipo: 'ingreso',
        concepto: `Alquiler sala — ${concepto === 'sena' ? 'seña' : 'saldo'}${alq.cliente_nombre ? ' (' + alq.cliente_nombre + ')' : ''}`,
        monto: Number(montoPagadoAhora || 0),
        metodo_pago: 'mercadopago',
        origen_referencia: 'alquiler',
    })

    return { ok: true }
}
