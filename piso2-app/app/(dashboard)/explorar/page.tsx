'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    Search, Music, Calendar, Clock, MapPin,
    User, Ticket, Star, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'

// Tipos
type ClaseDisponible = {
    id: string
    nombre: string
    inicio: string
    fin: string
    tipo_clase: 'Regular' | 'Especial'
    cupo_maximo: number
    inscritos_count: number
    imagen_url?: string | null
    ritmo_id?: string | null // Agregado para el perfilado
    profesor: { nombre_completo: string }
    sala: { nombre: string; sede: { nombre: string } }
    ya_inscrito?: boolean
}

export default function ExplorarClasesPage() {
    const supabase = createClient()
    const [clases, setClases] = useState<ClaseDisponible[]>([])
    const [loading, setLoading] = useState(true)
    const [procesandoId, setProcesandoId] = useState<string | null>(null)

    // Filtros
    const [filtroTexto, setFiltroTexto] = useState('')
    const [filtroTipo, setFiltroTipo] = useState<'Todos' | 'Regular' | 'Especial'>('Todos')

    // Perfil del Alumno
    const [perfil, setPerfil] = useState<{ id: string, creditos_regulares: number, creditos_seminarios: number } | null>(null)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // 1. Traer saldo de créditos del alumno
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('id, creditos_regulares, creditos_seminarios')
            .eq('id', user.id)
            .single()

        if (userProfile) setPerfil(userProfile)

        // 2. Traer clases futuras (que no estén canceladas)
        const hoy = new Date().toISOString()
        const { data: clasesData } = await supabase
            .from('clases')
            .select(`
                id, nombre, inicio, fin, tipo_clase, cupo_maximo, estado, imagen_url, ritmo_id,
                profesor:profiles!clases_profesor_id_fkey(nombre_completo),
                sala:salas(nombre, sede:sedes(nombre)),
                inscripciones(user_id)
            `)
            .gte('inicio', hoy)
            .neq('estado', 'cancelada')
            .order('inicio', { ascending: true })

        if (clasesData) {
            // Procesar datos para saber cuántos inscritos hay y si el usuario actual ya está anotado
            const clasesProcesadas = clasesData.map((c: any) => {
                const inscritos = c.inscripciones || []
                return {
                    ...c,
                    inscritos_count: inscritos.length,
                    ya_inscrito: inscritos.some((i: any) => i.user_id === user.id)
                }
            })
            setClases(clasesProcesadas)
        }
        setLoading(false)
    }

    // --- LÓGICA DE INSCRIPCIÓN (Descuenta crédito, anota y PERFILA) ---
    const handleInscribirse = async (clase: ClaseDisponible) => {
        if (!perfil) return

        const esEspecial = clase.tipo_clase === 'Especial'
        const creditosDisponibles = esEspecial ? perfil.creditos_seminarios : perfil.creditos_regulares

        if (creditosDisponibles <= 0) {
            toast.error(
                <div className="flex flex-col gap-1">
                    <span className="font-bold">Sin créditos suficientes</span>
                    <span className="text-xs">Necesitás comprar un pack de clases {clase.tipo_clase} para anotarte.</span>
                </div>
            )
            return
        }

        setProcesandoId(clase.id)

        try {
            // 1. Inscribir en la tabla
            const { error: errInsc } = await supabase.from('inscripciones').insert({
                clase_id: clase.id,
                user_id: perfil.id,
                presente: false,
                metodo_pago: 'bonificado',
                modalidad: 'Reserva por App (Crédito)',
                valor_credito: 0
            })

            if (errInsc) throw new Error('Error al reservar lugar')

            // 2. Descontar 1 crédito al usuario
            const nuevosCreditos = creditosDisponibles - 1
            const columnaUpdate = esEspecial ? 'creditos_seminarios' : 'creditos_regulares'

            // 3. MAGIA NUEVA: PERFILADO DE INTERESES
            // Traemos los intereses actuales del usuario para no pisarlos
            const { data: currentProfile } = await supabase
                .from('profiles')
                .select('intereses_ritmos')
                .eq('id', perfil.id)
                .single()

            let nuevosIntereses = currentProfile?.intereses_ritmos || []

            // Si la clase tiene un ritmo asociado y el alumno aún no lo tiene en su lista, lo agregamos
            if (clase.ritmo_id && !nuevosIntereses.includes(clase.ritmo_id)) {
                nuevosIntereses = [...nuevosIntereses, clase.ritmo_id]
            }

            // 4. Actualizamos créditos E intereses en la misma llamada
            const { error: errUpdate } = await supabase
                .from('profiles')
                .update({
                    [columnaUpdate]: nuevosCreditos,
                    intereses_ritmos: nuevosIntereses
                })
                .eq('id', perfil.id)

            if (errUpdate) throw new Error('Error al actualizar el perfil')

            // 5. Actualizar UI Local
            setPerfil(prev => prev ? { ...prev, [columnaUpdate]: nuevosCreditos } : null)
            setClases(prev => prev.map(c =>
                c.id === clase.id
                    ? { ...c, ya_inscrito: true, inscritos_count: c.inscritos_count + 1 }
                    : c
            ))

            toast.success('¡Lugar reservado con éxito!')

        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setProcesandoId(null)
        }
    }

    // Filtrado dinámico
    const clasesFiltradas = clases.filter(c => {
        const coincideTexto = c.nombre.toLowerCase().includes(filtroTexto.toLowerCase()) ||
            c.profesor?.nombre_completo?.toLowerCase().includes(filtroTexto.toLowerCase())
        const coincideTipo = filtroTipo === 'Todos' || c.tipo_clase === filtroTipo
        return coincideTexto && coincideTipo
    })

    // Extraer "Ritmos" únicos para hacer botones de filtro rápido
    const ritmosSugeridos = Array.from(new Set(clases.map(c => c.nombre.split(' ')[0]))).slice(0, 5)

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER Y CRÉDITOS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1">
                        Cartelera
                    </h1>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                        Reservá tu lugar en las próximas clases
                    </p>
                </div>

                {/* Billetera de Créditos del Alumno */}
                <div className="flex gap-3 w-full md:w-auto">
                    <div className="flex-1 md:flex-none bg-[#D4E655]/10 border border-[#D4E655]/30 rounded-2xl p-3 flex items-center gap-3">
                        <div className="bg-[#D4E655] text-black p-2 rounded-xl"><Ticket size={20} /></div>
                        <div>
                            <p className="text-[10px] text-[#D4E655] font-black uppercase tracking-widest">Regulares</p>
                            <p className="text-xl font-black leading-none">{perfil?.creditos_regulares || 0}</p>
                        </div>
                    </div>
                    <div className="flex-1 md:flex-none bg-purple-500/10 border border-purple-500/30 rounded-2xl p-3 flex items-center gap-3">
                        <div className="bg-purple-500 text-white p-2 rounded-xl"><Star size={20} /></div>
                        <div>
                            <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest">Seminarios</p>
                            <p className="text-xl font-black leading-none">{perfil?.creditos_seminarios || 0}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* BUSCADOR Y FILTROS */}
            <div className="mb-8 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por ritmo, profesor..."
                            value={filtroTexto}
                            onChange={(e) => setFiltroTexto(e.target.value)}
                            className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-[#D4E655] transition-colors"
                        />
                    </div>
                    <div className="flex bg-[#111] p-1 rounded-2xl border border-white/10 shrink-0">
                        {['Todos', 'Regular', 'Especial'].map(tipo => (
                            <button
                                key={tipo}
                                onClick={() => setFiltroTipo(tipo as any)}
                                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filtroTipo === tipo ? 'bg-[#D4E655] text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                            >
                                {tipo}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filtros rápidos por Ritmo */}
                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
                    {ritmosSugeridos.map(ritmo => (
                        <button
                            key={ritmo}
                            onClick={() => setFiltroTexto(ritmo)}
                            className="bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-full text-xs font-bold text-gray-300 transition-colors whitespace-nowrap flex items-center gap-2"
                        >
                            <Music size={12} /> {ritmo}
                        </button>
                    ))}
                    {filtroTexto && (
                        <button onClick={() => setFiltroTexto('')} className="bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-full text-xs font-bold transition-colors whitespace-nowrap">
                            Limpiar Filtros
                        </button>
                    )}
                </div>
            </div>

            {/* GRILLA DE CLASES */}
            {clasesFiltradas.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                    <p className="text-gray-500 font-bold uppercase text-sm">No hay clases disponibles con esos filtros.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {clasesFiltradas.map((clase) => {
                        const estaLleno = clase.cupo_maximo > 0 && clase.inscritos_count >= clase.cupo_maximo
                        const esEspecial = clase.tipo_clase === 'Especial'

                        return (
                            <div key={clase.id} className="bg-[#09090b] border border-white/10 rounded-3xl overflow-hidden flex flex-col hover:border-[#D4E655]/50 transition-all group shadow-xl">

                                {/* IMAGEN / FLYER */}
                                <div className="h-48 w-full relative bg-gradient-to-br from-[#1a1a1c] to-[#0a0a0a] border-b border-white/5 flex items-center justify-center overflow-hidden">
                                    {clase.imagen_url ? (
                                        <Image
                                            src={clase.imagen_url}
                                            alt={clase.nombre}
                                            fill
                                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        // Fallback si no hay imagen
                                        <div className="flex flex-col items-center gap-2 text-white/20">
                                            <ImageIcon size={40} strokeWidth={1} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Sin Flyer</span>
                                        </div>
                                    )}

                                    {/* Badge Tipo de Clase */}
                                    <span className={`absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full backdrop-blur-md ${esEspecial ? 'bg-purple-500/80 text-white' : 'bg-[#D4E655]/80 text-black'}`}>
                                        {clase.tipo_clase}
                                    </span>
                                </div>

                                {/* INFO CLASE */}
                                <div className="p-5 flex-1 flex flex-col relative">

                                    {/* Nombre de la clase y Profe destacado */}
                                    <div className="mb-4">
                                        <h3 className="text-xl font-black text-white uppercase leading-tight mb-1">
                                            {clase.nombre}
                                        </h3>
                                        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-300">
                                            <User size={14} className={esEspecial ? 'text-purple-400' : 'text-[#D4E655]'} />
                                            {clase.profesor?.nombre_completo || 'Staff'}
                                        </p>
                                    </div>

                                    {/* Detalles (Fecha, hora, lugar) */}
                                    <div className="space-y-3 mt-auto pt-4 border-t border-white/5">
                                        <div className="flex items-center gap-3 text-sm text-gray-400">
                                            <Calendar size={14} className="text-white/50" />
                                            <span className="font-medium capitalize">{format(new Date(clase.inicio), "EEEE d 'de' MMMM", { locale: es })}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-gray-400">
                                            <Clock size={14} className="text-white/50" />
                                            <span className="font-mono">{format(new Date(clase.inicio), "HH:mm")} a {format(new Date(clase.fin), "HH:mm")} hs</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-gray-400">
                                            <MapPin size={14} className="text-white/50" />
                                            <span>{clase.sala?.nombre} <span className="text-[10px] uppercase ml-1 opacity-50 border border-white/20 px-1 rounded">Sede {clase.sala?.sede?.nombre}</span></span>
                                        </div>
                                    </div>
                                </div>

                                {/* ACCIÓN / BOTÓN */}
                                <div className="p-5 bg-[#111] border-t border-white/5 mt-auto">
                                    {clase.ya_inscrito ? (
                                        <div className="w-full py-3.5 bg-green-500/10 text-green-500 border border-green-500/20 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest cursor-default">
                                            <CheckCircle2 size={16} /> Ya estás anotado
                                        </div>
                                    ) : estaLleno ? (
                                        <div className="w-full py-3.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest cursor-default">
                                            <AlertCircle size={16} /> Cupo Lleno
                                        </div>
                                    ) : (perfil && (esEspecial ? perfil.creditos_seminarios : perfil.creditos_regulares) <= 0) ? (
                                        <Link
                                            href="/tienda"
                                            className="w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all shadow-lg bg-[#111] text-white border border-white/20 hover:bg-white hover:text-black"
                                        >
                                            <Ticket size={16} /> Comprar Créditos
                                        </Link>
                                    ) : (
                                        <button
                                            onClick={() => handleInscribirse(clase)}
                                            disabled={procesandoId === clase.id}
                                            className={`w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all shadow-lg
                                                ${esEspecial
                                                    ? 'bg-purple-600 text-white hover:bg-purple-500'
                                                    : 'bg-[#D4E655] text-black hover:bg-white'}
                                                disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            {procesandoId === clase.id ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <>Anotarme (-1 Crédito)</>
                                            )}
                                        </button>
                                    )}

                                    {/* Contador de cupos pequeño */}
                                    <p className="text-center text-[9px] text-gray-500 font-bold uppercase mt-3">
                                        {clase.cupo_maximo > 0 ? `${clase.inscritos_count} / ${clase.cupo_maximo} lugares ocupados` : 'Cupo Ilimitado'}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}