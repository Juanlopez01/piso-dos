'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

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

export async function guardarPerfilAction(userId: string, observaciones: string, intereses: string[], becaLiga: number, becaCompania: number) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const bLiga = Math.max(0, Math.min(100, becaLiga || 0));
    const bCompania = Math.max(0, Math.min(100, becaCompania || 0));

    const { error } = await supabase
        .from('profiles')
        .update({
            staff_observations: observaciones,
            intereses_ritmos: intereses,
            porcentaje_beca_liga: bLiga,
            porcentaje_beca_compania: bCompania
        })
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
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const user = session.user

        // 🚀 AHORA TRAEMOS NOMBRE Y APELLIDO PARA ARMARLO BIEN
        const { data: perfilAlumno } = await supabase.from('profiles').select('nombre, apellido, nombre_completo').eq('id', usuarioId).single()
        const nombreAlumno = getNombreSeguro(perfilAlumno);

        let turnoActivoId = null
        if (monto > 0) {
            const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
            if (!turno) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')
            turnoActivoId = turno.id
        }

        if (tipoClase === 'exclusivo') {
            if (monto > 0 && turnoActivoId) {
                const { error: errCaja } = await supabase.from('caja_movimientos').insert({
                    turno_id: turnoActivoId,
                    tipo: 'ingreso',
                    concepto: `Venta Pase Exclusivo | Alumno: ${nombreAlumno}`,
                    monto: monto,
                    metodo_pago: metodoPago,
                    origen_referencia: 'manual'
                })
                if (errCaja) throw new Error('Error al registrar en la caja.')
            }

            const { error: errPase } = await supabase.rpc('cargar_pase_exclusivo_manual', {
                p_usuario_id: usuarioId,
                p_referencia: pase_referencia,
                p_cantidad: creditos
            })
            if (errPase) throw new Error(`Error al habilitar el acceso: ${errPase.message}`)

        } else {
            const { data, error } = await supabase.rpc('asignar_pack_manual', {
                p_user_id: usuarioId,
                p_turno_caja_id: turnoActivoId,
                p_tipo_clase: tipoClase,
                p_cantidad: creditos,
                p_monto: monto,
                p_metodo_pago: metodoPago
            })

            if (error) throw new Error('Error de conexión al cargar el pack regular.')
            if (!data.success) throw new Error(data.message)

            if (monto > 0 && turnoActivoId) {
                const { data: ultimoMovimiento } = await supabase
                    .from('caja_movimientos')
                    .select('id, concepto')
                    .eq('turno_id', turnoActivoId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                // 🚀 PREVENCIÓN: Solo pegamos el nombre si no lo tiene ya pegado
                if (ultimoMovimiento && !ultimoMovimiento.concepto.includes('| Alumno:')) {
                    const nuevoConcepto = `${ultimoMovimiento.concepto} | Alumno: ${nombreAlumno}`
                    await supabase
                        .from('caja_movimientos')
                        .update({ concepto: nuevoConcepto })
                        .eq('id', ultimoMovimiento.id)
                }
            }
        }

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cobrarLigaAction(usuarioId: string, monto: number, metodoPago: string) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const user = session.user

        const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
        if (!turno && monto > 0) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')

        const hoy = new Date()
        const mesActual = hoy.getMonth() + 1
        const anioActual = hoy.getFullYear()

        const { data: pagoExistente } = await supabase
            .from('liga_pagos')
            .select('id, monto')
            .eq('alumno_id', usuarioId)
            .eq('mes', mesActual)
            .eq('anio', anioActual)
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
                mes: mesActual,
                anio: anioActual,
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
                turno_id: turno.id,
                tipo: 'ingreso',
                concepto: `Seña/Cuota Liga (${mesActual}/${anioActual}): ${nombreAlumno}`,
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

export async function cobrarCompaniaAction(usuarioId: string, companiaId: string, monto: number, metodoPago: string) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const user = session.user

        const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
        if (!turno && monto > 0) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')

        const hoy = new Date()
        const mesActual = hoy.getMonth() + 1
        const anioActual = hoy.getFullYear()

        const { data: pagoExistente } = await supabase
            .from('companias_pagos')
            .select('id, monto')
            .eq('alumno_id', usuarioId)
            .eq('compania_id', companiaId)
            .eq('mes', mesActual)
            .eq('anio', anioActual)
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
                mes: mesActual,
                anio: anioActual,
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
            const nombreAlumno = getNombreSeguro(perfilAlumno);

            const { data: dataCompania } = await supabase.from('companias').select('nombre').eq('id', companiaId).single()
            const nombreCia = dataCompania?.nombre || 'Grupo'

            const { error: errCaja } = await supabase.from('caja_movimientos').insert([{
                turno_id: turno.id,
                tipo: 'ingreso',
                concepto: `Seña/Cuota Grupo (${mesActual}/${anioActual}): ${nombreCia} - ${nombreAlumno}`,
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

import { createClient as createAdminClient } from '@supabase/supabase-js'

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

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: datos.email,
            password: datos.dni,
            email_confirm: true,
            user_metadata: {
                nombre: datos.nombre,
                apellido: datos.apellido,
                nombre_completo: `${datos.nombre} ${datos.apellido}`.trim(),
                dni: datos.dni,
                telefono: datos.telefono,
                rol: 'alumno'
            }
        })

        if (error) return { success: false, error: error.message }

        return { success: true, user_id: data.user.id }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}