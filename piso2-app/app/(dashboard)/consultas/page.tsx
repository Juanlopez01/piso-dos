'use client'

import { useEffect, useState } from 'react'
import { Loader2, Send, Check, MessageCircle, Instagram, User as UserIcon, RefreshCw, Inbox } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { getConsultasAction, responderConsultaAction, marcarResueltaAction } from '@/app/actions/consultas'

type Msg = { de: 'usuario' | 'recep' | 'bot'; texto: string; created_at: string }
type Consulta = {
    id: string; created_at: string; canal: string
    contacto_nombre: string | null; contacto_usuario: string | null; subscriber_id: string | null
    consulta: string | null; estado: string; mensajes: Msg[]
}

const hora = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function ConsultasPage() {
    const [consultas, setConsultas] = useState<Consulta[]>([])
    const [loading, setLoading] = useState(true)
    const [soloPend, setSoloPend] = useState(true)
    const [abierta, setAbierta] = useState<string | null>(null)
    const [respuesta, setRespuesta] = useState('')
    const [enviando, setEnviando] = useState(false)

    const cargar = async () => {
        setLoading(true)
        const r = await getConsultasAction(soloPend)
        if (r.ok) setConsultas(r.consultas as Consulta[])
        else toast.error(r.error || 'Error al cargar')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [soloPend])

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

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2">
                        <MessageCircle className="text-[#D4E655]" size={26} /> Consultas
                    </h1>
                    <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Derivaciones del asistente</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setSoloPend(v => !v)} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors ${soloPend ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-300 border-white/10'}`}>
                        {soloPend ? 'Pendientes' : 'Todas'}
                    </button>
                    <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
                </div>
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
                                        {/* Hilo */}
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

                                        {/* Responder */}
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
        </div>
    )
}
