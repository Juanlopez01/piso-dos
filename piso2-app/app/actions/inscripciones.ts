'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { crearAlumnoDesdeRecepcionAction } from './usuarios'

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
            pack_usado_id,
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
            // La referencia REAL del pase sale del producto del pack usado. Reconstruirla
            // desde el nombre de la clase falla si la clase se renombró después de la compra
            // (ej: "Jazz Contempo" -> "Jazz Contemporáneo"), y el crédito no vuelve.
            let llavePase = `${claseInfo.nombre}-${nombreProfe}-${claseInfo.tipo_clase}`; // fallback
            let packRefilleado = false;

            if (inscripcion.pack_usado_id) {
                const { data: pk } = await supabaseAdmin.from('alumno_packs')
                    .select('id, creditos_restantes, producto:productos(pase_referencia)')
                    .eq('id', inscripcion.pack_usado_id)
                    .maybeSingle();
                if (pk) {
                    const prod: any = Array.isArray(pk.producto) ? pk.producto[0] : pk.producto;
                    if (prod?.pase_referencia) llavePase = prod.pase_referencia;
                    // Reintegramos al pack exacto que se usó (confiable).
                    await supabaseAdmin.from('alumno_packs').update({
                        creditos_restantes: (pk.creditos_restantes || 0) + 1,
                        estado: 'activo'
                    }).eq('id', pk.id);
                    packRefilleado = true;
                }
            }

            await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', {
                p_usuario_id: inscripcion.user_id,
                p_referencia: llavePase,
                p_cantidad: 1
            })

            // Si no había pack_usado_id, caemos al método viejo (detective).
            if (!packRefilleado) {
                const { data: packsExAlumno } = await supabaseAdmin.from('alumno_packs')
                    .select('id, creditos_restantes, cantidad_inicial')
                    .eq('user_id', inscripcion.user_id)
                    .eq('tipo_clase', 'exclusivo')
                    .order('fecha_compra', { ascending: false });

                if (packsExAlumno && packsExAlumno.length > 0) {
                    const packAfectado = packsExAlumno.find(p => p.creditos_restantes < p.cantidad_inicial);
                    if (packAfectado) {
                        await supabaseAdmin.from('alumno_packs').update({
                            creditos_restantes: packAfectado.creditos_restantes + 1,
                            estado: 'activo'
                        }).eq('id', packAfectado.id);
                    }
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

        // 🚀 CORRECCIÓN CLAVE: El servidor ahora respeta a rajatabla si la clase es combinable o no
        const esExclusiva = claseDb.es_combinable === false || tipoClaseStr === 'exclusivo';

        const isEspecial = tipoClaseStr === 'especial' || tipoClaseStr === 'seminario';
        const isLiga = tipoClaseStr === 'liga';
        const isCompania = tipoClaseStr === 'compania' || tipoClaseStr === 'compañia';
        const isAudicion = claseDb.es_audicion === true;

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

                // 🚀 El bloqueo de seguridad sigue activo para que no queden en -1
                const { data: miPase } = await supabaseAdmin.from('pases_exclusivos')
                    .select('cantidad')
                    .eq('usuario_id', payload.p_user_id)
                    .eq('pase_referencia', paseReferencia)
                    .maybeSingle();

                if (!miPase || miPase.cantidad < 1) {
                    throw new Error('El alumno no tiene pases exclusivos disponibles para esta clase.');
                }

                const { data: packActivo } = await supabaseAdmin.from('alumno_packs')
                    .select('id, creditos_restantes, cantidad_inicial, monto_abonado, metodo_pago, precio_total')
                    .eq('user_id', payload.p_user_id)
                    .eq('tipo_clase', 'exclusivo')
                    .gt('creditos_restantes', 0)
                    .order('fecha_compra', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (packActivo && packActivo.cantidad_inicial > 0) {
                    packUsadoId = packActivo.id;
                    // Valor FIJO por clase = precio total pactado ÷ créditos (no cambia
                    // aunque el alumno pague en cuotas). Fallback a lo abonado para
                    // packs viejos sin precio_total cargado.
                    valorInscripcion = Math.round((packActivo.precio_total ?? packActivo.monto_abonado) / packActivo.cantidad_inicial);
                    metodoPagoFinal = packActivo.metodo_pago || 'efectivo';

                    const nuevosRestantes = packActivo.creditos_restantes - 1;
                    await supabaseAdmin.from('alumno_packs').update({
                        creditos_restantes: nuevosRestantes,
                        estado: nuevosRestantes === 0 ? 'agotado' : 'activo'
                    }).eq('id', packActivo.id);
                }

                await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', { p_usuario_id: payload.p_user_id, p_referencia: paseReferencia, p_cantidad: -1 })
            }
            else if (payload.p_tipo_operacion === 'pack') {
                modalidadInsc = 'Pase Exclusivo (Pack)';
                if (!payload.p_user_id || !productoIdLimpio) throw new Error('Faltan datos del pack.');

                const { data: prod } = await supabaseAdmin.from('productos').select('creditos').eq('id', productoIdLimpio).single();
                const creditosDelPack = prod ? prod.creditos : 0;

                // Total pactado = lo que paga ahora + lo que queda a deber (seña).
                // El valor por clase sale del total, así no cambia si paga en cuotas.
                const totalPack = (payload.p_monto_caja || 0) + (saldoPendienteCalculado || 0);
                valorInscripcion = creditosDelPack > 0 ? Math.round(totalPack / creditosDelPack) : totalPack;

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
                    precio_total: totalPack,
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
                    .select('id, creditos_restantes, cantidad_inicial, monto_abonado, metodo_pago, precio_total')
                    .eq('user_id', payload.p_user_id)
                    .eq('tipo_clase', tipoPackBusqueda)
                    .gt('creditos_restantes', 0)
                    .order('fecha_compra', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (packActivo && packActivo.cantidad_inicial > 0) {
                    packUsadoId = packActivo.id;
                    // Valor FIJO por clase = precio total pactado ÷ créditos (no cambia
                    // aunque el alumno pague en cuotas). Fallback a lo abonado para
                    // packs viejos sin precio_total cargado.
                    valorInscripcion = Math.round((packActivo.precio_total ?? packActivo.monto_abonado) / packActivo.cantidad_inicial);
                    metodoPagoFinal = packActivo.metodo_pago || 'efectivo';

                    const nuevosRestantes = packActivo.creditos_restantes - 1;
                    await supabaseAdmin.from('alumno_packs').update({
                        creditos_restantes: nuevosRestantes,
                        estado: nuevosRestantes === 0 ? 'agotado' : 'activo'
                    }).eq('id', packActivo.id);
                }

                await supabaseAdmin.from('profiles').update({ [campoCredito]: (perfil as any)[campoCredito] - 1 }).eq('id', payload.p_user_id);
            }
            else if (payload.p_tipo_operacion === 'pack') {
                modalidadInsc = 'Pack';
                if (!payload.p_user_id || !productoIdLimpio) throw new Error('Faltan datos del pack.');

                const { data: prod } = await supabaseAdmin.from('productos').select('creditos, tipo_clase').eq('id', productoIdLimpio).single();
                const creditosDelPack = prod ? prod.creditos : 0;
                const tipoClaseProd = prod?.tipo_clase || tipoPackBusqueda;

                // Total pactado = lo que paga ahora + lo que queda a deber (seña).
                // El valor por clase sale del total, así no cambia si paga en cuotas.
                const totalPack = (payload.p_monto_caja || 0) + (saldoPendienteCalculado || 0);
                valorInscripcion = creditosDelPack > 0 ? Math.round(totalPack / creditosDelPack) : totalPack;

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
                    precio_total: totalPack,
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

        // 2. CALCULAMOS EL NUEVO VALOR POR CLASE
        // valor_credito = lo realmente cobrado por clase. Para un pack es
        // monto_abonado / cantidad (NO se le suma la fracción sobre el nominal,
        // que era el bug: 12.500 + 6.250 = 18.750 en vez de 45.000/4 = 11.250).
        let nuevoValorCredito = Number(insc.valor_credito) + Number(monto); // default: clase suelta acumula

        if (insc.pack_usado_id) {
            const { data: packAfectado } = await supabaseAdmin
                .from('alumno_packs')
                .select('*')
                .eq('id', insc.pack_usado_id)
                .single();

            if (packAfectado && Number(packAfectado.cantidad_inicial) > 1) {
                const divisor = Number(packAfectado.cantidad_inicial);
                const nuevoMonto = Number(packAfectado.monto_abonado) + Number(monto);

                // Le sumamos la plata ingresada al pack maestro
                await supabaseAdmin.from('alumno_packs').update({ monto_abonado: nuevoMonto }).eq('id', packAfectado.id);

                // El valor por clase queda en línea con lo cobrado del pack
                nuevoValorCredito = nuevoMonto / divisor;
            }
        }

        // 3. ACTUALIZAMOS LA INSCRIPCIÓN
        const { error: errUpd } = await supabaseAdmin.from('inscripciones').update({
            valor_credito: nuevoValorCredito,
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

// Marca la deuda de una inscripción como saldada (saldo 0) SIN registrar un
// cobro nuevo. Para cuando el alumno ya pagó todo (por fuera o antes) y el
// cartel de "Adeuda" quedó pegado.
export async function saldarDeudaInscripcionAction(inscripcionId: string) {
    const supabase = await createClient()
    const admin = getAdminClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')
        const { data: insc } = await admin.from('inscripciones').select('clase_id').eq('id', inscripcionId).single()
        const { error } = await admin.from('inscripciones').update({ saldo_pendiente: 0 }).eq('id', inscripcionId)
        if (error) throw new Error(error.message)
        if (insc?.clase_id) revalidatePath(`/clase/${insc.clase_id}`)
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// Packs (más de 1 clase) que se pueden elegir como destino de una conversión.
export async function getPacksConvertiblesAction() {
    const admin = getAdminClient()
    const { data } = await admin.from('productos')
        .select('id, nombre, tipo_clase, creditos, precio, pase_referencia')
        .gt('creditos', 1)
        .eq('activo', true)
        .order('tipo_clase', { ascending: true })
        .order('creditos', { ascending: true })
    return data || []
}

// Desde el panel de la clase: pasa a un asistente de "clase suelta" a un PACK.
// Si el asistente es invitado (sin cuenta), primero le crea el usuario.
// Cobra la diferencia y le deja los créditos del pack menos la clase ya usada.
export async function convertirAsistenteAPackAction(payload: {
    inscripcionId: string
    productoId: string
    yaPago: number
    diferencia: number
    metodoPago: string
    nuevoUsuario?: { nombre: string; apellido: string; email: string; dni: string; telefono: string }
}) {
    const supabase = await createClient()
    const admin = getAdminClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')
        const operadoraId = session.user.id

        const { data: insc } = await admin.from('inscripciones')
            .select('id, user_id, pack_usado_id, nombre_invitado, clase_id')
            .eq('id', payload.inscripcionId).single()
        if (!insc) throw new Error('No se encontró la inscripción')

        const { data: prod } = await admin.from('productos')
            .select('id, nombre, tipo_clase, creditos, precio, pase_referencia')
            .eq('id', payload.productoId).single()
        if (!prod) throw new Error('No se encontró el pack destino')
        if (Number(prod.creditos) <= 1) throw new Error('El destino tiene que ser un pack (más de 1 clase)')

        const delta = Number(prod.creditos) - 1 // 1 clase ya usada (ésta)

        // 1. Usuario: si es invitado, lo creamos y linkeamos la inscripción
        let userId: string | null = insc.user_id
        if (!userId) {
            if (!payload.nuevoUsuario?.email?.trim()) throw new Error('Para pasar a pack hay que crear la cuenta (falta el email)')
            const r = await crearAlumnoDesdeRecepcionAction(payload.nuevoUsuario)
            if (!r.success || !r.user_id) throw new Error(r.error || 'No se pudo crear el usuario')
            userId = r.user_id
            await admin.from('inscripciones').update({ user_id: userId, es_invitado: false, nombre_invitado: null }).eq('id', insc.id)
        }

        const { data: perfil } = await admin.from('profiles')
            .select('nombre, apellido, nombre_completo, creditos_regulares, creditos_especiales').eq('id', userId).single()
        const nombreAlumno = perfil?.nombre_completo || [perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ') || 'Alumno'

        // 2. Cobro de la diferencia en la caja del turno abierto
        if (Number(payload.diferencia) > 0) {
            const { data: turno } = await admin.from('caja_turnos').select('id')
                .eq('usuario_id', operadoraId).eq('estado', 'abierta')
                .order('fecha_apertura', { ascending: false }).limit(1).maybeSingle()
            if (!turno) throw new Error('¡Caja Cerrada! Abrí tu caja para cobrar la diferencia.')
            const { error: errCaja } = await admin.from('caja_movimientos').insert({
                turno_id: turno.id, tipo: 'ingreso',
                concepto: `Diferencia Suelta→Pack (${prod.nombre}) | Alumno: ${nombreAlumno}`,
                monto: Number(payload.diferencia), metodo_pago: payload.metodoPago, origen_referencia: 'manual'
            })
            if (errCaja) throw new Error('Error al registrar la diferencia en la caja')
        }

        const montoTotal = Number(payload.yaPago) + Number(payload.diferencia)
        const ahora = new Date()

        // 3. Pack: si ya tenía un pack de 1 clase lo convertimos; si no, creamos uno nuevo
        if (insc.pack_usado_id) {
            const { data: packActual } = await admin.from('alumno_packs').select('*').eq('id', insc.pack_usado_id).single()
            if (packActual && Number(packActual.cantidad_inicial) === 1) {
                await admin.from('alumno_packs').update({
                    producto_id: prod.id, tipo_clase: prod.tipo_clase,
                    cantidad_inicial: Number(prod.creditos),
                    creditos_restantes: Number(packActual.creditos_restantes) + delta,
                    monto_abonado: Number(packActual.monto_abonado) + Number(payload.diferencia),
                    precio_total: Number(prod.precio),
                }).eq('id', packActual.id)
            }
        } else {
            const { data: nuevoPack } = await admin.from('alumno_packs').insert({
                user_id: userId, producto_id: prod.id, tipo_clase: prod.tipo_clase,
                cantidad_inicial: Number(prod.creditos), creditos_restantes: delta,
                monto_abonado: montoTotal, precio_total: Number(prod.precio),
                metodo_pago: payload.metodoPago, fecha_compra: ahora.toISOString(),
                fecha_vencimiento: new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                estado: 'activo'
            }).select('id').single()
            if (nuevoPack?.id) await admin.from('inscripciones').update({ pack_usado_id: nuevoPack.id }).eq('id', insc.id)
        }

        // 4. Sumamos los créditos extra por el canal correcto
        if (prod.tipo_clase === 'exclusivo') {
            await admin.rpc('cargar_pase_exclusivo_manual', { p_usuario_id: userId, p_referencia: prod.pase_referencia, p_cantidad: delta })
        } else {
            const campo = prod.tipo_clase === 'seminario' ? 'creditos_especiales' : 'creditos_regulares'
            await admin.from('profiles').update({ [campo]: (Number((perfil as any)?.[campo]) || 0) + delta }).eq('id', userId)
        }

        revalidatePath(`/clase/${insc.clase_id}`)
        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}