'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { optimizeImage } from '@/utils/optimizeImage'
import { getMiPerfilAction, guardarMiPerfilAction, firmarAcuerdoMiPerfilAction, logoutTalentoAction, type MiPerfil } from '@/app/actions/talent-auth'
import { toast, Toaster } from 'sonner'
import { Loader2, Upload, X, LogOut, CheckCircle2, Clock, FileSignature, Eraser } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const inputCls = "w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors"
const labelCls = "text-[10px] font-semibold tracking-[0.15em] uppercase text-neutral-500 block mb-1.5"

const TALLES = ['XS', 'S', 'M', 'L']
const TALENTOS = ['Bailarín/a', 'Acróbata', 'Modelo', 'Cantante', 'Músico/a', 'Influencer', 'Actor/Actriz']
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

    // Firma del acuerdo
    const [mostrarFirma, setMostrarFirma] = useState(false)
    const [firmaDatos, setFirmaDatos] = useState({ aclaracion: '', dni: '', repNombre: '', repDni: '', localidad: '' })
    const [tieneFirma, setTieneFirma] = useState(false)
    const [firmando, setFirmando] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const dibujando = useRef(false)

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
            nombre: p.nombre, apellido: p.apellido || '', fecha_nacimiento: p.fecha_nacimiento, sexo: p.sexo || '',
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

    // ── Firma (canvas) ──
    const canvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const c = canvasRef.current!; const r = c.getBoundingClientRect()
        return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
    }
    const firmaStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault(); dibujando.current = true
        const ctx = canvasRef.current!.getContext('2d')!
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'
        const { x, y } = canvasPos(e); ctx.beginPath(); ctx.moveTo(x, y)
    }
    const firmaMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dibujando.current) return
        e.preventDefault()
        const ctx = canvasRef.current!.getContext('2d')!
        const { x, y } = canvasPos(e); ctx.lineTo(x, y); ctx.stroke()
        if (!tieneFirma) setTieneFirma(true)
    }
    const firmaEnd = () => { dibujando.current = false }
    const borrarFirma = () => {
        const c = canvasRef.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setTieneFirma(false)
    }

    const firmarAcuerdo = async () => {
        if (!p) return
        if (!tieneFirma) return toast.error('Dejá tu firma en el recuadro.')
        if (!firmaDatos.aclaracion.trim() || !firmaDatos.dni.trim()) return toast.error('Completá la aclaración (nombre) y el DNI.')
        setFirmando(true)
        try {
            const blob: Blob = await new Promise((res, rej) => canvasRef.current!.toBlob(b => b ? res(b) : rej(new Error('firma')), 'image/png'))
            const fpath = `perfiles/firma-${p.id}-${Date.now()}.png`
            const up = await supabase.storage.from('talent').upload(fpath, blob, { contentType: 'image/png', upsert: true })
            if (up.error) throw up.error
            const firmaUrl = supabase.storage.from('talent').getPublicUrl(fpath).data.publicUrl
            const res = await firmarAcuerdoMiPerfilAction({
                residenteArgentina: p.reside_argentina ?? true,
                firmaUrl, firmaAclaracion: firmaDatos.aclaracion, firmaDni: firmaDatos.dni,
                representanteNombre: firmaDatos.repNombre, representanteDni: firmaDatos.repDni, firmaUbicacion: firmaDatos.localidad,
            })
            if (!res.ok) throw new Error(res.error || 'No se pudo firmar')
            toast.success('Acuerdo firmado')
            set({ acuerdo_aceptado: true, acuerdo_version: (p.reside_argentina ?? true) ? 'residente' : 'no_residente', firma_fecha: new Date().toISOString() })
            setMostrarFirma(false)
        } catch (e: any) {
            toast.error(e.message || 'No se pudo firmar')
        }
        setFirmando(false)
    }

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
                        <label className={labelCls}>Sexo</label>
                        <select value={p.sexo || ''} onChange={e => set({ sexo: e.target.value })} className={inputCls}>
                            <option value="">Elegí…</option>
                            <option value="mujeres">Femenino</option>
                            <option value="varones">Masculino</option>
                        </select>
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
                        {TALENTOS.map(label => {
                            const on = (p.talentos || []).includes(label)
                            return (
                                <button key={label} type="button" onClick={() => toggleTalento(label)}
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

                {/* ACUERDO / FIRMA */}
                <div className="border-t border-neutral-200 pt-7">
                    <h3 className={`${serif.className} text-lg tracking-wide mb-1 flex items-center gap-2`}><FileSignature size={18} /> Acuerdo de booking</h3>

                    {contratoListo && !mostrarFirma ? (
                        <div className="mt-2">
                            <p className="text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> Acuerdo firmado{p.firma_fecha ? ` el ${new Date(p.firma_fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.</p>
                            <button onClick={() => setMostrarFirma(true)} className="mt-3 text-[11px] uppercase tracking-widest text-neutral-400 hover:text-black">Volver a firmar</button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 mb-3 mt-2">
                                <span className="text-[11px] text-neutral-500">¿Residís en Argentina?</span>
                                <div className="flex rounded-lg overflow-hidden border border-neutral-300">
                                    <button type="button" onClick={() => set({ reside_argentina: true })} className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest ${(p.reside_argentina ?? true) ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500'}`}>Sí</button>
                                    <button type="button" onClick={() => set({ reside_argentina: false })} className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest ${p.reside_argentina === false ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500'}`}>No</button>
                                </div>
                            </div>
                            {(() => {
                                const pdfUrl = (p.reside_argentina ?? true) ? '/acuerdos/acuerdo-residente-argentina.pdf' : '/acuerdos/acuerdo-no-residente.pdf'
                                return (
                                    <>
                                        <p className="text-[11px] text-neutral-400 mb-2">Leé el acuerdo ({(p.reside_argentina ?? true) ? 'residente en Argentina' : 'no residente'}). <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline text-neutral-700">Descargar / abrir PDF</a></p>
                                        <iframe src={pdfUrl} className="w-full h-[55vh] border border-neutral-300 rounded-lg bg-neutral-50" title="Acuerdo" />
                                    </>
                                )
                            })()}

                            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className={labelCls}>Aclaración (nombre) *</label><input value={firmaDatos.aclaracion} onChange={e => setFirmaDatos(f => ({ ...f, aclaracion: e.target.value }))} className={inputCls} placeholder="Nombre y apellido" /></div>
                                <div><label className={labelCls}>DNI / NIF / NIE *</label><input value={firmaDatos.dni} onChange={e => setFirmaDatos(f => ({ ...f, dni: e.target.value }))} className={inputCls} /></div>
                                <div><label className={labelCls}>Representante legal (solo si sos menor)</label><input value={firmaDatos.repNombre} onChange={e => setFirmaDatos(f => ({ ...f, repNombre: e.target.value }))} className={inputCls} placeholder="Nombre del representante" /></div>
                                <div><label className={labelCls}>DNI del representante</label><input value={firmaDatos.repDni} onChange={e => setFirmaDatos(f => ({ ...f, repDni: e.target.value }))} className={inputCls} /></div>
                                <div className="sm:col-span-2"><label className={labelCls}>Localidad (dónde firmás)</label><input value={firmaDatos.localidad} onChange={e => setFirmaDatos(f => ({ ...f, localidad: e.target.value }))} className={inputCls} placeholder="Ej: Buenos Aires" /></div>
                            </div>

                            <div className="mt-4">
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className={labelCls + ' mb-0'}>Firma *</label>
                                    <button type="button" onClick={borrarFirma} className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-black flex items-center gap-1"><Eraser size={12} /> Borrar</button>
                                </div>
                                <canvas ref={canvasRef} width={600} height={200}
                                    onPointerDown={firmaStart} onPointerMove={firmaMove} onPointerUp={firmaEnd} onPointerLeave={firmaEnd}
                                    className="w-full h-40 border border-neutral-300 rounded-lg bg-white touch-none cursor-crosshair" />
                                <p className="text-[10px] text-neutral-400 mt-1">Firmá con el dedo o el mouse. Fecha: {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
                            </div>

                            <button onClick={firmarAcuerdo} disabled={firmando}
                                className="w-full mt-5 bg-neutral-900 text-white font-semibold uppercase tracking-[0.2em] text-xs py-4 hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                                {firmando ? <Loader2 size={15} className="animate-spin" /> : <FileSignature size={15} />} Firmar acuerdo
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
