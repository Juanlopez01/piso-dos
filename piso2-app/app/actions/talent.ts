'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

export type TalentoPublico = {
    id: string
    nombre: string
    categoria: 'mujeres' | 'varones' | 'obras'
    disciplina: string | null
    bio: string | null
    fotos: string[]
    video_url: string | null
    destacado: boolean
}

// Vitrina pública: solo talentos activos, ordenados (destacados primero).
export async function getTalentosPublicosAction(): Promise<TalentoPublico[]> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talentos')
        .select('id, nombre, categoria, disciplina, bio, fotos, video_url, destacado')
        .eq('activo', true)
        .order('destacado', { ascending: false })
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })
    return (data || []) as TalentoPublico[]
}

export async function getTalentoAction(id: string): Promise<TalentoPublico | null> {
    const admin = getAdminClient()
    const { data } = await admin
        .from('talentos')
        .select('id, nombre, categoria, disciplina, bio, fotos, video_url, destacado')
        .eq('id', id)
        .eq('activo', true)
        .maybeSingle()
    return (data as TalentoPublico) || null
}

// El cliente elige un talento y envía la solicitud → queda registrada para Piso 2.
export async function crearSolicitudTalentoAction(payload: {
    talentoId: string
    talentoNombre: string
    clienteNombre: string
    clienteContacto: string
    clienteEmpresa?: string
    mensaje?: string
}) {
    if (!payload.clienteNombre?.trim() || !payload.clienteContacto?.trim()) {
        return { success: false, error: 'Completá tu nombre y un medio de contacto.' }
    }

    const admin = getAdminClient()
    const { error } = await admin.from('talent_solicitudes').insert({
        talento_id: payload.talentoId || null,
        talento_nombre: payload.talentoNombre || null,
        cliente_nombre: payload.clienteNombre.trim(),
        cliente_contacto: payload.clienteContacto.trim(),
        cliente_empresa: payload.clienteEmpresa?.trim() || null,
        mensaje: payload.mensaje?.trim() || null
    })

    if (error) return { success: false, error: error.message }
    return { success: true }
}
