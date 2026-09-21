// ============================================================================
// CRM del asistente — vocabulario y helpers compartidos (cliente + server).
// NO lleva 'use server': exporta constantes y funciones puras.
// El embudo/productos replican el Excel que usaba recepción.
// ============================================================================

export type EtapaId = 'nuevo' | 'contactado' | 'seguimiento' | 'ganado' | 'perdido' | 'area_artistica' | 'en_verano'

export const CRM_ETAPAS: { id: EtapaId; label: string; color: string; abierta: boolean }[] = [
    { id: 'nuevo', label: 'Nuevo', color: 'sky', abierta: true },
    { id: 'contactado', label: 'Contactado', color: 'indigo', abierta: true },
    { id: 'seguimiento', label: 'En seguimiento', color: 'amber', abierta: true },
    { id: 'ganado', label: 'Ganado', color: 'emerald', abierta: false },
    { id: 'perdido', label: 'Perdido', color: 'rose', abierta: false },
    { id: 'area_artistica', label: 'Área artística', color: 'purple', abierta: true },
    { id: 'en_verano', label: 'Contactar en verano', color: 'cyan', abierta: false },
]

export const etapaInfo = (id: string) => CRM_ETAPAS.find(e => e.id === id) || CRM_ETAPAS[0]

export const CRM_PRODUCTOS = [
    'Clases regulares', 'Alquiler salas', 'Clase especial', 'Clases NG',
    'La Liga', 'IA', 'Compañías / Grupos', 'Formaciones', 'Otro',
]

// Alerta de seguimiento: solo para etapas ABIERTAS. Cuanto más días sin contacto,
// más urgente. Las etapas cerradas (ganado/perdido/verano) nunca alertan.
export type Alerta = { nivel: 'ok' | 'seguir' | 'urgente'; dias: number }
export function calcAlerta(ultimoContactoISO: string | null | undefined, etapa: string): Alerta {
    const info = etapaInfo(etapa)
    const dias = ultimoContactoISO ? Math.floor((Date.now() - new Date(ultimoContactoISO).getTime()) / 86400_000) : 0
    if (!info.abierta) return { nivel: 'ok', dias }
    if (dias >= 7) return { nivel: 'urgente', dias }
    if (dias >= 3) return { nivel: 'seguir', dias }
    return { nivel: 'ok', dias }
}
