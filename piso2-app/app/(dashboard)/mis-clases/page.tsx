'use client'

import { createClient } from '@/utils/supabase/client'
import { useState } from 'react'
import useSWR from 'swr'
import { format, differenceInHours } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarCheck, MapPin, User, Clock, Loader2, ArrowRight, PlayCircle, StopCircle, Calendar, CheckCircle2, XCircle, Trash2, Lock } from 'lucide-react'
import Link from 'next/link'
import { toast, Toaster } from 'sonner'
import { cancelarReservaAction } from '@/app/actions/mis-clases'
import { useCash } from '@/context/CashContext' // 🚀 IMPORTAMOS EL CONTEXTO GLOBAL

// --- HELPER DE FECHAS SEGURAS ---
const parseSafeDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return new Date()
    const cleanStr = dateStr.replace('+00:00', '').replace('+00', '').replace('Z', '').replace(' ', 'T')
    const parsed = new Date(cleanStr)
    return isNaN(parsed.getTime()) ? new Date() : parsed
}

// --- TIPOS ---
type HistorialAlumno = {
    id: string
    created_at: string
    presente: boolean
    clase: {
        id: string
        nombre: string
        inicio: string
        tipo_clase: string
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

type MisClasesData = {
    profile: { id: string, rol: string, nombre: string }
    clasesProfe: ClaseProfe[]
    historialAlumno: HistorialAlumno[]
}

// 🚀 FETCHER ORDENADO (Recibe el ID, usa el Singleton, NO pide sesión)
// 🚀 FETCHER ORDENADO Y CON RASTREADOR DE ERRORES
const fetcherMisClases = async (uid: string, supabase: any): Promise<MisClasesData> => {
    const { data: profile, error: errProfile } = await supabase
        .from('profiles')
        .select('id, rol, nombre')
        .eq('id', uid)
        .single()

    if (errProfile || !profile) throw new Error("Perfil no encontrado")

    let clasesProfe: ClaseProfe[] = []
    let historialAlumno: HistorialAlumno[] = []

    if (profile.rol === 'profesor' || profile.rol === 'admin') {
        const { data: misClasesData } = await supabase
            .from('clases')
            .select(`
                id, nombre, inicio, fin, tipo_clase, estado,
                sala:salas(nombre, sede:sedes(nombre))
            `)
            .eq('profesor_id', uid)
            .order('inicio', { ascending: true })

        clasesProfe = (misClasesData as any) || []
    } else {
        console.log("🟠 [Mis Clases] Buscando reservas para el alumno ID:", uid)

        // 🚀 APUNTAMOS A LA TABLA CORRECTA: clase_alumnos
        const { data: historialData, error: errHistorial } = await supabase
            .from('inscripciones')
            .select(`
                id, created_at, presente,
                clase:clases (
                    id, nombre, inicio, tipo_clase, imagen_url,
                    sala:salas ( nombre, sede:sedes ( nombre ) ),
                    profesor:profiles!clases_profesor_id_fkey ( nombre_completo ) 
                )
            `)
            .eq('user_id', uid)
            .order('created_at', { ascending: false })

        console.log("✅ DATA DEVUELTA POR SUPABASE:", historialData)

        if (historialData) {
            historialAlumno = (historialData as any).sort((a: any, b: any) =>
                new Date(b.clase.inicio).getTime() - new Date(a.clase.inicio).getTime()
            )
        }
    }

    return { profile, clasesProfe, historialAlumno }
}
export default function MisClasesPage() {
    // 1. Usamos el Singleton de Supabase de forma segura
    const [supabase] = useState(() => createClient())

    // 2. Escuchamos al Contexto Global
    const { userId, isLoading: contextLoading } = useCash()

    // 3. SWR Condicionado a que el Contexto nos de permiso y el ID
    const { data, error, isLoading, mutate } = useSWR<MisClasesData>(
        !contextLoading && userId ? ['mis-clases', userId] : null,
        ([_, uid]) => fetcherMisClases(uid as string, supabase),
        { revalidateOnFocus: false, dedupingInterval: 3000 } // 🛡️ Apagamos el revalidateOnFocus para evitar parpadeos
    )

    const profile = data?.profile || null
    const userRole = profile?.rol || 'alumno'
    const userName = profile?.nombre || ''
    const clasesProfe = data?.clasesProfe || []
    const historialAlumno = data?.historialAlumno || []

    const [procesandoId, setProcesandoId] = useState<string | null>(null)

    // --- FUNCIÓN DE CANCELACIÓN SEGURA ---
    const handleCancelarInscripcion = async (inscripcionId: string, claseTipo: string) => {
        if (!confirm('¿Seguro que querés cancelar tu inscripción? Se te devolverá el crédito.')) return

        setProcesandoId(inscripcionId)

        // 🚀 MUTACIÓN OPTIMISTA
        const optimisticHistorial = historialAlumno.filter(item => item.id !== inscripcionId)
        await mutate({ ...data!, historialAlumno: optimisticHistorial }, false)

        const res = await cancelarReservaAction(inscripcionId, claseTipo)

        if (res.success) {
            toast.success('Reserva cancelada. Crédito devuelto.')
            mutate() // Sincronizamos con DB
        } else {
            toast.error(res.error)
            mutate() // Revertimos si falla
        }

        setProcesandoId(null)
    }

    if (isLoading || contextLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-8 h-8" /></div>
    if (error || (!profile && !contextLoading)) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-red-500 font-bold uppercase">Error al cargar datos. Refrescá la página.</div>

    const ahora = new Date()

    // ==========================================
    // VISTA PARA PROFESORES
    // ==========================================
    if (userRole === 'profesor' || userRole === 'admin') {
        const clasesActivas = clasesProfe.filter(c => c.estado !== 'cancelada' && parseSafeDate(c.fin) > ahora)
        const clasesInactivas = clasesProfe.filter(c => c.estado === 'cancelada' || parseSafeDate(c.fin) <= ahora)
        clasesInactivas.sort((a, b) => parseSafeDate(b.inicio).getTime() - parseSafeDate(a.inicio).getTime())

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
                            {clasesActivas.map((clase) => {
                                const inicioDate = parseSafeDate(clase.inicio)
                                return (
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
                                            <div className="flex items-center gap-2 text-xs text-gray-400 font-bold"><Calendar size={14} className="text-[#D4E655]" /> {format(inicioDate, "EEEE d 'de' MMMM", { locale: es })}</div>
                                            <div className="flex items-center gap-2 text-xs text-gray-400 font-bold"><Clock size={14} className="text-[#D4E655]" /> {format(inicioDate, "HH:mm")} hs</div>
                                            <div className="flex items-center gap-2 text-xs text-gray-400 font-bold"><MapPin size={14} className="text-[#D4E655]" /> {clase.sala?.nombre} ({clase.sala?.sede?.nombre})</div>
                                        </div>
                                        <Link href={`/clase/${clase.id}`} className="w-full bg-[#111] hover:bg-[#D4E655] text-white hover:text-black border border-white/10 hover:border-[#D4E655] rounded-xl py-3 flex items-center justify-center gap-2 text-xs font-black uppercase transition-all">
                                            Gestionar Clase <ArrowRight size={14} />
                                        </Link>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {clasesInactivas.length > 0 && (
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4 opacity-50">
                            <StopCircle size={20} className="text-gray-500" /> Historial <span className="text-[10px] bg-white/10 px-2 py-1 rounded-full ml-2">Últimas 3</span>
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 opacity-60">
                            {clasesInactivas.slice(0, 3).map((clase) => {
                                const inicioDate = parseSafeDate(clase.inicio)
                                return (
                                    <div key={clase.id} className="bg-[#111] border border-white/5 rounded-2xl p-4 flex justify-between items-center">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-400 uppercase leading-tight truncate">{clase.nombre}</h3>
                                            <p className="text-[10px] text-gray-500 font-mono mt-1">{format(inicioDate, "dd/MM/yyyy")}</p>
                                        </div>
                                        <Link href={`/clase/${clase.id}`} className="text-gray-500 hover:text-white p-2 transition-colors">
                                            <ArrowRight size={16} />
                                        </Link>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // ==========================================
    // VISTA PARA ALUMNOS
    // ==========================================
    const clasesProximas = historialAlumno.filter(item => parseSafeDate(item.clase.inicio) > ahora)
    const clasesPasadas = historialAlumno.filter(item => parseSafeDate(item.clase.inicio) <= ahora)

    return (
        <div className="pb-24 px-4 pt-4 md:p-8 min-h-screen bg-[#050505] animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />
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
                            {clasesProximas.map((item) => {
                                const claseDateLocal = parseSafeDate(item.clase.inicio)
                                const horasFaltantes = differenceInHours(claseDateLocal, ahora)
                                const esCancelable = horasFaltantes >= 24

                                return (
                                    <div key={item.id} className="bg-[#09090b] border border-white/10 rounded-xl overflow-hidden flex flex-row hover:border-[#D4E655]/50 transition-colors shadow-lg group">
                                        <div className="bg-[#111] w-20 flex flex-col items-center justify-center p-3 text-center border-r border-white/10 shrink-0">
                                            <span className="text-xs font-bold text-[#D4E655] uppercase">{format(claseDateLocal, 'MMM', { locale: es })}</span>
                                            <span className="text-2xl font-black text-white leading-none mt-1">{format(claseDateLocal, 'd')}</span>
                                        </div>

                                        <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                                            <h4 className="text-sm md:text-base font-bold text-white uppercase leading-tight mb-2 truncate">{item.clase.nombre}</h4>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] md:text-xs text-gray-400 font-medium">
                                                <p className="flex items-center gap-1.5"><Clock size={12} className="text-[#D4E655]" /> {format(claseDateLocal, 'HH:mm')} hs</p>
                                                <p className="flex items-center gap-1.5"><User size={12} className="text-[#D4E655]" /> {item.clase.profesor?.nombre_completo || 'Staff'}</p>
                                                <p className="flex items-center gap-1.5"><MapPin size={12} className="text-[#D4E655]" /> {item.clase.sala?.sede?.nombre}</p>
                                            </div>
                                        </div>

                                        <div className="w-24 md:w-32 flex flex-col shrink-0 border-l border-white/5">
                                            {esCancelable ? (
                                                <button
                                                    onClick={() => handleCancelarInscripcion(item.id, item.clase.tipo_clase)}
                                                    disabled={procesandoId === item.id}
                                                    className="w-full h-full flex flex-col items-center justify-center bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-colors p-2"
                                                    title="Cancelar Reserva"
                                                >
                                                    {procesandoId === item.id ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} className="mb-1" />}
                                                    <span className="text-[8px] font-black uppercase text-center tracking-widest hidden md:block">Cancelar</span>
                                                </button>
                                            ) : (
                                                <div
                                                    className="w-full h-full flex flex-col items-center justify-center bg-[#111] text-gray-500 p-2 cursor-not-allowed"
                                                    title="No se puede cancelar (Faltan menos de 24hs)"
                                                >
                                                    <Lock size={16} className="mb-1 opacity-50" />
                                                    <span className="text-[8px] font-black uppercase text-center leading-tight opacity-50 hidden md:block">No<br />Cancelable</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
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
                        <StopCircle size={20} className="text-gray-500" /> Historial <span className="text-[10px] bg-white/10 px-2 py-1 rounded-full ml-2">Últimas 3</span>
                    </h3>

                    {clasesPasadas.length > 0 ? (
                        <div className="space-y-4 opacity-80">
                            {clasesPasadas.slice(0, 3).map((item) => {
                                const claseDateLocal = parseSafeDate(item.clase.inicio)

                                return (
                                    <div key={item.id} className="bg-[#111] border border-white/5 rounded-xl overflow-hidden flex flex-row transition-colors">
                                        <div className="bg-black/50 w-20 flex flex-col items-center justify-center p-3 text-center border-r border-white/5 shrink-0">
                                            <span className="text-xs font-bold text-gray-500 uppercase">{format(claseDateLocal, 'MMM', { locale: es })}</span>
                                            <span className="text-2xl font-black text-gray-400 leading-none mt-1">{format(claseDateLocal, 'd')}</span>
                                        </div>

                                        <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                                            <h4 className="text-sm md:text-base font-bold text-gray-300 uppercase leading-tight mb-2 truncate">{item.clase.nombre}</h4>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] md:text-xs text-gray-500 font-medium">
                                                <p className="flex items-center gap-1.5"><Clock size={12} /> {format(claseDateLocal, 'HH:mm')} hs</p>
                                                <p className="flex items-center gap-1.5"><User size={12} /> {item.clase.profesor?.nombre_completo || 'Staff'}</p>
                                            </div>
                                        </div>

                                        <div className={`w-20 flex flex-col gap-1 items-center justify-center border-l border-white/5 shrink-0 ${item.presente ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                            {item.presente ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                                            <span className="text-[8px] font-black uppercase tracking-widest">{item.presente ? 'Presente' : 'Ausente'}</span>
                                        </div>
                                    </div>
                                )
                            })}
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