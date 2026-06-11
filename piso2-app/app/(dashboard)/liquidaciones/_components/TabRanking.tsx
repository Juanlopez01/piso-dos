'use client'
import { Trophy, User, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import type { ClaseRanking } from './_types'

type Props = {
    clasesRankeadas: ClaseRanking[]
    rankingCategoria: 'regular' | 'especial' | 'grupo'
    setRankingCategoria: (v: 'regular' | 'especial' | 'grupo') => void
    rankingOrden: 'alumnos' | 'recaudacion'
    setRankingOrden: (v: 'alumnos' | 'recaudacion') => void
}

export default function TabRanking({ clasesRankeadas, rankingCategoria, setRankingCategoria, rankingOrden, setRankingOrden }: Props) {
    return (
        <div className="animate-in fade-in">
            <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 mb-6 bg-[#09090b] border border-white/10 p-4 rounded-2xl">
                <div className="flex bg-[#111] p-1 rounded-xl w-full lg:w-auto overflow-x-auto custom-scrollbar">
                    <button onClick={() => setRankingCategoria('regular')} className={`flex-1 md:flex-none md:px-6 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingCategoria === 'regular' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}>Regulares</button>
                    <button onClick={() => setRankingCategoria('especial')} className={`flex-1 md:flex-none md:px-6 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingCategoria === 'especial' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:text-white'}`}>Especiales</button>
                    <button onClick={() => setRankingCategoria('grupo')} className={`flex-1 md:flex-none md:px-6 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingCategoria === 'grupo' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-white'}`}>Grupos</button>
                </div>

                <div className="flex items-center gap-2 bg-[#111] p-1 rounded-xl w-full lg:w-auto shrink-0 overflow-x-auto custom-scrollbar">
                    <span className="text-[10px] font-bold text-gray-500 uppercase px-2 shrink-0">Ordenar por:</span>
                    <button onClick={() => setRankingOrden('alumnos')} className={`flex-1 md:flex-none px-4 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingOrden === 'alumnos' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-white'}`}>Alumnos</button>
                    <button onClick={() => setRankingOrden('recaudacion')} className={`flex-1 md:flex-none px-4 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingOrden === 'recaudacion' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-white'}`}>Recaudación</button>
                </div>
            </div>

            <div className="space-y-3">
                {clasesRankeadas.length === 0 ? (
                    <div className="text-center py-16 bg-[#111]/50 rounded-2xl border border-dashed border-white/10">
                        <Trophy className="mx-auto mb-3 text-gray-600" size={32} />
                        <p className="text-xs font-bold uppercase text-gray-500">No hay clases en esta categoría</p>
                    </div>
                ) : (
                    clasesRankeadas.map((c, idx) => (
                        <div key={c.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-5 rounded-2xl border transition-all ${c.cant_alumnos <= 5 ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-[#111] border-white/5 hover:border-white/20'}`}>
                            <div className="flex items-center gap-4 mb-4 sm:mb-0">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-gray-300 text-black' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/10 text-gray-400'}`}>
                                    {idx + 1}
                                </div>
                                <div>
                                    <h4 className="font-bold text-white uppercase text-sm">{c.nombre}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-gray-500 font-bold uppercase"><User size={10} className="inline mr-1" />{c.profesor_nombre}</span>
                                        <span className="text-[10px] text-gray-500 font-bold uppercase"><Calendar size={10} className="inline mr-1" />{format(new Date(c.inicio), "dd/MM")}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 sm:text-right border-t sm:border-t-0 border-white/5 pt-4 sm:pt-0">
                                <div className="flex-1 sm:flex-none">
                                    <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Alumnos</p>
                                    <p className={`text-xl font-black ${c.cant_alumnos <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                                        {c.cant_alumnos}
                                    </p>
                                </div>
                                <div className="flex-1 sm:flex-none">
                                    <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Recaudado</p>
                                    <p className="text-xl font-black text-[#D4E655]">
                                        ${c.total_recaudado.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
