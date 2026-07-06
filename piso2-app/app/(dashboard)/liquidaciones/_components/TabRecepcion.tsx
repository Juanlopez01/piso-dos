'use client'
import { useState } from 'react'
import { Clock, Loader2, CheckCircle2, Save, RotateCcw } from 'lucide-react'
import type { ModalPagoStaffState } from './_types'

type ReporteRecepcion = {
    id: string
    nombre: string
    horas: number
    cantidad_turnos: number
    total_pagado: number
    horasCalculadas?: number
    ajustado?: boolean
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
}

export default function TabRecepcion({ reporteRecepcion, valorHoraRecep, setValorHoraRecep, handleGuardarValorHora, guardandoValor, setModalPagoStaff, onGuardarHoras, onRevertirHoras }: Props) {
    const [horasEdit, setHorasEdit] = useState<Record<string, string>>({})
    return (
        <div className="animate-in fade-in space-y-6">
            <div className="bg-[#09090b] border border-white/10 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                        <Clock className="text-[#D4E655]" />
                        Liquidación de Staff
                    </h3>
                    <p className="text-xs text-gray-400 mt-1 font-medium">Horas calculadas según las aperturas y cierres de caja del mes.</p>
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
        </div>
    )
}
