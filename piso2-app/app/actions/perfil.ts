// app/actions/perfil.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function actualizarPerfilAction(payload: any) {
    const supabase = await createClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autorizado')

        const { error } = await supabase.from('profiles').update(payload).eq('id', user.id)
        if (error) throw new Error(error.message)

        revalidatePath('/perfil')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}