'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Star, Loader2, CheckCircle2 } from 'lucide-react'
import { crearResenaAction, getEventoNombrePublicoAction } from '@/app/actions/eventos'

export default function ResenaPage() {
    const params = useParams()
    const eventoId = String(params.eventoId || '')
    const [evento, setEvento] = useState<string | null>(null)
    const [cargando, setCargando] = useState(true)

    const [rating, setRating] = useState(0)
    const [hover, setHover] = useState(0)
    const [nombre, setNombre] = useState('')
    const [comentario, setComentario] = useState('')
    const [enviando, setEnviando] = useState(false)
    const [listo, setListo] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        getEventoNombrePublicoAction(eventoId).then(r => { setEvento(r.nombre); setCargando(false) })
    }, [eventoId])

    const enviar = async () => {
        setError('')
        if (rating < 1) { setError('Elegí de 1 a 5 estrellas.'); return }
        setEnviando(true)
        const r = await crearResenaAction(eventoId, { nombre, rating, comentario })
        setEnviando(false)
        if (r.ok) setListo(true); else setError(r.error || 'No se pudo enviar.')
    }

    return (
        <div style={{ minHeight: '100vh', background: '#050505', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ width: '100%', maxWidth: 440, background: '#0d0d0f', border: '1px solid rgba(255,255,255,.1)', borderRadius: 24, padding: 28 }}>
                <div style={{ fontWeight: 900, fontSize: 26, letterSpacing: -1, marginBottom: 4 }}>PISO<span style={{ color: '#D4E655' }}>2</span></div>

                {cargando ? (
                    <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" /></div>
                ) : listo ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <CheckCircle2 size={48} color="#D4E655" style={{ margin: '0 auto 12px' }} />
                        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px' }}>¡Gracias por tu reseña!</h1>
                        <p style={{ color: '#999', fontSize: 14 }}>Nos ayuda un montón a seguir mejorando. 💚</p>
                    </div>
                ) : (
                    <>
                        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '10px 0 2px' }}>¿Qué te pareció?</h1>
                        <p style={{ color: '#D4E655', fontWeight: 700, fontSize: 13, margin: '0 0 18px' }}>{evento || 'La función'}</p>

                        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
                            {[1, 2, 3, 4, 5].map(n => (
                                <button key={n} type="button" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                    <Star size={38} strokeWidth={1.5}
                                        color={(hover || rating) >= n ? '#D4E655' : '#444'}
                                        fill={(hover || rating) >= n ? '#D4E655' : 'none'} />
                                </button>
                            ))}
                        </div>

                        <input placeholder="Tu nombre (opcional)" value={nombre} onChange={e => setNombre(e.target.value)}
                            style={{ width: '100%', boxSizing: 'border-box', background: '#000', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: '12px 14px', color: '#fff', fontSize: 14, marginBottom: 10, outline: 'none' }} />
                        <textarea placeholder="Contanos qué te pareció (opcional)" value={comentario} onChange={e => setComentario(e.target.value)} rows={4}
                            style={{ width: '100%', boxSizing: 'border-box', background: '#000', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: '12px 14px', color: '#fff', fontSize: 14, marginBottom: 14, outline: 'none', resize: 'vertical' }} />

                        {error && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

                        <button onClick={enviar} disabled={enviando}
                            style={{ width: '100%', background: '#D4E655', color: '#000', border: 'none', borderRadius: 12, padding: '14px', fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: enviando ? .6 : 1 }}>
                            {enviando ? <Loader2 size={18} className="animate-spin" /> : null} Enviar reseña
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
