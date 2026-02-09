'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    Search, User, Phone, Mail, Edit2, MessageCircle, CreditCard,
    Plus, X, Loader2, Filter, ShoppingBag, Copy, Tag, Check, ArrowRight
} from 'lucide-react'
import { format } from 'date-fns'
import { Toaster, toast } from 'sonner'

// --- TIPOS ---
type Alumno = {
    id: string
    nombre: string
    apellido: string
    email: string
    telefono: string
    genero: string
    fecha_nacimiento: string
    creditos: number
    etiquetas: string[] | null // Ej: ['Urbano', 'Ballet']
}

type Producto = {
    id: string
    nombre: string
    precio: number
    creditos: number
}

export default function AlumnosPage() {
    const supabase = createClient()

    // Datos
    const [alumnos, setAlumnos] = useState<Alumno[]>([])
    const [productos, setProductos] = useState<Producto[]>([])
    const [loading, setLoading] = useState(true)

    // Filtros
    const [searchTerm, setSearchTerm] = useState('')
    const [filterTag, setFilterTag] = useState('')

    // Modales
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isSellOpen, setIsSellOpen] = useState(false)

    // Estados de Selección
    const [selectedAlumno, setSelectedAlumno] = useState<Alumno | null>(null)
    const [selectedProduct, setSelectedProduct] = useState<string>('')

    // Formularios
    const [formData, setFormData] = useState<any>({})
    const [saving, setSaving] = useState(false)

    // Lista de Estilos (Hardcoded o podría venir de DB)
    const ESTILOS_DISPONIBLES = ['Urbano', 'Contemporáneo', 'Ballet', 'Jazz', 'Kids', 'Competición']

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data: dataAlumnos } = await supabase.from('profiles').select('*').order('apellido')
        const { data: dataProds } = await supabase.from('productos').select('*').eq('activo', true)

        if (dataAlumnos) setAlumnos(dataAlumnos as any)
        if (dataProds) setProductos(dataProds)
        setLoading(false)
    }

    // --- LÓGICA DE FILTRADO ---
    const filteredAlumnos = alumnos.filter(a => {
        const searchLower = searchTerm.toLowerCase()
        const fullName = `${a.nombre || ''} ${a.apellido || ''}`.toLowerCase()
        const matchesSearch = fullName.includes(searchLower) || a.email?.toLowerCase().includes(searchLower)

        const matchesTag = filterTag ? a.etiquetas?.includes(filterTag) : true

        return matchesSearch && matchesTag
    })

    // --- FUNCIONES ACCIONES ---

    // 1. CARGA MANUAL DE ALUMNO
    const handleCreateAlumno = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            // Creamos usuario en Auth (Dummy password para que recepcion lo cree rapido)
            const dummyPass = 'piso2-' + Math.floor(Math.random() * 10000)

            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: dummyPass,
                options: { data: { nombre_completo: `${formData.nombre} ${formData.apellido}` } }
            })
            if (authError) throw authError

            if (authData.user) {
                // Actualizamos perfil con datos extra
                await supabase.from('profiles').update({
                    nombre: formData.nombre,
                    apellido: formData.apellido,
                    telefono: formData.telefono,
                    genero: formData.genero,
                    fecha_nacimiento: formData.fecha_nacimiento,
                    etiquetas: formData.etiquetas || [] // Guardar estilos seleccionados
                }).eq('id', authData.user.id)

                toast.success('Alumno creado', { description: `Pass temporal: ${dummyPass}` })
                setIsCreateOpen(false)
                fetchData()
            }
        } catch (error: any) { toast.error(error.message) }
        finally { setSaving(false) }
    }

    // 2. EDITAR ALUMNO + ETIQUETAS
    const handleUpdateAlumno = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedAlumno) return
        setSaving(true)
        try {
            await supabase.from('profiles').update({
                nombre: formData.nombre,
                apellido: formData.apellido,
                telefono: formData.telefono,
                etiquetas: formData.etiquetas // Actualizar tags
            }).eq('id', selectedAlumno.id)
            toast.success('Datos actualizados')
            setIsEditOpen(false)
            fetchData()
        } catch (error) { toast.error('Error al actualizar') }
        finally { setSaving(false) }
    }

    // 3. CARGAR CRÉDITOS (VENDER PACK)
    const handleSellPack = async () => {
        if (!selectedAlumno || !selectedProduct) return
        setSaving(true)
        try {
            const prod = productos.find(p => p.id === selectedProduct)
            if (!prod) throw new Error('Producto no encontrado')

            // A. Registrar en CAJA (Movimiento)
            // NOTA: Asumimos sede actual hardcoded o traída de contexto, aquí simplificado
            const { error: moveError } = await supabase.from('movimientos').insert({
                tipo: 'ingreso',
                categoria: 'venta_pack',
                descripcion: `Venta: ${prod.nombre} a ${selectedAlumno.nombre} ${selectedAlumno.apellido}`,
                monto: prod.precio,
                metodo_pago: 'efectivo', // Ojo: Podrías agregar selector de método pago
                user_id: selectedAlumno.id
            })
            if (moveError) throw moveError

            // B. Sumar Créditos al Alumno
            const nuevosCreditos = (selectedAlumno.creditos || 0) + prod.creditos
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ creditos: nuevosCreditos })
                .eq('id', selectedAlumno.id)
            if (profileError) throw profileError

            toast.success(`Pack cargado! Nuevo saldo: ${nuevosCreditos}`)
            setIsSellOpen(false)
            fetchData()

        } catch (error: any) { toast.error(error.message) }
        finally { setSaving(false) }
    }

    // 5. NEWSLETTER (Copiar Emails)
    const handleCopyEmails = () => {
        const emails = filteredAlumnos.map(a => a.email).filter(e => e).join(', ')
        navigator.clipboard.writeText(emails)
        toast.success(`${filteredAlumnos.length} emails copiados al portapapeles`)
    }

    const toggleEtiquetaForm = (tag: string) => {
        const currentTags = formData.etiquetas || []
        if (currentTags.includes(tag)) {
            setFormData({ ...formData, etiquetas: currentTags.filter((t: string) => t !== tag) })
        } else {
            setFormData({ ...formData, etiquetas: [...currentTags, tag] })
        }
    }

    // Abrir Edit Modal con datos pre-cargados
    const openEdit = (alumno: Alumno) => {
        setSelectedAlumno(alumno)
        setFormData({
            nombre: alumno.nombre, apellido: alumno.apellido,
            telefono: alumno.telefono, etiquetas: alumno.etiquetas || []
        })
        setIsEditOpen(true)
    }

    return (
        <div className="pb-24 px-4 pt-4 h-full flex flex-col">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER MEJORADO: BUSCADOR ALINEADO EN PC */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4 mb-6 border-b border-white/10 pb-6">

                {/* IZQUIERDA: TÍTULO Y FILTROS */}
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Gestión Alumnos</h2>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-[#D4E655] font-bold text-xs tracking-widest uppercase bg-[#D4E655]/10 px-2 py-1 rounded">
                            Total: {filteredAlumnos.length}
                        </span>
                        {/* FILTRO POR ESTILOS */}
                        <div className="relative">
                            <Filter size={14} className="absolute left-2 top-2 text-gray-400" />
                            <select
                                value={filterTag}
                                onChange={(e) => setFilterTag(e.target.value)}
                                className="bg-[#111] border border-white/10 rounded text-xs text-white pl-7 pr-2 py-1.5 outline-none focus:border-[#D4E655]"
                            >
                                <option value="">Todos los Estilos</option>
                                {ESTILOS_DISPONIBLES.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* DERECHA: BUSCADOR + BOTONES (EN PC TODO EN UNA FILA) */}
                <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto md:items-center">

                    {/* BUSCADOR */}
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-3 text-gray-500" size={16} />
                        <input
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-[#111] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white font-bold outline-none focus:border-[#D4E655] text-sm"
                        />
                    </div>

                    {/* BOTONES DE ACCIÓN */}
                    <div className="grid grid-cols-2 md:flex gap-3 w-full md:w-auto">
                        <button
                            onClick={handleCopyEmails}
                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                            title="Copiar Emails (Newsletter)"
                        >
                            <Copy size={18} />
                            <span className="text-xs font-bold uppercase tracking-wide">Copiar Mails</span>
                        </button>

                        <button
                            onClick={() => { setFormData({}); setIsCreateOpen(true) }}
                            className="bg-[#D4E655] text-black font-black uppercase px-4 py-2.5 rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2 text-xs tracking-wide shadow-[0_0_15px_rgba(212,230,85,0.2)] whitespace-nowrap"
                        >
                            <Plus size={18} /> Nuevo Alumno
                        </button>
                    </div>
                </div>
            </div>

            {/* LISTA DE ALUMNOS */}
            {loading ? (
                <div className="flex justify-center p-20"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : (
                <div className="flex-1 overflow-y-auto space-y-2">
                    {filteredAlumnos.map((alumno) => (
                        <div key={alumno.id} className="bg-[#09090b] border border-white/5 hover:border-[#D4E655]/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 group transition-all">

                            {/* INFO PRINCIPAL */}
                            <div className="flex items-center gap-4 flex-1">
                                <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[#D4E655] font-black border border-white/5">
                                    {alumno.nombre?.[0]}{alumno.apellido?.[0]}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-white font-bold">{alumno.nombre} {alumno.apellido}</h3>
                                        {/* ETIQUETAS VISIBLES */}
                                        <div className="flex gap-1">
                                            {alumno.etiquetas?.slice(0, 2).map(tag => (
                                                <span key={tag} className="text-[9px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded uppercase">{tag}</span>
                                            ))}
                                            {(alumno.etiquetas?.length || 0) > 2 && <span className="text-[9px] text-gray-500">+{(alumno.etiquetas?.length || 0) - 2}</span>}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                                        <span className="flex items-center gap-1"><Mail size={10} /> {alumno.email}</span>
                                        <span className="flex items-center gap-1"><Phone size={10} /> {alumno.telefono || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* ESTADO CRÉDITOS */}
                            <div className="flex items-center gap-4">
                                <div className={`px-3 py-1.5 rounded-lg border font-black text-xs uppercase flex items-center gap-2 w-28 justify-center ${(alumno.creditos || 0) > 0 ? 'bg-[#D4E655]/10 text-[#D4E655] border-[#D4E655]/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
                                    }`}>
                                    <CreditCard size={14} /> {alumno.creditos || 0} Cred.
                                </div>

                                {/* ACCIONES */}
                                <div className="flex items-center gap-1 border-l border-white/10 pl-4">
                                    <button onClick={() => { setSelectedAlumno(alumno); setSelectedProduct(''); setIsSellOpen(true) }} className="p-2 bg-[#D4E655] text-black rounded-lg hover:bg-white transition-colors" title="Cargar Crédito">
                                        <ShoppingBag size={16} />
                                    </button>
                                    <button onClick={() => openEdit(alumno)} className="p-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors" title="Editar">
                                        <Edit2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODAL CREAR / EDITAR */}
            {(isCreateOpen || isEditOpen) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => { setIsCreateOpen(false); setIsEditOpen(false) }}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-lg rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-black text-white uppercase mb-4 flex items-center gap-2">
                            {isCreateOpen ? <Plus className="text-[#D4E655]" /> : <Edit2 className="text-[#D4E655]" />}
                            {isCreateOpen ? 'Nuevo Alumno' : 'Editar Datos'}
                        </h3>

                        <form onSubmit={isCreateOpen ? handleCreateAlumno : handleUpdateAlumno} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Nombre</label><input required value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Apellido</label><input required value={formData.apellido || ''} onChange={e => setFormData({ ...formData, apellido: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                            </div>

                            <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Email (Usuario)</label><input type="email" required disabled={isEditOpen} value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655] disabled:opacity-50" /></div>

                            <div className="space-y-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Teléfono</label><input type="tel" value={formData.telefono || ''} onChange={e => setFormData({ ...formData, telefono: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>

                            {/* SELECTOR DE ETIQUETAS (ESTILOS) */}
                            <div className="space-y-2 pt-2 border-t border-white/5 mt-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1"><Tag size={12} /> Intereses / Estilos</label>
                                <div className="flex flex-wrap gap-2">
                                    {ESTILOS_DISPONIBLES.map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleEtiquetaForm(tag)}
                                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border transition-all ${(formData.etiquetas || []).includes(tag)
                                                ? 'bg-[#D4E655] text-black border-[#D4E655]'
                                                : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'
                                                }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button type="submit" disabled={saving} className="w-full bg-[#D4E655] text-black font-black uppercase py-3 rounded-xl hover:bg-white transition-all mt-4 flex justify-center">{saving ? <Loader2 className="animate-spin" /> : 'Guardar'}</button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL VENDER PACK (Cargar Créditos) */}
            {isSellOpen && selectedAlumno && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setIsSellOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-[#D4E655]/10 rounded-full flex items-center justify-center text-[#D4E655] mx-auto mb-3 border border-[#D4E655]/20">
                                <ShoppingBag size={32} />
                            </div>
                            <h3 className="text-xl font-black text-white uppercase">Cargar Créditos</h3>
                            <p className="text-gray-500 text-xs mt-1">Para: <span className="text-white font-bold">{selectedAlumno.nombre} {selectedAlumno.apellido}</span></p>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Seleccionar Producto</label>
                            <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
                                {productos.map(prod => (
                                    <button
                                        key={prod.id}
                                        onClick={() => setSelectedProduct(prod.id)}
                                        className={`flex justify-between items-center p-3 rounded-xl border transition-all ${selectedProduct === prod.id
                                            ? 'bg-[#D4E655]/20 border-[#D4E655] text-white'
                                            : 'bg-[#111] border-white/5 text-gray-400 hover:border-white/20'
                                            }`}
                                    >
                                        <span className="text-xs font-bold uppercase">{prod.nombre}</span>
                                        <div className="text-right">
                                            <div className={`font-black ${selectedProduct === prod.id ? 'text-[#D4E655]' : 'text-white'}`}>${prod.precio}</div>
                                            <div className="text-[9px] uppercase font-bold text-gray-500">+{prod.creditos} Cred</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleSellPack}
                            disabled={!selectedProduct || saving}
                            className="w-full mt-6 bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(212,230,85,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {saving ? <Loader2 className="animate-spin" /> : <>Confirmar Venta <ArrowRight size={16} /></>}
                        </button>
                    </div>
                </div>
            )}

        </div>
    )
}