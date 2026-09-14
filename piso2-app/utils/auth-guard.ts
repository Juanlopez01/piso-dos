import { createClient } from '@/utils/supabase/server-helper'

// ============================================================================
// Guard de autorización para server actions.
//
// Las server actions de Next son invocables por cualquier usuario logueado, así
// que toda action que use el cliente service-role (que saltea RLS) DEBE validar
// rol acá antes de tocar datos. Reemplaza el patrón repetido de getSession +
// consultar profiles.rol que estaba copiado en ~20 archivos.
//
// Uso:
//   const guard = await requireStaff()
//   if (!guard.ok) return { success: false, error: guard.error }
// ============================================================================

export type GuardResult =
    | { ok: true; userId: string; rol: string }
    | { ok: false; error: string }

/** Solo exige sesión válida (cualquier rol logueado). */
export async function requireSesion(): Promise<GuardResult> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    return { ok: true, userId: session.user.id, rol: perfil?.rol || '' }
}

/** Exige que el usuario tenga uno de los roles indicados. */
export async function requireRol(roles: string[]): Promise<GuardResult> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !roles.includes(perfil.rol)) return { ok: false, error: 'Sin permisos' }
    return { ok: true, userId: session.user.id, rol: perfil.rol }
}

/** admin o recepción (staff operativo). */
export const requireStaff = () => requireRol(['admin', 'recepcion'])

/** solo admin. */
export const requireAdmin = () => requireRol(['admin'])
