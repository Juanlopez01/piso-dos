'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation' // <-- NUEVO IMPORT PARA EL CACHÉ
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameDay, addMonths, subMonths, isSameMonth
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
    ChevronLeft, ChevronRight, X, Plus, MapPin, Trash2, Loader2,
    Info, DollarSign, Image as ImageIcon, Briefcase, GraduationCap,
    Music, User, AlertCircle, CalendarDays
} from 'lucide-react'
import { clsx } from 'clsx'
import Image from 'next/image'
import { Toaster, toast } from 'sonner'
import MultiDatePicker from '@/components/MultiDatePicker'
import { v4 as uuidv4 } from 'uuid'

// --- TIPOS ---
type EventoAgenda = {
    id: string
    tipo: 'Clase' | 'Alquiler'
    titulo: string
    subtitulo: string
    inicio: string
    fin: string
    sala_nombre: string
    sala_sede: string
    clase_data?: {
        profesor_nombre: string
        nivel: string
        imagen_url: string | null
        serie_id: string | null
        tipo_clase: string
        tipo_acuerdo: string
        valor_acuerdo: number
        ritmo_id: string | null
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

export default function CalendarioPage() {
    const supabase = createClient()
    const router = useRouter() // <-- INSTANCIAMOS EL ROUTER

    // Estados
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)

    const [eventos, setEventos] = useState<EventoAgenda[]>([])
    const [sedes, setSedes] = useState<Sede[]>([])
    const [profesores, setProfesores] = useState<Profile[]>([])
    const [ritmos, setRitmos] = useState<Ritmo[]>([])

    // UI
    const [loading, setLoading] = useState(true) // <-- NUEVO ESTADO DE CARGA
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'view' | 'create'>('view')
    const [deleteTarget, setDeleteTarget] = useState<{ id: string, serieId: string | null } | null>(null)
    const [uploading, setUploading] = useState(false)
    const [isCreatingRitmo, setIsCreatingRitmo] = useState(false)
    const [nuevoRitmoNombre, setNuevoRitmoNombre] = useState('')

    // Form
    const [form, setForm] = useState({
        nombre: '', descripcion: '', tipo: 'Regular', nivel: 'Open', ritmoId: '',
        hora: '18:00', duracion: 60, cupoMaximo: 20, sedeId: '', salaId: '', profeId: '',
        tipoAcuerdo: 'porcentaje', valorAcuerdo: '',
        fechas: [] as Date[]
    })
    const [formFile, setFormFile] = useState<File | null>(null)

    useEffect(() => { fetchData() }, [currentDate])

    // --- FETCH BLINDADO CON TRY/CATCH/FINALLY ---
    const fetchData = async () => {
        try {
            setLoading(true)
            const start = startOfWeek(startOfMonth(currentDate))
            const end = endOfWeek(endOfMonth(currentDate))

            const startIso = start.toISOString()
            const endIso = end.toISOString()

            const startDateStr = format(start, 'yyyy-MM-dd')
            const endDateStr = format(end, 'yyyy-MM-dd')

            // Traemos los datos
            const { data: dataClases, error: errClases } = await supabase
                .from('clases')
                .select(`*, sala:salas ( nombre, sede:sedes ( nombre ) ), profesor:profiles ( nombre_completo ), ritmo:ritmos(nombre)`)
                .gte('inicio', startIso)
                .lte('fin', endIso)

            if (errClases) throw errClases

            const { data: dataAlquileres, error: errAlq } = await supabase
                .from('alquileres')
                .select(`*, sala:salas ( nombre, sede:sedes ( nombre ) )`)
                .gte('fecha', startDateStr)
                .lte('fecha', endDateStr)
                .in('estado', ['confirmado', 'pagado'])

            if (errAlq) throw errAlq

            const agenda: EventoAgenda[] = []

            if (dataClases) {
                dataClases.forEach((c: any) => {
                    if (c.estado === 'cancelada') return;
                    agenda.push({
                        id: c.id,
                        tipo: 'Clase',
                        titulo: c.nombre,
                        subtitulo: c.tipo_clase,
                        inicio: c.inicio,
                        fin: c.fin,
                        sala_nombre: c.sala?.nombre,
                        sala_sede: c.sala?.sede?.nombre,
                        clase_data: {
                            profesor_nombre: c.profesor?.nombre_completo,
                            nivel: c.nivel,
                            imagen_url: c.imagen_url,
                            serie_id: c.serie_id,
                            tipo_clase: c.tipo_clase,
                            tipo_acuerdo: c.tipo_acuerdo,
                            valor_acuerdo: c.valor_acuerdo,
                            ritmo_id: c.ritmo_id
                        }
                    })
                })
            }

            if (dataAlquileres) {
                dataAlquileres.forEach((a: any) => {
                    const [year, month, day] = a.fecha.split('-').map(Number);
                    const [hInicio, mInicio] = a.hora_inicio.split(':').map(Number);
                    const [hFin, mFin] = a.hora_fin.split(':').map(Number);

                    const startObj = new Date(year, month - 1, day, hInicio, mInicio);
                    const endObj = new Date(year, month - 1, day, hFin, mFin);

                    agenda.push({
                        id: a.id,
                        tipo: 'Alquiler',
                        titulo: a.cliente_nombre || 'Cliente Externo',
                        subtitulo: `Alquiler (${a.tipo_uso})`,
                        inicio: startObj.toISOString(),
                        fin: endObj.toISOString(),
                        sala_nombre: a.sala?.nombre,
                        sala_sede: a.sala?.sede?.nombre,
                        alquiler_data: {
                            telefono: a.cliente_contacto,
                            monto: a.monto_total,
                            estado: a.estado
                        }
                    })
                })
            }

            agenda.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
            setEventos(agenda)

            const { data: dataSedes } = await supabase.from('sedes').select('id, nombre, salas(id, nombre)')
            const { data: dataProfes } = await supabase.from('profiles').select('id, nombre_completo, email').eq('rol', 'profesor')
            const { data: dataRitmos } = await supabase.from('ritmos').select('id, nombre').order('nombre')

            if (dataSedes) setSedes(dataSedes)
            if (dataProfes) setProfesores(dataProfes)
            if (dataRitmos) setRitmos(dataRitmos)

        } catch (error) {
            console.error("Error al cargar el calendario:", error)
            toast.error("Error al cargar la agenda. Refrescá la página.")
        } finally {
            setLoading(false) // <-- ESTO NOS SALVA DE LOS LOADERS INFINITOS
        }
    }

    // --- MANEJO DE RITMOS ---
    const handleCrearRitmo = async (e?: any) => {
        if (e) e.preventDefault()
        const nombreLimpio = nuevoRitmoNombre.trim()
        if (!nombreLimpio) return

        try {
            const { data, error } = await supabase
                .from('ritmos')
                .insert([{ nombre: nombreLimpio }])
                .select()
                .single()

            if (error) {
                if (error.code === '23505') {
                    toast.error('Ese ritmo ya existe en la lista')
                } else {
                    toast.error(`Error: ${error.message}`)
                }
                return
            }

            if (data) {
                toast.success(`Ritmo ${data.nombre} creado`)
                setRitmos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
                setForm({ ...form, ritmoId: data.id })
                setIsCreatingRitmo(false)
                setNuevoRitmoNombre('')
            }
        } catch (err) {
            console.error("Error inesperado:", err)
        }
    }

    const checkConflictos = async (salaId: string, inicio: Date, fin: Date) => {
        const inicioIso = inicio.toISOString()
        const finIso = fin.toISOString()
        const fechaStr = format(inicio, 'yyyy-MM-dd')
        const hInicio = format(inicio, 'HH:mm')
        const hFin = format(fin, 'HH:mm')

        const { data: conflictoClase } = await supabase
            .from('clases')
            .select('id, nombre')
            .eq('sala_id', salaId)
            .neq('estado', 'cancelada')
            .lt('inicio', finIso)
            .gt('fin', inicioIso)
            .maybeSingle()

        if (conflictoClase) return `Clase: ${conflictoClase.nombre}`

        const { data: conflictoAlquiler } = await supabase
            .from('alquileres')
            .select('id, cliente_nombre')
            .eq('sala_id', salaId)
            .eq('fecha', fechaStr)
            .in('estado', ['confirmado', 'pagado', 'pendiente'])
            .lt('hora_inicio', hFin)
            .gt('hora_fin', hInicio)
            .maybeSingle()

        if (conflictoAlquiler) return `Alquiler: ${conflictoAlquiler.cliente_nombre}`

        return null
    }

    const handleCrearClase = async (e: React.FormEvent) => {
        e.preventDefault()
        if (form.fechas.length === 0) return toast.error('Debe seleccionar al menos una fecha')
        if (!form.salaId || !form.profeId) return toast.error('Faltan datos (Sala o Profe)')

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
            const clasesAInsertar = []

            for (const fecha of form.fechas) {
                const baseDate = new Date(fecha)
                baseDate.setHours(parseInt(horas), parseInt(minutos), 0, 0)
                const endDateTime = new Date(baseDate.getTime() + form.duracion * 60000)

                const conflicto = await checkConflictos(form.salaId, baseDate, endDateTime)
                if (conflicto) throw new Error(`Conflicto el ${format(baseDate, 'dd/MM')}: ${conflicto}`)

                clasesAInsertar.push({
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
                    cupo_maximo: Number(form.cupoMaximo) || 0,
                    serie_id: serieUUID,
                    estado: 'activa'
                })
            }

            const { error } = await supabase.from('clases').insert(clasesAInsertar)
            if (error) throw new Error('Error al guardar en la base de datos.')

            if (form.ritmoId) {
                const ritmoNombre = ritmos.find(r => r.id === form.ritmoId)?.nombre || 'Nuevo Ritmo'
                const { data: interesados } = await supabase
                    .from('profiles')
                    .select('id')
                    .contains('intereses_ritmos', [form.ritmoId])

                if (interesados && interesados.length > 0) {
                    const primerDia = format(new Date(form.fechas[0]), "EEEE d 'de' MMMM", { locale: es })
                    const notificaciones = interesados.map(user => ({
                        usuario_id: user.id,
                        titulo: '¡Nueva clase disponible! 🎉',
                        mensaje: `Se abrió una nueva clase de ${ritmoNombre} el ${primerDia}. ¡Reservá tu lugar antes de que se llene!`,
                        leido: false,
                        link: '/explorar'
                    }))
                    await supabase.from('notificaciones').insert(notificaciones)
                }
            }

            toast.success(`${clasesAInsertar.length} clase(s) creada(s) correctamente`)

            await fetchData()
            setModalMode('view')
            resetForm()

            router.refresh() // <-- OBLIGAMOS A NEXT.JS A BORRAR EL CACHÉ DESPUÉS DE CREAR

        } catch (error: any) {
            toast.error(error.message, { duration: 6000, icon: <AlertCircle /> })
        } finally {
            setUploading(false)
        }
    }

    const resetForm = () => {
        setForm({
            nombre: '', descripcion: '', tipo: 'Regular', nivel: 'Open', ritmoId: '',
            hora: '18:00', duracion: 60, cupoMaximo: 20, sedeId: '', salaId: '', profeId: '',
            tipoAcuerdo: 'porcentaje', valorAcuerdo: '', fechas: selectedDate ? [selectedDate] : []
        })
        setFormFile(null)
    }

    const handleConfirmDelete = async (option: 'single' | 'serie') => {
        if (!deleteTarget) return
        if (option === 'single') await supabase.from('clases').delete().eq('id', deleteTarget.id)
        else await supabase.from('clases').delete().eq('serie_id', deleteTarget.serieId)

        toast.success('Eliminado')
        setDeleteTarget(null)

        await fetchData()
        router.refresh() // <-- OBLIGAMOS A NEXT.JS A BORRAR EL CACHÉ DESPUÉS DE ELIMINAR
    }

    const getEventStyle = (evt: EventoAgenda) => {
        if (evt.tipo === 'Alquiler') return { border: 'border-white', text: 'text-white', bg: 'bg-white', glow: 'shadow-white/20' }
        switch (evt.subtitulo) {
            case 'Regular': return { border: 'border-orange-500', text: 'text-orange-500', bg: 'bg-orange-500', glow: 'shadow-orange-500/20' }
            case 'Intensivo': return { border: 'border-gray-500', text: 'text-gray-400', bg: 'bg-black', glow: 'shadow-gray-500/20' }
            case 'Formación': return { border: 'border-yellow-400', text: 'text-yellow-400', bg: 'bg-yellow-400', glow: 'shadow-yellow-400/20' }
            case 'Compañía': return { border: 'border-blue-500', text: 'text-blue-500', bg: 'bg-blue-500', glow: 'shadow-blue-500/20' }
            default: return { border: 'border-[#D4E655]', text: 'text-[#D4E655]', bg: 'bg-[#D4E655]', glow: 'shadow-[#D4E655]/20' }
        }
    }

    const eventosDelDia = selectedDate ? eventos.filter(e => isSameDay(new Date(e.inicio), selectedDate)) : []
    const salasDisponibles = sedes.find(s => s.id === form.sedeId)?.salas || []

    return (
        <div className="h-full flex flex-col pb-24 md:pb-10 px-2 pt-2">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER CALENDARIO */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                            {format(currentDate, 'MMMM', { locale: es })}
                            {loading && <Loader2 size={20} className="animate-spin text-[#D4E655]" />}
                        </h2>
                        <p className="text-[#D4E655] font-bold text-xs tracking-widest uppercase">{format(currentDate, 'yyyy', { locale: es })} • Agenda Completa</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 bg-black border border-white/10 hover:border-[#D4E655] hover:text-[#D4E655] transition-all rounded-full"><ChevronLeft size={18} /></button>
                    <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 bg-black border border-white/10 hover:border-[#D4E655] hover:text-[#D4E655] transition-all rounded-full"><ChevronRight size={18} /></button>
                </div>
            </div>
            <div className="grid grid-cols-7 mb-2">{['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map(d => <div key={d} className="text-center text-gray-500 text-[9px] font-black uppercase tracking-wider">{d}</div>)}</div>

            {/* GRILLA MES */}
            <div className="grid grid-cols-7 gap-1 auto-rows-fr h-full overflow-y-auto">
                {eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) }).map((day) => {
                    const isToday = isSameDay(day, new Date())
                    const isCurrentMonth = isSameMonth(day, currentDate)
                    const evtsDia = eventos.filter(e => isSameDay(new Date(e.inicio), day))

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
                                    {eventosDelDia.length > 0 ? (
                                        eventosDelDia.map((evt) => {
                                            const style = getEventStyle(evt)
                                            return (
                                                <div key={evt.id} className={`flex flex-row bg-[#111] border rounded-xl overflow-hidden group transition-all relative ${style.border} border-l-[6px]`}>
                                                    <div className="relative w-24 md:w-32 flex-shrink-0 bg-white/5 flex flex-col">
                                                        {evt.tipo === 'Clase' && evt.clase_data?.imagen_url ? (<Image src={evt.clase_data.imagen_url} alt={evt.titulo} fill className="object-cover" />) : (<div className="w-full h-full flex flex-col items-center justify-center text-white/10 p-2">{evt.tipo === 'Alquiler' ? <Music size={24} className="opacity-50" /> : <ImageIcon size={24} />}<span className="text-[8px] font-bold uppercase mt-1 opacity-50 text-center">{evt.tipo === 'Alquiler' ? 'Externo' : 'Sin Flyer'}</span></div>)}
                                                        <div className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-sm p-1 text-center border-t border-white/10 z-10"><span className="text-sm font-black text-white leading-none block">{format(new Date(evt.inicio), 'HH:mm')}</span><span className="text-[8px] uppercase font-bold text-gray-400 block">{evt.sala_nombre}</span></div>
                                                    </div>
                                                    <div className="flex-1 p-3 flex flex-col justify-center relative">
                                                        <div className="flex justify-between items-start mb-1"><h4 className="text-sm font-bold text-white uppercase leading-tight pr-2">{evt.titulo}</h4><span className={`px-2 py-0.5 rounded text-[8px] uppercase font-bold ${style.bg}/10 ${style.text} border ${style.border}/20`}>{evt.subtitulo}</span></div>
                                                        <div className="text-[10px] text-gray-400 font-medium flex items-center gap-2 mb-2 flex-wrap">{evt.tipo === 'Clase' ? (<><span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><Briefcase size={10} /> {evt.clase_data?.profesor_nombre || 'Sin asignar'}</span><span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><GraduationCap size={10} /> {evt.clase_data?.nivel}</span></>) : (<span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><User size={10} /> Cliente Externo</span>)}</div>
                                                        <div className="flex items-end justify-between border-t border-white/5 pt-2 mt-auto gap-2">
                                                            {evt.tipo === 'Clase' ? (<><a href={`/clase/${evt.id}`} className="flex-1 bg-[#D4E655] text-black text-[10px] font-black uppercase py-2 rounded hover:bg-white transition-colors text-center shadow-[0_0_10px_rgba(212,230,85,0.2)]">Gestionar / Tomar Lista</a><button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: evt.id, serieId: evt.clase_data?.serie_id || null }) }} className="text-gray-500 hover:text-red-500 p-2 bg-white/5 rounded hover:bg-red-500/10 transition-colors"><Trash2 size={14} /></button></>) : (<div className="flex gap-2 w-full"><div className="flex-1 text-[10px] text-gray-500 italic flex items-center"><Info size={12} className="mr-1" /> Alquiler externo</div><a href="/alquileres" className="px-3 py-2 bg-white/10 text-white rounded text-[10px] font-bold uppercase hover:bg-white/20">Ver Alquileres</a></div>)}
                                                        </div>
                                                    </div>

                                                    {/* CONFIRMACIÓN DE BORRADO DE CLASE */}
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
                                        <div className="py-10 text-center text-gray-600 opacity-50"><p className="text-xs font-bold uppercase">No hay actividades programadas</p></div>
                                    )}
                                    <button onClick={() => setModalMode('create')} className="w-full mt-4 px-6 py-4 font-black text-black transition-all bg-[#D4E655] rounded-xl hover:bg-white uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(212,230,85,0.2)]"><Plus size={16} strokeWidth={3} /> Cargar Clase Nueva</button>
                                </div>
                            )}

                            {/* MODO CREAR (FORMULARIO) */}
                            {modalMode === 'create' && (
                                // El formulario queda idéntico, ya que la lógica fuerte la cambiamos en handleCrearClase
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
                                                        <option value="Intensivo">Intensivo (Negro)</option>
                                                        <option value="Formación">Formación (Amarillo)</option>
                                                        <option value="Compañía">Compañías (Azul)</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Nivel</label>
                                                    <select value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs font-bold outline-none focus:border-[#D4E655]">
                                                        <option value="Open">Open</option>
                                                        <option value="Principiante">Principiante</option>
                                                        <option value="Intermedio">Intermedio</option>
                                                        <option value="Avanzado">Avanzado</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-[#D4E655] uppercase">Cupo Máx.</label>
                                                    <input type="number" min="0" value={form.cupoMaximo} onChange={e => setForm({ ...form, cupoMaximo: Number(e.target.value) })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs font-bold outline-none focus:border-[#D4E655]" placeholder="Ej: 20" />
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