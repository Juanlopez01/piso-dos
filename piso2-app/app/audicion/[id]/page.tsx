import { getAudicionPublicaAction } from '@/app/actions/audiciones'
import InscripcionClient from './InscripcionClient'

const fmtFecha = (iso: string | null) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' }) : null

export default async function AudicionPublicaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
    const { id } = await params
    const { t } = await searchParams
    const r = await getAudicionPublicaAction(id, t || '')

    const Marco = ({ children }: { children: React.ReactNode }) => (
        <div className="min-h-screen bg-neutral-50 text-neutral-900">
            <div className="bg-black text-white py-3 text-center"><span className="font-black tracking-tighter text-lg">PISO<span className="text-[#D4E655]">2</span></span></div>
            <div className="max-w-md mx-auto px-5 py-8">{children}</div>
        </div>
    )

    if (!r.ok) return <Marco><p className="text-center text-neutral-500 text-sm py-16">Este link no es válido. Pedile a recepción el link correcto.</p></Marco>

    const a = r.audicion
    const titulo = a.tipo === 'latin' ? 'Casting Latin' : 'Audición La Liga'

    if (a.estado !== 'abierta') return (
        <Marco>
            <div className="text-center py-16">
                <p className="text-lg font-bold mb-2">Inscripciones cerradas</p>
                <p className="text-sm text-neutral-500">La audición de {a.ciudad} ya no recibe inscripciones.</p>
            </div>
        </Marco>
    )

    return (
        <Marco>
            <div className="text-center mb-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#8a9a14] mb-1">{titulo}</div>
                <h1 className="text-2xl font-black tracking-tight capitalize">{a.ciudad}</h1>
                <p className="text-xs text-neutral-500 mt-1 capitalize">{[fmtFecha(a.fecha), a.lugar].filter(Boolean).join(' · ')}</p>
            </div>
            <InscripcionClient id={id} token={t || ''} />
        </Marco>
    )
}
