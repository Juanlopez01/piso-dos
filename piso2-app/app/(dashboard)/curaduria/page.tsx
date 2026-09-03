'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Theater, RefreshCw, Copy, Check, X, Trash2, Play, Inbox, Ticket, Plus, Megaphone, Power, Upload } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { optimizeImage } from '@/utils/optimizeImage'
import {
    getPropuestasObraAction, curarPropuestaAction, eliminarPropuestaAction,
    getConvocatoriasAction, crearConvocatoriaAction, toggleConvocatoriaActivaAction, eliminarConvocatoriaAction,
} from '@/app/actions/convocatoria'

type Estado = 'pendiente' | 'aceptada' | 'rechazada'
type Propuesta = {
    id: string; created_at: string; titulo: string; director: string | null; compania: string | null
    tipo_obra: string | null; participantes: number | null; duracion_min: number | null; descripcion: string | null
    instagram: string | null; email: string | null; telefono: string | null; videos: string[]; imagenes: string[]
    estado: Estado; nota_curaduria: string | null; evento_id: string | null
    convocatoria_id: string | null; convocatoria_titulo?: string | null
}
type Ciclo = { id: string; titulo: string; descripcion: string | null; slug: string; activa: boolean; fecha_limite: string | null; abierta: boolean }

const hora = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function CuraduriaPage() {
    const [props, setProps] = useState<Propuesta[]>([])
    const [esAdmin, setEsAdmin] = useState(false)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<Estado>('pendiente')
    const [procesando, setProcesando] = useState<string | null>(null)
    const [ciclos, setCiclos] = useState<Ciclo[]>([])
    const [panelCiclos, setPanelCiclos] = useState(false)
    const [nuevoCiclo, setNuevoCiclo] = useState({ titulo: '', descripcion: '', fecha_limite: '', flyer_url: '' })
    const [supabase] = useState(() => createClient())
    const [subiendoFlyer, setSubiendoFlyer] = useState(false)
    const subirFlyer = async (file: File | null) => {
        if (!file) return
        setSubiendoFlyer(true)
        try {
            const opt = await optimizeImage(file, { maxDim: 1600 })
            const ext = opt.name.split('.').pop()
            const path = `convocatorias/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error } = await supabase.storage.from('talent').upload(path, opt)
            if (error) throw error
            setNuevoCiclo(v => ({ ...v, flyer_url: supabase.storage.from('talent').getPublicUrl(path).data.publicUrl }))
        } catch (e: any) { toast.error('No se pudo subir el flyer: ' + (e.message || '')) }
        setSubiendoFlyer(false)
    }
    const [filtro, setFiltro] = useState<string>('todas') // 'todas' | 'general' | cicloId

    const cargar = async () => {
        setLoading(true)
        const r = await getPropuestasObraAction()
        if (r.ok) { setProps(r.propuestas as Propuesta[]); setEsAdmin(r.esAdmin) }
        else toast.error(r.error || 'Error')
        setLoading(false)
    }
    const cargarCiclos = async () => {
        const r = await getConvocatoriasAction()
        if (r.ok) setCiclos(r.ciclos as Ciclo[])
    }
    useEffect(() => { cargar(); cargarCiclos() }, [])

    const crearCiclo = async () => {
        if (!nuevoCiclo.titulo.trim()) return toast.error('Poné un título al ciclo')
        const r = await crearConvocatoriaAction({ titulo: nuevoCiclo.titulo, descripcion: nuevoCiclo.descripcion, fecha_limite: nuevoCiclo.fecha_limite || undefined, flyer_url: nuevoCiclo.flyer_url || undefined })
        if (r.ok) { toast.success('Ciclo creado'); setNuevoCiclo({ titulo: '', descripcion: '', fecha_limite: '', flyer_url: '' }); cargarCiclos() } else toast.error((r as any).error || 'Error')
    }
    const toggleCiclo = async (c: Ciclo) => {
        const r = await toggleConvocatoriaActivaAction(c.id, !c.activa)
        if (r.ok) cargarCiclos(); else toast.error((r as any).error || 'Error')
    }
    const borrarCiclo = async (c: Ciclo) => {
        if (!confirm(`¿Borrar el ciclo "${c.titulo}"? Las propuestas ya recibidas quedan.`)) return
        const r = await eliminarConvocatoriaAction(c.id)
        if (r.ok) { cargarCiclos(); cargar() } else toast.error((r as any).error || 'Error')
    }
    const copiarLinkCiclo = (slug: string) => { navigator.clipboard.writeText(`${window.location.origin}/convocatoria/${slug}`); toast.success('Link del ciclo copiado') }

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
    const pasaFiltro = (p: Propuesta) => filtro === 'todas' ? true : filtro === 'general' ? !p.convocatoria_id : p.convocatoria_id === filtro
    const lista = props.filter(p => p.estado === tab && pasaFiltro(p))
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
                    <button onClick={() => setPanelCiclos(v => !v)} className={`px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-colors ${panelCiclos ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] border-white/10 text-gray-300 hover:text-white'}`}><Megaphone size={14} /> Ciclos</button>
                    <button onClick={copiarLink} className="px-4 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wide flex items-center gap-2"><Copy size={14} /> Link general</button>
                    <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
                </div>
            </div>

            {/* panel de ciclos / búsquedas */}
            {panelCiclos && (
                <div className="max-w-3xl mx-auto mb-6 bg-[#09090b] border border-white/10 rounded-2xl p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-300 mb-1">Ciclos / búsquedas puntuales</p>
                    <p className="text-[11px] text-gray-500 mb-3">Cada ciclo tiene su propio link para compartir. La convocatoria general sigue abierta siempre.</p>

                    <div className="space-y-2 mb-4">
                        {ciclos.map(c => (
                            <div key={c.id} className="bg-[#0e0e10] border border-white/10 rounded-xl p-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate flex items-center gap-2">{c.titulo}
                                        {c.abierta ? <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#D4E655]/20 text-[#D4E655] uppercase font-bold">Abierta</span>
                                            : <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-gray-400 uppercase font-bold">Cerrada</span>}
                                    </p>
                                    <p className="text-[11px] text-gray-500 truncate">/{c.slug}{c.fecha_limite ? ` · hasta ${c.fecha_limite}` : ''}</p>
                                </div>
                                <button onClick={() => copiarLinkCiclo(c.slug)} className="text-gray-400 hover:text-white p-1.5" title="Copiar link"><Copy size={15} /></button>
                                <button onClick={() => toggleCiclo(c)} className={`p-1.5 ${c.activa ? 'text-[#D4E655]' : 'text-gray-600'} hover:text-white`} title={c.activa ? 'Cerrar' : 'Reabrir'}><Power size={15} /></button>
                                <button onClick={() => borrarCiclo(c)} className="text-gray-600 hover:text-red-400 p-1.5"><Trash2 size={15} /></button>
                            </div>
                        ))}
                        {ciclos.length === 0 && <p className="text-xs text-gray-500">Todavía no hay ciclos. Creá el primero abajo.</p>}
                    </div>

                    <div className="border-t border-white/5 pt-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <input value={nuevoCiclo.titulo} onChange={e => setNuevoCiclo(v => ({ ...v, titulo: e.target.value }))} placeholder="Título del ciclo (ej: Ciclo de Danza · Marzo)" className="inp flex-1 min-w-[180px]" />
                            <input value={nuevoCiclo.fecha_limite} onChange={e => setNuevoCiclo(v => ({ ...v, fecha_limite: e.target.value }))} type="date" className="inp w-40" title="Fecha límite (opcional)" />
                            <button onClick={crearCiclo} className="bg-[#D4E655] text-black px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1"><Plus size={14} /> Crear</button>
                        </div>
                        <textarea value={nuevoCiclo.descripcion} onChange={e => setNuevoCiclo(v => ({ ...v, descripcion: e.target.value }))} placeholder="Descripción / bases del ciclo (opcional)" rows={2} className="inp w-full resize-none" />
                        <div className="flex items-center gap-3">
                            {nuevoCiclo.flyer_url
                                ? <div className="relative w-16 h-20 rounded-lg overflow-hidden border border-white/10 shrink-0"><img src={nuevoCiclo.flyer_url} alt="" className="w-full h-full object-cover" /><button type="button" onClick={() => setNuevoCiclo(v => ({ ...v, flyer_url: '' }))} className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"><X size={11} /></button></div>
                                : <label className="w-16 h-20 border border-dashed border-white/20 rounded-lg flex items-center justify-center cursor-pointer hover:border-white/40 text-gray-500 shrink-0">{subiendoFlyer ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}<input type="file" accept="image/*" className="hidden" onChange={e => subirFlyer(e.target.files?.[0] || null)} /></label>}
                            <span className="text-[11px] text-gray-500">{nuevoCiclo.flyer_url ? 'Flyer cargado — se muestra en la página de postulación.' : 'Flyer del ciclo (opcional)'}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-6">
                {tabs.filter(t => t.show).map(t => (
                    <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors flex items-center gap-2 ${tab === t.k ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-300 border-white/10'}`}>
                        {t.label} <span className={`min-w-5 h-5 px-1 flex items-center justify-center rounded-full text-[10px] font-black ${tab === t.k ? 'bg-black text-[#D4E655]' : 'bg-white/10 text-gray-400'}`}>{conteo[t.k]}</span>
                    </button>
                ))}
                {ciclos.length > 0 && (
                    <select value={filtro} onChange={e => setFiltro(e.target.value)} className="ml-auto bg-[#111] border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-300 outline-none">
                        <option value="todas">Todas las convocatorias</option>
                        <option value="general">General</option>
                        {ciclos.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                    </select>
                )}
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
                                        {p.convocatoria_titulo
                                            ? <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#D4E655]/15 text-[#D4E655] uppercase font-bold flex items-center gap-1"><Megaphone size={9} /> {p.convocatoria_titulo}</span>
                                            : <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500 uppercase font-bold">General</span>}
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
