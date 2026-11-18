// Reglas compartidas de La Liga 2027 (cliente + server). Módulo puro, sin 'use server'.

// Las CUOTAS recién se cobran a partir de marzo 2027. Antes de eso solo se paga
// la matrícula. Cambiar acá si la dirección adelanta/atrasa el inicio de cuotas.
export const CUOTAS_DESDE = { anio: 2027, mes: 3 } as const

// ¿Ya se pueden pagar cuotas? (compara contra la fecha actual en hora AR)
export function cuotasHabilitadas(d: Date = new Date()): boolean {
    const [y, m] = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
    }).format(d).split('-').map(Number)
    return y > CUOTAS_DESDE.anio || (y === CUOTAS_DESDE.anio && m >= CUOTAS_DESDE.mes)
}

export const CUOTAS_DESDE_LABEL = 'marzo 2027'

// Las cuotas van de marzo a diciembre 2027 (10 cuotas mensuales).
export const CUOTAS_HASTA_MES = 12

// Lista de meses de cuota (de CUOTAS_DESDE.mes a CUOTAS_HASTA_MES).
export function mesesCuota(): number[] {
    const out: number[] = []
    for (let m = CUOTAS_DESDE.mes; m <= CUOTAS_HASTA_MES; m++) out.push(m)
    return out
}

// ¿mes/año es una cuota válida del programa? (no bloquea por fecha: se puede
// pagar por adelantado; solo valida que el mes esté dentro del rango de cuotas).
export function esCuotaValida(mes: number, anio: number): boolean {
    return anio === CUOTAS_DESDE.anio && mes >= CUOTAS_DESDE.mes && mes <= CUOTAS_HASTA_MES
}
