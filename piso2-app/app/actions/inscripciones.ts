'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// 🚀 CLIENTE DIOS: Bypassea los escudos de seguridad (RLS) para poder modificar créditos de otros usuarios
const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

export async function toggleAsistenciaAction(inscripcionId: string, presente: boolean) {
    const supabase = await createClient()
    const supabaseAdmin = getAdminClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { error } = await supabaseAdmin.from('inscripciones').update({ presente }).eq('id', inscripcionId)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function setEstadoAsistenciaAction(inscripcionId: string, estado: 'presente' | 'ausente' | 'media_falta' | 'justificada' | 'saf') {
    const supabase = await createClient()
    const supabaseAdmin = getAdminClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const esPresente = estado === 'presente';

    const { data, error } = await supabaseAdmin.from('inscripciones').update({
        estado_asistencia: estado,
        presente: esPresente
    }).eq('id', inscripcionId).select()

    if (error) return { success: false, error: error.message }
    if (!data || data.length === 0) return { success: false, error: 'La base de datos ignoró el cambio' }

    return { success: true }
}

export async function eliminarInscripcionAction(inscripcionId: string) {
    const supabase = await createClient()
    const supabaseAdmin = getAdminClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { data: inscripcionData, error: errInsc } = await supabaseAdmin
        .from('inscripciones')
        .select(`
            user_id,
            modalidad,
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
        const { error: errDelete } = await supabaseAdmin.from('inscripciones').delete().eq('id', inscripcionId)
        if (errDelete) return { success: false, error: 'Error al cancelar la reserva' }

        if (inscripcion.user_id && inscripcion.modalidad !== 'Invitado') {
            const profeObj = claseInfo.profesor;
            const nombreProfe = Array.isArray(profeObj) ? profeObj[0]?.nombre_completo : (profeObj?.nombre_completo || 'Staff');
            const llavePase = `${claseInfo.nombre}-${nombreProfe}-${claseInfo.tipo_clase}`;

            await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', {
                p_usuario_id: inscripcion.user_id,
                p_referencia: llavePase,
                p_cantidad: 1
            })
        }
        return { success: true }

    } else {
        // FLUJO CLÁSICO: DEVOLUCIÓN DE CRÉDITOS MANUAL Y 100% SEGURA
        const isEspecial = claseInfo.tipo_clase === 'Especial' || claseInfo.tipo_clase === 'seminario';
        const campoCredito = isEspecial ? 'creditos_especiales' : 'creditos_regulares';

        const { error: errDelete } = await supabaseAdmin.from('inscripciones').delete().eq('id', inscripcionId)
        if (errDelete) return { success: false, error: 'Error al cancelar la reserva' }

        if (inscripcion.user_id && inscripcion.modalidad !== 'Invitado') {
            const { data: perfil } = await supabaseAdmin.from('profiles').select(campoCredito).eq('id', inscripcion.user_id).single();

            if (perfil) {
                await supabaseAdmin.from('profiles').update({
                    [campoCredito]: ((perfil as any)[campoCredito] || 0) + 1
                }).eq('id', inscripcion.user_id);
            }
        }

        return { success: true }
    }
}

export async function enviarNotificacionClaseAction(notificaciones: any[]) {
    const supabase = await createClient()
    const supabaseAdmin = getAdminClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { error } = await supabaseAdmin.from('notificaciones').insert(notificaciones)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function procesarInscripcionAction(payload: any) {
    const supabase = await createClient() // Usamos el normal solo para chequear si el que hace click está logueado
    const supabaseAdmin = getAdminClient() // Usamos el Admin para mover los datos sin que RLS nos bloquee

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error("No autorizado")

        let turnoId = null;

        if (payload.p_monto_caja > 0) {
            const { data: turno } = await supabaseAdmin
                .from('caja_turnos')
                .select('id')
                .eq('usuario_id', session.user.id)
                .eq('estado', 'abierta')
                .maybeSingle()

            if (!turno) throw new Error("Caja cerrada. Abrí la caja en la pestaña Finanzas para poder cobrar.")
            turnoId = turno.id;
        }

        const telefonoNuevo = payload.p_telefono_comprador;
        const nombreReal = payload.p_alumno_nombre_real;
        const paseReferencia = payload.p_pase_referencia;
        const nombreFinal = (nombreReal || '').trim() || 'Alumno Desconocido';

        // =================================================================
        // 🚀 1. FLUJO PARA CLASES EXCLUSIVAS
        // =================================================================
        if (payload.p_tipo_clase === 'exclusivo') {

            if (payload.p_monto_caja > 0 && turnoId) {
                const { error: errCaja } = await supabaseAdmin.from('caja_movimientos').insert({
                    turno_id: turnoId,
                    tipo: 'ingreso',
                    concepto: `Venta ${payload.p_tipo_operacion === 'pack' ? 'Pack' : 'Clase'} Exclusiva | Alumno: ${nombreFinal}`,
                    monto: payload.p_monto_caja,
                    metodo_pago: payload.p_metodo_pago,
                    origen_referencia: 'inscripcion'
                })
                if (errCaja) throw new Error('Error al cobrar en la caja.')
            }

            if (payload.p_tipo_operacion === 'pack' && payload.p_producto_id && payload.p_user_id) {
                const { data: prod } = await supabaseAdmin.from('productos').select('creditos').eq('id', payload.p_producto_id).single()
                if (prod && prod.creditos > 1) {
                    await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', {
                        p_usuario_id: payload.p_user_id,
                        p_referencia: paseReferencia,
                        p_cantidad: prod.creditos - 1
                    })
                }
            }

            if (payload.p_tipo_operacion === 'usar_credito' && payload.p_user_id) {
                const { error: errDescuento } = await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', {
                    p_usuario_id: payload.p_user_id,
                    p_referencia: paseReferencia,
                    p_cantidad: -1
                })
                if (errDescuento) throw new Error('No se pudo descontar el pase exclusivo de la alumna.')
            }

            let modalidadInsc = 'Clase Suelta';
            if (payload.p_tipo_operacion === 'pack') modalidadInsc = 'Pase Exclusivo (Pack)';
            if (payload.p_tipo_operacion === 'usar_credito') modalidadInsc = 'Pase Exclusivo';
            if (payload.p_tipo_operacion === 'invitado') modalidadInsc = 'Invitado';

            const { error: errInsc } = await supabaseAdmin.from('inscripciones').insert({
                user_id: payload.p_user_id || null,
                clase_id: payload.p_clase_id,
                nombre_invitado: payload.p_nombre_invitado || null,
                es_invitado: payload.p_tipo_operacion === 'invitado' || !payload.p_user_id,
                modalidad: modalidadInsc,
                valor_credito: payload.p_monto_caja || 0,
                metodo_pago: payload.p_monto_caja > 0 ? payload.p_metodo_pago : 'credito',
                presente: true,
                estado_asistencia: 'presente'
            })

            if (errInsc) throw new Error(`Error al anotar a la alumna: ${errInsc.message}`)

            if (payload.p_user_id && telefonoNuevo) {
                await supabaseAdmin.from('profiles').update({ telefono: telefonoNuevo }).eq('id', payload.p_user_id)
            }

            return { success: true }

        }
        // =================================================================
        // 🚀 2. FLUJO NORMAL (Clases Regulares y Especiales)
        // =================================================================
        else {
            let modalidadInsc = 'Clase Suelta';
            const isEspecial = payload.p_tipo_clase === 'seminario';
            const campoCredito = isEspecial ? 'creditos_especiales' : 'creditos_regulares';

            // --- A. USO DE CRÉDITO ---
            if (payload.p_tipo_operacion === 'usar_credito') {
                modalidadInsc = 'Crédito';
                if (!payload.p_user_id) throw new Error('Falta seleccionar al alumno.');

                const { data: perfil, error: errPerfil } = await supabaseAdmin.from('profiles').select(campoCredito).eq('id', payload.p_user_id).single();
                if (errPerfil || !perfil) throw new Error('No se pudo verificar el saldo del alumno.');

                if ((perfil as any)[campoCredito] < 1) throw new Error(`El alumno no tiene ${isEspecial ? 'créditos especiales' : 'créditos regulares'} suficientes.`);

                const { error: errDesc } = await supabaseAdmin.from('profiles').update({
                    [campoCredito]: (perfil as any)[campoCredito] - 1
                }).eq('id', payload.p_user_id);

                if (errDesc) throw new Error('Fallo en la base de datos al intentar descontar el crédito.');

            }
            // --- B. VENTA DE PACK EN EL MOMENTO ---
            else if (payload.p_tipo_operacion === 'pack') {
                modalidadInsc = 'Pack';
                if (!payload.p_user_id || !payload.p_producto_id) throw new Error('Faltan datos del pack o del alumno.');

                if (payload.p_monto_caja > 0 && turnoId) {
                    const { error: errCaja } = await supabaseAdmin.from('caja_movimientos').insert({
                        turno_id: turnoId,
                        tipo: 'ingreso',
                        concepto: `Venta Pack | Alumno: ${nombreFinal}`,
                        monto: payload.p_monto_caja,
                        metodo_pago: payload.p_metodo_pago,
                        origen_referencia: 'inscripcion'
                    });
                    if (errCaja) throw new Error('Error al registrar el cobro en la caja.');
                }

                const { data: prod } = await supabaseAdmin.from('productos').select('creditos').eq('id', payload.p_producto_id).single();
                const creditosDelPack = prod ? prod.creditos : 0;

                await supabaseAdmin.from('alumno_packs').insert({
                    user_id: payload.p_user_id,
                    producto_id: payload.p_producto_id,
                    tipo_clase: payload.p_tipo_clase,
                    cantidad_inicial: creditosDelPack,
                    creditos_restantes: creditosDelPack,
                    monto_abonado: payload.p_monto_caja,
                    estado: 'activo'
                });

                if (creditosDelPack > 1) {
                    const { data: perfil } = await supabaseAdmin.from('profiles').select(campoCredito).eq('id', payload.p_user_id).single();
                    await supabaseAdmin.from('profiles').update({
                        [campoCredito]: ((perfil as any)?.[campoCredito] || 0) + (creditosDelPack - 1)
                    }).eq('id', payload.p_user_id);
                }

            }
            // --- C. CLASE SUELTA MANUAL ---
            else if (payload.p_tipo_operacion === 'suelta') {
                modalidadInsc = 'Clase Suelta';

                if (payload.p_monto_caja > 0 && turnoId) {
                    const { error: errCaja } = await supabaseAdmin.from('caja_movimientos').insert({
                        turno_id: turnoId,
                        tipo: 'ingreso',
                        concepto: `Venta Clase Suelta | Alumno: ${nombreFinal}`,
                        monto: payload.p_monto_caja,
                        metodo_pago: payload.p_metodo_pago,
                        origen_referencia: 'inscripcion'
                    });
                    if (errCaja) throw new Error('Error al registrar la clase suelta en la caja.');
                }
            }
            // --- D. INVITADO ---
            else if (payload.p_tipo_operacion === 'invitado') {
                modalidadInsc = 'Invitado';
            }

            const { error: errInsc } = await supabaseAdmin.from('inscripciones').insert({
                user_id: payload.p_user_id || null,
                clase_id: payload.p_clase_id,
                nombre_invitado: payload.p_nombre_invitado || null,
                es_invitado: payload.p_tipo_operacion === 'invitado' || !payload.p_user_id,
                modalidad: modalidadInsc,
                valor_credito: payload.p_monto_caja || 0,
                metodo_pago: payload.p_monto_caja > 0 ? payload.p_metodo_pago : 'credito',
                presente: true,
                estado_asistencia: 'presente'
            });

            if (errInsc) throw new Error(`Error final al intentar anotar al alumno: ${errInsc.message}`);

            if (payload.p_user_id && telefonoNuevo) {
                await supabaseAdmin.from('profiles').update({ telefono: telefonoNuevo }).eq('id', payload.p_user_id);
            }

            return { success: true }
        }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}