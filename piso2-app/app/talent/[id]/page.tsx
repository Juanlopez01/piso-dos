'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, X, Send, CheckCircle2 } from 'lucide-react'
import { Montserrat } from 'next/font/google'
import { getTalentoAction, crearSolicitudTalentoAction, type TalentoPublico } from '@/app/actions/talent'

const montserrat = Montserrat({ subsets: ['latin'], weight: ['300', '400', '700', '900'] })

// Convierte un link de YouTube/Vimeo en URL embebible
function toEmbed(url: string | null): string | null {
    if (!url) return null
    const yt = url.match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/)
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`
    const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
    if (vm) return `https://player.vimeo.com/video/${vm[1]}`
    return url
}

export default function TalentoDetallePage() {
    const params = useParams()
    const [t, setT] = useState<TalentoPublico | null>(null)
    const [loading, setLoading] = useState(true)
    const [fotoActiva, setFotoActiva] = useState(0)

    const [modalOpen, setModalOpen] = useState(false)
    const [form, setForm] = useState({ nombre: '', contacto: '', empresa: '', mensaje: '' })
    const [enviando, setEnviando] = useState(false)
    const [enviado, setEnviado] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        getTalentoAction(params.id as string)
            .then(data => { setT(data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [params.id])

    const handleEnviar = async () => {
        if (!form.nombre.trim() || !form.contacto.trim()) { setError('Completá tu nombre y un medio de contacto.'); return }
        setError(''); setEnviando(true)
        const res = await crearSolicitudTalentoAction({
            talentoId: t!.id,
            talentoNombre: t!.nombre,
            clienteNombre: form.nombre,
            clienteContacto: form.contacto,
            clienteEmpresa: form.empresa,
            mensaje: form.mensaje
        })
        setEnviando(false)
        if (res.success) setEnviado(true)
        else setError(res.error || 'No se pudo enviar. Intentá de nuevo.')
    }

    if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
    if (!t) return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-neutral-500">
            <p className="uppercase tracking-widest text-sm">No encontramos este talento.</p>
            <Link href="/talent" className="text-black underline text-xs uppercase tracking-widest">Volver a Talent</Link>
        </div>
    )

    const embed = toEmbed(t.video_url)
    const esObra = t.categoria === 'obras'

    return (
        <div className={`min-h-screen bg-white text-neutral-900 ${montserrat.className}`}>
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-200 h-16">
                <div className="max-w-6xl mx-auto px-5 md:px-8 h-full flex items-center justify-between">
                    <Link href="/talent" className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase hover:text-black transition-colors">
                        <ArrowLeft size={15} /> Talent
                    </Link>
                    <img src="/2-verde.png" alt="Piso 2" className="w-6" />
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-5 md:px-8 pt-24 pb-28">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">

                    {/* GALERÍA (BOOK) */}
                    <div>
                        <div className="w-full overflow-hidden bg-neutral-100" style={{ aspectRatio: esObra ? '4 / 3' : '3 / 4' }}>
                            {t.fotos?.[fotoActiva]
                                ? <img src={t.fotos[fotoActiva]} alt={t.nombre} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-neutral-300 text-xs uppercase tracking-widest">Sin foto</div>}
                        </div>
                        {t.fotos && t.fotos.length > 1 && (
                            <div className="grid grid-cols-5 gap-2 mt-2">
                                {t.fotos.map((f, i) => (
                                    <button key={i} onClick={() => setFotoActiva(i)} className={`overflow-hidden bg-neutral-100 aspect-square transition-opacity ${fotoActiva === i ? 'ring-2 ring-black' : 'opacity-60 hover:opacity-100'}`}>
                                        <img src={f} alt="" className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* INFO */}
                    <div className="lg:pt-4">
                        <p className="text-[11px] font-bold tracking-[0.4em] uppercase text-neutral-400 mb-3">{t.categoria === 'obras' ? 'Obra / Compañía' : t.categoria === 'mujeres' ? 'Mujeres' : 'Varones'}</p>
                        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none">{t.nombre}</h1>
                        {t.disciplina && <p className="mt-3 text-neutral-500 uppercase tracking-widest text-sm">{t.disciplina}</p>}

                        {t.bio && <p className="mt-8 text-neutral-600 leading-relaxed font-light whitespace-pre-wrap">{t.bio}</p>}

                        {embed && (
                            <div className="mt-8">
                                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-3">Reel</p>
                                <div className="w-full bg-black" style={{ aspectRatio: '16 / 9' }}>
                                    <iframe src={embed} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={`Reel ${t.nombre}`} />
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => { setModalOpen(true); setEnviado(false); setError('') }}
                            className="mt-10 w-full md:w-auto inline-flex items-center justify-center gap-3 bg-black text-white font-bold uppercase px-10 py-4 text-xs tracking-[0.2em] hover:bg-neutral-800 transition-colors"
                        >
                            Solicitar este talento
                        </button>
                        <p className="mt-3 text-[10px] text-neutral-400 uppercase tracking-widest">La solicitud llega a Piso 2, que gestiona la contratación.</p>
                    </div>
                </div>
            </div>

            {/* MODAL SOLICITUD */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setModalOpen(false)}>
                    <div className="bg-white w-full max-w-md p-8 relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setModalOpen(false)} className="absolute top-5 right-5 text-neutral-400 hover:text-black"><X size={20} /></button>

                        {enviado ? (
                            <div className="text-center py-8">
                                <CheckCircle2 className="mx-auto text-black mb-4" size={40} />
                                <h3 className="text-xl font-black uppercase tracking-tighter">¡Solicitud enviada!</h3>
                                <p className="text-neutral-500 text-sm mt-2 font-light">Piso 2 se va a contactar con vos a la brevedad.</p>
                                <button onClick={() => setModalOpen(false)} className="mt-6 text-xs uppercase tracking-widest underline">Cerrar</button>
                            </div>
                        ) : (
                            <>
                                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-1">Solicitar</p>
                                <h3 className="text-2xl font-black uppercase tracking-tighter leading-none mb-6">{t.nombre}</h3>
                                <div className="space-y-3">
                                    <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Tu nombre *" className="w-full border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black transition-colors" />
                                    <input value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} placeholder="Email o teléfono *" className="w-full border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black transition-colors" />
                                    <input value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} placeholder="Empresa / Marca (opcional)" className="w-full border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black transition-colors" />
                                    <textarea value={form.mensaje} onChange={e => setForm({ ...form, mensaje: e.target.value })} placeholder="Contanos qué necesitás (fecha, tipo de trabajo, etc.)" className="w-full border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black transition-colors min-h-[100px] resize-none" />
                                    {error && <p className="text-red-600 text-xs">{error}</p>}
                                    <button onClick={handleEnviar} disabled={enviando} className="w-full bg-black text-white font-bold uppercase py-4 text-xs tracking-[0.2em] hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                                        {enviando ? <Loader2 size={16} className="animate-spin" /> : <><Send size={14} /> Enviar solicitud</>}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
