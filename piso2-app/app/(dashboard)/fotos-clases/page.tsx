'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useMemo, useState } from 'react'
import { optimizeImage } from '@/utils/optimizeImage'
import { Toaster, toast } from 'sonner'
import { Camera, Loader2, Search, Check, Image as ImageIcon, Star, Users, CheckCheck, X } from 'lucide-react'
import { getClasesParaFotoAction, aplicarFotoClasesAction, type GrupoFoto } from '@/app/actions/fotos-clases'

export default function FotosClasesPage() {
    const [supabase] = useState(() => createClient())
    const [loading, setLoading] = useState(true)
    const [grupos, setGrupos] = useState<GrupoFoto[]>([])

    const [foto, setFoto] = useState<string | null>(null)   // url ya subida
    const [subiendo, setSubiendo] = useState(false)
    const [aplicando, setAplicando] = useState(false)

    const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
    const [busqueda, setBusqueda] = useState('')
    const [soloLiga, setSoloLiga] = useState(false)

    const cargar = async () => {
        setLoading(true)
        const data = await getClasesParaFotoAction()
        setGrupos(data)
        setLoading(false)
    }
    useEffect(() => { cargar() }, [])

    const filtrados = useMemo(() => {
        const t = busqueda.toLowerCase().trim()
        return grupos.filter(g =>
            (!soloLiga || g.es_la_liga) &&
            (!t || g.nombre.toLowerCase().includes(t) || g.profesor.toLowerCase().includes(t))
        )
    }, [grupos, busqueda, soloLiga])

    const toggle = (key: string) => {
        setSeleccion(prev => {
            const n = new Set(prev)
            n.has(key) ? n.delete(key) : n.add(key)
            return n
        })
    }
    const todosFiltradosSeleccionados = filtrados.length > 0 && filtrados.every(g => seleccion.has(g.key))
    const toggleTodos = () => {
        setSeleccion(prev => {
            const n = new Set(prev)
            if (todosFiltradosSeleccionados) filtrados.forEach(g => n.delete(g.key))
            else filtrados.forEach(g => n.add(g.key))
            return n
        })
    }

    const subirFoto = async (file: File) => {
        setSubiendo(true)
        try {
            const opt = await optimizeImage(file)
            const ext = opt.name.split('.').pop()
            const fileName = `clase-${Date.now()}.${ext}`
            const { error } = await supabase.storage.from('clases').upload(fileName, opt)
            if (error) throw new Error('No se pudo subir la foto')
            const url = supabase.storage.from('clases').getPublicUrl(fileName).data.publicUrl
            setFoto(url)
            toast.success('Foto lista. Ahora elegí a qué clases aplicarla.')
        } catch (e: any) {
            toast.error(e.message || 'Error al subir la foto')
        } finally {
            setSubiendo(false)
        }
    }

    const clasesSeleccionadas = useMemo(() => {
        const ids: string[] = []
        for (const g of grupos) if (seleccion.has(g.key)) ids.push(...g.clase_ids)
        return ids
    }, [grupos, seleccion])

    const aplicar = async () => {
        if (!foto) return toast.error('Primero subí una foto.')
        if (!clasesSeleccionadas.length) return toast.error('Elegí al menos una clase.')
        setAplicando(true)
        const res = await aplicarFotoClasesAction(clasesSeleccionadas, foto)
        setAplicando(false)
        if (res.success) {
            toast.success(`Foto aplicada a ${res.cantidad} clase(s).`)
            setSeleccion(new Set())
            setFoto(null)
            cargar()
        } else {
            toast.error(res.error || 'No se pudo aplicar')
        }
    }

    const gruposSelCount = seleccion.size

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-44 md:pb-32">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="max-w-4xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter mb-1">Fotos de clases</h1>
                    <p className="text-gray-400 text-sm font-medium">Subí una foto y elegí a qué clases aplicarla. Se cambia en todas las fechas del grupo de una sola vez.</p>
                </div>

                {/* PASO 1: SUBIR LA FOTO */}
                <div className="bg-[#09090b] border border-white/10 rounded-2xl p-5 mb-6">
                    <label className="text-[10px] font-black text-[#D4E655] uppercase tracking-widest">1. La foto</label>
                    <div className="flex items-center gap-4 mt-3">
                        <label className={`relative w-24 h-24 rounded-xl border-2 border-dashed ${foto ? 'border-[#D4E655]/40' : 'border-white/20'} flex items-center justify-center cursor-pointer overflow-hidden shrink-0 hover:border-[#D4E655] transition-colors bg-[#111]`}>
                            {subiendo ? <Loader2 className="animate-spin text-[#D4E655]" /> : foto ? (
                                <img src={foto} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="flex flex-col items-center gap-1 text-gray-500"><Camera size={22} /><span className="text-[9px] font-bold uppercase">Subir</span></div>
                            )}
                            <input type="file" accept="image/*" className="hidden" disabled={subiendo}
                                onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f) }} />
                        </label>
                        <div className="text-xs text-gray-400 leading-relaxed">
                            {foto ? (
                                <div className="flex items-center gap-2 text-[#D4E655] font-bold"><Check size={16} /> Foto cargada
                                    <button onClick={() => setFoto(null)} className="ml-2 text-gray-500 hover:text-white inline-flex items-center gap-1 text-[11px]"><X size={12} /> cambiar</button>
                                </div>
                            ) : 'Tocá el recuadro para subir la foto que querés usar.'}
                        </div>
                    </div>
                </div>

                {/* PASO 2: ELEGIR CLASES */}
                <div className="flex items-center justify-between mb-3">
                    <label className="text-[10px] font-black text-[#D4E655] uppercase tracking-widest">2. ¿A qué clases?</label>
                    <button onClick={toggleTodos} className="text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                        <CheckCheck size={13} /> {todosFiltradosSeleccionados ? 'Quitar todo' : 'Elegir todo'}
                    </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por clase o profe..."
                            className="w-full bg-[#111] border border-white/10 rounded-xl pl-9 pr-3 py-3 text-sm text-white outline-none focus:border-[#D4E655]" />
                    </div>
                    <button onClick={() => setSoloLiga(v => !v)} className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest border flex items-center justify-center gap-2 transition-colors ${soloLiga ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-300 border-white/10 hover:border-white/30'}`}>
                        <Star size={14} className={soloLiga ? 'fill-black' : ''} /> Solo La Liga
                    </button>
                </div>

                {loading ? (
                    <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                ) : filtrados.length === 0 ? (
                    <div className="py-16 text-center text-gray-500 text-sm font-bold uppercase tracking-widest">No hay clases para mostrar.</div>
                ) : (
                    <div className="space-y-2">
                        {filtrados.map(g => {
                            const sel = seleccion.has(g.key)
                            return (
                                <button key={g.key} onClick={() => toggle(g.key)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${sel ? 'bg-[#D4E655]/10 border-[#D4E655]/50' : 'bg-[#09090b] border-white/10 hover:border-white/25'}`}>
                                    <div className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center ${sel ? 'bg-[#D4E655] border-[#D4E655]' : 'border-white/30'}`}>
                                        {sel && <Check size={13} className="text-black" strokeWidth={3} />}
                                    </div>
                                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#111] shrink-0 flex items-center justify-center">
                                        {g.imagen_url ? <img src={g.imagen_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={18} className="text-white/20" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-white text-sm truncate">{g.nombre}</p>
                                            {g.es_la_liga && <span className="text-[8px] font-black uppercase bg-[#D4E655] text-black px-1.5 py-0.5 rounded shrink-0">La Liga</span>}
                                        </div>
                                        <p className="text-[11px] text-gray-400 truncate">{g.profesor}</p>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400 bg-white/5 border border-white/10 px-2 py-1 rounded-md shrink-0 flex items-center gap-1">
                                        <Users size={11} /> {g.cantidad} fecha{g.cantidad === 1 ? '' : 's'}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* BARRA INFERIOR: APLICAR */}
            {gruposSelCount > 0 && (
                <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 bg-[#0a0a0a]/95 backdrop-blur border-t border-white/10 p-4">
                    <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
                        <p className="text-xs text-gray-300 font-medium">
                            <span className="font-black text-white">{clasesSeleccionadas.length}</span> clase(s) en <span className="font-black text-white">{gruposSelCount}</span> grupo(s)
                        </p>
                        <button onClick={aplicar} disabled={!foto || aplicando}
                            className="bg-[#D4E655] text-black font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition-colors">
                            {aplicando ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                            {foto ? 'Aplicar foto' : 'Subí una foto primero'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
