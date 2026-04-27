'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Loader2, UsersRound, Shield, ArrowLeft,
    MessageSquare, Calendar, Users, Info,
    Clock, MapPin, User, ChevronRight, Image as ImageIcon,
    Send, BellRing, X, Percent, CheckCircle2, AlertCircle, Coins
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCash } from '@/context/CashContext'

type Compania = {
    id: string
    nombre: string
    descripcion: string
    coordinador_id: string
    coordinador?: { nombre_completo: string }
}

type Miembro = {
    id: string
    nombre_completo: string
    email: string
    porcentaje_beca?: number
    pago_compania_al_dia?: boolean
}

type ClaseCompania = {
    id: string
    nombre: string
    inicio: string
    fin: string
    imagen_url: string | null
    profesor: { nombre_completo: string }
    sala: { nombre: string; sede: { nombre: string } }
}

export default function CompaniaDetallePage() {
    const params = useParams()
    const router = useRouter()
    const [supabase] = useState(() => createClient())
    const { userRole, isLoading: loadingContext } = useCash()

    const [compania, setCompania] = useState<Compania | null>(null)
    const [miembros, setMiembros] = useState<Miembro[]>([])
    const [clases, setClases] = useState<ClaseCompania[]>([])
    const [loading, setLoading] = useState(true)
    const [userId, setUserId] = useState('')

    const [activeTab, setActiveTab] = useState<'muro' | 'clases' | 'miembros'>('muro')

    // Estados para Muro (Global)
    const [notifMessage, setNotifMessage] = useState('')
    const [sendingNotif, setSendingNotif] = useState(false)

    // Estados para Notificación Individual
    const [isIndividualNotifOpen, setIsIndividualNotifOpen] = useState(false)
    const [selectedAlumno, setSelectedAlumno] = useState<Miembro | null>(null)
    const [individualMessage, setIndividualMessage] = useState('')

    const [procesandoPago, setProcesandoPago] = useState(false)

    useEffect(() => {
        if (!loadingContext) {
            verificarAccesoYCargar()
        }
    }, [loadingContext, params.id])

    const verificarAccesoYCargar = async () => {
        setLoading(true)

        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user

        if (!user) {
            router.replace('/login')
            return
        }
        setUserId(user.id)

        const companiaId = params.id as string

        const { data: dataCompania, error } = await supabase
            .from('companias')
            .select('*, coordinador:profiles!coordinador_id(nombre_completo)')
            .eq('id', companiaId)
            .single()

        if (error || !dataCompania) {
            toast.error('La compañía no existe')
            router.replace('/companias')
            return
        }
        setCompania(dataCompania)

        const esAdminORecep = ['admin', 'recepcion'].includes(userRole || '')
        const esProfeCoordinador = userRole === 'profesor' && dataCompania.coordinador_id === user.id
        const esProfeComun = userRole === 'profesor' && dataCompania.coordinador_id !== user.id

        let tienePermiso = esAdminORecep || esProfeCoordinador || esProfeComun

        if (userRole === 'alumno') {
            const { data: esMiembro } = await supabase
                .from('perfiles_companias')
                .select('compania_id')
                .eq('compania_id', companiaId)
                .eq('perfil_id', user.id)
                .maybeSingle()

            if (esMiembro) tienePermiso = true
        }

        if (!tienePermiso) {
            toast.error('Acceso denegado. No perteneces a esta compañía.')
            router.replace('/companias')
            return
        }

        // 🚀 Traemos los miembros CON su beca (quitamos lo de la liga)
        const { data: dataMiembros } = await supabase
            .from('perfiles_companias')
            .select('perfil:profiles(id, nombre_completo, email, porcentaje_beca)')
            .eq('compania_id', companiaId)

        let deudaCompania = false

        if (dataMiembros) {
            let miembrosData = dataMiembros.map((m: any) => m.perfil).filter(Boolean)

            const mesActual = new Date().getMonth() + 1
            const anioActual = new Date().getFullYear()

            // Pagos exclusivos de ESTA Compañía
            const { data: pagosCia } = await supabase
                .from('companias_pagos')
                .select('alumno_id')
                .eq('compania_id', companiaId)
                .eq('mes', mesActual)
                .eq('anio', anioActual)

            const pagosCiaIds = new Set(pagosCia?.map((p: any) => p.alumno_id) || [])

            // Armamos el objeto final del miembro
            const miembrosCompletos = miembrosData.map((m: any) => ({
                ...m,
                pago_compania_al_dia: pagosCiaIds.has(m.id)
            }))

            miembrosCompletos.sort((a: any, b: any) => (a.nombre_completo || '').localeCompare(b.nombre_completo || ''))
            setMiembros(miembrosCompletos)

            // VERIFICAMOS SI EL USUARIO ACTUAL DEBE ALGO EN ESTA COMPAÑÍA
            if (userRole === 'alumno') {
                deudaCompania = !pagosCiaIds.has(user.id)
            }
        }

        const hoy = new Date().toISOString()
        const { data: dataClases } = await supabase
            .from('clases')
            .select(`
                id, nombre, inicio, fin, imagen_url,
                profesor:profiles!clases_profesor_id_fkey(nombre_completo),
                sala:salas(nombre, sede:sedes(nombre))
            `)
            .eq('compania_id', companiaId)
            .gte('inicio', hoy)
            .neq('estado', 'cancelada')
            .order('inicio', { ascending: true })

        if (dataClases) {
            const clasesUnicas: ClaseCompania[] = []
            const materiasVistas = new Set<string>()

            dataClases.forEach((c: any) => {
                const profNombre = Array.isArray(c.profesor) ? c.profesor[0]?.nombre_completo : c.profesor?.nombre_completo
                const salaData = Array.isArray(c.sala) ? c.sala[0] : c.sala

                const keyMateria = `${c.nombre}-${profNombre}`

                if (!materiasVistas.has(keyMateria)) {
                    materiasVistas.add(keyMateria)
                    clasesUnicas.push({
                        id: c.id,
                        nombre: c.nombre,
                        inicio: c.inicio,
                        fin: c.fin,
                        imagen_url: c.imagen_url,
                        profesor: { nombre_completo: profNombre || 'Staff' },
                        sala: salaData
                    })
                }
            })

            setClases(clasesUnicas)
        }

        setLoading(false)
    }

    const handleSendGlobalNotif = async (e: React.FormEvent) => {
        e.preventDefault()
        if (miembros.length === 0) return toast.error("El grupo no tiene integrantes aún.")

        setSendingNotif(true)
        try {
            const notifs = miembros.map(m => ({
                usuario_id: m.id,
                titulo: `Aviso: ${compania?.nombre}`,
                mensaje: notifMessage,
                link: `/companias/${compania?.id}`,
                leido: false
            }))

            const { error } = await supabase.from('notificaciones').insert(notifs)
            if (error) throw error

            toast.success("Aviso enviado a todos los integrantes")
            setNotifMessage('')
        } catch (error: any) {
            toast.error("Hubo un error al enviar el aviso.")
        } finally {
            setSendingNotif(false)
        }
    }

    const handleSendIndividualNotif = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedAlumno) return

        setSendingNotif(true)
        try {
            const notif = {
                usuario_id: selectedAlumno.id,
                titulo: `Aviso de Coordinación: ${compania?.nombre}`,
                mensaje: individualMessage,
                link: `/companias/${compania?.id}`,
                leido: false
            }

            const { error } = await supabase.from('notificaciones').insert([notif])
            if (error) throw error

            toast.success(`Aviso enviado a ${selectedAlumno.nombre_completo}`)
            setIsIndividualNotifOpen(false)
            setIndividualMessage('')
            setSelectedAlumno(null)
        } catch (error: any) {
            toast.error("Hubo un error al enviar el mensaje.")
        } finally {
            setSendingNotif(false)
        }
    }

    // Link de Pago Compañía
    const generarLinkPagoCompania = async () => {
        setProcesandoPago(true)
        try {
            const mesActual = new Date().getMonth() + 1
            const anioActual = new Date().getFullYear()

            const res = await fetch('/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    tipo_pago: 'cuota_compania',
                    productoId: compania?.id,
                    mes: mesActual,
                    anio: anioActual,
                    precio: 1 // El backend recalcula el precio real de forma segura
                })
            })

            const resData = await res.json()
            if (resData.url) window.location.href = resData.url
            else throw new Error(resData.error || 'No se pudo generar el link')
        } catch (err) {
            toast.error('Error al conectar con Mercado Pago.')
        } finally {
            setProcesandoPago(false)
        }
    }

    const openIndividualModal = (alumno: Miembro) => {
        setSelectedAlumno(alumno)
        setIndividualMessage('')
        setIsIndividualNotifOpen(true)
    }

    if (loading || loadingContext) {
        return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>
    }

    if (!compania) return null

    const hasCoordinatorPowers = ['admin', 'recepcion'].includes(userRole || '') || (userRole === 'profesor' && compania.coordinador_id === userId)

    // Buscamos si el usuario actual debe la cuota de la compañía para mostrarle el cartel
    const miPerfilInfo = miembros.find(m => m.id === userId)
    const deboCompania = !miPerfilInfo?.pago_compania_al_dia && userRole === 'alumno'

    // 🚀 Verificamos si es Proyecto Staff (pasamos a minúsculas para evitar errores de tipeo)
    const esProyectoStaff = compania.nombre.toLowerCase().trim() === 'proyecto staff'

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24 selection:bg-blue-500 selection:text-white animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER DE LA COMPAÑÍA */}
            <div className="bg-[#09090b] border-b border-white/5 pt-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

                <div className="max-w-4xl mx-auto px-4 md:px-8">
                    <Link href="/companias" className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors mb-6 relative z-10">
                        <ArrowLeft size={14} /> Volver a Compañías
                    </Link>

                    <div className="relative z-10 pb-8">
                        <span className="inline-block bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded mb-4 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                            Grupo Exclusivo
                        </span>
                        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none mb-4">
                            {compania.nombre}
                        </h1>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                            <div className="flex items-center gap-2 text-sm text-gray-300 font-bold bg-[#111] px-3 py-1.5 rounded-lg border border-white/5">
                                <Shield size={16} className="text-blue-400" />
                                Coord: {compania.coordinador?.nombre_completo || 'Staff'}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-300 font-bold bg-[#111] px-3 py-1.5 rounded-lg border border-white/5">
                                <UsersRound size={16} className="text-blue-400" />
                                {miembros.length} Integrantes
                            </div>
                        </div>
                    </div>

                    {/* MENÚ DE PESTAÑAS */}
                    <div className="flex gap-6 relative z-10 overflow-x-auto custom-scrollbar">
                        <button
                            onClick={() => setActiveTab('muro')}
                            className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'muro' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <MessageSquare size={14} /> Muro / Avisos
                        </button>
                        <button
                            onClick={() => setActiveTab('clases')}
                            className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'clases' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Calendar size={14} /> Próximas Clases
                        </button>
                        <button
                            onClick={() => setActiveTab('miembros')}
                            className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'miembros' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Users size={14} /> Integrantes
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">

                {/* 🚀 CARTEL DE DEUDA COMPAÑÍA (Adaptado para Proyecto Staff) */}
                {deboCompania && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="font-black text-blue-500 uppercase text-xs tracking-widest mb-1">Cuota de Compañía Pendiente</h4>
                                {esProyectoStaff ? (
                                    <p className="text-gray-400 text-[10px] sm:text-xs">Aboná la cuota de este mes <strong className="text-white">por transferencia o en efectivo en la recepción del estudio</strong>.</p>
                                ) : (
                                    <p className="text-gray-400 text-[10px] sm:text-xs">Aboná la cuota de este mes para mantener tu lugar en el grupo.</p>
                                )}
                            </div>
                        </div>

                        {/* 🚀 Botón visible SOLO si NO es Proyecto Staff */}
                        {!esProyectoStaff && (
                            <button onClick={generarLinkPagoCompania} disabled={procesandoPago} className="shrink-0 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                                {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : <><Coins size={14} /> Pagar Cuota</>}
                            </button>
                        )}
                    </div>
                )}

                {/* 1. PESTAÑA: MURO / AVISOS */}
                {activeTab === 'muro' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 flex items-start gap-4">
                            <Info className="text-blue-400 shrink-0 mt-1" size={20} />
                            <div>
                                <h3 className="text-blue-400 font-black uppercase text-xs tracking-widest mb-1">Foco de la Compañía</h3>
                                <p className="text-sm text-blue-100/70 leading-relaxed">{compania.descripcion || 'Este grupo no tiene una descripción definida aún.'}</p>
                            </div>
                        </div>

                        {hasCoordinatorPowers ? (
                            <div className="bg-[#111] border border-white/5 rounded-3xl p-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                                <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-4 relative z-10">
                                    <MessageSquare size={18} className="text-blue-500" /> Publicar en el Muro (A todos)
                                </h3>
                                <form onSubmit={handleSendGlobalNotif} className="relative z-10 space-y-4">
                                    <textarea
                                        required
                                        value={notifMessage}
                                        onChange={e => setNotifMessage(e.target.value)}
                                        placeholder="Escribí un aviso para todos los integrantes de la compañía..."
                                        className="w-full bg-[#09090b] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-blue-500 min-h-[120px] resize-none transition-colors"
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            disabled={sendingNotif}
                                            type="submit"
                                            className="w-full md:w-auto px-8 py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-blue-500 transition-colors shadow-lg"
                                        >
                                            {sendingNotif ? <Loader2 className="animate-spin" /> : <><Send size={16} /> Enviar a {miembros.length} Alumnos</>}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        ) : (
                            <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                                <MessageSquare size={32} className="mx-auto mb-3 text-gray-600" />
                                <p className="text-gray-500 font-bold uppercase text-sm">El muro de avisos</p>
                                <p className="text-xs text-gray-600 mt-1">Los coordinadores publicarán información importante acá.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* 2. PESTAÑA: CLASES */}
                {activeTab === 'clases' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {clases.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {clases.map((clase) => {
                                    const [fechaParte, horaParte] = clase.inicio.split('T')
                                    const horaDisplay = horaParte ? horaParte.substring(0, 5) : ''
                                    const dateObj = new Date(`${fechaParte}T12:00:00`)
                                    const esHoy = isToday(dateObj)
                                    const [finFecha, finHora] = clase.fin.split('T')
                                    const finDisplay = finHora ? finHora.substring(0, 5) : ''

                                    return (
                                        <div key={clase.id} className="bg-[#111] border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/30 transition-all group flex flex-col">
                                            <div className="h-32 w-full relative bg-[#1a1a1c] border-b border-white/5 flex items-center justify-center overflow-hidden">
                                                {clase.imagen_url ? (
                                                    <Image src={clase.imagen_url} alt={clase.nombre} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                                                ) : (
                                                    <ImageIcon size={24} className="text-white/20" />
                                                )}
                                                {esHoy && <span className="absolute top-3 left-3 bg-blue-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg shadow-blue-500/40">⚡ Hoy</span>}
                                            </div>

                                            <div className="p-5 flex-1">
                                                <h4 className="font-black uppercase text-white mb-1 truncate text-lg">{clase.nombre}</h4>
                                                <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-4">
                                                    <User size={12} className="text-blue-400" /> {clase.profesor?.nombre_completo}
                                                </p>
                                                <div className="space-y-2 border-t border-white/5 pt-4">
                                                    <p className="text-[10px] uppercase font-bold text-gray-500">Próximo Ensayo:</p>
                                                    <div className="flex items-center gap-3 text-xs text-gray-300 font-bold">
                                                        <Calendar size={14} className="text-blue-400" />
                                                        <span className="capitalize">{format(dateObj, "EEEE d MMMM", { locale: es })}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                                        <Clock size={14} className="text-white/30" />
                                                        <span>{horaDisplay} a {finDisplay} hs</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                                        <MapPin size={14} className="text-white/30" />
                                                        <span>{clase.sala?.nombre} <span className="text-[9px] opacity-50 uppercase border border-white/20 px-1 rounded ml-1">Sede {clase.sala?.sede?.nombre}</span></span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-4 bg-[#09090b] border-t border-white/5 mt-auto">
                                                <Link href={hasCoordinatorPowers || ['recepcion', 'admin'].includes(userRole || '') ? `/clase/${clase.id}` : `/mis-clases`} className="w-full bg-blue-600/10 text-blue-400 border border-blue-600/20 py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">
                                                    {hasCoordinatorPowers || ['recepcion', 'admin'].includes(userRole || '') ? 'Gestionar / Lista' : 'Ir a Mis Clases'} <ChevronRight size={14} />
                                                </Link>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                                <Calendar size={32} className="mx-auto mb-3 text-gray-600" />
                                <p className="text-gray-500 font-bold uppercase text-sm">Sin clases programadas</p>
                                <p className="text-xs text-gray-600 mt-1">Las clases creadas en la agenda para este grupo aparecerán acá.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. PESTAÑA: MIEMBROS (BLINDADA PARA ALUMNOS 🛡️) */}
                {activeTab === 'miembros' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {miembros.length > 0 ? (
                                miembros.map((miembro) => (
                                    <div key={miembro.id} className="bg-[#111] border border-white/5 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-blue-500/30 transition-colors">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4 overflow-hidden">
                                                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-black text-sm uppercase shrink-0 border border-blue-500/20">
                                                    {miembro.nombre_completo?.[0] || '?'}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-white uppercase truncate">{miembro.nombre_completo}</p>
                                                    {/* El email ahora es privado */}
                                                    {hasCoordinatorPowers && <p className="text-[10px] text-gray-500 truncate">{miembro.email}</p>}
                                                </div>
                                            </div>

                                            {hasCoordinatorPowers && (
                                                <button
                                                    onClick={() => openIndividualModal(miembro)}
                                                    className="p-2.5 bg-white/5 text-gray-400 hover:text-white hover:bg-blue-600 rounded-xl transition-all"
                                                    title={`Enviar aviso a ${miembro.nombre_completo}`}
                                                >
                                                    <BellRing size={14} />
                                                </button>
                                            )}
                                        </div>

                                        {/* 🚀 Toda la info financiera y de becas ahora es privada y SOLO sobre la compañía */}
                                        {hasCoordinatorPowers && (
                                            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                                                {(miembro.porcentaje_beca ?? 0) > 0 && (
                                                    <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                                        <Percent size={10} /> Beca {miembro.porcentaje_beca}%
                                                    </span>
                                                )}

                                                <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${miembro.pago_compania_al_dia ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                                    {miembro.pago_compania_al_dia ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                                    Cía {miembro.pago_compania_al_dia ? 'Al Día' : 'Pendiente'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                                    <UsersRound size={32} className="mx-auto mb-3 text-gray-600" />
                                    <p className="text-gray-500 font-bold uppercase text-sm">Grupo sin integrantes</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL: AVISO INDIVIDUAL */}
            {isIndividualNotifOpen && selectedAlumno && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsIndividualNotifOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase flex items-center gap-2"><BellRing className="text-blue-500" size={18} /> Aviso Directo</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Para: {selectedAlumno.nombre_completo}</p>
                            </div>
                            <button onClick={() => setIsIndividualNotifOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>

                        <form onSubmit={handleSendIndividualNotif} className="space-y-4">
                            <textarea
                                required
                                value={individualMessage}
                                onChange={e => setIndividualMessage(e.target.value)}
                                placeholder={`Escribí un mensaje solo para ${selectedAlumno.nombre_completo}...`}
                                className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-blue-500 min-h-[120px] resize-none transition-colors"
                            />
                            <button disabled={sendingNotif} type="submit" className="w-full bg-blue-600 text-white font-black uppercase py-4 rounded-xl hover:bg-blue-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg">
                                {sendingNotif ? <Loader2 className="animate-spin" /> : <><Send size={16} /> Enviar Mensaje</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    )
}