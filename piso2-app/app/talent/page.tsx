'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, ArrowUpRight } from 'lucide-react'
import { Montserrat } from 'next/font/google'
import { getTalentosPublicosAction, type TalentoPublico } from '@/app/actions/talent'

const montserrat = Montserrat({ subsets: ['latin'], weight: ['300', '400', '700', '900'] })

const CATEGORIAS: { key: 'mujeres' | 'varones' | 'obras'; label: string }[] = [
    { key: 'mujeres', label: 'Mujeres' },
    { key: 'varones', label: 'Varones' },
    { key: 'obras', label: 'Obras / Compañías' },
]

function TalentoCard({ t }: { t: TalentoPublico }) {
    const portada = t.fotos?.[0]
    const esObra = t.categoria === 'obras'
    return (
        <Link
            href={`/talent/${t.id}`}
            className="group block relative overflow-hidden bg-neutral-100"
            style={{ aspectRatio: esObra ? '4 / 3' : '3 / 4' }}
        >
            {portada ? (
                <img src={portada} alt={t.nombre} className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-300 text-xs uppercase tracking-widest">Sin foto</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-90" />
            {t.destacado && (
                <span className="absolute top-3 left-3 bg-white/90 text-black text-[9px] font-bold uppercase tracking-[0.2em] px-2 py-1">Destacado</span>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5 flex items-end justify-between gap-2">
                <div>
                    <h3 className="text-white text-sm md:text-base font-bold uppercase tracking-wide leading-tight">{t.nombre}</h3>
                    {t.disciplina && <p className="text-white/70 text-[10px] md:text-xs uppercase tracking-widest mt-0.5">{t.disciplina}</p>}
                </div>
                <ArrowUpRight className="text-white opacity-0 group-hover:opacity-100 transition-opacity shrink-0" size={18} />
            </div>
        </Link>
    )
}

export default function TalentPage() {
    const [talentos, setTalentos] = useState<TalentoPublico[]>([])
    const [loading, setLoading] = useState(true)
    const [filtro, setFiltro] = useState<'todos' | 'mujeres' | 'varones' | 'obras'>('todos')

    useEffect(() => {
        getTalentosPublicosAction()
            .then(data => { setTalentos(data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    const categoriasVisibles = filtro === 'todos' ? CATEGORIAS : CATEGORIAS.filter(c => c.key === filtro)

    return (
        <div className={`min-h-screen bg-white text-neutral-900 ${montserrat.className}`}>
            {/* NAV */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-200 h-16">
                <div className="max-w-7xl mx-auto px-5 md:px-8 h-full flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase hover:text-black transition-colors">
                        <ArrowLeft size={15} /> Piso 2
                    </Link>
                    <span className="text-xs font-black uppercase tracking-[0.35em]">Talent</span>
                    <img src="/2-verde.png" alt="Piso 2" className="w-6" />
                </div>
            </nav>

            {/* HERO */}
            <header className="pt-32 pb-14 px-5 md:px-8 max-w-7xl mx-auto">
                <p className="text-[11px] font-bold tracking-[0.5em] uppercase text-neutral-400 mb-5">Piso 2 Multiespacio</p>
                <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter leading-[0.9]">
                    Piso2 <span className="font-light italic">Talent</span>
                </h1>
                <p className="mt-6 max-w-xl text-neutral-500 text-sm md:text-base leading-relaxed font-light">
                    Selección curada de artistas, intérpretes y obras escénicas. Elegí el talento que buscás y
                    envianos la solicitud — la contratación se gestiona a través de Piso 2.
                </p>
            </header>

            {/* FILTRO */}
            <div className="sticky top-16 z-40 bg-white/90 backdrop-blur-md border-y border-neutral-200">
                <div className="max-w-7xl mx-auto px-5 md:px-8 flex gap-2 md:gap-6 overflow-x-auto py-4">
                    {(['todos', ...CATEGORIAS.map(c => c.key)] as const).map(k => {
                        const label = k === 'todos' ? 'Todos' : CATEGORIAS.find(c => c.key === k)!.label
                        const activo = filtro === k
                        return (
                            <button
                                key={k}
                                onClick={() => setFiltro(k as any)}
                                className={`text-[11px] font-bold uppercase tracking-[0.2em] whitespace-nowrap pb-1 border-b-2 transition-colors ${activo ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-neutral-700'}`}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* CONTENIDO */}
            <main className="max-w-7xl mx-auto px-5 md:px-8 py-14 pb-28">
                {loading ? (
                    <div className="flex justify-center py-24"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
                ) : talentos.length === 0 ? (
                    <p className="text-center text-neutral-400 text-sm uppercase tracking-widest py-24">Próximamente.</p>
                ) : (
                    <div className="space-y-20">
                        {categoriasVisibles.map(cat => {
                            const items = talentos.filter(t => t.categoria === cat.key)
                            if (items.length === 0) return null
                            return (
                                <section key={cat.key}>
                                    <div className="flex items-center gap-4 mb-8">
                                        <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter">{cat.label}</h2>
                                        <span className="text-neutral-300 text-sm font-light">{String(items.length).padStart(2, '0')}</span>
                                        <div className="flex-1 h-px bg-neutral-200" />
                                    </div>
                                    <div className={`grid gap-3 md:gap-4 ${cat.key === 'obras' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
                                        {items.map(t => <TalentoCard key={t.id} t={t} />)}
                                    </div>
                                </section>
                            )
                        })}
                    </div>
                )}
            </main>

            {/* FOOTER */}
            <footer className="border-t border-neutral-200 py-10 px-5 md:px-8">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] uppercase tracking-[0.2em] text-neutral-400">
                    <span>© Piso 2 Multiespacio — Talent</span>
                    <span>Contrataciones a través de Piso 2</span>
                </div>
            </footer>
        </div>
    )
}
