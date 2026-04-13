import { createBrowserClient } from '@supabase/ssr'

// 🚀 LA BALA DE PLATA: Guardamos la conexión acá arriba
let browserClient: ReturnType<typeof createBrowserClient> | undefined = undefined;

export function createClient() {
    // Si la conexión ya existe, devolvemos la misma a todos los que pregunten.
    // ¡ESTO ELIMINA EL EMBOTELLAMIENTO Y LOS CUELGUES DE RAIZ!
    if (browserClient) {
        return browserClient;
    }

    // Si no existe, la creamos por primera y única vez.
    browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    return browserClient;
}