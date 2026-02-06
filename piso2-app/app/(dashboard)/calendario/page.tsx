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
    UploadCloud, MapPin, User, Clock, Instagram, Repeat, Trash2, AlertTriangle, Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import Image from 'next/image'
import { Toaster, toast } from 'sonner' // <--- IMPORTANTE

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
    serie_id: string | null // <--- IMPORTANTE
    sala: { nombre: string; sede: { nombre: string } } | null
    profesor: { nombre_completo: string } | null
}

export default function CalendarioPage() {
    const supabase = createClient()

    // Estados Principales
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [clases, setClases] = useState<Clase[]>([])
    const [sedes, setSedes] = useState<Sede[]>([])
    const [profesores, setProfesores] = useState<Profile[]>([])
    const [loading, setLoading] = useState(true)

    // Estados de UI
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'view' | 'create'>('view')

    // Estado para el Modal de Borrado (Reemplazo del prompt)
    const [deleteTarget, setDeleteTarget] = useState<{ id: string, serieId: string | null } | null>(null)

    // Formulario
    const [formNombre, setFormNombre] = useState('')
    const [formHora, setFormHora] = useState('18:00')
    const [formDuracion, setFormDuracion] = useState(60)
    const [formSedeId, setFormSedeId] = useState('')
    const [formSalaId, setFormSalaId] = useState('')
    const [formProfeId, setFormProfeId] = useState('')
    const [formFile, setFormFile] = useState<File | null>(null)

    const [uploading, setUploading] = useState(false) // <--- CRÍTICO PARA EVITAR DOBLE CLICK
    const [repetirHastaFinAnio, setRepetirHastaFinAnio] = useState(false)

    useEffect(() => {
        fetchData()
    }, [currentDate])

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

    // --- LÓGICA DE CREACIÓN (SOLUCIÓN DEL BUG DE DUPLICADOS) ---
    const handleCrearClase = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedDate || !formSalaId || !formProfeId) return

        // 1. BLOQUEO INMEDIATO DEL BOTÓN
        setUploading(true)

        try {
            const [horas, minutos] = formHora.split(':')
            const baseDate = new Date(selectedDate)
            baseDate.setHours(parseInt(horas), parseInt(minutos), 0, 0)

            // Validación de conflictos básica
            const endCheck = new Date(baseDate.getTime() + formDuracion * 60000)
            const { data: conflictos } = await supabase.from('clases')
                .select('id, nombre')
                .eq('sala_id', formSalaId)
                .lt('inicio', endCheck.toISOString())
                .gt('fin', baseDate.toISOString())

            if (conflictos && conflictos.length > 0) {
                toast.error(`Ya existe "${conflictos[0].nombre}" en ese horario.`)
                setUploading(false)
                return
            }

            // Subida de imagen
            let publicUrl = null
            if (formFile) {
                const fileExt = formFile.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`
                const { error } = await supabase.storage.from('clases').upload(fileName, formFile)
                if (error) throw new Error('Error al subir imagen')
                publicUrl = supabase.storage.from('clases').getPublicUrl(fileName).data.publicUrl
            }

            // Generación de Serie
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

            // ÉXITO
            toast.success(repetirHastaFinAnio ? `Serie creada (${clasesAInsertar.length} clases)` : 'Clase creada correctamente')

            await fetchData()

            // LIMPIEZA
            setFormNombre('')
            setFormFile(null)
            setRepetirHastaFinAnio(false)

            // 2. CERRAMOS EL MODO CREAR PARA EVITAR DOBLE CLICK
            setModalMode('view')

        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setUploading(false)
        }
    }

    // --- LÓGICA DE BORRADO ---
    const handleConfirmDelete = async (option: 'single' | 'serie') => {
        if (!deleteTarget) return

        if (option === 'single') {
            const { error } = await supabase.from('clases').delete().eq('id', deleteTarget.id)
            if (error) toast.error(error.message)
            else toast.success('Clase eliminada')
        } else {
            const { error } = await supabase.from('clases').delete().eq('serie_id', deleteTarget.serieId)
            if (error) toast.error(error.message)
            else toast.success('Toda la serie eliminada')
        }

        setDeleteTarget(null) // Cerrar modal de borrado
        fetchData()
    }

    // Estilos
    const getBorderColorByTitle = (title: string) => {
        const lower = title.toLowerCase().trim()
        if (lower.includes('clase')) return "border-l-piso2-lime"
        if (lower.includes('seminario')) return "border-l-piso2-orange"
        return "border-l-piso2-blue"
    }
    const getColorByTitle = (title: string) => {
        const lower = title.toLowerCase().trim()
        if (lower.includes('clase')) return "bg-piso2-lime shadow-[0_0_12px_#CCFF00]"
        if (lower.includes('seminario')) return "bg-piso2-orange shadow-[0_0_12px_#FF4D00]"
        return "bg-piso2-blue shadow-[0_0_12px_#0000FF]"
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
        <div className="h-full flex flex-col pb-20">

            {/* Notificaciones (Toast) */}
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER CALENDARIO */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500 uppercase tracking-tighter">
                        {format(currentDate, 'MMMM', { locale: es })}
                    </h2>
                    <p className="text-piso2-lime font-bold text-xs tracking-widest uppercase">
                        {format(currentDate, 'yyyy', { locale: es })} • Agenda
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-3 bg-black border border-white/10 hover:border-piso2-lime hover:text-piso2-lime transition-all rounded-full"><ChevronLeft size={20} /></button>
                    <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-3 bg-black border border-white/10 hover:border-piso2-lime hover:text-piso2-lime transition-all rounded-full"><ChevronRight size={20} /></button>
                </div>
            </div>

            {/* GRILLA MENSUAL */}
            <div className="grid grid-cols-7 mb-4">
                {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map(d => <div key={d} className="text-center text-gray-600 text-[10px] font-black uppercase tracking-wider">{d}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-2 auto-rows-fr">
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
                                "min-h-[100px] p-2 border rounded-xl transition-all cursor-pointer relative group flex flex-col justify-between overflow-hidden",
                                isCurrentMonth ? "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] hover:shadow-2xl" : "bg-transparent border-transparent opacity-30",
                                isToday && "ring-1 ring-piso2-lime bg-piso2-lime/5"
                            )}
                        >
                            <div className="flex justify-between items-start z-10">
                                <span className={clsx("text-lg font-black", isToday ? "text-piso2-lime" : "text-white/50 group-hover:text-white")}>{format(day, 'd')}</span>
                                {hasClases && <span className="text-[9px] font-bold text-black bg-white/80 px-1.5 py-0.5 rounded-full">{dayClases.length}</span>}
                            </div>
                            {hasClases && <div className={`absolute -bottom-4 -right-4 w-20 h-20 rounded-full blur-2xl opacity-20 ${getColorByTitle(dayClases[0].nombre).split(' ')[0]}`}></div>}
                            <div className="flex flex-wrap content-end gap-1.5 z-10">
                                {dayClases.map((clase) => <div key={clase.id} className={`w-2 h-2 rounded-full ${getColorByTitle(clase.nombre)}`} />)}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* --- MODAL PRINCIPAL (Lineup / Crear) --- */}
            {isModalOpen && selectedDate && (
                <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setIsModalOpen(false)}>
                    <div className="w-full max-w-2xl bg-[#09090b] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

                        <div className={`p-6 relative flex-shrink-0 border-b border-white/5 bg-black`}>
                            <div className="flex justify-between items-center relative z-10">
                                <div>
                                    <p className={`font-bold text-[10px] uppercase tracking-[0.2em] mb-1 ${modalMode === 'view' ? 'text-piso2-lime' : 'text-gray-500'}`}>
                                        {modalMode === 'view' ? 'Lineup del día' : 'Nueva Clase'}
                                    </p>
                                    <h3 className="text-3xl md:text-4xl font-black uppercase tracking-tighter leading-none text-white">
                                        {format(selectedDate, 'EEEE d', { locale: es })}
                                    </h3>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"><X size={20} /></button>
                            </div>
                        </div>

                        {/* VISTA LISTA */}
                        {modalMode === 'view' && (
                            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-black/50">
                                {clasesDelDia.length > 0 ? (
                                    clasesDelDia.map((clase) => (
                                        <div key={clase.id} className={`flex flex-col sm:flex-row bg-[#111] border border-white/5 rounded-xl overflow-hidden hover:border-white/20 transition-all group border-l-[6px] ${getBorderColorByTitle(clase.nombre)}`}>
                                            <div className="relative w-full sm:w-32 h-32 sm:h-auto flex-shrink-0 bg-white/5">
                                                {clase.imagen_url ? (
                                                    <Image src={clase.imagen_url} alt={clase.nombre} fill className="object-cover" />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-white/10"><Instagram size={32} /></div>
                                                )}
                                            </div>

                                            <div className="flex-1 p-5 flex flex-col justify-center relative">
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="flex flex-col">
                                                        <span className="text-3xl font-black text-white tracking-tighter leading-none group-hover:text-piso2-lime transition-colors">{format(new Date(clase.inicio), 'HH:mm')}</span>
                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Hasta {format(new Date(clase.fin), 'HH:mm')}</span>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider ${getSedeBadgeStyle(clase.sala?.sede?.nombre)}`}>
                                                        {clase.sala?.sede?.nombre}
                                                    </span>
                                                </div>
                                                <h4 className="text-xl font-bold text-white uppercase leading-tight mb-3 mt-2 pr-4">{clase.nombre}</h4>
                                                <div className="flex items-end justify-between border-t border-white/5 pt-3 mt-auto">
                                                    <div className="flex flex-col gap-1 text-xs text-gray-400 font-medium">
                                                        <span className="flex items-center gap-1.5"><MapPin size={12} className="text-piso2-orange" /> {clase.sala?.nombre}</span>
                                                        <span className="flex items-center gap-1.5"><User size={12} className="text-piso2-blue" /> {clase.profesor?.nombre_completo || 'Staff'}</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: clase.id, serieId: clase.serie_id }) }}
                                                        className="text-gray-600 hover:text-red-500 transition-colors p-2 bg-white/5 hover:bg-red-500/10 rounded-lg"
                                                        title="Eliminar clase"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 flex flex-col items-center justify-center text-gray-500 opacity-50">
                                        <Clock size={48} className="mb-4" strokeWidth={1} />
                                        <p className="text-sm font-bold uppercase tracking-widest">Sin actividad</p>
                                    </div>
                                )}

                                <button onClick={() => setModalMode('create')} className="w-full mt-4 px-6 py-4 font-black text-black transition-all bg-piso2-lime rounded-xl hover:bg-white uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                                    <Plus size={18} strokeWidth={3} /> Agregar al Lineup
                                </button>
                            </div>
                        )}

                        {/* FORMULARIO CREAR */}
                        {modalMode === 'create' && (
                            <form onSubmit={handleCrearClase} className="flex-1 overflow-y-auto p-6 space-y-5 bg-black/50">
                                <button type="button" onClick={() => setModalMode('view')} className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors"><ArrowLeft size={16} /> Volver al Lineup</button>

                                <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Título</label><input value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="Ej: MASTERCLASS URBANO" className="w-full bg-transparent border-b-2 border-white/20 text-white text-xl font-bold py-2 focus:border-piso2-lime outline-none" autoFocus required /></div>
                                <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Flyer</label><label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-xl hover:border-piso2-lime hover:bg-piso2-lime/5 cursor-pointer transition-all group relative overflow-hidden">{formFile && (<div className="absolute inset-0 bg-piso2-lime/10 flex items-center justify-center z-0"></div>)}<div className="flex flex-col items-center gap-2 text-gray-500 group-hover:text-piso2-lime z-10 transition-colors">{formFile ? (<><ImageIcon size={24} /><span className="text-[10px] font-bold uppercase">{formFile.name}</span></>) : (<><UploadCloud size={24} /><span className="text-[10px] font-bold uppercase">Subir Imagen</span></>)}</div><input type="file" className="hidden" accept="image/*" onChange={e => e.target.files && setFormFile(e.target.files[0])} /></label></div>
                                <div className="grid grid-cols-2 gap-6"><div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Inicio</label><input type="time" value={formHora} onChange={e => setFormHora(e.target.value)} className="w-full bg-[#1a1a1a] rounded-lg text-white font-bold p-3 outline-none focus:ring-1 focus:ring-piso2-lime border border-white/5" required /></div><div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Duración (min)</label><input type="number" value={formDuracion} onChange={e => setFormDuracion(Number(e.target.value))} className="w-full bg-[#1a1a1a] rounded-lg text-white font-bold p-3 outline-none focus:ring-1 focus:ring-piso2-lime border border-white/5" required /></div></div>
                                <div className="grid grid-cols-2 gap-4"><select value={formSedeId} onChange={e => { setFormSedeId(e.target.value); setFormSalaId('') }} className="w-full bg-[#1a1a1a] text-white font-bold p-3 rounded-lg outline-none border border-white/5" required><option value="">Sede...</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select><select value={formSalaId} onChange={e => setFormSalaId(e.target.value)} className="w-full bg-[#1a1a1a] text-white font-bold p-3 rounded-lg outline-none border border-white/5 disabled:opacity-50" disabled={!formSedeId} required><option value="">Sala...</option>{salasDisponibles.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
                                <select value={formProfeId} onChange={e => setFormProfeId(e.target.value)} className="w-full bg-[#1a1a1a] text-white font-bold p-3 rounded-lg outline-none border border-white/5" required><option value="">Profe...</option>{profesores.map(p => <option key={p.id} value={p.id}>{p.nombre_completo || p.email}</option>)}</select>

                                <div className="flex items-center gap-3 bg-[#1a1a1a] p-3 rounded-xl border border-white/5 cursor-pointer" onClick={() => setRepetirHastaFinAnio(!repetirHastaFinAnio)}>
                                    <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${repetirHastaFinAnio ? 'bg-piso2-lime' : 'bg-gray-600'}`}><div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${repetirHastaFinAnio ? 'translate-x-4' : 'translate-x-0'}`}></div></div>
                                    <div className="flex-1"><p className="text-white font-bold text-sm flex items-center gap-2"><Repeat size={14} /> Repetir semanalmente</p><p className="text-[10px] text-gray-400">Hasta fin de año.</p></div>
                                </div>

                                <button type="submit" disabled={uploading} className="w-full bg-white text-black font-bold uppercase py-4 rounded-xl hover:bg-piso2-lime transition-all shadow-lg flex justify-center gap-2 mt-4 items-center">
                                    {uploading ? <><Loader2 className="animate-spin" /> Creando...</> : 'Confirmar Evento'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* --- MODAL DE CONFIRMACIÓN DE BORRADO (Custom UI) --- */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in" onClick={() => setDeleteTarget(null)}>
                    <div className="bg-[#111] border border-red-500/30 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-4 text-red-500 mx-auto">
                            <Trash2 size={24} />
                        </div>
                        <h3 className="text-xl font-black text-white text-center uppercase tracking-tight mb-2">¿Eliminar Clase?</h3>

                        {deleteTarget.serieId ? (
                            <>
                                <p className="text-gray-400 text-sm text-center mb-6">Esta clase es recurrente. ¿Qué querés borrar?</p>
                                <div className="space-y-3">
                                    <button onClick={() => handleConfirmDelete('single')} className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-lg transition-colors text-sm uppercase">Solo esta fecha</button>
                                    <button onClick={() => handleConfirmDelete('serie')} className="w-full bg-red-500 hover:bg-red-600 text-black font-bold py-3 rounded-lg transition-colors text-sm uppercase">Toda la serie futura</button>
                                    <button onClick={() => setDeleteTarget(null)} className="w-full text-gray-500 hover:text-white py-2 text-xs uppercase font-bold">Cancelar</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-gray-400 text-sm text-center mb-6">Esta acción no se puede deshacer.</p>
                                <div className="space-y-3">
                                    <button onClick={() => handleConfirmDelete('single')} className="w-full bg-red-500 hover:bg-red-600 text-black font-bold py-3 rounded-lg transition-colors text-sm uppercase">Eliminar</button>
                                    <button onClick={() => setDeleteTarget(null)} className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-lg transition-colors text-sm uppercase">Cancelar</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

        </div>
    )
}