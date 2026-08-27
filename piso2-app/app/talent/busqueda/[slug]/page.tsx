'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { optimizeImage } from '@/utils/optimizeImage'
import { getBusquedaBySlugAction, crearPostulacionBusquedaAction, type BusquedaPublica } from '@/app/actions/talent'
import { toast, Toaster } from 'sonner'
import { Loader2, Upload, ArrowLeft, CheckCircle2, X, MapPin, CalendarDays, Play } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const RUBROS = ['Bailarin/a', 'Acrobata', 'Modelo', 'Cantante', 'Musico/a', 'Influencer', 'Actor/Actriz']
const MAX_FOTOS = 6

const inputCls = "w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors"
const labelCls = "text-[10px] font-semibold tracking-[0.15em] uppercase text-neutral-500 block mb-1.5"

export default function BusquedaPublicaPage() {
    const params = useParams()
    const [supabase] = useState(() => createClient())

    const [busqueda, setBusqueda] = useState<BusquedaPublica | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)

    const [form, setForm] = useState({
        nombre: '', email: '', telefono: '', sexo: '', rubro: '', edad: '', altura: '', nacionalidad: '', descripcion: ''
    })
    const [fotos, setFotos] = useState<string[]>([])
    const [videos, setVideos] = useState<string[]>(['', '', ''])
    const [subiendo, setSubiendo] = useState(false)
    const [enviando, setEnviando] = useState(false)
    const [listo, setListo] = useState(false)

    useEffect(() => {
        getBusquedaBySlugAction(params.slug as string)
            .then(data => {
                if (data) setBusqueda(data)
                else setNotFound(true)
                setLoading(false)
            })
            .catch(() => { setNotFound(true); setLoading(false) })
    }, [params.slug])

    const handleFotos = async (files: FileList | null) => {
        if (!files || !files.length) return
        setSubiendo(true)
        const nuevas: string[] = []
        for (const file of Array.from(files)) {
            if (fotos.length + nuevas.length >= MAX_FOTOS) break
            try {
                const opt = await optimizeImage(file, { maxDim: 1400 })
                const ext = opt.name.split('.').pop()
                const path = `busquedas/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
                const { error } = await supabase.storage.from('talent').upload(path, opt)
                if (error) throw error
                nuevas.push(supabase.storage.from('talent').getPublicUrl(path).data.publicUrl)
            } catch (e: any) {
                toast.error('No se pudo subir una foto: ' + (e.message || ''))
            }
        }
        setFotos(f => [...f, ...nuevas].slice(0, MAX_FOTOS))
        setSubiendo(false)
    }

    const quitarFoto = (i: number) => setFotos(f => f.filter((_, idx) => idx !== i))
    const setVideo = (i: number, v: string) => setVideos(vs => vs.map((x, idx) => idx === i ? v : x))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!fotos.length) return toast.error('Subi al menos una foto.')
        if (!form.nombre.trim()) return toast.error('Completa tu nombre.')
        if (!form.email.trim()) return toast.error('Completa tu email.')
        if (!form.nacionalidad.trim()) return toast.error('Completa tu nacionalidad.')

        setEnviando(true)
        const res = await crearPostulacionBusquedaAction({
            busquedaId: busqueda!.id,
            nombre: form.nombre,
            email: form.email,
            telefono: form.telefono,
            rubro: form.rubro,
            descripcion: form.descripcion,
            edad: form.edad ? Number(form.edad) : undefined,
            altura: form.altura ? Number(form.altura) : undefined,
            nacionalidad: form.nacionalidad,
            sexo: form.sexo || undefined,
            fotos,
            videos: videos.filter(v => v.trim())
        })
        if (res.success) setListo(true)
        else toast.error(res.error || 'Error al enviar la postulacion')
        setEnviando(false)
    }

    if (loading) return (
        <div className="min-h-screen bg-white flex items-center justify-center">
            <Loader2 className="animate-spin text-neutral-300" size={32} />
        </div>
    )

    if (notFound) return (
        <div className={`min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-neutral-500 px-6 text-center ${sans.className}`}>
            <p className="uppercase tracking-widest text-sm font-semibold">Esta busqueda no existe o ya cerro.</p>
            <Link href="/talent" className="text-black underline text-xs uppercase tracking-widest">Ir a Piso 2 Talent</Link>
        </div>
    )

    if (listo) return (
        <div className={`min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center px-6 text-center ${sans.className}`}>
            <CheckCircle2 size={44} className="text-neutral-900 mb-5" strokeWidth={1.5} />
            <h1 className={`${serif.className} text-3xl md:text-4xl tracking-wide mb-3`}>Postulacion enviada</h1>
            <p className="text-neutral-500 text-sm max-w-sm leading-relaxed">Piso 2 va a revisar tu perfil para <span className="font-semibold text-neutral-700">{busqueda!.titulo}</span>. Si quedas seleccionado/a, te contactamos.</p>
            <Link href="/talent" className="mt-8 text-[11px] font-semibold tracking-[0.2em] uppercase border border-neutral-900 px-6 py-3 hover:bg-neutral-900 hover:text-white transition-colors">Ir a Piso 2 Talent</Link>
        </div>
    )

    const vencida = busqueda!.fecha_limite && new Date(busqueda!.fecha_limite) < new Date()

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

            <header className="pt-12 pb-6 text-center px-6">
                <p className={`${serif.className} text-[11px] tracking-[0.5em] text-neutral-500 uppercase`}>Piso 2 Talent</p>
                <h1 className={`${serif.className} text-3xl md:text-5xl tracking-[0.08em] font-medium mt-2 max-w-2xl mx-auto`}>{busqueda!.titulo}</h1>

                <div className="flex flex-wrap items-center justify-center gap-4 mt-5 text-xs text-neutral-500">
                    {busqueda!.ubicacion && (
                        <span className="flex items-center gap-1.5"><MapPin size={13} /> {busqueda!.ubicacion}</span>
                    )}
                    {busqueda!.categoria && busqueda!.categoria !== 'todos' && (
                        <span className="border border-neutral-300 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-semibold">
                            {busqueda!.categoria === 'mujeres' ? 'Mujeres' : 'Varones'}
                        </span>
                    )}
                    {busqueda!.fecha_limite && (
                        <span className="flex items-center gap-1.5">
                            <CalendarDays size={13} />
                            Hasta {new Date(busqueda!.fecha_limite + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                    )}
                </div>
            </header>

            {(busqueda!.descripcion || busqueda!.requisitos) && (
                <div className="max-w-2xl mx-auto px-6 pb-6">
                    {busqueda!.descripcion && (
                        <div className="mb-5">
                            <p className="text-neutral-600 text-sm leading-relaxed whitespace-pre-line">{busqueda!.descripcion}</p>
                        </div>
                    )}
                    {busqueda!.requisitos && (
                        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
                            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Requisitos</p>
                            <p className="text-neutral-700 text-sm leading-relaxed whitespace-pre-line">{busqueda!.requisitos}</p>
                        </div>
                    )}
                </div>
            )}

            {vencida ? (
                <div className="max-w-2xl mx-auto px-6 pb-24">
                    <div className="py-16 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                        <p className="text-neutral-400 font-bold uppercase text-xs tracking-widest">El plazo para postularse ya cerro.</p>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-6 pb-24 space-y-6">
                    <div className="border-t border-neutral-200 pt-8">
                        <h2 className={`${serif.className} text-xl md:text-2xl tracking-wide mb-6`}>Postulate</h2>
                    </div>

                    <div>
                        <span className={labelCls}>Fotos <span className="text-neutral-400 normal-case tracking-normal">(hasta {MAX_FOTOS})</span></span>
                        <div className="flex flex-wrap gap-3">
                            {fotos.map((url, i) => (
                                <div key={i} className="relative w-32 aspect-[3/4] overflow-hidden bg-neutral-100 border border-neutral-200">
                                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                                    <button type="button" onClick={() => quitarFoto(i)} className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full p-1 hover:bg-black"><X size={13} /></button>
                                </div>
                            ))}
                            {fotos.length < MAX_FOTOS && (
                                <label className="w-32 aspect-[3/4] border border-dashed border-neutral-300 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-neutral-900 transition-colors text-neutral-400">
                                    {subiendo ? <Loader2 className="animate-spin" size={22} /> : <Upload size={22} />}
                                    <span className="text-[10px] uppercase tracking-widest font-semibold">Subir</span>
                                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => handleFotos(e.target.files)} />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                            <label className={labelCls}>Nombre completo *</label>
                            <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputCls} placeholder="Nombre y apellido" />
                        </div>
                        <div>
                            <label className={labelCls}>Email *</label>
                            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="tu@email.com" />
                        </div>
                        <div>
                            <label className={labelCls}>Telefono</label>
                            <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className={inputCls} placeholder="+54 11 ..." />
                        </div>
                        <div>
                            <label className={labelCls}>Sexo</label>
                            <select value={form.sexo} onChange={e => setForm({ ...form, sexo: e.target.value })} className={inputCls}>
                                <option value="">Elegir...</option>
                                <option value="mujeres">Femenino</option>
                                <option value="varones">Masculino</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Rubro</label>
                            <select value={form.rubro} onChange={e => setForm({ ...form, rubro: e.target.value })} className={inputCls}>
                                <option value="">Elegir...</option>
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
                        <div>
                            <label className={labelCls}>Nacionalidad *</label>
                            <input required value={form.nacionalidad} onChange={e => setForm({ ...form, nacionalidad: e.target.value })} className={inputCls} placeholder="Ej: Argentina" />
                        </div>
                    </div>

                    <div>
                        <label className={labelCls}>Descripcion</label>
                        <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={4} className={`${inputCls} resize-none`} placeholder="Contanos sobre vos, tu experiencia, tu estilo..." />
                    </div>

                    <div>
                        <label className={labelCls}>Links de video <span className="text-neutral-400 normal-case tracking-normal">(hasta 3)</span></label>
                        <div className="space-y-2.5">
                            {videos.map((v, i) => (
                                <input key={i} type="url" value={v} onChange={e => setVideo(i, e.target.value)} className={inputCls} placeholder={i === 0 ? 'YouTube, Instagram, Vimeo...' : 'Otro link (opcional)'} />
                            ))}
                        </div>
                    </div>

                    <button type="submit" disabled={enviando || subiendo}
                        className="w-full bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs py-4 hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                        {enviando ? <Loader2 size={15} className="animate-spin" /> : null} Enviar postulacion
                    </button>
                </form>
            )}
        </div>
    )
}
