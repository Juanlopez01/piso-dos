'use client'

import { createClient } from '@/utils/supabase/client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as globalMutate } from 'swr'
import {
    DollarSign, Lock, Unlock, TrendingUp, TrendingDown,
    Loader2, History, MapPin, Wallet, CreditCard, LayoutDashboard,
    User, X, Info, AlertOctagon, Clock, Users, Smartphone, Pencil,
    ChevronDown,
    ChevronRight,
    Trash2,
    ArrowLeft,
    Calendar as CalendarIcon,
    Calendar
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCash } from '@/context/CashContext'

// 🚀 IMPORTAMOS LAS SERVER ACTIONS (AHORA CON LA DE HORARIOS)
import {
    abrirCajaAction, cerrarCajaAction, registrarMovimientoAction,
    cerrarTodasLasCajasAction, editarMovimientoAction, eliminarMovimientoCajaAction,
    editarMontoInicialAction, editarHorarioTurnoAction // <-- Acá está la nueva
} from '@/app/actions/caja'

type CajaData = {
    admin: {
        cajasActivas: any[]
        historialCajas: any[]
        reporteHoras: any[]
    } | null
    recepcion: {
        sedes: any[]
        turnoActivo: any | null
        movimientos: any[]
        ultimosCierresPorSede: Record<string, any>
    } | null
    pagosOnline: any[]
    turnosDisponibles: any[]
}

