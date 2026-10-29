'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { optimizeImage } from '@/utils/optimizeImage'
import { getMiPerfilAction, guardarMiPerfilAction, logoutTalentoAction, type MiPerfil } from '@/app/actions/talent-auth'
import { toast, Toaster } from 'sonner'
import { Loader2, Upload, X, LogOut, CheckCircle2, Clock } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const inputCls = "w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors"
const labelCls = "text-[10px] font-semibold tracking-[0.15em] uppercase text-neutral-500 block mb-1.5"

const TALLES = ['XS', 'S', 'M', 'L']
const TALENTOS: { v: string; label: string }[] = [
    { v: 'dancer', label: 'Bailarín/a' },
    { v: 'acrobata', label: 'Acróbata' },
    { v: 'actor', label: 'Actor/Actriz' },
    { v: 'cantante', label: 'Cantante' },
    { v: 'musico', label: 'Músico/a' },
    { v: 'modelo', label: 'Modelo' },
]
const FOTOS: { key: keyof MiPerfil; label: string }[] = [
    { key: 'foto_primer_plano', label: 'Primer plano' },
    { key: 'foto_cuerpo_entero', label: 'Plano completo' },
    { key: 'foto_plano_americano', label: 'Plano americano' },
    { key: 'foto_artistica', label: 'Artística' },
]

