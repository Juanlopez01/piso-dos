'use server'

// 👇 IMPORTAMOS EL LECTOR DE COOKIES
import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { revalidatePath } from 'next/cache'

// 🚀 CLIENTE DIOS: Para operaciones que requieren bypass de RLS
const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

// 🚀 FUNCIÓN ANTI-FANTASMAS: Garantiza que siempre haya un nombre escrito en la caja
const getNombreSeguro = (perfil: any) => {
    if (!perfil) return 'Alumno Desconocido';
    const completo = (perfil.nombre_completo || '').trim();
    if (completo) return completo;
    const compuesto = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim();
    if (compuesto) return compuesto;
    return 'Alumno Desconocido';
}

export async function cambiarRolAction(usuarioId: string, nuevoRol: string) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('profiles').update({ rol: nuevoRol as any }).eq('id', usuarioId)
        if (error) throw new Error(error.message)
        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cambiarLigaAction(usuarioId: string, nuevoNivel: number | null) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('nivel_liga')
            .eq('id', usuarioId)
            .single()

        if (profileError) throw new Error("Error al obtener perfil actual del usuario.")

        const nivelAnterior = userProfile.nivel_liga ? Number(userProfile.nivel_liga) : null
        const nivelNuevoParsed = nuevoNivel ? Number(nuevoNivel) : null

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ nivel_liga: nivelNuevoParsed })
            .eq('id', usuarioId)

        if (updateError) throw new Error(updateError.message)

        const hoy = new Date().toISOString()

        if (nivelAnterior !== null && nivelAnterior !== nivelNuevoParsed) {
            const { data: clasesViejas } = await supabase
                .from('clases')
                .select('id')
                .gte('inicio', hoy)
                .eq('liga_nivel', nivelAnterior)

            if (clasesViejas && clasesViejas.length > 0) {
                const idsClasesViejas = clasesViejas.map(c => c.id)
                const { error: deleteError } = await supabase
                    .from('inscripciones')
                    .delete()
                    .eq('user_id', usuarioId)
                    .in('clase_id', idsClasesViejas)

                if (deleteError) console.error("Error borrando inscripciones viejas:", deleteError)
            }
        }

        if (nivelNuevoParsed !== null && nivelAnterior !== nivelNuevoParsed) {
            const { data: clasesNuevas, error: fetchError } = await supabase
                .from('clases')
                .select('id')
                .gte('inicio', hoy)
                .eq('liga_nivel', nivelNuevoParsed)
                .neq('estado', 'cancelada')

            if (fetchError) console.error("Error buscando clases nuevas:", fetchError)

            if (clasesNuevas && clasesNuevas.length > 0) {
                const idsClasesNuevas = clasesNuevas.map(c => c.id)
                const { data: inscripcionesExistentes } = await supabase
                    .from('inscripciones')
                    .select('clase_id')
                    .eq('user_id', usuarioId)
                    .in('clase_id', idsClasesNuevas)

                const idsYaAnotados = new Set(inscripcionesExistentes?.map(i => i.clase_id) || [])

                const nuevasInscripciones = idsClasesNuevas
                    .filter(claseId => !idsYaAnotados.has(claseId))
                    .map(claseId => ({
                        user_id: usuarioId,
                        clase_id: claseId
                    }))

                if (nuevasInscripciones.length > 0) {
                    const { error: insertError } = await supabase
                        .from('inscripciones')
                        .insert(nuevasInscripciones)

                    if (insertError) throw new Error(`Error al auto-inscribir: ${insertError.message}`)
                }
            }
        }

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        console.error("Error en cambiarLigaAction:", error)
        return { success: false, error: error.message }
    }
}

