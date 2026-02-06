'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { Plus, Tag, Edit2, Trash2, Power, Loader2, DollarSign, Layers } from 'lucide-react'
import { Toaster, toast } from 'sonner'

type Producto = {
    id: string
    nombre: string
    precio: number
    creditos: number
    activo: boolean
}

export default function ProductosPage() {
    const supabase = createClient()

    const [productos, setProductos] = useState<Producto[]>([])
    const [loading, setLoading] = useState(true)

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    // Form State
    const [formNombre, setFormNombre] = useState('')
    const [formPrecio, setFormPrecio] = useState('')
    const [formCreditos, setFormCreditos] = useState('1')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchProductos()
    }, [])

    const fetchProductos = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('productos')
            .select('*')
            .order('creditos', { ascending: true }) // Ordenar por tamaño del pack

        if (data) setProductos(data)
        setLoading(false)
    }

    const handleOpenModal = (prod?: Producto) => {
        if (prod) {
            setEditingId(prod.id)
            setFormNombre(prod.nombre)
            setFormPrecio(prod.precio.toString())
            setFormCreditos(prod.creditos.toString())
        } else {
            setEditingId(null)
            setFormNombre('')
            setFormPrecio('')
            setFormCreditos('1')
        }
        setIsModalOpen(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        const payload = {
            nombre: formNombre,
            precio: Number(formPrecio),
            creditos: Number(formCreditos)
        }

        try {
            if (editingId) {
                // Editar
                const { error } = await supabase.from('productos').update(payload).eq('id', editingId)
                if (error) throw error
                toast.success('Producto actualizado')
            } else {
                // Crear
                const { error } = await supabase.from('productos').insert(payload)
                if (error) throw error
                toast.success('Producto creado')
            }

            setIsModalOpen(false)
            fetchProductos()

        } catch (error: any) {
            toast.error('Error: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const toggleActivo = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase.from('productos').update({ activo: !currentStatus }).eq('id', id)
        if (error) toast.error('Error al cambiar estado')
        else {
            toast.success(currentStatus ? 'Producto desactivado' : 'Producto activado')
            fetchProductos()
        }
    }

    return (
        <div className="pb-24 px-4 pt-4 max-w-4xl mx-auto">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Precios</h2>
                    <p className="text-piso2-lime font-bold text-xs tracking-widest uppercase">
                        Catálogo de Productos
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-piso2-lime text-black font-bold p-3 rounded-xl shadow-[0_0_15px_rgba(204,255,0,0.3)] hover:scale-105 transition-transform"
                >
                    <Plus size={24} />
                </button>
            </div>

            {/* LISTA DE TARJETAS */}
            {loading ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin text-piso2-lime" /></div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {productos.map((prod) => (
                        <div
                            key={prod.id}
                            className={`border rounded-xl p-5 relative group transition-all ${prod.activo
                                    ? 'bg-[#111] border-white/10 hover:border-piso2-lime/50'
                                    : 'bg-black border-white/5 opacity-50 grayscale'
                                }`}
                        >
                            {/* Badge Créditos */}
                            <div className="absolute top-4 right-4 bg-white/10 px-2 py-1 rounded text-[10px] font-bold uppercase text-white flex items-center gap-1">
                                <Layers size={10} className="text-piso2-lime" /> {prod.creditos} Créditos
                            </div>

                            <div className="mb-4">
                                <h3 className="text-xl font-black text-white uppercase leading-none mb-2 pr-16">{prod.nombre}</h3>
                                <p className="text-2xl font-bold text-piso2-lime flex items-baseline gap-0.5">
                                    <span className="text-sm opacity-50">$</span>
                                    {prod.precio.toLocaleString('es-AR')}
                                </p>
                            </div>

                            {/* Acciones */}
                            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
                                <button onClick={() => handleOpenModal(prod)} className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg text-xs font-bold uppercase text-white flex justify-center items-center gap-2">
                                    <Edit2 size={14} /> Editar
                                </button>
                                <button
                                    onClick={() => toggleActivo(prod.id, prod.activo)}
                                    className={`p-2 rounded-lg transition-colors ${prod.activo ? 'text-gray-500 hover:text-red-500 hover:bg-red-500/10' : 'text-green-500 hover:bg-green-500/10'}`}
                                    title={prod.activo ? "Desactivar" : "Activar"}
                                >
                                    <Power size={18} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {productos.length === 0 && (
                        <div className="col-span-full text-center py-10 border border-dashed border-white/10 rounded-xl text-gray-500">
                            <Tag size={40} className="mx-auto mb-2 opacity-50" />
                            <p>No hay productos creados.</p>
                        </div>
                    )}
                </div>
            )}

            {/* MODAL CREAR/EDITAR (Mobile First) */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-[#111] border border-white/10 w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-black text-white uppercase mb-6 flex items-center gap-2">
                            {editingId ? <Edit2 className="text-piso2-lime" size={20} /> : <Plus className="text-piso2-lime" size={20} />}
                            {editingId ? 'Editar Precio' : 'Nuevo Pack'}
                        </h3>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Nombre del Pack</label>
                                <input
                                    autoFocus
                                    required
                                    placeholder="Ej: Pack 8 Clases"
                                    value={formNombre}
                                    onChange={e => setFormNombre(e.target.value)}
                                    className="w-full bg-black border border-white/20 rounded-xl p-4 text-white font-bold outline-none focus:border-piso2-lime transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Precio ($)</label>
                                    <input
                                        required
                                        type="number"
                                        placeholder="0"
                                        value={formPrecio}
                                        onChange={e => setFormPrecio(e.target.value)}
                                        className="w-full bg-black border border-white/20 rounded-xl p-4 text-white font-bold outline-none focus:border-piso2-lime transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Créditos</label>
                                    <input
                                        required
                                        type="number"
                                        placeholder="1"
                                        value={formCreditos}
                                        onChange={e => setFormCreditos(e.target.value)}
                                        className="w-full bg-black border border-white/20 rounded-xl p-4 text-white font-bold outline-none focus:border-piso2-lime transition-colors"
                                    />
                                </div>
                            </div>

                            <p className="text-[10px] text-gray-500 mt-2 bg-white/5 p-3 rounded-lg border border-white/5">
                                ℹ️ <strong>Créditos:</strong> Cantidad de clases que el alumno podrá tomar con este pack.
                            </p>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-white/5 rounded-xl font-bold text-gray-400 text-xs uppercase">Cancelar</button>
                                <button type="submit" disabled={saving} className="flex-[2] bg-piso2-lime text-black font-bold uppercase rounded-xl hover:bg-white transition-all shadow-lg text-xs flex justify-center items-center">
                                    {saving ? <Loader2 className="animate-spin mr-2" /> : 'Guardar Pack'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    )
}