'use client'

import { useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { inscribirPublicoAction } from '@/app/actions/audiciones'

export default function InscripcionClient({ id, token }: { id: string; token: string }) {
    const [f, setF] = useState({
        nombre: '', instagram: '', telefono: '', mail: '', fecha_nacimiento: '', ciudad_origen: '', altura: '',
        manejo_tacos: false, sabe_jazz_heels: false, sabe_tecnica: false, sabe_urbano: false,
    })
    const [enviando, setEnviando] = useState(false)
    const [hecho, setHecho] = useState<number | null>(null)
    const [error, setError] = useState('')
    const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }))
    const toggle = (k: string) => setF(prev => ({ ...prev, [k]: !(prev as any)[k] }))

    const enviar = async () => {
        if (!f.nombre.trim()) { setError('Poné tu nombre y apellido.'); return }
        setEnviando(true); setError('')
        const r = await inscribirPublicoAction(id, token, f)
        if (r.ok) setHecho(r.numero)
        else { setError(r.error || 'No se pudo enviar.'); setEnviando(false) }
    }

    if (hecho !== null) return (
        <div className="text-center py-10">
            <div className="w-14 h-14 rounded-full bg-[#D4E655] flex items-center justify-center mx-auto mb-4"><Check size={28} className="text-black" strokeWidth={3} /></div>
            <p className="text-lg font-black mb-1">¡Listo, {f.nombre.split(' ')[0]}!</p>
            <p className="text-sm text-neutral-600">Tu número de audición es</p>
            <p className="text-5xl font-black my-2">{hecho}</p>
            <p className="text-xs text-neutral-500">Mostrá este número cuando te llamen. ¡Mucha mierda! 🍀</p>
        </div>
    )

    const inp = 'w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900 transition-colors'
    const lbl = 'block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1'

    return (
        <div className="space-y-3">
            <div><label className={lbl}>Nombre y apellido *</label><input className={inp} value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Tu nombre completo" /></div>
            <div><label className={lbl}>Instagram (que esté abierto / público, no privado)</label><input className={inp} value={f.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@usuario" /></div>
            <div><label className={lbl}>Teléfono / WhatsApp</label><input className={inp} value={f.telefono} onChange={e => set('telefono', e.target.value)} placeholder="Cód. área + número" inputMode="tel" /></div>
            <div><label className={lbl}>Mail</label><input className={inp} value={f.mail} onChange={e => set('mail', e.target.value)} placeholder="tucorreo@mail.com" inputMode="email" /></div>
            <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Fecha de nacimiento</label><input type="date" className={inp} value={f.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} /></div>
                <div><label className={lbl}>Ciudad</label><input className={inp} value={f.ciudad_origen} onChange={e => set('ciudad_origen', e.target.value)} placeholder="De dónde venís" /></div>
            </div>
            <div><label className={lbl}>Altura</label><input className={inp} value={f.altura} onChange={e => set('altura', e.target.value)} placeholder="Ej: 1.70" /></div>

            <div>
                <label className={lbl}>¿Con qué contás?</label>
                <div className="grid grid-cols-1 gap-2">
                    {([
                        ['manejo_tacos', 'Manejo de tacos'],
                        ['sabe_jazz_heels', 'Jazz / Heels'],
                        ['sabe_tecnica', 'Técnica'],
                        ['sabe_urbano', 'Danzas urbanas / comerciales'],
                    ] as const).map(([k, label]) => (
                        <button type="button" key={k} onClick={() => toggle(k)} className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium text-left transition-colors ${(f as any)[k] ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-300'}`}>
                            <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${(f as any)[k] ? 'bg-white border-white' : 'border-neutral-400'}`}>{(f as any)[k] && <Check size={14} className="text-black" strokeWidth={3} />}</span>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
            <button onClick={enviar} disabled={enviando} className="w-full bg-black text-white font-bold text-sm rounded-xl py-3.5 hover:bg-neutral-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
                {enviando ? <Loader2 size={17} className="animate-spin" /> : 'Anotarme'}
            </button>
            <p className="text-[10px] text-neutral-400 text-center">Tus datos quedan para el equipo de Piso 2.</p>
        </div>
    )
}
