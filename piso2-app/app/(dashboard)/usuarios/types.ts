// Tipos del directorio de usuarios (extraídos de page.tsx para achicarlo).

export type Ritmo = { id: string; nombre: string }

export type Producto = {
    id: string; nombre: string; precio: number; creditos: number; tipo_clase: 'regular' | 'seminario' | 'exclusivo';
    pase_referencia?: string
}

export type CompaniaBasica = { id: string; nombre: string }

export type PaseExclusivo = { pase_referencia: string; cantidad: number }

export type RPCUsuario = {
    id: string
    nombre_completo: string | null
    email: string
    telefono: string | null
    dni?: string | null
    rol: string
    nivel_liga: number | string | null
    creditos_regulares: number
    staff_observations: string | null
    intereses_ritmos: string | string[] | null
    is_frio: boolean
    alias_cbu?: string | null
    nombre_remplazo?: string | null
    contacto_remplazo?: string | null
    permisos_grupos?: string[]
    admin_finanzas?: boolean
    acceso_curaduria?: boolean
}

export type RPCUsuariosData = {
    usuarios: RPCUsuario[] | null
    ritmos: Ritmo[] | null
    productos: Producto[] | null
    todasLasCompanias: CompaniaBasica[] | null
}

export type UsuarioDirectorio = RPCUsuario & {
    intereses_procesados: string[]
    porcentaje_beca_liga: number
    porcentaje_beca_compania: number
    companias: CompaniaBasica[]
    creditos_especiales: number
    pases_exclusivos: PaseExclusivo[]
    avatar_url: string | null
}
