import { createBrowserClient } from '@supabase/ssr'

// 1. Creamos una variable global por fuera de la función
let supabaseInstance: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
    // 2. Si la conexión YA EXISTE, devolvemos la misma para todos
    if (supabaseInstance) {
        return supabaseInstance
    }

    // 3. Si no existe, la creamos por primera y ÚNICA vez
    supabaseInstance = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    return supabaseInstance
}