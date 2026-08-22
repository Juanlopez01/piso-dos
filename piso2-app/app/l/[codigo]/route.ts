import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Resuelve un link corto (/l/CODIGO) y redirige al destino guardado.
// Es público: lo abre gente desde RRSS sin estar logueada.
const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
    const { codigo } = await params
    const admin = getAdminClient()

    const { data } = await admin
        .from('short_links')
        .select('destino, clicks')
        .eq('codigo', codigo)
        .maybeSingle()

    // Código inexistente → a la vidriera de Talent.
    if (!data?.destino) {
        return NextResponse.redirect(new URL('/talent', request.url))
    }

    // Contamos el click (best-effort, sin frenar la redirección).
    void admin.from('short_links').update({ clicks: (data.clicks || 0) + 1 }).eq('codigo', codigo)

    // destino es una ruta relativa → se resuelve contra el dominio actual.
    return NextResponse.redirect(new URL(data.destino, request.url))
}
