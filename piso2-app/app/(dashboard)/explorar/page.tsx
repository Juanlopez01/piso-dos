'use client'

import { createClient } from '@/utils/supabase/client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    Search, Music, Calendar, Clock, MapPin,
    User, Ticket, Star, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon,
    X, ArrowRight, ShieldCheck, Lock
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import { inscribirAlumnoAction } from '@/app/actions/cartelera'
import { useCash } from '@/context/CashContext'

const parseSafeDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return new Date()
    const cleanStr = dateStr.replace('+00:00', '').replace('+00', '').replace('Z', '').replace(' ', 'T')
    const parsed = new Date(cleanStr)
    return isNaN(parsed.getTime()) ? new Date() : parsed
}

type ClaseInstancia = { id: string; inicio: string; fin: string; cupo_maximo: number; inscritos_count: number; ya_inscrito: boolean; estado: string; sala: { nombre: string; sede: { nombre: string } } }
type ClaseAgrupada = { key_grupo: string; nombre: string; tipo_clase: string; imagen_url?: string | null; ritmo_id?: string | null; profesor: { nombre_completo: string }; instancias: ClaseInstancia[]; es_combinable: boolean }

type CarteleraData = {
    perfil: { id: string, creditos_regulares: number, creditos_especiales: number } | null;
    clasesAgrupadas: ClaseAgrupada[];
    pasesExclusivos: Record<string, number>;
}

const fetcherCartelera = async (uid: string | null, supabase: any): Promise<CarteleraData> => {
    let profile = null
    let pasesExclusivos: Record<string, number> = {}

    if (uid) {
        supabase.rpc('limpiar_creditos_vencidos').then()
        const { data: userProfile } = await supabase.from('profiles').select('id, creditos_regulares, creditos_especiales').eq('id', uid).single()
        profile = userProfile

        const { data: pases } = await supabase.from('pases_exclusivos').select('pase_referencia, cantidad').eq('usuario_id', uid)
        if (pases) {
            pases.forEach((p: { pase_referencia: string; cantidad: number }) => {
                pasesExclusivos[p.pase_referencia] = p.cantidad
            })
        }
    }

    const hoy = new Date().toISOString()
    const { data: clasesData } = await supabase
        .from('clases')
        .select(`
            id, nombre, inicio, fin, tipo_clase, cupo_maximo, estado, imagen_url, ritmo_id, es_combinable,
            profesor:profiles!clases_profesor_id_fkey(nombre_completo),
            sala:salas(nombre, sede:sedes(nombre)),
            inscripciones(user_id)
        `)
        .gte('inicio', hoy)
        .neq('estado', 'cancelada')
        .neq('tipo_clase', 'Formación')
        .order('inicio', { ascending: true })

    const agrupador: Record<string, ClaseAgrupada> = {}
    if (clasesData) {
        clasesData.forEach((c: any) => {
            const nombreProfe = Array.isArray(c.profesor) ? c.profesor[0]?.nombre_completo : c.profesor?.nombre_completo || 'Staff'
            const key = `${c.nombre}-${nombreProfe}-${c.tipo_clase}`
            const inscritos = c.inscripciones || []
            const instancia: ClaseInstancia = {
                id: c.id, inicio: c.inicio, fin: c.fin, cupo_maximo: c.cupo_maximo,
                inscritos_count: inscritos.length,
                ya_inscrito: uid ? inscritos.some((i: any) => i.user_id === uid) : false,
                estado: c.estado,
                sala: Array.isArray(c.sala) ? c.sala[0] : c.sala
            }
            if (!agrupador[key]) {
                agrupador[key] = {
                    key_grupo: key, nombre: c.nombre, tipo_clase: c.tipo_clase,
                    imagen_url: c.imagen_url, ritmo_id: c.ritmo_id,
                    profesor: { nombre_completo: nombreProfe }, instancias: [],
                    es_combinable: c.es_combinable ?? true
                }
            }
            agrupador[key].instancias.push(instancia)
        })
    }

    const arrAgrupado = Object.values(agrupador)
    arrAgrupado.forEach(g => g.instancias.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()))
    arrAgrupado.sort((a, b) => new Date(a.instancias[0].inicio).getTime() - new Date(b.instancias[0].inicio).getTime())

    return { perfil: profile as any, clasesAgrupadas: arrAgrupado, pasesExclusivos }
}

