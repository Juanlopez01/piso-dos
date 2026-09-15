'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search, User, CreditCard, AlertCircle, CalendarDays, Link2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
    getVinculoContactoAction, getFichaAlumnoAction, buscarPerfilesAction,
    vincularContactoAction, desvincularContactoAction,
} from '@/app/actions/consultas'

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function FichaAlumno({ subscriberId, canal, contactoNombre }: {
    subscriberId: string | null; canal: string; contactoNombre: string | null
}) {
    const [estado, setEstado] = useState<'cargando' | 'ficha' | 'buscar'>('cargando')
    const [ficha, setFicha] = useState<any>(null)
    const [q, setQ] = useState('')
    const [resultados, setResultados] = useState<any[]>([])
    const [buscando, setBuscando] = useState(false)

    const cargarFicha = async (perfilId: string) => {
        setEstado('cargando')
        const r = await getFichaAlumnoAction(perfilId)
        if (r.ok) { setFicha(r.ficha); setEstado('ficha') } else { setEstado('buscar') }
    }

    useEffect(() => {
        let vivo = true
        setFicha(null); setResultados([]); setQ('')
        ;(async () => {
            if (!subscriberId) { setEstado('buscar'); return }
            setEstado('cargando')
            const v = await getVinculoContactoAction(subscriberId)
            if (!vivo) return
            if (v.perfilId) { cargarFicha(v.perfilId); return }
            if (contactoNombre) {
                const s = await buscarPerfilesAction(contactoNombre)
                if (!vivo) return
                setResultados(s.perfiles); setQ(contactoNombre)
            }
            setEstado('buscar')
        })()
        return () => { vivo = false }
    }, [subscriberId])

    const buscar = async (texto: string) => {
        setQ(texto)
        if (texto.trim().length < 2) { setResultados([]); return }
        setBuscando(true)
        const r = await buscarPerfilesAction(texto)
        setResultados(r.perfiles); setBuscando(false)
    }
    const vincular = async (perfilId: string) => {
        if (!subscriberId) return
        const r = await vincularContactoAction(subscriberId, canal, perfilId)
        if (r.ok) cargarFicha(perfilId); else toast.error(r.error || 'No se pudo vincular')
    }
    const desvincular = async () => {
        if (!subscriberId) return
        await desvincularContactoAction(subscriberId)
        setFicha(null); setResultados([]); setQ(''); setEstado('buscar')
    }

    const Wrap = ({ children }: { children: React.ReactNode }) => (
        <div className="mb-3 rounded-xl border border-[#D4E655]/20 bg-[#D4E655]/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#D4E655] flex items-center gap-1.5 mb-2"><User size={12} /> Ficha del alumno</p>
            {children}
        </div>
    )

    if (estado === 'cargando') return <Wrap><div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-[#D4E655]" /></div></Wrap>

    if (estado === 'buscar') return (
        <Wrap>
            <div className="relative mb-2">
                <Search size={13} className="absolute left-2.5 top-2.5 text-gray-500" />
                <input value={q} onChange={e => buscar(e.target.value)} placeholder="Buscar alumno por nombre o teléfono…"
                    className="w-full bg-[#111] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-[#D4E655]" />
            </div>
            {buscando && <div className="flex justify-center py-1"><Loader2 size={13} className="animate-spin text-gray-500" /></div>}
            <div className="space-y-1">
                {resultados.map(r => (
                    <button key={r.id} onClick={() => vincular(r.id)}
                        className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#111] border border-white/5 hover:border-[#D4E655]/40 transition-colors">
                        <span className="min-w-0">
                            <span className="block text-xs font-bold text-white truncate">{r.nombre_completo || 'Sin nombre'}</span>
                            <span className="block text-[10px] text-gray-500 truncate">{r.telefono || r.email || ''}</span>
                        </span>
                        <Link2 size={13} className="text-[#D4E655] shrink-0" />
                    </button>
                ))}
                {!buscando && q.trim().length >= 2 && resultados.length === 0 && (
                    <p className="text-[10px] text-gray-500 italic px-1">Sin coincidencias. Probá con otro nombre o el teléfono.</p>
                )}
            </div>
            <p className="text-[9px] text-gray-500 mt-2 leading-snug">Vinculá el contacto con su perfil para ver créditos, deudas y próximas clases acá mismo. Queda guardado para la próxima.</p>
        </Wrap>
    )

    // estado === 'ficha'
    const f = ficha
    return (
        <Wrap>
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{f.nombre || 'Alumno'}</p>
                    <p className="text-[10px] text-gray-400 truncate">{f.telefono || f.email || ''}</p>
                </div>
                <button onClick={desvincular} title="Desvincular / cambiar" className="text-gray-500 hover:text-white shrink-0"><X size={14} /></button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-orange-500/15 text-orange-300">Reg: {f.creditos.regulares}</span>
                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-purple-500/15 text-purple-300">Esp: {f.creditos.especiales}</span>
                {f.creditos.pases.map((p: any, i: number) => (
                    <span key={i} className="text-[10px] font-bold px-2 py-1 rounded-md bg-cyan-500/15 text-cyan-300">{p.cantidad}× pase</span>
                ))}
            </div>

            {f.deudaTotal > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-400 bg-red-500/10 rounded-md px-2 py-1.5 mb-2">
                    <AlertCircle size={13} /> Debe {pesos(f.deudaTotal)}
                </div>
            )}

            {f.packs.length > 0 && (
                <div className="mb-2">
                    <p className="text-[9px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-1"><CreditCard size={11} /> Packs</p>
                    <div className="space-y-1">
                        {f.packs.map((pk: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-[11px] bg-[#111] rounded-md px-2 py-1.5">
                                <span className="text-gray-200 truncate mr-2">{pk.nombre}</span>
                                <span className="text-gray-400 shrink-0">
                                    {pk.restantes}/{pk.inicial}{pk.deuda > 0 ? <span className="text-red-400 font-bold"> · debe {pesos(pk.deuda)}</span> : null}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {f.proximas.length > 0 && (
                <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-1"><CalendarDays size={11} /> Próximas clases</p>
                    <div className="space-y-1">
                        {f.proximas.map((c: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-[11px] bg-[#111] rounded-md px-2 py-1.5">
                                <span className="text-gray-200 truncate mr-2">{c.nombre}</span>
                                <span className="text-gray-500 shrink-0 capitalize">{fechaCorta(c.inicio)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {f.packs.length === 0 && f.proximas.length === 0 && f.creditos.regulares === 0 && f.creditos.especiales === 0 && (
                <p className="text-[10px] text-gray-500 italic">Sin créditos ni clases próximas.</p>
            )}
        </Wrap>
    )
}
