'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { optimizeImage } from '@/utils/optimizeImage'
import { crearPropuestaObraAction } from '@/app/actions/convocatoria'
import { toast, Toaster } from 'sonner'
import { Loader2, Upload, X, CheckCircle2, Link2, Theater } from 'lucide-react'

const TIPOS = ['Danza', 'Teatro', 'Música', 'Mixta', 'Artes vivas', 'Muestra']
const inp = 'w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors'
const lbl = 'text-[10px] font-semibold tracking-[0.15em] uppercase text-neutral-500 block mb-1.5'

type Ciclo = { id: string; titulo: string; descripcion?: string | null }

export default function ConvocatoriaForm({ ciclo }: { ciclo?: Ciclo | null }) {
    const [supabase] = useState(() => createClient())
    const [f, setF] = useState({ titulo: '', director: '', compania: '', tipo: '', participantes: '', duracion: '', descripcion: '', instagram: '', email: '', telefono: '' })
    const [imagenes, setImagenes] = useState<string[]>([])
    const [videos, setVideos] = useState<string[]>(['', '', ''])
    const [subiendo, setSubiendo] = useState(false)
    const [enviando, setEnviando] = useState(false)
    const [listo, setListo] = useState(false)

    const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))

    const subirImgs = async (files: FileList | null) => {
        if (!files?.length) return
        setSubiendo(true)
        const nuevas: string[] = []
        for (const file of Array.from(files)) {
            if (imagenes.length + nuevas.length >= 6) break
            try {
                const opt = await optimizeImage(file, { maxDim: 1600 })
                const ext = opt.name.split('.').pop()
                const path = `obras/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
                const { error } = await supabase.storage.from('talent').upload(path, opt)
                if (error) throw error
                nuevas.push(supabase.storage.from('talent').getPublicUrl(path).data.publicUrl)
            } catch (e: any) { toast.error('No se pudo subir una imagen: ' + (e.message || '')) }
        }
        setImagenes(x => [...x, ...nuevas].slice(0, 6))
        setSubiendo(false)
    }

    const enviar = async () => {
        if (!f.titulo.trim()) return toast.error('Poné el nombre de la obra.')
        if (!f.director.trim()) return toast.error('Completá el/los director/es.')
        if (!f.compania.trim()) return toast.error('Completá la compañía / elenco.')
        if (!f.tipo) return toast.error('Elegí el tipo de obra.')
        if (!f.participantes) return toast.error('Indicá la cantidad de participantes.')
        if (!f.duracion) return toast.error('Indicá la duración.')
        if (!f.descripcion.trim()) return toast.error('Contanos de qué trata la obra.')
        if (!f.email.includes('@') && !f.telefono.trim()) return toast.error('Dejanos un email o teléfono.')
        if (imagenes.length === 0) return toast.error('Subí al menos una foto (flyer) de la obra.')
        if (videos.filter(v => v.trim()).length === 0) return toast.error('Dejá al menos un link de video.')
        setEnviando(true)
        const r = await crearPropuestaObraAction({
            titulo: f.titulo, director: f.director, compania: f.compania, tipo_obra: f.tipo || undefined,
            participantes: f.participantes ? Number(f.participantes) : undefined,
            duracion_min: f.duracion ? Number(f.duracion) : undefined,
            descripcion: f.descripcion, instagram: f.instagram, email: f.email, telefono: f.telefono,
            videos: videos.map(v => v.trim()).filter(Boolean), imagenes,
            convocatoria_id: ciclo?.id,
        })
        if (r.ok) setListo(true); else toast.error(r.error || 'Error al enviar')
        setEnviando(false)
    }

    if (listo) return (
        <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center px-6 text-center text-neutral-900">
            <CheckCircle2 size={44} className="mb-5" strokeWidth={1.5} />
            <h1 className="text-3xl font-black tracking-tight mb-2">¡Propuesta enviada!</h1>
            <p className="text-neutral-500 text-sm max-w-sm">El equipo de Piso 2 va a revisar tu obra y te contacta. ¡Gracias!</p>
        </div>
    )

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900">
            <Toaster position="top-center" richColors />
            <div className="bg-black text-white py-3 text-center"><span className="font-black tracking-tighter text-lg">PISO<span className="text-[#D4E655]">2</span></span></div>

            <div className="max-w-lg mx-auto px-5 py-8">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-1"><Theater size={14} /> {ciclo ? 'Convocatoria' : 'Convocatoria de obras'}</div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">{ciclo ? ciclo.titulo : 'Proponé tu obra en Piso 2'}</h1>
                {ciclo?.descripcion
                    ? <p className="text-sm text-neutral-600 mt-2 whitespace-pre-line">{ciclo.descripcion}</p>
                    : <p className="text-sm text-neutral-500 mt-2">Contanos de tu obra y el equipo la evalúa para programarla. Es gratis postular.</p>}

                <div className="mt-6 space-y-4">
                    <div><label className={lbl}>Nombre de la obra *</label><input value={f.titulo} onChange={e => set('titulo', e.target.value)} className={inp} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className={lbl}>Director/es *</label><input value={f.director} onChange={e => set('director', e.target.value)} className={inp} /></div>
                        <div><label className={lbl}>Compañía / elenco *</label><input value={f.compania} onChange={e => set('compania', e.target.value)} className={inp} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div><label className={lbl}>Tipo *</label><select value={f.tipo} onChange={e => set('tipo', e.target.value)} className={inp}><option value="">Elegir…</option>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div><label className={lbl}>Participantes *</label><input type="number" min={1} value={f.participantes} onChange={e => set('participantes', e.target.value)} className={inp} /></div>
                        <div><label className={lbl}>Duración (min) *</label><input type="number" min={1} value={f.duracion} onChange={e => set('duracion', e.target.value)} className={inp} /></div>
                    </div>
                    <div><label className={lbl}>Descripción *</label><textarea rows={3} value={f.descripcion} onChange={e => set('descripcion', e.target.value)} className={`${inp} resize-none`} placeholder="De qué trata, estilo, antecedentes…" /></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className={lbl}>Instagram (obra/director)</label><input value={f.instagram} onChange={e => set('instagram', e.target.value)} className={inp} placeholder="@…" /></div>
                        <div><label className={lbl}>Email de contacto *</label><input type="email" value={f.email} onChange={e => set('email', e.target.value)} className={inp} /></div>
                    </div>
                    <div><label className={lbl}>Teléfono *</label><input value={f.telefono} onChange={e => set('telefono', e.target.value)} className={inp} placeholder="+54 11 …" /></div>
                    <p className="text-[11px] text-neutral-400 -mt-1">* Todos los campos son obligatorios (podés dejar email <b>o</b> teléfono).</p>

                    {/* imágenes */}
                    <div>
                        <label className={lbl}>Foto / flyer de la obra * (hasta 6)</label>
                        <div className="flex flex-wrap gap-2">
                            {imagenes.map((u, i) => (
                                <div key={i} className="relative w-20 h-24 overflow-hidden bg-neutral-100 border border-neutral-200 rounded">
                                    <img src={u} alt="" className="w-full h-full object-cover" />
                                    <button type="button" onClick={() => setImagenes(x => x.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"><X size={11} /></button>
                                </div>
                            ))}
                            {imagenes.length < 6 && (
                                <label className="w-20 h-24 border border-dashed border-neutral-300 rounded flex items-center justify-center cursor-pointer hover:border-black text-neutral-400">
                                    {subiendo ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={e => subirImgs(e.target.files)} />
                                </label>
                            )}
                        </div>
                    </div>

                    {/* videos */}
                    <div>
                        <label className={lbl}>Links de video * (al menos 1)</label>
                        <div className="space-y-2">
                            {videos.map((v, i) => (
                                <div key={i} className="relative">
                                    <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                                    <input value={v} onChange={e => setVideos(vs => vs.map((x, idx) => idx === i ? e.target.value : x))} className={`${inp} pl-9`} placeholder={`Video ${i + 1} (YouTube, Drive, Vimeo…)`} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <button onClick={enviar} disabled={enviando || subiendo} className="w-full bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs py-4 rounded-lg hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                        {enviando ? <Loader2 size={15} className="animate-spin" /> : null} Enviar propuesta
                    </button>
                </div>
            </div>
        </div>
    )
}
