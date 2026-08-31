import QRCode from 'qrcode'
import { getEntradasPublicasAction } from '@/app/actions/eventos'

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
const fmtFecha = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : null

export default async function EntradasPage({ params, searchParams }: { params: Promise<{ ventaId: string }>; searchParams: Promise<{ t?: string }> }) {
    const { ventaId } = await params
    const { t } = await searchParams
    const data = await getEntradasPublicasAction(ventaId, t || '')

    const Marco = ({ children }: { children: React.ReactNode }) => (
        <div className="min-h-screen bg-neutral-50 text-neutral-900">
            <div className="bg-black text-white py-3 text-center"><span className="font-black tracking-tighter text-lg">PISO<span className="text-[#D4E655]">2</span></span></div>
            <div className="max-w-md mx-auto px-5 py-8">{children}</div>
        </div>
    )

    if (!data.ok) return <Marco><p className="text-center text-neutral-500 text-sm py-16">No encontramos estas entradas. Revisá el link.</p></Marco>

    if (data.estado !== 'confirmada') return (
        <Marco>
            <div className="text-center py-16">
                <p className="text-lg font-bold mb-2">Estamos confirmando tu pago… ⏳</p>
                <p className="text-sm text-neutral-500">Apenas se acredite verás tus entradas acá. Recargá esta página en unos segundos.</p>
            </div>
        </Marco>
    )

    const qrs = await Promise.all(data.tickets.map(tk => QRCode.toDataURL(tk.codigo, { margin: 1, width: 320 })))

    return (
        <Marco>
            <div className="text-center mb-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-600 mb-1">✓ Compra confirmada</div>
                <h1 className="text-2xl font-black tracking-tight">{data.evento.nombre}</h1>
                <p className="text-xs text-neutral-500 mt-1 capitalize">{[fmtFecha(data.evento.fecha), data.evento.lugar].filter(Boolean).join(' · ')}</p>
                <p className="text-xs text-neutral-400 mt-2">{data.comprador} · {data.tickets.length} entrada{data.tickets.length === 1 ? '' : 's'} · {pesos(data.total)}</p>
            </div>

            <div className="space-y-4">
                {data.tickets.map((tk, i) => (
                    <div key={tk.codigo} className="bg-white border border-neutral-200 rounded-2xl p-5 text-center shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-3">{tk.entrada}</p>
                        <img src={qrs[i]} alt={`Entrada ${i + 1}`} className="w-48 h-48 mx-auto" />
                        <p className="text-[11px] font-mono text-neutral-500 mt-3">{tk.codigo}</p>
                        {tk.usado && <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mt-1">Ya utilizada</p>}
                    </div>
                ))}
            </div>

            <p className="text-[11px] text-neutral-400 text-center mt-6">Mostrá este QR en la entrada. Guardá esta página o sacale una captura.</p>
        </Marco>
    )
}
