'use client'

import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export type MediaItem = { tipo: 'img' | 'video'; url: string }

// ¿La URL es un archivo de video reproducible (mp4/mov…) o de storage? Si no
// (YouTube/IG/Drive), NO se puede embeber → se abre en pestaña aparte.
export const esVideoArchivo = (url: string) =>
    /\.(mp4|mov|webm|m4v|ogg)(\?|$)/i.test(url || '') || (url || '').includes('/storage/v1/object')

// Visor a pantalla completa para fotos y videos, con flechas y teclado.
export default function Lightbox({ items, index, onIndex, onClose }: {
    items: MediaItem[]; index: number; onIndex: (i: number) => void; onClose: () => void
}) {
    const n = items.length
    const it = items[index]
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowRight') onIndex((index + 1) % n)
            else if (e.key === 'ArrowLeft') onIndex((index - 1 + n) % n)
        }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [index, n, onClose, onIndex])
    if (!it) return null

    return (
        <div className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center p-4" onClick={onClose}>
            <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white z-10"><X size={28} /></button>
            {n > 1 && (
                <button onClick={e => { e.stopPropagation(); onIndex((index - 1 + n) % n) }} className="absolute left-2 md:left-6 text-white/60 hover:text-white z-10"><ChevronLeft size={40} /></button>
            )}
            <div onClick={e => e.stopPropagation()} className="max-w-[92vw] max-h-[88vh] flex items-center justify-center">
                {it.tipo === 'video'
                    ? <video src={it.url} controls autoPlay playsInline className="max-w-[92vw] max-h-[88vh] rounded-lg bg-black" />
                    : <img src={it.url} alt="" className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg" />}
            </div>
            {n > 1 && (
                <button onClick={e => { e.stopPropagation(); onIndex((index + 1) % n) }} className="absolute right-2 md:right-6 text-white/60 hover:text-white z-10"><ChevronRight size={40} /></button>
            )}
            {n > 1 && <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs font-bold tracking-widest">{index + 1} / {n}</span>}
        </div>
    )
}
