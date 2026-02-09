import { type NextRequest } from 'next/server'
// ACÁ EL CAMBIO: Importamos desde 'proxy' en lugar de 'middleware'
import { updateSession } from '@/utils/supabase/server-helper'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public (public files)
         * - login (EXCLUIR LOGIN)
         * - signup (EXCLUIR SIGNUP - IMPORTANTE)
         * - auth (EXCLUIR RUTAS DE AUTH)
         */
        '/((?!_next/static|_next/image|favicon.ico|login|signup|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}