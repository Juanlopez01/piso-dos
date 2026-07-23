'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { optimizeImage } from '@/utils/optimizeImage'
import { crearPostulacionTalentoAction } from '@/app/actions/talent'
import { toast, Toaster } from 'sonner'
import { Loader2, Upload, ArrowLeft, CheckCircle2, X } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const RUBROS = ['Bailarín/a', 'Acróbata', 'Modelo', 'Cantante', 'Músico/a', 'Influencer', 'Actor/Actriz']

const inputCls = "w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors"
const labelCls = "text-[10px] font-semibold tracking-[0.15em] uppercase text-neutral-500 block mb-1.5"

export default function PostularTalentoPage() {
    const [supabase] = useState(() => createClient())
    const router = useRouter()

    const [form, setForm] = useState({
        nombre: '', sexo: '', rubro: '', edad: '', altura: '', descripcion: '', video_url: '', foto_url: ''
    })
    const [subiendo, setSubiendo] = useState(false)
    const [enviando, setEnviando] = useState(false)
    const [listo, setListo] = useState(false)

    const handleFoto = async (files: FileList | null) => {
        if (!files || !files.length) return
        setSubiendo(true)
        try {
            const opt = await optimizeImage(files[0], { maxDim: 1400 })
            const ext = opt.name.split('.').pop()
            const path = `postulaciones/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error } = await supabase.storage.from('talent').upload(path, opt)
            if (error) throw error
            setForm(f => ({ ...f, foto_url: supabase.storage.from('talent').getPublicUrl(path).data.publicUrl }))
        } catch (e: any) {
            toast.error('No se pudo subir la foto: ' + (e.message || ''))
        }
        setSubiendo(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.foto_url) return toast.error('Subí una foto.')
        setEnviando(true)
        const res = await crearPostulacionTalentoAction({
            nombre: form.nombre,
            sexo: form.sexo,
            rubro: form.rubro,
            descripcion: form.descripcion,
            edad: form.edad ? Number(form.edad) : undefined,
            altura: form.altura ? Number(form.altura) : undefined,
            video_url: form.video_url,
            foto_url: form.foto_url
        })
        if (res.success) setListo(true)
        else toast.error(res.error || 'Error al enviar la postulación')
        setEnviando(false)
    }

    if (listo) return (
        <div className={`min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center px-6 text-center ${sans.className}`}>
            <CheckCircle2 size={44} className="text-neutral-900 mb-5" strokeWidth={1.5} />
            <h1 className={`${serif.className} text-3xl md:text-4xl tracking-wide mb-3`}>¡Postulación enviada!</h1>
            <p className="text-neutral-500 text-sm max-w-sm leading-relaxed">Piso 2 va a revisar tu perfil. Si entrás a la vitrina, te vamos a contactar.</p>
            <Link href="/talent" className="mt-8 text-[11px] font-semibold tracking-[0.2em] uppercase border border-neutral-900 px-6 py-3 hover:bg-neutral-900 hover:text-white transition-colors">Volver a la vitrina</Link>
        </div>
    )

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
                <h1 className={`${serif.className} text-4xl md:text-5xl tracking-[0.15em] font-medium mt-1`}>SUMATE</h1>
                <p className="text-neutral-500 text-sm mt-4 max-w-md mx-auto leading-relaxed">Completá tu perfil para postularte a la vitrina de talentos de Piso 2.</p>
            </header>

            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-6 pb-24 space-y-6">
                {/* FOTO */}
                <div>
                    <span className={labelCls}>Foto</span>
                    {form.foto_url ? (
                        <div className="relative w-40 aspect-[3/4] overflow-hidden bg-neutral-100 border border-neutral-200">
                            <img src={form.foto_url} alt="Tu foto" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setForm(f => ({ ...f, foto_url: '' }))} className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full p-1 hover:bg-black"><X size={13} /></button>
                        </div>
                    ) : (
                        <label className="w-40 aspect-[3/4] border border-dashed border-neutral-300 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-neutral-900 transition-colors text-neutral-400">
                            {subiendo ? <Loader2 className="animate-spin" size={22} /> : <Upload size={22} />}
                            <span className="text-[10px] uppercase tracking-widest font-semibold">Subir foto</span>
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => handleFoto(e.target.files)} />
                        </label>
                    )}
                </div>

                <div>
                    <label className={labelCls}>Nombre completo</label>
                    <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputCls} placeholder="Nombre y apellido" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <label className={labelCls}>Sexo</label>
                        <select required value={form.sexo} onChange={e => setForm({ ...form, sexo: e.target.value })} className={inputCls}>
                            <option value="">Elegí…</option>
                            <option value="mujeres">Femenino</option>
                            <option value="varones">Masculino</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Rubro</label>
                        <select required value={form.rubro} onChange={e => setForm({ ...form, rubro: e.target.value })} className={inputCls}>
                            <option value="">Elegí…</option>
                            {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Edad</label>
                        <input type="number" min={0} value={form.edad} onChange={e => setForm({ ...form, edad: e.target.value })} className={inputCls} placeholder="Ej: 24" />
                    </div>
                    <div>
                        <label className={labelCls}>Altura (cm)</label>
                        <input type="number" min={0} value={form.altura} onChange={e => setForm({ ...form, altura: e.target.value })} className={inputCls} placeholder="Ej: 170" />
                    </div>
                </div>

                <div>
                    <label className={labelCls}>Descripción</label>
                    <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={4} className={`${inputCls} resize-none`} placeholder="Contanos sobre vos, tu experiencia, tu estilo…" />
                </div>

                <div>
                    <label className={labelCls}>Link de video</label>
                    <input type="url" value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} className={inputCls} placeholder="YouTube, Instagram, Vimeo…" />
                </div>

                <button type="submit" disabled={enviando || subiendo}
                    className="w-full bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs py-4 hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                    {enviando ? <Loader2 size={15} className="animate-spin" /> : null} Enviar postulación
                </button>
            </form>
        </div>
    )
}