export default function ExplorarClasesPage() {
    const router = useRouter()
    const [supabase] = useState(() => createClient())
    const { mutate: globalMutate } = useSWRConfig()

    const { userId, isLoading: contextLoading, userRole } = useCash()
    const esStaff = ['admin', 'recepcion'].includes(userRole || '')

    const { data, isLoading, mutate: mutateCartelera } = useSWR<CarteleraData>(
        !contextLoading ? ['cartelera', userId] : null,
        ([_, uid]) => fetcherCartelera(uid as string | null, supabase),
        { revalidateOnFocus: false, dedupingInterval: 3000 }
    )

    const clasesAgrupadas = data?.clasesAgrupadas || []
    const perfil = data?.perfil || null
    const pasesExclusivos = data?.pasesExclusivos || {}

    const [procesandoId, setProcesandoId] = useState<string | null>(null)
    const [selectedGrupo, setSelectedGrupo] = useState<ClaseAgrupada | null>(null)
    const [filtroTexto, setFiltroTexto] = useState('')
    const [filtroTipo, setFiltroTipo] = useState<'Todos' | 'Regular' | 'Especial' | 'Exclusivo'>('Todos')

    // 🎨 FUNCIÓN DE ESTILOS DINÁMICOS
    const getEstilos = (tipo: string, esExclusiva: boolean) => {
        if (esExclusiva) return {
            border: 'border-cyan-500/50',
            bg: 'bg-cyan-500 text-black',
            btn: 'bg-cyan-600 text-black hover:bg-cyan-400',
            icon: 'text-cyan-400'
        };

        const t = tipo.toLowerCase();
        if (t === 'formacion') return {
            border: 'border-[#D4E655]/50',
            bg: 'bg-[#D4E655] text-black',
            btn: 'bg-[#D4E655] text-black hover:bg-white',
            icon: 'text-[#D4E655]'
        };
        if (['especial', 'seminario', 'intensivo'].includes(t)) return {
            border: 'border-purple-500/50',
            bg: 'bg-purple-500 text-white',
            btn: 'bg-white text-black hover:bg-purple-200',
            icon: 'text-purple-400'
        };

        // REGULAR (NARANJA)
        return {
            border: 'border-orange-500/50',
            bg: 'bg-orange-500 text-white',
            btn: 'bg-orange-500 text-white hover:bg-orange-400',
            icon: 'text-orange-400'
        };
    }

    const handleInscribirse = async (instancia: ClaseInstancia, grupo: ClaseAgrupada) => {
        if (!perfil) {
            toast.error("Debes iniciar sesión para anotarte.")
            return router.push('/login')
        }

        if (!grupo.es_combinable) {
            const pasesDisponibles = pasesExclusivos[grupo.key_grupo] || 0
            if (pasesDisponibles <= 0) return toast.error("Clase Exclusiva. Necesitás el pase de este grupo.")
        } else {
            const esEspecial = ['Especial', 'Seminario', 'Intensivo'].includes(grupo.tipo_clase)
            const columna = esEspecial ? 'creditos_especiales' : 'creditos_regulares'
            if ((perfil as any)[columna] <= 0) return toast.error("No tenés créditos suficientes.")
        }

        setProcesandoId(instancia.id)
        const response = await inscribirAlumnoAction(instancia.id, grupo.tipo_clase, grupo.key_grupo)

        if (response.success) {
            toast.success(response.message)
            mutateCartelera()
            globalMutate(['perfil', userId])
        } else {
            toast.error(response.error || 'Error al procesar reserva')
            mutateCartelera()
        }
        setProcesandoId(null)
    }

    const gruposFiltrados = useMemo(() => {
        return clasesAgrupadas.filter(g => {
            const coincideTexto = g.nombre.toLowerCase().includes(filtroTexto.toLowerCase()) ||
                g.profesor.nombre_completo.toLowerCase().includes(filtroTexto.toLowerCase());

            const esEspecial = ['Especial', 'Seminario', 'Intensivo'].includes(g.tipo_clase);
            const esExclusivo = !g.es_combinable;

            let coincideTipo = true;
            if (filtroTipo === 'Especial') coincideTipo = esEspecial && !esExclusivo;
            if (filtroTipo === 'Regular') coincideTipo = !esEspecial && !esExclusivo;
            if (filtroTipo === 'Exclusivo') coincideTipo = esExclusivo;

            return coincideTexto && coincideTipo;
        });
    }, [clasesAgrupadas, filtroTexto, filtroTipo]);

    const ritmosSugeridos = useMemo(() => Array.from(new Set(clasesAgrupadas.map(c => c.nombre.split(' ')[0]))).slice(0, 5), [clasesAgrupadas])

    if (isLoading || contextLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1">Cartelera</h1>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                        {esStaff ? 'Vista general de clases programadas' : 'Reservá tu lugar en las próximas clases'}
                    </p>
                </div>

                {!esStaff && (
                    <div className="flex gap-3 w-full md:w-auto">
                        <div className="flex-1 md:flex-none bg-orange-500/10 border border-orange-500/30 rounded-2xl p-3 flex items-center gap-3">
                            <div className="bg-orange-500 text-white p-2 rounded-xl"><Ticket size={20} /></div>
                            <div>
                                <p className="text-[10px] text-orange-400 font-black uppercase tracking-widest">Regulares</p>
                                <p className="text-xl font-black leading-none">{perfil?.creditos_regulares || 0}</p>
                            </div>
                        </div>
                        <div className="flex-1 md:flex-none bg-purple-500/10 border border-purple-500/30 rounded-2xl p-3 flex items-center gap-3">
                            <div className="bg-purple-50 text-white p-2 rounded-xl"><Star size={20} /></div>
                            <div>
                                <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest">Especiales</p>
                                <p className="text-xl font-black leading-none">{perfil?.creditos_especiales || 0}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mb-8 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input type="text" placeholder="Buscar por ritmo, profesor..." value={filtroTexto} onChange={(e) => setFiltroTexto(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-[#D4E655]" />
                    </div>
                    <div className="flex bg-[#111] p-1 rounded-2xl border border-white/10 shrink-0 overflow-x-auto">
                        {['Todos', 'Regular', 'Especial', 'Exclusivo'].map(tipo => (
                            <button
                                key={tipo}
                                onClick={() => setFiltroTipo(tipo as any)}
                                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filtroTipo === tipo
                                    ? (tipo === 'Exclusivo' ? 'bg-cyan-500 text-black' : tipo === 'Regular' ? 'bg-orange-500 text-white' : tipo === 'Especial' ? 'bg-purple-500 text-white' : 'bg-[#D4E655] text-black')
                                    : 'text-gray-500 hover:text-white'
                                    }`}
                            >
                                {tipo}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2">
                    {ritmosSugeridos.map(ritmo => (
                        <button key={ritmo} onClick={() => setFiltroTexto(ritmo)} className="bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-full text-xs font-bold text-gray-300 flex items-center gap-2 transition-colors whitespace-nowrap"><Music size={12} /> {ritmo}</button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {gruposFiltrados.map((grupo) => {
                    const esExclusiva = !grupo.es_combinable
                    const estilos = getEstilos(grupo.tipo_clase, esExclusiva)
                    const proximaClase = grupo.instancias[0]

                    return (
                        <div key={grupo.key_grupo} className={`bg-[#09090b] rounded-3xl overflow-hidden flex flex-col transition-all group shadow-xl border-2 ${estilos.border}`}>
                            <div className="h-48 w-full relative bg-[#1a1a1c] border-b border-white/5 flex items-center justify-center overflow-hidden">
                                {grupo.imagen_url ? (
                                    <Image src={grupo.imagen_url} alt={grupo.nombre} fill sizes="33vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-white/20"><ImageIcon size={40} /><span className="text-[10px] font-black uppercase">Sin Flyer</span></div>
                                )}
                                {esExclusiva && <span className="absolute top-4 left-4 text-[9px] font-black uppercase px-2.5 py-1 rounded-full backdrop-blur-md bg-cyan-500 text-black flex items-center gap-1 shadow-lg"><Lock size={10} /> Pase Exclusivo</span>}
                                <span className={`absolute top-4 right-4 text-[9px] font-black uppercase px-2.5 py-1 rounded-full backdrop-blur-md shadow-lg ${estilos.bg}`}>{grupo.tipo_clase}</span>
                            </div>

                            <div className="p-5 flex-1 flex flex-col">
                                <div className="mb-4">
                                    <h3 className="text-xl font-black text-white uppercase leading-tight mb-1">{grupo.nombre}</h3>
                                    <p className="flex items-center gap-1.5 text-sm font-bold text-gray-300">
                                        <User size={14} className={estilos.icon} /> {grupo.profesor.nombre_completo}
                                    </p>
                                </div>
                                <div className="space-y-3 mt-auto pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-3 text-sm text-gray-300">
                                        <MapPin size={14} className="text-white/50" />
                                        <span>{proximaClase.sala?.nombre} <span className="text-[10px] uppercase ml-1 opacity-50 border border-white/20 px-1 rounded">{proximaClase.sala?.sede?.nombre}</span></span>
                                    </div>
                                    {/* 🚀 NUEVO: Info de la Hora (Próxima clase) */}
                                    <p className="flex items-center gap-1.5 text-[11px] font-black text-gray-500 uppercase tracking-widest mt-2 bg-white/5 w-fit px-2 py-1 rounded-md">
                                        <Clock size={12} className={estilos.icon} />
                                        {format(parseSafeDate(grupo.instancias[0].inicio), "HH:mm")} HS
                                    </p>
                                </div>
                            </div>
                            <div className="p-5 bg-[#111] border-t border-white/5">
                                <button onClick={() => setSelectedGrupo(grupo)} className={`w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all shadow-md ${estilos.btn}`}>Ver Fechas <ArrowRight size={16} /></button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {selectedGrupo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setSelectedGrupo(null)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-white/10 shrink-0 flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-black text-white uppercase leading-tight">{selectedGrupo.nombre}</h3>
                                <p className="text-sm font-bold text-gray-400 mt-1">Prof: {selectedGrupo.profesor.nombre_completo}</p>
                            </div>
                            <button onClick={() => setSelectedGrupo(null)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
                            {selectedGrupo.instancias.map((inst) => {
                                const estaLleno = inst.cupo_maximo > 0 && inst.inscritos_count >= inst.cupo_maximo
                                const esExclusivaModal = !selectedGrupo.es_combinable
                                const estilos = getEstilos(selectedGrupo.tipo_clase, esExclusivaModal)

                                let tieneSaldo = false
                                if (esExclusivaModal) {
                                    tieneSaldo = (pasesExclusivos[selectedGrupo.key_grupo] || 0) > 0
                                } else {
                                    const esEspecial = ['Especial', 'Seminario', 'Intensivo'].includes(selectedGrupo.tipo_clase)
                                    tieneSaldo = (perfil ? (esEspecial ? perfil.creditos_especiales : perfil.creditos_regulares) : 0) > 0
                                }

                                const inicioDate = parseSafeDate(inst.inicio)
                                const finDate = parseSafeDate(inst.fin)

                                return (
                                    <div key={inst.id} className={`bg-[#111] border rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between hover:border-white/20 transition-all ${esExclusivaModal ? 'border-cyan-500/20' : 'border-white/5'}`}>
                                        <div className="flex-1 w-full">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Calendar size={14} className={estilos.icon} />
                                                <span className="font-bold text-white capitalize text-sm">{format(inicioDate, "EEEE d 'de' MMMM", { locale: es })}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] text-gray-400 font-medium pl-5 mt-1">
                                                <span><Clock size={12} className="inline mr-1" /> {format(inicioDate, "HH:mm")} a {format(finDate, "HH:mm")}</span>
                                                <span><MapPin size={12} className="inline mr-1" /> {inst.sala.nombre}</span>
                                            </div>
                                        </div>

                                        <div className="w-full sm:w-auto">
                                            {esStaff ? (
                                                <div className="w-full sm:w-32 py-2.5 bg-white/5 text-gray-400 border border-white/10 rounded-xl flex items-center justify-center text-[10px] font-black uppercase cursor-default">Modo Vista</div>
                                            ) : inst.ya_inscrito ? (
                                                <div className="w-full sm:w-32 py-2.5 bg-green-500/10 text-green-500 border border-green-500/20 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase"><CheckCircle2 size={14} /> Anotado</div>
                                            ) : estaLleno ? (
                                                <div className="w-full sm:w-32 py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase"><AlertCircle size={14} /> Lleno</div>
                                            ) : !tieneSaldo ? (
                                                <Link href="/tienda" className="w-full sm:w-36 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase bg-white/5 text-white border border-white/10 hover:bg-white hover:text-black transition-all">
                                                    {esExclusivaModal ? 'Comprar Pase' : 'Sin Saldo'}
                                                </Link>
                                            ) : (
                                                <button onClick={() => handleInscribirse(inst, selectedGrupo)} disabled={procesandoId === inst.id} className={`w-full sm:w-36 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase transition-all shadow-sm ${estilos.btn} disabled:opacity-50`}>
                                                    {procesandoId === inst.id ? <Loader2 size={14} className="animate-spin" /> : (esExclusivaModal ? 'Reservar con Pase' : 'Reservar Lugar')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}

                            {!selectedGrupo.es_combinable && (
                                <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl flex items-center gap-3">
                                    <ShieldCheck className="text-cyan-400" size={20} />
                                    <div>
                                        <p className="text-[10px] text-cyan-400 font-black uppercase">Tu Saldo Exclusivo</p>
                                        <p className="text-sm font-bold text-white">{pasesExclusivos[selectedGrupo.key_grupo] || 0} Pases disponibles</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}