'use client'

import { createClient } from '@/utils/supabase/client'
import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    Search, Music, Calendar, Clock, MapPin,
    User, Ticket, Star, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon,
    X, ArrowRight
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'

// --- TIPOS ---
type ClaseInstancia = {
    id: string
    inicio: string
    fin: string
    cupo_maximo: number
    inscritos_count: number
    ya_inscrito: boolean
    estado: string
    sala: { nombre: string; sede: { nombre: string } }
}

type ClaseAgrupada = {
    key_grupo: string
    nombre: string
    tipo_clase: string
    imagen_url?: string | null
    ritmo_id?: string | null
    profesor: { nombre_completo: string }
    instancias: ClaseInstancia[]
}

type CarteleraData = {
    perfil: { id: string, creditos_regulares: number, creditos_seminarios: number } | null
    clasesAgrupadas: ClaseAgrupada[]
}

// 🚀 FETCHER UNIFICADO + AGRUPADOR
const fetcherCartelera = async (): Promise<CarteleraData> => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    // 1. Limpieza en background (Fire and forget)
    supabase.rpc('limpiar_creditos_vencidos').then()

    // 2. Traemos Perfil
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, creditos_regulares, creditos_seminarios')
        .eq('id', user.id)
        .single()

    // 3. Traemos Clases
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
        .neq('tipo_clase', 'Formación') // Filtramos directo en la DB
        .order('inicio', { ascending: true })

    // 4. AGRUPACIÓN (Se hace una vez y SWR lo guarda en caché)
    const agrupador: Record<string, ClaseAgrupada> = {}

    if (clasesData) {
        clasesData.forEach((c: any) => {
            const nombreProfe = c.profesor?.nombre_completo || 'Staff'
            const key = `${c.nombre}-${nombreProfe}-${c.tipo_clase}`

            const inscritos = c.inscripciones || []
            const instancia: ClaseInstancia = {
                id: c.id,
                inicio: c.inicio,
                fin: c.fin,
                cupo_maximo: c.cupo_maximo,
                inscritos_count: inscritos.length,
                ya_inscrito: inscritos.some((i: any) => i.user_id === user.id),
                estado: c.estado,
                sala: c.sala
            }

            if (!agrupador[key]) {
                agrupador[key] = {
                    key_grupo: key,
                    nombre: c.nombre,
                    tipo_clase: c.tipo_clase,
                    imagen_url: c.imagen_url,
                    ritmo_id: c.ritmo_id,
                    profesor: { nombre_completo: nombreProfe },
                    instancias: []
                }
            }
            agrupador[key].instancias.push(instancia)
        })
    }

    const arrAgrupado = Object.values(agrupador)
    arrAgrupado.forEach(g => g.instancias.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()))
    arrAgrupado.sort((a, b) => new Date(a.instancias[0].inicio).getTime() - new Date(b.instancias[0].inicio).getTime())

    return {
        perfil: profile,
        clasesAgrupadas: arrAgrupado
    }
}

