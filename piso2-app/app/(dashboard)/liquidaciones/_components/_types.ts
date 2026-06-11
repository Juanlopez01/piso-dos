export type AlumnoLista = {
    nombre: string
    presente: boolean
    metodo: string
    pack_nombre: string
    es_invitado: boolean
}

export type ClaseLiquidacion = {
    id: string
    nombre: string
    inicio: string
    tipo_acuerdo: 'porcentaje' | 'fijo'
    valor_acuerdo: number
    cant_alumnos: number
    total_clase: number
    pago_profe: number
    pagado_profe: boolean
    profesor_nombre: string
    alumnos_lista: AlumnoLista[]
}

export type ProfeLiquidacion = {
    id: string
    nombre: string
    clases: ClaseLiquidacion[]
    total_pago: number
    total_recaudado: number
}

export type GrupoClaseLiquidacion = {
    nombre_grupo: string
    profesor_nombre: string
    clases: ClaseLiquidacion[]
    total_pago: number
    total_recaudado: number
    cant_alumnos_total: number
}

export type GrupoRaw = {
    id: string
    nombre: string
    totalRecaudado: number
    cantClases: number
    yaLiquidado: boolean
}

export type TransaccionVirtual = {
    id: string
    concepto: string
    monto: number
    metodo_pago: string
    created_at: string
}

export type ClaseRanking = {
    id: string
    nombre: string
    inicio: string
    profesor_nombre: string
    cant_alumnos: number
    total_recaudado: number
    categoria: 'regular' | 'especial' | 'grupo'
}

export type ModalPagoState = {
    isOpen: boolean
    clase: ClaseLiquidacion | null
    nombreProfe: string
}

export type ModalAlumnosState = {
    isOpen: boolean
    claseNombre: string
    fecha: string
    alumnos: AlumnoLista[]
}

export type ModalPagoMasivoState = {
    isOpen: boolean
    clases: ClaseLiquidacion[]
    nombreGrupo: string
    nombreProfe: string
    total: number
}

export type ModalPagoStaffState = {
    isOpen: boolean
    staff: any
    monto: number
}

export type ModalLiqGrupoState = {
    isOpen: boolean
    grupo: GrupoRaw | null
    montoPagar: number
    destinatario: string
}
