'use client'

import { useEffect, useState } from 'react'
import { Loader2, Send, Check, MessageCircle, Instagram, RefreshCw, Inbox, BarChart3, Users, Bot, Clock, X } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import {
    getConsultasAction, responderConsultaAction, marcarResueltaAction,
    getAsistenteStatsAction, getContactosAction, getConversacionContactoAction,
} from '@/app/actions/consultas'

type Msg = { de: 'usuario' | 'recep' | 'bot'; texto: string; created_at: string }
type Consulta = {
    id: string; created_at: string; canal: string
    contacto_nombre: string | null; contacto_usuario: string | null; subscriber_id: string | null
    consulta: string | null; estado: string; mensajes: Msg[]
}
type Stats = {
    dias: number
    totales: { contactos: number; mensajesUsuario: number; consultas: number; derivados: number; pendientes: number; resueltas: number; pctDerivado: number }
    porDia: { dia: string; mensajes: number; consultas: number }[]
    porHora: { h: number; n: number }[]
    temas: { tema: string; n: number }[]
}
type Contacto = { subscriber_id: string; canal: string; nombre: string | null; usuario: string | null; derivada: boolean; mensajes: number; ultimo: string; ultimoAt: string }

const hora = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
type Tab = 'resumen' | 'bandeja' | 'contactos'

