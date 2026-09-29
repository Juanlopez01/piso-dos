'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import {
    Plus, Calendar, Clock, DollarSign, User, MapPin,
    Trash2, CheckCircle, Loader2, X, MessageCircle,
    Repeat, Settings, ChevronDown, ChevronUp, Layers, Sun, Moon, Zap, Copy, Tag,
    Banknote, Landmark, ShieldAlert, Pencil
} from 'lucide-react'
import { format, isSunday, isSaturday } from 'date-fns'
import { es } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import MultiDatePicker from '@/components/MultiDatePicker'
import { useCash } from '@/context/CashContext'

// 🚀 IMPORTAMOS LAS ACTIONS BLINDADAS
import { crearAlquileresAction, cobrarAlquilerAction, eliminarReservaAction, actualizarTarifaAction, editarAlquilerFechaHoraAction, actualizarClienteGrupoAction } from '@/app/actions/alquileres'

// --- TIPOS ---
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
    notas_recepcion: string // 🚀 AGREGAMOS EL TIPO ACÁ
    items: any[]
}

type AlquileresData = {
    grupos: ReservaGroup[]
    salas: any[]
}

// 🚀 FETCHER PARA SWR
const fetcher = async (): Promise<AlquileresData> => {
    const supabase = createClient()

    // Validamos sesión silenciosamente
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error("No autorizado")

    const { data: s } = await supabase.from('salas').select('*, sede:sedes(nombre)').order('nombre')
    const salas = s || []

    // Traemos historial reciente (últimos 90 días) + TODO lo futuro, así no se
    // pierden reservas próximas por el límite (antes traía solo las 100 más nuevas).
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const { data: rawData } = await supabase
        .from('alquileres')
        .select(`*, sala:salas(nombre)`)
        .gte('fecha', cutoffStr)
        .order('fecha', { ascending: true })
        .limit(500)

    let grupos: ReservaGroup[] = []

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
                    notas_recepcion: item.notas_recepcion || '', // 🚀 LAS CARGAMOS ACÁ
                    items: []
                }
            }
            agrupados[gId].items.push(item)
            agrupados[gId].total_grupo += Number(item.monto_total)
            agrupados[gId].total_pagado += Number(item.monto_pagado || 0)
        })

        grupos = Object.values(agrupados).map(g => {
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
        grupos.sort((a, b) => new Date(b.items[0].fecha).getTime() - new Date(a.items[0].fecha).getTime())
    }

    return { grupos, salas }
}

