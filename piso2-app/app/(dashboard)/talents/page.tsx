'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useCash } from '@/context/CashContext'
import { optimizeImage } from '@/utils/optimizeImage'
import {
    listTalentosAdminAction, upsertTalentoAction, eliminarTalentoAction, toggleTalentoActivoAction,
    listMarcasAdminAction, upsertMarcaAction, toggleMarcaActivoAction, eliminarMarcaAction,
    listPostulacionesAction, aceptarPostulacionAction, standbyPostulacionAction, eliminarPostulacionAction,
    listBusquedasAdminAction, upsertBusquedaAction, toggleBusquedaActivaAction, eliminarBusquedaAction,
    listPostulacionesBusquedaAction, cambiarEstadoPostBusquedaAction, eliminarPostBusquedaAction, aceptarPostBusquedaAction,
    getTalentDashboardDataAction
} from '@/app/actions/talent'
import { toast, Toaster } from 'sonner'
import { Loader2, Plus, X, Pencil, Trash2, Star, Eye, EyeOff, Upload, ArrowLeftToLine, Sparkles, Lock, Inbox, Check, PauseCircle, Play, Search, Link2, MapPin, CalendarDays, Copy, ExternalLink, Users, Share2, MessageCircle, Globe } from 'lucide-react'
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
    videos: string[] | null
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
    disciplina: '', bio: '', fotos: [] as string[], videos: ['', '', ''] as string[],
    destacado: false, activo: true, orden: 0
})

const inputCls = "w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors mt-1"

