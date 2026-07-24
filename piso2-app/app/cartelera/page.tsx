'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Search, Music, User, MapPin, Clock, ArrowRight, Loader2, Image as ImageIcon, Lock } from 'lucide-react'
import { getClasesPublicasAction, type ClasePublicaGrupo } from '@/app/actions/cartelera'

const norm = (s: string) => s ? s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() : ''

const estilo = (tipo: string) => {
    switch (norm(tipo)) {
        case 'regular': return { border: 'border-orange-500/40', chip: 'bg-orange-500 text-white', icon: 'text-orange-500' }
        case 'especial': return { border: 'border-purple-500/40', chip: 'bg-purple-500 text-white', icon: 'text-purple-400' }
        case 'intensivo': return { border: 'border-fuchsia-600/40', chip: 'bg-fuchsia-600 text-white', icon: 'text-fuchsia-500' }
        case 'formacion': return { border: 'border-[#D4E655]/40', chip: 'bg-[#D4E655] text-black', icon: 'text-[#D4E655]' }
        case 'compania': case 'compañia': return { border: 'border-blue-500/40', chip: 'bg-blue-500 text-white', icon: 'text-blue-400' }
        default: return { border: 'border-white/10', chip: 'bg-zinc-700 text-white', icon: 'text-white' }
    }
}

const CATS = [
    { key: 'regular', titulo: 'Clases Regulares' },
    { key: 'especial', titulo: 'Clases Especiales' },
    { key: 'intensivo', titulo: 'Intensivos' },
    { key: 'compania', titulo: 'Grupos' },
    { key: 'formacion', titulo: 'Formación' },
]
const FILTROS = ['Todos', 'Regular', 'Especial', 'Intensivo', 'Formacion', 'Grupos']

