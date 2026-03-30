import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    try {
        // 1. Intentamos validar al usuario (esto refresca el token automáticamente)
        const { data: { user }, error } = await supabase.auth.getUser()

        // 2. Si tira un error de autenticación (ej: Invalid Refresh Token)
        if (error) {
            // Rutas públicas donde no pasa nada si no hay sesión
            const isPublicRoute = request.nextUrl.pathname === '/' ||
                request.nextUrl.pathname.startsWith('/login') ||
                request.nextUrl.pathname.startsWith('/rec-password')

            // Si está intentando entrar a una ruta privada con un token roto, lo pateamos al login
            if (!isPublicRoute) {
                const url = request.nextUrl.clone()
                url.pathname = '/login'
                const redirectResponse = NextResponse.redirect(url)

                // 🌟 MAGIA PURA: Le pasamos a la nueva respuesta las cookies limpias (vacías) 
                // que Supabase generó al fallar, para que el navegador "olvide" al fantasma.
                supabaseResponse.cookies.getAll().forEach((cookie) => {
                    redirectResponse.cookies.set(cookie.name, cookie.value)
                })

                return redirectResponse
            }
        }
    } catch (e) {
        // Failsafe absoluto por si el servidor de Supabase se cae
        console.error('Middleware Auth Error:', e)
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

// Le decimos a Next.js dónde ejecutar este escudo protector
export const config = {
    matcher: [
        /*
         * Aplica a todas las rutas excepto:
         * - _next/static (archivos estáticos)
         * - _next/image (optimización de imágenes)
         * - favicon.ico (ícono)
         * - Rutas de la API (api/) -> FUNDAMENTAL PARA QUE EL WEBHOOK RESPIRE
         * - Imágenes y assets
         */
        '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}