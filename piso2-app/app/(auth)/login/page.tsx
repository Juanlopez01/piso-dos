'use client'

import { createClient } from '@/utils/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import Link from 'next/link'
import { ArrowLeft, Loader2, ArrowUpRight } from 'lucide-react'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                throw new Error('Credenciales incorrectas')
            }

            toast.success('¡Bienvenido a PISO 2!')

            // --- LA REDIRECCIÓN CLAVE ---
            // Forzamos la navegación al calendario
            router.push('/calendario')
            router.refresh() // Actualiza los componentes de servidor (layout) para mostrar el menú

        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
            <Toaster position="top-center" richColors theme="dark" />

            {/* Botón Volver (Flotante) */}
            <Link href="/" className="absolute top-8 left-8 text-gray-500 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors z-20">
                <ArrowLeft size={16} /> Volver al Inicio
            </Link>

            {/* Decoración de Fondo (Glow Verde Sutil) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#D4E655]/5 blur-[100px] rounded-full pointer-events-none" />

            {/* Tarjeta de Login */}
            <div className="w-full max-w-md bg-[#09090b] border border-white/10 rounded-2xl p-8 md:p-12 relative z-10 shadow-2xl">

                {/* Encabezado */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#D4E655]/10 text-[#D4E655] mb-6 border border-[#D4E655]/20">
                        <ArrowUpRight size={32} strokeWidth={2} />
                    </div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">Ingresar</h1>
                    <p className="text-gray-500 text-sm">Accedé a tu cuenta de Piso 2</p>
                </div>

                {/* Formulario */}
                <form onSubmit={handleLogin} className="space-y-5">

                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Email</label>
                        <input
                            type="email"
                            required
                            autoFocus
                            placeholder="alumno@piso2.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors placeholder:text-gray-700"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Contraseña</label>
                        <input
                            type="password"
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors placeholder:text-gray-700"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(212,230,85,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : 'Entrar al Sistema'}
                    </button>

                </form>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-gray-600 text-xs">
                        ¿Olvidaste tu contraseña? <a href="#" className="text-[#D4E655] hover:underline font-bold">Recuperar</a>
                    </p>
                </div>

                {/* Footer Link al Registro */}
                <div className="mt-8 pt-6 border-t border-white/5 text-center">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">
                        ¿Sos nuevo en Piso 2?
                    </p>
                    <Link href="/signup" className="block w-full border border-white/20 text-white font-bold uppercase py-3 rounded-xl hover:border-[#D4E655] hover:text-[#D4E655] transition-all">
                        Crear una cuenta
                    </Link>
                </div>
            </div>
        </div>
    )
}