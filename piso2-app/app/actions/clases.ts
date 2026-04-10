// app/actions/clases.ts
'use server'

// 👇 IMPORTAMOS EL LECTOR DE COOKIES
import { createClient } from '@/utils/supabase/server-helper'
import { v4 as uuidv4 } from 'uuid'
import {
    startOfMonth,
    endOfMonth,
    eachWeekOfInterval,
    format,
    addMonths,
    setHours,
    setMinutes,
    getDay,
    addDays,
    startOfDay
} from 'date-fns'
import { revalidatePath } from 'next/cache'

type EditarClaseInput = {
    id: string
    nombre: string
    descripcion?: string
    tipo_clase: string
    nivel: string
    ritmo_id?: string
    hora_inicio: string
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

    // 🚀 BLINDAJE 1: Usamos getSession() para no chocar con el Middleware
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    if (authError || !session?.user) {
        return { success: false, error: 'Usuario no autenticado o sesión expirada.' }
    }

    if (!input.id || !input.nombre || !input.hora_inicio || !input.sala_id || !input.profesor_id) {
        return { success: false, error: 'Faltan campos requeridos.' }
    }

    try {
        const updatePayload = {
            nombre: input.nombre,
            descripcion: input.descripcion || null,
            tipo_clase: input.tipo_clase,
            nivel: input.nivel,
            ritmo_id: input.ritmo_id || null,
            duracion_minutos: input.duracion_minutos,
            cupo_maximo: input.es_audicion ? 9999 : input.cupo_maximo,
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
            updated_at: new Date().toISOString(),
        }

        const { data, error } = await supabase
            .from('clases')
            .update(updatePayload)
            .eq('id', input.id)
            .select()

        if (error) {
            console.error('Error de Supabase al editar:', error)
            throw new Error(`Error al actualizar la clase: ${error.message}`)
        }

        revalidatePath('/calendario')

        return { success: true, data }

    } catch (error: any) {
        console.error('Error en editarClaseAction:', error)
        return { success: false, error: error.message || 'Ocurrió un error inesperado al editar la clase.' }
    }
}

export async function crearClasesAction(form: any, publicUrl: string | null) {
    const supabase = await createClient()

    try {
        // 🚀 BLINDAJE 2: Usamos getSession() acá también.
        const { data: { session }, error: authError } = await supabase.auth.getSession()
        if (authError || !session?.user) throw new Error('No autorizado (Sesión inválida o expirada)')

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

export async function duplicarMesAction(mesOrigen: string) { // mesOrigen formato "YYYY-MM"
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        // 1. Configurar fechas de origen y destino
        const fechaBaseOrigen = new Date(mesOrigen + "-02") // Forzamos día 2 para evitar líos de zona horaria
        const inicioOrigen = startOfMonth(fechaBaseOrigen)
        const finOrigen = endOfMonth(fechaBaseOrigen)

        const inicioDestino = startOfMonth(addMonths(inicioOrigen, 1))

        // 2. Traer todas las clases del mes de origen
        const { data: clases, error: errFetch } = await supabase
            .from('clases')
            .select('*')
            .gte('inicio', inicioOrigen.toISOString())
            .lte('inicio', finOrigen.toISOString())

        if (errFetch) throw errFetch
        if (!clases || clases.length === 0) throw new Error('No hay clases en el mes seleccionado para duplicar.')

        // 3. Agrupación por series para mantener la integridad
        // Si una clase tiene el mismo serie_id original, en el nuevo mes deben compartir un nuevo serie_id
        const mapaSeries = new Map()

        const nuevasClases = clases.map((clase) => {
            const fechaOriginal = new Date(clase.inicio)

            // Calculamos en qué semana del mes estaba (0, 1, 2, 3, 4)
            const diaSemana = getDay(fechaOriginal)
            const diaMes = fechaOriginal.getDate()
            const semanaDelMes = Math.floor((diaMes - 1) / 7)

            // Buscamos el mismo día de la semana en la misma semana del mes de destino
            let nuevaFecha = addDays(inicioDestino, (semanaDelMes * 7))
            while (getDay(nuevaFecha) !== diaSemana) {
                nuevaFecha = addDays(nuevaFecha, 1)
            }

            // Ajustamos la hora exacta de la clase original
            nuevaFecha = setHours(nuevaFecha, fechaOriginal.getHours())
            nuevaFecha = setMinutes(nuevaFecha, fechaOriginal.getMinutes())

            // Lógica de Series: si era una serie, generamos un ID nuevo por cada grupo
            let nuevoSerieId = null
            if (clase.serie_id) {
                if (!mapaSeries.has(clase.serie_id)) {
                    mapaSeries.set(clase.serie_id, crypto.randomUUID())
                }
                nuevoSerieId = mapaSeries.get(clase.serie_id)
            }

            // Retornamos el nuevo objeto (quitando IDs viejos)
            const { id, created_at, ...datosClase } = clase
            return {
                ...datosClase,
                inicio: nuevaFecha.toISOString(),
                serie_id: nuevoSerieId,
                // Si tenés columna de fin, calculala igual o sumale la duración
                fin: clase.fin ? addDays(new Date(clase.fin), 28).toISOString() : null
            }
        })

        // 4. Inserción masiva
        const { error: errInsert } = await supabase.from('clases').insert(nuevasClases)
        if (errInsert) throw errInsert

        revalidatePath('/calendario')
        return { success: true, count: nuevasClases.length }

    } catch (error: any) {
        console.error("Error duplicando mes:", error)
        return { success: false, error: error.message }
    }
}