export default function ConsultasPage() {
    const [tab, setTab] = useState<Tab>('bandeja')

    // Bandeja
    const [consultas, setConsultas] = useState<Consulta[]>([])
    const [loading, setLoading] = useState(true)
    const [soloPend, setSoloPend] = useState(true)
    const [abierta, setAbierta] = useState<string | null>(null)
    const [respuesta, setRespuesta] = useState('')
    const [enviando, setEnviando] = useState(false)

    // Resumen
    const [stats, setStats] = useState<Stats | null>(null)
    const [loadingStats, setLoadingStats] = useState(false)

    // Contactos
    const [contactos, setContactos] = useState<Contacto[]>([])
    const [loadingContactos, setLoadingContactos] = useState(false)
    const [contactoOpen, setContactoOpen] = useState<Contacto | null>(null)
    const [conv, setConv] = useState<Msg[]>([])
    const [loadingConv, setLoadingConv] = useState(false)

    const pendientesCount = consultas.filter(c => c.estado === 'pendiente').length

    const cargar = async () => {
        setLoading(true)
        const r = await getConsultasAction(soloPend)
        if (r.ok) setConsultas(r.consultas as Consulta[])
        else toast.error(r.error || 'Error al cargar')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [soloPend])

    useEffect(() => {
        if (tab === 'resumen' && !stats) { void cargarStats() }
        if (tab === 'contactos' && contactos.length === 0) { void cargarContactos() }
    }, [tab])

    const cargarStats = async () => {
        setLoadingStats(true)
        const r = await getAsistenteStatsAction(30)
        if (r.ok) setStats(r as Stats)
        else toast.error(r.error || 'Error')
        setLoadingStats(false)
    }
    const cargarContactos = async () => {
        setLoadingContactos(true)
        const r = await getContactosAction(30)
        if (r.ok) setContactos(r.contactos as Contacto[])
        else toast.error(r.error || 'Error')
        setLoadingContactos(false)
    }
    const abrirContacto = async (c: Contacto) => {
        setContactoOpen(c); setConv([]); setLoadingConv(true)
        const r = await getConversacionContactoAction(c.subscriber_id)
        if (r.ok) setConv(r.mensajes as Msg[])
        setLoadingConv(false)
    }

    const responder = async (c: Consulta) => {
        const texto = respuesta.trim()
        if (!texto) return
        setEnviando(true)
        const r = await responderConsultaAction(c.id, texto)
        if (r.ok) {
            toast.success('Respuesta enviada')
            setRespuesta('')
            setConsultas(cs => cs.map(x => x.id === c.id ? { ...x, mensajes: [...x.mensajes, { de: 'recep', texto, created_at: new Date().toISOString() }] } : x))
        } else toast.error(r.error || 'No se pudo enviar')
        setEnviando(false)
    }
    const resolver = async (c: Consulta) => {
        const r = await marcarResueltaAction(c.id, true)
        if (r.ok) { toast.success('Marcada como resuelta'); setConsultas(cs => soloPend ? cs.filter(x => x.id !== c.id) : cs.map(x => x.id === c.id ? { ...x, estado: 'resuelta' } : x)) }
        else toast.error(r.error || 'Error')
    }

    const TabBtn = ({ id, icon: Icon, label, badge }: { id: Tab; icon: any; label: string; badge?: number }) => (
        <button onClick={() => setTab(id)} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors flex items-center gap-2 ${tab === id ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-300 border-white/10 hover:text-white'}`}>
            <Icon size={15} /> {label}
            {badge ? <span className={`min-w-5 h-5 px-1 flex items-center justify-center rounded-full text-[10px] font-black ${tab === id ? 'bg-black text-[#D4E655]' : 'bg-[#D4E655] text-black'}`}>{badge}</span> : null}
        </button>
    )

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="mb-6">
                <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2">
                    <MessageCircle className="text-[#D4E655]" size={26} /> Consultas
                </h1>
                <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Asistente virtual · CRM</p>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
                <TabBtn id="resumen" icon={BarChart3} label="Resumen" />
                <TabBtn id="bandeja" icon={Inbox} label="Bandeja" badge={pendientesCount} />
                <TabBtn id="contactos" icon={Users} label="Contactos" />
            </div>

            {/* ================= RESUMEN ================= */}
            {tab === 'resumen' && (
                <div className="max-w-3xl mx-auto">
                    {loadingStats || !stats ? (
                        <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                    ) : (
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Últimos {stats.dias} días</p>
                                <button onClick={cargarStats} className="text-gray-400 hover:text-white"><RefreshCw size={15} /></button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Card label="Contactos" value={stats.totales.contactos} />
                                <Card label="Mensajes" value={stats.totales.mensajesUsuario} />
                                <Card label="Bot resolvió solo" value={stats.totales.contactos ? `${100 - stats.totales.pctDerivado}%` : '—'} accent />
                                <Card label="Derivados" value={stats.totales.derivados} sub={`${stats.totales.pctDerivado}% de contactos`} />
                            </div>

                            {/* Actividad por día */}
                            <Panel title="Actividad por día" icon={BarChart3}>
                                <div className="flex items-end gap-1.5 h-32 mt-2">
                                    {stats.porDia.map(d => {
                                        const max = Math.max(1, ...stats.porDia.map(x => x.mensajes))
                                        return (
                                            <div key={d.dia} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                                                <span className="text-[9px] text-gray-500 opacity-0 group-hover:opacity-100">{d.mensajes}</span>
                                                <div className="w-full rounded-t bg-[#D4E655]/80 hover:bg-[#D4E655] transition-colors" style={{ height: `${Math.round((d.mensajes / max) * 100)}%`, minHeight: d.mensajes ? 3 : 0 }} />
                                                {d.consultas > 0 && <div className="w-full rounded-b bg-orange-500/70" style={{ height: 3 }} title={`${d.consultas} derivadas`} />}
                                                <span className="text-[8px] text-gray-600 rotate-0">{d.dia}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                                <p className="text-[10px] text-gray-600 mt-2"><span className="text-[#D4E655]">▮</span> mensajes · <span className="text-orange-500">▮</span> derivadas</p>
                            </Panel>

                            {/* Temas */}
                            <Panel title="Temas más consultados" icon={MessageCircle}>
                                <div className="space-y-2 mt-1">
                                    {stats.temas.map(t => {
                                        const max = Math.max(1, ...stats.temas.map(x => x.n))
                                        return (
                                            <div key={t.tema} className="flex items-center gap-3">
                                                <span className="text-xs text-gray-300 w-24 shrink-0">{t.tema}</span>
                                                <div className="flex-1 bg-white/5 rounded-full h-4 overflow-hidden">
                                                    <div className="h-full bg-[#D4E655]/80 rounded-full" style={{ width: `${Math.round((t.n / max) * 100)}%` }} />
                                                </div>
                                                <span className="text-xs text-gray-400 w-8 text-right">{t.n}</span>
                                            </div>
                                        )
                                    })}
                                    {stats.temas.length === 0 && <p className="text-xs text-gray-500">Sin datos todavía.</p>}
                                </div>
                            </Panel>

                            {/* Horarios */}
                            <Panel title="Horarios con más mensajes" icon={Clock}>
                                <div className="flex items-end gap-[3px] h-20 mt-2">
                                    {stats.porHora.map(h => {
                                        const max = Math.max(1, ...stats.porHora.map(x => x.n))
                                        return (
                                            <div key={h.h} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                                                <div className="w-full rounded-t bg-blue-500/60 group-hover:bg-blue-400 transition-colors" style={{ height: `${Math.round((h.n / max) * 100)}%`, minHeight: h.n ? 2 : 0 }} title={`${h.h}hs: ${h.n}`} />
                                                {h.h % 6 === 0 && <span className="text-[7px] text-gray-600">{h.h}</span>}
                                            </div>
                                        )
                                    })}
                                </div>
                            </Panel>
                        </div>
                    )}
                </div>
            )}

            {/* ================= BANDEJA ================= */}
            {tab === 'bandeja' && (
                <>
                    <div className="flex justify-end gap-2 mb-4 max-w-2xl mx-auto">
                        <button onClick={() => setSoloPend(v => !v)} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors ${soloPend ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-300 border-white/10'}`}>
                            {soloPend ? 'Pendientes' : 'Todas'}
                        </button>
                        <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
                    </div>

                    {loading ? (
                        <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                    ) : consultas.length === 0 ? (
                        <div className="min-h-[40vh] flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                            <Inbox size={34} className="opacity-40" />
                            <p className="text-sm font-medium">{soloPend ? 'No hay consultas pendientes. 🎉' : 'Todavía no hay consultas.'}</p>
                        </div>
                    ) : (
                        <div className="max-w-2xl mx-auto space-y-3">
                            {consultas.map(c => {
                                const isOpen = abierta === c.id
                                const nombre = c.contacto_nombre || c.contacto_usuario || 'Contacto'
                                return (
                                    <div key={c.id} className={`bg-[#09090b] border rounded-2xl overflow-hidden transition-colors ${isOpen ? 'border-[#D4E655]/40' : 'border-white/10'}`}>
                                        <button onClick={() => { setAbierta(isOpen ? null : c.id); setRespuesta('') }} className="w-full text-left p-4 flex items-start gap-3">
                                            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center shrink-0 text-[#D4E655]">
                                                {c.canal === 'instagram' ? <Instagram size={17} /> : <MessageCircle size={17} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-sm truncate">{nombre}</p>
                                                    {c.contacto_usuario && <span className="text-[11px] text-gray-500 truncate">@{c.contacto_usuario.replace(/^@/, '')}</span>}
                                                    {c.estado === 'resuelta' && <span className="text-[9px] bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full uppercase font-bold">Resuelta</span>}
                                                </div>
                                                <p className="text-gray-400 text-sm mt-0.5 line-clamp-2">{c.consulta}</p>
                                                <p className="text-[10px] text-gray-600 mt-1 uppercase tracking-wide">{c.canal} · {hora(c.created_at)}</p>
                                            </div>
                                        </button>

                                        {isOpen && (
                                            <div className="px-4 pb-4 border-t border-white/5">
                                                <div className="space-y-2 py-3">
                                                    {c.mensajes.map((m, i) => {
                                                        const mine = m.de === 'recep'
                                                        return (
                                                            <div key={i} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                                                                <span className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5 px-1">
                                                                    {mine ? 'Vos' : m.de === 'bot' ? '🤖 Asistente' : nombre}
                                                                </span>
                                                                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${mine ? 'bg-[#D4E655] text-black rounded-tr-sm' : m.de === 'bot' ? 'bg-[#12203a] text-blue-100 rounded-tl-sm border border-blue-500/20' : 'bg-[#161616] text-gray-200 rounded-tl-sm'}`}>{m.texto}</div>
                                                            </div>
                                                        )
                                                    })}
                                                    {c.mensajes.length === 0 && <p className="text-xs text-gray-500">{c.consulta}</p>}
                                                </div>

                                                <div className="flex gap-2 items-end">
                                                    <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={1} placeholder={`Responder a ${nombre}…`} className="flex-1 bg-[#111] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#D4E655] resize-none" />
                                                    <button onClick={() => responder(c)} disabled={enviando || !respuesta.trim()} className="bg-[#D4E655] text-black w-11 h-11 rounded-xl flex items-center justify-center hover:bg-white transition-colors disabled:opacity-40 shrink-0">
                                                        {enviando ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-gray-600 mt-2">La respuesta le llega a su {c.canal === 'instagram' ? 'Instagram' : 'WhatsApp'} (dentro de las 24hs del último mensaje).</p>

                                                {c.estado !== 'resuelta' && (
                                                    <button onClick={() => resolver(c)} className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-green-400 flex items-center gap-1.5">
                                                        <Check size={13} /> Marcar como resuelta
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ================= CONTACTOS ================= */}
            {tab === 'contactos' && (
                <div className="max-w-2xl mx-auto">
                    <div className="flex justify-end mb-4">
                        <button onClick={cargarContactos} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
                    </div>
                    {loadingContactos ? (
                        <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                    ) : contactos.length === 0 ? (
                        <div className="min-h-[40vh] flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                            <Users size={34} className="opacity-40" />
                            <p className="text-sm font-medium">Todavía no hay contactos registrados.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {contactos.map(c => {
                                const nombre = c.nombre || c.usuario || 'Contacto'
                                return (
                                    <button key={c.subscriber_id} onClick={() => abrirContacto(c)} className="w-full text-left bg-[#09090b] border border-white/10 rounded-2xl p-4 flex items-start gap-3 hover:border-[#D4E655]/40 transition-colors">
                                        <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center shrink-0 text-[#D4E655]">
                                            {c.canal === 'instagram' ? <Instagram size={17} /> : <MessageCircle size={17} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-sm truncate">{nombre}</p>
                                                {c.usuario && <span className="text-[11px] text-gray-500 truncate">@{c.usuario.replace(/^@/, '')}</span>}
                                                {c.derivada && <span className="text-[9px] bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full uppercase font-bold">Derivó</span>}
                                            </div>
                                            <p className="text-gray-400 text-sm mt-0.5 line-clamp-1">{c.ultimo}</p>
                                            <p className="text-[10px] text-gray-600 mt-1 uppercase tracking-wide">{c.mensajes} msg · {hora(c.ultimoAt)}</p>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Modal conversación de contacto */}
            {contactoOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setContactoOpen(null)}>
                    <div className="bg-[#09090b] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                            <div className="min-w-0">
                                <p className="font-bold text-sm truncate">{contactoOpen.nombre || contactoOpen.usuario || 'Contacto'}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{contactoOpen.canal} · conversación con el asistente</p>
                            </div>
                            <button onClick={() => setContactoOpen(null)} className="p-2 bg-white/5 rounded-full text-gray-300"><X size={16} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {loadingConv ? (
                                <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                            ) : conv.length === 0 ? (
                                <p className="text-xs text-gray-500 text-center py-8">Sin mensajes.</p>
                            ) : conv.map((m, i) => (
                                <div key={i} className="flex flex-col items-start">
                                    <span className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5 px-1 flex items-center gap-1">
                                        {m.de === 'bot' ? <><Bot size={10} /> Asistente</> : (contactoOpen.nombre || 'Cliente')}
                                    </span>
                                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${m.de === 'bot' ? 'bg-[#12203a] text-blue-100 border border-blue-500/20' : 'bg-[#161616] text-gray-200'}`}>{m.texto}</div>
                                    <span className="text-[8px] text-gray-600 px-1 mt-0.5">{hora(m.created_at)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function Card({ label, value, sub, accent }: { label: string; value: any; sub?: string; accent?: boolean }) {
    return (
        <div className={`rounded-2xl p-4 border ${accent ? 'bg-[#D4E655]/10 border-[#D4E655]/30' : 'bg-[#09090b] border-white/10'}`}>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{label}</p>
            <p className={`text-2xl font-black mt-1 ${accent ? 'text-[#D4E655]' : 'text-white'}`}>{value}</p>
            {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
        </div>
    )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
    return (
        <div className="bg-[#09090b] border border-white/10 rounded-2xl p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-300 flex items-center gap-2 mb-1"><Icon size={14} className="text-[#D4E655]" /> {title}</p>
            {children}
        </div>
    )
}