export default function ExplorarClasesPage() {
    const [supabase] = useState(() => createClient())

    // 🚀 SWR
    const { data, isLoading, mutate } = useSWR<CarteleraData>(
        'cartelera',
        fetcherCartelera,
        {
            revalidateOnFocus: true,
            dedupingInterval: 3000
        }
    )

    const clasesAgrupadas = data?.clasesAgrupadas || []
    const perfil = data?.perfil || null

    // UI States
    const [procesandoId, setProcesandoId] = useState<string | null>(null)
    const [selectedGrupo, setSelectedGrupo] = useState<ClaseAgrupada | null>(null)
    const [filtroTexto, setFiltroTexto] = useState('')
    const [filtroTipo, setFiltroTipo] = useState<'Todos' | 'Regular' | 'Especial'>('Todos')

    const handleInscribirse = async (instancia: ClaseInstancia, grupo: ClaseAgrupada) => {
        if (!perfil) return

        const esEspecial = ['Especial', 'Seminario', 'Intensivo'].includes(grupo.tipo_clase)
        const tipoClaseBD = esEspecial ? 'seminario' : 'regular'
        const columnaUpdate = esEspecial ? 'creditos_seminarios' : 'creditos_regulares'
        const creditosActuales = perfil[columnaUpdate] || 0

        if (creditosActuales <= 0) {
            toast.error("No tenés créditos suficientes para esta clase.")
            return
        }

        setProcesandoId(instancia.id)

        // 🚀 MUTACIÓN OPTIMISTA
        const optimisticAgrupadas = clasesAgrupadas.map(g => {
            if (g.key_grupo === grupo.key_grupo) {
                return {
                    ...g,
                    instancias: g.instancias.map(i => i.id === instancia.id ? { ...i, ya_inscrito: true, inscritos_count: i.inscritos_count + 1 } : i)
                }
            }
            return g
        })

        const optimisticPerfil = { ...perfil, [columnaUpdate]: creditosActuales - 1 }

        mutate({ perfil: optimisticPerfil, clasesAgrupadas: optimisticAgrupadas }, false)

        if (selectedGrupo?.key_grupo === grupo.key_grupo) {
            setSelectedGrupo(optimisticAgrupadas.find(g => g.key_grupo === grupo.key_grupo) || null)
        }

        try {
            const { data: res, error } = await supabase.rpc('inscribir_alumno_fifo', {
                p_user_id: perfil.id,
                p_clase_id: instancia.id,
                p_tipo_clase: tipoClaseBD
            })

            if (error || !res.success) throw new Error(res?.message || 'Error de conexión al procesar la reserva.')

            // Lógica secundaria de ritmos (Background, no trabamos al usuario)
            if (grupo.ritmo_id) {
                supabase.from('profiles').select('intereses_ritmos').eq('id', perfil.id).single().then(({ data }: any) => {
                    // Le indicamos explícitamente a TypeScript la forma de esta data
                    const currentProfile = data as { intereses_ritmos: string[] | null } | null;

                    let nuevosIntereses = currentProfile?.intereses_ritmos || [];

                    // Verificamos que grupo.ritmo_id no sea null explícitamente para el array
                    if (grupo.ritmo_id && !nuevosIntereses.includes(grupo.ritmo_id)) {
                        supabase.from('profiles').update({ intereses_ritmos: [...nuevosIntereses, grupo.ritmo_id] }).eq('id', perfil.id).then();
                    }
                })
            }

            toast.success(res.message)
            mutate() // Revalidamos silenciosamente

        } catch (error: any) {
            toast.error(error.message)
            mutate() // Revertimos en caso de error
        } finally {
            setProcesandoId(null)
        }
    }

    // 🚀 FILTROS (Memoizados para mejor performance al tipear)
    const gruposFiltrados = useMemo(() => {
        return clasesAgrupadas.filter(g => {
            const coincideTexto = g.nombre.toLowerCase().includes(filtroTexto.toLowerCase()) ||
                g.profesor.nombre_completo.toLowerCase().includes(filtroTexto.toLowerCase())

            const esEspecial = ['Especial', 'Seminario', 'Intensivo'].includes(g.tipo_clase)
            let coincideTipo = false
            if (filtroTipo === 'Todos') coincideTipo = true
            else if (filtroTipo === 'Especial') coincideTipo = esEspecial
            else if (filtroTipo === 'Regular') coincideTipo = !esEspecial

            return coincideTexto && coincideTipo
        })
    }, [clasesAgrupadas, filtroTexto, filtroTipo])

    const ritmosSugeridos = useMemo(() => {
        return Array.from(new Set(clasesAgrupadas.map(c => c.nombre.split(' ')[0]))).slice(0, 5)
    }, [clasesAgrupadas])

    if (isLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1">
                        Cartelera
                    </h1>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                        Reservá tu lugar en las próximas clases
                    </p>
                </div>

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
                            <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest">Especiales</p>
                            <p className="text-xl font-black leading-none">{perfil?.creditos_seminarios || 0}</p>
                        </div>
                    </div>
                </div>
            </div>

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
                    <div className="flex bg-[#111] p-1 rounded-2xl border border-white/10 shrink-0 overflow-x-auto">
                        {['Todos', 'Regular', 'Especial'].map(tipo => (
                            <button
                                key={tipo}
                                onClick={() => setFiltroTipo(tipo as any)}
                                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${filtroTipo === tipo ? 'bg-[#D4E655] text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                            >
                                {tipo}
                            </button>
                        ))}
                    </div>
                </div>

                {ritmosSugeridos.length > 0 && (
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
                )}
            </div>

            {gruposFiltrados.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                    <p className="text-gray-500 font-bold uppercase text-sm">No hay clases disponibles con esos filtros.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {gruposFiltrados.map((grupo) => {
                        const esEspecial = ['Especial', 'Seminario', 'Intensivo'].includes(grupo.tipo_clase)
                        const proximaClase = grupo.instancias[0]
                        const esHoy = isToday(new Date(proximaClase.inicio))

                        return (
                            <div key={grupo.key_grupo} className={`bg-[#09090b] rounded-3xl overflow-hidden flex flex-col transition-all group shadow-xl border-2 ${esHoy ? (esEspecial ? 'border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)]' : 'border-[#D4E655]/50 shadow-[0_0_20px_rgba(212,230,85,0.2)]') : (esEspecial ? 'border-purple-500/30 hover:border-purple-500/60' : 'border-white/10 hover:border-white/30')}`}>
                                <div className="h-48 w-full relative bg-gradient-to-br from-[#1a1a1c] to-[#0a0a0a] border-b border-white/5 flex items-center justify-center overflow-hidden">
                                    {grupo.imagen_url ? (
                                        <Image src={grupo.imagen_url} alt={grupo.nombre} fill priority sizes="(max-width: 768px) 100vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-white/20">
                                            <ImageIcon size={40} strokeWidth={1} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Sin Flyer</span>
                                        </div>
                                    )}

                                    {esHoy && (
                                        <span className={`absolute top-4 left-4 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full backdrop-blur-md flex items-center gap-1 shadow-lg ${esEspecial ? 'bg-purple-500 text-white' : 'bg-[#D4E655] text-black'}`}>
                                            ⚡ Próxima Hoy
                                        </span>
                                    )}

                                    <span className={`absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full backdrop-blur-md ${esEspecial ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-[#D4E655]/80 text-black'}`}>
                                        {grupo.tipo_clase}
                                    </span>
                                </div>

                                <div className="p-5 flex-1 flex flex-col relative">
                                    <div className="mb-4">
                                        <h3 className="text-xl font-black text-white uppercase leading-tight mb-1">{grupo.nombre}</h3>
                                        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-300">
                                            <User size={14} className={esEspecial ? 'text-purple-400' : 'text-[#D4E655]'} />
                                            {grupo.profesor.nombre_completo}
                                        </p>
                                    </div>

                                    <div className="space-y-3 mt-auto pt-4 border-t border-white/5">
                                        <p className="text-[10px] uppercase font-bold text-gray-500">A dictarse en:</p>
                                        <div className="flex items-center gap-3 text-sm text-gray-300">
                                            <MapPin size={14} className="text-white/50" />
                                            <span>{proximaClase.sala?.nombre} <span className="text-[10px] uppercase ml-1 opacity-50 border border-white/20 px-1 rounded">Sede {proximaClase.sala?.sede?.nombre}</span></span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 bg-[#111] border-t border-white/5 mt-auto">
                                    <button
                                        onClick={() => setSelectedGrupo(grupo)}
                                        className={`w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all shadow-lg
                                            ${esEspecial ? 'bg-purple-600 text-white hover:bg-purple-500' : 'bg-[#D4E655] text-black hover:bg-white'}
                                        `}
                                    >
                                        Ver Fechas <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* MODAL DE FECHAS */}
            {selectedGrupo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setSelectedGrupo(null)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-white/10 shrink-0 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4E655]/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                            <div className="flex justify-between items-start relative z-10">
                                <div>
                                    <h3 className="text-2xl font-black text-white uppercase leading-tight">{selectedGrupo.nombre}</h3>
                                    <p className="flex items-center gap-1.5 text-sm font-bold text-gray-400 mt-1">
                                        <User size={14} className={['Especial', 'Seminario', 'Intensivo'].includes(selectedGrupo.tipo_clase) ? 'text-purple-400' : 'text-[#D4E655]'} />
                                        {selectedGrupo.profesor.nombre_completo}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedGrupo(null)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Elegí la fecha para anotarte:</h4>

                            {selectedGrupo.instancias.map((inst) => {
                                const estaLleno = inst.cupo_maximo > 0 && inst.inscritos_count >= inst.cupo_maximo
                                const esEspecial = ['Especial', 'Seminario', 'Intensivo'].includes(selectedGrupo.tipo_clase)
                                const creditosDisponibles = perfil ? (esEspecial ? perfil.creditos_seminarios : perfil.creditos_regulares) : 0
                                const sinCreditos = creditosDisponibles <= 0

                                return (
                                    <div key={inst.id} className="bg-[#111] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between hover:border-white/20 transition-colors">
                                        <div className="flex-1 w-full">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Calendar size={14} className={esEspecial ? 'text-purple-400' : 'text-[#D4E655]'} />
                                                <span className="font-bold text-white capitalize text-sm">{format(new Date(inst.inicio), "EEEE d 'de' MMMM", { locale: es })}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] text-gray-400 font-medium pl-5 mt-1">
                                                <span className="flex items-center gap-1"><Clock size={12} /> {format(new Date(inst.inicio), "HH:mm")} a {format(new Date(inst.fin), "HH:mm")}</span>
                                                <span className="flex items-center gap-1"><MapPin size={12} /> {inst.sala.nombre}</span>
                                            </div>
                                            {inst.cupo_maximo > 0 && (
                                                <div className="pl-5 mt-3 pr-4">
                                                    <div className="w-full bg-black rounded-full h-1.5 mb-1 overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all ${estaLleno ? 'bg-red-500' : (esEspecial ? 'bg-purple-500' : 'bg-[#D4E655]')}`} style={{ width: `${Math.min(100, (inst.inscritos_count / inst.cupo_maximo) * 100)}%` }}></div>
                                                    </div>
                                                    <p className="text-[8px] uppercase font-bold text-gray-500 text-right">{inst.inscritos_count} / {inst.cupo_maximo} ocupados</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="w-full sm:w-auto shrink-0 flex flex-col justify-end">
                                            {inst.ya_inscrito ? (
                                                <div className="w-full sm:w-32 py-2.5 bg-green-500/10 text-green-500 border border-green-500/20 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest cursor-default">
                                                    <CheckCircle2 size={14} /> Anotado
                                                </div>
                                            ) : estaLleno ? (
                                                <div className="w-full sm:w-32 py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest cursor-default">
                                                    <AlertCircle size={14} /> Lleno
                                                </div>
                                            ) : sinCreditos ? (
                                                <Link href="/tienda" className="w-full sm:w-36 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all bg-white/5 text-white border border-white/10 hover:bg-white hover:text-black">
                                                    <Ticket size={12} /> Sin Saldo
                                                </Link>
                                            ) : (
                                                <button
                                                    onClick={() => handleInscribirse(inst, selectedGrupo)}
                                                    disabled={procesandoId === inst.id}
                                                    className={`w-full sm:w-36 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all
                                                        ${esEspecial ? 'bg-purple-600 text-white hover:bg-purple-500' : 'bg-[#D4E655] text-black hover:bg-white'}
                                                        disabled:opacity-50 disabled:cursor-not-allowed`}
                                                >
                                                    {procesandoId === inst.id ? <Loader2 size={14} className="animate-spin" /> : 'Reservar Lugar'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}