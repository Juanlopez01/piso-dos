'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    ArrowLeft, Calendar, Clock, User, Check, X,
    DollarSign, FileText, UserPlus, Trash2, AlertTriangle,
    Wallet, CreditCard, Loader2, Users, Star, Ticket, Package,
    BookOpen, BellRing, Send, Sparkles
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
    es_audicion: boolean
}

type ProductoPack = {
    id: string
    nombre: string
    precio: number
    creditos: number
    tipo_clase: string
}

// 🚀 FETCHER UNIFICADO
const fetcher = async ([key, id]: [string, string]) => {
    const supabase = createClient()

    // 1. Obtener rol del usuario
    const { data: { user } } = await supabase.auth.getUser()
    let role = 'profesor'
    if (user) {
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
        if (profile) role = profile.rol
    }

    // 2. Obtener detalle de la clase
    const { data: dataClase } = await supabase
        .from('clases')
        .select(`*, profesor:profiles(id, nombre_completo, email), sala:salas(nombre, sede:sedes(nombre))`)
        .eq('id', id)
        .single()

    // 3. Obtener inscripciones
    const { data: dataInsc } = await supabase
        .from('inscripciones')
        .select(`*, user:profiles(nombre, apellido, nombre_completo, email)`)
        .eq('clase_id', id)
        .order('created_at', { ascending: true })

    // 4. Obtener packs si la clase existe
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

    // 🚀 SWR: Motor de datos
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

    // --- CÁLCULOS DERIVADOS (Memoizados) ---
    const financialData = useMemo(() => {
        if (!clase) return { totalRecaudado: 0, pagoDocente: 0 }
        const total = inscripciones.reduce((acc, curr) => acc + (Number(curr.valor_credito) || 0), 0)
        const pago = clase.tipo_acuerdo === 'fijo'
            ? clase.valor_acuerdo
            : total * (clase.valor_acuerdo / 100)
        return { totalRecaudado: total, pagoDocente: pago }
    }, [inscripciones, clase])

    // --- FUNCIONES ---

    const toggleAsistencia = async (insc: Inscripcion) => {
        const newVal = !insc.presente

        // 🚀 MUTACIÓN OPTIMISTA: Actualizamos la UI antes de que responda Supabase
        const optimisticInscripciones = inscripciones.map(i =>
            i.id === insc.id ? { ...i, presente: newVal } : i
        )

        mutate({ ...data!, inscripciones: optimisticInscripciones }, false)

        try {
            const { error } = await supabase.from('inscripciones').update({ presente: newVal }).eq('id', insc.id)
            if (error) throw error
            if (newVal) toast.success('Asistencia marcada')
        } catch (err) {
            toast.error('Error al actualizar asistencia')
            mutate() // Revertimos a la data del servidor
        }
    }

    const handleDeleteInscripcion = async (insc: Inscripcion) => {
        if (!confirm('¿Dar de baja a este alumno?')) return

        try {
            const { data: res, error } = await supabase.rpc('reembolsar_inscripcion', {
                p_inscripcion_id: insc.id
            })
            if (error || !res.success) throw new Error(res?.message || 'Error al procesar baja')

            toast.success('Alumno eliminado y crédito devuelto si correspondía')
            mutate()
        } catch (err: any) {
            toast.error(err.message)
        }
    }

    // Buscador de alumnos (Debounced manual)
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
    }, [busquedaAlumno])

    const handleAddGuest = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!clase) return
        setProcessing(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Sesión expirada")

            let monto = 0
            let turnoId = null
            let alumnoIdFinal = alumnoSeleccionado?.id || null
            let nombreInvitadoStr = null

            if (clase.es_audicion) {
                guestForm.tipo = 'invitado'
                nombreInvitadoStr = `${guestForm.nombre} ${guestForm.apellido} (${guestForm.telefono})`.trim()
            } else {
                if (guestForm.tipo === 'suelta') {
                    const precios = PRECIOS_ALUMNO[clase.tipo_clase === 'Especial' ? 'Especial' : 'Regular']
                    monto = guestForm.pago === 'efectivo' ? precios.efectivo : precios.transferencia
                } else if (guestForm.tipo === 'pack') {
                    monto = packsDisponibles.find(p => p.id === guestForm.packSeleccionadoId)?.precio || 0
                }

                if (monto > 0) {
                    const { data: turno } = await supabase.from('caja_turnos').select('id').eq('usuario_id', user.id).eq('estado', 'abierta').maybeSingle()
                    if (turno) turnoId = turno.id
                    else if (guestForm.pago === 'efectivo') throw new Error('Debes abrir caja para cobrar en efectivo')
                }

                if (!alumnoIdFinal) {
                    nombreInvitadoStr = `${guestForm.nombre} ${guestForm.apellido}`.trim()
                }
            }

            const { data: res, error: rpcError } = await supabase.rpc('procesar_inscripcion_recepcion', {
                p_clase_id: clase.id,
                p_user_id: alumnoIdFinal,
                p_nombre_invitado: nombreInvitadoStr,
                p_tipo_operacion: guestForm.tipo,
                p_tipo_clase: clase.tipo_clase === 'Especial' ? 'seminario' : 'regular',
                p_monto_caja: monto,
                p_metodo_pago: guestForm.pago,
                p_turno_caja_id: turnoId,
                p_producto_id: guestForm.packSeleccionadoId || null,
                p_email_comprador: guestForm.email || null
            })

            if (rpcError || !res.success) throw new Error(res?.message || 'Error en la transacción')

            toast.success('Inscripción exitosa')
            mutate()
            setIsGuestOpen(false)
            setAlumnoSeleccionado(null)
            setGuestForm({ ...guestForm, nombre: '', apellido: '', email: '', packSeleccionadoId: '' })
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setProcessing(false)
        }
    }

    const handleSendNotif = async (e: React.FormEvent) => {
        e.preventDefault()
        setSendingNotif(true)
        try {
            const uids = Array.from(new Set(inscripciones.map(i => i.user_id).filter(Boolean)))
            if (uids.length === 0) throw new Error("No hay alumnos con cuenta para notificar")

            const notifs = uids.map(uid => ({
                usuario_id: uid,
                titulo: `Aviso: ${clase?.nombre}`,
                mensaje: notifMessage,
                link: `/mis-clases`
            }))

            await supabase.from('notificaciones').insert(notifs)
            toast.success("Aviso enviado")
            setIsNotifModalOpen(false)
            setNotifMessage('')
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setSendingNotif(false)
        }
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
                            <span className="text-gray-500 text-[10px] font-bold uppercase">{clase?.tipo_clase} • {clase?.sala?.nombre}</span>
                            {clase?.es_audicion && <span className="bg-pink-500/20 text-pink-400 border border-pink-500/30 px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1"><Sparkles size={10} /> Audición</span>}
                        </div>
                        <h1 className="text-2xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none">{clase?.nombre}</h1>
                        <div className="flex gap-3 text-xs text-gray-400 font-medium mt-2">
                            <span className="flex items-center gap-1"><Calendar size={12} className="text-[#D4E655]" /> {clase && format(new Date(clase.inicio), "EEE d", { locale: es })}</span>
                            <span className="flex items-center gap-1"><Clock size={12} className="text-[#D4E655]" /> {clase && format(new Date(clase.inicio), "HH:mm")}</span>
                            <span className="flex items-center gap-1"><User size={12} className="text-[#D4E655]" /> {clase?.profesor?.nombre_completo}</span>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
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
                            {!clase?.es_audicion && (
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
                                            <button onClick={() => setAlumnoSeleccionado(null)}><X size={16} /></button>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-4 gap-2">
                                        {['usar_credito', 'suelta', 'pack', 'invitado'].map(t => (
                                            <button key={t} type="button" onClick={() => setGuestForm({ ...guestForm, tipo: t as any })} className={`p-3 rounded-2xl border text-[8px] font-black uppercase ${guestForm.tipo === t ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] border-white/5 text-gray-500'}`}>{t.replace('_', ' ')}</button>
                                        ))}
                                    </div>
                                </>
                            )}
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
                            <button disabled={processing} type="submit" className={`w-full py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all ${clase?.es_audicion ? 'bg-pink-500' : 'bg-[#D4E655] text-black'}`}>
                                {processing ? <Loader2 className="animate-spin mx-auto" /> : 'Confirmar Registro'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}