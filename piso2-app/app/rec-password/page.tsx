'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react'
import { toast, Toaster } from 'sonner'

export default function RecuperarPasswordPage() {
    const supabase = createClient()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [enviado, setEnviado] = useState(false)

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/act-password`,
            })

            if (error) throw error

            setEnviado(true)
            toast.success('Correo de recuperación enviado')
        } catch (error: any) {
            toast.error('Error: No pudimos enviar el correo. Verificá que la dirección sea correcta.')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-[#D4E655] selection:text-black">
            <Toaster position="top-center" richColors theme="dark" />

            {/* Fondo con brillo */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#D4E655]/5 rounded-full blur-[100px] pointer-events-none" />

            <div className="w-full max-w-md bg-[#09090b] border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 animate-in zoom-in-95 duration-500">
                <Link href="/login" className="inline-flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors mb-8">
                    <ArrowLeft size={14} /> Volver al Login
                </Link>

                <h1 className="text-3xl font-black uppercase tracking-tighter text-white leading-none mb-2">
                    Recuperar <br /><span className="text-[#D4E655]">Acceso</span>
                </h1>
                <p className="text-gray-400 text-xs font-medium mb-8 leading-relaxed">
                    Ingresá el correo electrónico asociado a tu cuenta y te enviaremos un enlace para crear una contraseña nueva.
                </p>

                {enviado ? (
                    <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 rounded-xl p-6 text-center animate-in fade-in slide-in-from-bottom-4">
                        <CheckCircle2 size={40} className="text-[#D4E655] mx-auto mb-4" />
                        <h3 className="text-white font-black uppercase tracking-widest text-sm mb-2">¡Revisá tu bandeja!</h3>
                        <p className="text-gray-400 text-xs leading-relaxed">Te enviamos un enlace de recuperación a <b>{email}</b>. Si no lo ves, chequeá la carpeta de Spam.</p>
                    </div>
                ) : (
                    <form onSubmit={handleReset} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Email</label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tu@email.com"
                                    className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-colors"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4 shadow-[0_0_20px_rgba(212,230,85,0.2)]"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Enviar Enlace'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}