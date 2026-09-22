'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Theater, RefreshCw, Copy, Check, X, Trash2, Play, Inbox, Ticket, Plus, Megaphone, Power, Upload, Maximize2, Image as ImageIcon, MessageCircle, Archive, RotateCcw, FileDown, CalendarPlus, CalendarDays } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { jsPDF } from 'jspdf'
import { createClient } from '@/utils/supabase/client'
import { optimizeImage } from '@/utils/optimizeImage'
import Lightbox, { type MediaItem, esVideoArchivo } from '@/components/Lightbox'
import {
    getPropuestasObraAction, curarPropuestaAction,
    archivarPropuestaAction, restaurarPropuestaAction, borrarPropuestaDefinitivoAction, getPapeleraAction,
    getFuncionesAction, crearFuncionAction, vincularObraAEventoAction, desvincularObraAction,
    getConvocatoriasAction, crearConvocatoriaAction, toggleConvocatoriaActivaAction, eliminarConvocatoriaAction,
} from '@/app/actions/convocatoria'

type Estado = 'pendiente' | 'aceptada' | 'rechazada'
type Tab = Estado | 'papelera'
type Propuesta = {
    id: string; created_at: string; titulo: string; director: string | null; compania: string | null
    tipo_obra: string | null; participantes: number | null; duracion_min: number | null; descripcion: string | null
    instagram: string | null; email: string | null; telefono: string | null; videos: string[]; imagenes: string[]
    estado: Estado; nota_curaduria: string | null; evento_id: string | null
    convocatoria_id: string | null; convocatoria_titulo?: string | null
    archivada_at?: string | null
    evento_nombre?: string | null; evento_fecha?: string | null; evento_estado?: string | null
}
type Ciclo = { id: string; titulo: string; descripcion: string | null; slug: string; activa: boolean; fecha_limite: string | null; abierta: boolean }
type Funcion = { id: string; nombre: string; fecha: string | null; estado: string }

const hora = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fechaFn = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'
const waLink = (tel: string) => `https://wa.me/${(tel || '').replace(/[^\d]/g, '')}`

// --- Imagen remota → JPEG dataURL (para meterla en el PDF sin taint de canvas) ---
async function imgToJpeg(url: string): Promise<{ data: string; w: number; h: number } | null> {
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        const blob = await res.blob()
        const bmp = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width; canvas.height = bmp.height
        const ctx = canvas.getContext('2d'); if (!ctx) return null
        ctx.drawImage(bmp, 0, 0)
        return { data: canvas.toDataURL('image/jpeg', 0.82), w: bmp.width, h: bmp.height }
    } catch { return null }
}

// --- PDF de seleccionados (con contacto). Una obra por bloque, con flyer. ---
async function exportarSeleccionadosPdf(tituloFecha: string, obras: Propuesta[]) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const M = 15, W = 210, H = 297, LINE = 5
    let y = M

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20)
    doc.text('PISO2E · Seleccionados', M, y); y += 7
    doc.setFontSize(11); doc.setTextColor(90)
    doc.text(tituloFecha, M, y); y += 3
    doc.setDrawColor(210); doc.line(M, y, W - M, y); y += 7

    for (let idx = 0; idx < obras.length; idx++) {
        const o = obras[idx]
        const imgUrl = o.imagenes?.[0] || null
        const img = imgUrl ? await imgToJpeg(imgUrl) : null
        const imgW = 32, imgH = 42
        const textX = img ? M + imgW + 5 : M
        const textW = W - M - textX

        // ¿Entra el bloque? Estimamos alto mínimo.
        const bloqueMin = Math.max(img ? imgH : 0, 34)
        if (y + bloqueMin > H - M) { doc.addPage(); y = M }
        const yInicio = y

        if (img) {
            try { doc.addImage(img.data, 'JPEG', M, y, imgW, imgH) } catch { /* si falla, seguimos sin foto */ }
        }

        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20)
        const tituloLines = doc.splitTextToSize(`${idx + 1}. ${o.titulo}`, textW)
        doc.text(tituloLines, textX, y + 4)
        let ty = y + 4 + tituloLines.length * 5.5

        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70)
        const meta = [o.tipo_obra, o.director && `Dir: ${o.director}`, o.compania, o.participantes != null && `${o.participantes} integrantes`, o.duracion_min != null && `${o.duracion_min} min`].filter(Boolean).join('  ·  ')
        if (meta) { const l = doc.splitTextToSize(meta, textW); doc.text(l, textX, ty); ty += l.length * LINE }

        // Contacto (versión interna)
        doc.setTextColor(0, 120, 90)
        const contacto = [o.telefono && `Tel: ${o.telefono}`, o.email, o.instagram && `IG: ${o.instagram}`].filter(Boolean).join('  ·  ')
        if (contacto) { const l = doc.splitTextToSize(contacto, textW); doc.text(l, textX, ty); ty += l.length * LINE }

        if (o.descripcion) {
            doc.setTextColor(110); doc.setFontSize(9)
            const l = doc.splitTextToSize(o.descripcion, textW)
            const max = l.slice(0, 6) // no más de ~6 líneas por obra
            doc.text(max, textX, ty); ty += max.length * 4.3
        }

        y = Math.max(ty, yInicio + (img ? imgH : 0)) + 6
        doc.setDrawColor(230); doc.line(M, y - 3, W - M, y - 3)
    }

    const nombreArch = `Seleccionados-${tituloFecha}`.replace(/[^\w\-]+/g, '_').slice(0, 60)
    doc.save(`${nombreArch}.pdf`)
}

