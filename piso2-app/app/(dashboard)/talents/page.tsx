'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useCash } from '@/context/CashContext'
import { optimizeImage } from '@/utils/optimizeImage'
import {
    listTalentosAdminAction, upsertTalentoAction, eliminarTalentoAction, toggleTalentoActivoAction,
    listMarcasAdminAction, upsertMarcaAction, toggleMarcaActivoAction, eliminarMarcaAction,
    listPostulacionesAction, aceptarPostulacionAction, standbyPostulacionAction, eliminarPostulacionAction
} from '@/app/actions/talent'
import { toast, Toaster } from 'sonner'
import { Loader2, Plus, X, Pencil, Trash2, Star, Eye, EyeOff, Upload, ArrowLeftToLine, Sparkles, Lock, Inbox, Check, PauseCircle, Play } from 'lucide-react'
import { Playfair_Display } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['500', '600', '700'] })

type Talento = {
    id: string
    nombre: string
    categoria: 'mujeres' | 'varones' | 'obras'
    disciplina: string | null
    bio: string | null
    fotos: string[]
    video_url: string | null
    destacado: boolean
    activo: boolean
    orden: number
}

const CATS = [
    { key: 'mujeres', label: 'Mujeres' },
    { key: 'varones', label: 'Varones' },
    { key: 'obras', label: 'Obras / Compañías' },
] as const

const DISCIPLINAS = ['Bailarín/a', 'Acróbata', 'Modelo', 'Cantante', 'Músico/a', 'Influencer', 'Actor/Actriz']

const formVacio = () => ({
    id: undefined as string | undefined,
    nombre: '', categoria: 'mujeres' as 'mujeres' | 'varones' | 'obras',
    disciplina: '', bio: '', fotos: [] as string[], video_url: '',
    destacado: false, activo: true, orden: 0
})

const inputCls = "w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors mt-1"

