// Tarifa de alquiler de sala — misma lógica que el panel de recepción:
//   - prefijo por actividad: p_ensayo_* / p_clase_* / p_prod_* (produccion → p_prod)
//   - corte 18:00 entre "mañana" y "noche"
//   - finde = DOMINGO (tarifa plana precio_finde); sábado va como día de semana
// Se usa en el cliente (precio en vivo) y en el server (monto autoritativo).

export const CORTE_HORARIO = 18.0

export type SalaTarifa = Record<string, any>

const parseT = (t: string) => { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60 }

// Día de la semana de una fecha 'YYYY-MM-DD' sin ambigüedad de zona (0 = domingo).
function diaSemana(fechaISO: string): number {
    const [y, m, d] = fechaISO.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// Monto total de un bloque (una fecha, hora inicio→fin). Devuelve 0 si algo falta.
export function montoAlquiler(sala: SalaTarifa, tipoUso: string, fechaISO: string, horaInicio: string, horaFin: string): number {
    if (!sala || !fechaISO || !horaInicio || !horaFin) return 0
    const pref = tipoUso === 'produccion' ? 'p_prod' : `p_${tipoUso || 'ensayo'}`
    const pMan = Number(sala[`${pref}_manana`] || 0)
    const pNoc = Number(sala[`${pref}_noche`] || 0)
    const pFin = Number(sala[`${pref}_finde`] || 0)

    const start = parseT(horaInicio), end = parseT(horaFin)
    const dur = Math.max(0, end - start)
    if (dur <= 0) return 0

    if (diaSemana(fechaISO) === 0) return Math.round(dur * pFin)            // domingo
    if (end <= CORTE_HORARIO) return Math.round(dur * pMan)                 // todo mañana
    if (start >= CORTE_HORARIO) return Math.round(dur * pNoc)              // todo noche
    return Math.round((CORTE_HORARIO - start) * pMan + (end - CORTE_HORARIO) * pNoc) // mixto
}

// Seña = 50% del total (redondeada).
export function senaDe(montoTotal: number): number {
    return Math.round(Number(montoTotal || 0) * 0.5)
}
