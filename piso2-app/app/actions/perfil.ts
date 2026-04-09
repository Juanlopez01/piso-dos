// app/actions/perfil.ts
'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { revalidatePath } from 'next/cache'

export async function actualizarPerfilAction(payload: any) {
    const supabase = await createClient()
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('No autorizado')

        const { error } = await supabase.from('profiles').update(payload).eq('id', session.user.id)
        if (error) throw new Error(error.message)

        revalidatePath('/perfil')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function obtenerDatosPerfilAction() {
    const supabase = await createClient()

    // 1. Limpieza con AWAIT para que Next.js no congele el proceso
    const { error: rpcError } = await supabase.rpc('limpiar_creditos_vencidos')
    if (rpcError) console.error("Error limpiando créditos:", rpcError)

    // 2. Buscamos el usuario
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) throw new Error("NO_AUTH")

    const user = session.user

    // 3. Cargamos el perfil
    const { data: dataProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*, creditos_regulares, creditos_seminarios')
        .eq('id', user.id)
        .single()

    if (profileError || !dataProfile) throw new Error("PERFIL_NOT_FOUND")

    let historial: any[] = []
    let avisosData: any[] = []
    let proximoVencimiento = null

    // 4. Cargar dependencias según ROL
    if (dataProfile.rol === 'profesor') {
        const { data: dataAvisos } = await supabase.from('comunicados').select('*').order('created_at', { ascending: false })
        avisosData = dataAvisos || []
    } else {
        const { data: dataHistorial } = await supabase
            .from('inscripciones')
            // CORRECCIÓN: Usamos la misma foreign key exacta que en la cartelera
            .select('id, presente, clase:clases(nombre, inicio, tipo_clase, profesor:profiles!clases_profesor_id_fkey(nombre_completo))')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20)

        historial = dataHistorial?.filter((h: any) => h.clase !== null) || []

        const hoyIso = new Date().toISOString()
        const { data: dataPacks } = await supabase
            .from('alumno_packs')
            .select('fecha_vencimiento, creditos_restantes, tipo_clase')
            .eq('user_id', user.id)
            .eq('estado', 'activo')
            .gt('creditos_restantes', 0)
            .gt('fecha_vencimiento', hoyIso)
            .order('fecha_vencimiento', { ascending: true })
            .limit(1)

        if (dataPacks && dataPacks.length > 0) proximoVencimiento = dataPacks[0]
    }

    // Devolvemos el paquete armado
    return {
        profile: dataProfile,
        email: user.email,
        historialClases: historial,
        avisos: avisosData,
        proximoVencimiento
    }
}