'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, BarChart3, RefreshCw, Clock, DollarSign, Ticket, MessageCircle, DoorOpen, AlertTriangle, Users } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { getMetricasRecepAction, type MetricaRecep } from '@/app/actions/metricas'

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
// Rango [desde, hasta) en ISO, a partir de fechas locales YYYY-MM-DD.
const iso = (d: Date) => d.toISOString()
const hoy = new Date()
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Preset = 'semana' | 'mes' | 'mes_pasado' | 'custom'

export default function MetricasPage() {
    const [recep, setRecep] = useState<MetricaRecep[]>([])
    const [loading, setLoading] = useState(true)
    const [preset, setPreset] = useState<Preset>('mes')
    const [desde, setDesde] = useState(ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)))
    const [hasta, setHasta] = useState(ymd(hoy))

    const aplicarPreset = (p: Preset) => {
        setPreset(p)
        const h = new Date()
        if (p === 'semana') {
            const d = new Date(h); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow)
            setDesde(ymd(d)); setHasta(ymd(h))
        } else if (p === 'mes') {
            setDesde(ymd(new Date(h.getFullYear(), h.getMonth(), 1))); setHasta(ymd(h))
        } else if (p === 'mes_pasado') {
            setDesde(ymd(new Date(h.getFullYear(), h.getMonth() - 1, 1))); setHasta(ymd(new Date(h.getFullYear(), h.getMonth(), 0)))
        }
    }

    const cargar = async () => {
        setLoading(true)
        // desde 00:00 del día "desde" hasta 00:00 del día siguiente a "hasta" (inclusivo).
        const d0 = new Date(desde + 'T00:00:00')
        const h1 = new Date(hasta + 'T00:00:00'); h1.setDate(h1.getDate() + 1)
        const r = await getMetricasRecepAction(iso(d0), iso(h1))
        if (r.ok) setRecep(r.recep)
        else toast.error(r.error || 'Error al cargar')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [desde, hasta])

    const max = useMemo(() => ({
        horas: Math.max(1, ...recep.map(r => r.horas)),
        ingresos: Math.max(1, ...recep.map(r => r.ingresos)),
        ventas: Math.max(1, ...recep.map(r => r.ventas)),
        mensajes: Math.max(1, ...recep.map(r => r.mensajes)),
    }), [recep])

    const tot = useMemo(() => recep.reduce((a, r) => ({
        horas: a.horas + r.horas, ingresos: a.ingresos + r.ingresos, ventas: a.ventas + r.ventas, mensajes: a.mensajes + r.mensajes,
    }), { horas: 0, ingresos: 0, ventas: 0, mensajes: 0 }), [recep])

    const btn = (p: Preset, label: string) => (
        <button onClick={() => aplicarPreset(p)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${preset === p ? 'bg-[#D4E655] text-black' : 'bg-[#111] border border-white/10 text-gray-400 hover:text-white'}`}>{label}</button>
    )

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2">
                        <BarChart3 className="text-[#D4E655]" size={26} /> Métricas
                    </h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Recuento por recepcionista</p>
                </div>
                <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
            </div>

            {/* Filtros de fecha */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                {btn('semana', 'Esta semana')}
                {btn('mes', 'Este mes')}
                {btn('mes_pasado', 'Mes pasado')}
                <div className="flex items-center gap-2 ml-auto">
                    <input type="date" value={desde} max={hasta} onChange={e => { setPreset('custom'); setDesde(e.target.value) }} className="bg-[#111] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200" />
                    <span className="text-gray-500 text-xs">a</span>
                    <input type="date" value={hasta} min={desde} onChange={e => { setPreset('custom'); setHasta(e.target.value) }} className="bg-[#111] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200" />
                </div>
            </div>

            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : recep.length === 0 ? (
                <div className="bg-[#0b0b0d] border border-white/10 rounded-2xl p-10 text-center text-sm text-gray-500">No hay recepcionistas cargadas.</div>
            ) : (
                <>
                    {/* Totales del equipo */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <Tot icon={Clock} label="Horas" v={`${Math.round(tot.horas * 10) / 10} h`} />
                        <Tot icon={DollarSign} label="Ingresos" v={pesos(tot.ingresos)} />
                        <Tot icon={Ticket} label="Ventas de clases" v={String(tot.ventas)} />
                        <Tot icon={MessageCircle} label="Mensajes" v={String(tot.mensajes)} />
                    </div>

                    {/* Comparativa de horas */}
                    <Comparativa titulo="Horas trabajadas" data={recep.map(r => ({ nombre: r.nombre, v: r.horas, label: `${r.horas} h` }))} max={max.horas} />

                    {/* Tarjetas por recep */}
                    <div className="grid md:grid-cols-2 gap-4 mt-6">
                        {recep.map(r => (
                            <div key={r.id} className="bg-[#0b0b0d] border border-white/10 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="min-w-0">
                                        <div className="font-black text-lg truncate">{r.nombre}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-gray-500">{r.rol}{r.sedes.length ? ` · ${r.sedes.join(', ')}` : ''}</div>
                                    </div>
                                    {r.turnosAbiertos > 0 && (
                                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded-full px-2 py-1" title="Turnos que quedaron sin cerrar">
                                            <AlertTriangle size={11} /> {r.turnosAbiertos} sin cerrar
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                                    <Metric icon={Clock} label="Horas" v={`${r.horas} h`} />
                                    <Metric icon={DoorOpen} label="Turnos" v={String(r.turnos)} />
                                    <Metric icon={DollarSign} label="Ingresos" v={pesos(r.ingresos)} />
                                    <Metric icon={Ticket} label="Ventas de clases" v={`${r.ventas} · ${pesos(r.ventasMonto)}`} />
                                    <Metric icon={MessageCircle} label="Mensajes resp." v={String(r.mensajes)} />
                                    <Metric icon={Users} label="Contactos" v={String(r.contactos)} />
                                </div>
                                {/* mini-barras comparativas */}
                                <div className="mt-4 space-y-1.5">
                                    <Mini label="Ingresos" v={r.ingresos} max={max.ingresos} />
                                    <Mini label="Ventas" v={r.ventas} max={max.ventas} />
                                    <Mini label="Mensajes" v={r.mensajes} max={max.mensajes} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-[11px] text-gray-600 mt-6 leading-relaxed">
                        Los datos salen de la actividad real en la página: turnos y horas de caja, plata y ventas registradas en su turno, y mensajes respondidos en Consultas. Las ventas de clases se cuentan por los movimientos de caja de cada turno.
                    </p>
                </>
            )}
        </div>
    )
}

function Tot({ icon: Icon, label, v }: { icon: any; label: string; v: string }) {
    return (
        <div className="bg-[#0b0b0d] border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1"><Icon size={13} /> {label}</div>
            <div className="text-2xl font-black">{v}</div>
        </div>
    )
}

function Metric({ icon: Icon, label, v }: { icon: any; label: string; v: string }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-bold uppercase tracking-widest"><Icon size={12} /> {label}</div>
            <div className="text-sm font-bold mt-0.5">{v}</div>
        </div>
    )
}

function Mini({ label, v, max }: { label: string; v: number; max: number }) {
    const pct = Math.round((v / max) * 100)
    return (
        <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest text-gray-500 w-14 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-[#D4E655]/70 rounded-full" style={{ width: `${pct}%` }} /></div>
        </div>
    )
}

function Comparativa({ titulo, data, max }: { titulo: string; data: { nombre: string; v: number; label: string }[]; max: number }) {
    return (
        <div className="bg-[#0b0b0d] border border-white/10 rounded-2xl p-5">
            <div className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">{titulo}</div>
            <div className="space-y-2.5">
                {data.map((d, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-300 w-32 shrink-0 truncate">{d.nombre}</span>
                        <div className="flex-1 h-5 bg-white/5 rounded-lg overflow-hidden"><div className="h-full bg-[#D4E655] rounded-lg" style={{ width: `${Math.round((d.v / max) * 100)}%` }} /></div>
                        <span className="text-xs font-bold w-16 text-right shrink-0">{d.label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
