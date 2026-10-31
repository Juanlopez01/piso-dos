'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getBusquedaBySlugAction, type BusquedaPublica } from '@/app/actions/talent'
import { getMiPerfilAction, postularABusquedaSesionAction, type MiPerfil } from '@/app/actions/talent-auth'
import { toast, Toaster } from 'sonner'
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2, MapPin, CalendarDays, UserPlus, LogIn } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

export default function BusquedaPublicaPage() {
    const params = useParams()
    const slug = params.slug as string

    const [busqueda, setBusqueda] = useState<BusquedaPublica | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)

    // Sesión del talento (null = no logueado).
    const [perfil, setPerfil] = useState<MiPerfil | null>(null)
    const [cargandoPerfil, setCargandoPerfil] = useState(true)

    const [enviando, setEnviando] = useState(false)
    const [resultado, setResultado] = useState<'listo' | 'ya' | null>(null)

    useEffect(() => {
        getBusquedaBySlugAction(slug)
            .then(d => { if (d) setBusqueda(d); else setNotFound(true); setLoading(false) })
            .catch(() => { setNotFound(true); setLoading(false) })
        getMiPerfilAction()
            .then(res => { setPerfil(res); setCargandoPerfil(false) })
            .catch(() => setCargandoPerfil(false))
    }, [slug])

    const volverAqui = `/talent/busqueda/${slug}`

    const postularme = async () => {
        if (!busqueda) return
        setEnviando(true)
        const res = await postularABusquedaSesionAction(busqueda.id)
        if (res.ok) setResultado('listo')
        else if (res.error && /ya te postulaste/i.test(res.error)) setResultado('ya')
        else toast.error(res.error || 'No se pudo postular')
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
    // Día límite INCLUSIVE (abierta todo ese día, en horario Argentina).
    const vencida = b.fecha_limite ? b.fecha_limite < new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) : false

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

            {resultado ? (
                <div className="max-w-2xl mx-auto px-6 pb-24 text-center pt-6">
                    <CheckCircle2 size={44} className="text-neutral-900 mb-5 mx-auto" strokeWidth={1.5} />
                    <h2 className={`${serif.className} text-3xl tracking-wide mb-3`}>{resultado === 'ya' ? 'Ya estás postulado/a' : 'Postulación enviada'}</h2>
                    <p className="text-neutral-500 text-sm max-w-sm mx-auto leading-relaxed">
                        {resultado === 'ya'
                            ? <>Ya te habías postulado a <span className="font-semibold text-neutral-700">{b.titulo}</span>. Si quedás seleccionado/a, te contactamos.</>
                            : <>Piso 2 va a revisar tu perfil para <span className="font-semibold text-neutral-700">{b.titulo}</span>. Si quedás seleccionado/a, te contactamos.</>}
                    </p>
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
                    ) : cargandoPerfil ? (
                        <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-neutral-300" size={26} /></div>
                    ) : !perfil ? (
                        // ── No logueado: hay que tener cuenta de talento ──
                        <div className="border-t border-neutral-200 pt-8 text-center">
                            <p className="text-neutral-600 text-sm max-w-md mx-auto mb-6">
                                Para postularte necesitás tu <b>cuenta de talento</b>. Con ella cargás una sola vez tus fotos, videos y el acuerdo firmado, y te sirve para todas las búsquedas.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Link href={`/talent/registro?next=${encodeURIComponent(volverAqui)}`}
                                    className="bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs px-8 py-4 hover:bg-black transition-colors inline-flex items-center justify-center gap-2">
                                    <UserPlus size={15} /> Crear mi cuenta
                                </Link>
                                <Link href={`/talent/login?next=${encodeURIComponent(volverAqui)}`}
                                    className="border border-neutral-900 text-neutral-900 font-semibold uppercase tracking-[0.2em] text-xs px-8 py-4 hover:bg-neutral-900 hover:text-white transition-colors inline-flex items-center justify-center gap-2">
                                    <LogIn size={15} /> Ya tengo cuenta
                                </Link>
                            </div>
                        </div>
                    ) : !perfil.completo ? (
                        // ── Logueado, perfil incompleto ──
                        <div className="border-t border-neutral-200 pt-8 text-center">
                            <p className={`${serif.className} text-xl tracking-wide mb-2`}>Hola{perfil.nombre ? `, ${perfil.nombre}` : ''}</p>
                            <p className="text-neutral-600 text-sm max-w-md mx-auto mb-6">
                                Antes de postularte tenés que completar tu perfil: <b>3 fotos</b>, <b>3 videos</b> y el <b>acuerdo firmado</b>.
                            </p>
                            <Link href={`/talent/mi-perfil?next=${encodeURIComponent(volverAqui)}`}
                                className="bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs px-8 py-4 hover:bg-black transition-colors inline-flex items-center justify-center gap-2">
                                Completar mi perfil <ArrowRight size={15} />
                            </Link>
                        </div>
                    ) : (
                        // ── Logueado, perfil completo ──
                        <div className="border-t border-neutral-200 pt-8 text-center max-w-md mx-auto">
                            <CheckCircle2 size={38} className="text-emerald-600 mb-4 mx-auto" strokeWidth={1.5} />
                            <h2 className={`${serif.className} text-2xl tracking-wide mb-2`}>¡Hola{perfil.nombre ? `, ${perfil.nombre}` : ''}!</h2>
                            <p className="text-neutral-500 text-sm mb-6">Tu perfil está completo y con el acuerdo firmado. ¿Querés postularte a <b>{b.titulo}</b>?</p>
                            <button onClick={postularme} disabled={enviando}
                                className="bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs px-8 py-4 hover:bg-black transition-colors disabled:opacity-40 inline-flex items-center gap-2">
                                {enviando ? <Loader2 size={15} className="animate-spin" /> : null} Sí, postularme
                            </button>
                            <Link href={`/talent/mi-perfil?next=${encodeURIComponent(volverAqui)}`} className="block mx-auto mt-4 text-[11px] uppercase tracking-widest text-neutral-400 hover:text-black">Actualizar mi perfil</Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
