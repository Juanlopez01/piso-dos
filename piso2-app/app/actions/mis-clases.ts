// app/actions/mis-clases.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function cancelarReservaAction(inscripcionId: string, claseTipo: string) {
    const supabase = await createClient()

    // 1. Validamos sesión (rápido y seguro)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const userId = session.user.id;

    try {
        // 2. Verificamos que la inscripción exista y sea de este usuario
        const { data: inscripcion, error: errInsc } = await supabase
            .from('inscripciones')
            .select('id')
            .eq('id', inscripcionId)
            .eq('user_id', userId)
            .single()

        if (errInsc || !inscripcion) {
            throw new Error('Inscripción no encontrada o no te pertenece')
        }

        // 3. Borramos la inscripción
        const { error: errDelete } = await supabase
            .from('inscripciones')
            .delete()
            .eq('id', inscripcionId)

        if (errDelete) throw errDelete

        // 4. Devolvemos el crédito de forma segura en el backend
        const columnaCreditos = claseTipo === 'Especial' ? 'creditos_seminarios' : 'creditos_regulares'

        // Obtenemos el saldo actual
        const { data: profile } = await supabase.from('profiles').select(columnaCreditos).eq('id', userId).single()

        if (profile) {
            const saldoActual = Number(profile[columnaCreditos as keyof typeof profile] || 0)
            // Actualizamos sumando 1
            await supabase.from('profiles').update({ [columnaCreditos]: saldoActual + 1 }).eq('id', userId)
        }

        revalidatePath('/mis-clases')
        return { success: true }

    } catch (error: any) {
        console.error("Error en cancelarReservaAction:", error)
        return { success: false, error: error.message || 'Error al cancelar la reserva' }
    }
}