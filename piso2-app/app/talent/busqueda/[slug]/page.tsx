'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { optimizeImage } from '@/utils/optimizeImage'
import {
    getBusquedaBySlugAction, getPerfilEstadoAction, guardarPerfilTalentoAction, postularConPerfilAction,
    type BusquedaPublica,
} from '@/app/actions/talent'
import { toast, Toaster } from 'sonner'
import { Loader2, Upload, ArrowLeft, CheckCircle2, X, MapPin, CalendarDays, Link2, FileSignature, Eraser } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const RUBROS = ['Bailarin/a', 'Acrobata', 'Modelo', 'Cantante', 'Musico/a', 'Influencer', 'Actor/Actriz']
const inputCls = "w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors"
const labelCls = "text-[10px] font-semibold tracking-[0.15em] uppercase text-neutral-500 block mb-1.5"

const FOTOS_REQ = [
    { key: 'cuerpo', label: 'Cuerpo entero' },
    { key: 'primer', label: 'Primer plano' },
    { key: 'americano', label: 'Plano americano' },
] as const

type Paso = 'landing' | 'email' | 'reusar' | 'form' | 'listo'

export default function BusquedaPublicaPage() {
    const params = useParams()
    const slug = params.slug as string
    const [supabase] = useState(() => createClient())

    const [busqueda, setBusqueda] = useState<BusquedaPublica | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)
    const [paso, setPaso] = useState<Paso>('landing')

    // Email / reuso de perfil
    const [email, setEmail] = useState('')
    const [chequeando, setChequeando] = useState(false)
    const [perfilExistente, setPerfilExistente] = useState<{ id: string; nombre: string } | null>(null)

    // Datos del perfil
    const [form, setForm] = useState({
        nombre: '', dni: '', telefono: '', disciplina: '', sexo: '', edad: '', altura: '',
        nacionalidad: '', direccion: '', descripcion: '', residenteArg: true,
    })
    // Fotos por tipo + extra
    const [fotos, setFotos] = useState<Record<string, string>>({})
    const [fotosExtra, setFotosExtra] = useState<string[]>([])
    const [subiendoFoto, setSubiendoFoto] = useState<string | null>(null)
    // Videos (link de Drive o archivo subido)
    const [videos, setVideos] = useState<string[]>(['', '', ''])
    const [subiendoVideo, setSubiendoVideo] = useState<number | null>(null)
    // Acuerdo / firma
    const [firmaAclaracion, setFirmaAclaracion] = useState('')
    const [firmaDni, setFirmaDni] = useState('')
    const [repNombre, setRepNombre] = useState('')
    const [repDni, setRepDni] = useState('')
    const [localidad, setLocalidad] = useState('')
    const [acepto, setAcepto] = useState(false)
    const [tieneFirma, setTieneFirma] = useState(false)
    const [enviando, setEnviando] = useState(false)

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const dibujando = useRef(false)

    useEffect(() => {
        getBusquedaBySlugAction(slug)
            .then(d => { if (d) setBusqueda(d); else setNotFound(true); setLoading(false) })
            .catch(() => { setNotFound(true); setLoading(false) })
    }, [slug])

    // ---- Firma (canvas) ----
    const canvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const c = canvasRef.current!; const r = c.getBoundingClientRect()
        return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
    }
    const firmaStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault(); dibujando.current = true
        const ctx = canvasRef.current!.getContext('2d')!
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'
        const { x, y } = canvasPos(e); ctx.beginPath(); ctx.moveTo(x, y)
    }
    const firmaMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dibujando.current) return
        e.preventDefault()
        const ctx = canvasRef.current!.getContext('2d')!
        const { x, y } = canvasPos(e); ctx.lineTo(x, y); ctx.stroke()
        if (!tieneFirma) setTieneFirma(true)
    }
    const firmaEnd = () => { dibujando.current = false }
    const borrarFirma = () => {
        const c = canvasRef.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setTieneFirma(false)
    }

    // ---- Uploads ----
    const subirFotoTipo = async (key: string, file: File | null, extra = false) => {
        if (!file) return
        setSubiendoFoto(extra ? 'extra' : key)
        try {
            const opt = await optimizeImage(file, { maxDim: 1400 })
            const ext = opt.name.split('.').pop()
            const path = `perfiles/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error } = await supabase.storage.from('talent').upload(path, opt)
            if (error) throw error
            const url = supabase.storage.from('talent').getPublicUrl(path).data.publicUrl
            if (extra) setFotosExtra(f => [...f, url].slice(0, 5))
            else setFotos(f => ({ ...f, [key]: url }))
        } catch (e: any) { toast.error('No se pudo subir la foto: ' + (e.message || '')) }
        setSubiendoFoto(null)
    }
    const subirVideoArchivo = async (i: number, file: File | null) => {
        if (!file) return
        setSubiendoVideo(i)
        try {
            const ext = file.name.split('.').pop()
            const path = `perfiles/video-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error } = await supabase.storage.from('talent').upload(path, file)
            if (error) throw error
            const url = supabase.storage.from('talent').getPublicUrl(path).data.publicUrl
            setVideos(vs => vs.map((v, idx) => idx === i ? url : v))
        } catch (e: any) { toast.error('No se pudo subir el video: ' + (e.message || '')) }
        setSubiendoVideo(null)
    }

    // ---- Pasos ----
    const chequearEmail = async () => {
        if (!email.trim()) return toast.error('Ingresá tu email.')
        setChequeando(true)
        const est = await getPerfilEstadoAction(email)
        if (est.existe && est.completo && est.id) { setPerfilExistente({ id: est.id, nombre: est.nombre || '' }); setPaso('reusar') }
        else { setForm(f => ({ ...f, nombre: est.nombre || f.nombre })); setPaso('form') }
        setChequeando(false)
    }

    const postularExistente = async () => {
        if (!perfilExistente || !busqueda) return
        setEnviando(true)
        const res = await postularConPerfilAction(busqueda.id, perfilExistente.id)
        if (res.success) setPaso('listo'); else toast.error(res.error || 'Error')
        setEnviando(false)
    }

    const enviarPerfilYPostular = async () => {
        if (!busqueda) return
        if (!form.nombre.trim()) return toast.error('Completá tu nombre.')
        if (!fotos.cuerpo || !fotos.primer || !fotos.americano) return toast.error('Subí las 3 fotos requeridas.')
        const vids = videos.map(v => v.trim()).filter(Boolean)
        if (vids.length < 3) return toast.error('Cargá los 3 videos (Drive o archivo).')
        if (!acepto) return toast.error('Tenés que aceptar el acuerdo.')
        if (!tieneFirma) return toast.error('Dejá tu firma en el recuadro.')
        if (!firmaAclaracion.trim() || !firmaDni.trim()) return toast.error('Completá aclaración y DNI de la firma.')

        setEnviando(true)
        try {
            // Subir la firma
            const blob: Blob = await new Promise((res, rej) => canvasRef.current!.toBlob(b => b ? res(b) : rej(new Error('firma')), 'image/png'))
            const fpath = `perfiles/firma-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
            const up = await supabase.storage.from('talent').upload(fpath, blob, { contentType: 'image/png' })
            if (up.error) throw up.error
            const firmaUrl = supabase.storage.from('talent').getPublicUrl(fpath).data.publicUrl

            const guardado = await guardarPerfilTalentoAction({
                email, nombre: form.nombre, dni: form.dni, telefono: form.telefono, disciplina: form.disciplina,
                sexo: form.sexo || undefined, edad: form.edad ? Number(form.edad) : undefined, altura: form.altura ? Number(form.altura) : undefined,
                nacionalidad: form.nacionalidad, residenteArgentina: form.residenteArg, direccion: form.direccion, descripcion: form.descripcion,
                fotoCuerpoEntero: fotos.cuerpo, fotoPrimerPlano: fotos.primer, fotoPlanoAmericano: fotos.americano, fotosExtra,
                videos: vids,
                acuerdoAceptado: acepto, firmaUrl, firmaAclaracion, firmaDni,
                representanteNombre: repNombre, representanteDni: repDni, firmaUbicacion: localidad,
            })
            if (!guardado.success || !guardado.id) throw new Error(guardado.error || 'No se pudo guardar el perfil')

            const post = await postularConPerfilAction(busqueda.id, guardado.id)
            if (!post.success) throw new Error(post.error || 'No se pudo postular')
            setPaso('listo')
        } catch (e: any) { toast.error(e.message || 'Error al enviar') }
        setEnviando(false)
    }

    if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
    if (notFound) return (
        <div className={`min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-neutral-500 px-6 text-center ${sans.className}`}>
            <p className="uppercase tracking-widest text-sm font-semibold">Esta búsqueda no existe o ya cerró.</p>
            <Link href="/talent" className="text-black underline text-xs uppercase tracking-widest">Ir a Piso 2 Talent</Link>
        </div>
    )
    const b = busqueda!
    const vencida = b.fecha_limite && new Date(b.fecha_limite) < new Date()
    const pdfUrl = form.residenteArg ? '/acuerdos/acuerdo-residente-argentina.pdf' : '/acuerdos/acuerdo-no-residente.pdf'

    return (
        <div className={`min-h-screen bg-white text-neutral-900 ${sans.className}`}>
            <Toaster position="top-center" richColors />
            <div className="bg-black text-white py-2.5">
                <div className="max-w-3xl mx-auto px-5">
                    <Link href="/talent" className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white flex items-center gap-1.5"><ArrowLeft size={13} /> Piso 2 Talent</Link>
                </div>
            </div>

            <header className="pt-12 pb-6 text-center px-6">
                <p className={`${serif.className} text-[11px] tracking-[0.5em] text-neutral-500 uppercase`}>Piso 2 Talent</p>
                <h1 className={`${serif.className} text-3xl md:text-5xl tracking-[0.08em] font-medium mt-2 max-w-2xl mx-auto`}>{b.titulo}</h1>
                <div className="flex flex-wrap items-center justify-center gap-4 mt-5 text-xs text-neutral-500">
                    {b.ubicacion && <span className="flex items-center gap-1.5"><MapPin size={13} /> {b.ubicacion}</span>}
                    {b.categoria && b.categoria !== 'todos' && <span className="border border-neutral-300 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-semibold">{b.categoria === 'mujeres' ? 'Mujeres' : 'Varones'}</span>}
                    {b.fecha_limite && <span className="flex items-center gap-1.5"><CalendarDays size={13} /> Hasta {new Date(b.fecha_limite + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
                </div>
            </header>

            {paso === 'listo' ? (
                <div className="max-w-2xl mx-auto px-6 pb-24 text-center pt-6">
                    <CheckCircle2 size={44} className="text-neutral-900 mb-5 mx-auto" strokeWidth={1.5} />
                    <h2 className={`${serif.className} text-3xl tracking-wide mb-3`}>Postulación enviada</h2>
                    <p className="text-neutral-500 text-sm max-w-sm mx-auto leading-relaxed">Piso 2 va a revisar tu perfil para <span className="font-semibold text-neutral-700">{b.titulo}</span>. Si quedás seleccionado/a, te contactamos.</p>
                    <Link href="/talent" className="inline-block mt-8 text-[11px] font-semibold tracking-[0.2em] uppercase border border-neutral-900 px-6 py-3 hover:bg-neutral-900 hover:text-white transition-colors">Ir a Piso 2 Talent</Link>
                </div>
            ) : (
                <div className="max-w-2xl mx-auto px-6 pb-24">
                    {(b.descripcion || b.requisitos) && (
                        <div className="pb-6">
                            {b.descripcion && <p className="text-neutral-600 text-sm leading-relaxed whitespace-pre-line mb-4">{b.descripcion}</p>}
                            {b.requisitos && <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5"><p className="text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Requisitos</p><p className="text-neutral-700 text-sm leading-relaxed whitespace-pre-line">{b.requisitos}</p></div>}
                        </div>
                    )}

                    {vencida ? (
                        <div className="py-16 text-center border-2 border-dashed border-neutral-200 rounded-2xl"><p className="text-neutral-400 font-bold uppercase text-xs tracking-widest">El plazo para postularse ya cerró.</p></div>
                    ) : paso === 'landing' ? (
                        <div className="border-t border-neutral-200 pt-8 text-center">
                            <p className="text-neutral-600 text-sm max-w-md mx-auto mb-6">Para postularte necesitás tu <b>perfil de talento</b>: 3 fotos, 3 videos y el acuerdo firmado. Se crea una vez y te sirve para todas las búsquedas.</p>
                            <button onClick={() => setPaso('email')} className="bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs px-8 py-4 hover:bg-black transition-colors">Postularme a esta búsqueda</button>
                        </div>
                    ) : paso === 'email' ? (
                        <div className="border-t border-neutral-200 pt-8 max-w-sm mx-auto">
                            <h2 className={`${serif.className} text-xl tracking-wide mb-4`}>Tu email</h2>
                            <label className={labelCls}>Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="tu@email.com" />
                            <p className="text-[11px] text-neutral-400 mt-2">Con tu email identificamos tu perfil. Si ya lo tenés, te evitamos volver a cargarlo.</p>
                            <button onClick={chequearEmail} disabled={chequeando} className="w-full mt-5 bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs py-4 hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                                {chequeando ? <Loader2 size={15} className="animate-spin" /> : null} Continuar
                            </button>
                        </div>
                    ) : paso === 'reusar' ? (
                        <div className="border-t border-neutral-200 pt-8 text-center max-w-md mx-auto">
                            <CheckCircle2 size={38} className="text-emerald-600 mb-4 mx-auto" strokeWidth={1.5} />
                            <h2 className={`${serif.className} text-2xl tracking-wide mb-2`}>¡Hola{perfilExistente?.nombre ? `, ${perfilExistente.nombre}` : ''}!</h2>
                            <p className="text-neutral-500 text-sm mb-6">Ya tenés tu perfil de talento con el acuerdo firmado. ¿Querés postularte a <b>{b.titulo}</b>?</p>
                            <button onClick={postularExistente} disabled={enviando} className="bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs px-8 py-4 hover:bg-black transition-colors disabled:opacity-40 inline-flex items-center gap-2">
                                {enviando ? <Loader2 size={15} className="animate-spin" /> : null} Sí, postularme
                            </button>
                            <button onClick={() => { setPerfilExistente(null); setForm(f => ({ ...f })); setPaso('form') }} className="block mx-auto mt-4 text-[11px] uppercase tracking-widest text-neutral-400 hover:text-black">Actualizar mi perfil</button>
                        </div>
                    ) : (
                        // paso === 'form'
                        <div className="border-t border-neutral-200 pt-8 space-y-8">
                            <div>
                                <h2 className={`${serif.className} text-xl md:text-2xl tracking-wide mb-1`}>Creá tu perfil de talento</h2>
                                <p className="text-[11px] text-neutral-400">Todo es obligatorio salvo lo indicado. Al final firmás el acuerdo.</p>
                            </div>

                            {/* Datos */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div><label className={labelCls}>Nombre completo *</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputCls} placeholder="Nombre y apellido" /></div>
                                <div><label className={labelCls}>DNI / Pasaporte</label><input value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} className={inputCls} /></div>
                                <div><label className={labelCls}>Teléfono</label><input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className={inputCls} placeholder="+54 11 ..." /></div>
                                <div><label className={labelCls}>Disciplina</label><select value={form.disciplina} onChange={e => setForm({ ...form, disciplina: e.target.value })} className={inputCls}><option value="">Elegir...</option>{RUBROS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                                <div><label className={labelCls}>Sexo</label><select value={form.sexo} onChange={e => setForm({ ...form, sexo: e.target.value })} className={inputCls}><option value="">Elegir...</option><option value="mujeres">Femenino</option><option value="varones">Masculino</option></select></div>
                                <div><label className={labelCls}>Edad</label><input type="number" min={0} value={form.edad} onChange={e => setForm({ ...form, edad: e.target.value })} className={inputCls} /></div>
                                <div><label className={labelCls}>Altura (cm)</label><input type="number" min={0} value={form.altura} onChange={e => setForm({ ...form, altura: e.target.value })} className={inputCls} /></div>
                                <div><label className={labelCls}>Nacionalidad</label><input value={form.nacionalidad} onChange={e => setForm({ ...form, nacionalidad: e.target.value })} className={inputCls} placeholder="Ej: Argentina" /></div>
                            </div>
                            <div>
                                <label className={labelCls}>Descripción</label>
                                <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={3} className={`${inputCls} resize-none`} placeholder="Contanos sobre vos, tu experiencia, tu estilo..." />
                            </div>

                            {/* Fotos por tipo */}
                            <div>
                                <span className={labelCls}>Fotos requeridas *</span>
                                <div className="grid grid-cols-3 gap-3">
                                    {FOTOS_REQ.map(f => (
                                        <label key={f.key} className={`aspect-[3/4] border rounded-lg flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors relative overflow-hidden ${fotos[f.key] ? 'border-neutral-900' : 'border-dashed border-neutral-300 hover:border-neutral-900'}`}>
                                            {fotos[f.key]
                                                ? <img src={fotos[f.key]} alt={f.label} className="absolute inset-0 w-full h-full object-cover" />
                                                : (subiendoFoto === f.key ? <Loader2 className="animate-spin text-neutral-400" size={20} /> : <Upload size={20} className="text-neutral-400" />)}
                                            <span className={`text-[9px] uppercase tracking-widest font-semibold text-center px-1 ${fotos[f.key] ? 'absolute bottom-0 left-0 right-0 bg-black/70 text-white py-1' : 'text-neutral-500'}`}>{f.label}</span>
                                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => subirFotoTipo(f.key, e.target.files?.[0] || null)} />
                                        </label>
                                    ))}
                                </div>
                                {/* Extra opcionales */}
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {fotosExtra.map((u, i) => (
                                        <div key={i} className="relative w-16 aspect-[3/4] overflow-hidden bg-neutral-100 border border-neutral-200 rounded">
                                            <img src={u} alt="" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => setFotosExtra(f => f.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"><X size={11} /></button>
                                        </div>
                                    ))}
                                    {fotosExtra.length < 5 && (
                                        <label className="w-16 aspect-[3/4] border border-dashed border-neutral-300 rounded flex items-center justify-center cursor-pointer hover:border-neutral-900 text-neutral-400">
                                            {subiendoFoto === 'extra' ? <Loader2 className="animate-spin" size={16} /> : <span className="text-[9px] uppercase">+ extra</span>}
                                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => subirFotoTipo('extra', e.target.files?.[0] || null, true)} />
                                        </label>
                                    )}
                                </div>
                            </div>

                            {/* Videos */}
                            <div>
                                <span className={labelCls}>3 Videos * <span className="text-neutral-400 normal-case tracking-normal">— link de Google Drive o subí el archivo. No se aceptan links de YouTube.</span></span>
                                <div className="space-y-2.5">
                                    {videos.map((v, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className="flex-1 relative">
                                                <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                                                <input value={v} onChange={e => setVideos(vs => vs.map((x, idx) => idx === i ? e.target.value : x))} className={`${inputCls} pl-9`} placeholder={`Video ${i + 1} — link de Drive`} />
                                            </div>
                                            <label className="shrink-0 border border-neutral-300 rounded-lg px-3 py-3 text-[10px] font-semibold uppercase tracking-widest cursor-pointer hover:border-black transition-colors flex items-center gap-1.5">
                                                {subiendoVideo === i ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Subir
                                                <input type="file" accept="video/*" className="hidden" onChange={e => subirVideoArchivo(i, e.target.files?.[0] || null)} />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Acuerdo */}
                            <div className="border-t border-neutral-200 pt-6">
                                <h3 className={`${serif.className} text-lg tracking-wide mb-1 flex items-center gap-2`}><FileSignature size={18} /> Acuerdo de booking</h3>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-[11px] text-neutral-500">¿Residís en Argentina?</span>
                                    <div className="flex rounded-lg overflow-hidden border border-neutral-300">
                                        <button type="button" onClick={() => setForm({ ...form, residenteArg: true })} className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest ${form.residenteArg ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500'}`}>Sí</button>
                                        <button type="button" onClick={() => setForm({ ...form, residenteArg: false })} className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest ${!form.residenteArg ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500'}`}>No</button>
                                    </div>
                                </div>
                                <p className="text-[11px] text-neutral-400 mb-2">Leé el acuerdo ({form.residenteArg ? 'residente en Argentina' : 'no residente'}). <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline text-neutral-700">Abrir en pestaña</a></p>
                                <iframe src={pdfUrl} className="w-full h-[55vh] border border-neutral-300 rounded-lg bg-neutral-50" title="Acuerdo" />

                                {/* Firma */}
                                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><label className={labelCls}>Aclaración (nombre) *</label><input value={firmaAclaracion} onChange={e => setFirmaAclaracion(e.target.value)} className={inputCls} placeholder="Nombre y apellido" /></div>
                                    <div><label className={labelCls}>DNI / NIF / NIE *</label><input value={firmaDni} onChange={e => setFirmaDni(e.target.value)} className={inputCls} /></div>
                                    <div><label className={labelCls}>Representante legal (solo si sos menor)</label><input value={repNombre} onChange={e => setRepNombre(e.target.value)} className={inputCls} placeholder="Nombre del representante" /></div>
                                    <div><label className={labelCls}>DNI del representante</label><input value={repDni} onChange={e => setRepDni(e.target.value)} className={inputCls} /></div>
                                    <div className="sm:col-span-2"><label className={labelCls}>Localidad (dónde firmás)</label><input value={localidad} onChange={e => setLocalidad(e.target.value)} className={inputCls} placeholder="Ej: Buenos Aires" /></div>
                                </div>

                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className={labelCls + ' mb-0'}>Firma *</label>
                                        <button type="button" onClick={borrarFirma} className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-black flex items-center gap-1"><Eraser size={12} /> Borrar</button>
                                    </div>
                                    <canvas ref={canvasRef} width={600} height={200}
                                        onPointerDown={firmaStart} onPointerMove={firmaMove} onPointerUp={firmaEnd} onPointerLeave={firmaEnd}
                                        className="w-full h-40 border border-neutral-300 rounded-lg bg-white touch-none cursor-crosshair" />
                                    <p className="text-[10px] text-neutral-400 mt-1">Firmá con el dedo o el mouse. Fecha: {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
                                </div>

                                <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
                                    <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} className="mt-0.5" />
                                    <span className="text-xs text-neutral-600 leading-relaxed">He leído y <b>acepto en todos sus términos y condiciones</b> el Acuerdo de Booking Artístico de Piso 2 x Latino Talent Agency, y firmo de manera digital.</span>
                                </label>
                            </div>

                            <button onClick={enviarPerfilYPostular} disabled={enviando}
                                className="w-full bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs py-4 hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                                {enviando ? <Loader2 size={15} className="animate-spin" /> : <FileSignature size={15} />} Firmar y postularme
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
