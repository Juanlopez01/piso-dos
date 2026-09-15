// ============================================================================
// Sincroniza el contador de créditos del perfil con la VERDAD (los packs).
//
// El contador profiles.creditos_regulares/especiales es un valor denormalizado
// que antes dependía de sumas/restas manuales en ~15 lugares y del resync
// nocturno → driftaba. Este helper recalcula el contador de UN usuario desde
// sus packs activos y se llama al final de cada operación que toca un pack
// (compra, consumo, refund, vencimiento), así queda correcto al instante.
//
// Misma regla que el resync (resync_creditos_vencidos): regular = packs
// tipo 'regular' (o sin tipo); especial = packs 'seminario'; los exclusivos NO
// cuentan acá (van por pases_exclusivos). Best-effort: nunca lanza.
//
// Nota: los créditos cargados a mano sin pack (ajustarCreditosAction) no se
// reflejan acá — igual que con el resync nocturno, la fuente de verdad son los
// packs.
// ============================================================================

type AdminClient = any

export async function sincronizarCreditosDePacks(admin: AdminClient, userId: string | null | undefined): Promise<void> {
    try {
        if (!userId) return
        const { data: packs } = await admin
            .from('alumno_packs')
            .select('tipo_clase, creditos_restantes')
            .eq('user_id', userId)
            .eq('estado', 'activo')
            .gt('creditos_restantes', 0)

        let regulares = 0
        let especiales = 0
        for (const p of (packs || []) as any[]) {
            const tipo = p.tipo_clase || 'regular'
            const n = Number(p.creditos_restantes) || 0
            if (tipo === 'seminario') especiales += n
            else if (tipo === 'regular') regulares += n
            // 'exclusivo' u otros → no cuentan en estos contadores
        }

        await admin.from('profiles')
            .update({ creditos_regulares: regulares, creditos_especiales: especiales })
            .eq('id', userId)
    } catch (e) {
        console.error('sincronizarCreditosDePacks:', e)
    }
}
