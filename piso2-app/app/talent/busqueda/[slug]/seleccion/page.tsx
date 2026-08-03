'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getBusquedaSeleccionAction, type BusquedaSeleccion } from '@/app/actions/talent'
import { Loader2, ArrowLeft, MapPin, Play, Ruler, Cake, Globe } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

type Postulante = BusquedaSeleccion['postulantes'][number]

function CandidatoCard({ p }: { p: Postulante }) {
    const [activa, setActiva] = useState(0)
    const fotos = p.fotos.length ? p.fotos : []
    const sexoLabel = p.sexo === 'mujeres' ? 'Femenino' : p.sexo === 'varones' ? 'Masculino' : null

    return (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden flex flex-col">
            {/* Foto principal */}
            <div className="aspect-[3/4] bg-neutral-100 relative">
                {fotos[activa]
                    ? <img src={fotos[activa]} alt={p.nombre} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-neutral-300 text-[10px] uppercase tracking-widest">Sin foto</div>}
                <span className="absolute top-3 left-3 bg-black/80 text-white text-[9px] font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded-full">#{p.codigo}</span>
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
            </div>
        </div>
    )
}

export default function SeleccionBusquedaPage() {
    const params = useParams()
    const [data, setData] = useState<BusquedaSeleccion | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)

    useEffect(() => {
        getBusquedaSeleccionAction(params.slug as string)
            .then(d => { if (d) setData(d); else setNotFound(true); setLoading(false) })
            .catch(() => { setNotFound(true); setLoading(false) })
    }, [params.slug])

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

    return (
        <div className={`min-h-screen bg-white text-neutral-900 ${sans.className}`}>
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
            </header>

            {/* GRID */}
            <main className="max-w-6xl mx-auto px-6 pb-24">
                {data.postulantes.length === 0 ? (
                    <div className="py-24 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                        <p className="text-neutral-400 font-bold uppercase text-xs tracking-widest">Todavía no hay candidatos para mostrar.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {data.postulantes.map(p => <CandidatoCard key={p.codigo} p={p} />)}
                    </div>
                )}

                <p className="text-center text-[10px] tracking-[0.25em] uppercase text-neutral-300 mt-14">
                    Para avanzar con un candidato, contactá a Piso 2 con su código de referencia
                </p>
            </main>
        </div>
    )
}
