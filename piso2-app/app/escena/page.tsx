'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Triangle, X, Menu, ArrowUpRight, UserIcon } from 'lucide-react'
import { Montserrat } from 'next/font/google'
import { createClient } from '@/utils/supabase/client'

const montserrat = Montserrat({
    subsets: ['latin'],
    weight: ['400', '700', '900']
})



export default function EscenaPage() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [lightboxImg, setLightboxImg] = useState<string | null>(null)
    const [loggedUser, setLoggedUser] = useState<any>(null)

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


    const salas = [
        { id: 1, nombre: 'SALA BLANCA', img: 'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273186/D6322754-9700-4B2F-BB10-9D5622F2B37D_2_oomwdp.png' },
        { id: 2, nombre: 'SALA NEGRA', img: 'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273185/40F11C05-7457-4AD6-A4D9-6EC3FCDB2568_2_yr9lw9.png' },
        { id: 3, nombre: 'SALA COMPLETA', img: 'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273213/50E7A27C-DAA6-4DB9-B6F2-254CFEBAEF14_2_av71vm.png' },
        { id: 4, nombre: 'PASILLO SUBSUELO', img: 'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273212/IMG_0556_2_mwuo4s.jpg' } // Idealmente una foto con luz roja
    ]

    const galeria = [
        'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273164/DSC08820_fkpapk.jpg',
        'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273186/DSC09012_qoytmx.jpg',
        'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273186/5461029F-2CA2-4B36-ABDB-52CEE6B6EECE_2_cfua07.jpg',
        'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273163/DSC08549_jauf3a.jpg',
        'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273212/5C318F3E-0064-4DD1-802A-2301A6115FA6_2_iwwqs2.jpg'
    ]

    return (
        <div className={`min-h-screen bg-[#050505] text-white selection:bg-[#D4E655] selection:text-black font-sans overflow-x-hidden ${montserrat.className}`}>

            {/* --- NAVBAR --- */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5 h-20">
                <div className="max-w-7xl mx-auto px-6 h-full flex justify-between items-center">
                    <Link href="/" className="font-black text-2xl tracking-tighter flex items-center gap-1 z-50 relative">
                        PISO<span className="text-[#D4E655]">2</span>
                    </Link>
                    <div className="hidden md:flex items-center gap-8 text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">
                        <Link href="/" className="hover:text-white transition-colors">Inicio</Link>
                        <Link href="/#nosotros" className="hover:text-white transition-colors">Nosotros</Link>
                        <Link href="/#alquileres" className="hover:text-white transition-colors">Alquileres</Link>
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
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden text-white p-2 z-50">
                        {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
                    </button>
                </div>
            </nav>

            {/* --- HERO SECTION --- */}
            <section className="relative min-h-[90vh] flex flex-col items-center justify-center pt-20">
                {/* Background Image (Black & White) */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-[url('https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273212/escenico_kqpvv1.jpg')] bg-cover bg-center grayscale opacity-50"></div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-black/40 to-transparent"></div>
                </div>

                <div className="relative z-10 text-center flex flex-col items-center px-4">
                    <div className="flex items-center gap-2 text-[#D4E655] mb-2 drop-shadow-[0_0_20px_rgba(212,230,85,0.4)]">
                        <Triangle size={100} strokeWidth={2} className="-mt-4" />
                        <span className="text-[8rem] md:text-[12rem] font-black tracking-tighter leading-none">2E</span>
                    </div>
                    <h2 className="text-[#D4E655] font-bold uppercase tracking-[0.6em] text-xl md:text-3xl mb-12">
                        ESCENA
                    </h2>

                    <div className="bg-black/40 backdrop-blur-sm  p-6 md:p-10 max-w-4xl">
                        <p className="text-white font-semibold uppercase tracking-widest text-sm md:text-lg leading-loose text-center">
                            Acompañamos artistas, compañías, productores, creadores,<br /> marcas y proyectos en todas las etapas.<br />
                            De la idea a la presentación frente al público o la cámara,<br /> hacemos posible lo que imaginás.
                        </p>
                    </div>
                </div>
            </section>

            {/* --- INFO ESCÉNICO & INMERSIVO --- */}
            <section className="max-w-7xl mx-auto px-6 py-20">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div>
                        <h3 className="text-3xl md:text-4xl font-black uppercase tracking-tighter mb-4">
                            EL ESPACIO ESCÉNICO DE PISO <span className="text-[#D4E655]">2</span>
                        </h3>
                        <p className="font-bold uppercase tracking-widest text-sm text-white mb-8">
                            Pensado para artistas, compañías,<br /> productores y creadores.
                        </p>
                        <ul className="space-y-2 font-black uppercase text-lg text-white/90">
                            <li>- Obras</li>
                            <li>- Presentaciones</li>
                            <li>- Eventos</li>
                            <li>- Música en Vivo</li>
                            <li>- Desfiles</li>
                            <li>- Shows Inmersivos</li>
                            <li>- Eventos Corporativos</li>
                            <li>- Producciones Audiovisuales</li>
                            <li>- Sesiones Fotográficas</li>
                            <li>- Transmisión en Directo de Shows</li>
                        </ul>
                    </div>

                    <div className="relative h-[500px] bg-zinc-900 rounded-2xl overflow-hidden border border-white/10 group flex items-center justify-center">
                        {/* Fondo de la imagen inmersiva */}
                        <div className="absolute inset-0 bg-[url('https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273153/DSC08249_pqrea2.jpg')] bg-cover bg-center opacity-40 group-hover:opacity-60 transition-all duration-700"></div>
                        <div className="relative z-10 text-center">
                            <h3 className="text-5xl md:text-7xl font-black text-[#D4E655] uppercase tracking-tighter leading-[0.85] drop-shadow-2xl">
                                INMERSIVO<br />PARTICI-<br />PATIVO
                            </h3>
                            <p className="text-white font-bold uppercase tracking-[0.3em] text-[10px] mt-4">
                                Creación Digital + Tecnología
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center mt-16 mb-8">
                    <button className="bg-[#D4E655] text-black font-black uppercase px-12 py-3 rounded-full tracking-widest hover:bg-white transition-colors">
                        SALAS
                    </button>
                </div>

                {/* Galería de Salas (Efecto Lightbox) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {salas.map((sala) => (
                        <div
                            key={sala.id}
                            onClick={() => setLightboxImg(sala.img)}
                            className="relative h-48 md:h-64 bg-zinc-900 overflow-hidden cursor-pointer group"
                        >
                            <div
                                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110 opacity-70 group-hover:opacity-100"
                                style={{ backgroundImage: `url(${sala.img})` }}
                            ></div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                                <h4 className="font-black text-white uppercase tracking-widest text-sm md:text-base drop-shadow-md">
                                    {sala.nombre}
                                </h4>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* --- DESARROLLAMOS EXPERIENCIAS --- */}
            <section className="max-w-7xl mx-auto px-6 py-20 border-t border-white/10">
                <div className="flex items-center gap-6 mb-10">
                    <h3 className="text-2xl md:text-4xl font-black uppercase tracking-tighter text-white">
                        Desarrollamos Experiencias
                    </h3>
                    <button className="bg-[#D4E655] text-black font-black uppercase px-6 py-2 rounded-full tracking-widest text-xs hover:bg-white transition-colors">
                        GALERÍA
                    </button>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {galeria.map((img, i) => (
                        <div key={i} className="h-48 md:h-64 bg-zinc-900 overflow-hidden group">
                            <div
                                className="w-full h-full bg-cover bg-center transition-all duration-700 group-hover:scale-110 filter grayscale hover:grayscale-0"
                                style={{ backgroundImage: `url(${img})` }}
                            ></div>
                        </div>
                    ))}
                </div>
            </section>

            {/* --- ACCESOS RÁPIDOS (BOTONES AMARILLOS) --- */}
            <section className="max-w-7xl mx-auto px-6 py-12">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <button className="bg-[#D4E655] rounded-3xl p-8 text-left hover:scale-[1.02] transition-transform text-black group">
                        <h4 className="font-black uppercase tracking-widest text-xl mb-4">Tickets</h4>
                        <p className="font-bold uppercase text-[10px] tracking-widest opacity-80 leading-relaxed">Conocé nuestras obras<br />en cartelera</p>
                    </button>
                    <button className="bg-[#D4E655] rounded-3xl p-8 text-left hover:scale-[1.02] transition-transform text-black group">
                        <h4 className="font-black uppercase tracking-widest text-xl mb-4">Residencias</h4>
                        <p className="font-bold uppercase text-[10px] tracking-widest opacity-80 leading-relaxed">Convocatoria abierta de artistas<br />modalidad residencia</p>
                    </button>
                    <button className="bg-[#D4E655] rounded-3xl p-8 text-left hover:scale-[1.02] transition-transform text-black group">
                        <h4 className="font-black uppercase tracking-widest text-xl mb-4">Producción Audiovisual</h4>
                        <p className="font-bold uppercase text-[10px] tracking-widest opacity-80 leading-relaxed">Solicitá tu presupuesto<br />para tu producción</p>
                    </button>
                </div>
            </section>

            {/* --- SECCIÓN STREAMING --- */}
            <section className="max-w-7xl mx-auto px-6 py-20">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div>
                        <h3 className="text-[#D4E655] text-2xl md:text-2xl font-black uppercase tracking-tighter leading-snug">
                            SOMOS EL ÚNICO MULTIESPACIO CON SU <br />
                            <span className="bg-white text-black px-2 mt-1 inline-block">PROPIO CANAL DE STREAMING</span><br />
                            QUE PERMITE TRASCENDER LOS LÍMITES DEL ESPACIO FÍSICO, SUPERANDO EL OBSTÁCULO DE LA PRESENCIALIDAD EN TU EVENTO O SHOW,<br />
                            PUDIENDO TRANSMITIR EN DIRECTO CON LA POSIBILIDAD DE VENDER ENTRADAS VIRTUALES O GENERANDO CONTENIDO ON DEMAND.
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-auto md:h-[360px]">
                        {/* Tarjeta 1 */}
                        <div className="bg-zinc-800 rounded-xl overflow-hidden relative border border-white/10 flex items-end p-4 md:p-5 group hover:border-[#D4E655]/50 transition-colors min-h-[280px]">
                            {/* Usamos una etiqueta img para controlar perfectamente el encuadre (object position) */}
                            <img
                                src="https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273186/DSC07164_vi3pne.jpg"
                                alt="Operación Técnica"
                                className="absolute inset-0 w-full h-full object-cover object-[center_30%] opacity-90 group-hover:scale-105 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>

                            <div className="relative z-10 w-full">
                                <h4 className="text-[#D4E655] font-black uppercase tracking-tighter text-lg md:text-xl leading-[0.85] mb-2 drop-shadow-md">
                                    OPERACIÓN<br />TÉCNICA<br />COMPLETA<br />INCLUIDA
                                </h4>
                                <p className="text-white font-bold uppercase tracking-[0.2em] text-[7px] md:text-[8px] leading-tight opacity-80">
                                    LUCES + SONIDO + CONSOLA
                                </p>
                            </div>
                        </div>

                        {/* Tarjeta 2 */}
                        <div className="bg-zinc-800 rounded-xl overflow-hidden relative border border-white/10 flex items-end p-4 md:p-5 group hover:border-[#D4E655]/50 transition-colors min-h-[280px]">
                            <img
                                src="https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273061/DSC07309_ctds9m.jpg"
                                alt="Equipamiento HD"
                                className="absolute inset-0 w-full h-full object-cover object-[center_20%] opacity-90 group-hover:scale-105 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>

                            <div className="relative z-10 w-full">
                                <h4 className="text-[#D4E655] font-black uppercase tracking-tighter text-lg md:text-xl leading-[0.85] mb-2 drop-shadow-md">
                                    EQUI-<br />PAMIENTO<br />PROFESIONAL<br />HD
                                </h4>
                                <p className="text-white font-bold uppercase tracking-[0.2em] text-[7px] md:text-[8px] leading-tight opacity-80">
                                    MICS + AURIS + CAMARAS
                                </p>
                            </div>
                        </div>

                        {/* Tarjeta 3 */}
                        <div className="bg-zinc-800 rounded-xl overflow-hidden relative border border-white/10 flex items-end p-4 md:p-5 group hover:border-[#D4E655]/50 transition-colors min-h-[280px]">
                            <img
                                src="https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273124/DSC08205_pohing.jpg"
                                alt="Contenido Multiplataforma"
                                className="absolute inset-0 w-full h-full object-cover object-[center_30%] opacity-90 group-hover:scale-105 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>

                            <div className="relative z-10 w-full">
                                <h4 className="text-[#D4E655] font-black uppercase tracking-tighter text-lg md:text-xl leading-[0.85] mb-2 drop-shadow-md">
                                    CONTE-<br />NIDO<br />MULTI<br />PLATAFORMA
                                </h4>
                                <p className="text-white font-bold uppercase tracking-[0.2em] text-[7px] md:text-[8px] leading-tight opacity-80">
                                    YOUTUBE + SPOTIFY + TWITCH
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- FORMULARIO DE CONTACTO BLANCO --- */}
            <section className="max-w-7xl mx-auto px-6 py-12">
                <h3 className="text-white font-black uppercase tracking-widest text-lg mb-6">
                    SI BUSCAS PRODUCIR Y/O PRESENTAR TU SHOW O EVENTO CONTACTANOS
                </h3>
                <form className=" p-8 md:p-12 text-black space-y-8" onSubmit={(e) => e.preventDefault()}>
                    <div className="flex gap-4 items-end">
                        <label className="text-white uppercase text-sm whitespace-nowrap shrink-0">NOMBRE:</label>
                        <input type="text" className="w-full border-b border-black/30 outline-none focus:border-black transition-colors bg-transparent pb-1" />
                    </div>
                    <div className="flex gap-4 items-end">
                        <label className="text-white uppercase text-sm whitespace-nowrap shrink-0">TELÉFONO DE CONTACTO:</label>
                        <input type="tel" className="w-full border-b border-black/30 outline-none focus:border-black transition-colors bg-transparent pb-1" />
                    </div>
                    <div className="flex gap-4 items-end">
                        <label className="text-white uppercase text-sm whitespace-nowrap shrink-0">TIPO DE EVENTO / PRESENTACIÓN:</label>
                        <input type="text" className="w-full border-b border-white/30 outline-none focus:border-black transition-colors bg-transparent pb-1" />
                    </div>
                    <div className="flex gap-4 items-end">
                        <label className="text-white uppercase text-sm whitespace-nowrap shrink-0">DESCRIPCIÓN DEL EVENTO:</label>
                        <textarea rows={1} className="w-full border-b border-black/30 outline-none focus:border-black transition-colors bg-transparent pb-1 resize-none overflow-hidden" />
                    </div>
                    <div className="pt-4 flex justify-end">
                        <button type="submit" className="bg-black text-white font-black uppercase px-8 py-3 tracking-widest hover:bg-[#D4E655] hover:text-black transition-colors">
                            ENVIAR
                        </button>
                    </div>
                </form>
            </section>

            {/* --- FOOTER: PORQUE ELEGIRNOS --- */}
            <section className="max-w-7xl mx-auto px-6 py-20">
                <h3 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-8">
                    PORQUE<br />ELEGIRNOS?
                </h3>
                <div className="max-w-3xl space-y-6 text-sm font-bold uppercase tracking-widest leading-loose text-white/90">
                    <p>SOMOS UN ESPACIO MULTIDISCIPLINARIO DE TRABAJO COLECTIVO ENTRE NUESTRAS AREAS.</p>
                    <p>FORMAMOS UN ECOSISTEMA QUE SE ENRIQUECE A SI MISMO Y DA RESPUESTA A DISTINTAS NECESIDADES.</p>
                    <p>MOVIMIENTO, TECNOLOGÍA Y ESPACIOS ESCÉNICOS MODERNOS SE UNEN EN PISO2 DE FORMA ORGÁNICA PARA TRANSFORMAR TUS IDEAS EN EXPERIENCIAS ARTÍSTICAS NUEVAS.</p>
                </div>
                <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mt-16 text-white">
                    HAGAMOSLO<br />JUNTOS
                </h2>
            </section>

            {/* --- LIGHTBOX MODAL (IMAGENES SALAS) --- */}
            {lightboxImg && (
                <div
                    className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-300"
                    onClick={() => setLightboxImg(null)}
                >
                    <button className="absolute top-8 right-8 text-white hover:text-[#D4E655] transition-colors">
                        <X size={40} />
                    </button>
                    <img
                        src={lightboxImg}
                        alt="Sala ampliada"
                        className="max-w-full max-h-[90vh] object-contain shadow-2xl rounded-lg"
                    />
                </div>
            )}
        </div>
    )
}