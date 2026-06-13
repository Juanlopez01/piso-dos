// Generado a partir del esquema real de Supabase — actualizar si cambia la DB.
// Row types: tipado completo (seguridad en lecturas).
// Insert/Update: any — validaciones con zod en app/actions/*.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'admin' | 'recepcion' | 'profesor' | 'alumno' | 'coordinador' | 'auxiliar' | 'visitante'

export type Database = {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    created_at: string
                    email: string | null
                    nombre: string | null
                    apellido: string | null
                    nombre_completo: string | null
                    telefono: string | null
                    fecha_nacimiento: string | null
                    genero: string | null
                    dni: string | null
                    edad: number | null
                    direccion: string | null
                    rol: UserRole
                    foto_url: string | null
                    avatar_url: string | null
                    creditos_disponibles: number | null
                    creditos_regulares: number | null
                    creditos_especiales: number | null
                    nivel_liga: number | null
                    es_alumno_liga: boolean | null
                    porcentaje_beca_liga: number | null
                    porcentaje_beca_compania: number | null
                    permisos_grupos: string[] | null
                    etiquetas: string[] | null
                    intereses: string[] | null
                    intereses_ritmos: string[] | null
                    alias_cbu: string | null
                    nombre_remplazo: string | null
                    contacto_remplazo: string | null
                    contacto_emergencia: string | null
                    obra_social: string | null
                    condiciones_medicas: string | null
                    plan_medico: string | null
                    apto_fisico_url: string | null
                    apto_fisico_fecha: string | null
                    staff_observations: string | null
                }
                Insert: any
                Update: any
            }
            clases: {
                Row: {
                    id: string
                    sala_id: string | null
                    profesor_id: string | null
                    profesor_2_id: string | null
                    nombre: string
                    descripcion: string | null
                    inicio: string
                    fin: string
                    cupo_maximo: number | null
                    estado: string | null
                    cancelada: boolean | null
                    es_alquiler: boolean | null
                    es_la_liga: boolean | null
                    liga_nivel: number | null
                    es_audicion: boolean | null
                    es_combinable: boolean | null
                    compania_id: string | null
                    serie_id: string | null
                    ritmo_id: string | null
                    tipo_clase: string | null
                    nivel: string | null
                    tipo_acuerdo: string | null
                    valor_acuerdo: number | null
                    inscritos_externos: number | null
                    pagado_profe: boolean | null
                    imagen_url: string | null
                }
                Insert: any
                Update: any
            }
            inscripciones: {
                Row: {
                    id: string
                    created_at: string
                    clase_id: string
                    user_id: string | null
                    presente: boolean | null
                    asistio: boolean | null
                    es_invitado: boolean | null
                    nombre_invitado: string | null
                    modalidad: string | null
                    metodo_pago: string | null
                    valor_credito: number | null
                    pack_usado_id: string | null
                    estado_asistencia: string | null
                    saldo_pendiente: number | null
                }
                Insert: any
                Update: any
            }
            companias: {
                Row: {
                    id: string
                    created_at: string
                    nombre: string
                    descripcion: string | null
                    coordinador_id: string | null
                    precio_cuota: number | null
                }
                Insert: any
                Update: any
            }
            companias_pagos: {
                Row: {
                    id: string
                    created_at: string
                    alumno_id: string
                    compania_id: string
                    mes: number
                    anio: number
                    monto: number
                    metodo_pago: string | null
                }
                Insert: any
                Update: any
            }
            perfiles_companias: {
                Row: {
                    perfil_id: string
                    compania_id: string
                    plan_id: string | null
                }
                Insert: any
                Update: any
            }
            companias_planes: {
                Row: {
                    id: string
                    compania_id: string
                    nombre: string
                    tipo: 'full' | 'dias'
                    dias_semana: number | null
                    precio_transf: number
                    precio_efvo: number
                    created_at: string
                }
                Insert: any
                Update: any
            }
            materiales: {
                Row: {
                    id: string
                    created_at: string
                    titulo: string
                    descripcion: string | null
                    archivo_url: string
                    subido_por: string | null
                    compania_id: string | null
                    liga_nivel: number | null
                }
                Insert: any
                Update: any
            }
            caja_turnos: {
                Row: {
                    id: string
                    created_at: string
                    usuario_id: string
                    sede_id: string | null
                    monto_inicial: number | null
                    monto_final: number | null
                    saldo_inicial: number | null
                    saldo_final_efectivo: number | null
                    saldo_final_digital: number | null
                    total_ingresos: number | null
                    total_egresos: number | null
                    estado: string
                    fecha_apertura: string | null
                    fecha_cierre: string | null
                    cerrado_at: string | null
                    notas_cierre: string | null
                }
                Insert: any
                Update: any
            }
            caja_movimientos: {
                Row: {
                    id: string
                    created_at: string
                    turno_id: string | null
                    tipo: 'ingreso' | 'egreso'
                    concepto: string
                    monto: number
                    metodo_pago: string | null
                    origen_referencia: string | null
                    comprobante_url: string | null
                }
                Insert: any
                Update: any
            }
            salas: {
                Row: {
                    id: string
                    sede_id: string | null
                    nombre: string
                    capacidad: number | null
                    p_ensayo_manana: number | null
                    p_ensayo_noche: number | null
                    p_ensayo_finde: number | null
                    p_clase_manana: number | null
                    p_clase_noche: number | null
                    p_clase_finde: number | null
                    p_prod_manana: number | null
                    p_prod_noche: number | null
                    p_prod_finde: number | null
                }
                Insert: any
                Update: any
            }
            sedes: {
                Row: {
                    id: string
                    created_at: string
                    nombre: string
                    direccion: string | null
                }
                Insert: any
                Update: any
            }
            ritmos: {
                Row: {
                    id: string
                    created_at: string
                    nombre: string
                }
                Insert: any
                Update: any
            }
            productos: {
                Row: {
                    id: string
                    created_at: string
                    nombre: string
                    descripcion: string | null
                    precio: number
                    creditos: number
                    activo: boolean | null
                    tipo_clase: string | null
                    pase_referencia: string | null
                }
                Insert: any
                Update: any
            }
            alumno_packs: {
                Row: {
                    id: string
                    user_id: string
                    producto_id: string | null
                    tipo_clase: string | null
                    cantidad_inicial: number | null
                    creditos_restantes: number | null
                    monto_abonado: number | null
                    fecha_compra: string | null
                    fecha_vencimiento: string | null
                    estado: string | null
                    mp_payment_id: string | null
                    metodo_pago: string | null
                }
                Insert: any
                Update: any
            }
            pases_exclusivos: {
                Row: {
                    id: string
                    usuario_id: string
                    pase_referencia: string
                    cantidad: number
                    updated_at: string | null
                }
                Insert: any
                Update: any
            }
            cupones: {
                Row: {
                    id: string
                    created_at: string
                    codigo: string
                    porcentaje: number
                    activo: boolean | null
                }
                Insert: any
                Update: any
            }
            cupones_usados: {
                Row: {
                    id: string
                    created_at: string
                    cupon_id: string
                    user_id: string
                }
                Insert: any
                Update: any
            }
            pagos_online: {
                Row: {
                    id: string
                    created_at: string
                    user_id: string
                    mp_payment_id: string | null
                    monto: number
                    concepto: string | null
                    tipo_pago: string | null
                    producto_id: string | null
                    estado: string | null
                }
                Insert: any
                Update: any
            }
            pagos: {
                Row: {
                    id: string
                    created_at: string
                    usuario_id: string
                    mp_payment_id: string | null
                    mp_status: string | null
                    monto: number
                    tipo_pago: string | null
                    producto_id: string | null
                    detalles: Json | null
                }
                Insert: any
                Update: any
            }
            liga_pagos: {
                Row: {
                    id: string
                    created_at: string
                    alumno_id: string
                    mes: number
                    anio: number
                    monto: number
                    metodo_pago: string | null
                    turno_caja_id: string | null
                }
                Insert: any
                Update: any
            }
            liga_evaluaciones: {
                Row: {
                    id: string
                    created_at: string
                    alumno_id: string
                    clase_id: string | null
                    profesor_id: string | null
                    anio: number | null
                    cuatrimestre: string | null
                    nota_final: number | null
                    aprobado: boolean | null
                    feedback_docente: string | null
                    observaciones_docente: string | null
                    requiere_recuperatorio: boolean | null
                    derecho_examen_pagado: boolean | null
                    criterios: Json | null
                    criterios_notas: Json | null
                }
                Insert: any
                Update: any
            }
            liga_criterios: {
                Row: {
                    id: string
                    created_at: string
                    nombre: string
                }
                Insert: any
                Update: any
            }
            liga_avisos: {
                Row: {
                    id: string
                    created_at: string
                    autor_id: string | null
                    titulo: string | null
                    mensaje: string
                    tipo_destino: string | null
                    nivel_destino: number | null
                    clase_id: string | null
                    alumno_id: string | null
                }
                Insert: any
                Update: any
            }
            notificaciones: {
                Row: {
                    id: string
                    created_at: string
                    usuario_id: string
                    titulo: string | null
                    mensaje: string
                    leido: boolean | null
                    link: string | null
                    categoria: string | null
                    segmento: string | null
                }
                Insert: any
                Update: any
            }
            comunicados: {
                Row: {
                    id: string
                    created_at: string
                    titulo: string | null
                    mensaje: string
                    importante: boolean | null
                    autor_id: string | null
                }
                Insert: any
                Update: any
            }
            liquidaciones: {
                Row: {
                    id: string
                    created_at: string
                    profesor_id: string | null
                    mes: string | null
                    monto: number | null
                    estado: string | null
                    detalle: string | null
                }
                Insert: any
                Update: any
            }
            configuraciones: {
                Row: {
                    clave: string
                    valor: string
                }
                Insert: any
                Update: any
            }
            alquileres: {
                Row: {
                    id: string
                    created_at: string
                    sala_id: string | null
                    cliente_nombre: string | null
                    cliente_telefono: string | null
                    cliente_email: string | null
                    cliente_contacto: string | null
                    fecha: string | null
                    fecha_inicio: string | null
                    fecha_fin: string | null
                    hora_inicio: string | null
                    hora_fin: string | null
                    duracion_horas: number | null
                    tipo_uso: string | null
                    es_fijo: boolean | null
                    monto_total: number | null
                    monto_pagado: number | null
                    estado: string | null
                    estado_pago: string | null
                    metodo_pago: string | null
                    notas: string | null
                    notas_recepcion: string | null
                    cantidad_personas: number | null
                    group_id: string | null
                }
                Insert: any
                Update: any
            }
            clases_config: {
                Row: {
                    id: string
                    created_at: string
                    nombre: string
                    profesor_id: string | null
                    sala_id: string | null
                    dia_semana: number | null
                    hora_inicio: string | null
                    duracion_minutos: number | null
                    capacidad_maxima: number | null
                    precio_clase_suelta: number | null
                    activa: boolean | null
                }
                Insert: any
                Update: any
            }
            inscripciones_clases: {
                Row: {
                    id: string
                    created_at: string
                    clase_id: string
                    alumno_id: string | null
                    es_invitado: boolean | null
                    monto_pagado: number | null
                    metodo_pago: string | null
                    estado: string | null
                }
                Insert: any
                Update: any
            }
            asistencias: {
                Row: {
                    id: string
                    created_at: string
                    clase_id: string
                    alumno_id: string
                    presente: boolean | null
                    pagado: boolean | null
                    metodo_pago: string | null
                }
                Insert: any
                Update: any
            }
            packs: {
                Row: {
                    id: string
                    nombre: string
                    precio: number
                    creditos: number
                    activo: boolean | null
                }
                Insert: any
                Update: any
            }
        }
        Views: Record<string, never>
        Functions: {
            cerrar_turno_caja: {
                Args: { p_turno_id: string }
                Returns: { success: boolean; message: string }
            }
        }
        Enums: {
            user_role: UserRole
        }
    }
}

