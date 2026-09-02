import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getCiclosActivosAction } from '@/app/actions/convocatoria'
import ConvocatoriaForm from './ConvocatoriaForm'

export const dynamic = 'force-dynamic'

export default async function ConvocatoriaPage() {
    const ciclos = await getCiclosActivosAction()

    return (
        <div>
            {ciclos.length > 0 && (
                <div className="bg-neutral-50 text-neutral-900">
                    <div className="max-w-lg mx-auto px-5 pt-8">
                        <div className="rounded-xl border border-neutral-200 bg-white p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-2">Convocatorias abiertas</p>
                            <div className="space-y-2">
                                {ciclos.map((c: any) => (
                                    <Link key={c.id} href={`/convocatoria/${c.slug}`} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 hover:border-black transition-colors group">
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm truncate">{c.titulo}</p>
                                            {c.fecha_limite && <p className="text-[11px] text-neutral-500">Hasta el {new Date(c.fecha_limite + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })}</p>}
                                        </div>
                                        <ArrowRight size={16} className="text-neutral-400 group-hover:text-black shrink-0" />
                                    </Link>
                                ))}
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-3">O usá el formulario general de abajo.</p>
                        </div>
                    </div>
                </div>
            )}
            <ConvocatoriaForm />
        </div>
    )
}
