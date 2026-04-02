// app/actions/clases.ts
'use server'

// 👇 IMPORTAMOS EL LECTOR DE COOKIES QUE CREASTE EN EL PASO 1
import { createClient } from '@/utils/supabase/server-helper'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'
import { revalidatePath } from 'next/cache'

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