// --- Tipos de conveniencia ---
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Clase = Database['public']['Tables']['clases']['Row']
export type Inscripcion = Database['public']['Tables']['inscripciones']['Row']
export type Compania = Database['public']['Tables']['companias']['Row']
export type CompaniaPago = Database['public']['Tables']['companias_pagos']['Row']
export type PerfilCompania = Database['public']['Tables']['perfiles_companias']['Row']
export type CajaTurno = Database['public']['Tables']['caja_turnos']['Row']
export type CajaMovimiento = Database['public']['Tables']['caja_movimientos']['Row']
export type Sala = Database['public']['Tables']['salas']['Row']
export type Sede = Database['public']['Tables']['sedes']['Row']
export type Ritmo = Database['public']['Tables']['ritmos']['Row']
export type Producto = Database['public']['Tables']['productos']['Row']
export type AlumnoPack = Database['public']['Tables']['alumno_packs']['Row']
export type Cupon = Database['public']['Tables']['cupones']['Row']
export type Notificacion = Database['public']['Tables']['notificaciones']['Row']
export type Comunicado = Database['public']['Tables']['comunicados']['Row']
export type LigaEvaluacion = Database['public']['Tables']['liga_evaluaciones']['Row']
export type LigaAviso = Database['public']['Tables']['liga_avisos']['Row']
export type LigaPago = Database['public']['Tables']['liga_pagos']['Row']
export type Alquiler = Database['public']['Tables']['alquileres']['Row']
export type Liquidacion = Database['public']['Tables']['liquidaciones']['Row']
export type Configuracion = Database['public']['Tables']['configuraciones']['Row']
export type PaseExclusivo = Database['public']['Tables']['pases_exclusivos']['Row']
