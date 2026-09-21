'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Search, Instagram, MessageCircle, Sparkles, Check, X, Users, AlertTriangle, Eye, Link2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { getCrmLeadsAction, guardarLeadAction, resumirChatCrmAction, finalizarConsultaCrmAction, type CrmLead } from '@/app/actions/crm'
import { getConversacionContactoAction, buscarPerfilesAction, vincularContactoAction, desvincularContactoAction } from '@/app/actions/consultas'
import { CRM_ETAPAS, CRM_PRODUCTOS, etapaInfo } from '@/lib/crm'

const esImagenUrl = (t: string) => /^https?:\/\//.test(t || '') && (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(t) || t.includes('/storage/v1/object'))

// ============================ VER CHAT ============================
function ChatModal({ subscriberId, titulo, onClose }: { subscriberId: string; titulo: string; onClose: () => void }) {
    const [msgs, setMsgs] = useState<{ de: string; texto: string; created_at: string }[]>([])
    const [loading, setLoading] = useState(true)
    useEffect(() => {
        let vivo = true
        ;(async () => {
            const r = await getConversacionContactoAction(subscriberId)
            if (vivo) { if (r.ok) setMsgs(r.mensajes as any[]); setLoading(false) }
        })()
        return () => { vivo = false }
    }, [subscriberId])
    return (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
            <div className="bg-[#0b0b0d] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-lg h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                    <p className="text-sm font-bold truncate">{titulo}</p>
                    <button onClick={onClose} className="text-gray-500 hover:text-white p-1"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                        : msgs.length === 0 ? <p className="text-center text-gray-500 text-sm py-10">No hay chat guardado de este contacto.</p>
                            : msgs.map((m, i) => (
                                <div key={i} className={`flex ${m.de === 'usuario' ? 'justify-start' : 'justify-end'}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.de === 'usuario' ? 'bg-white/5 text-gray-200' : m.de === 'recep' ? 'bg-[#D4E655] text-black' : 'bg-indigo-500/20 text-indigo-100'}`}>
                                        {esImagenUrl(m.texto) ? <img src={m.texto} alt="" className="rounded-lg max-h-48" /> : <span className="whitespace-pre-wrap break-words">{m.texto}</span>}
                                        <div className="text-[9px] opacity-60 mt-0.5">{m.de === 'usuario' ? 'Cliente' : m.de === 'recep' ? 'Recepción' : 'Bot'}</div>
                                    </div>
                                </div>
                            ))}
                </div>
            </div>
        </div>
    )
}

const chipEtapa: Record<string, string> = {
    sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
}
const cls = (id: string) => chipEtapa[etapaInfo(id).color] || chipEtapa.sky
const canalIcon = (c: string | null) => c === 'whatsapp' ? <MessageCircle size={13} className="text-emerald-400" /> : <Instagram size={13} className="text-pink-400" />
const alertaDot = (n: string) => n === 'urgente' ? 'bg-red-500' : n === 'seguir' ? 'bg-amber-400' : 'bg-gray-600'
const inp = 'w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#D4E655]/60'
const lbl = 'block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1'

