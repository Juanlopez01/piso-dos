'use client'

import { useEffect, useState } from 'react'
import { Loader2, Wallet, RefreshCw, Copy, Check, ChevronDown, GraduationCap } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { getPagosLigaAction } from '@/app/actions/liquidaciones'

type Detalle = { id: string; nombre: string; fecha: string; valor: number; pagado: boolean }
type ProfePago = {
    profesor_id: string; nombre: string; alias_cbu: string | null
    clases: number; total: number; pagadas: number; pendientes: number
    montoPagado: number; montoPendiente: number; medio: Record<string, number>; detalle: Detalle[]
}

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
const hoy = new Date()

export default function PagosLigaPage() {
    const [profes, setProfes] = useState<ProfePago[]>([])
    const [loading, setLoading] = useState(true)
    const [anio, setAnio] = useState(hoy.getFullYear())
    const [mes, setMes] = useState(hoy.getMonth() + 1)
    const [abierto, setAbierto] = useState<string | null>(null)
    const [copiado, setCopiado] = useState<string | null>(null)

    const cargar = async () => {
        setLoading(true)
        const r = await getPagosLigaAction(anio, mes)
        if (r.ok) setProfes(r.profes as ProfePago[])
        else toast.error(r.error || 'Error al cargar')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [anio, mes])

    const copiar = async (alias: string, id: string) => {
        try { await navigator.clipboard.writeText(alias); setCopiado(id); toast.success('Alias copiado'); setTimeout(() => setCopiado(null), 1500) }
        catch { toast.error('No se pudo copiar') }
    }

    const cambiarMes = (delta: number) => {
        const d = new Date(anio, mes - 1 + delta, 1)
        setAnio(d.getFullYear()); setMes(d.getMonth() + 1)
    }

    const totalPendiente = profes.reduce((a, p) => a + p.montoPendiente, 0)
    const totalMes = profes.reduce((a, p) => a + p.total, 0)

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2">
                        <GraduationCap className="text-[#D4E655]" size={26} /> Pagos La Liga
                    </h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Profes · a quién y cuánto transferir</p>
                </div>
                <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
            </div>

            {/* Mes */}
            <div className="flex items-center gap-2 mb-6">
                <button onClick={() => cambiarMes(-1)} className="px-3 py-1.5 rounded-lg bg-[#111] border border-white/10 text-gray-400 hover:text-white text-sm">←</button>
                <div className="px-4 py-1.5 rounded-lg bg-[#111] border border-white/10 text-sm font-bold min-w-[150px] text-center">{MESES[mes - 1]} {anio}</div>
                <button onClick={() => cambiarMes(1)} className="px-3 py-1.5 rounded-lg bg-[#111] border border-white/10 text-gray-400 hover:text-white text-sm">→</button>
            </div>

            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : profes.length === 0 ? (
                <div className="bg-[#0b0b0d] border border-white/10 rounded-2xl p-10 text-center text-sm text-gray-500">No hay clases de La Liga en {MESES[mes - 1]}.</div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="bg-[#0b0b0d] border border-white/10 rounded-2xl p-4">
                            <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total del mes</div>
                            <div className="text-2xl font-black">{pesos(totalMes)}</div>
                        </div>
                        <div className="bg-[#0b0b0d] border border-amber-500/30 rounded-2xl p-4">
                            <div className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest mb-1">Falta pagar</div>
                            <div className="text-2xl font-black text-amber-400">{pesos(totalPendiente)}</div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {profes.map(p => {
                            const exp = abierto === p.profesor_id
                            const medios = Object.entries(p.medio)
                            return (
                                <div key={p.profesor_id} className="bg-[#0b0b0d] border border-white/10 rounded-2xl overflow-hidden">
                                    <div className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-black text-lg truncate">{p.nombre}</div>
                                                <div className="text-[11px] text-gray-500">{p.clases} clase{p.clases === 1 ? '' : 's'} · {p.pagadas} pagada{p.pagadas === 1 ? '' : 's'} · {p.pendientes} pendiente{p.pendientes === 1 ? '' : 's'}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-lg font-black">{pesos(p.total)}</div>
                                                {p.montoPendiente > 0
                                                    ? <div className="text-[11px] font-bold text-amber-400">Falta {pesos(p.montoPendiente)}</div>
                                                    : <div className="text-[11px] font-bold text-[#D4E655]">Todo pagado ✓</div>}
                                            </div>
                                        </div>

                                        {/* Alias / CBU */}
                                        <div className="mt-3 flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
                                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest shrink-0">Alias / CBU</span>
                                            {p.alias_cbu ? (
                                                <>
                                                    <span className="font-mono text-sm text-[#D4E655] break-all flex-1">{p.alias_cbu}</span>
                                                    <button onClick={() => copiar(p.alias_cbu!, p.profesor_id)} className="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300" title="Copiar alias">
                                                        {copiado === p.profesor_id ? <Check size={14} className="text-[#D4E655]" /> : <Copy size={14} />}
                                                    </button>
                                                </>
                                            ) : <span className="text-sm text-gray-500 italic flex-1">El profe no cargó su alias en su perfil</span>}
                                        </div>

                                        {medios.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {medios.map(([m, v]) => (
                                                    <span key={m} className="text-[10px] font-bold uppercase tracking-wide bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-gray-300">Pagado {m}: {pesos(v)}</span>
                                                ))}
                                            </div>
                                        )}

                                        <button onClick={() => setAbierto(exp ? null : p.profesor_id)} className="mt-3 flex items-center gap-1 text-[11px] font-bold text-gray-400 hover:text-white">
                                            <ChevronDown size={13} className={`transition-transform ${exp ? 'rotate-180' : ''}`} /> {exp ? 'Ocultar' : 'Ver'} clases
                                        </button>
                                    </div>

                                    {exp && (
                                        <div className="border-t border-white/10 divide-y divide-white/5">
                                            {p.detalle.map(d => (
                                                <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                                    <span className="text-gray-300 truncate">{fmtDia(d.fecha)} · {d.nombre}</span>
                                                    <span className="flex items-center gap-2 shrink-0">
                                                        <span className="font-bold">{pesos(d.valor)}</span>
                                                        {d.pagado
                                                            ? <span className="text-[9px] font-black uppercase bg-[#D4E655]/15 text-[#D4E655] rounded-full px-2 py-0.5">Pagada</span>
                                                            : <span className="text-[9px] font-black uppercase bg-amber-500/15 text-amber-400 rounded-full px-2 py-0.5">Pendiente</span>}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    <p className="text-[11px] text-gray-600 mt-6 leading-relaxed">
                        El alias/CBU lo carga cada profe en su perfil. El estado (pagada/pendiente) y el medio salen de las liquidaciones de caja. Para registrar un pago seguís usando Liquidaciones; acá tenés a mano a quién transferir y cuánto.
                    </p>
                </>
            )}
        </div>
    )
}
