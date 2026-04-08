'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { ArrowUpRight, Triangle, Play, ArrowRight, Menu, X, MapPin, Instagram, Mail, InstagramIcon, Loader2, User as UserIcon, MonitorSmartphone } from 'lucide-react'
import { Montserrat } from 'next/font/google'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '700', '900']
})

export default function LandingPage() {
  const [activeSection, setActiveSection] = useState<'2m' | '2e' | '2s'>('2m')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [loggedUser, setLoggedUser] = useState<any>(null)

  // NUEVO: Efecto para buscar si hay sesión activa
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('nombre, rol')
          .eq('id', session.user.id)
          .single()

        const userRole = profile?.rol || 'alumno'
        let destinationUrl = '/explorar'

        if (userRole === 'admin') destinationUrl = '/admin'
        else if (userRole === 'profesor') destinationUrl = '/mis-clases'
        else if (userRole === 'recepcion') destinationUrl = '/caja'

        setLoggedUser({
          nombre: profile?.nombre || session.user.user_metadata?.nombre || 'Mi Perfil',
          url: destinationUrl
        })
      }
    }
    fetchUser()
  }, [])

  const COLOR_HEX = '#D4E655' // Verde Mate Piso2

  // Helper de Estilos (Mantenido intacto)
  const getStyles = (section: '2m' | '2e' | '2s') => {
    const isActive = activeSection === section
    return {
      container: `group cursor-pointer flex flex-col items-center gap-4 transition-all duration-500 relative py-4 px-6 select-none`,
      glow: `absolute top-0 left-1/2 -translate-x-1/2 w-20 h-20 bg-[${COLOR_HEX}]/30 blur-[40px] rounded-full transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`,
      head: `relative w-16 md:w-26 z-10 flex items-center gap-2 text-5xl md:text-6xl tracking-tighter transition-all duration-300 ${isActive ? `text-[${COLOR_HEX}] drop-shadow-[0_0_15px_rgba(212,230,85,0.3)]` : `text-[${COLOR_HEX}]/40`}`,
      strokeWidth: isActive ? 3 : 2,
      labelContainer: `relative z-10 overflow-hidden mt-2`,
      labelSweep: `absolute inset-0 bg-[${COLOR_HEX}] transition-transform duration-500 ease-in-out ${isActive ? 'origin-left scale-x-100' : 'origin-right scale-x-0'}`,
      labelText: `relative z-20 px-2 py-1 text-[10px] font-bold tracking-[0.4em] uppercase transition-colors duration-300 ${isActive ? 'text-black' : `text-[${COLOR_HEX}]`}`
    }
  }

  const scrollTo = (id: string) => {
    setIsMobileMenuOpen(false)
    const element = document.getElementById(id)
    if (element) element.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className={`bg-[#050505] text-white selection:bg-[#D4E655] selection:text-black w-full overflow-x-hidden ${montserrat.className}`}>

      {/* Estilos CSS inyectados para la Marquesina infinita */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 20s linear infinite;
          display: inline-block;
          white-space: nowrap;
        }
      `}} />

      {/* --- NAVBAR --- */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5 h-20">
        <div className="max-w-7xl mx-auto px-6 h-full flex justify-between items-center">
          <img src='/2-verde.png' className="font-black text-2xl tracking-tighter flex items-center gap-1 z-50 relative cursor-pointer w-8 md:w-8" onClick={() => window.scrollTo(0, 0)} />

          <div className="hidden md:flex items-center gap-8 text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">
            <button onClick={() => window.scrollTo(0, 0)} className="hover:text-white transition-colors">Inicio</button>
            <button onClick={() => scrollTo('ecosistema')} className="hover:text-white transition-colors">Ecosistema</button>
            <button onClick={() => scrollTo('alquileres')} className="hover:text-white transition-colors">Salas</button>
            <button onClick={() => scrollTo('contacto')} className="hover:text-white transition-colors">Contacto</button>
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

          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden text-white p-2 z-50 relative focus:outline-none">
            {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </nav>

      {/* --- MENU MOBILE OVERLAY --- */}
      <div className={`fixed inset-0 bg-[#050505] z-40 flex flex-col justify-center items-center gap-8 transition-all duration-300 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <button onClick={() => { window.scrollTo(0, 0); setIsMobileMenuOpen(false) }} className="text-2xl font-black text-white uppercase tracking-widest hover:text-[#D4E655]">Inicio</button>
        <button onClick={() => scrollTo('ecosistema')} className="text-2xl font-black text-gray-500 uppercase tracking-widest hover:text-[#D4E655]">Ecosistema</button>
        <button onClick={() => scrollTo('alquileres')} className="text-2xl font-black text-gray-500 uppercase tracking-widest hover:text-[#D4E655]">Salas</button>
        <button onClick={() => scrollTo('contacto')} className="text-2xl font-black text-gray-500 uppercase tracking-widest hover:text-[#D4E655]">Contacto</button>
        {loggedUser ? (
          <Link href={loggedUser.url} onClick={() => setIsMobileMenuOpen(false)} className="mt-4 px-10 py-4 rounded-full border border-[#D4E655] text-[#D4E655] flex items-center gap-3 text-xl font-black uppercase tracking-widest">
            <UserIcon size={24} /> {loggedUser.nombre}
          </Link>
        ) : (
          <Link href="/login" onClick={() => setIsMobileMenuOpen(false)} className="mt-4 px-10 py-4 rounded-full bg-[#D4E655] text-black text-xl font-black uppercase tracking-widest">
            INGRESAR
          </Link>
        )}
      </div>

      {/* --- HERO SECTION --- */}
      <section className="pt-32 pb-10 md:pt-40 md:pb-20 px-4 min-h-[90vh] flex flex-col justify-center items-center relative overflow-hidden">

        {/* Imagen de fondo 3D (Asegurate de tener este archivo en la carpeta public) */}
        <img
          src="/banner-piso.png"
          alt="Piso 2"
          className="absolute inset-0 w-full h-full object-cover opacity-70 z-0"
        />

        {/* Filtro oscuro para contraste de textos */}
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#050505]/90 via-[#050505]/40 to-[#050505] mix-blend-multiply" />

        <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col items-center text-center">
          <img src='/nombre-completo-verde.png' className="text-[12vw] md:text-[8rem] mb-4 md:mb-8 font-black uppercase tracking-tighter leading-[0.85] text-white" />
          <h3 className="text-[#D4E655] text-xs md:text-sm font-bold tracking-[0.4em] uppercase mb-12 md:mb-36 max-w-3xl leading-relaxed">
            SOMOS UN CENTRO CREATIVO QUE UNE EL MOVIMIENTO, LA TECNOLOGÍA Y LA ESCENA
          </h3>

          {/* MENÚ INTERACTIVO 2M 2E 2S */}
          <div id="ecosistema" className="flex flex-col md:flex-row justify-center items-center gap-12 md:gap-24">
            <div className={getStyles('2m').container} onMouseEnter={() => setActiveSection('2m')} onClick={() => setActiveSection('2m')}>
              <div className={getStyles('2m').glow} />
              <img src='/2M-verde.png' className={getStyles('2m').head} />
              <div className={getStyles('2m').labelContainer}><span className={getStyles('2m').labelSweep}></span><span className={getStyles('2m').labelText}>Movimiento</span></div>
            </div>

            <div className={getStyles('2e').container} onMouseEnter={() => setActiveSection('2e')} onClick={() => setActiveSection('2e')}>
              <div className={getStyles('2e').glow} />
              <img src='/2E-verde.png' className={getStyles('2e').head} />
              <div className={getStyles('2e').labelContainer}><span className={getStyles('2e').labelSweep}></span><span className={getStyles('2e').labelText}>Escena</span></div>
            </div>

            <div className={getStyles('2s').container} onMouseEnter={() => setActiveSection('2s')} onClick={() => setActiveSection('2s')}>
              <div className={getStyles('2s').glow} />
              <img src='/2S-verde.png' className={getStyles('2s').head} />
              <div className={getStyles('2s').labelContainer}><span className={getStyles('2s').labelSweep}></span><span className={getStyles('2s').labelText}>Streaming</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* --- CONTENIDO DINÁMICO (Tus animaciones intactas) --- */}
      <section className="relative w-full border-t border-white/5 bg-[#080808]">
        <div className="max-w-7xl mx-auto min-h-[500px] relative">

          {/* 2M - MOVIMIENTO */}
          <div className={`transition-all duration-700 absolute inset-0 grid grid-cols-1 md:grid-cols-2 ${activeSection === '2m' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="relative h-[300px] md:h-auto bg-zinc-900 overflow-hidden group">
              <div className="absolute inset-0 opacity-40 bg-[url('https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273151/DSC08825_zkshkf.jpg')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700"></div>
              <div className="absolute bottom-8 left-8 text-[#D4E655]"><ArrowUpRight size={140} strokeWidth={1.5} /></div>
            </div>
            <div className="p-10 md:p-16 flex flex-col justify-center">
              <h2 className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-6 leading-[0.9]">Espacio de <br /><span className="text-[#D4E655]">Movimiento.</span></h2>
              <p className="text-gray-400 text-sm md:text-base max-w-md leading-relaxed mb-8 font-medium">Formación profesional, clases regulares y entrenamiento para bailarines. Sé parte de nuestro ecosistema.</p>
              <div><Link href="/login" className="inline-flex items-center gap-3 bg-[#D4E655] text-black font-black uppercase px-8 py-4 hover:bg-white transition-all text-xs tracking-[0.2em]">INGRESAR <ArrowRight size={16} /></Link></div>
            </div>
          </div>

          {/* 2E - ESCENA */}
          <div className={`transition-all duration-700 absolute inset-0 grid grid-cols-1 md:grid-cols-2 ${activeSection === '2e' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="relative h-[300px] md:h-auto bg-zinc-900 overflow-hidden group">
              <div className="absolute inset-0 opacity-40 bg-[url('https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273185/40F11C05-7457-4AD6-A4D9-6EC3FCDB2568_2_yr9lw9.png')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700"></div>
              <div className="absolute bottom-8 left-8 text-[#D4E655]"><Triangle size={140} strokeWidth={1.5} /></div>
            </div>
            <div className="p-10 md:p-16 flex flex-col justify-center">
              <h2 className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-6 leading-[0.9]">Sala de <br /><span className="text-[#D4E655]">Teatro.</span></h2>
              <p className="text-gray-400 text-sm md:text-base max-w-md leading-relaxed mb-8 font-medium">Un espacio íntimo y técnicamente equipado para puestas en escena, ensayos y muestras.</p>
              <div><a href='/escena'><button className="inline-flex items-center gap-3 border border-white/20 hover:border-[#D4E655] text-white font-bold uppercase px-8 py-4 text-xs tracking-[0.2em] transition-colors">MÁS INFO</button></a>
              </div></div>
          </div>

          {/* 2S - STREAMING */}
          <div className={`transition-all duration-700 absolute inset-0 grid grid-cols-1 md:grid-cols-2 ${activeSection === '2s' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="relative h-[300px] md:h-auto bg-zinc-900 overflow-hidden group">
              <div className="absolute inset-0 opacity-40 bg-[url('https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273177/2A74E257-AE51-4068-8C66-06BE1A53A3CD_2_landlw.png')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700"></div>
              <div className="absolute bottom-8 left-8 text-[#D4E655]"><Play size={140} strokeWidth={1.5} /></div>
            </div>
            <div className="p-10 md:p-16 flex flex-col justify-center">
              <h2 className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-6 leading-[0.9]">Estudio <br /><span className="text-[#D4E655]">Digital.</span></h2>
              <p className="text-gray-400 text-sm md:text-base max-w-md leading-relaxed mb-8 font-medium">Transmisión en vivo, grabación de contenidos y producción audiovisual profesional.</p>
              <div><a href='/streaming'><button onClick={() => scrollTo('contacto')} className="inline-flex items-center gap-3 border border-white/20 hover:border-[#D4E655] text-white font-bold uppercase px-8 py-4 text-xs tracking-[0.2em] transition-colors">CONSULTAR</button></a>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* --- SECCIÓN ALQUILERES (SALAS) --- */}
      <section id="alquileres" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="mb-16">
          <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Alquiler de <span className="text-[#D4E655]">Salas</span></h2>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-xs md:text-sm">Espacios diseñados para crear</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="group relative bg-[#111] rounded-2xl overflow-hidden border border-white/10 hover:border-[#D4E655]/50 transition-colors">
            <div className="h-64 bg-zinc-800 overflow-hidden">
              <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1518834107812-67b0b7c58434?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"></div>
            </div>
            <div className="p-8">
              <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">Sede <span className="text-[#D4E655]">Obelisco</span></h3>
              <ul className="space-y-3 text-sm text-gray-400 font-medium mb-8">
                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4E655] rounded-full"></div> 8x10 metros cuadrados</li>
                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4E655] rounded-full"></div> Piso flotante de madera</li>
                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4E655] rounded-full"></div> Espejos frontales y sonido Bluetooth</li>
                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4E655] rounded-full"></div> Aire acondicionado</li>
              </ul>
              <button className="w-full py-4 border border-white/20 font-bold uppercase text-xs tracking-[0.2em] hover:bg-white hover:text-black transition-colors">Consultar Fechas</button>
            </div>
          </div>

          <div className="group relative bg-[#111] rounded-2xl overflow-hidden border border-white/10 hover:border-[#D4E655]/50 transition-colors">
            <div className="h-64 bg-zinc-800 overflow-hidden">
              <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1547153760-18fc86324498?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"></div>
            </div>
            <div className="p-8">
              <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">Sede <span className="text-[#D4E655]">Congreso</span></h3>
              <ul className="space-y-3 text-sm text-gray-400 font-medium mb-8">
                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4E655] rounded-full"></div> 6x8 metros cuadrados</li>
                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4E655] rounded-full"></div> Piso de linóleo profesional</li>
                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4E655] rounded-full"></div> Iluminación cálida / fría regulable</li>
                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4E655] rounded-full"></div> Ideal para grupos reducidos o ensayos</li>
              </ul>
              <button className="w-full py-4 border border-white/20 font-bold uppercase text-xs tracking-[0.2em] hover:bg-white hover:text-black transition-colors">Consultar Fechas</button>
            </div>
          </div>
        </div>
      </section>

      {/* --- SECCIÓN DÓNDE ENCONTRARNOS (Sin Correo) --- */}
      {/* --- SECCIÓN DÓNDE ENCONTRARNOS --- */}
      <section className="bg-[#111] py-24 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">

          {/* Info de Sedes */}
          <div>
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-8 leading-none">
              Dónde <br /><span className="text-[#D4E655]">Encontrarnos.</span>
            </h2>
            <div className="space-y-8">

              {/* Sede Congreso */}
              <div className="flex items-start gap-4">
                <MapPin className="text-[#D4E655] shrink-0" size={32} />
                <div>
                  <p className="font-bold text-xl uppercase text-white mb-1">Sede Congreso</p>
                  <p className="text-gray-400 mb-2">Riobamba 46<br />Buenos Aires, Argentina</p>
                  <a
                    href="https://maps.google.com/?q=Riobamba+46,+Buenos+Aires"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#D4E655] text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Abrir en Google Maps →
                  </a>
                </div>
              </div>

              {/* Sede Obelisco */}
              <div className="flex items-start gap-4">
                <MapPin className="text-[#D4E655] shrink-0" size={32} />
                <div>
                  <p className="font-bold text-xl uppercase text-white mb-1">Sede Obelisco</p>
                  <p className="text-gray-400 mb-2">Teniente General Perón 1467<br />Buenos Aires, Argentina</p>
                  <a
                    href="https://maps.google.com/?q=Teniente+General+Perón+1467,+Buenos+Aires"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#D4E655] text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Abrir en Google Maps →
                  </a>
                </div>
              </div>

              {/* Redes Sociales */}
              <div className="flex gap-4 pt-4">
                <a href="https://www.instagram.com/piso2multiespacio/" target="_blank" rel="noreferrer" className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center hover:bg-[#D4E655] hover:text-black hover:border-[#D4E655] transition-all">
                  <Instagram size={20} />
                </a>
              </div>
            </div>
          </div>

          {/* Mapa Interactivo Google Maps */}
          <div className="h-[400px] w-full bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 relative group">

            {/* iFrame de Google Maps centrado en la zona */}
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3283.9935105267554!2d-58.3888365!3d-34.6043137!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95bccac885970c27%3A0x6b6088d8b9d3380c!2sTte.%20Gral.%20Juan%20D.%20Per%C3%B3n%201467%2C%20C1037ACA%20Cdad.%20Aut%C3%B3noma%20de%20Buenos%20Aires!5e0!3m2!1ses-419!2sar!4v1716382000000!5m2!1ses-419!2sar"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700"
            />

            {/* Etiqueta Flotante (Se desvanece cuando el usuario interactúa con el mapa) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity duration-500">
              <div className="bg-black/80 backdrop-blur-sm px-6 py-3 rounded-full border border-[#D4E655]/50 text-[#D4E655] text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-[0_0_20px_rgba(212,230,85,0.2)]">
                <MapPin size={16} /> Explorar Mapa
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* --- NUEVA SECCIÓN CONTÁCTANOS (WhatsApp / Email) --- */}
      <section id="contacto" className="py-24 px-6 border-t border-white/5 relative overflow-hidden bg-[#080808]">
        {/* Fondo del 2 Gigante (Efecto Glassmorphism) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <span className="text-[300px] md:text-[500px] font-black text-[#D4E655]/5 select-none leading-none">2</span>
        </div>

        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-3 text-center drop-shadow-[0_0_20px_rgba(212,230,85,0.2)] text-[#D4E655]">
            CONTÁCTANOS
          </h2>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-xs md:text-sm text-center mb-16">
            Elegí cómo querés comunicarte con nosotros
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">

            {/* Card WhatsApp */}
            <div className="bg-[#09090b]/60 backdrop-blur-md border border-white/5 hover:border-[#D4E655]/30 rounded-3xl p-10 flex flex-col items-center text-center transition-all duration-300">
              <div className="w-16 h-16 rounded-full border border-[#D4E655]/30 flex items-center justify-center mb-6 bg-[#D4E655]/5 shadow-[0_0_20px_rgba(212,230,85,0.1)]">
                {/* SVG Oficial de WhatsApp */}
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" className="text-[#D4E655]">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.405-.883-.733-1.48-1.638-1.653-1.935-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
              </div>
              <h3 className="text-2xl font-black uppercase tracking-widest text-white mb-4">WhatsApp</h3>
              <p className="text-gray-400 text-[10px] uppercase font-bold tracking-widest leading-relaxed mb-8 max-w-[200px]">
                Escribinos para una respuesta rápida y personalizada.
              </p>
              <a href="https://wa.me/5491112345678" target="_blank" rel="noreferrer" className="mt-auto w-full md:w-auto inline-flex items-center justify-center gap-3 border border-white/20 hover:border-[#D4E655] text-[#D4E655] font-black uppercase px-8 py-3.5 text-xs tracking-[0.2em] rounded-xl hover:bg-white/5 transition-all">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.405-.883-.733-1.48-1.638-1.653-1.935-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>
                Abrir Chat
              </a>
            </div>

            {/* Card Email */}
            <div className="bg-[#09090b]/60 backdrop-blur-md border border-white/5 hover:border-[#D4E655]/30 rounded-3xl p-10 flex flex-col items-center text-center transition-all duration-300 relative">
              <div className="w-16 h-16 rounded-full border border-[#D4E655]/30 flex items-center justify-center mb-6 bg-[#D4E655]/5 shadow-[0_0_20px_rgba(212,230,85,0.1)]">
                <Mail className="text-[#D4E655]" size={28} />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-widest text-white mb-4">Email</h3>
              <p className="text-gray-400 text-[10px] uppercase font-bold tracking-widest leading-relaxed mb-6 max-w-[200px]">
                Contactanos mediante nuestro mail
              </p>
              <div className="w-full bg-[#111]/80 border border-white/10 rounded-lg p-3 mb-6">
                <span className="text-gray-400 font-mono text-[11px] tracking-wider">multiespaciopiso2@gmail.com</span>
              </div>
              <a href="mailto:multiespaciopiso2@gmail.com" className="mt-auto w-full inline-flex items-center justify-center gap-3 bg-[#D4E655] text-black font-black uppercase px-8 py-3.5 text-xs tracking-[0.2em] rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(212,230,85,0.15)]">
                <Mail size={16} /> Contactar
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* --- FOOTER GIGANTE / CALL TO ACTION --- */}
      {/* --- FOOTER GIGANTE / CALL TO ACTION --- */}
      <footer className="w-full bg-[#D4E655] text-black text-center pt-24 pb-12 px-6 flex flex-col items-center">
        <h2 className="text-4xl md:text-8xl font-black uppercase tracking-tighter mb-8 max-w-5xl leading-[0.85]">
          Descubrí tu <br />lado Piso2
        </h2>

        {loggedUser ? (
          <Link href={loggedUser.url} className="bg-black text-white px-12 py-5 rounded-full text-sm font-black uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-all mb-12 shadow-2xl flex items-center gap-2">
            <UserIcon size={18} /> IR A MI PANEL
          </Link>
        ) : (
          <Link href="/login" className="bg-black text-white px-12 py-5 rounded-full text-sm font-black uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-all mb-12 shadow-2xl">
            UNIRSE AHORA
          </Link>
        )}

        {/* 👈 NUEVO BOTÓN DE INSTALACIÓN */}
        <Link href="/instalar" className="flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-16 border border-black/20 px-6 py-3 rounded-full hover:bg-black hover:text-[#D4E655] transition-colors">
          <MonitorSmartphone size={16} /> ¿Cómo instalar la App?
        </Link>

        <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-50">
          Piso 2 Multiespacio © {new Date().getFullYear()} • Todos los derechos reservados
        </p>
      </footer>

    </div>
  )
} 