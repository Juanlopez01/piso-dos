'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    ArrowDownCircle, LogOut, FileText, Loader2,
    Search, AlertCircle, TrendingUp, TrendingDown, DollarSign, Wallet, CreditCard, Calendar
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'

export default function CajaPage() {
    const supabase = createClient()

    const [role, setRole] = useState<string>('')
    const [loading, setLoading] = useState(true)

    // DATA
    const [turnoActivo, setTurnoActivo] = useState<any>(null)
    const [movimientos, setMovimientos] = useState<any[]>([])

    // DATA ADMIN
    const [historial, setHistorial] = useState<any[]>([])
    const [viewAdmin, setViewAdmin] = useState<'monitor' | 'historial'>('monitor')

    // MODALES
    const [isGastoOpen, setIsGastoOpen] = useState(false)
    const [isCierreOpen, setIsCierreOpen] = useState(false)

    // FORMS
    const [gastoForm, setGastoForm] = useState({ concepto: '', monto: '', metodo: 'efectivo' })
    const [cierreForm, setCierreForm] = useState({ efectivo_real: '', notas: '' })

    // TOTALES (Calculados en vivo)
    const [totales, setTotales] = useState({ ingresos: 0, egresos: 0, saldo: 0, efectivo: 0, digital: 0 })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // 1. Obtener Rol
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
        const userRole = profile?.rol || 'recepcion'
        setRole(userRole)

        // 2. Buscar Turno
        if (userRole === 'admin') {
            // Admin: Busca historial y cajas abiertas de otros
            fetchAdminData()
        } else {
            // Recepción: Busca SU turno activo
            fetchUserTurno(user.id)
        }
        setLoading(false)
    }

    const fetchUserTurno = async (userId: string) => {
        const { data: turno } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo)`)
            .eq('usuario_id', userId)
            .eq('estado', 'abierta')
            .maybeSingle()

        if (turno) {
            setTurnoActivo(turno)
            fetchMovimientos(turno.id, turno.saldo_inicial)
        }
    }

    const fetchAdminData = async () => {
        // Cajas abiertas ahora mismo
        const { data: abiertas } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo)`)
            .eq('estado', 'abierta')

        // Historial de cerradas
        const { data: cerradas } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo)`)
            .eq('estado', 'cerrada')
            .order('created_at', { ascending: false })
            .limit(50)

        if (abiertas && abiertas.length > 0) {
            // Si hay una abierta, mostramos la primera para auditar (o podrías listar todas)
            setTurnoActivo(abiertas[0])
            fetchMovimientos(abiertas[0].id, abiertas[0].saldo_inicial)
        } else {
            setViewAdmin('historial')
        }

        if (cerradas) setHistorial(cerradas)
    }

    const fetchMovimientos = async (turnoId: string, saldoInicial: number) => {
        const { data: movs } = await supabase.from('caja_movimientos')
            .select(`*, turno:caja_turnos(usuario:profiles(nombre_completo))`)
            .eq('turno_id', turnoId)
            .order('created_at', { ascending: true }) // Orden cronológico para el Excel

        if (movs) {
            setMovimientos(movs)
            calcularTotales(movs, saldoInicial)
        }
    }

    const calcularTotales = (movs: any[], inicial: number) => {
        let ing = 0, egr = 0, efvo = inicial || 0, dig = 0;

        movs.forEach(m => {
            const monto = Number(m.monto)
            if (m.tipo === 'ingreso') {
                ing += monto
                if (m.metodo_pago === 'efectivo') efvo += monto; else dig += monto;
            } else {
                egr += monto
                if (m.metodo_pago === 'efectivo') efvo -= monto; else dig -= monto;
            }
        })
        setTotales({ ingresos: ing, egresos: egr, saldo: (inicial + ing - egr), efectivo: efvo, digital: dig })
    }

    // --- OPERACIONES ---
    const handleCargarGasto = async () => {
        if (!turnoActivo) return
        const { error } = await supabase.from('caja_movimientos').insert({
            turno_id: turnoActivo.id, tipo: 'egreso', concepto: gastoForm.concepto,
            monto: Number(gastoForm.monto), metodo_pago: gastoForm.metodo, origen_referencia: 'manual'
        })
        if (!error) {
            toast.success('Gasto registrado')
            setIsGastoOpen(false); setGastoForm({ concepto: '', monto: '', metodo: 'efectivo' });
            fetchMovimientos(turnoActivo.id, turnoActivo.saldo_inicial)
        }
    }

    const handleCerrarCaja = async () => {
        if (!turnoActivo) return
        const { error } = await supabase.from('caja_turnos').update({
            estado: 'cerrada', cerrado_at: new Date().toISOString(),
            saldo_final_efectivo: Number(cierreForm.efectivo_real),
            saldo_final_digital: totales.digital, notas_cierre: cierreForm.notas
        }).eq('id', turnoActivo.id)

        if (!error) {
            toast.success('Caja cerrada correctamente')
            setIsCierreOpen(false);
            window.location.reload()
        }
    }

    // RENDERIZADO DE FILA TIPO EXCEL
    const renderFila = (mov: any, index: number, saldoAcumulado: number) => {
        const esIngreso = mov.tipo === 'ingreso'
        return (
            <tr key={mov.id} className="hover:bg-white/5 transition-colors border-b border-white/5 text-xs group">
                <td className="p-2 md:p-3 text-gray-400 border-r border-white/5 font-mono whitespace-nowrap">
                    {format(new Date(mov.created_at), 'HH:mm')}
                </td>
                <td className="p-2 md:p-3 text-white border-r border-white/5 uppercase font-medium truncate max-w-[150px] md:max-w-none">
                    {mov.concepto}
                </td>
                <td className="p-2 md:p-3 text-center border-r border-white/5 uppercase text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded ${mov.origen_referencia === 'manual' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'}`}>
                        {mov.origen_referencia}
                    </span>
                </td>
                <td className="p-2 md:p-3 text-center border-r border-white/5 uppercase text-[10px] text-gray-400">
                    {mov.metodo_pago === 'efectivo' ? 'Efectivo' : 'Digital'}
                </td>
                <td className="p-2 md:p-3 text-right border-r border-white/5 text-green-500 font-bold font-mono">
                    {esIngreso ? `$${Number(mov.monto).toLocaleString()}` : '-'}
                </td>
                <td className="p-2 md:p-3 text-right border-r border-white/5 text-red-500 font-bold font-mono">
                    {!esIngreso ? `$${Number(mov.monto).toLocaleString()}` : '-'}
                </td>
                <td className="p-2 md:p-3 text-right font-mono text-white bg-white/5 font-bold">
                    ${saldoAcumulado.toLocaleString()}
                </td>
            </tr>
        )
    }

    if (loading) return <div className="h-full bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>

    // VISTA ADMIN: LISTA DE HISTORIAL (Si elige esa vista)
    if (role === 'admin' && viewAdmin === 'historial') {
        return (
            <div className="p-4 md:p-8 h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black text-white uppercase">Historial de Cajas</h2>
                    {turnoActivo && <button onClick={() => setViewAdmin('monitor')} className="text-xs bg-[#D4E655] text-black px-4 py-2 rounded font-bold uppercase animate-pulse">Ver Caja Abierta</button>}
                </div>
                <div className="flex-1 overflow-y-auto bg-[#09090b] border border-white/10 rounded-xl">
                    <table className="w-full text-left">
                        <thead className="bg-[#111] text-[10px] uppercase text-gray-500 sticky top-0">
                            <tr><th className="p-4">Fecha</th><th className="p-4">Sede/Resp.</th><th className="p-4 text-right">Efectivo</th><th className="p-4 text-right">Digital</th><th className="p-4">Notas</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {historial.map(t => (
                                <tr key={t.id} className="hover:bg-white/5 text-xs">
                                    <td className="p-4 text-gray-400">{format(new Date(t.created_at), 'dd/MM/yyyy HH:mm')}</td>
                                    <td className="p-4"><div className="font-bold text-white">{t.sede?.nombre}</div><div className="text-[10px] text-gray-500 uppercase">{t.usuario?.nombre_completo}</div></td>
                                    <td className="p-4 text-right font-mono font-bold text-[#D4E655]">${t.saldo_final_efectivo?.toLocaleString()}</td>
                                    <td className="p-4 text-right font-mono font-bold text-blue-400">${t.saldo_final_digital?.toLocaleString()}</td>
                                    <td className="p-4 text-gray-500 italic truncate max-w-xs">{t.notas_cierre || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    // VISTA PRINCIPAL (Recepción o Admin Monitoreando)
    if (!turnoActivo) return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <AlertCircle size={48} className="text-gray-600 mb-4" />
            <h2 className="text-2xl font-black text-white mb-2 uppercase">Caja Cerrada</h2>
            <p className="text-gray-500 mb-6 text-sm">No hay un turno activo en este momento.</p>
            <button onClick={() => window.location.reload()} className="px-6 py-3 bg-[#D4E655] text-black font-black rounded-xl uppercase text-xs tracking-widest hover:bg-white transition-all">Refrescar / Abrir</button>
            {role === 'admin' && <button onClick={() => setViewAdmin('historial')} className="mt-4 text-xs text-gray-500 underline uppercase">Ver Historial</button>}
        </div>
    )

    return (
        <div className="flex flex-col h-full bg-[#050505] text-white">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER DE CAJA */}
            <div className="shrink-0 p-4 md:p-8 pb-4 border-b border-white/10 flex flex-col md:flex-row justify-between items-end gap-4 bg-[#050505]">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-[#D4E655] text-xs font-bold uppercase tracking-widest">
                            {role === 'admin' ? 'MONITOREANDO: ' : 'TURNO ACTIVO: '} {turnoActivo.sede?.nombre}
                        </span>
                    </div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-white">Planilla de Caja</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase mt-1">Responsable: {turnoActivo.usuario?.nombre_completo}</p>
                </div>

                {/* BOTONERA (Solo Recepción opera, Admin mira) */}
                {role !== 'admin' && (
                    <div className="flex gap-2">
                        <button onClick={() => setIsGastoOpen(true)} className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white px-4 py-3 rounded-xl font-bold uppercase text-[10px] flex items-center gap-2 transition-all">
                            <ArrowDownCircle size={16} /> Gasto
                        </button>
                        <button onClick={() => setIsCierreOpen(true)} className="bg-[#D4E655] text-black px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-all flex items-center gap-2 shadow-lg">
                            <LogOut size={16} /> Cerrar
                        </button>
                    </div>
                )}
                {role === 'admin' && <button onClick={() => setViewAdmin('historial')} className="text-xs font-bold border border-white/20 px-4 py-2 rounded uppercase hover:bg-white/10">Volver al Historial</button>}
            </div>

            {/* KPI BAR (Resumen tipo Excel arriba) */}
            <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 bg-[#111] border-b border-white/10 p-4 gap-4 text-center">
                <div><p className="text-[9px] text-gray-500 uppercase font-bold">Saldo Inicial</p><p className="text-lg font-bold text-white font-mono">${turnoActivo.saldo_inicial?.toLocaleString()}</p></div>
                <div><p className="text-[9px] text-gray-500 uppercase font-bold">Total Ingresos</p><p className="text-lg font-bold text-green-500 font-mono">+${totales.ingresos.toLocaleString()}</p></div>
                <div><p className="text-[9px] text-gray-500 uppercase font-bold">Total Egresos</p><p className="text-lg font-bold text-red-500 font-mono">-${totales.egresos.toLocaleString()}</p></div>
                <div className="bg-[#222] rounded-lg -my-2 flex flex-col justify-center border border-white/10">
                    <p className="text-[9px] font-black uppercase text-gray-400">Balance Actual</p>
                    <p className="text-xl font-black text-[#D4E655] font-mono">${totales.saldo.toLocaleString()}</p>
                </div>
            </div>

            {/* TABLA SCROLLABLE (Ocupa todo el espacio restante) */}
            <div className="flex-1 overflow-auto bg-[#09090b] relative">
                <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead className="bg-[#1a1a1a] sticky top-0 z-10 text-[9px] font-black uppercase text-gray-400 tracking-wider shadow-sm">
                        <tr>
                            <th className="p-3 border-r border-white/5 w-24">Hora</th>
                            <th className="p-3 border-r border-white/5">Concepto</th>
                            <th className="p-3 border-r border-white/5 text-center w-20">Ref</th>
                            <th className="p-3 border-r border-white/5 text-center w-20">Método</th>
                            <th className="p-3 border-r border-white/5 text-right w-28">Ingreso</th>
                            <th className="p-3 border-r border-white/5 text-right w-28">Egreso</th>
                            <th className="p-3 text-right w-32 bg-white/5 text-white">Saldo</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <tr className="bg-[#D4E655]/5">
                            <td className="p-3 text-gray-400 border-r border-white/5 font-mono text-xs">{format(new Date(turnoActivo.created_at), 'HH:mm')}</td>
                            <td className="p-3 text-[#D4E655] font-black uppercase text-xs border-r border-white/5">Apertura de Caja</td>
                            <td colSpan={2} className="border-r border-white/5"></td>
                            <td className="p-3 text-right border-r border-white/5 text-gray-500 font-mono">-</td>
                            <td className="p-3 text-right border-r border-white/5 text-gray-500 font-mono">-</td>
                            <td className="p-3 text-right font-mono text-white bg-white/5 font-bold">${turnoActivo.saldo_inicial?.toLocaleString()}</td>
                        </tr>
                        {(() => {
                            let acumulado = turnoActivo.saldo_inicial || 0;
                            return movimientos.map((mov, i) => {
                                const montoReal = mov.tipo === 'ingreso' ? Number(mov.monto) : -Number(mov.monto);
                                acumulado += montoReal;
                                return renderFila(mov, i, acumulado);
                            })
                        })()}
                    </tbody>
                </table>
            </div>

            {/* FOOTER TOTALES (Fijo Abajo) */}
            <div className="shrink-0 bg-[#111] border-t border-white/10 p-2 md:p-3 flex justify-between items-center text-xs px-6">
                <div className="flex gap-6">
                    <span className="flex items-center gap-2"><Wallet size={14} className="text-gray-500" /> Efectivo: <b className="text-white">${totales.efectivo.toLocaleString()}</b></span>
                    <span className="flex items-center gap-2"><CreditCard size={14} className="text-blue-500" /> Digital: <b className="text-blue-400">${totales.digital.toLocaleString()}</b></span>
                </div>
                <div className="text-gray-500 uppercase font-bold text-[10px] hidden md:block">Sistema de Gestión Piso 2</div>
            </div>

            {/* MODAL GASTO */}
            {isGastoOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-sm rounded-2xl p-6 shadow-2xl">
                        <h3 className="text-lg font-black text-white uppercase mb-4 flex items-center gap-2"><ArrowDownCircle className="text-red-500" /> Nuevo Egreso</h3>
                        <div className="space-y-3">
                            <input placeholder="Concepto (Ej: Art. Limpieza)" value={gastoForm.concepto} onChange={e => setGastoForm({ ...gastoForm, concepto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-red-500" />
                            <div className="relative"><span className="absolute left-3 top-3 text-gray-500 text-xs">$</span><input type="number" placeholder="0" value={gastoForm.monto} onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg pl-6 pr-3 py-3 text-white text-sm outline-none focus:border-red-500" /></div>
                            <select value={gastoForm.metodo} onChange={e => setGastoForm({ ...gastoForm, metodo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-red-500">
                                <option value="efectivo">Efectivo (Caja Física)</option>
                                <option value="transferencia">Transferencia / Digital</option>
                            </select>
                            <button onClick={handleCargarGasto} className="w-full bg-red-500 text-white font-black uppercase py-3 rounded-xl mt-2 hover:bg-red-600 transition-all text-xs tracking-widest">Confirmar Salida</button>
                            <button onClick={() => setIsGastoOpen(false)} className="w-full py-3 text-gray-500 text-xs font-bold uppercase hover:text-white">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CIERRE */}
            {isCierreOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-2xl p-6 shadow-2xl">
                        <div className="text-center mb-6"><div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-black"><LogOut size={24} /></div><h3 className="text-xl font-black text-white uppercase">Cierre de Turno</h3><p className="text-gray-500 text-xs mt-1">Confirmá los valores finales antes de salir.</p></div>
                        <div className="bg-[#111] p-4 rounded-xl border border-white/5 mb-4 flex justify-between items-center"><span className="text-[10px] font-bold text-gray-500 uppercase">Sistema espera en Efectivo</span><span className="text-lg font-black text-[#D4E655]">${totales.efectivo.toLocaleString()}</span></div>
                        <div className="space-y-4">
                            <div className="space-y-1"><label className="text-[9px] font-bold text-white uppercase">Efectivo Real (Contado)</label><input type="number" autoFocus value={cierreForm.efectivo_real} onChange={e => setCierreForm({ ...cierreForm, efectivo_real: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold text-lg outline-none focus:border-[#D4E655] text-center" placeholder="$0" /></div>
                            <textarea value={cierreForm.notas} onChange={e => setCierreForm({ ...cierreForm, notas: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-xs outline-none focus:border-white h-20 resize-none" placeholder="Observaciones..." />
                            <button onClick={handleCerrarCaja} disabled={!cierreForm.efectivo_real} className="w-full bg-white text-black font-black uppercase py-4 rounded-xl hover:bg-gray-200 transition-all text-xs tracking-widest shadow-lg">Confirmar Cierre</button>
                            <button onClick={() => setIsCierreOpen(false)} className="w-full py-3 text-gray-500 text-xs font-bold uppercase hover:text-white">Volver</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}