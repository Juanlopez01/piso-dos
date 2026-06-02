'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Loader2,
    Megaphone,
    Users,
    Bell,
    MessageCircle,
    Send,
    History
} from 'lucide-react'
import { useCash } from '@/context/CashContext'
import {
    obtenerPacksAgotadosParaNotificarAction,
    crearAnuncioAction,
    obtenerAnunciosAction,
    obtenerCompaniasAction
} from '@/app/actions/usuarios'
import { Toaster, toast } from 'sonner'

interface PackAgotado {
    tipo: string
    nombre: string
}

interface AlumnoRemarketing {
    user_id: string
    nombre: string
    telefono: string | null
    packs_agotados: PackAgotado[]
}

interface Anuncio {
    id: string
    titulo: string
    contenido: string
    created_at: string
    segmento?: string
}

interface Compania {
    id: string
    nombre: string
}

export default function RemarketingPage() {
    const { userRole, isLoading: loadingContext } = useCash()
    const router = useRouter()

    const [pestana, setPestana] = useState<'lista' | 'anuncios'>('lista')

    const [alumnos, setAlumnos] = useState<AlumnoRemarketing[]>([])
    const [anuncios, setAnuncios] = useState<Anuncio[]>([])
    const [companias, setCompanias] = useState<Compania[]>([])

    const [cargando, setCargando] = useState(true)

    const [titulo, setTitulo] = useState('')
    const [mensaje, setMensaje] = useState('')

    const [segmento, setSegmento] = useState<string>('todos')
    const [notificarApp, setNotificarApp] = useState(true)

    const [enviandoAnuncio, setEnviandoAnuncio] = useState(false)

    useEffect(() => {
        if (
            !loadingContext &&
            userRole !== 'admin' &&
            userRole !== 'recepcion'
        ) {
            router.push('/')
        }
    }, [loadingContext, userRole, router])

    const cargarDatos = async () => {
        try {
            setCargando(true)

            const [
                resAlumnos,
                resAnuncios,
                resCompanias
            ] = await Promise.all([
                obtenerPacksAgotadosParaNotificarAction(),
                obtenerAnunciosAction(),
                obtenerCompaniasAction()
            ])

            if (resAlumnos.success) {
                setAlumnos(
                    (resAlumnos.data as AlumnoRemarketing[]) || []
                )
            }

            if (resAnuncios.success) {
                setAnuncios(
                    (resAnuncios.data as Anuncio[]) || []
                )
            }

            if (resCompanias.success) {
                setCompanias(
                    (resCompanias.data as Compania[]) || []
                )
            }
        } catch (error) {
            console.error(error)
            toast.error('Error cargando datos')
        } finally {
            setCargando(false)
        }
    }

    useEffect(() => {
        if (
            userRole === 'admin' ||
            userRole === 'recepcion'
        ) {
            cargarDatos()
        }
    }, [userRole])

    const handleCrearAnuncio = async (
        e: React.FormEvent
    ) => {
        e.preventDefault()

        if (!titulo.trim()) {
            toast.error('Ingresá un título')
            return
        }

        if (!mensaje.trim()) {
            toast.error('Ingresá un mensaje')
            return
        }

        try {
            setEnviandoAnuncio(true)

            const res = await crearAnuncioAction(
                titulo,
                mensaje,
                notificarApp,
                segmento
            )

            if (!res.success) {
                toast.error(
                    res.error || 'Error creando anuncio'
                )
                return
            }

            toast.success('Anuncio enviado correctamente')

            setTitulo('')
            setMensaje('')
            setSegmento('todos')

            await cargarDatos()
        } catch (error) {
            console.error(error)
            toast.error('Error inesperado')
        } finally {
            setEnviandoAnuncio(false)
        }
    }

    if (
        !loadingContext &&
        userRole !== 'admin' &&
        userRole !== 'recepcion'
    ) {
        return null
    }

    if (loadingContext || cargando) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12" />
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32">
            <Toaster
                position="top-center"
                richColors
                theme="dark"
            />

            <div className="mb-8 border-b border-white/10 pb-6 max-w-5xl mx-auto">
                <div className="flex items-center gap-2 mb-2">
                    <Megaphone
                        className="text-[#D4E655]"
                        size={20}
                    />
                    <span className="text-[#D4E655] font-bold text-[10px] tracking-[0.3em] uppercase">
                        Ventas & Retención
                    </span>
                </div>

                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">
                    Central de Remarketing
                </h1>
            </div>

            <div className="flex gap-2 max-w-5xl mx-auto mb-6 overflow-x-auto">
                <button
                    onClick={() => setPestana('lista')}
                    className={`px-5 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2 ${pestana === 'lista'
                            ? 'bg-[#D4E655] text-black'
                            : 'bg-[#111] text-gray-400'
                        }`}
                >
                    <Users size={16} />
                    Alumnos sin Renovación ({alumnos.length})
                </button>

                <button
                    onClick={() => setPestana('anuncios')}
                    className={`px-5 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2 ${pestana === 'anuncios'
                            ? 'bg-[#D4E655] text-black'
                            : 'bg-[#111] text-gray-400'
                        }`}
                >
                    <Bell size={16} />
                    Central de Anuncios
                </button>
            </div>

            <div className="max-w-5xl mx-auto">
                {pestana === 'lista' && (
                    <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                        <div className="flex items-center gap-2 mb-6">
                            <Users size={20} />
                            <h2 className="font-black uppercase">
                                Contactos Pendientes
                            </h2>
                        </div>

                        {alumnos.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">
                                Todos al día.
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-2 gap-4">
                                {alumnos.map((alumno) => {
                                    const telefono =
                                        alumno.telefono?.replace(
                                            /\D/g,
                                            ''
                                        ) || ''

                                    return (
                                        <div
                                            key={alumno.user_id}
                                            className="bg-[#1A1A1A] rounded-2xl p-5"
                                        >
                                            <h3 className="font-bold text-lg mb-4">
                                                {alumno.nombre}
                                            </h3>

                                            <div className="space-y-2 mb-5">
                                                {alumno.packs_agotados.map(
                                                    (pack, index) => (
                                                        <div
                                                            key={`${pack.tipo}-${index}`}
                                                            className="bg-black/20 border border-white/5 rounded-lg p-3"
                                                        >
                                                            <p className="text-sm font-medium text-white">
                                                                {pack.nombre}
                                                            </p>

                                                            <p className="text-[11px] uppercase tracking-wider text-gray-500">
                                                                {pack.tipo}
                                                            </p>
                                                        </div>
                                                    )
                                                )}
                                            </div>

                                            {telefono && (
                                                <a
                                                    href={`https://wa.me/${telefono}?text=${encodeURIComponent(
                                                        `Hola ${alumno.nombre}, vimos que tu pack finalizó y queríamos saber si te interesa renovarlo.`
                                                    )}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-full bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase"
                                                >
                                                    <MessageCircle size={16} />
                                                    WhatsApp
                                                </a>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {pestana === 'anuncios' && (
                    <div className="space-y-6">
                        <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                            <h2 className="text-lg font-black uppercase flex items-center gap-2 mb-6">
                                <Megaphone size={20} />
                                Nuevo Anuncio
                            </h2>

                            <form
                                onSubmit={handleCrearAnuncio}
                                className="space-y-4"
                            >
                                <input
                                    type="text"
                                    placeholder="Título"
                                    value={titulo}
                                    onChange={(e) =>
                                        setTitulo(e.target.value)
                                    }
                                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3"
                                />

                                <textarea
                                    placeholder="Mensaje"
                                    value={mensaje}
                                    onChange={(e) =>
                                        setMensaje(e.target.value)
                                    }
                                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 min-h-[140px]"
                                />

                                <select
                                    value={segmento}
                                    onChange={(e) =>
                                        setSegmento(e.target.value)
                                    }
                                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3"
                                >
                                    <option value="todos">
                                        Todos los alumnos
                                    </option>

                                    <option value="la_liga">
                                        La Liga
                                    </option>

                                    <option value="regulares">
                                        Alumnos Regulares
                                    </option>

                                    {companias.length > 0 && (
                                        <optgroup label="Compañías">
                                            {companias.map(
                                                (compania) => (
                                                    <option
                                                        key={
                                                            compania.id
                                                        }
                                                        value={
                                                            compania.id
                                                        }
                                                    >
                                                        {
                                                            compania.nombre
                                                        }
                                                    </option>
                                                )
                                            )}
                                        </optgroup>
                                    )}
                                </select>

                                <label className="flex items-center gap-3 bg-[#1A1A1A] p-4 rounded-xl">
                                    <input
                                        type="checkbox"
                                        checked={notificarApp}
                                        onChange={(e) =>
                                            setNotificarApp(
                                                e.target.checked
                                            )
                                        }
                                    />

                                    <span>
                                        Enviar notificación interna
                                    </span>
                                </label>

                                <button
                                    type="submit"
                                    disabled={enviandoAnuncio}
                                    className="w-full bg-[#D4E655] text-black font-black py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {enviandoAnuncio ? (
                                        <Loader2 className="animate-spin" />
                                    ) : (
                                        <Send />
                                    )}

                                    {enviandoAnuncio
                                        ? 'Enviando...'
                                        : 'Crear anuncio'}
                                </button>
                            </form>
                        </div>

                        <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                            <h2 className="text-lg font-black uppercase flex items-center gap-2 mb-6">
                                <History size={20} />
                                Historial
                            </h2>

                            {anuncios.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No hay registros
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {anuncios.map((anuncio) => (
                                        <div
                                            key={anuncio.id}
                                            className="bg-[#1A1A1A] rounded-2xl p-4"
                                        >
                                            <div className="flex justify-between items-start gap-4 mb-2">
                                                <div>
                                                    <h3 className="font-bold">
                                                        {anuncio.titulo}
                                                    </h3>

                                                    {anuncio.segmento && (
                                                        <span className="inline-block mt-2 text-[10px] px-2 py-1 rounded-full bg-[#D4E655]/10 text-[#D4E655] uppercase tracking-wider">
                                                            {anuncio.segmento}
                                                        </span>
                                                    )}
                                                </div>

                                                <span className="text-xs text-gray-500">
                                                    {new Date(
                                                        anuncio.created_at
                                                    ).toLocaleDateString(
                                                        'es-AR'
                                                    )}
                                                </span>
                                            </div>

                                            <p className="text-sm text-gray-400 whitespace-pre-wrap">
                                                {anuncio.contenido}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}