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

        // 1. Verificamos que no esté inscripto ya
        const { data: yaInscripto } = await supabaseAdmin.from('inscripciones')
            .select('id').eq('clase_id', claseId).eq('user_id', uid).maybeSingle();

        if (yaInscripto) return { success: false, error: 'Ya estás inscripto en esta clase.' };

        // 2. Traemos la info de la clase para saber qué tipo de crédito descontar
        const { data: clase } = await supabaseAdmin.from('clases')
            .select('es_combinable, tipo_clase').eq('id', claseId).single();

        if (!clase) return { success: false, error: 'Clase no encontrada.' };

        const esCombinable = clase.es_combinable;
        const isEspecial = clase.tipo_clase.toLowerCase() === 'seminario' || clase.tipo_clase.toLowerCase() === 'especial';
        const tipoPackBusqueda = isEspecial ? 'seminario' : 'regular';

        let packUsadoId = null;
        let valorInscripcion = 0;
        let modalidadInsc = 'Crédito';

        // 3. LÓGICA DE PASE EXCLUSIVO (Clases no combinables)
        if (!esCombinable) {
            modalidadInsc = 'Pase Exclusivo';

            // Chequeamos si tiene el pase específico
            const { data: miPase } = await supabaseAdmin.from('pases_exclusivos')
                .select('*').eq('usuario_id', uid).eq('pase_referencia', paseReferencia).single();

            if (!miPase || miPase.cantidad < 1) return { success: false, error: 'No tenés pases exclusivos para esta clase.' };

            // 🚀 RASTREO DEL PACK (Igual que la recep)
            const { data: packActivo } = await supabaseAdmin.from('alumno_packs')
                .select('*').eq('user_id', uid).eq('tipo_clase', 'exclusivo').gt('creditos_restantes', 0)
                .order('fecha_compra', { ascending: true }).limit(1).maybeSingle();

            if (packActivo && packActivo.cantidad_inicial > 0) {
                packUsadoId = packActivo.id;
                valorInscripcion = Math.round(packActivo.monto_abonado / packActivo.cantidad_inicial);
                const nuevosRestantes = packActivo.creditos_restantes - 1;
                await supabaseAdmin.from('alumno_packs').update({
                    creditos_restantes: nuevosRestantes,
                    estado: nuevosRestantes === 0 ? 'agotado' : 'activo'
                }).eq('id', packActivo.id);
            }

            // Descontamos el pase
            await supabaseAdmin.rpc('cargar_pase_exclusivo_manual', { p_usuario_id: uid, p_referencia: paseReferencia, p_cantidad: -1 });

        }
        // 4. LÓGICA DE CRÉDITO REGULAR / ESPECIAL
        else {
            const campoCredito = isEspecial ? 'creditos_especiales' : 'creditos_regulares';

            // Chequeamos si tiene saldo en el perfil
            const { data: perfil } = await supabaseAdmin.from('profiles').select(campoCredito).eq('id', uid).single();
            if (!perfil || (perfil as any)[campoCredito] < 1) return { success: false, error: 'No tenés créditos suficientes.' };

            // 🚀 RASTREO DEL PACK (Igual que la recep)
            const { data: packActivo } = await supabaseAdmin.from('alumno_packs')
                .select('*').eq('user_id', uid).eq('tipo_clase', tipoPackBusqueda).gt('creditos_restantes', 0)
                .order('fecha_compra', { ascending: true }).limit(1).maybeSingle();

            if (packActivo && packActivo.cantidad_inicial > 0) {
                packUsadoId = packActivo.id;
                valorInscripcion = Math.round(packActivo.monto_abonado / packActivo.cantidad_inicial);
                const nuevosRestantes = packActivo.creditos_restantes - 1;
                await supabaseAdmin.from('alumno_packs').update({
                    creditos_restantes: nuevosRestantes,
                    estado: nuevosRestantes === 0 ? 'agotado' : 'activo'
                }).eq('id', packActivo.id);
            }

            // Descontamos el crédito del perfil
            await supabaseAdmin.from('profiles').update({ [campoCredito]: (perfil as any)[campoCredito] - 1 }).eq('id', uid);
        }

        // 5. INSERTAMOS LA INSCRIPCIÓN CON EL PRECIO Y EL ID DEL PACK REALES
        const { error: errInsc } = await supabaseAdmin.from('inscripciones').insert({
            user_id: uid,
            clase_id: claseId,
            pack_usado_id: packUsadoId, // 🚀 ACÁ QUEDA REGISTRADO EL VÍNCULO PARA SIEMPRE
            modalidad: modalidadInsc,
            valor_credito: valorInscripcion, // 🚀 ACÁ QUEDA EL VALOR EXACTO PARA LIQUIDAR AL PROFE
            metodo_pago: 'credito',
            presente: false,
            estado_asistencia: 'ausente' // Como lo anota por su cuenta, arranca como ausente hasta que dé el presente
        });

        if (errInsc) throw new Error(errInsc.message);

        return { success: true };

    } catch (error: any) {
        console.error("Error al inscribir alumno desde su celular:", error);
        return { success: false, error: error.message || 'Hubo un error al procesar tu reserva.' }
    }
}