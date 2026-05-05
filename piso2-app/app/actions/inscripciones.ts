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

    const { data, error } = await supabase.from('inscripciones').update({
        estado_asistencia: estado,
        presente: esPresente
    }).eq('id', inscripcionId).select()

    if (error) {
        console.error("❌ ERROR BD:", error.message);
        return { success: false, error: error.message }
    }

    if (!data || data.length === 0) {
        return { success: false, error: 'La base de datos ignoró el cambio' }
    }

    return { success: true }
}

export async function eliminarInscripcionAction(inscripcionId: string) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

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

    const inscripcion = inscripcionData as any;
    const claseInfo = Array.isArray(inscripcion.clase) ? inscripcion.clase[0] : inscripcion.clase;

    const esExclusiva = claseInfo.es_combinable === false;

    if (esExclusiva) {
        // FLUJO VIP: CANCELACIÓN DE CLASES EXCLUSIVAS
        const { error: errDelete } = await supabase
            .from('inscripciones')
            .delete()
            .eq('id', inscripcionId)

        if (errDelete) return { success: false, error: 'Error al cancelar la reserva en el servidor' }

        const profeObj = claseInfo.profesor;
        const nombreProfe = Array.isArray(profeObj) ? profeObj[0]?.nombre_completo : (profeObj?.nombre_completo || 'Staff');
        const llavePase = `${claseInfo.nombre}-${nombreProfe}-${claseInfo.tipo_clase}`;

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
        // FLUJO CLÁSICO: CLASES REGULARES/ESPECIALES
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

        let turnoId = null;

        // 🚀 SOLO EXIGIMOS CAJA ABIERTA SI EL MONTO ES MAYOR A 0
        if (payload.p_monto_caja > 0) {
            const { data: turno } = await supabase
                .from('caja_turnos')
                .select('id')
                .eq('usuario_id', session.user.id)
                .eq('estado', 'abierta')
                .maybeSingle()

            if (!turno) throw new Error("Caja cerrada. Abrí la caja en la pestaña Finanzas para cobrar.")
            turnoId = turno.id;
        }

        payload.p_turno_caja_id = turnoId

        // Atajamos variables extra
        const telefonoNuevo = payload.p_telefono_comprador;
        const nombreReal = payload.p_alumno_nombre_real;
        const paseReferencia = payload.p_pase_referencia;

        delete payload.p_telefono_comprador;
        delete payload.p_alumno_nombre_real;
        delete payload.p_pase_referencia; // Esto no va a la DB directamente

        // =================================================================
        // 🚀 1. FLUJO VIP PARA CLASES EXCLUSIVAS (Bypass 100% manual y seguro)
        // =================================================================
        if (payload.p_tipo_clase === 'exclusivo') {

            // A. Cobrar en caja (Si vendió una suelta o pack)
            if (payload.p_monto_caja > 0 && turnoId) {
                const { error: errCaja } = await supabase.from('caja_movimientos').insert({
                    turno_id: turnoId,
                    tipo: 'ingreso',
                    concepto: `Venta ${payload.p_tipo_operacion === 'pack' ? 'Pack' : 'Clase'} Exclusiva | Alumno: ${nombreReal}`,
                    monto: payload.p_monto_caja,
                    metodo_pago: payload.p_metodo_pago,
                    origen_referencia: 'inscripcion'
                })
                if (errCaja) throw new Error('Error al cobrar en la caja.')
            }

            // B. Si es pack, damos los créditos restantes (+N - 1)
            if (payload.p_tipo_operacion === 'pack' && payload.p_producto_id && payload.p_user_id) {
                const { data: prod } = await supabase.from('productos').select('creditos').eq('id', payload.p_producto_id).single()
                if (prod && prod.creditos > 1) {
                    await supabase.rpc('cargar_pase_exclusivo_manual', {
                        p_usuario_id: payload.p_user_id,
                        p_referencia: paseReferencia,
                        p_cantidad: prod.creditos - 1
                    })
                }
            }

            // C. Si usó crédito, descontamos 1
            if (payload.p_tipo_operacion === 'usar_credito' && payload.p_user_id) {
                const { error: errDescuento } = await supabase.rpc('cargar_pase_exclusivo_manual', {
                    p_usuario_id: payload.p_user_id,
                    p_referencia: paseReferencia,
                    p_cantidad: -1
                })
                if (errDescuento) throw new Error('No se pudo descontar el pase exclusivo.')
            }

            // D. INSCRIBIMOS A LA ALUMNA
            let modalidadInsc = 'Clase Suelta';
            if (payload.p_tipo_operacion === 'pack') modalidadInsc = 'Pase Exclusivo (Pack)';
            if (payload.p_tipo_operacion === 'usar_credito') modalidadInsc = 'Pase Exclusivo';
            if (payload.p_tipo_operacion === 'invitado') modalidadInsc = 'Invitado';

            const { error: errInsc } = await supabase.from('inscripciones').insert({
                user_id: payload.p_user_id,
                clase_id: payload.p_clase_id,
                nombre_invitado: payload.p_nombre_invitado,
                es_invitado: payload.p_tipo_operacion === 'invitado' || !payload.p_user_id,
                modalidad: modalidadInsc,
                valor_credito: payload.p_monto_caja || 0,
                metodo_pago: payload.p_monto_caja > 0 ? payload.p_metodo_pago : 'credito',
                presente: true,
                estado_asistencia: 'presente'
            })

            if (errInsc) throw new Error(`Error al anotar a la alumna: ${errInsc.message}`)

            return { success: true }

        }
        // =================================================================
        // 🚀 2. FLUJO NORMAL (Clases Regulares y Especiales)
        // =================================================================
        else {
            const { error } = await supabase.rpc('procesar_inscripcion_recepcion', payload)
            if (error) throw error

            // Si es suelta, guardamos el teléfono
            if (payload.p_user_id && telefonoNuevo) {
                await supabase.from('profiles').update({ telefono: telefonoNuevo }).eq('id', payload.p_user_id)
            }

            // Le pegamos el nombre a la caja si hubo pago
            if (nombreReal && payload.p_monto_caja > 0 && turnoId) {
                const { data: ultimoMovimiento } = await supabase
                    .from('caja_movimientos')
                    .select('id, concepto')
                    .eq('turno_id', turnoId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (ultimoMovimiento && !ultimoMovimiento.concepto.includes(nombreReal)) {
                    const nuevoConcepto = `${ultimoMovimiento.concepto} | Alumno: ${nombreReal}`
                    await supabase
                        .from('caja_movimientos')
                        .update({ concepto: nuevoConcepto })
                        .eq('id', ultimoMovimiento.id)
                }
            }

            return { success: true }
        }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}