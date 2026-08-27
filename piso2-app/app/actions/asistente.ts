'use server'

// Server action del panel interno de prueba (/asistente-test). Pide sesión de
// staff y delega en el núcleo compartido (app/actions/_asistente-core.ts), que
// es el mismo que usa la API pública /api/asistente.

import { createClient } from '@/utils/supabase/server-helper'
import { responderAsistente } from './_asistente-core'

export async function preguntarAsistenteAction(pregunta: string): Promise<{ ok: boolean; respuesta?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }

    try {
        const r = await responderAsistente(pregunta)
        return { ok: true, respuesta: r.respuesta }
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Error del asistente' }
    }
}
