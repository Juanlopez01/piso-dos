'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    DollarSign, Lock, Unlock, TrendingUp, TrendingDown,
    Loader2, History, MapPin, Wallet, CreditCard, LayoutDashboard,
    User, X, Info
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCash } from '@/context/CashContext'


export default function CajaPage() {
    const supabase = createClient()
    const { checkStatus, userRole, isLoading: loadingContext } = useCash()

    // Estados de Carga
    const [loading, setLoading] = useState(true)
    const [procesando, setProcesando] = useState(false)

    // --- ESTADOS RECEPCION ---
    const [turnoActivo, setTurnoActivo] = useState<any>(null)
    const [movimientos, setMovimientos] = useState<any[]>([])
    const [sedes, setSedes] = useState<any[]>([])
    const [montoInicial, setMontoInicial] = useState('')
    const [sedeSeleccionada, setSedeSeleccionada] = useState('')
    const [recienCerrada, setRecienCerrada] = useState(false)

    // Formulario Movimientos
    const [nuevoMovimiento, setNuevoMovimiento] = useState({
        tipo: 'ingreso', concepto: '', monto: '', metodo: 'efectivo'
    })

    // --- ESTADOS ADMIN ---
    const [cajasActivas, setCajasActivas] = useState<any[]>([])
    const [historialCajas, setHistorialCajas] = useState<any[]>([])

    // Estados Modal de Detalle (Admin)
    const [cajaDetalle, setCajaDetalle] = useState<any>(null)
    const [movimientosDetalle, setMovimientosDetalle] = useState<any[]>([])
    const [loadingDetalle, setLoadingDetalle] = useState(false)

    // Efecto Maestro
    useEffect(() => {
        const cargarDatos = async () => {
            if (!loadingContext) {
                setLoading(true)
                try {
                    if (userRole === 'admin') {
                        await fetchAdminData()
                    } else {
                        await fetchRecepcionData()
                    }
                } catch (error) {
                    console.error("Error cargando caja:", error)
                } finally {
                    setLoading(false)
                }
            }
        }
        cargarDatos()
    }, [userRole, loadingContext])

    // =================================================================
    // LÓGICA DE ADMIN (VER TOTALES + HISTORIAL)
    // =================================================================
    const fetchAdminData = async () => {
        // 1. Cajas Activas
        const { data: activas } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo), caja_movimientos(*)`)
            .eq('estado', 'abierta')

        if (activas) {
            const activasCalculadas = activas.map(caja => {
                const montoInicial = Number(caja.monto_inicial) || 0

                // Sumamos movimientos
                const ingresosMovs = caja.caja_movimientos?.filter((m: any) => m.tipo === 'ingreso').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0
                const egresos = caja.caja_movimientos?.filter((m: any) => m.tipo === 'egreso').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0

                const ingresosEfecMovs = caja.caja_movimientos?.filter((m: any) => m.tipo === 'ingreso' && m.metodo_pago === 'efectivo').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0
                const egresosEfec = caja.caja_movimientos?.filter((m: any) => m.tipo === 'egreso' && m.metodo_pago === 'efectivo').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0

                const ingresosTotales = montoInicial + ingresosMovs

                return {
                    ...caja,
                    ingresos_movimientos: ingresosMovs,
                    total_ingresos_vista: ingresosTotales,
                    saldo_total: montoInicial + ingresosMovs - egresos,
                    saldo_fisico: montoInicial + ingresosEfecMovs - egresosEfec
                }
            })
            setCajasActivas(activasCalculadas)
        }

        // 2. Historial
        const { data: historial } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo)`)
            .eq('estado', 'cerrada')
            .order('fecha_cierre', { ascending: false })
            .limit(20)

        if (historial) {
            const historialCalculado = historial.map(caja => ({
                ...caja,
                ingresos_con_inicial: Number(caja.total_ingresos) + Number(caja.monto_inicial)
            }))
            setHistorialCajas(historialCalculado)
        }
    }

    const abrirDetalleCaja = async (caja: any) => {
        setCajaDetalle(caja)
        setLoadingDetalle(true)
        const { data } = await supabase.from('caja_movimientos')
            .select('*')
            .eq('turno_id', caja.id)
            .order('created_at', { ascending: false })

        if (data) setMovimientosDetalle(data)
        setLoadingDetalle(false)
    }

    // =================================================================
    // LÓGICA DE RECEPCIÓN (OPERAR)
    // =================================================================
    const fetchRecepcionData = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: dataSedes } = await supabase.from('sedes').select('*').order('nombre')
        if (dataSedes) setSedes(dataSedes)

        const { data: turno } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo)`)
            .eq('usuario_id', user.id)
            .eq('estado', 'abierta')
            .maybeSingle()

        if (turno) {
            setTurnoActivo(turno)
            const { data: movs } = await supabase.from('caja_movimientos')
                .select('*')
                .eq('turno_id', turno.id)
                .order('created_at', { ascending: false })
            setMovimientos(movs || [])
        } else {
            setTurnoActivo(null)
            setMovimientos([])
        }
    }

    // --- CÁLCULOS GLOBALES DEL TURNO ACTIVO ---
    let saldoFisico = 0;
    let saldoDigital = 0;
    let ingresosEfec = 0;
    let egresosEfec = 0;
    let ingresosDig = 0;
    let egresosDig = 0;

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

    // --- ACCIONES RECEPCIÓN ---
    const handleAbrirCaja = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!sedeSeleccionada) return toast.error('Seleccioná una sede')
        setProcesando(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { error } = await supabase.from('caja_turnos').insert({
                usuario_id: user.id, sede_id: sedeSeleccionada, monto_inicial: Number(montoInicial) || 0, estado: 'abierta', fecha_apertura: new Date().toISOString()
            })
            if (!error) {
                toast.success('Caja Abierta')
                setRecienCerrada(false)
                await checkStatus()
                fetchRecepcionData()
            } else {
                toast.error('Error al abrir caja')
            }
        }
        setProcesando(false)
    }

    const handleCerrarCaja = async () => {
        if (!turnoActivo) return

        const totalIngresos = ingresosEfec + ingresosDig
        const totalEgresos = egresosEfec + egresosDig
        const saldoFinalTotal = saldoFisico + saldoDigital

        if (!confirm(`¿Cerrar caja con saldo TOTAL $${saldoFinalTotal.toLocaleString()}? \n(Efectivo: $${saldoFisico.toLocaleString()} | Digital: $${saldoDigital.toLocaleString()})`)) return

        setProcesando(true)
        const { error } = await supabase.from('caja_turnos').update({
            estado: 'cerrada',
            fecha_cierre: new Date().toISOString(),
            monto_final: saldoFinalTotal,
            saldo_final_efectivo: saldoFisico,
            saldo_final_digital: saldoDigital,
            total_ingresos: totalIngresos,
            total_egresos: totalEgresos
        }).eq('id', turnoActivo.id)

        if (!error) {
            toast.success('Caja Cerrada')
            setTurnoActivo(null)
            setRecienCerrada(true)
            await checkStatus()
            fetchRecepcionData()
        } else {
            toast.error('Error al cerrar caja')
        }
        setProcesando(false)
    }

    const handleMovimiento = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!turnoActivo) return
        setProcesando(true)
        const { error } = await supabase.from('caja_movimientos').insert({
            turno_id: turnoActivo.id,
            tipo: nuevoMovimiento.tipo,
            concepto: nuevoMovimiento.concepto,
            monto: Number(nuevoMovimiento.monto),
            metodo_pago: nuevoMovimiento.metodo,
            origen_referencia: 'manual'
        })
        if (!error) {
            toast.success('Registrado')
            setNuevoMovimiento({ tipo: 'ingreso', concepto: '', monto: '', metodo: 'efectivo' })
            fetchRecepcionData()
        } else {
            toast.error('Error al registrar')
        }
        setProcesando(false)
    }

    // RENDERIZADO DE CARGA
    if (loading || loadingContext) return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center">
            <Loader2 className="animate-spin text-[#D4E655] w-10 h-10" />
        </div>
    )

    // =================================================================
    // VISTA ADMIN
    // =================================================================
    if (userRole === 'admin') {
        return (
            <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in relative">

                {/* --- MODAL DETALLE DE CAJA --- */}
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
                                    <div className="text-[11px] text-gray-400 font-bold uppercase mt-2 flex items-center gap-3">
                                        <span className="flex items-center gap-1"><MapPin size={12} /> {cajaDetalle.sede?.nombre}</span>
                                        <span className="text-white/20">|</span>
                                        <span className="flex items-center gap-1"><User size={12} /> {cajaDetalle.usuario?.nombre_completo}</span>
                                        <span className="text-white/20">|</span>
                                        <span className="flex items-center gap-1"><History size={12} /> Abierta: {format(new Date(cajaDetalle.fecha_apertura), "dd/MM HH:mm")} hs</span>
                                    </div>
                                </div>
                                <button onClick={() => setCajaDetalle(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="text-gray-500 hover:text-white" /></button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0">
                                <div className="bg-[#111] p-4 rounded-2xl border border-white/5">
                                    <p className="text-[9px] text-gray-500 uppercase font-bold mb-1">Fondo Inicial</p>
                                    <p className="text-xl font-black text-white">${Number(cajaDetalle.monto_inicial).toLocaleString()}</p>
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
                                ) : movimientosDetalle.length === 0 ? (
                                    <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
                                        <p className="text-gray-500 text-xs font-bold uppercase">Esta caja no tiene movimientos registrados</p>
                                    </div>
                                ) : (
                                    movimientosDetalle.map(mov => (
                                        <div key={mov.id} className="bg-[#111] border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${mov.tipo === 'ingreso' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {mov.tipo === 'ingreso' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-white text-sm">{mov.concepto}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] text-gray-500 uppercase font-bold">
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
                                            <span className={`text-base font-black ${mov.tipo === 'ingreso' ? 'text-white' : 'text-red-500'}`}>
                                                {mov.tipo === 'ingreso' ? '+' : '-'}${Number(mov.monto).toLocaleString()}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {/* --- FIN MODAL DETALLE --- */}

                <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-6">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter text-white">Finanzas</h1>
                        <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest">Panel de Control</p>
                    </div>
                    <div className="text-right hidden md:block">
                        <p className="text-[10px] text-gray-500 font-bold uppercase">Cajas Activas</p>
                        <p className="text-3xl font-black text-white">{cajasActivas.length}</p>
                    </div>
                </div>

                <h2 className="text-lg font-black uppercase text-white mb-4 flex items-center gap-2">
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
                                onClick={() => abrirDetalleCaja(caja)}
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

                <h2 className="text-lg font-black uppercase text-white mb-4 flex items-center gap-2">
                    <History size={18} className="text-gray-500" /> Historial de Cierres
                </h2>
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
                                {historialCajas.map((caja) => (
                                    <tr
                                        key={caja.id}
                                        onClick={() => abrirDetalleCaja(caja)}
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
                    {historialCajas.length === 0 && (
                        <div className="p-8 text-center text-gray-500 font-bold uppercase text-xs">
                            No hay historial disponible.
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // =================================================================
    // VISTA RECEPCIÓN - CAJA CERRADA / DESPEDIDA
    // =================================================================
    if (!turnoActivo) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 animate-in zoom-in-95 duration-300">
                <Toaster position="top-center" richColors theme="dark" />
                <div className="max-w-md w-full bg-[#09090b] border border-white/10 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden">
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
                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-gray-500">$</span>
                                        <input type="number" className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-6 text-white outline-none focus:border-[#D4E655] transition-all" placeholder="0" value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} />
                                    </div>
                                </div>
                                <button disabled={procesando} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-2">
                                    {procesando ? <Loader2 className="animate-spin" /> : <><Unlock size={16} /> Abrir Caja</>}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        )
    }

    // =================================================================
    // VISTA RECEPCIÓN - CAJA ABIERTA
    // =================================================================
    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in duration-500">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <div className="bg-[#09090b] border border-[#D4E655]/30 p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all"><Wallet size={40} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Efectivo en Caja</p>
                    <h2 className="text-4xl font-black text-white tracking-tighter">${saldoFisico.toLocaleString()}</h2>
                    <div className="mt-4 flex gap-3 text-[10px] font-bold uppercase text-gray-500">
                        <span>Ini: ${Number(turnoActivo.monto_inicial).toLocaleString()}</span>
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
                    <button onClick={handleCerrarCaja} className="h-full w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-white text-red-500 font-bold uppercase rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-6 group">
                        <Lock size={24} className="group-hover:scale-110 transition-transform" />
                        <span>Cerrar Turno</span>
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
                                    <span className={`text-lg font-black ${mov.tipo === 'ingreso' ? 'text-white' : 'text-red-500'}`}>
                                        {mov.tipo === 'ingreso' ? '+' : '-'}${Number(mov.monto).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}