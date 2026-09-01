'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Theater, RefreshCw, Copy, Check, X, Trash2, Play, Instagram, Inbox, Ticket } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { getPropuestasObraAction, curarPropuestaAction, eliminarPropuestaAction } from '@/app/actions/convocatoria'

type Estado = 'pendiente' | 'aceptada' | 'rechazada'
type Propuesta = {
    id: string; created_at: string; titulo: string; director: string | null; compania: string | null
    tipo_obra: string | null; participantes: number | null; duracion_min: number | null; descripcion: string | null
    instagram: string | null; email: string | null; telefono: string | null; videos: string[]; imagenes: string[]
    estado: Estado; nota_curaduria: string | null; evento_id: string | null
}

const hora = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function CuraduriaPage() {
    const [props, setProps] = useState<Propuesta[]>([])
    const [esAdmin, setEsAdmin] = useState(false)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<Estado>('pendiente')
    const [procesando, setProcesando] = useState<string | null>(null)

    const cargar = async () => {
        setLoading(true)
        const r = await getPropuestasObraAction()
        if (r.ok) { setProps(r.propuestas as Propuesta[]); setEsAdmin(r.esAdmin) }
        else toast.error(r.error || 'Error')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [])

    const aceptar = async (p: Propuesta) => {
        setProcesando(p.id)
        const r = await curarPropuestaAction(p.id, 'aceptada')
        if (r.ok) { toast.success('Aceptada. Se creó la función en Eventos.'); cargar() } else toast.error(r.error || 'Error')
        setProcesando(null)
    }
    const rechazar = async (p: Propuesta) => {
        const nota = prompt('Motivo (opcional, interno):') ?? undefined
        setProcesando(p.id)
        const r = await curarPropuestaAction(p.id, 'rechazada', nota)
        if (r.ok) { toast.success('Movida a no aprobadas'); cargar() } else toast.error(r.error || 'Error')
        setProcesando(null)
    }
    const borrar = async (p: Propuesta) => {
        if (!confirm(`¿Borrar la propuesta "${p.titulo}"?`)) return
        const r = await eliminarPropuestaAction(p.id)
        if (r.ok) cargar(); else toast.error(r.error || 'Error')
    }
    const copiarLink = () => { navigator.clipboard.writeText(`${window.location.origin}/convocatoria`); toast.success('Link de la convocatoria copiado') }

    const conteo = {
        pendiente: props.filter(p => p.estado === 'pendiente').length,
        aceptada: props.filter(p => p.estado === 'aceptada').length,
        rechazada: props.filter(p => p.estado === 'rechazada').length,
    }
    const lista = props.filter(p => p.estado === tab)
    const tabs: { k: Estado; label: string; show: boolean }[] = [
        { k: 'pendiente', label: 'Pendientes', show: true },
        { k: 'aceptada', label: 'Aceptadas', show: true },
        { k: 'rechazada', label: 'No aprobadas', show: esAdmin },
    ]

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2"><Theater className="text-[#D4E655]" size={26} /> Curaduría</h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">PISO2E · Convocatoria de obras</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={copiarLink} className="px-4 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wide flex items-center gap-2"><Copy size={14} /> Link convocatoria</button>
                    <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
                {tabs.filter(t => t.show).map(t => (
                    <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors flex items-center gap-2 ${tab === t.k ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-300 border-white/10'}`}>
                        {t.label} <span className={`min-w-5 h-5 px-1 flex items-center justify-center rounded-full text-[10px] font-black ${tab === t.k ? 'bg-black text-[#D4E655]' : 'bg-white/10 text-gray-400'}`}>{conteo[t.k]}</span>
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : lista.length === 0 ? (
                <div className="min-h-[40vh] flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                    <Inbox size={34} className="opacity-40" />
                    <p className="text-sm font-medium">No hay propuestas en “{tabs.find(t => t.k === tab)?.label}”.</p>
                </div>
            ) : (
                <div className="max-w-3xl mx-auto space-y-3">
                    {lista.map(p => (
                        <div key={p.id} className="bg-[#09090b] border border-white/10 rounded-2xl p-4">
                            <div className="flex items-start gap-4">
                                {p.imagenes?.[0] && <img src={p.imagenes[0]} alt="" className="w-20 h-24 object-cover rounded-lg shrink-0" />}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-bold truncate">{p.titulo}</h3>
                                        {p.tipo_obra && <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-gray-300 uppercase font-bold">{p.tipo_obra}</span>}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        {[p.director && `Dir: ${p.director}`, p.compania, p.participantes != null && `${p.participantes} integrantes`, p.duracion_min != null && `${p.duracion_min} min`].filter(Boolean).join(' · ')}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{[p.email, p.telefono, p.instagram].filter(Boolean).join(' · ')}</p>
                                    {p.descripcion && <p className="text-sm text-gray-400 mt-2 whitespace-pre-line line-clamp-4">{p.descripcion}</p>}
                                    {(p.imagenes?.length > 1 || p.videos?.length > 0) && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {p.imagenes.slice(1).map((u, i) => <img key={i} src={u} alt="" className="w-10 h-12 object-cover rounded" />)}
                                            {p.videos.map((v, i) => <a key={i} href={v} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide border border-white/15 rounded px-2 py-1 text-gray-300 hover:border-white/40"><Play size={11} /> Video {p.videos.length > 1 ? i + 1 : ''}</a>)}
                                        </div>
                                    )}
                                    {p.nota_curaduria && <p className="text-[11px] text-amber-400/80 mt-2">Nota: {p.nota_curaduria}</p>}
                                    <p className="text-[10px] text-gray-600 mt-2 uppercase tracking-wide">{hora(p.created_at)}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                                {p.estado === 'pendiente' && (
                                    <>
                                        <button disabled={procesando === p.id} onClick={() => aceptar(p)} className="flex-1 min-w-[120px] bg-[#D4E655] text-black font-bold text-[11px] uppercase tracking-wide py-2.5 rounded-lg hover:bg-white transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5">
                                            {procesando === p.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aceptar
                                        </button>
                                        <button disabled={procesando === p.id} onClick={() => rechazar(p)} className="flex-1 min-w-[120px] border border-white/15 text-gray-300 font-bold text-[11px] uppercase tracking-wide py-2.5 rounded-lg hover:border-red-500 hover:text-red-400 transition-colors flex items-center justify-center gap-1.5">
                                            <X size={14} /> No aprobar
                                        </button>
                                    </>
                                )}
                                {p.estado === 'aceptada' && p.evento_id && (
                                    <Link href="/eventos" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide bg-white/5 hover:bg-white/10 text-gray-200 px-3 py-2 rounded-lg"><Ticket size={13} /> Ver en Eventos</Link>
                                )}
                                {p.estado === 'rechazada' && <span className="text-[11px] text-gray-500 py-2">En no aprobadas — se le puede ofrecer alquiler.</span>}
                                <button onClick={() => borrar(p)} className="ml-auto text-gray-600 hover:text-red-400 p-2"><Trash2 size={15} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
