'use client'
import { Users, ChevronDown, ChevronUp, Calendar, CheckCircle2 } from 'lucide-react'
import type { ProfeLiquidacion, ClaseLiquidacion, ModalPagoState, ModalAlumnosState, ModalPagoMasivoState } from './_types'

type Props = {
    filtradosProfes: ProfeLiquidacion[]
    expandedProf: string | null
    setExpandedProf: (id: string | null) => void
    setModalPago: (v: ModalPagoState) => void
    setModalPagoMasivo: (v: ModalPagoMasivoState) => void
    setModalAlumnos: (v: ModalAlumnosState) => void
}

export default function TabDocentes({ filtradosProfes, expandedProf, setExpandedProf, setModalPago, setModalPagoMasivo, setModalAlumnos }: Props) {
    if (filtradosProfes.length === 0) {
        return (
            <div className="text-center py-20 bg-[#111]/50 rounded-3xl border border-dashed border-white/10">
                <Users className="mx-auto mb-3 text-gray-600" size={32} />
                <p className="text-sm font-bold uppercase text-gray-500">No hay liquidaciones</p>
                <p className="text-xs text-gray-600">No se encontraron profesores para el mes seleccionado.</p>
            </div>
        )
    }

    return (
        <>
            {filtradosProfes.map((profe) => {
                const isOpen = expandedProf === profe.id

                const clasesAgrupadas = profe.clases.reduce((acc: Record<string, ClaseLiquidacion[]>, clase) => {
                    const key = clase.nombre
                    if (!acc[key]) acc[key] = []
                    acc[key].push(clase)
                    return acc
                }, {})

                return (
                    <div key={profe.id} className={`bg-[#09090b] border ${isOpen ? 'border-[#D4E655]/30' : 'border-white/10'} rounded-2xl overflow-hidden transition-all duration-300`}>
                        <button
                            onClick={() => setExpandedProf(isOpen ? null : profe.id)}
                            className="w-full p-5 flex flex-col md:flex-row justify-between items-start md:items-center bg-[#111]/50 hover:bg-[#111] transition-colors text-left gap-4"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white font-black text-lg border border-white/10">{profe.nombre[0]}</div>
                                <div>
                                    <h3 className="text-lg font-black text-white uppercase">{profe.nombre}</h3>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{profe.clases.length} clases dictadas</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 w-full md:w-auto border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
                                <div className="text-left md:text-right">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">A Liquidar</p>
                                    <p className={`text-xl font-black ${isOpen ? 'text-[#D4E655]' : 'text-white'}`}>${profe.total_pago.toLocaleString()}</p>
                                </div>
                                {isOpen ? <ChevronUp className="text-gray-500 shrink-0 hidden md:block" /> : <ChevronDown className="text-gray-500 shrink-0 hidden md:block" />}
                            </div>
                        </button>

                        <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="p-4 md:p-6 border-t border-white/5 bg-[#09090b]">
                                {Object.entries(clasesAgrupadas).map(([nombreGrupo, clasesList], index) => {
                                    const clasesPendientes = clasesList.filter(c => !c.pagado_profe)
                                    const subtotalPendiente = clasesPendientes.reduce((acc, c) => acc + c.pago_profe, 0)

                                    return (
                                        <div key={index} className="mb-8 last:mb-0">
                                            <h4 className="text-white font-black uppercase tracking-widest border-b border-white/10 pb-2 mb-4 text-sm flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#D4E655]"></span>
                                                {nombreGrupo}
                                            </h4>

                                            {/* Tabla escritorio */}
                                            <div className="hidden md:block overflow-hidden bg-[#111] rounded-xl border border-white/5">
                                                <table className="w-full text-left border-collapse table-fixed">
                                                    <thead>
                                                        <tr className="text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10 bg-white/5">
                                                            <th className="py-3 pl-4 w-[20%]">Fecha</th>
                                                            <th className="py-3 text-center w-[15%]">Acuerdo</th>
                                                            <th className="py-3 text-center w-[15%]">Inscriptos</th>
                                                            <th className="py-3 text-right w-[15%]">Recaudado</th>
                                                            <th className="py-3 text-right text-[#D4E655] w-[15%]">A Pagar</th>
                                                            <th className="py-3 text-center w-[20%] pr-4">Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/5 text-xs">
                                                        {clasesList.map((clase) => {
                                                            const [fechaParte, horaParte] = clase.inicio.split('T')
                                                            const [, m, d] = fechaParte.split('-')
                                                            const hora = horaParte ? horaParte.substring(0, 5) : '--:--'
                                                            return (
                                                                <tr key={clase.id} className="hover:bg-white/5 transition-colors group">
                                                                    <td className="py-3 pl-4 text-white font-bold">{d}/{m} <span className="text-gray-500 ml-1">{hora}</span></td>
                                                                    <td className="py-3 text-center text-gray-500 font-bold">{clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : `$${clase.valor_acuerdo}`}</td>
                                                                    <td className="py-3 text-center">
                                                                        <button
                                                                            onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/${m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
                                                                            className="bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors px-3 py-1 rounded flex items-center justify-center gap-1.5 w-fit mx-auto cursor-pointer"
                                                                        >
                                                                            <Users size={12} /> {clase.cant_alumnos}
                                                                        </button>
                                                                    </td>
                                                                    <td className="py-3 text-right text-gray-400">${clase.total_clase.toLocaleString()}</td>
                                                                    <td className="py-3 text-right font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</td>
                                                                    <td className="py-3 text-center pr-4">
                                                                        {clase.pagado_profe ? (
                                                                            <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-1 rounded text-[9px] font-black flex items-center justify-center gap-1 mx-auto cursor-not-allowed w-full max-w-[100px]">
                                                                                <CheckCircle2 size={12} /> OK
                                                                            </span>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => setModalPago({ isOpen: true, clase, nombreProfe: profe.nombre })}
                                                                                className="bg-[#D4E655]/10 hover:bg-[#D4E655] text-[#D4E655] hover:text-black border border-[#D4E655]/30 px-3 py-1 rounded text-[9px] font-black transition-colors mx-auto block w-full max-w-[100px]"
                                                                            >
                                                                                PAGAR
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>

                                                {subtotalPendiente > 0 ? (
                                                    <div className="bg-[#1a1a15] p-4 flex justify-between items-center border-t border-[#D4E655]/20">
                                                        <div>
                                                            <p className="text-[10px] text-[#D4E655] uppercase font-bold tracking-widest mb-1">Subtotal Pendiente de este bloque</p>
                                                            <p className="text-xl font-black text-white">${subtotalPendiente.toLocaleString()}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => setModalPagoMasivo({ isOpen: true, clases: clasesPendientes, nombreGrupo, nombreProfe: profe.nombre, total: subtotalPendiente })}
                                                            className="bg-[#D4E655] hover:bg-white text-black px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(212,230,85,0.2)]"
                                                        >
                                                            Liquidar Bloque Completo
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="bg-white/5 p-4 text-center border-t border-white/5">
                                                        <p className="text-xs text-gray-500 font-bold uppercase flex items-center justify-center gap-2">
                                                            <CheckCircle2 size={14} className="text-green-500" />
                                                            Todas las clases de este bloque están pagadas
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Vista mobile */}
                                            <div className="md:hidden space-y-2">
                                                {clasesList.map((clase) => {
                                                    const [fechaParte, horaParte] = clase.inicio.split('T')
                                                    const [, m, d] = fechaParte.split('-')
                                                    const hora = horaParte ? horaParte.substring(0, 5) : '--:--'
                                                    return (
                                                        <div key={clase.id} className="bg-[#111] p-3 rounded-xl border border-white/5">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="bg-white/5 p-1.5 rounded"><Calendar size={14} className="text-gray-400" /></div>
                                                                    <p className="text-white font-bold text-sm">{d}/{m} <span className="text-gray-500 text-xs">- {hora}hs</span></p>
                                                                </div>
                                                                <button
                                                                    onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/${m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
                                                                    className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                                                                >
                                                                    <Users size={10} /> {clase.cant_alumnos} pax
                                                                </button>
                                                            </div>
                                                            <div className="flex justify-between items-end pt-2 border-t border-white/5 mt-2">
                                                                <div>
                                                                    <p className="text-[8px] text-gray-500 uppercase font-bold">Acuerdo: {clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : `Fijo`}</p>
                                                                    <p className="text-[9px] text-gray-400 mt-0.5">Recaudado: ${clase.total_clase.toLocaleString()}</p>
                                                                </div>
                                                                <div className="text-right flex flex-col items-end gap-2">
                                                                    <div>
                                                                        <p className="text-[8px] text-[#D4E655]/70 uppercase font-bold">A Pagar</p>
                                                                        <p className="text-sm font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</p>
                                                                    </div>
                                                                    {clase.pagado_profe ? (
                                                                        <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded text-[8px] font-black flex items-center justify-center gap-1 cursor-not-allowed">
                                                                            <CheckCircle2 size={10} /> PAGADO
                                                                        </span>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => setModalPago({ isOpen: true, clase, nombreProfe: profe.nombre })}
                                                                            className="bg-[#D4E655]/10 hover:bg-[#D4E655] text-[#D4E655] hover:text-black border border-[#D4E655]/30 px-3 py-1 rounded text-[9px] font-black transition-colors"
                                                                        >
                                                                            PAGAR
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}

                                                {subtotalPendiente > 0 && (
                                                    <div className="bg-[#1a1a15] p-4 mt-4 rounded-xl border border-[#D4E655]/30">
                                                        <p className="text-[10px] text-[#D4E655] uppercase font-bold tracking-widest text-center mb-1">Subtotal Pendiente</p>
                                                        <p className="text-2xl font-black text-white text-center mb-3">${subtotalPendiente.toLocaleString()}</p>
                                                        <button
                                                            onClick={() => setModalPagoMasivo({ isOpen: true, clases: clasesPendientes, nombreGrupo, nombreProfe: profe.nombre, total: subtotalPendiente })}
                                                            className="w-full bg-[#D4E655] hover:bg-white text-black py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            Liquidar Bloque
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )
            })}
        </>
    )
}
