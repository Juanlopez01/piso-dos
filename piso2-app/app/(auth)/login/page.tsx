'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, Loader2, ChevronLeft } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { Montserrat } from 'next/font/google'

const montserrat = Montserrat({
    subsets: ['latin'],
    weight: ['400', '700', '900']
})

export default function LoginPage() {
    const router = useRouter()
    const supabase = createClient()

    // Estados de UI
    const [isRegistering, setIsRegistering] = useState(false)
    const [loading, setLoading] = useState(false)
    const [checkingAuth, setCheckingAuth] = useState(true)

    // Estados de Formularios
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const [regForm, setRegForm] = useState({
        nombre: '', apellido: '', email: '', telefono: '',
        fecha_nacimiento: '', genero: '', password: ''
    })

    // --- FUNCIÓN DE LOGIN ---
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data: authData, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) throw error

            // Buscamos su rol para saber a dónde mandarlo
            const { data: profile } = await supabase
                .from('profiles')
                .select('rol')
                .eq('id', authData.user.id)
                .single()

            toast.success('¡Ingreso exitoso!')

            const userRole = profile?.rol || 'alumno'

            if (userRole === 'admin') router.push('/admin')
            else if (userRole === 'profesor') router.push('/mis-clases')
            else if (userRole === 'recepcion') router.push('/caja')
            else router.push('/explorar')

            router.refresh()

        } catch (error: any) {
            toast.error(error.message || 'Error al iniciar sesión. Verificá tus credenciales.')
        } finally {
            setLoading(false)
        }
    }

    // --- FUNCIÓN DE REGISTRO ---
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            // 1. Crear el usuario en la autenticación de Supabase
            const { data, error } = await supabase.auth.signUp({
                email: regForm.email,
                password: regForm.password,
                options: {
                    data: {
                        nombre: regForm.nombre,
                        apellido: regForm.apellido,
                        telefono: regForm.telefono,
                        fecha_nacimiento: regForm.fecha_nacimiento,
                        genero: regForm.genero,
                        rol: 'alumno' // Por defecto creamos alumnos
                    }
                }
            })

            if (error) throw error

            toast.success('¡Cuenta creada con éxito! Ya podés ingresar.')
            setIsRegistering(false) // Lo devolvemos a la vista de login
            setEmail(regForm.email) // Le precargamos el email

        } catch (error: any) {
            toast.error(error.message || 'Error al crear la cuenta.')
        } finally {
            setLoading(false)
        }
    }

    // --- CHEQUEO INICIAL DE SESIÓN (CON MATA-FANTASMAS) ---
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                // Buscamos su rol
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('rol')
                    .eq('id', session.user.id)
                    .maybeSingle() // Usamos maybeSingle para que no tire error si no existe

                // Si hay sesión en el búnker PERO no hay perfil en la DB (usuario fantasma)
                if (!profile) {
                    await supabase.auth.signOut() // ¡Mata al fantasma!
                    setCheckingAuth(false)
                    return
                }

                const userRole = profile.rol || 'alumno'

                // Redirección inteligente
                if (userRole === 'admin') router.push('/admin')
                else if (userRole === 'profesor') router.push('/mis-clases')
                else if (userRole === 'recepcion') router.push('/caja')
                else router.push('/explorar')

            } else {
                setCheckingAuth(false) // Le mostramos el login
            }
        }
        checkSession()
    }, [router, supabase])

    if (checkingAuth) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12" />
            </div>
        )
    }

    return (
        <div className={`min-h-screen bg-[#050505] text-white flex flex-col relative overflow-x-hidden selection:bg-[#D4E655] selection:text-black ${montserrat.className}`}>
            <Toaster position="top-center" richColors theme="dark" />

            {/* --- FONDO --- */}
            <div className="absolute inset-0 z-0">
                {/* Usamos una imagen de stock de danza en blanco y negro temporalmente */}
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=2069&auto=format&fit=crop')] bg-cover bg-center grayscale opacity-40"></div>
                {/* Filtro oscuro para mejorar legibilidad */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/50 to-black/95"></div>
            </div>

            {/* --- NAVBAR SIMPLE --- */}
            <nav className="relative z-10 w-full border-b border-white/10 bg-black/50 backdrop-blur-md h-20">
                <div className="max-w-7xl mx-auto px-6 h-full flex justify-between items-center">
                    <Link href="/" className="font-black text-2xl tracking-tighter flex items-center gap-1">
                        PISO<span className="text-[#D4E655]">2</span>
                    </Link>
                    <div className="hidden md:flex items-center gap-8 text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">
                        <Link href="/" className="hover:text-white transition-colors">Inicio</Link>
                        <span className="text-[#D4E655] cursor-default">Ingresa</span>
                        <Link href="/#nosotros" className="hover:text-white transition-colors">Nosotros</Link>
                        <Link href="/#alquileres" className="hover:text-white transition-colors">Alquileres</Link>
                    </div>
                </div>
            </nav>

            {/* --- CONTENIDO PRINCIPAL --- */}
            <main className="flex-1 relative z-10 flex flex-col items-center justify-center px-4 py-12">

                {/* LOGO 2M GIGANTE */}
                <div className="flex flex-col items-center text-center mb-8 select-none">
                    <div className="flex items-center gap-2 text-6xl md:text-[5.5rem] font-black text-[#D4E655] tracking-tighter leading-none">
                        <ArrowUpRight size={64} strokeWidth={2.5} className="-mt-2" />
                        2M
                    </div>
                    <h2 className="text-[#D4E655] text-sm md:text-xl font-bold tracking-[0.4em] uppercase mt-2">
                        Movimiento
                    </h2>
                </div>

                {/* --- CAJA DE LOGIN / REGISTRO --- */}
                <div className="bg-[#18181b]/90 backdrop-blur-xl border border-white/5 p-8 md:p-10 w-full max-w-md shadow-2xl relative overflow-hidden transition-all duration-500">

                    {/* Header del recuadro */}
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-black uppercase tracking-tighter text-white leading-none">Piso2</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Sistema de Gestión</p>
                    </div>

                    {!isRegistering ? (
                        /* --- VISTA LOGIN --- */
                        <form onSubmit={handleLogin} className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email</label>
                                {/* Input Blanco como en el diseño */}
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-white border border-transparent p-3.5 text-black text-sm font-medium outline-none focus:ring-2 focus:ring-[#D4E655] transition-all"
                                    placeholder="juanperez@gmail.com"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contraseña</label>
                                {/* Input Oscuro con borde */}
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-[#09090b] border border-white/10 p-3.5 text-white text-sm font-medium outline-none focus:border-[#D4E655] transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                            <Link href="/rec-password" className="text-[10px] text-gray-500 font-bold uppercase tracking-widest hover:text-[#D4E655] mt-2 inline-block">
                                ¿Olvidaste tu contraseña?
                            </Link>
                            <div className="pt-2 space-y-3">
                                <button type="submit" disabled={loading} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 text-xs tracking-[0.2em] hover:bg-white transition-all disabled:opacity-50 flex justify-center items-center h-[52px]">
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : 'INGRESAR'}
                                </button>

                                <button type="button" onClick={() => setIsRegistering(true)} className="w-full bg-transparent border border-white/20 text-white font-bold uppercase py-4 text-[10px] tracking-[0.2em] hover:bg-white/5 transition-all flex justify-center items-center h-[52px]">
                                    CREA TU CUENTA
                                </button>
                            </div>
                        </form>
                    ) : (
                        /* --- VISTA REGISTRO --- */
                        <form onSubmit={handleRegister} className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-300">

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Nombre</label>
                                    <input required type="text" value={regForm.nombre} onChange={e => setRegForm({ ...regForm, nombre: e.target.value })} className="w-full bg-[#09090b] border border-white/10 p-3 text-white text-xs outline-none focus:border-[#D4E655]" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Apellido</label>
                                    <input required type="text" value={regForm.apellido} onChange={e => setRegForm({ ...regForm, apellido: e.target.value })} className="w-full bg-[#09090b] border border-white/10 p-3 text-white text-xs outline-none focus:border-[#D4E655]" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">E-mail</label>
                                <input required type="email" value={regForm.email} onChange={e => setRegForm({ ...regForm, email: e.target.value })} className="w-full bg-[#09090b] border border-white/10 p-3 text-white text-xs outline-none focus:border-[#D4E655]" />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Teléfono</label>
                                <input required type="tel" value={regForm.telefono} onChange={e => setRegForm({ ...regForm, telefono: e.target.value })} className="w-full bg-[#09090b] border border-white/10 p-3 text-white text-xs outline-none focus:border-[#D4E655]" placeholder="+54 9 11..." />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Nacimiento</label>
                                    <input required type="date" value={regForm.fecha_nacimiento} onChange={e => setRegForm({ ...regForm, fecha_nacimiento: e.target.value })} className="w-full bg-[#09090b] border border-white/10 p-3 text-white text-xs outline-none focus:border-[#D4E655]" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Género</label>
                                    <select required value={regForm.genero} onChange={e => setRegForm({ ...regForm, genero: e.target.value })} className="w-full bg-[#09090b] border border-white/10 p-3 text-white text-xs outline-none focus:border-[#D4E655] appearance-none">
                                        <option value="">Seleccionar...</option>
                                        <option value="Femenino">Femenino</option>
                                        <option value="Masculino">Masculino</option>
                                        <option value="No Binario">No Binario</option>
                                        <option value="Prefiero no decirlo">Prefiero no decirlo</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Contraseña</label>
                                <input required type="password" value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} className="w-full bg-[#09090b] border border-white/10 p-3 text-white text-xs outline-none focus:border-[#D4E655]" placeholder="Mínimo 8 caracteres" minLength={8} />
                            </div>

                            <div className="pt-2 space-y-3">
                                <button type="submit" disabled={loading} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 text-xs tracking-[0.2em] hover:bg-white transition-all disabled:opacity-50 flex justify-center items-center h-[52px]">
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : 'REGISTRARME'}
                                </button>

                                <button type="button" onClick={() => setIsRegistering(false)} className="w-full bg-transparent text-gray-400 font-bold uppercase py-2 text-[9px] tracking-[0.2em] hover:text-white transition-all flex justify-center items-center gap-1">
                                    <ChevronLeft size={12} /> VOLVER AL INICIO
                                </button>
                            </div>
                        </form>
                    )}

                </div>

                {/* PÁRRAFO INFORMATIVO */}
                <p className="mt-12 text-center max-w-3xl text-xs md:text-sm font-bold uppercase tracking-widest text-gray-300 leading-loose">
                    Espacio destinado a la formación y desarrollo de bailarines <br className="hidden md:block" />
                    en distintas disciplinas, preparados para la escena <br className="hidden md:block" />
                    y ser parte de nuestro ecosistema de creación <br className="hidden md:block" />
                    y presentaciones profesionales
                </p>

            </main>

            {/* --- TARJETAS INFERIORES DE OFERTAS --- */}
            <div className="relative z-10 w-full max-w-7xl mx-auto px-4 pb-12 pt-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                    {/* Rojo: Clases Regulares */}
                    <Link href="/tienda" className="bg-[#E64827] p-6 rounded-2xl md:rounded-3xl hover:scale-[1.02] transition-transform duration-300 border border-[#E64827] flex flex-col group">
                        <h4 className="text-white font-black uppercase tracking-widest text-sm mb-4">Clases Regulares</h4>
                        <div className="space-y-3 text-[9px] font-bold text-white/90 uppercase tracking-widest leading-relaxed mt-auto">
                            <p>Clases de entrenamiento abiertas a todo público</p>
                            <p>Variedad de niveles y estilos</p>
                            <p>Modalidad cuponeras combinables</p>
                        </div>
                    </Link>

                    {/* Negro/Borde Blanco: Especiales */}
                    <Link href="/tienda" className="bg-[#050505] border border-white p-6 rounded-2xl md:rounded-3xl hover:bg-white/5 hover:scale-[1.02] transition-all duration-300 flex flex-col group">
                        <h4 className="text-white font-black uppercase tracking-widest text-sm mb-4">Especiales</h4>
                        <div className="space-y-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-auto">
                            <p>• Intensivos</p>
                            <p>• Seminarios</p>
                            <p>• Workshops</p>
                            <p>• Talleres</p>
                        </div>
                    </Link>

                    {/* Amarillo/Verde: Formaciones */}
                    <Link href="/la-liga" className="bg-[#D4E655] p-6 rounded-2xl md:rounded-3xl hover:scale-[1.02] transition-transform duration-300 border border-[#D4E655] flex flex-col group">
                        <h4 className="text-black font-black uppercase tracking-widest text-sm mb-4">Formaciones</h4>
                        <div className="space-y-4 text-[9px] font-bold text-black/80 uppercase tracking-widest leading-relaxed mt-auto">
                            <p>Programas y carreras de formación en danza</p>
                            <p>Desarrollo de bailarines multidisciplinarios</p>
                        </div>
                    </Link>

                    {/* Azul: Compañías */}
                    <Link href="#" className="bg-[#2D3AE8] p-6 rounded-2xl md:rounded-3xl hover:scale-[1.02] transition-transform duration-300 border border-[#2D3AE8] flex flex-col group">
                        <h4 className="text-white font-black uppercase tracking-widest text-sm mb-4">Compañías Profesionales</h4>
                        <div className="space-y-1 text-[9px] font-bold text-white/90 uppercase tracking-widest mt-auto">
                            <p>- Armado de piezas escénicas</p>
                            <p>- Presentaciones</p>
                            <p>- Desarrollo de artistas performáticos</p>
                        </div>
                    </Link>

                </div>
            </div>

        </div>
    )
}