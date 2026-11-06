'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2, ScanLine, Check, X, AlertTriangle, Undo2, Camera, Ticket, Minus, Plus, Search, UserCheck } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { getPuertaDataAction, validarTicketPuertaAction, registrarVentaPuertaAction, getPuertaStatsAction, desmarcarTicketPuertaAction, buscarEntradasPuertaAction } from '@/app/actions/eventos'
import { montoServicio, conServicio, SERVICIO_PCT } from '@/utils/servicio'

type Resultado = { estado: string; msg: string; entrada?: string; comprador?: string; usadoAt?: string | null }
const ESTILO: Record<string, { bg: string; icon: any; label: string }> = {
    valida: { bg: 'bg-emerald-500', icon: Check, label: 'VÁLIDA' },
    usada: { bg: 'bg-amber-500', icon: AlertTriangle, label: 'YA USADA' },
    invalida: { bg: 'bg-red-600', icon: X, label: 'NO ENCONTRADA' },
    otro_evento: { bg: 'bg-red-600', icon: X, label: 'OTRO EVENTO' },
    anulada: { bg: 'bg-red-600', icon: X, label: 'ANULADA' },
    error: { bg: 'bg-red-600', icon: X, label: 'ERROR' },
}
const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')

export default function PuertaPage() {
    const params = useParams()
    const qs = useSearchParams()
    const eventoId = params.eventoId as string
    const token = qs.get('t') || ''

    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<'checkin' | 'vender'>('checkin')

    const cargar = async () => {
        const r = await getPuertaDataAction(eventoId, token)
        if (r.ok) setData(r); else setData({ error: (r as any).error })
        setLoading(false)
    }
    useEffect(() => { cargar() }, [eventoId, token])

    // ---- check-in ----
    const [res, setRes] = useState<Resultado | null>(null)
    const [manual, setManual] = useState('')
    const [camError, setCamError] = useState(false)
    const [ultimoOk, setUltimoOk] = useState<{ codigo: string; comprador?: string } | null>(null) // último válido → permite deshacer
    const [deshaciendo, setDeshaciendo] = useState(false)
    // Buscar por nombre (para quien llega sin el QR)
    const [busq, setBusq] = useState('')
    const [resultados, setResultados] = useState<any[]>([])
    const [buscando, setBuscando] = useState(false)
    const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
    const lockRef = useRef(false)
    const audioRef = useRef<AudioContext | null>(null)

    // Sonido corto: agudo = ok, grave doble = error. Así el staff no mira la pantalla.
    const beep = (ok: boolean) => {
        try {
            const AC = (window.AudioContext || (window as any).webkitAudioContext); if (!AC) return
            const ctx = audioRef.current || (audioRef.current = new AC())
            if (ctx.state === 'suspended') ctx.resume().catch(() => { })
            const tono = (freq: number, start: number, dur: number) => {
                const o = ctx.createOscillator(), g = ctx.createGain()
                o.connect(g); g.connect(ctx.destination); o.type = 'square'; o.frequency.value = freq
                g.gain.setValueAtTime(0.0001, ctx.currentTime + start)
                g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + start + 0.01)
                g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
                o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02)
            }
            if (ok) tono(1320, 0, 0.14)
            else { tono(300, 0, 0.16); tono(300, 0.2, 0.16) }
        } catch { }
    }

    const validar = async (codigo: string) => {
        const cod = (codigo || '').trim()
        if (!cod || lockRef.current) return
        if (cod === lastRef.current.code && Date.now() - lastRef.current.at < 3500) return
        lastRef.current = { code: cod, at: Date.now() }
        lockRef.current = true
        try {
            const r = await validarTicketPuertaAction(eventoId, token, cod) as Resultado
            setRes(r)
            const okValida = r.estado === 'valida'
            beep(okValida)
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(okValida ? 120 : [80, 60, 80])
            if (okValida) {
                // Conteo instantáneo (sin recargar toda la data): +1 ingresado.
                setData((d: any) => d ? { ...d, stats: { ...d.stats, usados: (d.stats?.usados || 0) + 1 } } : d)
                setUltimoOk({ codigo: cod, comprador: r.comprador })
            }
        } catch { setRes({ estado: 'error', msg: 'No se pudo validar' }); beep(false) }
        setTimeout(() => { lockRef.current = false }, 900)
    }

    // Deshacer el último check-in válido (por si escanearon de más).
    const deshacer = async () => {
        if (!ultimoOk) return
        setDeshaciendo(true)
        const r = await desmarcarTicketPuertaAction(eventoId, token, ultimoOk.codigo)
        if (r.ok) {
            toast.success('Check-in deshecho')
            setData((d: any) => d ? { ...d, stats: { ...d.stats, usados: Math.max(0, (d.stats?.usados || 0) - 1) } } : d)
            setUltimoOk(null); setRes(null); lastRef.current = { code: '', at: 0 }
        } else toast.error((r as any).error || 'No se pudo deshacer')
        setDeshaciendo(false)
    }

    // Refresco liviano del contador cada 15s (reconcilia si hay varios dispositivos).
    useEffect(() => {
        if (!data || data.error || tab !== 'checkin') return
        const id = setInterval(async () => {
            const r = await getPuertaStatsAction(eventoId, token)
            if (r.ok) setData((d: any) => d ? { ...d, stats: { total: r.total, usados: r.usados } } : d)
        }, 15000)
        return () => clearInterval(id)
    }, [data?.error, tab, eventoId, token])

    // Búsqueda por nombre con debounce.
    useEffect(() => {
        const term = busq.trim()
        if (term.length < 2) { setResultados([]); return }
        setBuscando(true)
        const id = setTimeout(async () => {
            const r = await buscarEntradasPuertaAction(eventoId, token, term)
            setResultados(r.ok ? r.resultados : [])
            setBuscando(false)
        }, 300)
        return () => clearTimeout(id)
    }, [busq, eventoId, token])

    // Ingresar una entrada encontrada por nombre (marca usada + actualiza la lista).
    const ingresarPorNombre = async (codigo: string) => {
        await validar(codigo)
        setResultados(rs => rs.map(r => ({ ...r, tickets: r.tickets.map((t: any) => t.codigo === codigo ? { ...t, usado: true } : t) })))
    }

    useEffect(() => {
        if (!data || data.error || tab !== 'checkin') return
        let scanner: any = null, cancel = false
        ;(async () => {
            try {
                const { Html5Qrcode } = await import('html5-qrcode')
                if (cancel) return
                scanner = new Html5Qrcode('reader')
                await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (txt: string) => validar(txt), () => { })
            } catch { setCamError(true) }
        })()
        return () => { cancel = true; if (scanner) { try { scanner.stop().then(() => scanner.clear()).catch(() => { }) } catch { } } }
    }, [data?.error, tab])

    // ---- vender ----
    const [cant, setCant] = useState<Record<string, number>>({})
    const [comprador, setComprador] = useState('')
    const [medio, setMedio] = useState('efectivo')
    const [vendiendo, setVendiendo] = useState(false)
    const [ultima, setUltima] = useState<{ id: string; token: string } | null>(null)
    const base = data?.entradas ? data.entradas.reduce((s: number, e: any) => s + (cant[e.id] || 0) * e.precio, 0) : 0
    const totalEnt = Object.values(cant).reduce((s: number, n: any) => s + n, 0)
    const setQ = (id: string, delta: number, max: number) => setCant(c => ({ ...c, [id]: Math.max(0, Math.min(max, (c[id] || 0) + delta)) }))

    const vender = async () => {
        const items = (data.entradas || []).map((e: any) => ({ entrada_id: e.id, cantidad: cant[e.id] || 0 })).filter((i: any) => i.cantidad > 0)
        if (!items.length) return toast.error('Elegí al menos una entrada')
        setVendiendo(true)
        const r = await registrarVentaPuertaAction({ eventoId, token, comprador_nombre: comprador, medio_pago: medio, items })
        if (r.ok) { toast.success(`Venta registrada · ${pesos(r.total)}`); setUltima({ id: r.id, token: (r as any).token }); setCant({}); setComprador(''); cargar() }
        else toast.error((r as any).error || 'Error')
        setVendiendo(false)
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
    if (!data || data.error) return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertTriangle size={34} className="opacity-40" />
            <p className="text-sm font-medium text-gray-400">{data?.error || 'Link inválido.'}</p>
        </div>
    )

    const est = res ? ESTILO[res.estado] : null

    return (
        <div className="min-h-screen bg-[#050505] text-white p-4 pb-24">
            <Toaster position="top-center" richColors theme="dark" />
            <div className="max-w-md mx-auto">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#D4E655] mb-1"><Ticket size={13} /> Puerta</div>
                <h1 className="text-2xl font-black tracking-tight">{data.nombre}</h1>

                <div className="mt-4 flex gap-2">
                    <button onClick={() => setTab('checkin')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 ${tab === 'checkin' ? 'bg-[#D4E655] text-black' : 'bg-[#111] border border-white/10 text-gray-300'}`}><ScanLine size={15} /> Check-in</button>
                    <button onClick={() => setTab('vender')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 ${tab === 'vender' ? 'bg-[#D4E655] text-black' : 'bg-[#111] border border-white/10 text-gray-300'}`}><Ticket size={15} /> Vender</button>
                </div>

                {tab === 'checkin' ? (
                    <>
                        <div className="mt-4 bg-[#09090b] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                            <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Ingresados</span>
                            <span className="text-2xl font-black text-[#D4E655]">{data.stats.usados}<span className="text-gray-600 text-lg"> / {data.stats.total}</span></span>
                        </div>
                        {res && est && (
                            <div className={`mt-4 rounded-2xl p-5 text-center ${est.bg}`}>
                                <est.icon size={40} className="mx-auto mb-1" strokeWidth={2.5} />
                                <p className="text-xl font-black tracking-tight">{est.label}</p>
                                <p className="text-sm font-medium opacity-90">{res.msg}</p>
                                {(res.entrada || res.comprador) && <p className="text-sm mt-1 opacity-90">{res.comprador} · {res.entrada}</p>}
                            </div>
                        )}
                        {ultimoOk && (
                            <button onClick={deshacer} disabled={deshaciendo} className="mt-3 w-full flex items-center justify-center gap-2 bg-[#111] border border-white/10 text-gray-300 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wide disabled:opacity-40 hover:text-white">
                                {deshaciendo ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Deshacer último{ultimoOk.comprador ? ` (${ultimoOk.comprador})` : ''}
                            </button>
                        )}
                        <div className="mt-4 bg-[#09090b] border border-white/10 rounded-2xl overflow-hidden">
                            <div id="reader" className="w-full" />
                            {camError && <div className="p-6 text-center text-gray-400 text-sm flex flex-col items-center gap-2"><Camera size={26} className="opacity-40" /> No se pudo abrir la cámara. Usá el código manual.</div>}
                            {!camError && !res && <p className="text-[11px] text-gray-500 text-center pb-3 px-3">Apuntá al QR de la entrada.</p>}
                        </div>
                        <div className="mt-4">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Código manual</p>
                            <div className="flex gap-2">
                                <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { validar(manual); setManual('') } }} placeholder="E-XXXXXXXX-XXXXXX" className="flex-1 bg-[#111] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#D4E655] font-mono" />
                                <button onClick={() => { validar(manual); setManual('') }} disabled={!manual.trim()} className="bg-[#D4E655] text-black font-bold px-4 rounded-xl text-xs uppercase tracking-wide disabled:opacity-40">Validar</button>
                            </div>
                        </div>

                        {/* Buscar por nombre: para quien llega sin el QR */}
                        <div className="mt-4">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Buscar por nombre (sin QR)</p>
                            <div className="relative">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Nombre, mail o teléfono…" className="w-full bg-[#111] border border-white/10 rounded-xl pl-9 pr-8 py-2.5 text-sm text-white outline-none focus:border-[#D4E655]" />
                                {busq && <button onClick={() => setBusq('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={14} /></button>}
                            </div>
                            {buscando && <div className="flex justify-center py-3"><Loader2 size={15} className="animate-spin text-gray-500" /></div>}
                            {!buscando && busq.trim().length >= 2 && resultados.length === 0 && (
                                <p className="text-[11px] text-gray-500 italic px-1 mt-2">Sin resultados. Probá con otro dato.</p>
                            )}
                            <div className="mt-2 space-y-2">
                                {resultados.map((r: any) => (
                                    <div key={r.ventaId} className="bg-[#09090b] border border-white/10 rounded-xl p-3">
                                        <p className="font-bold text-sm truncate mb-1.5">{r.comprador}</p>
                                        <div className="space-y-1.5">
                                            {r.tickets.map((t: any, i: number) => (
                                                <div key={i} className="flex items-center justify-between gap-2">
                                                    <span className="text-[12px] text-gray-300 truncate">{t.entrada}</span>
                                                    {t.usado ? (
                                                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-400 flex items-center gap-1"><Check size={12} /> Ya ingresó</span>
                                                    ) : (
                                                        <button onClick={() => ingresarPorNombre(t.codigo)} className="shrink-0 bg-emerald-500 text-black font-bold text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-lg flex items-center gap-1"><UserCheck size={12} /> Ingresar</button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="mt-4 space-y-3">
                        {data.entradas.map((e: any) => {
                            const agotada = e.disponible <= 0
                            return (
                                <div key={e.id} className={`bg-[#09090b] border border-white/10 rounded-xl p-3 flex items-center gap-3 ${agotada ? 'opacity-50' : ''}`}>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate">{e.nombre}</p>
                                        <p className="text-[11px] text-gray-500">{pesos(e.precio)} {agotada ? '· Agotada' : `· ${e.disponible} disp.`}</p>
                                    </div>
                                    {!agotada && (
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button onClick={() => setQ(e.id, -1, e.disponible)} className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center disabled:opacity-30" disabled={(cant[e.id] || 0) === 0}><Minus size={15} /></button>
                                            <span className="w-6 text-center font-bold">{cant[e.id] || 0}</span>
                                            <button onClick={() => setQ(e.id, 1, e.disponible)} className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center disabled:opacity-30" disabled={(cant[e.id] || 0) >= e.disponible}><Plus size={15} /></button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        <input value={comprador} onChange={e => setComprador(e.target.value)} placeholder="Nombre del comprador (opcional)" className="w-full bg-[#111] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#D4E655]" />
                        <div className="flex items-center gap-2">
                            <select value={medio} onChange={e => setMedio(e.target.value)} className="flex-1 bg-[#111] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none capitalize">
                                {['efectivo', 'transferencia', 'mercadopago'].map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <div className="text-right px-1">
                                <p className="text-[10px] text-gray-500 uppercase">Total {base > 0 && <span className="normal-case">(+{SERVICIO_PCT}% {pesos(montoServicio(base))})</span>}</p>
                                <p className="text-lg font-black text-[#D4E655]">{pesos(conServicio(base))}</p>
                            </div>
                        </div>
                        <button onClick={vender} disabled={vendiendo || totalEnt === 0} className="w-full bg-[#D4E655] text-black font-bold py-3 rounded-xl uppercase text-xs tracking-wide disabled:opacity-40 flex items-center justify-center gap-2">
                            {vendiendo ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Registrar venta ({totalEnt})
                        </button>
                        {ultima?.token && (
                            <a href={`/entradas/${ultima.id}?t=${ultima.token}`} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 bg-[#D4E655]/10 border border-[#D4E655]/30 text-[#D4E655] py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wide"><Ticket size={13} /> Ver entradas con QR</a>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
