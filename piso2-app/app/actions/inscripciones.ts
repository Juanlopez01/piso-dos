'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

// 🚀 ACCIÓN VIEJA (Mantenida por compatibilidad si se usa en otro lado)
export async function toggleAsistenciaAction(inscripcionId: string, presente: boolean) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { error } = await supabase.from('inscripciones').update({ presente }).eq('id', inscripcionId)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

// 🚀 NUEVA ACCIÓN TODOTERRENO (Ahora soporta SAF)
export async function setEstadoAsistenciaAction(inscripcionId: string, estado: 'presente' | 'ausente' | 'media_falta' | 'justificada' | 'saf') {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const esPresente = estado === 'presente';

    // Le agregamos el .select() para obligarlo a responder con la fila actualizada
    const { data, error } = await supabase.from('inscripciones').update({
        estado_asistencia: estado,
        presente: esPresente
    }).eq('id', inscripcionId).select()

    if (error) {
        console.error("❌ ERROR BD:", error.message);
        return { success: false, error: error.message }
    }

    if (!data || data.length === 0) {
        console.error("❌ ERROR: Supabase no actualizó nada. Revisa si la columna 'estado_asistencia' existe o si hay bloqueo de permisos (RLS).");
        return { success: false, error: 'La base de datos ignoró el cambio' }
    }

    return { success: true }
}

export async function eliminarInscripcionAction(inscripcionId: string) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    // 1. Antes de hacer nada, ESPIAMOS la clase para ver qué tipo de moneda hay que devolver
    const { data: inscripcionData, error: errInsc } = await supabase
        .from('inscripciones')
        .select(`
            user_id,
            clase:clases (
                nombre,
                tipo_clase,
                es_combinable,
                profesor:profiles!clases_profesor_id_fkey(nombre_completo)
            )
        `)
        .eq('id', inscripcionId)
        .single()

    if (errInsc || !inscripcionData) return { success: false, error: 'No se encontró la inscripción' }

    // 🚀 MAGIA ANTI-TYPESCRIPT: Forzamos el tipado y sacamos la clase segura
    const inscripcion = inscripcionData as any;
    const claseInfo = Array.isArray(inscripcion.clase) ? inscripcion.clase[0] : inscripcion.clase;

    const esExclusiva = claseInfo.es_combinable === false;

    if (esExclusiva) {
        // 🚀 FLUJO VIP: CANCELACIÓN DE CLASES EXCLUSIVAS

        // A. Borramos la inscripción a mano para liberar el cupo en la sala
        const { error: errDelete } = await supabase
            .from('inscripciones')
            .delete()
            .eq('id', inscripcionId)

        if (errDelete) return { success: false, error: 'Error al cancelar la reserva en el servidor' }

        // B. Reconstruimos la "llave" del pase usando claseInfo
        const profeObj = claseInfo.profesor;
        const nombreProfe = Array.isArray(profeObj) ? profeObj[0]?.nombre_completo : (profeObj?.nombre_completo || 'Staff');
        const llavePase = `${claseInfo.nombre}-${nombreProfe}-${claseInfo.tipo_clase}`;

        // C. Le devolvemos +1 crédito exclusivo con la función que tiene Poderes de Admin
        const { error: errPase } = await supabase.rpc('cargar_pase_exclusivo_manual', {
            p_usuario_id: inscripcion.user_id,
            p_referencia: llavePase,
            p_cantidad: 1
        })

        if (errPase) {
            console.error("Error devolviendo el pase:", errPase);
            return { success: false, error: 'Reserva cancelada, pero falló la devolución del pase exclusivo.' }
        }

        return { success: true }

    } else {
        // 🚀 FLUJO CLÁSICO: CLASES REGULARES/ESPECIALES (Sigue usando tu función de siempre)
        const { data: res, error } = await supabase.rpc('reembolsar_inscripcion', { p_inscripcion_id: inscripcionId })
        if (error || !res?.success) return { success: false, error: res?.message || error?.message || 'Error al procesar baja' }

        return { success: true }
    }
}

export async function enviarNotificacionClaseAction(notificaciones: any[]) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { error } = await supabase.from('notificaciones').insert(notificaciones)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function procesarInscripcionAction(payload: any) {
    const supabase = await createClient()

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error("No autorizado")

        const { data: turno } = await supabase
            .from('caja_turnos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'abierta')
            .single()

        if (!turno) throw new Error("Caja cerrada. Abrí la caja para cobrar.")

        payload.p_turno_caja_id = turno.id

        // 🚀 ATAJAMOS Y BORRAMOS PARA QUE LA DB NO CHILLE
        const telefonoNuevo = payload.p_telefono_comprador;
        delete payload.p_telefono_comprador;

        // EJECUTAMOS LA INSCRIPCIÓN (Ahora sí va a andar porque tiene la misma firma)
        const { error } = await supabase.rpc('procesar_inscripcion_recepcion', payload)

        if (error) throw error

        // 🚀 SI ANOTAMOS A UN ALUMNO CON CLASE SUELTA, LE GUARDAMOS EL TELÉFONO
        if (payload.p_user_id && telefonoNuevo) {
            await supabase.from('profiles').update({ telefono: telefonoNuevo }).eq('id', payload.p_user_id)
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}