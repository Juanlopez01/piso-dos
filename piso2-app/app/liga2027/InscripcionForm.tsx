'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { postularLiga27Action } from '@/app/actions/liga2027'
import { toast, Toaster } from 'sonner'
import { Loader2, Phone, MessageCircle, CheckCircle2, UserPlus } from 'lucide-react'

const inputCls = "w-full bg-[#141417] border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#D4E655]/60 transition-colors placeholder:text-white/30 [color-scheme:dark]"
const labelCls = "text-[10px] font-black tracking-[0.15em] uppercase text-white/50 block mb-1.5"

type Contacto = 'llamar' | 'escribir' | 'anotarse'

const OPCIONES: { key: Contacto; label: string; icon: any; desc: string }[] = [
    { key: 'llamar', label: 'Quiero que me llamen', icon: Phone, desc: 'Te contactamos por teléfono.' },
    { key: 'escribir', label: 'Quiero que me escriban', icon: MessageCircle, desc: 'Te escribimos por WhatsApp/mail.' },
    { key: 'anotarse', label: 'Quiero anotarme directamente', icon: UserPlus, desc: 'Arrancás tu inscripción ya.' },
]

export default function InscripcionForm({ lanzamientoId }: { lanzamientoId: string }) {
    const [supabase] = useState(() => createClient())
    const [form, setForm] = useState({ nombre: '', email: '', telefono: '', instagram: '', fecha_nac: '', ciudad: '', nota: '' })
    const [fotoUrl, setFotoUrl] = useState('')
    const [tipo, setTipo] = useState<Contacto | null>(null)
    const [subiendo, setSubiendo] = useState(false)
    const [enviando, setEnviando] = useState(false)
    const [listo, setListo] = useState(false)

    const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

    const subirFoto = async (file: File) => {
        setSubiendo(true)
        try {
            const ext = file.name.split('.').pop() || 'jpg'
            const path = `liga2027/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
            const { error } = await supabase.storage.from('talent').upload(path, file, { upsert: true })
            if (error) throw error
            setFotoUrl(supabase.storage.from('talent').getPublicUrl(path).data.publicUrl)
        } catch (e: any) {
            toast.error('No se pudo subir la foto.')
        } finally { setSubiendo(false) }
    }

    const enviar = async () => {
        if (!tipo) return toast.error('Elegí una opción para avanzar.')
        if (!form.nombre.trim()) return toast.error('Poné tu nombre.')
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return toast.error('Poné un email válido.')
        setEnviando(true)
        const res = await postularLiga27Action({
            nombre: form.nombre, email: form.email, telefono: form.telefono, instagram: form.instagram,
            fecha_nac: form.fecha_nac || null, ciudad: form.ciudad, foto_url: fotoUrl || undefined,
            tipo_contacto: tipo, nota: form.nota, lanzamiento_id: lanzamientoId,
        })
        if (res.ok) { setListo(true) }
        else { toast.error(res.error || 'No se pudo enviar.'); setEnviando(false) }
    }

    if (listo) {
        return (
            <div className="text-center py-10">
                <Toaster position="top-center" richColors theme="dark" />
                <CheckCircle2 size={44} className="mx-auto text-[#D4E655]" />
                <h3 className="text-xl font-black uppercase tracking-tight mt-4 text-white">¡Listo! Recibimos tu inscripción.</h3>
                <p className="text-gray-400 text-sm mt-2 max-w-sm mx-auto">
                    {tipo === 'anotarse'
                        ? 'Cuando aprobemos tu inscripción te vamos a crear tu cuenta de Piso 2 y te avisamos por mail para que entres a ver tu perfil.'
                        : 'Nos vamos a contactar con vos a la brevedad.'}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <Toaster position="top-center" richColors theme="dark" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                    <label className={labelCls}>Nombre y apellido *</label>
                    <input value={form.nombre} onChange={e => set('nombre', e.target.value)} className={inputCls} placeholder="Nombre" />
                </div>
                <div>
                    <label className={labelCls}>Email *</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="tu@email.com" />
                </div>
                <div>
                    <label className={labelCls}>Teléfono</label>
                    <input value={form.telefono} onChange={e => set('telefono', e.target.value)} className={inputCls} placeholder="11..." />
                </div>
                <div>
                    <label className={labelCls}>Instagram</label>
                    <input value={form.instagram} onChange={e => set('instagram', e.target.value)} className={inputCls} placeholder="@usuario" />
                </div>
                <div>
                    <label className={labelCls}>Fecha de nacimiento</label>
                    <input type="date" value={form.fecha_nac} onChange={e => set('fecha_nac', e.target.value)} className={inputCls} />
                </div>
                <div>
                    <label className={labelCls}>Ciudad</label>
                    <input value={form.ciudad} onChange={e => set('ciudad', e.target.value)} className={inputCls} placeholder="Ciudad" />
                </div>
            </div>

            <div>
                <label className={labelCls}>Foto (opcional)</label>
                <div className="flex items-center gap-3">
                    <label className="cursor-pointer text-xs text-white/70 border border-white/10 rounded-lg px-4 py-2.5 hover:border-[#D4E655]/60 transition-colors">
                        {subiendo ? <Loader2 size={14} className="animate-spin inline" /> : 'Subir foto'}
                        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && subirFoto(e.target.files[0])} />
                    </label>
                    {fotoUrl && <img src={fotoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                </div>
            </div>

            <div>
                <label className={labelCls}>Contanos algo (opcional)</label>
                <textarea value={form.nota} onChange={e => set('nota', e.target.value)} className={inputCls} rows={2} placeholder="Experiencia, disciplinas, lo que quieras." />
            </div>

            <div>
                <label className={labelCls}>¿Cómo querés avanzar? *</label>
                <div className="grid grid-cols-1 gap-2.5 mt-1">
                    {OPCIONES.map(o => {
                        const Icon = o.icon
                        const active = tipo === o.key
                        return (
                            <button key={o.key} type="button" onClick={() => setTipo(o.key)}
                                className={`flex items-center gap-3 text-left border rounded-lg px-4 py-3 transition-colors ${active ? 'border-[#D4E655] bg-[#D4E655]/10 text-white' : 'border-white/10 hover:border-white/30 text-white'}`}>
                                <Icon size={18} className={active ? 'text-[#D4E655]' : 'text-white/40'} />
                                <div>
                                    <div className="text-sm font-semibold">{o.label}</div>
                                    <div className={`text-[11px] ${active ? 'text-white/70' : 'text-white/40'}`}>{o.desc}</div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            <button onClick={enviar} disabled={enviando || subiendo}
                className="w-full bg-[#D4E655] text-black font-black uppercase tracking-[0.2em] text-xs py-4 hover:bg-white transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                {enviando ? <Loader2 size={15} className="animate-spin" /> : null} Enviar inscripción
            </button>
        </div>
    )
}
