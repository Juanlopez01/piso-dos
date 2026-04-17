'use client'

import { createClient } from '@/utils/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Plus, Tag, Edit2, Trash2, Power, Loader2, Layers, BookOpen, Star, Percent, Ticket, ShieldAlert } from 'lucide-react'
import { eliminarProductoAction } from '@/app/actions/tienda' // Fijate que coincida con tu ruta
import { Toaster, toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// 🚀 IMPORTAMOS LAS SERVER ACTIONS
import {
    guardarProductoAction, toggleProductoAction,
    guardarCuponAction, toggleCuponAction, eliminarCuponAction
} from '@/app/actions/tienda'

// --- TIPOS ---
type Producto = {
    id: string
    nombre: string
    precio: number
    creditos: number
    activo: boolean
    tipo_clase: 'regular' | 'seminario' | 'especial' | 'exclusivo'
    pase_referencia?: string
}

type Cupon = {
    id: string
    codigo: string
    porcentaje: number
    activo: boolean
    created_at: string
}

type ClaseExclusiva = {
    nombre: string
    profesor_nombre: string
    key_grupo: string
}

type TiendaConfigData = {
    productos: Producto[]
    cupones: Cupon[]
    clasesExclusivas: ClaseExclusiva[]
}

// 🚀 FETCHER UNIFICADO DE SWR
const fetcherTiendaConfig = async (): Promise<TiendaConfigData> => {
    const supabase = createClient()

    const { data: dataProds } = await supabase
        .from('productos')
        .select('*')
        .order('tipo_clase', { ascending: true })
        .order('creditos', { ascending: true })

    const { data: dataCupones } = await supabase
        .from('cupones')
        .select('*')
        .order('created_at', { ascending: false })

    // 🚀 BUSCAMOS CLASES EXCLUSIVAS EN LA AGENDA
    const hoy = new Date().toISOString()
    const { data: dataClases } = await supabase
        .from('clases')
        .select(`id, nombre, tipo_clase, profesor:profiles!clases_profesor_id_fkey(nombre_completo)`)
        .gte('inicio', hoy)
        .eq('es_combinable', false) // Solo las que tienen candado
        .neq('estado', 'cancelada')

    const mapExclusivas = new Map<string, ClaseExclusiva>()

    if (dataClases) {
        dataClases.forEach((c: any) => {
            const profeNombre = Array.isArray(c.profesor) ? c.profesor[0]?.nombre_completo : c.profesor?.nombre_completo || 'Staff'
            const key = `${c.nombre}-${profeNombre}-${c.tipo_clase}`

            // Guardamos 1 sola por grupo (para no repetir si dan 4 clases en el mes)
            if (!mapExclusivas.has(key)) {
                mapExclusivas.set(key, {
                    nombre: c.nombre,
                    profesor_nombre: profeNombre,
                    key_grupo: key
                })
            }
        })
    }

    return {
        productos: (dataProds as Producto[]) || [],
        cupones: (dataCupones as Cupon[]) || [],
        clasesExclusivas: Array.from(mapExclusivas.values())
    }
}

export default function TiendaConfigPage() {
    const router = useRouter()

    const { data, isLoading, mutate } = useSWR<TiendaConfigData>(
        'tienda-config',
        fetcherTiendaConfig,
        { revalidateOnFocus: false }
    )

    const productos = data?.productos || []
    const cupones = data?.cupones || []
    const clasesExclusivas = data?.clasesExclusivas || []

    // Agrupamos los productos para mostrarlos ordenados
    const exclusivos = productos.filter(p => p.tipo_clase === 'exclusivo')
    const regulares = productos.filter(p => p.tipo_clase === 'regular')
    const especiales = productos.filter(p => p.tipo_clase === 'seminario' || p.tipo_clase === 'especial')

    // UI States
    const [activeTab, setActiveTab] = useState<'packs' | 'cupones'>('packs')
    const [saving, setSaving] = useState(false)

    // Modal Producto State
    const [isProductModalOpen, setIsProductModalOpen] = useState(false)
    const [editingProdId, setEditingProdId] = useState<string | null>(null)
    const [formNombre, setFormNombre] = useState('')
    const [formPrecio, setFormPrecio] = useState('')
    const [formCreditos, setFormCreditos] = useState('1')
    const [formTipo, setFormTipo] = useState<'regular' | 'especial' | 'exclusivo'>('regular')
    const [formPaseReferencia, setFormPaseReferencia] = useState('')

    // Modal Cupon State
    const [isCuponModalOpen, setIsCuponModalOpen] = useState(false)
    const [formCuponCodigo, setFormCuponCodigo] = useState('')
    const [formCuponPorcentaje, setFormCuponPorcentaje] = useState('')

    // ==========================================
    // LÓGICA PRODUCTOS
    // ==========================================
    const handleOpenProductModal = (prod?: Producto) => {
        if (prod) {
            setEditingProdId(prod.id)
            setFormNombre(prod.nombre)
            setFormPrecio(prod.precio.toString())
            setFormCreditos(prod.creditos.toString())
            setFormTipo(prod.tipo_clase === 'seminario' ? 'especial' : prod.tipo_clase || 'regular')
            setFormPaseReferencia(prod.pase_referencia || '')
        } else {
            setEditingProdId(null)
            setFormNombre('')
            setFormPrecio('')
            setFormCreditos('1')
            setFormTipo('regular')
            setFormPaseReferencia('')
        }
        setIsProductModalOpen(true)
    }

    const handleDeleteProduct = async (id: string) => {
        if (!confirm('¿Estás seguro de que querés eliminar este pack definitivamente? Esto no se puede deshacer.')) return;

        const toastId = toast.loading('Eliminando...');
        const response = await eliminarProductoAction(id);

        if (response.success) {
            toast.success(response.message, { id: toastId });
            mutate(); // Actualiza los datos en pantalla
        } else {
            toast.error(response.error || 'Error al eliminar', { id: toastId });
        }
    }

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault()

        if (formTipo === 'exclusivo' && !formPaseReferencia) {
            return toast.error("Por favor, seleccioná una clase vinculada para este pase exclusivo.")
        }

        setSaving(true)

        const payload = {
            nombre: formNombre,
            precio: Number(formPrecio),
            creditos: Number(formCreditos),
            tipo_clase: formTipo === 'especial' ? 'seminario' : formTipo,
            pase_referencia: formTipo === 'exclusivo' ? formPaseReferencia : null
        }

        const response = await guardarProductoAction(payload, editingProdId || undefined)

        if (response.success) {
            toast.success(editingProdId ? 'Producto actualizado' : 'Producto creado')
            setIsProductModalOpen(false)
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al guardar el producto')
        }

        setSaving(false)
    }

    const toggleProductStatus = async (id: string, currentStatus: boolean) => {
        const optimisticProds = productos.map(p => p.id === id ? { ...p, activo: !currentStatus } : p)
        mutate({ ...data!, productos: optimisticProds }, false)

        const response = await toggleProductoAction(id, currentStatus)

        if (response.success) {
            toast.success(currentStatus ? 'Desactivado' : 'Activado')
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al cambiar estado')
            mutate()
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

        const response = await guardarCuponAction(codigoLimpio, Number(formCuponPorcentaje))

        if (response.success) {
            toast.success('Cupón creado con éxito')
            setIsCuponModalOpen(false)
            setFormCuponCodigo('')
            setFormCuponPorcentaje('')
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al guardar')
        }

        setSaving(false)
    }

    const toggleCuponStatus = async (id: string, currentStatus: boolean) => {
        const optimisticCupones = cupones.map(c => c.id === id ? { ...c, activo: !currentStatus } : c)
        mutate({ ...data!, cupones: optimisticCupones }, false)

        const response = await toggleCuponAction(id, currentStatus)

        if (response.success) {
            toast.success(currentStatus ? 'Cupón Apagado' : 'Cupón Activado')
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al cambiar estado')
            mutate()
        }
    }

    const deleteCupon = async (id: string) => {
        if (!confirm('¿Eliminar cupón definitivamente? Los alumnos que ya lo usaron no perderán su descuento, pero nadie más podrá usarlo.')) return

        const optimisticCupones = cupones.filter(c => c.id !== id)
        mutate({ ...data!, cupones: optimisticCupones }, false)

        const response = await eliminarCuponAction(id)

        if (response.success) {
            toast.success('Cupón eliminado')
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al eliminar')
            mutate()
        }
    }

    return (
        <div className="pb-24 px-4 pt-4 max-w-5xl mx-auto">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 border-b border-white/10 pb-6">
                <div>
                    <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter">Tienda Config</h2>
                    <p className="text-[#D4E655] font-bold text-xs tracking-widest uppercase mt-1">Gestión de Precios y Descuentos</p>
                </div>

                <div className="flex bg-[#111] p-1 rounded-xl border border-white/5 w-full md:w-auto">
                    <button onClick={() => setActiveTab('packs')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'packs' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}>
                        <Ticket size={16} /> Packs
                    </button>
                    <button onClick={() => setActiveTab('cupones')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'cupones' ? 'bg-[#D4E655] text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}>
                        <Percent size={16} /> Cupones
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-20"><Loader2 className="animate-spin text-[#D4E655] w-10 h-10" /></div>
            ) : (
                <>
                    {/* ========================================================= */}
                    {/* VISTA: PACKS DE CRÉDITOS */}
                    {/* ========================================================= */}
                    {activeTab === 'packs' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex justify-end mb-6">
                                <button onClick={() => handleOpenProductModal()} className="bg-[#D4E655] text-black font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(204,255,0,0.3)] hover:scale-105 transition-transform flex items-center gap-2">
                                    <Plus size={16} /> Nuevo Pack
                                </button>
                            </div>

                            {/* SECCIÓN NO COMBINABLES */}
                            {exclusivos.length > 0 && (
                                <div className="mb-10">
                                    <h3 className="text-orange-600 font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                                        <ShieldAlert size={14} /> No Combinables
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {exclusivos.map((prod) => (
                                            <div key={prod.id} className={`border rounded-xl p-5 relative group transition-all ${prod.activo ? 'bg-[#111] border-orange-600/20 hover:border-orange-600/50' : 'bg-black border-white/5 opacity-50 grayscale'}`}>
                                                <div className="absolute top-0 left-0 px-3 py-1 rounded-br-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1 bg-orange-600/20 text-orange-500 border-b border-r border-orange-600/30">
                                                    <ShieldAlert size={10} /> no combinable
                                                </div>
                                                <div className="absolute top-4 right-4 bg-white/10 px-2 py-1 rounded text-[10px] font-bold uppercase text-white flex items-center gap-1 mt-6">
                                                    <Layers size={10} className="text-orange-500" /> {prod.creditos} Créditos
                                                </div>
                                                <div className="mb-2 mt-8">
                                                    <h3 className="text-xl font-black text-white uppercase leading-none mb-2 pr-16">{prod.nombre}</h3>
                                                    <p className="text-2xl font-bold text-orange-500 flex items-baseline gap-0.5">
                                                        <span className="text-sm opacity-50">$</span>{prod.precio.toLocaleString('es-AR')}
                                                    </p>
                                                </div>
                                                {prod.pase_referencia && (
                                                    <div className="text-[9px] text-orange-500/70 italic uppercase tracking-wider mb-2 line-clamp-1 border-t border-white/5 pt-2">
                                                        Ref: {prod.pase_referencia.split('-').join(' / ')}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 mt-2 pt-4 border-t border-white/5">
                                                    <button onClick={() => handleOpenProductModal(prod)} className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg text-xs font-bold uppercase text-white flex justify-center items-center gap-2">
                                                        <Edit2 size={14} /> Editar
                                                    </button>
                                                    <button onClick={() => toggleProductStatus(prod.id, prod.activo)} className={`p-2 rounded-lg transition-colors ${prod.activo ? 'text-gray-500 hover:text-orange-500 hover:bg-orange-500/10' : 'text-green-500 hover:bg-green-500/10'}`} title={prod.activo ? "Desactivar" : "Activar"}>
                                                        <Power size={18} />
                                                    </button>

                                                    {/* 🚀 ACÁ ESTÁ EL BOTÓN DE ELIMINAR */}
                                                    <button onClick={() => handleDeleteProduct(prod.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar Producto">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* SECCIÓN REGULARES */}
                            {regulares.length > 0 && (
                                <div className="mb-10">
                                    <h3 className="text-orange-500 font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                                        <Ticket size={14} /> Regulares
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {regulares.map((prod) => (
                                            <div key={prod.id} className={`border rounded-xl p-5 relative group transition-all ${prod.activo ? 'bg-[#111] border-orange-500/20 hover:border-orange-500/50' : 'bg-black border-white/5 opacity-50 grayscale'}`}>
                                                <div className="absolute top-0 left-0 px-3 py-1 rounded-br-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1 bg-orange-500/20 text-orange-400 border-b border-r border-orange-500/30">
                                                    <BookOpen size={10} /> regular
                                                </div>
                                                <div className="absolute top-4 right-4 bg-white/10 px-2 py-1 rounded text-[10px] font-bold uppercase text-white flex items-center gap-1 mt-6">
                                                    <Layers size={10} className="text-orange-500" /> {prod.creditos} Créditos
                                                </div>
                                                <div className="mb-4 mt-8">
                                                    <h3 className="text-xl font-black text-white uppercase leading-none mb-2 pr-16">{prod.nombre}</h3>
                                                    <p className="text-2xl font-bold text-orange-500 flex items-baseline gap-0.5">
                                                        <span className="text-sm opacity-50">$</span>{prod.precio.toLocaleString('es-AR')}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 mt-2 pt-4 border-t border-white/5">
                                                    <button onClick={() => handleOpenProductModal(prod)} className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg text-xs font-bold uppercase text-white flex justify-center items-center gap-2">
                                                        <Edit2 size={14} /> Editar
                                                    </button>
                                                    <button onClick={() => toggleProductStatus(prod.id, prod.activo)} className={`p-2 rounded-lg transition-colors ${prod.activo ? 'text-gray-500 hover:text-orange-500 hover:bg-orange-500/10' : 'text-green-500 hover:bg-green-500/10'}`} title={prod.activo ? "Desactivar" : "Activar"}>
                                                        <Power size={18} />
                                                    </button>

                                                    {/* 🚀 ACÁ ESTÁ EL BOTÓN DE ELIMINAR */}
                                                    <button onClick={() => handleDeleteProduct(prod.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar Producto">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* SECCIÓN ESPECIALES */}
                            {especiales.length > 0 && (
                                <div className="mb-10">
                                    <h3 className="text-purple-500 font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                                        <Star size={14} /> Especiales
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {especiales.map((prod) => (
                                            <div key={prod.id} className={`border rounded-xl p-5 relative group transition-all ${prod.activo ? 'bg-[#111] border-purple-500/20 hover:border-purple-500/50' : 'bg-black border-white/5 opacity-50 grayscale'}`}>
                                                <div className="absolute top-0 left-0 px-3 py-1 rounded-br-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1 bg-purple-500/20 text-purple-400 border-b border-r border-purple-500/30">
                                                    <Star size={10} /> especial
                                                </div>
                                                <div className="absolute top-4 right-4 bg-white/10 px-2 py-1 rounded text-[10px] font-bold uppercase text-white flex items-center gap-1 mt-6">
                                                    <Layers size={10} className="text-purple-500" /> {prod.creditos} Créditos
                                                </div>
                                                <div className="mb-4 mt-8">
                                                    <h3 className="text-xl font-black text-white uppercase leading-none mb-2 pr-16">{prod.nombre}</h3>
                                                    <p className="text-2xl font-bold text-purple-500 flex items-baseline gap-0.5">
                                                        <span className="text-sm opacity-50">$</span>{prod.precio.toLocaleString('es-AR')}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 mt-2 pt-4 border-t border-white/5">
                                                    <button onClick={() => handleOpenProductModal(prod)} className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg text-xs font-bold uppercase text-white flex justify-center items-center gap-2">
                                                        <Edit2 size={14} /> Editar
                                                    </button>
                                                    <button onClick={() => toggleProductStatus(prod.id, prod.activo)} className={`p-2 rounded-lg transition-colors ${prod.activo ? 'text-gray-500 hover:text-orange-500 hover:bg-orange-500/10' : 'text-green-500 hover:bg-green-500/10'}`} title={prod.activo ? "Desactivar" : "Activar"}>
                                                        <Power size={18} />
                                                    </button>

                                                    {/* 🚀 ACÁ ESTÁ EL BOTÓN DE ELIMINAR */}
                                                    <button onClick={() => handleDeleteProduct(prod.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar Producto">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {productos.length === 0 && (
                                <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl text-gray-500">
                                    <Tag size={40} className="mx-auto mb-3 opacity-30" />
                                    <p className="font-bold uppercase text-sm">No hay packs creados.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* VISTA: CUPONES DE DESCUENTO */}
                    {/* ========================================================= */}
                    {activeTab === 'cupones' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex justify-end mb-4">
                                <button onClick={() => setIsCuponModalOpen(true)} className="bg-[#D4E655] text-black font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(212,230,85,0.3)] hover:scale-105 transition-transform flex items-center gap-2">
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
                                                    <td className="p-5 text-center font-black text-[#D4E655] text-lg">-{cupon.porcentaje}%</td>
                                                    <td className="p-5 text-xs text-gray-400 font-medium">{format(new Date(cupon.created_at), "dd MMM yyyy", { locale: es })}</td>
                                                    <td className="p-5 text-center">
                                                        <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${cupon.activo ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                                            {cupon.activo ? 'Activo' : 'Apagado'}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button onClick={() => toggleCuponStatus(cupon.id, cupon.activo)} className="p-2 text-gray-500 hover:text-white bg-white/5 rounded-lg transition-colors" title={cupon.activo ? "Apagar cupón" : "Prender cupón"}><Power size={16} /></button>
                                                            <button onClick={() => deleteCupon(cupon.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar definitivamente"><Trash2 size={16} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {cupones.length === 0 && (
                                                <tr><td colSpan={5} className="p-10 text-center text-gray-500 font-bold uppercase text-xs">No tenés códigos de descuento creados.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* MODAL PRODUCTO */}
            {isProductModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsProductModalOpen(false)}>
                    <div className="bg-[#111] border border-white/10 w-full md:max-w-md md:rounded-3xl rounded-t-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-2xl font-black text-white uppercase mb-6 flex items-center gap-3">
                            {editingProdId ? <Edit2 className="text-[#D4E655]" size={24} /> : <Plus className="text-[#D4E655]" size={24} />}
                            {editingProdId ? 'Editar Pack' : 'Nuevo Pack'}
                        </h3>
                        <form onSubmit={handleSaveProduct} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">Tipo de Clase</label>
                                <div className="grid grid-cols-3 gap-2 bg-black border border-white/10 p-1.5 rounded-2xl">
                                    <button type="button" onClick={() => setFormTipo('regular')} className={`py-3 text-[10px] font-black uppercase rounded-xl transition-all flex flex-col items-center justify-center gap-1 ${formTipo === 'regular' ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}><BookOpen size={14} /> Regular</button>
                                    <button type="button" onClick={() => setFormTipo('especial')} className={`py-3 text-[10px] font-black uppercase rounded-xl transition-all flex flex-col items-center justify-center gap-1 ${formTipo === 'especial' ? 'bg-purple-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}><Star size={14} /> Especial</button>
                                    <button type="button" onClick={() => setFormTipo('exclusivo')} className={`py-3 text-[10px] font-black uppercase rounded-xl transition-all flex flex-col items-center justify-center gap-1 ${formTipo === 'exclusivo' ? 'bg-cyan-500 text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}><ShieldAlert size={14} /> Exclusivo</button>
                                </div>
                            </div>

                            {/* 🚀 DESPLEGABLE INTELIGENTE PARA EXCLUSIVOS */}
                            {formTipo === 'exclusivo' && (
                                <div className="space-y-2 mt-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl animate-in fade-in">
                                    <label className="text-[10px] uppercase font-bold text-cyan-400 tracking-widest pl-1 flex items-center gap-1">
                                        <ShieldAlert size={12} /> Clase Vinculada
                                    </label>
                                    <select
                                        required={formTipo === 'exclusivo'}
                                        value={formPaseReferencia}
                                        onChange={e => setFormPaseReferencia(e.target.value)}
                                        className="w-full bg-black border border-cyan-500/30 rounded-2xl p-4 text-white text-xs font-bold outline-none focus:border-cyan-500 transition-colors"
                                    >
                                        <option value="">Seleccioná la clase bloqueada...</option>
                                        {clasesExclusivas.map(c => (
                                            <option key={c.key_grupo} value={c.key_grupo}>{c.nombre} con {c.profesor_nombre}</option>
                                        ))}
                                    </select>
                                    {clasesExclusivas.length === 0 && <p className="text-[9px] text-gray-500 italic mt-1 pl-1">No hay clases con candado programadas en la agenda.</p>}
                                </div>
                            )}

                            <div className="space-y-2 mt-4">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">Nombre del Pack</label>
                                <input autoFocus required placeholder={formTipo === 'especial' ? "Ej: Workshop Ritmos" : formTipo === 'exclusivo' ? "Ej: Pase Masterclass Juan" : "Ej: Pack 8 Clases"} value={formNombre} onChange={e => setFormNombre(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">Precio ($)</label>
                                    <input required type="number" placeholder="0" value={formPrecio} onChange={e => setFormPrecio(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest pl-1">
                                        {formTipo === 'exclusivo' ? 'Cant. Pases' : 'Créditos'}
                                    </label>
                                    <input required type="number" placeholder="1" value={formCreditos} onChange={e => setFormCreditos(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors" />
                                </div>
                            </div>

                            <div className="pt-6 flex gap-3">
                                <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-gray-400 text-xs uppercase transition-colors">Cancelar</button>
                                <button type="submit" disabled={saving} className={`flex-[2] text-black font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg text-xs flex justify-center items-center ${formTipo === 'exclusivo' ? 'bg-cyan-500 hover:bg-white' : formTipo === 'regular' ? 'bg-orange-500 text-white hover:text-black hover:bg-white' : 'bg-purple-500 text-white hover:text-black hover:bg-white'}`}>
                                    {saving ? <Loader2 className="animate-spin mr-2" /> : 'Guardar Pack'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL CUPON */}
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