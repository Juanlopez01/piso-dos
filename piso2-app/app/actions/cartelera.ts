'use server'

import { createClient } from '@/utils/supabase/server-helper'

export async function inscribirAlumnoAction(claseId: string, tipoClase: string, paseReferencia: string) {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No estás autenticado.' }

    // Compatibilidad: Si dice 'seminario' o 'Especial', lo tratamos como especial
    const esEspecial = tipoClase.toLowerCase() === 'seminario' || tipoClase.toLowerCase() === 'especial';

    // 🚀 Llamamos al Cerebro SQL con la llave exacta (ej: "Hip Hop-Juan-Especial")
    const { data, error } = await supabase.rpc('procesar_inscripcion_inteligente', {
        p_usuario_id: session.user.id,
        p_clase_id: claseId,
        p_pase_referencia: paseReferencia,
        p_es_especial: esEspecial
    })

    if (error) {
        console.error("Error al inscribir:", error);
        return { success: false, error: 'Hubo un error al procesar tu reserva.' }
    }

    return data;
}