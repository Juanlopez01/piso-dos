'use client'

import Link from 'next/link'
import { ArrowLeft, Share, PlusSquare, MoreVertical, MonitorSmartphone, Copy, Check } from 'lucide-react'
import { useState } from 'react'

export default function InstalarAppPage() {
    const [copiado, setCopiado] = useState(false)

    const copiarLink = () => {
        navigator.clipboard.writeText(window.location.origin)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
    }

    return (
        <div className="bg-[#050505] text-white min-h-screen selection:bg-[#D4E655] selection:text-black">

            {/* Navbar Minimalista */}
            <nav className="p-6 flex justify-between items-center relative z-50">
                <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-white transition-colors">
                    <ArrowLeft size={16} /> Volver
                </Link>
            </nav>

            {/* Cabecera */}
            <header className="max-w-3xl mx-auto px-6 pt-10 pb-16 text-center">
                <div className="w-20 h-20 bg-[#D4E655]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#D4E655]/30 shadow-[0_0_30px_rgba(212,230,85,0.2)]">
                    <MonitorSmartphone className="text-[#D4E655]" size={36} strokeWidth={1.5} />
                </div>
                <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-4 leading-none">
                    Llevá <span className="text-[#D4E655]">Piso 2</span><br />en tu celular
                </h1>
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs md:text-sm leading-relaxed max-w-xl mx-auto mb-8">
                    Instalá nuestra Web App para reservar clases, gestionar tus créditos y enterarte de todo al instante. No ocupa espacio.
                </p>

                {/* Botón Anti-Navegador de Instagram */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 mb-8 inline-block max-w-md w-full text-left">
                    <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-2">⚠️ Atención</p>
                    <p className="text-sm text-gray-300 mb-4 font-medium">Si abriste este link desde Instagram, tenés que copiarlo y pegarlo en Chrome o Safari para poder instalar la app.</p>
                    <button
                        onClick={copiarLink}
                        className="w-full bg-blue-500 text-white font-black uppercase py-3 rounded-xl text-xs tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-blue-600"
                    >
                        {copiado ? <Check size={16} /> : <Copy size={16} />}
                        {copiado ? 'Enlace Copiado' : 'Copiar Enlace'}
                    </button>
                </div>
            </header>

            {/* Instrucciones */}
            <section className="max-w-5xl mx-auto px-6 pb-32">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">

                    {/* TARJETA iPHONE */}
                    <div className="bg-[#111] border border-white/10 rounded-3xl p-8 md:p-10 relative overflow-hidden group hover:border-white/30 transition-colors">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                        <h3 className="text-2xl font-black uppercase tracking-widest mb-8 flex items-center gap-3">
                            <svg viewBox="0 0 384 512" width="24" height="24" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" /></svg>
                            iPhone
                        </h3>

                        <div className="space-y-8 relative z-10">
                            <div className="flex items-start gap-4">
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black text-sm shrink-0">1</div>
                                <div>
                                    <p className="font-bold text-sm text-white mb-2">Abrí este link en <b>Safari</b>.</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black text-sm shrink-0">2</div>
                                <div>
                                    <p className="font-bold text-sm text-white mb-2">Tocá el botón de <span className="text-[#D4E655]">Compartir</span> en la barra inferior.</p>
                                    <div className="bg-white/5 border border-white/10 w-fit px-4 py-2 rounded-lg text-gray-400 mt-2">
                                        <Share size={20} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black text-sm shrink-0">3</div>
                                <div>
                                    <p className="font-bold text-sm text-white mb-2">Elegí la opción <span className="text-[#D4E655]">"Agregar a inicio"</span>.</p>
                                    <div className="bg-white/5 border border-white/10 w-fit px-4 py-2 rounded-lg text-gray-400 mt-2 flex items-center gap-2">
                                        <PlusSquare size={18} /> Agregar a inicio
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* TARJETA ANDROID */}
                    <div className="bg-[#111] border border-white/10 rounded-3xl p-8 md:p-10 relative overflow-hidden group hover:border-[#D4E655]/30 transition-colors">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-[#D4E655]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                        <h3 className="text-2xl font-black uppercase tracking-widest mb-8 flex items-center gap-3 text-[#D4E655]">
                            <svg viewBox="0 0 512 512" width="24" height="24" fill="currentColor"><path d="M325.3 234.3c-25.3 0-45.7 20.4-45.7 45.7s20.4 45.7 45.7 45.7 45.7-20.4 45.7-45.7-20.4-45.7-45.7-45.7zM186.7 234.3c-25.3 0-45.7 20.4-45.7 45.7s20.4 45.7 45.7 45.7 45.7-20.4 45.7-45.7-20.4-45.7-45.7-45.7zM507.1 214.5l-44.4-76.9c-2.3-3.9-7.2-5.3-11.1-2.9l-43.5 25.1C361.3 140.6 310.2 128 256 128c-54.2 0-105.3 12.6-152.1 31.8l-43.5-25.1c-3.9-2.3-8.9-1-11.1 2.9L5 214.5c-2.3 3.9-1 8.9 2.9 11.1l44.1 25.5C21.7 296 0 357.2 0 426.7h512c0-69.5-21.7-130.7-52-175.6l44.1-25.5c4-2.2 5.3-7.2 3-11.1z" /></svg>
                            Android
                        </h3>

                        <div className="space-y-8 relative z-10">
                            <div className="flex items-start gap-4">
                                <div className="w-8 h-8 rounded-full bg-[#D4E655]/10 text-[#D4E655] flex items-center justify-center font-black text-sm shrink-0 border border-[#D4E655]/20">1</div>
                                <div>
                                    <p className="font-bold text-sm text-white mb-2">Abrí este link en <b>Google Chrome</b>.</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-8 h-8 rounded-full bg-[#D4E655]/10 text-[#D4E655] flex items-center justify-center font-black text-sm shrink-0 border border-[#D4E655]/20">2</div>
                                <div>
                                    <p className="font-bold text-sm text-white mb-2">Tocá el menú de <span className="text-[#D4E655]">tres puntitos</span> arriba a la derecha.</p>
                                    <div className="bg-white/5 border border-white/10 w-fit px-4 py-2 rounded-lg text-gray-400 mt-2">
                                        <MoreVertical size={20} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-8 h-8 rounded-full bg-[#D4E655]/10 text-[#D4E655] flex items-center justify-center font-black text-sm shrink-0 border border-[#D4E655]/20">3</div>
                                <div>
                                    <p className="font-bold text-sm text-white mb-2">Elegí <span className="text-[#D4E655]">"Instalar aplicación"</span> o "Agregar a inicio".</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </section>
        </div>
    )
}