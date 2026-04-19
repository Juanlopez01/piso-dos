// app/actions/liga.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function enviarAvisoAction(payload: any) {
    const supabase = await createClient()
    try {
        // 🚀 BLINDAJE: getSession() en lugar de getUser()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('liga_avisos').insert({ ...payload, autor_id: session.user.id })
        if (error) throw new Error(error.message)

        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function eliminarAvisoAction(id: string) {
    const supabase = await createClient()
    try {
        // 🔒 SEGURIDAD: Chequeamos que haya una sesión activa antes de borrar
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('liga_avisos').delete().eq('id', id)
        if (error) throw new Error(error.message)

        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function guardarEvaluacionAction(payload: any) {
    const supabase = await createClient()
    try {
        // 🚀 BLINDAJE: getSession()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('liga_evaluaciones').upsert(
            // Nota: Si tu columna en la BDD se llama 'evaluador_id', cambialo acá. 
            { ...payload, profesor_id: session.user.id },
            { onConflict: 'alumno_id,clase_id,cuatrimestre' }
        )

        if (error) throw new Error(error.message)

        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function cambiarNivelLigaAction(alumnoId: string, nuevoNivel: number | null) {
    const supabase = await createClient()
    try {
        // 🔒 SEGURIDAD: Evita que cualquier alumno cambie niveles
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('profiles').update({ nivel_liga: nuevoNivel }).eq('id', alumnoId)
        if (error) throw new Error(error.message)

        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function actualizarPrecioGlobalAction(clave: string, nuevoValor: number) {
    const supabase = await createClient()
    const { error } = await supabase.from('configuraciones').upsert({ clave, valor: nuevoValor })
    if (error) return { success: false, error: error.message }
    revalidatePath('/usuarios')
    return { success: true }
}

export async function getPreciosLigaAction() {
    const supabase = await createClient()
    const { data } = await supabase.from('configuraciones').select('*')
    return data || []
}

export async function asignarBecaAction(usuarioId: string, porcentaje: number) {
    const supabase = await createClient()
    try {
        const { error } = await supabase.from('profiles').update({ porcentaje_beca: porcentaje }).eq('id', usuarioId)
        if (error) throw new Error(error.message)
        revalidatePath('/la-liga')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}