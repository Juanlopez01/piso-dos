'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { ArrowRight, User as UserIcon, X, Menu } from 'lucide-react'
import { Montserrat } from 'next/font/google'
import Link from 'next/link'

const montserrat = Montserrat({
    subsets: ['latin'],
    weight: ['400', '700', '900']
})

export default function AlquileresPage() {
    const supabase = createClient()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [loggedUser, setLoggedUser] = useState<{ nombre: string, url: string } | null>(null)

    // Chequeamos si el usuario está logueado para mostrar el botón de perfil o el de ingresar
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('nombre_completo, rol')
                    .eq('id', session.user.id)
                    .maybeSingle()

                if (profile) {
                    // Agarramos solo el primer nombre
                    const primerNombre = profile.nombre_completo?.split(' ')[0] || 'USUARIO'

                    // Definimos a dónde lo manda el botón según su rol
                    const rol = profile.rol || 'alumno'
                    let urlPanel = '/explorar'
                    if (rol === 'admin') urlPanel = '/admin'
                    else if (rol === 'profesor') urlPanel = '/mis-clases'
                    else if (rol === 'recepcion') urlPanel = '/caja'

                    setLoggedUser({ nombre: primerNombre, url: urlPanel })
                }
            }
        }
        checkSession()
    }, [supabase])

    return (
        <div className={`bg-[#050505] min-h-screen text-white selection:bg-[#D4E655] selection:text-black w-full overflow-x-hidden ${montserrat.className}`}>

            {/* --- NAVBAR --- */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5 h-20">
                <div className="max-w-7xl mx-auto px-6 h-full flex justify-between items-center">
                    <Link href="/" className="font-black text-2xl tracking-tighter flex items-center gap-1 z-50 relative">
                        PISO<span className="text-[#D4E655]">2</span>
                    </Link>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center gap-8 text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">
                        <Link href="/" className="hover:text-white transition-colors">Inicio</Link>
                        <Link href="/#nosotros" className="hover:text-white transition-colors">Nosotros</Link>
                        <Link href="/alquiler" className="text-[#D4E655] cursor-default">Alquileres</Link>
                        {loggedUser ? (
                            <Link href={loggedUser.url} className="ml-4 px-6 py-2 rounded-full border border-[#D4E655]/50 bg-[#D4E655]/10 text-[#D4E655] hover:bg-[#D4E655] hover:text-black transition-all duration-300 shadow-[0_0_10px_rgba(212,230,85,0.1)] hover:shadow-[0_0_20px_rgba(212,230,85,0.4)] flex items-center gap-2">
                                <UserIcon size={14} /> HOLA, {loggedUser.nombre.toUpperCase()}
                            </Link>
                        ) : (
                            <Link href="/login" className="ml-4 px-8 py-2 rounded-full border border-[#D4E655]/50 text-[#D4E655] hover:bg-[#D4E655] hover:text-black transition-all duration-300 shadow-[0_0_10px_rgba(212,230,85,0.1)] hover:shadow-[0_0_20px_rgba(212,230,85,0.4)]">
                                INGRESAR
                            </Link>
                        )}
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden text-white p-2 z-50">
                        {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
                    </button>
                </div>
            </nav>

            {/* --- MENÚ DESPLEGABLE MOBILE --- */}
            <div className={`fixed inset-0 z-40 bg-[#050505] transition-transform duration-500 ease-in-out md:hidden ${isMobileMenuOpen ? 'translate-y-0' : '-translate-y-full'}`}>
                <div className="flex flex-col items-center justify-center h-full gap-8 text-sm font-black tracking-[0.2em] text-gray-400 uppercase">
                    <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-white transition-colors">Inicio</Link>
                    <Link href="/#nosotros" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-white transition-colors">Nosotros</Link>
                    <Link href="/alquileres" onClick={() => setIsMobileMenuOpen(false)} className="text-[#D4E655]">Alquileres</Link>

                    <div className="w-12 h-px bg-white/10 my-4"></div>

                    {loggedUser ? (
                        <Link href={loggedUser.url} onClick={() => setIsMobileMenuOpen(false)} className="px-8 py-3 rounded-full border border-[#D4E655]/50 bg-[#D4E655]/10 text-[#D4E655] flex items-center gap-2">
                            <UserIcon size={16} /> HOLA, {loggedUser.nombre.toUpperCase()}
                        </Link>
                    ) : (
                        <Link href="/login" onClick={() => setIsMobileMenuOpen(false)} className="px-10 py-3 rounded-full border border-[#D4E655]/50 text-[#D4E655]">
                            INGRESAR
                        </Link>
                    )}
                </div>
            </div>

            {/* --- HEADER SECCIÓN --- */}
            <section className="pt-32 pb-16 px-6 max-w-7xl mx-auto mt-10">
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
                            <div className="absolute inset-0 bg-[url('https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273186/D6322754-9700-4B2F-BB10-9D5622F2B37D_2_oomwdp.png')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"></div>
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
                            <a href="https://wa.me/549171190301?text=Hola! Me interesa alquilar en Sede Obelisco" target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-3 bg-[#D4E655] text-black font-black uppercase px-8 py-5 hover:bg-white transition-all text-xs tracking-[0.2em] rounded-2xl shadow-[0_0_20px_rgba(212,230,85,0.2)]">
                                CONSULTAR DISPONIBILIDAD <ArrowRight size={16} />
                            </a>
                        </div>
                    </div>

                    {/* Sede Congreso */}
                    <div className="group relative bg-[#09090b] rounded-3xl overflow-hidden border border-white/5 hover:border-[#D4E655]/30 transition-all duration-500 shadow-2xl">
                        <div className="h-80 overflow-hidden relative">
                            <div className="absolute inset-0 bg-[url('https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273186/D6322754-9700-4B2F-BB10-9D5622F2B37D_2_oomwdp.png')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"></div>
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
                            <a href="https://wa.me/549171190301?text=Hola! Me interesa alquilar en Sede Congreso" target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-3 bg-[#D4E655] text-black font-black uppercase px-8 py-5 hover:bg-white transition-all text-xs tracking-[0.2em] rounded-2xl shadow-[0_0_20px_rgba(212,230,85,0.2)]">
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
                    <a href="mailto:multiespaciopiso2@gmail.com" className="bg-black text-white px-10 py-5 rounded-full text-xs font-black uppercase tracking-widest hover:scale-105 transition-transform shrink-0">
                        ENVIAR MAIL
                    </a>
                </div>
                <span className="absolute -bottom-10 -right-10 text-[200px] font-black opacity-10 leading-none select-none pointer-events-none">P2</span>
            </section>
        </div>
    )
}