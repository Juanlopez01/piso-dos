'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Lock, Loader2, CheckCircle2 } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { AuthChangeEvent, Session } from '@supabase/supabase-js'

export default function ActualizarPasswordPage() {
    const supabase = createClient()
    const router = useRouter()

    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [actualizado, setActualizado] = useState(false)
    const [authReady, setAuthReady] = useState(false)

    // Escuchamos a Supabase para que procese el link del mail antes de dejarte hacer algo
    useEffect(() => {
        const canjearCodigo = async () => {
            const queryParams = new URLSearchParams(window.location.search)
            const code = queryParams.get('code')

            if (code) {
                // Si hay un código de seguridad en la URL, lo canjeamos por una sesión abierta
                await supabase.auth.exchangeCodeForSession(code)
            }
            setAuthReady(true)
        }

        canjearCodigo()

        // Por si acaso viene por otro método (Implicit flow antiguo)
        supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            if (event === 'PASSWORD_RECOVERY' || session) {
                setAuthReady(true)
            }
        })

        // Failsafe: a los 2 segundos liberamos la pantalla igual
        setTimeout(() => setAuthReady(true), 2000)
    }, [])

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()

        if (password.length < 6) {
            return toast.error('La contraseña debe tener al menos 6 caracteres')
        }
        if (password !== confirmPassword) {
            return toast.error('Las contraseñas no coinciden')
        }

        setLoading(true)

        try {
            // Intentamos actualizar la contraseña
            const { error } = await supabase.auth.updateUser({
                password: password
            })

            if (error) throw error

            setActualizado(true)
            toast.success('¡Contraseña actualizada con éxito!')

            // Lo mandamos a la Home (porque /explorar todavía no existe)
            setTimeout(() => {
                router.push('/explorar')
            }, 3000)

        } catch (error: any) {
            toast.error(error.message || 'Error al actualizar. Es posible que el enlace haya expirado, volvé a pedir uno nuevo.')
            console.error("Error completo:", error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-[#D4E655] selection:text-black">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#D4E655]/5 rounded-full blur-[100px] pointer-events-none" />

            <div className="w-full max-w-md bg-[#09090b] border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 animate-in zoom-in-95 duration-500">
                <div className="w-16 h-16 bg-[#D4E655]/10 rounded-full flex items-center justify-center mb-6 border border-[#D4E655]/20">
                    <Lock className="text-[#D4E655]" size={28} />
                </div>

                <h1 className="text-3xl font-black uppercase tracking-tighter text-white leading-none mb-2">
                    Crear Nueva <br /><span className="text-[#D4E655]">Contraseña</span>
                </h1>

                {actualizado ? (
                    <div className="mt-8 text-center animate-in fade-in">
                        <CheckCircle2 size={48} className="text-[#D4E655] mx-auto mb-4" />
                        <h3 className="text-white font-black uppercase tracking-widest text-sm mb-2">¡Todo listo!</h3>
                        <p className="text-gray-400 text-xs leading-relaxed mb-6">Tu contraseña fue actualizada. Ya podés volver a entrar a tu cuenta.</p>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest animate-pulse">Redirigiendo al Inicio...</p>
                    </div>
                ) : !authReady ? (
                    <div className="flex flex-col items-center justify-center py-10">
                        <Loader2 className="animate-spin text-[#D4E655] w-10 h-10 mb-4" />
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Verificando enlace...</p>
                    </div>
                ) : (
                    <>
                        <p className="text-gray-400 text-xs font-medium mb-8 leading-relaxed">
                            Por seguridad, ingresá una contraseña que no hayas usado antes y que tenga al menos 6 caracteres.
                        </p>
                        <form onSubmit={handleUpdate} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nueva Contraseña</label>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-colors tracking-widest"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Confirmar Contraseña</label>
                                <input
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-colors tracking-widest"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4 shadow-[0_0_20px_rgba(212,230,85,0.2)]"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Actualizar y Entrar'}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    )
}