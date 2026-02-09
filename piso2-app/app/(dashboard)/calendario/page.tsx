'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameDay, addMonths, subMonths, isBefore, endOfYear, addWeeks,
    isSameMonth
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
    ChevronLeft, ChevronRight, X, Plus, MapPin, Trash2, Loader2,
    Info, DollarSign, Image as ImageIcon, Briefcase, GraduationCap,
    Music, User, AlertCircle
} from 'lucide-react'
import { clsx } from 'clsx'
import Image from 'next/image'
import { Toaster, toast } from 'sonner'

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

    // Datos específicos Clase
    clase_data?: {
        profesor_nombre: string
        nivel: string
        imagen_url: string | null
        serie_id: string | null
        tipo_clase: string
        tipo_acuerdo: string
        valor_acuerdo: number
    }

    // Datos específicos Alquiler
    alquiler_data?: {
        telefono: string
        monto: number
        estado: string
    }
}

type Sede = { id: string; nombre: string; salas: { id: string; nombre: string }[] }
type Profile = { id: string; nombre_completo: string | null; email: string }

export default function CalendarioPage() {
    const supabase = createClient()

    // Estados
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)

    const [eventos, setEventos] = useState<EventoAgenda[]>([])
    const [sedes, setSedes] = useState<Sede[]>([])
    const [profesores, setProfesores] = useState<Profile[]>([])

    // UI
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'view' | 'create'>('view')
    const [deleteTarget, setDeleteTarget] = useState<{ id: string, serieId: string | null } | null>(null)
    const [uploading, setUploading] = useState(false)

    // Form
    const [form, setForm] = useState({
        nombre: '', descripcion: '', tipo: 'Regular', nivel: 'Open',
        hora: '18:00', duracion: 60, sedeId: '', salaId: '', profeId: '',
        tipoAcuerdo: 'porcentaje', valorAcuerdo: '', repetirAnio: false
    })
    const [formFile, setFormFile] = useState<File | null>(null)

    useEffect(() => { fetchData() }, [currentDate])

    const fetchData = async () => {
        const start = startOfWeek(startOfMonth(currentDate)).toISOString()
        const end = endOfWeek(endOfMonth(currentDate)).toISOString()

        // 1. TRAER CLASES
        const { data: dataClases } = await supabase
            .from('clases')
            .select(`*, sala:salas ( nombre, sede:sedes ( nombre ) ), profesor:profiles ( nombre_completo )`)
            .gte('inicio', start)
            .lte('fin', end)

        // 2. TRAER ALQUILERES
        const { data: dataAlquileres } = await supabase
            .from('alquileres')
            .select(`*, sala:salas ( nombre, sede:sedes ( nombre ) )`)
            .gte('fecha_inicio', start)
            .lte('fecha_fin', end)
            .in('estado', ['confirmado', 'pagado'])

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
                        valor_acuerdo: c.valor_acuerdo
                    }
                })
            })
        }

        if (dataAlquileres) {
            dataAlquileres.forEach((a: any) => {
                agenda.push({
                    id: a.id,
                    tipo: 'Alquiler',
                    titulo: a.cliente_nombre || 'Cliente',
                    subtitulo: `Alquiler (${a.tipo_uso})`,
                    inicio: a.fecha_inicio,
                    fin: a.fecha_fin,
                    sala_nombre: a.sala?.nombre,
                    sala_sede: a.sala?.sede?.nombre,
                    alquiler_data: {
                        telefono: a.cliente_telefono,
                        monto: a.monto_total,
                        estado: a.estado
                    }
                })
            })
        }

        agenda.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
        setEventos(agenda)

        // Datos Aux
        const { data: dataSedes } = await supabase.from('sedes').select('id, nombre, salas(id, nombre)')
        const { data: dataProfes } = await supabase.from('profiles').select('id, nombre_completo, email').eq('rol', 'profesor')
        if (dataSedes) setSedes(dataSedes)
        if (dataProfes) setProfesores(dataProfes)
    }

    // --- NUEVA FUNCIÓN: VERIFICAR DISPONIBILIDAD ---
    const checkConflictos = async (salaId: string, inicio: Date, fin: Date) => {
        const inicioIso = inicio.toISOString()
        const finIso = fin.toISOString()

        // 1. Chequear vs OTRAS CLASES
        const { data: conflictoClase } = await supabase
            .from('clases')
            .select('id, nombre')
            .eq('sala_id', salaId)
            .neq('estado', 'cancelada') // Ignoramos las canceladas
            .lt('inicio', finIso) // Empieza antes de que termine la nueva
            .gt('fin', inicioIso) // Termina después de que empiece la nueva
            .maybeSingle()

        if (conflictoClase) return `Clase existente: ${conflictoClase.nombre}`

        // 2. Chequear vs ALQUILERES
        const { data: conflictoAlquiler } = await supabase
            .from('alquileres')
            .select('id, cliente_nombre')
            .eq('sala_id', salaId)
            .in('estado', ['confirmado', 'pagado']) // Solo los firmes bloquean agenda
            .lt('fecha_inicio', finIso)
            .gt('fecha_fin', inicioIso)
            .maybeSingle()

        if (conflictoAlquiler) return `Alquiler existente: ${conflictoAlquiler.cliente_nombre}`

        return null // Todo limpio
    }

    const handleCrearClase = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedDate || !form.salaId || !form.profeId) return
        setUploading(true)
        try {
            const [horas, minutos] = form.hora.split(':')
            const baseDate = new Date(selectedDate)
            baseDate.setHours(parseInt(horas), parseInt(minutos), 0, 0)

            // Subir Imagen (Solo si hay)
            let publicUrl = null
            if (formFile) {
                const fileExt = formFile.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`
                const { error } = await supabase.storage.from('clases').upload(fileName, formFile)
                if (!error) publicUrl = supabase.storage.from('clases').getPublicUrl(fileName).data.publicUrl
            }

            const serieUUID = form.repetirAnio ? crypto.randomUUID() : null;
            const clasesAInsertar = []
            let pointerDate = baseDate
            const limitDate = form.repetirAnio ? endOfYear(new Date()) : baseDate

            // --- BUCLE DE GENERACIÓN CON CHEQUEO ---
            while (isBefore(pointerDate, limitDate) || pointerDate.getTime() === limitDate.getTime()) {
                const endDateTime = new Date(pointerDate.getTime() + form.duracion * 60000)

                // 🛑 EL POLICÍA DE TRÁNSITO: Chequeamos antes de agregar
                const conflicto = await checkConflictos(form.salaId, pointerDate, endDateTime)

                if (conflicto) {
                    // Si encontramos un conflicto, frenamos todo y avisamos
                    throw new Error(`Conflicto el ${format(pointerDate, 'dd/MM')}: ${conflicto}`)
                }

                clasesAInsertar.push({
                    nombre: form.nombre, descripcion: form.descripcion, tipo_clase: form.tipo, nivel: form.nivel,
                    inicio: pointerDate.toISOString(), fin: endDateTime.toISOString(),
                    sala_id: form.salaId, profesor_id: form.profeId,
                    tipo_acuerdo: form.tipoAcuerdo, valor_acuerdo: Number(form.valorAcuerdo),
                    imagen_url: publicUrl, cupo_maximo: 20, serie_id: serieUUID, estado: 'activa'
                })
                if (!form.repetirAnio) break;
                pointerDate = addWeeks(pointerDate, 1)
            }

            const { error } = await supabase.from('clases').insert(clasesAInsertar)
            if (error) throw error
            toast.success('Clase creada correctamente'); await fetchData(); setModalMode('view'); resetForm()
        } catch (error: any) {
            toast.error(error.message, { duration: 5000, icon: <AlertCircle /> })
        } finally {
            setUploading(false)
        }
    }

    // ... Resto de funciones (resetForm, handleConfirmDelete, styles, etc) igual que antes ...
    const resetForm = () => {
        setForm({ nombre: '', descripcion: '', tipo: 'Regular', nivel: 'Open', hora: '18:00', duracion: 60, sedeId: '', salaId: '', profeId: '', tipoAcuerdo: 'porcentaje', valorAcuerdo: '', repetirAnio: false })
        setFormFile(null)
    }

    const handleConfirmDelete = async (option: 'single' | 'serie') => {
        if (!deleteTarget) return
        if (option === 'single') await supabase.from('clases').delete().eq('id', deleteTarget.id)
        else await supabase.from('clases').delete().eq('serie_id', deleteTarget.serieId)
        toast.success('Eliminado'); setDeleteTarget(null); fetchData()
    }

    const getEventStyle = (evt: EventoAgenda) => {
        if (evt.tipo === 'Alquiler') return { border: 'border-white', text: 'text-white', bg: 'bg-white', glow: 'shadow-white/20' }
        switch (evt.subtitulo) {
            case 'Especial': return { border: 'border-orange-500', text: 'text-orange-500', bg: 'bg-orange-500', glow: 'shadow-orange-500/20' }
            case 'Formación': return { border: 'border-blue-400', text: 'text-blue-400', bg: 'bg-blue-400', glow: 'shadow-blue-400/20' }
            case 'Compañía': return { border: 'border-purple-500', text: 'text-purple-500', bg: 'bg-purple-500', glow: 'shadow-purple-500/20' }
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
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{format(currentDate, 'MMMM', { locale: es })}</h2>
                    <p className="text-[#D4E655] font-bold text-xs tracking-widest uppercase">{format(currentDate, 'yyyy', { locale: es })} • Agenda Completa</p>
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
                        <div key={day.toString()} onClick={() => { setSelectedDate(day); setModalMode('view'); setIsModalOpen(true) }} className={clsx("min-h-[60px] md:min-h-[100px] border rounded-lg transition-all cursor-pointer relative flex flex-col items-center justify-start pt-1 overflow-hidden", dayClass, isToday && "ring-1 ring-white shadow-xl")}>
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

                        <div className="flex-1 overflow-y-auto bg-black/50 p-6 pb-20">
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
                                <form onSubmit={handleCrearClase} className="space-y-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><Info size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Ficha Técnica</h4></div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold text-sm outline-none focus:border-[#D4E655]" required /></div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Tipo</label><select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs font-bold outline-none focus:border-[#D4E655]"><option value="Regular">Regular</option><option value="Especial">Especial</option><option value="Compañía">Compañía</option><option value="Formación">Formación</option></select></div>
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nivel</label><select value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs font-bold outline-none focus:border-[#D4E655]"><option value="Open">Open</option><option value="Principiante">Principiante</option><option value="Intermedio">Intermedio</option><option value="Avanzado">Avanzado</option></select></div>
                                            </div>
                                        </div>
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Descripción</label><textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs outline-none focus:border-[#D4E655] resize-none h-16" /></div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><MapPin size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Agenda & Staff</h4></div>
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                            <div className="md:col-span-7 space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Hora</label><input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" required /></div>
                                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Minutos</label><input type="number" value={form.duracion} onChange={e => setForm({ ...form, duracion: Number(e.target.value) })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                                </div>
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Ubicación</label><div className="flex gap-2"><select value={form.sedeId} onChange={e => { setForm({ ...form, sedeId: e.target.value, salaId: '' }) }} className="w-full bg-[#111] text-white font-bold px-3 py-3 rounded-lg outline-none border border-white/10 text-xs"><option value="">Sede...</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select><select value={form.salaId} onChange={e => setForm({ ...form, salaId: e.target.value })} className="w-full bg-[#111] text-white font-bold px-3 py-3 rounded-lg outline-none border border-white/10 text-xs disabled:opacity-50" disabled={!form.sedeId}><option value="">Sala...</option>{salasDisponibles.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div></div>
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Docente</label><select value={form.profeId} onChange={e => setForm({ ...form, profeId: e.target.value })} className="w-full bg-[#111] text-white font-bold px-3 py-3 rounded-lg outline-none border border-white/10 text-xs"><option value="">Seleccionar Docente...</option>{profesores.map(p => <option key={p.id} value={p.id}>{p.nombre_completo || p.email}</option>)}</select></div>
                                            </div>
                                            <div className="md:col-span-5 space-y-1 flex flex-col"><label className="text-[9px] font-bold text-gray-500 uppercase">Flyer / Foto</label><label className="flex-1 w-full bg-[#111] border border-white/10 border-dashed rounded-xl cursor-pointer hover:border-[#D4E655] transition-colors relative overflow-hidden group min-h-[160px] flex flex-col items-center justify-center">{formFile ? (<><img src={URL.createObjectURL(formFile)} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity" /><div className="z-10 bg-black/50 px-2 py-1 rounded text-[9px] font-bold uppercase text-white shadow backdrop-blur-sm">Cambiar Imagen</div></>) : (<><div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-500 mb-2 group-hover:text-[#D4E655] group-hover:scale-110 transition-all"><ImageIcon size={24} /></div><span className="text-xs text-gray-400 font-bold uppercase text-center px-4">Arrastrar o Clic aquí</span></>)}<input type="file" className="hidden" accept="image/*" onChange={e => e.target.files && setFormFile(e.target.files[0])} /></label></div>
                                        </div>
                                    </div>

                                    <div className="space-y-3"><div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><DollarSign size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Pago Docente</h4></div><div className="flex bg-[#111] rounded-lg p-1 border border-white/10 mb-2"><button type="button" onClick={() => setForm({ ...form, tipoAcuerdo: 'porcentaje' })} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-all ${form.tipoAcuerdo === 'porcentaje' ? 'bg-[#D4E655] text-black shadow' : 'text-gray-500'}`}>Porcentaje (%)</button><button type="button" onClick={() => setForm({ ...form, tipoAcuerdo: 'fijo' })} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-all ${form.tipoAcuerdo === 'fijo' ? 'bg-[#D4E655] text-black shadow' : 'text-gray-500'}`}>Monto Fijo ($)</button></div><div className="relative"><span className="absolute left-4 top-3.5 text-gray-500 font-bold">{form.tipoAcuerdo === 'porcentaje' ? '%' : '$'}</span><input type="number" value={form.valorAcuerdo} onChange={e => setForm({ ...form, valorAcuerdo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg pl-8 pr-4 py-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div></div>
                                    <div className="flex items-center gap-3 bg-[#111] p-3 rounded-xl border border-white/10 cursor-pointer" onClick={() => setForm({ ...form, repetirAnio: !form.repetirAnio })}><div className={`w-8 h-5 rounded-full flex items-center p-0.5 transition-colors ${form.repetirAnio ? 'bg-[#D4E655]' : 'bg-gray-600'}`}><div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${form.repetirAnio ? 'translate-x-3' : 'translate-x-0'}`}></div></div><div className="flex-1"><p className="text-white font-bold text-xs">Repetir todas las semanas</p></div></div>
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