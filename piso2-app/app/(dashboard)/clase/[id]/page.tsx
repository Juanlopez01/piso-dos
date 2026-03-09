'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    ArrowLeft, Calendar, Clock, User, Check, X,
    DollarSign, FileText, UserPlus, Trash2, AlertTriangle,
    Wallet, CreditCard, Loader2, Users, Star, Ticket, Package,
    BookOpen, BellRing, Send
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'

// --- TIPOS ---
type Inscripcion = {
    id: string
    user_id: string | null
    user: { nombre: string; apellido: string; nombre_completo?: string; email: string } | null
    nombre_invitado: string | null
    modalidad: string
    valor_credito: number
    presente: boolean
    metodo_pago: string
    es_invitado: boolean
}

type ClaseDetalle = {
    id: string
    nombre: string
    inicio: string
    fin: string
    profesor: { nombre_completo: string; email: string; id: string }
    sala: { nombre: string; sede: { nombre: string } }
    tipo_acuerdo: 'porcentaje' | 'fijo'
    valor_acuerdo: number
    tipo_clase: 'Regular' | 'Especial'
    estado: 'activa' | 'cancelada'
}

type ProductoPack = {
    id: string
    nombre: string
    precio: number
    creditos: number
    tipo_clase: string
}

export default function ClaseDetallePage() {
    const params = useParams()
    const router = useRouter()
    const supabase = createClient()

    const [clase, setClase] = useState<ClaseDetalle | null>(null)
    const [inscripciones, setInscripciones] = useState<Inscripcion[]>([])
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState<string>('profesor')

    // Estado para los packs
    const [packsDisponibles, setPacksDisponibles] = useState<ProductoPack[]>([])

    // --- ESTADOS PARA EL BUSCADOR DE ALUMNOS ---
    const [busquedaAlumno, setBusquedaAlumno] = useState('')
    const [resultadosBusqueda, setResultadosBusqueda] = useState<any[]>([])
    const [buscando, setBuscando] = useState(false)
    const [alumnoSeleccionado, setAlumnoSeleccionado] = useState<any | null>(null)

    // Modales
    const [isGuestOpen, setIsGuestOpen] = useState(false)
    const [processing, setProcessing] = useState(false)

    // Modal de Notificaciones
    const [isNotifModalOpen, setIsNotifModalOpen] = useState(false)
    const [notifMessage, setNotifMessage] = useState('')
    const [sendingNotif, setSendingNotif] = useState(false)

    // Form Registro Rápido
    const [guestForm, setGuestForm] = useState({
        nombre: '', apellido: '', email: '', telefono: '', dni: '',
        tipo: 'suelta' as 'suelta' | 'pack' | 'invitado' | 'usar_credito',
        pago: 'efectivo' as 'efectivo' | 'transferencia',
        packSeleccionadoId: ''
    })

    // Finanzas
    const [totalRecaudado, setTotalRecaudado] = useState(0)
    const [pagoDocente, setPagoDocente] = useState(0)

    const PRECIOS_ALUMNO = {
        Regular: { efectivo: 14000, transferencia: 15000 },
        Especial: { efectivo: 16000, transferencia: 18000 }
    }

    useEffect(() => { if (params.id) fetchData() }, [params.id])

    // --- CÁLCULO DE TOTALES Y SUELDO DEL PROFESOR ---
    useEffect(() => {
        if (!clase) return

        const totalClaseContable = inscripciones.reduce((acc, curr) => acc + (Number(curr.valor_credito) || 0), 0)

        setTotalRecaudado(totalClaseContable)

        if (clase.tipo_acuerdo === 'fijo') {
            setPagoDocente(clase.valor_acuerdo)
        } else {
            const porcentaje = clase.valor_acuerdo / 100
            setPagoDocente(totalClaseContable * porcentaje)
        }
    }, [inscripciones, clase])

    const fetchData = async () => {
        setLoading(true)
        const claseId = params.id as string
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
            if (profile) setUserRole(profile.rol)
        }

        const { data: dataClase } = await supabase.from('clases').select(`*, profesor:profiles(id, nombre_completo, email), sala:salas(nombre, sede:sedes(nombre))`).eq('id', claseId).single()

        const { data: dataInsc } = await supabase.from('inscripciones').select(`*, user:profiles(nombre, apellido, nombre_completo, email)`).eq('clase_id', claseId).order('created_at', { ascending: true })

        if (dataClase) {
            setClase(dataClase as any)
            const tipoPack = dataClase.tipo_clase === 'Especial' ? 'seminario' : 'regular'
            const { data: packs } = await supabase
                .from('productos')
                .select('*')
                .eq('activo', true)
                .eq('tipo_clase', tipoPack)
                .order('precio', { ascending: true })
            if (packs) setPacksDisponibles(packs)
        }

        if (dataInsc) setInscripciones(dataInsc as any)
        setLoading(false)
    }

    const toggleAsistencia = async (insc: Inscripcion) => {
        const newVal = !insc.presente
        setInscripciones(prev => prev.map(i => i.id === insc.id ? { ...i, presente: newVal } : i))
        await supabase.from('inscripciones').update({ presente: newVal }).eq('id', insc.id)
        if (newVal) toast.success('Presente')
    }

    const handleDeleteInscripcion = async (insc: Inscripcion) => {
        if (!confirm('¿Dar de baja a este alumno? Si usó un pack, el crédito volverá a su cuenta.')) return

        const nombreAlumno = insc.user?.nombre_completo || [insc.user?.nombre, insc.user?.apellido].filter(Boolean).join(' ') || insc.nombre_invitado || 'el alumno'

        // 1. Envolvemos la llamada en una Promesa real y la ejecutamos
        const promesaBaja = new Promise(async (resolve, reject) => {
            try {
                const { data, error } = await supabase.rpc('reembolsar_inscripcion', {
                    p_inscripcion_id: insc.id
                })

                if (error) throw new Error('Error de conexión con la base de datos.')
                if (!data.success) throw new Error(data.message)

                // Si todo salió bien, actualizamos la lista
                setInscripciones(prev => prev.filter(i => i.id !== insc.id))
                fetchData()

                resolve(data)
            } catch (err: any) {
                reject(err)
            }
        })

        // 2. Le pasamos la promesa ya viva al toast
        toast.promise(
            promesaBaja,
            {
                loading: (
                    <div className="flex flex-col gap-1">
                        <span className="font-bold text-white">Procesando baja de {nombreAlumno}...</span>
                        <span className="text-xs text-gray-400">Calculando reembolsos y actualizando liquidación.</span>
                    </div>
                ),
                success: (data: any) => (
                    <div className="flex flex-col gap-1">
                        <span className="font-bold text-white">¡Baja confirmada!</span>
                        <span className="text-xs text-gray-400">
                            {nombreAlumno} fue eliminado. {data.message.includes('devuelto') && 'Se reintegró 1 crédito a su cuenta.'}
                        </span>
                    </div>
                ),
                error: (err: any) => (
                    <div className="flex flex-col gap-1">
                        <span className="font-bold text-red-500">Error al procesar la baja</span>
                        <span className="text-xs text-gray-400">{err.message}</span>
                    </div>
                )
            }
        )
    }

    // --- FUNCIÓN DEL BUSCADOR EN VIVO ---
    useEffect(() => {
        const buscarAlumnos = async () => {
            if (busquedaAlumno.length < 3) {
                setResultadosBusqueda([])
                return
            }
            setBuscando(true)

            const term = `%${busquedaAlumno}%`
            const { data } = await supabase
                .from('profiles')
                .select('id, nombre, apellido, nombre_completo, email, dni, creditos_regulares, creditos_seminarios')
                .or(`nombre.ilike.${term},apellido.ilike.${term},email.ilike.${term},nombre_completo.ilike.${term}`)
                .eq('rol', 'alumno')
                .limit(5)

            if (data) setResultadosBusqueda(data)
            setBuscando(false)
        }

        const timeoutId = setTimeout(() => buscarAlumnos(), 300)
        return () => clearTimeout(timeoutId)
    }, [busquedaAlumno])

    const seleccionarAlumnoDelBuscador = (alumno: any) => {
        setAlumnoSeleccionado(alumno)
        setBusquedaAlumno('')
        setResultadosBusqueda([])

        const columnaRelevante = clase?.tipo_clase === 'Especial' ? 'creditos_seminarios' : 'creditos_regulares'
        const tieneSaldo = Number(alumno[columnaRelevante]) > 0

        setGuestForm(prev => ({
            ...prev,
            nombre: alumno.nombre || '',
            apellido: alumno.apellido || '',
            email: alumno.email || '',
            dni: alumno.dni || '',
            tipo: tieneSaldo ? 'usar_credito' : 'suelta'
        }))
    }

    const limpiarSeleccionAlumno = () => {
        setAlumnoSeleccionado(null)
        setGuestForm({
            nombre: '', apellido: '', email: '', telefono: '', dni: '',
            tipo: 'suelta', pago: 'efectivo', packSeleccionadoId: ''
        })
    }

    // --- LÓGICA PRINCIPAL DE INSCRIPCIÓN Y COBRO ---
    const handleAddGuest = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!clase) return

        if (guestForm.tipo === 'pack' && !guestForm.packSeleccionadoId) {
            return toast.error("Seleccioná un pack de la lista")
        }

        setProcessing(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("No estás logueado")

            // 1. Calcular plata en juego
            let montoACobrarEnCaja = 0
            if (guestForm.tipo === 'suelta') {
                const tipoKey = clase.tipo_clase === 'Especial' ? 'Especial' : 'Regular'
                const precios = PRECIOS_ALUMNO[tipoKey]
                montoACobrarEnCaja = guestForm.pago === 'efectivo' ? precios.efectivo : precios.transferencia
            } else if (guestForm.tipo === 'pack') {
                const packElegidoData = packsDisponibles.find(p => p.id === guestForm.packSeleccionadoId)
                if (packElegidoData) montoACobrarEnCaja = packElegidoData.precio
            }

            // 2. Control de Caja Fuerte
            let turnoId = null
            if (montoACobrarEnCaja > 0) {
                const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
                if (turno) {
                    turnoId = turno.id
                } else if (guestForm.pago === 'efectivo') {
                    throw new Error('¡Caja Cerrada! Abrí tu caja para cobrar en efectivo.')
                } else {
                    toast.warning('Registrando cobro digital sin caja física abierta.')
                }
            }

            // 3. Gestión del Alumno (Creación si no existe)
            let alumnoIdFinal = alumnoSeleccionado ? alumnoSeleccionado.id : null
            if (!alumnoIdFinal && guestForm.email) {
                const { data: usuarioExistente } = await supabase.from('profiles').select('id').eq('email', guestForm.email).maybeSingle()
                if (usuarioExistente) {
                    alumnoIdFinal = usuarioExistente.id
                } else if (guestForm.tipo === 'pack') {
                    if (!guestForm.dni) throw new Error("Para crear un nuevo alumno necesitás ingresar el DNI")
                    const res = await fetch('/api/admin/create-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: guestForm.email, password: guestForm.dni, nombre: guestForm.nombre,
                            apellido: guestForm.apellido, rol: 'alumno', telefono: guestForm.telefono, dni: guestForm.dni
                        })
                    })
                    if (!res.ok) throw new Error('Error al crear usuario en la API')

                    const { data: usuarioNuevo } = await supabase.from('profiles').select('id').eq('email', guestForm.email).maybeSingle()
                    if (usuarioNuevo?.id) alumnoIdFinal = usuarioNuevo.id
                    else throw new Error("Error al recuperar el perfil del nuevo alumno.")
                }
            }

            // 4. DISPARAMOS LA TRANSACCIÓN BLINDADA SQL
            const tipoClaseBD = clase.tipo_clase === 'Especial' ? 'seminario' : 'regular'
            const { data, error } = await supabase.rpc('procesar_inscripcion_recepcion', {
                p_clase_id: clase.id,
                p_user_id: alumnoIdFinal,
                p_nombre_invitado: !alumnoIdFinal ? `${guestForm.nombre} ${guestForm.apellido}`.trim() : null,
                p_tipo_operacion: guestForm.tipo,
                p_tipo_clase: tipoClaseBD,
                p_monto_caja: montoACobrarEnCaja,
                p_metodo_pago: guestForm.pago,
                p_turno_caja_id: turnoId,
                p_producto_id: guestForm.packSeleccionadoId || null,
                p_email_comprador: guestForm.email || null
            })

            if (error) throw new Error('Fallo de red al ejecutar transacción.')
            if (!data.success) throw new Error(data.message)

            // 5. Limpieza y Actualización Visual
            toast.success(data.message)
            fetchData() // Esto asegura que la lista, la caja y el pago del docente sean matemáticamente perfectos
            setIsGuestOpen(false)
            limpiarSeleccionAlumno()

        } catch (err: any) {
            console.error("Error al procesar:", err)
            toast.error(err.message || 'Error desconocido')
        } finally {
            setProcessing(false)
        }
    }

    // --- ENVIAR NOTIFICACIÓN A ALUMNOS ---
    const handleSendNotif = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!notifMessage.trim()) return

        setSendingNotif(true)
        try {
            // Filtramos solo los que tienen user_id (ignorar invitados manuales sin cuenta)
            const usuariosIdSet = new Set(inscripciones.map(i => i.user_id).filter(id => id !== null))
            const usuariosArray = Array.from(usuariosIdSet)

            if (usuariosArray.length === 0) {
                throw new Error("No hay alumnos con cuenta registrada en esta clase para enviar el aviso.")
            }

            const notificaciones = usuariosArray.map(uid => ({
                usuario_id: uid,
                titulo: `Aviso de clase: ${clase?.nombre}`,
                mensaje: notifMessage,
                leido: false,
                link: `/mis-clases`
            }))

            const { error } = await supabase.from('notificaciones').insert(notificaciones)

            if (error) throw error

            toast.success(`Aviso enviado a ${usuariosArray.length} alumno(s)`)
            setIsNotifModalOpen(false)
            setNotifMessage('')

        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSendingNotif(false)
        }
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-[#D4E655]"><Loader2 className="animate-spin" /></div>

    const tipoClaseKey = clase?.tipo_clase === 'Especial' ? 'Especial' : 'Regular'
    const preciosActuales = PRECIOS_ALUMNO[tipoClaseKey] || PRECIOS_ALUMNO.Regular

    let totalModal = 0
    if (guestForm.tipo === 'suelta') {
        totalModal = guestForm.pago === 'efectivo' ? preciosActuales.efectivo : preciosActuales.transferencia
    } else if (guestForm.tipo === 'pack' && guestForm.packSeleccionadoId) {
        const p = packsDisponibles.find(pack => pack.id === guestForm.packSeleccionadoId)
        totalModal = p ? p.precio : 0
    }

    const showFinance = userRole === 'admin' || userRole === 'recepcion'

    return (
        <div className="min-h-screen bg-[#050505] text-white p-2 md:p-8 pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col gap-4 mb-6 md:mb-8">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest px-2 w-fit">
                    <ArrowLeft size={16} /> Volver
                </button>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-6 gap-4 px-2">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${clase?.estado === 'cancelada' ? 'bg-red-500 text-white' : 'bg-[#D4E655] text-black'}`}>
                                {clase?.estado === 'cancelada' ? 'Cancelada' : 'Activa'}
                            </span>
                            <span className="text-gray-500 text-[10px] font-bold uppercase">{clase?.tipo_clase} • {clase?.sala?.nombre}</span>
                        </div>
                        <h1 className={`text-2xl md:text-5xl font-black uppercase tracking-tighter mb-1 leading-none ${clase?.estado === 'cancelada' ? 'text-gray-500 line-through' : 'text-white'}`}>
                            {clase?.nombre}
                        </h1>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-400 font-medium">
                            <span className="flex items-center gap-1"><Calendar size={12} className="text-[#D4E655]" /> {clase && format(new Date(clase.inicio), "EEE d", { locale: es })}</span>
                            <span className="flex items-center gap-1"><Clock size={12} className="text-[#D4E655]" /> {clase && format(new Date(clase.inicio), "HH:mm")}</span>
                            <span className="flex items-center gap-1"><User size={12} className="text-[#D4E655]" /> {clase?.profesor?.nombre_completo}</span>
                        </div>
                    </div>

                    {clase?.estado !== 'cancelada' && (
                        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                            {/* BOTÓN NUEVO: ENVIAR AVISO */}
                            <button onClick={() => setIsNotifModalOpen(true)} className="w-full md:w-auto bg-[#111] border border-white/10 text-white hover:border-[#D4E655] hover:text-[#D4E655] px-4 py-4 rounded-2xl font-black uppercase text-xs transition-all flex items-center justify-center gap-2">
                                <BellRing size={18} /> <span className="hidden md:inline">Enviar Aviso</span>
                            </button>

                            <button onClick={() => setIsGuestOpen(true)} className="w-full md:w-auto bg-[#D4E655] text-black px-6 py-4 rounded-2xl font-black uppercase text-xs hover:bg-white transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(212,230,85,0.2)]">
                                <UserPlus size={18} /> <span>Inscribir / Cobrar</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className={`grid grid-cols-1 ${showFinance ? 'lg:grid-cols-3' : 'lg:grid-cols-1 max-w-4xl mx-auto'} gap-8 px-2 md:px-0`}>

                {/* LISTA DE ALUMNOS */}
                <div className={showFinance ? "lg:col-span-2 space-y-4" : "space-y-4"}>
                    <div className="flex justify-between items-center px-1">
                        <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2"><Users size={18} className="text-[#D4E655]" /> Alumnos</h3>
                        <span className="text-[10px] font-bold bg-white/10 px-3 py-1 rounded-full">{inscripciones.length} Pax</span>
                    </div>
                    <div className="bg-[#09090b] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                        {inscripciones.length === 0 && <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase">No hay inscriptos aún.</div>}
                        {inscripciones.map((insc) => (
                            <div key={insc.id} className={`p-4 border-b border-white/5 flex items-center justify-between gap-3 ${insc.presente ? 'bg-[#D4E655]/5' : ''}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-white text-sm md:text-lg leading-tight truncate flex items-center gap-2">
                                        {insc.user?.nombre_completo || [insc.user?.nombre, insc.user?.apellido].filter(Boolean).join(' ') || insc.nombre_invitado || 'Alumno Sin Nombre'}
                                        {insc.es_invitado && <span className="text-[8px] bg-purple-500 text-white px-1.5 py-0.5 rounded uppercase">Guest</span>}
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] md:text-xs text-gray-500 font-bold uppercase mt-1">
                                        <span>{insc.modalidad}</span>
                                        {showFinance && insc.modalidad !== 'Uso de Crédito Activo' && insc.valor_credito > 0 && (
                                            <>
                                                <span className="text-white/20">•</span>
                                                <span className={insc.metodo_pago === 'efectivo' ? 'text-[#D4E655]' : 'text-blue-400'} title="Valor Contable Liquidado">
                                                    ${Number(insc.valor_credito).toLocaleString()}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => toggleAsistencia(insc)} className={`h-11 px-4 md:px-6 rounded-xl flex items-center justify-center gap-2 border transition-all ${insc.presente ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-transparent text-gray-600 border-white/10'}`}>
                                        {insc.presente ? <Check size={20} strokeWidth={3} /> : <X size={20} />}
                                        <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">{insc.presente ? 'Presente' : 'Ausente'}</span>
                                    </button>
                                    {showFinance && <button onClick={() => handleDeleteInscripcion(insc)} className="text-gray-600 hover:text-red-500 p-2"><Trash2 size={18} /></button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* SIDEBAR FINANCIERO */}
                {showFinance && (
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 shadow-2xl sticky top-8">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6">Liquidación Clase</h4>
                            <div className="space-y-4 mb-8 text-xs font-bold uppercase">
                                <div className="flex justify-between items-center text-gray-400">
                                    <span>Total Contable</span>
                                    <span className="text-white">${totalRecaudado.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-gray-400">
                                    <span>Acuerdo</span>
                                    <span className="text-[#D4E655]">
                                        {clase?.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : 'Fijo'}
                                    </span>
                                </div>
                            </div>
                            <div className="bg-[#D4E655] rounded-2xl p-6 text-center shadow-[0_0_20px_rgba(212,230,85,0.15)]">
                                <p className="text-[9px] font-black uppercase tracking-widest text-black/60 mb-1">Pago Docente</p>
                                <div className="text-4xl font-black text-black tracking-tighter">${pagoDocente.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL NOTIFICACIONES (NUEVO) */}
            {isNotifModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setIsNotifModalOpen(false)}>
                    <div className="bg-[#09090b] border border-[#D4E655]/30 w-full max-w-md rounded-3xl p-6 md:p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                                    <BellRing className="text-[#D4E655]" size={24} /> Enviar Aviso
                                </h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Llegará a {inscripciones.filter(i => i.user_id).length} alumnos anotados.</p>
                            </div>
                            <button onClick={() => setIsNotifModalOpen(false)} className="text-gray-500 hover:text-white p-2"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSendNotif} className="space-y-4">
                            <textarea
                                required
                                autoFocus
                                value={notifMessage}
                                onChange={e => setNotifMessage(e.target.value)}
                                placeholder="Ej: Chicas, hoy vamos a usar elementos, traigan rodilleras..."
                                className="w-full h-32 bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655] resize-none"
                            />

                            <button disabled={sendingNotif} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl text-xs tracking-widest shadow-xl hover:bg-white transition-all disabled:opacity-50 flex justify-center items-center gap-2">
                                {sendingNotif ? <Loader2 className="animate-spin" size={16} /> : <><Send size={16} /> Enviar Notificación</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL INSCRIPCIÓN RÁPIDA (Sin Cambios) */}
            {isGuestOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setIsGuestOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <h3 className="text-2xl font-black text-white uppercase text-center mb-6 tracking-tighter">Inscripción / Cobro</h3>

                        <form onSubmit={handleAddGuest} className="space-y-5">
                            {/* --- BUSCADOR INTELIGENTE --- */}
                            {!alumnoSeleccionado ? (
                                <div className="space-y-1 relative">
                                    <label className="text-[10px] font-bold text-[#D4E655] uppercase ml-1 flex items-center justify-between">
                                        Buscar Alumno Existente
                                        <span className="text-gray-500 text-[8px]">(O completá manual abajo)</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            placeholder="Tipeá nombre, apellido o email..."
                                            value={busquedaAlumno}
                                            onChange={e => setBusquedaAlumno(e.target.value)}
                                            className="w-full bg-[#111] border border-[#D4E655]/30 rounded-xl p-4 text-white outline-none focus:border-[#D4E655] transition-colors"
                                        />
                                        {buscando && <Loader2 size={16} className="absolute right-4 top-4 animate-spin text-gray-500" />}
                                    </div>

                                    {/* Resultados Desplegables */}
                                    {resultadosBusqueda.length > 0 && (
                                        <div className="absolute z-10 w-full mt-2 bg-[#1a1a1c] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                                            {resultadosBusqueda.map(alum => (
                                                <div
                                                    key={alum.id}
                                                    onClick={() => seleccionarAlumnoDelBuscador(alum)}
                                                    className="p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer flex justify-between items-center group"
                                                >
                                                    <div>
                                                        <p className="text-xs font-bold text-white uppercase">
                                                            {alum.nombre_completo || [alum.nombre, alum.apellido].filter(Boolean).join(' ') || 'Sin Nombre'}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500">{alum.email}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${clase?.tipo_clase === 'Especial'
                                                            ? (alum.creditos_seminarios > 0 ? 'bg-purple-500 text-white' : 'bg-white/5 text-gray-500')
                                                            : (alum.creditos_regulares > 0 ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-gray-500')
                                                            }`}>
                                                            {clase?.tipo_clase === 'Especial' ? alum.creditos_seminarios || 0 : alum.creditos_regulares || 0} Créditos
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // Tarjeta de Alumno Seleccionado
                                <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 p-4 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-[#D4E655] text-black font-black flex items-center justify-center shrink-0">
                                            {alumnoSeleccionado.nombre_completo?.[0] || alumnoSeleccionado.nombre?.[0] || '?'}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-white uppercase">
                                                {alumnoSeleccionado.nombre_completo || [alumnoSeleccionado.nombre, alumnoSeleccionado.apellido].filter(Boolean).join(' ') || 'Sin Nombre'}
                                            </p>
                                            <div className="flex gap-2 mt-1">
                                                <span className="text-[9px] font-bold text-gray-400 bg-white/5 px-1.5 rounded uppercase">Reg: {alumnoSeleccionado.creditos_regulares || 0}</span>
                                                <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 px-1.5 rounded uppercase">Sem: {alumnoSeleccionado.creditos_seminarios || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button type="button" onClick={limpiarSeleccionAlumno} className="text-gray-500 hover:text-white p-2">
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* --- OPCIONES DE MODALIDAD --- */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Modalidad de Ingreso</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {alumnoSeleccionado && (
                                        <button
                                            type="button"
                                            disabled={(clase?.tipo_clase === 'Especial' ? alumnoSeleccionado.creditos_seminarios : alumnoSeleccionado.creditos_regulares) <= 0}
                                            onClick={() => setGuestForm({ ...guestForm, tipo: 'usar_credito', packSeleccionadoId: '' })}
                                            className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed
                                                ${guestForm.tipo === 'usar_credito' ? 'bg-[#D4E655] border-[#D4E655] text-black' : 'bg-[#111] border-white/5 text-gray-500'}`}
                                        >
                                            <BookOpen size={18} />
                                            <span className="text-[8px] font-black uppercase text-center leading-tight">Usar<br />Crédito</span>
                                        </button>
                                    )}

                                    <button type="button" onClick={() => setGuestForm({ ...guestForm, tipo: 'suelta', packSeleccionadoId: '' })} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all ${guestForm.tipo === 'suelta' ? 'bg-[#D4E655] border-[#D4E655] text-black' : 'bg-[#111] border-white/5 text-gray-500'}`}><Ticket size={18} /><span className="text-[8px] font-black uppercase">Suelta</span></button>
                                    <button type="button" onClick={() => setGuestForm({ ...guestForm, tipo: 'pack' })} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all ${guestForm.tipo === 'pack' ? 'bg-[#D4E655] border-[#D4E655] text-black' : 'bg-[#111] border-white/5 text-gray-500'}`}><Package size={18} /><span className="text-[8px] font-black uppercase text-center leading-tight">Comprar<br />Pack</span></button>
                                    <button type="button" onClick={() => setGuestForm({ ...guestForm, tipo: 'invitado', packSeleccionadoId: '' })} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all ${guestForm.tipo === 'invitado' ? 'bg-purple-600 border-purple-600 text-white font-black' : 'bg-[#111] border-white/5 text-gray-500'}`}><Star size={18} /><span className="text-[8px] font-black uppercase">Invitado</span></button>
                                </div>
                            </div>

                            {/* --- SELECTOR DE PACKS --- */}
                            {guestForm.tipo === 'pack' && (
                                <div className="space-y-1 animate-in slide-in-from-top-2">
                                    <label className="text-[10px] font-bold text-[#D4E655] uppercase ml-1">Seleccionar Pack a Vender</label>
                                    {packsDisponibles.length > 0 ? (
                                        <select
                                            required
                                            value={guestForm.packSeleccionadoId}
                                            onChange={e => setGuestForm({ ...guestForm, packSeleccionadoId: e.target.value })}
                                            className="w-full bg-[#111] border border-[#D4E655]/30 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655]"
                                        >
                                            <option value="" disabled>Elegir pack del catálogo...</option>
                                            {packsDisponibles.map(pack => (
                                                <option key={pack.id} value={pack.id}>
                                                    {pack.nombre} ({pack.creditos} clases) - ${pack.precio.toLocaleString()}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-xs text-red-400 text-center">
                                            No hay packs configurados para este tipo de clase en el sistema.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- FORMULARIO MANUAL --- */}
                            {!alumnoSeleccionado && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Nombre</label><input required autoFocus value={guestForm.nombre} onChange={e => setGuestForm({ ...guestForm, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                        <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Apellido</label><input required value={guestForm.apellido} onChange={e => setGuestForm({ ...guestForm, apellido: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                    </div>

                                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase ml-1">WhatsApp / Teléfono</label><input value={guestForm.telefono} onChange={e => setGuestForm({ ...guestForm, telefono: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white outline-none focus:border-[#D4E655]" placeholder="Ej: 11..." /></div>

                                    {(guestForm.tipo === 'pack' || guestForm.email) && (
                                        <div className="grid grid-cols-2 gap-4 animate-in fade-in">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Email <span className="text-[#D4E655]">*</span></label>
                                                <input required={guestForm.tipo === 'pack'} type="email" value={guestForm.email} onChange={e => setGuestForm({ ...guestForm, email: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white outline-none focus:border-[#D4E655]" placeholder="mail@mail.com" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">DNI <span className="text-[#D4E655]">*</span></label>
                                                <input required={guestForm.tipo === 'pack'} value={guestForm.dni} onChange={e => setGuestForm({ ...guestForm, dni: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white outline-none focus:border-[#D4E655]" placeholder="Sin puntos" />
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* --- SECCIÓN DE PAGOS --- */}
                            {guestForm.tipo !== 'invitado' && guestForm.tipo !== 'usar_credito' && (
                                <div className="animate-in slide-in-from-top-4 space-y-4 pt-2">
                                    <div className="grid grid-cols-2 gap-4">
                                        <button type="button" onClick={() => setGuestForm({ ...guestForm, pago: 'efectivo' })} className={`p-4 rounded-2xl border flex items-center justify-center gap-3 ${guestForm.pago === 'efectivo' ? 'bg-white/10 border-white text-white' : 'bg-transparent border-white/5 text-gray-500'}`}><Wallet size={18} /><span>Efectivo</span></button>
                                        <button type="button" onClick={() => setGuestForm({ ...guestForm, pago: 'transferencia' })} className={`p-4 rounded-2xl border flex items-center justify-center gap-3 ${guestForm.pago === 'transferencia' ? 'bg-white/10 border-white text-white' : 'bg-transparent border-white/5 text-gray-500'}`}><CreditCard size={18} /><span>Transf / MP</span></button>
                                    </div>
                                    <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 p-4 rounded-2xl flex justify-between items-center"><span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total a Cobrar</span><span className="text-2xl font-black text-[#D4E655]">${totalModal.toLocaleString()}</span></div>
                                </div>
                            )}

                            <button disabled={processing || (guestForm.tipo === 'usar_credito' && !alumnoSeleccionado)} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-5 rounded-2xl text-sm tracking-widest shadow-xl hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2">
                                {processing ? <Loader2 className="animate-spin mx-auto" /> :
                                    guestForm.tipo === 'pack' ? 'Cobrar, Asignar Pack e Inscribir' :
                                        guestForm.tipo === 'usar_credito' ? 'Descontar 1 Crédito e Inscribir' :
                                            'Cobrar e Inscribir'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}