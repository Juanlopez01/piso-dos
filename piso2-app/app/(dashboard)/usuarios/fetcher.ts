// Carga de datos del directorio de usuarios (extraída de page.tsx).
import { createClient } from '@/utils/supabase/client'
import type { Ritmo, Producto, CompaniaBasica, UsuarioDirectorio } from './types'

const getInteresesSeguro = (intereses: string | string[] | null | undefined): string[] => {
    if (!intereses) return []
    if (Array.isArray(intereses)) return intereses.map(String)
    if (typeof intereses === 'string') {
        try {
            const parsed = JSON.parse(intereses)
            if (Array.isArray(parsed)) return parsed.map(String)
        } catch (e) {
            return [intereses]
        }
    }
    return []
}

// Trae TODAS las filas paginando de a 1000 (Supabase corta en 1000 por request).
// Sin esto, con +1000 perfiles los últimos (alfabéticamente) no aparecían.
const fetchAll = async (makeQuery: (from: number, to: number) => any): Promise<any[]> => {
    const PAGE = 1000
    let from = 0
    const all: any[] = []
    while (true) {
        const { data, error } = await makeQuery(from, from + PAGE - 1)
        if (error) throw error
        all.push(...(data || []))
        if (!data || data.length < PAGE) break
        from += PAGE
    }
    return all
}

export const fetcher = async (): Promise<{ usuarios: UsuarioDirectorio[], ritmos: Ritmo[], productos: Producto[], todasLasCompanias: CompaniaBasica[] }> => {
    const supabase = createClient()

    try {
        const [
            perfiles,
            pcData,
            pasesData,
            { data: ritmos, error: errRitmos },
            { data: productos, error: errProductos },
            { data: companiasMaestras, error: errCias }
        ] = await Promise.all([
            fetchAll((f, t) => supabase.from('profiles').select('*').order('nombre_completo', { ascending: true }).range(f, t)),
            fetchAll((f, t) => supabase.from('perfiles_companias').select('perfil_id, compania:companias(id, nombre)').range(f, t)),
            fetchAll((f, t) => supabase.from('pases_exclusivos').select('usuario_id, pase_referencia, cantidad').range(f, t)),
            supabase.from('ritmos').select('id, nombre').order('nombre', { ascending: true }),
            supabase.from('productos').select('id, nombre, precio, creditos, tipo_clase, pase_referencia').eq('activo', true),
            supabase.from('companias').select('id, nombre').order('nombre', { ascending: true })
        ])

        const usuariosProcesados: UsuarioDirectorio[] = (perfiles || []).map((u: any) => {
            const misCompanias = pcData?.filter((pc: any) => pc.perfil_id === u.id).map((pc: any) => pc.compania as unknown as CompaniaBasica) || []
            const misPases = pasesData?.filter((p: any) => p.usuario_id === u.id) || []

            return {
                ...u,
                dni: u.dni || null,
                intereses_procesados: getInteresesSeguro(u.intereses_ritmos),
                companias: misCompanias,
                porcentaje_beca_liga: u.porcentaje_beca_liga || 0,
                porcentaje_beca_compania: u.porcentaje_beca_compania || 0,
                creditos_especiales: u.creditos_especiales || 0,
                pases_exclusivos: misPases,
                avatar_url: u.avatar_url || null,
                is_frio: u.is_frio || false,
                creditos_regulares: u.creditos_regulares || 0,
                permisos_grupos: u.permisos_grupos || []
            }
        })

        return {
            usuarios: usuariosProcesados,
            ritmos: ritmos || [],
            productos: productos || [],
            todasLasCompanias: companiasMaestras || []
        }

    } catch (error) {
        console.error("💥 ERROR FATAL EN EL FETCHER:", error);
        throw error;
    }
}
