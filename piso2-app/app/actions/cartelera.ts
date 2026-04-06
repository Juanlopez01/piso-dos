// app/actions/cartelera.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function inscribirAlumnoAction(claseId: string, tipoClaseBD: string, ritmoId?: string | null) {
    const supabase = await createClient()

    try {
        // 1. Validar sesión
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Sesión expirada. Por favor, reingresá.')

        // 2. Ejecutar la inscripción vía RPC (La base de datos maneja la lógica FIFO y los créditos)
        const { data: res, error: rpcError } = await supabase.rpc('inscribir_alumno_fifo', {
            p_user_id: user.id,
            p_clase_id: claseId,
            p_tipo_clase: tipoClaseBD
        })

        if (rpcError || !res.success) {
            throw new Error(res?.message || rpcError?.message || 'Error al procesar la reserva.')
        }

        // 3. Lógica de intereses (Ahora en el servidor, mucho más seguro)
        if (ritmoId) {
            const { data: profile } = await supabase.from('profiles').select('intereses_ritmos').eq('id', user.id).single()
            const interesesPrevios = profile?.intereses_ritmos || []

            if (!interesesPrevios.includes(ritmoId)) {
                await supabase.from('profiles').update({
                    intereses_ritmos: [...interesesPrevios, ritmoId]
                }).eq('id', user.id)
            }
        }

        // 4. Refrescar la caché de Next.js
        revalidatePath('/explorar')

        return { success: true, message: res.message }

    } catch (error: any) {
        return { success: false, error: error.message }
    }
}