// ============================ EDITOR DE UN LEAD ============================
function LeadEditor({ lead, onClose, onSaved, onVerChat }: { lead: CrmLead; onClose: () => void; onSaved: () => void; onVerChat: (l: CrmLead) => void }) {
    const [etapa, setEtapa] = useState(lead.etapa)
    const [producto, setProducto] = useState(lead.producto || '')
    const [estilo, setEstilo] = useState(lead.estilo || '')
    const [profe, setProfe] = useState(lead.profe || '')
    const [notas, setNotas] = useState(lead.notas || '')
    const [nombre, setNombre] = useState(lead.nombre || '')
    const [saving, setSaving] = useState(false)

    // Vínculo con alumno (reusa asistente_contacto_perfil).
    const [perfilNombre, setPerfilNombre] = useState(lead.perfil_nombre || '')
    const [term, setTerm] = useState('')
    const [resultados, setResultados] = useState<any[]>([])
    const [buscando, setBuscando] = useState(false)
    const buscar = async (t: string) => {
        setTerm(t)
        if (t.trim().length < 2) { setResultados([]); return }
        setBuscando(true)
        const r = await buscarPerfilesAction(t)
        if (r.ok) setResultados(r.perfiles); setBuscando(false)
    }
    const vincular = async (p: any) => {
        const r = await vincularContactoAction(lead.subscriber_id, lead.canal || 'instagram', p.id)
        if (r.ok) { setPerfilNombre(p.nombre_completo || p.email || 'Alumno'); setTerm(''); setResultados([]); toast.success('Alumno vinculado') }
        else toast.error(r.error || 'No se pudo vincular')
    }
    const desvincular = async () => {
        const r = await desvincularContactoAction(lead.subscriber_id)
        if (r.ok) { setPerfilNombre(''); toast.success('Desvinculado') } else toast.error('No se pudo desvincular')
    }

    const guardar = async () => {
        setSaving(true)
        const r = await guardarLeadAction(lead.subscriber_id, {
            canal: lead.canal, nombre: nombre || null, instagram: lead.instagram, etapa, producto: producto || null,
            estilo: estilo || null, profe: profe || null, notas: notas || null,
        })
        setSaving(false)
        if (r.ok) { toast.success('Lead guardado'); onSaved() } else toast.error(r.error || 'Error')
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
            <div className="bg-[#0b0b0d] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-4">
                    <div className="min-w-0">
                        <p className="text-sm font-black uppercase tracking-wide flex items-center gap-2">{canalIcon(lead.canal)} {nombre || lead.instagram || 'Contacto'}</p>
                        <p className="text-[11px] text-gray-500">{lead.instagram ? '@' + lead.instagram : ''} {lead.diasSinContacto ? `· hace ${lead.diasSinContacto} día${lead.diasSinContacto === 1 ? '' : 's'}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => onVerChat(lead)} className="text-[10px] font-bold uppercase tracking-wide text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Eye size={13} /> Ver chat</button>
                        <button onClick={onClose} className="text-gray-500 hover:text-white p-1"><X size={18} /></button>
                    </div>
                </div>

                {/* Vínculo con alumno */}
                <div className="mb-3 rounded-xl bg-[#111] border border-white/10 p-3">
                    {perfilNombre ? (
                        <div className="flex items-center gap-2">
                            <UserCheck size={15} className="text-emerald-400 shrink-0" />
                            <span className="text-sm font-semibold flex-1 truncate">Alumno: {perfilNombre}</span>
                            <button onClick={desvincular} className="text-[10px] font-bold uppercase tracking-wide text-gray-500 hover:text-red-400">Desvincular</button>
                        </div>
                    ) : (
                        <div>
                            <label className={lbl}><Link2 size={11} className="inline mr-1" />Vincular a un alumno</label>
                            <input value={term} onChange={e => buscar(e.target.value)} className={inp} placeholder="Buscar por nombre, email o teléfono…" />
                            {buscando && <p className="text-[11px] text-gray-500 mt-1">Buscando…</p>}
                            {resultados.length > 0 && (
                                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                    {resultados.map(p => (
                                        <button key={p.id} onClick={() => vincular(p)} className="w-full text-left bg-[#0e0e10] border border-white/10 rounded-lg px-3 py-2 hover:border-[#D4E655]/40">
                                            <p className="text-sm font-semibold truncate">{p.nombre_completo || p.email}</p>
                                            <p className="text-[10px] text-gray-500 truncate">{[p.email, p.telefono].filter(Boolean).join(' · ')}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <div><label className={lbl}>Nombre</label><input value={nombre} onChange={e => setNombre(e.target.value)} className={inp} placeholder="Nombre del prospecto" /></div>
                    <div>
                        <label className={lbl}>Etapa del embudo</label>
                        <select value={etapa} onChange={e => setEtapa(e.target.value)} className={inp}>
                            {CRM_ETAPAS.map(et => <option key={et.id} value={et.id}>{et.label}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={lbl}>Producto</label>
                            <select value={producto} onChange={e => setProducto(e.target.value)} className={inp}>
                                <option value="">—</option>
                                {CRM_PRODUCTOS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div><label className={lbl}>Estilo</label><input value={estilo} onChange={e => setEstilo(e.target.value)} className={inp} placeholder="Jazz, Heels…" /></div>
                    </div>
                    <div><label className={lbl}>Profe de interés</label><input value={profe} onChange={e => setProfe(e.target.value)} className={inp} placeholder="Nombre del profe" /></div>
                    <div><label className={lbl}>Notas</label><textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4} className={inp + ' resize-y'} placeholder="Qué preguntó, qué se le pasó, seguimiento…" /></div>
                </div>

                <button onClick={guardar} disabled={saving} className="w-full mt-4 bg-[#D4E655] text-black font-black uppercase text-xs tracking-wide py-3 rounded-xl hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Guardar lead
                </button>
            </div>
        </div>
    )
}

// ============================ CARTELITO AL FINALIZAR ============================
// Se abre al marcar una consulta como finalizada. Trae el resumen del chat (IA)
// y los campos del CRM pre-llenados; recep corrige/anota y guarda.
export function CrmFinalizarModal({ consulta, onClose, onDone }: {
    consulta: { id: string; subscriber_id: string | null; contacto_nombre: string | null; contacto_usuario: string | null; canal: string | null }
    onClose: () => void
    onDone: (consultaId: string) => void
}) {
    const [cargando, setCargando] = useState(true)
    const [etapa, setEtapa] = useState('ganado')
    const [producto, setProducto] = useState('')
    const [estilo, setEstilo] = useState('')
    const [profe, setProfe] = useState('')
    const [notas, setNotas] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let vivo = true
        ;(async () => {
            if (!consulta.subscriber_id) { setCargando(false); return }
            const r = await resumirChatCrmAction(consulta.subscriber_id)
            if (!vivo) return
            if (r.ok) {
                setNotas(r.resumen || '')
                if (r.producto) setProducto(r.producto)
                if (r.estilo) setEstilo(r.estilo)
                if (r.profe) setProfe(r.profe)
            }
            setCargando(false)
        })()
        return () => { vivo = false }
    }, [consulta.subscriber_id])

    const finalizar = async () => {
        setSaving(true)
        const r = await finalizarConsultaCrmAction(consulta.id, consulta.subscriber_id, {
            canal: consulta.canal, nombre: consulta.contacto_nombre, instagram: consulta.contacto_usuario,
            etapa, producto: producto || null, estilo: estilo || null, profe: profe || null, notas: notas || null,
        })
        setSaving(false)
        if (r.ok) { toast.success('Consulta finalizada y guardada en el CRM'); onDone(consulta.id) }
        else toast.error(r.error || 'Error')
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
            <div className="bg-[#0b0b0d] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-black uppercase tracking-wide flex items-center gap-2"><Sparkles size={16} className="text-[#D4E655]" /> Finalizar y guardar en CRM</p>
                    <button onClick={onClose} className="text-gray-500 hover:text-white p-1"><X size={18} /></button>
                </div>
                <p className="text-[11px] text-gray-500 mb-4 flex items-center gap-1.5">{consulta.canal === 'whatsapp' ? <MessageCircle size={12} className="text-emerald-400" /> : <Instagram size={12} className="text-pink-400" />} {consulta.contacto_nombre || (consulta.contacto_usuario ? '@' + consulta.contacto_usuario : 'Contacto')}</p>

                {cargando ? (
                    <div className="flex flex-col items-center py-10 text-gray-500"><Loader2 size={22} className="animate-spin text-[#D4E655] mb-2" /><span className="text-xs">Leyendo la charla y armando el resumen…</span></div>
                ) : (
                    <div className="space-y-3">
                        {!consulta.subscriber_id && <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">Este contacto no tiene chat guardado; completá los datos a mano.</p>}
                        <div>
                            <label className={lbl}>Resumen del chat (editable)</label>
                            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4} className={inp + ' resize-y'} placeholder="Resumen de la conversación / notas para el CRM" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={lbl}>Resultado (etapa)</label>
                                <select value={etapa} onChange={e => setEtapa(e.target.value)} className={inp}>
                                    {CRM_ETAPAS.map(et => <option key={et.id} value={et.id}>{et.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={lbl}>Producto</label>
                                <select value={producto} onChange={e => setProducto(e.target.value)} className={inp}>
                                    <option value="">—</option>
                                    {CRM_PRODUCTOS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className={lbl}>Estilo</label><input value={estilo} onChange={e => setEstilo(e.target.value)} className={inp} placeholder="Jazz, Heels…" /></div>
                            <div><label className={lbl}>Profe</label><input value={profe} onChange={e => setProfe(e.target.value)} className={inp} placeholder="Profe de interés" /></div>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button onClick={onClose} className="flex-1 bg-white/5 text-gray-300 font-bold uppercase text-xs py-3 rounded-xl hover:bg-white/10">Cancelar</button>
                            <button onClick={finalizar} disabled={saving} className="flex-1 bg-[#D4E655] text-black font-black uppercase text-xs py-3 rounded-xl hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Finalizar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ============================ BOARD / EMBUDO ============================
export default function CrmPanel() {
    const [leads, setLeads] = useState<CrmLead[]>([])
    const [loading, setLoading] = useState(true)
    const [q, setQ] = useState('')
    const [filtro, setFiltro] = useState<string>('todas')
    const [editar, setEditar] = useState<CrmLead | null>(null)
    const [verChat, setVerChat] = useState<CrmLead | null>(null)

    const cargar = async () => {
        setLoading(true)
        const r = await getCrmLeadsAction()
        if (r.ok) setLeads(r.leads); else toast.error((r as any).error || 'Error')
        setLoading(false)
    }
    useEffect(() => { void cargar() }, [])

    const conteo: Record<string, number> = {}
    for (const l of leads) conteo[l.etapa] = (conteo[l.etapa] || 0) + 1
    const urgentes = leads.filter(l => l.alerta === 'urgente').length

    const norm = (s: string) => (s || '').toLowerCase()
    const visibles = leads.filter(l => {
        if (filtro !== 'todas' && l.etapa !== filtro) return false
        if (!q.trim()) return true
        const t = norm(q)
        return [l.nombre, l.instagram, l.producto, l.estilo, l.profe, l.notas].some(v => norm(v || '').includes(t))
    })

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, producto, estilo, profe…" className="w-full bg-[#111] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#D4E655]/60" />
                </div>
                <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={15} /></button>
            </div>

            {urgentes > 0 && (
                <div className="mb-4 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                    <AlertTriangle size={14} /> {urgentes} lead{urgentes === 1 ? '' : 's'} sin contacto hace 7+ días — conviene volver a escribir.
                </div>
            )}

            {/* filtros por etapa */}
            <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setFiltro('todas')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide border ${filtro === 'todas' ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-400 border-white/10'}`}>Todas ({leads.length})</button>
                {CRM_ETAPAS.map(et => (
                    <button key={et.id} onClick={() => setFiltro(et.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide border ${filtro === et.id ? cls(et.id) : 'bg-[#111] text-gray-400 border-white/10'}`}>
                        {et.label} ({conteo[et.id] || 0})
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : visibles.length === 0 ? (
                <div className="text-center py-16 text-gray-500"><Users size={30} className="mx-auto mb-3 opacity-40" /><p className="text-sm">No hay leads {filtro !== 'todas' ? 'en esta etapa' : 'todavía'}.</p><p className="text-[11px] mt-1">Se van cargando solos a medida que llegan consultas.</p></div>
            ) : (
                <div className="space-y-2">
                    {visibles.map(l => (
                        <div key={l.subscriber_id} className="w-full bg-[#0e0e10] border border-white/10 rounded-xl p-3 hover:border-white/25 transition-colors">
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${alertaDot(l.alerta)}`} title={l.alerta === 'urgente' ? 'Sin contacto 7+ días' : l.alerta === 'seguir' ? 'Seguir' : 'Al día'} />
                                {canalIcon(l.canal)}
                                <button onClick={() => setEditar(l)} className="font-bold text-sm truncate flex-1 text-left hover:text-[#D4E655]">{l.nombre || (l.instagram ? '@' + l.instagram : 'Contacto')}</button>
                                {l.perfil_nombre && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase font-bold flex items-center gap-0.5"><UserCheck size={9} /> Cliente</span>}
                                <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold ${cls(l.etapa)}`}>{etapaInfo(l.etapa).label}</span>
                                <button onClick={() => setVerChat(l)} title="Ver chat" className="text-gray-500 hover:text-white p-1 shrink-0"><Eye size={15} /></button>
                            </div>
                            <button onClick={() => setEditar(l)} className="w-full text-left flex flex-wrap items-center gap-1.5 mt-2 pl-6">
                                {l.producto && <span className="text-[10px] bg-white/5 border border-white/10 text-gray-300 px-2 py-0.5 rounded-full">{l.producto}</span>}
                                {l.estilo && <span className="text-[10px] bg-white/5 border border-white/10 text-gray-400 px-2 py-0.5 rounded-full">{l.estilo}</span>}
                                {l.profe && <span className="text-[10px] bg-white/5 border border-white/10 text-gray-400 px-2 py-0.5 rounded-full">👤 {l.profe}</span>}
                                <span className="text-[10px] text-gray-600 ml-auto">{l.diasSinContacto === 0 ? 'hoy' : `hace ${l.diasSinContacto}d`}</span>
                            </button>
                            {l.notas && <p className="text-[11px] text-gray-500 mt-1.5 pl-6 line-clamp-2">{l.notas}</p>}
                        </div>
                    ))}
                </div>
            )}

            {editar && <LeadEditor lead={editar} onClose={() => { setEditar(null); cargar() }} onSaved={() => { setEditar(null); cargar() }} onVerChat={(l) => setVerChat(l)} />}
            {verChat && <ChatModal subscriberId={verChat.subscriber_id} titulo={verChat.nombre || (verChat.instagram ? '@' + verChat.instagram : 'Chat')} onClose={() => setVerChat(null)} />}
        </div>
    )
}
