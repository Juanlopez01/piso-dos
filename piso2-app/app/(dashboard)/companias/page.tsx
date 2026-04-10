'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    Loader2, UsersRound, Plus, Shield, X, UserPlus,
    Trash2, User, Search, MapPin, ChevronRight, Lock
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import Link from 'next/link'

// 🚀 IMPORTAMOS LAS ACTIONS BLINDADAS
import {
    crearCompaniaAction,
    toggleMiembroCompaniaAction,
    eliminarCompaniaAction // 👈 Agregamos esta
} from '@/app/actions/companias'

type Compania = {
    id: string
    nombre: string
    descripcion: string
    coordinador_id: string
    coordinador?: { nombre_completo: string }
    miembros_count?: number
}

type Alumno = {
    id: string
    nombre_completo: string
    email: string
}

export default function CompaniasPage() {
    const [supabase] = useState(() => createClient())
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState<string>('alumno')
    const [userId, setUserId] = useState<string>('')

    const [companias, setCompanias] = useState<Compania[]>([])
    const [coordinadores, setCoordinadores] = useState<any[]>([])
    const [allAlumnos, setAllAlumnos] = useState<Alumno[]>([])

    // Estados UI
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [selectedCompania, setSelectedCompania] = useState<Compania | null>(null)
    const [miembrosActuales, setMiembrosActuales] = useState<string[]>([])
    const [searchAlumno, setSearchAlumno] = useState('')
    const [searchCoord, setSearchCoord] = useState('')
    const [procesando, setProcesando] = useState(false)

    // Formulario Nueva Compañía
    const [form, setForm] = useState({ nombre: '', descripcion: '', coordinador_id: '' })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)

        // 🚀 BLINDAJE: Usamos getSession para no congelar
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user

        if (!user) return
        setUserId(user.id)

        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
        const rol = profile?.rol || 'alumno'
        setUserRole(rol)

        // 1. Traer las Compañías según el Rol
        let queryCompanias = supabase.from('companias').select('*, coordinador:profiles!coordinador_id(nombre_completo)')

        if (rol === 'coordinador') {
            queryCompanias = queryCompanias.eq('coordinador_id', user.id)
        } else if (rol === 'alumno') {
            const { data: misCompanias } = await supabase.from('perfiles_companias').select('compania_id').eq('perfil_id', user.id)
            if (misCompanias && misCompanias.length > 0) {
                const ids = misCompanias.map((mc: { compania_id: string }) => mc.compania_id)
                queryCompanias = queryCompanias.in('id', ids)
            } else {
                queryCompanias = queryCompanias.eq('id', '00000000-0000-0000-0000-000000000000') // Truco para que venga vacío
            }
        }

        const { data: dataCompanias } = await queryCompanias

        if (dataCompanias) {
            const companiasConConteo = await Promise.all(dataCompanias.map(async (c: { id: string, nombre?: string }) => {
                const { count } = await supabase.from('perfiles_companias').select('*', { count: 'exact', head: true }).eq('compania_id', c.id)
                return { ...c, miembros_count: count || 0 }
            }))
            setCompanias(companiasConConteo)
        }

        // 2. Si es Admin o Coordinador, traemos datos para gestionar
        if (['admin', 'coordinador'].includes(rol)) {
            const { data: coords } = await supabase
                .from('profiles')
                .select('id, nombre_completo')
                .eq('rol', 'coordinador')
                .order('nombre_completo')
            if (coords) setCoordinadores(coords)

            const { data: alumnos } = await supabase.from('profiles').select('id, nombre_completo, email').eq('rol', 'alumno').order('nombre_completo')
            if (alumnos) setAllAlumnos(alumnos)
        }

        setLoading(false)
    }

    const handleCrearCompania = async (e: React.FormEvent) => {
        e.preventDefault()
        setProcesando(true)

        const payload = {
            nombre: form.nombre,
            descripcion: form.descripcion,
            coordinador_id: form.coordinador_id || userId
        }

        const response = await crearCompaniaAction(payload)

        if (response.success) {
            toast.success('Compañía creada con éxito')
            setIsCreateModalOpen(false)
            setForm({ nombre: '', descripcion: '', coordinador_id: '' })
            setSearchCoord('')
            fetchData() // Recargamos para ver la nueva
        } else {
            toast.error(response.error || 'Error al crear la compañía')
        }

        setProcesando(false)
    }
    const handleEliminarCompania = async (companiaId: string, nombre: string) => {
        if (!window.confirm(`¿Estás seguro de que querés eliminar la compañía "${nombre}"? Toda su información se perderá.`)) return

        setProcesando(true)
        const response = await eliminarCompaniaAction(companiaId)

        if (response.success) {
            toast.success('Compañía eliminada correctamente')
            fetchData() // Recargamos la grilla para que desaparezca
        } else {
            toast.error(response.error || 'Error al eliminar')
        }
        setProcesando(false)
    }
    const abrirGestionMiembros = async (compania: Compania) => {
        setSelectedCompania(compania)
        setSearchAlumno('')
        const { data } = await supabase.from('perfiles_companias').select('perfil_id').eq('compania_id', compania.id)
        if (data) setMiembrosActuales(data.map((d: { perfil_id: string }) => d.perfil_id))
    }

    const toggleMiembro = async (alumnoId: string) => {
        if (!selectedCompania) return

        const esMiembro = miembrosActuales.includes(alumnoId)
        const accion = esMiembro ? 'remover' : 'agregar'

        // 🚀 MUTACIÓN OPTIMISTA: Cambiamos la UI al instante
        if (esMiembro) {
            setMiembrosActuales(prev => prev.filter(id => id !== alumnoId))
            setCompanias(prev => prev.map(c => c.id === selectedCompania.id ? { ...c, miembros_count: (c.miembros_count || 1) - 1 } : c))
        } else {
            setMiembrosActuales(prev => [...prev, alumnoId])
            setCompanias(prev => prev.map(c => c.id === selectedCompania.id ? { ...c, miembros_count: (c.miembros_count || 0) + 1 } : c))
        }

        const response = await toggleMiembroCompaniaAction(selectedCompania.id, alumnoId, accion)

        if (response.success) {
            toast.success(accion === 'agregar' ? 'Alumno agregado al grupo' : 'Alumno removido del grupo')
        } else {
            toast.error(response.error || 'Error al modificar miembros')
            // Si falla, revertimos recargando (opcional, pero seguro)
            fetchData()
        }
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    const isAdminOrCoord = ['admin', 'coordinador'].includes(userRole)

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24 selection:bg-[#D4E655] selection:text-black animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER COMPARTIDO */}
            <div className="bg-[#111] border-b border-white/5 pt-8 pb-0 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="max-w-7xl mx-auto px-4 md:px-8">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 relative z-10 pb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <UsersRound className="text-blue-400" size={24} />
                                <span className="text-blue-400 font-bold text-[10px] tracking-[0.3em] uppercase">Grupos Exclusivos</span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none">
                                Compañías {isAdminOrCoord && <span className="text-gray-500 text-2xl">/ Staff</span>}
                            </h1>
                        </div>
                        {isAdminOrCoord && userRole === 'admin' && (
                            <button onClick={() => setIsCreateModalOpen(true)} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                                <Plus size={16} /> Crear Grupo
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">

                {/* VISTA ALUMNO (SIN COMPAÑÍA) */}
                {!isAdminOrCoord && companias.length === 0 && (
                    <div className="min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
                        <div className="max-w-md w-full bg-[#09090b] border border-blue-500/20 rounded-3xl p-8 text-center relative z-10 animate-in zoom-in-95 duration-500 shadow-2xl shadow-blue-500/5">
                            <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/20"><Lock className="text-blue-500 w-10 h-10" /></div>
                            <h1 className="text-2xl font-black uppercase tracking-tighter text-white mb-3">Acceso Restringido</h1>
                            <p className="text-gray-400 text-sm mb-6 leading-relaxed">Las Compañías son grupos cerrados de formación intensiva. Actualmente no pertenecés a ninguna.</p>
                            <Link href="/explorar" className="w-full bg-[#111] text-gray-300 border border-white/10 font-bold uppercase py-4 rounded-xl hover:bg-white hover:text-black transition-all text-xs tracking-widest flex items-center justify-center gap-2">Volver a Cartelera <ChevronRight size={16} /></Link>
                        </div>
                    </div>
                )}

                {/* GRILLA DE COMPAÑÍAS */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {companias.map((compania) => (
                        <div key={compania.id} className="bg-[#09090b] border border-white/5 rounded-3xl overflow-hidden flex flex-col transition-all group hover:border-blue-500/30 hover:shadow-[0_0_30px_rgba(37,99,235,0.1)] relative">
                            {/* BOTÓN DE ELIMINAR (SOLO ADMIN) */}
                            {userRole === 'admin' && (
                                <div className="absolute top-4 right-4 z-20">
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault() // Evita que se disparen otras acciones
                                            handleEliminarCompania(compania.id, compania.nombre)
                                        }}
                                        disabled={procesando}
                                        className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-colors border border-red-500/20 shadow-lg"
                                        title="Eliminar Compañía"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                            <div className="p-6 border-b border-white/5 relative bg-gradient-to-br from-blue-500/10 to-transparent">
                                <span className="inline-block bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded mb-3">Compañía</span>
                                <h3 className="text-2xl font-black text-white uppercase leading-tight mb-1">{compania.nombre}</h3>
                                <p className="text-xs text-gray-400 flex items-center gap-1.5"><Shield size={12} className="text-blue-400" /> Coord: {compania.coordinador?.nombre_completo || 'Staff'}</p>
                            </div>

                            <div className="p-6 flex-1 flex flex-col">
                                <p className="text-sm text-gray-400 leading-relaxed mb-6 italic">"{compania.descripcion || 'Sin descripción'}"</p>

                                <div className="mt-auto flex items-center justify-between pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
                                        <UsersRound size={16} /> {compania.miembros_count} Miembros
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 bg-[#111] border-t border-white/5 flex flex-col gap-3">
                                <Link
                                    href={`/companias/${compania.id}`}
                                    className="w-full bg-blue-600 text-white font-black uppercase py-3.5 rounded-xl hover:bg-blue-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg"
                                >
                                    Entrar al Espacio <ChevronRight size={16} />
                                </Link>

                                {isAdminOrCoord && (
                                    <button
                                        onClick={() => abrirGestionMiembros(compania)}
                                        className="w-full bg-white/5 text-white border border-white/10 font-bold uppercase py-3 rounded-xl hover:bg-white/10 transition-all text-xs tracking-widest flex items-center justify-center gap-2"
                                    >
                                        <UserPlus size={14} /> Gestionar Alumnos
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

            </div>

            {/* ==============================================
                MODAL: CREAR COMPAÑÍA (Solo Admin)
            ============================================== */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsCreateModalOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                            <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><Plus className="text-blue-500" /> Nueva Compañía</h3>
                            <button onClick={() => setIsCreateModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <form onSubmit={handleCrearCompania} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre del Grupo</label>
                                <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500 transition-colors" placeholder="Ej: Compañía Contemporáneo" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Coordinador a cargo</label>

                                {form.coordinador_id ? (
                                    <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl transition-all">
                                        <div className="flex items-center gap-2">
                                            <Shield size={16} className="text-blue-400" />
                                            <span className="text-xs font-black text-blue-400 uppercase tracking-widest">
                                                {coordinadores.find(c => c.id === form.coordinador_id)?.nombre_completo || 'Seleccionado'}
                                            </span>
                                        </div>
                                        <button type="button" onClick={() => setForm({ ...form, coordinador_id: '' })} className="p-1 text-blue-400 hover:text-white bg-blue-500/20 hover:bg-blue-500/40 rounded-lg transition-colors" title="Cambiar coordinador">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3.5 text-gray-500" size={16} />
                                        <input
                                            type="text"
                                            placeholder="Buscar por nombre..."
                                            value={searchCoord}
                                            onChange={e => setSearchCoord(e.target.value)}
                                            className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-10 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                                        />

                                        {searchCoord.length > 0 && (
                                            <div className="absolute z-20 w-full mt-2 max-h-40 overflow-y-auto bg-[#1a1a1c] border border-white/10 rounded-xl shadow-2xl custom-scrollbar flex flex-col">
                                                {coordinadores
                                                    .filter(c => c.nombre_completo?.toLowerCase().includes(searchCoord.toLowerCase()))
                                                    .map(c => (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setForm({ ...form, coordinador_id: c.id })
                                                                setSearchCoord('')
                                                            }}
                                                            className="text-left px-4 py-3 hover:bg-blue-500/20 text-xs font-bold text-gray-300 hover:text-blue-400 uppercase transition-colors border-b border-white/5 last:border-0"
                                                        >
                                                            {c.nombre_completo}
                                                        </button>
                                                    ))
                                                }
                                                {coordinadores.filter(c => c.nombre_completo?.toLowerCase().includes(searchCoord.toLowerCase())).length === 0 && (
                                                    <div className="p-4 text-center text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                                        No se encontraron coordinadores
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Descripción / Foco</label>
                                <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full h-24 bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500 resize-none transition-colors" placeholder="Objetivos del grupo..." />
                            </div>

                            <button disabled={procesando} type="submit" className="w-full bg-blue-600 text-white font-black uppercase py-4 rounded-xl hover:bg-blue-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4">
                                {procesando ? <Loader2 className="animate-spin" /> : 'Crear Grupo'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ==============================================
                MODAL: GESTIONAR MIEMBROS (Staff)
            ============================================== */}
            {selectedCompania && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setSelectedCompania(null)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

                        <div className="p-6 border-b border-white/10 bg-[#111] flex justify-between items-start shrink-0 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                            <div className="relative z-10">
                                <p className="font-bold text-[9px] uppercase tracking-[0.2em] text-blue-400 mb-1">Gestión de Alumnos</p>
                                <h3 className="text-xl md:text-2xl font-black text-white uppercase leading-none">{selectedCompania.nombre}</h3>
                            </div>
                            <button onClick={() => setSelectedCompania(null)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors relative z-10"><X size={20} /></button>
                        </div>

                        <div className="p-4 border-b border-white/5 shrink-0 bg-[#09090b]">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Buscar alumno para agregar o quitar..."
                                    value={searchAlumno}
                                    onChange={(e) => setSearchAlumno(e.target.value)}
                                    className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <div className="space-y-2">
                                {allAlumnos
                                    .filter(a => searchAlumno === '' ? miembrosActuales.includes(a.id) : (a.nombre_completo?.toLowerCase().includes(searchAlumno.toLowerCase()) || a.email?.toLowerCase().includes(searchAlumno.toLowerCase())))
                                    .map(alumno => {
                                        const esMiembro = miembrosActuales.includes(alumno.id)
                                        return (
                                            <div key={alumno.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${esMiembro ? 'bg-blue-500/5 border-blue-500/20' : 'bg-[#111] border-white/5 hover:border-white/20'}`}>
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black uppercase shrink-0 ${esMiembro ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'}`}>
                                                        {alumno.nombre_completo?.[0] || '?'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className={`text-sm font-bold uppercase truncate ${esMiembro ? 'text-white' : 'text-gray-300'}`}>{alumno.nombre_completo}</p>
                                                        <p className="text-[10px] text-gray-500 truncate">{alumno.email}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => toggleMiembro(alumno.id)}
                                                    className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shrink-0 transition-all ${esMiembro ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20' : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/20'}`}
                                                >
                                                    {esMiembro ? 'Remover' : 'Agregar'}
                                                </button>
                                            </div>
                                        )
                                    })}
                                {searchAlumno === '' && miembrosActuales.length === 0 && (
                                    <div className="text-center py-10 opacity-50">
                                        <UsersRound size={32} className="mx-auto mb-3 text-gray-500" />
                                        <p className="text-xs text-gray-400 font-bold uppercase">El grupo está vacío</p>
                                        <p className="text-[10px] text-gray-500 mt-1">Usá el buscador de arriba para agregar alumnos.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}