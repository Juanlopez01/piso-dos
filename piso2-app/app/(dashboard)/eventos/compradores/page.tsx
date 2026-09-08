'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Download, Users, ArrowLeft, Search } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { useCash } from '@/context/CashContext'
import { getCompradoresAction } from '@/app/actions/eventos'

const pesos = (n: number) => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR')
const fecha = (iso: string) => { try { return new Date(iso).toLocaleDateString('es-AR') } catch { return '' } }

type Comprador = { nombre: string; email: string | null; contacto: string | null; compras: number; entradas: number; gastado: number; eventos: string[]; ultima: string }

export default function CompradoresPage() {
    const { userRole, isLoading } = useCash()
    const [data, setData] = useState<Comprador[]>([])
    const [loading, setLoading] = useState(true)
    const [q, setQ] = useState('')

    useEffect(() => {
        if (isLoading) return
        getCompradoresAction().then(r => {
            if (r.ok) setData(r.compradores as Comprador[]); else toast.error((r as any).error || 'Error')
            setLoading(false)
        })
    }, [isLoading])

    const filtrados = useMemo(() => {
        const t = q.trim().toLowerCase()
        if (!t) return data
        return data.filter(c => (c.nombre || '').toLowerCase().includes(t) || (c.email || '').toLowerCase().includes(t) || (c.contacto || '').toLowerCase().includes(t))
    }, [data, q])

    const totalGastado = filtrados.reduce((a, c) => a + c.gastado, 0)
    const totalEntradas = filtrados.reduce((a, c) => a + c.entradas, 0)
    const conMail = filtrados.filter(c => c.email).length

    const descargarCSV = () => {
        const head = ['Nombre', 'Email', 'Contacto', 'Compras', 'Entradas', 'Gastado', 'Eventos', 'Última compra']
        const rows = filtrados.map(c => [c.nombre, c.email || '', c.contacto || '', c.compras, c.entradas, c.gastado, c.eventos.join(' / '), fecha(c.ultima)])
        const csv = [head, ...rows].map(r => r.map((x: any) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'compradores-entradas.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    if (!isLoading && !['admin', 'recepcion', 'curador'].includes(userRole || '')) return (
        <div className="min-h-[50vh] flex items-center justify-center text-gray-500 text-sm">Solo para staff.</div>
    )

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            <Link href="/eventos" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-3"><ArrowLeft size={14} /> Volver a Eventos</Link>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2"><Users className="text-[#D4E655]" size={26} /> Compradores</h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Base de gente que compró entradas</p>
                </div>
                <button onClick={descargarCSV} disabled={!filtrados.length} className="px-4 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white disabled:opacity-40 flex items-center gap-2 text-sm font-bold"><Download size={16} /> CSV</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 max-w-3xl">
                <div className="rounded-2xl p-4 border bg-white/5 border-white/10"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Compradores</p><p className="text-xl font-black mt-1">{filtrados.length}</p></div>
                <div className="rounded-2xl p-4 border bg-white/5 border-white/10"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Con email</p><p className="text-xl font-black mt-1 text-[#D4E655]">{conMail}</p></div>
                <div className="rounded-2xl p-4 border bg-white/5 border-white/10"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Entradas</p><p className="text-xl font-black mt-1">{totalEntradas}</p></div>
                <div className="rounded-2xl p-4 border bg-white/5 border-white/10"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Recaudado</p><p className="text-xl font-black mt-1 text-emerald-400">{pesos(totalGastado)}</p></div>
            </div>

            <div className="relative mb-4 max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, email o contacto…" className="w-full bg-[#111] border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#D4E655]" />
            </div>

            {loading ? (
                <div className="min-h-[30vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead>
                            <tr className="bg-[#111] text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                                <th className="p-3 text-left">Comprador</th>
                                <th className="p-3 text-left">Contacto</th>
                                <th className="p-3 text-right">Compras</th>
                                <th className="p-3 text-right">Entradas</th>
                                <th className="p-3 text-right">Gastado</th>
                                <th className="p-3 text-left">Funciones</th>
                                <th className="p-3 text-right">Última</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map((c, i) => (
                                <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02]">
                                    <td className="p-3 font-bold">{c.nombre}</td>
                                    <td className="p-3 text-gray-400 text-xs">{c.email || c.contacto || <span className="text-gray-700">—</span>}</td>
                                    <td className="p-3 text-right">{c.compras}</td>
                                    <td className="p-3 text-right">{c.entradas}</td>
                                    <td className="p-3 text-right font-bold text-emerald-400">{pesos(c.gastado)}</td>
                                    <td className="p-3 text-gray-400 text-xs max-w-[240px] truncate" title={c.eventos.join(' / ')}>{c.eventos.join(' · ')}</td>
                                    <td className="p-3 text-right text-gray-500 text-xs">{fecha(c.ultima)}</td>
                                </tr>
                            ))}
                            {!filtrados.length && (
                                <tr><td colSpan={7} className="p-10 text-center text-gray-600 text-xs">Todavía no hay compradores.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
