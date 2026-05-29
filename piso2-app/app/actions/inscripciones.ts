'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// 🚀 CLIENTE DIOS: Bypassea los escudos de seguridad (RLS)
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

    const tipoClaseStr = (claseInfo.tipo_clase || '').toLowerCase();
    const esExclusiva = claseInfo.es_combinable === false || tipoClaseStr === 'exclusivo';

    // 1. Borramos la inscripción primero
    const { error: errDelete } = await supabaseAdmin.from('inscripciones').delete().eq('id', inscripcionId)
    if (errDelete) return { success: false, error: 'Error al cancelar la reserva' }

    // 2. Lógica de devolución de crédito
    if (inscripcion.user_id && (inscripcion.modalidad === 'Crédito' || inscripcion.modalidad === 'Pack' || inscripcion.modalidad === 'Pase Exclusivo' || inscripcion.modalidad === 'Pase Exclusivo (Pack)')) {

        if (esExclusiva) {
            // =================================================================
            // 🚀 DEVOLUCIÓN DE EXCLUSIVAS
            // =================================================================
            const profeObj: any = claseInfo.profesor;
            const nombreProfe = Array.isArray(profeObj) ? profeObj[0]?.nombre_completo : (profeObj?.nombre_completo || 'Staff');
            const llavePase = `${claseInfo.nombre}-${nombreProfe}-${claseInfo.tipo_clase}`;

            await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', {
                p_usuario_id: inscripcion.user_id,
                p_referencia: llavePase,
                p_cantidad: 1
            })

            // 🚀 LÓGICA DETECTIVE: Buscamos el pack que fue "tocado"
            const { data: packsExAlumno } = await supabaseAdmin.from('alumno_packs')
                .select('id, creditos_restantes, cantidad_inicial')
                .eq('user_id', inscripcion.user_id)
                .eq('tipo_clase', 'exclusivo')
                .order('fecha_compra', { ascending: false });

            if (packsExAlumno && packsExAlumno.length > 0) {
                // Buscamos el primero que no esté lleno (ahí fue a parar el consumo)
                const packAfectado = packsExAlumno.find(p => p.creditos_restantes < p.cantidad_inicial);

                if (packAfectado) {
                    await supabaseAdmin.from('alumno_packs').update({
                        creditos_restantes: packAfectado.creditos_restantes + 1,
                        estado: 'activo'
                    }).eq('id', packAfectado.id);
                }
            }

        } else {
            // =================================================================
            // 🚀 DEVOLUCIÓN DE REGULARES / ESPECIALES
            // =================================================================
            const isEspecial = tipoClaseStr === 'especial' || tipoClaseStr === 'seminario';
            const campoCredito = isEspecial ? 'creditos_especiales' : 'creditos_regulares';
            const tipoPack = isEspecial ? 'seminario' : 'regular';

            // 1. Devolvemos 1 crédito exacto a "profiles"
            const { data: perfil } = await supabaseAdmin.from('profiles').select(campoCredito).eq('id', inscripcion.user_id).single();
            if (perfil) {
                await supabaseAdmin.from('profiles').update({
                    [campoCredito]: ((perfil as any)[campoCredito] || 0) + 1
                }).eq('id', inscripcion.user_id);
            }

            // 2. 🚀 LÓGICA DETECTIVE: Buscamos el pack que fue "tocado"
            const { data: packsAlumno } = await supabaseAdmin.from('alumno_packs')
                .select('id, creditos_restantes, cantidad_inicial')
                .eq('user_id', inscripcion.user_id)
                .eq('tipo_clase', tipoPack)
                .order('fecha_compra', { ascending: false });

            if (packsAlumno && packsAlumno.length > 0) {
                // Encontramos el pack exacto del cual se descontó el crédito
                const packAfectado = packsAlumno.find(p => p.creditos_restantes < p.cantidad_inicial);

                if (packAfectado) {
                    await supabaseAdmin.from('alumno_packs').update({
                        creditos_restantes: packAfectado.creditos_restantes + 1,
                        estado: 'activo' // Por si el pack había llegado a 0 y estaba 'agotado'
                    }).eq('id', packAfectado.id);
                }
            }
        }
    }

    return { success: true }
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
    const supabase = await createClient()
    const supabaseAdmin = getAdminClient()

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
                .order('fecha_apertura', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (!turno) throw new Error("No tenés una caja abierta. Abrí tu caja en Finanzas para cobrar.")
            turnoId = turno.id;
        }

        if (!payload.p_clase_id) throw new Error("El sistema no recibió el ID de la clase.");

        const { data: claseDb, error: errClase } = await supabaseAdmin.from('clases')
            .select(`
                nombre, 
                tipo_clase, 
                es_combinable, 
                liga_nivel, 
                compania_id,
                inicio,
                es_audicion,
                profesor:profiles!profesor_id(nombre_completo)
            `)
            .eq('id', payload.p_clase_id)
            .maybeSingle();

        if (errClase) throw new Error(`Fallo en Supabase al buscar clase: ${errClase.message}`);
        if (!claseDb) throw new Error(`No existe clase con este ID: ${payload.p_clase_id}`);

        const tipoClaseStr = (claseDb.tipo_clase || '').toLowerCase();

        // 🚀 BLINDAJE ABSOLUTO: Forzamos el comportamiento según el texto del tipo de clase
        const isRegular = tipoClaseStr === 'regular';
        const isEspecial = tipoClaseStr === 'especial' || tipoClaseStr === 'seminario';
        const isLiga = tipoClaseStr === 'liga';
        const isCompania = tipoClaseStr === 'compania' || tipoClaseStr === 'compañia';
        const isAudicion = claseDb.es_audicion === true;

        // 🎯 NUNCA será exclusiva si es Regular o Especial, sin importar el error humano en el switch "es_combinable"
        const esExclusiva = (!isRegular && !isEspecial && claseDb.es_combinable === false) || tipoClaseStr === 'exclusivo';

        const tipoPackBusqueda = isEspecial ? 'seminario' : 'regular';

        const profeObj: any = claseDb.profesor;
        const nombreProfe = Array.isArray(profeObj) ? profeObj[0]?.nombre_completo : (profeObj?.nombre_completo || 'Staff');
        const paseReferencia = payload.p_pase_referencia || `${claseDb.nombre}-${nombreProfe}-${claseDb.tipo_clase}`;

        const telefonoNuevo = payload.p_telefono_comprador;
        let nombreFinal = (payload.p_alumno_nombre_real || '').trim();

        if (!nombreFinal && payload.p_user_id) {
            const { data: prof } = await supabaseAdmin.from('profiles').select('nombre_completo').eq('id', payload.p_user_id).single();
            if (prof) nombreFinal = prof.nombre_completo;
        }
        nombreFinal = nombreFinal || 'Alumno Desconocido';

        const productoIdLimpio = (payload.p_producto_id && payload.p_producto_id.trim() !== '') ? payload.p_producto_id : null;

        let valorInscripcion = 0;
        let modalidadInsc = 'Clase Suelta';
        let saldoPendienteCalculado = payload.p_saldo_pendiente || 0;
        let packUsadoId = null;

        let metodoPagoFinal = payload.p_metodo_pago || 'efectivo';

        // =========================================================================
        // 3. LÓGICA DE CLASES EXCLUSIVAS
        // =========================================================================
        if (esExclusiva) {
            if (payload.p_tipo_operacion === 'usar_credito') {
                modalidadInsc = 'Pase Exclusivo';
                if (!payload.p_user_id) throw new Error('Falta seleccionar al alumno.');

                // 🚀 BLOQUEO DE SEGURIDAD: Evita saldos en negativo si no tiene el pase
                const { data: miPase } = await supabaseAdmin.from('pases_exclusivos')
                    .select('cantidad')
                    .eq('usuario_id', payload.p_user_id)
                    .eq('pase_referencia', paseReferencia)
                    .maybeSingle();

                if (!miPase || miPase.cantidad < 1) {
                    throw new Error('El alumno no tiene pases exclusivos disponibles para esta clase específica.');
                }

                const { data: packActivo } = await supabaseAdmin.from('alumno_packs')
                    .select('id, creditos_restantes, cantidad_inicial, monto_abonado, metodo_pago')
                    .eq('user_id', payload.p_user_id)
                    .eq('tipo_clase', 'exclusivo')
                    .gt('creditos_restantes', 0)
                    .order('fecha_compra', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (packActivo && packActivo.cantidad_inicial > 0) {
                    packUsadoId = packActivo.id;
                    valorInscripcion = Math.round(packActivo.monto_abonado / packActivo.cantidad_inicial);
                    metodoPagoFinal = packActivo.metodo_pago || 'efectivo';

                    const nuevosRestantes = packActivo.creditos_restantes - 1;
                    await supabaseAdmin.from('alumno_packs').update({
                        creditos_restantes: nuevosRestantes,
                        estado: nuevosRestantes === 0 ? 'agotado' : 'activo'
                    }).eq('id', packActivo.id);
                }

                // Restamos el pase
                await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', { p_usuario_id: payload.p_user_id, p_referencia: paseReferencia, p_cantidad: -1 })
            }
            else if (payload.p_tipo_operacion === 'pack') {
                modalidadInsc = 'Pase Exclusivo (Pack)';
                if (!payload.p_user_id || !productoIdLimpio) throw new Error('Faltan datos del pack.');

                const { data: prod } = await supabaseAdmin.from('productos').select('creditos').eq('id', productoIdLimpio).single();
                const creditosDelPack = prod ? prod.creditos : 0;

                valorInscripcion = creditosDelPack > 0 ? Math.round(payload.p_monto_caja / creditosDelPack) : payload.p_monto_caja;

                if (payload.p_monto_caja > 0 && turnoId) {
                    await supabaseAdmin.from('caja_movimientos').insert({
                        turno_id: turnoId,
                        tipo: 'ingreso',
                        concepto: `Venta Pack Exclusivo (${creditosDelPack} clases) | Alumno: ${nombreFinal}`,
                        monto: payload.p_monto_caja,
                        metodo_pago: payload.p_metodo_pago,
                        origen_referencia: 'inscripcion'
                    });
                }

                const ahora = new Date();
                const { data: nuevoPack, error: errPackEx } = await supabaseAdmin.from('alumno_packs').insert({
                    user_id: payload.p_user_id,
                    producto_id: productoIdLimpio,
                    tipo_clase: 'exclusivo',
                    cantidad_inicial: creditosDelPack,
                    creditos_restantes: Math.max(0, creditosDelPack - 1),
                    monto_abonado: payload.p_monto_caja || 0,
                    metodo_pago: payload.p_metodo_pago,
                    fecha_compra: ahora.toISOString(),
                    fecha_vencimiento: new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    estado: (creditosDelPack - 1) > 0 ? 'activo' : 'agotado'
                }).select().single();

                if (errPackEx) throw new Error(`Fallo al guardar el pack: ${errPackEx.message}`);
                if (nuevoPack) packUsadoId = nuevoPack.id;

                if (creditosDelPack > 1) {
                    await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', {
                        p_usuario_id: payload.p_user_id,
                        p_referencia: paseReferencia,
                        p_cantidad: creditosDelPack - 1
                    })
                }
            }
            else {
                valorInscripcion = payload.p_monto_caja || 0;
                modalidadInsc = payload.p_tipo_operacion === 'invitado' ? 'Invitado' : 'Clase Suelta';

                if (payload.p_tipo_operacion === 'suelta' && payload.p_monto_caja > 0 && turnoId) {
                    await supabaseAdmin.from('caja_movimientos').insert({
                        turno_id: turnoId,
                        tipo: 'ingreso',
                        concepto: `Venta Clase Exclusiva Suelta | Alumno: ${nombreFinal}`,
                        monto: payload.p_monto_caja,
                        metodo_pago: payload.p_metodo_pago,
                        origen_referencia: 'inscripcion'
                    })
                }
            }
        }
        // =========================================================================
        // 4. LÓGICA DE CLASES REGULARES / LIGA / COMPAÑÍA
        // =========================================================================
        else {
            const campoCredito = isEspecial ? 'creditos_especiales' : 'creditos_regulares';

            if (payload.p_tipo_operacion === 'usar_credito') {
                modalidadInsc = 'Crédito';
                if (!payload.p_user_id) throw new Error('Falta seleccionar al alumno.');

                const { data: perfil } = await supabaseAdmin.from('profiles').select(campoCredito).eq('id', payload.p_user_id).single();
                if (!perfil || (perfil as any)[campoCredito] < 1) throw new Error(`Créditos insuficientes.`);

                const { data: packActivo } = await supabaseAdmin.from('alumno_packs')
                    .select('id, creditos_restantes, cantidad_inicial, monto_abonado, metodo_pago')
                    .eq('user_id', payload.p_user_id)
                    .eq('tipo_clase', tipoPackBusqueda)
                    .gt('creditos_restantes', 0)
                    .order('fecha_compra', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (packActivo && packActivo.cantidad_inicial > 0) {
                    packUsadoId = packActivo.id;
                    valorInscripcion = Math.round(packActivo.monto_abonado / packActivo.cantidad_inicial);
                    metodoPagoFinal = packActivo.metodo_pago || 'efectivo';

                    const nuevosRestantes = packActivo.creditos_restantes - 1;
                    await supabaseAdmin.from('alumno_packs').update({
                        creditos_restantes: nuevosRestantes,
                        estado: nuevosRestantes === 0 ? 'agotado' : 'activo'
                    }).eq('id', packActivo.id);
                }

                // Descontamos crédito del perfil numérico clásico, NO DEL PASE EXCLUSIVO
                await supabaseAdmin.from('profiles').update({ [campoCredito]: (perfil as any)[campoCredito] - 1 }).eq('id', payload.p_user_id);
            }
            else if (payload.p_tipo_operacion === 'pack') {
                modalidadInsc = 'Pack';
                if (!payload.p_user_id || !productoIdLimpio) throw new Error('Faltan datos del pack.');

                const { data: prod } = await supabaseAdmin.from('productos').select('creditos, tipo_clase').eq('id', productoIdLimpio).single();
                const creditosDelPack = prod ? prod.creditos : 0;
                const tipoClaseProd = prod?.tipo_clase || tipoPackBusqueda;

                valorInscripcion = creditosDelPack > 0 ? Math.round(payload.p_monto_caja / creditosDelPack) : payload.p_monto_caja;

                if (payload.p_monto_caja > 0 && turnoId) {
                    await supabaseAdmin.from('caja_movimientos').insert({
                        turno_id: turnoId,
                        tipo: 'ingreso',
                        concepto: `Venta Pack (${creditosDelPack} clases) | Alumno: ${nombreFinal}`,
                        monto: payload.p_monto_caja,
                        metodo_pago: payload.p_metodo_pago,
                        origen_referencia: 'inscripcion'
                    });
                }

                const ahora = new Date();
                const { data: nuevoPack, error: errPackRegular } = await supabaseAdmin.from('alumno_packs').insert({
                    user_id: payload.p_user_id,
                    producto_id: productoIdLimpio,
                    tipo_clase: tipoClaseProd,
                    cantidad_inicial: creditosDelPack,
                    creditos_restantes: Math.max(0, creditosDelPack - 1),
                    monto_abonado: payload.p_monto_caja || 0,
                    metodo_pago: payload.p_metodo_pago,
                    fecha_compra: ahora.toISOString(),
                    fecha_vencimiento: new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    estado: (creditosDelPack - 1) > 0 ? 'activo' : 'agotado'
                }).select().single();

                if (errPackRegular) throw new Error(`Error al guardar el pack: ${errPackRegular.message}`);
                if (nuevoPack) packUsadoId = nuevoPack.id;

                if (creditosDelPack > 1) {
                    const { data: perfil } = await supabaseAdmin.from('profiles').select(campoCredito).eq('id', payload.p_user_id).single();
                    await supabaseAdmin.from('profiles').update({ [campoCredito]: ((perfil as any)?.[campoCredito] || 0) + (creditosDelPack - 1) }).eq('id', payload.p_user_id);
                }
            }
            else if (payload.p_tipo_operacion === 'suelta') {
                if (isLiga || isCompania) {
                    modalidadInsc = isLiga ? 'La Liga' : 'Compañía';
                    valorInscripcion = 0;
                } else if (isAudicion) {
                    modalidadInsc = 'Audición';
                    valorInscripcion = payload.p_monto_caja || 0;
                } else {
                    modalidadInsc = 'Clase Suelta';
                    valorInscripcion = payload.p_monto_caja || 0;
                }

                if (payload.p_monto_caja > 0 && turnoId) {
                    const conceptoFinal = isAudicion ? 'Inscripción Audición' : (isLiga ? 'Inscripción La Liga' : (isCompania ? 'Inscripción Compañía' : 'Venta Clase Suelta'));

                    await supabaseAdmin.from('caja_movimientos').insert({
                        turno_id: turnoId,
                        tipo: 'ingreso',
                        concepto: `${conceptoFinal} | Alumno: ${nombreFinal}`,
                        monto: payload.p_monto_caja,
                        metodo_pago: payload.p_metodo_pago,
                        origen_referencia: 'inscripcion'
                    });
                }
            }
            else if (payload.p_tipo_operacion === 'invitado') {
                modalidadInsc = 'Invitado';
                valorInscripcion = 0;
            }
        }

        // 5. INSERCIÓN DEFINITIVA EN LA TABLA
        const { error: errInsc } = await supabaseAdmin.from('inscripciones').insert({
            user_id: payload.p_user_id || null,
            clase_id: payload.p_clase_id,
            pack_usado_id: packUsadoId,
            nombre_invitado: payload.p_nombre_invitado || null,
            es_invitado: payload.p_tipo_operacion === 'invitado' || !payload.p_user_id,
            modalidad: modalidadInsc,
            valor_credito: valorInscripcion,
            saldo_pendiente: saldoPendienteCalculado,
            metodo_pago: payload.p_tipo_operacion === 'invitado' ? 'invitado' : metodoPagoFinal,
            presente: true,
            estado_asistencia: 'presente'
        });

        if (errInsc) throw new Error(`Error al anotar al alumno: ${errInsc.message}`);

        if (payload.p_user_id && telefonoNuevo) {
            await supabaseAdmin.from('profiles').update({ telefono: telefonoNuevo }).eq('id', payload.p_user_id);
        }

        if ((isLiga || isCompania) && payload.p_user_id) {
            try {
                const fechaClase = new Date(claseDb.inicio);
                const startOfMonth = new Date(fechaClase.getFullYear(), fechaClase.getMonth(), 1).toISOString();
                const endOfMonth = new Date(fechaClase.getFullYear(), fechaClase.getMonth() + 1, 0, 23, 59, 59).toISOString();

                let query = supabaseAdmin.from('clases').select('id').eq('tipo_clase', claseDb.tipo_clase).gte('inicio', startOfMonth).lte('inicio', endOfMonth).neq('id', payload.p_clase_id);
                if (isLiga) query = query.eq('liga_nivel', claseDb.liga_nivel);
                if (isCompania) query = query.eq('compania_id', claseDb.compania_id);

                const { data: clasesMes } = await query;

                if (clasesMes && clasesMes.length > 0) {
                    const claseIds = clasesMes.map(c => c.id);
                    const { data: inscExistentes } = await supabaseAdmin.from('inscripciones').select('clase_id').eq('user_id', payload.p_user_id).in('clase_id', claseIds);
                    const idsExistentes = inscExistentes?.map(i => i.clase_id) || [];
                    const idsAInscribir = claseIds.filter(id => !idsExistentes.includes(id));

                    if (idsAInscribir.length > 0) {
                        const batchInscripciones = idsAInscribir.map(id => ({
                            user_id: payload.p_user_id,
                            clase_id: id,
                            modalidad: modalidadInsc,
                            valor_credito: 0,
                            metodo_pago: metodoPagoFinal,
                            presente: false
                        }));
                        await supabaseAdmin.from('inscripciones').insert(batchInscripciones);
                    }
                }
            } catch (errBatch) { console.error("Error silencioso en Auto-Batch:", errBatch); }
        }

        return { success: true }

    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function agregarPagoInscripcionAction(inscripcionId: string, monto: number, metodoPago: string, liquidarDeuda: boolean) {
    const supabase = await createClient()
    const supabaseAdmin = getAdminClient()

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { data: insc, error: errInsc } = await supabaseAdmin
            .from('inscripciones')
            .select('*, clase:clases(nombre)')
            .eq('id', inscripcionId)
            .single()

        if (errInsc || !insc) throw new Error('No se encontró la inscripción')

        const { data: turno } = await supabaseAdmin
            .from('caja_turnos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'abierta')
            .order('fecha_apertura', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (!turno) throw new Error("No tenés una caja abierta. Abrí tu caja en Finanzas para cobrar la deuda.")

        // 1. EL PAGO ENTRA COMPLETO A LA CAJA
        const nombreAlumno = insc.nombre_invitado || 'Alumno con cuenta'
        const { error: errCaja } = await supabaseAdmin.from('caja_movimientos').insert({
            turno_id: turno.id,
            tipo: 'ingreso',
            monto: monto,
            metodo_pago: metodoPago,
            concepto: `Cobro Deuda/Seña | Clase: ${insc.clase?.nombre || 'Clase'} | Alumno: ${nombreAlumno}`,
            origen_referencia: 'inscripcion'
        })
        if (errCaja) throw new Error('Error al registrar en caja')

        // 2. LÓGICA INFALIBLE USANDO LA COLUMNA OFICIAL
        let valorAAgregarAClaseActual = Number(monto); // Por defecto va entero si es clase suelta

        if (insc.pack_usado_id) {
            // Vamos a buscar el pack usando el ID directo
            const { data: packAfectado } = await supabaseAdmin
                .from('alumno_packs')
                .select('*')
                .eq('id', insc.pack_usado_id)
                .single();

            if (packAfectado && packAfectado.cantidad_inicial > 1) {
                // Dividimos la plata
                const divisor = Number(packAfectado.cantidad_inicial);
                valorAAgregarAClaseActual = Number(monto) / divisor;

                // Le sumamos la plata ingresada al pack maestro
                await supabaseAdmin.from('alumno_packs').update({
                    monto_abonado: Number(packAfectado.monto_abonado) + Number(monto)
                }).eq('id', packAfectado.id);
            }
        }

        // 3. ACTUALIZAMOS LA INSCRIPCIÓN ACTUAL (Con su fracción correspondiente o el monto total si era suelta)
        const { error: errUpd } = await supabaseAdmin.from('inscripciones').update({
            valor_credito: Number(insc.valor_credito) + valorAAgregarAClaseActual,
            saldo_pendiente: liquidarDeuda ? 0 : 1
        }).eq('id', inscripcionId)

        if (errUpd) throw new Error('Error al actualizar la inscripción')

        revalidatePath(`/clase/${insc.clase_id}`)
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function editarValorInscripcionAction(inscripcionId: string, nuevoValor: number) {
    const supabase = await createClient() // Asumiendo tu import normal del archivo

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase
            .from('inscripciones')
            .update({ valor_credito: nuevoValor })
            .eq('id', inscripcionId)

        if (error) throw new Error(error.message)

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}