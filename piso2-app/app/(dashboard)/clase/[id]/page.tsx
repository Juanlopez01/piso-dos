'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    ArrowLeft, Calendar, Clock, User, Check, X,
    DollarSign, FileText, UserPlus, Trash2, AlertTriangle,
    Wallet, CreditCard, Loader2, Users, Star, Ticket
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'

// --- TIPOS ---
type Inscripcion = {
    id: string
    user_id: string | null
    user: { nombre: string; apellido: string; email: string } | null
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

export default function ClaseDetallePage() {
    const params = useParams()
    const router = useRouter()
    const supabase = createClient()

    const [clase, setClase] = useState<ClaseDetalle | null>(null)
    const [inscripciones, setInscripciones] = useState<Inscripcion[]>([])
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState<string>('profesor')

    // Modales
    const [isGuestOpen, setIsGuestOpen] = useState(false)
    const [actionModal, setActionModal] = useState<{ isOpen: boolean, type: 'cancel' | 'notify' }>({ isOpen: false, type: 'notify' })
    const [processing, setProcessing] = useState(false)

    // Form Registro Rápido
    const [guestForm, setGuestForm] = useState({
        nombre: '',
        apellido: '',
        email: '',
        telefono: '',
        tipo: 'suelta' as 'suelta' | 'pack' | 'invitado',
        pago: 'efectivo' as 'efectivo' | 'transferencia'
    })

    // Finanzas
    const [totalRecaudado, setTotalRecaudado] = useState(0)
    const [pagoDocente, setPagoDocente] = useState(0)

    const PRECIOS_ALUMNO = {
        Regular: { efectivo: 14000, transferencia: 15000 },
        Especial: { efectivo: 16000, transferencia: 18000 }
    }

    const PRECIOS_BASE_CALCULO = {
        Regular: 14000,
        Especial: 16000
    }

    useEffect(() => { if (params.id) fetchData() }, [params.id])

    useEffect(() => {
        if (!clase) return
        const totalCaja = inscripciones.reduce((acc, curr) => acc + (curr.valor_credito || 0), 0)
        setTotalRecaudado(totalCaja)

        if (clase.tipo_acuerdo === 'fijo') {
            setPagoDocente(clase.valor_acuerdo)
        } else {
            const tipoKey = (clase.tipo_clase === 'Especial') ? 'Especial' : 'Regular'
            const precioBase = PRECIOS_BASE_CALCULO[tipoKey]
            const baseParaProfe = inscripciones.length * precioBase
            setPagoDocente((baseParaProfe * clase.valor_acuerdo) / 100)
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
        const { data: dataInsc } = await supabase.from('inscripciones').select(`*, user:profiles(nombre, apellido, email)`).eq('clase_id', claseId).order('created_at', { ascending: true })

        if (dataClase) setClase(dataClase as any)
        if (dataInsc) setInscripciones(dataInsc as any)
        setLoading(false)
    }

    const toggleAsistencia = async (insc: Inscripcion) => {
        const newVal = !insc.presente
        setInscripciones(prev => prev.map(i => i.id === insc.id ? { ...i, presente: newVal } : i))
        await supabase.from('inscripciones').update({ presente: newVal }).eq('id', insc.id)
        if (newVal) toast.success('Presente')
    }

    const handleAddGuest = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!clase) return
        setProcessing(true)

        try {
            const tipoKey = (clase.tipo_clase === 'Especial') ? 'Especial' : 'Regular'
            const precios = PRECIOS_ALUMNO[tipoKey]

            let monto = 0
            let modalidad = ""

            if (guestForm.tipo === 'invitado') {
                monto = 0
                modalidad = "Invitado (Beca/Cortesia)"
            } else if (guestForm.tipo === 'suelta') {
                monto = guestForm.pago === 'efectivo' ? precios.efectivo : precios.transferencia
                modalidad = `Clase Suelta (${guestForm.pago === 'efectivo' ? 'Efec' : 'Transf'})`
            } else {
                monto = guestForm.pago === 'efectivo' ? precios.efectivo * 4 : precios.transferencia * 4
                modalidad = `Pack x4 (${guestForm.pago === 'efectivo' ? 'Efec' : 'Transf'})`
            }

            let alumnoId = null
            // Buscar o crear perfil si se provee email o teléfono
            if (guestForm.email || guestForm.telefono) {
                const { data: ext } = await supabase.from('profiles').select('id').eq('email', guestForm.email).maybeSingle()
                if (ext) {
                    alumnoId = ext.id
                } else {
                    const { data: nuevo } = await supabase.from('profiles').insert({
                        nombre: guestForm.nombre,
                        apellido: guestForm.apellido,
                        email: guestForm.email,
                        telefono: guestForm.telefono,
                        rol: 'alumno'
                    }).select().single()
                    alumnoId = nuevo?.id
                }
            }

            const newInsc = {
                clase_id: clase.id,
                user_id: alumnoId,
                nombre_invitado: !alumnoId ? `${guestForm.nombre} ${guestForm.apellido}` : null,
                es_invitado: guestForm.tipo === 'invitado',
                presente: true,
                metodo_pago: guestForm.tipo === 'invitado' ? 'n/a' : guestForm.pago,
                valor_credito: monto,
                modalidad: modalidad
            }

            const { data, error } = await supabase.from('inscripciones').insert(newInsc).select().single()
            if (error) throw error

            // Impacto en CAJA
            if (monto > 0) {
                const { data: turno } = await supabase.from('caja_turnos').select('id').eq('estado', 'abierta').maybeSingle()
                if (turno) {
                    await supabase.from('caja_movimientos').insert({
                        turno_id: turno.id,
                        tipo: 'ingreso',
                        concepto: `Clase ${guestForm.tipo}: ${guestForm.nombre} ${guestForm.apellido}`,
                        monto: monto,
                        metodo_pago: guestForm.pago,
                        origen_referencia: 'alumnos'
                    })
                }
            }

            setInscripciones([...inscripciones, { ...data, user: alumnoId ? { nombre: guestForm.nombre, apellido: guestForm.apellido, email: guestForm.email } : null }])
            toast.success('Inscripción registrada')
            setIsGuestOpen(false)
            setGuestForm({ nombre: '', apellido: '', email: '', telefono: '', tipo: 'suelta', pago: 'efectivo' })

        } catch (err) {
            console.error("DETALLE DEL ERROR:", err); // <--- ESTO te va a decir qué columna falta
            toast.error('Error al registrar: ver consola');
        } finally {
            setProcessing(false);
        }
    }

    const handleDeleteInscripcion = async (id: string) => {
        if (!confirm('¿Eliminar de la lista?')) return
        await supabase.from('inscripciones').delete().eq('id', id)
        setInscripciones(prev => prev.filter(i => i.id !== id))
        toast.success('Eliminado')
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-[#D4E655]">Cargando...</div>

    // Lógica de precios para el renderizado del modal
    const tipoClaseKey = clase?.tipo_clase === 'Especial' ? 'Especial' : 'Regular';
    const preciosActuales = PRECIOS_ALUMNO[tipoClaseKey];
    const totalModal = guestForm.tipo === 'invitado' ? 0 : (guestForm.pago === 'efectivo' ? preciosActuales.efectivo : preciosActuales.transferencia) * (guestForm.tipo === 'pack' ? 4 : 1);

    const showFinance = userRole === 'admin' || userRole === 'recepcion';

    return (
        <div className="min-h-screen bg-[#050505] text-white p-2 md:p-8 pb-32">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col gap-4 mb-6 md:mb-8">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest px-2"><ArrowLeft size={16} /> Volver</button>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-6 gap-4 px-2">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${clase?.estado === 'cancelada' ? 'bg-red-500 text-white' : 'bg-[#D4E655] text-black'}`}>{clase?.estado === 'cancelada' ? 'Cancelada' : 'Activa'}</span>
                            <span className="text-gray-500 text-[10px] font-bold uppercase">{clase?.tipo_clase} • {clase?.sala?.nombre}</span>
                        </div>
                        <h1 className={`text-2xl md:text-5xl font-black uppercase tracking-tighter mb-1 leading-none ${clase?.estado === 'cancelada' ? 'text-gray-500 line-through' : 'text-white'}`}>{clase?.nombre}</h1>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-400 font-medium">
                            <span className="flex items-center gap-1"><Calendar size={12} className="text-[#D4E655]" /> {clase && format(new Date(clase.inicio), "EEE d", { locale: es })}</span>
                            <span className="flex items-center gap-1"><Clock size={12} className="text-[#D4E655]" /> {clase && format(new Date(clase.inicio), "HH:mm")}</span>
                            <span className="flex items-center gap-1"><User size={12} className="text-[#D4E655]" /> {clase?.profesor?.nombre_completo}</span>
                        </div>
                    </div>
                    <button onClick={() => setIsGuestOpen(true)} className="w-full md:w-auto bg-[#D4E655] text-black px-6 py-4 rounded-2xl font-black uppercase text-xs hover:bg-white transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(212,230,85,0.2)]">
                        <UserPlus size={18} /> <span>Inscribir / Cobrar</span>
                    </button>
                </div>
            </div>

            <div className={`grid grid-cols-1 ${showFinance ? 'lg:grid-cols-3' : 'lg:grid-cols-1 max-w-4xl mx-auto'} gap-8 px-2 md:px-0`}>
                {/* LISTA */}
                <div className={showFinance ? "lg:col-span-2 space-y-4" : "space-y-4"}>
                    <div className="flex justify-between items-center px-1"><h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2"><Users size={18} className="text-[#D4E655]" /> Alumnos</h3><span className="text-[10px] font-bold bg-white/10 px-3 py-1 rounded-full">{inscripciones.length} Pax</span></div>
                    <div className="bg-[#09090b] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                        {inscripciones.map((insc) => (
                            <div key={insc.id} className={`p-4 border-b border-white/5 flex items-center justify-between gap-3 ${insc.presente ? 'bg-[#D4E655]/5' : ''}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-white text-sm md:text-lg leading-tight truncate">
                                        {insc.es_invitado ? insc.nombre_invitado : `${insc.user?.nombre} ${insc.user?.apellido}`}
                                        {insc.es_invitado && <span className="ml-2 text-[8px] bg-purple-500 text-white px-1.5 py-0.5 rounded uppercase">Guest</span>}
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] md:text-xs text-gray-500 font-bold uppercase mt-1">
                                        <span>{insc.modalidad}</span>
                                        {showFinance && <><span className="text-white/20">•</span><span className="text-[#D4E655]">${insc.valor_credito.toLocaleString()}</span></>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => toggleAsistencia(insc)} className={`h-11 px-4 md:px-6 rounded-xl flex items-center justify-center gap-2 border transition-all ${insc.presente ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-transparent text-gray-600 border-white/10'}`}>
                                        {insc.presente ? <Check size={20} strokeWidth={3} /> : <X size={20} />}
                                        <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">{insc.presente ? 'Presente' : 'Ausente'}</span>
                                    </button>
                                    {showFinance && <button onClick={() => handleDeleteInscripcion(insc.id)} className="text-gray-600 hover:text-red-500 p-2"><Trash2 size={18} /></button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* SIDEBAR */}
                {showFinance && (
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 shadow-2xl">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6">Liquidación Clase</h4>
                            <div className="space-y-4 mb-8 text-xs font-bold uppercase">
                                <div className="flex justify-between items-center text-gray-400"><span>Caja Real</span><span className="text-white">${totalRecaudado.toLocaleString()}</span></div>
                                <div className="flex justify-between items-center text-gray-400"><span>Acuerdo</span><span className="text-[#D4E655]">{clase?.tipo_acuerdo} {clase?.valor_acuerdo}{clase?.tipo_acuerdo === 'porcentaje' ? '%' : ''}</span></div>
                            </div>
                            <div className="bg-[#D4E655] rounded-2xl p-6 text-center shadow-[0_0_20px_rgba(212,230,85,0.15)]">
                                <p className="text-[9px] font-black uppercase tracking-widest text-black/60 mb-1">Pago Docente</p>
                                <div className="text-4xl font-black text-black tracking-tighter">${pagoDocente.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL INSCRIPCIÓN */}
            {isGuestOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setIsGuestOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <h3 className="text-2xl font-black text-white uppercase text-center mb-6 tracking-tighter">Inscripción Rápida</h3>
                        <form onSubmit={handleAddGuest} className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Nombre</label><input required autoFocus value={guestForm.nombre} onChange={e => setGuestForm({ ...guestForm, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Apellido</label><input required value={guestForm.apellido} onChange={e => setGuestForm({ ...guestForm, apellido: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                            </div>
                            <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase ml-1">WhatsApp / Email</label><input value={guestForm.telefono} onChange={e => setGuestForm({ ...guestForm, telefono: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white outline-none focus:border-[#D4E655]" placeholder="Ej: 11... o mail@mail.com" /></div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Modalidad</label>
                                <div className="grid grid-cols-3 gap-3">
                                    <button type="button" onClick={() => setGuestForm({ ...guestForm, tipo: 'suelta' })} className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${guestForm.tipo === 'suelta' ? 'bg-[#D4E655] border-[#D4E655] text-black' : 'bg-[#111] border-white/5 text-gray-500'}`}><Ticket size={20} /><span className="text-[9px] font-black uppercase">Suelta</span></button>
                                    <button type="button" onClick={() => setGuestForm({ ...guestForm, tipo: 'pack' })} className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${guestForm.tipo === 'pack' ? 'bg-[#D4E655] border-[#D4E655] text-black' : 'bg-[#111] border-white/5 text-gray-500'}`}><Star size={20} /><span className="text-[9px] font-black uppercase">Pack</span></button>
                                    <button type="button" onClick={() => setGuestForm({ ...guestForm, tipo: 'invitado' })} className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${guestForm.tipo === 'invitado' ? 'bg-purple-600 border-purple-600 text-white font-black' : 'bg-[#111] border-white/5 text-gray-500'}`}><Users size={20} /><span className="text-[9px] font-black uppercase">Invitado</span></button>
                                </div>
                            </div>
                            {guestForm.tipo !== 'invitado' && (
                                <div className="animate-in slide-in-from-top-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <button type="button" onClick={() => setGuestForm({ ...guestForm, pago: 'efectivo' })} className={`p-4 rounded-2xl border flex items-center justify-center gap-3 ${guestForm.pago === 'efectivo' ? 'bg-white/10 border-white text-white' : 'bg-transparent border-white/5 text-gray-500'}`}><Wallet size={18} /><span>Efectivo</span></button>
                                        <button type="button" onClick={() => setGuestForm({ ...guestForm, pago: 'transferencia' })} className={`p-4 rounded-2xl border flex items-center justify-center gap-3 ${guestForm.pago === 'transferencia' ? 'bg-white/10 border-white text-white' : 'bg-transparent border-white/5 text-gray-500'}`}><CreditCard size={18} /><span>Transf / MP</span></button>
                                    </div>
                                    <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 p-4 rounded-2xl flex justify-between items-center"><span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total</span><span className="text-2xl font-black text-[#D4E655]">${totalModal.toLocaleString()}</span></div>
                                </div>
                            )}
                            <button disabled={processing} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-5 rounded-2xl text-sm tracking-widest shadow-xl hover:bg-white transition-all">
                                {processing ? <Loader2 className="animate-spin mx-auto" /> : 'Confirmar e Inscribir'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}