export default function TalentsAdminPage() {
    const [supabase] = useState(() => createClient())
    const { userRole, isLoading: loadingCtx } = useCash()

    const [vista, setVista] = useState<'talentos' | 'marcas' | 'solicitudes'>('talentos')
    const [talentos, setTalentos] = useState<Talento[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [form, setForm] = useState(formVacio())
    const [guardando, setGuardando] = useState(false)
    const [subiendoFoto, setSubiendoFoto] = useState(false)

    // Marcas
    const [marcas, setMarcas] = useState<any[]>([])
    const [modalMarca, setModalMarca] = useState(false)
    const [marcaForm, setMarcaForm] = useState<{ id?: string; nombre: string; logo_url: string; orden: number; activo: boolean }>({ nombre: '', logo_url: '', orden: 0, activo: true })
    const [guardandoMarca, setGuardandoMarca] = useState(false)
    const [subiendoLogo, setSubiendoLogo] = useState(false)

    const cargar = () => {
        setLoading(true)
        listTalentosAdminAction().then(d => { setTalentos(d as Talento[]); setLoading(false) }).catch(() => setLoading(false))
    }
    useEffect(() => { if (userRole === 'admin') cargar() }, [userRole])

    const cargarMarcas = () => { listMarcasAdminAction().then(d => setMarcas(d)).catch(() => { }) }
    useEffect(() => { if (userRole === 'admin') cargarMarcas() }, [userRole])

    // Postulaciones (gente que quiere ser talento)
    const [postulaciones, setPostulaciones] = useState<any[]>([])
    const [postSel, setPostSel] = useState<any | null>(null)
    const [procesandoPost, setProcesandoPost] = useState(false)
    const cargarPostulaciones = () => { listPostulacionesAction().then(d => setPostulaciones(d)).catch(() => { }) }
    useEffect(() => { if (userRole === 'admin') cargarPostulaciones() }, [userRole])
    const pendientesCount = postulaciones.filter(p => p.estado === 'pendiente').length

    const handleAceptarPost = async (id: string) => {
        setProcesandoPost(true)
        const res = await aceptarPostulacionAction(id)
        if (res.success) { toast.success('Aceptado. Pasó a la vitrina.'); setPostSel(null); cargarPostulaciones(); cargar() }
        else toast.error(res.error || 'Error')
        setProcesandoPost(false)
    }
    const handleStandbyPost = async (p: any) => {
        setProcesandoPost(true)
        const res = await standbyPostulacionAction(p.id, p.estado !== 'standby')
        if (res.success) { toast.success(p.estado === 'standby' ? 'Vuelto a pendiente' : 'En stand by'); cargarPostulaciones(); setPostSel(null) }
        else toast.error(res.error || 'Error')
        setProcesandoPost(false)
    }
    const handleEliminarPost = async (id: string) => {
        if (!confirm('¿Eliminar la postulación? Se borra también la foto y no se puede deshacer.')) return
        setProcesandoPost(true)
        const res = await eliminarPostulacionAction(id)
        if (res.success) { toast.success('Postulación eliminada'); setPostSel(null); cargarPostulaciones() }
        else toast.error(res.error || 'Error')
        setProcesandoPost(false)
    }

    const abrirNuevo = () => { setForm(formVacio()); setModalOpen(true) }
    const abrirEditar = (t: Talento) => {
        setForm({
            id: t.id, nombre: t.nombre, categoria: t.categoria, disciplina: t.disciplina || '',
            bio: t.bio || '', fotos: t.fotos || [], video_url: t.video_url || '',
            destacado: t.destacado, activo: t.activo, orden: t.orden
        })
        setModalOpen(true)
    }

    const handleFotos = async (files: FileList | null) => {
        if (!files || files.length === 0) return
        setSubiendoFoto(true)
        const urls = [...form.fotos]
        for (const file of Array.from(files)) {
            try {
                const opt = await optimizeImage(file, { maxDim: 1400 })
                const ext = opt.name.split('.').pop()
                const path = `perfiles/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
                const { error } = await supabase.storage.from('talent').upload(path, opt)
                if (error) throw error
                urls.push(supabase.storage.from('talent').getPublicUrl(path).data.publicUrl)
            } catch (e: any) {
                toast.error('Error subiendo una foto: ' + (e.message || ''))
            }
        }
        setForm(f => ({ ...f, fotos: urls }))
        setSubiendoFoto(false)
    }

    const quitarFoto = (i: number) => setForm(f => ({ ...f, fotos: f.fotos.filter((_, idx) => idx !== i) }))
    const moverPrimera = (i: number) => setForm(f => {
        const arr = [...f.fotos]; const [x] = arr.splice(i, 1); arr.unshift(x); return { ...f, fotos: arr }
    })

    const handleGuardar = async () => {
        if (!form.nombre.trim()) return toast.error('Poné el nombre')
        setGuardando(true)
        const res = await upsertTalentoAction(form)
        setGuardando(false)
        if (res.success) { toast.success('Talento guardado'); setModalOpen(false); cargar() }
        else toast.error(res.error || 'Error')
    }

    const handleToggle = async (t: Talento) => {
        const res = await toggleTalentoActivoAction(t.id, !t.activo)
        if (res.success) cargar(); else toast.error(res.error || 'Error')
    }

    const handleEliminar = async (t: Talento) => {
        if (!confirm(`¿Eliminar a "${t.nombre}"? No se puede deshacer.`)) return
        const res = await eliminarTalentoAction(t.id)
        if (res.success) { toast.success('Eliminado'); cargar() } else toast.error(res.error || 'Error')
    }

    const abrirNuevaMarca = () => { setMarcaForm({ nombre: '', logo_url: '', orden: 0, activo: true }); setModalMarca(true) }
    const abrirEditarMarca = (m: any) => { setMarcaForm({ id: m.id, nombre: m.nombre, logo_url: m.logo_url, orden: m.orden, activo: m.activo }); setModalMarca(true) }

    const handleLogo = async (files: FileList | null) => {
        if (!files || !files[0]) return
        setSubiendoLogo(true)
        try {
            const opt = await optimizeImage(files[0], { maxDim: 600 })
            const ext = opt.name.split('.').pop()
            const path = `marcas/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error } = await supabase.storage.from('talent').upload(path, opt)
            if (error) throw error
            setMarcaForm(f => ({ ...f, logo_url: supabase.storage.from('talent').getPublicUrl(path).data.publicUrl }))
        } catch (e: any) { toast.error('Error subiendo el logo') }
        setSubiendoLogo(false)
    }

    const handleGuardarMarca = async () => {
        if (!marcaForm.nombre.trim()) return toast.error('Poné el nombre de la marca')
        if (!marcaForm.logo_url) return toast.error('Subí el logo')
        setGuardandoMarca(true)
        const res = await upsertMarcaAction(marcaForm)
        setGuardandoMarca(false)
        if (res.success) { toast.success('Marca guardada'); setModalMarca(false); cargarMarcas() }
        else toast.error(res.error || 'Error')
    }

    const handleToggleMarca = async (m: any) => { const r = await toggleMarcaActivoAction(m.id, !m.activo); if (r.success) cargarMarcas() }
    const handleEliminarMarca = async (m: any) => {
        if (!confirm(`¿Eliminar la marca "${m.nombre}"?`)) return
        const r = await eliminarMarcaAction(m.id)
        if (r.success) { toast.success('Eliminada'); cargarMarcas() } else toast.error(r.error || 'Error')
    }

    // Disciplinas multi
    const discSeleccionadas = form.disciplina ? form.disciplina.split(',').map(s => s.trim()).filter(Boolean) : []
    const toggleDisciplina = (d: string) => {
        const next = discSeleccionadas.includes(d) ? discSeleccionadas.filter(x => x !== d) : [...discSeleccionadas, d]
        setForm(f => ({ ...f, disciplina: next.join(', ') }))
    }

    if (loadingCtx) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
    if (userRole !== 'admin') return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-neutral-500">
            <Lock size={40} /><p className="uppercase tracking-widest text-sm font-bold">Solo administradores</p>
        </div>
    )

    return (
        <div className="min-h-screen text-neutral-900 pb-24">
            {/* Fondo blanco de toda la sección (los navs quedan oscuros) */}
            <div className="fixed inset-0 md:left-64 bg-white z-0 pointer-events-none" />
            <Toaster position="top-center" richColors />

            <div className="relative z-10">

            {/* HEADER */}
            <div className="border-b border-neutral-200 bg-white sticky top-0 z-30">
                <div className="px-5 md:px-10 py-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-neutral-400 mb-1 flex items-center gap-1.5"><Sparkles size={12} /> Piso2 Talent</p>
                        <h1 className={`${serif.className} text-3xl md:text-4xl tracking-wide`}>Panel</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex bg-neutral-100 p-1 rounded-lg">
                            <button onClick={() => setVista('talentos')} className={`px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all ${vista === 'talentos' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'}`}>Talentos</button>
                            <button onClick={() => setVista('marcas')} className={`px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all ${vista === 'marcas' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'}`}>Marcas</button>
                            <button onClick={() => setVista('solicitudes')} className={`px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${vista === 'solicitudes' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'}`}>
                                Solicitudes
                                {pendientesCount > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${vista === 'solicitudes' ? 'bg-white text-black' : 'bg-black text-white'}`}>{pendientesCount}</span>}
                            </button>
                        </div>
                        {vista !== 'solicitudes' && (
                            <button onClick={() => vista === 'talentos' ? abrirNuevo() : abrirNuevaMarca()} className="bg-black text-white font-bold uppercase px-5 py-3 text-xs tracking-widest hover:bg-neutral-800 transition-colors flex items-center gap-2">
                                <Plus size={16} /> Nuevo
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-5 md:px-10 py-8">
                {vista === 'talentos' && (loading ? (
                    <div className="flex justify-center py-24"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
                ) : talentos.length === 0 ? (
                    <div className="py-20 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                        <Sparkles className="mx-auto mb-3 text-neutral-300" size={32} />
                        <p className="text-neutral-400 font-bold uppercase text-xs">Todavía no cargaste talentos.</p>
                        <button onClick={abrirNuevo} className="mt-5 bg-black text-white px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800 transition-colors">+ Cargar el primero</button>
                    </div>
                ) : (
                    <div className="space-y-10">
                        {CATS.map(cat => {
                            const items = talentos.filter(t => t.categoria === cat.key)
                            if (items.length === 0) return null
                            return (
                                <section key={cat.key}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <h2 className={`${serif.className} text-lg md:text-xl tracking-[0.15em] uppercase text-neutral-900`}>{cat.label}</h2>
                                        <span className="text-neutral-300 text-xs">{items.length}</span>
                                        <div className="flex-1 h-px bg-neutral-200" />
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                        {items.map(t => (
                                            <div key={t.id} className={`group ${t.activo ? '' : 'opacity-60'}`}>
                                                <div className="aspect-[3/4] bg-neutral-100 relative overflow-hidden">
                                                    {t.fotos?.[0]
                                                        ? <img src={t.fotos[0]} alt={t.nombre} className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700" />
                                                        : <div className="w-full h-full flex items-center justify-center text-neutral-300 text-[10px] uppercase tracking-widest">Sin foto</div>}
                                                    {t.destacado && <span className="absolute top-2 left-2 bg-white/90 text-black text-[8px] font-bold uppercase tracking-[0.2em] px-2 py-1 flex items-center gap-1"><Star size={9} /> Dest.</span>}
                                                    {!t.activo && <span className="absolute top-2 right-2 bg-black/80 text-white text-[8px] font-bold uppercase tracking-[0.2em] px-2 py-1">Oculto</span>}
                                                    <span className="absolute bottom-2 left-2 bg-white/90 text-black text-[8px] font-semibold uppercase tracking-widest px-2 py-0.5">{t.fotos?.length || 0} fotos{t.video_url ? ' · reel' : ''}</span>
                                                </div>
                                                <h3 className="mt-2.5 text-[11px] tracking-[0.15em] uppercase font-semibold truncate">{t.nombre}</h3>
                                                {t.disciplina && <p className="text-[9px] tracking-[0.2em] uppercase text-neutral-400 truncate">{t.disciplina}</p>}
                                                <div className="flex items-center gap-1.5 mt-2.5">
                                                    <button onClick={() => abrirEditar(t)} className="flex-1 border border-neutral-300 hover:border-black py-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] flex items-center justify-center gap-1 transition-colors"><Pencil size={11} /> Editar</button>
                                                    <button onClick={() => handleToggle(t)} title={t.activo ? 'Ocultar' : 'Publicar'} className="border border-neutral-300 hover:border-black p-1.5 transition-colors">{t.activo ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                                                    <button onClick={() => handleEliminar(t)} className="border border-neutral-300 hover:border-red-500 hover:text-red-500 p-1.5 transition-colors"><Trash2 size={13} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )
                        })}
                    </div>
                ))}

                {/* MARCAS */}
                {vista === 'marcas' && (
                    marcas.length === 0 ? (
                        <div className="py-20 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                            <p className="text-neutral-400 font-bold uppercase text-xs">No cargaste marcas todavía.</p>
                            <button onClick={abrirNuevaMarca} className="mt-5 bg-black text-white px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800 transition-colors">+ Cargar la primera</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {marcas.map(m => (
                                <div key={m.id} className={`border rounded-xl p-4 bg-white ${m.activo ? 'border-neutral-200' : 'border-orange-300 opacity-60'}`}>
                                    <div className="h-16 flex items-center justify-center bg-neutral-50 rounded-lg mb-3 overflow-hidden border border-neutral-100">
                                        <img src={m.logo_url} alt={m.nombre} className="max-h-12 max-w-full object-contain" />
                                    </div>
                                    <p className="text-xs font-bold uppercase truncate text-center">{m.nombre}</p>
                                    <div className="flex items-center gap-1 mt-3">
                                        <button onClick={() => abrirEditarMarca(m)} className="flex-1 bg-neutral-100 hover:bg-neutral-200 py-1.5 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 rounded"><Pencil size={11} /> Editar</button>
                                        <button onClick={() => handleToggleMarca(m)} className="bg-neutral-100 hover:bg-neutral-200 p-1.5 rounded">{m.activo ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                                        <button onClick={() => handleEliminarMarca(m)} className="bg-red-50 hover:bg-red-100 text-red-600 p-1.5 rounded"><Trash2 size={13} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {/* SOLICITUDES (postulaciones) */}
                {vista === 'solicitudes' && (
                    postulaciones.length === 0 ? (
                        <div className="py-20 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                            <Inbox className="mx-auto mb-3 text-neutral-300" size={32} />
                            <p className="text-neutral-400 font-bold uppercase text-xs">No hay postulaciones por ahora.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {postulaciones.map(p => (
                                <button key={p.id} onClick={() => setPostSel(p)} className={`group text-left ${p.estado === 'standby' ? 'opacity-70' : ''}`}>
                                    <div className="aspect-[3/4] bg-neutral-100 relative overflow-hidden">
                                        {p.foto_url
                                            ? <img src={p.foto_url} alt={p.nombre} className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700" />
                                            : <div className="w-full h-full flex items-center justify-center text-neutral-300 text-[10px] uppercase tracking-widest">Sin foto</div>}
                                        {p.estado === 'standby'
                                            ? <span className="absolute top-2 right-2 bg-amber-500/90 text-white text-[8px] font-bold uppercase tracking-[0.15em] px-2 py-1">Stand by</span>
                                            : <span className="absolute top-2 right-2 bg-black/80 text-white text-[8px] font-bold uppercase tracking-[0.15em] px-2 py-1">Nueva</span>}
                                    </div>
                                    <h3 className="mt-2.5 text-[11px] tracking-[0.15em] uppercase font-semibold truncate">{p.nombre}</h3>
                                    {p.rubro && <p className="text-[9px] tracking-[0.2em] uppercase text-neutral-400 truncate">{p.rubro}</p>}
                                </button>
                            ))}
                        </div>
                    )
                )}
            </div>
            </div>

            {/* MODAL DETALLE POSTULACIÓN */}
            {postSel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !procesandoPost && setPostSel(null)}>
                    <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden relative max-h-[90vh] flex flex-col md:flex-row" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setPostSel(null)} className="absolute top-4 right-4 z-10 bg-white/80 rounded-full p-1 text-neutral-500 hover:text-black"><X size={20} /></button>

                        <div className="md:w-2/5 bg-neutral-100 shrink-0">
                            {postSel.foto_url
                                ? <img src={postSel.foto_url} alt={postSel.nombre} className="w-full h-56 md:h-full object-cover" />
                                : <div className="w-full h-56 md:h-full flex items-center justify-center text-neutral-300 text-xs uppercase tracking-widest">Sin foto</div>}
                        </div>

                        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
                            <p className="text-[9px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-1">{postSel.rubro || 'Sin rubro'}{postSel.estado === 'standby' ? ' · Stand by' : ''}</p>
                            <h3 className={`${serif.className} text-2xl md:text-3xl tracking-wide mb-4`}>{postSel.nombre}</h3>

                            <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mb-4">
                                <span><b className="text-neutral-900">{postSel.sexo === 'varones' ? 'Masculino' : 'Femenino'}</b></span>
                                {postSel.edad && <span>Edad: <b className="text-neutral-900">{postSel.edad}</b></span>}
                                {postSel.altura && <span>Altura: <b className="text-neutral-900">{postSel.altura} cm</b></span>}
                            </div>

                            {postSel.descripcion && <p className="text-sm text-neutral-600 leading-relaxed mb-4 whitespace-pre-line">{postSel.descripcion}</p>}

                            {postSel.video_url && (
                                <a href={postSel.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.15em] uppercase border border-neutral-300 px-4 py-2 hover:border-black transition-colors mb-6">
                                    <Play size={13} /> Ver video
                                </a>
                            )}

                            <div className="flex flex-col gap-2 border-t border-neutral-200 pt-5 mt-2">
                                <button disabled={procesandoPost} onClick={() => handleAceptarPost(postSel.id)} className="w-full bg-neutral-900 text-white font-semibold uppercase tracking-[0.15em] text-xs py-3 hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                                    {procesandoPost ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Aceptar y pasar a la vitrina
                                </button>
                                <div className="flex gap-2">
                                    <button disabled={procesandoPost} onClick={() => handleStandbyPost(postSel)} className="flex-1 border border-neutral-300 hover:border-black py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40">
                                        <PauseCircle size={14} /> {postSel.estado === 'standby' ? 'Quitar stand by' : 'Stand by'}
                                    </button>
                                    <button disabled={procesandoPost} onClick={() => handleEliminarPost(postSel.id)} className="flex-1 border border-neutral-300 hover:border-red-500 hover:text-red-500 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40">
                                        <Trash2 size={14} /> Eliminar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL MARCA */}
            {modalMarca && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !guardandoMarca && setModalMarca(false)}>
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 md:p-8 relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setModalMarca(false)} className="absolute top-5 right-5 text-neutral-400 hover:text-black"><X size={20} /></button>
                        <h3 className={`${serif.className} text-2xl tracking-wide mb-6`}>{marcaForm.id ? 'Editar marca' : 'Nueva marca'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Nombre *</label>
                                <input value={marcaForm.nombre} onChange={e => setMarcaForm({ ...marcaForm, nombre: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 flex items-center justify-between"><span>Logo *</span>{subiendoLogo && <span className="text-neutral-400 normal-case flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> subiendo…</span>}</label>
                                <div className="mt-2 flex items-center gap-3">
                                    <div className="h-20 w-20 bg-neutral-50 border border-neutral-200 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                                        {marcaForm.logo_url ? <img src={marcaForm.logo_url} alt="" className="max-h-16 max-w-full object-contain" /> : <span className="text-neutral-300 text-[9px] uppercase">sin logo</span>}
                                    </div>
                                    <label className="flex-1 border-2 border-dashed border-neutral-300 rounded-lg py-4 flex flex-col items-center justify-center cursor-pointer hover:border-black text-neutral-400 hover:text-black">
                                        <Upload size={16} /><span className="text-[9px] uppercase mt-1">Subir logo</span>
                                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => handleLogo(e.target.files)} />
                                    </label>
                                </div>
                                <p className="text-[9px] text-neutral-400 mt-1">Ideal PNG con fondo transparente.</p>
                            </div>
                            <div className="flex items-center gap-5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={marcaForm.activo} onChange={e => setMarcaForm({ ...marcaForm, activo: e.target.checked })} className="accent-black w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Visible</span>
                                </label>
                                <div className="flex items-center gap-2 ml-auto">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Orden</span>
                                    <input type="number" value={marcaForm.orden} onChange={e => setMarcaForm({ ...marcaForm, orden: Number(e.target.value) })} className="w-16 bg-white border border-neutral-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-black" />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={handleGuardarMarca} disabled={guardandoMarca || subiendoLogo} className="flex-1 bg-black text-white font-bold uppercase py-4 text-xs tracking-widest hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">{guardandoMarca ? <Loader2 size={16} className="animate-spin" /> : 'Guardar'}</button>
                            <button onClick={() => setModalMarca(false)} className="border border-neutral-300 px-6 font-bold uppercase text-xs tracking-widest hover:bg-neutral-100">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL TALENTO */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => !guardando && setModalOpen(false)}>
                    <div className="bg-white w-full max-w-2xl my-8 rounded-2xl p-6 md:p-8 relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setModalOpen(false)} className="absolute top-5 right-5 text-neutral-400 hover:text-black"><X size={20} /></button>
                        <h3 className={`${serif.className} text-2xl tracking-wide mb-6 flex items-center gap-2`}><Sparkles size={18} /> {form.id ? 'Editar talento' : 'Nuevo talento'}</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Nombre *</label>
                                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Categoría *</label>
                                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value as any })} className={inputCls}>
                                    {CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{form.categoria === 'obras' ? 'Disciplina' : 'Disciplinas (podés elegir varias)'}</label>
                                {form.categoria === 'obras' ? (
                                    <input value={form.disciplina} onChange={e => setForm({ ...form, disciplina: e.target.value })} placeholder="Ej: Danza-teatro, Espectáculo…" className={inputCls} />
                                ) : (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {[...DISCIPLINAS, ...discSeleccionadas.filter(d => !DISCIPLINAS.includes(d))].map(d => {
                                            const on = discSeleccionadas.includes(d)
                                            return (
                                                <button key={d} type="button" onClick={() => toggleDisciplina(d)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${on ? 'bg-black text-white border-black' : 'bg-white text-neutral-500 border-neutral-300 hover:border-black hover:text-black'}`}>
                                                    {d}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Bio</label>
                                <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} className={`${inputCls} min-h-[90px] resize-none`} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Reel (link de YouTube / Vimeo)</label>
                                <input value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="https://vimeo.com/… o https://youtu.be/…" className={inputCls} />
                            </div>

                            {/* FOTOS */}
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 flex items-center justify-between">
                                    <span>Fotos (la 1ª es la portada)</span>
                                    {subiendoFoto && <span className="text-neutral-400 normal-case flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> subiendo…</span>}
                                </label>
                                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                                    {form.fotos.map((f, i) => (
                                        <div key={i} className="relative aspect-square bg-neutral-100 rounded-lg overflow-hidden group">
                                            <img src={f} alt="" className="w-full h-full object-cover" />
                                            {i === 0 && <span className="absolute top-1 left-1 bg-black text-white text-[7px] font-black uppercase px-1 rounded">Portada</span>}
                                            <button onClick={() => quitarFoto(i)} className="absolute top-1 right-1 bg-white/90 text-black p-0.5 rounded opacity-0 group-hover:opacity-100"><X size={11} /></button>
                                            {i !== 0 && <button onClick={() => moverPrimera(i)} title="Hacer portada" className="absolute bottom-1 left-1 bg-white/90 text-black p-0.5 rounded opacity-0 group-hover:opacity-100"><ArrowLeftToLine size={10} /></button>}
                                        </div>
                                    ))}
                                    <label className="aspect-square border-2 border-dashed border-neutral-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-black text-neutral-400 hover:text-black transition-colors">
                                        <Upload size={16} />
                                        <span className="text-[8px] uppercase mt-1">Subir</span>
                                        <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => handleFotos(e.target.files)} />
                                    </label>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-5 md:col-span-2 pt-2">
                                <label className="flex items-center gap-2 cursor-pointer" title="Máximo 5 destacados (fila top de la home)">
                                    <input
                                        type="checkbox"
                                        checked={form.destacado}
                                        onChange={e => {
                                            const yaDestacados = talentos.filter(t => t.destacado && t.id !== form.id).length
                                            if (e.target.checked && yaDestacados >= 5) { toast.error('Ya hay 5 destacados (el máximo). Quitá uno primero.'); return }
                                            setForm({ ...form, destacado: e.target.checked })
                                        }}
                                        className="accent-black w-4 h-4"
                                    />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Destacado <span className="text-neutral-400 normal-case tracking-normal">(máx 5)</span></span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} className="accent-black w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Publicado (visible)</span>
                                </label>
                                <div className="flex items-center gap-2 ml-auto">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Orden</span>
                                    <input type="number" value={form.orden} onChange={e => setForm({ ...form, orden: Number(e.target.value) })} className="w-16 bg-white border border-neutral-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-black" />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button onClick={handleGuardar} disabled={guardando || subiendoFoto} className="flex-1 bg-black text-white font-bold uppercase py-4 text-xs tracking-widest hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                                {guardando ? <Loader2 size={16} className="animate-spin" /> : 'Guardar'}
                            </button>
                            <button onClick={() => setModalOpen(false)} className="border border-neutral-300 px-6 font-bold uppercase text-xs tracking-widest hover:bg-neutral-100">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
