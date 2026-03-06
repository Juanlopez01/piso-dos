'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { Plus, Tag, Edit2, Trash2, Power, Loader2, Layers, BookOpen, Star, Percent, Ticket } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { format } from 'date-fns'

type Producto = {
    id: string
    nombre: string
    precio: number
    creditos: number
    activo: boolean
    tipo_clase: 'regular' | 'seminario'
}

type Cupon = {
    id: string
    codigo: string
    porcentaje: number
    activo: boolean
    created_at: string
}

export default function TiendaConfigPage() {
    const supabase = createClient()

    // UI States
    const [activeTab, setActiveTab] = useState<'packs' | 'cupones'>('packs')
    const [loading, setLoading] = useState(true)

    // Data States
    const [productos, setProductos] = useState<Producto[]>([])
    const [cupones, setCupones] = useState<Cupon[]>([])

    // Modal Producto State
    const [isProductModalOpen, setIsProductModalOpen] = useState(false)
    const [editingProdId, setEditingProdId] = useState<string | null>(null)
    const [formNombre, setFormNombre] = useState('')
    const [formPrecio, setFormPrecio] = useState('')
    const [formCreditos, setFormCreditos] = useState('1')
    const [formTipo, setFormTipo] = useState<'regular' | 'seminario'>('regular')

    // Modal Cupon State
    const [isCuponModalOpen, setIsCuponModalOpen] = useState(false)
    const [formCuponCodigo, setFormCuponCodigo] = useState('')
    const [formCuponPorcentaje, setFormCuponPorcentaje] = useState('')

    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)

        // Traer Productos
        const { data: dataProds } = await supabase
            .from('productos')
            .select('*')
            .order('tipo_clase', { ascending: true })
            .order('creditos', { ascending: true })
        if (dataProds) setProductos(dataProds)

        // Traer Cupones
        const { data: dataCupones } = await supabase
            .from('cupones')
            .select('*')
            .order('created_at', { ascending: false })
        if (dataCupones) setCupones(dataCupones)

        setLoading(false)
    }

    // ==========================================
    // LÓGICA PRODUCTOS
    // ==========================================
    const handleOpenProductModal = (prod?: Producto) => {
        if (prod) {
            setEditingProdId(prod.id)
            setFormNombre(prod.nombre)
            setFormPrecio(prod.precio.toString())
            setFormCreditos(prod.creditos.toString())
            setFormTipo(prod.tipo_clase || 'regular')
        } else {
            setEditingProdId(null)
            setFormNombre('')
            setFormPrecio('')
            setFormCreditos('1')
            setFormTipo('regular')
        }
        setIsProductModalOpen(true)
    }

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        const payload = {
            nombre: formNombre,
            precio: Number(formPrecio),
            creditos: Number(formCreditos),
            tipo_clase: formTipo
        }

        try {
            if (editingProdId) {
                const { error } = await supabase.from('productos').update(payload).eq('id', editingProdId)
                if (error) throw error
                toast.success('Producto actualizado')
            } else {
                const { error } = await supabase.from('productos').insert(payload)
                if (error) throw error
                toast.success('Producto creado')
            }
            setIsProductModalOpen(false)
            fetchData()
        } catch (error: any) {
            toast.error('Error: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const toggleProductStatus = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase.from('productos').update({ activo: !currentStatus }).eq('id', id)
        if (error) toast.error('Error al cambiar estado')
        else {
            toast.success(currentStatus ? 'Desactivado' : 'Activado')
            fetchData()
        }
    }

    // ==========================================
    // LÓGICA CUPONES
    // ==========================================
    const handleSaveCupon = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formCuponCodigo.trim() || !formCuponPorcentaje) return toast.error('Completá los campos')

        const codigoLimpio = formCuponCodigo.trim().toUpperCase()
        setSaving(true)

        try {
            const { error } = await supabase.from('cupones').insert({
                codigo: codigoLimpio,
                porcentaje: Number(formCuponPorcentaje),
                activo: true
            })
            if (error) {
                if (error.code === '23505') throw new Error('Ese código de cupón ya existe')
                throw error
            }
            toast.success('Cupón creado con éxito')
            setIsCuponModalOpen(false)
            setFormCuponCodigo('')
            setFormCuponPorcentaje('')
            fetchData()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSaving(false)
        }
    }

    const toggleCuponStatus = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase.from('cupones').update({ activo: !currentStatus }).eq('id', id)
        if (error) toast.error('Error al cambiar estado')
        else {
            toast.success(currentStatus ? 'Cupón Apagado' : 'Cupón Activado')
            fetchData()
        }
    }

    const deleteCupon = async (id: string) => {
        if (!confirm('¿Eliminar cupón definitivamente? Los alumnos que ya lo usaron no perderán su descuento, pero nadie más podrá usarlo.')) return

        const { error } = await supabase.from('cupones').delete().eq('id', id)
        if (error) toast.error('Error al eliminar')
        else {
            toast.success('Cupón eliminado')
            fetchData()
        }
    }

    return (
        <div className="pb-24 px-4 pt-4 max-w-5xl mx-auto">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 border-b border-white/10 pb-6">
                <div>
                    <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter">Tienda Config</h2>
                    <p className="text-piso2-lime font-bold text-xs tracking-widest uppercase mt-1">
                        Gestión de Precios y Descuentos
                    </p>
                </div>

                {/* TABS DE NAVEGACIÓN */}
                <div className="flex bg-[#111] p-1 rounded-xl border border-white/5 w-full md:w-auto">
                    <button
                        onClick={() => setActiveTab('packs')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'packs' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                    >
                        <Ticket size={16} /> Packs
                    </button>
                    <button
                        onClick={() => setActiveTab('cupones')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'cupones' ? 'bg-[#D4E655] text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                    >
                        <Percent size={16} /> Cupones
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-20"><Loader2 className="animate-spin text-piso2-lime w-10 h-10" /></div>
            ) : (
                <>
                    {/* ========================================================= */}
                    {/* VISTA: PACKS DE CRÉDITOS */}
                    {/* ========================================================= */}
                    {activeTab === 'packs' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex justify-end mb-4">
                                <button
                                    onClick={() => handleOpenProductModal()}
                                    className="bg-piso2-lime text-black font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(204,255,0,0.3)] hover:scale-105 transition-transform flex items-center gap-2"
                                >
                                    <Plus size={16} /> Nuevo Pack
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {productos.map((prod) => (
                                    <div
                                        key={prod.id}
                                        className={`border rounded-xl p-5 relative group transition-all ${prod.activo
                                            ? 'bg-[#111] border-white/10 hover:border-piso2-lime/50'
                                            : 'bg-black border-white/5 opacity-50 grayscale'
                                            }`}
                                    >
                                        <div className={`absolute top-0 left-0 px-3 py-1 rounded-br-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1
                                            ${prod.tipo_clase === 'seminario'
                                                ? 'bg-purple-500/20 text-purple-400 border-b border-r border-purple-500/30'
                                                : 'bg-white/5 text-gray-400 border-b border-r border-white/10'}`
                                        }>
                                            {prod.tipo_clase === 'seminario' ? <Star size={10} /> : <BookOpen size={10} />}
                                            {prod.tipo_clase}
                                        </div>

                                        <div className="absolute top-4 right-4 bg-white/10 px-2 py-1 rounded text-[10px] font-bold uppercase text-white flex items-center gap-1 mt-6">
                                            <Layers size={10} className="text-piso2-lime" /> {prod.creditos} Créditos
                                        </div>

                                        <div className="mb-4 mt-8">
                                            <h3 className="text-xl font-black text-white uppercase leading-none mb-2 pr-16">{prod.nombre}</h3>
                                            <p className="text-2xl font-bold text-piso2-lime flex items-baseline gap-0.5">
                                                <span className="text-sm opacity-50">$</span>
                                                {prod.precio.toLocaleString('es-AR')}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
                                            <button onClick={() => handleOpenProductModal(prod)} className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg text-xs font-bold uppercase text-white flex justify-center items-center gap-2">
                                                <Edit2 size={14} /> Editar
                                            </button>
                                            <button
                                                onClick={() => toggleProductStatus(prod.id, prod.activo)}
                                                className={`p-2 rounded-lg transition-colors ${prod.activo ? 'text-gray-500 hover:text-red-500 hover:bg-red-500/10' : 'text-green-500 hover:bg-green-500/10'}`}
                                                title={prod.activo ? "Desactivar" : "Activar"}
                                            >
                                                <Power size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {productos.length === 0 && (
                                    <div className="col-span-full text-center py-20 border border-dashed border-white/10 rounded-2xl text-gray-500">
                                        <Tag size={40} className="mx-auto mb-3 opacity-30" />
                                        <p className="font-bold uppercase text-sm">No hay packs creados.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* VISTA: CUPONES DE DESCUENTO */}
                    {/* ========================================================= */}
                    {activeTab === 'cupones' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex justify-end mb-4">
                                <button
                                    onClick={() => setIsCuponModalOpen(true)}
                                    className="bg-[#D4E655] text-black font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(212,230,85,0.3)] hover:scale-105 transition-transform flex items-center gap-2"
                                >
                                    <Plus size={16} /> Crear Cupón
                                </button>
                            </div>

                            <div className="bg-[#111] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left min-w-[600px]">
                                        <thead className="bg-black/40 text-[9px] font-black uppercase text-gray-500">
                                            <tr>
                                                <th className="p-5">Código</th>
                                                <th className="p-5 text-center">Descuento</th>
                                                <th className="p-5">Creación</th>
                                                <th className="p-5 text-center">Estado</th>
                                                <th className="p-5 text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm divide-y divide-white/5">
                                            {cupones.map(cupon => (
                                                <tr key={cupon.id} className={`hover:bg-white/5 transition-colors ${!cupon.activo && 'opacity-50 grayscale'}`}>
                                                    <td className="p-5 font-mono font-bold text-white tracking-widest">
                                                        <span className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">{cupon.codigo}</span>
                                                    </td>
                                                    <td className="p-5 text-center font-black text-[#D4E655] text-lg">
                                                        -{cupon.porcentaje}%
                                                    </td>
                                                    <td className="p-5 text-xs text-gray-400 font-medium">
                                                        {format(new Date(cupon.created_at), "dd MMM yyyy")}
                                                    </td>
                                                    <td className="p-5 text-center">
                                                        <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${cupon.activo ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                                            {cupon.activo ? 'Activo' : 'Apagado'}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => toggleCuponStatus(cupon.id, cupon.activo)}
                                                                className="p-2 text-gray-500 hover:text-white bg-white/5 rounded-lg transition-colors"
                                                                title={cupon.activo ? "Apagar cupón" : "Prender cupón"}
                                                            >
                                                                <Power size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => deleteCupon(cupon.id)}
                                                                className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                                title="Eliminar definitivamente"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {cupones.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="p-10 text-center text-gray-500 font-bold uppercase text-xs">
                                                        No tenés códigos de descuento creados.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ========================================================= */}
            {/* MODALES FLOTANTES */}
            {/* ========================================================= */}

            {/* Modal Producto */}
            {isProductModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsProductModalOpen(false)}>
                    <div className="bg-[#111] border border-white/10 w-full md:max-w-md md:rounded-3xl rounded-t-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-2xl font-black text-white uppercase mb-6 flex items-center gap-3">
                            {editingProdId ? <Edit2 className="text-[#D4E655]" size={24} /> : <Plus className="text-[#D4E655]" size={24} />}
                            {editingProdId ? 'Editar Precio' : 'Nuevo Pack'}
                        </h3>

                        <form onSubmit={handleSaveProduct} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">Tipo de Clase</label>
                                <div className="grid grid-cols-2 gap-2 bg-black border border-white/10 p-1.5 rounded-2xl">
                                    <button type="button" onClick={() => setFormTipo('regular')} className={`py-4 text-xs font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${formTipo === 'regular' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}>
                                        <BookOpen size={16} /> Regular
                                    </button>
                                    <button type="button" onClick={() => setFormTipo('seminario')} className={`py-4 text-xs font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${formTipo === 'seminario' ? 'bg-purple-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>
                                        <Star size={16} /> Seminario
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">Nombre del Pack</label>
                                <input autoFocus required placeholder={formTipo === 'seminario' ? "Ej: Seminario Intensivo" : "Ej: Pack 8 Clases"} value={formNombre} onChange={e => setFormNombre(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">Precio ($)</label>
                                    <input required type="number" placeholder="0" value={formPrecio} onChange={e => setFormPrecio(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">Créditos</label>
                                    <input required type="number" placeholder="1" value={formCreditos} onChange={e => setFormCreditos(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                                </div>
                            </div>

                            <div className="pt-6 flex gap-3">
                                <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-gray-400 text-xs uppercase transition-colors">Cancelar</button>
                                <button type="submit" disabled={saving} className="flex-[2] bg-[#D4E655] text-black font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all shadow-[0_0_20px_rgba(212,230,85,0.3)] text-xs flex justify-center items-center">
                                    {saving ? <Loader2 className="animate-spin mr-2" /> : 'Guardar Pack'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Cupón */}
            {isCuponModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsCuponModalOpen(false)}>
                    <div className="bg-[#111] border border-white/10 w-full md:max-w-md md:rounded-3xl rounded-t-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-2xl font-black text-white uppercase mb-6 flex items-center gap-3">
                            <Tag className="text-[#D4E655]" size={24} /> Crear Cupón
                        </h3>

                        <form onSubmit={handleSaveCupon} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">Código (Ej: VERANO20)</label>
                                <input autoFocus required type="text" placeholder="CÓDIGO" value={formCuponCodigo} onChange={e => setFormCuponCodigo(e.target.value.toUpperCase())} className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-mono uppercase font-black tracking-widest outline-none focus:border-[#D4E655] transition-colors" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">Porcentaje de Descuento</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-4 text-gray-500 font-black">%</span>
                                    <input required type="number" min="1" max="100" placeholder="20" value={formCuponPorcentaje} onChange={e => setFormCuponPorcentaje(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl p-4 pl-10 text-[#D4E655] font-black text-xl outline-none focus:border-[#D4E655] transition-colors" />
                                </div>
                            </div>

                            <p className="text-[10px] text-gray-500 text-center leading-relaxed px-4 pt-2">
                                El cupón podrá ser utilizado 1 sola vez por usuario en su próxima compra.
                            </p>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsCuponModalOpen(false)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-gray-400 text-xs uppercase transition-colors">Cancelar</button>
                                <button type="submit" disabled={saving} className="flex-[2] bg-[#D4E655] text-black font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all shadow-[0_0_20px_rgba(212,230,85,0.3)] text-xs flex justify-center items-center">
                                    {saving ? <Loader2 className="animate-spin mr-2" /> : 'Generar Código'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    )
}