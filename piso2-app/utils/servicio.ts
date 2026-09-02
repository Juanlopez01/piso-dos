// Cargo de servicio de PISO2E: se suma ARRIBA del valor de la entrada.
// Si la entrada vale $20.000, el cliente paga $22.000 (una sola vez).
// Ese 10% es de Piso 2 (no entra al reparto con la compañía).
export const SERVICIO_PCT = 10

// Monto del servicio para una base dada (redondeado a pesos enteros).
export const montoServicio = (base: number) => Math.round((Number(base) || 0) * SERVICIO_PCT / 100)

// Total final que paga la persona: base + servicio.
export const conServicio = (base: number) => (Number(base) || 0) + montoServicio(base)
