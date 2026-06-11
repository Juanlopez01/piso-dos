'use client'
import { Library, ChevronDown, ChevronUp, Calendar, Users, CheckCircle2 } from 'lucide-react'
import type { GrupoClaseLiquidacion, ModalPagoState, ModalAlumnosState } from './_types'

type Props = {
    filtradosClases: GrupoClaseLiquidacion[]
    expandedClase: string | null
    setExpandedClase: (key: string | null) => void
    setModalPago: (v: ModalPagoState) => void
    setModalAlumnos: (v: ModalAlumnosState) => void
}

export default function TabClases({ filtradosClases, expandedClase, setExpandedClase, setModalPago, setModalAlumnos }: Props) {
    if (filtradosClases.length === 0) {
        return (
            <div className="text-center py-20 bg-[#111]/50 rounded-3xl border border-dashed border-white/10">
                <Library className="mx-auto mb-3 text-gray-600" size={32} />
                <p className="text-sm font-bold uppercase text-gray-500">No hay grupos de clase</p>
                <p className="text-xs text-gray-600">No se encontraron clases para el mes seleccionado.</p>
            </div>
        )
    }

    return (
        <>
            {filtradosClases.map((grupo, idx) => {
                const isOpen = expandedClase === grupo.nombre_grupo + grupo.profesor_nombre

                return (
                    <div key={idx} className={`bg-[#09090b] border ${isOpen ? 'border-blue-500/30' : 'border-white/10'} rounded-2xl overflow-hidden transition-all duration-300`}>
                        <button
                            onClick={() => setExpandedClase(isOpen ? null : grupo.nombre_grupo + grupo.profesor_nombre)}
                            className="w-full p-5 flex flex-col md:flex-row justify-between items-start md:items-center bg-[#111]/50 hover:bg-[#111] transition-colors text-left gap-4"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-black text-lg border border-blue-500/20">
                                    <Library size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white uppercase">{grupo.nombre_grupo}</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                        Profe: <span className="text-gray-300">{grupo.profesor_nombre}</span> • {grupo.clases.length} clases
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 w-full md:w-auto border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
                                <div className="text-left md:text-right hidden sm:block">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Inscriptos</p>
                                    <p className="text-sm font-black text-white">{grupo.cant_alumnos_total} Alumnos</p>
                                </div>
                                <div className="text-left md:text-right">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Deuda Activa</p>
                                    <p className={`text-xl font-black ${isOpen ? 'text-[#D4E655]' : 'text-white'}`}>${grupo.total_pago.toLocaleString()}</p>
                                </div>
                                {isOpen ? <ChevronUp className="text-gray-500 shrink-0 hidden md:block" /> : <ChevronDown className="text-gray-500 shrink-0 hidden md:block" />}
                            </div>
                        </button>

                        <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="p-4 md:p-6 border-t border-white/5 bg-[#09090b]">
                                {/* Tabla escritorio */}
                                <div className="hidden md:block overflow-x-auto bg-[#111] rounded-xl border border-white/5">
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
                                            {grupo.clases.map((clase) => {
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
                                                                    onClick={() => setModalPago({ isOpen: true, clase, nombreProfe: grupo.profesor_nombre })}
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
                                </div>

                                {/* Vista mobile */}
                                <div className="md:hidden space-y-2">
                                    {grupo.clases.map((clase) => {
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
                                                                onClick={() => setModalPago({ isOpen: true, clase, nombreProfe: grupo.profesor_nombre })}
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
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </>
    )
}
