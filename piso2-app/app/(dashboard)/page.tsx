'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowUpRight, Triangle, Play, ArrowRight, Menu, X } from 'lucide-react'
import { Montserrat } from 'next/font/google'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '700', '900']
})

export default function LandingPage() {
  const [activeSection, setActiveSection] = useState<'2m' | '2e' | '2s'>('2m')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false) // Nuevo estado para el menú

  const COLOR_HEX = '#D4E655'; // Verde Mate

  // Helper de Estilos
  const getStyles = (section: '2m' | '2e' | '2s') => {
    const isActive = activeSection === section
    return {
      container: `group cursor-pointer flex flex-col items-center gap-4 transition-all duration-500 relative py-4 px-6 select-none`,
      glow: `absolute top-0 left-1/2 -translate-x-1/2 w-20 h-20 bg-[${COLOR_HEX}]/30 blur-[40px] rounded-full transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`,
      head: `relative z-10 flex items-center gap-2 text-5xl md:text-6xl tracking-tighter transition-all duration-300 ${isActive ? `text-[${COLOR_HEX}] drop-shadow-[0_0_15px_rgba(212,230,85,0.3)]` : `text-[${COLOR_HEX}]/40`}`,
      strokeWidth: isActive ? 3 : 2,
      labelContainer: `relative z-10 overflow-hidden mt-2`,
      labelSweep: `absolute inset-0 bg-[${COLOR_HEX}] transition-transform duration-500 ease-in-out ${isActive ? 'origin-left scale-x-100' : 'origin-right scale-x-0'}`,
      labelText: `relative z-20 px-2 py-1 text-[10px] font-bold tracking-[0.4em] uppercase transition-colors duration-300 ${isActive ? 'text-black' : `text-[${COLOR_HEX}]`}`
    }
  }

  return (
    // Quitamos overflow-x-hidden y min-h-screen de aquí para evitar conflictos con layout.tsx
    <div className={`bg-[#050505] text-white selection:bg-[#D4E655] selection:text-black w-full ${montserrat.className}`}>

      {/* --- NAVBAR --- */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/5 h-20">
        <div className="max-w-7xl mx-auto px-6 h-full flex justify-between items-center">

          {/* Logo */}
          <div className="font-black text-2xl tracking-tighter flex items-center gap-1 z-50 relative">
            PISO<span className="text-[#D4E655]">2</span>
          </div>

          {/* MENU DESKTOP (Oculto en celular) */}
          <div className="hidden md:flex items-center gap-8 text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">
            <Link href="/" className="text-white cursor-default">Inicio</Link>
            <Link href="#" className="hover:text-white transition-colors">Nosotros</Link>
            <Link href="#" className="hover:text-white transition-colors">Sedes</Link>
            <Link href="/login" className="ml-4 px-8 py-2 rounded-full border border-[#D4E655]/50 text-[#D4E655] hover:bg-[#D4E655] hover:text-black transition-all duration-300 shadow-[0_0_10px_rgba(212,230,85,0.1)] hover:shadow-[0_0_20px_rgba(212,230,85,0.4)]">
              INGRESAR
            </Link>
          </div>

          {/* BOTÓN HAMBURGUESA (Visible solo en celular) */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden text-white p-2 z-50 relative focus:outline-none"
          >
            {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </nav>

      {/* --- MENU MOBILE OVERLAY --- */}
      {/* Se despliega sobre todo cuando isMobileMenuOpen es true */}
      <div className={`fixed inset-0 bg-black z-40 flex flex-col justify-center items-center gap-8 transition-all duration-300 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="text-2xl font-black text-white uppercase tracking-widest hover:text-[#D4E655]">Inicio</Link>
        <Link href="#" onClick={() => setIsMobileMenuOpen(false)} className="text-2xl font-black text-gray-500 uppercase tracking-widest hover:text-[#D4E655]">Nosotros</Link>
        <Link href="#" onClick={() => setIsMobileMenuOpen(false)} className="text-2xl font-black text-gray-500 uppercase tracking-widest hover:text-[#D4E655]">Sedes</Link>
        <Link href="/login" onClick={() => setIsMobileMenuOpen(false)} className="mt-4 px-10 py-4 rounded-full bg-[#D4E655] text-black text-xl font-black uppercase tracking-widest">
          INGRESAR
        </Link>
      </div>


      {/* --- HERO SECTION --- */}
      <section className="pt-32 pb-10 md:pt-40 md:pb-20 px-4 flex justify-center min-h-[50vh] items-center">
        <div className="max-w-5xl w-full flex flex-col md:flex-row justify-between items-center gap-12 md:gap-0 px-4 md:px-8">

          {/* 2M */}
          <div className={getStyles('2m').container} onMouseEnter={() => setActiveSection('2m')} onClick={() => setActiveSection('2m')}>
            <div className={getStyles('2m').glow} />
            <div className={getStyles('2m').head}>
              <ArrowUpRight size={44} strokeWidth={getStyles('2m').strokeWidth} />
              <span className="font-black">2M</span>
            </div>
            <div className={getStyles('2m').labelContainer}>
              <span className={getStyles('2m').labelSweep}></span>
              <span className={getStyles('2m').labelText}>Movimiento</span>
            </div>
          </div>

          {/* 2E */}
          <div className={getStyles('2e').container} onMouseEnter={() => setActiveSection('2e')} onClick={() => setActiveSection('2e')}>
            <div className={getStyles('2e').glow} />
            <div className={getStyles('2e').head}>
              <Triangle size={34} strokeWidth={getStyles('2e').strokeWidth} className="-mt-1" />
              <span className="font-black">2E</span>
            </div>
            <div className={getStyles('2e').labelContainer}>
              <span className={getStyles('2e').labelSweep}></span>
              <span className={getStyles('2e').labelText}>Escena</span>
            </div>
          </div>

          {/* 2S */}
          <div className={getStyles('2s').container} onMouseEnter={() => setActiveSection('2s')} onClick={() => setActiveSection('2s')}>
            <div className={getStyles('2s').glow} />
            <div className={getStyles('2s').head}>
              <Play size={34} strokeWidth={getStyles('2s').strokeWidth} className="fill-transparent ml-1" />
              <span className="font-black">2S</span>
            </div>
            <div className={getStyles('2s').labelContainer}>
              <span className={getStyles('2s').labelSweep}></span>
              <span className={getStyles('2s').labelText}>Streaming</span>
            </div>
          </div>

        </div>
      </section>

      {/* --- CONTENIDO DINÁMICO --- */}
      <section className="relative w-full border-t border-white/5 bg-[#080808]">
        <div className="max-w-7xl mx-auto min-h-[500px] relative">

          {/* 2M - MOVIMIENTO */}
          <div className={`transition-all duration-700 absolute inset-0 grid grid-cols-1 md:grid-cols-2 ${activeSection === '2m' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="relative h-[300px] md:h-auto bg-zinc-900 overflow-hidden group">
              <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=2069&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700"></div>
              <div className="absolute bottom-8 left-8 text-[#D4E655]">
                <ArrowUpRight size={140} strokeWidth={1.5} />
              </div>
            </div>
            <div className="p-10 md:p-16 flex flex-col justify-center">
              <h2 className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-6 leading-[0.9]">
                Espacio de <br /><span className="text-[#D4E655]">Movimiento.</span>
              </h2>
              <p className="text-gray-400 text-sm md:text-base max-w-md leading-relaxed mb-8 font-medium">
                Formación profesional, clases regulares y entrenamiento para bailarines. Sé parte de nuestro ecosistema.
              </p>
              <div>
                <Link href="/login" className="inline-flex items-center gap-3 bg-[#D4E655] text-black font-black uppercase px-8 py-4 hover:bg-white transition-all text-xs tracking-[0.2em]">
                  INGRESAR <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>

          {/* 2E - ESCENA */}
          <div className={`transition-all duration-700 absolute inset-0 grid grid-cols-1 md:grid-cols-2 ${activeSection === '2e' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="relative h-[300px] md:h-auto bg-zinc-900 overflow-hidden group">
              <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1503095392237-fc785880c451?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700"></div>
              <div className="absolute bottom-8 left-8 text-[#D4E655]">
                <Triangle size={140} strokeWidth={1.5} />
              </div>
            </div>
            <div className="p-10 md:p-16 flex flex-col justify-center">
              <h2 className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-6 leading-[0.9]">
                Sala de <br /><span className="text-[#D4E655]">Teatro.</span>
              </h2>
              <p className="text-gray-400 text-sm md:text-base max-w-md leading-relaxed mb-8 font-medium">
                Un espacio íntimo y técnicamente equipado para puestas en escena, ensayos y muestras.
              </p>
              <div>
                <button disabled className="inline-flex items-center gap-3 border border-white/20 text-gray-500 font-bold uppercase px-8 py-4 text-xs tracking-[0.2em] cursor-not-allowed">
                  Próximamente
                </button>
              </div>
            </div>
          </div>

          {/* 2S - STREAMING */}
          <div className={`transition-all duration-700 absolute inset-0 grid grid-cols-1 md:grid-cols-2 ${activeSection === '2s' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="relative h-[300px] md:h-auto bg-zinc-900 overflow-hidden group">
              <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1598550476439-c9202113170c?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700"></div>
              <div className="absolute bottom-8 left-8 text-[#D4E655]">
                <Play size={140} strokeWidth={1.5} />
              </div>
            </div>
            <div className="p-10 md:p-16 flex flex-col justify-center">
              <h2 className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-6 leading-[0.9]">
                Estudio <br /><span className="text-[#D4E655]">Digital.</span>
              </h2>
              <p className="text-gray-400 text-sm md:text-base max-w-md leading-relaxed mb-8 font-medium">
                Transmisión en vivo, grabación de contenidos y producción audiovisual profesional.
              </p>
              <div>
                <button disabled className="inline-flex items-center gap-3 border border-white/20 text-gray-500 font-bold uppercase px-8 py-4 text-xs tracking-[0.2em] cursor-not-allowed">
                  Próximamente
                </button>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Footer Fijo al fondo del contenido, no fixed a la pantalla para evitar scroll tapado */}
      <footer className="w-full py-8 text-center text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em] bg-black mt-[500px]">
        Piso 2 Multiespacio © 2026
      </footer>

    </div>
  )
}