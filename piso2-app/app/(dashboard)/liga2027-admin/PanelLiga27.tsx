'use client'

import { useEffect, useState } from 'react'
import { toast, Toaster } from 'sonner'
import {
    listPostulacionesLiga27Action, aprobarPostulacionLiga27Action, rechazarPostulacionLiga27Action,
    enviarMensajePostulacionLiga27Action, getInscripcionesLiga27Action, enviarBienvenidaLiga27Action,
    generarLinkPagoLiga27Action, registrarPagoLiga27Action, getLanzamientosAdminAction,
    guardarLanzamientoAction, getPreciosLiga27Action, guardarPreciosLiga27Action,
} from '@/app/actions/liga2027'
import { Loader2, Check, X, MessageSquare, Link2, Send, Copy, Plus } from 'lucide-react'

const card = "bg-[#111113] border border-white/10 rounded-xl p-5"
const btn = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
const input = "bg-[#1a1a1d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#D4E655]/50 w-full"
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function PanelLiga27({ puedePagos }: { puedePagos: boolean }) {
    const tabs = ['Postulaciones', 'Inscripciones', 'Lanzamiento', ...(puedePagos ? ['Precios'] : [])]
    const [tab, setTab] = useState('Postulaciones')

    return (
        <div className="p-4 md:p-8 text-white">
            <Toaster position="top-center" richColors theme="dark" />
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black tracking-tight">La Liga <span className="text-[#D4E655]">2027</span></h1>
                    <p className="text-white/40 text-sm">Inscripción y pagos del programa.</p>
                </div>
            </div>

            <div className="flex gap-1 border-b border-white/10 mb-6 overflow-x-auto">
                {tabs.map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#D4E655] text-white font-semibold' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                        {t}
                    </button>
                ))}
            </div>

            {tab === 'Postulaciones' && <Postulaciones />}
            {tab === 'Inscripciones' && <Inscripciones puedePagos={puedePagos} />}
            {tab === 'Lanzamiento' && <Lanzamiento />}
            {tab === 'Precios' && puedePagos && <Precios />}
        </div>
    )
}

