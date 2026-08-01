'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Instagram, Mail, Loader2, ArrowLeft, MapPin, CalendarDays, ArrowRight } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'
import { getTalentosPublicosAction, getMarcasPublicasAction, getBusquedasActivasAction, type TalentoPublico, type MarcaPublica, type BusquedaPublica } from '@/app/actions/talent'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const IG = 'https://www.instagram.com/piso2multiespacio/'
const MAIL = 'mailto:multiespaciopiso2@gmail.com'

const CATS = [
    { key: 'mujeres', label: 'Mujeres' },
    { key: 'varones', label: 'Varones' },
    { key: 'obras', label: 'Obras / Compañías' },
] as const

export default function TalentHome() {
    const [talentos, setTalentos] = useState<TalentoPublico[]>([])
    const [marcas, setMarcas] = useState<MarcaPublica[]>([])
    const [busquedas, setBusquedas] = useState<BusquedaPublica[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        Promise.all([getTalentosPublicosAction(), getMarcasPublicasAction(), getBusquedasActivasAction()])
            .then(([t, m, b]) => { setTalentos(t); setMarcas(m); setBusquedas(b); setLoading(false) })
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
                    <p className="text-xs md:text-base tracking-[0.6em] text-neutral-500 uppercase mb-2">Piso 2</p>
                    <h1 className="text-7xl md:text-9xl tracking-[0.12em] font-semibold">TALENT</h1>
                </div>
                <nav className="mt-8 flex flex-wrap items-center justify-center gap-6 md:gap-10 text-[10px] md:text-[11px] font-semibold tracking-[0.2em] uppercase text-neutral-600">
                    <a href="#inicio" className="hover:text-black transition-colors">Inicio</a>
                    <a href="#nosotros" className="hover:text-black transition-colors">Nosotros</a>
                    <a href="#busquedas" className="hover:text-black transition-colors">Búsquedas</a>
                    <a href="#marcas" className="hover:text-black transition-colors">Con quién trabajamos</a>
                    <Link href="/talent/postular" className="border border-neutral-900 px-4 py-2 hover:bg-neutral-900 hover:text-white transition-colors">Sumate</Link>
                </nav>
            </header>

            {/* CTA — Sumate (grande, debajo del título) */}
            <section className="pt-2 pb-14 text-center px-6">
                <Link href="/talent/postular" className="inline-flex items-center justify-center gap-3 bg-neutral-900 text-white text-sm md:text-base font-semibold tracking-[0.18em] uppercase px-12 py-6 hover:bg-black transition-colors">
                    Sumate como talento
                </Link>
                <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mt-5">Enviá tu perfil a Piso 2 Talent</p>
            </section>

            {loading ? (
                <div className="flex justify-center py-32"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
            ) : (
                <>
                    {/* TAGLINE */}
                    <section className="pb-14 md:pb-20 px-6 text-center">
                        <p className={`${serif.className} text-base md:text-xl tracking-wide leading-snug max-w-2xl mx-auto text-neutral-500`}>
                            Conectando <span className="font-semibold text-neutral-800">talentos</span> de primer nivel con el mundo
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

                    {/* BÚSQUEDAS ABIERTAS */}
                    <section id="busquedas" className="max-w-6xl mx-auto px-6 md:px-10 pb-8">
                        <div className="text-center mb-10">
                            <h2 className={`${serif.className} text-3xl md:text-5xl tracking-[0.2em] uppercase`}>Búsquedas abiertas</h2>
                            <p className="text-neutral-500 text-sm mt-3 max-w-lg mx-auto">Estamos buscando talentos para estos proyectos. Postulate directamente.</p>
                        </div>
                        {busquedas.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                                {busquedas.map(b => {
                                    const vencida = b.fecha_limite && new Date(b.fecha_limite) < new Date()
                                    if (vencida) return null
                                    return (
                                        <Link key={b.id} href={`/talent/busqueda/${b.slug}`} className="group border border-neutral-200 hover:border-neutral-900 rounded-xl p-6 md:p-8 transition-all hover:shadow-lg">
                                            <h3 className={`${serif.className} text-xl md:text-2xl tracking-wide group-hover:tracking-wider transition-all`}>{b.titulo}</h3>
                                            <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-neutral-400">
                                                {b.ubicacion && (
                                                    <span className="flex items-center gap-1"><MapPin size={11} /> {b.ubicacion}</span>
                                                )}
                                                {b.categoria && b.categoria !== 'todos' && (
                                                    <span className="border border-neutral-200 px-2.5 py-0.5 rounded-full uppercase tracking-widest font-semibold">
                                                        {b.categoria === 'mujeres' ? 'Mujeres' : 'Varones'}
                                                    </span>
                                                )}
                                                {b.fecha_limite && (
                                                    <span className="flex items-center gap-1">
                                                        <CalendarDays size={11} />
                                                        Hasta {new Date(b.fecha_limite + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
                                                    </span>
                                                )}
                                            </div>
                                            {b.descripcion && <p className="text-neutral-500 text-sm mt-3 line-clamp-2 font-light leading-relaxed">{b.descripcion}</p>}
                                            <span className="inline-flex items-center gap-1.5 mt-5 text-[11px] font-semibold tracking-[0.15em] uppercase text-neutral-900 group-hover:gap-2.5 transition-all">
                                                Postularme <ArrowRight size={13} />
                                            </span>
                                        </Link>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="py-16 md:py-20 text-center border border-dashed border-neutral-200 rounded-2xl">
                                <p className="text-neutral-400 text-xs md:text-sm uppercase tracking-[0.4em]">No hay búsquedas abiertas por ahora</p>
                                <Link href="/talent/postular" className="inline-block mt-8 text-[11px] font-semibold tracking-[0.2em] uppercase border border-neutral-900 px-8 py-3.5 hover:bg-neutral-900 hover:text-white transition-colors">Sumate como talento</Link>
                            </div>
                        )}
                    </section>

                    {/* MARCAS QUE ACOMPAÑAMOS */}
                    <section id="marcas" className="mt-16">
                        <div className="bg-neutral-100 py-5 text-center">
                            <h2 className={`${serif.className} text-xl md:text-2xl tracking-[0.25em] uppercase`}>Marcas que acompañamos</h2>
                        </div>
                        <div className="max-w-5xl mx-auto px-6 md:px-10 py-16">
                            {marcas.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-10 gap-y-14 items-center justify-items-center">
                                    {marcas.map(m => {
                                        const logo = <img src={m.logo_url} alt={m.nombre} className="max-h-20 md:max-h-28 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity" />
                                        return m.link
                                            ? <a key={m.id} href={m.link} target="_blank" rel="noreferrer" title={m.nombre} className="block hover:scale-105 transition-transform">{logo}</a>
                                            : <div key={m.id}>{logo}</div>
                                    })}
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
                        <Link href="/talent/terminos" className="inline-block text-[9px] tracking-[0.2em] uppercase text-white/40 hover:text-white/80 transition-colors mt-3 underline underline-offset-4">
                            Términos y Condiciones de Postulación
                        </Link>
                    </footer>
                </>
            )}

            <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar{display:none} .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}` }} />
        </div>
    )
}
