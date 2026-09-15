// ============================================================================
// Auto-inscripción a clases especiales al comprar/cargar el pack.
//
// Si el producto tiene clase_id vinculada, al comprar el pack se inscribe al
// alumno automáticamente a esa clase (y a las demás de su serie en el mismo
// mes). Solo lo hace si créditos del pack == cantidad de clases objetivo.
//
// Es best-effort: NUNCA lanza. Lo llaman el webhook de MercadoPago (compra
// online) y la carga manual de packs en recepción. Recibe un admin client
// (service-role) ya creado por el llamador.
// ============================================================================

import { sincronizarCreditosDePacks } from './_creditos'

type AdminClient = any

export async function autoInscribirEspecial(
    admin: AdminClient,
    params: { userId: string; productoId: string | null; packId: string | null; montoAbonado: number; metodoPago: string }
): Promise<{ inscritas: number } | null> {
    const { userId, productoId, packId, montoAbonado, metodoPago } = params
    try {
        if (!userId || !productoId) return null

        const { data: prod } = await admin
            .from('productos')
            .select('clase_id, creditos, tipo_clase')
            .eq('id', productoId)
            .single()
        if (!prod?.clase_id) return null // producto sin vínculo → no hacemos nada

        const { data: claseVinc } = await admin
            .from('clases')
            .select('id, serie_id, inicio, cancelada, nombre, profesor_id')
            .eq('id', prod.clase_id)
            .single()
        if (!claseVinc) return null

        // Clases objetivo = TODAS las clases de esa clase especial dentro del mes
        // de la clase vinculada. Se agrupan por serie_id si la tienen; si no
        // (fechas sueltas sin serie), por mismo nombre + profesor, que es como el
        // resto del sistema agrupa las clases repetidas del mismo dictado.
        const f = new Date(claseVinc.inicio)
        const ini = new Date(f.getFullYear(), f.getMonth(), 1).toISOString()
        const fin = new Date(f.getFullYear(), f.getMonth() + 1, 0, 23, 59, 59).toISOString()

        let q = admin
            .from('clases')
            .select('id')
            .neq('cancelada', true)
            .gte('inicio', ini)
            .lte('inicio', fin)
            .order('inicio', { ascending: true })
        if (claseVinc.serie_id) {
            q = q.eq('serie_id', claseVinc.serie_id)
        } else {
            q = q.eq('nombre', claseVinc.nombre)
            if (claseVinc.profesor_id) q = q.eq('profesor_id', claseVinc.profesor_id)
        }
        const { data: clasesMes } = await q
        const objetivo: { id: string }[] = clasesMes || []
        if (!objetivo.length) return null

        // Regla de Santi: solo auto-inscribir si los créditos coinciden con la
        // cantidad de clases. Si no, no tocamos nada (queda para reserva manual).
        const creditos = Number(prod.creditos) || 0
        if (creditos !== objetivo.length) return null

        // No re-inscribir donde ya esté anotado.
        const ids = objetivo.map(c => c.id)
        const { data: yaInsc } = await admin
            .from('inscripciones')
            .select('clase_id')
            .eq('user_id', userId)
            .in('clase_id', ids)
        const existentes = new Set((yaInsc || []).map((i: any) => i.clase_id))
        const aInscribir = objetivo.filter(c => !existentes.has(c.id))
        if (!aInscribir.length) return { inscritas: 0 }

        const valorPorClase = creditos > 0 ? Math.round((montoAbonado || 0) / creditos) : 0
        const filas = aInscribir.map(c => ({
            user_id: userId,
            clase_id: c.id,
            pack_usado_id: packId || null,
            modalidad: 'Pack',
            valor_credito: valorPorClase,
            metodo_pago: metodoPago || 'mercadopago',
            presente: false,
        }))
        const { error: errInsc } = await admin.from('inscripciones').insert(filas)
        if (errInsc) { console.error('autoInscribirEspecial insert:', errInsc.message); return null }

        // Consumir los créditos usados: el pack queda agotado y el contador del
        // perfil se reconcilia con los packs (fuente de verdad).
        if (packId) {
            await admin.from('alumno_packs').update({ creditos_restantes: 0, estado: 'agotado' }).eq('id', packId)
        }
        await sincronizarCreditosDePacks(admin, userId)

        return { inscritas: aInscribir.length }
    } catch (e) {
        console.error('autoInscribirEspecial:', e)
        return null
    }
}