export default function CuraduriaPage() {
    const [props, setProps] = useState<Propuesta[]>([])
    const [papelera, setPapelera] = useState<Propuesta[]>([])
    const [funciones, setFunciones] = useState<Funcion[]>([])
    const [esAdmin, setEsAdmin] = useState(false)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<Tab>('pendiente')
    const [procesando, setProcesando] = useState<string | null>(null)
    const [ciclos, setCiclos] = useState<Ciclo[]>([])
    const [panelCiclos, setPanelCiclos] = useState(false)
    const [nuevoCiclo, setNuevoCiclo] = useState({ titulo: '', descripcion: '', fecha_limite: '', flyer_url: '' })
    const [nuevaFn, setNuevaFn] = useState({ nombre: '', fecha: '' })
    const [expPdf, setExpPdf] = useState<string | null>(null)
    const [supabase] = useState(() => createClient())
    // Detalle de una propuesta (texto completo) + visor de fotos/videos
    const [verProp, setVerProp] = useState<Propuesta | null>(null)
    const [lb, setLb] = useState<{ items: MediaItem[]; index: number } | null>(null)
    const mediaDe = (p: Propuesta): MediaItem[] => [
        ...(p.imagenes || []).map(u => ({ tipo: 'img' as const, url: u })),
        ...(p.videos || []).filter(esVideoArchivo).map(u => ({ tipo: 'video' as const, url: u })),
    ]
    const abrirMedia = (p: Propuesta, url: string) => {
        const items = mediaDe(p)
        const i = items.findIndex(m => m.url === url)
        if (i >= 0) setLb({ items, index: i })
    }
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
    const cargarFunciones = async () => {
        const r = await getFuncionesAction()
        if (r.ok) setFunciones(r.funciones as Funcion[])
    }
    const cargarPapelera = async () => {
        const r = await getPapeleraAction()
        if (r.ok) setPapelera(r.propuestas as Propuesta[])
    }
    useEffect(() => { cargar(); cargarCiclos(); cargarFunciones() }, [])
    useEffect(() => { if (tab === 'papelera') cargarPapelera() }, [tab])

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
        if (r.ok) { toast.success('Aceptada. Se creó la función en Eventos.'); cargar(); cargarFunciones() } else toast.error(r.error || 'Error')
        setProcesando(null)
    }
    const rechazar = async (p: Propuesta) => {
        const nota = prompt('Motivo (opcional, interno):') ?? undefined
        setProcesando(p.id)
        const r = await curarPropuestaAction(p.id, 'rechazada', nota)
        if (r.ok) { toast.success('Movida a no aprobadas'); cargar() } else toast.error(r.error || 'Error')
        setProcesando(null)
    }
    // "Eliminar" ahora manda a la papelera (no se pierde el contacto).
    const archivar = async (p: Propuesta) => {
        if (!confirm(`¿Mandar "${p.titulo}" a la papelera?\n\nNo se pierde: queda guardada con su contacto y la podés restaurar desde la pestaña Papelera.`)) return
        const r = await archivarPropuestaAction(p.id)
        if (r.ok) { toast.success('A la papelera. Se puede restaurar.'); cargar() } else toast.error((r as any).error || 'Error')
    }
    const restaurar = async (p: Propuesta) => {
        const r = await restaurarPropuestaAction(p.id)
        if (r.ok) { toast.success('Restaurada'); cargarPapelera(); cargar() } else toast.error((r as any).error || 'Error')
    }
    const borrarDef = async (p: Propuesta) => {
        if (!confirm(`BORRADO DEFINITIVO de "${p.titulo}".\n\nEsto NO se puede deshacer y se pierde el contacto. ¿Seguro?`)) return
        const r = await borrarPropuestaDefinitivoAction(p.id)
        if (r.ok) { toast.success('Borrada definitivamente'); cargarPapelera() } else toast.error((r as any).error || 'Error')
    }

    // Asignar / mover una obra aceptada a una fecha/función.
    const asignarFuncion = async (p: Propuesta, eventoId: string) => {
        setProcesando(p.id)
        const r = eventoId
            ? await vincularObraAEventoAction(p.id, eventoId)
            : await desvincularObraAction(p.id)
        if (r.ok) { cargar(); cargarFunciones() } else toast.error((r as any).error || 'Error')
        setProcesando(null)
    }
    const crearFuncion = async () => {
        if (!nuevaFn.nombre.trim()) return toast.error('Poné un nombre a la fecha/función')
        const r = await crearFuncionAction({ nombre: nuevaFn.nombre, fecha: nuevaFn.fecha || undefined })
        if (r.ok) { toast.success('Fecha creada'); setNuevaFn({ nombre: '', fecha: '' }); cargarFunciones() } else toast.error((r as any).error || 'Error')
    }

    const exportar = async (tituloFecha: string, obras: Propuesta[]) => {
        if (!obras.length) return toast.error('No hay obras para exportar')
        setExpPdf(tituloFecha)
        try { await exportarSeleccionadosPdf(tituloFecha, obras); toast.success('PDF generado') }
        catch (e: any) { toast.error('No se pudo generar el PDF: ' + (e?.message || '')) }
        setExpPdf(null)
    }

    const copiarLink = () => { navigator.clipboard.writeText(`${window.location.origin}/convocatoria`); toast.success('Link de la convocatoria copiado') }

    const conteo = {
        pendiente: props.filter(p => p.estado === 'pendiente').length,
        aceptada: props.filter(p => p.estado === 'aceptada').length,
        rechazada: props.filter(p => p.estado === 'rechazada').length,
        papelera: papelera.length,
    }
    const pasaFiltro = (p: Propuesta) => filtro === 'todas' ? true : filtro === 'general' ? !p.convocatoria_id : p.convocatoria_id === filtro
    const listaActual = tab === 'papelera' ? papelera : props.filter(p => p.estado === tab)
    const lista = listaActual.filter(pasaFiltro)

    // Agrupar seleccionados (aceptadas) por función/fecha.
    const grupos: { key: string; nombre: string; fecha: string | null; obras: Propuesta[] }[] = []
    if (tab === 'aceptada') {
        const map = new Map<string, { key: string; nombre: string; fecha: string | null; obras: Propuesta[] }>()
        for (const p of lista) {
            const key = p.evento_id || '__sin__'
            if (!map.has(key)) map.set(key, { key, nombre: p.evento_id ? (p.evento_nombre || 'Función') : 'Sin fecha asignada', fecha: p.evento_fecha || null, obras: [] })
            map.get(key)!.obras.push(p)
        }
        grupos.push(...[...map.values()].sort((a, b) => {
            if (a.key === '__sin__') return 1; if (b.key === '__sin__') return -1
            return (b.fecha || '') < (a.fecha || '') ? -1 : 1
        }))
    }

    const tabs: { k: Tab; label: string; show: boolean }[] = [
        { k: 'pendiente', label: 'Pendientes', show: true },
        { k: 'aceptada', label: 'Seleccionados', show: true },
        { k: 'rechazada', label: 'No aprobadas', show: esAdmin },
        { k: 'papelera', label: 'Papelera', show: esAdmin },
    ]

    // --- Card de una propuesta (reutilizable en todas las pestañas) ---
    const renderCard = (p: Propuesta) => (
        <div key={p.id} className="bg-[#09090b] border border-white/10 rounded-2xl p-4">
            <div className="flex items-start gap-4">
                {p.imagenes?.[0] && <img onClick={() => abrirMedia(p, p.imagenes[0])} src={p.imagenes[0]} alt="" className="w-20 h-24 object-cover rounded-lg shrink-0 cursor-pointer hover:opacity-80 transition-opacity" title="Ampliar" />}
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
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-[11px] text-gray-500">{[p.email, p.telefono, p.instagram].filter(Boolean).join(' · ')}</p>
                        {p.telefono && <a href={waLink(p.telefono)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-full px-2 py-0.5 hover:bg-emerald-500 hover:text-white transition-colors"><MessageCircle size={11} /> WhatsApp</a>}
                    </div>
                    {p.descripcion && <p className="text-sm text-gray-400 mt-2 whitespace-pre-line line-clamp-4">{p.descripcion}</p>}
                    <button onClick={() => setVerProp(p)} className="mt-1.5 text-[11px] font-bold text-[#D4E655] hover:underline flex items-center gap-1"><Maximize2 size={11} /> Ver completa</button>
                    {(p.imagenes?.length > 1 || p.videos?.length > 0) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {p.imagenes.slice(1).map((u, i) => <img key={i} onClick={() => abrirMedia(p, u)} src={u} alt="" className="w-10 h-12 object-cover rounded cursor-pointer hover:opacity-80" title="Ampliar" />)}
                            {p.videos.map((v, i) => esVideoArchivo(v)
                                ? <button key={i} onClick={() => abrirMedia(p, v)} className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide border border-white/15 rounded px-2 py-1 text-gray-300 hover:border-[#D4E655]/50 hover:text-[#D4E655]"><Play size={11} /> Video {p.videos.length > 1 ? i + 1 : ''}</button>
                                : <a key={i} href={v} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide border border-white/15 rounded px-2 py-1 text-gray-300 hover:border-white/40"><Play size={11} /> Video {p.videos.length > 1 ? i + 1 : ''}</a>)}
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
                {tab === 'aceptada' && p.estado === 'aceptada' && (
                    <div className="flex items-center gap-2 flex-wrap w-full">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center gap-1"><CalendarDays size={12} /> Fecha:</span>
                        <select value={p.evento_id || ''} disabled={procesando === p.id} onChange={e => asignarFuncion(p, e.target.value)}
                            className="bg-[#111] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-gray-200 outline-none max-w-[240px]">
                            <option value="">— Sin fecha —</option>
                            {funciones.map(f => <option key={f.id} value={f.id}>{f.nombre}{f.fecha ? ` · ${new Date(f.fecha).toLocaleDateString('es-AR')}` : ''}</option>)}
                        </select>
                        {p.evento_id && <Link href="/eventos" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide bg-white/5 hover:bg-white/10 text-gray-200 px-3 py-1.5 rounded-lg"><Ticket size={13} /> Función</Link>}
                    </div>
                )}
                {tab === 'rechazada' && <span className="text-[11px] text-gray-500 py-2">En no aprobadas — se le puede ofrecer alquiler.</span>}

                {tab === 'papelera' ? (
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => restaurar(p)} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide bg-[#D4E655]/15 text-[#D4E655] border border-[#D4E655]/30 px-3 py-2 rounded-lg hover:bg-[#D4E655] hover:text-black transition-colors"><RotateCcw size={13} /> Restaurar</button>
                        <button onClick={() => borrarDef(p)} title="Borrar definitivamente" className="text-gray-600 hover:text-red-400 p-2"><Trash2 size={15} /></button>
                    </div>
                ) : (
                    <button onClick={() => archivar(p)} title="Mandar a la papelera" className="ml-auto text-gray-600 hover:text-amber-400 p-2"><Archive size={15} /></button>
                )}
            </div>
        </div>
    )

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
                    <button onClick={() => { cargar(); cargarFunciones(); if (tab === 'papelera') cargarPapelera() }} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
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

            {/* Crear fecha/función (solo en Seleccionados) */}
            {tab === 'aceptada' && (
                <div className="max-w-3xl mx-auto mb-5 bg-[#09090b] border border-white/10 rounded-2xl p-3 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold flex items-center gap-1.5"><CalendarPlus size={13} /> Nueva fecha</span>
                    <input value={nuevaFn.nombre} onChange={e => setNuevaFn(v => ({ ...v, nombre: e.target.value }))} placeholder="Nombre (ej: Muestra Sábado)" className="inp flex-1 min-w-[160px]" />
                    <input value={nuevaFn.fecha} onChange={e => setNuevaFn(v => ({ ...v, fecha: e.target.value }))} type="datetime-local" className="inp w-52" title="Fecha y hora (opcional)" />
                    <button onClick={crearFuncion} className="bg-[#D4E655] text-black px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1"><Plus size={14} /> Crear</button>
                </div>
            )}

            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : lista.length === 0 ? (
                <div className="min-h-[40vh] flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                    <Inbox size={34} className="opacity-40" />
                    <p className="text-sm font-medium">No hay propuestas en “{tabs.find(t => t.k === tab)?.label}”.</p>
                </div>
            ) : tab === 'aceptada' ? (
                <div className="max-w-3xl mx-auto space-y-6">
                    {grupos.map(g => (
                        <div key={g.key}>
                            <div className="flex items-center gap-3 mb-2 px-1">
                                <div className="min-w-0">
                                    <p className="font-black uppercase tracking-wide text-sm truncate flex items-center gap-2">
                                        <CalendarDays size={15} className="text-[#D4E655] shrink-0" /> {g.nombre}
                                    </p>
                                    <p className="text-[11px] text-gray-500">{g.key === '__sin__' ? 'Asignales una fecha desde cada tarjeta' : fechaFn(g.fecha)} · {g.obras.length} obra{g.obras.length !== 1 ? 's' : ''}</p>
                                </div>
                                <button disabled={!!expPdf} onClick={() => exportar(g.key === '__sin__' ? 'Sin fecha' : `${g.nombre}${g.fecha ? ' ' + new Date(g.fecha).toLocaleDateString('es-AR') : ''}`, g.obras)}
                                    className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide bg-white/5 border border-white/10 text-gray-200 px-3 py-2 rounded-lg hover:border-[#D4E655]/50 hover:text-[#D4E655] transition-colors disabled:opacity-40">
                                    {expPdf ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} PDF
                                </button>
                            </div>
                            <div className="space-y-3">{g.obras.map(renderCard)}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="max-w-3xl mx-auto space-y-3">
                    {lista.map(renderCard)}
                </div>
            )}

            {/* Modal: propuesta completa */}
            {verProp && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setVerProp(null)}>
                    <div className="bg-[#0b0b0d] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between p-4 border-b border-white/10 shrink-0">
                            <div className="min-w-0">
                                <h3 className="font-black text-lg truncate">{verProp.titulo}</h3>
                                <p className="text-[11px] text-gray-400 mt-0.5">{[verProp.tipo_obra, verProp.director && `Dir: ${verProp.director}`, verProp.compania, verProp.participantes != null && `${verProp.participantes} integrantes`, verProp.duracion_min != null && `${verProp.duracion_min} min`].filter(Boolean).join(' · ')}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">{[verProp.email, verProp.telefono, verProp.instagram].filter(Boolean).join(' · ')}</p>
                                {verProp.telefono && <a href={waLink(verProp.telefono)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-lg px-3 py-1.5 hover:bg-emerald-500 hover:text-white transition-colors"><MessageCircle size={13} /> Contactar por WhatsApp</a>}
                            </div>
                            <button onClick={() => setVerProp(null)} className="p-2 bg-white/5 rounded-full text-gray-300 shrink-0"><X size={16} /></button>
                        </div>
                        <div className="overflow-y-auto p-4 space-y-4">
                            {verProp.descripcion && <p className="text-sm text-gray-200 whitespace-pre-line leading-relaxed">{verProp.descripcion}</p>}
                            {verProp.imagenes?.length > 0 && (
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2 flex items-center gap-1.5"><ImageIcon size={12} /> Fotos</p>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                        {verProp.imagenes.map((u, i) => <img key={i} onClick={() => abrirMedia(verProp, u)} src={u} alt="" className="w-full aspect-[3/4] object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity" title="Ampliar" />)}
                                    </div>
                                </div>
                            )}
                            {verProp.videos?.length > 0 && (
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2 flex items-center gap-1.5"><Play size={12} /> Videos</p>
                                    <div className="flex flex-wrap gap-2">
                                        {verProp.videos.map((v, i) => esVideoArchivo(v)
                                            ? <button key={i} onClick={() => abrirMedia(verProp, v)} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide border border-white/15 rounded-lg px-3 py-2 text-gray-200 hover:border-[#D4E655]/50 hover:text-[#D4E655]"><Play size={13} /> Video {verProp.videos.length > 1 ? i + 1 : ''}</button>
                                            : <a key={i} href={v} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide border border-white/15 rounded-lg px-3 py-2 text-gray-200 hover:border-white/40"><Play size={13} /> Abrir video {verProp.videos.length > 1 ? i + 1 : ''}</a>)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {lb && <Lightbox items={lb.items} index={lb.index} onIndex={i => setLb(v => v ? { ...v, index: i } : v)} onClose={() => setLb(null)} />}
        </div>
    )
}
