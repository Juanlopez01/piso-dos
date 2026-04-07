// app/actions/clases.ts
'use server'

// 👇 IMPORTAMOS EL LECTOR DE COOKIES QUE CREASTE EN EL PASO 1
import { createClient } from '@/utils/supabase/server-helper'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'
import { revalidatePath } from 'next/cache'

// Definimos un tipo para los datos que recibimos del formulario
type EditarClaseInput = {
    id: string
    nombre: string
    descripcion?: string
    tipo_clase: string
    nivel: string
    ritmo_id?: string
    hora_inicio: string // Formato "HH:mm"
    duracion_minutos: number
    cupo_maximo: number
    sala_id: string
    profesor_id: string
    profesor_2_id?: string
    tipo_acuerdo: string
    valor_acuerdo: number
    es_la_liga: boolean
    liga_nivel?: number
    compania_id?: string
    es_audicion: boolean
    imagen_url?: string
}

export async function editarClaseAction(input: EditarClaseInput) {
    const supabase = await createClient()

    // 1. Verificar autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        return { success: false, error: 'Usuario no autenticado.' }
    }

    // 2. Validaciones básicas de datos requeridos
    if (!input.id || !input.nombre || !input.hora_inicio || !input.sala_id || !input.profesor_id) {
        return { success: false, error: 'Faltan campos requeridos.' }
    }

    try {
        // 3. Preparar el objeto de actualización para Supabase
        // Asegúrate de que los nombres de las columnas coincidan con tu base de datos
        const updatePayload = {
            nombre: input.nombre,
            descripcion: input.descripcion || null,
            tipo_clase: input.tipo_clase,
            nivel: input.nivel,
            ritmo_id: input.ritmo_id || null,
            // Suponemos que la fecha no cambia al editar una clase individual, 
            // solo la hora. Necesitarás recuperar la fecha actual de la clase si 
            // tu columna 'inicio' es de tipo timestamp.
            // inicio: `${fecha_actual}T${input.hora_inicio}:00`, 
            duracion_minutos: input.duracion_minutos,
            cupo_maximo: input.es_audicion ? 9999 : input.cupo_maximo, // Cupo "ilimitado" para audiciones
            sala_id: input.sala_id,
            profesor_id: input.profesor_id,
            profesor_2_id: input.profesor_2_id || null,
            tipo_acuerdo: input.tipo_acuerdo,
            valor_acuerdo: input.valor_acuerdo,
            es_la_liga: input.es_la_liga,
            liga_nivel: input.es_la_liga ? input.liga_nivel : null,
            compania_id: input.tipo_clase === 'Compañía' ? input.compania_id : null,
            es_audicion: input.es_audicion,
            imagen_url: input.imagen_url || null,
            updated_at: new Date().toISOString(), // Opcional: columna de auditoría
        }

        // 4. Ejecutar la actualización en Supabase
        const { data, error } = await supabase
            .from('clases')
            .update(updatePayload)
            .eq('id', input.id) // Filtro para actualizar solo esta clase
            .select() // Opcional: retorna el registro actualizado

        if (error) {
            console.error('Error de Supabase al editar:', error)
            throw new Error(`Error al actualizar la clase: ${error.message}`)
        }

        // 5. Revalidar la caché de la página del calendario para mostrar los cambios
        revalidatePath('/calendario') // Ajusta la ruta si es necesario

        return { success: true, data }

    } catch (error: any) {
        console.error('Error en editarClaseAction:', error)
        return { success: false, error: error.message || 'Ocurrió un error inesperado al editar la clase.' }
    }
}

// Fijate que ya no le pasamos el token por parámetro, lo lee solo
export async function crearClasesAction(form: any, publicUrl: string | null) {
    const supabase = await createClient() // 👈 Llama a Supabase leyendo tus cookies

    try {
        // 1. Validamos que la sesión exista (ahora sí te va a reconocer como admin)
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) throw new Error('No autorizado (Sesión inválida)')

        const [horas, minutos] = form.hora.split(':')
        const serieUUID = form.fechas.length > 1 ? uuidv4() : null;

        const fechasCalculadas = form.fechas.map((fecha: string | Date) => {
            const baseDate = new Date(fecha)
            baseDate.setHours(parseInt(horas), parseInt(minutos), 0, 0)
            const endDateTime = new Date(baseDate.getTime() + form.duracion * 60000)
            return { baseDate, endDateTime }
        })

        // Chequeo de conflictos
        for (const { baseDate, endDateTime } of fechasCalculadas) {
            const inicioIso = baseDate.toISOString()
            const finIso = endDateTime.toISOString()
            const fechaLocalSegura = new Date(baseDate.getTime() + Math.abs(baseDate.getTimezoneOffset() * 60000))
            const fechaStr = format(fechaLocalSegura, 'yyyy-MM-dd')
            const hInicio = format(baseDate, 'HH:mm')
            const hFin = format(endDateTime, 'HH:mm')

            const { data: conflictoClase } = await supabase.from('clases').select('id, nombre').eq('sala_id', form.salaId).neq('estado', 'cancelada').lt('inicio', finIso).gt('fin', inicioIso).maybeSingle()
            if (conflictoClase) throw new Error(`Conflicto el ${format(baseDate, 'dd/MM')}: Clase "${conflictoClase.nombre}"`)

            const { data: conflictoAlquiler } = await supabase.from('alquileres').select('id, cliente_nombre').eq('sala_id', form.salaId).eq('fecha', fechaStr).in('estado', ['confirmado', 'pagado', 'pendiente']).lt('hora_inicio', hFin).gt('hora_fin', hInicio).maybeSingle()
            if (conflictoAlquiler) throw new Error(`Conflicto el ${format(baseDate, 'dd/MM')}: Alquiler "${conflictoAlquiler.cliente_nombre}"`)
        }

        const clasesAInsertar = fechasCalculadas.map(({ baseDate, endDateTime }: any) => ({
            nombre: form.nombre,
            descripcion: form.descripcion,
            tipo_clase: form.tipo,
            nivel: form.nivel,
            ritmo_id: form.ritmoId || null,
            inicio: baseDate.toISOString(),
            fin: endDateTime.toISOString(),
            sala_id: form.salaId,
            profesor_id: form.profeId,
            profesor_2_id: form.profe2Id || null,
            tipo_acuerdo: form.tipoAcuerdo,
            valor_acuerdo: Number(form.valorAcuerdo),
            imagen_url: publicUrl,
            cupo_maximo: form.esAudicion ? 9999 : (Number(form.cupoMaximo) || 0),
            serie_id: serieUUID,
            estado: 'activa',
            es_la_liga: form.esLaLiga,
            liga_nivel: form.esLaLiga ? form.ligaNivel : null,
            compania_id: form.tipo === 'Compañía' ? form.companiaId : null,
            es_audicion: form.esAudicion
        }))

        const { error } = await supabase.from('clases').insert(clasesAInsertar)
        if (error) throw new Error(error.message)

        // Refrescamos el calendario
        revalidatePath('/agenda')

        return { success: true, cantidad: clasesAInsertar.length }

    } catch (error: any) {
        console.error("🚨 Error en el Servidor:", error.message)
        return { success: false, error: error.message }
    }
}