import { getPagoPublicoLiga27Action } from '@/app/actions/liga2027'
import PagarCliente from './PagarCliente'
import Link from 'next/link'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

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
        <div className={`min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center px-6 ${sans.className}`}>
            <div className="w-full max-w-md text-center">
                <p className={`${serif.className} text-[11px] tracking-[0.5em] text-neutral-400 uppercase`}>Piso 2 · La Liga 2027</p>

                {!pago ? (
                    <>
                        <h1 className={`${serif.className} text-2xl tracking-wide mt-3`}>Link no válido</h1>
                        <p className="text-neutral-500 text-sm mt-3">Este link de pago no existe o venció. Pedile a recepción que te genere uno nuevo.</p>
                    </>
                ) : pago.estado === 'pagado' || estadoQs === 'ok' ? (
                    <>
                        <h1 className={`${serif.className} text-2xl tracking-wide mt-3`}>¡Pago registrado!</h1>
                        <p className="text-neutral-500 text-sm mt-3">{CONCEPTO[pago.concepto] || 'Pago'}{pago.mes ? ` · ${pago.mes}/${pago.anio}` : ''} — ${Number(pago.monto).toLocaleString('es-AR')}.</p>
                        <p className="text-neutral-500 text-sm mt-1">Ya podés ver tu estado en tu perfil.</p>
                        <Link href="/liga2027/mi-perfil" className="inline-block mt-6 bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs px-8 py-4 hover:bg-black transition-colors">Ir a mi perfil</Link>
                    </>
                ) : (
                    <>
                        <h1 className={`${serif.className} text-3xl tracking-wide mt-3`}>{CONCEPTO[pago.concepto] || 'Pago'}</h1>
                        {pago.mes && <p className="text-neutral-500 text-sm mt-1">Mes {pago.mes}/{pago.anio}</p>}
                        <p className="text-5xl font-light mt-6">${Number(pago.monto).toLocaleString('es-AR')}</p>
                        {estadoQs === 'error' && <p className="text-red-600 text-sm mt-4">El pago no se completó. Probá de nuevo.</p>}
                        {estadoQs === 'pendiente' && <p className="text-amber-600 text-sm mt-4">Tu pago quedó pendiente de acreditación.</p>}
                        <PagarCliente pagoId={pago.id} token={t} />
                        <p className="text-neutral-400 text-xs mt-6">Pago seguro con Mercado Pago.</p>
                    </>
                )}
            </div>
        </div>
    )
}
