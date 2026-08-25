'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User as UserIcon, Loader2, Sparkles } from 'lucide-react'
import { preguntarAsistenteAction } from '@/app/actions/asistente'

type Msg = { de: 'user' | 'bot'; texto: string }

const SUGERENCIAS = [
    '¿Qué clases hay hoy?',
    'Clases de jazz esta semana',
    'Precios de los packs',
    'Tarifas de alquiler',
    '¿Está libre la Sala 1 mañana?',
]

// Formato mínimo estilo WhatsApp: *negrita* y saltos de línea.
function render(texto: string) {
    return texto.split('\n').map((linea, i) => {
        const partes = linea.split(/(\*[^*]+\*)/g).map((p, j) =>
            p.startsWith('*') && p.endsWith('*')
                ? <strong key={j} className="text-white">{p.slice(1, -1)}</strong>
                : <span key={j}>{p}</span>
        )
        return <div key={i}>{partes.length ? partes : <br />}</div>
    })
}

export default function AsistenteTestPage() {
    const [mensajes, setMensajes] = useState<Msg[]>([
        { de: 'bot', texto: '¡Hola! 👋 Soy el asistente de *Piso 2* (versión de prueba). Preguntame por clases, precios o alquiler de salas.' },
    ])
    const [input, setInput] = useState('')
    const [cargando, setCargando] = useState(false)
    const finRef = useRef<HTMLDivElement>(null)

    useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, cargando])

    const enviar = async (texto: string) => {
        const q = texto.trim()
        if (!q || cargando) return
        setMensajes(m => [...m, { de: 'user', texto: q }])
        setInput('')
        setCargando(true)
        try {
            const r = await preguntarAsistenteAction(q)
            setMensajes(m => [...m, { de: 'bot', texto: r.ok ? (r.respuesta || '') : `⚠️ ${r.error}` }])
        } catch {
            setMensajes(m => [...m, { de: 'bot', texto: '⚠️ Hubo un error al procesar la consulta.' }])
        } finally {
            setCargando(false)
        }
    }

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white flex flex-col">
            {/* HEADER */}
            <div className="mb-4 shrink-0">
                <h1 className="text-3xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
                    <Sparkles className="text-[#D4E655]" size={26} /> Asistente <span className="text-[#D4E655]">· Test</span>
                </h1>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">
                    Fase 1 · Responde con datos reales (clases, precios, alquiler)
                </p>
            </div>

            {/* CHAT */}
            <div className="flex-1 max-w-2xl w-full mx-auto flex flex-col bg-[#09090b] border border-white/10 rounded-3xl overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-[45vh] max-h-[62vh]">
                    {mensajes.map((m, i) => (
                        <div key={i} className={`flex gap-3 ${m.de === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.de === 'user' ? 'bg-white/10 text-gray-300' : 'bg-[#D4E655] text-black'}`}>
                                {m.de === 'user' ? <UserIcon size={16} /> : <Bot size={16} />}
                            </div>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.de === 'user' ? 'bg-white/10 text-white rounded-tr-sm' : 'bg-[#161616] text-gray-200 rounded-tl-sm'}`}>
                                {render(m.texto)}
                            </div>
                        </div>
                    ))}
                    {cargando && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#D4E655] text-black flex items-center justify-center shrink-0"><Bot size={16} /></div>
                            <div className="bg-[#161616] rounded-2xl rounded-tl-sm px-4 py-3"><Loader2 className="animate-spin text-[#D4E655]" size={16} /></div>
                        </div>
                    )}
                    <div ref={finRef} />
                </div>

                {/* SUGERENCIAS */}
                <div className="px-4 pt-2 flex flex-wrap gap-2 border-t border-white/5">
                    {SUGERENCIAS.map(s => (
                        <button key={s} onClick={() => enviar(s)} disabled={cargando}
                            className="text-[11px] font-semibold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50">
                            {s}
                        </button>
                    ))}
                </div>

                {/* INPUT */}
                <form onSubmit={e => { e.preventDefault(); enviar(input) }} className="p-3 flex gap-2 items-center">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Escribí tu consulta…"
                        className="flex-1 bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4E655] transition-colors"
                    />
                    <button type="submit" disabled={cargando || !input.trim()}
                        className="bg-[#D4E655] text-black w-12 h-12 rounded-xl flex items-center justify-center hover:bg-white transition-colors disabled:opacity-40 shrink-0">
                        <Send size={18} />
                    </button>
                </form>
            </div>

            <p className="text-center text-[11px] text-gray-600 mt-3 max-w-2xl mx-auto">
                Versión de prueba interna. Entiende por palabras clave; la comprensión con IA y los canales (WhatsApp / Instagram) se suman en las próximas fases.
            </p>
        </div>
    )
}
