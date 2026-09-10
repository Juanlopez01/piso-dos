'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Download, ClipboardList, Phone, Mail, Users } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { useCash } from '@/context/CashContext'
import { getResumenClasesListaAction, getResumenClaseAction } from '@/app/actions/resumen-clases'

const pesos = (n: number) => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR')
const hoyMes = () => { const d = new Date(Date.now() - 3 * 3600_000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
const soloNums = (t: string) => (t || '').replace(/[^\d]/g, '')

type Sesion = { id: string; inicio: string; label: string }
type Grupo = { key: string; nombre: string; profe: string; sesiones: Sesion[]; nSesiones: number; nInscripciones: number }
type Alumno = { key: string; userId: string | null; nombre: string; telefono: string | null; email: string | null; medio: string; pago: number; asistencias: number; celdas: Record<string, string> }

export default function ResumenClasesPage() {
    const { userRole, isLoading } = useCash()
    const [mesSel, setMesSel] = useState(hoyMes())
    const [grupos, setGrupos] = useState<Grupo[]>([])
    const [loadingLista, setLoadingLista] = useState(true)
    const [selKey, setSelKey] = useState<string>('')
    const [alumnos, setAlumnos] = useState<Alumno[]>([])
    const [totFecha, setTotFecha] = useState<Record<string, number>>({})
    const [recaudado, setRecaudado] = useState(0)
    const [loadingDet, setLoadingDet] = useState(false)

    const [anio, mes] = mesSel.split('-').map(Number)
    const grupo = useMemo(() => grupos.find(g => g.key === selKey) || null, [grupos, selKey])

    const cargarLista = async () => {
        setLoadingLista(true); setSelKey(''); setAlumnos([])
        const r = await getResumenClasesListaAction(anio, mes)
        if (r.ok) setGrupos(r.grupos as Grupo[]); else toast.error((r as any).error || 'Error')
        setLoadingLista(false)
    }
    useEffect(() => { if (!isLoading && ['admin', 'recepcion'].includes(userRole || '')) cargarLista() }, [mesSel, isLoading, userRole])

    const cargarDetalle = async (g: Grupo) => {
        setSelKey(g.key); setLoadingDet(true)
        const r = await getResumenClaseAction(g.sesiones.map(s => s.id))
        if (r.ok) { setAlumnos(r.alumnos as Alumno[]); setTotFecha(r.totalesPorFecha); setRecaudado(r.recaudado) }
        else toast.error((r as any).error || 'Error')
        setLoadingDet(false)
    }

    const descargarCSV = () => {
        if (!grupo) return
        const cols = grupo.sesiones
        const head = ['Nombre', 'Contacto', 'Medio', 'Pago', ...cols.map(c => c.label), 'Asistencias']
        const rows = alumnos.map(a => [a.nombre, a.telefono || a.email || '', a.medio, a.pago, ...cols.map(c => a.celdas[c.id] || ''), a.asistencias])
        rows.push(['TOTALES', '', '', recaudado, ...cols.map(c => totFecha[c.id] || 0), alumnos.reduce((s, a) => s + a.asistencias, 0)] as any)
        const csv = [head, ...rows].map((r: any[]) => r.map((c: any) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob); const a = document.createElement('a')
        a.href = url; a.download = `resumen-${grupo.nombre}-${mesSel}.csv`.replace(/\s+/g, '_'); a.click(); URL.revokeObjectURL(url)
    }

    if (!isLoading && !['admin', 'recepcion'].includes(userRole || '')) return (
        <div className="min-h-[50vh] flex items-center justify-center text-gray-500 text-sm">Solo para staff.</div>
    )

    const cols = grupo?.sesiones || []

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2"><ClipboardList className="text-[#D4E655]" size={26} /> Resumen por clase</h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Alumnos, asistencias y recaudado del mes</p>
                </div>
                <div className="flex gap-2">
                    <input type="month" value={mesSel} onChange={e => setMesSel(e.target.value)} className="bg-[#111] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#D4E655]" />
                    <button onClick={descargarCSV} disabled={!alumnos.length} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white disabled:opacity-40" title="Descargar CSV"><Download size={16} /></button>
                </div>
            </div>

            {/* Selector de clase */}
            {loadingLista ? (
                <div className="min-h-[20vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : (
                <div className="mb-5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 block">Elegí la clase ({grupos.length} este mes)</label>
                    <select value={selKey} onChange={e => { const g = grupos.find(x => x.key === e.target.value); if (g) cargarDetalle(g) }}
                        className="w-full max-w-2xl bg-[#111] border border-white/10 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-[#D4E655]">
                        <option value="">— Seleccioná una clase —</option>
                        {grupos.map(g => (
                            <option key={g.key} value={g.key}>{g.nombre}{g.profe ? ` · ${g.profe}` : ''} — {g.nSesiones} clase{g.nSesiones === 1 ? '' : 's'}</option>
                        ))}
                    </select>
                </div>
            )}

            {loadingDet ? (
                <div className="min-h-[30vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : selKey && grupo ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 max-w-3xl">
                        <div className="rounded-2xl p-4 border bg-white/5 border-white/10"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Alumnos</p><p className="text-xl font-black mt-1">{alumnos.length}</p></div>
                        <div className="rounded-2xl p-4 border bg-white/5 border-white/10"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Clases (fechas)</p><p className="text-xl font-black mt-1">{cols.length}</p></div>
                        <div className="rounded-2xl p-4 border bg-white/5 border-white/10"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Asistencias</p><p className="text-xl font-black mt-1">{alumnos.reduce((s, a) => s + a.asistencias, 0)}</p></div>
                        <div className="rounded-2xl p-4 border bg-[#D4E655]/10 border-[#D4E655]/30"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Recaudado (mes)</p><p className="text-xl font-black mt-1 text-[#D4E655]">{pesos(recaudado)}</p></div>
                    </div>

                    {alumnos.length === 0 ? (
                        <div className="py-12 text-center text-gray-600 text-xs border-2 border-dashed border-white/10 rounded-2xl">Sin inscriptos en esta clase este mes.</div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-white/10">
                            <table className="text-sm min-w-max">
                                <thead>
                                    <tr className="bg-[#111] text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                                        <th className="p-3 text-left sticky left-0 bg-[#111] z-10">Alumno</th>
                                        <th className="p-2 text-left">Contacto</th>
                                        <th className="p-2 text-center">Medio</th>
                                        <th className="p-2 text-right">Pago</th>
                                        {cols.map(c => <th key={c.id} className="p-2 text-center whitespace-nowrap">{c.label}</th>)}
                                        <th className="p-2 text-center">Asist.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {alumnos.map(a => (
                                        <tr key={a.key} className="border-t border-white/5 hover:bg-white/[0.02]">
                                            <td className="p-2 pl-3 font-bold whitespace-nowrap sticky left-0 bg-[#050505] z-10">{a.nombre}</td>
                                            <td className="p-2 whitespace-nowrap">
                                                <span className="inline-flex gap-2">
                                                    {a.telefono && <a href={`https://wa.me/${soloNums(a.telefono)}`} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300" title={a.telefono}><Phone size={14} /></a>}
                                                    {a.email && <a href={`mailto:${a.email}`} className="text-blue-400 hover:text-blue-300" title={a.email}><Mail size={14} /></a>}
                                                    {!a.telefono && !a.email && <span className="text-gray-700 text-xs">—</span>}
                                                </span>
                                            </td>
                                            <td className="p-2 text-center text-xs text-gray-300 whitespace-nowrap">{a.medio}</td>
                                            <td className="p-2 text-right font-bold text-emerald-400 whitespace-nowrap">{a.pago ? pesos(a.pago) : <span className="text-gray-700">—</span>}</td>
                                            {cols.map(c => {
                                                const m = a.celdas[c.id] || ''
                                                const color = m === '1' ? 'text-[#D4E655] font-black' : m === '·' ? 'text-gray-700' : 'text-gray-300'
                                                return <td key={c.id} className={`p-2 text-center ${color}`}>{m}</td>
                                            })}
                                            <td className="p-2 text-center font-black">{a.asistencias}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-[#0e0e10] border-t-2 border-white/10 font-black text-xs">
                                        <td className="p-3 text-left uppercase tracking-widest text-gray-400 sticky left-0 bg-[#0e0e10]">Totales</td>
                                        <td></td><td></td>
                                        <td className="p-2 text-right text-[#D4E655]">{pesos(recaudado)}</td>
                                        {cols.map(c => <td key={c.id} className="p-2 text-center text-white">{totFecha[c.id] || 0}</td>)}
                                        <td className="p-2 text-center">{alumnos.reduce((s, a) => s + a.asistencias, 0)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                    <p className="text-[11px] text-gray-500 mt-3">Referencia: <b className="text-[#D4E655]">1</b> presente · <b>½</b> media falta · <b>J</b> justificada · <b>·</b> ausente. "Pago" = valor por clase usada en el mes (recaudado real de esta clase, sin doblar packs). "Medio" = tipo de pack (X8/X4…) o modalidad.</p>
                </>
            ) : (
                <div className="py-16 text-center text-gray-600 text-sm flex flex-col items-center gap-2"><Users size={30} className="opacity-40" />Elegí una clase arriba para ver el resumen del mes.</div>
            )}
        </div>
    )
}
