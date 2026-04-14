import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request: {
            headers: request.headers,
        },
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
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    try {
        // 1. Intentamos validar al usuario (esto refresca el token automáticamente de forma segura)
        const { data: { user }, error } = await supabase.auth.getUser()

        // 2. Definimos cuáles son las rutas públicas
        const isPublicRoute = request.nextUrl.pathname === '/' ||
            request.nextUrl.pathname.startsWith('/login') ||
            request.nextUrl.pathname.startsWith('/rec-password') ||
            request.nextUrl.pathname.startsWith('/api/mercadopago') || // 🚀 EL PASE VIP PARA MERCADO PAGO
            request.nextUrl.pathname.startsWith('/instalar') // 🚀 EL PASE VIP PARA MERCADO PAGO

        // 3. Si hay un error de token o no hay usuario, y quiere entrar a zona privada -> Al login
        if ((error || !user) && !isPublicRoute) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            const redirectResponse = NextResponse.redirect(url)

            // Limpiamos las cookies rotas pasándoselas a la redirección
            supabaseResponse.cookies.getAll().forEach((cookie) => {
                redirectResponse.cookies.set(cookie.name, cookie.value)
            })

            return redirectResponse
        }
    } catch (e) {
        console.error('Proxy Auth Error:', e)
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}