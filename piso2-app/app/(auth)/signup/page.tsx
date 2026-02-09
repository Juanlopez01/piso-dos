'use client'

import { createClient } from '@/utils/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import Link from 'next/link'
import { ArrowLeft, Loader2, UserPlus, Calendar, Phone, User, Mail, Lock } from 'lucide-react'

export default function SignupPage() {
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    // Estado del Formulario
    const [formData, setFormData] = useState({
        nombre: '',
        apellido: '',
        email: '',
        password: '',
        telefono: '',
        fecha_nacimiento: '',
        genero: ''
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            // 1. Crear Usuario en Auth (Supabase Auth)
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        nombre_completo: `${formData.nombre} ${formData.apellido}`, // Guardamos el full name también
                    }
                }
            })

            if (authError) throw authError

            if (authData.user) {
                // 2. Actualizar la tabla 'profiles' con los datos extra
                // (El trigger handle_new_user ya creó la fila, ahora la rellenamos)
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({
                        nombre: formData.nombre,
                        apellido: formData.apellido,
                        telefono: formData.telefono,
                        fecha_nacimiento: formData.fecha_nacimiento,
                        genero: formData.genero,
                        nombre_completo: `${formData.nombre} ${formData.apellido}`
                    })
                    .eq('id', authData.user.id)

                if (profileError) {
                    console.error('Error al guardar perfil:', profileError)
                    // No lanzamos error fatal para no bloquear al usuario, pero avisamos
                    toast.warning('Usuario creado, pero hubo un error guardando detalles.')
                } else {
                    toast.success('¡Cuenta creada con éxito!')
                }

                // 3. Redireccionar
                // Si tenés confirmación de email activada, mostrá un mensaje. Si no, directo al login/home.
                toast.message('Cuenta creada. Iniciando sesión...', { description: 'Bienvenido a la comunidad.' })
                router.push('/calendario')
            }

        } catch (error: any) {
            toast.error(error.message || 'Error al registrarse')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4 relative overflow-y-auto py-10">
            <Toaster position="top-center" richColors theme="dark" />

            {/* Botón Volver */}
            <Link href="/login" className="absolute top-8 left-8 text-gray-500 hover:text-[#D4E655] flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors z-20">
                <ArrowLeft size={16} /> Volver al Login
            </Link>

            <div className="w-full max-w-2xl bg-[#09090b] border border-white/10 rounded-2xl p-8 md:p-10 relative z-10 shadow-2xl mt-10 md:mt-0">

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#D4E655]/10 text-[#D4E655] mb-4 border border-[#D4E655]/20">
                        <UserPlus size={28} strokeWidth={2} />
                    </div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter mb-2">Crear Cuenta</h1>
                    <p className="text-gray-500 text-sm">Sumate a la comunidad de Piso 2</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-6">

                    {/* GRUPO 1: DATOS PERSONALES */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Nombre</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3.5 text-gray-600" size={16} />
                                <input name="nombre" required placeholder="Juan" onChange={handleChange} className="w-full bg-[#111] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Apellido</label>
                            <input name="apellido" required placeholder="Pérez" onChange={handleChange} className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                        </div>
                    </div>

                    {/* GRUPO 2: CONTACTO Y CUENTA */}
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3.5 text-gray-600" size={16} />
                            <input name="email" type="email" required placeholder="tu@email.com" onChange={handleChange} className="w-full bg-[#111] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Contraseña</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3.5 text-gray-600" size={16} />
                                <input name="password" type="password" required placeholder="••••••" onChange={handleChange} className="w-full bg-[#111] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Teléfono / WhatsApp</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-3.5 text-gray-600" size={16} />
                                <input name="telefono" type="tel" required placeholder="3624..." onChange={handleChange} className="w-full bg-[#111] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                            </div>
                        </div>
                    </div>

                    {/* GRUPO 3: BIO */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Fecha de Nacimiento</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-3.5 text-gray-600" size={16} />
                                <input name="fecha_nacimiento" type="date" required onChange={handleChange} className="w-full bg-[#111] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white font-bold outline-none focus:border-[#D4E655] transition-colors [color-scheme:dark]" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Género</label>
                            <select name="genero" required onChange={handleChange} className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-[#D4E655] transition-colors appearance-none">
                                <option value="">Seleccionar...</option>
                                <option value="Femenino">Femenino</option>
                                <option value="Masculino">Masculino</option>
                                <option value="No Binario">No Binario</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(212,230,85,0.2)] disabled:opacity-50 mt-6"
                    >
                        {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Registrarme'}
                    </button>

                </form>
            </div>
        </div>
    )
}