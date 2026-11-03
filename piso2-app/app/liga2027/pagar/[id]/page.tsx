import { getPagoPublicoLiga27Action } from '@/app/actions/liga2027'
import PagarCliente from './PagarCliente'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

const CONCEPTO: Record<string, string> = { matricula: 'Matrícula', cuota: 'Cuota mensual', examen_libre: 'Examen libre' }

export default async function PagarLiga27Page({
    params, searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ t?: string; pago?: string }>
}) {
    const { id } = await params
    const { t = '', pago: estadoQs } = await searchParams
    const pago = await getPagoPublicoLiga27Action(id, t)

    return (
        <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-md text-center">
                <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#D4E655]">🏆 Piso 2 · La Liga 2027</p>

                {!pago ? (
                    <>
                        <AlertTriangle size={40} className="mx-auto text-amber-400 mt-6" />
                        <h1 className="text-2xl font-black uppercase tracking-tight mt-4">Link no válido</h1>
                        <p className="text-white/50 text-sm mt-3">Este link de pago no existe o venció. Pedile a recepción que te genere uno nuevo.</p>
                    </>
                ) : pago.estado === 'pagado' || estadoQs === 'ok' ? (
                    <>
                        <CheckCircle2 size={44} className="mx-auto text-[#D4E655] mt-6" />
                        <h1 className="text-2xl font-black uppercase tracking-tight mt-4">¡Pago registrado!</h1>
                        <p className="text-white/50 text-sm mt-3">{CONCEPTO[pago.concepto] || 'Pago'}{pago.mes ? ` · ${pago.mes}/${pago.anio}` : ''} — <b className="text-white">${Number(pago.monto).toLocaleString('es-AR')}</b>.</p>
                        <p className="text-white/50 text-sm mt-1">Ya podés ver tu estado en tu perfil.</p>
                        <Link href="/la-liga" className="inline-block mt-8 bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs px-8 py-4 rounded-xl hover:bg-white transition-colors">Ir a mi perfil</Link>
                    </>
                ) : (
                    <>
                        <h1 className="text-3xl font-black uppercase tracking-tight mt-6">{CONCEPTO[pago.concepto] || 'Pago'}</h1>
                        {pago.mes && <p className="text-white/40 text-sm mt-1">Mes {pago.mes}/{pago.anio}</p>}
                        <p className="text-5xl font-black mt-6 text-[#D4E655]">${Number(pago.monto).toLocaleString('es-AR')}</p>
                        {estadoQs === 'error' && <p className="text-red-400 text-sm mt-4">El pago no se completó. Probá de nuevo.</p>}
                        {estadoQs === 'pendiente' && <p className="text-amber-400 text-sm mt-4">Tu pago quedó pendiente de acreditación.</p>}
                        <PagarCliente pagoId={pago.id} token={t} />
                        <p className="text-white/30 text-xs mt-6">Pago seguro con Mercado Pago.</p>
                    </>
                )}
            </div>
        </div>
    )
}
