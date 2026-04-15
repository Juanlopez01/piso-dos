'use client'

import { MapPin, Clock, Smartphone, Music, ArrowRight, Instagram } from 'lucide-react'
import { Montserrat } from 'next/font/google'
import Link from 'next/link'

const montserrat = Montserrat({
    subsets: ['latin'],
    weight: ['400', '700', '900']
})

export default function AlquileresPage() {
    return (
        <div className={`bg-[#050505] min-h-screen text-white selection:bg-[#D4E655] selection:text-black w-full overflow-x-hidden ${montserrat.className}`}>

            {/* --- HEADER SECCIÓN --- */}
            <section className="pt-32 pb-16 px-6 max-w-7xl mx-auto">
                <div className="mb-16 text-center md:text-left">
                    <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter mb-4 leading-none text-white">
                        Alquiler de <br /><span className="text-[#D4E655]">Salas.</span>
                    </h1>
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs md:text-sm max-w-2xl">
                        Espacios técnicamente equipados para ensayos, clases privadas, producciones y castings en el corazón de Buenos Aires.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Sede Obelisco */}
                    <div className="group relative bg-[#09090b] rounded-3xl overflow-hidden border border-white/5 hover:border-[#D4E655]/30 transition-all duration-500 shadow-2xl">
                        <div className="h-80 overflow-hidden relative">
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1518834107812-67b0b7c58434?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"></div>
                            <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] to-transparent"></div>
                        </div>
                        <div className="p-10 relative mt--20">
                            <h3 className="text-4xl font-black uppercase tracking-tighter mb-6">Sede <span className="text-[#D4E655]">Obelisco</span></h3>
                            <ul className="space-y-4 text-sm text-gray-400 font-medium mb-10">
                                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-[#D4E655] rounded-full"></div> 8x10 metros cuadrados</li>
                                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-[#D4E655] rounded-full"></div> Piso flotante de madera premium</li>
                                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-[#D4E655] rounded-full"></div> Sistema de sonido Bluetooth profesional</li>
                                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-[#D4E655] rounded-full"></div> Climatización frío/calor</li>
                            </ul>
                            <a href="https://wa.me/5491112345678?text=Hola! Me interesa alquilar en Sede Obelisco" target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-3 bg-[#D4E655] text-black font-black uppercase px-8 py-5 hover:bg-white transition-all text-xs tracking-[0.2em] rounded-2xl shadow-[0_0_20px_rgba(212,230,85,0.2)]">
                                CONSULTAR DISPONIBILIDAD <ArrowRight size={16} />
                            </a>
                        </div>
                    </div>

                    {/* Sede Congreso */}
                    <div className="group relative bg-[#09090b] rounded-3xl overflow-hidden border border-white/5 hover:border-[#D4E655]/30 transition-all duration-500 shadow-2xl">
                        <div className="h-80 overflow-hidden relative">
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1547153760-18fc86324498?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"></div>
                            <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] to-transparent"></div>
                        </div>
                        <div className="p-10 relative mt--20">
                            <h3 className="text-4xl font-black uppercase tracking-tighter mb-6">Sede <span className="text-[#D4E655]">Congreso</span></h3>
                            <ul className="space-y-4 text-sm text-gray-400 font-medium mb-10">
                                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-[#D4E655] rounded-full"></div> 6x8 metros cuadrados</li>
                                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-[#D4E655] rounded-full"></div> Piso de linóleo profesional</li>
                                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-[#D4E655] rounded-full"></div> Iluminación regulable (Cálida/Fría)</li>
                                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-[#D4E655] rounded-full"></div> Ideal para grupos reducidos o ensayos íntimos</li>
                            </ul>
                            <a href="https://wa.me/5491112345678?text=Hola! Me interesa alquilar en Sede Congreso" target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-3 bg-[#D4E655] text-black font-black uppercase px-8 py-5 hover:bg-white transition-all text-xs tracking-[0.2em] rounded-2xl shadow-[0_0_20px_rgba(212,230,85,0.2)]">
                                CONSULTAR DISPONIBILIDAD <ArrowRight size={16} />
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- BANNER INFORMATIVO --- */}
            <section className="py-20 bg-[#D4E655] text-black overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                    <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-none">
                        ¿Necesitás una <br />sala fija por mes?
                    </h2>
                    <p className="text-sm font-bold uppercase tracking-widest max-w-sm">
                        Consultanos por convenios especiales para profesores y compañías que busquen regularidad.
                    </p>
                    <a href="mailto:multiespaciopiso2@gmail.com" className="bg-black text-white px-10 py-5 rounded-full text-xs font-black uppercase tracking-widest hover:scale-105 transition-transform">
                        ENVIAR MAIL
                    </a>
                </div>
                <span className="absolute -bottom-10 -right-10 text-[200px] font-black opacity-10 leading-none select-none">P2</span>
            </section>
        </div>
    )
}