export default function MiPerfilPage() {
    const router = useRouter()
    const [supabase] = useState(() => createClient())
    const [cargando, setCargando] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [subiendo, setSubiendo] = useState<string | null>(null)
    const [p, setP] = useState<MiPerfil | null>(null)

    useEffect(() => {
        getMiPerfilAction().then(res => {
            if (!res) { router.replace('/talent/login'); return }
            setP(res)
            setCargando(false)
        })
    }, [router])

    const set = (patch: Partial<MiPerfil>) => setP(prev => prev ? { ...prev, ...patch } : prev)

    const edadCalc = (() => {
        if (!p?.fecha_nacimiento) return null
        const d = new Date(p.fecha_nacimiento)
        if (isNaN(d.getTime())) return null
        const e = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000))
        return e >= 0 && e < 120 ? e : null
    })()

    const toggleTalento = (v: string) => {
        if (!p) return
        const cur = p.talentos || []
        set({ talentos: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] })
    }

    const subirFoto = async (campo: keyof MiPerfil, file: File | null) => {
        if (!file || !p) return
        setSubiendo(campo as string)
        try {
            const opt = await optimizeImage(file, { maxDim: 1600 })
            const ext = opt.name.split('.').pop()
            const path = `perfiles/${p.id}-${campo}-${Date.now()}.${ext}`
            const { error } = await supabase.storage.from('talent').upload(path, opt, { upsert: true })
            if (error) throw error
            set({ [campo]: supabase.storage.from('talent').getPublicUrl(path).data.publicUrl } as Partial<MiPerfil>)
        } catch (e: any) {
            toast.error('No se pudo subir la foto: ' + (e.message || ''))
        }
        setSubiendo(null)
    }

    const setVideo = (i: number, v: string) => {
        if (!p) return
        const vids = [...(p.videos || [])]
        while (vids.length < 3) vids.push('')
        vids[i] = v
        set({ videos: vids })
    }

    const guardar = async () => {
        if (!p) return
        if (!p.nombre?.trim()) return toast.error('Poné tu nombre.')
        setGuardando(true)
        const res = await guardarMiPerfilAction({
            nombre: p.nombre, apellido: p.apellido || '', fecha_nacimiento: p.fecha_nacimiento,
            nacionalidad: p.nacionalidad || '', residenteArgentina: p.reside_argentina ?? undefined, direccion: p.direccion || '',
            instagram: p.instagram || '', telefono: p.telefono || '',
            altura: p.altura ?? undefined, peso: p.peso ?? undefined, idiomas: p.idiomas || '',
            talleRemera: p.talle_remera || '', tallePantalon: p.talle_pantalon || '', talleCalzado: p.talle_calzado || '',
            talentos: p.talentos || [], descripcion: p.descripcion || '',
            fotoPrimerPlano: p.foto_primer_plano || '', fotoCuerpoEntero: p.foto_cuerpo_entero || '',
            fotoPlanoAmericano: p.foto_plano_americano || '', fotoArtistica: p.foto_artistica || '',
            fotosExtra: p.fotos_extra || [], videos: (p.videos || []).filter(Boolean),
        })
        if (res.ok) toast.success('Perfil guardado')
        else toast.error(res.error || 'No se pudo guardar')
        setGuardando(false)
    }

    const cerrar = async () => { await logoutTalentoAction(); router.replace('/talent/login') }

    if (cargando || !p) return (
        <div className={`min-h-screen bg-white flex items-center justify-center ${sans.className}`}>
            <Loader2 className="animate-spin text-neutral-400" size={28} />
        </div>
    )

    const contratoListo = p.acuerdo_aceptado || !!p.contrato_adjunto_url

    return (
        <div className={`min-h-screen bg-white text-neutral-900 ${sans.className}`}>
            <Toaster position="top-center" richColors />

            <div className="bg-black text-white py-2.5">
                <div className="max-w-3xl mx-auto px-5 flex items-center justify-between">
                    <Link href="/talent" className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white">Piso 2 Talent</Link>
                    <button onClick={cerrar} className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white flex items-center gap-1.5">
                        <LogOut size={12} /> Salir
                    </button>
                </div>
            </div>

            <header className="pt-10 pb-6 text-center px-6">
                <p className={`${serif.className} text-[11px] tracking-[0.5em] text-neutral-500 uppercase`}>Piso 2</p>
                <h1 className={`${serif.className} text-4xl md:text-5xl tracking-[0.15em] font-medium mt-1`}>MI PERFIL</h1>
                <p className="text-neutral-500 text-sm mt-3">{p.email}</p>
            </header>

            {/* Estado del contrato / vitrina */}
            <div className="max-w-2xl mx-auto px-6 mb-8">
                <div className={`rounded-xl border p-4 flex items-start gap-3 ${contratoListo ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    {contratoListo ? <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" /> : <Clock size={18} className="text-amber-600 mt-0.5 shrink-0" />}
                    <div className="text-xs leading-relaxed">
                        {contratoListo
                            ? <span className="text-emerald-800"><b>Contrato firmado.</b> Tu perfil ya cumple el requisito del acuerdo.</span>
                            : <span className="text-amber-800"><b>Contrato pendiente.</b> Hasta que no firmes/adjuntes el acuerdo, tu perfil no aparece entre los postulantes. (La firma estará disponible en breve.)</span>}
                    </div>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-6 pb-28 space-y-7">
                {/* FOTOS */}
                <div>
                    <span className={labelCls}>Fotos profesionales</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {FOTOS.map(({ key, label }) => {
                            const url = p[key] as string | null
                            return (
                                <div key={key as string}>
                                    <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100 border border-neutral-200 rounded-lg">
                                        {url
                                            ? <img src={url} alt={label} className="w-full h-full object-cover" />
                                            : <div className="w-full h-full flex items-center justify-center text-neutral-300">{subiendo === key ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}</div>}
                                        <label className="absolute inset-0 cursor-pointer">
                                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => subirFoto(key, e.target.files?.[0] || null)} />
                                        </label>
                                        {url && <button type="button" onClick={() => set({ [key]: null } as Partial<MiPerfil>)} className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full p-1 hover:bg-black"><X size={12} /></button>}
                                    </div>
                                    <p className="text-[10px] text-center text-neutral-500 mt-1.5 uppercase tracking-wider">{label}</p>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* DATOS BÁSICOS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <label className={labelCls}>Nombre <span className="text-neutral-400 normal-case tracking-normal">(se muestra en la vitrina)</span></label>
                        <input value={p.nombre} onChange={e => set({ nombre: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Apellido <span className="text-neutral-400 normal-case tracking-normal">(interno)</span></label>
                        <input value={p.apellido || ''} onChange={e => set({ apellido: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Fecha de nacimiento</label>
                        <input type="date" value={p.fecha_nacimiento || ''} onChange={e => set({ fecha_nacimiento: e.target.value })} className={inputCls} />
                        {edadCalc !== null && <p className="text-[11px] text-neutral-500 mt-1">{edadCalc} años</p>}
                    </div>
                    <div>
                        <label className={labelCls}>Instagram <span className="text-neutral-400 normal-case tracking-normal">(perfil abierto)</span></label>
                        <input value={p.instagram || ''} onChange={e => set({ instagram: e.target.value })} className={inputCls} placeholder="@usuario" />
                    </div>
                    <div>
                        <label className={labelCls}>Nacionalidad</label>
                        <input value={p.nacionalidad || ''} onChange={e => set({ nacionalidad: e.target.value })} className={inputCls} placeholder="Ej: Argentina" />
                    </div>
                    <div>
                        <label className={labelCls}>Resido en</label>
                        <input value={p.direccion || ''} onChange={e => set({ direccion: e.target.value })} className={inputCls} placeholder="Ciudad / país" />
                    </div>
                    <div>
                        <label className={labelCls}>Teléfono <span className="text-neutral-400 normal-case tracking-normal">(interno)</span></label>
                        <input value={p.telefono || ''} onChange={e => set({ telefono: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Idiomas</label>
                        <input value={p.idiomas || ''} onChange={e => set({ idiomas: e.target.value })} className={inputCls} placeholder="Ej: Español, Inglés" />
                    </div>
                    <div>
                        <label className={labelCls}>Altura (cm)</label>
                        <input type="number" min={0} value={p.altura ?? ''} onChange={e => set({ altura: e.target.value ? Number(e.target.value) : null })} className={inputCls} placeholder="Ej: 170" />
                    </div>
                    <div>
                        <label className={labelCls}>Peso (kg)</label>
                        <input type="number" min={0} value={p.peso ?? ''} onChange={e => set({ peso: e.target.value ? Number(e.target.value) : null })} className={inputCls} placeholder="Ej: 60" />
                    </div>
                </div>

                {/* TALLES */}
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className={labelCls}>Talle remera</label>
                        <select value={p.talle_remera || ''} onChange={e => set({ talle_remera: e.target.value })} className={inputCls}>
                            <option value="">—</option>{TALLES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Talle pantalón</label>
                        <select value={p.talle_pantalon || ''} onChange={e => set({ talle_pantalon: e.target.value })} className={inputCls}>
                            <option value="">—</option>{TALLES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Talle calzado</label>
                        <input value={p.talle_calzado || ''} onChange={e => set({ talle_calzado: e.target.value })} className={inputCls} placeholder="Ej: 39" />
                    </div>
                </div>

                {/* TALENTOS (multi) */}
                <div>
                    <span className={labelCls}>Talento <span className="text-neutral-400 normal-case tracking-normal">(elegí todos los que apliquen)</span></span>
                    <div className="flex flex-wrap gap-2">
                        {TALENTOS.map(({ v, label }) => {
                            const on = (p.talentos || []).includes(v)
                            return (
                                <button key={v} type="button" onClick={() => toggleTalento(v)}
                                    className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide border transition-colors ${on ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-900'}`}>
                                    {label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* DESCRIPCIÓN */}
                <div>
                    <label className={labelCls}>Descripción</label>
                    <textarea value={p.descripcion || ''} onChange={e => set({ descripcion: e.target.value })} rows={4} className={`${inputCls} resize-none`} placeholder="Contanos sobre vos, tu experiencia, tu estilo…" />
                </div>

                {/* VIDEOS */}
                <div>
                    <label className={labelCls}>Video secuencia profesional <span className="text-neutral-400 normal-case tracking-normal">(hasta 3 links)</span></label>
                    <div className="space-y-2.5">
                        {[0, 1, 2].map(i => (
                            <input key={i} type="url" value={(p.videos || [])[i] || ''} onChange={e => setVideo(i, e.target.value)} className={inputCls} placeholder={i === 0 ? 'Link de Google Drive o video subido' : 'Otro link (opcional)'} />
                        ))}
                    </div>
                </div>

                <button onClick={guardar} disabled={guardando || !!subiendo}
                    className="w-full bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs py-4 hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                    {guardando ? <Loader2 size={15} className="animate-spin" /> : null} Guardar cambios
                </button>
            </div>
        </div>
    )
}
