// Normaliza un teléfono argentino al formato que usa wa.me (sin símbolos, con
// prefijo internacional de celular 54 9). Acepta las formas con las que la gente
// suele cargar el número: desde la característica sin el 54 ("11 6018 5821"),
// con 54, con 0 inicial ("011…"), con el viejo "15" de celular ("11 15 6018…"),
// o ya completo. Devuelve '' si no hay dígitos utilizables.
//
// Un número local argentino válido = característica + abonado = 10 dígitos
// (ej. 11 + 8, 341 + 7, 2964 + 6). Sobre eso anteponemos "549".
export function telWa(tel?: string | null): string {
    let d = (tel || '').replace(/\D/g, '')
    if (!d) return ''
    if (d.startsWith('54')) d = d.slice(2)   // saca el país si lo pusieron
    if (d.startsWith('0')) d = d.slice(1)     // saca el 0 de larga distancia
    if (d.startsWith('9')) d = d.slice(1)     // saca el 9 de celular
    // Saca el "15" de celular SOLO si el número quedó largo (formato viejo
    // característica+15+abonado). Nunca en un número válido de 10 dígitos, para
    // no romper abonados que legítimamente empiezan en 15 (ej. CABA 11 1523-4567).
    if (d.length > 10) d = d.replace(/^(\d{2,4})15/, '$1')
    return '549' + d
}
