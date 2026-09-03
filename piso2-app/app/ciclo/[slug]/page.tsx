import Link from 'next/link'
import { CalendarDays, MapPin, Ticket, ArrowRight } from 'lucide-react'
import { getCicloPublicoAction } from '@/app/actions/eventos'

export const dynamic = 'force-dynamic'

const fmtFecha = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
    : 'Fecha a confirmar'

export default async function CicloPublicoPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const ciclo = await getCicloPublicoAction(slug)

    if (!ciclo) return (
        <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-3 text-neutral-500 px-6 text-center">
            <Ticket size={34} className="opacity-40" />
            <p className="text-sm font-medium">Este ciclo no está disponible.</p>
        </div>
    )

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900">
            <div className="bg-black text-white py-3 text-center">
                <span className="font-black tracking-tighter text-lg">PISO<span className="text-[#D4E655]">2</span></span>
            </div>

            <div className="max-w-lg mx-auto px-5 py-8">
                {ciclo.flyer_url && (
                    <img src={ciclo.flyer_url} alt="" className="w-full rounded-xl mb-5 object-cover" />
                )}
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-2"><Ticket size={13} /> Elegí tu función</div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">{ciclo.nombre}</h1>
                {ciclo.descripcion && <p className="text-sm text-neutral-600 leading-relaxed mt-3 whitespace-pre-line">{ciclo.descripcion}</p>}

                <div className="mt-6 space-y-2.5">
                    {ciclo.fechas.length === 0 && <p className="text-sm text-neutral-400">Todavía no hay fechas disponibles. ¡Volvé pronto!</p>}
                    {ciclo.fechas.map((f: any) => {
                        const noDisponible = f.agotado || !f.comprable
                        return (
                            <div key={f.id} className={`bg-white border rounded-xl p-4 flex items-center gap-3 ${noDisponible ? 'border-neutral-200 opacity-60' : 'border-neutral-200'}`}>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm capitalize flex items-center gap-1.5"><CalendarDays size={14} /> {fmtFecha(f.fecha)}</p>
                                    {f.lugar && <p className="text-xs text-neutral-500 flex items-center gap-1.5 mt-0.5"><MapPin size={13} /> {f.lugar}</p>}
                                </div>
                                {f.agotado
                                    ? <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400 shrink-0">Agotada</span>
                                    : f.comprable
                                        ? <Link href={`/evento/${f.id}`} className="flex items-center gap-1.5 bg-neutral-900 text-white text-[11px] font-bold uppercase tracking-wide px-4 py-2.5 rounded-lg hover:bg-black shrink-0">Comprar <ArrowRight size={14} /></Link>
                                        : <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400 shrink-0">Próximamente</span>}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
