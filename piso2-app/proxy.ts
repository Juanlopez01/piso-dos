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
            request.nextUrl.pathname.startsWith('/api/mercadopago') ||
            request.nextUrl.pathname.startsWith('/act-password') ||
            request.nextUrl.pathname.startsWith('/alquiler') ||
            request.nextUrl.pathname.startsWith('/pago-exito') ||
            request.nextUrl.pathname.startsWith('/pagar') || // Link de venta: lo abre un cliente sin cuenta
            request.nextUrl.pathname.startsWith('/l/') || // Links cortos: los abre gente desde RRSS sin cuenta
            // Vitrina de Talent pública (marcas sin cuenta), EXCEPTO /talent/postular que pide login
            (request.nextUrl.pathname.startsWith('/talent') && !request.nextUrl.pathname.startsWith('/talent/postular')) ||
            request.nextUrl.pathname.startsWith('/evento/') || // Compra pública de entradas (PISO2E); el panel /eventos sigue protegido
            request.nextUrl.pathname.startsWith('/entradas/') || // Entradas con QR (link público por token)
            request.nextUrl.pathname.startsWith('/compania/') || // Acceso de la compañía: ventas en vivo por token (sin login)
            request.nextUrl.pathname.startsWith('/cartelera') || // Cartelera pública de clases: se ve sin login; reservar pide login
            request.nextUrl.pathname.startsWith('/streaming') ||
            request.nextUrl.pathname.startsWith('/nueva-generacion') ||
            request.nextUrl.pathname.startsWith('/instalar') // 🚀 EL PASE VIP PARA MERCADO PAGO

        // 3. ¿El error es un PARPADEO de Supabase (red / servidor caído) o un
        //    "no estás logueado" de verdad? Un error transitorio NO debe
        //    desloguear a nadie: tratarlo como logout es lo que hacía que un
        //    segundo de intermitencia pateara al usuario al login y le borrara
        //    la sesión ("se cierra la cuenta y se vuelve a abrir sola").
        //    - Sesión ausente/inválida => status 400/401/403 (logout real).
        //    - Red / Supabase caído   => AuthRetryableFetchError, status 0 o 5xx.
        const status = (error as any)?.status
        const errorTransitorio = !!error && (
            (error as any)?.name === 'AuthRetryableFetchError' ||
            status === 0 ||
            (typeof status === 'number' && status >= 500)
        )

        // 4. Solo mandamos al login si REALMENTE no hay sesión. Ante un parpadeo
        //    dejamos pasar: la sesión sigue en las cookies y se revalida sola en
        //    el próximo request (y el guardado a nivel de página sigue firme).
        if (!user && !errorTransitorio && !isPublicRoute) {
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
        // Excepción inesperada (casi siempre red / Supabase caído): NO
        // deslogueamos por un parpadeo. Dejamos pasar; la sesión sigue en las
        // cookies y el guardado a nivel de página sigue protegiendo las rutas.
        console.error('Proxy Auth Error (transitorio, no desloguea):', e)
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)',
    ],
}