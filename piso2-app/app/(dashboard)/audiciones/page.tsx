'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, MapPin, CalendarDays, Users, Copy, Trash2, Power, Search, ArrowLeft, Download, Pencil, Check, Instagram, MessageCircle } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import {
    getAudicionesAction, crearAudicionAction, getAudicionAction, agregarParticipanteAction,
    editarParticipanteAction, eliminarParticipanteAction, toggleAudicionEstadoAction, eliminarAudicionAction,
    type Participante,
} from '@/app/actions/audiciones'

// Destino del participante: pendiente, o seleccionado para La Liga (con/ sin beca)
// o para Talents (Latin), o descartado.
const RESULTADOS: { v: string; label: string; cls: string }[] = [
    { v: 'pendiente', label: 'Pendiente', cls: 'bg-white/10 text-gray-300' },
    { v: 'la_liga', label: 'La Liga', cls: 'bg-[#D4E655]/20 text-[#D4E655]' },
    { v: 'beca_liga', label: 'Beca Liga', cls: 'bg-emerald-500/20 text-emerald-400' },
    { v: 'media_beca_liga', label: 'Media beca', cls: 'bg-blue-500/20 text-blue-300' },
    { v: 'talents', label: 'Talents', cls: 'bg-purple-500/20 text-purple-300' },
    { v: 'no', label: 'No', cls: 'bg-rose-500/15 text-rose-400' },
]
const resultadoInfo = (v: string) => RESULTADOS.find(r => r.v === v) || RESULTADOS[0]
const fmtFecha = (iso: string | null) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'Sin fecha'
const edadDe = (nac: string | null) => { if (!nac) return ''; const d = new Date(nac + 'T12:00:00'); const h = new Date(); let e = h.getFullYear() - d.getFullYear(); if (h.getMonth() < d.getMonth() || (h.getMonth() === d.getMonth() && h.getDate() < d.getDate())) e--; return e >= 0 && e < 120 ? `${e}` : '' }

