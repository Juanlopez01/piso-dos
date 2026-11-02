// ============================================================================
// Efecto de un pago aprobado de La Liga 2027 sobre la inscripción.
// Helper compartido por el server action de pagos (registro manual) y el webhook
// de MP. NO es 'use server' (recibe el admin client, que no es serializable).
// ============================================================================

type AdminClient = any

// Aplica el efecto de un pago aprobado: marca matrícula y/o desbloquea la mora.
export async function aplicarEfectoPagoLiga27(admin: AdminClient, inscripcionId: string, concepto: string): Promise<void> {
    if (!inscripcionId) return
    const update: Record<string, any> = {}
    if (concepto === 'matricula') update.matricula_pagada = true
    // Pagar cualquier concepto saca de la mora si estaba bloqueado.
    const { data: ins } = await admin.from('liga27_inscripciones').select('estado').eq('id', inscripcionId).maybeSingle()
    if (ins?.estado === 'bloqueado') { update.estado = 'aprobado'; update.bloqueado_motivo = null }
    if (Object.keys(update).length) await admin.from('liga27_inscripciones').update(update).eq('id', inscripcionId)
}
