'use client'
import { useState } from 'react'
import { Clock, Loader2, CheckCircle2, Save, RotateCcw, CalendarClock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { ModalPagoStaffState } from './_types'
import { getTurnosRecepMesAction, editarHorarioTurnoAction, cerrarTurnoRecepAction } from '@/app/actions/caja'

type ReporteRecepcion = {
    id: string
    nombre: string
    horas: number
    cantidad_turnos: number
    total_pagado: number
    horasCalculadas?: number
    ajustado?: boolean
    abiertos?: number
}

type Props = {
    reporteRecepcion: ReporteRecepcion[] | undefined
    valorHoraRecep: number
    setValorHoraRecep: (v: number) => void
    handleGuardarValorHora: () => void
    guardandoValor: boolean
    setModalPagoStaff: (v: ModalPagoStaffState) => void
    onGuardarHoras: (recepId: string, horas: number) => void
    onRevertirHoras: (recepId: string) => void
    selectedMonth: string
    onCambio: () => void
}

// datetime-local <-> ISO (en hora local del navegador)
const isoToLocal = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const off = d.getTimezoneOffset()
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}
const localToIso = (local: string) => local ? new Date(local).toISOString() : ''
const fmtHs = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

export default function TabRecepcion({ reporteRecepcion, valorHoraRecep, setValorHoraRecep, handleGuardarValorHora, guardandoValor, setModalPagoStaff, onGuardarHoras, onRevertirHoras, selectedMonth, onCambio }: Props) {
    const [horasEdit, setHorasEdit] = useState<Record<string, string>>({})

    // Editor de turnos por recep
    const [editRecep, setEditRecep] = useState<{ id: string; nombre: string } | null>(null)
    const [turnos, setTurnos] = useState<any[]>([])
    const [loadingT, setLoadingT] = useState(false)
    const abrirEditor = async (recep: { id: string; nombre: string }) => {
        setEditRecep(recep); setTurnos([]); setLoadingT(true)
        const [yyyy, mm] = selectedMonth.split('-')
        const r = await getTurnosRecepMesAction(Number(yyyy), Number(mm), recep.id)
        if ((r as any).success) setTurnos((r as any).turnos); else toast.error((r as any).error || 'Error')
        setLoadingT(false)
    }
    const recargarTurnos = async () => { if (editRecep) await abrirEditor(editRecep); onCambio() }
    const editarHorario = async (turnoId: string, tipo: 'apertura' | 'cierre', local: string) => {
        if (!local) return
        const r = await editarHorarioTurnoAction(turnoId, tipo, localToIso(local))
        if ((r as any).success) { toast.success('Horario actualizado'); recargarTurnos() } else toast.error((r as any).error || 'Error')
    }
    const cerrarTurno = async (turnoId: string, aperturaISO: string) => {
        // Cierre por defecto: ahora (o apertura si ya pasó). El admin puede ajustar después.
        const cierre = new Date().toISOString()
        const r = await cerrarTurnoRecepAction(turnoId, cierre > aperturaISO ? cierre : aperturaISO)
        if ((r as any).success) { toast.success('Turno cerrado'); recargarTurnos() } else toast.error((r as any).error || 'Error')
    }

    return (
        <div className="animate-in fade-in space-y-6">
            <div className="bg-[#09090b] border border-white/10 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                        <Clock className="text-[#D4E655]" />
                        Liquidación de Staff
                    </h3>
                    <p className="text-xs text-gray-400 mt-1 font-medium">Horas según apertura/cierre de caja (incluye turnos abiertos, topeados a 12 hs). Editá los turnos para que coincidan con la realidad.</p>
                </div>
                <div className="bg-[#111] border border-white/5 p-2 rounded-xl flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest sm:pl-2">Valor por Hora:</label>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:flex-none">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                            <input
                                type="number"
                                value={valorHoraRecep}
                                onChange={(e) => setValorHoraRecep(Number(e.target.value))}
                                className="w-full sm:w-32 bg-black border border-white/10 rounded-lg py-2 pl-7 pr-3 text-white text-sm font-black outline-none focus:border-[#D4E655] transition-colors"
                            />
                        </div>
                        <button
                            onClick={handleGuardarValorHora}
                            disabled={guardandoValor}
                            className="bg-[#D4E655] hover:bg-white text-black p-2 rounded-lg transition-colors"
                            title="Guardar valor para todo el staff"
                        >
                            {guardandoValor ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {!reporteRecepcion?.length ? (
                    <div className="col-span-full text-center py-12 bg-[#111]/50 rounded-2xl border border-dashed border-white/10">
                        <p className="text-xs font-bold uppercase text-gray-500">No hay turnos registrados este mes</p>
                    </div>
                ) : (
                    reporteRecepcion.map((recep) => {
                        const horasEfectivas = horasEdit[recep.id] !== undefined && horasEdit[recep.id] !== '' ? Number(horasEdit[recep.id]) : recep.horas
                        const aPagarTotal = (isNaN(horasEfectivas) ? 0 : horasEfectivas) * valorHoraRecep
                        const saldoPendiente = Math.max(0, aPagarTotal - recep.total_pagado)
                        const calc = recep.horasCalculadas ?? recep.horas

                        return (
                            <div key={recep.id} className="bg-[#111] border border-white/5 p-5 rounded-2xl hover:border-white/20 transition-all flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400 font-black shrink-0">
                                            {recep.nombre[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-white text-sm truncate flex items-center gap-2">{recep.nombre} {recep.ajustado && <span className="text-[8px] bg-[#D4E655] text-black px-1.5 py-0.5 rounded font-black uppercase tracking-widest shrink-0">Ajustado</span>}</h4>
                                            <p className="text-[10px] text-gray-500 uppercase font-bold">{recep.cantidad_turnos} turnos · {calc.toFixed(2)} hs (auto)</p>
                                        </div>
                                    </div>

                                    {(recep.abiertos ?? 0) > 0 && (
                                        <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-[10px] text-amber-400 flex items-center gap-1.5 font-semibold">
                                            <AlertTriangle size={13} /> {recep.abiertos} turno{recep.abiertos === 1 ? '' : 's'} sin cerrar (topeado a 12 hs). Revisalos.
                                        </div>
                                    )}

                                    <button onClick={() => abrirEditor({ id: recep.id, nombre: recep.nombre })} className="w-full mb-4 flex items-center justify-center gap-2 bg-[#0e0e10] border border-white/10 text-gray-300 hover:text-white hover:border-white/30 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors">
                                        <CalendarClock size={13} /> Ver / editar turnos del mes
                                    </button>

                                    {/* HORAS A PAGAR — editable, sin ir turno por turno */}
                                    <div className="bg-black/30 border border-white/5 rounded-xl p-3 mb-4">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Horas a pagar</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                step="0.25"
                                                value={horasEdit[recep.id] !== undefined ? horasEdit[recep.id] : recep.horas.toFixed(2)}
                                                onChange={e => setHorasEdit(prev => ({ ...prev, [recep.id]: e.target.value }))}
                                                className="flex-1 bg-black border border-white/10 rounded-lg py-2 px-3 text-white text-sm font-black outline-none focus:border-[#D4E655]"
                                            />
                                            <button onClick={() => onGuardarHoras(recep.id, Number(horasEdit[recep.id] !== undefined ? horasEdit[recep.id] : recep.horas))} className="bg-[#D4E655] hover:bg-white text-black p-2 rounded-lg transition-colors" title="Guardar horas"><Save size={16} /></button>
                                            {recep.ajustado && <button onClick={() => { setHorasEdit(prev => { const n = { ...prev }; delete n[recep.id]; return n }); onRevertirHoras(recep.id) }} className="bg-white/5 hover:bg-white/10 text-gray-400 p-2 rounded-lg transition-colors" title="Volver al cálculo automático de los turnos"><RotateCcw size={16} /></button>}
                                        </div>
                                    </div>

                                    <div className="border-t border-white/5 pt-4 space-y-2 mb-4">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500 font-bold uppercase tracking-wider">Total Generado</span>
                                            <span className="text-white font-black">${aPagarTotal.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500 font-bold uppercase tracking-wider">Ya Pagado</span>
                                            <span className="text-gray-400 font-black">-${recep.total_pagado.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
                                    <div className="flex justify-between items-end">
                                        <p className="text-[10px] text-[#D4E655]/70 uppercase font-bold tracking-widest">Saldo Pendiente</p>
                                        <p className="text-2xl font-black text-[#D4E655]">${saldoPendiente.toLocaleString()}</p>
                                    </div>

                                    {saldoPendiente > 0 ? (
                                        <button
                                            onClick={() => setModalPagoStaff({ isOpen: true, staff: recep, monto: saldoPendiente })}
                                            className="w-full bg-[#D4E655]/10 hover:bg-[#D4E655] text-[#D4E655] hover:text-black font-black uppercase py-2.5 rounded-xl transition-all text-[10px] tracking-widest border border-[#D4E655]/30"
                                        >
                                            Registrar Pago
                                        </button>
                                    ) : (
                                        <div className="w-full bg-green-500/10 border border-green-500/20 text-green-500 font-black uppercase py-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] tracking-widest cursor-not-allowed">
                                            <CheckCircle2 size={14} /> Todo Pagado
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Editor de turnos del mes (admin) */}
            {editRecep && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setEditRecep(null)}>
                    <div className="bg-[#09090b] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                            <div><p className="font-black uppercase tracking-tight flex items-center gap-2"><CalendarClock size={18} className="text-[#D4E655]" /> Turnos de {editRecep.nombre}</p><p className="text-[11px] text-gray-500">Editá apertura/cierre reales o cerrá los abiertos. Es lo que se paga.</p></div>
                            <button onClick={() => setEditRecep(null)} className="p-2 bg-white/5 rounded-full text-gray-300 text-xs font-bold px-3">Cerrar</button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-2">
                            {loadingT ? (
                                <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                            ) : turnos.length === 0 ? (
                                <p className="text-xs text-gray-500 text-center py-8">Sin turnos este mes.</p>
                            ) : turnos.map(t => (
                                <div key={t.id} className={`rounded-xl border p-3 ${t.abierto ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[#0e0e10] border-white/10'}`}>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="text-[11px] text-gray-400 font-semibold">{new Date(t.fecha_apertura).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })}{t.sede ? ` · ${t.sede}` : ''}</span>
                                        <span className={`text-[11px] font-black ${t.abierto ? 'text-amber-400' : 'text-[#D4E655]'}`}>{fmtHs(t.horas)} hs {t.topeado && <span className="text-[9px] text-amber-400">(tope)</span>}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[9px] uppercase tracking-widest text-gray-500 font-bold block mb-1">Entrada</label>
                                            <input type="datetime-local" defaultValue={isoToLocal(t.fecha_apertura)} onBlur={e => { if (e.target.value !== isoToLocal(t.fecha_apertura)) editarHorario(t.id, 'apertura', e.target.value) }} className="w-full bg-[#111] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-[#D4E655]" />
                                        </div>
                                        <div>
                                            <label className="text-[9px] uppercase tracking-widest text-gray-500 font-bold block mb-1">Salida</label>
                                            {t.abierto ? (
                                                <button onClick={() => cerrarTurno(t.id, t.fecha_apertura)} className="w-full bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide hover:bg-amber-500 hover:text-black transition-colors">Cerrar ahora</button>
                                            ) : (
                                                <input type="datetime-local" defaultValue={isoToLocal(t.fecha_cierre)} onBlur={e => { if (e.target.value && e.target.value !== isoToLocal(t.fecha_cierre)) editarHorario(t.id, 'cierre', e.target.value) }} className="w-full bg-[#111] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-[#D4E655]" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {turnos.length > 0 && (
                                <div className="flex items-center justify-between pt-2 px-1 border-t border-white/5 mt-2">
                                    <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Total del mes</span>
                                    <span className="font-black text-[#D4E655]">{fmtHs(turnos.reduce((a, t) => a + t.horas, 0))} hs</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
