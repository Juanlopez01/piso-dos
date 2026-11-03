'use client'

// Alquiler de sala — AUTOSERVICIO para el usuario logueado de 2M.
// Fase 2: pestañas "Reservar" / "Mis reservas". Reservar permite multi-día (carrito,
// una sola seña por grupo). Mis reservas: pagar saldo online y cancelar (política 48hs).

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import { Loader2, Calendar, Clock, MapPin, CheckCircle2, ArrowRight, ArrowLeft, Users, Plus, Trash2, CalendarClock } from 'lucide-react'
import {
    getSalasAlquilerAction, getOcupacionAlquilerAction, crearReservasAlquilerGrupoAction,
    getMiReservaAlquilerAction, getMisReservasAlquilerAction, cancelarReservaAlquilerAction,
    type MiReservaAlquiler,
} from '@/app/actions/alquileres-online'
import { montoAlquiler, senaDe } from '@/lib/alquiler-tarifa'

type Sala = any
type CartItem = {
    salaId: string; salaNombre: string; sedeNombre: string; tipoUso: string
    fecha: string; horaInicio: string; horaFin: string; personas: number; monto: number; sena: number
}
const ACTIVIDADES = [{ k: 'ensayo', l: 'Ensayo' }, { k: 'clase', l: 'Clase' }, { k: 'produccion', l: 'Producción' }]
const ACT_LABEL = (k: string) => ACTIVIDADES.find(a => a.k === k)?.l || k
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const APERTURA = 8 * 60, CIERRE = 23 * 60 // 08:00–23:00, bloques de 30'
const $ = (n: number) => `$${Number(n).toLocaleString('es-AR')}`

function hoyAR(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function ahoraMinAR(): number {
    const [h, m] = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number)
    return h * 60 + (m || 0)
}

