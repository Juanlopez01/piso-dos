// Reglas compartidas de La Liga 2027 (cliente + server). Módulo puro, sin 'use server'.

// Las CUOTAS recién se cobran a partir de enero 2027. Antes de eso solo se paga
// la matrícula. Cambiar acá si la dirección adelanta/atrasa el inicio de cuotas.
export const CUOTAS_DESDE = { anio: 2027, mes: 1 } as const

// ¿Ya se pueden pagar cuotas? (compara contra la fecha actual en hora AR)
export function cuotasHabilitadas(d: Date = new Date()): boolean {
    const [y, m] = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
    }).format(d).split('-').map(Number)
    return y > CUOTAS_DESDE.anio || (y === CUOTAS_DESDE.anio && m >= CUOTAS_DESDE.mes)
}

export const CUOTAS_DESDE_LABEL = 'enero 2027'
