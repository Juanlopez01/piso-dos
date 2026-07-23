'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Instagram, Mail, Loader2, ArrowLeft } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'
import { getTalentosPublicosAction, getMarcasPublicasAction, type TalentoPublico, type MarcaPublica } from '@/app/actions/talent'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const IG = 'https://www.instagram.com/piso2multiespacio/'
const MAIL = 'mailto:info@piso2multiespacio.com'

const CATS = [
    { key: 'mujeres', label: 'Mujeres' },
    { key: 'varones', label: 'Varones' },
    { key: 'obras', label: 'Obras / Compañías' },
] as const

export default function TalentHome() {
    const [talentos, setTalentos] = useState<TalentoPublico[]>([])
    const [marcas, setMarcas] = useState<MarcaPublica[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        Promise.all([getTalentosPublicosAction(), getMarcasPublicasAction()])
            .then(([t, m]) => { setTalentos(t); setMarcas(m); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    // Fila hero = los 5 marcados "Destacado" (por Orden). Si no hay ninguno aún, muestra los primeros.
    const destacados = talentos.filter(t => t.destacado)
    const heroTalentos = (destacados.length > 0 ? destacados : talentos).slice(0, 5)
    const gridTalentos = talentos.slice(0, 6)

    return (
        <div className={`min-h-screen bg-white text-neutral-900 ${sans.className}`}>

            {/* BARRA SUPERIOR */}
            <div className="bg-black text-white py-2.5">
                <div className="max-w-6xl mx-auto px-5 flex items-center justify-between">
                    <Link href="/" className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white flex items-center gap-1.5">
                        <ArrowLeft size={13} /> Piso 2
                    </Link>
                    <div className="flex items-center gap-4">
                        <a href={IG} target="_blank" rel="noreferrer" className="hover:opacity-70"><Instagram size={15} /></a>
                        <span className="text-white/30">|</span>
                        <a href={MAIL} className="hover:opacity-70"><Mail size={15} /></a>
                    </div>
                </div>
            </div>

            {/* LOGO + NAV */}
            <header id="inicio" className="pt-14 pb-8 text-center">
                <div className={`${serif.className} leading-none`}>
                    <p className="text-[11px] md:text-sm tracking-[0.55em] text-neutral-500 uppercase">Piso 2</p>
                    <h1 className="text-5xl md:text-7xl tracking-[0.15em] font-medium mt-1">TALENT</h1>
                </div>
                <nav className="mt-8 flex flex-wrap items-center justify-center gap-6 md:gap-10 text-[10px] md:text-[11px] font-semibold tracking-[0.2em] uppercase text-neutral-600">
                    <a href="#inicio" className="hover:text-black transition-colors">Inicio</a>
                    <a href="#nosotros" className="hover:text-black transition-colors">Nosotros</a>
                    <a href="#management" className="hover:text-black transition-colors">Management</a>
                    <a href="#marcas" className="hover:text-black transition-colors">Con quién trabajamos</a>
                    <Link href="/talent/postular" className="border border-neutral-900 px-4 py-2 hover:bg-neutral-900 hover:text-white transition-colors">Sumate</Link>
                </nav>
            </header>

            {loading ? (
                <div className="flex justify-center py-32"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
            ) : (
                <>
                    {/* HERO — fila de fotos */}
                    <section className="pt-6 pb-2">
                        <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar px-3 md:px-6 pb-2">
                            {heroTalentos.map((t, i) => (
                                <Link key={t.id} href={`/talent/${t.id}`} className={`relative shrink-0 w-[42vw] sm:w-[30vw] md:w-[19vw] group ${i % 2 === 1 ? 'mt-8 md:mt-12' : ''}`}>
                                    <div className="aspect-[3/4] bg-neutral-100 overflow-hidden">
                                        {t.fotos?.[0] && <img src={t.fotos[0]} alt={t.nombre} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />}
                                    </div>
                                    <p className="mt-2 text-[9px] tracking-[0.2em] uppercase text-neutral-500 text-center">{t.nombre}</p>
                                </Link>
                            ))}
                        </div>
                    </section>

                    {/* TAGLINE */}
                    <section className="py-16 md:py-24 px-6 text-center">
                        <p className={`${serif.className} text-2xl md:text-4xl lg:text-5xl tracking-wide leading-snug max-w-3xl mx-auto`}>
                            Conectando <span className="font-semibold">TALENTOS</span> de primer nivel con el mundo
                        </p>
                    </section>

                    {/* QUIÉNES SOMOS */}
                    <section id="nosotros" className="bg-neutral-100">
                        <div className="max-w-5xl mx-auto px-6 md:px-10 py-16 md:py-20">
                            <h2 className={`${serif.className} text-2xl md:text-4xl tracking-[0.15em] uppercase mb-8`}>Quiénes Somos</h2>
                            <div className="space-y-5 text-neutral-600 text-sm md:text-[15px] leading-relaxed font-light max-w-3xl">
                                <p>Piso2 Talent nace de un espacio dedicado al arte y al movimiento, con una idea simple: conectar a nuestros artistas con las marcas, producciones y proyectos que buscan talento de verdad.</p>
                                <p>Representamos bailarines, intérpretes, modelos y obras escénicas. Gestionamos su vínculo con marcas, campañas, contenidos audiovisuales y eventos, cuidando la calidad y el detalle en cada propuesta.</p>
                                <p>Creemos en el poder del arte, la comunicación y las relaciones humanas para crear negocios con propósito. Cada talento que presentamos está elegido y respaldado por Piso 2, para que trabajar con nosotros sea siempre una garantía.</p>
                            </div>
                        </div>
                    </section>

                    {/* CONECTAMOS TALENTOS Y MARCAS */}
                    {gridTalentos.length > 0 && (
                        <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-24 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
                            <h3 className={`${serif.className} text-3xl md:text-5xl leading-tight tracking-wide uppercase`}>
                                Conectamos<br />talentos y marcas<br />para crear impacto
                            </h3>
                            <div className="grid grid-cols-3 gap-2 md:gap-3">
                                {gridTalentos.map(t => (
                                    <Link key={t.id} href={`/talent/${t.id}`} className="aspect-square bg-neutral-100 overflow-hidden group">
                                        {t.fotos?.[0] && <img src={t.fotos[0]} alt={t.nombre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* MANAGEMENT — catálogo por categoría */}
                    <section id="management" className="max-w-6xl mx-auto px-6 md:px-10 pb-8">
                        <div className="text-center mb-12">
                            <h2 className={`${serif.className} text-3xl md:text-5xl tracking-[0.2em] uppercase`}>Management</h2>
                        </div>
                        <div className="space-y-16">
                            {CATS.map(cat => {
                                const items = talentos.filter(t => t.categoria === cat.key)
                                if (items.length === 0) return null
                                return (
                                    <div key={cat.key}>
                                        <div className="flex items-center gap-4 mb-6">
                                            <h3 className={`${serif.className} text-xl md:text-2xl tracking-[0.2em] uppercase`}>{cat.label}</h3>
                                            <div className="flex-1 h-px bg-neutral-200" />
                                        </div>
                                        <div className={`grid gap-3 md:gap-4 ${cat.key === 'obras' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
                                            {items.map(t => (
                                                <Link key={t.id} href={`/talent/${t.id}`} className="group block">
                                                    <div className="overflow-hidden bg-neutral-100" style={{ aspectRatio: cat.key === 'obras' ? '4 / 3' : '3 / 4' }}>
                                                        {t.fotos?.[0] && <img src={t.fotos[0]} alt={t.nombre} className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700" />}
                                                    </div>
                                                    <p className="mt-2 text-[11px] tracking-[0.15em] uppercase font-semibold">{t.nombre}</p>
                                                    {t.disciplina && <p className="text-[9px] tracking-[0.2em] uppercase text-neutral-400">{t.disciplina}</p>}
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>

                    {/* MARCAS QUE ACOMPAÑAMOS */}
                    <section id="marcas" className="mt-16">
                        <div className="bg-neutral-100 py-5 text-center">
                            <h2 className={`${serif.className} text-xl md:text-2xl tracking-[0.25em] uppercase`}>Marcas que acompañamos</h2>
                        </div>
                        <div className="max-w-5xl mx-auto px-6 md:px-10 py-16">
                            {marcas.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-8 gap-y-12 items-center justify-items-center">
                                    {marcas.map(m => (
                                        <img key={m.id} src={m.logo_url} alt={m.nombre} className="max-h-14 md:max-h-16 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity" />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-neutral-400 text-xs uppercase tracking-[0.3em]">Próximamente</p>
                            )}
                        </div>
                    </section>

                    {/* FOOTER */}
                    <footer className="bg-neutral-900 text-white py-12 text-center">
                        <div className={`${serif.className} leading-none`}>
                            <p className="text-[10px] tracking-[0.55em] text-white/50 uppercase">Piso 2</p>
                            <p className="text-3xl tracking-[0.15em] font-medium mt-1">TALENT</p>
                        </div>
                        <div className="flex items-center justify-center gap-5 mt-5">
                            <a href={IG} target="_blank" rel="noreferrer" className="hover:opacity-70"><Instagram size={16} /></a>
                            <span className="text-white/30">|</span>
                            <a href={MAIL} className="hover:opacity-70"><Mail size={16} /></a>
                        </div>
                        <p className="text-[9px] tracking-[0.2em] uppercase text-white/40 mt-6">Contrataciones a través de Piso 2</p>
                    </footer>
                </>
            )}

            <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar{display:none} .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}` }} />
        </div>
    )
}
