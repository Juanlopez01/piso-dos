// Helper compartido: devuelve 1 crédito por una inscripción, con el MISMO
// criterio que eliminarInscripcionAction (regulares/especiales al perfil +
// reintegro al pack usado, o pase exclusivo vía RPC).
//
// NO borra la inscripción ni valida permisos: solo reintegra el crédito.
// Lo usan eliminarInscripcionAction (cancelación individual) y
// cancelarClaseAction (cancelación de una clase/serie entera).
//
// Ojo: este archivo NO lleva 'use server' a propósito — no es una server
// action, es una utilidad interna que recibe el cliente admin por parámetro.
import type { SupabaseClient } from '@supabase/supabase-js'

export const MODALIDADES_CON_CREDITO = ['Crédito', 'Pack', 'Pase Exclusivo', 'Pase Exclusivo (Pack)']

type ClaseInfo = {
    nombre?: string | null
    tipo_clase?: string | null
    es_combinable?: boolean | null
    profesor?: any
} | null

type InscParaRefund = {
    user_id: string | null
    modalidad: string | null
    pack_usado_id: string | null
    claseInfo: ClaseInfo
}

export async function devolverCreditoDeInscripcion(admin: SupabaseClient, insc: InscParaRefund) {
    // Solo devolvemos crédito a las modalidades que consumen crédito.
    if (!insc.user_id || !insc.modalidad || !MODALIDADES_CON_CREDITO.includes(insc.modalidad)) return

    const claseInfo: any = insc.claseInfo || {}
    const tipoClaseStr = (claseInfo.tipo_clase || '').toLowerCase()
    const esExclusiva = claseInfo.es_combinable === false || tipoClaseStr === 'exclusivo'

    if (esExclusiva) {
        // ===== Devolución de EXCLUSIVAS =====
        const profeObj: any = claseInfo.profesor
        const nombreProfe = Array.isArray(profeObj) ? profeObj[0]?.nombre_completo : (profeObj?.nombre_completo || 'Staff')
        // La referencia REAL sale del producto del pack usado (reconstruirla desde
        // el nombre de la clase falla si la clase se renombró después de la compra).
        let llavePase = `${claseInfo.nombre}-${nombreProfe}-${claseInfo.tipo_clase}` // fallback
        let packRefilleado = false

        if (insc.pack_usado_id) {
            const { data: pk } = await admin.from('alumno_packs')
                .select('id, creditos_restantes, producto:productos(pase_referencia)')
                .eq('id', insc.pack_usado_id)
                .maybeSingle()
            if (pk) {
                const prod: any = Array.isArray(pk.producto) ? pk.producto[0] : pk.producto
                if (prod?.pase_referencia) llavePase = prod.pase_referencia
                await admin.from('alumno_packs').update({
                    creditos_restantes: (pk.creditos_restantes || 0) + 1,
                    estado: 'activo'
                }).eq('id', pk.id)
                packRefilleado = true
            }
        }

        await admin.rpc('cargar_pase_exclusivo_manual', {
            p_usuario_id: insc.user_id,
            p_referencia: llavePase,
            p_cantidad: 1
        })

        if (!packRefilleado) {
            const { data: packsExAlumno } = await admin.from('alumno_packs')
                .select('id, creditos_restantes, cantidad_inicial')
                .eq('user_id', insc.user_id)
                .eq('tipo_clase', 'exclusivo')
                .order('fecha_compra', { ascending: false })
            if (packsExAlumno && packsExAlumno.length > 0) {
                const packAfectado = packsExAlumno.find(p => p.creditos_restantes < p.cantidad_inicial)
                if (packAfectado) {
                    await admin.from('alumno_packs').update({
                        creditos_restantes: packAfectado.creditos_restantes + 1,
                        estado: 'activo'
                    }).eq('id', packAfectado.id)
                }
            }
        }
    } else {
        // ===== Devolución de REGULARES / ESPECIALES =====
        const isEspecial = tipoClaseStr === 'especial' || tipoClaseStr === 'seminario'
        const campoCredito = isEspecial ? 'creditos_especiales' : 'creditos_regulares'
        const tipoPack = isEspecial ? 'seminario' : 'regular'

        const { data: perfil } = await admin.from('profiles').select(campoCredito).eq('id', insc.user_id).single()
        if (perfil) {
            await admin.from('profiles').update({
                [campoCredito]: ((perfil as any)[campoCredito] || 0) + 1
            }).eq('id', insc.user_id)
        }

        const { data: packsAlumno } = await admin.from('alumno_packs')
            .select('id, creditos_restantes, cantidad_inicial')
            .eq('user_id', insc.user_id)
            .eq('tipo_clase', tipoPack)
            .order('fecha_compra', { ascending: false })
        if (packsAlumno && packsAlumno.length > 0) {
            const packAfectado = packsAlumno.find(p => p.creditos_restantes < p.cantidad_inicial)
            if (packAfectado) {
                await admin.from('alumno_packs').update({
                    creditos_restantes: packAfectado.creditos_restantes + 1,
                    estado: 'activo'
                }).eq('id', packAfectado.id)
            }
        }
    }
}
