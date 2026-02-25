'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { format, isFuture, isPast } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarCheck, MapPin, User, Clock, Loader2, ArrowRight, PlayCircle, StopCircle, Calendar, CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'

// Tipos
type HistorialAlumno = {
    id: string
    created_at: string
    presente: boolean
    clase: {
        nombre: string
        inicio: string
        imagen_url: string | null
        sala: { nombre: string; sede: { nombre: string } }
        profesor: { nombre_completo: string }
    }
}

type ClaseProfe = {
    id: string
    nombre: string
    inicio: string
    fin: string
    tipo_clase: string
    estado: string
    sala: { nombre: string; sede: { nombre: string } }
}

export default function MisClasesPage() {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState<string>('alumno')
    const [userName, setUserName] = useState('')

    // Estados según el rol
    const [historialAlumno, setHistorialAlumno] = useState<HistorialAlumno[]>([])
    const [clasesProfe, setClasesProfe] = useState<ClaseProfe[]>([])

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            setLoading(false)
            return
        }

        // 1. Averiguar quién es (Rol y Nombre)
        const { data: profile } = await supabase
            .from('profiles')
            .select('rol, nombre')
            .eq('id', user.id)
            .single()

        if (profile) {
            setUserRole(profile.rol)
            setUserName(profile.nombre)

            // 2. Traer datos según el rol
            if (profile.rol === 'profesor' || profile.rol === 'admin') {
                // DATA PARA EL PROFE: Clases que dicta
                const { data: misClasesData } = await supabase
                    .from('clases')
                    .select(`
                        id, nombre, inicio, fin, tipo_clase, estado,
                        sala:salas(nombre, sede:sedes(nombre))
                    `)
                    .eq('profesor_id', user.id)
                    .order('inicio', { ascending: true })

                if (misClasesData) setClasesProfe(misClasesData as any)
            } else {
                // DATA PARA EL ALUMNO: TODO el historial (sin filtrar por presente)
                const { data: historialData } = await supabase
                    .from('inscripciones')
                    .select(`
                        id, created_at, presente,
                        clase:clases (
                            nombre, inicio, imagen_url,
                            sala:salas ( nombre, sede:sedes ( nombre ) ),
                            profesor:profiles ( nombre_completo )
                        )
                    `)
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })

                if (historialData) {
                    // Ordenamos para que las más recientes queden arriba en cada grupo
                    const sortedData = (historialData as any).sort((a: any, b: any) =>
                        new Date(b.clase.inicio).getTime() - new Date(a.clase.inicio).getTime()
                    )
                    setHistorialAlumno(sortedData)
                }
            }
        }

        setLoading(false)
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-8 h-8" /></div>

    // --- VISTA PARA PROFESORES ---
    if (userRole === 'profesor' || userRole === 'admin') {
        const clasesActivas = clasesProfe.filter(c => c.estado !== 'cancelada')
        const clasesInactivas = clasesProfe.filter(c => c.estado === 'cancelada')

        return (
            <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
                <div className="mb-8 border-b border-white/10 pb-6">
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1">
                        Hola, <span className="text-[#D4E655]">{userName || 'Profe'}</span>
                    </h1>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Panel de Gestión Docente</p>
                </div>

                <div className="mb-12">
                    <h2 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4">
                        <PlayCircle size={20} className="text-[#D4E655]" /> Mis Clases Activas
                    </h2>

                    {clasesActivas.length === 0 ? (
                        <div className="bg-[#111] border border-white/5 rounded-2xl p-8 text-center">
                            <p className="text-gray-500 font-bold uppercase text-xs">No tenés clases activas asignadas en este momento.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {clasesActivas.map((clase) => (
                                <div key={clase.id} className="bg-[#09090b] border border-white/10 rounded-2xl p-5 hover:border-[#D4E655]/40 transition-all group flex flex-col">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <span className="text-[9px] font-black uppercase tracking-widest bg-[#D4E655]/10 text-[#D4E655] px-2 py-1 rounded mb-2 inline-block">
                                                {clase.tipo_clase}
                                            </span>
                                            <h3 className="text-xl font-black text-white uppercase leading-tight truncate">{clase.nombre}</h3>
                                        </div>
                                    </div>
                                    <div className="space-y-2 mb-6 flex-1">
                                        <div className="flex items-center gap-2 text-xs text-gray-400 font-bold"><Calendar size={14} className="text-[#D4E655]" /> {format(new Date(clase.inicio), "EEEE d 'de' MMMM", { locale: es })}</div>
                                        <div className="flex items-center gap-2 text-xs text-gray-400 font-bold"><Clock size={14} className="text-[#D4E655]" /> {format(new Date(clase.inicio), "HH:mm")} hs</div>
                                        <div className="flex items-center gap-2 text-xs text-gray-400 font-bold"><MapPin size={14} className="text-[#D4E655]" /> {clase.sala?.nombre} ({clase.sala?.sede?.nombre})</div>
                                    </div>
                                    <Link href={`/clase/${clase.id}`} className="w-full bg-[#111] hover:bg-[#D4E655] text-white hover:text-black border border-white/10 hover:border-[#D4E655] rounded-xl py-3 flex items-center justify-center gap-2 text-xs font-black uppercase transition-all">
                                        Gestionar Clase <ArrowRight size={14} />
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {clasesInactivas.length > 0 && (
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4 opacity-50">
                            <StopCircle size={20} className="text-gray-500" /> Historial
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 opacity-60">
                            {clasesInactivas.map((clase) => (
                                <div key={clase.id} className="bg-[#111] border border-white/5 rounded-2xl p-4 flex justify-between items-center">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-400 uppercase leading-tight truncate">{clase.nombre}</h3>
                                        <p className="text-[10px] text-gray-500 font-mono mt-1">{format(new Date(clase.inicio), "dd/MM/yyyy")}</p>
                                    </div>
                                    <Link href={`/clase/${clase.id}`} className="text-gray-500 hover:text-white p-2 transition-colors">
                                        <ArrowRight size={16} />
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // --- VISTA PARA ALUMNOS ---
    const ahora = new Date()
    // Separamos las clases
    const clasesProximas = historialAlumno.filter(item => new Date(item.clase.inicio) > ahora)
    const clasesPasadas = historialAlumno.filter(item => new Date(item.clase.inicio) <= ahora)

    return (
        <div className="pb-24 px-4 pt-4 md:p-8 min-h-screen bg-[#050505] animate-in fade-in">
            <div className="mb-6 border-b border-white/10 pb-6">
                <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter mb-1">Mis Clases</h2>
                <p className="text-[#D4E655] font-bold text-xs tracking-widest uppercase">
                    Resumen de Actividad • {historialAlumno.length} Inscripciones
                </p>
            </div>

            <div className="space-y-10 max-w-3xl">

                {/* SECCIÓN 1: PRÓXIMAS CLASES */}
                <div>
                    <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4 text-white">
                        <PlayCircle size={20} className="text-[#D4E655]" /> Próximas Clases
                    </h3>

                    {clasesProximas.length > 0 ? (
                        <div className="space-y-4">
                            {clasesProximas.map((item) => (
                                <div key={item.id} className="bg-[#09090b] border border-white/10 rounded-xl overflow-hidden flex flex-row hover:border-[#D4E655]/50 transition-colors shadow-lg">
                                    {/* Fecha (Columna Izq) */}
                                    <div className="bg-[#111] w-20 flex flex-col items-center justify-center p-3 text-center border-r border-white/10 shrink-0">
                                        <span className="text-xs font-bold text-[#D4E655] uppercase">{format(new Date(item.clase.inicio), 'MMM', { locale: es })}</span>
                                        <span className="text-2xl font-black text-white leading-none mt-1">{format(new Date(item.clase.inicio), 'd')}</span>
                                    </div>

                                    {/* Info (Centro) */}
                                    <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                                        <h4 className="text-sm md:text-base font-bold text-white uppercase leading-tight mb-2 truncate">{item.clase.nombre}</h4>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] md:text-xs text-gray-400 font-medium">
                                            <p className="flex items-center gap-1.5"><Clock size={12} className="text-[#D4E655]" /> {format(new Date(item.clase.inicio), 'HH:mm')} hs</p>
                                            <p className="flex items-center gap-1.5"><User size={12} className="text-[#D4E655]" /> {item.clase.profesor?.nombre_completo || 'Staff'}</p>
                                            <p className="flex items-center gap-1.5"><MapPin size={12} className="text-[#D4E655]" /> {item.clase.sala?.sede?.nombre}</p>
                                        </div>
                                    </div>

                                    {/* Etiqueta (Derecha) */}
                                    <div className="w-16 flex items-center justify-center bg-black/50 border-l border-white/5 shrink-0">
                                        <span className="text-[9px] font-black uppercase text-gray-500 -rotate-90 tracking-widest">Reserva</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-[#111]/50 text-gray-500">
                            <p className="text-sm font-bold uppercase mb-1">No tenés reservas futuras.</p>
                            <Link href="/explorar" className="text-xs text-[#D4E655] hover:underline">Ir a la cartelera para anotarte</Link>
                        </div>
                    )}
                </div>

                {/* SECCIÓN 2: HISTORIAL PASADO */}
                <div>
                    <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4 text-white opacity-80">
                        <StopCircle size={20} className="text-gray-500" /> Historial
                    </h3>

                    {clasesPasadas.length > 0 ? (
                        <div className="space-y-4 opacity-80">
                            {clasesPasadas.map((item) => (
                                <div key={item.id} className="bg-[#111] border border-white/5 rounded-xl overflow-hidden flex flex-row transition-colors">
                                    {/* Fecha (Columna Izq) */}
                                    <div className="bg-black/50 w-20 flex flex-col items-center justify-center p-3 text-center border-r border-white/5 shrink-0">
                                        <span className="text-xs font-bold text-gray-500 uppercase">{format(new Date(item.clase.inicio), 'MMM', { locale: es })}</span>
                                        <span className="text-2xl font-black text-gray-400 leading-none mt-1">{format(new Date(item.clase.inicio), 'd')}</span>
                                    </div>

                                    {/* Info (Centro) */}
                                    <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                                        <h4 className="text-sm md:text-base font-bold text-gray-300 uppercase leading-tight mb-2 truncate">{item.clase.nombre}</h4>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] md:text-xs text-gray-500 font-medium">
                                            <p className="flex items-center gap-1.5"><Clock size={12} /> {format(new Date(item.clase.inicio), 'HH:mm')} hs</p>
                                            <p className="flex items-center gap-1.5"><User size={12} /> {item.clase.profesor?.nombre_completo || 'Staff'}</p>
                                        </div>
                                    </div>

                                    {/* Estado Asistencia (Derecha) */}
                                    <div className={`w-20 flex flex-col gap-1 items-center justify-center border-l border-white/5 shrink-0 ${item.presente ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                        {item.presente ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                                        <span className="text-[8px] font-black uppercase tracking-widest">{item.presente ? 'Presente' : 'Ausente'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-[#111]/50 text-gray-500">
                            <p className="text-sm font-bold uppercase">No hay clases pasadas en tu historial.</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}