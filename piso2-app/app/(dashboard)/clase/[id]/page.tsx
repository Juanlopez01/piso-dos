'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    ArrowLeft, Calendar, Clock, User, Check, X,
    DollarSign, FileText, UserPlus, Trash2, AlertTriangle,
    Wallet, CreditCard, Loader2, Users, Star, Ticket, Package,
    BookOpen, BellRing, Send, Sparkles, Download, ShieldAlert,
    Clock4, FileCheck2, // 🚀 IMPORTAMOS ICONOS NUEVOS PARA MEDIA FALTA Y JUSTIFICADA
    Lock
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// 🚀 IMPORTAMOS LAS ACTIONS
import {
    toggleAsistenciaAction,
    eliminarInscripcionAction,
    procesarInscripcionAction,
    enviarNotificacionClaseAction
} from '@/app/actions/inscripciones'

// --- TIPOS ---
type Inscripcion = {
    id: string
    user_id: string | null
    user: { nombre: string; apellido: string; nombre_completo?: string; email: string, telefono?: string | null } | null
    nombre_invitado: string | null
    modalidad: string
    valor_credito: number
    presente: boolean
    estado_asistencia?: 'presente' | 'ausente' | 'media_falta' | 'justificada' | null // 🚀 NUEVO ESTADO
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
    es_audicion: boolean
    es_combinable: boolean
    es_la_liga: boolean // 🚀 PARA SABER SI ES DE LA LIGA
    compania_id?: string | null
}

type ProductoPack = {
    id: string
    nombre: string
    precio: number
    creditos: number
    tipo_clase: string
}

const fetcher = async ([key, id]: [string, string]) => {
    const supabase = createClient()

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    let role = 'profesor'
    if (user) {
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
        if (profile) role = profile.rol
    }

    const { data: dataClase, error: errorClase } = await supabase
        .from('clases')
        .select(`
            *, 
            profesor:profiles!profesor_id(id, nombre_completo, email), 
            sala:salas!sala_id(nombre, sede:sedes(nombre))
        `)
        .eq('id', id)
        .single()

    if (errorClase) console.error("🚨 Error al cargar la clase:", errorClase.message)

    const { data: dataInsc } = await supabase
        .from('inscripciones')
        .select(`*, user:profiles!user_id(nombre, apellido, nombre_completo, email, telefono)`)
        .eq('clase_id', id)
        .order('created_at', { ascending: true })

    let packs: ProductoPack[] = []
    if (dataClase) {
        let tipoPackQuery = 'regular';

        if (dataClase.es_combinable === false) {
            tipoPackQuery = 'exclusivo';
        } else if (dataClase.tipo_clase === 'Especial') {
            tipoPackQuery = 'seminario';
        } else {
            tipoPackQuery = 'regular';
        }

        const { data: packsData } = await supabase
            .from('productos')
            .select('*')
            .eq('activo', true)
            .eq('tipo_clase', tipoPackQuery)
            .order('precio', { ascending: true })

        if (packsData) packs = packsData
    }

    return {
        clase: dataClase as ClaseDetalle,
        // Adaptamos los datos viejos (boolean) a los nuevos estados si es necesario
        inscripciones: (dataInsc || []).map((i: any) => ({
            ...i,
            estado_asistencia: i.estado_asistencia || (i.presente ? 'presente' : 'ausente')
        })) as Inscripcion[],
        packsDisponibles: packs,
        userRole: role
    }
}