export default function AlquileresPage() {
    const [supabase] = useState(() => createClient())
    const { isBoxOpen, currentTurnoId } = useCash()

    const { data, error, isLoading, mutate } = useSWR<AlquileresData>(
        'alquileres',
        fetcher,
        { revalidateOnFocus: true, dedupingInterval: 3000 }
    )

    const grupos = data?.grupos || []
    const salas = data?.salas || []

    if (error) {
        toast.error('Error de red. SWR está intentando reconectar...')
    }

    // UI States
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isTarifasOpen, setIsTarifasOpen] = useState(false)
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
    const [expandedSala, setExpandedSala] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)

    // Filtros del listado
    const [busqueda, setBusqueda] = useState('')
    const [filtroSede, setFiltroSede] = useState('')
    const [verPasados, setVerPasados] = useState(false)
    const [filtroMes, setFiltroMes] = useState(() => format(new Date(), 'yyyy-MM')) // arranca en el mes actual; '' = todos

    // Modal Cobro
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [selectedGroup, setSelectedGroup] = useState<ReservaGroup | null>(null)
    // Cobro por día vs. reserva completa. Guardamos el grupo real y el día elegido
    // para poder alternar el alcance dentro del modal.
    const [payFullGroup, setPayFullGroup] = useState<ReservaGroup | null>(null)
    const [payItem, setPayItem] = useState<any | null>(null)
    const [paymentScope, setPaymentScope] = useState<'dia' | 'reserva'>('reserva')
    const [paymentType, setPaymentType] = useState<'seña' | 'total' | 'resto'>('total')
    const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia'>('efectivo')
    const [customSena, setCustomSena] = useState<string>('') // 🚀 PARA EL MONTO MANUAL
    const [processingPayment, setProcessingPayment] = useState(false)

    // Modal edición fecha/hora
    const [modalEditar, setModalEditar] = useState<{ isOpen: boolean; item: any }>({ isOpen: false, item: null })
    const [editForm, setEditForm] = useState({ fecha: '', hora_inicio: '', hora_fin: '', monto_total: 0, cliente_nombre: '', cliente_contacto: '' })
    const [procesandoEdicion, setProcesandoEdicion] = useState(false)

    const [form, setForm] = useState({
        cliente_nombre: '',
        cliente_contacto: '',
        sala_id: '',
        fechas: [] as Date[],
        hora_inicio: '18:00',
        hora_fin: '22:00',
        tipo_uso: 'ensayo',
        descuento: 0,
        notas_recepcion: '', // 🚀 NUEVO CAMPO
        // Valor por hora para ESTA reserva (arranca del tarifario de la sala, editable).
        precio_manana: 0,
        precio_noche: 0,
        precio_finde: 0,
    })

    // Horario POR DÍA: cada fecha seleccionada puede tener su propio inicio/fin.
    // Se guarda por clave 'yyyy-MM-dd'. Si un día no tiene override, usa el horario
    // por defecto del form (form.hora_inicio/fin).
    const [horasPorFecha, setHorasPorFecha] = useState<Record<string, { inicio: string; fin: string }>>({})
    const keyOf = (d: Date) => format(d, 'yyyy-MM-dd')
    const horasDe = (d: Date) => horasPorFecha[keyOf(d)] || { inicio: form.hora_inicio, fin: form.hora_fin }

    // Al cambiar las fechas, sincronizamos el mapa de horarios: mantenemos los que
    // ya estaban, agregamos los nuevos con el horario por defecto y sacamos los que
    // se deseleccionaron.
    const sincronizarHoras = (dates: Date[], base?: { inicio: string; fin: string }) => {
        setHorasPorFecha(prev => {
            const next: Record<string, { inicio: string; fin: string }> = {}
            for (const d of dates) {
                const k = keyOf(d)
                next[k] = prev[k] || base || { inicio: form.hora_inicio, fin: form.hora_fin }
            }
            return next
        })
    }
    const setHoraDia = (k: string, campo: 'inicio' | 'fin', valor: string) => {
        setHorasPorFecha(prev => ({ ...prev, [k]: { ...(prev[k] || { inicio: form.hora_inicio, fin: form.hora_fin }), [campo]: valor } }))
    }
    const aplicarHorarioATodos = () => {
        setHorasPorFecha(() => {
            const next: Record<string, { inicio: string; fin: string }> = {}
            for (const d of form.fechas) next[keyOf(d)] = { inicio: form.hora_inicio, fin: form.hora_fin }
            return next
        })
        toast.success('Horario aplicado a todos los días')
    }

    // Al elegir sala o actividad, precargamos el valor/hora desde el tarifario.
    // El admin lo puede editar para esta reserva puntual.
    useEffect(() => {
        const sala = salas.find(s => s.id === form.sala_id)
        if (!sala) return
        const pref = form.tipo_uso === 'produccion' ? 'p_prod' : `p_${form.tipo_uso}`
        setForm(f => ({
            ...f,
            precio_manana: Number(sala[`${pref}_manana`] || 0),
            precio_noche: Number(sala[`${pref}_noche`] || 0),
            precio_finde: Number(sala[`${pref}_finde`] || 0),
        }))
    }, [form.sala_id, form.tipo_uso, salas])

    const [priceBreakdown, setPriceBreakdown] = useState({
        manana: { horas: 0, precio: 0, subtotal: 0 },
        noche: { horas: 0, precio: 0, subtotal: 0 },
        finde: { horas: 0, precio: 0, subtotal: 0 },
        subtotalBase: 0,
        montoDescuento: 0,
        total: 0
    })

    useEffect(() => {
        if (!form.sala_id || !form.hora_inicio || !form.hora_fin || form.fechas.length === 0) {
            setPriceBreakdown({ manana: { horas: 0, precio: 0, subtotal: 0 }, noche: { horas: 0, precio: 0, subtotal: 0 }, finde: { horas: 0, precio: 0, subtotal: 0 }, subtotalBase: 0, montoDescuento: 0, total: 0 })
            return
        }

        const sala = salas.find(s => s.id === form.sala_id)
        if (!sala) return

        // Usamos el valor/hora del form (precargado del tarifario, editable para esta reserva).
        const pManana = Number(form.precio_manana || 0)
        const pNoche = Number(form.precio_noche || 0)
        const pFinde = Number(form.precio_finde || 0)

        const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h + m / 60 }

        let totalHManana = 0
        let totalHNoche = 0
        let totalHFinde = 0
        const CORTE_HORARIO = 18.0

        form.fechas.forEach(fecha => {
            const { inicio, fin } = horasDe(fecha)
            const start = parseTime(inicio)
            const end = parseTime(fin)
            const duration = Math.max(0, end - start)
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

    }, [form.sala_id, form.hora_inicio, form.hora_fin, form.tipo_uso, form.fechas, form.descuento, form.precio_manana, form.precio_noche, form.precio_finde, horasPorFecha, salas])

    const handleTarifaChange = (salaId: string, field: string, value: string) => {
        const numValue = value === '' ? 0 : Number(value)
        const optimisticSalas = salas.map(s => s.id === salaId ? { ...s, [field]: numValue } : s)
        mutate({ grupos, salas: optimisticSalas }, false)
    }

    const handleTarifaBlur = async (salaId: string, field: string, value: number) => {
        const res = await actualizarTarifaAction(salaId, field, value)
        if (!res.success) {
            toast.error(res.error || 'Error al guardar precio')
            mutate()
        } else {
            toast.success('Precio actualizado')
        }
    }

    const checkConflictos = async (salaId: string, dateObj: Date, hInicio: string, hFin: string) => {
        const fechaStr = format(dateObj, 'yyyy-MM-dd')

        // 🚀 BLINDAJE DEFINITIVO: Le clavamos el -03:00 para que Supabase no asuma que es UTC
        const reqStartStr = `${fechaStr}T${hInicio}:00-03:00`
        const reqEndStr = `${fechaStr}T${hFin}:00-03:00`

        // Chequeo contra Clases
        const { data: clases } = await supabase.from('clases')
            .select('nombre')
            .eq('sala_id', salaId)
            .neq('estado', 'cancelada')
            .lt('inicio', reqEndStr)
            .gt('fin', reqStartStr)
            .maybeSingle()

        if (clases) return `Clase: ${clases.nombre}`

        // Chequeo contra otros Alquileres (Este no cambia porque la fecha y hora están separadas en texto)
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

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (form.fechas.length === 0) return toast.error('Seleccioná fechas')
        if (priceBreakdown.total <= 0) return toast.error('Esta sala no tiene tarifa cargada para ese tipo de uso. Cargala en Tarifas o cambiá el tipo.')
        setCreating(true)

        const newGroupId = uuidv4()
        const sala = salas.find(s => s.id === form.sala_id)

        try {
            const conflictosPromises = form.fechas.map(async (date) => {
                const { inicio, fin } = horasDe(date)
                const conflicto = await checkConflictos(form.sala_id, date, inicio, fin)
                if (conflicto) return `Conflicto el ${format(date, 'dd/MM')}: ya existe un/a ${conflicto}`
                return null
            })

            const resultadosConflictos = await Promise.all(conflictosPromises)
            const conflictoEncontrado = resultadosConflictos.find(c => c !== null)

            if (conflictoEncontrado) {
                throw new Error(conflictoEncontrado)
            }

            const calculateDayCost = (date: Date) => {
                if (!sala) return 0
                const { inicio, fin } = horasDe(date)
                const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h + m / 60 }
                const start = parseTime(inicio)
                const end = parseTime(fin)
                const duration = Math.max(0, end - start)

                let baseCost = 0
                if (isSunday(date)) {
                    baseCost = duration * Number(form.precio_finde || 0)
                } else {
                    const CORTE = 18.0
                    let hManana = 0, hNoche = 0
                    if (end <= CORTE) hManana = duration
                    else if (start >= CORTE) hNoche = duration
                    else { hManana = CORTE - start; hNoche = end - CORTE }
                    baseCost = (hManana * Number(form.precio_manana || 0)) + (hNoche * Number(form.precio_noche || 0))
                }
                const multiplier = 1 - ((form.descuento || 0) / 100)
                return baseCost * multiplier
            }

            const inserts = form.fechas.map(date => ({
                group_id: newGroupId,
                cliente_nombre: form.cliente_nombre,
                cliente_contacto: form.cliente_contacto,
                sala_id: form.sala_id,
                fecha: date, // 🚀 SE ENVÍA EL DATE, LA ACTION LO LIMPIA (O format(date, 'yyyy-MM-dd') si prefieres mandarlo limpio desde acá)
                hora_inicio: horasDe(date).inicio,
                hora_fin: horasDe(date).fin,
                monto_total: calculateDayCost(date),
                monto_pagado: 0,
                estado_pago: 'pendiente',
                tipo_uso: form.tipo_uso,
                estado: 'pendiente',
                notas_recepcion: form.notas_recepcion // 🚀 GUARDAMOS LA NOTA
            }))

            const res = await crearAlquileresAction(inserts)
            if (!res.success) throw new Error(res.error || 'Error al guardar en la base de datos.')

            toast.success('Reserva creada con éxito')
            setIsModalOpen(false)
            setForm({ ...form, cliente_nombre: '', fechas: [], descuento: 0 })
            mutate()
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

        let fechasTexto = [...form.fechas].sort((a, b) => a.getTime() - b.getTime()).map(d => {
            const h = horasDe(d)
            return `- ${format(d, 'EEEE dd/MM', { locale: es })}: ${h.inicio} a ${h.fin} hs`
        }).join('\n')

        let textoWsp = `*Presupuesto de Alquiler* 🏢\n\n*Actividad:* ${actividad}\n*Sala:* ${nombreSala}\n\n*Fechas y horarios:*\n${fechasTexto}\n\n`
        if (form.descuento > 0) {
            textoWsp += `*Subtotal Base:* $${priceBreakdown.subtotalBase.toLocaleString()}\n*Descuento especial (${form.descuento}%):* -$${priceBreakdown.montoDescuento.toLocaleString()}\n`
        }

        textoWsp += `*Total a pagar (Efectivo): $${priceBreakdown.total.toLocaleString()}*\n`
        textoWsp += `*Total a pagar (Transferencia/MP +10%): $${Math.round(priceBreakdown.total * 1.10).toLocaleString()}*\n\n`
        textoWsp += `_Para confirmar la reserva, por favor envianos el comprobante de seña. ¡Gracias!_`

        navigator.clipboard.writeText(textoWsp).then(() => toast.success('¡Presupuesto copiado!')).catch(() => toast.error('Error al copiar'))
    }

    // Un día suelto convertido a "grupo" de un item, para reusar toda la lógica de
    // cobro (que trabaja sobre selectedGroup.items).
    const itemToGroup = (item: any, base: ReservaGroup): ReservaGroup => {
        const total = Number(item.monto_total) || 0
        const pagado = Number(item.monto_pagado || 0)
        const estadoPago = pagado <= 0 ? 'pendiente' : (pagado >= total ? 'pagado' : 'seña_pagada')
        return { ...base, group_id: item.id, total_grupo: total, total_pagado: pagado, estado_pago: estadoPago, estado: estadoPago, items: [item] }
    }

    const abrirCobro = (sg: ReservaGroup) => {
        setSelectedGroup(sg)
        setPaymentType(sg.estado_pago === 'pendiente' ? 'seña' : 'resto')
        setPaymentMethod('efectivo')
        setCustomSena('')
    }

    // Cobro de UN día. Desde el modal se puede pasar a "toda la reserva".
    const openCobroDia = (item: any, group: ReservaGroup) => {
        if (!isBoxOpen || !currentTurnoId) {
            return toast.error('¡Caja Cerrada! Tenés que abrir la caja en tu sede antes de poder cobrar.')
        }
        setPayFullGroup(group)
        setPayItem(item)
        setPaymentScope('dia')
        abrirCobro(itemToGroup(item, group))
        setIsPaymentModalOpen(true)
    }

    const cambiarScope = (scope: 'dia' | 'reserva') => {
        setPaymentScope(scope)
        if (scope === 'reserva' && payFullGroup) abrirCobro(payFullGroup)
        else if (scope === 'dia' && payItem && payFullGroup) abrirCobro(itemToGroup(payItem, payFullGroup))
    }

    // =======================================================
    // 🚀 LÓGICA DE COBRO MATEMÁTICO (RECARGOS + PAGOS LIBRES)
    // =======================================================
    const handleConfirmPayment = async () => {
        if (!selectedGroup) return
        setProcessingPayment(true)

        try {
            let montoACobrarEnCaja = 0
            let labelCobro = ''

            const factorRecargo = paymentMethod === 'transferencia' ? 1.10 : 1;
            const deudaTotalGrupo = selectedGroup.total_grupo - selectedGroup.total_pagado;

            // Determinamos cuánto "Monto Base" se está pagando
            let montoBaseAPagar = 0;

            if (paymentType === 'seña') {
                montoBaseAPagar = Number(customSena);
                if (isNaN(montoBaseAPagar) || montoBaseAPagar <= 0) throw new Error("Ingresá un monto válido para el pago.");
                if (montoBaseAPagar > deudaTotalGrupo) montoBaseAPagar = deudaTotalGrupo;
                labelCobro = paymentMethod === 'transferencia' ? 'Pago Parcial (+10%)' : 'Pago Parcial';
            } else {
                // Para 'total' o 'resto', el monto base es la deuda completa
                montoBaseAPagar = deudaTotalGrupo;
                labelCobro = paymentType === 'total' ? 'Total 100%' : 'Saldo Restante';
                if (paymentMethod === 'transferencia') labelCobro += ' (+10%)';
            }

            // Calculamos cuánto entra a la caja (Monto Base * Recargo)
            montoACobrarEnCaja = montoBaseAPagar * factorRecargo;

            const updates = selectedGroup.items.map(item => {
                let montoPagadoActual = Number(item.monto_pagado || 0)
                let montoTotalActual = Number(item.monto_total)
                let deudaItem = montoTotalActual - montoPagadoActual

                let baseParaEsteItem = 0

                // Distribuimos el monto base entre los items del grupo
                if (deudaItem > 0 && montoBaseAPagar > 0) {
                    if (montoBaseAPagar >= deudaItem) {
                        baseParaEsteItem = deudaItem;
                        montoBaseAPagar -= deudaItem;
                    } else {
                        baseParaEsteItem = montoBaseAPagar;
                        montoBaseAPagar = 0;
                    }
                }

                if (baseParaEsteItem > 0) {
                    const cobroConRecargo = baseParaEsteItem * factorRecargo;
                    const diferenciaRecargo = cobroConRecargo - baseParaEsteItem;

                    const nuevoMontoPagado = montoPagadoActual + cobroConRecargo;
                    const nuevoMontoTotal = montoTotalActual + diferenciaRecargo;

                    const nuevoEstadoPago = (nuevoMontoPagado >= nuevoMontoTotal) ? 'pagado' : 'seña_pagada';
                    let nuevoEstado = item.estado;
                    if (nuevoEstadoPago === 'seña_pagada') nuevoEstado = 'confirmado';
                    if (nuevoEstadoPago === 'pagado') nuevoEstado = 'pagado';

                    return {
                        id: item.id,
                        monto_total: nuevoMontoTotal,
                        monto_pagado: nuevoMontoPagado,
                        estado_pago: nuevoEstadoPago,
                        estado: nuevoEstado,
                        metodo_pago: paymentMethod
                    }
                } else {
                    return {
                        id: item.id,
                        monto_total: montoTotalActual,
                        monto_pagado: montoPagadoActual,
                        estado_pago: item.estado_pago,
                        estado: item.estado,
                        metodo_pago: item.metodo_pago
                    }
                }
            })

            const detalleDia = paymentScope === 'dia' && payItem ? ` (${format(new Date(payItem.fecha + 'T12:00:00'), 'dd/MM')})` : ''
            const movimientoCaja = {
                turno_id: currentTurnoId,
                tipo: 'ingreso',
                concepto: `Alquiler ${selectedGroup.sala_nombre}: ${selectedGroup.cliente_nombre}${detalleDia} - ${labelCobro}`,
                monto: montoACobrarEnCaja,
                metodo_pago: paymentMethod,
                origen_referencia: 'alquileres'
            }

            const res = await cobrarAlquilerAction(updates, movimientoCaja)
            if (!res.success) throw new Error(res.error || 'Error al procesar el pago')

            toast.success(`¡Cobro registrado! Entraron $${Math.round(montoACobrarEnCaja).toLocaleString()} a caja.`)
            setIsPaymentModalOpen(false)
            setCustomSena('')
            mutate()
        } catch (error: any) {
            toast.error(error.message || 'Hubo un error al procesar el pago.')
        } finally {
            setProcessingPayment(false)
        }
    }

    const abrirModalEditar = (item: any) => {
        setEditForm({
            fecha: item.fecha, hora_inicio: item.hora_inicio, hora_fin: item.hora_fin,
            monto_total: Number(item.monto_total) || 0,
            cliente_nombre: item.cliente_nombre || '', cliente_contacto: item.cliente_contacto || '',
        })
        setModalEditar({ isOpen: true, item })
    }

    const handleEditarFechaHora = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!modalEditar.item) return
        const it = modalEditar.item
        const pagado = Number(it.monto_pagado || 0)
        if (editForm.monto_total < pagado) {
            return toast.error(`El precio no puede ser menor a lo ya abonado ($${pagado.toLocaleString()}).`)
        }
        if (!editForm.cliente_nombre.trim()) return toast.error('El nombre no puede quedar vacío.')
        setProcesandoEdicion(true)
        const res = await editarAlquilerFechaHoraAction(
            it.id, editForm.fecha, editForm.hora_inicio, editForm.hora_fin, editForm.monto_total
        )
        if (!res.success) { toast.error(res.error || 'Error al editar'); setProcesandoEdicion(false); return }

        // Si cambió el nombre/contacto, lo aplicamos a TODA la reserva.
        const nombreCambio = editForm.cliente_nombre.trim() !== (it.cliente_nombre || '')
        const contactoCambio = editForm.cliente_contacto.trim() !== (it.cliente_contacto || '')
        if (nombreCambio || contactoCambio) {
            const gid = it.group_id || it.id
            const r2 = await actualizarClienteGrupoAction(gid, editForm.cliente_nombre, editForm.cliente_contacto)
            if (!r2.success) { toast.error(r2.error || 'Error al cambiar el nombre'); setProcesandoEdicion(false); mutate(); return }
        }

        toast.success('Reserva actualizada')
        setModalEditar({ isOpen: false, item: null })
        mutate()
        setProcesandoEdicion(false)
    }

    const handleDeleteGroup = async (group: ReservaGroup) => {
        if (!confirm('¿Eliminar reserva completa?')) return

        const filteredGroups = grupos.filter(g => g.group_id !== group.group_id)
        mutate({ salas, grupos: filteredGroups }, false)

        const res = await eliminarReservaAction(group.items.map(i => i.id))

        if (res.success) {
            toast.success('Reserva eliminada')
        } else {
            toast.error(res.error || "Error al eliminar")
            mutate()
        }
    }

    const handleDeleteItem = async (item: any, group: ReservaGroup) => {
        const esUltimo = group.items.length === 1
        if (!confirm(esUltimo
            ? '¿Eliminar esta reserva? Es el único día del grupo.'
            : `¿Eliminar solo el ${format(new Date(item.fecha + 'T12:00:00'), "EEEE d/MM", { locale: es })} de ${group.cliente_nombre}?`)) return
        const res = await eliminarReservaAction([item.id])
        if (res.success) { toast.success('Día eliminado'); mutate() }
        else toast.error(res.error || 'Error al eliminar')
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
            fechas: [],
            notas_recepcion: group.notas_recepcion || '',
            precio_manana: 0, precio_noche: 0, precio_finde: 0, // se precargan del tarifario al abrir
        })
        setIsModalOpen(true)
        toast.info('Elegí nuevas fechas')
    }

    const VISIBLE_TAGS = 12
    const recargoFactor = paymentMethod === 'transferencia' ? 1.10 : 1;

    // Sedes disponibles (para el filtro) a partir de las salas.
    const sedeDeSala = (s: any): string => (Array.isArray(s?.sede) ? s.sede[0]?.nombre : s?.sede?.nombre) || ''
    const sedesDisponibles = Array.from(new Set(salas.map(sedeDeSala).filter(Boolean)))
    const hoyStr = format(new Date(), 'yyyy-MM-dd')

    // Opciones de meses para el filtro: los meses con reservas + el mes actual.
    const mesesSet = new Set<string>([format(new Date(), 'yyyy-MM')])
    for (const g of grupos) for (const it of g.items) if (it.fecha) mesesSet.add(it.fecha.slice(0, 7))
    const mesesOpciones = Array.from(mesesSet).sort().reverse() // recientes primero
    const labelMes = (ym: string) => format(new Date(ym + '-01T12:00:00'), 'LLLL yyyy', { locale: es })

    // Aplicamos filtros: búsqueda por cliente, sede, y próximos/pasados.
    const gruposFiltrados = grupos.filter(g => {
        if (busqueda && !g.cliente_nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false
        if (filtroSede) {
            const sala = salas.find((s: any) => s.id === g.sala_id)
            if (sedeDeSala(sala) !== filtroSede) return false
        }
        if (filtroMes) {
            // Con filtro de mes, mostramos ese mes (aunque sea pasado).
            const tieneEseMes = g.items.some((it: any) => (it.fecha || '').startsWith(filtroMes))
            if (!tieneEseMes) return false
        } else if (!verPasados) {
            // Un grupo es "próximo" si tiene alguna fecha de hoy en adelante.
            const tieneFutura = g.items.some((it: any) => it.fecha >= hoyStr)
            if (!tieneFutura) return false
        }
        return true
    })

    // Vista por DÍA: aplanamos los items de los grupos filtrados y los agrupamos
    // por fecha. Cada fila es una reserva (un día); el cobro sigue siendo por grupo.
    const itemsPorDia: Record<string, { item: any; group: ReservaGroup }[]> = {}
    for (const g of gruposFiltrados) {
        for (const it of g.items) {
            if (filtroMes) { if (!(it.fecha || '').startsWith(filtroMes)) continue }
            else if (!verPasados && it.fecha < hoyStr) continue
            ;(itemsPorDia[it.fecha] ||= []).push({ item: it, group: g })
        }
    }
    const diasOrdenados = Object.keys(itemsPorDia).sort() // ascendente: hoy → futuro
    for (const d of diasOrdenados) itemsPorDia[d].sort((a, b) => (a.item.hora_inicio || '').localeCompare(b.item.hora_inicio || ''))
    const hayItems = diasOrdenados.length > 0

    const estadoChip = (estadoPago: string) => {
        if (estadoPago === 'pagado') return { cls: 'bg-green-500/15 text-green-400', txt: 'Pagado' }
        if (estadoPago === 'seña_pagada') return { cls: 'bg-yellow-500/15 text-yellow-400', txt: 'Parcial' }
        return { cls: 'bg-red-500/15 text-red-400', txt: 'Pendiente' }
    }

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
                        Alquileres
                        {isLoading && <Loader2 size={20} className="animate-spin text-[#D4E655]" />}
                    </h1>
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

            {/* BARRA DE FILTROS */}
            <div className="flex flex-col md:flex-row gap-2 mb-5">
                <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar por cliente…"
                    className="flex-1 bg-[#111] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#D4E655] transition-colors"
                />
                {sedesDisponibles.length > 1 && (
                    <select
                        value={filtroSede}
                        onChange={e => setFiltroSede(e.target.value)}
                        className="bg-[#111] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#D4E655] transition-colors"
                    >
                        <option value="">Todas las sedes</option>
                        {sedesDisponibles.map(sede => <option key={sede} value={sede}>{sede}</option>)}
                    </select>
                )}
                <select
                    value={filtroMes}
                    onChange={e => setFiltroMes(e.target.value)}
                    className="bg-[#111] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#D4E655] transition-colors capitalize"
                    title="Filtrar por mes"
                >
                    <option value="">Todos los meses</option>
                    {mesesOpciones.map(ym => <option key={ym} value={ym} className="capitalize">{labelMes(ym)}</option>)}
                </select>
                {!filtroMes && (
                    <button
                        onClick={() => setVerPasados(v => !v)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors ${verPasados ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-300 border-white/10 hover:border-white/30'}`}
                    >
                        {verPasados ? 'Viendo todos' : 'Solo próximos'}
                    </button>
                )}
            </div>

            {/* LISTADO POR DÍA */}
            {isLoading && grupos.length === 0 ? (
                <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : !hayItems ? (
                <div className="min-h-[40vh] flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                    <Calendar size={32} className="opacity-40" />
                    <p className="text-sm font-medium">
                        {grupos.length === 0 ? 'Todavía no hay reservas cargadas.' : 'No hay reservas que coincidan con el filtro.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-6 max-w-4xl mx-auto">
                    {diasOrdenados.map(dia => {
                        const filas = itemsPorDia[dia]
                        const esHoy = dia === hoyStr
                        const totalDia = filas.reduce((s, f) => s + Number(f.item.monto_total || 0), 0)
                        return (
                            <div key={dia}>
                                {/* Cabecera del día */}
                                <div className="flex items-center gap-3 mb-2 px-1 sticky top-0 z-10 bg-[#050505] py-1">
                                    <Calendar size={15} className={esHoy ? 'text-[#D4E655]' : 'text-gray-500'} />
                                    <h3 className={`text-sm font-black uppercase tracking-wide ${esHoy ? 'text-[#D4E655]' : 'text-white'}`}>
                                        {format(new Date(dia + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })}{esHoy && ' · Hoy'}
                                    </h3>
                                    <span className="text-[10px] text-gray-500">{filas.length} reserva{filas.length !== 1 ? 's' : ''}</span>
                                    <span className="ml-auto text-[11px] font-bold text-gray-400">${totalDia.toLocaleString()}</span>
                                </div>

                                {/* Filas del día */}
                                <div className="space-y-2">
                                    {filas.map(({ item, group }) => {
                                        const isFullyPaid = group.estado_pago === 'pagado'
                                        const chip = estadoChip(group.estado_pago)
                                        return (
                                            <div key={item.id} className="bg-[#09090b] border border-white/10 rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-2 hover:border-[#D4E655]/30 transition-colors">
                                                {/* Hora */}
                                                <div className="flex items-center gap-1.5 font-mono text-sm text-white shrink-0 w-[110px]">
                                                    <Clock size={13} className="text-gray-500" />
                                                    {item.hora_inicio}–{item.hora_fin}
                                                </div>
                                                {/* Sala + actividad */}
                                                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#D4E655] shrink-0">
                                                    <MapPin size={12} /> {group.sala_nombre} <span className="text-gray-500 normal-case">· {group.tipo_uso}</span>
                                                </div>
                                                {/* Cliente */}
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-white truncate">{group.cliente_nombre}</p>
                                                    <div className="flex items-center gap-2">
                                                        {group.cliente_contacto && <a href={`https://wa.me/${group.cliente_contacto.replace(/[^0-9]/g, '')}`} target="_blank" className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-green-400 transition-colors"><MessageCircle size={11} /> {group.cliente_contacto}</a>}
                                                        {group.items.length > 1 && <span className="text-[9px] text-gray-600 uppercase flex items-center gap-0.5"><Layers size={9} /> {group.items.length} días</span>}
                                                    </div>
                                                    {group.notas_recepcion && (
                                                        <p className="text-[10px] text-yellow-200/70 italic flex items-center gap-1 mt-0.5"><ShieldAlert size={10} className="text-yellow-500 shrink-0" /> {group.notas_recepcion}</p>
                                                    )}
                                                </div>
                                                {/* Monto + estado */}
                                                <div className="text-right shrink-0">
                                                    <div className="text-sm font-black text-white">${Number(item.monto_total).toLocaleString()}</div>
                                                    <span className={`text-[8px] px-2 py-0.5 rounded-full uppercase font-black ${chip.cls}`}>{chip.txt}</span>
                                                </div>
                                                {/* Acciones */}
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button onClick={() => abrirModalEditar(item)} title="Editar día, hora y precio" className="p-2 text-gray-500 hover:text-[#D4E655] hover:bg-white/10 rounded-lg transition-colors"><Pencil size={15} /></button>
                                                    {Number(item.monto_pagado || 0) < Number(item.monto_total || 0) && (
                                                        <button onClick={() => openCobroDia(item, group)} title="Cobrar" className="p-2 text-gray-500 hover:text-[#D4E655] hover:bg-white/10 rounded-lg transition-colors"><DollarSign size={15} /></button>
                                                    )}
                                                    <button onClick={() => handleRenovar(group)} title="Renovar (nuevas fechas)" className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><Repeat size={15} /></button>
                                                    <button onClick={() => handleDeleteItem(item, group)} title="Eliminar este día" className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={15} /></button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* MODAL EDITAR FECHA/HORA */}
            {modalEditar.isOpen && modalEditar.item && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setModalEditar({ isOpen: false, item: null })}>
                    <div className="bg-[#09090b] border border-[#D4E655]/30 w-full max-w-sm rounded-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-base font-black text-white uppercase flex items-center gap-2"><Pencil size={16} className="text-[#D4E655]" /> Editar Reserva</h3>
                            <button onClick={() => setModalEditar({ isOpen: false, item: null })} className="p-2 hover:bg-white/10 rounded-full"><X className="text-gray-500" size={18} /></button>
                        </div>
                        <form onSubmit={handleEditarFechaHora} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Cliente</label>
                                    <input
                                        required
                                        value={editForm.cliente_nombre}
                                        onChange={e => setEditForm({ ...editForm, cliente_nombre: e.target.value })}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-all"
                                        placeholder="Nombre"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Contacto</label>
                                    <input
                                        value={editForm.cliente_contacto}
                                        onChange={e => setEditForm({ ...editForm, cliente_contacto: e.target.value })}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-all"
                                        placeholder="11..."
                                    />
                                </div>
                            </div>
                            {modalEditar.item && (modalEditar.item.group_id) && grupos.find(g => g.group_id === modalEditar.item.group_id && g.items.length > 1) && (
                                <p className="text-[9px] text-gray-500 -mt-2">El nombre/contacto se cambia en toda la reserva (todos los días).</p>
                            )}
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Nueva Fecha</label>
                                <input
                                    required
                                    type="date"
                                    value={editForm.fecha}
                                    onChange={e => setEditForm({ ...editForm, fecha: e.target.value })}
                                    className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-all"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Hora Inicio</label>
                                    <input
                                        required
                                        type="time"
                                        value={editForm.hora_inicio}
                                        onChange={e => setEditForm({ ...editForm, hora_inicio: e.target.value })}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Hora Fin</label>
                                    <input
                                        required
                                        type="time"
                                        value={editForm.hora_fin}
                                        onChange={e => setEditForm({ ...editForm, hora_fin: e.target.value })}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-all"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-[#D4E655] uppercase tracking-widest mb-2 block flex items-center gap-1"><DollarSign size={12} /> Precio de este día</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4E655] font-bold">$</span>
                                    <input
                                        required
                                        type="number"
                                        min="0"
                                        value={editForm.monto_total || ''}
                                        onChange={e => setEditForm({ ...editForm, monto_total: Number(e.target.value) })}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-8 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-all"
                                    />
                                </div>
                                {Number(modalEditar.item?.monto_pagado || 0) > 0 && (
                                    <p className="text-[9px] text-gray-500 mt-1">Ya abonado en este día: ${Number(modalEditar.item.monto_pagado).toLocaleString()}</p>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={procesandoEdicion}
                                className="w-full bg-[#D4E655] hover:bg-white text-black font-black uppercase py-3 rounded-xl text-xs tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                            >
                                {procesandoEdicion ? <Loader2 size={16} className="animate-spin" /> : <><Pencil size={14} /> Guardar Cambios</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL COBRO INTELIGENTE */}
            {isPaymentModalOpen && selectedGroup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-[#D4E655]/30 w-full max-w-md rounded-3xl p-6 shadow-2xl shadow-[#D4E655]/10 relative">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><DollarSign className="text-[#D4E655]" /> Cobrar</h3>
                            <button onClick={() => setIsPaymentModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>

                        {/* Alcance: este día o toda la reserva (solo si hay más de un día) */}
                        {payFullGroup && payFullGroup.items.length > 1 && (
                            <div className="flex bg-[#111] rounded-xl border border-white/10 p-1 mb-4">
                                <button onClick={() => cambiarScope('dia')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${paymentScope === 'dia' ? 'bg-[#D4E655] text-black' : 'text-gray-400'}`}>
                                    Este día{payItem ? ` (${format(new Date(payItem.fecha + 'T12:00:00'), 'dd/MM')})` : ''}
                                </button>
                                <button onClick={() => cambiarScope('reserva')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${paymentScope === 'reserva' ? 'bg-[#D4E655] text-black' : 'text-gray-400'}`}>
                                    Toda la reserva ({payFullGroup.items.length} días)
                                </button>
                            </div>
                        )}

                        <div className="bg-[#111] p-4 rounded-2xl mb-6 border border-white/5 text-center">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{selectedGroup.cliente_nombre}</p>
                            <div className="flex justify-center gap-8 mt-4 text-sm font-black text-white">
                                <div><span className="block text-[10px] text-gray-500 uppercase">Total</span>${selectedGroup.total_grupo.toLocaleString()}</div>
                                <div><span className="block text-[10px] text-green-500 uppercase">Abonado</span>${selectedGroup.total_pagado.toLocaleString()}</div>
                            </div>

                            <div className={`mt-3 pt-3 border-t border-white/5 text-[10px] font-black uppercase transition-all ${paymentMethod === 'transferencia' ? 'text-orange-400' : 'text-gray-500'}`}>
                                {paymentMethod === 'transferencia' ? 'Se aplicará 10% de recargo al monto a abonar' : 'Precio de lista en efectivo'}
                            </div>
                        </div>

                        {/* MÉTODOS DE PAGO */}
                        <div className="space-y-3 mb-6">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">1. Método de Pago</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setPaymentMethod('efectivo')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${paymentMethod === 'efectivo' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-[#111] border-white/5 text-gray-400 hover:bg-white/5'}`}>
                                    <Banknote size={24} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Efectivo</span>
                                </button>
                                <button onClick={() => setPaymentMethod('transferencia')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${paymentMethod === 'transferencia' ? 'bg-orange-500/10 border-orange-500 text-orange-400' : 'bg-[#111] border-white/5 text-gray-400 hover:bg-white/5'}`}>
                                    <Landmark size={24} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Transf (+10%)</span>
                                </button>
                            </div>
                        </div>

                        {/* TIPO DE COBRO CON PAGO MANUAL */}
                        <div className="space-y-3 mb-8">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">2. ¿Qué vas a cobrar?</label>
                            <div className="grid grid-cols-1 gap-2">

                                {/* 🚀 BLOQUE PAGO PARCIAL MANUAL */}
                                {(selectedGroup.estado_pago === 'pendiente' || selectedGroup.estado_pago === 'seña_pagada') && (
                                    <div className={`p-4 rounded-xl border transition-all ${paymentType === 'seña' ? 'bg-[#D4E655]/10 border-[#D4E655]' : 'bg-[#111] border-white/5 hover:bg-white/5'}`}>
                                        <div className="flex justify-between items-center cursor-pointer" onClick={() => setPaymentType('seña')}>
                                            <span className={`font-bold text-xs uppercase ${paymentType === 'seña' ? 'text-[#D4E655]' : 'text-gray-400'}`}>
                                                {selectedGroup.estado_pago === 'seña_pagada' ? 'Pago Parcial' : 'Seña Manual'}
                                            </span>
                                            {paymentType !== 'seña' && <span className="font-black text-lg text-gray-400">Personalizar</span>}
                                        </div>

                                        {paymentType === 'seña' && (
                                            <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <label className="text-[10px] font-bold text-[#D4E655] uppercase mb-1 block">Monto Base a Abonar</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-3 text-[#D4E655] font-bold">$</span>
                                                    <input
                                                        type="number"
                                                        value={customSena}
                                                        onChange={(e) => setCustomSena(e.target.value)}
                                                        placeholder={`Ej: ${Math.round((selectedGroup.total_grupo - selectedGroup.total_pagado) / 2)}`}
                                                        className="w-full bg-black/50 border border-[#D4E655]/50 rounded-lg p-3 pl-8 text-[#D4E655] text-lg font-black outline-none focus:border-[#D4E655]"
                                                    />
                                                </div>
                                                <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#D4E655]/20">
                                                    <span className="text-[10px] text-[#D4E655] uppercase font-bold">A Cobrar en Caja:</span>
                                                    <span className="text-xl font-black text-[#D4E655]">
                                                        ${Math.round(Number(customSena || 0) * recargoFactor).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* BOTON TOTAL O RESTO */}
                                {selectedGroup.estado_pago === 'pendiente' && (
                                    <button
                                        onClick={() => { setPaymentType('total'); setCustomSena(''); }}
                                        className={`p-4 rounded-xl border flex justify-between items-center transition-all ${paymentType === 'total' ? 'bg-[#D4E655]/10 border-[#D4E655] text-[#D4E655]' : 'bg-[#111] border-white/5 text-gray-400 hover:bg-white/5'}`}
                                    >
                                        <span className="font-bold text-xs uppercase">Total (100%)</span>
                                        <span className="font-black text-lg">${Math.round((selectedGroup.total_grupo - selectedGroup.total_pagado) * recargoFactor).toLocaleString()}</span>
                                    </button>
                                )}
                                {selectedGroup.estado_pago === 'seña_pagada' && (
                                    <button
                                        onClick={() => { setPaymentType('resto'); setCustomSena(''); }}
                                        className={`p-4 rounded-xl border flex justify-between items-center transition-all ${paymentType === 'resto' ? 'bg-[#D4E655]/10 border-[#D4E655] text-[#D4E655]' : 'bg-[#111] border-white/5 text-gray-400 hover:bg-white/5'}`}
                                    >
                                        <span className="font-bold text-xs uppercase">Saldo Restante</span>
                                        <span className="font-black text-lg">${Math.round((selectedGroup.total_grupo - selectedGroup.total_pagado) * recargoFactor).toLocaleString()}</span>
                                    </button>
                                )}
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
                                <MultiDatePicker selectedDates={form.fechas} onChange={(dates) => { setForm({ ...form, fechas: dates }); sincronizarHoras(dates) }} />

                                <div className="mt-4 bg-[#111] p-3 rounded-xl border border-white/10">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Horario por día ({form.fechas.length})</p>
                                        {form.fechas.length > 1 && (
                                            <button type="button" onClick={aplicarHorarioATodos} className="text-[9px] font-bold uppercase text-[#D4E655] hover:underline flex items-center gap-1">
                                                <Copy size={10} /> Aplicar {form.hora_inicio}–{form.hora_fin} a todos
                                            </button>
                                        )}
                                    </div>
                                    {form.fechas.length === 0 ? (
                                        <span className="text-xs text-gray-600 italic">Ninguna seleccionada</span>
                                    ) : (
                                        <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                                            {[...form.fechas].sort((a, b) => a.getTime() - b.getTime()).map((d) => {
                                                const k = keyOf(d)
                                                const h = horasPorFecha[k] || { inicio: form.hora_inicio, fin: form.hora_fin }
                                                return (
                                                    <div key={k} className="flex items-center gap-2 bg-black/40 rounded-lg px-2 py-1.5 border border-white/5">
                                                        <span className="text-[11px] font-bold text-gray-200 w-24 shrink-0 capitalize">{format(d, 'EEE dd/MM', { locale: es })}</span>
                                                        <input type="time" value={h.inicio} onChange={e => setHoraDia(k, 'inicio', e.target.value)} className="bg-[#111] border border-white/10 rounded-md px-1.5 py-1 text-xs text-white outline-none focus:border-[#D4E655]" />
                                                        <span className="text-gray-600 text-xs">a</span>
                                                        <input type="time" value={h.fin} onChange={e => setHoraDia(k, 'fin', e.target.value)} className="bg-[#111] border border-white/10 rounded-md px-1.5 py-1 text-xs text-white outline-none focus:border-[#D4E655]" />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
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
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Inicio (por defecto)</label><input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" /></div>
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Fin (por defecto)</label><input type="time" value={form.hora_fin} onChange={e => setForm({ ...form, hora_fin: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" /></div>
                                </div>
                                <p className="text-[9px] text-gray-600 -mt-2">Este horario se aplica a los días nuevos que elijas. Ajustá cada día por separado en la lista de la izquierda.</p>

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
                                <div className="space-y-1 pt-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1"><ShieldAlert size={12} className="text-yellow-500" /> Notas para Recepción</label>
                                    <textarea
                                        value={form.notas_recepcion}
                                        onChange={e => setForm({ ...form, notas_recepcion: e.target.value })}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-yellow-500 resize-none h-16"
                                        placeholder="Ej: Ingresan equipos de filmación, sillas extras..."
                                    />
                                </div>

                                {form.sala_id && (
                                    <div className="bg-[#111] p-3 rounded-xl border border-white/10 mt-2">
                                        <label className="text-[10px] font-bold text-[#D4E655] uppercase flex items-center gap-1 mb-2"><Tag size={12} /> Valor por hora (para esta reserva)</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { k: 'precio_manana', lbl: 'Matutino' },
                                                { k: 'precio_noche', lbl: 'Nocturno' },
                                                { k: 'precio_finde', lbl: 'Finde/Dom' },
                                            ].map(({ k, lbl }) => (
                                                <div key={k} className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase block">{lbl}</label>
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">$</span>
                                                        <input type="number" min="0" value={(form as any)[k] || ''} onChange={e => setForm({ ...form, [k]: Number(e.target.value) })} className="w-full bg-black border border-white/10 rounded-lg py-2 pl-5 pr-2 text-white text-xs font-bold outline-none focus:border-[#D4E655]" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[9px] text-gray-600 mt-1.5">Precargado del tarifario de la sala. Editalo si querés un valor distinto para esta reserva (no cambia el tarifario general).</p>
                                    </div>
                                )}

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