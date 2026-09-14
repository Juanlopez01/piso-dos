import type { Metadata } from 'next'
import { Ticket } from 'lucide-react'
import { getEventoPublicoAction } from '@/app/actions/eventos'
import EventoClient, { type Evento } from './EventoClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const ev = await getEventoPublicoAction(id).catch(() => null) as Evento | null
    if (!ev) return { title: 'Entradas · Piso 2 Multiespacio' }
    const desc = (ev.descripcion || 'Comprá tus entradas online.').slice(0, 160)
    return {
        title: `${ev.nombre} · Entradas · Piso 2`,
        description: desc,
        openGraph: {
            title: ev.nombre,
            description: desc,
            type: 'website',
            images: ev.flyer_url ? [ev.flyer_url] : [],
        },
    }
}

export default async function EventoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ promo?: string }> }) {
    const { id } = await params
    const { promo } = await searchParams
    const ev = await getEventoPublicoAction(id, promo || undefined).catch(() => null) as Evento | null

    if (!ev) return (
        <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-3 text-neutral-500 px-6 text-center">
            <Ticket size={34} className="opacity-40" />
            <p className="text-sm font-medium">Este evento no está disponible para compra online.</p>
        </div>
    )

    return <EventoClient ev={ev} />
}
