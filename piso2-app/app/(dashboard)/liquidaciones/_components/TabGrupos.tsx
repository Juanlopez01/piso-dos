'use client'
import { Loader2, Users, CheckCircle2, DollarSign } from 'lucide-react'
import type { GrupoRaw, ModalLiqGrupoState } from './_types'

type Props = {
    gruposRaw: GrupoRaw[]
    loadingGrupos: boolean
    searchQuery: string
    costoDocTheShow: number
    setCostoDocTheShow: (v: number) => void
    coordFijaLiga: number
    setCoordFijaLiga: (v: number) => void
    valorClaseLiga: number
    setValorClaseLiga: (v: number) => void
    pagandoGrupoId: string | null
    setModalLiqGrupo: (v: ModalLiqGrupoState) => void
}

export default function TabGrupos({
    gruposRaw, loadingGrupos, searchQuery,
    costoDocTheShow, setCostoDocTheShow,
    coordFijaLiga, setCoordFijaLiga,
    valorClaseLiga, setValorClaseLiga,
    pagandoGrupoId, setModalLiqGrupo
}: Props) {
    if (loadingGrupos) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-emerald-400 w-8 h-8" />
            </div>
        )
    }

    if (gruposRaw.length === 0) {
        return (
            <div className="text-center py-20 bg-[#111]/50 rounded-3xl border border-dashed border-white/10">
                <Users className="mx-auto mb-3 text-gray-600" size={32} />
                <p className="text-sm font-bold uppercase text-gray-500">Sin actividad en grupos</p>
                <p className="text-xs text-gray-600">No hubo recaudación ni clases en grupos para este mes.</p>
            </div>
        )
    }

    return (
        <div className="animate-in fade-in space-y-4">
            {gruposRaw
                .filter(g => g.nombre.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(grupo => {
                    const nombreLow = grupo.nombre.toLowerCase()
                    let destinatario = 'Piso 2', montoPagar = 0, glosa = 'Sin regla definida.', tipo = 'general'

                    if (nombreLow.includes('ballroom')) {
                        destinatario = 'Evelyn Nowak'
                        montoPagar = grupo.totalRecaudado * 0.60
                        glosa = `60% del pozo (Valor Efectivo) de $${grupo.totalRecaudado.toLocaleString()} para Evelyn Nowak.`
                        tipo = 'porcentaje'
                    } else if (nombreLow.includes('c.i.a') || nombreLow.includes('cia')) {
                        destinatario = 'Alexis Mirinda'
                        montoPagar = grupo.totalRecaudado * 0.60
                        glosa = `60% del pozo (Valor Efectivo) de $${grupo.totalRecaudado.toLocaleString()} para Alexis Mirinda.`
                        tipo = 'porcentaje'
                    } else if (nombreLow.includes('joven ballet')) {
                        destinatario = 'Franco y Eugenia'
                        montoPagar = grupo.totalRecaudado * 0.60
                        glosa = `60% del pozo (Valor Efectivo) de $${grupo.totalRecaudado.toLocaleString()} para Franco y Eugenia.`
                        tipo = 'porcentaje'
                    } else if (nombreLow.includes('the show')) {
                        const saldo = grupo.totalRecaudado - costoDocTheShow
                        montoPagar = saldo > 0 ? saldo * 0.50 : 0
                        destinatario = 'Chiara'
                        glosa = `Pozo efectivo $${grupo.totalRecaudado.toLocaleString()} − Docentes $${costoDocTheShow.toLocaleString()} = $${Math.max(0, saldo).toLocaleString()} → 50% para Chiara.`
                        tipo = 'the_show'
                    } else if (nombreLow.includes('liga')) {
                        const costoDoc = grupo.cantClases * valorClaseLiga
                        montoPagar = costoDoc + coordFijaLiga
                        destinatario = 'Coordinación + Docentes Liga'
                        glosa = `${grupo.cantClases} clases × $${valorClaseLiga.toLocaleString()} + coord fija $${coordFijaLiga.toLocaleString()} = $${montoPagar.toLocaleString()}.`
                        tipo = 'liga'
                    }

                    return (
                        <div key={grupo.id} className={`bg-[#09090b] border ${grupo.yaLiquidado ? 'border-emerald-500/20' : 'border-white/10'} rounded-2xl p-5`}>
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-3">
                                        <h3 className="text-lg font-black text-white uppercase">{grupo.nombre}</h3>
                                        {grupo.yaLiquidado && (
                                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-black flex items-center gap-1">
                                                <CheckCircle2 size={10} /> Liquidado
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3 text-xs">
                                        <div>
                                            <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Recaudado</p>
                                            <p className="font-black text-white">${grupo.totalRecaudado.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Para</p>
                                            <p className="font-black text-emerald-400">{destinatario}</p>
                                        </div>
                                        {tipo === 'liga' && (
                                            <div>
                                                <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Clases</p>
                                                <p className="font-black text-white">{grupo.cantClases}</p>
                                            </div>
                                        )}
                                    </div>

                                    <p className="text-[10px] text-gray-500 leading-relaxed mb-3">{glosa}</p>

                                    {tipo === 'the_show' && (
                                        <div className="flex items-center gap-3 bg-[#111] p-2 rounded-lg border border-white/5 w-fit">
                                            <label className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Costo Docentes:</label>
                                            <span className="text-gray-500 text-xs">$</span>
                                            <input
                                                type="number"
                                                value={costoDocTheShow}
                                                onChange={e => setCostoDocTheShow(Number(e.target.value))}
                                                className="bg-black border border-white/10 text-white rounded-lg px-2 py-1 font-black w-24 outline-none focus:border-emerald-500 text-xs"
                                            />
                                        </div>
                                    )}

                                    {tipo === 'liga' && (
                                        <div className="flex flex-wrap gap-3 bg-[#111] p-2 rounded-lg border border-white/5">
                                            <div className="flex items-center gap-2">
                                                <label className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Coord ($):</label>
                                                <input
                                                    type="number"
                                                    value={coordFijaLiga}
                                                    onChange={e => setCoordFijaLiga(Number(e.target.value))}
                                                    className="bg-black border border-white/10 text-white rounded-lg px-2 py-1 font-black w-24 outline-none focus:border-emerald-500 text-xs"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">$/Clase:</label>
                                                <input
                                                    type="number"
                                                    value={valorClaseLiga}
                                                    onChange={e => setValorClaseLiga(Number(e.target.value))}
                                                    className="bg-black border border-white/10 text-white rounded-lg px-2 py-1 font-black w-20 outline-none focus:border-emerald-500 text-xs"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col items-start md:items-end gap-3 shrink-0 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                                    <div className="md:text-right">
                                        <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">A Pagar</p>
                                        <p className="text-2xl font-black text-emerald-400">${montoPagar.toLocaleString()}</p>
                                    </div>

                                    {grupo.yaLiquidado ? (
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-not-allowed">
                                            <CheckCircle2 size={12} /> En Caja
                                        </div>
                                    ) : montoPagar > 0 ? (
                                        <button
                                            onClick={() => setModalLiqGrupo({ isOpen: true, grupo, montoPagar, destinatario })}
                                            disabled={!!pagandoGrupoId}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase py-2.5 px-5 rounded-xl text-[10px] tracking-widest transition-all flex items-center gap-2 shadow-lg"
                                        >
                                            <DollarSign size={14} /> Registrar Pago
                                        </button>
                                    ) : (
                                        <span className="text-[9px] text-gray-500 font-bold uppercase">Sin monto</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
        </div>
    )
}