export async function guardarPerfilAction(
    userId: string,
    observaciones: string,
    intereses: string[],
    becaLiga: number,
    becaCompania: number,
    permisosGrupos?: string[] // 🚀 NUEVO PARÁMETRO OPCIONAL (El Llavero)
) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const bLiga = Math.max(0, Math.min(100, becaLiga || 0));
    const bCompania = Math.max(0, Math.min(100, becaCompania || 0));

    const updatePayload: any = {
        staff_observations: observaciones,
        intereses_ritmos: intereses,
        porcentaje_beca_liga: bLiga,
        porcentaje_beca_compania: bCompania
    };

    // Si nos mandan los permisos del coordinador, los sumamos al paquete a guardar
    if (permisosGrupos !== undefined) {
        updatePayload.permisos_grupos = permisosGrupos;
    }

    const { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function asignarPackAction(
    usuarioId: string,
    tipoClase: string,
    creditos: number,
    monto: number,
    metodoPago: string,
    productoId?: string,
    pase_referencia?: string | null
) {
    const supabase = await createClient(); // 🚀 El cliente normal para ver quién está logueado
    const supabaseAdmin = getAdminClient(); // 🚀 El cliente Dios para guardar en la BD

    try {
        // 🚀 AHORA SÍ LE PREGUNTAMOS AL CLIENTE NORMAL
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const operadoraId = session.user.id;

        // 1. Limpieza de datos
        const productoIdLimpio = (productoId && productoId.trim() !== '') ? productoId : null;
        const { data: perfilAlumno } = await supabaseAdmin.from('profiles').select('nombre, apellido, nombre_completo, creditos_regulares, creditos_especiales').eq('id', usuarioId).single()
        const nombreAlumno = getNombreSeguro(perfilAlumno);

        // 2. Control de Caja (🚀 FILTRO CRÍTICO APLICADO)
        let turnoActivoId = null
        if (monto > 0) {
            const { data: turno } = await supabaseAdmin
                .from('caja_turnos')
                .select('id')
                .eq('usuario_id', operadoraId) // <--- Filtro del usuario logueado
                .eq('estado', 'abierta')
                .order('fecha_apertura', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (!turno) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')
            turnoActivoId = turno.id
        }

        // 3. Registro en Caja
        if (monto > 0 && turnoActivoId) {
            const conceptoCaja = tipoClase === 'exclusivo' ? 'Venta Pase Exclusivo' : `Venta Pack ${tipoClase.toUpperCase()}`;
            const { error: errCaja } = await supabaseAdmin.from('caja_movimientos').insert({
                turno_id: turnoActivoId,
                tipo: 'ingreso',
                concepto: `${conceptoCaja} | Alumno: ${nombreAlumno}`,
                monto: monto,
                metodo_pago: metodoPago,
                origen_referencia: 'manual'
            })
            if (errCaja) throw new Error('Error al registrar movimiento en la caja.')
        }

        // 🚀 4. EL ESTÁNDAR DE ORO: Registro en alumno_packs (FIFO Ready)
        const ahora = new Date();
        const { error: errPack } = await supabaseAdmin.from('alumno_packs').insert({
            user_id: usuarioId,
            producto_id: productoIdLimpio,
            tipo_clase: tipoClase, // 'regular', 'seminario' o 'exclusivo'
            cantidad_inicial: creditos,
            creditos_restantes: creditos,
            monto_abonado: monto,
            fecha_compra: ahora.toISOString(),
            fecha_vencimiento: new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 días default
            estado: 'activo'
        });

        if (errPack) throw new Error(`Fallo crítico al guardar el pack: ${errPack.message}`);

        // 5. Actualización de créditos en tiempo real
        if (tipoClase === 'exclusivo') {
            const { error: errPase } = await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', {
                p_usuario_id: usuarioId,
                p_referencia: pase_referencia,
                p_cantidad: creditos
            })
            if (errPase) throw new Error(`Error al habilitar el pase exclusivo: ${errPase.message}`)
        } else {
            const campo = tipoClase === 'seminario' ? 'creditos_especiales' : 'creditos_regulares';
            const { error: errProf } = await supabaseAdmin.from('profiles').update({
                [campo]: ((perfilAlumno as any)[campo] || 0) + creditos
            }).eq('id', usuarioId);

            if (errProf) throw new Error(`Error al sumar los créditos al perfil: ${errProf.message}`);
        }

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        console.error("Error en asignarPackAction:", error);
        return { success: false, error: error.message }
    }
}