export default function OnTourPage() {
    const [audiciones, setAudiciones] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [sel, setSel] = useState<string | null>(null)
    const [nueva, setNueva] = useState({ ciudad: '', lugar: '', fecha: '' })
    const [creando, setCreando] = useState(false)

    const cargar = async () => {
        setLoading(true)
        const r = await getAudicionesAction()
        if (r.ok) setAudiciones(r.audiciones); else toast.error((r as any).error || 'Error')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [])

    const crear = async () => {
        if (!nueva.ciudad.trim()) return toast.error('Poné la ciudad')
        setCreando(true)
        const r = await crearAudicionAction({ ciudad: nueva.ciudad, lugar: nueva.lugar, fecha: nueva.fecha || null })
        if (r.ok) { toast.success('Audición creada'); setNueva({ ciudad: '', lugar: '', fecha: '' }); cargar() } else toast.error((r as any).error || 'Error')
        setCreando(false)
    }

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />
            {sel ? (
                <Detalle audicionId={sel} onBack={() => { setSel(null); cargar() }} />
            ) : (
                <>
                    <div className="mb-6">
                        <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2">Piso 2 On Tour</h1>
                        <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Audiciones de gira</p>
                    </div>

                    {/* Nueva audición */}
                    <div className="max-w-3xl mb-6 bg-[#09090b] border border-white/10 rounded-2xl p-3 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold flex items-center gap-1.5"><Plus size={13} /> Nueva audición</span>
                        <input value={nueva.ciudad} onChange={e => setNueva(v => ({ ...v, ciudad: e.target.value }))} placeholder="Ciudad (ej: Córdoba)" className="inp flex-1 min-w-[140px]" />
                        <input value={nueva.lugar} onChange={e => setNueva(v => ({ ...v, lugar: e.target.value }))} placeholder="Lugar (opcional)" className="inp flex-1 min-w-[120px]" />
                        <input value={nueva.fecha} onChange={e => setNueva(v => ({ ...v, fecha: e.target.value }))} type="date" className="inp w-40" />
                        <button onClick={crear} disabled={creando} className="bg-[#D4E655] text-black px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1 disabled:opacity-50">
                            {creando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Crear
                        </button>
                    </div>

                    {loading ? (
                        <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                    ) : audiciones.length === 0 ? (
                        <div className="min-h-[30vh] flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                            <CalendarDays size={32} className="opacity-40" />
                            <p className="text-sm">Todavía no hay audiciones. Creá la primera arriba.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
                            {audiciones.map(a => (
                                <button key={a.id} onClick={() => setSel(a.id)} className="text-left bg-[#09090b] border border-white/10 rounded-2xl p-4 hover:border-[#D4E655]/40 transition-colors">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="font-bold text-lg capitalize truncate flex items-center gap-1.5"><MapPin size={15} className="text-[#D4E655] shrink-0" /> {a.ciudad}</h3>
                                        <span className={`text-[8px] px-2 py-0.5 rounded-full uppercase font-black ${a.estado === 'abierta' ? 'bg-[#D4E655]/20 text-[#D4E655]' : 'bg-white/10 text-gray-400'}`}>{a.estado}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-1">{[fmtFecha(a.fecha), a.lugar].filter(Boolean).join(' · ')}</p>
                                    <p className="text-sm font-black text-white mt-3 flex items-center gap-1.5"><Users size={14} className="text-gray-500" /> {a.participantes} <span className="text-[11px] font-normal text-gray-500">anotados</span></p>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function Detalle({ audicionId, onBack }: { audicionId: string; onBack: () => void }) {
    const [audicion, setAudicion] = useState<any>(null)
    const [parts, setParts] = useState<Participante[]>([])
    const [loading, setLoading] = useState(true)
    const [busca, setBusca] = useState('')
    const [nuevo, setNuevo] = useState({ nombre: '', instagram: '', telefono: '', mail: '', fecha_nacimiento: '', ciudad_origen: '', altura: '' })
    const [guardando, setGuardando] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [editVals, setEditVals] = useState<any>({})

    const cargar = async () => {
        setLoading(true)
        const r = await getAudicionAction(audicionId)
        if (r.ok) { setAudicion(r.audicion); setParts(r.participantes) } else toast.error((r as any).error || 'Error')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [audicionId])

    const agregar = async () => {
        if (!nuevo.nombre.trim()) return toast.error('Poné el nombre')
        setGuardando(true)
        const r = await agregarParticipanteAction(audicionId, nuevo)
        if (r.ok) { setNuevo({ nombre: '', instagram: '', telefono: '', mail: '', fecha_nacimiento: '', ciudad_origen: '', altura: '' }); cargar() } else toast.error((r as any).error || 'Error')
        setGuardando(false)
    }
    const setResultado = async (id: string, resultado: string) => {
        setParts(ps => ps.map(p => p.id === id ? { ...p, resultado } : p))
        const r = await editarParticipanteAction(id, { resultado })
        if (!r.ok) { toast.error((r as any).error || 'Error'); cargar() }
    }
    const togglePresente = async (p: Participante) => {
        setParts(ps => ps.map(x => x.id === p.id ? { ...x, presente: !x.presente } : x))
        const r = await editarParticipanteAction(p.id, { presente: !p.presente })
        if (!r.ok) cargar()
    }
    const borrar = async (id: string) => {
        if (!confirm('¿Borrar este participante?')) return
        const r = await eliminarParticipanteAction(id)
        if (r.ok) cargar(); else toast.error((r as any).error || 'Error')
    }
    const guardarEdit = async () => {
        if (!editId) return
        const r = await editarParticipanteAction(editId, {
            nombre: editVals.nombre, instagram: editVals.instagram, telefono: editVals.telefono, mail: editVals.mail,
            fecha_nacimiento: editVals.fecha_nacimiento || null, ciudad_origen: editVals.ciudad_origen,
            numero: editVals.numero === '' ? null : Number(editVals.numero),
            altura: editVals.altura, notas: editVals.notas,
            manejo_tacos: !!editVals.manejo_tacos, sabe_jazz_heels: !!editVals.sabe_jazz_heels,
            sabe_tecnica: !!editVals.sabe_tecnica, sabe_urbano: !!editVals.sabe_urbano,
        })
        if (r.ok) { setEditId(null); cargar() } else toast.error((r as any).error || 'Error')
    }
    const toggleEstado = async () => {
        const nuevo = audicion.estado === 'abierta' ? 'cerrada' : 'abierta'
        const r = await toggleAudicionEstadoAction(audicionId, nuevo)
        if (r.ok) setAudicion((a: any) => ({ ...a, estado: nuevo })); else toast.error((r as any).error || 'Error')
    }
    const borrarAudicion = async () => {
        if (!confirm(`¿Borrar la audición de ${audicion.ciudad}? Se borran todos sus participantes.`)) return
        const r = await eliminarAudicionAction(audicionId)
        if (r.ok) { toast.success('Audición borrada'); onBack() } else toast.error((r as any).error || 'Error')
    }
    const copiarLink = () => {
        navigator.clipboard.writeText(`${window.location.origin}/audicion/${audicionId}?t=${audicion.token}`)
        toast.success('Link de inscripción copiado')
    }
    const exportarCSV = () => {
        const head = ['N°', 'Nombre', 'Instagram', 'Teléfono', 'Mail', 'Nacimiento', 'Edad', 'Ciudad', 'Altura', 'Tacos', 'Jazz/Heels', 'Técnica', 'Urbano', 'Resultado', 'Presente', 'Notas']
        const rows = parts.map(p => [p.numero ?? '', p.nombre, p.instagram || '', p.telefono || '', p.mail || '', p.fecha_nacimiento || '', edadDe(p.fecha_nacimiento), p.ciudad_origen || '', p.altura || '', p.manejo_tacos ? 'Sí' : 'No', p.sabe_jazz_heels ? 'Sí' : 'No', p.sabe_tecnica ? 'Sí' : 'No', p.sabe_urbano ? 'Sí' : 'No', resultadoInfo(p.resultado).label, p.presente ? 'Sí' : 'No', (p.notas || '').replace(/\n/g, ' ')])
        const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
        const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
        const a = document.createElement('a'); a.href = url; a.download = `audicion-${audicion.ciudad}.csv`.replace(/[^\w.-]+/g, '_'); a.click(); URL.revokeObjectURL(url)
    }

    const visibles = useMemo(() => {
        const q = busca.trim().toLowerCase()
        if (!q) return parts
        return parts.filter(p => [p.nombre, p.instagram, p.telefono, p.ciudad_origen, String(p.numero)].filter(Boolean).some(x => String(x).toLowerCase().includes(q)))
    }, [parts, busca])

    if (loading) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
    if (!audicion) return null

    return (
        <div className="max-w-3xl mx-auto">
            <button onClick={onBack} className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-xs font-semibold uppercase tracking-wide mb-4"><ArrowLeft size={14} /> Volver</button>

            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight capitalize">{audicion.ciudad}</h1>
                    <p className="text-[11px] text-gray-500">{[fmtFecha(audicion.fecha), audicion.lugar].filter(Boolean).join(' · ')} · {parts.length} anotados</p>
                </div>
                <span className={`text-[9px] px-2 py-1 rounded-full uppercase font-black shrink-0 ${audicion.estado === 'abierta' ? 'bg-[#D4E655]/20 text-[#D4E655]' : 'bg-white/10 text-gray-400'}`}>{audicion.estado}</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
                <button onClick={copiarLink} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide bg-[#111] border border-white/10 text-gray-200 px-3 py-2 rounded-lg hover:border-[#D4E655]/50"><Copy size={13} /> Link de inscripción</button>
                <button onClick={exportarCSV} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide bg-[#111] border border-white/10 text-gray-200 px-3 py-2 rounded-lg hover:border-white/30"><Download size={13} /> Excel</button>
                <button onClick={toggleEstado} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide bg-[#111] border border-white/10 text-gray-300 px-3 py-2 rounded-lg hover:border-white/30"><Power size={13} /> {audicion.estado === 'abierta' ? 'Cerrar' : 'Reabrir'}</button>
                <button onClick={borrarAudicion} className="ml-auto text-gray-600 hover:text-red-400 p-2"><Trash2 size={15} /></button>
            </div>

            {/* Alta rápida (recepción) */}
            <div className="bg-[#09090b] border border-white/10 rounded-2xl p-3 mb-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Anotar participante (le asigna el próximo número)</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <input value={nuevo.nombre} onChange={e => setNuevo(v => ({ ...v, nombre: e.target.value }))} placeholder="Nombre y apellido *" className="inp col-span-2 md:col-span-1" />
                    <input value={nuevo.instagram} onChange={e => setNuevo(v => ({ ...v, instagram: e.target.value }))} placeholder="@instagram" className="inp" />
                    <input value={nuevo.telefono} onChange={e => setNuevo(v => ({ ...v, telefono: e.target.value }))} placeholder="Teléfono" className="inp" />
                    <input value={nuevo.mail} onChange={e => setNuevo(v => ({ ...v, mail: e.target.value }))} placeholder="Mail" className="inp" />
                    <input value={nuevo.fecha_nacimiento} onChange={e => setNuevo(v => ({ ...v, fecha_nacimiento: e.target.value }))} type="date" title="Fecha de nacimiento" className="inp" />
                    <input value={nuevo.ciudad_origen} onChange={e => setNuevo(v => ({ ...v, ciudad_origen: e.target.value }))} placeholder="Ciudad de origen" className="inp" />
                    <input value={nuevo.altura} onChange={e => setNuevo(v => ({ ...v, altura: e.target.value }))} placeholder="Altura (ej: 1.70)" className="inp" />
                </div>
                <p className="text-[10px] text-gray-600 mt-1.5">Las aptitudes (tacos, jazz/heels, técnica, urbano) y la anotación se cargan al editar.</p>
                <div className="flex justify-end mt-2">
                    <button onClick={agregar} disabled={guardando} className="bg-[#D4E655] text-black px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 disabled:opacity-50">
                        {guardando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Anotar
                    </button>
                </div>
            </div>

            {/* Buscador */}
            <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre, IG, teléfono o número…" className="w-full bg-[#111] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-[#D4E655]" />
            </div>

            {/* Participantes */}
            {visibles.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-10">{parts.length === 0 ? 'Todavía no se anotó nadie. Compartí el link o cargalos acá.' : 'Nada coincide con la búsqueda.'}</p>
            ) : (
                <div className="space-y-2">
                    {visibles.map(p => (
                        <div key={p.id} className="bg-[#09090b] border border-white/10 rounded-xl p-3">
                            {editId === p.id ? (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        <input value={editVals.numero ?? ''} onChange={e => setEditVals((v: any) => ({ ...v, numero: e.target.value }))} placeholder="N°" type="number" className="inp" />
                                        <input value={editVals.nombre ?? ''} onChange={e => setEditVals((v: any) => ({ ...v, nombre: e.target.value }))} placeholder="Nombre" className="inp col-span-2 md:col-span-1" />
                                        <input value={editVals.instagram ?? ''} onChange={e => setEditVals((v: any) => ({ ...v, instagram: e.target.value }))} placeholder="@ig" className="inp" />
                                        <input value={editVals.telefono ?? ''} onChange={e => setEditVals((v: any) => ({ ...v, telefono: e.target.value }))} placeholder="Tel" className="inp" />
                                        <input value={editVals.mail ?? ''} onChange={e => setEditVals((v: any) => ({ ...v, mail: e.target.value }))} placeholder="Mail" className="inp" />
                                        <input value={editVals.fecha_nacimiento ?? ''} onChange={e => setEditVals((v: any) => ({ ...v, fecha_nacimiento: e.target.value }))} type="date" className="inp" />
                                        <input value={editVals.ciudad_origen ?? ''} onChange={e => setEditVals((v: any) => ({ ...v, ciudad_origen: e.target.value }))} placeholder="Ciudad" className="inp" />
                                        <input value={editVals.altura ?? ''} onChange={e => setEditVals((v: any) => ({ ...v, altura: e.target.value }))} placeholder="Altura (ej: 1.70)" className="inp" />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {([['manejo_tacos', 'Manejo de tacos'], ['sabe_jazz_heels', 'Jazz / Heels'], ['sabe_tecnica', 'Técnica'], ['sabe_urbano', 'Urbano / comercial']] as const).map(([k, label]) => (
                                            <button type="button" key={k} onClick={() => setEditVals((v: any) => ({ ...v, [k]: !v[k] }))} className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide rounded-lg px-2.5 py-1.5 border transition-colors ${editVals[k] ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-400 border-white/10 hover:border-white/30'}`}>
                                                {editVals[k] && <Check size={12} />} {label}
                                            </button>
                                        ))}
                                    </div>
                                    <textarea value={editVals.notas ?? ''} onChange={e => setEditVals((v: any) => ({ ...v, notas: e.target.value }))} placeholder="Anotación sobre la persona (impresión, observaciones…)" rows={2} className="inp w-full resize-none" />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setEditId(null)} className="text-[11px] font-bold uppercase text-gray-400 px-3 py-1.5">Cancelar</button>
                                        <button onClick={guardarEdit} className="bg-[#D4E655] text-black px-3 py-1.5 rounded-lg font-bold text-[11px] uppercase flex items-center gap-1"><Check size={13} /> Guardar</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-[#111] border border-white/10 flex items-center justify-center font-black text-sm shrink-0">{p.numero ?? '–'}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-bold text-sm truncate">{p.nombre}</p>
                                            {edadDe(p.fecha_nacimiento) && <span className="text-[10px] text-gray-500">{edadDe(p.fecha_nacimiento)} años</span>}
                                            {p.origen === 'publico' && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-500 uppercase font-bold">web</span>}
                                        </div>
                                        <div className="flex items-center gap-3 flex-wrap mt-0.5">
                                            {p.instagram && <span className="text-[11px] text-gray-500 flex items-center gap-1"><Instagram size={11} /> {p.instagram}</span>}
                                            {p.telefono && <a href={`https://wa.me/${p.telefono.replace(/[^0-9]/g, '')}`} target="_blank" className="text-[11px] text-gray-500 hover:text-green-400 flex items-center gap-1"><MessageCircle size={11} /> {p.telefono}</a>}
                                            {p.ciudad_origen && <span className="text-[11px] text-gray-600">{p.ciudad_origen}</span>}
                                            {p.altura && <span className="text-[11px] text-gray-600">{p.altura} m</span>}
                                        </div>
                                        {(p.manejo_tacos || p.sabe_jazz_heels || p.sabe_tecnica || p.sabe_urbano) && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {p.manejo_tacos && <span className="text-[9px] font-bold uppercase bg-[#D4E655]/15 text-[#D4E655] rounded-full px-2 py-0.5">Tacos</span>}
                                                {p.sabe_jazz_heels && <span className="text-[9px] font-bold uppercase bg-[#D4E655]/15 text-[#D4E655] rounded-full px-2 py-0.5">Jazz/Heels</span>}
                                                {p.sabe_tecnica && <span className="text-[9px] font-bold uppercase bg-[#D4E655]/15 text-[#D4E655] rounded-full px-2 py-0.5">Técnica</span>}
                                                {p.sabe_urbano && <span className="text-[9px] font-bold uppercase bg-[#D4E655]/15 text-[#D4E655] rounded-full px-2 py-0.5">Urbano</span>}
                                            </div>
                                        )}
                                        {p.notas && <p className="text-[11px] text-gray-400 mt-1.5 italic whitespace-pre-line">{p.notas}</p>}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <select value={p.resultado} onChange={e => setResultado(p.id, e.target.value)} className={`text-[10px] font-bold uppercase rounded-lg px-2 py-1.5 border-0 outline-none ${resultadoInfo(p.resultado).cls}`}>
                                            {RESULTADOS.map(r => <option key={r.v} value={r.v} className="bg-[#111] text-white">{r.label}</option>)}
                                        </select>
                                        <button onClick={() => togglePresente(p)} title="Presente" className={`p-1.5 rounded-lg ${p.presente ? 'text-[#D4E655] bg-[#D4E655]/10' : 'text-gray-600 hover:bg-white/5'}`}><Check size={15} /></button>
                                        <button onClick={() => { setEditId(p.id); setEditVals({ numero: p.numero ?? '', nombre: p.nombre, instagram: p.instagram || '', telefono: p.telefono || '', mail: p.mail || '', fecha_nacimiento: p.fecha_nacimiento || '', ciudad_origen: p.ciudad_origen || '', altura: p.altura || '', notas: p.notas || '', manejo_tacos: p.manejo_tacos, sabe_jazz_heels: p.sabe_jazz_heels, sabe_tecnica: p.sabe_tecnica, sabe_urbano: p.sabe_urbano }) }} className="p-1.5 text-gray-500 hover:text-white rounded-lg"><Pencil size={14} /></button>
                                        <button onClick={() => borrar(p.id)} className="p-1.5 text-gray-600 hover:text-red-400 rounded-lg"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
