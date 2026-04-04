// app/actions/liga.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function enviarAvisoAction(payload: any) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        const { error } = await supabase.from('liga_avisos').insert({ ...payload, autor_id: user.id })
        if (error) throw new Error(error.message)

        revalidatePath('/laliga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarAvisoAction(id: string) {
    const supabase = await createClient()
    try {
        const { error } = await supabase.from('liga_avisos').delete().eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/laliga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function guardarEvaluacionAction(payload: any) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        const { error } = await supabase.from('liga_evaluaciones').upsert({ ...payload, profesor_id: user.id }, { onConflict: 'alumno_id,clase_id,cuatrimestre' })
        if (error) throw new Error(error.message)

        revalidatePath('/laliga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cambiarNivelLigaAction(alumnoId: string, nuevoNivel: number | null) {
    const supabase = await createClient()
    try {
        const { error } = await supabase.from('profiles').update({ nivel_liga: nuevoNivel }).eq('id', alumnoId)
        if (error) throw new Error(error.message)

        revalidatePath('/laliga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}