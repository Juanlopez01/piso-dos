'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, CalendarDays, MapPin, ChevronLeft, ChevronRight, RefreshCw, Globe, Theater, Clock } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { getFuncionesAgendaAction } from '@/app/actions/eventos'

type Funcion = {
    id: string
    nombre: string
    fecha: string
    lugar: string | null
    ventaOnline: boolean
    obras: { titulo: string; compania: string | null }[]
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
// Clave local YYYY-MM-DD (sin corrimiento de zona) para agrupar por día.
const claveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtHora = (d: Date) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
const fmtDiaLargo = (d: Date) => d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })

export default function FuncionesPage() {
    const [funciones, setFunciones] = useState<Funcion[]>([])
    const [loading, setLoading] = useState(true)
    const hoy = new Date()
    const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1))
    const [diaSel, setDiaSel] = useState<string | null>(null)

    const cargar = async () => {
        setLoading(true)
        const r = await getFuncionesAgendaAction()
        if (r.ok) setFunciones(r.funciones as Funcion[])
        else toast.error(r.error || 'Error al cargar')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [])

    // Funciones agrupadas por día (clave local).
    const porDia = useMemo(() => {
        const m: Record<string, Funcion[]> = {}
        for (const f of funciones) {
            const k = claveDia(new Date(f.fecha))
            ;(m[k] ||= []).push(f)
        }
        return m
    }, [funciones])

    // Celdas del mes visible (arranca lunes).
    const celdas = useMemo(() => {
        const primero = new Date(mes.getFullYear(), mes.getMonth(), 1)
        const offset = (primero.getDay() + 6) % 7 // lunes = 0
        const inicio = new Date(primero)
        inicio.setDate(primero.getDate() - offset)
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(inicio)
            d.setDate(inicio.getDate() + i)
            return d
        })
    }, [mes])

    const keyHoy = claveDia(hoy)
    const totalMes = celdas.filter(d => d.getMonth() === mes.getMonth()).reduce((s, d) => s + (porDia[claveDia(d)]?.length || 0), 0)

    // Lista de la derecha: el día elegido, o las próximas funciones desde hoy.
    const lista = useMemo(() => {
        if (diaSel) return (porDia[diaSel] || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha))
        const ahora = Date.now()
        return funciones
            .filter(f => new Date(f.fecha).getTime() >= ahora - 12 * 3600 * 1000) // incluye las de hoy ya empezadas hace poco
            .slice()
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
    }, [diaSel, porDia, funciones])

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex items-end justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2">
                        <CalendarDays className="text-[#D4E655]" size={26} /> Cartelera
                    </h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">PISO2E · Funciones confirmadas</p>
                </div>
                <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
            </div>

            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : (
                <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
                    {/* ---- Calendario ---- */}
                    <div className="bg-[#0b0b0d] border border-white/10 rounded-2xl p-4 md:p-5">
                        <div className="flex items-center justify-between mb-4">
                            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white"><ChevronLeft size={18} /></button>
                            <div className="text-center">
                                <div className="font-black uppercase tracking-tight">{MESES[mes.getMonth()]} {mes.getFullYear()}</div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">{totalMes} función{totalMes === 1 ? '' : 'es'}</div>
                            </div>
                            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white"><ChevronRight size={18} /></button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {DIAS.map(d => <div key={d} className="text-center text-[10px] font-black text-gray-500 uppercase tracking-widest py-1">{d}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {celdas.map((d, i) => {
                                const k = claveDia(d)
                                const fs = porDia[k] || []
                                const esMes = d.getMonth() === mes.getMonth()
                                const esHoy = k === keyHoy
                                const activo = diaSel === k
                                return (
                                    <button
                                        key={i}
                                        onClick={() => setDiaSel(activo ? null : (fs.length ? k : null))}
                                        disabled={!fs.length}
                                        className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-1 text-sm transition-all border
                                            ${!esMes ? 'opacity-30' : ''}
                                            ${activo ? 'bg-[#D4E655] text-black border-[#D4E655] font-black'
                                                : fs.length ? 'bg-[#D4E655]/10 border-[#D4E655]/30 text-white hover:bg-[#D4E655]/20 cursor-pointer'
                                                    : esHoy ? 'border-white/20 text-white' : 'border-transparent text-gray-500 cursor-default'}`}
                                    >
                                        <span className={esHoy && !activo ? 'relative' : ''}>
                                            {d.getDate()}
                                            {esHoy && <span className="absolute -right-1.5 -top-0.5 w-1.5 h-1.5 rounded-full bg-[#D4E655]" />}
                                        </span>
                                        {fs.length > 0 && (
                                            <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-black ${activo ? 'bg-black text-[#D4E655]' : 'bg-[#D4E655] text-black'}`}>{fs.length}</span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* ---- Lista (día elegido o próximas) ---- */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">
                                {diaSel ? <span className="capitalize text-white">{fmtDiaLargo(new Date(diaSel + 'T12:00:00'))}</span> : 'Próximas funciones'}
                            </h2>
                            {diaSel && <button onClick={() => setDiaSel(null)} className="text-[10px] font-bold uppercase tracking-widest text-[#D4E655] hover:underline">Ver todas</button>}
                        </div>

                        {lista.length === 0 ? (
                            <div className="bg-[#0b0b0d] border border-white/10 rounded-2xl p-8 text-center text-sm text-gray-500">
                                {diaSel ? 'No hay funciones ese día.' : 'No hay funciones confirmadas próximas. Las funciones aparecen acá cuando el evento está en estado Activo.'}
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {lista.map(f => {
                                    const d = new Date(f.fecha)
                                    return (
                                        <Link key={f.id} href={`/eventos?ev=${f.id}`} className="block bg-[#0b0b0d] border border-white/10 rounded-2xl p-4 hover:border-[#D4E655]/40 transition-colors group">
                                            <div className="flex items-start gap-3">
                                                <div className="flex flex-col items-center justify-center w-14 shrink-0 bg-[#D4E655]/10 border border-[#D4E655]/20 rounded-xl py-2">
                                                    <span className="text-[10px] font-black uppercase text-[#D4E655]">{MESES[d.getMonth()].slice(0, 3)}</span>
                                                    <span className="text-xl font-black leading-none">{d.getDate()}</span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-bold leading-tight group-hover:text-[#D4E655] transition-colors truncate">{f.nombre}</div>
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-gray-400">
                                                        <span className="flex items-center gap-1"><Clock size={12} /> {fmtHora(d)}</span>
                                                        {f.lugar && <span className="flex items-center gap-1"><MapPin size={12} /> {f.lugar}</span>}
                                                        {f.ventaOnline && <span className="flex items-center gap-1 text-[#D4E655]"><Globe size={12} /> Venta online</span>}
                                                    </div>
                                                    {f.obras.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                                            {f.obras.map((o, j) => (
                                                                <span key={j} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-gray-300">
                                                                    <Theater size={10} className="text-[#D4E655]" /> {o.titulo}{o.compania ? ` · ${o.compania}` : ''}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
