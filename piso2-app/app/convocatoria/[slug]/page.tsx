import { Theater } from 'lucide-react'
import { getConvocatoriaBySlugAction } from '@/app/actions/convocatoria'
import ConvocatoriaForm from '../ConvocatoriaForm'

export const dynamic = 'force-dynamic'

export default async function ConvocatoriaCicloPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const ciclo = await getConvocatoriaBySlugAction(slug)

    if (!ciclo) return (
        <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-3 text-neutral-500 px-6 text-center">
            <Theater size={34} className="opacity-40" />
            <p className="text-sm font-medium">No encontramos esta convocatoria.</p>
        </div>
    )

    if (!ciclo.abierta) return (
        <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-3 text-neutral-600 px-6 text-center">
            <Theater size={34} className="opacity-40" />
            <h1 className="text-2xl font-black tracking-tight text-neutral-900">{ciclo.titulo}</h1>
            <p className="text-sm font-medium">Esta convocatoria ya está cerrada. ¡Gracias por el interés!</p>
        </div>
    )

    return <ConvocatoriaForm ciclo={{ id: ciclo.id, titulo: ciclo.titulo, descripcion: ciclo.descripcion, flyer_url: (ciclo as any).flyer_url }} />
}
