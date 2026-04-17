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
    // 🚀 NUEVOS FILTROS
    const [filtroTipo, setFiltroTipo] = useState<'Todos' | 'Regular' | 'Especial' | 'Intensivo' | 'Formacion' | 'Compañia'>('Todos')

    // 🎨 FUNCIÓN DE ESTILOS DINÁMICOS
    const getEstilos = (tipo: string) => {
        const t = tipo.toLowerCase();

        switch (t) {
            case 'regular':
                return { border: 'border-orange-500/50', bg: 'bg-orange-500 text-white', btn: 'bg-orange-500 hover:bg-orange-400 text-white', icon: 'text-orange-500' };
            case 'especial':
                return { border: 'border-purple-500/50', bg: 'bg-purple-500 text-white', btn: 'bg-white hover:bg-purple-200 text-black', icon: 'text-purple-400' };
            case 'intensivo':
                return { border: 'border-fuchsia-600/50', bg: 'bg-fuchsia-600 text-white', btn: 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white', icon: 'text-fuchsia-500' };
            case 'formacion':
            case 'formación': // Por si acaso
                return { border: 'border-[#D4E655]/50', bg: 'bg-[#D4E655] text-black', btn: 'bg-[#D4E655] hover:bg-white text-black', icon: 'text-[#D4E655]' };
            case 'compañía':
            case 'compania':
                return { border: 'border-blue-500/50', bg: 'bg-blue-500 text-white', btn: 'bg-blue-600 hover:bg-blue-400 text-white', icon: 'text-blue-400' };
            default:
                return { border: 'border-white/10', bg: 'bg-zinc-800 text-white', btn: 'bg-white text-black hover:bg-gray-200', icon: 'text-white' };
        }
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

            let coincideTipo = true;
            if (filtroTipo !== 'Todos') {
                // 🚀 ARREGLO: Normalización universal para ignorar tildes y la ñ
                const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                const tipoClaseNormalizado = normalize(g.tipo_clase);
                const filtroNormalizado = normalize(filtroTipo);

                coincideTipo = tipoClaseNormalizado === filtroNormalizado;
            }

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
                    {/* 🚀 FILTROS ACTUALIZADOS */}
                    <div className="flex bg-[#111] p-1 rounded-2xl border border-white/10 shrink-0 overflow-x-auto custom-scrollbar">
                        {['Todos', 'Regular', 'Especial', 'Intensivo', 'Formacion', 'Compañía'].map(tipo => {
                            const isActive = filtroTipo === tipo;
                            let btnStyle = 'text-gray-500 hover:text-white';
                            if (isActive) {
                                switch (tipo) {
                                    case 'Regular': btnStyle = 'bg-orange-500 text-white'; break;
                                    case 'Especial': btnStyle = 'bg-purple-500 text-white'; break;
                                    case 'Intensivo': btnStyle = 'bg-fuchsia-600 text-white'; break;
                                    case 'Formacion': btnStyle = 'bg-[#D4E655] text-black'; break;
                                    case 'Compañia': btnStyle = 'bg-blue-500 text-white'; break;
                                    default: btnStyle = 'bg-white text-black'; // Para 'Todos'
                                }
                            }

                            return (
                                <button
                                    key={tipo}
                                    onClick={() => setFiltroTipo(tipo as any)}
                                    className={`px-4 sm:px-6 py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${btnStyle}`}
                                >
                                    {tipo}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {ritmosSugeridos.map(ritmo => (
                        <button key={ritmo} onClick={() => setFiltroTexto(ritmo)} className="bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-full text-xs font-bold text-gray-300 flex items-center gap-2 transition-colors whitespace-nowrap"><Music size={12} /> {ritmo}</button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {gruposFiltrados.map((grupo) => {
                    const esNoCombinable = !grupo.es_combinable;
                    const estilos = getEstilos(grupo.tipo_clase);
                    const proximaClase = grupo.instancias[0];

                    return (
                        <div key={grupo.key_grupo} className={`group relative w-full aspect-[4/5] sm:h-[450px] bg-[#1a1a1c] rounded-3xl overflow-hidden shadow-xl border-2 flex flex-col justify-between transition-all ${estilos.border}`}>

                            {/* 📸 FONDO IMAGEN */}
                            <div className="absolute inset-0 z-0">
                                {grupo.imagen_url ? (
                                    <Image src={grupo.imagen_url} alt={grupo.nombre} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                                ) : (
                                    <div className="flex flex-col items-center justify-center w-full h-full gap-2 text-white/20 bg-[#1a1a1c]"><ImageIcon size={60} /><span className="text-[10px] font-black uppercase">Sin Flyer</span></div>
                                )}
                            </div>

                            <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none"></div>

                            {/* 🏷️ PÍLDORAS SUPERIORES */}
                            <div className="relative z-20 p-4 flex justify-between items-start gap-2">
                                {/* Pildorita de NO COMBINABLE (Neutra) */}
                                {esNoCombinable ? (
                                    <span className="text-[8px] font-black uppercase px-2 py-1 rounded-full backdrop-blur-md bg-white/90 text-black flex items-center gap-1 shadow-lg border border-black/10">
                                        <Lock size={10} /> No combinable
                                    </span>
                                ) : (
                                    <div></div>
                                )}

                                {/* Pildorita de CATEGORÍA */}
                                <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full backdrop-blur-md shadow-lg ${estilos.bg}`}>
                                    {grupo.tipo_clase}
                                </span>
                            </div>

                            {/* 🪟 BLOQUE DE TEXTO INFERIOR */}
                            <div className="relative z-20 mt-auto bg-black/60 backdrop-blur-md border-t border-white/10 p-5 flex flex-col gap-3">
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase leading-tight mb-1 drop-shadow-md">{grupo.nombre}</h3>
                                    <p className="flex items-center gap-1.5 text-sm font-bold text-gray-200 drop-shadow-md">
                                        <User size={14} className={estilos.icon} /> {grupo.profesor.nombre_completo}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 pt-3 border-t border-white/10">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs text-gray-300 font-medium drop-shadow-sm">
                                            <MapPin size={12} className="text-white/50" />
                                            <span>{proximaClase.sala?.nombre} <span className="text-[9px] uppercase ml-1 opacity-50 border border-white/20 px-1 rounded">{proximaClase.sala?.sede?.nombre}</span></span>
                                        </div>
                                        <p className="flex items-center gap-1.5 text-[10px] font-black text-white uppercase tracking-widest bg-white/10 px-2 py-1.5 rounded-md border border-white/5 backdrop-blur-sm">
                                            <Clock size={12} className={estilos.icon} />
                                            {format(parseSafeDate(proximaClase.inicio), "HH:mm")}
                                        </p>
                                    </div>
                                </div>

                                <button onClick={() => setSelectedGrupo(grupo)} className={`w-full mt-2 py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all shadow-lg ${estilos.btn}`}>
                                    Ver Fechas <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )
                })}
                {gruposFiltrados.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-500">
                        <Search size={40} className="opacity-20 mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest text-center">No hay clases programadas para esta categoría.</p>
                    </div>
                )}
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
                                const estilos = getEstilos(selectedGrupo.tipo_clase)

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
                                    <div key={inst.id} className={`bg-[#111] border rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between hover:border-white/20 transition-all ${esExclusivaModal ? 'border-gray-500/20' : 'border-white/5'}`}>
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
                                <div className="p-4 bg-white/5 border border-white/20 rounded-2xl flex items-center gap-3">
                                    <ShieldCheck className="text-white" size={20} />
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-black uppercase">Tu Saldo No Combinable</p>
                                        <p className="text-sm font-bold text-white">{pasesExclusivos[selectedGrupo.key_grupo] || 0} créditos disponibles para esta clase</p>
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