// ── Postulaciones ─────────────────────────────────────────────────────────────
function Postulaciones() {
    const [items, setItems] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const [filtro, setFiltro] = useState('pendiente')
    const [msgPara, setMsgPara] = useState<string | null>(null)
    const [msgTexto, setMsgTexto] = useState('')
    const [busy, setBusy] = useState<string | null>(null)

    const cargar = async () => { setCargando(true); setItems(await listPostulacionesLiga27Action(filtro || undefined)); setCargando(false) }
    useEffect(() => { cargar() }, [filtro])

    const aprobar = async (id: string, plan?: 'mensual' | 'cuatrimestral') => {
        setBusy(id)
        const r = await aprobarPostulacionLiga27Action(id, plan)
        if (r.ok) { toast.success('Aprobada. Se creó la inscripción.'); cargar() } else toast.error(r.error || 'Error')
        setBusy(null)
    }
    const rechazar = async (id: string) => {
        setBusy(id)
        const r = await rechazarPostulacionLiga27Action(id)
        if (r.ok) { toast.success('Marcada como no aprobada.'); cargar() } else toast.error(r.error || 'Error')
        setBusy(null)
    }
    const enviarMsg = async (id: string) => {
        if (!msgTexto.trim()) return toast.error('Escribí un mensaje.')
        setBusy(id)
        const r = await enviarMensajePostulacionLiga27Action(id, msgTexto)
        if (r.ok) { toast.success('Mensaje enviado.'); setMsgPara(null); setMsgTexto('') } else toast.error(r.error || 'Error')
        setBusy(null)
    }

    const CONTACTO: Record<string, string> = { llamar: '📞 Que lo llamen', escribir: '✍️ Que le escriban', anotarse: '✅ Anotarse directo' }

    return (
        <div>
            <div className="flex gap-2 mb-4">
                {[['pendiente', 'Pendientes'], ['aprobada', 'Aprobadas'], ['no', 'No aprobadas'], ['', 'Todas']].map(([v, l]) => (
                    <button key={v} onClick={() => setFiltro(v)} className={`${btn} ${filtro === v ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>{l}</button>
                ))}
            </div>
            {cargando ? <Loader2 className="animate-spin text-white/40" /> : items.length === 0 ? <p className="text-white/40 text-sm">No hay postulaciones.</p> : (
                <div className="space-y-3">
                    {items.map(p => (
                        <div key={p.id} className={card}>
                            <div className="flex items-start gap-4">
                                {p.foto_url ? <img src={p.foto_url} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center text-white/30 text-xl">{(p.nombre || '?')[0]}</div>}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold">{p.nombre}</h3>
                                        <span className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/70">{CONTACTO[p.tipo_contacto] || p.tipo_contacto}</span>
                                        {p.estado !== 'pendiente' && <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-white/40 capitalize">{p.estado}</span>}
                                    </div>
                                    <p className="text-xs text-white/50 mt-1">{p.email}{p.telefono ? ` · ${p.telefono}` : ''}{p.instagram ? ` · ${p.instagram}` : ''}{p.ciudad ? ` · ${p.ciudad}` : ''}</p>
                                    {p.nota && <p className="text-sm text-white/70 mt-2 bg-white/5 rounded-lg p-2">{p.nota}</p>}

                                    {p.estado === 'pendiente' && (
                                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                                            <button onClick={() => aprobar(p.id, 'mensual')} disabled={busy === p.id} className={`${btn} bg-green-600/80 hover:bg-green-600 text-white flex items-center gap-1`}><Check size={13} /> Aprobar (mensual)</button>
                                            <button onClick={() => aprobar(p.id, 'cuatrimestral')} disabled={busy === p.id} className={`${btn} bg-green-700/70 hover:bg-green-700 text-white flex items-center gap-1`}><Check size={13} /> Aprobar (cuatrimestral)</button>
                                            <button onClick={() => rechazar(p.id)} disabled={busy === p.id} className={`${btn} bg-white/5 hover:bg-red-600/30 text-white/70 flex items-center gap-1`}><X size={13} /> No aprobar</button>
                                            <button onClick={() => setMsgPara(msgPara === p.id ? null : p.id)} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70 flex items-center gap-1`}><MessageSquare size={13} /> Mensaje</button>
                                        </div>
                                    )}
                                    {msgPara === p.id && (
                                        <div className="mt-3 flex gap-2">
                                            <input value={msgTexto} onChange={e => setMsgTexto(e.target.value)} className={input} placeholder="Escribí un mensaje al postulante…" />
                                            <button onClick={() => enviarMsg(p.id)} disabled={busy === p.id} className={`${btn} bg-[#D4E655] text-black flex items-center gap-1 shrink-0`}><Send size={13} /> Enviar</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Inscripciones ─────────────────────────────────────────────────────────────
function Inscripciones({ puedePagos }: { puedePagos: boolean }) {
    const [items, setItems] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)
    const hoy = new Date()

    const cargar = async () => { setCargando(true); setItems(await getInscripcionesLiga27Action()); setCargando(false) }
    useEffect(() => { cargar() }, [])

    const bienvenida = async (id: string) => {
        setBusy(id); const r = await enviarBienvenidaLiga27Action(id)
        if (r.ok) { toast.success('Bienvenida enviada.'); cargar() } else toast.error(r.error || 'Error'); setBusy(null)
    }
    const linkPago = async (insId: string, concepto: 'matricula' | 'cuota') => {
        setBusy(insId)
        const r = await generarLinkPagoLiga27Action(concepto === 'cuota'
            ? { inscripcionId: insId, concepto, mes: hoy.getMonth() + 1, anio: hoy.getFullYear() }
            : { inscripcionId: insId, concepto })
        if (r.ok && r.url) {
            try { await navigator.clipboard.writeText(r.url) } catch { }
            toast.success('Link copiado. Pegalo en WhatsApp/mail.', { description: r.url, duration: 8000 })
        } else toast.error(r.error || 'Error')
        setBusy(null)
    }
    const pagoManual = async (insId: string, concepto: 'matricula' | 'cuota') => {
        const montoStr = window.prompt(`Monto del pago (${concepto}) en efectivo/transferencia:`)
        if (!montoStr) return
        const monto = Number(montoStr.replace(/[^\d]/g, ''))
        if (!monto) return toast.error('Monto inválido.')
        const metodo = window.prompt('Método (efectivo / transferencia / tarjeta):', 'efectivo') || 'efectivo'
        setBusy(insId)
        const r = await registrarPagoLiga27Action(concepto === 'cuota'
            ? { inscripcionId: insId, concepto, mes: hoy.getMonth() + 1, anio: hoy.getFullYear(), monto, metodo }
            : { inscripcionId: insId, concepto, monto, metodo })
        if (r.ok) { toast.success('Pago registrado.'); cargar() } else toast.error(r.error || 'Error'); setBusy(null)
    }

    const EST: Record<string, string> = { postulado: 'bg-amber-500/20 text-amber-300', aprobado: 'bg-green-500/20 text-green-300', bloqueado: 'bg-red-500/20 text-red-300', baja: 'bg-white/10 text-white/40' }

    if (cargando) return <Loader2 className="animate-spin text-white/40" />
    if (!items.length) return <p className="text-white/40 text-sm">Todavía no hay inscripciones. Aprobá postulaciones para crearlas.</p>
    return (
        <div className="space-y-3">
            {items.map(i => (
                <div key={i.id} className={card}>
                    <div className="flex items-start gap-4 flex-wrap">
                        {i.perfil?.foto_url ? <img src={i.perfil.foto_url} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-white/30">{(i.perfil?.nombre || '?')[0]}</div>}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold">{i.perfil?.nombre} {i.perfil?.apellido || ''}</h3>
                                <span className={`text-[11px] px-2 py-0.5 rounded capitalize ${EST[i.estado] || 'bg-white/10'}`}>{i.estado}</span>
                                {i.plan && <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-white/50">{i.plan}</span>}
                                <span className={`text-[11px] px-2 py-0.5 rounded ${i.matricula_pagada ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}`}>Matrícula {i.matricula_pagada ? 'OK' : 'pend.'}</span>
                            </div>
                            <p className="text-xs text-white/50 mt-1">{i.perfil?.email}{i.perfil?.telefono ? ` · ${i.perfil.telefono}` : ''}</p>
                            {i.bloqueado_motivo && <p className="text-xs text-red-300 mt-1">⚠ {i.bloqueado_motivo}</p>}
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                                {!i.bienvenida_enviada && <button onClick={() => bienvenida(i.id)} disabled={busy === i.id} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70`}>Enviar bienvenida</button>}
                                {puedePagos && <>
                                    <button onClick={() => linkPago(i.id, 'matricula')} disabled={busy === i.id} className={`${btn} bg-[#009ee3]/80 hover:bg-[#009ee3] text-white flex items-center gap-1`}><Link2 size={13} /> Link matrícula</button>
                                    <button onClick={() => linkPago(i.id, 'cuota')} disabled={busy === i.id} className={`${btn} bg-[#009ee3]/60 hover:bg-[#009ee3] text-white flex items-center gap-1`}><Link2 size={13} /> Link cuota {MESES[hoy.getMonth() + 1]}</button>
                                    <button onClick={() => pagoManual(i.id, 'matricula')} disabled={busy === i.id} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70`}>+ Pago matrícula</button>
                                    <button onClick={() => pagoManual(i.id, 'cuota')} disabled={busy === i.id} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70`}>+ Pago cuota</button>
                                </>}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

// ── Lanzamiento ───────────────────────────────────────────────────────────────
function Lanzamiento() {
    const [items, setItems] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const [edit, setEdit] = useState<any | null>(null)
    const [busy, setBusy] = useState(false)

    const cargar = async () => { setCargando(true); setItems(await getLanzamientosAdminAction()); setCargando(false) }
    useEffect(() => { cargar() }, [])

    const guardar = async () => {
        if (!edit?.titulo?.trim()) return toast.error('Poné un título.')
        setBusy(true)
        const r = await guardarLanzamientoAction({
            id: edit.id, titulo: edit.titulo, subtitulo: edit.subtitulo, video_url: edit.video_url,
            descripcion: edit.descripcion, cta_texto: edit.cta_texto, activo: !!edit.activo, orden: Number(edit.orden) || 0,
        })
        if (r.ok) { toast.success('Guardado.'); setEdit(null); cargar() } else toast.error(r.error || 'Error')
        setBusy(false)
    }

    if (cargando) return <Loader2 className="animate-spin text-white/40" />
    return (
        <div className="space-y-4">
            {!edit && <button onClick={() => setEdit({ titulo: '', activo: true, cta_texto: 'Inscripciones 2027', orden: 0 })} className={`${btn} bg-[#D4E655] text-black flex items-center gap-1`}><Plus size={14} /> Nuevo lanzamiento</button>}

            {edit && (
                <div className={`${card} space-y-3`}>
                    <h3 className="font-semibold">{edit.id ? 'Editar' : 'Nuevo'} lanzamiento</h3>
                    <div><label className="text-xs text-white/50">Título</label><input value={edit.titulo || ''} onChange={e => setEdit({ ...edit, titulo: e.target.value })} className={input} /></div>
                    <div><label className="text-xs text-white/50">Subtítulo</label><input value={edit.subtitulo || ''} onChange={e => setEdit({ ...edit, subtitulo: e.target.value })} className={input} /></div>
                    <div><label className="text-xs text-white/50">Video (link YouTube o mp4)</label><input value={edit.video_url || ''} onChange={e => setEdit({ ...edit, video_url: e.target.value })} className={input} placeholder="https://youtu.be/…" /></div>
                    <div><label className="text-xs text-white/50">Descripción del programa / etapas</label><textarea value={edit.descripcion || ''} onChange={e => setEdit({ ...edit, descripcion: e.target.value })} className={input} rows={6} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-white/50">Texto del botón (CTA)</label><input value={edit.cta_texto || ''} onChange={e => setEdit({ ...edit, cta_texto: e.target.value })} className={input} /></div>
                        <div><label className="text-xs text-white/50">Orden</label><input type="number" value={edit.orden ?? 0} onChange={e => setEdit({ ...edit, orden: e.target.value })} className={input} /></div>
                    </div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.activo} onChange={e => setEdit({ ...edit, activo: e.target.checked })} /> Activo (muestra el CTA en la home y abre la página pública)</label>
                    <div className="flex gap-2">
                        <button onClick={guardar} disabled={busy} className={`${btn} bg-[#D4E655] text-black`}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}</button>
                        <button onClick={() => setEdit(null)} className={`${btn} bg-white/5 text-white/60`}>Cancelar</button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {items.map(l => (
                    <div key={l.id} className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3">
                        <div>
                            <div className="flex items-center gap-2"><span className="font-semibold">{l.titulo}</span>
                                {l.activo ? <span className="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-300">Activo</span> : <span className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/40">Inactivo</span>}</div>
                            <p className="text-xs text-white/40">/liga2027 · {l.slug}</p>
                        </div>
                        <button onClick={() => setEdit(l)} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70`}>Editar</button>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Precios ───────────────────────────────────────────────────────────────────
function Precios() {
    const [p, setP] = useState<Record<string, number> | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => { getPreciosLiga27Action().then(setP) }, [])

    const guardar = async () => {
        if (!p) return
        setBusy(true)
        const r = await guardarPreciosLiga27Action(p)
        if (r.ok) toast.success('Precios guardados.'); else toast.error(r.error || 'Error')
        setBusy(false)
    }
    if (!p) return <Loader2 className="animate-spin text-white/40" />
    const field = (k: string, label: string) => (
        <div><label className="text-xs text-white/50">{label}</label>
            <input type="number" value={p[k] ?? 0} onChange={e => setP({ ...p, [k]: Number(e.target.value) })} className={input} /></div>
    )
    return (
        <div className={`${card} max-w-md space-y-4`}>
            <p className="text-sm text-white/60">Montos de La Liga 2027. Se usan para los links de pago y el registro manual.</p>
            {field('liga27_matricula', 'Matrícula ($)')}
            {field('liga27_cuota_mensual', 'Cuota mensual ($)')}
            {field('liga27_cuota_cuatrimestral', 'Cuota cuatrimestral — por mes ($)')}
            <button onClick={guardar} disabled={busy} className={`${btn} bg-[#D4E655] text-black`}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Guardar precios'}</button>
        </div>
    )
}
