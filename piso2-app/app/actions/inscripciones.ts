'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function toggleAsistenciaAction(inscripcionId: string, presente: boolean) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { error } = await supabase.from('inscripciones').update({ presente }).eq('id', inscripcionId)
    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function eliminarInscripcionAction(inscripcionId: string) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { data: res, error } = await supabase.rpc('reembolsar_inscripcion', { p_inscripcion_id: inscripcionId })
    if (error || !res?.success) return { success: false, error: res?.message || error?.message || 'Error al procesar baja' }
    return { success: true }
}

export async function procesarInscripcionAction(payload: any) {
    const supabase = await createClient()

    // 🚀 BLINDAJE: Usamos getSession para evitar bloqueos
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'Sesión expirada' }

    let turnoId = null

    // 💡 MAGIA: Si hay que cobrar algo, el servidor busca automáticamente la caja abierta del usuario
    // Así le sacamos toda esa responsabilidad y consultas extra a la pantalla del cliente.
    if (payload.p_monto_caja > 0) {
        const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', session.user.id).eq('estado', 'abierta').maybeSingle()
        if (turno) turnoId = turno.id
        else if (payload.p_metodo_pago === 'efectivo') return { success: false, error: 'Debes abrir caja para cobrar en efectivo' }
    }

    const { data: res, error } = await supabase.rpc('procesar_inscripcion_recepcion', {
        ...payload,
        p_turno_caja_id: turnoId // Inyectamos el turno validado por el servidor
    })

    if (error || !res?.success) return { success: false, error: res?.message || error?.message || 'Error en la transacción' }
    return { success: true }
}

export async function enviarNotificacionClaseAction(notificaciones: any[]) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const { error } = await supabase.from('notificaciones').insert(notificaciones)
    if (error) return { success: false, error: error.message }
    return { success: true }
}