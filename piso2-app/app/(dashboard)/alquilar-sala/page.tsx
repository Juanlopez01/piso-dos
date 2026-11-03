'use client'

// Alquiler de sala — AUTOSERVICIO para el usuario logueado de 2M.
// Wizard 3 pasos (Sala/fecha → Horario → Confirmar), disponibilidad en vivo
// (clases + alquileres + obras) y pago de la SEÑA (50%) por MP que guarda la sala.

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import { Loader2, Calendar, Clock, MapPin, CheckCircle2, ArrowRight, ArrowLeft, Users } from 'lucide-react'
import { getSalasAlquilerAction, getOcupacionAlquilerAction, crearReservaAlquilerAction, getMiReservaAlquilerAction } from '@/app/actions/alquileres-online'
import { montoAlquiler, senaDe } from '@/lib/alquiler-tarifa'

type Sala = any
const ACTIVIDADES = [{ k: 'ensayo', l: 'Ensayo' }, { k: 'clase', l: 'Clase' }, { k: 'produccion', l: 'Producción' }]
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const APERTURA = 8 * 60, CIERRE = 23 * 60 // 08:00–23:00, bloques de 30'

function hoyAR(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// Minutos del día actual en hora AR (para no ofrecer horarios ya pasados si la fecha es hoy).
function ahoraMinAR(): number {
    const [h, m] = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number)
    return h * 60 + (m || 0)
}

