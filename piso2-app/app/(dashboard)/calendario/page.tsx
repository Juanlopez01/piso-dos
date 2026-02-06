'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
    addWeeks, endOfYear, isBefore
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
    ChevronLeft, ChevronRight, X, Plus, ArrowLeft, Image as ImageIcon,
    UploadCloud, MapPin, User, Clock, Instagram, Repeat, Trash2, Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import Image from 'next/image'
import { Toaster, toast } from 'sonner'

// --- TIPOS ---
type Sede = { id: string; nombre: string; salas: { id: string; nombre: string }[] }
type Profile = { id: string; nombre_completo: string | null; email: string }
type Clase = {
    id: string
    nombre: string
    inicio: string
    fin: string
    imagen_url: string | null
    sala_id: string
    serie_id: string | null
    sala: { nombre: string; sede: { nombre: string } } | null
    profesor: { nombre_completo: string } | null
}

export default function CalendarioPage() {
    const supabase = createClient()

    // Estados
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [clases, setClases] = useState<Clase[]>([])
    const [sedes, setSedes] = useState<Sede[]>([])
    const [profesores, setProfesores] = useState<Profile[]>([])
    const [loading, setLoading] = useState(true)

    // UI
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'view' | 'create'>('view')
    const [deleteTarget, setDeleteTarget] = useState<{ id: string, serieId: string | null } | null>(null)

    // Form
    const [formNombre, setFormNombre] = useState('')
    const [formHora, setFormHora] = useState('18:00')
    const [formDuracion, setFormDuracion] = useState(60)
    const [formSedeId, setFormSedeId] = useState('')
    const [formSalaId, setFormSalaId] = useState('')
    const [formProfeId, setFormProfeId] = useState('')
    const [formFile, setFormFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [repetirHastaFinAnio, setRepetirHastaFinAnio] = useState(false)

    useEffect(() => { fetchData() }, [currentDate])

    const fetchData = async () => {
        setLoading(true)
        const start = startOfWeek(startOfMonth(currentDate))
        const end = endOfWeek(endOfMonth(currentDate))

        const { data: dataClases } = await supabase
            .from('clases')
            .select(`
          id, nombre, inicio, fin, imagen_url, sala_id, serie_id,
          sala:salas ( nombre, sede:sedes ( nombre ) ),
          profesor:profiles ( nombre_completo )
        `)
            .gte('inicio', start.toISOString())
            .lte('fin', end.toISOString())
            .order('inicio', { ascending: true })

        const { data: dataSedes } = await supabase.from('sedes').select('id, nombre, salas(id, nombre)')
        const { data: dataProfes } = await supabase.from('profiles').select('id, nombre_completo, email').eq('rol', 'profesor')

        if (dataClases) setClases(dataClases as any)
        if (dataSedes) setSedes(dataSedes)
        if (dataProfes) setProfesores(dataProfes)
        setLoading(false)
    }

    const handleDayClick = (day: Date) => {
        setSelectedDate(day)
        setModalMode('view')
        setIsModalOpen(true)
    }

    const handleCrearClase = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedDate || !formSalaId || !formProfeId) return
        setUploading(true)

        try {
            const [horas, minutos] = formHora.split(':')
            const baseDate = new Date(selectedDate)
            baseDate.setHours(parseInt(horas), parseInt(minutos), 0, 0)

            // Subir imagen
            let publicUrl = null
            if (formFile) {
                const fileExt = formFile.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`
                const { error } = await supabase.storage.from('clases').upload(fileName, formFile)
                if (error) throw new Error('Error al subir imagen')
                publicUrl = supabase.storage.from('clases').getPublicUrl(fileName).data.publicUrl
            }

            const serieUUID = repetirHastaFinAnio ? crypto.randomUUID() : null;
            const clasesAInsertar = []
            let pointerDate = baseDate
            const limitDate = repetirHastaFinAnio ? endOfYear(new Date()) : baseDate

            while (isBefore(pointerDate, limitDate) || pointerDate.getTime() === limitDate.getTime()) {
                const endDateTime = new Date(pointerDate.getTime() + formDuracion * 60000)
                clasesAInsertar.push({
                    nombre: formNombre,
                    sala_id: formSalaId,
                    profesor_id: formProfeId,
                    inicio: pointerDate.toISOString(),
                    fin: endDateTime.toISOString(),
                    imagen_url: publicUrl,
                    cupo_maximo: 20,
                    serie_id: serieUUID
                })
                if (!repetirHastaFinAnio) break;
                pointerDate = addWeeks(pointerDate, 1)
            }

            const { error } = await supabase.from('clases').insert(clasesAInsertar)
            if (error) throw error

            toast.success('Evento creado correctamente')
            await fetchData()
            setFormNombre('')
            setFormFile(null)
            setRepetirHastaFinAnio(false)
            setModalMode('view')

        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setUploading(false)
        }
    }

    const handleConfirmDelete = async (option: 'single' | 'serie') => {
        if (!deleteTarget) return
        if (option === 'single') {
            const { error } = await supabase.from('clases').delete().eq('id', deleteTarget.id)
            if (error) toast.error(error.message); else toast.success('Clase eliminada')
        } else {
            const { error } = await supabase.from('clases').delete().eq('serie_id', deleteTarget.serieId)
            if (error) toast.error(error.message); else toast.success('Serie eliminada')
        }
        setDeleteTarget(null)
        fetchData()
    }

    // Estilos Helpers
    const getBorderColorByTitle = (title: string) => {
        const lower = title.toLowerCase().trim()
        if (lower.includes('clase')) return "border-l-piso2-lime"
        if (lower.includes('seminario')) return "border-l-piso2-orange"
        return "border-l-piso2-blue"
    }
    const getColorByTitle = (title: string) => {
        const lower = title.toLowerCase().trim()
        if (lower.includes('clase')) return "bg-piso2-lime" // Verde
        if (lower.includes('seminario')) return "bg-piso2-orange" // Naranja
        return "bg-piso2-blue" // Azul (Default)
    }
    const getSedeBadgeStyle = (nombreSede: string | undefined) => {
        const nombre = nombreSede?.toLowerCase() || '';
        if (nombre.includes('centro') || nombre.includes('congreso')) return 'bg-piso2-lime text-black border-transparent font-bold';
        if (nombre.includes('norte') || nombre.includes('obelisco')) return 'bg-cyan-400 text-black border-transparent font-bold shadow-[0_0_10px_rgba(34,211,238,0.3)]';
        return 'bg-white/10 text-white border-white/5';
    }

    const clasesDelDia = selectedDate
        ? clases.filter(c => isSameDay(new Date(c.inicio), selectedDate)).sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
        : []
    const salasDisponibles = sedes.find(s => s.id === formSedeId)?.salas || []

    return (
        <div className="h-full flex flex-col pb-24 md:pb-10">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER MES */}
            <div className="flex justify-between items-center mb-4 px-2 pt-2">
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
                        {format(currentDate, 'MMMM', { locale: es })}
                    </h2>
                    <p className="text-piso2-lime font-bold text-xs tracking-widest uppercase">
                        {format(currentDate, 'yyyy', { locale: es })} • Agenda
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 bg-black border border-white/10 hover:border-piso2-lime hover:text-piso2-lime transition-all rounded-full"><ChevronLeft size={18} /></button>
                    <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 bg-black border border-white/10 hover:border-piso2-lime hover:text-piso2-lime transition-all rounded-full"><ChevronRight size={18} /></button>
                </div>
            </div>

            <div className="grid grid-cols-7 mb-2">
                {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map(d => <div key={d} className="text-center text-gray-500 text-[9px] font-black uppercase tracking-wider">{d}</div>)}
            </div>

            {/* GRILLA CALENDARIO (Versión "Muchos Puntitos") */}
            <div className="grid grid-cols-7 gap-1 px-1 auto-rows-fr">
                {eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) }).map((day) => {
                    const isToday = isSameDay(day, new Date())
                    const isCurrentMonth = isSameMonth(day, currentDate)
                    const dayClases = clases.filter(c => isSameDay(new Date(c.inicio), day))
                    const hasClases = dayClases.length > 0

                    return (
                        <div
                            key={day.toString()}
                            onClick={() => handleDayClick(day)}
                            className={clsx(
                                "h-[60px] md:h-[100px] border rounded-lg transition-all cursor-pointer relative flex flex-col items-center justify-start pt-1 overflow-hidden",
                                isCurrentMonth ? "bg-white/5 border-white/5" : "opacity-20 border-transparent",
                                isToday && "ring-1 ring-piso2-lime bg-piso2-lime/10"
                            )}
                        >
                            {/* Número del día */}
                            <span className={clsx(
                                "text-xs md:text-sm font-bold z-20 leading-none mb-1",
                                isToday ? "text-piso2-lime" : "text-white/60"
                            )}>
                                {format(day, 'd')}
                            </span>

                            {/* PUNTITOS: Mostramos hasta 8 para que se vea "lleno" */}
                            {hasClases && (
                                <div className="flex flex-wrap justify-center gap-1 px-1 w-full">
                                    {dayClases.slice(0, 8).map((clase, i) => (
                                        <div
                                            key={i}
                                            className={`w-1.5 h-1.5 rounded-full ${getColorByTitle(clase.nombre)} shadow-[0_0_2px_rgba(0,0,0,0.5)]`}
                                        />
                                    ))}
                                    {dayClases.length > 8 && <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* --- MODAL FULLSCREEN MOBILE (100dvh) --- */}
            {isModalOpen && selectedDate && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsModalOpen(false)}>

                    <div className="w-full h-[100dvh] md:h-auto md:max-h-[85vh] md:max-w-2xl bg-[#09090b] md:border border-white/10 md:rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

                        {/* Header Fijo */}
                        <div className="h-16 flex-shrink-0 border-b border-white/5 bg-[#09090b] flex justify-between items-center px-6 z-20">
                            <div>
                                <p className={`font-bold text-[9px] uppercase tracking-[0.2em] ${modalMode === 'view' ? 'text-piso2-lime' : 'text-gray-500'}`}>
                                    {modalMode === 'view' ? 'Lineup' : 'Nueva Clase'}
                                </p>
                                <h3 className="text-xl font-black uppercase tracking-tighter text-white leading-none">
                                    {format(selectedDate, 'EEEE d', { locale: es })}
                                </h3>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-white"><X size={20} /></button>
                        </div>

                        {/* Contenido con Scroll */}
                        <div className="flex-1 overflow-y-auto bg-black/50 p-6 pb-safe">

                            {modalMode === 'view' && (
                                <div className="space-y-4 pb-20">
                                    {clasesDelDia.length > 0 ? (
                                        clasesDelDia.map((clase) => (
                                            <div key={clase.id} className={`flex flex-row bg-[#111] border border-white/5 rounded-xl overflow-hidden border-l-[4px] ${getBorderColorByTitle(clase.nombre)}`}>
                                                <div className="relative w-20 h-24 flex-shrink-0 bg-white/5">
                                                    {clase.imagen_url ? (
                                                        <Image src={clase.imagen_url} alt={clase.nombre} fill className="object-cover" />
                                                    ) : (
                                                        <div className="flex items-center justify-center h-full text-white/10"><Instagram size={20} /></div>
                                                    )}
                                                </div>
                                                <div className="flex-1 p-3 flex flex-col justify-center relative">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-xl font-black text-white tracking-tighter leading-none">{format(new Date(clase.inicio), 'HH:mm')}</span>
                                                        <span className={`px-2 py-0.5 rounded text-[8px] uppercase font-bold ${getSedeBadgeStyle(clase.sala?.sede?.nombre)}`}>
                                                            {clase.sala?.sede?.nombre}
                                                        </span>
                                                    </div>
                                                    <h4 className="text-xs font-bold text-white uppercase leading-tight mb-2 pr-6 line-clamp-2">{clase.nombre}</h4>
                                                    <div className="flex items-end justify-between border-t border-white/5 pt-2 mt-auto">
                                                        <span className="flex items-center gap-1 text-[9px] text-gray-400 font-bold uppercase"><MapPin size={9} /> {clase.sala?.nombre}</span>
                                                        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: clase.id, serieId: clase.serie_id }) }} className="text-gray-500 hover:text-red-500 p-1 bg-white/5 rounded">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-10 text-center text-gray-600 opacity-50"><Clock size={32} className="mx-auto mb-2" /><p className="text-xs font-bold uppercase">Sin clases</p></div>
                                    )}

                                    <button onClick={() => setModalMode('create')} className="w-full mt-4 px-6 py-4 font-black text-black transition-all bg-piso2-lime rounded-xl hover:bg-white uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                                        <Plus size={16} strokeWidth={3} /> Agregar
                                    </button>
                                </div>
                            )}

                            {modalMode === 'create' && (
                                <form onSubmit={handleCrearClase} className="space-y-5 pb-32">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Título</label>
                                        <input value={formNombre} onChange={e => setFormNombre(e.target.value)} className="w-full bg-transparent border-b border-white/20 text-white text-lg font-bold py-2 focus:border-piso2-lime outline-none" placeholder="Título..." autoFocus required />
                                    </div>

                                    {/* INPUT DE IMAGEN (VOLVIÓ) */}
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Flyer / Imagen</label>
                                        <label className="flex flex-col items-center justify-center w-full h-20 border border-dashed border-white/10 rounded-xl bg-[#1a1a1a] hover:border-piso2-lime cursor-pointer relative overflow-hidden transition-colors group">
                                            {formFile && (<div className="absolute inset-0 bg-piso2-lime/10 flex items-center justify-center z-0"></div>)}
                                            <div className="flex flex-row items-center gap-2 text-gray-500 z-10 group-hover:text-piso2-lime">
                                                {formFile ? (
                                                    <><ImageIcon size={16} /><span className="text-[10px] font-bold uppercase line-clamp-1">{formFile.name}</span></>
                                                ) : (
                                                    <><UploadCloud size={16} /><span className="text-[10px] font-bold uppercase">Tocar para subir</span></>
                                                )}
                                            </div>
                                            <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files && setFormFile(e.target.files[0])} />
                                        </label>
                                    </div>

                                    {/* INPUTS DE HORA Y DURACIÓN */}
                                    <div className="flex flex-col gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Inicio</label>
                                            <div className="bg-[#1a1a1a] rounded-lg border border-white/5 h-12 flex items-center px-3">
                                                <input
                                                    type="time"
                                                    value={formHora}
                                                    onChange={e => setFormHora(e.target.value)}
                                                    className="bg-transparent w-full text-white font-bold outline-none appearance-none h-full"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Duración (min)</label>
                                            <div className="bg-[#1a1a1a] rounded-lg border border-white/5 h-12 flex items-center px-3">
                                                <input
                                                    type="number"
                                                    value={formDuracion}
                                                    onChange={e => setFormDuracion(Number(e.target.value))}
                                                    className="bg-transparent w-full text-white font-bold outline-none appearance-none h-full"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Ubicación</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <select value={formSedeId} onChange={e => { setFormSedeId(e.target.value); setFormSalaId('') }} className="w-full h-12 bg-[#1a1a1a] text-white font-bold px-3 rounded-lg outline-none border border-white/5 text-xs" required><option value="">Sede...</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
                                            <select value={formSalaId} onChange={e => setFormSalaId(e.target.value)} className="w-full h-12 bg-[#1a1a1a] text-white font-bold px-3 rounded-lg outline-none border border-white/5 disabled:opacity-50 text-xs" disabled={!formSedeId} required><option value="">Sala...</option>{salasDisponibles.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Profesor</label>
                                        <select value={formProfeId} onChange={e => setFormProfeId(e.target.value)} className="w-full h-12 bg-[#1a1a1a] text-white font-bold px-3 rounded-lg outline-none border border-white/5 text-xs" required><option value="">Seleccionar...</option>{profesores.map(p => <option key={p.id} value={p.id}>{p.nombre_completo || p.email}</option>)}</select>
                                    </div>

                                    <div className="flex items-center gap-3 bg-[#1a1a1a] p-3 rounded-xl border border-white/5 cursor-pointer" onClick={() => setRepetirHastaFinAnio(!repetirHastaFinAnio)}>
                                        <div className={`w-8 h-5 rounded-full flex items-center p-0.5 transition-colors ${repetirHastaFinAnio ? 'bg-piso2-lime' : 'bg-gray-600'}`}><div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${repetirHastaFinAnio ? 'translate-x-3' : 'translate-x-0'}`}></div></div>
                                        <div className="flex-1"><p className="text-white font-bold text-xs flex items-center gap-2">Repetir semanalmente</p></div>
                                    </div>

                                    <div className="pt-4 flex gap-3">
                                        <button type="button" onClick={() => setModalMode('view')} className="flex-1 py-4 bg-white/5 rounded-xl font-bold text-gray-400 text-xs uppercase">Cancelar</button>
                                        <button type="submit" disabled={uploading} className="flex-[2] bg-white text-black font-bold uppercase rounded-xl hover:bg-piso2-lime transition-all shadow-lg text-xs flex justify-center items-center">
                                            {uploading ? <Loader2 className="animate-spin mr-2" /> : 'Confirmar'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in" onClick={() => setDeleteTarget(null)}>
                    <div className="bg-[#111] border border-red-500/30 rounded-2xl w-full max-w-xs p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-white text-center uppercase mb-1">¿Eliminar?</h3>
                        <p className="text-gray-500 text-xs text-center mb-4">{deleteTarget.serieId ? 'Es una serie recurrente' : 'Esta acción es permanente'}</p>
                        <div className="space-y-2">
                            <button onClick={() => handleConfirmDelete('single')} className="w-full bg-white/10 text-white font-bold py-3 rounded-lg text-xs uppercase">Solo esta fecha</button>
                            {deleteTarget.serieId && <button onClick={() => handleConfirmDelete('serie')} className="w-full bg-red-600 text-white font-bold py-3 rounded-lg text-xs uppercase">Toda la serie</button>}
                            <button onClick={() => setDeleteTarget(null)} className="w-full py-2 text-xs uppercase font-bold text-gray-500">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}