'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    Plus, Calendar, Clock, DollarSign, User, MapPin,
    Trash2, CheckCircle, Loader2, X, MessageCircle,
    Repeat, Settings, ChevronDown, ChevronUp, Layers, Sun, Moon, Zap, Copy, Tag
} from 'lucide-react'
import { format, isSunday, isSaturday } from 'date-fns'
import { es } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import MultiDatePicker from '@/components/MultiDatePicker'

// Tipos
type ReservaGroup = {
    group_id: string
    cliente_nombre: string
    cliente_contacto: string
    sala_nombre: string
    sala_id: string
    tipo_uso: string
    estado: string
    total_grupo: number
    items: any[]
}

export default function AlquileresPage() {
    const supabase = createClient()

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

    const [form, setForm] = useState({
        cliente_nombre: '',
        cliente_contacto: '',
        sala_id: '',
        fechas: [] as Date[],
        hora_inicio: '18:00', // Default a horario popular
        hora_fin: '22:00',
        tipo_uso: 'ensayo',
        descuento: 0 // <--- NUEVO CAMPO DE DESCUENTO
    })

    // Estado para el desglose de precios (Resumen)
    const [priceBreakdown, setPriceBreakdown] = useState({
        manana: { horas: 0, precio: 0, subtotal: 0 },
        noche: { horas: 0, precio: 0, subtotal: 0 },
        finde: { horas: 0, precio: 0, subtotal: 0 },
        subtotalBase: 0,
        montoDescuento: 0,
        total: 0
    })

    useEffect(() => { fetchData() }, [])

    // --- CALCULADORA AVANZADA (Desglose) ---
    useEffect(() => {
        if (!form.sala_id || !form.hora_inicio || !form.hora_fin || form.fechas.length === 0) {
            setPriceBreakdown({ manana: { horas: 0, precio: 0, subtotal: 0 }, noche: { horas: 0, precio: 0, subtotal: 0 }, finde: { horas: 0, precio: 0, subtotal: 0 }, subtotalBase: 0, montoDescuento: 0, total: 0 })
            return
        }

        const sala = salas.find(s => s.id === form.sala_id)
        if (!sala) return

        // Precios según tipo
        const tipoPrefix = form.tipo_uso === 'produccion' ? 'p_prod' : `p_${form.tipo_uso}`
        const pManana = Number(sala[`${tipoPrefix}_manana`] || 0)
        const pNoche = Number(sala[`${tipoPrefix}_noche`] || 0)
        const pFinde = Number(sala[`${tipoPrefix}_finde`] || 0)

        // Calcular duración base en horas decimales
        const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h + m / 60 }
        const start = parseTime(form.hora_inicio)
        const end = parseTime(form.hora_fin)
        let duration = end - start
        if (duration < 0) duration = 0

        // Contadores globales
        let totalHManana = 0
        let totalHNoche = 0
        let totalHFinde = 0

        const CORTE_HORARIO = 18.0 // 18:00hs cambia la tarifa

        // Iterar por cada fecha seleccionada para clasificarla
        form.fechas.forEach(fecha => {
            if (isSunday(fecha)) { // Asumimos Domingo como Finde/Feriado
                totalHFinde += duration
            } else {
                // Lógica de Franja Horaria (Lunes a Sábado)
                let hManana = 0
                let hNoche = 0

                // 1. Todo Mañana (termina antes de las 18)
                if (end <= CORTE_HORARIO) {
                    hManana = duration
                }
                // 2. Todo Noche (empieza a las 18 o después)
                else if (start >= CORTE_HORARIO) {
                    hNoche = duration
                }
                // 3. Mixto (cruza las 18)
                else {
                    hManana = CORTE_HORARIO - start
                    hNoche = end - CORTE_HORARIO
                }

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
            // Lógica de Agrupación
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
                        total_grupo: 0,
                        items: []
                    }
                }
                agrupados[gId].items.push(item)
                agrupados[gId].total_grupo += Number(item.monto_total)
            })

            const listaGrupos = Object.values(agrupados).map(g => {
                const todosPagados = g.items.every(i => i.estado === 'pagado')
                g.estado = todosPagados ? 'pagado' : 'pendiente'
                g.items.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                return g
            })
            listaGrupos.sort((a, b) => new Date(b.items[0].fecha).getTime() - new Date(a.items[0].fecha).getTime())
            setGrupos(listaGrupos)
        }
        setLoading(false)
    }

    // --- MANEJO DE TARIFAS ---
    const handleTarifaChange = (salaId: string, field: string, value: string) => {
        const numValue = value === '' ? 0 : Number(value)
        setSalas(prev => prev.map(s => s.id === salaId ? { ...s, [field]: numValue } : s))
    }

    const handleTarifaBlur = async (salaId: string, field: string, value: number) => {
        const { error } = await supabase.from('salas').update({ [field]: value }).eq('id', salaId)
        if (error) toast.error('Error al guardar precio')
        else toast.success('Precio actualizado')
    }

    // --- NUEVA FUNCIÓN: VALIDADOR DE CONFLICTOS ---
    const checkConflictos = async (salaId: string, dateObj: Date, hInicio: string, hFin: string) => {
        const fechaStr = format(dateObj, 'yyyy-MM-dd')

        // 1. Armamos las fechas completas para comparar con las CLASES (que usan timestamp)
        const [hs, ms] = hInicio.split(':')
        const [he, me] = hFin.split(':')

        const reqStart = new Date(dateObj)
        reqStart.setHours(Number(hs), Number(ms), 0, 0)

        const reqEnd = new Date(dateObj)
        reqEnd.setHours(Number(he), Number(me), 0, 0)

        // Buscar cruce con Clases
        const { data: clases } = await supabase.from('clases')
            .select('nombre')
            .eq('sala_id', salaId)
            .neq('estado', 'cancelada')
            .lt('inicio', reqEnd.toISOString())
            .gt('fin', reqStart.toISOString())
            .maybeSingle()

        if (clases) return `Clase: ${clases.nombre}`

        // 2. Buscar cruce con otros Alquileres (que usan fecha, hora_inicio, hora_fin)
        const { data: alqs } = await supabase.from('alquileres')
            .select('cliente_nombre')
            .eq('sala_id', salaId)
            .eq('fecha', fechaStr)
            .in('estado', ['confirmado', 'pagado', 'pendiente'])
            .lt('hora_inicio', hFin)
            .gt('hora_fin', hInicio)
            .maybeSingle()

        if (alqs) return `Alquiler: ${alqs.cliente_nombre}`

        return null
    }

    // --- HANDLE CREATE ACTUALIZADO ---
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (form.fechas.length === 0) return toast.error('Seleccioná fechas')
        setCreating(true)

        const newGroupId = uuidv4()
        const sala = salas.find(s => s.id === form.sala_id)

        try {
            // NUEVO: Validar conflictos ANTES de armar los inserts
            for (const date of form.fechas) {
                const conflicto = await checkConflictos(form.sala_id, date, form.hora_inicio, form.hora_fin)
                if (conflicto) {
                    throw new Error(`Conflicto el ${format(date, 'dd/MM')}: ya existe un/a ${conflicto}`)
                }
            }

            // Función auxiliar para calcular costo de un día específico
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

                // Aplicamos el porcentaje de descuento a este día específico
                const multiplier = 1 - ((form.descuento || 0) / 100)
                return baseCost * multiplier
            }

            // Creamos los inserts calculando el precio INDIVIDUAL de cada fecha
            const inserts = form.fechas.map(date => ({
                group_id: newGroupId,
                cliente_nombre: form.cliente_nombre,
                cliente_contacto: form.cliente_contacto,
                sala_id: form.sala_id,
                fecha: format(date, 'yyyy-MM-dd'), // Guardamos la fecha limpia en formato DB
                hora_inicio: form.hora_inicio,
                hora_fin: form.hora_fin,
                monto_total: calculateDayCost(date),
                tipo_uso: form.tipo_uso,
                estado: 'pendiente'
            }))

            const { error } = await supabase.from('alquileres').insert(inserts)

            if (error) {
                console.error("Error en DB:", error)
                throw new Error('Error al guardar en la base de datos.')
            }

            toast.success('Reserva creada con éxito')
            setIsModalOpen(false)
            setForm({ ...form, cliente_nombre: '', fechas: [], descuento: 0 })
            fetchData()

        } catch (err: any) {
            // Si hay un error (como un conflicto de horario), entra acá y aborta la creación
            toast.error(err.message, { duration: 5000 })
        } finally {
            setCreating(false)
        }
    }
    // --- COPIAR PRESUPUESTO ---
    const handleCopyPresupuesto = () => {
        if (form.fechas.length === 0 || !form.sala_id) {
            toast.error("Faltan datos para armar el presupuesto")
            return
        }

        const sala = salas.find(s => s.id === form.sala_id)
        const nombreSala = sala ? sala.nombre : "Sala seleccionada"
        const actividad = form.tipo_uso.charAt(0).toUpperCase() + form.tipo_uso.slice(1)

        let fechasTexto = form.fechas.map(d => `- ${format(d, 'EEEE dd/MM', { locale: es })}`).join('\n')

        let textoWsp = `*Presupuesto de Alquiler* 🏢\n\n` +
            `*Actividad:* ${actividad}\n` +
            `*Sala:* ${nombreSala}\n` +
            `*Horario:* ${form.hora_inicio} a ${form.hora_fin} hs\n\n` +
            `*Fechas solicitadas:*\n${fechasTexto}\n\n`

        if (form.descuento > 0) {
            textoWsp += `*Subtotal:* $${priceBreakdown.subtotalBase.toLocaleString()}\n`
            textoWsp += `*Descuento especial (${form.descuento}%):* -$${priceBreakdown.montoDescuento.toLocaleString()}\n`
        }

        textoWsp += `*Total a pagar: $${priceBreakdown.total.toLocaleString()}*\n\n` +
            `_Para confirmar la reserva, por favor envianos el comprobante de seña. ¡Gracias!_`

        navigator.clipboard.writeText(textoWsp).then(() => {
            toast.success('¡Presupuesto copiado!')
        }).catch(() => {
            toast.error('Error al copiar al portapapeles')
        })
    }

    // --- RESTO DE ACCIONES ---
    const handlePayGroup = async (group: ReservaGroup) => {
        if (!confirm(`¿Cobrar total de $${group.total_grupo.toLocaleString()}?`)) return

        // 1. Averiguar la SEDE de esta SALA
        const { data: salaData } = await supabase
            .from('salas')
            .select('sede_id, nombre')
            .eq('id', group.sala_id)
            .single()

        if (!salaData) return toast.error('Error: No se encontró la sede de esta sala')

        // 2. Buscar CAJA ABIERTA para ESA SEDE
        const { data: turno } = await supabase.from('caja_turnos')
            .select('id')
            .eq('sede_id', salaData.sede_id)
            .eq('estado', 'abierta')
            .maybeSingle()

        if (!turno) {
            return toast.error(`No hay caja abierta en la sede ${salaData.nombre}. Abrí la caja en esa sede para cobrar.`)
        }

        // 3. Proceder al cobro
        const { error } = await supabase.from('alquileres').update({ estado: 'pagado' }).in('id', group.items.map(i => i.id))

        if (error) return toast.error('Error al actualizar estados')

        // 4. Registrar movimiento
        await supabase.from('caja_movimientos').insert({
            turno_id: turno.id,
            tipo: 'ingreso',
            concepto: `Alquiler ${group.sala_nombre}: ${group.cliente_nombre} (${group.items.length} fechas)`,
            monto: group.total_grupo,
            metodo_pago: 'efectivo',
            origen_referencia: 'alquileres'
        })

        toast.success('Cobrado y registrado en la caja correcta')
        fetchData()
    }

    const handleDeleteGroup = async (group: ReservaGroup) => {
        if (!confirm('¿Eliminar grupo completo?')) return
        await supabase.from('alquileres').delete().in('id', group.items.map(i => i.id))
        setGrupos(prev => prev.filter(g => g.group_id !== group.group_id))
        toast.success('Grupo eliminado')
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
                    const isPaid = group.estado === 'pagado'
                    const isOpen = expandedGroup === group.group_id
                    return (
                        <div key={group.group_id} className="bg-[#09090b] border border-white/10 rounded-2xl overflow-hidden flex flex-col hover:border-[#D4E655]/30 transition-all">
                            <div className="p-4 border-b border-white/5 bg-[#111]/50 relative">
                                <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest ${isPaid ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>{isPaid ? 'Pagado' : 'Pendiente'}</div>
                                <div className="flex items-center gap-2 mb-1 text-[#D4E655] text-[10px] font-black uppercase tracking-wider"><MapPin size={12} /> {group.sala_nombre} • {group.tipo_uso}</div>
                                <h3 className="text-lg font-bold text-white truncate pr-16">{group.cliente_nombre}</h3>
                                {group.cliente_contacto && <div className="flex items-center gap-2 mt-1"><a href={`https://wa.me/${group.cliente_contacto.replace(/[^0-9]/g, '')}`} target="_blank" className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-green-400 transition-colors"><MessageCircle size={12} /> {group.cliente_contacto}</a></div>}
                            </div>
                            <div className="p-4 flex-1">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-2 text-xs font-bold text-gray-300"><Layers size={14} /> {group.items.length} Reservas</div>
                                    <div className="text-right"><span className="block text-[10px] text-gray-500 uppercase font-bold">Total</span><span className={`text-sm font-black ${isPaid ? 'text-green-500' : 'text-white'}`}>${group.total_grupo.toLocaleString()}</span></div>
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
                                {!isPaid ? <button onClick={() => handlePayGroup(group)} className="flex-1 bg-[#D4E655] text-black text-[10px] font-black uppercase rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-2"><DollarSign size={14} /> Cobrar Todo</button> : <div className="flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase text-green-500 opacity-50 cursor-default border border-green-500/20 rounded-lg"><CheckCircle size={14} /> Cobrado</div>}
                                <button onClick={() => handleDeleteGroup(group)} className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    )
                })}
                {grupos.length === 0 && <div className="col-span-full text-center py-20 opacity-50"><p className="text-gray-500 font-bold uppercase text-xs">No hay reservas activas.</p></div>}
            </div>

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

                                {/* Tags de Fechas */}
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

                                {/* --- RESUMEN DE COSTOS DETALLADO --- */}
                                <div className="bg-[#111] p-4 rounded-xl border border-white/10 mt-2 space-y-2 relative">
                                    {/* Botón de copiar presupueseto */}
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

                                    {/* Renglones de Desglose */}
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

                                    {/* Total Final y Descuentos */}
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