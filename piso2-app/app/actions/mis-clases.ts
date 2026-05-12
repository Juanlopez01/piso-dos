'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// 🚀 CLIENTE DIOS: Bypassea los escudos de seguridad (RLS)
// Necesitamos usar esto porque el alumno al cancelar modifica tablas que quizás 
// por RLS no tiene permiso de edición directa (como alumno_packs o perfiles de otros).
const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

export async function cancelarReservaAction(inscripcionId: string, claseTipo: string) {
    const supabase = await createClient()
    const supabaseAdmin = getAdminClient()

    // 1. Validamos sesión (rápido y seguro)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { success: false, error: 'No autorizado' }

    const userId = session.user.id;

    try {
        // 2. Traemos toda la info de la inscripción y la clase antes de borrarla
        const { data: inscripcionData, error: errInsc } = await supabaseAdmin
            .from('inscripciones')
            .select(`
                user_id,
                modalidad,
                clase:clases (
                    nombre,
                    tipo_clase,
                    es_combinable,
                    profesor:profiles!clases_profesor_id_fkey(nombre_completo)
                )
            `)
            .eq('id', inscripcionId)
            .eq('user_id', userId) // Verificamos que le pertenezca
            .single()

        if (errInsc || !inscripcionData) {
            throw new Error('Inscripción no encontrada o no te pertenece')
        }

        const inscripcion = inscripcionData as any;
        const claseInfo = Array.isArray(inscripcion.clase) ? inscripcion.clase[0] : inscripcion.clase;

        const tipoClaseStr = (claseInfo.tipo_clase || '').toLowerCase();
        const esExclusiva = claseInfo.es_combinable === false || tipoClaseStr === 'exclusivo';

        // 3. Borramos la inscripción
        const { error: errDelete } = await supabaseAdmin
            .from('inscripciones')
            .delete()
            .eq('id', inscripcionId)

        if (errDelete) throw new Error('Error al cancelar la reserva en la base de datos')

        // 4. Lógica de devolución de crédito
        // Solo devolvemos si la modalidad indica que se consumió un crédito/pack/pase
        if (inscripcion.modalidad === 'Crédito' || inscripcion.modalidad === 'Pack' || inscripcion.modalidad === 'Pase Exclusivo' || inscripcion.modalidad === 'Pase Exclusivo (Pack)') {

            if (esExclusiva) {
                // =================================================================
                // 🚀 DEVOLUCIÓN DE EXCLUSIVAS (Pases y Packs de exclusivas)
                // =================================================================
                const profeObj: any = claseInfo.profesor;
                const nombreProfe = Array.isArray(profeObj) ? profeObj[0]?.nombre_completo : (profeObj?.nombre_completo || 'Staff');
                const llavePase = `${claseInfo.nombre}-${nombreProfe}-${claseInfo.tipo_clase}`;

                // 4.1 Devolvemos 1 al contador de pases_exclusivos
                await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', {
                    p_usuario_id: userId,
                    p_referencia: llavePase,
                    p_cantidad: 1
                })

                // 4.2 LÓGICA DETECTIVE: Buscamos el pack que fue "tocado"
                const { data: packsExAlumno } = await supabaseAdmin.from('alumno_packs')
                    .select('id, creditos_restantes, cantidad_inicial')
                    .eq('user_id', userId)
                    .eq('tipo_clase', 'exclusivo')
                    .order('fecha_compra', { ascending: false });

                if (packsExAlumno && packsExAlumno.length > 0) {
                    const packAfectado = packsExAlumno.find(p => p.creditos_restantes < p.cantidad_inicial);

                    if (packAfectado) {
                        await supabaseAdmin.from('alumno_packs').update({
                            creditos_restantes: packAfectado.creditos_restantes + 1,
                            estado: 'activo'
                        }).eq('id', packAfectado.id);
                    }
                }

            } else {
                // =================================================================
                // 🚀 DEVOLUCIÓN DE REGULARES / ESPECIALES
                // =================================================================
                const isEspecial = tipoClaseStr === 'especial' || tipoClaseStr === 'seminario';
                const campoCredito = isEspecial ? 'creditos_especiales' : 'creditos_regulares';
                const tipoPack = isEspecial ? 'seminario' : 'regular';

                // 4.1 Devolvemos 1 crédito exacto a la tabla "profiles"
                const { data: profile } = await supabaseAdmin.from('profiles').select(campoCredito).eq('id', userId).single()

                if (profile) {
                    const saldoActual = Number(profile[campoCredito as keyof typeof profile] || 0)
                    await supabaseAdmin.from('profiles').update({ [campoCredito]: saldoActual + 1 }).eq('id', userId)
                }

                // 4.2 LÓGICA DETECTIVE: Buscamos el pack afectado
                const { data: packsAlumno } = await supabaseAdmin.from('alumno_packs')
                    .select('id, creditos_restantes, cantidad_inicial')
                    .eq('user_id', userId)
                    .eq('tipo_clase', tipoPack)
                    .order('fecha_compra', { ascending: false });

                if (packsAlumno && packsAlumno.length > 0) {
                    const packAfectado = packsAlumno.find(p => p.creditos_restantes < p.cantidad_inicial);

                    if (packAfectado) {
                        await supabaseAdmin.from('alumno_packs').update({
                            creditos_restantes: packAfectado.creditos_restantes + 1,
                            estado: 'activo' // Reactiva el pack si había quedado en 0
                        }).eq('id', packAfectado.id);
                    }
                }
            }
        }

        revalidatePath('/mis-clases')
        return { success: true }

    } catch (error: any) {
        console.error("Error en cancelarReservaAction:", error)
        return { success: false, error: error.message || 'Error al cancelar la reserva' }
    }
}