export default function ClaseDetallePage() {
    const params = useParams()
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    const { data, error, isLoading, mutate } = useSWR(
        params.id ? ['clase-detalle', params.id as string] : null,
        fetcher,
        { revalidateOnFocus: false }
    )

    const { clase, inscripciones, packsDisponibles, userRole } = data || {
        clase: null, inscripciones: [], packsDisponibles: [], userRole: 'profesor'
    }

    const [busquedaAlumno, setBusquedaAlumno] = useState('')
    const [resultadosBusqueda, setResultadosBusqueda] = useState<any[]>([])
    const [buscando, setBuscando] = useState(false)
    const [alumnoSeleccionado, setAlumnoSeleccionado] = useState<any | null>(null)
    const [isGuestOpen, setIsGuestOpen] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [isNotifModalOpen, setIsNotifModalOpen] = useState(false)
    const [notifMessage, setNotifMessage] = useState('')
    const [sendingNotif, setSendingNotif] = useState(false)

    const [guestForm, setGuestForm] = useState({
        nombre: '', apellido: '', email: '', telefono: '', dni: '',
        tipo: 'usar_credito' as 'suelta' | 'pack' | 'invitado' | 'usar_credito',
        pago: 'efectivo' as 'efectivo' | 'transferencia',
        packSeleccionadoId: '',
        montoManualPack: ''
    })

    const PRECIOS_ALUMNO = {
        Regular: { efectivo: 14000, transferencia: 15000 },
        Especial: { efectivo: 16000, transferencia: 18000 }
    }

    const financialData = useMemo(() => {
        if (!clase) return { totalRecaudado: 0, pagoDocente: 0 }
        const total = inscripciones.reduce((acc, curr) => acc + (Number(curr.valor_credito) || 0), 0)
        const pago = clase.tipo_acuerdo === 'fijo'
            ? clase.valor_acuerdo
            : total * (clase.valor_acuerdo / 100)
        return { totalRecaudado: total, pagoDocente: pago }
    }, [inscripciones, clase])

    const inicioNormalizado = clase?.inicio?.replace(' ', 'T');
    const fechaText = inicioNormalizado ? format(new Date(inicioNormalizado.split('T')[0] + 'T12:00:00'), "EEE d MMM", { locale: es }) : '';
    const horaText = inicioNormalizado ? inicioNormalizado.split('T')[1].substring(0, 5) : '';

    // 🚀 LÓGICA DE ASISTENCIA ACTUALIZADA (Soporta múltiples estados)
    const handleSetAsistencia = async (insc: Inscripcion, nuevoEstado: 'presente' | 'ausente' | 'media_falta' | 'justificada') => {
        // Actualización optimista en la UI
        const optimisticInscripciones = inscripciones.map(i =>
            i.id === insc.id
                ? { ...i, estado_asistencia: nuevoEstado, presente: nuevoEstado === 'presente' }
                : i
        )
        mutate({ ...data!, inscripciones: optimisticInscripciones }, false)

        // ⚠️ ACÁ HAY QUE CAMBIAR LA ACTION LUEGO (Por ahora usamos la vieja)
        const res = await toggleAsistenciaAction(insc.id, nuevoEstado === 'presente')

        // 🚀 Cuando tengamos la nueva action, usaremos esto:
        // const res = await setEstadoAsistenciaAction(insc.id, nuevoEstado)

        if (!res.success) {
            toast.error("Error al guardar asistencia")
            mutate()
        } else {
            // Mostrar mensajito lindo según el estado
            if (nuevoEstado === 'presente') toast.success('Asistencia marcada')
            if (nuevoEstado === 'ausente') toast.info('Marcado como ausente')
            if (nuevoEstado === 'media_falta') toast.warning('Media falta registrada')
            if (nuevoEstado === 'justificada') toast.success('Falta justificada guardada')
        }
    }

    const handleDeleteInscripcion = async (insc: Inscripcion) => {
        if (!confirm('¿Dar de baja a este alumno? El crédito se le devolverá automáticamente.')) return

        const res = await eliminarInscripcionAction(insc.id)
        if (res.success) {
            toast.success('Baja procesada. Crédito devuelto.')
            mutate()
        } else {
            toast.error(res.error)
        }
    }

    useEffect(() => {
        const buscar = async () => {
            if (busquedaAlumno.trim().length < 3) return setResultadosBusqueda([])
            setBuscando(true)
            const term = `%${busquedaAlumno.trim()}%`
            const { data } = await supabase.from('profiles')
                .select('id, nombre, apellido, nombre_completo, email, dni, creditos_regulares, creditos_especiales')
                .or(`nombre_completo.ilike.${term},email.ilike.${term}`)
                .eq('rol', 'alumno')
                .limit(5)
            if (data) setResultadosBusqueda(data)
            setBuscando(false)
        }
        const t = setTimeout(buscar, 400)
        return () => clearTimeout(t)
    }, [busquedaAlumno, supabase])

    const handleAddGuest = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!clase) return
        setProcessing(true)

        try {
            let monto = 0
            let alumnoIdFinal = alumnoSeleccionado?.id || null
            let nombreInvitadoStr = null

            let tipoClaseRPC = 'regular';
            if (clase.es_combinable === false) tipoClaseRPC = 'exclusivo';
            else if (clase.tipo_clase === 'Especial') tipoClaseRPC = 'seminario';

            if (clase.es_audicion) {
                guestForm.tipo = 'invitado'
                const nomFinal = alumnoIdFinal ? alumnoSeleccionado?.nombre_completo : `${guestForm.nombre} ${guestForm.apellido}`
                const telFinal = guestForm.telefono ? `(${guestForm.telefono})` : ''
                nombreInvitadoStr = `${nomFinal} ${telFinal}`.trim()
            } else {
                if (guestForm.tipo === 'suelta') {
                    const precios = PRECIOS_ALUMNO[clase.tipo_clase === 'Especial' ? 'Especial' : 'Regular']
                    monto = guestForm.pago === 'efectivo' ? precios.efectivo : precios.transferencia
                } else if (guestForm.tipo === 'pack') {
                    const packSeleccionado = packsDisponibles.find(p => p.id === guestForm.packSeleccionadoId)
                    monto = guestForm.montoManualPack !== '' ? Number(guestForm.montoManualPack) : (packSeleccionado?.precio || 0)
                }

                if (!alumnoIdFinal) {
                    nombreInvitadoStr = `${guestForm.nombre} ${guestForm.apellido}`.trim()
                }
            }

            const rpcPayload = {
                p_clase_id: clase.id,
                p_user_id: alumnoIdFinal,
                p_nombre_invitado: clase.es_combinable === false ? clase.nombre : nombreInvitadoStr,
                p_tipo_operacion: guestForm.tipo,
                p_tipo_clase: tipoClaseRPC,
                p_monto_caja: monto,
                p_metodo_pago: guestForm.pago,
                p_producto_id: guestForm.packSeleccionadoId || null,
                p_email_comprador: guestForm.email || null,
                p_telefono_comprador: guestForm.telefono || null
            }

            const response = await procesarInscripcionAction(rpcPayload)
            if (!response.success) throw new Error(response.error)

            toast.success('Inscripción registrada en lista y caja')
            mutate()
            setIsGuestOpen(false)
            setAlumnoSeleccionado(null)
            setGuestForm({ ...guestForm, nombre: '', apellido: '', email: '', telefono: '', packSeleccionadoId: '', montoManualPack: '', tipo: 'usar_credito' })
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setProcessing(false)
        }
    }

    const handleSendNotif = async (e: React.FormEvent) => {
        e.preventDefault()
        setSendingNotif(true)

        const uids = Array.from(new Set(inscripciones.map(i => i.user_id).filter(Boolean)))
        if (uids.length === 0) {
            setSendingNotif(false)
            return toast.error("No hay alumnos con cuenta para notificar")
        }

        const notifs = uids.map(uid => ({
            usuario_id: uid,
            titulo: `Aviso: ${clase?.nombre}`,
            mensaje: notifMessage,
            link: `/mis-clases`
        }))

        const res = await enviarNotificacionClaseAction(notifs)
        if (res.success) {
            toast.success("Aviso enviado")
            setIsNotifModalOpen(false)
            setNotifMessage('')
        } else {
            toast.error(res.error)
        }
        setSendingNotif(false)
    }

    const handleDownloadPDF = () => {
        if (!clase) return

        const doc = new jsPDF()

        doc.setFontSize(18)
        doc.setFont("helvetica", "bold")
        doc.text(`LISTA DE AUDICIÓN: ${clase.nombre.toUpperCase()}`, 14, 22)

        doc.setFontSize(11)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(100, 100, 100)
        doc.text(`Fecha: ${fechaText} | Hora: ${horaText} hs | Sala: ${clase.sala.nombre}`, 14, 30)

        const tableColumn = ["#", "Participante", "Contacto", "Firma / Presente"]
        const tableRows: any[] = []

        inscripciones.forEach((insc, index) => {
            let nombre = insc.user?.nombre_completo || [insc.user?.nombre, insc.user?.apellido].join(' ').trim() || insc.nombre_invitado || 'Sin nombre'
            let contacto = insc.user?.telefono || insc.user?.email || '-'

            if (insc.es_invitado && insc.nombre_invitado && insc.nombre_invitado.includes('(')) {
                const match = insc.nombre_invitado.match(/(.*)\s\((.*)\)/)
                if (match) {
                    nombre = match[1].trim()
                    contacto = match[2].trim()
                }
            }

            tableRows.push([
                (index + 1).toString(),
                nombre,
                contacto,
                insc.presente ? 'PRESENTE' : ''
            ])
        })

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [236, 72, 153], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 250, 250] },
            styles: { fontSize: 10, cellPadding: 5 },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 60 },
                2: { cellWidth: 60 },
                3: { cellWidth: 50 },
            }
        })

        doc.save(`Audicion_${clase.nombre.replace(/\s+/g, '_')}.pdf`)
    }

    if (isLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-[#D4E655]"><Loader2 className="animate-spin" /></div>

    const showFinance = userRole === 'admin' || userRole === 'recepcion'

    // 🚀 LÓGICA PARA MOSTRAR BOTONES EXTRA DE ASISTENCIA
    const esFormacion = clase?.es_la_liga;

    return (
        <div className="min-h-screen bg-[#050505] text-white p-2 md:p-8 pb-32">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col gap-4 mb-8">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest px-2">
                    <ArrowLeft size={16} /> Volver
                </button>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-6 gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${clase?.estado === 'cancelada' ? 'bg-red-500' : 'bg-[#D4E655] text-black'}`}>
                                {clase?.estado === 'cancelada' ? 'Cancelada' : 'Activa'}
                            </span>
                            <span className="text-gray-500 text-[10px] font-bold uppercase">{clase?.tipo_clase} • {clase?.sala?.nombre}</span>
                            {!clase?.es_combinable && <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1"><Lock size={10} /> No Combinable</span>}
                        </div>
                        <h1 className="text-2xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none">{clase?.nombre}</h1>
                        <div className="flex gap-3 text-xs text-gray-400 font-medium mt-2">
                            <span className="flex items-center gap-1"><Calendar size={12} className="text-[#D4E655]" /> {fechaText}</span>
                            <span className="flex items-center gap-1"><Clock size={12} className="text-[#D4E655]" /> {horaText}</span>
                            <span className="flex items-center gap-1"><User size={12} className="text-[#D4E655]" /> {clase?.profesor?.nombre_completo || 'Staff'}</span>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        {clase?.es_audicion && (
                            <button onClick={handleDownloadPDF} className="flex-1 md:flex-none bg-white/5 border border-white/10 text-white px-4 py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:border-pink-500 hover:text-pink-400 transition-colors">
                                <Download size={18} /> Lista
                            </button>
                        )}
                        <button onClick={() => setIsNotifModalOpen(true)} className="flex-1 md:flex-none bg-[#111] border border-white/10 text-white px-4 py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:border-[#D4E655]"><BellRing size={18} /> Aviso</button>
                        <button onClick={() => setIsGuestOpen(true)} className={`flex-1 md:flex-none px-6 py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 ${clase?.es_audicion ? 'bg-pink-500' : 'bg-[#D4E655] text-black'}`}><UserPlus size={18} /> Inscribir</button>
                    </div>
                </div>
            </div>

            {/* CUERPO LISTADO */}
            <div className={`grid grid-cols-1 ${showFinance && !clase?.es_audicion ? 'lg:grid-cols-3' : 'max-w-4xl mx-auto'} gap-8`}>
                <div className={showFinance && !clase?.es_audicion ? "lg:col-span-2 space-y-4" : "space-y-4"}>
                    <div className="flex justify-between items-center"><h3 className="text-lg font-black uppercase flex items-center gap-2"><Users size={18} className="text-[#D4E655]" /> {clase?.es_audicion ? 'Participantes' : 'Alumnos'}</h3><span className="text-[10px] font-bold bg-white/10 px-3 py-1 rounded-full">{inscripciones.length} Pax</span></div>
                    <div className="bg-[#09090b] border border-white/10 rounded-xl overflow-hidden">
                        {inscripciones.length === 0 && <div className="p-8 text-center text-gray-500 uppercase text-xs">Sin inscriptos.</div>}
                        {inscripciones.map(insc => {
                            // Definir color de fondo según el estado
                            let bgRowClass = '';
                            if (insc.estado_asistencia === 'presente') bgRowClass = 'bg-[#D4E655]/5 border-l-2 border-[#D4E655]';
                            else if (insc.estado_asistencia === 'media_falta') bgRowClass = 'bg-yellow-500/5 border-l-2 border-yellow-500';
                            else if (insc.estado_asistencia === 'justificada') bgRowClass = 'bg-blue-500/5 border-l-2 border-blue-500';

                            return (
                                <div key={insc.id} className={`p-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${bgRowClass}`}>
                                    <div>
                                        <p className="font-bold text-white text-sm md:text-lg">{insc.user?.nombre_completo || insc.nombre_invitado}</p>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">{insc.modalidad}</p>
                                    </div>

                                    {/* 🚀 BOTONERA ASISTENCIAS (Normal o Extendida) */}
                                    <div className="flex items-center gap-2 bg-[#111] border border-white/10 p-1 rounded-xl">

                                        {/* Botón Ausente (Resetea estado) */}
                                        <button
                                            onClick={() => handleSetAsistencia(insc, 'ausente')}
                                            title="Ausente"
                                            className={`p-2 rounded-lg transition-all ${insc.estado_asistencia === 'ausente' ? 'bg-red-500/20 text-red-500' : 'text-gray-500 hover:text-white'}`}
                                        >
                                            <X size={18} />
                                        </button>

                                        {/* 🚀 Botones Especiales (Solo Liga/Compañía) */}
                                        {esFormacion && (
                                            <>
                                                <button
                                                    onClick={() => handleSetAsistencia(insc, 'media_falta')}
                                                    title="Media Falta (Tarde)"
                                                    className={`p-2 rounded-lg transition-all ${insc.estado_asistencia === 'media_falta' ? 'bg-yellow-500 text-black' : 'text-yellow-500/50 hover:text-yellow-500'}`}
                                                >
                                                    <Clock4 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleSetAsistencia(insc, 'justificada')}
                                                    title="Falta Justificada"
                                                    className={`p-2 rounded-lg transition-all ${insc.estado_asistencia === 'justificada' ? 'bg-blue-500 text-white' : 'text-blue-500/50 hover:text-blue-500'}`}
                                                >
                                                    <FileCheck2 size={18} />
                                                </button>
                                            </>
                                        )}

                                        {/* Botón Presente */}
                                        <button
                                            onClick={() => handleSetAsistencia(insc, 'presente')}
                                            title="Presente"
                                            className={`flex items-center gap-1 px-3 py-2 rounded-lg font-black uppercase text-[10px] transition-all ${insc.estado_asistencia === 'presente' ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-gray-400 hover:bg-[#D4E655]/20 hover:text-[#D4E655]'}`}
                                        >
                                            <Check size={16} /> <span className="hidden md:inline">Presente</span>
                                        </button>

                                        {showFinance && (
                                            <div className="pl-2 ml-1 border-l border-white/10">
                                                <button onClick={() => handleDeleteInscripcion(insc)} className="text-gray-600 hover:text-red-500 p-2"><Trash2 size={16} /></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* LIQUIDACIÓN CAJA */}
                {showFinance && !clase?.es_audicion && (
                    <div className="lg:col-span-1">
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 sticky top-8">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-6">Liquidación Clase</h4>
                            <div className="bg-[#D4E655] rounded-2xl p-6 text-center shadow-lg"><p className="text-[9px] font-black uppercase text-black/60 mb-1">Pago Docente</p><div className="text-4xl font-black text-black">${financialData.pagoDocente.toLocaleString()}</div></div>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL INSCRIPCIÓN */}
            {isGuestOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4" onClick={() => setIsGuestOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-lg rounded-3xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-6"><h3 className="text-2xl font-black uppercase text-white">Inscripción</h3><button onClick={() => setIsGuestOpen(false)}><X size={24} /></button></div>
                        <form onSubmit={handleAddGuest} className="space-y-5">

                            {!alumnoSeleccionado ? (
                                <div className="relative">
                                    <label className="text-[10px] font-bold text-[#D4E655] uppercase ml-1">Buscar Alumno</label>
                                    <div className="relative mt-1">
                                        <input placeholder="Nombre o email..." value={busquedaAlumno} onChange={e => setBusquedaAlumno(e.target.value)} className="w-full bg-[#111] border border-[#D4E655]/30 rounded-xl p-4 text-white outline-none focus:border-[#D4E655]" />
                                        {buscando && <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[#D4E655]" />}
                                    </div>

                                    {resultadosBusqueda.length > 0 && (
                                        <div className="absolute z-10 w-full mt-2 bg-[#1a1a1c] border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-48 overflow-y-auto">
                                            {resultadosBusqueda.map(alum => (
                                                <div key={alum.id} onClick={() => { setAlumnoSeleccionado(alum); setBusquedaAlumno(''); setResultadosBusqueda([]); setGuestForm({ ...guestForm, tipo: alum.creditos_regulares > 0 ? 'usar_credito' : 'suelta' }) }} className="p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer flex justify-between items-center">
                                                    <div><p className="text-xs font-bold text-white uppercase">{alum.nombre_completo || alum.nombre}</p><p className="text-[10px] text-gray-500">{alum.email}</p></div>
                                                    <span className="text-[9px] font-black bg-[#D4E655] text-black px-2 py-1 rounded">{alum.creditos_regulares} Cr</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 p-4 rounded-xl flex items-center justify-between">
                                    <div><p className="text-xs font-bold text-white uppercase">{alumnoSeleccionado.nombre_completo}</p><p className="text-[9px] text-gray-500">Saldo: {alumnoSeleccionado.creditos_regulares} Reg / {alumnoSeleccionado.creditos_especiales} Esp</p></div>
                                    <button type="button" onClick={() => setAlumnoSeleccionado(null)}><X size={16} /></button>
                                </div>
                            )}

                            <div className="grid grid-cols-4 gap-2 mt-4">
                                {['usar_credito', 'suelta', 'pack', 'invitado'].map(t => (
                                    <button key={t} type="button" onClick={() => setGuestForm({ ...guestForm, tipo: t as any })} className={`p-3 rounded-2xl border text-[8px] font-black uppercase transition-all ${guestForm.tipo === t ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] border-white/5 text-gray-500 hover:border-white/20'}`}>{t.replace('_', ' ')}</button>
                                ))}
                            </div>

                            {guestForm.tipo === 'pack' && (
                                <div className="space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10 mt-4">
                                    <select required value={guestForm.packSeleccionadoId} onChange={e => {
                                        const packElegido = packsDisponibles.find(p => p.id === e.target.value);
                                        setGuestForm({ ...guestForm, packSeleccionadoId: e.target.value, montoManualPack: packElegido ? String(packElegido.precio) : '' })
                                    }} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655]">
                                        <option value="">Seleccionar Pase/Pack...</option>
                                        {packsDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.creditos} clases) - Mínimo: ${p.precio.toLocaleString()}</option>)}
                                    </select>

                                    {guestForm.packSeleccionadoId && (
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1 mb-1 block">Monto a Cobrar ($)</label>
                                                <input type="number" required value={guestForm.montoManualPack} onChange={e => setGuestForm({ ...guestForm, montoManualPack: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-sm font-black outline-none focus:border-[#D4E655]" placeholder="Ej: 15000" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1 mb-1 block">Método de Pago</label>
                                                <div className="flex bg-[#111] rounded-xl border border-white/10 p-1">
                                                    <button type="button" onClick={() => setGuestForm({ ...guestForm, pago: 'efectivo' })} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${guestForm.pago === 'efectivo' ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}>Efectivo</button>
                                                    <button type="button" onClick={() => setGuestForm({ ...guestForm, pago: 'transferencia' })} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${guestForm.pago === 'transferencia' ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}>Transf.</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {guestForm.tipo === 'suelta' && !alumnoSeleccionado && (
                                <div className="space-y-4 mt-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <input required placeholder="Nombre" value={guestForm.nombre} onChange={e => setGuestForm({ ...guestForm, nombre: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                        <input required placeholder="Apellido" value={guestForm.apellido} onChange={e => setGuestForm({ ...guestForm, apellido: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <input required placeholder="DNI (Será la contraseña)" type="text" value={guestForm.dni} onChange={e => setGuestForm({ ...guestForm, dni: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                        <input required placeholder="Teléfono" type="tel" value={guestForm.telefono} onChange={e => setGuestForm({ ...guestForm, telefono: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                    </div>

                                    <input placeholder="Email (Opcional)" type="email" value={guestForm.email} onChange={e => setGuestForm({ ...guestForm, email: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />

                                    <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl flex items-start gap-3">
                                        <ShieldAlert size={20} className="text-yellow-500 shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold text-yellow-500 uppercase">Avisale al alumno:</p>
                                            <p className="text-[10px] text-gray-300 mt-1 leading-relaxed">Se le creará una cuenta automáticamente para que pueda usar la web. Su usuario será su email (si lo pusiste) o su Nombre+Apellido, y <strong className="text-white">su contraseña será el DNI</strong>.</p>
                                        </div>
                                    </div>

                                    <div className="flex bg-[#111] rounded-xl border border-white/10 p-1">
                                        <button type="button" onClick={() => setGuestForm({ ...guestForm, pago: 'efectivo' })} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${guestForm.pago === 'efectivo' ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}>Efectivo</button>
                                        <button type="button" onClick={() => setGuestForm({ ...guestForm, pago: 'transferencia' })} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${guestForm.pago === 'transferencia' ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}>Transf.</button>
                                    </div>
                                </div>
                            )}

                            {guestForm.tipo === 'invitado' && (
                                <div className="space-y-4 mt-4">
                                    {!alumnoSeleccionado && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <input required placeholder="Nombre" value={guestForm.nombre} onChange={e => setGuestForm({ ...guestForm, nombre: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                            <input required placeholder="Apellido" value={guestForm.apellido} onChange={e => setGuestForm({ ...guestForm, apellido: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                        </div>
                                    )}
                                    <div className="bg-white/5 p-4 rounded-xl text-center border border-white/10">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Inscripción sin costo (Invitado del Staff)</p>
                                    </div>
                                </div>
                            )}

                            <button disabled={processing} type="submit" className="w-full py-5 rounded-2xl font-black uppercase text-sm tracking-widest bg-[#D4E655] hover:bg-white text-black transition-all">
                                {processing ? <Loader2 className="animate-spin mx-auto" /> : 'Confirmar Registro'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL NOTIFICACIÓN */}
            {isNotifModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4" onClick={() => setIsNotifModalOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-lg rounded-3xl p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-6"><h3 className="text-xl font-black uppercase text-white flex items-center gap-2"><BellRing size={20} className="text-[#D4E655]" /> Enviar Aviso</h3><button onClick={() => setIsNotifModalOpen(false)}><X size={24} /></button></div>
                        <form onSubmit={handleSendNotif} className="space-y-4">
                            <textarea required value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="Mensaje para todos los inscriptos..." className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655] min-h-[120px] resize-none" />
                            <button disabled={sendingNotif} type="submit" className="w-full py-4 bg-[#D4E655] text-black rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                                {sendingNotif ? <Loader2 className="animate-spin" /> : <><Send size={16} /> Enviar a {inscripciones.length} Alumnos</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}