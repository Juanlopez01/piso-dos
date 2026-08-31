'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getBusquedaSeleccionAction, togglePreseleccionBusquedaAction, type BusquedaSeleccion } from '@/app/actions/talent'
import { Loader2, ArrowLeft, MapPin, Play, Ruler, Cake, Globe, Download, Star, Mail, Phone, MessageCircle } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'
import { toast, Toaster } from 'sonner'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

type Postulante = BusquedaSeleccion['postulantes'][number]

const sexoLabelDe = (s: string | null) => s === 'mujeres' ? 'Femenino' : s === 'varones' ? 'Masculino' : null

function CandidatoCard({ p, selected, onToggle }: { p: Postulante; selected: boolean; onToggle: () => void }) {
    const [activa, setActiva] = useState(0)
    const fotos = p.fotos.length ? p.fotos : []
    const sexoLabel = sexoLabelDe(p.sexo)

    return (
        <div className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-colors ${selected ? 'border-neutral-900 ring-2 ring-neutral-900' : 'border-neutral-200'}`}>
            {/* Foto principal */}
            <div className="aspect-[3/4] bg-neutral-100 relative">
                {fotos[activa]
                    ? <img src={fotos[activa]} alt={p.nombre} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-neutral-300 text-[10px] uppercase tracking-widest">Sin foto</div>}
                <span className="absolute top-3 left-3 bg-black/80 text-white text-[9px] font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded-full">#{p.codigo}</span>
                {/* Estrella de preselección (se guarda y la ve Piso 2) */}
                <button onClick={onToggle}
                    className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center border-2 shadow-sm transition-colors ${selected ? 'bg-amber-400 border-amber-400 text-white' : 'bg-white/90 border-white text-neutral-300 hover:text-amber-400 hover:border-amber-400'}`}
                    title={selected ? 'Quitar preselección' : 'Preseleccionar'}>
                    <Star size={17} strokeWidth={2.5} fill={selected ? 'currentColor' : 'none'} />
                </button>
            </div>

            {/* Miniaturas */}
            {fotos.length > 1 && (
                <div className="flex gap-1.5 p-2 bg-neutral-50 border-b border-neutral-100">
                    {fotos.map((f, i) => (
                        <button key={i} onClick={() => setActiva(i)}
                            className={`w-10 h-12 rounded overflow-hidden border-2 transition-colors ${i === activa ? 'border-neutral-900' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                            <img src={f} alt="" className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            )}

            {/* Datos */}
            <div className="p-4 flex flex-col gap-3 flex-1">
                <div>
                    <h3 className={`${serif.className} text-lg tracking-wide leading-tight`}>{p.nombre}</h3>
                    {p.rubro && <p className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 mt-0.5">{p.rubro}</p>}
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] text-neutral-600">
                    {p.edad != null && <span className="flex items-center gap-1 bg-neutral-100 px-2.5 py-1 rounded-full"><Cake size={11} /> {p.edad} años</span>}
                    {p.altura != null && <span className="flex items-center gap-1 bg-neutral-100 px-2.5 py-1 rounded-full"><Ruler size={11} /> {p.altura} cm</span>}
                    {p.nacionalidad && <span className="flex items-center gap-1 bg-neutral-100 px-2.5 py-1 rounded-full"><Globe size={11} /> {p.nacionalidad}</span>}
                    {sexoLabel && <span className="bg-neutral-100 px-2.5 py-1 rounded-full">{sexoLabel}</span>}
                </div>

                {p.descripcion && <p className="text-xs text-neutral-500 leading-relaxed line-clamp-4">{p.descripcion}</p>}

                {p.videos.length > 0 && (
                    <div className="mt-auto flex flex-col gap-1.5 pt-1">
                        {p.videos.map((v, i) => (
                            <a key={i} href={v} target="_blank" rel="noreferrer"
                                className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-neutral-900 border border-neutral-300 rounded-lg px-3 py-2 hover:bg-neutral-900 hover:text-white transition-colors">
                                <Play size={12} /> Ver video {p.videos.length > 1 ? i + 1 : ''}
                            </a>
                        ))}
                    </div>
                )}

                {/* Contacto: aparece solo cuando Piso 2 lo libera */}
                {p.contactoLiberado && (p.email || p.telefono) && (
                    <div className="mt-1 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-emerald-700 mb-1.5">Contacto liberado ✓</p>
                        {p.email && (
                            <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-[11px] text-neutral-700 hover:text-black break-all">
                                <Mail size={12} className="shrink-0" /> {p.email}
                            </a>
                        )}
                        {p.telefono && (
                            <div className="flex items-center gap-3 mt-1">
                                <span className="flex items-center gap-1.5 text-[11px] text-neutral-700"><Phone size={12} /> {p.telefono}</span>
                                <a href={`https://wa.me/${String(p.telefono).replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 hover:text-emerald-900">
                                    <MessageCircle size={12} /> WhatsApp
                                </a>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// Ficha en el PDF (impresión). Datos restringidos igual que en pantalla + links de video.
function PrintCandidato({ p }: { p: Postulante }) {
    const sexoLabel = sexoLabelDe(p.sexo)
    const chips = [p.rubro, p.edad != null ? `${p.edad} años` : null, p.altura != null ? `${p.altura} cm` : null, p.nacionalidad, sexoLabel].filter(Boolean)
    return (
        <div style={{ breakInside: 'avoid', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            {/* TODAS las fotos cargadas, en grilla de 3 por fila, marco 4:5 vertical parejo. */}
            {p.fotos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
                    {p.fotos.map((f, i) => (
                        <div key={i} style={{ minWidth: 0, aspectRatio: '4 / 5', background: '#f5f5f5', borderRadius: '6px', overflow: 'hidden' }}>
                            <img src={f} alt={`${p.nombre} ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
                        </div>
                    ))}
                </div>
            )}
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <h3 style={{ fontFamily: serif.style.fontFamily, fontSize: '17px', margin: 0 }}>{p.nombre}</h3>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#111' }}>#{p.codigo}</span>
                </div>
                {chips.length > 0 && <p style={{ fontSize: '11px', color: '#555', margin: '4px 0 6px' }}>{chips.join(' · ')}</p>}
                {p.descripcion && <p style={{ fontSize: '11px', color: '#444', lineHeight: 1.4, margin: '0 0 6px' }}>{p.descripcion}</p>}
                {p.videos.length > 0 && (
                    <div style={{ fontSize: '10.5px' }}>
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#777' }}>Videos: </span>
                        {p.videos.map((v, i) => (
                            <span key={i}><a href={v} style={{ color: '#111', wordBreak: 'break-all' }}>{v}</a>{i < p.videos.length - 1 ? ' · ' : ''}</span>
                        ))}
                    </div>
                )}
                {p.contactoLiberado && (p.email || p.telefono) && (
                    <div style={{ fontSize: '10.5px', marginTop: '4px' }}>
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#059669' }}>Contacto: </span>
                        {[p.email, p.telefono].filter(Boolean).join(' · ')}
                    </div>
                )}
            </div>
        </div>
    )
}

export default function SeleccionBusquedaPage() {
    const params = useParams()
    const [data, setData] = useState<BusquedaSeleccion | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)
    const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())

    useEffect(() => {
        getBusquedaSeleccionAction(params.slug as string)
            .then(d => {
                if (d) { setData(d); setSeleccionados(new Set(d.postulantes.filter(p => p.preseleccionado).map(p => p.codigo))) }
                else setNotFound(true)
                setLoading(false)
            })
            .catch(() => { setNotFound(true); setLoading(false) })
    }, [params.slug])

    // La estrella se guarda (la ve Piso 2). Update optimista + revertir si falla.
    const toggle = async (p: Postulante) => {
        const marcar = !seleccionados.has(p.codigo)
        setSeleccionados(prev => { const n = new Set(prev); marcar ? n.add(p.codigo) : n.delete(p.codigo); return n })
        const res = await togglePreseleccionBusquedaAction(params.slug as string, p.id, marcar)
        if (!res.success) {
            setSeleccionados(prev => { const n = new Set(prev); marcar ? n.delete(p.codigo) : n.add(p.codigo); return n })
            toast.error('No se pudo guardar la preselección. Probá de nuevo.')
        }
    }

    if (loading) return (
        <div className="min-h-screen bg-white flex items-center justify-center">
            <Loader2 className="animate-spin text-neutral-300" size={32} />
        </div>
    )

    if (notFound || !data) return (
        <div className={`min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-neutral-500 px-6 text-center ${sans.className}`}>
            <p className="uppercase tracking-widest text-sm font-semibold">Esta selección no existe.</p>
            <Link href="/talent" className="text-black underline text-xs uppercase tracking-widest">Ir a Piso 2 Talent</Link>
        </div>
    )

    const catLabel = data.categoria && data.categoria !== 'todos'
        ? (data.categoria === 'mujeres' ? 'Mujeres' : data.categoria === 'varones' ? 'Varones' : data.categoria)
        : null

    const seleccionadosList = data.postulantes.filter(p => seleccionados.has(p.codigo))

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    .pantalla { display: none !important; }
                    .impresion { display: block !important; }
                    @page { margin: 12mm; }
                }
                .impresion { display: none; }
            ` }} />
            <Toaster position="top-center" richColors />

            {/* ====== PANTALLA ====== */}
            <div className={`pantalla min-h-screen bg-white text-neutral-900 ${sans.className}`}>
                <div className="bg-black text-white py-2.5">
                    <div className="max-w-6xl mx-auto px-5 flex items-center justify-between">
                        <Link href="/talent" className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white flex items-center gap-1.5">
                            <ArrowLeft size={13} /> Piso 2 Talent
                        </Link>
                        <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/50">Selección de talentos</span>
                    </div>
                </div>

                {/* HEADER */}
                <header className="pt-12 pb-8 text-center px-6">
                    <p className={`${serif.className} text-[11px] tracking-[0.5em] text-neutral-500 uppercase`}>Piso 2 Talent</p>
                    <h1 className={`${serif.className} text-3xl md:text-5xl tracking-[0.08em] font-medium mt-2 max-w-3xl mx-auto`}>{data.titulo}</h1>
                    <div className="flex flex-wrap items-center justify-center gap-4 mt-5 text-xs text-neutral-500">
                        {data.ubicacion && <span className="flex items-center gap-1.5"><MapPin size={13} /> {data.ubicacion}</span>}
                        {catLabel && <span className="border border-neutral-300 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-semibold">{catLabel}</span>}
                        <span className="text-neutral-400">{data.postulantes.length} {data.postulantes.length === 1 ? 'candidato' : 'candidatos'}</span>
                    </div>
                    {(data.descripcion || data.requisitos) && (
                        <div className="max-w-2xl mx-auto mt-6 text-left">
                            {data.descripcion && <p className="text-neutral-600 text-sm leading-relaxed whitespace-pre-line">{data.descripcion}</p>}
                            {data.requisitos && (
                                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mt-4">
                                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-1.5">Requisitos</p>
                                    <p className="text-neutral-700 text-sm leading-relaxed whitespace-pre-line">{data.requisitos}</p>
                                </div>
                            )}
                        </div>
                    )}
                    {data.postulantes.length > 0 && (
                        <p className="text-[11px] text-neutral-500 mt-6 max-w-xl mx-auto">Tocá la <Star size={12} className="inline -mt-0.5 text-amber-400" fill="currentColor" /> para <b>preseleccionar</b> a los que te interesan. Piso 2 ve tu preselección y libera los datos de contacto para que avances.</p>
                    )}
                </header>

                {/* GRID */}
                <main className="max-w-6xl mx-auto px-6 pb-32">
                    {data.postulantes.length === 0 ? (
                        <div className="py-24 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                            <p className="text-neutral-400 font-bold uppercase text-xs tracking-widest">Todavía no hay candidatos para mostrar.</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-end mb-5">
                                <span className="text-[11px] text-neutral-400">{seleccionados.size} preseleccionado{seleccionados.size === 1 ? '' : 's'}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {data.postulantes.map(p => <CandidatoCard key={p.codigo} p={p} selected={seleccionados.has(p.codigo)} onToggle={() => toggle(p)} />)}
                            </div>
                        </>
                    )}

                    <p className="text-center text-[10px] tracking-[0.25em] uppercase text-neutral-300 mt-14">
                        Para avanzar con un candidato, contactá a Piso 2 con su código de referencia
                    </p>
                </main>

                {/* BARRA FLOTANTE PDF */}
                {seleccionados.size > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-50">
                        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
                            <span className="text-sm text-neutral-700 font-medium flex items-center gap-1.5"><Star size={15} className="text-amber-400" fill="currentColor" /> {seleccionados.size} preseleccionado{seleccionados.size === 1 ? '' : 's'}</span>
                            <button onClick={() => window.print()}
                                className="inline-flex items-center gap-2 bg-neutral-900 text-white text-xs font-semibold uppercase tracking-[0.15em] px-6 py-3.5 rounded-lg hover:bg-black transition-colors">
                                <Download size={15} /> Descargar PDF
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ====== IMPRESIÓN (PDF) ====== */}
            <div className={`impresion ${sans.className}`} style={{ color: '#111', background: '#fff', padding: '4px' }}>
                <div style={{ borderBottom: '2px solid #111', paddingBottom: '10px', marginBottom: '16px' }}>
                    <p style={{ fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#888', margin: 0 }}>Piso 2 Talent · Selección</p>
                    <h1 style={{ fontFamily: serif.style.fontFamily, fontSize: '24px', margin: '4px 0 0' }}>{data.titulo}</h1>
                    <p style={{ fontSize: '11px', color: '#666', margin: '4px 0 0' }}>
                        {[catLabel, data.ubicacion].filter(Boolean).join(' · ')}{(catLabel || data.ubicacion) ? ' · ' : ''}{seleccionadosList.length} candidato{seleccionadosList.length === 1 ? '' : 's'}
                    </p>
                </div>
                {seleccionadosList.map(p => <PrintCandidato key={p.codigo} p={p} />)}
                <p style={{ fontSize: '9px', color: '#999', textAlign: 'center', marginTop: '14px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                    Para avanzar con un candidato, contactá a Piso 2 con su código de referencia
                </p>
            </div>
        </>
    )
}
