import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/server-helper'

// CAMBIO CLAVE: La función ahora se debe llamar "proxy"
export async function proxy(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|login|auth).*)',
    ],
}