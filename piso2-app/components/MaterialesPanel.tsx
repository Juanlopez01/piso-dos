'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { listarMaterialesAction, crearMaterialAction, eliminarMaterialAction } from '@/app/actions/materiales'
import { toast } from 'sonner'
import { FileText, Upload, Trash2, Loader2, Plus, X, Download, FolderOpen } from 'lucide-react'

type Material = {
    id: string
    created_at: string
    titulo: string
    descripcion: string | null
    archivo_url: string
    subido_por: string | null
    compania_id: string | null
    liga_nivel: number | null
    autor?: { nombre_completo: string } | { nombre_completo: string }[] | null
}

type Props = {
    tipo: 'compania' | 'liga'
    companiaId?: string
    /** Nivel a mostrar (alumno) o nivel inicial (staff liga) */
    ligaNivel?: number
    /** Niveles a los que el staff puede subir/ver (ej: [1, 2]). Si se pasa, muestra selector. */
    nivelesUpload?: number[]
    canUpload: boolean
    accent?: 'blue' | 'lime'
}

export default function MaterialesPanel({ tipo, companiaId, ligaNivel, nivelesUpload, canUpload, accent = 'blue' }: Props) {
    const [supabase] = useState(() => createClient())
    const accentColor = accent === 'lime' ? '#D4E655' : '#3b82f6'
    const accentText = accent === 'lime' ? '#0a0a0a' : '#ffffff'

    const [materiales, setMateriales] = useState<Material[]>([])
    const [loading, setLoading] = useState(true)
    const [nivelActivo, setNivelActivo] = useState<number>(ligaNivel ?? (nivelesUpload?.[0] ?? 1))

    const [formOpen, setFormOpen] = useState(false)
    const [titulo, setTitulo] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [archivo, setArchivo] = useState<File | null>(null)
    const [subiendo, setSubiendo] = useState(false)

    const cargar = useCallback(async () => {
        setLoading(true)
        const data = await listarMaterialesAction(tipo === 'compania' ? { companiaId } : { ligaNivel: nivelActivo })
        setMateriales(data as Material[])
        setLoading(false)
    }, [tipo, companiaId, nivelActivo])

    useEffect(() => { cargar() }, [cargar])

    const handleSubir = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!titulo.trim()) return toast.error('Poné un título')
        if (!archivo) return toast.error('Elegí un archivo PDF')
        if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) {
            return toast.error('El archivo debe ser un PDF')
        }

        setSubiendo(true)
        try {
            const safeName = archivo.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
            const scopeKey = tipo === 'compania' ? `compania/${companiaId}` : `liga/${nivelActivo}`
            const path = `${scopeKey}/${Date.now()}-${safeName}`

            const { error: upErr } = await supabase.storage.from('materiales').upload(path, archivo, { upsert: false })
            if (upErr) throw upErr

            const { data: { publicUrl } } = supabase.storage.from('materiales').getPublicUrl(path)

            const res = await crearMaterialAction({
                titulo, descripcion, archivo_url: publicUrl,
                companiaId: tipo === 'compania' ? companiaId : undefined,
                ligaNivel: tipo === 'liga' ? nivelActivo : undefined
            })
            if (!res.success) throw new Error(res.error)

            toast.success('Material publicado')
            setTitulo(''); setDescripcion(''); setArchivo(null); setFormOpen(false)
            cargar()
        } catch (err: any) {
            toast.error(err.message || 'Error al subir')
        } finally {
            setSubiendo(false)
        }
    }

    const handleEliminar = async (id: string) => {
        if (!confirm('¿Eliminar este material? Los alumnos dejarán de verlo.')) return
        const res = await eliminarMaterialAction(id)
        if (res.success) { toast.success('Material eliminado'); cargar() }
        else toast.error(res.error || 'Error')
    }

    return (
        <div className="bg-[#09090b] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-white font-black uppercase text-sm flex items-center gap-2">
                    <FolderOpen size={16} style={{ color: accentColor }} /> Material de Estudio
                </h4>
                <div className="flex items-center gap-2">
                    {tipo === 'liga' && nivelesUpload && nivelesUpload.length > 1 && (
                        <select
                            value={nivelActivo}
                            onChange={e => setNivelActivo(Number(e.target.value))}
                            className="bg-[#111] border border-white/10 text-white text-[10px] font-black uppercase rounded-lg px-2 py-1.5 outline-none cursor-pointer"
                        >
                            {nivelesUpload.map(n => <option key={n} value={n}>Nivel {n}</option>)}
                        </select>
                    )}
                    {canUpload && (
                        <button
                            onClick={() => setFormOpen(v => !v)}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 transition-all"
                            style={{ backgroundColor: formOpen ? 'rgba(255,255,255,0.08)' : accentColor, color: formOpen ? '#fff' : accentText }}
                        >
                            {formOpen ? <><X size={13} /> Cancelar</> : <><Plus size={13} /> Subir PDF</>}
                        </button>
                    )}
                </div>
            </div>

            {canUpload && formOpen && (
                <form onSubmit={handleSubir} className="bg-[#111] border border-white/5 rounded-xl p-4 space-y-3 animate-in fade-in">
                    <input
                        value={titulo}
                        onChange={e => setTitulo(e.target.value)}
                        placeholder="Título (ej: Coreografía Acto 1)"
                        className="w-full bg-[#09090b] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-white/30"
                    />
                    <input
                        value={descripcion}
                        onChange={e => setDescripcion(e.target.value)}
                        placeholder="Descripción (opcional)"
                        className="w-full bg-[#09090b] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-white/30"
                    />
                    <label className="flex items-center gap-3 bg-[#09090b] border border-dashed border-white/15 rounded-lg p-3 cursor-pointer hover:border-white/30 transition-colors">
                        <Upload size={16} className="text-gray-400 shrink-0" />
                        <span className="text-xs text-gray-400 truncate">{archivo ? archivo.name : 'Elegir archivo PDF...'}</span>
                        <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => setArchivo(e.target.files?.[0] || null)} />
                    </label>
                    <button
                        type="submit"
                        disabled={subiendo}
                        className="w-full py-3 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        style={{ backgroundColor: accentColor, color: accentText }}
                    >
                        {subiendo ? <Loader2 size={16} className="animate-spin" /> : <><Upload size={14} /> Publicar Material</>}
                    </button>
                </form>
            )}

            {loading ? (
                <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-gray-600" size={20} /></div>
            ) : materiales.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-4">
                    {tipo === 'liga' ? `Sin material cargado para Nivel ${nivelActivo}.` : 'Sin material cargado todavía.'}
                </p>
            ) : (
                <div className="space-y-2">
                    {materiales.map(m => {
                        const autorNombre = Array.isArray(m.autor) ? m.autor[0]?.nombre_completo : m.autor?.nombre_completo
                        return (
                            <div key={m.id} className="bg-[#111] border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-white/15 transition-colors">
                                <a
                                    href={m.archivo_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 min-w-0 flex-1 group"
                                >
                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accentColor}1a` }}>
                                        <FileText size={16} style={{ color: accentColor }} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-white text-sm font-bold truncate group-hover:underline">{m.titulo}</p>
                                        <p className="text-gray-500 text-[10px] truncate">
                                            {m.descripcion ? `${m.descripcion} · ` : ''}{autorNombre || 'Staff'}
                                        </p>
                                    </div>
                                </a>
                                <div className="flex items-center gap-1 shrink-0">
                                    <a href={m.archivo_url} target="_blank" rel="noopener noreferrer" className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-all" title="Abrir / Descargar">
                                        <Download size={14} className="text-gray-300" />
                                    </a>
                                    {canUpload && (
                                        <button onClick={() => handleEliminar(m.id)} className="p-2 bg-red-500/10 hover:bg-red-500 rounded-lg transition-all" title="Eliminar">
                                            <Trash2 size={14} className="text-red-400 hover:text-white" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
