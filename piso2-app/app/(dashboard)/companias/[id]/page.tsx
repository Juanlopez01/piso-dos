'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Loader2, UsersRound, Shield, ArrowLeft,
    MessageSquare, Calendar, Users, Info,
    Clock, MapPin, User, ChevronRight, Image as ImageIcon,
    Send, BellRing, X, Percent, CheckCircle2, AlertCircle, Coins,
    CalendarDays
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
    porcentaje_beca_compania?: number
    pago_compania_al_dia?: boolean
    totalAbonado?: number
    saldoPendiente?: number
    saldoPendienteEfectivo?: number // 🚀 Nuevo
    precioFinal?: number
    precioEfectivo?: number // 🚀 Nuevo
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

    // 🚀 ESTADOS MÁQUINA DEL TIEMPO (GLOBAL DEL PADRÓN)
    const [mesDashboard, setMesDashboard] = useState(new Date().getMonth() + 1)
    const [anioDashboard, setAnioDashboard] = useState(new Date().getFullYear())

    // Estados para Muro
    const [notifMessage, setNotifMessage] = useState('')
    const [sendingNotif, setSendingNotif] = useState(false)

    // Estados para Notificación Individual
    const [isIndividualNotifOpen, setIsIndividualNotifOpen] = useState(false)
    const [selectedAlumno, setSelectedAlumno] = useState<Miembro | null>(null)
    const [individualMessage, setIndividualMessage] = useState('')

    // 🚀 Estados para Registrar Pagos/Señas
    const [isPagoModalOpen, setIsPagoModalOpen] = useState(false)
    const [alumnoPago, setAlumnoPago] = useState<Miembro | null>(null)
    const [montoPago, setMontoPago] = useState<number | ''>('')
    const [metodoPago, setMetodoPago] = useState('efectivo')
    const [pagoMes, setPagoMes] = useState(mesDashboard)
    const [pagoAnio, setPagoAnio] = useState(anioDashboard)
    const [registrandoPago, setRegistrandoPago] = useState(false)

    const [procesandoPago, setProcesandoPago] = useState(false)

    // 🚀 RECARGAR CUANDO CAMBIA EL MES
    useEffect(() => {
        if (!loadingContext) {
            verificarAccesoYCargar()
        }
    }, [loadingContext, params.id, mesDashboard, anioDashboard])

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
            toast.error('El grupo no existe')
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
            toast.error('Acceso denegado. No perteneces a este grupo.')
            router.replace('/companias')
            return
        }

        const { data: dataMiembros } = await supabase
            .from('perfiles_companias')
            .select('perfil:profiles(id, nombre_completo, email, porcentaje_beca_compania)')
            .eq('compania_id', companiaId)

        const { data: config } = await supabase.from('configuraciones').select('valor').eq('clave', `cuota_compania_${companiaId}`).maybeSingle()
        const precioBase = config?.valor ? Number(config.valor) : 15000

        if (dataMiembros) {
            let miembrosData = dataMiembros.map((m: any) => m.perfil).filter(Boolean)

            // 🚀 APLICAMOS LA MÁQUINA DEL TIEMPO
            const mesActual = mesDashboard
            const anioActual = anioDashboard

            const { data: pagosCia } = await supabase
                .from('companias_pagos')
                .select('alumno_id, monto')
                .eq('compania_id', companiaId)
                .eq('mes', mesActual)
                .eq('anio', anioActual)

            const miembrosCompletos = miembrosData.map((m: any) => {
                const totalAbonado = pagosCia?.filter((p: { alumno_id: string; monto: number | string }) => p.alumno_id === m.id).reduce((acc: number, curr: { monto: number | string }) => acc + Number(curr.monto), 0) || 0
                const beca = m.porcentaje_beca_compania || 0

                // 🚀 LÓGICA DE PRECIO EFECTIVO (DESCUENTO INVERTIDO 110 -> 100)
                const precioFinal = precioBase - (precioBase * beca / 100) // Transferencia
                const precioEfectivo = Math.round(precioFinal / 1.1) // Efectivo (-10% de recargo)

                // 🚀 SALDOS SEPARADOS
                const saldoPendiente = Math.max(0, precioFinal - totalAbonado) // Deuda Transf
                const saldoPendienteEfectivo = Math.max(0, precioEfectivo - totalAbonado) // Deuda Efvo

                // Está al día si pagó el total en efectivo o en transferencia
                const alDia = saldoPendiente <= 0 || saldoPendienteEfectivo <= 0

                return {
                    ...m,
                    totalAbonado,
                    saldoPendiente,
                    saldoPendienteEfectivo,
                    precioFinal,
                    precioEfectivo,
                    pago_compania_al_dia: alDia
                }
            })

            miembrosCompletos.sort((a: any, b: any) => (a.nombre_completo || '').localeCompare(b.nombre_completo || ''))
            setMiembros(miembrosCompletos)
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

    // 🚀 LÓGICA PARA REGISTRAR SEÑA / PAGO MANUAL 
    const openPagoModal = (alumno: Miembro) => {
        setAlumnoPago(alumno)
        setMetodoPago('efectivo') // Sugerimos efectivo por defecto
        setMontoPago(alumno.saldoPendienteEfectivo || 0) // Mostramos deuda de efectivo
        setPagoMes(mesDashboard)
        setPagoAnio(anioDashboard)
        setIsPagoModalOpen(true)
    }

    const handleRegistrarPago = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!alumnoPago || !montoPago || Number(montoPago) <= 0) return
        setRegistrandoPago(true)

        try {
            // 1. Verificamos si ya existe un registro de pago para este MES (Seleccionado en el modal)
            const { data: pagoExistente, error: errorBusqueda } = await supabase
                .from('companias_pagos')
                .select('id, monto')
                .eq('alumno_id', alumnoPago.id)
                .eq('compania_id', compania?.id)
                .eq('mes', pagoMes)
                .eq('anio', pagoAnio)
                .maybeSingle()

            if (errorBusqueda) throw errorBusqueda

            if (pagoExistente) {
                const { error: errorUpdate } = await supabase
                    .from('companias_pagos')
                    .update({
                        monto: Number(pagoExistente.monto) + Number(montoPago),
                        metodo_pago: metodoPago
                    })
                    .eq('id', pagoExistente.id)

                if (errorUpdate) throw errorUpdate
            } else {
                const { error: errorInsert } = await supabase.from('companias_pagos').insert([{
                    alumno_id: alumnoPago.id,
                    compania_id: compania?.id,
                    mes: pagoMes,
                    anio: pagoAnio,
                    monto: Number(montoPago),
                    metodo_pago: metodoPago
                }])

                if (errorInsert) throw errorInsert
            }

            // 2. Anotamos en caja (solo si el recepcionista tiene una abierta)
            const { data: turnoActivo } = await supabase.from('caja_turnos').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()

            if (turnoActivo) {
                const { error: errorCaja } = await supabase.from('caja_movimientos').insert([{
                    turno_id: turnoActivo.id,
                    tipo: 'ingreso',
                    concepto: `Seña/Cuota Grupo (${pagoMes}/${pagoAnio}): ${compania?.nombre} - ${alumnoPago.nombre_completo}`,
                    monto: Number(montoPago),
                    metodo_pago: metodoPago,
                    origen_referencia: 'compania'
                }])

                if (errorCaja) throw errorCaja
                toast.success('Pago y movimiento de caja registrados correctamente')
            } else {
                toast.warning('Pago guardado al alumno, pero NO se anotó en caja (no hay turno abierto).')
            }

            setIsPagoModalOpen(false)
            verificarAccesoYCargar()
        } catch (err: any) {
            toast.error(`Error DB: ${err.message || 'Desconocido'}`)
        } finally {
            setRegistrandoPago(false)
        }
    }

    const generarLinkPagoCompania = async () => {
        setProcesandoPago(true)
        try {
            // El alumno que paga online siempre paga el saldo de transferencia
            const miPerfilCalculado = miembros.find(m => m.id === userId)
            const saldoACobrar = miPerfilCalculado?.saldoPendiente || 15000

            const res = await fetch('/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo: `Cuota/Saldo ${compania?.nombre} - Mes ${mesDashboard}/${anioDashboard}`,
                    precio: saldoACobrar,
                    userId: userId,
                    tipo_pago: 'cuota_compania',
                    productoId: compania?.id,
                    mes: mesDashboard,
                    anio: anioDashboard
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

    const miPerfilInfo = miembros.find(m => m.id === userId)
    const deboCompania = !miPerfilInfo?.pago_compania_al_dia && userRole === 'alumno'
    const esProyectoStaff = compania.nombre.toLowerCase().trim() === 'proyecto staff'

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24 selection:bg-blue-500 selection:text-white animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER DE LA COMPAÑÍA */}
            <div className="bg-[#09090b] border-b border-white/5 pt-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

                <div className="max-w-4xl mx-auto px-4 md:px-8">
                    <Link href="/companias" className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors mb-6 relative z-10">
                        <ArrowLeft size={14} /> Volver a Grupos
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

                {/* 🚀 CARTEL DE DEUDA INTELIGENTE */}
                {deboCompania && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="font-black text-blue-500 uppercase text-xs tracking-widest mb-1">Cuota de Grupo Pendiente</h4>
                                {esProyectoStaff ? (
                                    <p className="text-gray-400 text-[10px] sm:text-xs">Aboná tu saldo de <strong className="text-white">${miPerfilInfo?.saldoPendienteEfectivo} (Efectivo) o ${miPerfilInfo?.saldoPendiente} (Transferencia)</strong> en la recepción.</p>
                                ) : (
                                    <p className="text-gray-400 text-[10px] sm:text-xs">
                                        Tenés un saldo pendiente de <strong className="text-white">${miPerfilInfo?.saldoPendienteEfectivo} (Efectivo) o ${miPerfilInfo?.saldoPendiente} (Transf)</strong>. Aboná para mantener tu lugar.
                                    </p>
                                )}
                            </div>
                        </div>

                        {!esProyectoStaff && (
                            <button onClick={generarLinkPagoCompania} disabled={procesandoPago} className="shrink-0 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                                {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : <><Coins size={14} /> Pagar ${miPerfilInfo?.saldoPendiente}</>}
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
                                <h3 className="text-blue-400 font-black uppercase text-xs tracking-widest mb-1">Foco del Grupo</h3>
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
                                        placeholder="Escribí un aviso para todos los integrantes..."
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
                                                <Link href={hasCoordinatorPowers ? `/clase/${clase.id}` : `/mis-clases`} className="w-full bg-blue-600/10 text-blue-400 border border-blue-600/20 py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">
                                                    {hasCoordinatorPowers ? 'Gestionar / Lista' : 'Ir a Mis Clases'} <ChevronRight size={14} />
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

                {/* 3. PESTAÑA: MIEMBROS */}
                {activeTab === 'miembros' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* 🚀 MÁQUINA DEL TIEMPO (Solo Staff) */}
                        {hasCoordinatorPowers && (
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                                <h3 className="text-lg font-black uppercase text-white flex items-center gap-2"><Users size={20} className="text-blue-500" /> Padrón y Cobros</h3>
                                <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-1.5 rounded-xl shadow-inner w-fit">
                                    <CalendarDays size={16} className="text-gray-500 ml-2" />
                                    <select value={mesDashboard} onChange={e => setMesDashboard(Number(e.target.value))} className="bg-transparent text-white text-xs font-bold uppercase outline-none cursor-pointer appearance-none px-2 py-1">
                                        {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => (
                                            <option key={i + 1} value={i + 1} className="bg-[#111] text-white">{m}</option>
                                        ))}
                                    </select>
                                    <span className="text-gray-600">/</span>
                                    <select value={anioDashboard} onChange={e => setAnioDashboard(Number(e.target.value))} className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer appearance-none px-2 py-1">
                                        {[2025, 2026, 2027].map(y => (
                                            <option key={y} value={y} className="bg-[#111] text-white">{y}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {miembros.length > 0 ? (
                                miembros.map((miembro) => (
                                    <div key={miembro.id} className="bg-[#111] border border-white/5 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-blue-500/30 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-4 overflow-hidden">
                                                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-black text-sm uppercase shrink-0 border border-blue-500/20">
                                                    {miembro.nombre_completo?.[0] || '?'}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-white uppercase truncate">{miembro.nombre_completo}</p>
                                                    {hasCoordinatorPowers && <p className="text-[10px] text-gray-500 truncate">{miembro.email}</p>}
                                                </div>
                                            </div>

                                            {hasCoordinatorPowers && (
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {/* 🚀 BOTÓN NUEVO: REGISTRAR PAGO/SEÑA */}
                                                    <button
                                                        onClick={() => openPagoModal(miembro)}
                                                        className="p-2.5 bg-white/5 text-gray-400 hover:text-white hover:bg-emerald-600 rounded-xl transition-all border border-transparent hover:border-emerald-500/30"
                                                        title={`Anotar pago de ${miembro.nombre_completo}`}
                                                    >
                                                        <Coins size={14} />
                                                    </button>

                                                    <button
                                                        onClick={() => openIndividualModal(miembro)}
                                                        className="p-2.5 bg-white/5 text-gray-400 hover:text-white hover:bg-blue-600 rounded-xl transition-all"
                                                        title={`Enviar aviso a ${miembro.nombre_completo}`}
                                                    >
                                                        <BellRing size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* 🚀 INFO FINANCIERA (SOLO PARA STAFF) */}
                                        {hasCoordinatorPowers && (
                                            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5 mt-2">
                                                {(miembro.porcentaje_beca_compania ?? 0) > 0 && (
                                                    <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                                        <Percent size={10} /> Beca {miembro.porcentaje_beca_compania}%
                                                    </span>
                                                )}

                                                <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${miembro.pago_compania_al_dia ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                                                    <Coins size={10} /> Abonó ${miembro.totalAbonado}
                                                </span>

                                                {!miembro.pago_compania_al_dia ? (
                                                    <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                                        <AlertCircle size={10} /> Debe Efvo: ${miembro.saldoPendienteEfectivo} | Transf: ${miembro.saldoPendiente}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                                        <CheckCircle2 size={10} /> Al Día
                                                    </span>
                                                )}
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

            {/* 🚀 MODAL: REGISTRAR PAGO/SEÑA */}
            {isPagoModalOpen && alumnoPago && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsPagoModalOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase flex items-center gap-2"><Coins className="text-emerald-500" size={18} /> Registrar Pago</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Alumno: {alumnoPago.nombre_completo}</p>
                            </div>
                            <button onClick={() => setIsPagoModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>

                        <form onSubmit={handleRegistrarPago} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Mes</label>
                                    <select value={pagoMes} onChange={e => setPagoMes(Number(e.target.value))} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors cursor-pointer">
                                        {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                                            <option key={i + 1} value={i + 1}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Año</label>
                                    <select value={pagoAnio} onChange={e => setPagoAnio(Number(e.target.value))} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors cursor-pointer">
                                        {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Método de Pago</label>
                                <select
                                    value={metodoPago}
                                    onChange={e => {
                                        const newMethod = e.target.value;
                                        setMetodoPago(newMethod);
                                        // 🚀 AUTO-ACTUALIZAR MONTO SUGERIDO
                                        if (alumnoPago) {
                                            setMontoPago(newMethod === 'efectivo' ? (alumnoPago.saldoPendienteEfectivo || 0) : (alumnoPago.saldoPendiente || 0));
                                        }
                                    }}
                                    className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors appearance-none"
                                >
                                    <option value="efectivo">Efectivo (Recepción)</option>
                                    <option value="transferencia">Transferencia Bancaria</option>
                                    <option value="mercadopago_manual">Mercado Pago (QR Físico)</option>
                                    <option value="otro">Otro</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Monto a Registrar ($)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={montoPago}
                                        onChange={e => setMontoPago(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white font-black outline-none focus:border-emerald-500 transition-colors"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-500 text-right mt-1">Saldo sugerido: Efvo ${alumnoPago.saldoPendienteEfectivo} / Otros ${alumnoPago.saldoPendiente}</p>
                            </div>

                            <button disabled={registrandoPago} type="submit" className="w-full bg-emerald-600 text-white font-black uppercase py-4 rounded-xl hover:bg-emerald-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg mt-4">
                                {registrandoPago ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={16} /> Guardar Registro</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

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