'use server'

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// 🚀 CLIENTE DIOS: Bypassea los escudos de seguridad (RLS) para poder descontar packs
const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

export async function inscribirAlumnoAction(claseId: string, tipoClase: string, paseReferencia: string) {
    const supabase = await createClient()
    const supabaseAdmin = getAdminClient()

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return { success: false, error: 'No estás autenticado.' }
        const uid = session.user.id;

        const { data: yaInscripto } = await supabaseAdmin.from('inscripciones')
            .select('id').eq('clase_id', claseId).eq('user_id', uid).maybeSingle();

        if (yaInscripto) return { success: false, error: 'Ya estás inscripto en esta clase.' };

        const { data: clase } = await supabaseAdmin.from('clases')
            .select('es_combinable, tipo_clase').eq('id', claseId).single();

        if (!clase) return { success: false, error: 'Clase no encontrada.' };

        const esCombinable = clase.es_combinable;
        const isEspecial = clase.tipo_clase.toLowerCase() === 'seminario' || clase.tipo_clase.toLowerCase() === 'especial';
        const tipoPackBusqueda = isEspecial ? 'seminario' : 'regular';

        let packUsadoId = null;
        let valorInscripcion = 0;
        let modalidadInsc = 'Crédito';
        // 🎯 DECLARACIÓN ÚNICA DE LA VARIABLE
        let metodoPagoFinal = 'credito';

        if (!esCombinable) {
            modalidadInsc = 'Pase Exclusivo';

            const { data: miPase } = await supabaseAdmin.from('pases_exclusivos')
                .select('*').eq('usuario_id', uid).eq('pase_referencia', paseReferencia).single();

            if (!miPase || miPase.cantidad < 1) return { success: false, error: 'No tenés pases exclusivos para esta clase.' };

            const { data: packActivo } = await supabaseAdmin.from('alumno_packs')
                .select('id, creditos_restantes, cantidad_inicial, monto_abonado, metodo_pago')
                .eq('user_id', uid)
                .eq('tipo_clase', 'exclusivo')
                .gt('creditos_restantes', 0)
                .order('fecha_compra', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (packActivo && packActivo.cantidad_inicial > 0) {
                packUsadoId = packActivo.id;
                valorInscripcion = Math.round(packActivo.monto_abonado / packActivo.cantidad_inicial);
                // 🎯 ACTUALIZACIÓN DE LA VARIABLE
                metodoPagoFinal = packActivo.metodo_pago || 'credito';

                await supabaseAdmin.from('alumno_packs').update({
                    creditos_restantes: packActivo.creditos_restantes - 1,
                    estado: (packActivo.creditos_restantes - 1) === 0 ? 'agotado' : 'activo'
                }).eq('id', packActivo.id);
            }
            await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', { p_usuario_id: uid, p_referencia: paseReferencia, p_cantidad: -1 });

        } else {
            const campoCredito = isEspecial ? 'creditos_especiales' : 'creditos_regulares';

            const { data: perfil } = await supabaseAdmin.from('profiles').select(campoCredito).eq('id', uid).single();
            if (!perfil || (perfil as any)[campoCredito] < 1) return { success: false, error: 'No tenés créditos suficientes.' };

            const { data: packActivo } = await supabaseAdmin.from('alumno_packs')
                .select('id, creditos_restantes, cantidad_inicial, monto_abonado, metodo_pago')
                .eq('user_id', uid)
                .eq('tipo_clase', tipoPackBusqueda)
                .gt('creditos_restantes', 0)
                .order('fecha_compra', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (packActivo && packActivo.cantidad_inicial > 0) {
                packUsadoId = packActivo.id;
                valorInscripcion = Math.round(packActivo.monto_abonado / packActivo.cantidad_inicial);
                // 🎯 ACTUALIZACIÓN DE LA VARIABLE
                metodoPagoFinal = packActivo.metodo_pago || 'credito';

                await supabaseAdmin.from('alumno_packs').update({
                    creditos_restantes: packActivo.creditos_restantes - 1,
                    estado: (packActivo.creditos_restantes - 1) === 0 ? 'agotado' : 'activo'
                }).eq('id', packActivo.id);
            }

            await supabaseAdmin.from('profiles').update({ [campoCredito]: (perfil as any)[campoCredito] - 1 }).eq('id', uid);
        }

        // 5. INSERTAMOS LA INSCRIPCIÓN CON EL MÉTODO REAL
        const { error: errInsc } = await supabaseAdmin.from('inscripciones').insert({
            user_id: uid,
            clase_id: claseId,
            pack_usado_id: packUsadoId,
            modalidad: modalidadInsc,
            valor_credito: valorInscripcion,
            metodo_pago: metodoPagoFinal, // 🎯 AHORA TOMA EL VALOR CORRECTO
            presente: false,
            estado_asistencia: 'ausente'
        });

        if (errInsc) throw new Error(errInsc.message);

        return { success: true, message: '¡Te has inscripto correctamente!' };

    } catch (error: any) {
        console.error("Error al inscribir alumno desde su celular:", error);
        return { success: false, error: error.message || 'Hubo un error al procesar tu reserva.' }
    }
}