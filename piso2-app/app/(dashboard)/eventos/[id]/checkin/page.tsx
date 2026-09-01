'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft, ScanLine, Check, X, AlertTriangle, Undo2, Camera } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { validarTicketAction, desmarcarTicketAction, getCheckinStatsAction } from '@/app/actions/eventos'

type Resultado = { estado: 'valida' | 'usada' | 'invalida' | 'otro_evento' | 'anulada' | 'error'; msg: string; entrada?: string; comprador?: string; usadoAt?: string | null; codigo?: string }

const ESTILO: Record<string, { bg: string; icon: any; label: string }> = {
    valida: { bg: 'bg-emerald-500', icon: Check, label: 'VÁLIDA' },
    usada: { bg: 'bg-amber-500', icon: AlertTriangle, label: 'YA USADA' },
    invalida: { bg: 'bg-red-600', icon: X, label: 'NO ENCONTRADA' },
    otro_evento: { bg: 'bg-red-600', icon: X, label: 'OTRO EVENTO' },
    anulada: { bg: 'bg-red-600', icon: X, label: 'ANULADA' },
    error: { bg: 'bg-red-600', icon: X, label: 'ERROR' },
}

export default function CheckinPage() {
    const params = useParams()
    const eventoId = params.id as string
    const [stats, setStats] = useState<{ nombre: string; total: number; usados: number }>({ nombre: '', total: 0, usados: 0 })
    const [res, setRes] = useState<Resultado | null>(null)
    const [manual, setManual] = useState('')
    const [camError, setCamError] = useState(false)
    const [procesando, setProcesando] = useState(false)
    const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
    const lockRef = useRef(false)

    const cargarStats = async () => {
        const r = await getCheckinStatsAction(eventoId)
        if (r.ok) setStats({ nombre: r.nombre, total: r.total, usados: r.usados })
    }

    const validar = async (codigo: string) => {
        const cod = (codigo || '').trim()
        if (!cod || lockRef.current) return
        // Evitar reprocesar el mismo QR en ráfaga
        if (cod === lastRef.current.code && Date.now() - lastRef.current.at < 3500) return
        lastRef.current = { code: cod, at: Date.now() }
        lockRef.current = true
        setProcesando(true)
        try {
            const r = await validarTicketAction(eventoId, cod)
            setRes({ ...r, codigo: cod })
            if (r.estado === 'valida' && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(120)
            await cargarStats()
        } catch { setRes({ estado: 'error', msg: 'No se pudo validar' }) }
        setProcesando(false)
        setTimeout(() => { lockRef.current = false }, 900)
    }

    const deshacer = async () => {
        if (!res?.codigo) return
        const r = await desmarcarTicketAction(res.codigo)
        if (r.ok) { toast.success('Check-in deshecho'); setRes(null); lastRef.current = { code: '', at: 0 }; cargarStats() }
        else toast.error(r.error || 'Error')
    }

    useEffect(() => {
        cargarStats()
        let scanner: any = null
        let cancel = false
            ; (async () => {
                try {
                    const { Html5Qrcode } = await import('html5-qrcode')
                    if (cancel) return
                    scanner = new Html5Qrcode('reader')
                    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } },
                        (txt: string) => { validar(txt) }, () => { })
                } catch { setCamError(true) }
            })()
        return () => { cancel = true; if (scanner) { try { scanner.stop().then(() => scanner.clear()).catch(() => { }) } catch { } } }
    }, [eventoId])

    const est = res ? ESTILO[res.estado] : null

    return (
        <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8 pb-24">
            <Toaster position="top-center" richColors theme="dark" />
            <Link href="/eventos" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide mb-4"><ArrowLeft size={15} /> Volver a eventos</Link>

            <div className="max-w-md mx-auto">
                <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><ScanLine className="text-[#D4E655]" size={24} /> Check-in</h1>
                <p className="text-sm text-gray-400 mt-1">{stats.nombre}</p>

                {/* contador */}
                <div className="mt-4 bg-[#09090b] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Ingresados</span>
                    <span className="text-2xl font-black text-[#D4E655]">{stats.usados}<span className="text-gray-600 text-lg"> / {stats.total}</span></span>
                </div>

                {/* resultado */}
                {res && est && (
                    <div className={`mt-4 rounded-2xl p-5 text-center ${est.bg}`}>
                        <est.icon size={40} className="mx-auto mb-1" strokeWidth={2.5} />
                        <p className="text-xl font-black tracking-tight">{est.label}</p>
                        <p className="text-sm font-medium opacity-90">{res.msg}</p>
                        {(res.entrada || res.comprador) && <p className="text-sm mt-1 opacity-90">{res.comprador} · {res.entrada}</p>}
                        {res.estado === 'usada' && res.usadoAt && <p className="text-[11px] mt-1 opacity-80">Usada: {new Date(res.usadoAt).toLocaleString('es-AR')}</p>}
                        {res.estado === 'valida' && (
                            <button onClick={deshacer} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide bg-black/25 hover:bg-black/40 px-3 py-1.5 rounded-lg"><Undo2 size={13} /> Deshacer</button>
                        )}
                    </div>
                )}

                {/* cámara */}
                <div className="mt-4 bg-[#09090b] border border-white/10 rounded-2xl overflow-hidden">
                    <div id="reader" className="w-full" />
                    {camError && (
                        <div className="p-6 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                            <Camera size={26} className="opacity-40" />
                            No se pudo abrir la cámara. Usá el código manual abajo.
                        </div>
                    )}
                    {!camError && !res && <p className="text-[11px] text-gray-500 text-center pb-3 px-3">Apuntá al QR de la entrada.</p>}
                </div>

                {/* manual */}
                <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Código manual</p>
                    <div className="flex gap-2">
                        <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { validar(manual); setManual('') } }}
                            placeholder="E-XXXXXXXX-XXXXXX" className="flex-1 bg-[#111] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#D4E655] font-mono" />
                        <button onClick={() => { validar(manual); setManual('') }} disabled={procesando || !manual.trim()} className="bg-[#D4E655] text-black font-bold px-4 rounded-xl text-xs uppercase tracking-wide disabled:opacity-40">
                            {procesando ? <Loader2 size={16} className="animate-spin" /> : 'Validar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
