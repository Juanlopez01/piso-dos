'use client'

import { createClient } from '@/utils/supabase/client'
import { useState, useEffect } from 'react'
import { crearClasesAction, duplicarMesAction } from '@/app/actions/clases'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameDay, addMonths, subMonths, isSameMonth,
    differenceInMinutes, addMinutes
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
    ChevronLeft, ChevronRight, X, Plus, MapPin, Trash2, Loader2,
    Info, DollarSign, Image as ImageIcon, Briefcase, GraduationCap,
    Music, User, AlertCircle, CalendarDays, Star, UsersRound, Building2, Sparkles, Pencil,
    CopyPlus, ShieldAlert
} from 'lucide-react'
import { clsx } from 'clsx'
import Image from 'next/image'
import { Toaster, toast } from 'sonner'
import { useCash } from '@/context/CashContext'
import MultiDatePicker from '@/components/MultiDatePicker'

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
        profesor_id?: string
        profesor_2_id?: string | null
        sala_id?: string
        compania_id?: string | null
        cupo_maximo?: number
        descripcion?: string | null
        profesor_nombre: string
        profesor_2_nombre: string | null
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
        es_combinable: boolean // 🚀 NUEVO
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
    profesor_id?: string
    profesor_2_id?: string | null
    sala_id?: string
    compania_id?: string | null
    cupo_maximo?: number
    descripcion?: string | null
    profesor_nombre: string
    profesor_2_nombre: string | null
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
    es_combinable: boolean // 🚀 NUEVO
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
                inicio: c.inicio, fin: c.fin,
                fecha_render: c.inicio.split('T')[0],
                sala_nombre: c.sala_nombre, sala_sede: c.sala_sede, sede_id: c.sede_id,
                clase_data: {
                    profesor_id: c.profesor_id,
                    profesor_2_id: c.profesor_2_id,
                    sala_id: c.sala_id,
                    compania_id: c.compania_id,
                    cupo_maximo: c.cupo_maximo,
                    descripcion: c.descripcion,
                    profesor_nombre: c.profesor_nombre || 'Sin Asignar',
                    profesor_2_nombre: c.profesor_2_nombre || null,
                    nivel: c.nivel, imagen_url: c.imagen_url,
                    serie_id: c.serie_id, tipo_clase: c.tipo_clase, tipo_acuerdo: c.tipo_acuerdo,
                    valor_acuerdo: c.valor_acuerdo, ritmo_id: c.ritmo_id, es_la_liga: c.es_la_liga || false,
                    liga_nivel: c.liga_nivel || null, compania_nombre: c.compania_nombre || null,
                    es_audicion: c.es_audicion || false,
                    es_combinable: c.es_combinable ?? true
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
    const [modalMode, setModalMode] = useState<'view' | 'create' | 'edit'>('view')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<{ id: string, serieId: string | null } | null>(null)
    const [uploading, setUploading] = useState(false)
    const [isCreatingRitmo, setIsCreatingRitmo] = useState(false)
    const [nuevoRitmoNombre, setNuevoRitmoNombre] = useState('')
    const [duplicando, setDuplicando] = useState(false)

    const [form, setForm] = useState({
        nombre: '', descripcion: '', tipo: 'Regular', nivel: 'Open', ritmoId: '',
        hora: '18:00', duracion: 60, cupoMaximo: 20, sedeId: '', salaId: '',
        profeId: '', profe2Id: '',
        tipoAcuerdo: 'porcentaje', valorAcuerdo: '', fechas: [] as Date[],
        esLaLiga: false, ligaNivel: 1, companiaId: '', esAudicion: false,
        esCombinable: true // 🚀 NUEVO
    })
    const [formFile, setFormFile] = useState<File | null>(null)

    const startIso = startOfWeek(startOfMonth(currentDate)).toISOString()
    const endIso = endOfWeek(endOfMonth(currentDate)).toISOString()
    const startDateStr = format(startOfWeek(startOfMonth(currentDate)), 'yyyy-MM-dd')
    const endDateStr = format(endOfWeek(endOfMonth(currentDate)), 'yyyy-MM-dd')

    const { userRole } = useCash()

    const { data, error, isLoading, mutate } = useSWR(
        ['agenda', startIso, endIso, startDateStr, endDateStr],
        fetcher,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: true,
            keepPreviousData: true,
            dedupingInterval: 5000
        }
    )

    const handleDuplicarMes = async () => {
        const mesActualStr = format(new Date(), "yyyy-MM")
        const nombreMesSiguiente = format(addMonths(new Date(), 1), "MMMM", { locale: es })

        const confirmar = window.confirm(
            `¿Querés copiar todas las clases de este mes a ${nombreMesSiguiente}? \n\nSe respetarán los días de la semana y horarios.`
        )
        if (!confirmar) return

        setDuplicando(true)
        const res = await duplicarMesAction(mesActualStr)

        if (res.success) {
            toast.success(`¡Listo! Se crearon ${res.count} clases en ${nombreMesSiguiente}.`)
        } else {
            toast.error(res.error)
        }
        setDuplicando(false)
    }

    useEffect(() => {
        const canalAgenda = supabase.channel('cambios-agenda')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clases' }, () => mutate())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alquileres' }, () => mutate())
            .subscribe()

        return () => { supabase.removeChannel(canalAgenda) }
    }, [supabase, mutate])

    const eventos = data?.eventos || []
    const sedes = data?.sedes || []
    const profesores = data?.profesores || []
    const ritmos = data?.ritmos || []
    const companias = data?.companias || []

    useEffect(() => {
        if (error) {
            console.error("🚨 Error cargando agenda:", error);
            toast.error('Problema al conectar con la base de datos.');
        }
    }, [error])

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

    const prepararEdicion = (evt: EventoAgenda) => {
        if (!evt.clase_data) return;
        setEditingId(evt.id);

        const duracionReal = differenceInMinutes(new Date(evt.fin), new Date(evt.inicio));

        setForm({
            nombre: evt.titulo,
            descripcion: evt.clase_data.descripcion || '',
            tipo: evt.clase_data.tipo_clase,
            nivel: evt.clase_data.nivel,
            ritmoId: evt.clase_data.ritmo_id || '',
            hora: evt.inicio.split('T')[1].substring(0, 5),
            duracion: duracionReal > 0 ? duracionReal : 60,
            cupoMaximo: evt.clase_data.cupo_maximo || 20,
            sedeId: evt.sede_id,
            salaId: evt.clase_data.sala_id || '',
            profeId: evt.clase_data.profesor_id || '',
            profe2Id: evt.clase_data.profesor_2_id || '',
            tipoAcuerdo: evt.clase_data.tipo_acuerdo,
            valorAcuerdo: evt.clase_data.valor_acuerdo?.toString() || '',
            fechas: [new Date(evt.fecha_render + 'T12:00:00')],
            esLaLiga: evt.clase_data.es_la_liga,
            ligaNivel: evt.clase_data.liga_nivel || 1,
            companiaId: evt.clase_data.compania_id || '',
            esAudicion: evt.clase_data.es_audicion,
            esCombinable: evt.clase_data.es_combinable ?? true
        });

        setModalMode('edit');
    }

    const notificarAlumnos = async (datosClase: typeof form) => {
        try {
            let query = supabase.from('profiles').select('id').eq('rol', 'alumno')

            if (datosClase.esLaLiga) {
                query = query.eq('nivel_liga', datosClase.ligaNivel)
            }
            else if (datosClase.ritmoId) {
                query = query.contains('intereses_ritmos', [datosClase.ritmoId])
            }

            const { data: alumnos, error } = await query

            if (error || !alumnos || alumnos.length === 0) return

            const notifs = alumnos.map((a: { id: string }) => ({
                usuario_id: a.id,
                titulo: `¡Nueva clase: ${datosClase.nombre}!`,
                mensaje: `Se abrió un nuevo horario. ¡Asegurá tu lugar antes de que se llene!`,
                link: '/explorar',
                leido: false
            }))

            await supabase.from('notificaciones').insert(notifs)
            console.log(`✅ Megáfono activado: Se avisó de la nueva clase a ${alumnos.length} alumnos interesados.`)
        } catch (error) {
            console.error('Error al enviar notificaciones automáticas:', error)
        }
    }

    const handleGuardarClase = async (e: React.FormEvent) => {
        e.preventDefault()
        if (form.fechas.length === 0) return toast.error('Seleccioná al menos una fecha')
        if (!form.salaId || !form.profeId) return toast.error('Faltan datos (Sala o Profe)')
        if (form.tipo === 'Compañía' && !form.companiaId) return toast.error('Falta seleccionar Compañía')
        if (!form.esCombinable && !form.ritmoId) return toast.error('Las clases exclusivas requieren seleccionar un Ritmo')

        setUploading(true)
        try {
            let publicUrl = null

            if (formFile) {
                const fileExt = formFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`

                const { error: uploadError } = await supabase.storage.from('clases').upload(fileName, formFile)
                if (uploadError) throw new Error('Error al subir imagen')

                publicUrl = supabase.storage.from('clases').getPublicUrl(fileName).data.publicUrl
            }

            if (modalMode === 'edit' && editingId) {
                const inicioStr = `${format(form.fechas[0], 'yyyy-MM-dd')}T${form.hora}:00`;
                const inicioDate = new Date(inicioStr);
                const finDate = addMinutes(inicioDate, form.duracion);

                const updatePayload: any = {
                    nombre: form.nombre,
                    descripcion: form.descripcion || null,
                    tipo_clase: form.tipo,
                    nivel: form.nivel,
                    ritmo_id: form.ritmoId || null,
                    inicio: inicioStr,
                    fin: format(finDate, "yyyy-MM-dd'T'HH:mm:ss"),
                    cupo_maximo: form.esAudicion ? 9999 : form.cupoMaximo,
                    sala_id: form.salaId,
                    profesor_id: form.profeId,
                    profesor_2_id: form.profe2Id || null,
                    tipo_acuerdo: form.tipoAcuerdo,
                    valor_acuerdo: Number(form.valorAcuerdo),
                    es_la_liga: form.esLaLiga,
                    liga_nivel: form.esLaLiga ? form.ligaNivel : null,
                    compania_id: form.tipo === 'Compañía' ? form.companiaId : null,
                    es_audicion: form.esAudicion,
                    es_combinable: form.esCombinable
                };

                if (publicUrl) updatePayload.imagen_url = publicUrl;

                const { error } = await supabase.from('clases').update(updatePayload).eq('id', editingId);
                if (error) throw error;

                toast.success('Clase actualizada correctamente');
            } else {
                const response = await crearClasesAction(form, publicUrl)
                if (!response.success) throw new Error(response.error)
                toast.success(`${response.cantidad} clase(s) creada(s) correctamente`)

                notificarAlumnos(form)
            }

            setModalMode('view')
            setForm({
                nombre: '', descripcion: '', tipo: 'Regular', nivel: 'Open', ritmoId: '',
                hora: '18:00', duracion: 60, cupoMaximo: 20, sedeId: '', salaId: '',
                profeId: '', profe2Id: '', tipoAcuerdo: 'porcentaje', valorAcuerdo: '',
                fechas: selectedDate ? [selectedDate] : [],
                esLaLiga: false, ligaNivel: 1, companiaId: '', esAudicion: false, esCombinable: true
            } as any)
            setFormFile(null)
            mutate()

        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setUploading(false)
        }
    }

    const handleConfirmDelete = async (option: 'single' | 'serie') => {
        if (!deleteTarget) return
        const toastId = toast.loading('Eliminando...')

        try {
            let err;
            if (option === 'single') {
                const { error } = await supabase.from('clases').update({ estado: 'cancelada' }).eq('id', deleteTarget.id)
                err = error;
            } else {
                const { error } = await supabase.from('clases').update({ estado: 'cancelada' }).eq('serie_id', deleteTarget.serieId as string)
                err = error;
            }

            if (err) throw err

            toast.success('Clase cancelada/eliminada', { id: toastId })
            setDeleteTarget(null)
            mutate()
        } catch (err: any) {
            console.error(err)
            toast.error(`Error al eliminar: ${err.message}`, { id: toastId })
        }
    }

    const getEventStyle = (evt: EventoAgenda) => {
        // 🚀 ALQUILERES -> Ahora Morado/Violeta
        if (evt.tipo === 'Alquiler') return { border: 'border-purple-500', text: 'text-purple-500', bg: 'bg-purple-500' }

        if (evt.clase_data?.es_audicion) return { border: 'border-pink-500', text: 'text-pink-500', bg: 'bg-pink-500' }
        if (evt.clase_data?.es_la_liga) return { border: 'border-yellow-500', text: 'text-yellow-500', bg: 'bg-yellow-500' }

        // NO COMBINABLES -> Naranja Fuerte
        if (evt.clase_data?.es_combinable === false) return { border: 'border-orange-600', text: 'text-orange-500', bg: 'bg-orange-600' }

        switch (evt.subtitulo) {
            case 'Regular': return { border: 'border-orange-500', text: 'text-orange-500', bg: 'bg-orange-500' }

            // 🚀 ESPECIALES -> Ahora Blanco
            case 'Especial': return { border: 'border-white', text: 'text-white', bg: 'bg-white' }

            case 'Formacion': return { border: 'border-[#D4E655]', text: 'text-[#D4E655]', bg: 'bg-[#D4E655]' }
            case 'Compañía': return { border: 'border-blue-500', text: 'text-blue-500', bg: 'bg-blue-500' }
            default: return { border: 'border-[#D4E655]', text: 'text-[#D4E655]', bg: 'bg-[#D4E655]' }
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
                    {userRole === 'admin' || userRole === 'recepcion' ? (
                        <button
                            onClick={handleDuplicarMes}
                            disabled={duplicando}
                            className="flex items-center gap-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 px-4 py-2 rounded-xl font-bold text-xs uppercase hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50"
                        >
                            {duplicando ? <Loader2 className="animate-spin" size={14} /> : <CopyPlus size={14} />}
                            Duplicar Mes a {format(addMonths(new Date(), 1), "MMMM", { locale: es })}
                        </button>
                    ) : null}
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
                        dayClass = evtsDia.length === 0 ? "bg-white/5 border-white/5" : "bg-gradient-to-br from-[#D4E655]/10 to-transparent border-[#D4E655]/20"
                    }

                    return (
                        <div key={day.toString()} onClick={() => { setSelectedDate(day); setForm({ ...form, fechas: [day] }); setModalMode('view'); setIsModalOpen(true) }} className={clsx("min-h-[60px] md:min-h-[100px] border rounded-lg transition-all cursor-pointer relative flex flex-col items-center justify-start pt-1 overflow-hidden", dayClass, isToday && "ring-1 ring-white shadow-xl")}>
                            <span className={clsx("text-xs md:text-sm font-bold z-20 leading-none mb-1", isToday ? "text-white" : "text-white/60")}>{format(day, 'd')}</span>
                            <div className="flex flex-wrap justify-center gap-1 px-1 w-full z-10">
                                {evtsDia.slice(0, 8).map((evt, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full shadow-sm ${getEventStyle(evt).bg}`} />)}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* 🚀 LEYENDA DE COLORES ACTUALIZADA */}
            <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center justify-center gap-4 md:gap-6">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"></div>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Regular</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-orange-600 shadow-[0_0_8px_rgba(234,88,12,0.6)]"></div>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">No Combinable</span>
                </div>
                {/* Especial ahora es Blanco */}
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"></div>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Especial</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#D4E655] shadow-[0_0_8px_rgba(212,230,85,0.6)]"></div>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Formación</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Compañía</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]"></div>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">La Liga</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.6)]"></div>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Audición</span>
                </div>
                {/* Alquiler ahora es Morado */}
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"></div>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Alquiler</span>
                </div>
            </div>

            {isModalOpen && selectedDate && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsModalOpen(false)}>
                    <div className="w-full h-[95vh] md:h-auto md:max-h-[90vh] md:max-w-3xl bg-[#09090b] md:border border-white/10 md:rounded-2xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>

                        <div className="h-16 flex-shrink-0 border-b border-white/5 bg-[#09090b] flex justify-between items-center px-6 z-20">
                            <div>
                                <p className={`font-bold text-[9px] uppercase tracking-[0.2em] ${modalMode === 'view' ? 'text-[#D4E655]' : 'text-gray-500'}`}>
                                    {modalMode === 'view' ? 'Agenda del Día' : modalMode === 'edit' ? 'Editar Clase' : 'Nueva Clase'}
                                </p>
                                <h3 className="text-xl font-black uppercase tracking-tighter text-white leading-none">{format(selectedDate, 'EEEE d MMMM', { locale: es })}</h3>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-white hover:bg-red-500/20 hover:text-red-500"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-20">
                            {modalMode === 'view' ? (
                                <div className="space-y-4">
                                    {sedeFiltro !== 'todas' && (
                                        <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 p-3 rounded-lg flex items-center justify-between">
                                            <p className="text-[10px] text-[#D4E655] font-black uppercase tracking-widest flex items-center gap-2">
                                                <Building2 size={12} /> Mostrando solo {sedes.find(s => s.id === sedeFiltro)?.nombre}
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
                                                        <div className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-sm p-1 text-center border-t border-white/10 z-10"><span className="text-sm font-black text-white leading-none block">{evt.inicio.split('T')[1].substring(0, 5)}</span><span className="text-[8px] uppercase font-bold text-gray-400 block">{evt.sala_nombre} ({evt.sala_sede})</span></div>
                                                    </div>
                                                    <div className="flex-1 p-3 flex flex-col justify-center relative">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <h4 className="text-sm font-bold text-white uppercase leading-tight pr-2 flex items-center gap-1">
                                                                {evt.clase_data?.es_combinable === false && <ShieldAlert size={12} className="text-orange-600" />}
                                                                {evt.titulo}
                                                            </h4>
                                                            <span className={`px-2 py-0.5 rounded text-[8px] uppercase font-bold ${style.bg}/10 ${style.text} border ${style.border}/20`}>{evt.subtitulo}</span>
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 font-medium flex items-center gap-2 mb-2 flex-wrap">
                                                            {evt.tipo === 'Clase' ? (
                                                                <>
                                                                    <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded">
                                                                        <Briefcase size={10} />
                                                                        {evt.clase_data?.profesor_nombre || 'Sin asignar'}
                                                                        {evt.clase_data?.profesor_2_nombre ? ` & ${evt.clase_data.profesor_2_nombre}` : ''}
                                                                    </span>
                                                                    <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><GraduationCap size={10} /> {evt.clase_data?.nivel}</span>
                                                                    {evt.clase_data?.es_audicion && <span className="flex items-center gap-1 bg-pink-500/10 text-pink-400 border border-pink-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[9px]"><Sparkles size={10} className="text-pink-500" /> Audición</span>}
                                                                    {evt.clase_data?.es_la_liga && <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[9px]"><Star size={10} className="fill-purple-500/50" /> La Liga (Nivel {evt.clase_data.liga_nivel})</span>}
                                                                    {evt.clase_data?.compania_nombre && <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[9px]"><UsersRound size={10} className="text-blue-500" /> {evt.clase_data.compania_nombre}</span>}
                                                                </>
                                                            ) : (<span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><User size={10} /> Cliente Externo</span>)}
                                                        </div>
                                                        <div className="flex items-end justify-between border-t border-white/5 pt-2 mt-auto gap-2">
                                                            {evt.tipo === 'Clase' ? (
                                                                <>
                                                                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); prepararEdicion(evt) }} className="text-gray-500 hover:text-blue-400 p-2 bg-white/5 rounded hover:bg-blue-400/10 transition-colors ml-1"><Pencil size={14} /></button>
                                                                    <a href={`/clase/${evt.id}`} className="flex-1 bg-[#D4E655] text-black text-[10px] font-black uppercase py-2 rounded hover:bg-white transition-colors text-center shadow-[0_0_10px_rgba(212,230,85,0.2)]">Gestionar / Lista</a>
                                                                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget({ id: evt.id, serieId: evt.clase_data?.serie_id || null }) }} className="text-gray-500 hover:text-red-500 p-2 bg-white/5 rounded hover:bg-red-500/10 transition-colors ml-1"><Trash2 size={14} /></button>
                                                                </>
                                                            ) : (<div className="flex gap-2 w-full"><div className="flex-1 text-[10px] text-gray-500 italic flex items-center"><Info size={12} className="mr-1" /> Alquiler externo</div><a href="/alquileres" className="px-3 py-2 bg-white/10 text-white rounded text-[10px] font-bold uppercase hover:bg-white/20">Ver Alquileres</a></div>)}
                                                        </div>
                                                    </div>

                                                    {deleteTarget?.id === evt.id && (
                                                        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-4 text-center animate-in fade-in" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(null); }}>
                                                            <div className="bg-[#09090b] border border-red-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center" onClick={e => e.stopPropagation()}>
                                                                <AlertCircle className="text-red-500 mb-3" size={40} />
                                                                <h4 className="text-white font-black uppercase text-lg mb-1">¿Cancelar Clase?</h4>
                                                                <p className="text-gray-400 text-xs mb-6 leading-relaxed">Esta acción cancelará la clase de la agenda y no se puede revertir.</p>
                                                                <div className="flex flex-col gap-3 w-full">
                                                                    <div className="flex gap-3 w-full">
                                                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(null) }} className="flex-1 py-3 bg-white/5 rounded-xl font-bold text-xs uppercase hover:bg-white/10 transition-colors">Volver</button>
                                                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirmDelete('single') }} className="flex-[2] py-3 bg-red-500 text-white rounded-xl font-black text-xs uppercase hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-colors">Solo esta clase</button>
                                                                    </div>
                                                                    {deleteTarget.serieId && (
                                                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirmDelete('serie') }} className="w-full py-3 bg-red-950/50 border border-red-500/50 text-red-400 rounded-xl font-black text-xs uppercase hover:bg-red-900/50 transition-colors">Eliminar toda la serie</button>
                                                                    )}
                                                                </div>
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
                            ) :

                                (modalMode === 'create' || modalMode === 'edit') && (
                                    <form onSubmit={handleGuardarClase} className="space-y-6">

                                        {/* SECCIÓN 1: FICHA TÉCNICA */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><Info size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Ficha Técnica</h4></div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" required /></div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase flex justify-between">
                                                        <span className={!form.esCombinable && !form.ritmoId ? 'text-red-400' : ''}>
                                                            Ritmo {!form.esCombinable && '*Requerido'}
                                                        </span>
                                                        <button type="button" onClick={() => setIsCreatingRitmo(!isCreatingRitmo)} className="text-[#D4E655] text-[8px] uppercase">Nuevo</button>
                                                    </label>
                                                    {isCreatingRitmo ? (
                                                        <div className="flex gap-2"><input value={nuevoRitmoNombre} onChange={e => setNuevoRitmoNombre(e.target.value)} className="flex-1 bg-[#111] border border-[#D4E655] rounded-lg px-3 text-white text-xs" /><button type="button" onClick={() => handleCrearRitmo()} className="bg-[#D4E655] text-black font-bold px-3 rounded-lg text-[10px] uppercase">OK</button></div>
                                                    ) : (
                                                        <select value={form.ritmoId} onChange={e => setForm({ ...form, ritmoId: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs outline-none">
                                                            <option value="">Seleccionar...</option>
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
                                                        }} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-[10px]">
                                                            <option value="Regular">Regular</option>
                                                            <option value="Especial">Especial</option>
                                                            <option value="Formacion">Formación</option>
                                                            <option value="Compañía">Compañía</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Nivel</label>
                                                        <select value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-[10px]">
                                                            <option value="Todos">Todos</option>
                                                            <option value="Principiante">Principiante</option>
                                                            <option value="Principiante/intermedio">Principiante/Intermedio</option>
                                                            <option value="Intermedio">Intermedio</option>
                                                            <option value="Intermedio/avanzado">Intermedio/Avanzado</option>
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
                                                            className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs disabled:opacity-50 disabled:text-[#D4E655]"
                                                        />
                                                    </div>

                                                    {/* 🚀 NUEVO: Switch de Combinable (ACTUALIZADO A NARANJA FUERTE) */}
                                                    <div className="md:col-span-3 space-y-2 pt-2 border-t border-white/5 mt-2 bg-orange-600/5 p-3 rounded-xl border-dashed border-orange-600/20">
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <div className="relative flex items-center">
                                                                <input type="checkbox" checked={form.esCombinable} onChange={e => setForm({ ...form, esCombinable: e.target.checked })} className="peer sr-only" />
                                                                <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] font-black uppercase text-orange-500 flex items-center gap-1">Acepta Créditos {form.tipo === 'Especial' ? 'Especiales' : 'Regulares'}</span>
                                                                <span className="text-[8px] text-gray-500 block leading-tight mt-0.5">Si lo apagás, será No Combinable y requerirá un crédito de la clase elegida.</span>
                                                            </div>
                                                        </label>
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
                                                                <input type="checkbox" checked={form.esAudicion} onChange={e => setForm({ ...form, esAudicion: e.target.checked })} className="peer sr-only" />
                                                                <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase text-pink-400 flex items-center gap-1"><Sparkles size={12} className="text-pink-500" /> Es una Audición (Sin cupo)</span>
                                                        </label>
                                                    </div>

                                                    <div className="md:col-span-3 space-y-2 pt-2 border-t border-white/5 mt-2 bg-purple-500/5 p-3 rounded-xl border-dashed border-purple-500/20">
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <div className="relative flex items-center">
                                                                <input type="checkbox" checked={form.esLaLiga} onChange={e => setForm({ ...form, esLaLiga: e.target.checked })} className="peer sr-only" />
                                                                <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase text-purple-400 flex items-center gap-1"><Star size={12} className="fill-purple-500/50" /> Pertenece a La Liga</span>
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

                                                <div className="space-y-1 md:col-span-2"><label className="text-[9px] font-bold text-gray-500 uppercase">Descripción</label><textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs h-16 resize-none" /></div>
                                            </div>
                                        </div>

                                        {/* SECCIÓN 2: DÍAS (Oculto al editar) */}
                                        {modalMode === 'create' && (
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><CalendarDays size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Días de la Clase</h4></div>
                                                <div className="bg-[#111] p-1 rounded-xl border border-white/10"><MultiDatePicker selectedDates={form.fechas} onChange={(dates) => setForm({ ...form, fechas: dates })} /></div>
                                            </div>
                                        )}

                                        {/* SECCIÓN 3: UBICACIÓN & FLYER */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><MapPin size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Ubicación & Staff</h4></div>
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                                <div className="md:col-span-7 space-y-4">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Hora</label><input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs" required /></div>
                                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Duración (min)</label><input type="number" value={form.duracion} onChange={e => setForm({ ...form, duracion: Number(e.target.value) })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs" /></div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <select value={form.sedeId} onChange={e => setForm({ ...form, sedeId: e.target.value, salaId: '' })} className="bg-[#111] border border-white/10 rounded-lg p-3 text-white text-[10px]"><option value="">Sede...</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
                                                        <select value={form.salaId} onChange={e => setForm({ ...form, salaId: e.target.value })} className="bg-[#111] border border-white/10 rounded-lg p-3 text-white text-[10px]"><option value="">Sala...</option>{salasDisponibles.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
                                                    </div>
                                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                                        <select required value={form.profeId} onChange={e => setForm({ ...form, profeId: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs"><option value="">Profe Titular...</option>{profesores.map(p => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}</select>
                                                        <select value={form.profe2Id} onChange={e => setForm({ ...form, profe2Id: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs"><option value="">Segundo Profe (Opcional)...</option>{profesores.filter(p => p.id !== form.profeId).map(p => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}</select>
                                                    </div>
                                                </div>
                                                {/* FLYER */}
                                                <div className="md:col-span-5">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Flyer / Foto</label>
                                                    <label className="h-44 w-full bg-[#111] border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#D4E655] transition-colors relative overflow-hidden">
                                                        {formFile ? <Image src={URL.createObjectURL(formFile)} alt="Preview" fill className="object-cover" /> : <><ImageIcon className="text-gray-600 mb-2" size={24} /><span className="text-[10px] text-gray-500 uppercase font-black">Subir</span></>}
                                                        <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files && setFormFile(e.target.files[0])} />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SECCIÓN 4: PAGO */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-[#D4E655] border-b border-white/10 pb-1"><DollarSign size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Pago Docente</h4></div>
                                            <div className="flex bg-[#111] rounded-lg p-1 border border-white/10">
                                                <button type="button" onClick={() => setForm({ ...form, tipoAcuerdo: 'porcentaje' })} className={`flex-1 py-2 rounded text-[10px] font-black uppercase ${form.tipoAcuerdo === 'porcentaje' ? 'bg-[#D4E655] text-black' : 'text-gray-500'}`}>Porcentaje (%)</button>
                                                <button type="button" onClick={() => setForm({ ...form, tipoAcuerdo: 'fijo' })} className={`flex-1 py-2 rounded text-[10px] font-black uppercase ${form.tipoAcuerdo === 'fijo' ? 'bg-[#D4E655] text-black' : 'text-gray-500'}`}>Fijo ($)</button>
                                            </div>
                                            <input type="number" value={form.valorAcuerdo} onChange={e => setForm({ ...form, valorAcuerdo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm font-bold outline-none" placeholder="Valor del acuerdo" />
                                        </div>

                                        <div className="pt-4 flex gap-3">
                                            <button type="button" onClick={() => { setModalMode('view'); setEditingId(null); }} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-gray-400 text-xs uppercase transition-colors">Cancelar</button>
                                            <button type="submit" disabled={uploading} className="flex-[2] bg-white text-black font-black uppercase rounded-xl hover:bg-[#D4E655] transition-all text-xs flex justify-center items-center shadow-lg">
                                                {uploading ? <Loader2 className="animate-spin mr-2" /> : modalMode === 'edit' ? 'Guardar Cambios' : 'Confirmar Clase'}
                                            </button>
                                        </div>
                                    </form>
                                )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}