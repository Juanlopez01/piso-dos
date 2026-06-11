import { z } from 'zod'

export const abrirCajaSchema = z.object({
    sedeId: z.string().uuid('La sede no es válida'),
    montoInicial: z.number().min(0, 'El monto inicial no puede ser negativo').max(10_000_000),
})

export const cerrarCajaSchema = z.object({
    turnoId: z.string().uuid('El turno no es válido'),
    efectivoReal: z.number().min(0).max(10_000_000).optional(),
})

export const movimientoSchema = z.object({
    turno_id: z.string().uuid('El turno no es válido').nullable().optional(),
    tipo: z.enum(['ingreso', 'egreso']),
    concepto: z.string().min(1, 'El concepto es obligatorio').max(500),
    monto: z.number().positive('El monto debe ser mayor a 0').max(10_000_000),
    metodo_pago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'mercadopago', 'otro']).nullable().optional(),
    origen_referencia: z.string().max(500).nullable().optional(),
})

export const editarMovimientoSchema = z.object({
    movimientoId: z.string().uuid(),
    concepto: z.string().min(1).max(500),
    monto: z.number().positive().max(10_000_000),
    metodo_pago: z.string().max(50),
    tipo: z.enum(['ingreso', 'egreso']),
    turno_id: z.string().uuid(),
})

export type AbrirCajaInput = z.infer<typeof abrirCajaSchema>
export type CerrarCajaInput = z.infer<typeof cerrarCajaSchema>
export type MovimientoInput = z.infer<typeof movimientoSchema>
export type EditarMovimientoInput = z.infer<typeof editarMovimientoSchema>