export default function CarteleraPublicaPage() {
    const [grupos, setGrupos] = useState<ClasePublicaGrupo[]>([])
    const [loading, setLoading] = useState(true)
    const [texto, setTexto] = useState('')
    const [tipo, setTipo] = useState('Todos')

    useEffect(() => {
        getClasesPublicasAction().then(d => { setGrupos(d); setLoading(false) }).catch(() => setLoading(false))
    }, [])

    const filtrados = useMemo(() => grupos.filter(g => {
        const okTexto = g.nombre.toLowerCase().includes(texto.toLowerCase()) || g.profesor.toLowerCase().includes(texto.toLowerCase())
        let okTipo = true
        if (tipo !== 'Todos') {
            const t = tipo === 'Grupos' ? 'compania' : tipo
            okTipo = norm(g.tipo_clase) === norm(t)
        }
        return okTexto && okTipo
    }), [grupos, texto, tipo])

    const ritmos = useMemo(() => Array.from(new Set(grupos.map(g => g.nombre.split(' ')[0]))).slice(0, 5), [grupos])

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24">
            {/* barra */}
            <div className="bg-black/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
                    <Link href="/" className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 hover:text-white flex items-center gap-1.5">
                        <ArrowLeft size={14} /> Piso 2
                    </Link>
                    <Link href="/login" className="px-6 py-2 rounded-full border border-[#D4E655]/50 text-[#D4E655] text-[10px] font-bold tracking-[0.2em] uppercase hover:bg-[#D4E655] hover:text-black transition-all">
                        Ingresar
                    </Link>
                </div>
            </div>

            {/* header */}
            <header className="max-w-7xl mx-auto px-5 pt-12 pb-8 text-center">
                <p className="text-[#D4E655] text-[10px] font-bold tracking-[0.4em] uppercase mb-3">Piso 2 · Cartelera</p>
                <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter">Nuestras Clases</h1>
                <p className="text-gray-400 text-sm mt-4 max-w-lg mx-auto">Mirá toda la propuesta de clases. Elegí una para reservar tu lugar.</p>
            </header>

            {/* filtros */}
            <div className="max-w-7xl mx-auto px-5 space-y-4 mb-10">
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por ritmo, profesor…" className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-[#D4E655]" />
                    </div>
                    <div className="flex bg-[#111] p-1 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar">
                        {FILTROS.map(f => (
                            <button key={f} onClick={() => setTipo(f)} className={`px-4 sm:px-5 py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${tipo === f ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}>{f}</button>
                        ))}
                    </div>
                </div>
                {ritmos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {ritmos.map(r => (
                            <button key={r} onClick={() => setTexto(r)} className="bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-full text-xs font-bold text-gray-300 flex items-center gap-2 whitespace-nowrap"><Music size={12} /> {r}</button>
                        ))}
                    </div>
                )}
            </div>

            {/* grilla */}
            <div className="max-w-7xl mx-auto px-5">
                {loading ? (
                    <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-[#D4E655]" size={40} /></div>
                ) : filtrados.length === 0 ? (
                    <div className="py-24 text-center text-gray-500"><Search size={40} className="mx-auto opacity-20 mb-4" /><p className="font-bold uppercase tracking-widest text-sm">No hay clases programadas.</p></div>
                ) : (
                    CATS.map(cat => {
                        const bloque = filtrados.filter(g => norm(g.tipo_clase) === cat.key)
                        if (!bloque.length) return null
                        return (
                            <section key={cat.key} className="mb-14">
                                <div className="flex items-center gap-4 mb-6">
                                    <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest">{cat.titulo}</h2>
                                    <div className="flex-1 h-[2px] bg-white/10 rounded-full" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {bloque.map(g => {
                                        const st = estilo(g.tipo_clase)
                                        const prox = g.instancias[0]
                                        return (
                                            <Link key={g.key_grupo} href="/login" className={`group relative w-full aspect-[4/5] bg-[#1a1a1c] rounded-3xl overflow-hidden shadow-xl border-2 flex flex-col justify-between transition-all hover:scale-[1.02] ${st.border}`}>
                                                <div className="absolute inset-0 z-0">
                                                    {g.imagen_url
                                                        ? <Image src={g.imagen_url} alt={g.nombre} fill sizes="(max-width:768px) 100vw, 25vw" className="object-cover group-hover:scale-110 transition-transform duration-700" />
                                                        : <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/20"><ImageIcon size={56} /><span className="text-[10px] font-black uppercase">Sin flyer</span></div>}
                                                </div>
                                                <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/80 to-transparent z-10" />
                                                <div className="relative z-20 p-4 flex justify-end">
                                                    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full backdrop-blur-md shadow-lg ${st.chip}`}>{norm(g.tipo_clase).includes('compa') ? 'Grupo' : g.tipo_clase}</span>
                                                </div>
                                                <div className="relative z-20 mt-auto bg-black/60 backdrop-blur-md border-t border-white/10 p-5 flex flex-col gap-3">
                                                    <div>
                                                        <h3 className="text-xl font-black uppercase leading-tight mb-1 drop-shadow-md">{g.nombre}</h3>
                                                        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-200"><User size={14} className={st.icon} /> {g.profesor}</p>
                                                    </div>
                                                    <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs text-gray-300 font-medium">
                                                        <span className="flex items-center gap-1.5"><MapPin size={12} className="text-white/50" /> {prox.sala} <span className="text-[9px] uppercase opacity-50 border border-white/20 px-1 rounded ml-1">{prox.sede}</span></span>
                                                        <span className="flex items-center gap-1.5 bg-white/10 px-2 py-1.5 rounded-md text-[10px] font-black uppercase"><Clock size={12} className={st.icon} /> {format(new Date(prox.inicio), 'HH:mm')}</span>
                                                    </div>
                                                    <div className="w-full mt-1 py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 group-hover:bg-[#D4E655] group-hover:text-black transition-all">
                                                        <Lock size={13} /> Iniciá sesión para reservar <ArrowRight size={14} />
                                                    </div>
                                                </div>
                                            </Link>
                                        )
                                    })}
                                </div>
                            </section>
                        )
                    })
                )}
            </div>

            <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}` }} />
        </div>
    )
}
