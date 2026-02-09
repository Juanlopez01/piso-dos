import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
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
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // IMPORTANTE: No protejas la ruta si es una API de auth o estática
    if (request.nextUrl.pathname.startsWith('/auth') ||
        request.nextUrl.pathname.startsWith('/_next') ||
        request.nextUrl.pathname.includes('.')) {
        return response
    }

    const { data: { user } } = await supabase.auth.getUser()

    // LÓGICA DE PROTECCIÓN (Aquí estaba el problema)

    // 1. Rutas públicas (Login y Signup)
    const isPublicRoute = request.nextUrl.pathname.startsWith('/login') ||
        request.nextUrl.pathname.startsWith('/signup')

    // 2. Si NO hay usuario y NO es ruta pública -> Mandar a Login
    if (!user && !isPublicRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 3. Si YA hay usuario y quiere entrar a Login o Signup -> Mandar al Home
    if (user && isPublicRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/' // O '/caja' si preferís
        return NextResponse.redirect(url)
    }

    return response
}