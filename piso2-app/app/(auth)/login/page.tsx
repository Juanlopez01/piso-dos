'use client'

import { createClient } from '@/utils/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const router = useRouter()
    const supabase = createClient()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    // Función para Iniciar Sesión
    const handleLogin = async () => {
        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            setMessage("Error: " + error.message)
        } else {
            setMessage("¡Bienvenido! Redirigiendo...")
            router.push('/') // Te manda al inicio
            router.refresh()
        }
        setLoading(false)
    }

    // Función para Registrarse (Solo para probar ahora)
    const handleSignUp = async () => {
        setLoading(true)
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: "Usuario Nuevo", // Esto después lo pediremos en un input
                },
            },
        })

        if (error) {
            setMessage("Error al crear cuenta: " + error.message)
        } else {
            setMessage("¡Cuenta creada! Revisá tu email para confirmar (o desactivá la confirmación en Supabase).")
        }
        setLoading(false)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4">
            <div className="max-w-md w-full bg-piso2-gray p-8 rounded-none border border-white/10 shadow-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-white tracking-tighter">
                        PISO<span className="text-piso2-lime">2</span>
                    </h1>
                    <p className="text-gray-400 text-sm mt-2 uppercase tracking-widest">Sistema de Gestión</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black border border-white/20 text-white p-3 focus:outline-none focus:border-piso2-lime transition-colors"
                            placeholder="admin@pisodos.com"
                        />
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black border border-white/20 text-white p-3 focus:outline-none focus:border-piso2-lime transition-colors"
                            placeholder="••••••••"
                        />
                    </div>

                    {message && (
                        <div className="p-3 bg-white/5 border border-piso2-blue text-blue-200 text-xs text-center">
                            {message}
                        </div>
                    )}

                    <div className="pt-4 flex flex-col gap-3">
                        <button
                            onClick={handleLogin}
                            disabled={loading}
                            className="w-full bg-piso2-lime text-black font-bold uppercase py-3 hover:bg-white transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Cargando...' : 'Ingresar'}
                        </button>

                        <button
                            onClick={handleSignUp}
                            disabled={loading}
                            className="w-full border border-white/20 text-gray-400 text-xs font-bold uppercase py-3 hover:text-white hover:border-white transition-colors"
                        >
                            Crear cuenta de prueba
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}