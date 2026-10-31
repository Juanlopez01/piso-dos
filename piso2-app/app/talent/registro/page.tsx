'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { registrarTalentoAction } from '@/app/actions/talent-auth'
import { toast, Toaster } from 'sonner'
import { Loader2, ArrowLeft } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const inputCls = "w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors"
const labelCls = "text-[10px] font-semibold tracking-[0.15em] uppercase text-neutral-500 block mb-1.5"

// Solo permitimos volver a rutas internas de /talent (evita open redirect).
const destinoSeguro = (n: string | null) => (n && n.startsWith('/talent/')) ? n : '/talent/mi-perfil'

export default function RegistroTalentoPage() {
    const router = useRouter()
    const [form, setForm] = useState({ nombre: '', apellido: '', email: '', password: '', password2: '' })
    const [enviando, setEnviando] = useState(false)
    const [next, setNext] = useState<string | null>(null)

    useEffect(() => { setNext(new URLSearchParams(window.location.search).get('next')) }, [])

    const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
    const qs = next ? `?next=${encodeURIComponent(next)}` : ''

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (form.password !== form.password2) return toast.error('Las contraseñas no coinciden.')
        if (form.password.length < 6) return toast.error('La contraseña tiene que tener al menos 6 caracteres.')
        setEnviando(true)
        const res = await registrarTalentoAction({ email: form.email, password: form.password, nombre: form.nombre, apellido: form.apellido })
        if (res.ok) {
            toast.success('¡Cuenta creada!')
            router.push(destinoSeguro(next))
        } else {
            toast.error(res.error || 'No se pudo crear la cuenta')
            setEnviando(false)
        }
    }

    return (
        <div className={`min-h-screen bg-white text-neutral-900 ${sans.className}`}>
            <Toaster position="top-center" richColors />
            <div className="bg-black text-white py-2.5">
                <div className="max-w-3xl mx-auto px-5">
                    <Link href="/talent" className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white flex items-center gap-1.5">
                        <ArrowLeft size={13} /> Piso 2 Talent
                    </Link>
                </div>
            </div>

            <header className="pt-12 pb-8 text-center px-6">
                <p className={`${serif.className} text-[11px] tracking-[0.5em] text-neutral-500 uppercase`}>Piso 2</p>
                <h1 className={`${serif.className} text-4xl md:text-5xl tracking-[0.15em] font-medium mt-1`}>CREÁ TU PERFIL</h1>
                <p className="text-neutral-500 text-sm mt-4 max-w-md mx-auto leading-relaxed">
                    Creá tu cuenta de talento. Después vas a poder cargar tus fotos, datos y entrar cuando quieras a editarlos.
                </p>
            </header>

            <form onSubmit={handleSubmit} className="max-w-md mx-auto px-6 pb-24 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <label className={labelCls}>Nombre</label>
                        <input required value={form.nombre} onChange={e => set('nombre', e.target.value)} className={inputCls} placeholder="Nombre" />
                    </div>
                    <div>
                        <label className={labelCls}>Apellido</label>
                        <input value={form.apellido} onChange={e => set('apellido', e.target.value)} className={inputCls} placeholder="Apellido" />
                    </div>
                </div>
                <div>
                    <label className={labelCls}>Email</label>
                    <input required type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="tu@email.com" />
                </div>
                <div>
                    <label className={labelCls}>Contraseña</label>
                    <input required type="password" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} placeholder="Mínimo 6 caracteres" />
                </div>
                <div>
                    <label className={labelCls}>Repetir contraseña</label>
                    <input required type="password" value={form.password2} onChange={e => set('password2', e.target.value)} className={inputCls} placeholder="Repetí la contraseña" />
                </div>

                <button type="submit" disabled={enviando}
                    className="w-full bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs py-4 hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                    {enviando ? <Loader2 size={15} className="animate-spin" /> : null} Crear cuenta
                </button>

                <p className="text-center text-xs text-neutral-500">
                    ¿Ya tenés cuenta? <Link href={`/talent/login${qs}`} className="font-semibold text-neutral-900 underline underline-offset-2 hover:text-black">Iniciá sesión</Link>
                </p>
            </form>
        </div>
    )
}
