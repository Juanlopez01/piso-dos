'use client'

import { createClient } from '@/utils/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr' // 🚀 ACÁ ESTÁ LA MAGIA SWR
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameDay, addMonths, subMonths, isSameMonth
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
    ChevronLeft, ChevronRight, X, Plus, MapPin, Trash2, Loader2,
    Info, DollarSign, Image as ImageIcon, Briefcase, GraduationCap,
    Music, User, AlertCircle, CalendarDays, Star, UsersRound, Building2, Sparkles
} from 'lucide-react'
import { clsx } from 'clsx'
import Image from 'next/image'
import { Toaster, toast } from 'sonner'
import MultiDatePicker from '@/components/MultiDatePicker'
import { v4 as uuidv4 } from 'uuid'

// --- TIPOS ESTRICTOS ---
type EventoAgenda = {
    id: string
    tipo: 'Clase' | 'Alquiler'
    titulo: string
    subtitulo: string
    inicio: string
    fin: string
    fecha_render: string
    sala_nombre: string
    sala_sede: string
    sede_id: string
    clase_data?: {
        profesor_nombre: string
        nivel: string
        imagen_url: string | null
        serie_id: string | null
        tipo_clase: string
        tipo_acuerdo: string
        valor_acuerdo: number
        ritmo_id: string | null
        es_la_liga: boolean
        liga_nivel: number | null
        compania_nombre: string | null
        es_audicion: boolean
    }
    alquiler_data?: {
        telefono: string
        monto: number
        estado: string
    }
}

type Sede = { id: string; nombre: string; salas: { id: string; nombre: string }[] }
type Profile = { id: string; nombre_completo: string | null; email: string }
type Ritmo = { id: string; nombre: string }
type CompaniaMin = { id: string; nombre: string }

type RPCClase = {
    id: string
    nombre: string
    tipo_clase: string
    inicio: string
    fin: string
    sala_nombre: string
    sala_sede: string
    sede_id: string
    profesor_nombre: string
    nivel: string
    imagen_url: string | null
    serie_id: string | null
    tipo_acuerdo: string
    valor_acuerdo: number
    ritmo_id: string | null
    es_la_liga: boolean
    liga_nivel: number | null
    compania_nombre: string | null
    es_audicion: boolean
    estado: string
}

type RPCAlquiler = {
    id: string
    cliente_nombre: string | null
    tipo_uso: string
    fecha: string
    hora_inicio: string
    hora_fin: string
    sala_nombre: string
    sala_sede: string
    sede_id: string
    cliente_contacto: string
    monto_total: number
    estado: string
}

type RPCAgendaData = {
    clases: RPCClase[] | null
    alquileres: RPCAlquiler[] | null
    sedes: Sede[] | null
    profesores: Profile[] | null
    ritmos: Ritmo[] | null
    companias: CompaniaMin[] | null
}

// 🚀 FETCHER PARA SWR
const fetcher = async ([key, startIso, endIso, startDateStr, endDateStr]: string[]) => {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('get_agenda_completa', {
        p_start_iso: startIso,
        p_end_iso: endIso,
        p_start_date: startDateStr,
        p_end_date: endDateStr
    })

    if (error) throw error

    const typedData = data as unknown as RPCAgendaData
    const agenda: EventoAgenda[] = []

    if (typedData.clases) {
        typedData.clases.forEach((c) => {
            if (c.estado === 'cancelada') return;
            agenda.push({
                id: c.id, tipo: 'Clase', titulo: c.nombre, subtitulo: c.tipo_clase,
                inicio: c.inicio, fin: c.fin, fecha_render: format(new Date(c.inicio), 'yyyy-MM-dd'),
                sala_nombre: c.sala_nombre, sala_sede: c.sala_sede, sede_id: c.sede_id,
                clase_data: {
                    profesor_nombre: c.profesor_nombre || 'Sin Asignar', nivel: c.nivel, imagen_url: c.imagen_url,
                    serie_id: c.serie_id, tipo_clase: c.tipo_clase, tipo_acuerdo: c.tipo_acuerdo,
                    valor_acuerdo: c.valor_acuerdo, ritmo_id: c.ritmo_id, es_la_liga: c.es_la_liga || false,
                    liga_nivel: c.liga_nivel || null, compania_nombre: c.compania_nombre || null,
                    es_audicion: c.es_audicion || false
                }
            })
        })
    }

    if (typedData.alquileres) {
        typedData.alquileres.forEach((a) => {
            const inicioLocal = `${a.fecha}T${a.hora_inicio.slice(0, 5)}:00`
            const finLocal = `${a.fecha}T${a.hora_fin.slice(0, 5)}:00`
            agenda.push({
                id: a.id, tipo: 'Alquiler', titulo: a.cliente_nombre || 'Cliente Externo',
                subtitulo: `Alquiler (${a.tipo_uso})`, inicio: inicioLocal, fin: finLocal,
                fecha_render: a.fecha, sala_nombre: a.sala_nombre, sala_sede: a.sala_sede, sede_id: a.sede_id,
                alquiler_data: { telefono: a.cliente_contacto, monto: a.monto_total, estado: a.estado }
            })
        })
    }

    agenda.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())

    return {
        eventos: agenda,
        sedes: typedData.sedes || [],
        profesores: typedData.profesores || [],
        ritmos: typedData.ritmos || [],
        companias: typedData.companias || []
    }
}

