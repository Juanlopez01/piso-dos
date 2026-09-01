'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getVentasCompaniaAction } from '@/app/actions/eventos'
import { Loader2, Ticket, CalendarDays, MapPin, RefreshCw } from 'lucide-react'

type Tipo = { nombre: string; precio: number; cupo: number; vendidas: number; disponible: number; recaudado: number }
type Data = { evento: { nombre: string; fecha: string | null; lugar: string | null }; porTipo: Tipo[]; recaudado: number; vendidas: number; cupo: number; soldOut: boolean }

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
const fmtFecha = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : null

export default function CompaniaPage() {
    const params = useParams()
    const qs = useSearchParams()
    const eventoId = params.eventoId as string
    const token = qs.get('t') || ''
    const [data, setData] = useState<Data | null>(null)
    const [loading, setLoading] = useState(true)
    const [invalido, setInvalido] = useState(false)
    const [actualizado, setActualizado] = useState<Date | null>(null)

    const cargar = useCallback(async () => {
        const r = await getVentasCompaniaAction(eventoId, token)
        if (r.ok) { setData(r as Data); setActualizado(new Date()) } else setInvalido(true)
        setLoading(false)
    }, [eventoId, token])

    useEffect(() => {
        cargar()
        const t = setInterval(cargar, 20000) // tiempo real: refresca cada 20s
        return () => clearInterval(t)
    }, [cargar])

    if (loading) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
    if (invalido || !data) return (
        <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-3 text-neutral-500 px-6 text-center">
            <Ticket size={34} className="opacity-40" />
            <p className="text-sm font-medium">Este link no es válido. Pedile a Piso 2 el link de tu función.</p>
        </div>
    )

    const ocupacion = data.cupo > 0 ? Math.round((data.vendidas / data.cupo) * 100) : 0

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900">
            <div className="bg-black text-white py-3 text-center"><span className="font-black tracking-tighter text-lg">PISO<span className="text-[#D4E655]">2</span></span></div>

            <div className="max-w-lg mx-auto px-5 py-8">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-1">Ventas de tu función</div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">{data.evento.nombre}</h1>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-neutral-500">
                    {data.evento.fecha && <span className="flex items-center gap-1.5 capitalize"><CalendarDays size={14} /> {fmtFecha(data.evento.fecha)}</span>}
                    {data.evento.lugar && <span className="flex items-center gap-1.5"><MapPin size={14} /> {data.evento.lugar}</span>}
                </div>

                {data.soldOut && <div className="mt-4 bg-black text-white text-center rounded-xl py-2 text-sm font-black uppercase tracking-widest">¡Sold out! 🎉</div>}

                {/* totales */}
                <div className="grid grid-cols-2 gap-3 mt-5">
                    <div className="bg-white border border-neutral-200 rounded-2xl p-4">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Entradas vendidas</p>
                        <p className="text-3xl font-black mt-1">{data.vendidas}{data.cupo ? <span className="text-neutral-400 text-lg"> / {data.cupo}</span> : null}</p>
                        {data.cupo > 0 && (
                            <div className="mt-2 h-2 bg-neutral-100 rounded-full overflow-hidden"><div className="h-full bg-[#D4E655]" style={{ width: `${ocupacion}%` }} /></div>
                        )}
                    </div>
                    <div className="bg-white border border-neutral-200 rounded-2xl p-4">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Recaudado</p>
                        <p className="text-3xl font-black mt-1">{pesos(data.recaudado)}</p>
                        <p className="text-[10px] text-neutral-400 mt-2">{ocupacion}% del aforo</p>
                    </div>
                </div>

                {/* por tipo */}
                <div className="mt-5 space-y-2">
                    {data.porTipo.map((t, i) => (
                        <div key={i} className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-between">
                            <div>
                                <p className="font-bold text-sm">{t.nombre}</p>
                                <p className="text-xs text-neutral-500">{pesos(t.precio)} · {t.disponible} disponibles</p>
                            </div>
                            <div className="text-right">
                                <p className="font-black">{t.vendidas}{t.cupo ? <span className="text-neutral-400 font-medium"> / {t.cupo}</span> : null}</p>
                                <p className="text-[11px] text-neutral-500">{pesos(t.recaudado)}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 mt-6">
                    <RefreshCw size={12} /> Se actualiza solo{actualizado ? ` · ${actualizado.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
            </div>
        </div>
    )
}