export async function cobrarLigaAction(usuarioId: string, monto: number, metodoPago: string, mes?: number, anio?: number) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const user = session.user

        // 🚀 FILTRO CRÍTICO APLICADO (Solo la caja de ESTE usuario)
        const { data: turno } = await supabase
            .from('caja_turnos')
            .select('id')
            .eq('usuario_id', user.id)
            .eq('estado', 'abierta')
            .order('fecha_apertura', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (!turno && monto > 0) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')

        // 🚀 ACA ESTÁ EL FIX: Usamos el mes/año que manda el frontend, o el actual por defecto
        const hoy = new Date()
        const mesCobro = mes || hoy.getMonth() + 1
        const anioCobro = anio || hoy.getFullYear()

        const { data: pagoExistente } = await supabase
            .from('liga_pagos')
            .select('id, monto')
            .eq('alumno_id', usuarioId)
            .eq('mes', mesCobro)      // Usamos el mes seleccionado
            .eq('anio', anioCobro)    // Usamos el año seleccionado
            .maybeSingle()

        if (pagoExistente) {
            const { error: errUpdate } = await supabase.from('liga_pagos').update({
                monto: Number(pagoExistente.monto) + monto,
                metodo_pago: metodoPago
            }).eq('id', pagoExistente.id)
            if (errUpdate) throw new Error(errUpdate.message)
        } else {
            const { error: errInsert } = await supabase.from('liga_pagos').insert({
                alumno_id: usuarioId,
                mes: mesCobro,       // Usamos el mes seleccionado
                anio: anioCobro,     // Usamos el año seleccionado
                monto: monto,
                metodo_pago: metodoPago
            })
            if (errInsert) {
                if (errInsert.code === '23505') throw new Error('Este alumno ya tiene pagada la cuota de este mes.')
                throw new Error(errInsert.message)
            }
        }

        if (monto > 0 && turno) {
            const { data: perfilAlumno } = await supabase.from('profiles').select('nombre, apellido, nombre_completo').eq('id', usuarioId).single()
            const nombreAlumno = getNombreSeguro(perfilAlumno);

            const { error: errCaja } = await supabase.from('caja_movimientos').insert([{
                turno_id: turno.id, // Se asigna EXACTAMENTE a la caja del operador
                tipo: 'ingreso',
                concepto: `Seña/Cuota Liga (${mesCobro}/${anioCobro}): ${nombreAlumno}`, // Se anota en caja con el mes correcto
                monto: monto,
                metodo_pago: metodoPago,
                origen_referencia: 'liga'
            }])

            if (errCaja) throw new Error(`Error al registrar en caja: ${errCaja.message}`)
        }

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cobrarCompaniaAction(usuarioId: string, companiaId: string, monto: number, metodoPago: string, mes?: number, anio?: number) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const user = session.user

        // 🚀 FILTRO CRÍTICO APLICADO
        const { data: turno } = await supabase
            .from('caja_turnos')
            .select('id')
            .eq('usuario_id', user.id) // <--- Filtro del usuario logueado
            .eq('estado', 'abierta')
            .order('fecha_apertura', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (!turno && monto > 0) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')

        // 🚀 ACA ESTÁ EL FIX: Usamos el mes/año que manda el frontend, o el actual por defecto
        const hoy = new Date()
        const mesCobro = mes || hoy.getMonth() + 1
        const anioCobro = anio || hoy.getFullYear()

        const { data: pagoExistente } = await supabase
            .from('companias_pagos')
            .select('id, monto')
            .eq('alumno_id', usuarioId)
            .eq('compania_id', companiaId)
            .eq('mes', mesCobro)   // Usamos el mes seleccionado
            .eq('anio', anioCobro) // Usamos el año seleccionado
            .maybeSingle()

        if (pagoExistente) {
            const { error: errUpdate } = await supabase.from('companias_pagos').update({
                monto: Number(pagoExistente.monto) + monto,
                metodo_pago: metodoPago
            }).eq('id', pagoExistente.id)
            if (errUpdate) throw new Error(errUpdate.message)
        } else {
            const { error: errInsert } = await supabase.from('companias_pagos').insert({
                alumno_id: usuarioId,
                compania_id: companiaId,
                mes: mesCobro,     // Usamos el mes seleccionado
                anio: anioCobro,   // Usamos el año seleccionado
                monto: monto,
                metodo_pago: metodoPago
            })
            if (errInsert) {
                if (errInsert.code === '23505') throw new Error('Este alumno ya abonó la cuota de esta compañía este mes.')
                throw new Error(errInsert.message)
            }
        }

        if (monto > 0 && turno) {
            const { data: perfilAlumno } = await supabase.from('profiles').select('nombre, apellido, nombre_completo').eq('id', usuarioId).single()
            const nombreAlumno = getNombreSeguro(perfilAlumno); // Usa tu función auxiliar

            const { data: dataCompania } = await supabase.from('companias').select('nombre').eq('id', companiaId).single()
            const nombreCia = dataCompania?.nombre || 'Grupo'

            const { error: errCaja } = await supabase.from('caja_movimientos').insert([{
                turno_id: turno.id, // Se asigna EXACTAMENTE a la caja del operador
                tipo: 'ingreso',
                concepto: `Seña/Cuota Grupo (${mesCobro}/${anioCobro}): ${nombreCia} - ${nombreAlumno}`, // Se anota en caja con el mes correcto
                monto: monto,
                metodo_pago: metodoPago,
                origen_referencia: 'compania'
            }])

            if (errCaja) throw new Error(`Error al registrar en caja: ${errCaja.message}`)
        }

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function crearAlumnoDesdeRecepcionAction(datos: { nombre: string, apellido: string, email: string, dni: string, telefono: string }) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

        if (!supabaseServiceKey) {
            return { success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en las variables de entorno' }
        }

        const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        })

        // 🚀 FIX: LIMPIAMOS EL EMAIL DE ESPACIOS INVISIBLES Y MAYÚSCULAS
        const cleanEmail = datos.email ? datos.email.trim().toLowerCase() : '';
        const cleanDni = datos.dni ? datos.dni.trim() : '';

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            password: cleanDni,
            email_confirm: true,
            user_metadata: {
                nombre: datos.nombre.trim(),
                apellido: datos.apellido.trim(),
                nombre_completo: `${datos.nombre} ${datos.apellido}`.trim(),
                dni: cleanDni,
                telefono: datos.telefono?.trim() || null,
                rol: 'alumno'
            }
        })

        if (error) {
            // Hacemos el mensaje de error más amigable para la recepción
            if (error.message.includes('invalid format')) {
                return { success: false, error: `El email "${cleanEmail}" no tiene un formato válido.` }
            }
            if (error.message.includes('already registered')) {
                return { success: false, error: `Ya existe una cuenta con el email "${cleanEmail}".` }
            }
            return { success: false, error: error.message }
        }

        return { success: true, user_id: data.user.id }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarUsuarioCompletoAction(usuarioId: string) {
    const supabaseAdmin = getAdminClient(); // Usamos el admin client que ya configuramos antes

    try {
        const { data: { session } } = await supabaseAdmin.auth.getSession()
        // Aquí podrías chequear si el que ejecuta es Admin nuevamente

        // 1. Borramos el usuario de Auth (esto borra por cascada el Profile si tenés configurado ON DELETE CASCADE)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(usuarioId)

        if (error) throw error

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        console.error("Error eliminando usuario:", error)
        return { success: false, error: error.message }
    }
}