const fetcherCaja = async ([key, role, uid, mesSeleccionado]: [string, string, string, string?]): Promise<CajaData> => {
    const supabase = createClient()

    const { data: turnosAbiertosData } = await supabase
        .from('caja_turnos')
        .select(`id, sede:sedes(id, nombre)`)
        .eq('estado', 'abierta');

    const turnosDisponibles = (turnosAbiertosData || []).map((t: any) => ({
        id: t.id,
        sede_nombre: Array.isArray(t.sede) ? t.sede[0]?.nombre : t.sede?.nombre
    }));

    const { data: pagosOnlineData, error: errPagos } = await supabase
        .from('pagos_online')
        .select('*')
        .eq('estado', 'approved')
        .order('created_at', { ascending: false })
        .limit(100)

    if (errPagos) console.error("Error leyendo pagos online:", errPagos)

    let pagosOnline = pagosOnlineData || []

    if (pagosOnline.length > 0) {
        const userIds = [...new Set(pagosOnline.map((p: any) => p.user_id).filter(Boolean))]

        if (userIds.length > 0) {
            const { data: perfiles } = await supabase
                .from('profiles')
                .select('id, nombre_completo')
                .in('id', userIds)

            pagosOnline = pagosOnline.map((pago: any) => ({
                ...pago,
                usuario: perfiles?.find((prof: any) => prof.id === pago.user_id) || { nombre_completo: 'Usuario Desconocido' }
            }))
        }
    }

    if (role === 'admin') {
        const { data: activas } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo), caja_movimientos(*)`)
            .eq('estado', 'abierta')

        let activasCalculadas = []
        if (activas) {
            activasCalculadas = activas.map((caja: any) => {
                const montoInicial = Number(caja.monto_inicial) || 0
                const ingresosMovs = caja.caja_movimientos?.filter((m: any) => m.tipo === 'ingreso').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0
                const egresos = caja.caja_movimientos?.filter((m: any) => m.tipo === 'egreso').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0
                const ingresosEfecMovs = caja.caja_movimientos?.filter((m: any) => m.tipo === 'ingreso' && m.metodo_pago === 'efectivo').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0
                const egresosEfec = caja.caja_movimientos?.filter((m: any) => m.tipo === 'egreso' && m.metodo_pago === 'efectivo').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0

                return {
                    ...caja,
                    ingresos_movimientos: ingresosMovs,
                    total_ingresos_vista: montoInicial + ingresosMovs,
                    saldo_total: montoInicial + ingresosMovs - egresos,
                    saldo_fisico: montoInicial + ingresosEfecMovs - egresosEfec
                }
            })
        }

        const { data: historial } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo)`)
            .eq('estado', 'cerrada')
            .order('fecha_cierre', { ascending: false })
            .limit(100)

        const historialCalculado = (historial || []).map((caja: any) => ({
            ...caja,
            ingresos_con_inicial: Number(caja.total_ingresos) + Number(caja.monto_inicial)
        }))

        // --- LÓGICA DE FILTRO POR MES ---
        let fechaInicioMes: string;
        let fechaFinMes: string;

        if (mesSeleccionado) {
            const [year, month] = mesSeleccionado.split('-');
            fechaInicioMes = new Date(Number(year), Number(month) - 1, 1).toISOString();
            fechaFinMes = new Date(Number(year), Number(month), 1).toISOString();
        } else {
            const hoy = new Date();
            fechaInicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
            fechaFinMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();
        }

        const { data: turnosMes } = await supabase.from('caja_turnos')
            .select(`usuario_id, fecha_apertura, fecha_cierre, usuario:profiles(nombre_completo)`)
            .gte('fecha_apertura', fechaInicioMes)
            .lt('fecha_apertura', fechaFinMes)
            .not('fecha_cierre', 'is', null)

        const horasPorRecepcionista: Record<string, any> = {}

        if (turnosMes) {
            turnosMes.forEach((turno: any) => {
                if (!turno.fecha_apertura || !turno.fecha_cierre) return;

                const apertura = new Date(turno.fecha_apertura).getTime();
                const cierre = new Date(turno.fecha_cierre).getTime();
                const diffHoras = (cierre - apertura) / (1000 * 60 * 60);
                const uid = turno.usuario_id;

                if (!horasPorRecepcionista[uid]) {
                    const nombreUsuario = Array.isArray(turno.usuario) ? turno.usuario[0]?.nombre_completo : turno.usuario?.nombre_completo;
                    horasPorRecepcionista[uid] = {
                        nombre: nombreUsuario || 'Usuario Desconocido',
                        horas: 0,
                        cantidad_turnos: 0
                    };
                }

                horasPorRecepcionista[uid].horas += diffHoras;
                horasPorRecepcionista[uid].cantidad_turnos += 1;
            })
        }

        const reporteHoras = Object.values(horasPorRecepcionista).sort((a: any, b: any) => b.horas - a.horas);

        return { admin: { cajasActivas: activasCalculadas, historialCajas: historialCalculado, reporteHoras }, recepcion: null, pagosOnline, turnosDisponibles }

    } else if (role === 'recepcion' || role === 'auxiliar') {
        if (!uid) throw new Error("No user ID")

        const { data: sedes } = await supabase.from('sedes').select('*').order('nombre')

        const { data: turnoActivo } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo)`)
            .eq('usuario_id', uid)
            .eq('estado', 'abierta')
            .maybeSingle()

        let movimientos: any[] = []
        if (turnoActivo) {
            const { data: movs } = await supabase.from('caja_movimientos')
                .select('*')
                .eq('turno_id', turnoActivo.id)
                .order('created_at', { ascending: false })
            movimientos = movs || []
        }

        const ultimosCierresPorSede: Record<string, any> = {};
        if (sedes) {
            for (const sede of sedes) {
                const { data: ultimoTurno } = await supabase.from('caja_turnos')
                    .select('monto_final, usuario:profiles(nombre_completo), fecha_cierre')
                    .eq('sede_id', sede.id)
                    .eq('estado', 'cerrada')
                    .order('fecha_cierre', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (ultimoTurno) {
                    ultimosCierresPorSede[sede.id] = {
                        monto: ultimoTurno.monto_final,
                        responsable: Array.isArray(ultimoTurno.usuario) ? ultimoTurno.usuario[0]?.nombre_completo : ultimoTurno.usuario?.nombre_completo,
                        fecha: ultimoTurno.fecha_cierre
                    };
                }
            }
        }

        return { admin: null, recepcion: { sedes: sedes || [], turnoActivo, movimientos, ultimosCierresPorSede }, pagosOnline, turnosDisponibles }
    }

    return { admin: null, recepcion: null, pagosOnline: [], turnosDisponibles: [] }
}

const fetcherDetalle = async ([key, turnoId]: [string, string]) => {
    const supabase = createClient()
    const { data } = await supabase.from('caja_movimientos')
        .select('*')
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: false })
    return data || []
}

const formatHoras = (horasDecimales: number) => {
    const h = Math.floor(horasDecimales);
    const m = Math.round((horasDecimales - h) * 60);
    return `${h}h ${m}m`;
}

export default function CajaPage() {
    const { checkStatus, userRole, userId, isLoading: loadingContext } = useCash()
    const router = useRouter()

    const [adminMode, setAdminMode] = useState<'dashboard' | 'operador'>('dashboard')
    const [filtroFechaHistorial, setFiltroFechaHistorial] = useState('')
    const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7))
    const fetchRole = userRole === 'admin' && adminMode === 'operador' ? 'recepcion' : userRole;

    const { data, isLoading, mutate, error } = useSWR(
        !loadingContext && userRole && userId
            ? ['caja-dashboard', fetchRole, userId, mesFiltro] // <-- Agregamos mesFiltro acá
            : null,
        fetcherCaja,
        {
            refreshInterval: fetchRole === 'admin' ? 10000 : 0,
            revalidateOnFocus: fetchRole === 'recepcion' || fetchRole === 'auxiliar'
        }
    )

    const [procesando, setProcesando] = useState(false)
    const [montoInicial, setMontoInicial] = useState('')
    const [sedeSeleccionada, setSedeSeleccionada] = useState('')
    const [recienCerrada, setRecienCerrada] = useState(false)
    const [nuevoMovimiento, setNuevoMovimiento] = useState({ tipo: 'ingreso', concepto: '', monto: '', metodo: 'efectivo' })
    const [cajaDetalle, setCajaDetalle] = useState<any>(null)
    const [cerrandoCajas, setCerrandoCajas] = useState(false)

    const [modalMontoInicial, setModalMontoInicial] = useState({ isOpen: false, turnoId: '', monto: '' })

    // 🚀 ESTADO PARA EL MODAL DE EDICIÓN DE HORARIOS
    const [modalHorario, setModalHorario] = useState({ isOpen: false, turnoId: '', tipo: 'apertura' as 'apertura' | 'cierre', fechaLocal: '' })

    const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>(() => {
        const hoy = format(new Date(), "yyyy-MM-dd");
        return { [hoy]: true };
    });

    const [movAEditar, setMovAEditar] = useState<any>(null)

    const { data: movimientosDetalle, isLoading: loadingDetalle, mutate: mutateDetalle } = useSWR(
        cajaDetalle ? ['caja-detalle', cajaDetalle.id] : null,
        fetcherDetalle
    )

    const adminData = data?.admin
    const repData = data?.recepcion
    const pagosOnline = data?.pagosOnline || []
    const turnosDisponibles = data?.turnosDisponibles || []

    const cajasActivas = adminData?.cajasActivas || []
    const historialCajas = adminData?.historialCajas || []
    const reporteHoras = adminData?.reporteHoras || []

    const sedes = repData?.sedes || []
    const turnoActivo = repData?.turnoActivo || null
    const movimientos = repData?.movimientos || []
    const ultimosCierresPorSede = repData?.ultimosCierresPorSede || {}

    useEffect(() => {
        if (sedeSeleccionada && ultimosCierresPorSede[sedeSeleccionada]) {
            setMontoInicial(String(ultimosCierresPorSede[sedeSeleccionada].monto));
        } else {
            setMontoInicial('');
        }
    }, [sedeSeleccionada, ultimosCierresPorSede]);

    let saldoFisico = 0, saldoDigital = 0, ingresosEfec = 0, egresosEfec = 0, ingresosDig = 0, egresosDig = 0
    if (turnoActivo) {
        const movsEfectivo = movimientos.filter(m => m.metodo_pago === 'efectivo')
        ingresosEfec = movsEfectivo.filter(m => m.tipo === 'ingreso').reduce((a, b) => a + Number(b.monto), 0)
        egresosEfec = movsEfectivo.filter(m => m.tipo === 'egreso').reduce((a, b) => a + Number(b.monto), 0)
        saldoFisico = Number(turnoActivo.monto_inicial) + ingresosEfec - egresosEfec

        const movsDigital = movimientos.filter(m => m.metodo_pago !== 'efectivo')
        ingresosDig = movsDigital.filter(m => m.tipo === 'ingreso').reduce((a, b) => a + Number(b.monto), 0)
        egresosDig = movsDigital.filter(m => m.tipo === 'egreso').reduce((a, b) => a + Number(b.monto), 0)
        saldoDigital = ingresosDig - egresosDig
    }

    const handleAbrirCaja = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!sedeSeleccionada) return toast.error('Seleccioná una sede')
        setProcesando(true)

        const response = await abrirCajaAction(sedeSeleccionada, Number(montoInicial) || 0)

        if (response.success) {
            toast.success('Caja Abierta')
            setRecienCerrada(false)
            await checkStatus()
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al abrir caja')
        }
        setProcesando(false)
    }

    const handleActualizarMontoInicial = async (e: React.FormEvent) => {
        e.preventDefault()
        setProcesando(true)

        const response = await editarMontoInicialAction(modalMontoInicial.turnoId, Number(modalMontoInicial.monto))

        if (response.success) {
            toast.success('Fondo inicial actualizado')
            setModalMontoInicial({ isOpen: false, turnoId: '', monto: '' })
            mutate()
            if (cajaDetalle) {
                setTimeout(() => globalMutate(['caja-detalle', cajaDetalle.id]), 500)
            }
        } else {
            toast.error(response.error || 'Error al actualizar')
        }
        setProcesando(false)
    }

    // 🚀 LÓGICA PARA ENVIAR EL NUEVO HORARIO
    const handleEditarHorario = async (e: React.FormEvent) => {
        e.preventDefault()
        setProcesando(true)

        try {
            const fechaObj = new Date(modalHorario.fechaLocal)
            const response = await editarHorarioTurnoAction(modalHorario.turnoId, modalHorario.tipo, fechaObj.toISOString())

            if (response.success) {
                toast.success(`Horario de ${modalHorario.tipo} actualizado con éxito`)
                mutate()
                if (cajaDetalle) {
                    setCajaDetalle((prev: any) => ({
                        ...prev,
                        [modalHorario.tipo === 'apertura' ? 'fecha_apertura' : 'fecha_cierre']: fechaObj.toISOString()
                    }))
                }
                setModalHorario({ isOpen: false, turnoId: '', tipo: 'apertura', fechaLocal: '' })
            } else {
                toast.error(response.error || 'Error al actualizar horario')
            }
        } catch (error) {
            toast.error('Formato de fecha inválido')
        }
        setProcesando(false)
    }

    const handleCierreGlobal = async () => {
        const confirmacion1 = window.confirm('⚠️ ADVERTENCIA: Estás por cerrar TODOS los turnos de caja activos de todos los usuarios.')
        if (!confirmacion1) return

        const confirmacion2 = window.confirm('¿Estás absolutamente seguro? Los usuarios tendrán que abrir un nuevo turno mañana.')
        if (!confirmacion2) return

        setCerrandoCajas(true)
        const response = await cerrarTodasLasCajasAction()

        if (response.success) {
            toast.success('Todas las cajas han sido cerradas forzosamente.')
            mutate()
        } else {
            toast.error(response.error || 'Hubo un error al cerrar las cajas.')
        }
        setCerrandoCajas(false)
    }

    const handleEliminarMov = async (id: string) => {
        if (!confirm('¿Seguro que querés eliminar este movimiento? Esta acción es irreversible.')) return;
        setProcesando(true);
        const res = await eliminarMovimientoCajaAction(id);
        if (res.success) {
            toast.success('Movimiento eliminado');
            mutate();
            if (cajaDetalle) mutateDetalle();
        } else {
            toast.error(res.error || 'Error al eliminar');
        }
        setProcesando(false);
    }

    const handleCerrarCaja = async () => {
        if (!turnoActivo) return;

        const conteoInput = prompt(
            `CIERRE DE CAJA - SEDE ${turnoActivo.sede?.nombre}\n\n` +
            `El sistema registra que deberías tener: $${saldoFisico.toLocaleString()} en efectivo.\n\n` +
            `¿Cuánto efectivo real tenés en caja? (Ingresá solo números)`
        );

        if (conteoInput === null) return;
        const efectivoReal = Number(conteoInput);
        if (isNaN(efectivoReal)) return toast.error("Monto inválido. Ingresá solo números.");

        const diferencia = efectivoReal - saldoFisico;
        let mensajeConfirmacion = `Resumen de Cierre:\n\n` +
            `• Efectivo contado: $${efectivoReal.toLocaleString()}\n` +
            `• Saldo Digital: $${saldoDigital.toLocaleString()}\n` +
            `• Total a rendir: $${(efectivoReal + saldoDigital).toLocaleString()}\n\n`;

        if (diferencia === 0) {
            mensajeConfirmacion += `✅ ¡Caja perfecta! Sin diferencias.`;
        } else {
            mensajeConfirmacion += diferencia > 0
                ? `⚠️ SOBRANTE: $${diferencia.toLocaleString()}`
                : `❌ FALTANTE: $${Math.abs(diferencia).toLocaleString()}`;
            mensajeConfirmacion += `\n\n¿Deseas cerrar la caja con esta diferencia?`;
        }

        if (!confirm(mensajeConfirmacion)) return;

        setProcesando(true)
        const response = await cerrarCajaAction(turnoActivo.id, efectivoReal)

        if (response.success) {
            toast.success(response.message || 'Caja Cerrada Exitosamente')
            setRecienCerrada(true)
            await checkStatus()
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Fallo al intentar cerrar caja.')
        }
        setProcesando(false)
    }

    const handleMovimiento = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!turnoActivo) return

        const payload = {
            turno_id: turnoActivo.id,
            tipo: nuevoMovimiento.tipo,
            concepto: nuevoMovimiento.concepto,
            monto: Number(nuevoMovimiento.monto),
            metodo_pago: nuevoMovimiento.metodo,
            origen_referencia: 'manual'
        }

        const optimisticMov = { ...payload, id: 'temp-' + Date.now(), created_at: new Date().toISOString() }
        mutate({
            ...data!,
            recepcion: {
                ...data!.recepcion!,
                movimientos: [optimisticMov, ...data!.recepcion!.movimientos]
            }
        }, false)

        setProcesando(true)
        const response = await registrarMovimientoAction(payload)

        if (response.success) {
            toast.success('Movimiento Registrado')
            setNuevoMovimiento({ tipo: 'ingreso', concepto: '', monto: '', metodo: 'efectivo' })
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al registrar')
            mutate()
        }
        setProcesando(false)
    }

    const handleEditarMovimiento = async (e: React.FormEvent) => {
        e.preventDefault()
        setProcesando(true)
        const response = await editarMovimientoAction(movAEditar.id, {
            concepto: movAEditar.concepto,
            monto: Number(movAEditar.monto),
            metodo_pago: movAEditar.metodo_pago,
            tipo: movAEditar.tipo,
            turno_id: movAEditar.turno_id
        })

        if (response.success) {
            toast.success('Movimiento actualizado y/o reubicado correctamente')
            setMovAEditar(null)
            mutate()
            if (cajaDetalle) {
                setTimeout(() => globalMutate(['caja-detalle', cajaDetalle.id]), 500)
            }
        } else {
            toast.error(response.error || 'Error al actualizar el movimiento')
        }
        setProcesando(false)
    }

    const pagosAgrupados = pagosOnline.reduce((acc, pago) => {
        const fecha = format(new Date(pago.created_at), "yyyy-MM-dd");
        if (!acc[fecha]) {
            acc[fecha] = { pagos: [], total: 0 };
        }
        acc[fecha].pagos.push(pago);
        acc[fecha].total += Number(pago.monto);
        return acc;
    }, {} as Record<string, { pagos: any[], total: number }>);

    const fechasOrdenadas = Object.keys(pagosAgrupados)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        .slice(0, 5);

    const totalReciente = pagosOnline.reduce((acc, p) => acc + Number(p.monto), 0);

    const renderPagosOnline = (
        <div className="mt-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                    <Smartphone size={18} className="text-blue-500" /> MercadoPago (Últimos 5 días)
                </h2>
                {pagosOnline.length > 0 && (
                    <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                            <DollarSign size={16} />
                        </div>
                        <div>
                            <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest leading-none mb-1">Total Mostrado</p>
                            <p className="text-xl font-black text-white leading-none">
                                ${totalReciente.toLocaleString()}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-xl p-4 md:p-6">
                {pagosOnline.length === 0 ? (
                    <p className="text-center text-gray-500 font-bold uppercase text-xs py-8 border-2 border-dashed border-white/5 rounded-xl">
                        No hay pagos online recientes.
                    </p>
                ) : (
                    <div className="space-y-8">
                        {fechasOrdenadas.map(fecha => {
                            const grupo = pagosAgrupados[fecha];
                            const isExpanded = expandedDays[fecha];
                            const fechaParseada = new Date(`${fecha}T12:00:00`);
                            const fechaDisplay = format(fechaParseada, "EEEE d 'de' MMMM", { locale: es });

                            return (
                                <div key={fecha} className="space-y-3">
                                    <div
                                        className="flex items-center justify-between border-b border-white/5 pb-2 cursor-pointer group"
                                        onClick={() => setExpandedDays(prev => ({ ...prev, [fecha]: !isExpanded }))}
                                    >
                                        <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 group-hover:text-white transition-colors">
                                            {isExpanded ? <ChevronDown size={14} className="text-blue-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                                            {fechaDisplay}
                                        </h3>
                                        <span className="text-[11px] font-black uppercase text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                                            Día: ${grupo.total.toLocaleString()}
                                        </span>
                                    </div>
                                    {isExpanded && (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                            {grupo.pagos.map((pago: any) => (
                                                <div key={pago.id} className="bg-[#09090b] border border-white/5 p-3 rounded-xl flex items-center justify-between gap-3 hover:border-white/20 hover:bg-white/5 transition-all overflow-hidden">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0 border border-blue-500/20">
                                                            <DollarSign size={16} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-bold text-white text-sm truncate">{pago.concepto}</h4>
                                                            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 truncate">
                                                                {format(new Date(pago.created_at), "HH:mm")} hs • {pago.usuario?.nombre_completo || 'Usuario Desconocido'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className="text-blue-400 font-black text-base shrink-0 whitespace-nowrap pl-1">
                                                        +${Number(pago.monto).toLocaleString()}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    )

    const renderModalEdicion = movAEditar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-6 shadow-2xl relative">
                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                    <h3 className="text-xl font-black text-white uppercase flex items-center gap-2">
                        <Pencil className="text-[#D4E655]" /> Editar Movimiento
                    </h3>
                    <button onClick={() => setMovAEditar(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="text-gray-500 hover:text-white" />
                    </button>
                </div>
                <form onSubmit={handleEditarMovimiento} className="space-y-5 text-left">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Sede (Turno Destino)</label>
                        <select
                            value={movAEditar.turno_id}
                            onChange={e => setMovAEditar({ ...movAEditar, turno_id: e.target.value })}
                            className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655] cursor-pointer"
                        >
                            {!turnosDisponibles.some(t => t.id === movAEditar.turno_id) && (
                                <option value={movAEditar.turno_id}>Sede Original (Turno Cerrado)</option>
                            )}
                            {turnosDisponibles.map(t => (
                                <option key={t.id} value={t.id}>{t.sede_nombre} (Turno Abierto)</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-gray-600 mt-1">Si cambiás la sede, la plata se moverá a la caja activa de ese lugar.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Tipo</label>
                            <select
                                value={movAEditar.tipo}
                                onChange={e => setMovAEditar({ ...movAEditar, tipo: e.target.value })}
                                className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655] cursor-pointer"
                            >
                                <option value="ingreso">Ingreso (+)</option>
                                <option value="egreso">Egreso (-)</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Método</label>
                            <select
                                value={movAEditar.metodo_pago}
                                onChange={e => setMovAEditar({ ...movAEditar, metodo_pago: e.target.value })}
                                className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655] cursor-pointer"
                            >
                                <option value="efectivo">Efectivo</option>
                                <option value="transferencia">Transferencia</option>
                                <option value="tarjeta">Tarjeta</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Concepto / Nombre</label>
                        <input required value={movAEditar.concepto} onChange={e => setMovAEditar({ ...movAEditar, concepto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Monto ($)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-3 text-gray-500 font-bold">$</span>
                            <input required type="number" value={movAEditar.monto} onChange={e => setMovAEditar({ ...movAEditar, monto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-8 text-white text-lg font-bold outline-none focus:border-[#D4E655]" />
                        </div>
                    </div>
                    <button disabled={procesando} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-2 shadow-lg">
                        {procesando ? <Loader2 className="animate-spin" /> : 'Guardar Cambios'}
                    </button>
                </form>
            </div>
        </div>
    );

    const renderModalMontoInicial = modalMontoInicial.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[#09090b] border border-[#D4E655]/30 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative">
                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                    <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                        <Wallet className="text-[#D4E655]" /> Ajustar Fondo Físico
                    </h3>
                    <button onClick={() => setModalMontoInicial({ isOpen: false, turnoId: '', monto: '' })} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="text-gray-500 hover:text-white" />
                    </button>
                </div>
                <form onSubmit={handleActualizarMontoInicial} className="space-y-5 text-left">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Efectivo Real en Caja</label>
                        <div className="relative">
                            <span className="absolute left-4 top-4 text-gray-500 font-bold text-xl">$</span>
                            <input
                                required
                                type="number"
                                value={modalMontoInicial.monto}
                                onChange={e => setModalMontoInicial({ ...modalMontoInicial, monto: e.target.value })}
                                className="w-full bg-[#111] border border-white/10 rounded-xl p-4 pl-10 text-white text-2xl font-black outline-none focus:border-[#D4E655]"
                            />
                        </div>
                        <p className="text-[10px] text-gray-500 uppercase font-bold mt-2">Corrige el saldo con el que abrió la caja.</p>
                    </div>
                    <button disabled={procesando} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-2 shadow-lg">
                        {procesando ? <Loader2 className="animate-spin" /> : 'Actualizar Saldo'}
                    </button>
                </form>
            </div>
        </div>
    );

    // 🚀 RENDERIZADO DEL NUEVO MODAL DE HORARIOS
    const renderModalHorario = modalHorario.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[#09090b] border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative">
                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                    <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                        <Clock className="text-[#D4E655]" /> Editar Hora
                    </h3>
                    <button onClick={() => setModalHorario({ isOpen: false, turnoId: '', tipo: 'apertura', fechaLocal: '' })} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="text-gray-500 hover:text-white" />
                    </button>
                </div>
                <form onSubmit={handleEditarHorario} className="space-y-5 text-left">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            {modalHorario.tipo === 'apertura' ? 'Fecha y Hora de Apertura' : 'Fecha y Hora de Cierre'}
                        </label>
                        <input
                            required
                            type="datetime-local"
                            value={modalHorario.fechaLocal}
                            onChange={e => setModalHorario({ ...modalHorario, fechaLocal: e.target.value })}
                            className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm font-black outline-none focus:border-[#D4E655]"
                        />
                        <p className="text-[10px] text-gray-500 uppercase font-bold mt-2">Modificar este horario afectará los reportes de horas de la sede.</p>
                    </div>
                    <button disabled={procesando} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-2 shadow-lg">
                        {procesando ? <Loader2 className="animate-spin" /> : 'Guardar Horario'}
                    </button>
                </form>
            </div>
        </div>
    );

    if (isLoading || loadingContext) return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center">
            <Loader2 className="animate-spin text-[#D4E655] w-10 h-10" />
        </div>
    )
    if (error) return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-red-500">
            <AlertOctagon size={40} className="mb-4" />
            <p className="font-bold uppercase tracking-widest text-xs">Error de conexión: {error.message}</p>
        </div>
    )

    // =================================================================
    // VISTA ADMIN - DASHBOARD
    // =================================================================
    if (userRole === 'admin' && adminMode === 'dashboard') {
        const cajasFiltradasHistorial = filtroFechaHistorial
            ? historialCajas.filter((caja: any) => {
                const fechaCaja = new Date(caja.fecha_cierre).toISOString().split('T')[0]
                return fechaCaja === filtroFechaHistorial
            })
            : historialCajas;

        return (
            <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in relative">
                <Toaster position="top-center" richColors theme="dark" />
                {renderModalEdicion}
                {renderModalMontoInicial}
                {renderModalHorario}

                {cajaDetalle && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setCajaDetalle(null)}>
                        <div className="bg-[#09090b] border border-white/10 w-full max-w-4xl rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

                            <div className="flex justify-between items-start mb-6 shrink-0 border-b border-white/10 pb-4">
                                <div>
                                    <h3 className="text-2xl font-black text-white uppercase flex items-center gap-3">
                                        Auditoría de Caja
                                        <span className={`text-[10px] px-2 py-1 rounded uppercase tracking-widest ${cajaDetalle.estado === 'abierta' ? 'bg-[#D4E655]/20 text-[#D4E655]' : 'bg-gray-500/20 text-gray-400'}`}>
                                            {cajaDetalle.estado}
                                        </span>
                                    </h3>
                                    <div className="text-[11px] text-gray-400 font-bold uppercase mt-2 flex flex-wrap items-center gap-3">
                                        <span className="flex items-center gap-1"><MapPin size={12} /> {cajaDetalle.sede?.nombre}</span>
                                        <span className="text-white/20">|</span>
                                        <span className="flex items-center gap-1"><User size={12} /> {cajaDetalle.usuario?.nombre_completo}</span>
                                        <span className="text-white/20">|</span>

                                        {/* 🚀 LAPICITO EN HORA DE APERTURA */}
                                        <span className="flex items-center gap-1 group/hora">
                                            <History size={12} /> Abierta: {format(new Date(cajaDetalle.fecha_apertura), "dd/MM HH:mm")} hs
                                            <button
                                                onClick={() => setModalHorario({ isOpen: true, turnoId: cajaDetalle.id, tipo: 'apertura', fechaLocal: format(new Date(cajaDetalle.fecha_apertura), "yyyy-MM-dd'T'HH:mm") })}
                                                className="opacity-0 group-hover/hora:opacity-100 transition-opacity ml-1 hover:text-[#D4E655] cursor-pointer"
                                                title="Editar Hora de Apertura"
                                            >
                                                <Pencil size={10} />
                                            </button>
                                        </span>

                                        {/* 🚀 LAPICITO EN HORA DE CIERRE */}
                                        {cajaDetalle.fecha_cierre && (
                                            <>
                                                <span className="text-white/20">|</span>
                                                <span className="flex items-center gap-1 group/hora">
                                                    <History size={12} /> Cerrada: {format(new Date(cajaDetalle.fecha_cierre), "dd/MM HH:mm")} hs
                                                    <button
                                                        onClick={() => setModalHorario({ isOpen: true, turnoId: cajaDetalle.id, tipo: 'cierre', fechaLocal: format(new Date(cajaDetalle.fecha_cierre), "yyyy-MM-dd'T'HH:mm") })}
                                                        className="opacity-0 group-hover/hora:opacity-100 transition-opacity ml-1 hover:text-[#D4E655] cursor-pointer"
                                                        title="Editar Hora de Cierre"
                                                    >
                                                        <Pencil size={10} />
                                                    </button>
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => setCajaDetalle(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="text-gray-500 hover:text-white" /></button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0">
                                <div className="bg-[#111] p-4 rounded-2xl border border-white/5 relative group/monto">
                                    <p className="text-[9px] text-gray-500 uppercase font-bold mb-1">Fondo Inicial</p>
                                    <p className="text-xl font-black text-white">${Number(cajaDetalle.monto_inicial).toLocaleString()}</p>
                                    {cajaDetalle.estado === 'abierta' && (
                                        <button
                                            onClick={() => setModalMontoInicial({ isOpen: true, turnoId: cajaDetalle.id, monto: cajaDetalle.monto_inicial })}
                                            className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-[#D4E655] hover:text-black rounded opacity-0 group-hover/monto:opacity-100 transition-all"
                                            title="Editar Fondo Inicial"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    )}
                                </div>
                                <div className="bg-[#111] p-4 rounded-2xl border border-white/5">
                                    <p className="text-[9px] text-gray-500 uppercase font-bold text-green-500 mb-1">Ingresos (Movs)</p>
                                    <p className="text-xl font-black text-green-500">
                                        +${cajaDetalle.estado === 'abierta'
                                            ? Number(cajaDetalle.ingresos_movimientos).toLocaleString()
                                            : Number(cajaDetalle.total_ingresos).toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-[#111] p-4 rounded-2xl border border-white/5">
                                    <p className="text-[9px] text-gray-500 uppercase font-bold text-red-500 mb-1">Egresos (Movs)</p>
                                    <p className="text-xl font-black text-red-500">
                                        -${Number(cajaDetalle.total_egresos || 0).toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-[#D4E655]/10 p-4 rounded-2xl border border-[#D4E655]/20">
                                    <p className="text-[9px] text-[#D4E655] uppercase font-bold mb-1">Total en Caja</p>
                                    <p className="text-xl font-black text-[#D4E655]">
                                        ${cajaDetalle.estado === 'abierta'
                                            ? Number(cajaDetalle.saldo_total).toLocaleString()
                                            : Number(cajaDetalle.monto_final).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <h4 className="text-xs font-black text-white uppercase tracking-widest mb-3 shrink-0 flex items-center gap-2">
                                <LayoutDashboard size={14} className="text-[#D4E655]" /> Detalle de Movimientos
                            </h4>

                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                                {loadingDetalle ? (
                                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                                ) : movimientosDetalle?.length === 0 ? (
                                    <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
                                        <p className="text-gray-500 text-xs font-bold uppercase">Esta caja no tiene movimientos registrados</p>
                                    </div>
                                ) : (
                                    movimientosDetalle?.map((mov: any) => (
                                        <div key={mov.id} className="bg-[#111] border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors group">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${mov.tipo === 'ingreso' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {mov.tipo === 'ingreso' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-white text-sm">{mov.concepto}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] text-gray-500 uppercase font-bold bg-white/5 px-2 py-0.5 rounded">
                                                            {format(new Date(mov.created_at), "HH:mm", { locale: es })} hs
                                                        </span>
                                                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${mov.metodo_pago === 'efectivo' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                                            {mov.metodo_pago}
                                                        </span>
                                                        {mov.origen_referencia !== 'manual' && (
                                                            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">Sistema</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className={`text-base font-black ${mov.tipo === 'ingreso' ? 'text-white' : 'text-red-500'}`}>
                                                    {mov.tipo === 'ingreso' ? '+' : '-'}${Number(mov.monto).toLocaleString()}
                                                </span>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); setMovAEditar(mov); }} className="p-2 bg-white/5 hover:bg-[#D4E655]/20 rounded-lg transition-colors group/btn">
                                                        <Pencil size={14} className="text-gray-400 group-hover/btn:text-[#D4E655]" />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleEliminarMov(mov.id); }} className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 rounded-lg transition-colors">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 border-b border-white/10 pb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter text-white">Finanzas Admin</h1>
                        <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Panel de Control</p>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                        <button
                            onClick={() => setAdminMode('operador')}
                            className="bg-white/10 border border-white/20 text-white px-4 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-[#D4E655] hover:text-black transition-all flex items-center gap-2 shadow-lg tracking-widest"
                        >
                            <LayoutDashboard size={16} /> Mi Terminal
                        </button>
                        <div className="hidden md:block border-l border-white/10 pl-6">
                            <p className="text-[10px] text-gray-500 font-bold uppercase">Cajas Activas</p>
                            <p className="text-3xl font-black text-white">{cajasActivas.length}</p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleCierreGlobal}
                    disabled={cerrandoCajas}
                    className="bg-red-600/20 text-red-500 border border-red-600/30 px-6 py-3 mb-3 md:mb-6 rounded-xl font-black uppercase text-xs hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(220,38,38,0.2)]"
                >
                    {cerrandoCajas ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : (
                        <>
                            <AlertOctagon size={16} /> Forzar Cierre Global
                        </>
                    )}
                </button>

                <h2 className="text-lg font-black uppercase text-white mb-4 flex items-center gap-2 mt-8">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> En Vivo
                </h2>

                {cajasActivas.length === 0 ? (
                    <div className="bg-[#111] border border-white/10 rounded-2xl p-8 text-center mb-12">
                        <p className="text-gray-500 font-bold uppercase text-sm">No hay sedes operando ahora.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                        {cajasActivas.map(caja => (
                            <div
                                key={caja.id}
                                onClick={() => setCajaDetalle(caja)}
                                className="bg-[#09090b] border border-white/10 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-[#D4E655]/50 hover:shadow-[0_0_20px_rgba(212,230,85,0.1)] transition-all cursor-pointer"
                            >
                                <div className="absolute top-0 right-0 bg-[#D4E655] text-black text-[9px] font-black uppercase px-3 py-1 rounded-bl-xl z-10 shadow-[0_0_10px_rgba(212,230,85,0.4)]">
                                    Abierta
                                </div>

                                <div className="flex items-center gap-2 mb-4 text-gray-400 text-xs font-bold uppercase tracking-wider relative z-10">
                                    <MapPin size={14} className="text-[#D4E655]" />
                                    {caja.sede?.nombre || 'Sede Desconocida'}
                                </div>

                                <div className="flex items-center gap-3 mb-6 bg-white/5 p-3 rounded-xl border border-white/5">
                                    <div className="w-10 h-10 rounded-full bg-[#D4E655]/10 flex items-center justify-center shrink-0 border border-[#D4E655]/20">
                                        <User size={20} className="text-[#D4E655]" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-[9px] text-gray-500 uppercase font-bold leading-none mb-1">Responsable</p>
                                        <h3 className="text-sm font-black text-white truncate leading-none">
                                            {caja.usuario?.nombre_completo || 'Usuario Desconocido'}
                                        </h3>
                                        <p className="text-[9px] text-gray-600 uppercase mt-1">
                                            Abrió: {format(new Date(caja.fecha_apertura), "HH:mm'hs'")}
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-[#111] p-4 rounded-xl border border-white/5 mb-2 relative z-10 group-hover:bg-[#D4E655]/5 transition-colors">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase flex justify-between">
                                        Saldo Total <Info size={12} className="opacity-50" />
                                    </p>
                                    <p className="text-3xl font-black text-[#D4E655] tracking-tight">
                                        ${caja.saldo_total.toLocaleString()}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 px-1 opacity-60">
                                    <Wallet size={12} className="text-white" />
                                    <p className="text-[10px] text-gray-300 font-bold uppercase">
                                        Efectivo Físico: ${caja.saldo_fisico.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-8 mb-4 gap-4">
                    <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                        <Clock size={18} className="text-[#D4E655]" /> Horas Trabajadas
                    </h2>

                    {/* CONTROLES DE FILTRO */}
                    <div className="flex items-center gap-3 bg-[#111] px-4 py-2 rounded-xl border border-white/10 w-fit shadow-lg">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                            <Calendar size={14} className="text-[#D4E655]" />
                            Mes:
                        </label>
                        <input
                            type="month"
                            value={mesFiltro}
                            onChange={(e) => setMesFiltro(e.target.value)}
                            className="bg-transparent text-sm text-white font-bold outline-none cursor-pointer color-scheme-dark"
                        />
                    </div>
                </div>

                <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-xl mb-12 p-6">
                    {reporteHoras.length === 0 ? (
                        <p className="text-center text-gray-500 font-bold uppercase text-xs py-4">No hay turnos cerrados en este mes aún.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {reporteHoras.map((rep: any, idx: number) => (
                                <div key={idx} className="bg-[#09090b] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0 text-blue-400 font-black">
                                            {rep.nombre[0]}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-sm truncate max-w-[120px]">{rep.nombre}</h4>
                                            <p className="text-[10px] text-gray-500 uppercase font-bold">{rep.cantidad_turnos} turnos</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[#D4E655] font-black text-lg">{formatHoras(rep.horas)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-4 mt-8">
                    <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                        <History size={18} className="text-gray-500" /> Historial de Cierres
                    </h2>

                    <div className="relative">
                        <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <input
                            type="date"
                            value={filtroFechaHistorial}
                            onChange={(e) => setFiltroFechaHistorial(e.target.value)}
                            className="bg-[#111] border border-white/10 text-xs font-bold uppercase text-gray-300 p-2.5 pl-9 rounded-xl outline-none focus:border-[#D4E655] transition-colors w-full sm:w-auto"
                        />
                        {filtroFechaHistorial && (
                            <button
                                onClick={() => setFiltroFechaHistorial('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                title="Limpiar filtro"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[600px]">
                            <thead className="bg-black/40 text-[9px] font-black uppercase text-gray-500">
                                <tr>
                                    <th className="p-4">Fecha Cierre</th>
                                    <th className="p-4">Sede</th>
                                    <th className="p-4">Responsable</th>
                                    <th className="p-4 text-right">Ingresos</th>
                                    <th className="p-4 text-right">Egresos</th>
                                    <th className="p-4 text-right">Saldo Final</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs divide-y divide-white/5">
                                {cajasFiltradasHistorial.map((caja: any) => (
                                    <tr
                                        key={caja.id}
                                        onClick={() => setCajaDetalle(caja)}
                                        className="hover:bg-white/10 transition-colors group cursor-pointer"
                                    >
                                        <td className="p-4 font-bold text-gray-300">
                                            {format(new Date(caja.fecha_cierre), "d MMM, HH:mm", { locale: es })}
                                        </td>
                                        <td className="p-4 font-bold text-white uppercase">{caja.sede?.nombre || '-'}</td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-black text-gray-400 group-hover:bg-[#D4E655] group-hover:text-black transition-colors">
                                                    {caja.usuario?.nombre_completo?.charAt(0) || 'U'}
                                                </div>
                                                <span className="text-gray-400 font-medium group-hover:text-white transition-colors">
                                                    {caja.usuario?.nombre_completo || '-'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right text-green-500 font-bold opacity-80">+${Number(caja.total_ingresos).toLocaleString()}</td>
                                        <td className="p-4 text-right text-red-500 font-bold opacity-80">-${Number(caja.total_egresos).toLocaleString()}</td>
                                        <td className="p-4 text-right text-[#D4E655] font-black text-sm">
                                            ${Number(caja.monto_final).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {cajasFiltradasHistorial.length === 0 && (
                        <div className="p-8 text-center text-gray-500 font-bold uppercase text-xs">
                            {filtroFechaHistorial ? 'No hay cajas cerradas en la fecha seleccionada.' : 'No hay historial disponible.'}
                        </div>
                    )}
                </div>

                {renderPagosOnline}
            </div>
        )
    }

    // =================================================================
    // VISTA TERMINAL (RECEPCIÓN, AUXILIAR O ADMIN OPERADOR) - CAJA CERRADA
    // =================================================================
    if (!turnoActivo) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4 animate-in zoom-in-95 duration-300 relative">
                {userRole === 'admin' && (
                    <button
                        onClick={() => setAdminMode('dashboard')}
                        className="absolute top-6 left-6 md:top-8 md:left-8 text-gray-400 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors bg-white/5 px-4 py-2 rounded-xl border border-white/10 hover:bg-white/10"
                    >
                        <ArrowLeft size={16} /> Volver al Dashboard
                    </button>
                )}

                <Toaster position="top-center" richColors theme="dark" />

                <div className="max-w-md w-full bg-[#09090b] border border-white/10 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden mb-8 mt-12 md:mt-0">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#D4E655] to-transparent opacity-50" />

                    {recienCerrada ? (
                        <div className="py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-6xl mb-6">👋</div>
                            <h1 className="text-2xl font-black uppercase mb-2 text-white">¡Turno Finalizado!</h1>
                            <p className="text-[#D4E655] font-bold text-lg mb-8">¡Te esperamos mañana! 😊</p>

                            <button
                                onClick={() => setRecienCerrada(false)}
                                className="text-gray-500 text-[10px] uppercase font-bold tracking-widest hover:text-white transition-colors border-b border-transparent hover:border-white pb-1"
                            >
                                Volver a abrir caja
                            </button>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-2xl font-black uppercase mb-2 mt-4 text-white">Caja Cerrada</h1>
                            <p className="text-gray-500 text-sm mb-8">Abrí caja para comenzar a operar.</p>
                            <form onSubmit={handleAbrirCaja} className="space-y-4 text-left animate-in fade-in">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Sede</label>
                                    <select required className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white outline-none focus:border-[#D4E655] transition-all" value={sedeSeleccionada} onChange={(e) => setSedeSeleccionada(e.target.value)}>
                                        <option value="">Seleccionar...</option>
                                        {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Fondo Inicial (Efectivo)</label>

                                    {sedeSeleccionada && ultimosCierresPorSede[sedeSeleccionada] && (
                                        <div className="mb-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 flex items-start gap-2">
                                            <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-[9px] text-blue-300/80 leading-tight">
                                                    El turno anterior cerró con <span className="font-bold text-blue-400">${Number(ultimosCierresPorSede[sedeSeleccionada].monto).toLocaleString()}</span>
                                                </p>
                                                <p className="text-[8px] text-blue-300/50 uppercase mt-0.5">
                                                    Cerrado por: {ultimosCierresPorSede[sedeSeleccionada].responsable} ({format(new Date(ultimosCierresPorSede[sedeSeleccionada].fecha), "dd/MM HH:mm")})
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-gray-500">$</span>
                                        <input
                                            type="number"
                                            className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-6 text-white outline-none focus:border-[#D4E655] transition-all"
                                            placeholder="0"
                                            value={montoInicial}
                                            onChange={(e) => setMontoInicial(e.target.value)}
                                        />
                                    </div>
                                    {sedeSeleccionada && ultimosCierresPorSede[sedeSeleccionada] && montoInicial !== '' && Number(montoInicial) !== Number(ultimosCierresPorSede[sedeSeleccionada].monto) && (
                                        <p className="text-[9px] text-orange-400 font-bold uppercase mt-1 ml-1 animate-pulse">
                                            ⚠️ Estás abriendo con un monto distinto al cierre anterior
                                        </p>
                                    )}
                                </div>
                                <button disabled={procesando} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-2">
                                    {procesando ? <Loader2 className="animate-spin" /> : <><Unlock size={16} /> Abrir Caja</>}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                <div className="w-full max-w-4xl">
                    {renderPagosOnline}
                </div>
            </div>
        )
    }

    // =================================================================
    // VISTA TERMINAL (RECEPCIÓN, AUXILIAR O ADMIN OPERADOR) - CAJA ABIERTA
    // =================================================================
    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in duration-500">
            <Toaster position="top-center" richColors theme="dark" />
            {renderModalEdicion}
            {renderModalMontoInicial}

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 border-b border-white/10 pb-6">
                <div>
                    <div className="flex items-center gap-4 mb-1">
                        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white leading-none">
                            Caja Activa
                        </h1>
                        {userRole === 'admin' && (
                            <button onClick={() => setAdminMode('dashboard')} className="bg-white/10 text-white border border-white/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-white/20 transition-colors">
                                <ArrowLeft size={14} /> Dashboard
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="flex items-center gap-1.5 bg-[#D4E655]/10 text-[#D4E655] border border-[#D4E655]/20 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                            <MapPin size={12} /> {turnoActivo?.sede?.nombre || 'Sede Desconocida'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <div className="bg-[#09090b] border border-[#D4E655]/30 p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all"><Wallet size={40} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Efectivo en Caja</p>
                    <h2 className="text-4xl font-black text-white tracking-tighter">${saldoFisico.toLocaleString()}</h2>
                    <div className="mt-4 flex gap-3 text-[10px] font-bold uppercase text-gray-500 items-center">
                        <span className="flex items-center">
                            Ini: ${Number(turnoActivo.monto_inicial).toLocaleString()}
                            <button
                                onClick={() => setModalMontoInicial({ isOpen: true, turnoId: turnoActivo.id, monto: turnoActivo.monto_inicial })}
                                className="ml-1 text-gray-500 hover:text-white transition-colors"
                                title="Editar Fondo Inicial"
                            >
                                <Pencil size={10} />
                            </button>
                        </span>
                        <span className="text-green-500">Ing: ${ingresosEfec.toLocaleString()}</span>
                    </div>
                </div>

                <div className="bg-[#09090b] border border-white/10 p-6 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><CreditCard size={40} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Banco / Digital</p>
                    <h2 className="text-4xl font-black text-white tracking-tighter">${saldoDigital.toLocaleString()}</h2>
                    <div className="mt-4 flex gap-3 text-[10px] font-bold uppercase text-gray-500">
                        <span className="text-green-500">Ing: ${ingresosDig.toLocaleString()}</span>
                        <span className="text-red-500">Egr: ${egresosDig.toLocaleString()}</span>
                    </div>
                </div>

                <div className="flex flex-col justify-center">
                    <button onClick={handleCerrarCaja} disabled={procesando} className="h-full w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-white text-red-500 font-bold uppercase rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-6 group">
                        {procesando ? <Loader2 className="animate-spin" /> : (
                            <>
                                <Lock size={24} className="group-hover:scale-110 transition-transform" />
                                <span>Cerrar Turno</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <div className="bg-[#09090b] border border-white/10 rounded-2xl p-6 shadow-lg sticky top-8">
                        <h3 className="text-lg font-black uppercase text-white mb-6 flex items-center gap-2">
                            <DollarSign className="text-[#D4E655]" /> Registrar
                        </h3>
                        <form onSubmit={handleMovimiento} className="space-y-4">
                            <div className="grid grid-cols-2 gap-2 bg-[#111] p-1 rounded-xl">
                                <button type="button" onClick={() => setNuevoMovimiento({ ...nuevoMovimiento, tipo: 'ingreso' })} className={`py-3 text-xs font-black uppercase rounded-lg transition-all flex items-center justify-center gap-2 ${nuevoMovimiento.tipo === 'ingreso' ? 'bg-[#D4E655] text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}><TrendingUp size={16} /> Ingreso</button>
                                <button type="button" onClick={() => setNuevoMovimiento({ ...nuevoMovimiento, tipo: 'egreso' })} className={`py-3 text-xs font-black uppercase rounded-lg transition-all flex items-center justify-center gap-2 ${nuevoMovimiento.tipo === 'egreso' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}><TrendingDown size={16} /> Egreso</button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Método de Pago</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['efectivo', 'transferencia', 'tarjeta'].map(met => (
                                        <button key={met} type="button" onClick={() => setNuevoMovimiento({ ...nuevoMovimiento, metodo: met })} className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg border transition-all ${nuevoMovimiento.metodo === met ? 'border-[#D4E655] text-[#D4E655] bg-[#D4E655]/10' : 'border-white/10 text-gray-500 hover:bg-white/5'}`}>
                                            {met}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <input required value={nuevoMovimiento.concepto} onChange={e => setNuevoMovimiento({ ...nuevoMovimiento, concepto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655] transition-all" placeholder="Concepto (ej: Pago Alumno)" />
                            </div>
                            <div className="space-y-1 relative">
                                <span className="absolute left-4 top-4 text-gray-500 text-lg font-bold">$</span>
                                <input required type="number" value={nuevoMovimiento.monto} onChange={e => setNuevoMovimiento({ ...nuevoMovimiento, monto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 pl-8 text-white text-lg font-bold outline-none focus:border-[#D4E655] transition-all" placeholder="0.00" />
                            </div>

                            <button disabled={procesando} className="w-full bg-white text-black font-black uppercase py-4 rounded-xl hover:bg-gray-200 transition-all text-xs tracking-widest mt-2 shadow-lg flex items-center justify-center gap-2">
                                {procesando ? <Loader2 className="animate-spin" /> : 'Guardar Movimiento'}
                            </button>
                        </form>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <LayoutDashboard size={16} className="text-[#D4E655]" />
                        <h3 className="text-sm font-bold uppercase text-white">Movimientos del Turno</h3>
                    </div>

                    {movimientos.length === 0 ? (
                        <div className="text-center py-20 opacity-30 border-2 border-dashed border-white/10 rounded-3xl">
                            <p className="text-gray-500 font-bold uppercase">No hay movimientos registrados hoy</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {movimientos.map((mov) => (
                                <div key={mov.id} className="bg-[#111] border border-white/5 p-4 rounded-xl flex items-center justify-between group hover:border-white/20 transition-all hover:translate-x-1">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${mov.tipo === 'ingreso' ? 'bg-[#D4E655]/10 text-[#D4E655]' : 'bg-red-500/10 text-red-500'}`}>
                                            {mov.tipo === 'ingreso' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-sm">{mov.concepto}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-gray-500 uppercase font-bold bg-white/5 px-2 py-0.5 rounded">
                                                    {format(new Date(mov.created_at), "HH:mm")}
                                                </span>
                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${mov.metodo_pago === 'efectivo' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                                    {mov.metodo_pago}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`text-lg font-black ${mov.tipo === 'ingreso' ? 'text-white' : 'text-red-500'}`}>
                                            {mov.tipo === 'ingreso' ? '+' : '-'}${Number(mov.monto).toLocaleString()}
                                        </span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={(e) => { e.stopPropagation(); setMovAEditar(mov); }} className="p-2 bg-white/5 hover:bg-[#D4E655]/20 rounded-lg transition-colors group/btn">
                                                <Pencil size={16} className="text-gray-400 group-hover/btn:text-[#D4E655]" />
                                            </button>
                                            {userRole === 'admin' && (
                                                <button onClick={(e) => { e.stopPropagation(); handleEliminarMov(mov.id); }} className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 rounded-lg transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {renderPagosOnline}
        </div>
    )
}