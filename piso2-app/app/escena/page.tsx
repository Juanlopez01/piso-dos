import type { Metadata } from 'next'
import { getCarteleraEscenaAction } from '@/app/actions/eventos'
import { getCiclosActivosAction } from '@/app/actions/convocatoria'
import EscenaClient from './EscenaClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Piso 2 Escena · Muestras, obras y espectáculos',
    description: 'La cartelera de escena de Piso 2 Multiespacio: muestras, obras y espectáculos. Conseguí tus entradas online.',
    openGraph: {
        title: 'Piso 2 Escena',
        description: 'Muestras, obras y espectáculos en Piso 2 Multiespacio.',
        type: 'website',
    },
}

export default async function EscenaPage() {
    const [cart, ciclos] = await Promise.all([
        getCarteleraEscenaAction().then(r => r.cards).catch(() => []),
        getCiclosActivosAction().then(r => r || []).catch(() => []),
    ])
    return <EscenaClient carteleraIniciales={cart} convocatoriasIniciales={ciclos} />
}
