import { z } from 'zod'

export const inscripcionSchema = z.object({
    clase_id: z.string().uuid('La clase no es válida'),
    user_id: z.string().uuid('El usuario no es válido').nullable().optional(),
    modalidad: z.enum(['cuponera', 'mensual', 'exclusiva', 'suelta']).optional(),
    metodo_pago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'mercadopago']).nullable().optional(),
    valor_credito: z.number().min(0).max(10_000_000).nullable().optional(),
    es_invitado: z.boolean().optional(),
    nombre_invitado: z.string().max(200).nullable().optional(),
})

export const asistenciaSchema = z.object({
    inscripcion_id: z.string().uuid(),
    estado_asistencia: z.enum(['presente', 'ausente', 'media_falta', 'justificada', 'saf']),
})

export type InscripcionInput = z.infer<typeof inscripcionSchema>
export type AsistenciaInput = z.infer<typeof asistenciaSchema>
