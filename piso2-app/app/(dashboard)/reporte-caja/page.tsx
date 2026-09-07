'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Download, Wallet, RotateCcw } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { useCash } from '@/context/CashContext'
import { getReporteMensualCajaAction, setOverrideCajaAction } from '@/app/actions/caja'

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
const hoyMes = () => { const d = new Date(Date.now() - 3 * 3600_000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

type Dia = {
    dia: number; ie: number; it: number; ee: number; et: number; neto: number
    auto: { ie: number; it: number; ee: number; et: number }
    editado: { ie: boolean; it: boolean; ee: boolean; et: boolean }
}
type Celda = 'ie' | 'it' | 'ee' | 'et'
const CELDA_MAP: Record<Celda, { tipo: 'ingreso' | 'egreso'; metodo: 'efectivo' | 'transferencia' }> = {
    ie: { tipo: 'ingreso', metodo: 'efectivo' }, it: { tipo: 'ingreso', metodo: 'transferencia' },
    ee: { tipo: 'egreso', metodo: 'efectivo' }, et: { tipo: 'egreso', metodo: 'transferencia' },
}

export default function ReporteCajaPage() {
    const { userRole, isLoading } = useCash()
    const [mesSel, setMesSel] = useState(hoyMes())
    const [dias, setDias] = useState<Dia[]>([])
    const [totales, setTotales] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    const [anio, mes] = mesSel.split('-').map(Number)

    const cargar = async () => {
        setLoading(true)
        const r = await getReporteMensualCajaAction(anio, mes)
        if (r.success) { setDias(r.dias as Dia[]); setTotales(r.totales) }
        else toast.error((r as any).error || 'Error')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [mesSel])

    const guardarCelda = async (dia: Dia, celda: Celda, valorStr: string) => {
        const { tipo, metodo } = CELDA_MAP[celda]
        const autoVal = dia.auto[celda]
        const num = valorStr.trim() === '' ? null : Number(valorStr)
        // Si coincide con el automático, borramos el override (vuelve a lo calculado).
        const monto = (num === null || num === autoVal) ? null : num
        const r = await setOverrideCajaAction(anio, mes, dia.dia, tipo, metodo, monto)
        if (r.success) cargar(); else toast.error((r as any).error || 'Error')
    }

    const descargarCSV = () => {
        const head = ['Día', 'Ingreso efectivo', 'Ingreso transferencia', 'Egreso efectivo', 'Egreso transferencia', 'Neto']
        const rows = dias.map(d => [d.dia, d.ie, d.it, d.ee, d.et, d.neto])
        rows.push(['TOTAL', totales.ie, totales.it, totales.ee, totales.et, totales.neto])
        const csv = [head, ...rows].map(r => r.map(c => `"${String(c ?? '')}"`).join(',')).join('\r\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `reporte-caja-${mesSel}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    if (!isLoading && userRole !== 'admin') return (
        <div className="min-h-[50vh] flex items-center justify-center text-gray-500 text-sm">Solo para administradores.</div>
    )

    const dc = 'w-full bg-black border border-white/10 rounded-lg py-1.5 px-2 text-xs font-bold outline-none focus:border-[#D4E655]'

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2"><Wallet className="text-[#D4E655]" size={26} /> Reporte de Caja</h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Mensual · por día · editable</p>
                </div>
                <div className="flex gap-2">
                    <input type="month" value={mesSel} onChange={e => setMesSel(e.target.value)} className="bg-[#111] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#D4E655]" />
                    <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
                    <button onClick={descargarCSV} disabled={!dias.length} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white disabled:opacity-40" title="Descargar CSV"><Download size={16} /></button>
                </div>
            </div>

            <p className="text-[11px] text-gray-500 mb-4">Se calcula solo de los movimientos de caja del mes (se actualiza día a día). Tocá una celda para <b className="text-gray-300">corregir el valor a mano</b>: lo que cargues manda; borralo (vacío) para volver al automático. Las celdas corregidas quedan en <span className="text-[#D4E655]">verde</span>.</p>

            {loading || !totales ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead>
                            <tr className="bg-[#111] text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                                <th className="p-3 text-left">Día</th>
                                <th className="p-3 text-right text-emerald-400/80">Ing. Efectivo</th>
                                <th className="p-3 text-right text-emerald-400/80">Ing. Transf.</th>
                                <th className="p-3 text-right text-red-400/80">Egr. Efectivo</th>
                                <th className="p-3 text-right text-red-400/80">Egr. Transf.</th>
                                <th className="p-3 text-right">Neto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dias.map(d => {
                                const vacio = !d.ie && !d.it && !d.ee && !d.et
                                return (
                                    <tr key={d.dia} className={`border-t border-white/5 ${vacio ? 'opacity-50' : ''}`}>
                                        <td className="p-2 pl-3 font-bold text-gray-400">{String(d.dia).padStart(2, '0')}</td>
                                        {(['ie', 'it', 'ee', 'et'] as Celda[]).map(c => (
                                            <td key={c} className="p-1.5">
                                                <input
                                                    type="number" min={0}
                                                    defaultValue={d[c] || ''}
                                                    key={`${d.dia}-${c}-${d[c]}`}
                                                    onBlur={e => { if (Number(e.target.value || 0) !== d[c]) guardarCelda(d, c, e.target.value) }}
                                                    className={`${dc} text-right ${d.editado[c] ? 'text-[#D4E655] border-[#D4E655]/40' : (c[0] === 'e' ? 'text-red-300' : 'text-emerald-300')}`}
                                                    placeholder="0"
                                                />
                                            </td>
                                        ))}
                                        <td className={`p-2 pr-3 text-right font-black ${d.neto < 0 ? 'text-red-400' : 'text-white'}`}>{pesos(d.neto)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-[#0e0e10] border-t-2 border-white/10 font-black">
                                <td className="p-3 text-left text-[10px] uppercase tracking-widest text-gray-400">Total</td>
                                <td className="p-3 text-right text-emerald-400">{pesos(totales.ie)}</td>
                                <td className="p-3 text-right text-emerald-400">{pesos(totales.it)}</td>
                                <td className="p-3 text-right text-red-400">{pesos(totales.ee)}</td>
                                <td className="p-3 text-right text-red-400">{pesos(totales.et)}</td>
                                <td className={`p-3 text-right ${totales.neto < 0 ? 'text-red-400' : 'text-[#D4E655]'}`}>{pesos(totales.neto)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {!loading && totales && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 max-w-3xl">
                    <div className="rounded-2xl p-4 border bg-emerald-500/5 border-emerald-500/20"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Ingresos efectivo</p><p className="text-xl font-black text-emerald-400 mt-1">{pesos(totales.ie)}</p></div>
                    <div className="rounded-2xl p-4 border bg-emerald-500/5 border-emerald-500/20"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Ingresos transf.</p><p className="text-xl font-black text-emerald-400 mt-1">{pesos(totales.it)}</p></div>
                    <div className="rounded-2xl p-4 border bg-red-500/5 border-red-500/20"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Egresos</p><p className="text-xl font-black text-red-400 mt-1">{pesos(totales.ee + totales.et)}</p></div>
                    <div className="rounded-2xl p-4 border bg-[#D4E655]/10 border-[#D4E655]/30"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Neto del mes</p><p className="text-xl font-black text-[#D4E655] mt-1">{pesos(totales.neto)}</p></div>
                </div>
            )}
        </div>
    )
}
