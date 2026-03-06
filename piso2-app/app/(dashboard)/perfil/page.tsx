'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    User, Phone, CreditCard, Users, Save, Megaphone, Loader2,
    AlertTriangle, Mail, Calendar, LogOut, CheckCircle2, History,
    BookOpen, Star, Clock, AlertCircle,
    X
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { useRouter } from 'next/navigation'

// --- TIPOS ---
type HistorialClase = {
    id: string
    presente: boolean
    clase: {
        nombre: string
        inicio: string
        tipo_clase: string
        profesor: { nombre_completo: string }
    }
}

type PackVencimiento = {
    fecha_vencimiento: string
    creditos_restantes: number
    tipo_clase: string
}

export default function PerfilPage() {
    const supabase = createClient()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [profile, setProfile] = useState<any>(null)
    const [avisos, setAvisos] = useState<any[]>([])

    const [historialClases, setHistorialClases] = useState<HistorialClase[]>([])
    const [proximoVencimiento, setProximoVencimiento] = useState<PackVencimiento | null>(null) // NUEVO ESTADO

    // Estado del Formulario
    const [formData, setFormData] = useState({
        nombre: '', apellido: '', email: '', telefono: '',
        alias_cbu: '', nombre_remplazo: '', contacto_remplazo: ''
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            // Ejecutamos la limpieza silenciosa de créditos vencidos en background
            await supabase.rpc('limpiar_creditos_vencidos')
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            // 1. Perfil
            const { data: dataProfile } = await supabase
                .from('profiles')
                .select('*, creditos_regulares, creditos_seminarios')
                .eq('id', user.id)
                .single()

            if (dataProfile) {
                setProfile(dataProfile)
                setFormData({
                    nombre: dataProfile.nombre || '',
                    apellido: dataProfile.apellido || '',
                    email: user.email || '',
                    telefono: dataProfile.telefono || '',
                    alias_cbu: dataProfile.alias_cbu || '',
                    nombre_remplazo: dataProfile.nombre_remplazo || '',
                    contacto_remplazo: dataProfile.contacto_remplazo || ''
                })

                // 2. Avisos (Solo si es PROFE)
                if (dataProfile.rol === 'profesor') {
                    const { data: dataAvisos } = await supabase
                        .from('comunicados')
                        .select('*')
                        .order('created_at', { ascending: false })
                    if (dataAvisos) setAvisos(dataAvisos)
                }

                // 3. Historial de Clases y Vencimientos (ALUMNO)
                if (dataProfile.rol === 'alumno' || dataProfile.rol === 'user') {
                    // Historial
                    const { data: dataHistorial } = await supabase
                        .from('inscripciones')
                        .select(`
                            id, 
                            presente, 
                            clase:clases(nombre, inicio, tipo_clase, profesor:profiles(nombre_completo))
                        `)
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(20)

                    if (dataHistorial) {
                        const historialLimpio = dataHistorial.filter((h: any) => h.clase !== null) as unknown as HistorialClase[]
                        setHistorialClases(historialLimpio)
                    }

                    // --- NUEVO: Buscar Próximo Vencimiento ---
                    const hoyIso = new Date().toISOString()
                    const { data: dataPacks } = await supabase
                        .from('alumno_packs')
                        .select('fecha_vencimiento, creditos_restantes, tipo_clase')
                        .eq('user_id', user.id)
                        .eq('estado', 'activo')
                        .gt('creditos_restantes', 0)
                        .gt('fecha_vencimiento', hoyIso)
                        .order('fecha_vencimiento', { ascending: true }) // El que vence más pronto primero
                        .limit(1)

                    if (dataPacks && dataPacks.length > 0) {
                        setProximoVencimiento(dataPacks[0])
                    }
                }
            }
        } catch (error) {
            console.error("Error al cargar el perfil:", error)
            toast.error("Ocurrió un error al cargar tu información.")
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        if (profile.rol === 'profesor') {
            if (!formData.nombre_remplazo || !formData.contacto_remplazo) {
                toast.error('Los datos de reemplazo son obligatorios para docentes')
                setSaving(false)
                return
            }
        }

        const { error } = await supabase.from('profiles').update({
            telefono: formData.telefono,
            alias_cbu: formData.alias_cbu,
            nombre_remplazo: formData.nombre_remplazo,
            contacto_remplazo: formData.contacto_remplazo,
            nombre_completo: `${formData.nombre} ${formData.apellido}`
        }).eq('id', profile.id)

        if (error) toast.error('Error al guardar')
        else {
            toast.success('Perfil actualizado correctamente')
            router.refresh()
        }

        setSaving(false)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        window.location.href = '/login'
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-10 h-10" /></div>

    const isProfe = profile?.rol === 'profesor'
    const isAlumno = profile?.rol === 'alumno' || profile?.rol === 'user'
    const datosIncompletos = isProfe && (!formData.nombre_remplazo || !formData.contacto_remplazo || !formData.alias_cbu)

    const gridLayout = isAlumno ? "lg:grid-cols-3" : "lg:grid-cols-3"
    const formColSpan = isAlumno ? "lg:col-span-1" : "lg:col-span-2"

    // Calcular si el vencimiento está cerca
    let diasParaVencer = null
    let colorVencimiento = 'bg-blue-500/10 border-blue-500/30 text-blue-400'
    let iconoVencimiento = <Clock size={16} />

    if (proximoVencimiento) {
        diasParaVencer = differenceInDays(new Date(proximoVencimiento.fecha_vencimiento), new Date())
        if (diasParaVencer <= 7) {
            colorVencimiento = 'bg-orange-500/10 border-orange-500/30 text-orange-400 animate-pulse'
            iconoVencimiento = <AlertCircle size={16} />
        }
    }

    return (
        <div className="pb-24 px-4 pt-4 md:p-8 min-h-screen bg-[#050505] text-white">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER PERFIL */}
            <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-[#D4E655] text-black flex items-center justify-center font-black text-2xl shadow-[0_0_20px_rgba(212,230,85,0.4)]">
                        {profile.nombre?.[0]}{profile.apellido?.[0]}
                    </div>
                    <div>
                        <h2 className="text-3xl font-black uppercase tracking-tighter text-white leading-none">{profile.nombre} {profile.apellido}</h2>
                        <span className="text-[#D4E655] font-bold text-xs tracking-widest uppercase bg-[#D4E655]/10 px-2 py-0.5 rounded mt-1 inline-block">
                            {profile.rol === 'admin' ? 'Administrador' : isProfe ? 'Staff Docente' : 'Alumno'}
                        </span>
                    </div>
                </div>
                <button onClick={handleLogout} className="text-gray-500 hover:text-red-500 text-xs font-bold uppercase flex items-center gap-2 transition-colors">
                    <LogOut size={16} /> <span className="hidden md:inline">Cerrar Sesión</span>
                </button>
            </div>

            <div className={`grid grid-cols-1 ${gridLayout} gap-8`}>

                {/* --- COLUMNA 1: FORMULARIO (PARA TODOS) --- */}
                <div className={`${formColSpan} space-y-6`}>

                    {isProfe && datosIncompletos && (
                        <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-xl flex items-start gap-3 animate-pulse">
                            <AlertTriangle className="text-orange-500 shrink-0" size={20} />
                            <div>
                                <h4 className="font-bold text-orange-500 uppercase text-xs">Acción Requerida</h4>
                                <p className="text-gray-400 text-xs">Para poder liquidar tus sueldos, necesitamos tu CBU y contacto de reemplazo.</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSave} className="bg-[#09090b] border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl space-y-8 h-full">
                        {/* 1. Datos Personales */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
                                <User size={16} className="text-[#D4E655]" /> Mis Datos
                            </h3>
                            <div className={`grid grid-cols-1 ${isAlumno ? '' : 'md:grid-cols-2'} gap-4`}>
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nombre</label><input disabled value={formData.nombre} className="w-full bg-[#111] border border-white/5 rounded-lg p-3 text-gray-400 font-bold text-sm cursor-not-allowed" /></div>
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Apellido</label><input disabled value={formData.apellido} className="w-full bg-[#111] border border-white/5 rounded-lg p-3 text-gray-400 font-bold text-sm cursor-not-allowed" /></div>
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Email</label><input disabled value={formData.email} className="w-full bg-[#111] border border-white/5 rounded-lg p-3 text-gray-400 font-bold text-sm cursor-not-allowed" /></div>
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Teléfono</label><input required value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                            </div>
                        </div>

                        {/* SECCIÓN EXCLUSIVA DOCENTES */}
                        {isProfe && (
                            <>
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
                                        <CreditCard size={16} className="text-[#D4E655]" /> Cobros
                                    </h3>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Alias / CBU</label>
                                        <input required placeholder="Ej: mi.alias.banco" value={formData.alias_cbu} onChange={e => setFormData({ ...formData, alias_cbu: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655] font-mono text-sm" />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
                                        <Users size={16} className="text-[#D4E655]" /> Reemplazo (Obligatorio)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nombre Completo</label><input required placeholder="Ej: Maria Lopez" value={formData.nombre_remplazo} onChange={e => setFormData({ ...formData, nombre_remplazo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Teléfono / Contacto</label><input required placeholder="Ej: 3624..." value={formData.contacto_remplazo} onChange={e => setFormData({ ...formData, contacto_remplazo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                    </div>
                                </div>
                            </>
                        )}

                        <button type="submit" disabled={saving} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all shadow-lg flex items-center justify-center gap-2 mt-auto">
                            {saving ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Guardar</>}
                        </button>
                    </form>
                </div>

                {/* --- COLUMNA 2 Y 3: PANEL DEL ALUMNO --- */}
                {isAlumno && (
                    <div className="lg:col-span-2 space-y-6">

                        {/* PANEL DE CRÉDITOS */}
                        <div className="bg-[#09090b] border border-white/10 rounded-2xl p-6 shadow-xl">
                            <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6">
                                <CreditCard size={20} className="text-[#D4E655]" /> Mis Créditos Disponibles
                            </h3>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                {/* Créditos Regulares */}
                                <div className="bg-[#111] border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-white/20 transition-all">
                                    <BookOpen size={24} className="text-gray-500 mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Clases Regulares</p>
                                    <p className="text-4xl font-black text-white">{profile.creditos_regulares || 0}</p>
                                </div>

                                {/* Créditos Seminarios */}
                                <div className="bg-[#111] border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-purple-500/30 transition-all">
                                    <Star size={24} className="text-purple-500 mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-1">Seminarios</p>
                                    <p className="text-4xl font-black text-white">{profile.creditos_seminarios || 0}</p>
                                </div>
                            </div>

                            {/* NUEVO: ALERTA DE VENCIMIENTO */}
                            {proximoVencimiento && (
                                <div className={`border rounded-xl p-4 flex items-center gap-3 ${colorVencimiento}`}>
                                    {iconoVencimiento}
                                    <div className="flex-1">
                                        <p className="text-xs font-black uppercase tracking-widest mb-0.5">
                                            {diasParaVencer && diasParaVencer <= 7 ? '¡Tus créditos están por vencer!' : 'Próximo vencimiento'}
                                        </p>
                                        <p className="text-[10px] opacity-80">
                                            Tenés {proximoVencimiento.creditos_restantes} clase(s) {proximoVencimiento.tipo_clase} que vencen el <strong>{format(new Date(proximoVencimiento.fecha_vencimiento), "d 'de' MMMM", { locale: es })}</strong>.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => router.push('/explorar')}
                                        className="shrink-0 bg-black/20 hover:bg-black/40 text-current px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-colors"
                                    >
                                        Usar Ahora
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* HISTORIAL DE CLASES */}
                        <div className="bg-[#09090b] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col h-[500px]">
                            <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6 shrink-0">
                                <History size={20} className="text-[#D4E655]" /> Historial de Asistencia
                            </h3>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                                {historialClases.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                                        <Calendar size={48} className="mb-4" />
                                        <p className="text-xs font-bold uppercase text-center">Todavía no te anotaste<br />a ninguna clase.</p>
                                    </div>
                                ) : (
                                    historialClases.map((historial) => {
                                        const fechaClase = new Date(historial.clase.inicio)
                                        const esPasada = fechaClase < new Date()

                                        return (
                                            <div key={historial.id} className="bg-[#111] border border-white/5 p-4 rounded-xl flex items-center justify-between gap-4 hover:bg-white/5 transition-colors group">

                                                {/* Info de la clase */}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] text-[#D4E655] font-bold uppercase">
                                                            {format(fechaClase, "EEE d MMM", { locale: es })}
                                                        </span>
                                                        <span className="text-[10px] text-gray-500 font-bold">
                                                            {format(fechaClase, "HH:mm")}
                                                        </span>
                                                    </div>
                                                    <h4 className="font-black text-white text-sm uppercase truncate">
                                                        {historial.clase.nombre}
                                                    </h4>
                                                    <p className="text-xs text-gray-500 truncate">
                                                        con {historial.clase.profesor?.nombre_completo || 'Staff'}
                                                    </p>
                                                </div>

                                                {/* Estado (Presente/Ausente/Pendiente) */}
                                                <div className="shrink-0 flex flex-col items-end gap-1">
                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border ${historial.clase.tipo_clase === 'Especial'
                                                        ? 'border-purple-500/30 text-purple-400 bg-purple-500/10'
                                                        : 'border-white/10 text-gray-400 bg-white/5'
                                                        }`}>
                                                        {historial.clase.tipo_clase}
                                                    </span>

                                                    {esPasada ? (
                                                        historial.presente ? (
                                                            <span className="text-xs font-bold text-green-500 flex items-center gap-1"><CheckCircle2 size={12} /> Presente</span>
                                                        ) : (
                                                            <span className="text-xs font-bold text-red-500 flex items-center gap-1"><X size={12} /> Ausente</span>
                                                        )
                                                    ) : (
                                                        <span className="text-xs font-bold text-blue-400">Próxima</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>

                    </div>
                )}

                {/* --- COLUMNA DER: CARTELERA (SOLO PROFES) --- */}
                {isProfe && (
                    <div className="lg:col-span-1">
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 relative overflow-hidden sticky top-8">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                            <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4 relative z-10">
                                <Megaphone size={18} className="text-blue-400" /> Cartelera Staff
                            </h3>

                            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                {avisos.map(aviso => (
                                    <div key={aviso.id} className="bg-black/40 border-l-2 border-blue-500 p-4 rounded-r-lg group hover:bg-white/5 transition-colors">
                                        <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">{format(new Date(aviso.created_at), 'dd MMM yyyy')}</span>
                                        <h4 className="font-bold text-white text-sm uppercase mb-2">{aviso.titulo}</h4>
                                        <p className="text-xs text-gray-400 leading-relaxed">{aviso.mensaje}</p>
                                    </div>
                                ))}
                                {avisos.length === 0 && <p className="text-gray-500 text-xs italic">No hay comunicados activos.</p>}
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    )
}