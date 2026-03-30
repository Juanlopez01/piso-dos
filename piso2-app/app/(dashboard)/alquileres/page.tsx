'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    Plus, Calendar, Clock, DollarSign, User, MapPin,
    Trash2, CheckCircle, Loader2, X, MessageCircle,
    Repeat, Settings, ChevronDown, ChevronUp, Layers, Sun, Moon, Zap, Copy, Tag,
    Banknote, Landmark
} from 'lucide-react'
import { format, isSunday, isSaturday } from 'date-fns'
import { es } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import MultiDatePicker from '@/components/MultiDatePicker'
import { useCash } from '@/context/CashContext'

// Tipos
type ReservaGroup = {
    group_id: string
    cliente_nombre: string
    cliente_contacto: string
    sala_nombre: string
    sala_id: string
    tipo_uso: string
    estado: string
    estado_pago: string
    total_grupo: number
    total_pagado: number
    items: any[]
}

export default function AlquileresPage() {
    const [supabase] = useState(() => createClient())
    const { isBoxOpen, currentTurnoId } = useCash()

    // Datos Globales
    const [grupos, setGrupos] = useState<ReservaGroup[]>([])
    const [salas, setSalas] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // UI States
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isTarifasOpen, setIsTarifasOpen] = useState(false)
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
    const [expandedSala, setExpandedSala] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)

    // --- ESTADOS NUEVOS PARA EL MODAL DE COBRO ---
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [selectedGroup, setSelectedGroup] = useState<ReservaGroup | null>(null)
    const [paymentType, setPaymentType] = useState<'seña' | 'total' | 'resto'>('total')
    const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia'>('efectivo')
    const [processingPayment, setProcessingPayment] = useState(false)

    const [form, setForm] = useState({
        cliente_nombre: '',
        cliente_contacto: '',
        sala_id: '',
        fechas: [] as Date[],
        hora_inicio: '18:00',
        hora_fin: '22:00',
        tipo_uso: 'ensayo',
        descuento: 0
    })

    const [priceBreakdown, setPriceBreakdown] = useState({
        manana: { horas: 0, precio: 0, subtotal: 0 },
        noche: { horas: 0, precio: 0, subtotal: 0 },
        finde: { horas: 0, precio: 0, subtotal: 0 },
        subtotalBase: 0,
        montoDescuento: 0,
        total: 0
    })

    useEffect(() => { fetchData() }, [])

    useEffect(() => {
        if (!form.sala_id || !form.hora_inicio || !form.hora_fin || form.fechas.length === 0) {
            setPriceBreakdown({ manana: { horas: 0, precio: 0, subtotal: 0 }, noche: { horas: 0, precio: 0, subtotal: 0 }, finde: { horas: 0, precio: 0, subtotal: 0 }, subtotalBase: 0, montoDescuento: 0, total: 0 })
            return
        }

        const sala = salas.find(s => s.id === form.sala_id)
        if (!sala) return

        const tipoPrefix = form.tipo_uso === 'produccion' ? 'p_prod' : `p_${form.tipo_uso}`
        const pManana = Number(sala[`${tipoPrefix}_manana`] || 0)
        const pNoche = Number(sala[`${tipoPrefix}_noche`] || 0)
        const pFinde = Number(sala[`${tipoPrefix}_finde`] || 0)

        const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h + m / 60 }
        const start = parseTime(form.hora_inicio)
        const end = parseTime(form.hora_fin)
        let duration = end - start
        if (duration < 0) duration = 0

        let totalHManana = 0
        let totalHNoche = 0
        let totalHFinde = 0
        const CORTE_HORARIO = 18.0

        form.fechas.forEach(fecha => {
            if (isSunday(fecha)) {
                totalHFinde += duration
            } else {
                let hManana = 0
                let hNoche = 0
                if (end <= CORTE_HORARIO) { hManana = duration }
                else if (start >= CORTE_HORARIO) { hNoche = duration }
                else { hManana = CORTE_HORARIO - start; hNoche = end - CORTE_HORARIO }
                totalHManana += hManana
                totalHNoche += hNoche
            }
        })

        const subtotalCalculado = (totalHManana * pManana) + (totalHNoche * pNoche) + (totalHFinde * pFinde)
        const descuentoCalculado = subtotalCalculado * ((form.descuento || 0) / 100)

        setPriceBreakdown({
            manana: { horas: totalHManana, precio: pManana, subtotal: totalHManana * pManana },
            noche: { horas: totalHNoche, precio: pNoche, subtotal: totalHNoche * pNoche },
            finde: { horas: totalHFinde, precio: pFinde, subtotal: totalHFinde * pFinde },
            subtotalBase: subtotalCalculado,
            montoDescuento: descuentoCalculado,
            total: subtotalCalculado - descuentoCalculado
        })

    }, [form.sala_id, form.hora_inicio, form.hora_fin, form.tipo_uso, form.fechas, form.descuento, salas])

    const fetchData = async () => {
        setLoading(true)
        const { data: s } = await supabase.from('salas').select('*').order('nombre')
        if (s) setSalas(s)

        const { data: rawData } = await supabase
            .from('alquileres')
            .select(`*, sala:salas(nombre)`)
            .order('fecha', { ascending: false })
            .limit(100)

        if (rawData) {
            const agrupados: Record<string, ReservaGroup> = {}
            rawData.forEach((item: any) => {
                const gId = item.group_id || item.id
                if (!agrupados[gId]) {
                    agrupados[gId] = {
                        group_id: gId,
                        cliente_nombre: item.cliente_nombre || 'Sin Nombre',
                        cliente_contacto: item.cliente_contacto || '',
                        sala_nombre: item.sala?.nombre || 'Sala',
                        sala_id: item.sala_id,
                        tipo_uso: item.tipo_uso || 'ensayo',
                        estado: 'pendiente',
                        estado_pago: 'pendiente',
                        total_grupo: 0,
                        total_pagado: 0,
                        items: []
                    }
                }
                agrupados[gId].items.push(item)
                agrupados[gId].total_grupo += Number(item.monto_total)
                agrupados[gId].total_pagado += Number(item.monto_pagado || 0) // ACUMULAMOS LO PAGADO
            })

            const listaGrupos = Object.values(agrupados).map(g => {
                // CALCULAMOS EL ESTADO REAL EN BASE AL MONTO PAGADO VS TOTAL
                if (g.total_pagado >= g.total_grupo && g.total_grupo > 0) {
                    g.estado_pago = 'pagado'
                } else if (g.total_pagado > 0) {
                    g.estado_pago = 'seña_pagada'
                } else {
                    g.estado_pago = 'pendiente'
                }
                g.estado = g.estado_pago
                g.items.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                return g
            })
            listaGrupos.sort((a, b) => new Date(b.items[0].fecha).getTime() - new Date(a.items[0].fecha).getTime())
            setGrupos(listaGrupos)
        }
        setLoading(false)
    }

    const handleTarifaChange = (salaId: string, field: string, value: string) => {
        const numValue = value === '' ? 0 : Number(value)
        setSalas(prev => prev.map(s => s.id === salaId ? { ...s, [field]: numValue } : s))
    }

    const handleTarifaBlur = async (salaId: string, field: string, value: number) => {
        const { error } = await supabase.from('salas').update({ [field]: value }).eq('id', salaId)
        if (error) toast.error('Error al guardar precio')
        else toast.success('Precio actualizado')
    }

    const checkConflictos = async (salaId: string, dateObj: Date, hInicio: string, hFin: string) => {
        const fechaStr = format(dateObj, 'yyyy-MM-dd')
        const [hs, ms] = hInicio.split(':')
        const [he, me] = hFin.split(':')

        const reqStart = new Date(dateObj)
        reqStart.setHours(Number(hs), Number(ms), 0, 0)

        const reqEnd = new Date(dateObj)
        reqEnd.setHours(Number(he), Number(me), 0, 0)

        const { data: clases } = await supabase.from('clases')
            .select('nombre').eq('sala_id', salaId).neq('estado', 'cancelada')
            .lt('inicio', reqEnd.toISOString()).gt('fin', reqStart.toISOString()).maybeSingle()
        if (clases) return `Clase: ${clases.nombre}`

        const { data: alqs } = await supabase.from('alquileres')
            .select('cliente_nombre').eq('sala_id', salaId).eq('fecha', fechaStr)
            .in('estado', ['confirmado', 'pagado', 'pendiente']).lt('hora_inicio', hFin).gt('hora_fin', hInicio).maybeSingle()
        if (alqs) return `Alquiler: ${alqs.cliente_nombre}`

        return null
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (form.fechas.length === 0) return toast.error('Seleccioná fechas')
        setCreating(true)

        const newGroupId = uuidv4()
        const sala = salas.find(s => s.id === form.sala_id)

        try {
            for (const date of form.fechas) {
                const conflicto = await checkConflictos(form.sala_id, date, form.hora_inicio, form.hora_fin)
                if (conflicto) {
                    throw new Error(`Conflicto el ${format(date, 'dd/MM')}: ya existe un/a ${conflicto}`)
                }
            }

            const calculateDayCost = (date: Date) => {
                if (!sala) return 0
                const tipoPrefix = form.tipo_uso === 'produccion' ? 'p_prod' : `p_${form.tipo_uso}`
                const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h + m / 60 }
                const start = parseTime(form.hora_inicio)
                const end = parseTime(form.hora_fin)
                const duration = Math.max(0, end - start)

                let baseCost = 0
                if (isSunday(date)) {
                    baseCost = duration * Number(sala[`${tipoPrefix}_finde`] || 0)
                } else {
                    const CORTE = 18.0
                    let hManana = 0, hNoche = 0
                    if (end <= CORTE) hManana = duration
                    else if (start >= CORTE) hNoche = duration
                    else { hManana = CORTE - start; hNoche = end - CORTE }
                    baseCost = (hManana * Number(sala[`${tipoPrefix}_manana`] || 0)) + (hNoche * Number(sala[`${tipoPrefix}_noche`] || 0))
                }
                const multiplier = 1 - ((form.descuento || 0) / 100)
                return baseCost * multiplier
            }

            const inserts = form.fechas.map(date => ({
                group_id: newGroupId,
                cliente_nombre: form.cliente_nombre,
                cliente_contacto: form.cliente_contacto,
                sala_id: form.sala_id,
                fecha: format(date, 'yyyy-MM-dd'),
                hora_inicio: form.hora_inicio,
                hora_fin: form.hora_fin,
                monto_total: calculateDayCost(date),
                monto_pagado: 0,
                estado_pago: 'pendiente',
                tipo_uso: form.tipo_uso,
                estado: 'pendiente'
            }))

            const { error } = await supabase.from('alquileres').insert(inserts)
            if (error) throw new Error('Error al guardar en la base de datos.')

            toast.success('Reserva creada con éxito')
            setIsModalOpen(false)
            setForm({ ...form, cliente_nombre: '', fechas: [], descuento: 0 })
            fetchData()
        } catch (err: any) {
            toast.error(err.message, { duration: 5000 })
        } finally {
            setCreating(false)
        }
    }

    const handleCopyPresupuesto = () => {
        if (form.fechas.length === 0 || !form.sala_id) return toast.error("Faltan datos")
        const sala = salas.find(s => s.id === form.sala_id)
        const nombreSala = sala ? sala.nombre : "Sala seleccionada"
        const actividad = form.tipo_uso.charAt(0).toUpperCase() + form.tipo_uso.slice(1)

        let fechasTexto = form.fechas.map(d => `- ${format(d, 'EEEE dd/MM', { locale: es })}`).join('\n')

        let textoWsp = `*Presupuesto de Alquiler* 🏢\n\n*Actividad:* ${actividad}\n*Sala:* ${nombreSala}\n*Horario:* ${form.hora_inicio} a ${form.hora_fin} hs\n\n*Fechas solicitadas:*\n${fechasTexto}\n\n`
        if (form.descuento > 0) {
            textoWsp += `*Subtotal:* $${priceBreakdown.subtotalBase.toLocaleString()}\n*Descuento especial (${form.descuento}%):* -$${priceBreakdown.montoDescuento.toLocaleString()}\n`
        }
        textoWsp += `*Total a pagar: $${priceBreakdown.total.toLocaleString()}*\n\n_Para confirmar la reserva, por favor envianos el comprobante de seña. ¡Gracias!_`

        navigator.clipboard.writeText(textoWsp).then(() => toast.success('¡Presupuesto copiado!')).catch(() => toast.error('Error al copiar'))
    }

    // --- FUNCIONES NUEVAS DE COBRO AVANZADO ---
    const openPaymentModal = (group: ReservaGroup) => {
        if (!isBoxOpen || !currentTurnoId) {
            return toast.error('¡Caja Cerrada! Tenés que abrir la caja en tu sede antes de poder cobrar.')
        }
        setSelectedGroup(group)
        // Por defecto: Si no pagó nada, ofrecemos la seña. Si ya pagó la seña, ofrecemos el resto.
        setPaymentType(group.estado_pago === 'pendiente' ? 'seña' : 'resto')
        setPaymentMethod('efectivo')
        setIsPaymentModalOpen(true)
    }

    const handleConfirmPayment = async () => {
        if (!selectedGroup) return
        setProcessingPayment(true)

        try {
            let montoACobrar = 0
            let labelCobro = ''

            // Preparamos las actualizaciones para cada ítem del grupo
            const updates = selectedGroup.items.map(item => {
                let nuevoMontoPagado = Number(item.monto_pagado || 0)
                let nuevoEstadoPago = item.estado_pago || 'pendiente'
                let nuevoEstado = item.estado
                let addAmount = 0

                if (paymentType === 'seña') {
                    addAmount = Number(item.monto_total) / 2
                    nuevoMontoPagado = addAmount
                    nuevoEstadoPago = 'seña_pagada'
                    nuevoEstado = 'confirmado' // Se reserva la sala
                    labelCobro = 'Seña 50%'
                } else if (paymentType === 'total') {
                    addAmount = Number(item.monto_total)
                    nuevoMontoPagado = addAmount
                    nuevoEstadoPago = 'pagado'
                    nuevoEstado = 'pagado'
                    labelCobro = 'Total 100%'
                } else if (paymentType === 'resto') {
                    addAmount = Number(item.monto_total) - nuevoMontoPagado
                    nuevoMontoPagado = Number(item.monto_total)
                    nuevoEstadoPago = 'pagado'
                    nuevoEstado = 'pagado'
                    labelCobro = 'Saldo Restante'
                }

                montoACobrar += addAmount

                return supabase.from('alquileres').update({
                    monto_pagado: nuevoMontoPagado,
                    estado_pago: nuevoEstadoPago,
                    estado: nuevoEstado,
                    metodo_pago: paymentMethod
                }).eq('id', item.id)
            })

            // Ejecutamos todos los updates en paralelo
            await Promise.all(updates)

            // Registramos el ingreso en la Caja del usuario
            const { error: errorMov } = await supabase.from('caja_movimientos').insert({
                turno_id: currentTurnoId,
                tipo: 'ingreso',
                concepto: `Alquiler ${selectedGroup.sala_nombre}: ${selectedGroup.cliente_nombre} - ${labelCobro}`,
                monto: montoACobrar,
                metodo_pago: paymentMethod,
                origen_referencia: 'alquileres'
            })

            if (errorMov) throw new Error('Error al registrar en caja')

            toast.success(`¡${labelCobro} cobrado con éxito! ($${montoACobrar.toLocaleString()})`)
            setIsPaymentModalOpen(false)
            fetchData()
        } catch (error) {
            toast.error('Hubo un error al procesar el pago.')
        } finally {
            setProcessingPayment(false)
        }
    }

    const handleDeleteGroup = async (group: ReservaGroup) => {
        if (!confirm('¿Eliminar reserva completa?')) return
        await supabase.from('alquileres').delete().in('id', group.items.map(i => i.id))
        setGrupos(prev => prev.filter(g => g.group_id !== group.group_id))
        toast.success('Reserva eliminada')
    }

    const handleRenovar = (group: ReservaGroup) => {
        const base = group.items[0]
        setForm({
            cliente_nombre: group.cliente_nombre || '',
            cliente_contacto: group.cliente_contacto || '',
            sala_id: group.sala_id || '',
            tipo_uso: group.tipo_uso || 'ensayo',
            hora_inicio: base.hora_inicio || '10:00',
            hora_fin: base.hora_fin || '12:00',
            descuento: 0,
            fechas: []
        })
        setIsModalOpen(true)
        toast.info('Elegí nuevas fechas')
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>

    const VISIBLE_TAGS = 12

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter text-white">Alquileres</h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest">Gestión de Salas</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button onClick={() => setIsTarifasOpen(true)} className="flex-1 md:flex-none bg-[#111] text-gray-300 border border-white/10 px-4 py-3 rounded-xl font-bold uppercase text-xs hover:bg-white hover:text-black transition-all flex justify-center items-center gap-2">
                        <Settings size={16} /> Tarifas
                    </button>
                    <button onClick={() => { setForm({ ...form, fechas: [], descuento: 0 }); setIsModalOpen(true) }} className="flex-1 md:flex-none bg-[#D4E655] text-black px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-all flex justify-center items-center gap-2 shadow-lg">
                        <Plus size={16} /> Nueva
                    </button>
                </div>
            </div>

            {/* GRILLA GRUPOS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {grupos.map((group) => {
                    const isFullyPaid = group.estado_pago === 'pagado'
                    const isSena = group.estado_pago === 'seña_pagada'
                    const isOpen = expandedGroup === group.group_id

                    // Colores de la etiqueta según el estado de pago
                    let tagClass = 'bg-red-500/20 text-red-500'
                    let tagText = 'Pendiente'
                    if (isSena) { tagClass = 'bg-yellow-500/20 text-yellow-500'; tagText = 'Seña 50%' }
                    if (isFullyPaid) { tagClass = 'bg-green-500/20 text-green-500'; tagText = 'Pagado' }

                    const saldoRestante = group.total_grupo - group.total_pagado

                    return (
                        <div key={group.group_id} className="bg-[#09090b] border border-white/10 rounded-2xl overflow-hidden flex flex-col hover:border-[#D4E655]/30 transition-all">
                            <div className="p-4 border-b border-white/5 bg-[#111]/50 relative">
                                <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest ${tagClass}`}>{tagText}</div>
                                <div className="flex items-center gap-2 mb-1 text-[#D4E655] text-[10px] font-black uppercase tracking-wider"><MapPin size={12} /> {group.sala_nombre} • {group.tipo_uso}</div>
                                <h3 className="text-lg font-bold text-white truncate pr-16">{group.cliente_nombre}</h3>
                                {group.cliente_contacto && <div className="flex items-center gap-2 mt-1"><a href={`https://wa.me/${group.cliente_contacto.replace(/[^0-9]/g, '')}`} target="_blank" className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-green-400 transition-colors"><MessageCircle size={12} /> {group.cliente_contacto}</a></div>}
                            </div>
                            <div className="p-4 flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2 text-xs font-bold text-gray-300"><Layers size={14} /> {group.items.length} Reservas</div>
                                    <div className="text-right"><span className="block text-[10px] text-gray-500 uppercase font-bold">Total</span><span className="text-sm font-black text-white">${group.total_grupo.toLocaleString()}</span></div>
                                </div>
                                <div className="flex justify-between items-center mb-3 pt-2 border-t border-white/5">
                                    <div className="text-[9px] uppercase font-bold text-gray-500">Abonado: <span className={isSena || isFullyPaid ? 'text-green-400' : 'text-gray-400'}>${group.total_pagado.toLocaleString()}</span></div>
                                    <div className="text-[9px] uppercase font-bold text-gray-500">Saldo: <span className={saldoRestante > 0 ? 'text-red-400' : 'text-gray-400'}>${saldoRestante.toLocaleString()}</span></div>
                                </div>

                                <div className={`space-y-1 overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-64 overflow-y-auto custom-scrollbar' : 'max-h-0'}`}>
                                    {group.items.map(item => (
                                        <div key={item.id} className="flex justify-between items-center text-[10px] p-2 rounded bg-white/5 border border-white/5">
                                            <div className="flex items-center gap-2 text-gray-300"><Calendar size={10} /> {format(new Date(item.fecha), "EEE d MMM", { locale: es })}</div>
                                            <div className="flex gap-2">
                                                <span className="font-mono text-gray-500">{item.hora_inicio}-{item.hora_fin}</span>
                                                <span className="font-bold text-[#D4E655]">${item.monto_total}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => setExpandedGroup(isOpen ? null : group.group_id)} className="w-full mt-2 py-1 flex items-center justify-center gap-1 text-[9px] font-bold text-gray-500 uppercase hover:text-white transition-colors">{isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {isOpen ? 'Ocultar' : 'Ver detalle'}</button>
                            </div>
                            <div className="p-3 bg-[#111] flex gap-2 border-t border-white/5">
                                <button onClick={() => handleRenovar(group)} className="p-2 text-gray-500 hover:text-white bg-white/5 rounded-lg transition-colors"><Repeat size={16} /></button>
                                {!isFullyPaid ? (
                                    <button onClick={() => openPaymentModal(group)} className="flex-1 bg-[#D4E655] text-black text-[10px] font-black uppercase rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-2">
                                        <DollarSign size={14} /> Cobrar
                                    </button>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase text-green-500 opacity-50 cursor-default border border-green-500/20 rounded-lg"><CheckCircle size={14} /> Cobrado</div>
                                )}
                                <button onClick={() => handleDeleteGroup(group)} className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    )
                })}
                {grupos.length === 0 && <div className="col-span-full text-center py-20 opacity-50"><p className="text-gray-500 font-bold uppercase text-xs">No hay reservas activas.</p></div>}
            </div>

            {/* MODAL COBRO INTELIGENTE */}
            {isPaymentModalOpen && selectedGroup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-[#D4E655]/30 w-full max-w-md rounded-3xl p-6 shadow-2xl shadow-[#D4E655]/10 relative">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><DollarSign className="text-[#D4E655]" /> Cobrar Reserva</h3>
                            <button onClick={() => setIsPaymentModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>

                        <div className="bg-[#111] p-4 rounded-2xl mb-6 border border-white/5 text-center">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{selectedGroup.cliente_nombre}</p>
                            <div className="flex justify-center gap-8 mt-4 text-sm font-black text-white">
                                <div><span className="block text-[10px] text-gray-500 uppercase">Total</span>${selectedGroup.total_grupo.toLocaleString()}</div>
                                <div><span className="block text-[10px] text-green-500 uppercase">Abonado</span>${selectedGroup.total_pagado.toLocaleString()}</div>
                                <div><span className="block text-[10px] text-red-500 uppercase">Saldo</span>${(selectedGroup.total_grupo - selectedGroup.total_pagado).toLocaleString()}</div>
                            </div>
                        </div>

                        {/* TIPO DE COBRO */}
                        <div className="space-y-3 mb-6">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">1. ¿Qué vas a cobrar?</label>
                            <div className="grid grid-cols-1 gap-2">
                                {/* Mostrar opción de Seña solo si no pagó nada */}
                                {selectedGroup.estado_pago === 'pendiente' && (
                                    <button
                                        onClick={() => setPaymentType('seña')}
                                        className={`p-4 rounded-xl border flex justify-between items-center transition-all ${paymentType === 'seña' ? 'bg-[#D4E655]/10 border-[#D4E655] text-[#D4E655]' : 'bg-[#111] border-white/5 text-gray-400 hover:bg-white/5'}`}
                                    >
                                        <span className="font-bold text-xs uppercase">Seña (50%)</span>
                                        <span className="font-black text-lg">${(selectedGroup.total_grupo / 2).toLocaleString()}</span>
                                    </button>
                                )}
                                {/* Mostrar opción de Total solo si no pagó nada */}
                                {selectedGroup.estado_pago === 'pendiente' && (
                                    <button
                                        onClick={() => setPaymentType('total')}
                                        className={`p-4 rounded-xl border flex justify-between items-center transition-all ${paymentType === 'total' ? 'bg-[#D4E655]/10 border-[#D4E655] text-[#D4E655]' : 'bg-[#111] border-white/5 text-gray-400 hover:bg-white/5'}`}
                                    >
                                        <span className="font-bold text-xs uppercase">Total (100%)</span>
                                        <span className="font-black text-lg">${selectedGroup.total_grupo.toLocaleString()}</span>
                                    </button>
                                )}
                                {/* Mostrar opción de Saldo solo si ya pagó la seña */}
                                {selectedGroup.estado_pago === 'seña_pagada' && (
                                    <button
                                        onClick={() => setPaymentType('resto')}
                                        className={`p-4 rounded-xl border flex justify-between items-center transition-all ${paymentType === 'resto' ? 'bg-[#D4E655]/10 border-[#D4E655] text-[#D4E655]' : 'bg-[#111] border-white/5 text-gray-400 hover:bg-white/5'}`}
                                    >
                                        <span className="font-bold text-xs uppercase">Saldo Restante</span>
                                        <span className="font-black text-lg">${(selectedGroup.total_grupo - selectedGroup.total_pagado).toLocaleString()}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* METODO DE PAGO */}
                        <div className="space-y-3 mb-8">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">2. Método de Pago</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setPaymentMethod('efectivo')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${paymentMethod === 'efectivo' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-[#111] border-white/5 text-gray-500 hover:bg-white/5'}`}>
                                    <Banknote size={24} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Efectivo</span>
                                </button>
                                <button onClick={() => setPaymentMethod('transferencia')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${paymentMethod === 'transferencia' ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-[#111] border-white/5 text-gray-500 hover:bg-white/5'}`}>
                                    <Landmark size={24} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Transf. / MP</span>
                                </button>
                            </div>
                        </div>

                        <button onClick={handleConfirmPayment} disabled={processingPayment} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest shadow-lg flex items-center justify-center gap-2">
                            {processingPayment ? <Loader2 className="animate-spin" /> : 'Confirmar Ingreso en Caja'}
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL NUEVA RESERVA */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-4xl rounded-3xl p-6 shadow-2xl relative overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><Plus className="text-[#D4E655]" /> Nueva Reserva</h3>
                            <button onClick={() => setIsModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <div className="flex flex-col lg:flex-row gap-8">
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-3 text-center">1. Seleccionar Fechas</label>
                                <MultiDatePicker selectedDates={form.fechas} onChange={(dates) => setForm({ ...form, fechas: dates })} />

                                <div className="mt-4 bg-[#111] p-3 rounded-xl border border-white/10">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Fechas ({form.fechas.length})</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {form.fechas.length === 0 && <span className="text-xs text-gray-600 italic">Ninguna seleccionada</span>}
                                        {form.fechas.slice(0, VISIBLE_TAGS).map((d, i) => (
                                            <span key={i} className="text-[10px] bg-[#D4E655]/20 text-[#D4E655] px-2 py-1 rounded border border-[#D4E655]/30">
                                                {format(d, 'dd/MM')}
                                            </span>
                                        ))}
                                        {form.fechas.length > VISIBLE_TAGS && <span className="text-[10px] bg-white/10 text-white px-2 py-1 rounded border border-white/10">...</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 space-y-4">
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1 text-center">2. Completar Datos</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Cliente</label><input required value={form.cliente_nombre} onChange={e => setForm({ ...form, cliente_nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" placeholder="Nombre" /></div>
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Contacto</label><input value={form.cliente_contacto} onChange={e => setForm({ ...form, cliente_contacto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" placeholder="11..." /></div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Sala</label><select required value={form.sala_id} onChange={e => setForm({ ...form, sala_id: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]"><option value="">Elegir...</option>{salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Actividad</label><select value={form.tipo_uso} onChange={e => setForm({ ...form, tipo_uso: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]"><option value="ensayo">Ensayo</option><option value="clase">Clase</option><option value="produccion">Producción</option></select></div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Inicio</label><input type="time" required value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" /></div>
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Fin</label><input type="time" required value={form.hora_fin} onChange={e => setForm({ ...form, hora_fin: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" /></div>
                                </div>

                                <div className="space-y-1 pt-2">
                                    <label className="text-[10px] font-bold text-[#D4E655] uppercase flex items-center gap-1"><Tag size={12} /> Descuento Comercial (%)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-gray-500 font-bold">%</span>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={form.descuento || ''}
                                            onChange={e => setForm({ ...form, descuento: Number(e.target.value) })}
                                            className="w-full bg-[#111] border border-white/10 rounded-xl pl-8 p-3 text-white text-sm outline-none focus:border-[#D4E655]"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>

                                <div className="bg-[#111] p-4 rounded-xl border border-white/10 mt-2 space-y-2 relative">
                                    {priceBreakdown.total > 0 && form.fechas.length > 0 && form.sala_id && (
                                        <button
                                            onClick={handleCopyPresupuesto}
                                            className="absolute top-3 right-3 text-gray-500 hover:text-[#D4E655] transition-colors p-1"
                                            title="Copiar Presupuesto para WhatsApp"
                                        >
                                            <Copy size={16} />
                                        </button>
                                    )}

                                    <label className="text-[10px] font-bold text-[#D4E655] uppercase block border-b border-white/10 pb-2 mb-2 pr-6">Resumen de Costos</label>

                                    <div className="space-y-1.5 text-xs text-gray-300">
                                        {priceBreakdown.manana.horas > 0 && (
                                            <div className="flex justify-between">
                                                <span className="flex items-center gap-1.5"><Sun size={12} className="text-yellow-500" /> Matutino (9-18)</span>
                                                <span>{priceBreakdown.manana.horas}hs x ${priceBreakdown.manana.precio} = <span className="font-bold text-white">${priceBreakdown.manana.subtotal.toLocaleString()}</span></span>
                                            </div>
                                        )}
                                        {priceBreakdown.noche.horas > 0 && (
                                            <div className="flex justify-between">
                                                <span className="flex items-center gap-1.5"><Moon size={12} className="text-blue-400" /> Nocturno (18-22)</span>
                                                <span>{priceBreakdown.noche.horas}hs x ${priceBreakdown.noche.precio} = <span className="font-bold text-white">${priceBreakdown.noche.subtotal.toLocaleString()}</span></span>
                                            </div>
                                        )}
                                        {priceBreakdown.finde.horas > 0 && (
                                            <div className="flex justify-between">
                                                <span className="flex items-center gap-1.5"><Zap size={12} className="text-purple-500" /> Domingos/Feriados</span>
                                                <span>{priceBreakdown.finde.horas}hs x ${priceBreakdown.finde.precio} = <span className="font-bold text-white">${priceBreakdown.finde.subtotal.toLocaleString()}</span></span>
                                            </div>
                                        )}

                                        {priceBreakdown.total === 0 && <p className="text-[10px] text-gray-500 italic text-center">Seleccioná días y horarios para calcular</p>}
                                    </div>

                                    <div className="flex flex-col gap-1 mt-3 pt-3 border-t border-white/10">
                                        {form.descuento > 0 && (
                                            <>
                                                <div className="flex justify-between items-center text-gray-400">
                                                    <span className="text-[10px] uppercase font-bold">Subtotal Base</span>
                                                    <span className="text-sm line-through">${priceBreakdown.subtotalBase.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-green-400">
                                                    <span className="text-[10px] uppercase font-bold">Descuento ({form.descuento}%)</span>
                                                    <span className="text-sm">-${priceBreakdown.montoDescuento.toLocaleString()}</span>
                                                </div>
                                            </>
                                        )}
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-[10px] text-white font-black uppercase">TOTAL A PAGAR</span>
                                            <span className="text-2xl font-black text-[#D4E655]">${priceBreakdown.total.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <button onClick={handleCreate} disabled={creating || form.fechas.length === 0} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest shadow-lg flex items-center justify-center gap-2">
                                    {creating ? <Loader2 className="animate-spin" /> : 'Confirmar Reserva'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL TARIFAS */}
            {isTarifasOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-3xl rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <div><h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><Settings className="text-[#D4E655]" /> Tarifario</h3><p className="text-[10px] text-gray-500 font-bold uppercase">Precios base por hora</p></div>
                            <button onClick={() => setIsTarifasOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <div className="overflow-y-auto space-y-3 pr-1">
                            {salas.map(sala => (
                                <div key={sala.id} className="bg-[#111] border border-white/10 rounded-xl overflow-hidden">
                                    <button onClick={() => setExpandedSala(expandedSala === sala.id ? null : sala.id)} className="w-full p-4 flex justify-between items-center bg-white/5 hover:bg-white/10 transition-colors">
                                        <span className="font-bold text-white uppercase text-sm">{sala.nombre}</span>
                                        {expandedSala === sala.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                    {expandedSala === sala.id && (
                                        <div className="p-4 bg-black/20 overflow-x-auto">
                                            <table className="w-full min-w-[400px] text-center border-collapse">
                                                <thead><tr className="text-[9px] font-black text-gray-500 uppercase border-b border-white/10"><th className="pb-2 text-left">Actividad</th><th className="pb-2">Mañana (09-18)</th><th className="pb-2">Noche (18-22)</th><th className="pb-2 text-[#D4E655]">Dom / Feriado</th></tr></thead>
                                                <tbody className="text-xs divide-y divide-white/5">
                                                    {[
                                                        { label: 'Ensayo', p: 'ensayo' },
                                                        { label: 'Clase', p: 'clase' },
                                                        { label: 'Producción', p: 'prod' }
                                                    ].map((tipo) => (
                                                        <tr key={tipo.p} className="hover:bg-white/5">
                                                            <td className="py-3 text-left font-bold text-gray-300 uppercase">{tipo.label}</td>
                                                            <td className="py-1 px-1">
                                                                <input
                                                                    type="number"
                                                                    value={sala[`p_${tipo.p}_manana`] ?? ''}
                                                                    onChange={e => handleTarifaChange(sala.id, `p_${tipo.p}_manana`, e.target.value)}
                                                                    onBlur={e => handleTarifaBlur(sala.id, `p_${tipo.p}_manana`, Number(e.target.value))}
                                                                    className="w-full bg-[#09090b] border border-white/10 rounded p-2 text-center text-white outline-none focus:border-[#D4E655]"
                                                                />
                                                            </td>
                                                            <td className="py-1 px-1">
                                                                <input
                                                                    type="number"
                                                                    value={sala[`p_${tipo.p}_noche`] ?? ''}
                                                                    onChange={e => handleTarifaChange(sala.id, `p_${tipo.p}_noche`, e.target.value)}
                                                                    onBlur={e => handleTarifaBlur(sala.id, `p_${tipo.p}_noche`, Number(e.target.value))}
                                                                    className="w-full bg-[#09090b] border border-white/10 rounded p-2 text-center text-white outline-none focus:border-[#D4E655]"
                                                                />
                                                            </td>
                                                            <td className="py-1 px-1">
                                                                <input
                                                                    type="number"
                                                                    value={sala[`p_${tipo.p}_finde`] ?? ''}
                                                                    onChange={e => handleTarifaChange(sala.id, `p_${tipo.p}_finde`, e.target.value)}
                                                                    onBlur={e => handleTarifaBlur(sala.id, `p_${tipo.p}_finde`, Number(e.target.value))}
                                                                    className="w-full bg-[#09090b] border border-yellow-500/20 rounded p-2 text-center text-[#D4E655] outline-none focus:border-[#D4E655]"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}