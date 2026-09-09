'use client'

import { useEffect, useState, Fragment } from 'react'
import { Loader2, RefreshCw, Download, Wallet, Plus, Trash2, Lock, Pencil, X, Check, RotateCcw } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { useCash } from '@/context/CashContext'
import { getLibroAdminAction, agregarMovimientoAdminAction, editarMovimientoAdminAction, eliminarMovimientoAdminAction, setCajaOverrideAction, setSaldoInicialAction, getDetalleCajaDiaAction } from '@/app/actions/libro-admin'

const DIAS_SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const fechaLabel = (anio: number, mes: number, dia: number) => {
    const d = new Date(anio, mes - 1, dia)
    return `${DIAS_SEM[d.getDay()]} ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

const pesos = (n: number) => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR')
const usd = (n: number) => 'US$' + Math.round(Number(n || 0)).toLocaleString('es-AR')
const hoyMes = () => { const d = new Date(Date.now() - 3 * 3600_000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
const hoyDia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

type Entrada = {
    key: string; auto: boolean; concepto: string; id?: string; autor?: string; hora?: string
    fecha?: string; tipoMov?: 'ingreso' | 'egreso'; metodoMov?: 'efectivo' | 'transferencia' | 'dolares'; montoMov?: number
    diaNum?: number; sedeKey?: string; editadoCaja?: boolean
    ef_ing: number; ef_egr: number; tr_ing: number; tr_egr: number; usd_ing: number; usd_egr: number
}
type Dia = { dia: number; entries: Entrada[]; sub: any; saldoPesos: number; saldoDolares: number }
type Libro = {
    apertura: { pesos: number; dolares: number }
    dias: Dia[]
    totales: { ef_ing: number; ef_egr: number; tr_ing: number; tr_egr: number; usd_ing: number; usd_egr: number; netoPesos: number; netoDolares: number }
    cierre: { pesos: number; dolares: number }
}

export default function LibroAdminPage() {
    const { hasAdminFinanzas, isLoading } = useCash()
    const [mesSel, setMesSel] = useState(hoyMes())
    const [libro, setLibro] = useState<Libro | null>(null)
    const [loading, setLoading] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [borrandoId, setBorrandoId] = useState<string | null>(null)
    const [editId, setEditId] = useState<string | null>(null)

    const [nuevo, setNuevo] = useState<{ fecha: string; concepto: string; tipo: 'ingreso' | 'egreso'; metodo: 'efectivo' | 'transferencia' | 'dolares'; monto: string }>({
        fecha: hoyDia(), concepto: '', tipo: 'ingreso', metodo: 'efectivo', monto: ''
    })

    // Edición de líneas de caja (override)
    const [editCajaKey, setEditCajaKey] = useState<string | null>(null)
    const [cajaVals, setCajaVals] = useState<{ ef_ing: string; ef_egr: string; tr_ing: string; tr_egr: string }>({ ef_ing: '', ef_egr: '', tr_ing: '', tr_egr: '' })
    const [cajaSaving, setCajaSaving] = useState(false)

    const editarCaja = (e: Entrada) => {
        setEditCajaKey(e.key)
        setCajaVals({ ef_ing: String(e.ef_ing || ''), ef_egr: String(e.ef_egr || ''), tr_ing: String(e.tr_ing || ''), tr_egr: String(e.tr_egr || '') })
    }
    const guardarCaja = async (e: Entrada) => {
        setCajaSaving(true)
        const r = await setCajaOverrideAction(anio, mes, e.diaNum!, e.sedeKey!, {
            ef_ing: Number(cajaVals.ef_ing) || 0, ef_egr: Number(cajaVals.ef_egr) || 0,
            tr_ing: Number(cajaVals.tr_ing) || 0, tr_egr: Number(cajaVals.tr_egr) || 0,
        })
        if (r.success) { toast.success('Caja corregida'); setEditCajaKey(null); cargar() } else toast.error(r.error || 'Error')
        setCajaSaving(false)
    }
    const resetCaja = async (e: Entrada) => {
        setCajaSaving(true)
        const r = await setCajaOverrideAction(anio, mes, e.diaNum!, e.sedeKey!, null)
        if (r.success) { toast.success('Volvió al automático'); setEditCajaKey(null); cargar() } else toast.error(r.error || 'Error')
        setCajaSaving(false)
    }

    const resetForm = () => { setEditId(null); setNuevo({ fecha: hoyDia(), concepto: '', tipo: 'ingreso', metodo: 'efectivo', monto: '' }) }
    const editar = (e: Entrada) => {
        setEditId(e.id!)
        setNuevo({ fecha: e.fecha || hoyDia(), concepto: e.concepto, tipo: e.tipoMov || 'ingreso', metodo: e.metodoMov || 'efectivo', monto: String(e.montoMov ?? '') })
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    // Saldo inicial del mes (cierre mensual, a mano)
    const [siPesos, setSiPesos] = useState('')
    const [siDolares, setSiDolares] = useState('')
    const [siSaving, setSiSaving] = useState(false)
    // Detalle de una línea de caja (drill-down)
    const [detalle, setDetalle] = useState<{ titulo: string; movs: any[] } | null>(null)
    const [detalleLoading, setDetalleLoading] = useState(false)

    const [anio, mes] = mesSel.split('-').map(Number)

    const cargar = async () => {
        setLoading(true)
        const r = await getLibroAdminAction(anio, mes)
        if (r.success) {
            setLibro(r as any)
            setSiPesos(String((r as any).apertura?.pesos || ''))
            setSiDolares(String((r as any).apertura?.dolares || ''))
        }
        else toast.error((r as any).error || 'Error')
        setLoading(false)
    }
    useEffect(() => { if (!isLoading && hasAdminFinanzas) cargar() }, [mesSel, isLoading, hasAdminFinanzas])

    const guardarSaldoInicial = async () => {
        setSiSaving(true)
        const r = await setSaldoInicialAction(anio, mes, Number(siPesos) || 0, Number(siDolares) || 0)
        if (r.success) { toast.success('Saldo inicial guardado'); cargar() } else toast.error(r.error || 'Error')
        setSiSaving(false)
    }
    const abrirDetalle = async (e: Entrada) => {
        setDetalle({ titulo: `${e.concepto} · ${fechaLabel(anio, mes, e.diaNum!)}`, movs: [] })
        setDetalleLoading(true)
        const r = await getDetalleCajaDiaAction(anio, mes, e.diaNum!, e.sedeKey!)
        setDetalleLoading(false)
        if (r.success) setDetalle({ titulo: `${e.concepto} · ${fechaLabel(anio, mes, e.diaNum!)}`, movs: r.movimientos })
        else { toast.error((r as any).error || 'Error'); setDetalle(null) }
    }

    const agregar = async () => {
        if (!nuevo.concepto.trim()) return toast.error('Poné un concepto')
        if (!nuevo.monto || Number(nuevo.monto) <= 0) return toast.error('Poné un monto válido')
        setGuardando(true)
        const payload = { fecha: nuevo.fecha, concepto: nuevo.concepto.trim(), tipo: nuevo.tipo, metodo: nuevo.metodo, monto: Number(nuevo.monto) }
        const r = editId
            ? await editarMovimientoAdminAction(editId, payload)
            : await agregarMovimientoAdminAction(payload)
        if (r.success) { toast.success(editId ? 'Guardado' : 'Cargado'); resetForm(); cargar() }
        else toast.error(r.error || 'Error')
        setGuardando(false)
    }

    const eliminar = async (id: string, concepto: string) => {
        if (!confirm(`¿Borrar el movimiento "${concepto}"?`)) return
        setBorrandoId(id)
        const r = await eliminarMovimientoAdminAction(id)
        if (r.success) { toast.success('Borrado'); cargar() } else toast.error(r.error || 'Error')
        setBorrandoId(null)
    }

    const descargarCSV = () => {
        if (!libro) return
        const head = ['Día', 'Concepto', 'Autor', 'Efvo Ing', 'Efvo Egr', 'Transf Ing', 'Transf Egr', 'US$ Ing', 'US$ Egr']
        const rows: any[] = [['', 'SALDO INICIAL DEL MES', '', libro.apertura.pesos, '', '', '', libro.apertura.dolares, '']]
        for (const d of libro.dias) for (const e of d.entries) {
            rows.push([d.dia, e.concepto, e.auto ? 'Auto (caja)' : (e.autor || ''), e.ef_ing || '', e.ef_egr || '', e.tr_ing || '', e.tr_egr || '', e.usd_ing || '', e.usd_egr || ''])
        }
        const t = libro.totales
        rows.push(['', 'TOTALES DEL MES', '', t.ef_ing, t.ef_egr, t.tr_ing, t.tr_egr, t.usd_ing, t.usd_egr])
        rows.push(['', 'SALDO FINAL', '', libro.cierre.pesos, '', '', '', libro.cierre.dolares, ''])
        const csv = [head, ...rows].map((r: any[]) => r.map((c: any) => `"${String(c ?? '')}"`).join(',')).join('\r\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `administracion-${mesSel}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    if (!isLoading && !hasAdminFinanzas) return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-gray-500 text-sm gap-3">
            <Lock size={28} className="text-gray-600" />
            <p>Sección privada de administración.</p>
            <p className="text-xs text-gray-600">Pedile a un admin que te habilite el acceso.</p>
        </div>
    )

    const iEf = 'w-24 bg-black border border-white/10 rounded-lg py-2 px-2 text-xs outline-none focus:border-[#D4E655]'
    const cel = (n: number, negativo = false) => n ? <span className={negativo ? 'text-red-300' : 'text-emerald-300'}>{n ? (negativo ? '-' : '') + Math.round(n).toLocaleString('es-AR') : ''}</span> : <span className="text-gray-700">·</span>

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2"><Wallet className="text-[#D4E655]" size={26} /> Administración</h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Libro compartido · privado</p>
                </div>
                <div className="flex gap-2">
                    <input type="month" value={mesSel} onChange={e => setMesSel(e.target.value)} className="bg-[#111] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#D4E655]" />
                    <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
                    <button onClick={descargarCSV} disabled={!libro} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white disabled:opacity-40" title="Descargar CSV"><Download size={16} /></button>
                </div>
            </div>

            {/* Cargar movimiento manual */}
            <div className={`rounded-2xl border p-4 mb-5 ${editId ? 'border-[#D4E655]/40 bg-[#D4E655]/[0.04]' : 'border-white/10 bg-[#0b0b0d]'}`}>
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-3">{editId ? 'Editando movimiento' : 'Cargar ingreso / egreso a mano'}</p>
                <div className="flex flex-wrap gap-2 items-center">
                    <input type="date" value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} className="bg-black border border-white/10 rounded-lg py-2 px-2 text-xs outline-none focus:border-[#D4E655]" />
                    <input type="text" placeholder="Concepto (ej: Pago pinturas Sala 1)" value={nuevo.concepto} onChange={e => setNuevo({ ...nuevo, concepto: e.target.value })} className="flex-1 min-w-[180px] bg-black border border-white/10 rounded-lg py-2 px-3 text-xs outline-none focus:border-[#D4E655]" />
                    <select value={nuevo.tipo} onChange={e => setNuevo({ ...nuevo, tipo: e.target.value as any })} className="bg-black border border-white/10 rounded-lg py-2 px-2 text-xs outline-none focus:border-[#D4E655]">
                        <option value="ingreso">Ingreso</option>
                        <option value="egreso">Egreso</option>
                    </select>
                    <select value={nuevo.metodo} onChange={e => setNuevo({ ...nuevo, metodo: e.target.value as any })} className="bg-black border border-white/10 rounded-lg py-2 px-2 text-xs outline-none focus:border-[#D4E655]">
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="dolares">Dólares</option>
                    </select>
                    <input type="number" min={0} placeholder="Monto" value={nuevo.monto} onChange={e => setNuevo({ ...nuevo, monto: e.target.value })} className={iEf} />
                    <button onClick={agregar} disabled={guardando} className="px-4 py-2 rounded-lg bg-[#D4E655] text-black text-xs font-black uppercase tracking-wide hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                        {guardando ? <Loader2 size={14} className="animate-spin" /> : editId ? <Pencil size={14} /> : <Plus size={14} />} {editId ? 'Guardar' : 'Agregar'}
                    </button>
                    {editId && (
                        <button onClick={resetForm} disabled={guardando} className="px-3 py-2 rounded-lg bg-[#111] border border-white/10 text-gray-400 text-xs font-bold uppercase tracking-wide hover:text-white flex items-center gap-1.5">
                            <X size={14} /> Cancelar
                        </button>
                    )}
                </div>
                <p className="text-[10px] text-gray-600 mt-2">Queda registrado quién lo cargó. Las cajas (Obelisco/Congreso) entran solas, no hace falta cargarlas.</p>
            </div>

            {loading || !libro ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-sm min-w-[820px]">
                        <thead>
                            <tr className="bg-[#111] text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                                <th className="p-3 text-left">Concepto</th>
                                <th className="p-3 text-left">Quién</th>
                                <th className="p-2 text-right text-emerald-400/70">Efvo Ing</th>
                                <th className="p-2 text-right text-red-400/70">Efvo Egr</th>
                                <th className="p-2 text-right text-emerald-400/70">Transf Ing</th>
                                <th className="p-2 text-right text-red-400/70">Transf Egr</th>
                                <th className="p-2 text-right text-emerald-400/70">US$ Ing</th>
                                <th className="p-2 text-right text-red-400/70">US$ Egr</th>
                                <th className="p-2 w-14"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Saldo inicial del mes (cierre mensual, a mano) */}
                            <tr className="bg-[#0e0e10] border-t border-white/5">
                                <td className="p-2 pl-3 font-bold text-gray-300 text-xs uppercase tracking-wide" colSpan={2}>
                                    Saldo inicial del mes
                                    <span className="block text-[9px] text-gray-600 normal-case tracking-normal font-normal">lo que quedó del mes pasado (a mano)</span>
                                </td>
                                <td className="p-1.5 text-right" colSpan={4}>
                                    <span className="text-[9px] text-gray-600 uppercase mr-1">$</span>
                                    <input type="number" value={siPesos} onChange={e => setSiPesos(e.target.value)} placeholder="0" className="w-28 bg-black border border-white/15 rounded py-1 px-2 text-xs text-right outline-none focus:border-[#D4E655]" />
                                </td>
                                <td className="p-1.5 text-right" colSpan={2}>
                                    <span className="text-[9px] text-gray-600 uppercase mr-1">US$</span>
                                    <input type="number" value={siDolares} onChange={e => setSiDolares(e.target.value)} placeholder="0" className="w-24 bg-black border border-white/15 rounded py-1 px-2 text-xs text-right outline-none focus:border-[#D4E655]" />
                                </td>
                                <td className="p-1 text-center">
                                    <button onClick={guardarSaldoInicial} disabled={siSaving} title="Guardar saldo inicial" className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40">
                                        {siSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={15} />}
                                    </button>
                                </td>
                            </tr>

                            {libro.dias.length === 0 && (
                                <tr><td colSpan={9} className="p-10 text-center text-gray-600 text-xs">Sin movimientos este mes.</td></tr>
                            )}

                            {libro.dias.map(d => (
                                <Fragment key={d.dia}>
                                    <tr className="bg-[#141416] border-t border-white/10">
                                        <td className="py-1.5 pl-3 text-[11px] font-black text-[#D4E655] uppercase tracking-widest" colSpan={2}>{fechaLabel(anio, mes, d.dia)}</td>
                                        <td className="py-1.5 pr-2 text-right text-[10px] text-gray-500 uppercase tracking-wider" colSpan={4}>Saldo {pesos(d.saldoPesos)}</td>
                                        <td className="py-1.5 pr-2 text-right text-[10px] text-gray-500 uppercase tracking-wider" colSpan={2}>{usd(d.saldoDolares)}</td>
                                        <td></td>
                                    </tr>
                                    {d.entries.map(e => {
                                        const editandoCaja = editCajaKey === e.key
                                        const ci = 'w-20 bg-black border border-[#D4E655]/40 rounded py-1 px-1.5 text-xs text-right outline-none focus:border-[#D4E655]'
                                        return (
                                        <tr key={e.key} className={`border-t border-white/5 hover:bg-white/[0.02] ${(editId && e.id === editId) || editandoCaja ? 'bg-[#D4E655]/[0.06]' : ''}`}>
                                            <td className="p-2 pl-3">
                                                {e.auto
                                                    ? <button onClick={() => abrirDetalle(e)} className="text-gray-300 hover:text-[#D4E655] underline decoration-dotted decoration-gray-600 underline-offset-2" title="Ver el detalle de estos movimientos">{e.concepto}</button>
                                                    : <span className="text-white">{e.concepto}</span>}
                                                {e.auto && (e.editadoCaja
                                                    ? <span className="ml-2 text-[9px] uppercase tracking-wider text-[#D4E655] border border-[#D4E655]/40 rounded px-1 py-0.5">editado</span>
                                                    : <span className="ml-2 text-[9px] uppercase tracking-wider text-gray-500 border border-white/10 rounded px-1 py-0.5">ver</span>)}
                                            </td>
                                            <td className="p-2 text-[11px] text-gray-500">{e.auto ? 'Caja' : (<span>{e.autor}{e.hora ? <span className="text-gray-700"> · {e.hora}</span> : ''}</span>)}</td>
                                            {editandoCaja ? (<>
                                                <td className="p-1 text-right"><input type="number" min={0} value={cajaVals.ef_ing} onChange={ev => setCajaVals({ ...cajaVals, ef_ing: ev.target.value })} className={ci} placeholder="0" /></td>
                                                <td className="p-1 text-right"><input type="number" min={0} value={cajaVals.ef_egr} onChange={ev => setCajaVals({ ...cajaVals, ef_egr: ev.target.value })} className={ci} placeholder="0" /></td>
                                                <td className="p-1 text-right"><input type="number" min={0} value={cajaVals.tr_ing} onChange={ev => setCajaVals({ ...cajaVals, tr_ing: ev.target.value })} className={ci} placeholder="0" /></td>
                                                <td className="p-1 text-right"><input type="number" min={0} value={cajaVals.tr_egr} onChange={ev => setCajaVals({ ...cajaVals, tr_egr: ev.target.value })} className={ci} placeholder="0" /></td>
                                                <td className="p-2 text-right text-gray-700">·</td>
                                                <td className="p-2 text-right text-gray-700">·</td>
                                            </>) : (<>
                                                <td className="p-2 text-right font-bold">{cel(e.ef_ing)}</td>
                                                <td className="p-2 text-right font-bold">{cel(e.ef_egr, true)}</td>
                                                <td className="p-2 text-right font-bold">{cel(e.tr_ing)}</td>
                                                <td className="p-2 text-right font-bold">{cel(e.tr_egr, true)}</td>
                                                <td className="p-2 text-right font-bold">{cel(e.usd_ing)}</td>
                                                <td className="p-2 text-right font-bold">{cel(e.usd_egr, true)}</td>
                                            </>)}
                                            <td className="p-1 text-center whitespace-nowrap">
                                                {e.auto ? (
                                                    editandoCaja ? (
                                                        <span className="inline-flex gap-1.5">
                                                            <button onClick={() => guardarCaja(e)} disabled={cajaSaving} title="Guardar" className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40">{cajaSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}</button>
                                                            {e.editadoCaja && <button onClick={() => resetCaja(e)} disabled={cajaSaving} title="Volver al automático" className="text-gray-500 hover:text-[#D4E655] disabled:opacity-40"><RotateCcw size={13} /></button>}
                                                            <button onClick={() => setEditCajaKey(null)} disabled={cajaSaving} title="Cancelar" className="text-gray-600 hover:text-white disabled:opacity-40"><X size={14} /></button>
                                                        </span>
                                                    ) : (
                                                        <button onClick={() => editarCaja(e)} title="Corregir caja" className="text-gray-600 hover:text-[#D4E655]"><Pencil size={13} /></button>
                                                    )
                                                ) : (e.id && (
                                                    <span className="inline-flex gap-1.5">
                                                        <button onClick={() => editar(e)} title="Editar" className="text-gray-600 hover:text-[#D4E655]"><Pencil size={13} /></button>
                                                        <button onClick={() => eliminar(e.id!, e.concepto)} disabled={borrandoId === e.id} title="Borrar" className="text-gray-600 hover:text-red-400 disabled:opacity-40">
                                                            {borrandoId === e.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                                        </button>
                                                    </span>
                                                ))}
                                            </td>
                                        </tr>
                                    )})}
                                </Fragment>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-[#0e0e10] border-t-2 border-white/10 font-black text-xs">
                                <td className="p-3 text-left uppercase tracking-widest text-gray-400" colSpan={2}>Totales del mes</td>
                                <td className="p-2 text-right text-emerald-400">{pesos(libro.totales.ef_ing)}</td>
                                <td className="p-2 text-right text-red-400">{pesos(libro.totales.ef_egr)}</td>
                                <td className="p-2 text-right text-emerald-400">{pesos(libro.totales.tr_ing)}</td>
                                <td className="p-2 text-right text-red-400">{pesos(libro.totales.tr_egr)}</td>
                                <td className="p-2 text-right text-emerald-400">{usd(libro.totales.usd_ing)}</td>
                                <td className="p-2 text-right text-red-400">{usd(libro.totales.usd_egr)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {!loading && libro && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 max-w-4xl">
                    <div className="rounded-2xl p-4 border bg-white/5 border-white/10"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Neto pesos (mes)</p><p className={`text-xl font-black mt-1 ${libro.totales.netoPesos < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{pesos(libro.totales.netoPesos)}</p></div>
                    <div className="rounded-2xl p-4 border bg-white/5 border-white/10"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Neto dólares (mes)</p><p className={`text-xl font-black mt-1 ${libro.totales.netoDolares < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{usd(libro.totales.netoDolares)}</p></div>
                    <div className="rounded-2xl p-4 border bg-[#D4E655]/10 border-[#D4E655]/30"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Saldo final pesos</p><p className={`text-xl font-black mt-1 ${libro.cierre.pesos < 0 ? 'text-red-400' : 'text-[#D4E655]'}`}>{pesos(libro.cierre.pesos)}</p></div>
                    <div className="rounded-2xl p-4 border bg-[#D4E655]/10 border-[#D4E655]/30"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Saldo final dólares</p><p className={`text-xl font-black mt-1 ${libro.cierre.dolares < 0 ? 'text-red-400' : 'text-[#D4E655]'}`}>{usd(libro.cierre.dolares)}</p></div>
                </div>
            )}

            {/* Detalle de una línea de caja (día + sede) */}
            {detalle && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setDetalle(null)}>
                    <div className="bg-[#09090b] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <p className="font-black uppercase tracking-tight text-sm truncate pr-3">{detalle.titulo}</p>
                            <button onClick={() => setDetalle(null)} className="p-2 bg-white/5 rounded-full text-gray-300 shrink-0"><X size={16} /></button>
                        </div>
                        <div className="overflow-y-auto p-3">
                            {detalleLoading ? (
                                <div className="py-10 flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                            ) : detalle.movs.length === 0 ? (
                                <p className="py-8 text-center text-gray-600 text-xs">Sin movimientos.</p>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead><tr className="text-[9px] uppercase tracking-widest text-gray-500">
                                        <th className="p-2 text-left">Concepto</th><th className="p-2 text-left">Quién</th><th className="p-2 text-right">Monto</th>
                                    </tr></thead>
                                    <tbody>
                                        {detalle.movs.map((m: any, i: number) => (
                                            <tr key={i} className="border-t border-white/5">
                                                <td className="p-2">
                                                    <span className={m.tipo === 'egreso' ? 'text-red-300' : 'text-emerald-300'}>{m.concepto}</span>
                                                    <span className="block text-[9px] text-gray-600 uppercase">{m.tipo} · {m.metodo}</span>
                                                </td>
                                                <td className="p-2 text-gray-400">{m.usuario}<span className="block text-[9px] text-gray-600">{m.hora}</span></td>
                                                <td className={`p-2 text-right font-bold ${m.tipo === 'egreso' ? 'text-red-400' : 'text-emerald-400'}`}>{m.tipo === 'egreso' ? '-' : ''}{pesos(m.monto)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
