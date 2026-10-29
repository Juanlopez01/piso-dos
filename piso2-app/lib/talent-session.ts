// ============================================================================
// Sesión propia de Piso2 Talent (login de talentos, SEPARADO del de alumnos).
// - Contraseña: hash scrypt con salt aleatorio ("scrypt$salt$hash").
// - Sesión: cookie httpOnly firmada con HMAC (secreto = service role key, que
//   nunca sale del server). El cookie guarda el id del perfil + vencimiento.
// Este módulo NO es 'use server': exporta helpers sync/async que usan los
// server actions de Talent. node:crypto corre solo en el server.
// ============================================================================
import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE = 'piso2_talent'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 días
const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || 'piso2-talent-dev-secret'

// ── Contraseñas ──────────────────────────────────────────────────────────────
export function hashPassword(plain: string): string {
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.scryptSync(plain, salt, 64).toString('hex')
    return `scrypt$${salt}$${hash}`
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
    if (!stored) return false
    const [algo, salt, hash] = stored.split('$')
    if (algo !== 'scrypt' || !salt || !hash) return false
    const calc = crypto.scryptSync(plain, salt, 64).toString('hex')
    try {
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'))
    } catch {
        return false
    }
}

// ── Sesión (cookie firmada) ──────────────────────────────────────────────────
function firmar(data: string): string {
    return crypto.createHmac('sha256', secret()).update(data).digest('hex')
}

export async function crearSesionTalento(perfilId: string): Promise<void> {
    const exp = Date.now() + MAX_AGE * 1000
    const data = `${perfilId}.${exp}`
    const token = `${data}.${firmar(data)}`
    const store = await cookies()
    store.set(COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: MAX_AGE,
    })
}

// Devuelve el id del perfil logueado, o null si no hay sesión válida.
export async function leerSesionTalento(): Promise<string | null> {
    const store = await cookies()
    const token = store.get(COOKIE)?.value
    if (!token) return null
    const idx = token.lastIndexOf('.')
    if (idx < 0) return null
    const data = token.slice(0, idx)
    const sig = token.slice(idx + 1)
    if (firmar(data) !== sig) return null
    const [perfilId, expStr] = data.split('.')
    if (!perfilId || !expStr) return null
    if (Date.now() > Number(expStr)) return null
    return perfilId
}

export async function cerrarSesionTalento(): Promise<void> {
    const store = await cookies()
    store.delete(COOKIE)
}
