'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// Herramienta de recepción: subir una foto y aplicarla fácil a las clases que
// quieran (una clase recurrente completa, las de un profe, todas las de La Liga,
// etc.). Escribe clases.imagen_url, que es lo que muestra la cartelera.

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const ROLES_OK = ['admin', 'recepcion']
async function requireStaff(): Promise<{ ok: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !ROLES_OK.includes(perfil.rol)) return { ok: false, error: 'Sin permisos' }
    return { ok: true }
}

export type GrupoFoto = {
    key: string
    nombre: string
    profesor: string
    tipo_clase: string
    es_la_liga: boolean
    imagen_url: string | null
    cantidad: number
    proxima: string | null
    clase_ids: string[]
}

// Clases próximas (no canceladas), agrupadas por nombre+profe+tipo, para elegir
// fácil a cuáles aplicarles una foto.
export async function getClasesParaFotoAction(): Promise<GrupoFoto[]> {
    const perm = await requireStaff()
    if (!perm.ok) return []
    const admin = getAdminClient()
    const hoy = new Date().toISOString()
    const { data } = await admin
        .from('clases')
        .select(`id, nombre, inicio, tipo_clase, imagen_url, es_la_liga,
                 profesor:profiles!clases_profesor_id_fkey(nombre_completo)`)
        .gte('inicio', hoy)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: true })

    const grupos: Record<string, GrupoFoto> = {}
    for (const c of (data || []) as any[]) {
        const profe = (Array.isArray(c.profesor) ? c.profesor[0]?.nombre_completo : c.profesor?.nombre_completo) || 'Sin asignar'
        const key = `${c.nombre}||${profe}||${c.tipo_clase}||${c.es_la_liga ? 'liga' : 'x'}`
        if (!grupos[key]) {
            grupos[key] = {
                key, nombre: c.nombre, profesor: profe, tipo_clase: c.tipo_clase,
                es_la_liga: !!c.es_la_liga, imagen_url: c.imagen_url || null,
                cantidad: 0, proxima: c.inicio, clase_ids: [],
            }
        }
        grupos[key].cantidad++
        grupos[key].clase_ids.push(c.id)
        // La imagen representativa es la de la primera con imagen (para la miniatura).
        if (!grupos[key].imagen_url && c.imagen_url) grupos[key].imagen_url = c.imagen_url
    }
    // La Liga primero (que es lo que estaban queriendo cambiar), después por próxima fecha.
    return Object.values(grupos).sort((a, b) => {
        if (a.es_la_liga !== b.es_la_liga) return a.es_la_liga ? -1 : 1
        return new Date(a.proxima || 0).getTime() - new Date(b.proxima || 0).getTime()
    })
}

// Aplica una foto (url ya subida al bucket) a las clases indicadas.
export async function aplicarFotoClasesAction(claseIds: string[], imagenUrl: string) {
    const perm = await requireStaff()
    if (!perm.ok) return { success: false, error: perm.error }
    if (!imagenUrl) return { success: false, error: 'Falta la foto.' }
    if (!claseIds?.length) return { success: false, error: 'Elegí al menos una clase.' }

    const admin = getAdminClient()
    const { error } = await admin.from('clases').update({ imagen_url: imagenUrl }).in('id', claseIds)
    if (error) return { success: false, error: error.message }

    revalidatePath('/explorar')
    revalidatePath('/cartelera')
    return { success: true, cantidad: claseIds.length }
}
