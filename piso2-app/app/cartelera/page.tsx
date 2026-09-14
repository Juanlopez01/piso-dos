import type { Metadata } from 'next'
import { getClasesPublicasAction } from '@/app/actions/cartelera'
import CarteleraClient from './CarteleraClient'

// Renderizado en el servidor: Google ve las clases en el HTML y el primer
// pintado no espera al fetch del navegador. Datos frescos en cada request.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Cartelera de Clases · Piso 2 Multiespacio',
    description: 'Todas las clases, formaciones e intensivos de Piso 2 Multiespacio. Mirá horarios, profesores y reservá tu lugar.',
    openGraph: {
        title: 'Cartelera de Clases · Piso 2 Multiespacio',
        description: 'Todas las clases, formaciones e intensivos de Piso 2 Multiespacio.',
        type: 'website',
    },
}

export default async function CarteleraPage() {
    const grupos = await getClasesPublicasAction().catch(() => [])
    return <CarteleraClient gruposIniciales={grupos} />
}
