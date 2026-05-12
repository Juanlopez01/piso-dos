// app/actions/clases.ts
'use server'

// 👇 IMPORTAMOS EL LECTOR DE COOKIES
import { createClient } from '@/utils/supabase/server-helper'
import { v4 as uuidv4 } from 'uuid'
import {
    startOfMonth,
    endOfMonth,
    format,
    addMonths,
    setHours,
    setMinutes,
    getDay,
    addDays,
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
    es_combinable?: boolean // 🚀 Agregado al tipo
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
            es_combinable: input.es_combinable ?? true, // 🚀 Agregado al payload de actualización
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

        // Calculamos la hora de fin sumando la duración en minutos
        const totalMinutes = parseInt(horas) * 60 + parseInt(minutos) + Number(form.duracion);
        const hFinStr = `${Math.floor(totalMinutes / 60).toString().padStart(2, '0')}:${(totalMinutes % 60).toString().padStart(2, '0')}`;
        const hInicioStr = `${horas.padStart(2, '0')}:${minutos.padStart(2, '0')}`;

        const fechasCalculadas = form.fechas.map((fecha: string | Date) => {
            // Limpiamos la fecha para forzar formato local "YYYY-MM-DD" y evitar saltos
            let fechaString = typeof fecha === 'string' ? fecha : format(fecha, 'yyyy-MM-dd');
            if (fechaString.includes('T')) fechaString = fechaString.split('T')[0];

            // Armamos las ISO Strings forzando el offset de Argentina (-03:00) para que Postgres no lo cambie
            const isoInicio = `${fechaString}T${hInicioStr}:00-03:00`;
            const isoFin = `${fechaString}T${hFinStr}:00-03:00`;

            return {
                fechaLimpia: fechaString,
                inicioGuardar: isoInicio,
                finGuardar: isoFin
            }
        })

        // 🚀 CHEQUEO DE CONFLICTOS BLINDADO
        for (const { fechaLimpia, inicioGuardar, finGuardar } of fechasCalculadas) {

            // 1. Chequeo contra otras clases (usando las ISO forzadas a -03:00)
            const { data: conflictoClase } = await supabase.from('clases')
                .select('id, nombre')
                .eq('sala_id', form.salaId)
                .neq('estado', 'cancelada')
                .lt('inicio', finGuardar)
                .gt('fin', inicioGuardar)
                .maybeSingle()

            if (conflictoClase) throw new Error(`Conflicto el ${format(new Date(fechaLimpia + "T12:00:00"), 'dd/MM')}: Clase "${conflictoClase.nombre}"`)

            // 2. Chequeo contra Alquileres (Comparando Strings Puros para evitar fantasmas UTC)
            const { data: conflictoAlquiler } = await supabase.from('alquileres')
                .select('id, cliente_nombre')
                .eq('sala_id', form.salaId)
                .eq('fecha', fechaLimpia) // Match exacto "YYYY-MM-DD"
                .in('estado', ['confirmado', 'pagado', 'pendiente'])
                .lt('hora_inicio', hFinStr) // "16:00" < "18:00"
                .gt('hora_fin', hInicioStr) // "15:00" > "17:30"
                .maybeSingle()

            if (conflictoAlquiler) throw new Error(`Conflicto el ${format(new Date(fechaLimpia + "T12:00:00"), 'dd/MM')}: Alquiler "${conflictoAlquiler.cliente_nombre}"`)
        }

        // Si todo está OK, armamos el array para insertar
        const clasesAInsertar = fechasCalculadas.map(({ inicioGuardar, finGuardar }: any) => ({
            nombre: form.nombre,
            descripcion: form.descripcion,
            tipo_clase: form.tipo,
            nivel: form.nivel,
            ritmo_id: form.ritmoId || null,
            inicio: inicioGuardar, // Se guarda con offset de Argentina
            fin: finGuardar,       // Se guarda con offset de Argentina
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
            es_audicion: form.esAudicion,
            es_combinable: form.esCombinable ?? true // 🚀 Agregado al guardado de creación masiva
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

export async function duplicarMesAction(mesOrigen: string) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const fechaBaseOrigen = new Date(mesOrigen + "-02")
        const inicioOrigen = startOfMonth(fechaBaseOrigen)
        const finOrigen = endOfMonth(fechaBaseOrigen)

        const inicioDestino = startOfMonth(addMonths(inicioOrigen, 1))

        const { data: clases, error: errFetch } = await supabase
            .from('clases')
            .select('*')
            .gte('inicio', inicioOrigen.toISOString())
            .lte('inicio', finOrigen.toISOString())

        if (errFetch) throw errFetch
        if (!clases || clases.length === 0) throw new Error('No hay clases en el mes seleccionado para duplicar.')

        const mapaSeries = new Map()

        const nuevasClases = clases.map((clase) => {
            const fechaOriginal = new Date(clase.inicio)

            const diaSemana = getDay(fechaOriginal)
            const diaMes = fechaOriginal.getDate()
            const semanaDelMes = Math.floor((diaMes - 1) / 7)

            let nuevaFecha = addDays(inicioDestino, (semanaDelMes * 7))
            while (getDay(nuevaFecha) !== diaSemana) {
                nuevaFecha = addDays(nuevaFecha, 1)
            }

            nuevaFecha = setHours(nuevaFecha, fechaOriginal.getHours())
            nuevaFecha = setMinutes(nuevaFecha, fechaOriginal.getMinutes())

            let nuevoSerieId = null
            if (clase.serie_id) {
                if (!mapaSeries.has(clase.serie_id)) {
                    mapaSeries.set(clase.serie_id, crypto.randomUUID())
                }
                nuevoSerieId = mapaSeries.get(clase.serie_id)
            }

            const { id, created_at, ...datosClase } = clase
            return {
                ...datosClase,
                inicio: nuevaFecha.toISOString(),
                serie_id: nuevoSerieId,
                fin: clase.fin ? addDays(new Date(clase.fin), 28).toISOString() : null
            }
        })

        const { error: errInsert } = await supabase.from('clases').insert(nuevasClases)
        if (errInsert) throw errInsert

        revalidatePath('/calendario')
        return { success: true, count: nuevasClases.length }

    } catch (error: any) {
        console.error("Error duplicando mes:", error)
        return { success: false, error: error.message }
    }
}

export async function notificarClasePorInteres(nuevaClase: any) {
    const supabase = await createClient()

    try {
        const { data: alumnosInteresados, error: errorAlumnos } = await supabase
            .from('profiles')
            .select('id')
            .eq('rol', 'alumno')

        if (errorAlumnos || !alumnosInteresados || alumnosInteresados.length === 0) {
            console.log("No hay alumnos con este interés para notificar.")
            return
        }

        const nuevasNotificaciones = alumnosInteresados.map(alumno => ({
            usuario_id: alumno.id,
            titulo: `¡Nueva clase de ${nuevaClase.tipo_clase}!`,
            mensaje: `Se abrió un nuevo horario para ${nuevaClase.nombre}. ¡Asegurá tu lugar antes de que se llene!`,
            link: '/explorar',
            leido: false
        }))

        const { error: errorNotifs } = await supabase
            .from('notificaciones')
            .insert(nuevasNotificaciones)

        if (errorNotifs) {
            console.error("❌ Error enviando notificaciones automáticas:", errorNotifs)
        } else {
            console.log(`✅ ¡Megáfono activado! Se avisó a ${alumnosInteresados.length} alumnos.`)
        }

    } catch (error) {
        console.error("Error en el megáfono:", error)
    }
}