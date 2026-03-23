'use client'

import Link from 'next/link'
import { Play, ArrowLeft } from 'lucide-react'
import { Montserrat } from 'next/font/google'

const montserrat = Montserrat({
    subsets: ['latin'],
    weight: ['400', '700', '900']
})

export default function StreamingPage() {
    const COLOR_HEX = '#D4E655'

    return (
        <div className={`bg-[#050505] text-white selection:bg-[#D4E655] selection:text-black w-full min-h-screen overflow-x-hidden ${montserrat.className}`}>

            {/* Navbar Minimalista para volver */}
            <nav className="absolute top-0 left-0 right-0 z-50 p-6 flex justify-between items-center">
                <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-white transition-colors">
                    <ArrowLeft size={16} /> Volver al Inicio
                </Link>
            </nav>

            {/* --- HERO SECTION --- */}
            <section className="relative w-full pt-32 pb-20 flex flex-col items-center justify-center min-h-[85vh] border-b border-white/5">
                {/* Fondo B/N */}
                <div className="absolute inset-0 bg-zinc-900 overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273177/2A74E257-AE51-4068-8C66-06BE1A53A3CD_2_landlw.png')] bg-cover bg-center grayscale opacity-30"></div>
                    {/* Gradientes para fundir con el negro del resto de la página */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-black/50"></div>
                    <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-transparent opacity-50"></div>
                </div>

                <div className="relative z-10 flex flex-col items-center text-center px-4 w-full max-w-5xl mx-auto mt-10">

                    {/* Título Principal */}
                    <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-10">
                        PISO<span className="text-gray-300">2</span><br />
                        <span className="text-xl md:text-3xl tracking-[0.3em] font-bold text-gray-400">MULTIESPACIO</span>
                    </h1>

                    {/* Logo 2S Streaming */}
                    <div className="flex items-center justify-center gap-2 mb-12">
                        <Play size={60} strokeWidth={1} className="text-[#D4E655]" />
                        <div className="flex flex-col text-left leading-none">
                            <span className="text-6xl md:text-8xl font-black tracking-tighter text-[#D4E655]">2S</span>
                            <span className="text-[#D4E655] font-bold tracking-[0.4em] text-xs md:text-sm pl-1 uppercase">STREAMING</span>
                        </div>
                    </div>

                    {/* Caja Negra de Descripción */}
                    <div className="bg-black/90 backdrop-blur-md px-6 md:px-16 py-8 border border-white/5 w-full max-w-3xl shadow-2xl">
                        <p className="text-gray-300 font-bold text-[10px] md:text-xs tracking-[0.1em] uppercase leading-relaxed text-center">
                            ESPACIO DESTINADO A CREADORES DE CONTENIDO.<br />
                            MARCAS Y AGENCIAS DE PUBLICIDAD.<br />
                            PROGRAMAS EN DIRECTO POR VARIAS PLATAFORMAS<br />
                            PODCASTS Y CONTENIDO ON DEMAND.
                        </p>
                    </div>
                </div>
            </section>

            {/* --- MIDDLE SECTION (Texto + Tarjetas) --- */}
            <section className="max-w-[1400px] mx-auto px-6 py-24 border-b border-white/5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

                    {/* Columna Izquierda: Texto Verde */}
                    <div className="lg:col-span-5 flex flex-col justify-center">
                        <h3 className="text-[#D4E655] text-xl md:text-[22px] font-black uppercase tracking-tight leading-[1.3]">
                            SOMOS EL ÚNICO CANAL DE STREAM<br />
                            <span className="bg-white text-black px-2 py-0.5 mt-1 mb-2 inline-block">DENTRO DE UN MULTIESPACIO</span><br />
                            CON VARIEDAD DE LOCACIONES<br />
                            PARA GENERAR TU CONTENIDO<br />
                            Y EXPANDIR TUS POSIBILIDADES.
                            <br /><br />
                            DONDE TAMBIÉN PODÉS PRODUCIR<br />
                            EVENTOS, VENDER ENTRADAS<br />
                            VIRTUALES<br />
                            Y TRANSMITIR EN DIRECTO.
                        </h3>
                    </div>

                    {/* Columna Derecha: Las 3 Tarjetas (Ajustadas a tu código anterior) */}
                    <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4 h-auto md:h-[450px]">
                        {/* Tarjeta 1 */}
                        <div className="bg-zinc-800 rounded-xl overflow-hidden relative border border-white/10 flex items-end p-4 md:p-5 group hover:border-[#D4E655]/50 transition-colors min-h-[300px]">
                            <img
                                src="https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273186/DSC07164_vi3pne.jpg"
                                alt="Operación Técnica"
                                className="absolute inset-0 w-full h-full object-cover object-[center_30%] opacity-90 group-hover:scale-105 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>

                            <div className="relative z-10 w-full">
                                <h4 className="text-[#D4E655] font-black uppercase tracking-tighter text-xl md:text-2xl leading-[0.85] mb-2 drop-shadow-md">
                                    OPERACIÓN<br />TÉCNICA<br />COMPLETA<br />INCLUIDA
                                </h4>
                                <p className="text-white font-bold uppercase tracking-[0.2em] text-[8px] leading-tight opacity-80">
                                    LUCES + SONIDO + CONSOLA
                                </p>
                            </div>
                        </div>

                        {/* Tarjeta 2 */}
                        <div className="bg-zinc-800 rounded-xl overflow-hidden relative border border-white/10 flex items-end p-4 md:p-5 group hover:border-[#D4E655]/50 transition-colors min-h-[300px]">
                            <img
                                src="https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273061/DSC07309_ctds9m.jpg"
                                alt="Equipamiento HD"
                                className="absolute inset-0 w-full h-full object-cover object-[center_20%] opacity-90 group-hover:scale-105 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>

                            <div className="relative z-10 w-full">
                                <h4 className="text-[#D4E655] font-black uppercase tracking-tighter text-xl md:text-2xl leading-[0.85] mb-2 drop-shadow-md">
                                    EQUI-<br />PAMIENTO<br />PROFESIONAL<br />HD
                                </h4>
                                <p className="text-white font-bold uppercase tracking-[0.2em] text-[8px] leading-tight opacity-80">
                                    MICS + AURIS + CAMARAS
                                </p>
                            </div>
                        </div>

                        {/* Tarjeta 3 */}
                        <div className="bg-zinc-800 rounded-xl overflow-hidden relative border border-white/10 flex items-end p-4 md:p-5 group hover:border-[#D4E655]/50 transition-colors min-h-[300px]">
                            <img
                                src="https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273124/DSC08205_pohing.jpg"
                                alt="Contenido Multiplataforma"
                                className="absolute inset-0 w-full h-full object-cover object-[center_30%] opacity-90 group-hover:scale-105 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>

                            <div className="relative z-10 w-full">
                                <h4 className="text-[#D4E655] font-black uppercase tracking-tighter text-xl md:text-2xl leading-[0.85] mb-2 drop-shadow-md">
                                    CONTE-<br />NIDO<br />MULTI<br />PLATAFORMA
                                </h4>
                                <p className="text-white font-bold uppercase tracking-[0.2em] text-[8px] leading-tight opacity-80">
                                    YOUTUBE + SPOTIFY + TWITCH
                                </p>
                            </div>
                        </div>
                    </div>

                </div>
            </section>

            {/* --- LISTA & FORMULARIO --- */}
            <section className="max-w-[1400px] mx-auto px-6 py-24">
                <h4 className="text-white font-black uppercase text-xl md:text-2xl tracking-tighter mb-16">
                    SET ADAPTADO A DISTINTOS FORMATOS.
                </h4>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">

                    {/* Columna Izquierda: Lista con íconos Play */}
                    <div className="flex flex-col gap-10">
                        {[
                            "STREAMING EN DIRECTO\nY CONTENIDO ON DEMAND",
                            "PODCASTS PARA DISTINTAS\nPLATAFORMAS",
                            "CALIDAD HD DE IMAGEN Y SONIDO",
                            "ILUMINACIÓN PROFESIONAL",
                            "TRANSMISIÓN DE EVENTOS\nEN DIRECTO CON ENTREVISTAS",
                            "PRODUCCIÓN DE CONTENIDO\nPARA TU PROGRAMA"
                        ].map((item, i) => (
                            <div key={i} className="flex items-start gap-4 md:gap-6">
                                <Play size={36} strokeWidth={1} className="text-[#D4E655] shrink-0 mt-[-4px]" />
                                <p className="text-white font-black uppercase text-[15px] md:text-[18px] leading-tight whitespace-pre-line tracking-tight">
                                    {item}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Columna Derecha: Formulario Blanco (Como en la foto) */}
                    <div className="bg-white p-8 md:p-12 h-fit">
                        <form className="flex flex-col gap-8">
                            <div className="border-b border-gray-300 pb-2">
                                <label className="block text-black font-black text-xs uppercase tracking-widest mb-2">NOMBRE:</label>
                                <input type="text" className="w-full bg-transparent outline-none text-black font-bold text-sm" />
                            </div>
                            <div className="border-b border-gray-300 pb-2">
                                <label className="block text-black font-black text-xs uppercase tracking-widest mb-2">TELÉFONO DE CONTACTO:</label>
                                <input type="tel" className="w-full bg-transparent outline-none text-black font-bold text-sm" />
                            </div>
                            <div className="border-b border-gray-300 pb-2 h-32 flex flex-col">
                                <label className="block text-black font-black text-xs uppercase tracking-widest mb-2">DESCRIBÍ TU NECESIDAD:</label>
                                <textarea className="w-full bg-transparent outline-none text-black font-bold text-sm flex-1 resize-none custom-scrollbar"></textarea>
                            </div>

                            {/* Botón de Enviar (Agregado para que sea funcional) */}
                            <button type="submit" className="bg-black text-[#D4E655] font-black uppercase tracking-widest py-4 mt-4 hover:bg-[#D4E655] hover:text-black transition-colors text-sm">
                                ENVIAR CONSULTA
                            </button>
                        </form>
                    </div>

                </div>
            </section>

        </div>
    )
}