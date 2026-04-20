// app/actions/usuarios.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function cambiarRolAction(usuarioId: string, nuevoRol: string) {
    const supabase = await createClient()
    try {
        // 🔒 SEGURIDAD: Chequeamos sesión
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
        // 🔒 SEGURIDAD
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        // 1. Buscamos el nivel actual del usuario ANTES de cambiarlo
        const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('nivel_liga')
            .eq('id', usuarioId)
            .single()

        if (profileError) throw new Error("Error al obtener perfil actual del usuario.")

        // 🚀 BLINDAJE: Convertimos todo a números exactos para que la BD no se confunda
        const nivelAnterior = userProfile.nivel_liga ? Number(userProfile.nivel_liga) : null
        const nivelNuevoParsed = nuevoNivel ? Number(nuevoNivel) : null

        // 2. Actualizamos el perfil del usuario con el nuevo nivel
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ nivel_liga: nivelNuevoParsed })
            .eq('id', usuarioId)

        if (updateError) throw new Error(updateError.message)

        // --- 🚀 INICIO DE LA AUTOMATIZACIÓN ---
        const hoy = new Date().toISOString()

        // PASO A: BARRER CLASES VIEJAS (Si cambió de nivel o se quedó sin liga)
        if (nivelAnterior !== null && nivelAnterior !== nivelNuevoParsed) {
            // Buscamos los IDs de las clases futuras del nivel viejo
            const { data: clasesViejas } = await supabase
                .from('clases')
                .select('id')
                .gte('inicio', hoy)
                .eq('liga_nivel', nivelAnterior)

            if (clasesViejas && clasesViejas.length > 0) {
                const idsClasesViejas = clasesViejas.map(c => c.id)
                // Borramos las inscripciones a esas clases
                const { error: deleteError } = await supabase
                    .from('inscripciones')
                    .delete()
                    .eq('user_id', usuarioId)
                    .in('clase_id', idsClasesViejas)

                if (deleteError) console.error("Error borrando inscripciones viejas:", deleteError)
            }
        }

        // PASO B: ANOTAR EN CLASES NUEVAS (Si le pusimos un nivel válido)
        if (nivelNuevoParsed !== null && nivelAnterior !== nivelNuevoParsed) {
            // Buscamos todas las clases futuras del nivel nuevo
            const { data: clasesNuevas, error: fetchError } = await supabase
                .from('clases')
                .select('id')
                .gte('inicio', hoy)
                .eq('liga_nivel', nivelNuevoParsed)
                .neq('estado', 'cancelada')

            if (fetchError) console.error("Error buscando clases nuevas:", fetchError)

            if (clasesNuevas && clasesNuevas.length > 0) {
                // Primero chequeamos en cuáles ya está para no duplicar inscripciones
                const idsClasesNuevas = clasesNuevas.map(c => c.id)
                const { data: inscripcionesExistentes } = await supabase
                    .from('inscripciones')
                    .select('clase_id')
                    .eq('user_id', usuarioId)
                    .in('clase_id', idsClasesNuevas)

                const idsYaAnotados = new Set(inscripcionesExistentes?.map(i => i.clase_id) || [])

                // Filtramos y preparamos las que le faltan
                const nuevasInscripciones = idsClasesNuevas
                    .filter(claseId => !idsYaAnotados.has(claseId))
                    .map(claseId => ({
                        user_id: usuarioId,
                        clase_id: claseId
                    }))

                // Insertamos de golpe
                if (nuevasInscripciones.length > 0) {
                    const { error: insertError } = await supabase
                        .from('inscripciones')
                        .insert(nuevasInscripciones)

                    if (insertError) {
                        console.error("Error CRÍTICO al insertar inscripciones:", insertError)
                        throw new Error(`Error al auto-inscribir: ${insertError.message}`)
                    }
                }
            }
        }
        // --- FIN DE LA AUTOMATIZACIÓN ---

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        console.error("Error en cambiarLigaAction:", error)
        return { success: false, error: error.message }
    }
}

export async function guardarPerfilAction(usuarioId: string, obs: string, intereses: string[]) {
    const supabase = await createClient()
    try {
        // 🔒 SEGURIDAD
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('profiles').update({
            staff_observations: obs,
            intereses_ritmos: intereses
        }).eq('id', usuarioId)
        if (error) throw new Error(error.message)
        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function asignarPackAction(usuarioId: string, tipoClase: string, creditos: number, monto: number, metodoPago: string) {
    const supabase = await createClient()
    try {
        // 🚀 BLINDAJE: getSession() en lugar de getUser()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const user = session.user

        let turnoActivoId = null
        if (monto > 0) {
            const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
            if (!turno) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')
            turnoActivoId = turno.id
        }

        const { data, error } = await supabase.rpc('asignar_pack_manual', {
            p_user_id: usuarioId,
            p_turno_caja_id: turnoActivoId,
            p_tipo_clase: tipoClase,
            p_cantidad: creditos,
            p_monto: monto,
            p_metodo_pago: metodoPago
        })

        if (error) throw new Error('Error de conexión al cargar el pack.')
        if (!data.success) throw new Error(data.message)

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cobrarLigaAction(usuarioId: string, monto: number, metodoPago: string) {
    const supabase = await createClient()
    try {
        // 🚀 BLINDAJE: getSession() en lugar de getUser()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const user = session.user

        const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
        if (!turno) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')

        const hoy = new Date()
        const payload = {
            alumno_id: usuarioId,
            mes: hoy.getMonth() + 1,
            anio: hoy.getFullYear(),
            monto: monto,
            metodo_pago: metodoPago,
            turno_caja_id: turno.id
        }

        const { error } = await supabase.from('liga_pagos').insert(payload)
        if (error) {
            if (error.code === '23505') throw new Error('Este alumno ya tiene pagada la cuota de este mes.')
            throw new Error(error.message)
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

        // Chequeamos que la caja esté abierta
        const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
        if (!turno) throw new Error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')

        const hoy = new Date()
        const payload = {
            alumno_id: usuarioId,
            compania_id: companiaId,
            mes: hoy.getMonth() + 1,
            anio: hoy.getFullYear(),
            monto: monto,
            metodo_pago: metodoPago,
            turno_caja_id: turno.id
        }

        const { error } = await supabase.from('companias_pagos').insert(payload)
        if (error) {
            if (error.code === '23505') throw new Error('Este alumno ya abonó la cuota de esta compañía este mes.')
            throw new Error(error.message)
        }

        revalidatePath('/usuarios')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}