import type { Metadata } from 'next'
import { getCarteleraEscenaAction } from '@/app/actions/eventos'
import { getLanzamientoActivoAction } from '@/app/actions/liga2027'
import LandingClient from './LandingClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Piso 2 Multiespacio · Danza, Escena y Estudio',
  description: 'Piso 2 Multiespacio: clases de danza, sala de escena para muestras y obras, y estudio de grabación. Mirá la cartelera y sumate.',
  openGraph: {
    title: 'Piso 2 Multiespacio',
    description: 'Danza, escena y estudio. Mirá la cartelera y sumate.',
    type: 'website',
  },
}

export default async function LandingPage() {
  const cartelera = await getCarteleraEscenaAction().then(r => r.cards).catch(() => [])
  const ligaLanz = await getLanzamientoActivoAction().catch(() => null)
  return <LandingClient carteleraIniciales={cartelera} ligaLanzamiento={ligaLanz} />
}