function AlquilarContent() {
    const params = useSearchParams()
    const [vista, setVista] = useState<'reservar' | 'mis'>('reservar')
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

    const [carrito, setCarrito] = useState<CartItem[]>([])

    // Resultado de MP al volver (?pago=ok&id= / &group=)
    const [reservaOk, setReservaOk] = useState<any | null | 'grupo'>(null)

    const sala = useMemo(() => salas.find(s => s.id === salaId), [salas, salaId])

    useEffect(() => { (async () => { setSalas(await getSalasAlquilerAction()); setLoading(false) })() }, [])

    // Volvió del pago.
    useEffect(() => {
        const pago = params.get('pago'); const id = params.get('id'); const group = params.get('group')
        if (!pago) return
        if (pago === 'ok') {
            if (id) getMiReservaAlquilerAction(id).then(r => { if (r) setReservaOk(r) })
            else if (group) setReservaOk('grupo')
        }
        else if (pago === 'pendiente') toast.info('Tu pago quedó pendiente. Cuando se acredite, te guardamos la sala.')
        else if (pago === 'error') toast.error('El pago no se completó. Probá de nuevo.')
    }, [params])

    useEffect(() => {
        if (!salaId || !fecha) { setOcup([]); return }
        getOcupacionAlquilerAction(salaId, fecha).then(setOcup)
        setHoraInicio('')
    }, [salaId, fecha])

    const ocupMin = useMemo(() => ocup.map(o => ({ ini: toMin(o.ini), fin: toMin(o.fin), motivo: o.motivo })), [ocup])
    // Slots ya en el carrito para esta sala+fecha también ocupan.
    const ocupConCarrito = useMemo(() => {
        const extra = carrito.filter(c => c.salaId === salaId && c.fecha === fecha).map(c => ({ ini: toMin(c.horaInicio), fin: toMin(c.horaFin), motivo: 'En tu carrito' }))
        return [...ocupMin, ...extra]
    }, [ocupMin, carrito, salaId, fecha])
    const libre = (ini: number, fin: number) => !ocupConCarrito.some(o => ini < o.fin && fin > o.ini)

    const inicios = useMemo(() => {
        const minDesde = fecha === hoyAR() ? ahoraMinAR() + 60 : 0
        const arr: string[] = []
        for (let m = APERTURA; m <= CIERRE - 60; m += 30) if (m >= minDesde && libre(m, m + 60)) arr.push(toHHMM(m))
        return arr
    }, [ocupConCarrito, fecha])

    const duraciones = useMemo(() => {
        if (!horaInicio) return []
        const start = toMin(horaInicio); const out: number[] = []
        for (let d = 60; start + d <= CIERRE; d += 30) { if (libre(start, start + d)) out.push(d); else break }
        return out
    }, [horaInicio, ocupConCarrito])

    const horaFin = horaInicio ? toHHMM(toMin(horaInicio) + duracion) : ''
    const monto = sala && fecha && horaInicio ? montoAlquiler(sala, tipoUso, fecha, horaInicio, horaFin) : 0
    const sena = senaDe(monto)
    const durLabel = (d: number) => d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h 30min`

    const totalSenaCarrito = carrito.reduce((s, c) => s + c.sena, 0)
    const totalMontoCarrito = carrito.reduce((s, c) => s + c.monto, 0)

    // Agrega el slot configurado al carrito y vuelve al paso 1 para elegir otro.
    const agregarAlCarrito = (irAConfirmar: boolean) => {
        if (!sala || !fecha || !horaInicio || monto <= 0) return toast.error('Completá la reserva.')
        const item: CartItem = {
            salaId, salaNombre: sala.nombre, sedeNombre: sala.sede?.nombre || '', tipoUso,
            fecha, horaInicio, horaFin, personas, monto, sena,
        }
        setCarrito(c => [...c, item])
        setFecha(''); setHoraInicio(''); setDuracion(60)
        setStep(irAConfirmar ? 3 : 1)
    }
    const quitarDelCarrito = (i: number) => setCarrito(c => c.filter((_, j) => j !== i))

    const pagarCarrito = async () => {
        if (!carrito.length) return toast.error('Agregá al menos una fecha.')
        setCreando(true)
        const r = await crearReservasAlquilerGrupoAction(carrito.map(c => ({
            salaId: c.salaId, tipoUso: c.tipoUso, fecha: c.fecha, horaInicio: c.horaInicio, horaFin: c.horaFin, personas: c.personas,
        })))
        if (!r.ok) { toast.error(r.error || 'No se pudo crear la reserva.'); setCreando(false); return }
        try {
            const body = r.groupId ? { groupId: r.groupId } : { alquilerId: r.alquilerIds?.[0], concepto: 'sena' }
            const resp = await fetch('/api/mercadopago/alquiler-preference', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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
        const esGrupo = reservaOk === 'grupo'
        const s = !esGrupo && (Array.isArray(reservaOk.sala) ? reservaOk.sala[0] : reservaOk.sala)
        const saldo = !esGrupo ? Number(reservaOk.monto_total || 0) - Number(reservaOk.monto_pagado || 0) : 0
        return (
            <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center px-6 text-center">
                <CheckCircle2 size={48} className="text-[#D4E655]" />
                <h1 className="text-2xl font-black uppercase tracking-tight mt-4">{esGrupo ? '¡Reservas confirmadas!' : '¡Sala reservada!'}</h1>
                {esGrupo
                    ? <p className="text-white/60 text-sm mt-2 max-w-sm">Te guardamos todas tus fechas. Podés ver el detalle y el saldo en "Mis reservas".</p>
                    : <>
                        <p className="text-white/60 text-sm mt-2 max-w-sm">{s?.nombre}{s?.sede?.nombre ? ` · ${s.sede.nombre}` : ''} · {reservaOk.fecha} · {String(reservaOk.hora_inicio).slice(0, 5)}–{String(reservaOk.hora_fin).slice(0, 5)}.</p>
                        <p className="text-white/60 text-sm mt-1">Seña pagada: <b className="text-white">{$(Number(reservaOk.monto_pagado))}</b>{saldo > 0 && <> · Saldo: <b className="text-white">{$(saldo)}</b> (lo pagás online o en el lugar).</>}</p>
                    </>}
                <button onClick={() => { setReservaOk(null); setCarrito([]); setStep(1); setVista('mis'); history.replaceState(null, '', '/alquilar-sala') }}
                    className="mt-8 bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs px-6 py-3 rounded-xl">Ver mis reservas</button>
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
                <h1 className="text-3xl font-black uppercase tracking-tighter mb-1">Alquilar sala</h1>

                {/* Pestañas */}
                <div className="flex gap-2 mt-4 mb-6">
                    {([['reservar', 'Reservar'], ['mis', 'Mis reservas']] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setVista(k)}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-colors ${vista === k ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>{l}</button>
                    ))}
                </div>

                {vista === 'mis' ? <MisReservas /> : <>
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
                            <div className="flex gap-2">
                                <button disabled={!salaId || !fecha} onClick={() => setStep(2)} className="flex-1 bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs py-4 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">Continuar <ArrowRight size={16} /></button>
                                {carrito.length > 0 && <button onClick={() => setStep(3)} className="px-5 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs rounded-xl flex items-center gap-2"><CalendarClock size={15} /> Ver ({carrito.length})</button>}
                            </div>
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

                            {ocup.length > 0 && <p className="text-[11px] text-white/40">Ocupado ese día: {ocup.map(o => `${o.ini}–${o.fin} (${o.motivo})`).join(' · ')}</p>}

                            {monto > 0 && (
                                <div className="bg-[#111113] border border-white/10 rounded-xl p-4 flex items-center justify-between">
                                    <div><div className="text-sm">{durLabel(duracion)} · {toHHMM(toMin(horaInicio))}–{horaFin}</div><div className="text-[11px] text-white/40">Total {$(monto)} · Seña 50%</div></div>
                                    <div className="text-right"><div className="text-[10px] uppercase tracking-widest text-white/40">Seña</div><div className="text-xl font-black text-[#D4E655]">{$(sena)}</div></div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button disabled={!horaInicio || monto <= 0} onClick={() => agregarAlCarrito(true)} className="flex-1 bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs py-4 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">Continuar <ArrowRight size={16} /></button>
                                <button disabled={!horaInicio || monto <= 0} onClick={() => agregarAlCarrito(false)} className="px-5 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs rounded-xl disabled:opacity-40 flex items-center gap-2"><Plus size={15} /> Otra fecha</button>
                            </div>
                        </div>
                    )}

                    {/* PASO 3 — carrito */}
                    {step === 3 && (
                        <div className="space-y-5">
                            <div className="bg-[#111113] border border-white/10 rounded-xl p-5 space-y-3">
                                <h2 className="text-sm font-black uppercase tracking-wider text-white/50">Tu reserva{carrito.length > 1 ? 's' : ''}</h2>
                                {carrito.length === 0 && <p className="text-sm text-white/40">Todavía no agregaste ninguna fecha.</p>}
                                {carrito.map((c, i) => (
                                    <div key={i} className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
                                        <div className="text-sm">
                                            <div className="font-semibold">{c.salaNombre}{c.sedeNombre ? ` · ${c.sedeNombre}` : ''}</div>
                                            <div className="text-[11px] text-white/50">{ACT_LABEL(c.tipoUso)} · {c.fecha} · {c.horaInicio}–{c.horaFin} · {c.personas} pers.</div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right"><div className="text-[10px] text-white/40">Seña</div><div className="text-sm font-black text-[#D4E655]">{$(c.sena)}</div></div>
                                            <button onClick={() => quitarDelCarrito(i)} className="text-white/30 hover:text-red-400"><Trash2 size={15} /></button>
                                        </div>
                                    </div>
                                ))}
                                {carrito.length > 0 && (
                                    <div className="flex items-center justify-between pt-1">
                                        <span className="text-sm text-white/60">Total {$(totalMontoCarrito)} · Seña a pagar ahora</span>
                                        <span className="text-xl font-black text-[#D4E655]">{$(totalSenaCarrito)}</span>
                                    </div>
                                )}
                            </div>

                            <button onClick={() => setStep(1)} className="w-full bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl flex items-center justify-center gap-2"><Plus size={15} /> Agregar otra fecha</button>

                            <p className="text-[11px] text-white/40">Al pagar la seña te guardamos {carrito.length > 1 ? 'todas las salas' : 'la sala'}. Cancelación gratis hasta 48hs antes; dentro de las 48hs la seña no se devuelve.</p>
                            <button disabled={creando || carrito.length === 0} onClick={pagarCarrito} className="w-full bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs py-4 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                                {creando ? <Loader2 size={15} className="animate-spin" /> : null} Pagar seña {totalSenaCarrito > 0 ? $(totalSenaCarrito) : ''} y reservar
                            </button>
                        </div>
                    )}
                </>}
            </div>
        </div>
    )
}

// ── Mis reservas ──────────────────────────────────────────────────────────────
function MisReservas() {
    const [reservas, setReservas] = useState<MiReservaAlquiler[] | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    const cargar = () => getMisReservasAlquilerAction().then(setReservas)
    useEffect(() => { cargar() }, [])

    const pagarSaldo = async (id: string) => {
        setBusy(id)
        try {
            const resp = await fetch('/api/mercadopago/alquiler-preference', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alquilerId: id, concepto: 'saldo' }),
            })
            const data = await resp.json()
            if (data.url) { window.location.href = data.url; return }
            toast.error(data.error || 'No se pudo iniciar el pago.')
        } catch { toast.error('No se pudo iniciar el pago.') }
        setBusy(null)
    }

    const cancelar = async (r: MiReservaAlquiler) => {
        const msg = r.senaSeDevuelve
            ? '¿Cancelar esta reserva? Falta más de 48hs, así que la seña queda a tu favor (recepción coordina la devolución).'
            : '¿Cancelar esta reserva? Falta menos de 48hs, así que SE PIERDE la seña.'
        if (!window.confirm(msg)) return
        setBusy(r.id)
        const res = await cancelarReservaAlquilerAction(r.id)
        if (res.ok) { toast.success(res.senaSeDevuelve ? 'Reserva cancelada. La seña queda a favor.' : 'Reserva cancelada.'); cargar() }
        else toast.error(res.error || 'No se pudo cancelar.')
        setBusy(null)
    }

    if (reservas === null) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-white/40" /></div>
    if (!reservas.length) return <p className="text-sm text-white/40 py-10 text-center">Todavía no tenés reservas. Pasá a "Reservar" para alquilar una sala.</p>

    const estadoBadge = (e: string, ep: string) => {
        if (ep === 'pagado') return { t: 'Pagada', c: 'bg-green-500/20 text-green-300' }
        if (e === 'confirmado' || ep === 'seña_pagada') return { t: 'Confirmada', c: 'bg-[#D4E655]/20 text-[#D4E655]' }
        return { t: 'Pendiente de seña', c: 'bg-amber-500/20 text-amber-300' }
    }

    // Agrupamos las multi-día por group_id (se muestran juntas).
    const vistos = new Set<string>()
    const bloques: MiReservaAlquiler[][] = []
    for (const r of reservas) {
        if (r.group_id) {
            if (vistos.has(r.group_id)) continue
            vistos.add(r.group_id)
            bloques.push(reservas.filter(x => x.group_id === r.group_id))
        } else bloques.push([r])
    }

    return (
        <div className="space-y-3">
            <Toaster position="top-center" richColors theme="dark" />
            {bloques.map((grupo, gi) => (
                <div key={gi} className="bg-[#111113] border border-white/10 rounded-xl p-4 space-y-3">
                    {grupo.length > 1 && <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1"><CalendarClock size={12} /> Reserva de {grupo.length} fechas</p>}
                    {grupo.map(r => {
                        const b = estadoBadge(r.estado, r.estado_pago)
                        const s = Array.isArray(r.sala) ? r.sala[0] : r.sala
                        return (
                            <div key={r.id} className="space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold">{s?.nombre}{s?.sede?.nombre ? ` · ${s.sede.nombre}` : ''}</div>
                                        <div className="text-[11px] text-white/50">{r.fecha} · {String(r.hora_inicio).slice(0, 5)}–{String(r.hora_fin).slice(0, 5)}{r.tipo_uso ? ` · ${ACT_LABEL(r.tipo_uso)}` : ''}</div>
                                    </div>
                                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded shrink-0 ${b.c}`}>{b.t}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="text-[11px] text-white/50">
                                        Total {$(r.monto_total)} · Pagado {$(r.monto_pagado)}{r.saldo > 0 && <> · Saldo <b className="text-white">{$(r.saldo)}</b></>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {r.puedePagarSaldo && (
                                            <button onClick={() => pagarSaldo(r.id)} disabled={!!busy} className="bg-[#009ee3] hover:brightness-110 text-white font-semibold uppercase tracking-wider text-[10px] px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5">
                                                {busy === r.id ? <Loader2 size={11} className="animate-spin" /> : null} Pagar saldo
                                            </button>
                                        )}
                                        {r.puedeCancelar && (
                                            <button onClick={() => cancelar(r)} disabled={!!busy} className="bg-white/5 hover:bg-red-600/30 text-white/70 font-semibold uppercase tracking-wider text-[10px] px-3 py-1.5 rounded disabled:opacity-50">
                                                Cancelar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ))}
            <p className="text-[11px] text-white/30 pt-1">Cancelación: gratis hasta 48hs antes (la seña queda a favor); dentro de las 48hs se pierde la seña.</p>
        </div>
    )
}

export default function AlquilarSalaPage() {
    return <Suspense fallback={<div className="p-10 flex justify-center"><Loader2 className="animate-spin text-white/40" /></div>}><AlquilarContent /></Suspense>
}