export default function TalentsAdminPage() {
    const [supabase] = useState(() => createClient())
    const { userRole, isLoading: loadingCtx } = useCash()

    const [vista, setVista] = useState<'talentos' | 'marcas' | 'solicitudes' | 'busquedas'>('talentos')
    const [talentos, setTalentos] = useState<Talento[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [form, setForm] = useState(formVacio())
    const [guardando, setGuardando] = useState(false)
    const [subiendoFoto, setSubiendoFoto] = useState(false)

    // Marcas
    const [marcas, setMarcas] = useState<any[]>([])
    const [modalMarca, setModalMarca] = useState(false)
    const [marcaForm, setMarcaForm] = useState<{ id?: string; nombre: string; logo_url: string; link: string; orden: number; activo: boolean }>({ nombre: '', logo_url: '', link: '', orden: 0, activo: true })
    const [guardandoMarca, setGuardandoMarca] = useState(false)
    const [subiendoLogo, setSubiendoLogo] = useState(false)

    const cargar = () => {
        setLoading(true)
        listTalentosAdminAction().then(d => { setTalentos(d as Talento[]); setLoading(false) }).catch(() => setLoading(false))
    }
    const cargarMarcas = () => { listMarcasAdminAction().then(d => setMarcas(d)).catch(() => { }) }

    // Postulaciones (gente que quiere ser talento)
    const [postulaciones, setPostulaciones] = useState<any[]>([])
    const [postSel, setPostSel] = useState<any | null>(null)
    const [procesandoPost, setProcesandoPost] = useState(false)
    const cargarPostulaciones = () => { listPostulacionesAction().then(d => setPostulaciones(d)).catch(() => { }) }
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

    // Búsquedas personalizadas
    const [busquedas, setBusquedas] = useState<any[]>([])
    const [modalBusqueda, setModalBusqueda] = useState(false)
    const [busquedaForm, setBusquedaForm] = useState<{ id?: string; titulo: string; descripcion: string; requisitos: string; ubicacion: string; categoria: string; fecha_limite: string; activa: boolean }>({ titulo: '', descripcion: '', requisitos: '', ubicacion: '', categoria: '', fecha_limite: '', activa: true })
    const [guardandoBusqueda, setGuardandoBusqueda] = useState(false)
    const [busquedaSel, setBusquedaSel] = useState<any | null>(null)
    const [postsBusqueda, setPostsBusqueda] = useState<any[]>([])
    const [loadingPostsBusq, setLoadingPostsBusq] = useState(false)
    const [postBusqSel, setPostBusqSel] = useState<any | null>(null)
    const [procesandoPostBusq, setProcesandoPostBusq] = useState(false)
    const [filtroPostBusq, setFiltroPostBusq] = useState<'todas' | 'pendiente' | 'standby' | 'descartado'>('todas')

    const cargarBusquedas = () => { listBusquedasAdminAction().then(d => setBusquedas(d)).catch(() => {}) }

    // Carga inicial: UNA sola action (autentica 1 vez, queries en paralelo) en
    // lugar de 4 server actions serializadas. Las cargas individuales de arriba
    // se siguen usando para refrescar después de cada edición.
    useEffect(() => {
        if (userRole !== 'admin') return
        setLoading(true)
        getTalentDashboardDataAction()
            .then(d => {
                setTalentos(d.talentos as Talento[])
                setMarcas(d.marcas)
                setPostulaciones(d.postulaciones)
                setBusquedas(d.busquedas)
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [userRole])

    const abrirNuevaBusqueda = () => { setBusquedaForm({ titulo: '', descripcion: '', requisitos: '', ubicacion: '', categoria: '', fecha_limite: '', activa: true }); setModalBusqueda(true) }
    const abrirEditarBusqueda = (b: any) => { setBusquedaForm({ id: b.id, titulo: b.titulo, descripcion: b.descripcion || '', requisitos: b.requisitos || '', ubicacion: b.ubicacion || '', categoria: b.categoria || '', fecha_limite: b.fecha_limite || '', activa: b.activa }); setModalBusqueda(true) }

    const handleGuardarBusqueda = async () => {
        if (!busquedaForm.titulo.trim()) return toast.error('Pone un titulo para la busqueda')
        setGuardandoBusqueda(true)
        const res = await upsertBusquedaAction({ ...busquedaForm, categoria: busquedaForm.categoria || null, fecha_limite: busquedaForm.fecha_limite || null })
        setGuardandoBusqueda(false)
        if (res.success) { toast.success('Busqueda guardada'); setModalBusqueda(false); cargarBusquedas() }
        else toast.error(res.error || 'Error')
    }

    const handleToggleBusqueda = async (b: any) => { const r = await toggleBusquedaActivaAction(b.id, !b.activa); if (r.success) cargarBusquedas() }
    const handleEliminarBusqueda = async (b: any) => {
        if (!confirm(`¿Eliminar la busqueda "${b.titulo}"? Se eliminan tambien todas las postulaciones.`)) return
        const r = await eliminarBusquedaAction(b.id)
        if (r.success) { toast.success('Eliminada'); cargarBusquedas() } else toast.error(r.error || 'Error')
    }

    const abrirPostsBusqueda = (b: any) => {
        setBusquedaSel(b)
        setLoadingPostsBusq(true)
        listPostulacionesBusquedaAction(b.id).then(d => { setPostsBusqueda(d); setLoadingPostsBusq(false) }).catch(() => setLoadingPostsBusq(false))
    }

    const handleEstadoPostBusq = async (id: string, estado: 'pendiente' | 'standby' | 'descartado') => {
        setProcesandoPostBusq(true)
        const res = await cambiarEstadoPostBusquedaAction(id, estado)
        if (res.success) { toast.success('Estado actualizado'); if (busquedaSel) abrirPostsBusqueda(busquedaSel); setPostBusqSel(null) }
        else toast.error(res.error || 'Error')
        setProcesandoPostBusq(false)
    }

    const handleEliminarPostBusq = async (id: string) => {
        if (!confirm('¿Eliminar esta postulacion?')) return
        setProcesandoPostBusq(true)
        const res = await eliminarPostBusquedaAction(id)
        if (res.success) { toast.success('Eliminada'); if (busquedaSel) abrirPostsBusqueda(busquedaSel); setPostBusqSel(null) }
        else toast.error(res.error || 'Error')
        setProcesandoPostBusq(false)
    }

    const handleAceptarPostBusq = async (id: string) => {
        setProcesandoPostBusq(true)
        const res = await aceptarPostBusquedaAction(id)
        if (res.success) { toast.success('Aceptado. Paso a la vitrina.'); if (busquedaSel) abrirPostsBusqueda(busquedaSel); setPostBusqSel(null); cargar() }
        else toast.error(res.error || 'Error')
        setProcesandoPostBusq(false)
    }

    const copiarLinkBusqueda = (slug: string) => {
        const url = `${window.location.origin}/talent/busqueda/${slug}`
        navigator.clipboard.writeText(url).then(() => toast.success('Link de postulación copiado')).catch(() => toast.error('No se pudo copiar'))
    }

    // Link anonimizado para pasar a los seleccionadores / clientes (sin datos sensibles)
    const copiarLinkSeleccion = (slug: string) => {
        const url = `${window.location.origin}/talent/busqueda/${slug}/seleccion`
        navigator.clipboard.writeText(url).then(() => toast.success('Link para seleccionadores copiado')).catch(() => toast.error('No se pudo copiar'))
    }

    const abrirNuevo = () => { setForm(formVacio()); setModalOpen(true) }
    const abrirEditar = (t: Talento) => {
        setForm({
            id: t.id, nombre: t.nombre, categoria: t.categoria, disciplina: t.disciplina || '',
            bio: t.bio || '', fotos: t.fotos || [],
            videos: [...(t.videos && t.videos.length ? t.videos : (t.video_url ? [t.video_url] : [])), '', '', ''].slice(0, 3),
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

    const abrirNuevaMarca = () => { setMarcaForm({ nombre: '', logo_url: '', link: '', orden: 0, activo: true }); setModalMarca(true) }
    const abrirEditarMarca = (m: any) => { setMarcaForm({ id: m.id, nombre: m.nombre, logo_url: m.logo_url, link: m.link || '', orden: m.orden, activo: m.activo }); setModalMarca(true) }

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
                            <button onClick={() => setVista('busquedas')} className={`px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${vista === 'busquedas' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'}`}>
                                Busquedas
                                {busquedas.filter(b => b.activa).length > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${vista === 'busquedas' ? 'bg-white text-black' : 'bg-black text-white'}`}>{busquedas.filter(b => b.activa).length}</span>}
                            </button>
                        </div>
                        {vista !== 'solicitudes' && (
                            <button onClick={() => vista === 'talentos' ? abrirNuevo() : vista === 'marcas' ? abrirNuevaMarca() : abrirNuevaBusqueda()} className="bg-black text-white font-bold uppercase px-5 py-3 text-xs tracking-widest hover:bg-neutral-800 transition-colors flex items-center gap-2">
                                <Plus size={16} /> {vista === 'busquedas' ? 'Nueva busqueda' : 'Nuevo'}
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

                {/* BÚSQUEDAS PERSONALIZADAS */}
                {vista === 'busquedas' && (
                    busquedaSel ? (
                        <div>
                            <button onClick={() => { setBusquedaSel(null); setPostsBusqueda([]) }} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-black mb-5">
                                <ArrowLeftToLine size={13} /> Volver a busquedas
                            </button>
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <h2 className={`${serif.className} text-xl md:text-2xl tracking-wide`}>{busquedaSel.titulo}</h2>
                                {busquedaSel.ubicacion && <span className="flex items-center gap-1 text-neutral-400 text-xs"><MapPin size={12} /> {busquedaSel.ubicacion}</span>}
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest ${busquedaSel.activa ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>{busquedaSel.activa ? 'Activa' : 'Cerrada'}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mb-6">
                                <button onClick={() => copiarLinkBusqueda(busquedaSel.slug)} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest border border-neutral-300 px-3 py-1.5 rounded hover:border-black transition-colors"><Copy size={12} /> Link postulación</button>
                                <button onClick={() => copiarLinkSeleccion(busquedaSel.slug)} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest bg-black text-white px-3 py-1.5 rounded hover:bg-neutral-800 transition-colors"><Share2 size={12} /> Link seleccionadores</button>
                                <a href={`/talent/busqueda/${busquedaSel.slug}/seleccion`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest border border-neutral-300 px-3 py-1.5 rounded hover:border-black transition-colors"><ExternalLink size={12} /> Ver</a>
                            </div>

                            {loadingPostsBusq ? (
                                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
                            ) : postsBusqueda.length === 0 ? (
                                <div className="py-16 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                                    <Inbox className="mx-auto mb-3 text-neutral-300" size={32} />
                                    <p className="text-neutral-400 font-bold uppercase text-xs">Todavia no hay postulaciones para esta busqueda.</p>
                                </div>
                            ) : (() => {
                                const conteo = {
                                    todas: postsBusqueda.length,
                                    pendiente: postsBusqueda.filter(p => !p.estado || p.estado === 'pendiente').length,
                                    standby: postsBusqueda.filter(p => p.estado === 'standby').length,
                                    descartado: postsBusqueda.filter(p => p.estado === 'descartado').length,
                                }
                                const filtrados = filtroPostBusq === 'todas'
                                    ? postsBusqueda
                                    : filtroPostBusq === 'pendiente'
                                        ? postsBusqueda.filter(p => !p.estado || p.estado === 'pendiente')
                                        : postsBusqueda.filter(p => p.estado === filtroPostBusq)
                                const chips: { key: typeof filtroPostBusq; label: string }[] = [
                                    { key: 'todas', label: 'Todas' },
                                    { key: 'pendiente', label: 'Nuevas' },
                                    { key: 'standby', label: 'Stand by' },
                                    { key: 'descartado', label: 'Descartadas' },
                                ]
                                return (
                                  <>
                                    <div className="flex flex-wrap gap-2 mb-5">
                                        {chips.map(c => (
                                            <button key={c.key} onClick={() => setFiltroPostBusq(c.key)}
                                                className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors ${filtroPostBusq === c.key ? 'bg-black text-white border-black' : 'border-neutral-300 text-neutral-500 hover:border-black'}`}>
                                                {c.label} <span className="opacity-60">({conteo[c.key]})</span>
                                            </button>
                                        ))}
                                    </div>
                                    {filtrados.length === 0 ? (
                                        <div className="py-14 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                                            <p className="text-neutral-400 font-bold uppercase text-xs">No hay postulaciones en este filtro.</p>
                                        </div>
                                    ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                    {filtrados.map(p => (
                                        <button key={p.id} onClick={() => setPostBusqSel(p)} className={`group text-left ${p.estado === 'descartado' ? 'opacity-40' : p.estado === 'standby' ? 'opacity-70' : ''}`}>
                                            <div className="aspect-[3/4] bg-neutral-100 relative overflow-hidden">
                                                {p.fotos?.[0]
                                                    ? <img src={p.fotos[0]} alt={p.nombre} className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700" />
                                                    : <div className="w-full h-full flex items-center justify-center text-neutral-300 text-[10px] uppercase tracking-widest">Sin foto</div>}
                                                <span className={`absolute top-2 right-2 text-white text-[8px] font-bold uppercase tracking-[0.15em] px-2 py-1 ${p.estado === 'standby' ? 'bg-amber-500/90' : p.estado === 'descartado' ? 'bg-red-500/80' : 'bg-black/80'}`}>
                                                    {p.estado === 'standby' ? 'Stand by' : p.estado === 'descartado' ? 'Descartado' : 'Nueva'}
                                                </span>
                                                <span className="absolute top-2 left-2 bg-white/90 text-black text-[8px] font-bold uppercase tracking-[0.15em] px-2 py-1 rounded-full">#{String(p.id).replace(/-/g, '').slice(0, 4).toUpperCase()}</span>
                                            </div>
                                            <h3 className="mt-2.5 text-[11px] tracking-[0.15em] uppercase font-semibold truncate">{p.nombre}</h3>
                                            {p.rubro && <p className="text-[9px] tracking-[0.2em] uppercase text-neutral-400 truncate">{p.rubro}</p>}
                                            <p className="text-[9px] text-neutral-400 truncate">{p.email}</p>
                                        </button>
                                    ))}
                                </div>
                                    )}
                                  </>
                                )
                              })()}
                        </div>
                    ) : busquedas.length === 0 ? (
                        <div className="py-20 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                            <Search className="mx-auto mb-3 text-neutral-300" size={32} />
                            <p className="text-neutral-400 font-bold uppercase text-xs">No creaste busquedas todavia.</p>
                            <p className="text-neutral-400 text-xs mt-1">Crea una busqueda personalizada y comparte el link.</p>
                            <button onClick={abrirNuevaBusqueda} className="mt-5 bg-black text-white px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800 transition-colors">+ Crear la primera</button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {busquedas.map(b => (
                                <div key={b.id} className={`border rounded-xl p-5 bg-white ${b.activa ? 'border-neutral-200' : 'border-orange-300 opacity-60'}`}>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="text-sm font-bold uppercase tracking-widest truncate">{b.titulo}</h3>
                                                {b.activa
                                                    ? <span className="text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest bg-green-100 text-green-700 shrink-0">Activa</span>
                                                    : <span className="text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest bg-neutral-100 text-neutral-500 shrink-0">Cerrada</span>}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-neutral-400">
                                                {b.ubicacion && <span className="flex items-center gap-1"><MapPin size={10} /> {b.ubicacion}</span>}
                                                {b.fecha_limite && <span className="flex items-center gap-1"><CalendarDays size={10} /> Hasta {new Date(b.fecha_limite + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>}
                                                {b.categoria && b.categoria !== 'todos' && <span className="capitalize">{b.categoria}</span>}
                                            </div>
                                            {b.descripcion && <p className="text-xs text-neutral-500 mt-2 line-clamp-2">{b.descripcion}</p>}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button onClick={() => abrirPostsBusqueda(b)} className="border border-neutral-300 hover:border-black py-1.5 px-3 text-[9px] font-semibold uppercase tracking-[0.15em] flex items-center gap-1 transition-colors rounded"><Users size={11} /> Ver postulaciones</button>
                                            <button onClick={() => copiarLinkBusqueda(b.slug)} title="Copiar link de postulación" className="border border-neutral-300 hover:border-black p-1.5 rounded transition-colors"><Link2 size={13} /></button>
                                            <button onClick={() => copiarLinkSeleccion(b.slug)} title="Copiar link para seleccionadores (anónimo)" className="border border-neutral-300 hover:border-black p-1.5 rounded transition-colors"><Share2 size={13} /></button>
                                            <button onClick={() => abrirEditarBusqueda(b)} title="Editar" className="border border-neutral-300 hover:border-black p-1.5 rounded transition-colors"><Pencil size={13} /></button>
                                            <button onClick={() => handleToggleBusqueda(b)} title={b.activa ? 'Cerrar' : 'Reabrir'} className="border border-neutral-300 hover:border-black p-1.5 rounded transition-colors">{b.activa ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                                            <button onClick={() => handleEliminarBusqueda(b)} title="Eliminar" className="border border-neutral-300 hover:border-red-500 hover:text-red-500 p-1.5 rounded transition-colors"><Trash2 size={13} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
            </div>

            {/* MODAL DETALLE POSTULACIÓN BÚSQUEDA */}
            {postBusqSel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !procesandoPostBusq && setPostBusqSel(null)}>
                    <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden relative max-h-[90vh] flex flex-col md:flex-row" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setPostBusqSel(null)} className="absolute top-4 right-4 z-10 bg-white/80 rounded-full p-1 text-neutral-500 hover:text-black"><X size={20} /></button>

                        <div className="md:w-2/5 bg-neutral-100 shrink-0 flex flex-col">
                            {(() => {
                                const fotos: string[] = postBusqSel.fotos || []
                                if (!fotos.length) return <div className="w-full h-56 md:h-full flex items-center justify-center text-neutral-300 text-xs uppercase tracking-widest">Sin foto</div>
                                return (<>
                                    <img src={fotos[0]} alt={postBusqSel.nombre} className="w-full h-56 md:flex-1 object-cover" />
                                    {fotos.length > 1 && (
                                        <div className="flex gap-1 p-1 bg-neutral-200">
                                            {fotos.slice(1).map((u: string, i: number) => <img key={i} src={u} alt="" className="flex-1 h-16 object-cover" />)}
                                        </div>
                                    )}
                                </>)
                            })()}
                        </div>

                        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
                            <p className="text-[9px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-1">
                                {postBusqSel.rubro || 'Sin rubro'}
                                {postBusqSel.estado === 'standby' ? ' · Stand by' : postBusqSel.estado === 'descartado' ? ' · Descartado' : ''}
                            </p>
                            <h3 className={`${serif.className} text-2xl md:text-3xl tracking-wide mb-4`}>{postBusqSel.nombre}</h3>

                            <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mb-2">
                                {postBusqSel.sexo && <span><b className="text-neutral-900">{postBusqSel.sexo === 'varones' ? 'Masculino' : 'Femenino'}</b></span>}
                                {postBusqSel.edad && <span>Edad: <b className="text-neutral-900">{postBusqSel.edad}</b></span>}
                                {postBusqSel.altura && <span>Altura: <b className="text-neutral-900">{postBusqSel.altura} cm</b></span>}
                                {postBusqSel.nacionalidad && <span>Nacionalidad: <b className="text-neutral-900">{postBusqSel.nacionalidad}</b></span>}
                            </div>
                            <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mb-3">
                                <span>Email: <b className="text-neutral-900">{postBusqSel.email}</b></span>
                                {postBusqSel.telefono && <span>Tel: <b className="text-neutral-900">{postBusqSel.telefono}</b></span>}
                            </div>
                            {postBusqSel.telefono && (
                                <a href={`https://wa.me/${String(postBusqSel.telefono).replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors mb-4">
                                    <MessageCircle size={14} /> Contactar por WhatsApp
                                </a>
                            )}

                            {postBusqSel.descripcion && <p className="text-sm text-neutral-600 leading-relaxed mb-4 whitespace-pre-line">{postBusqSel.descripcion}</p>}

                            {postBusqSel.videos?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {postBusqSel.videos.map((v: string, i: number) => (
                                        <a key={i} href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.15em] uppercase border border-neutral-300 px-4 py-2 hover:border-black transition-colors">
                                            <Play size={13} /> Video {postBusqSel.videos.length > 1 ? i + 1 : ''}
                                        </a>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-col gap-2 border-t border-neutral-200 pt-5 mt-2">
                                <button disabled={procesandoPostBusq} onClick={() => handleAceptarPostBusq(postBusqSel.id)} className="w-full bg-neutral-900 text-white font-semibold uppercase tracking-[0.15em] text-xs py-3 hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                                    {procesandoPostBusq ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Aceptar y pasar a la vitrina
                                </button>
                                <div className="flex gap-2">
                                    <button disabled={procesandoPostBusq} onClick={() => handleEstadoPostBusq(postBusqSel.id, postBusqSel.estado === 'standby' ? 'pendiente' : 'standby')} className="flex-1 border border-neutral-300 hover:border-black py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40">
                                        <PauseCircle size={14} /> {postBusqSel.estado === 'standby' ? 'Quitar stand by' : 'Stand by'}
                                    </button>
                                    <button disabled={procesandoPostBusq} onClick={() => handleEstadoPostBusq(postBusqSel.id, 'descartado')} className="flex-1 border border-neutral-300 hover:border-orange-500 hover:text-orange-500 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40">
                                        <EyeOff size={14} /> Descartar
                                    </button>
                                </div>
                                <button disabled={procesandoPostBusq} onClick={() => handleEliminarPostBusq(postBusqSel.id)} className="border border-neutral-300 hover:border-red-500 hover:text-red-500 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40">
                                    <Trash2 size={14} /> Eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CREAR/EDITAR BÚSQUEDA */}
            {modalBusqueda && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !guardandoBusqueda && setModalBusqueda(false)}>
                    <div className="bg-white w-full max-w-lg rounded-2xl p-6 md:p-8 relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setModalBusqueda(false)} className="absolute top-5 right-5 text-neutral-400 hover:text-black"><X size={20} /></button>
                        <h3 className={`${serif.className} text-2xl tracking-wide mb-6 flex items-center gap-2`}><Search size={18} /> {busquedaForm.id ? 'Editar busqueda' : 'Nueva busqueda'}</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Titulo *</label>
                                <input value={busquedaForm.titulo} onChange={e => setBusquedaForm({ ...busquedaForm, titulo: e.target.value })} placeholder="Ej: Bailarines para Dubai" className={inputCls} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Descripcion</label>
                                <textarea value={busquedaForm.descripcion} onChange={e => setBusquedaForm({ ...busquedaForm, descripcion: e.target.value })} className={`${inputCls} min-h-[80px] resize-none`} placeholder="Detalle de la busqueda, tipo de trabajo, etc." />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Requisitos</label>
                                <textarea value={busquedaForm.requisitos} onChange={e => setBusquedaForm({ ...busquedaForm, requisitos: e.target.value })} className={`${inputCls} min-h-[80px] resize-none`} placeholder="Edad, altura, experiencia, idiomas, etc." />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Ubicacion</label>
                                    <input value={busquedaForm.ubicacion} onChange={e => setBusquedaForm({ ...busquedaForm, ubicacion: e.target.value })} placeholder="Ej: Dubai, Crucero, Buenos Aires" className={inputCls} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Categoria</label>
                                    <select value={busquedaForm.categoria} onChange={e => setBusquedaForm({ ...busquedaForm, categoria: e.target.value })} className={inputCls}>
                                        <option value="">Todos</option>
                                        <option value="mujeres">Mujeres</option>
                                        <option value="varones">Varones</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Fecha limite (opcional)</label>
                                    <input type="date" value={busquedaForm.fecha_limite} onChange={e => setBusquedaForm({ ...busquedaForm, fecha_limite: e.target.value })} className={inputCls} />
                                </div>
                                <div className="flex items-end pb-1">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={busquedaForm.activa} onChange={e => setBusquedaForm({ ...busquedaForm, activa: e.target.checked })} className="accent-black w-4 h-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Activa (recibe postulaciones)</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button onClick={handleGuardarBusqueda} disabled={guardandoBusqueda} className="flex-1 bg-black text-white font-bold uppercase py-4 text-xs tracking-widest hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">{guardandoBusqueda ? <Loader2 size={16} className="animate-spin" /> : 'Guardar'}</button>
                            <button onClick={() => setModalBusqueda(false)} className="border border-neutral-300 px-6 font-bold uppercase text-xs tracking-widest hover:bg-neutral-100">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DETALLE POSTULACIÓN */}
            {postSel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !procesandoPost && setPostSel(null)}>
                    <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden relative max-h-[90vh] flex flex-col md:flex-row" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setPostSel(null)} className="absolute top-4 right-4 z-10 bg-white/80 rounded-full p-1 text-neutral-500 hover:text-black"><X size={20} /></button>

                        <div className="md:w-2/5 bg-neutral-100 shrink-0 flex flex-col">
                            {(() => {
                                const fotos: string[] = (postSel.fotos && postSel.fotos.length) ? postSel.fotos : (postSel.foto_url ? [postSel.foto_url] : [])
                                if (!fotos.length) return <div className="w-full h-56 md:h-full flex items-center justify-center text-neutral-300 text-xs uppercase tracking-widest">Sin foto</div>
                                return (<>
                                    <img src={fotos[0]} alt={postSel.nombre} className="w-full h-56 md:flex-1 object-cover" />
                                    {fotos.length > 1 && (
                                        <div className="flex gap-1 p-1 bg-neutral-200">
                                            {fotos.slice(1).map((u, i) => <img key={i} src={u} alt="" className="flex-1 h-16 object-cover" />)}
                                        </div>
                                    )}
                                </>)
                            })()}
                        </div>

                        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
                            <p className="text-[9px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-1">{postSel.rubro || 'Sin rubro'}{postSel.estado === 'standby' ? ' · Stand by' : ''}</p>
                            <h3 className={`${serif.className} text-2xl md:text-3xl tracking-wide mb-4`}>{postSel.nombre}</h3>

                            <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mb-4">
                                <span><b className="text-neutral-900">{postSel.sexo === 'varones' ? 'Masculino' : 'Femenino'}</b></span>
                                {postSel.edad && <span>Edad: <b className="text-neutral-900">{postSel.edad}</b></span>}
                                {postSel.altura && <span>Altura: <b className="text-neutral-900">{postSel.altura} cm</b></span>}
                                {postSel.nacionalidad && <span>Nacionalidad: <b className="text-neutral-900">{postSel.nacionalidad}</b></span>}
                            </div>

                            {postSel.descripcion && <p className="text-sm text-neutral-600 leading-relaxed mb-4 whitespace-pre-line">{postSel.descripcion}</p>}

                            {(() => {
                                const videos: string[] = (postSel.videos && postSel.videos.length) ? postSel.videos : (postSel.video_url ? [postSel.video_url] : [])
                                if (!videos.length) return null
                                return (
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {videos.map((v, i) => (
                                            <a key={i} href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.15em] uppercase border border-neutral-300 px-4 py-2 hover:border-black transition-colors">
                                                <Play size={13} /> Video {videos.length > 1 ? i + 1 : ''}
                                            </a>
                                        ))}
                                    </div>
                                )
                            })()}

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
                <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => !guardandoMarca && setModalMarca(false)}>
                    <div className="bg-white w-full max-w-md my-8 rounded-2xl p-6 md:p-8 relative" onClick={e => e.stopPropagation()}>
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
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Link (opcional)</label>
                                <input type="url" value={marcaForm.link} onChange={e => setMarcaForm({ ...marcaForm, link: e.target.value })} placeholder="https://…" className={inputCls} />
                                <p className="text-[9px] text-neutral-400 mt-1">Al tocar el logo en la vitrina, lleva acá.</p>
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
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Videos / Reels (hasta 3 links)</label>
                                <div className="space-y-2 mt-1">
                                    {[0, 1, 2].map(i => (
                                        <input key={i} value={form.videos[i] || ''} onChange={e => setForm(f => ({ ...f, videos: f.videos.map((v, idx) => idx === i ? e.target.value : v) }))} placeholder={i === 0 ? 'https://youtu.be/… o https://vimeo.com/…' : 'Otro link (opcional)'} className={inputCls} />
                                    ))}
                                </div>
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
