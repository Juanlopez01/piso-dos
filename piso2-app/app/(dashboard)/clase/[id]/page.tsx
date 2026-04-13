'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    ArrowLeft, Calendar, Clock, User, Check, X,
    DollarSign, FileText, UserPlus, Trash2, AlertTriangle,
    Wallet, CreditCard, Loader2, Users, Star, Ticket, Package,
    BookOpen, BellRing, Send, Sparkles, Download // 🚀 IMPORTAMOS DOWNLOAD
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'
import jsPDF from 'jspdf' // 🚀 IMPORTAMOS GENERADOR DE PDF
import autoTable from 'jspdf-autotable' // 🚀 IMPORTAMOS GENERADOR DE TABLAS PARA PDF

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
}

type ProductoPack = {
    id: string
    nombre: string
    precio: number
    creditos: number
    tipo_clase: string
}

// 🚀 FETCHER BLINDADO CONTRA CONFLICTOS DE RELACIÓN
const fetcher = async ([key, id]: [string, string]) => {
    const supabase = createClient()

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    let role = 'profesor'
    if (user) {
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
        if (profile) role = profile.rol
    }

    // ✅ ACÁ ESTÁ LA MAGIA: Le aclaramos a Supabase qué llave foránea usar
    const { data: dataClase, error: errorClase } = await supabase
        .from('clases')
        .select(`
            *, 
            profesor:profiles!profesor_id(id, nombre_completo, email), 
            sala:salas!sala_id(nombre, sede:sedes(nombre))
        `)
        .eq('id', id)
        .single()

    if (errorClase) {
        console.error("🚨 Error al cargar la clase:", errorClase.message)
    }

    // 🚀 AHORA TAMBIÉN TRAEMOS EL TELÉFONO DEL ALUMNO SI TIENE CUENTA
    const { data: dataInsc } = await supabase
        .from('inscripciones')
        .select(`*, user:profiles!user_id(nombre, apellido, nombre_completo, email, telefono)`)
        .eq('clase_id', id)
        .order('created_at', { ascending: true })

    let packs: ProductoPack[] = []
    if (dataClase) {
        const tipoPack = dataClase.tipo_clase === 'Especial' ? 'seminario' : 'regular'
        const { data: packsData } = await supabase
            .from('productos')
            .select('*')
            .eq('activo', true)
            .eq('tipo_clase', tipoPack)
            .order('precio', { ascending: true })
        if (packsData) packs = packsData
    }

    return {
        clase: dataClase as ClaseDetalle,
        inscripciones: (dataInsc || []) as Inscripcion[],
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

    // --- ESTADOS LOCALES ---
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
        tipo: 'suelta' as 'suelta' | 'pack' | 'invitado' | 'usar_credito',
        pago: 'efectivo' as 'efectivo' | 'transferencia',
        packSeleccionadoId: ''
    })

    const PRECIOS_ALUMNO = {
        Regular: { efectivo: 14000, transferencia: 15000 },
        Especial: { efectivo: 16000, transferencia: 18000 }
    }

    // --- CÁLCULOS DERIVADOS ---
    const financialData = useMemo(() => {
        if (!clase) return { totalRecaudado: 0, pagoDocente: 0 }
        const total = inscripciones.reduce((acc, curr) => acc + (Number(curr.valor_credito) || 0), 0)
        const pago = clase.tipo_acuerdo === 'fijo'
            ? clase.valor_acuerdo
            : total * (clase.valor_acuerdo / 100)
        return { totalRecaudado: total, pagoDocente: pago }
    }, [inscripciones, clase])

    // 🚀 UTILIDADES DE FECHA PARA IGNORAR LA ZONA HORARIA
    const inicioNormalizado = clase?.inicio?.replace(' ', 'T');
    const fechaText = inicioNormalizado ? format(new Date(inicioNormalizado.split('T')[0] + 'T12:00:00'), "EEE d MMM", { locale: es }) : '';
    const horaText = inicioNormalizado ? inicioNormalizado.split('T')[1].substring(0, 5) : '';

    // --- FUNCIONES ---
    const toggleAsistencia = async (insc: Inscripcion) => {
        const newVal = !insc.presente
        const optimisticInscripciones = inscripciones.map(i => i.id === insc.id ? { ...i, presente: newVal } : i)
        mutate({ ...data!, inscripciones: optimisticInscripciones }, false)

        const res = await toggleAsistenciaAction(insc.id, newVal)
        if (!res.success) {
            toast.error(res.error)
            mutate()
        } else if (newVal) {
            toast.success('Asistencia marcada')
        }
    }

    const handleDeleteInscripcion = async (insc: Inscripcion) => {
        if (!confirm('¿Dar de baja a este alumno?')) return

        const res = await eliminarInscripcionAction(insc.id)
        if (res.success) {
            toast.success('Alumno eliminado y crédito devuelto si correspondía')
            mutate()
        } else {
            toast.error(res.error)
        }
    }

    useEffect(() => {
        const buscar = async () => {
            if (busquedaAlumno.length < 3) return setResultadosBusqueda([])
            setBuscando(true)
            const term = `%${busquedaAlumno}%`
            const { data } = await supabase.from('profiles')
                .select('id, nombre, apellido, nombre_completo, email, dni, creditos_regulares, creditos_seminarios')
                .or(`nombre.ilike.${term},apellido.ilike.${term},email.ilike.${term},nombre_completo.ilike.${term}`)
                .eq('rol', 'alumno').limit(5)
            if (data) setResultadosBusqueda(data)
            setBuscando(false)
        }
        const t = setTimeout(buscar, 300)
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

            // 🚀 LÓGICA PARA AUDICIONES ACTUALIZADA
            if (clase.es_audicion) {
                guestForm.tipo = 'invitado'

                // Extraemos el nombre de donde sea que venga (buscado o tipeado)
                const nomFinal = alumnoIdFinal
                    ? (alumnoSeleccionado?.nombre_completo || alumnoSeleccionado?.nombre)
                    : `${guestForm.nombre} ${guestForm.apellido}`

                const telFinal = guestForm.telefono ? `(${guestForm.telefono})` : ''

                // Queda guardado como: "Juan Perez (3624112233)"
                nombreInvitadoStr = `${nomFinal} ${telFinal}`.trim()
            } else {
                if (guestForm.tipo === 'suelta') {
                    const precios = PRECIOS_ALUMNO[clase.tipo_clase === 'Especial' ? 'Especial' : 'Regular']
                    monto = guestForm.pago === 'efectivo' ? precios.efectivo : precios.transferencia
                } else if (guestForm.tipo === 'pack') {
                    monto = packsDisponibles.find(p => p.id === guestForm.packSeleccionadoId)?.precio || 0
                }

                if (!alumnoIdFinal) {
                    nombreInvitadoStr = `${guestForm.nombre} ${guestForm.apellido}`.trim()
                }
            }

            const rpcPayload = {
                p_clase_id: clase.id,
                p_user_id: alumnoIdFinal,
                p_nombre_invitado: nombreInvitadoStr,
                p_tipo_operacion: guestForm.tipo,
                p_tipo_clase: clase.tipo_clase === 'Especial' ? 'seminario' : 'regular',
                p_monto_caja: monto,
                p_metodo_pago: guestForm.pago,
                p_producto_id: guestForm.packSeleccionadoId || null,
                p_email_comprador: guestForm.email || null
            }

            const response = await procesarInscripcionAction(rpcPayload)

            if (!response.success) throw new Error(response.error)

            toast.success('Inscripción exitosa')
            mutate()
            setIsGuestOpen(false)
            setAlumnoSeleccionado(null)
            setGuestForm({ ...guestForm, nombre: '', apellido: '', email: '', telefono: '', packSeleccionadoId: '' })
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

    // 🚀 LÓGICA PARA GENERAR PDF DE AUDICIÓN
    const handleDownloadPDF = () => {
        if (!clase) return

        const doc = new jsPDF()

        // Título y Cabecera
        doc.setFontSize(18)
        doc.setFont("helvetica", "bold")
        doc.text(`LISTA DE AUDICIÓN: ${clase.nombre.toUpperCase()}`, 14, 22)

        doc.setFontSize(11)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(100, 100, 100)
        doc.text(`Fecha: ${fechaText} | Hora: ${horaText} hs | Sala: ${clase.sala.nombre}`, 14, 30)

        // Preparar Datos para la Tabla
        const tableColumn = ["#", "Participante", "Contacto", "Firma / Presente"]
        const tableRows: any[] = []

        inscripciones.forEach((insc, index) => {
            let nombre = insc.user?.nombre_completo || [insc.user?.nombre, insc.user?.apellido].join(' ').trim() || insc.nombre_invitado || 'Sin nombre'
            let contacto = insc.user?.telefono || insc.user?.email || '-'

            // Extraer el teléfono escondido en los invitados tipo "Juan Perez (3624123456)"
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
                insc.presente ? 'PRESENTE' : '' // Queda vacío para firmar o tildar si no vino aún
            ])
        })

        // Renderizar Tabla
        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [236, 72, 153], textColor: [255, 255, 255], fontStyle: 'bold' }, // Color rosa Audición
            alternateRowStyles: { fillColor: [250, 250, 250] },
            styles: { fontSize: 10, cellPadding: 5 },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 60 },
                2: { cellWidth: 60 },
                3: { cellWidth: 50 }, // Espacio para la firma
            }
        })

        doc.save(`Audicion_${clase.nombre.replace(/\s+/g, '_')}.pdf`)
    }

    if (isLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-[#D4E655]"><Loader2 className="animate-spin" /></div>

    const showFinance = userRole === 'admin' || userRole === 'recepcion'

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
                            <span className="text-gray-500 text-[10px] font-bold uppercase">{clase?.tipo_clase || 'Clase'} • {clase?.sala?.nombre || 'Sala'}</span>
                            {clase?.es_audicion && <span className="bg-pink-500/20 text-pink-400 border border-pink-500/30 px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1"><Sparkles size={10} /> Audición</span>}
                        </div>
                        <h1 className="text-2xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none">{clase?.nombre || 'Cargando...'}</h1>
                        <div className="flex gap-3 text-xs text-gray-400 font-medium mt-2">
                            <span className="flex items-center gap-1"><Calendar size={12} className="text-[#D4E655]" /> {fechaText}</span>
                            <span className="flex items-center gap-1"><Clock size={12} className="text-[#D4E655]" /> {horaText}</span>
                            <span className="flex items-center gap-1"><User size={12} className="text-[#D4E655]" /> {clase?.profesor?.nombre_completo || 'Staff'}</span>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        {/* 🚀 BOTÓN DE DESCARGA PDF */}
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

            <div className={`grid grid-cols-1 ${showFinance && !clase?.es_audicion ? 'lg:grid-cols-3' : 'max-w-4xl mx-auto'} gap-8`}>
                <div className={showFinance && !clase?.es_audicion ? "lg:col-span-2 space-y-4" : "space-y-4"}>
                    <div className="flex justify-between items-center"><h3 className="text-lg font-black uppercase flex items-center gap-2"><Users size={18} className="text-[#D4E655]" /> {clase?.es_audicion ? 'Participantes' : 'Alumnos'}</h3><span className="text-[10px] font-bold bg-white/10 px-3 py-1 rounded-full">{inscripciones.length} Pax</span></div>
                    <div className="bg-[#09090b] border border-white/10 rounded-xl overflow-hidden">
                        {inscripciones.length === 0 && <div className="p-8 text-center text-gray-500 uppercase text-xs">Sin inscriptos.</div>}
                        {inscripciones.map(insc => (
                            <div key={insc.id} className={`p-4 border-b border-white/5 flex items-center justify-between ${insc.presente ? 'bg-[#D4E655]/5' : ''}`}>
                                <div>
                                    <p className="font-bold text-white text-sm md:text-lg flex items-center gap-2">{insc.user?.nombre_completo || [insc.user?.nombre, insc.user?.apellido].join(' ') || insc.nombre_invitado} {insc.es_invitado && <span className={`text-[8px] text-white px-1.5 py-0.5 rounded uppercase ${clase?.es_audicion ? 'bg-pink-500' : 'bg-purple-500'}`}>Guest</span>}</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">{insc.modalidad} {showFinance && insc.valor_credito > 0 && <span className="text-[#D4E655]"> • ${Number(insc.valor_credito).toLocaleString()}</span>}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => toggleAsistencia(insc)} className={`h-11 px-4 rounded-xl border flex items-center gap-2 transition-all ${insc.presente ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'border-white/10 text-gray-600'}`}><Check size={20} /><span className="hidden md:inline text-[10px] font-black uppercase">Presente</span></button>
                                    {showFinance && <button onClick={() => handleDeleteInscripcion(insc)} className="text-gray-600 hover:text-red-500 p-2"><Trash2 size={18} /></button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {showFinance && !clase?.es_audicion && (
                    <div className="lg:col-span-1">
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 sticky top-8">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-6">Liquidación Clase</h4>
                            <div className="space-y-4 mb-8 text-xs font-bold uppercase">
                                <div className="flex justify-between text-gray-400"><span>Total Contable</span><span className="text-white">${financialData.totalRecaudado.toLocaleString()}</span></div>
                                <div className="flex justify-between text-gray-400"><span>Acuerdo</span><span className="text-[#D4E655]">{clase?.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : 'Fijo'}</span></div>
                            </div>
                            <div className="bg-[#D4E655] rounded-2xl p-6 text-center shadow-lg"><p className="text-[9px] font-black uppercase text-black/60 mb-1">Pago Docente</p><div className="text-4xl font-black text-black">${financialData.pagoDocente.toLocaleString()}</div></div>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL INSCRIPCIÓN */}
            {isGuestOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4" onClick={() => setIsGuestOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-lg rounded-3xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-6"><h3 className={`text-2xl font-black uppercase ${clase?.es_audicion ? 'text-pink-500' : 'text-white'}`}>{clase?.es_audicion ? 'Nueva Audición' : 'Inscripción'}</h3><button onClick={() => setIsGuestOpen(false)}><X size={24} /></button></div>
                        <form onSubmit={handleAddGuest} className="space-y-5">

                            {/* 🚀 SI ES AUDICIÓN (Todos ven lo mismo) */}
                            {clase?.es_audicion && (
                                <>
                                    <div className="relative mb-4 pb-4 border-b border-white/10">
                                        <label className="text-[10px] font-bold text-pink-500 uppercase ml-1">Buscar si ya es alumno (Opcional)</label>
                                        <input placeholder="Nombre o email..." value={busquedaAlumno} onChange={e => setBusquedaAlumno(e.target.value)} className="w-full bg-[#111] border border-pink-500/30 rounded-xl p-4 text-white outline-none focus:border-pink-500" />
                                        {resultadosBusqueda.length > 0 && (
                                            <div className="absolute z-10 w-full mt-2 bg-[#1a1a1c] border border-white/10 rounded-xl overflow-hidden">
                                                {resultadosBusqueda.map(alum => (
                                                    <div key={alum.id} onClick={() => { setAlumnoSeleccionado(alum); setBusquedaAlumno(''); setResultadosBusqueda([]); }} className="p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer flex justify-between items-center">
                                                        <div><p className="text-xs font-bold text-white uppercase">{alum.nombre_completo || alum.nombre}</p><p className="text-[10px] text-gray-500">{alum.email}</p></div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {alumnoSeleccionado && (
                                        <div className="bg-pink-500/10 border border-pink-500/30 p-4 rounded-xl flex items-center justify-between mb-4">
                                            <div><p className="text-xs font-bold text-white uppercase">{alumnoSeleccionado.nombre_completo}</p><p className="text-[9px] text-pink-400">Alumno Registrado</p></div>
                                            <button type="button" onClick={() => setAlumnoSeleccionado(null)}><X size={16} /></button>
                                        </div>
                                    )}
                                    {!alumnoSeleccionado && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <input required placeholder="Nombre" value={guestForm.nombre} onChange={e => setGuestForm({ ...guestForm, nombre: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                            <input required placeholder="Apellido" value={guestForm.apellido} onChange={e => setGuestForm({ ...guestForm, apellido: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                        </div>
                                    )}
                                    <input required={!alumnoSeleccionado} placeholder="Teléfono de contacto" type="tel" value={guestForm.telefono} onChange={e => setGuestForm({ ...guestForm, telefono: e.target.value })} className="w-full bg-[#111] border border-pink-500/30 rounded-xl p-4 text-sm outline-none focus:border-pink-500 mt-2" />
                                </>
                            )}

                            {/* 🚀 SI ES CLASE NORMAL */}
                            {!clase?.es_audicion && (
                                <>
                                    {/* VISTA: ADMIN O RECEPCIÓN (Tienen acceso a la caja) */}
                                    {['admin', 'recepcion', 'coordinador'].includes(userRole || '') ? (
                                        <>
                                            {!alumnoSeleccionado ? (
                                                <div className="relative">
                                                    <label className="text-[10px] font-bold text-[#D4E655] uppercase ml-1">Buscar Alumno</label>
                                                    <input placeholder="Nombre o email..." value={busquedaAlumno} onChange={e => setBusquedaAlumno(e.target.value)} className="w-full bg-[#111] border border-[#D4E655]/30 rounded-xl p-4 text-white outline-none focus:border-[#D4E655]" />
                                                    {resultadosBusqueda.length > 0 && (
                                                        <div className="absolute z-10 w-full mt-2 bg-[#1a1a1c] border border-white/10 rounded-xl overflow-hidden">
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
                                                    <div><p className="text-xs font-bold text-white uppercase">{alumnoSeleccionado.nombre_completo}</p><p className="text-[9px] text-gray-500">Saldo: {alumnoSeleccionado.creditos_regulares} Reg / {alumnoSeleccionado.creditos_seminarios} Sem</p></div>
                                                    <button type="button" onClick={() => setAlumnoSeleccionado(null)}><X size={16} /></button>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-4 gap-2">
                                                {['usar_credito', 'suelta', 'pack', 'invitado'].map(t => (
                                                    <button key={t} type="button" onClick={() => setGuestForm({ ...guestForm, tipo: t as any })} className={`p-3 rounded-2xl border text-[8px] font-black uppercase ${guestForm.tipo === t ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] border-white/5 text-gray-500'}`}>{t.replace('_', ' ')}</button>
                                                ))}
                                            </div>
                                            {guestForm.tipo === 'pack' && (
                                                <select required value={guestForm.packSeleccionadoId} onChange={e => setGuestForm({ ...guestForm, packSeleccionadoId: e.target.value })} className="w-full bg-[#111] border border-[#D4E655]/30 rounded-xl p-4 text-white font-bold outline-none">
                                                    <option value="">Seleccionar Pack...</option>
                                                    {packsDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre} - ${p.precio.toLocaleString()}</option>)}
                                                </select>
                                            )}
                                            {!alumnoSeleccionado && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <input required placeholder="Nombre" value={guestForm.nombre} onChange={e => setGuestForm({ ...guestForm, nombre: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                                    <input required placeholder="Apellido" value={guestForm.apellido} onChange={e => setGuestForm({ ...guestForm, apellido: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        // VISTA: PROFESORES (Solo pueden anotar invitados)
                                        <div className="space-y-4">
                                            <div className="bg-[#D4E655]/10 border border-[#D4E655]/20 p-4 rounded-xl mb-4">
                                                <p className="text-xs text-[#D4E655] font-bold uppercase tracking-widest">Anotar Invitado</p>
                                                <p className="text-[10px] text-gray-400 mt-1">Ingresá los datos de la persona que asiste como invitada a tu clase.</p>
                                            </div>
                                            {/* Forzamos el tipo "invitado" de fondo */}
                                            <input type="hidden" value="invitado" />
                                            <div className="grid grid-cols-2 gap-4">
                                                <input required placeholder="Nombre" value={guestForm.nombre} onChange={e => setGuestForm({ ...guestForm, nombre: e.target.value, tipo: 'invitado' })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                                <input required placeholder="Apellido" value={guestForm.apellido} onChange={e => setGuestForm({ ...guestForm, apellido: e.target.value })} className="bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                            </div>
                                            <input placeholder="Teléfono de contacto (Opcional)" type="tel" value={guestForm.telefono} onChange={e => setGuestForm({ ...guestForm, telefono: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#D4E655]" />
                                        </div>
                                    )}
                                </>
                            )}

                            <button disabled={processing} type="submit" className={`w-full py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all mt-4 ${clase?.es_audicion ? 'bg-pink-500 hover:bg-pink-400 text-white' : 'bg-[#D4E655] hover:bg-white text-black'}`}>
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