function AlquilarContent() {
    const params = useSearchParams()
    const [salas, setSalas] = useState<Sala[]>([])
    const [loading, setLoading] = useState(true)
    const [step, setStep] = useState(1)

    const [salaId, setSalaId] = useState('')
    const [tipoUso, setTipoUso] = useState('ensayo')
    const [fecha, setFecha] = useState('')
    const [personas, setPersonas] = useState(1)
    const [horaInicio, setHoraInicio] = useState('')
    const [duracion, setDuracion] = useState(60) // minutos
    const [ocup, setOcup] = useState<{ ini: string; fin: string; motivo: string }[]>([])
    const [creando, setCreando] = useState(false)

    // Resultado de MP al volver (?pago=ok&id=)
    const [reservaOk, setReservaOk] = useState<any | null>(null)

    const sala = useMemo(() => salas.find(s => s.id === salaId), [salas, salaId])

    useEffect(() => { (async () => { setSalas(await getSalasAlquilerAction()); setLoading(false) })() }, [])

    // Volvió del pago: mostrar confirmación / aviso.
    useEffect(() => {
        const pago = params.get('pago'); const id = params.get('id')
        if (!pago || !id) return
        if (pago === 'ok') { getMiReservaAlquilerAction(id).then(r => { if (r) setReservaOk(r) }) }
        else if (pago === 'pendiente') toast.info('Tu pago quedó pendiente. Cuando se acredite, te guardamos la sala.')
        else if (pago === 'error') toast.error('El pago no se completó. Probá de nuevo.')
    }, [params])

    // Traer ocupación al elegir sala + fecha.
    useEffect(() => {
        if (!salaId || !fecha) { setOcup([]); return }
        getOcupacionAlquilerAction(salaId, fecha).then(setOcup)
        setHoraInicio('')
    }, [salaId, fecha])

    const ocupMin = useMemo(() => ocup.map(o => ({ ini: toMin(o.ini), fin: toMin(o.fin), motivo: o.motivo })), [ocup])
    const libre = (ini: number, fin: number) => !ocupMin.some(o => ini < o.fin && fin > o.ini)

    // Horas de inicio posibles (con al menos 1h libre por delante).
    // Si la fecha es hoy, no ofrecer horarios que ya pasaron (mín. 1h de anticipación).
    const inicios = useMemo(() => {
        const minDesde = fecha === hoyAR() ? ahoraMinAR() + 60 : 0
        const arr: string[] = []
        for (let m = APERTURA; m <= CIERRE - 60; m += 30) if (m >= minDesde && libre(m, m + 60)) arr.push(toHHMM(m))
        return arr
    }, [ocupMin, fecha])

    // Duraciones posibles desde la hora de inicio elegida.
    const duraciones = useMemo(() => {
        if (!horaInicio) return []
        const start = toMin(horaInicio); const out: number[] = []
        for (let d = 60; start + d <= CIERRE; d += 30) { if (libre(start, start + d)) out.push(d); else break }
        return out
    }, [horaInicio, ocupMin])

    const horaFin = horaInicio ? toHHMM(toMin(horaInicio) + duracion) : ''
    const monto = sala && fecha && horaInicio ? montoAlquiler(sala, tipoUso, fecha, horaInicio, horaFin) : 0
    const sena = senaDe(monto)
    const durLabel = (d: number) => d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h 30min`

    const reservarYPagar = async () => {
        if (!salaId || !fecha || !horaInicio) return toast.error('Completá la reserva.')
        setCreando(true)
        const r = await crearReservaAlquilerAction({ salaId, tipoUso, fecha, horaInicio, horaFin, personas })
        if (!r.ok || !r.alquilerId) { toast.error(r.error || 'No se pudo crear la reserva.'); setCreando(false); return }
        try {
            const resp = await fetch('/api/mercadopago/alquiler-preference', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alquilerId: r.alquilerId, concepto: 'sena' }),
            })
            const data = await resp.json()
            if (data.url) { window.location.href = data.url; return }
            toast.error(data.error || 'No se pudo iniciar el pago.')
        } catch { toast.error('No se pudo iniciar el pago.') }
        setCreando(false)
    }

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-white/40" /></div>

    // Pantalla de éxito tras pagar la seña.
    if (reservaOk) {
        const s = Array.isArray(reservaOk.sala) ? reservaOk.sala[0] : reservaOk.sala
        const saldo = Number(reservaOk.monto_total || 0) - Number(reservaOk.monto_pagado || 0)
        return (
            <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center px-6 text-center">
                <CheckCircle2 size={48} className="text-[#D4E655]" />
                <h1 className="text-2xl font-black uppercase tracking-tight mt-4">¡Sala reservada!</h1>
                <p className="text-white/60 text-sm mt-2 max-w-sm">
                    {s?.nombre}{s?.sede?.nombre ? ` · ${s.sede.nombre}` : ''} · {reservaOk.fecha} · {String(reservaOk.hora_inicio).slice(0, 5)}–{String(reservaOk.hora_fin).slice(0, 5)}.
                </p>
                <p className="text-white/60 text-sm mt-1">Seña pagada: <b className="text-white">${Number(reservaOk.monto_pagado).toLocaleString('es-AR')}</b>{saldo > 0 && <> · Saldo: <b className="text-white">${saldo.toLocaleString('es-AR')}</b> (lo pagás online o en el lugar).</>}</p>
                <a href="/alquilar-sala" className="mt-8 bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs px-6 py-3 rounded-xl">Reservar otra</a>
            </div>
        )
    }

    const Paso = ({ n, label }: { n: number; label: string }) => (
        <div className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-widest ${step === n ? 'text-[#D4E655]' : step > n ? 'text-white/60' : 'text-white/30'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= n ? 'bg-[#D4E655] text-black' : 'bg-white/10'}`}>{n}</span>{label}
        </div>
    )

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            <Toaster position="top-center" richColors theme="dark" />
            <div className="max-w-2xl mx-auto px-5 py-8">
                <h1 className="text-3xl font-black uppercase tracking-tighter mb-1">Reservá la sala</h1>
                <p className="text-white/40 text-sm mb-6">Elegí sala y horario, y guardás tu lugar con una seña del 50%.</p>

                <div className="flex items-center gap-4 mb-8">
                    <Paso n={1} label="Sala y fecha" /><div className="flex-1 h-px bg-white/10" />
                    <Paso n={2} label="Horario" /><div className="flex-1 h-px bg-white/10" />
                    <Paso n={3} label="Confirmar" />
                </div>

                {/* PASO 1 */}
                {step === 1 && (
                    <div className="space-y-5">
                        <div>
                            <label className="text-[10px] font-black tracking-widest uppercase text-white/50 block mb-2"><MapPin size={12} className="inline mr-1" /> Sala</label>
                            <div className="grid sm:grid-cols-2 gap-2">
                                {salas.map(s => (
                                    <button key={s.id} onClick={() => setSalaId(s.id)} className={`text-left border rounded-xl px-4 py-3 transition-colors ${salaId === s.id ? 'border-[#D4E655] bg-[#D4E655]/10' : 'border-white/10 hover:border-white/30'}`}>
                                        <div className="text-sm font-semibold">{s.nombre}</div>
                                        <div className="text-[11px] text-white/40">{s.sede?.nombre || ''}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black tracking-widest uppercase text-white/50 block mb-2">Actividad</label>
                            <div className="flex gap-2">
                                {ACTIVIDADES.map(a => (
                                    <button key={a.k} onClick={() => setTipoUso(a.k)} className={`px-4 py-2 rounded-lg text-sm transition-colors ${tipoUso === a.k ? 'bg-[#D4E655] text-black font-bold' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>{a.l}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black tracking-widest uppercase text-white/50 block mb-2"><Calendar size={12} className="inline mr-1" /> Fecha</label>
                            <input type="date" min={hoyAR()} value={fecha} onChange={e => setFecha(e.target.value)} className="bg-[#141417] border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#D4E655]/60 [color-scheme:dark]" />
                        </div>
                        <button disabled={!salaId || !fecha} onClick={() => setStep(2)} className="w-full bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs py-4 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">Continuar <ArrowRight size={16} /></button>
                    </div>
                )}

                {/* PASO 2 */}
                {step === 2 && (
                    <div className="space-y-5">
                        <button onClick={() => setStep(1)} className="text-white/50 text-xs flex items-center gap-1 hover:text-white"><ArrowLeft size={13} /> Cambiar sala/fecha</button>
                        <div className="text-sm text-white/70">{sala?.nombre} · {fecha}</div>

                        <div>
                            <label className="text-[10px] font-black tracking-widest uppercase text-white/50 block mb-2"><Users size={12} className="inline mr-1" /> Personas</label>
                            <input type="number" min={1} max={50} value={personas} onChange={e => setPersonas(Math.max(1, Number(e.target.value) || 1))} className="bg-[#141417] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white w-24 outline-none focus:border-[#D4E655]/60" />
                        </div>

                        <div>
                            <label className="text-[10px] font-black tracking-widest uppercase text-white/50 block mb-2"><Clock size={12} className="inline mr-1" /> Hora de inicio</label>
                            {inicios.length === 0 ? <p className="text-sm text-white/40">No hay horarios libres ese día. Probá otra fecha o sala.</p> : (
                                <div className="flex flex-wrap gap-2">
                                    {inicios.map(h => (
                                        <button key={h} onClick={() => { setHoraInicio(h); setDuracion(60) }} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${horaInicio === h ? 'bg-[#D4E655] text-black font-bold' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>{h}</button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {horaInicio && (
                            <div>
                                <label className="text-[10px] font-black tracking-widest uppercase text-white/50 block mb-2">Duración</label>
                                <div className="flex flex-wrap gap-2">
                                    {duraciones.map(d => (
                                        <button key={d} onClick={() => setDuracion(d)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${duracion === d ? 'bg-[#D4E655] text-black font-bold' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
                                            {durLabel(d)} <span className="opacity-60">· {toHHMM(toMin(horaInicio))}–{toHHMM(toMin(horaInicio) + d)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {ocup.length > 0 && (
                            <p className="text-[11px] text-white/40">Ocupado ese día: {ocup.map(o => `${o.ini}–${o.fin} (${o.motivo})`).join(' · ')}</p>
                        )}

                        {monto > 0 && (
                            <div className="bg-[#111113] border border-white/10 rounded-xl p-4 flex items-center justify-between">
                                <div><div className="text-sm">{durLabel(duracion)} · {toHHMM(toMin(horaInicio))}–{horaFin}</div><div className="text-[11px] text-white/40">Total ${monto.toLocaleString('es-AR')} · Seña 50%</div></div>
                                <div className="text-right"><div className="text-[10px] uppercase tracking-widest text-white/40">Seña</div><div className="text-xl font-black text-[#D4E655]">${sena.toLocaleString('es-AR')}</div></div>
                            </div>
                        )}

                        <button disabled={!horaInicio || monto <= 0} onClick={() => setStep(3)} className="w-full bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs py-4 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">Continuar <ArrowRight size={16} /></button>
                    </div>
                )}

                {/* PASO 3 */}
                {step === 3 && (
                    <div className="space-y-5">
                        <button onClick={() => setStep(2)} className="text-white/50 text-xs flex items-center gap-1 hover:text-white"><ArrowLeft size={13} /> Cambiar horario</button>
                        <div className="bg-[#111113] border border-white/10 rounded-xl p-5 space-y-2">
                            <h2 className="text-sm font-black uppercase tracking-wider text-white/50 mb-2">Tu reserva</h2>
                            <Row k="Sala" v={`${sala?.nombre}${sala?.sede?.nombre ? ' · ' + sala.sede.nombre : ''}`} />
                            <Row k="Actividad" v={ACTIVIDADES.find(a => a.k === tipoUso)?.l || tipoUso} />
                            <Row k="Fecha" v={fecha} />
                            <Row k="Horario" v={`${toHHMM(toMin(horaInicio))}–${horaFin} (${durLabel(duracion)})`} />
                            <Row k="Personas" v={String(personas)} />
                            <div className="h-px bg-white/10 my-2" />
                            <Row k="Total" v={`$${monto.toLocaleString('es-AR')}`} />
                            <Row k="Seña a pagar ahora (50%)" v={`$${sena.toLocaleString('es-AR')}`} strong />
                            <Row k="Saldo" v={`$${(monto - sena).toLocaleString('es-AR')} (online o en el lugar)`} />
                        </div>
                        <p className="text-[11px] text-white/40">Al pagar la seña te guardamos la sala. Cancelación gratis hasta 48hs antes; dentro de las 48hs la seña no se devuelve.</p>
                        <button disabled={creando} onClick={reservarYPagar} className="w-full bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs py-4 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                            {creando ? <Loader2 size={15} className="animate-spin" /> : null} Pagar seña y reservar
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
    return <div className="flex items-center justify-between text-sm"><span className="text-white/50">{k}</span><span className={strong ? 'font-black text-[#D4E655]' : 'text-white/90'}>{v}</span></div>
}

export default function AlquilarSalaPage() {
    return <Suspense fallback={<div className="p-10 flex justify-center"><Loader2 className="animate-spin text-white/40" /></div>}><AlquilarContent /></Suspense>
}