export default function CalendarioPage() {
    const [supabase] = useState(() => createClient())
    const router = useRouter()

    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [sedeFiltro, setSedeFiltro] = useState<string>('todas')

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'view' | 'create'>('view')
    const [deleteTarget, setDeleteTarget] = useState<{ id: string, serieId: string | null } | null>(null)
    const [uploading, setUploading] = useState(false)
    const [isCreatingRitmo, setIsCreatingRitmo] = useState(false)
    const [nuevoRitmoNombre, setNuevoRitmoNombre] = useState('')

    const [form, setForm] = useState({
        nombre: '', descripcion: '', tipo: 'Regular', nivel: 'Open', ritmoId: '',
        hora: '18:00', duracion: 60, cupoMaximo: 20, sedeId: '', salaId: '', profeId: '',
        tipoAcuerdo: 'porcentaje', valorAcuerdo: '', fechas: [] as Date[],
        esLaLiga: false, ligaNivel: 1, companiaId: '', esAudicion: false
    })
    const [formFile, setFormFile] = useState<File | null>(null)

    // 🚀 SWR IMPLEMENTADO AQUÍ
    const startIso = startOfWeek(startOfMonth(currentDate)).toISOString()
    const endIso = endOfWeek(endOfMonth(currentDate)).toISOString()
    const startDateStr = format(startOfWeek(startOfMonth(currentDate)), 'yyyy-MM-dd')
    const endDateStr = format(endOfWeek(endOfMonth(currentDate)), 'yyyy-MM-dd')

    const { data, error, isLoading, mutate } = useSWR(
        ['agenda', startIso, endIso, startDateStr, endDateStr],
        fetcher,
        {
            revalidateOnFocus: true,
            dedupingInterval: 3000
        }
    )

    const eventos = data?.eventos || []
    const sedes = data?.sedes || []
    const profesores = data?.profesores || []
    const ritmos = data?.ritmos || []
    const companias = data?.companias || []

    if (error) {
        toast.error('Error de red. SWR está intentando reconectar...')
    }

    const handleCrearRitmo = async (e?: React.FormEvent | React.KeyboardEvent) => {
        if (e) e.preventDefault()
        const nombreLimpio = nuevoRitmoNombre.trim()
        if (!nombreLimpio) return

        try {
            const { data: nuevoRitmo, error } = await supabase.from('ritmos').insert([{ nombre: nombreLimpio }]).select().single()
            if (error) { toast.error('Error al guardar ritmo'); return }
            if (nuevoRitmo) {
                toast.success(`Ritmo creado`)
                setForm({ ...form, ritmoId: nuevoRitmo.id })
                setIsCreatingRitmo(false)
                setNuevoRitmoNombre('')
                mutate()
            }
        } catch (err: unknown) {
            const error = err as Error;
            toast.error(error.message || 'Ocurrió un error inesperado al crear el ritmo');
        }
    }

    const checkConflictos = async (salaId: string, inicio: Date, fin: Date) => {
        const inicioIso = inicio.toISOString()
        const finIso = fin.toISOString()
        const fechaLocalSegura = new Date(inicio.getTime() + Math.abs(inicio.getTimezoneOffset() * 60000))
        const fechaStr = format(fechaLocalSegura, 'yyyy-MM-dd')
        const hInicio = format(inicio, 'HH:mm')
        const hFin = format(fin, 'HH:mm')

        const { data: conflictoClase } = await supabase.from('clases').select('id, nombre').eq('sala_id', salaId).neq('estado', 'cancelada').lt('inicio', finIso).gt('fin', inicioIso).maybeSingle()
        if (conflictoClase) return `Clase: ${conflictoClase.nombre}`

        const { data: conflictoAlquiler } = await supabase.from('alquileres').select('id, cliente_nombre').eq('sala_id', salaId).eq('fecha', fechaStr).in('estado', ['confirmado', 'pagado', 'pendiente']).lt('hora_inicio', hFin).gt('hora_fin', hInicio).maybeSingle()
        if (conflictoAlquiler) return `Alquiler: ${conflictoAlquiler.cliente_nombre}`

        return null
    }

    const handleCrearClase = async (e: React.FormEvent) => {
        e.preventDefault()
        if (form.fechas.length === 0) return toast.error('Debe seleccionar al menos una fecha')
        if (!form.salaId || !form.profeId) return toast.error('Faltan datos (Sala o Profe)')
        if (form.tipo === 'Compañía' && !form.companiaId) return toast.error('Falta seleccionar Compañía')

        setUploading(true)
        try {
            const [horas, minutos] = form.hora.split(':')
            let publicUrl = null

            if (formFile) {
                const fileExt = formFile.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`
                const { error: uploadError } = await supabase.storage.from('clases').upload(fileName, formFile)
                if (uploadError) throw new Error('No se pudo subir la imagen.')
                publicUrl = supabase.storage.from('clases').getPublicUrl(fileName).data.publicUrl
            }

            const serieUUID = form.fechas.length > 1 ? uuidv4() : null;

            // 🚀 OPTIMIZACIÓN: Preparamos las fechas y chequemos conflictos en paralelo
            const fechasCalculadas = form.fechas.map(fecha => {
                const baseDate = new Date(fecha)
                baseDate.setHours(parseInt(horas), parseInt(minutos), 0, 0)
                const endDateTime = new Date(baseDate.getTime() + form.duracion * 60000)
                return { baseDate, endDateTime }
            })

            const conflictosPromises = fechasCalculadas.map(async ({ baseDate, endDateTime }) => {
                const conflicto = await checkConflictos(form.salaId, baseDate, endDateTime)
                if (conflicto) return `Conflicto el ${format(baseDate, 'dd/MM')}: ${conflicto}`
                return null
            })

            const resultadosConflictos = await Promise.all(conflictosPromises)
            const conflictoEncontrado = resultadosConflictos.find(c => c !== null)

            if (conflictoEncontrado) {
                throw new Error(conflictoEncontrado)
            }

            // Si llegamos acá, no hay conflictos. Armamos el array de inserción.
            const clasesAInsertar = fechasCalculadas.map(({ baseDate, endDateTime }) => ({
                nombre: form.nombre,
                descripcion: form.descripcion,
                tipo_clase: form.tipo,
                nivel: form.nivel,
                ritmo_id: form.ritmoId || null,
                inicio: baseDate.toISOString(),
                fin: endDateTime.toISOString(),
                sala_id: form.salaId,
                profesor_id: form.profeId,
                tipo_acuerdo: form.tipoAcuerdo,
                valor_acuerdo: Number(form.valorAcuerdo),
                imagen_url: publicUrl,
                cupo_maximo: form.esAudicion ? 9999 : (Number(form.cupoMaximo) || 0),
                serie_id: serieUUID,
                estado: 'activa',
                es_la_liga: form.esLaLiga,
                liga_nivel: form.esLaLiga ? form.ligaNivel : null,
                compania_id: form.tipo === 'Compañía' ? form.companiaId : null,
                es_audicion: form.esAudicion
            }))

            const { error } = await supabase.from('clases').insert(clasesAInsertar)
            if (error) throw new Error('Error al guardar en la base de datos.')

            toast.success(`${clasesAInsertar.length} clase(s) creada(s) correctamente`)
            setModalMode('view')
            setForm({
                nombre: '', descripcion: '', tipo: 'Regular', nivel: 'Open', ritmoId: '',
                hora: '18:00', duracion: 60, cupoMaximo: 20, sedeId: '', salaId: '', profeId: '',
                tipoAcuerdo: 'porcentaje', valorAcuerdo: '', fechas: selectedDate ? [selectedDate] : [],
                esLaLiga: false, ligaNivel: 1, companiaId: '', esAudicion: false
            })
            setFormFile(null)

            mutate()

        } catch (err: unknown) {
            const error = err as Error;
            toast.error(error.message)
        } finally {
            setUploading(false)
        }
    }

    const handleConfirmDelete = async (option: 'single' | 'serie') => {
        if (!deleteTarget) return
        if (option === 'single') await supabase.from('clases').delete().eq('id', deleteTarget.id)
        else await supabase.from('clases').delete().eq('serie_id', deleteTarget.serieId)

        toast.success('Eliminado')
        setDeleteTarget(null)
        mutate()
    }

    const getEventStyle = (evt: EventoAgenda) => {
        if (evt.tipo === 'Alquiler') return { border: 'border-white', text: 'text-white', bg: 'bg-white', glow: 'shadow-white/20' }
        if (evt.clase_data?.es_audicion) return { border: 'border-pink-500', text: 'text-pink-500', bg: 'bg-pink-500', glow: 'shadow-pink-500/20' }
        if (evt.clase_data?.es_la_liga) return { border: 'border-purple-500', text: 'text-purple-500', bg: 'bg-purple-500', glow: 'shadow-purple-500/20' }

        switch (evt.subtitulo) {
            case 'Regular': return { border: 'border-orange-500', text: 'text-orange-500', bg: 'bg-orange-500', glow: 'shadow-orange-500/20' }
            case 'Seminario': return { border: 'border-purple-500', text: 'text-purple-500', bg: 'bg-purple-500', glow: 'shadow-purple-500/20' }
            case 'Intensivo': return { border: 'border-gray-500', text: 'text-gray-400', bg: 'bg-black', glow: 'shadow-gray-500/20' }
            case 'Formación': return { border: 'border-yellow-400', text: 'text-yellow-400', bg: 'bg-yellow-400', glow: 'shadow-yellow-400/20' }
            case 'Compañía': return { border: 'border-blue-500', text: 'text-blue-500', bg: 'bg-blue-500', glow: 'shadow-blue-500/20' }
            default: return { border: 'border-[#D4E655]', text: 'text-[#D4E655]', bg: 'bg-[#D4E655]', glow: 'shadow-[#D4E655]/20' }
        }
    }

    const eventosFiltrados = eventos.filter(e => sedeFiltro === 'todas' || e.sede_id === sedeFiltro)
    const salasDisponibles = sedes.find(s => s.id === form.sedeId)?.salas || []
    const dayStrSelected = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''

    const eventosDelDia = dayStrSelected ? eventosFiltrados.filter(e => e.fecha_render === dayStrSelected) : []

    return (
        <div className="h-full flex flex-col pb-24 md:pb-10 px-2 pt-2">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 md:gap-0">
                <div className="flex items-center gap-3">
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                            {format(currentDate, 'MMMM', { locale: es })}
                            {isLoading && <Loader2 size={20} className="animate-spin text-[#D4E655]" />}
                        </h2>
                        <p className="text-[#D4E655] font-bold text-xs tracking-widest uppercase">{format(currentDate, 'yyyy', { locale: es })} • Agenda Completa</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
                    <div className="flex bg-[#111] rounded-full p-1 border border-white/10 w-full sm:w-auto">
                        <button onClick={() => setSedeFiltro('todas')} className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all ${sedeFiltro === 'todas' ? 'bg-[#D4E655] text-black shadow' : 'text-gray-500 hover:text-white'}`}>Todas</button>
                        {sedes.map(sede => (
                            <button key={sede.id} onClick={() => setSedeFiltro(sede.id)} className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1 ${sedeFiltro === sede.id ? 'bg-[#D4E655] text-black shadow' : 'text-gray-500 hover:text-white'}`}>
                                <Building2 size={10} className={sedeFiltro === sede.id ? 'text-black' : ''} /> {sede.nombre}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 bg-black border border-white/10 hover:border-[#D4E655] hover:text-[#D4E655] transition-all rounded-full"><ChevronLeft size={18} /></button>
                        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 bg-black border border-white/10 hover:border-[#D4E655] hover:text-[#D4E655] transition-all rounded-full"><ChevronRight size={18} /></button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-7 mb-2">{['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map(d => <div key={d} className="text-center text-gray-500 text-[9px] font-black uppercase tracking-wider">{d}</div>)}</div>

            <div className="grid grid-cols-7 gap-1 auto-rows-fr h-full overflow-y-auto">
                {eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) }).map((day) => {
                    const isToday = isSameDay(day, new Date())
                    const isCurrentMonth = isSameMonth(day, currentDate)
                    const dayStr = format(day, 'yyyy-MM-dd')

                    const evtsDia = eventosFiltrados.filter(e => e.fecha_render === dayStr)

                    let dayClass = "opacity-20 border-transparent"
                    if (isCurrentMonth) {
                        if (evtsDia.length === 0) dayClass = "bg-white/5 border-white/5"
                        else {
                            const hasAlquiler = evtsDia.some(e => e.tipo === 'Alquiler')
                            dayClass = hasAlquiler ? "bg-gradient-to-br from-white/10 to-transparent border-white/20" : "bg-gradient-to-br from-[#D4E655]/10 to-transparent border-[#D4E655]/20"
                        }
                    }

                    return (
                        <div key={day.toString()} onClick={() => { setSelectedDate(day); setForm({ ...form, fechas: [day] }); setModalMode('view'); setIsModalOpen(true) }} className={clsx("min-h-[60px] md:min-h-[100px] border rounded-lg transition-all cursor-pointer relative flex flex-col items-center justify-start pt-1 overflow-hidden", dayClass, isToday && "ring-1 ring-white shadow-xl")}>
                            <span className={clsx("text-xs md:text-sm font-bold z-20 leading-none mb-1", isToday ? "text-white" : "text-white/60")}>{format(day, 'd')}</span>
                            {evtsDia.length > 0 && (
                                <div className="flex flex-wrap justify-center gap-1 px-1 w-full z-10">
                                    {evtsDia.slice(0, 8).map((evt, i) => (
                                        <div key={i} className={`w-1.5 h-1.5 rounded-full shadow-sm ${getEventStyle(evt).bg}`} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* MODAL DEL DÍA */}
            {isModalOpen && selectedDate && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsModalOpen(false)}>
                    <div className="w-full h-[95vh] md:h-auto md:max-h-[90vh] md:max-w-3xl bg-[#09090b] md:border border-white/10 md:rounded-2xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>

                        <div className="h-16 flex-shrink-0 border-b border-white/5 bg-[#09090b] flex justify-between items-center px-6 z-20">
                            <div>
                                <p className={`font-bold text-[9px] uppercase tracking-[0.2em] ${modalMode === 'view' ? 'text-[#D4E655]' : 'text-gray-500'}`}>{modalMode === 'view' ? 'Agenda del Día' : 'Nueva Clase'}</p>
                                <h3 className="text-xl font-black uppercase tracking-tighter text-white leading-none">{format(selectedDate, 'EEEE d MMMM', { locale: es })}</h3>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-white hover:bg-red-500/20 hover:text-red-500"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-20">
                            {modalMode === 'view' && (
                                <div className="space-y-4">
                                    {sedeFiltro !== 'todas' && (
                                        <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 p-3 rounded-lg flex items-center justify-between">
                                            <p className="text-[10px] text-[#D4E655] font-black uppercase tracking-widest flex items-center gap-2">
                                                <Building2 size={12} /> Mostrando solo sede {sedes.find(s => s.id === sedeFiltro)?.nombre}
                                            </p>
                                            <button onClick={() => setSedeFiltro('todas')} className="text-[9px] bg-black/40 text-white px-2 py-1 rounded hover:bg-white hover:text-black transition-colors font-bold uppercase">Ver Todas</button>
                                        </div>
                                    )}

                                    {eventosDelDia.length > 0 ? (
                                        eventosDelDia.map((evt) => {
                                            const style = getEventStyle(evt)
                                            return (
                                                <div key={evt.id} className={`flex flex-row bg-[#111] border rounded-xl overflow-hidden group transition-all relative ${style.border} border-l-[6px]`}>
                                                    <div className="relative w-24 md:w-32 flex-shrink-0 bg-white/5 flex flex-col">
                                                        {evt.tipo === 'Clase' && evt.clase_data?.imagen_url ? (<Image src={evt.clase_data.imagen_url} alt={evt.titulo} fill className="object-cover" />) : (<div className="w-full h-full flex flex-col items-center justify-center text-white/10 p-2">{evt.tipo === 'Alquiler' ? <Music size={24} className="opacity-50" /> : <ImageIcon size={24} />}<span className="text-[8px] font-bold uppercase mt-1 opacity-50 text-center">{evt.tipo === 'Alquiler' ? 'Externo' : 'Sin Flyer'}</span></div>)}
                                                        <div className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-sm p-1 text-center border-t border-white/10 z-10"><span className="text-sm font-black text-white leading-none block">{format(new Date(evt.inicio), 'HH:mm')}</span><span className="text-[8px] uppercase font-bold text-gray-400 block">{evt.sala_nombre} ({evt.sala_sede})</span></div>
                                                    </div>
                                                    <div className="flex-1 p-3 flex flex-col justify-center relative">
                                                        <div className="flex justify-between items-start mb-1"><h4 className="text-sm font-bold text-white uppercase leading-tight pr-2">{evt.titulo}</h4><span className={`px-2 py-0.5 rounded text-[8px] uppercase font-bold ${style.bg}/10 ${style.text} border ${style.border}/20`}>{evt.subtitulo}</span></div>
                                                        <div className="text-[10px] text-gray-400 font-medium flex items-center gap-2 mb-2 flex-wrap">
                                                            {evt.tipo === 'Clase' ? (
                                                                <>
                                                                    <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><Briefcase size={10} /> {evt.clase_data?.profesor_nombre || 'Sin asignar'}</span>
                                                                    <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><GraduationCap size={10} /> {evt.clase_data?.nivel}</span>
                                                                    {evt.clase_data?.es_audicion && <span className="flex items-center gap-1 bg-pink-500/10 text-pink-400 border border-pink-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[9px]"><Sparkles size={10} className="text-pink-500" /> Audición</span>}
                                                                    {evt.clase_data?.es_la_liga && <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[9px]"><Star size={10} className="fill-purple-500/50" /> La Liga (Nivel {evt.clase_data.liga_nivel})</span>}
                                                                    {evt.clase_data?.compania_nombre && <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[9px]"><UsersRound size={10} className="text-blue-500" /> {evt.clase_data.compania_nombre}</span>}
                                                                </>
                                                            ) : (<span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><User size={10} /> Cliente Externo</span>)}
                                                        </div>
                                                        <div className="flex items-end justify-between border-t border-white/5 pt-2 mt-auto gap-2">
                                                            {evt.tipo === 'Clase' ? (<><a href={`/clase/${evt.id}`} className="flex-1 bg-[#D4E655] text-black text-[10px] font-black uppercase py-2 rounded hover:bg-white transition-colors text-center shadow-[0_0_10px_rgba(212,230,85,0.2)]">Gestionar / Tomar Lista</a><button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: evt.id, serieId: evt.clase_data?.serie_id || null }) }} className="text-gray-500 hover:text-red-500 p-2 bg-white/5 rounded hover:bg-red-500/10 transition-colors"><Trash2 size={14} /></button></>) : (<div className="flex gap-2 w-full"><div className="flex-1 text-[10px] text-gray-500 italic flex items-center"><Info size={12} className="mr-1" /> Alquiler externo</div><a href="/alquileres" className="px-3 py-2 bg-white/10 text-white rounded text-[10px] font-bold uppercase hover:bg-white/20">Ver Alquileres</a></div>)}
                                                        </div>
                                                    </div>

                                                    {deleteTarget?.id === evt.id && (
                                                        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 text-center animate-in fade-in">
                                                            <AlertCircle className="text-red-500 mb-2" size={32} />
                                                            <h4 className="text-white font-black uppercase mb-1">¿Eliminar Clase?</h4>
                                                            <p className="text-gray-400 text-[10px] mb-4">Esta acción no se puede deshacer.</p>
                                                            <div className="flex gap-2 w-full">
                                                                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 bg-white/10 rounded font-bold text-[10px] uppercase hover:bg-white/20">Cancelar</button>
                                                                <button onClick={() => handleConfirmDelete('single')} className="flex-1 py-2 bg-red-500 text-white rounded font-bold text-[10px] uppercase hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]">Solo esta</button>
                                                                {deleteTarget.serieId && <button onClick={() => handleConfirmDelete('serie')} className="flex-1 py-2 bg-red-900 border border-red-500 text-white rounded font-bold text-[10px] uppercase hover:bg-red-800">Toda la serie</button>}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <div className="py-10 text-center text-gray-600 opacity-50"><p className="text-xs font-bold uppercase">No hay actividades {sedeFiltro !== 'todas' ? 'en esta sede' : 'programadas'}</p></div>
                                    )}
                                    <button onClick={() => setModalMode('create')} className="w-full mt-4 px-6 py-4 font-black text-black transition-all bg-[#D4E655] rounded-xl hover:bg-white uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(212,230,85,0.2)]"><Plus size={16} strokeWidth={3} /> Cargar Clase Nueva</button>
                                </div>
                            )}

                            {modalMode === 'create' && (
                                <form onSubmit={handleCrearClase} className="space-y-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><Info size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Ficha Técnica</h4></div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nombre de la Clase</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold text-sm outline-none focus:border-[#D4E655]" required /></div>

                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-gray-500 uppercase flex justify-between">
                                                    <span>Ritmo / Estilo</span>
                                                    <button type="button" onClick={() => setIsCreatingRitmo(!isCreatingRitmo)} className="text-[#D4E655] hover:text-white transition-colors flex items-center gap-1">
                                                        {isCreatingRitmo ? 'Cancelar' : <><Plus size={10} /> Nuevo</>}
                                                    </button>
                                                </label>

                                                {isCreatingRitmo ? (
                                                    <div className="flex gap-2">
                                                        <input
                                                            value={nuevoRitmoNombre}
                                                            onChange={e => setNuevoRitmoNombre(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    handleCrearRitmo();
                                                                }
                                                            }}
                                                            placeholder="Ej: K-Pop"
                                                            className="flex-1 bg-[#111] border border-[#D4E655] rounded-lg px-3 text-white text-xs font-bold outline-none"
                                                            autoFocus
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleCrearRitmo(e)}
                                                            className="bg-[#D4E655] text-black font-bold px-3 rounded-lg text-xs uppercase hover:bg-white transition-colors"
                                                        >
                                                            Guardar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <select value={form.ritmoId} onChange={e => setForm({ ...form, ritmoId: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs font-bold outline-none focus:border-[#D4E655]">
                                                        <option value="">Seleccionar Ritmo...</option>
                                                        {ritmos.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                                    </select>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:col-span-2">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Tipo</label>
                                                    <select value={form.tipo} onChange={e => {
                                                        const isCompania = e.target.value === 'Compañía';
                                                        setForm({ ...form, tipo: e.target.value, cupoMaximo: isCompania ? 20 : form.cupoMaximo })
                                                    }} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs font-bold outline-none focus:border-[#D4E655]">
                                                        <option value="Regular">Regular (Naranja)</option>
                                                        <option value="Seminario">Especial (Morado)</option>
                                                        <option value="Intensivo">Intensivo (Negro)</option>
                                                        <option value="Formación">Formación (Amarillo)</option>
                                                        <option value="Compañía">Compañías (Azul)</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Nivel</label>
                                                    <select value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs font-bold outline-none focus:border-[#D4E655]">
                                                        <option value="Todos">Todos</option>
                                                        <option value="Principiante">Principiante</option>
                                                        <option value="Principiante/Intermedio">Principiante/Intermedio</option>
                                                        <option value="Intermedio">Intermedio</option>
                                                        <option value="Intermedio/Avanzado">Intermedio/Avanzado</option>
                                                        <option value="Avanzado">Avanzado</option>
                                                    </select>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-[#D4E655] uppercase">Cupo Máx.</label>
                                                    <input
                                                        type={form.esAudicion ? "text" : "number"}
                                                        min="0"
                                                        disabled={form.esAudicion}
                                                        value={form.esAudicion ? "Sin límite" : form.cupoMaximo}
                                                        onChange={e => setForm({ ...form, cupoMaximo: Number(e.target.value) })}
                                                        className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs font-bold outline-none focus:border-[#D4E655] disabled:opacity-50 disabled:text-[#D4E655]"
                                                        placeholder="Ej: 20"
                                                    />
                                                </div>

                                                {form.tipo === 'Compañía' && (
                                                    <div className="md:col-span-3 space-y-2 pt-2 border-t border-white/5 mt-2 bg-blue-500/5 p-3 rounded-xl border-dashed border-blue-500/20 animate-in fade-in">
                                                        <label className="flex items-center gap-1.5 text-[10px] font-black text-blue-400 uppercase tracking-widest">
                                                            <UsersRound size={12} className="text-blue-500" /> Vincular a Grupo
                                                        </label>
                                                        <select required value={form.companiaId} onChange={e => setForm({ ...form, companiaId: e.target.value })} className="w-full bg-[#111] border border-blue-500/30 rounded-lg p-3 text-white text-xs font-bold outline-none focus:border-blue-500">
                                                            <option value="">Seleccionar compañía...</option>
                                                            {companias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                                        </select>
                                                    </div>
                                                )}

                                                <div className="md:col-span-3 space-y-2 pt-2 border-t border-white/5 mt-2 bg-pink-500/5 p-3 rounded-xl border-dashed border-pink-500/20">
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <div className="relative flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={form.esAudicion}
                                                                onChange={e => setForm({ ...form, esAudicion: e.target.checked })}
                                                                className="peer sr-only"
                                                            />
                                                            <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase text-pink-400 flex items-center gap-1">
                                                            <Sparkles size={12} className="text-pink-500" /> Es una Audición (Sin cupo)
                                                        </span>
                                                    </label>
                                                </div>

                                                <div className="md:col-span-3 space-y-2 pt-2 border-t border-white/5 mt-2 bg-purple-500/5 p-3 rounded-xl border-dashed border-purple-500/20">
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <div className="relative flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={form.esLaLiga}
                                                                onChange={e => setForm({ ...form, esLaLiga: e.target.checked })}
                                                                className="peer sr-only"
                                                            />
                                                            <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase text-purple-400 flex items-center gap-1">
                                                            <Star size={12} className="fill-purple-500/50" /> Pertenece a La Liga
                                                        </span>
                                                    </label>

                                                    {form.esLaLiga && (
                                                        <div className="pl-[52px] flex gap-4 mt-2 animate-in fade-in slide-in-from-top-2">
                                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                                <input type="radio" name="ligaNivel" value={1} checked={form.ligaNivel === 1} onChange={() => setForm({ ...form, ligaNivel: 1 })} className="w-4 h-4 accent-purple-500" />
                                                                <span className={`text-xs font-bold uppercase ${form.ligaNivel === 1 ? 'text-white' : 'text-gray-500 group-hover:text-white/80'}`}>Nivel 1</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                                <input type="radio" name="ligaNivel" value={2} checked={form.ligaNivel === 2} onChange={() => setForm({ ...form, ligaNivel: 2 })} className="w-4 h-4 accent-purple-500" />
                                                                <span className={`text-xs font-bold uppercase ${form.ligaNivel === 2 ? 'text-white' : 'text-gray-500 group-hover:text-white/80'}`}>Nivel 2</span>
                                                            </label>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Descripción</label><textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs outline-none focus:border-[#D4E655] resize-none h-16" /></div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><CalendarDays size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Días de la Clase</h4></div>
                                        <div className="bg-[#111] p-1 rounded-xl border border-white/10">
                                            <MultiDatePicker
                                                selectedDates={form.fechas}
                                                onChange={(dates) => setForm({ ...form, fechas: dates })}
                                            />
                                        </div>
                                        <p className="text-[9px] text-gray-500 uppercase font-bold text-center">Seleccioná todos los días donde se dictará esta clase.</p>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><MapPin size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Ubicación & Staff</h4></div>
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                            <div className="md:col-span-7 space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Hora de Inicio</label><input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" required /></div>
                                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Duración (Minutos)</label><input type="number" value={form.duracion} onChange={e => setForm({ ...form, duracion: Number(e.target.value) })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                                </div>
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Ubicación</label><div className="flex gap-2"><select value={form.sedeId} onChange={e => { setForm({ ...form, sedeId: e.target.value, salaId: '' }) }} className="w-full bg-[#111] text-white font-bold px-3 py-3 rounded-lg outline-none border border-white/10 text-xs"><option value="">Sede...</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select><select value={form.salaId} onChange={e => setForm({ ...form, salaId: e.target.value })} className="w-full bg-[#111] text-white font-bold px-3 py-3 rounded-lg outline-none border border-white/10 text-xs disabled:opacity-50" disabled={!form.sedeId}><option value="">Sala...</option>{salasDisponibles.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div></div>
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Docente Titular</label><select value={form.profeId} onChange={e => setForm({ ...form, profeId: e.target.value })} className="w-full bg-[#111] text-white font-bold px-3 py-3 rounded-lg outline-none border border-white/10 text-xs"><option value="">Seleccionar Docente...</option>{profesores.map(p => <option key={p.id} value={p.id}>{p.nombre_completo || p.email}</option>)}</select></div>
                                            </div>
                                            <div className="md:col-span-5 space-y-1 flex flex-col"><label className="text-[9px] font-bold text-gray-500 uppercase">Flyer / Foto</label><label className="flex-1 w-full bg-[#111] border border-white/10 border-dashed rounded-xl cursor-pointer hover:border-[#D4E655] transition-colors relative overflow-hidden group min-h-[160px] flex flex-col items-center justify-center">{formFile ? (<><img src={URL.createObjectURL(formFile)} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity" /><div className="z-10 bg-black/50 px-2 py-1 rounded text-[9px] font-bold uppercase text-white shadow backdrop-blur-sm">Cambiar Imagen</div></>) : (<><div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-500 mb-2 group-hover:text-[#D4E655] group-hover:scale-110 transition-all"><ImageIcon size={24} /></div><span className="text-xs text-gray-400 font-bold uppercase text-center px-4">Arrastrar o Clic aquí</span></>)}<input type="file" className="hidden" accept="image/*" onChange={e => e.target.files && setFormFile(e.target.files[0])} /></label></div>
                                        </div>
                                    </div>

                                    <div className="space-y-3"><div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><DollarSign size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Pago Docente</h4></div><div className="flex bg-[#111] rounded-lg p-1 border border-white/10 mb-2"><button type="button" onClick={() => setForm({ ...form, tipoAcuerdo: 'porcentaje' })} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-all ${form.tipoAcuerdo === 'porcentaje' ? 'bg-[#D4E655] text-black shadow' : 'text-gray-500'}`}>Porcentaje (%)</button><button type="button" onClick={() => setForm({ ...form, tipoAcuerdo: 'fijo' })} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-all ${form.tipoAcuerdo === 'fijo' ? 'bg-[#D4E655] text-black shadow' : 'text-gray-500'}`}>Monto Fijo ($)</button></div><div className="relative"><span className="absolute left-4 top-3.5 text-gray-500 font-bold">{form.tipoAcuerdo === 'porcentaje' ? '%' : '$'}</span><input type="number" value={form.valorAcuerdo} onChange={e => setForm({ ...form, valorAcuerdo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg pl-8 pr-4 py-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div></div>

                                    <div className="pt-4 flex gap-3 pb-10"><button type="button" onClick={() => setModalMode('view')} className="flex-1 py-4 bg-white/5 rounded-xl font-bold text-gray-400 text-xs uppercase hover:bg-white/10">Cancelar</button><button type="submit" disabled={uploading} className="flex-[2] bg-white text-black font-bold uppercase rounded-xl hover:bg-[#D4E655] transition-all shadow-lg text-xs flex justify-center items-center">{uploading ? <Loader2 className="animate-spin mr-2" /> : 'Confirmar Clase'}</button></div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}