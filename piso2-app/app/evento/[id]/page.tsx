'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getEventoPublicoAction, crearOrdenEventoAction } from '@/app/actions/eventos'
import { toast, Toaster } from 'sonner'
import { Loader2, CalendarDays, MapPin, Minus, Plus, Ticket } from 'lucide-react'
import { montoServicio, conServicio, SERVICIO_PCT } from '@/utils/servicio'

type Entrada = { id: string; nombre: string; precio: number; disponible: number }
type Evento = { id: string; nombre: string; descripcion: string | null; fecha: string | null; lugar: string | null; entradas: Entrada[] }

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
const fmtFecha = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : null

export default function EventoPublicoPage() {
    const params = useParams()
    const qs = useSearchParams()
    const [ev, setEv] = useState<Evento | null>(null)
    const [loading, setLoading] = useState(true)
    const [cant, setCant] = useState<Record<string, number>>({})
    const [nombre, setNombre] = useState('')
    const [email, setEmail] = useState('')
    const [tel, setTel] = useState('')
    const [pagando, setPagando] = useState(false)

    useEffect(() => {
        getEventoPublicoAction(params.id as string, qs.get('promo') || undefined)
            .then(d => { setEv(d as Evento | null); setLoading(false) })
            .catch(() => setLoading(false))
        if (qs.get('pago') === 'error') toast.error('El pago no se completó. Podés intentar de nuevo.')
    }, [params.id])

    const set = (id: string, delta: number, max: number) => setCant(c => {
        const v = Math.max(0, Math.min(max, (c[id] || 0) + delta))
        return { ...c, [id]: v }
    })

    const total = ev ? ev.entradas.reduce((s, e) => s + (cant[e.id] || 0) * e.precio, 0) : 0
    const totalEntradas = Object.values(cant).reduce((s, n) => s + n, 0)

    const pagar = async () => {
        if (!ev) return
        const items = ev.entradas.map(e => ({ entrada_id: e.id, cantidad: cant[e.id] || 0 })).filter(i => i.cantidad > 0)
        if (!items.length) return toast.error('Elegí al menos una entrada.')
        if (!nombre.trim()) return toast.error('Completá tu nombre.')
        if (!email.includes('@')) return toast.error('Completá un email válido.')
        setPagando(true)
        try {
            const orden = await crearOrdenEventoAction({ evento_id: ev.id, comprador_nombre: nombre, comprador_email: email, comprador_contacto: tel, items })
            if (!orden.ok) throw new Error(orden.error)
            const r = await fetch('/api/mercadopago/evento-preference', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ventaId: orden.ventaId, token: orden.token }),
            })
            const data = await r.json()
            if (!r.ok || !data.url) throw new Error(data.error || 'No se pudo iniciar el pago')
            window.location.href = data.url
        } catch (e: any) { toast.error(e.message || 'Error al iniciar el pago'); setPagando(false) }
    }

    if (loading) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
    if (!ev) return (
        <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-3 text-neutral-500 px-6 text-center">
            <Ticket size={34} className="opacity-40" />
            <p className="text-sm font-medium">Este evento no está disponible para compra online.</p>
        </div>
    )

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900">
            <Toaster position="top-center" richColors />
            <div className="bg-black text-white py-3 text-center">
                <span className="font-black tracking-tighter text-lg">PISO<span className="text-[#D4E655]">2</span></span>
            </div>

            <div className="max-w-lg mx-auto px-5 py-8">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-2"><Ticket size={13} /> Entradas</div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">{ev.nombre}</h1>
                <div className="flex flex-wrap gap-4 mt-3 text-xs text-neutral-500">
                    {ev.fecha && <span className="flex items-center gap-1.5 capitalize"><CalendarDays size={14} /> {fmtFecha(ev.fecha)}</span>}
                    {ev.lugar && <span className="flex items-center gap-1.5"><MapPin size={14} /> {ev.lugar}</span>}
                </div>
                {ev.descripcion && <p className="text-sm text-neutral-600 leading-relaxed mt-4 whitespace-pre-line">{ev.descripcion}</p>}

                {/* Entradas */}
                <div className="mt-6 space-y-2.5">
                    {ev.entradas.length === 0 && <p className="text-sm text-neutral-400">No hay entradas cargadas todavía.</p>}
                    {ev.entradas.map(e => {
                        const agotada = e.disponible <= 0
                        return (
                            <div key={e.id} className={`bg-white border rounded-xl p-4 flex items-center gap-3 ${agotada ? 'opacity-50 border-neutral-200' : 'border-neutral-200'}`}>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm">{e.nombre}</p>
                                    <p className="text-xs text-neutral-500">{pesos(e.precio)} {agotada ? '· Agotada' : `· ${e.disponible} disponibles`}</p>
                                </div>
                                {!agotada && (
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={() => set(e.id, -1, e.disponible)} className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center hover:border-black disabled:opacity-30" disabled={(cant[e.id] || 0) === 0}><Minus size={15} /></button>
                                        <span className="w-6 text-center font-bold">{cant[e.id] || 0}</span>
                                        <button onClick={() => set(e.id, 1, e.disponible)} className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center hover:border-black disabled:opacity-30" disabled={(cant[e.id] || 0) >= e.disponible}><Plus size={15} /></button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Datos comprador */}
                <div className="mt-6 space-y-2.5">
                    <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre y apellido" className="w-full bg-white border border-neutral-300 rounded-xl px-4 py-3 text-sm outline-none focus:border-black" />
                    <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Tu email" className="w-full bg-white border border-neutral-300 rounded-xl px-4 py-3 text-sm outline-none focus:border-black" />
                    <input value={tel} onChange={e => setTel(e.target.value)} placeholder="Tu teléfono (opcional)" className="w-full bg-white border border-neutral-300 rounded-xl px-4 py-3 text-sm outline-none focus:border-black" />
                </div>

                {/* Total + pagar */}
                <div className="sticky bottom-0 bg-neutral-50 pt-4 mt-6 pb-6">
                    {totalEntradas > 0 && (
                        <div className="space-y-1 mb-3 text-sm">
                            <div className="flex items-center justify-between text-neutral-500"><span>{totalEntradas} entrada{totalEntradas === 1 ? '' : 's'}</span><span>{pesos(total)}</span></div>
                            <div className="flex items-center justify-between text-neutral-500"><span>Cargo de servicio ({SERVICIO_PCT}%)</span><span>{pesos(montoServicio(total))}</span></div>
                        </div>
                    )}
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-neutral-700">Total</span>
                        <span className="text-2xl font-black">{pesos(conServicio(total))}</span>
                    </div>
                    <button onClick={pagar} disabled={pagando || totalEntradas === 0}
                        className="w-full bg-[#009ee3] text-white font-bold py-4 rounded-xl uppercase text-xs tracking-widest hover:brightness-95 transition disabled:opacity-40 flex items-center justify-center gap-2">
                        {pagando ? <Loader2 size={16} className="animate-spin" /> : null} Pagar con Mercado Pago
                    </button>
                    <p className="text-[10px] text-neutral-400 text-center mt-2">Pago seguro. Al aprobarse, recibís tus entradas con QR.</p>
                </div>
            </div>
        </div>
    )
}
