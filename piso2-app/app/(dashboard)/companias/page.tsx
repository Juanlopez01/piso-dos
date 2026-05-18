'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    Loader2, UsersRound, Plus, Shield, X, UserPlus,
    Trash2, Search, ChevronRight, Lock, Settings2, Save
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import Link from 'next/link'

import {
    crearCompaniaAction,
    eliminarCompaniaAction,
    toggleMiembroCompaniaAction
} from '@/app/actions/companias'

import { actualizarPrecioGlobalAction } from '@/app/actions/liga'
import { useCash } from '@/context/CashContext' // 🚀 IMPORTAMOS EL CONTEXTO GLOBAL

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

    // 🚀 USAMOS EL ROL GLOBAL
    const { userRole, userId, permisosCoordinador } = useCash()

    const [companias, setCompanias] = useState<Compania[]>([])
    const [profesores, setProfesores] = useState<any[]>([])
    const [allAlumnos, setAllAlumnos] = useState<Alumno[]>([])

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isConfigPreciosOpen, setIsConfigPreciosOpen] = useState(false)

    const [selectedCompania, setSelectedCompania] = useState<Compania | null>(null)
    const [miembrosActuales, setMiembrosActuales] = useState<string[]>([])
    const [searchAlumno, setSearchAlumno] = useState('')

    const [searchProf, setSearchProf] = useState('')
    const [procesando, setProcesando] = useState(false)

    const [form, setForm] = useState({ nombre: '', descripcion: '', coordinador_id: '' })
    const [preciosEdit, setPreciosEdit] = useState<Record<string, string>>({})
    const [preciosCompania, setPreciosCompania] = useState<Record<string, number>>({})

    useEffect(() => {
        if (userRole) {
            fetchData()
        }
    }, [userRole])

    const fetchData = async () => {
        setLoading(true)

        if (!userId || !userRole) return

        let queryCompanias = supabase.from('companias').select('*, coordinador:profiles!coordinador_id(nombre_completo)')

        if (userRole === 'profesor') {
            queryCompanias = queryCompanias.eq('coordinador_id', userId)
        } else if (userRole === 'coordinador') {
            // 🚀 EL COORDINADOR SOLO VE LAS COMPAÑÍAS QUE TIENE EN SU LLAVERO
            const companiasIds = permisosCoordinador.filter(p => p !== 'liga');
            if (companiasIds.length > 0) {
                queryCompanias = queryCompanias.in('id', companiasIds);
            } else {
                queryCompanias = queryCompanias.eq('id', '00000000-0000-0000-0000-000000000000'); // No ve nada
            }
        } else if (userRole === 'alumno') {
            const { data: misCompanias } = await supabase.from('perfiles_companias').select('compania_id').eq('perfil_id', userId)
            if (misCompanias && misCompanias.length > 0) {
                const ids = misCompanias.map((mc: { compania_id: string }) => mc.compania_id)
                queryCompanias = queryCompanias.in('id', ids)
            } else {
                queryCompanias = queryCompanias.eq('id', '00000000-0000-0000-0000-000000000000')
            }
        }

        const { data: dataCompanias } = await queryCompanias

        if (dataCompanias) {
            const companiasConConteo = await Promise.all(dataCompanias.map(async (c: { id: string, nombre?: string }) => {
                const { count } = await supabase.from('perfiles_companias').select('*', { count: 'exact', head: true }).eq('compania_id', c.id)
                return { ...c, miembros_count: count || 0 }
            }))
            setCompanias(companiasConConteo)

            // 🚀 CARGAMOS PRECIOS MANUALES EFVO Y TRANSF (Solo admin y recepcion)
            if (['admin', 'recepcion'].includes(userRole)) {
                const clavesCompanias = dataCompanias.flatMap((c: any) => [
                    `cuota_compania_${c.id}_transf`,
                    `cuota_compania_${c.id}_efvo`
                ])
                const { data: config } = await supabase.from('configuraciones').select('*').in('clave', clavesCompanias)
                if (config) {
                    const mapPrecios: any = {}
                    config.forEach((p: any) => mapPrecios[p.clave] = p.valor)
                    setPreciosCompania(mapPrecios)
                }
            }
        }

        if (['admin', 'recepcion'].includes(userRole)) {
            const { data: profes } = await supabase.from('profiles').select('id, nombre_completo').eq('rol', 'profesor').order('nombre_completo')
            if (profes) setProfesores(profes)

            const { data: alumnos } = await supabase.from('profiles').select('id, nombre_completo, email').eq('rol', 'alumno').order('nombre_completo')
            if (alumnos) setAllAlumnos(alumnos)
        }

        // Si es profesor o coordinador, también necesita la lista de alumnos para ver padrón
        if (['profesor', 'coordinador'].includes(userRole) && dataCompanias && dataCompanias.length > 0) {
            const { data: alumnos } = await supabase.from('profiles').select('id, nombre_completo, email').eq('rol', 'alumno').order('nombre_completo')
            if (alumnos) setAllAlumnos(alumnos)
        }

        setLoading(false)
    }

    const handleGuardarPrecios = async () => {
        setProcesando(true)
        try {
            let huboError = false;
            for (const compania of companias) {
                const claves = [`cuota_compania_${compania.id}_transf`, `cuota_compania_${compania.id}_efvo`];

                for (const clave of claves) {
                    const valor = preciosEdit[clave]
                    if (valor !== undefined && valor !== '') {
                        const res = await actualizarPrecioGlobalAction(clave, Number(valor))
                        if (!res.success) huboError = true;
                    }
                }
            }
            if (!huboError) {
                toast.success("Precios actualizados")
                setIsConfigPreciosOpen(false)
                fetchData()
            } else {
                toast.error("Error al guardar algunos precios")
            }
        } catch (e) {
            toast.error("Error de conexión al guardar precios")
        } finally {
            setProcesando(false)
        }
    }

    const handleCrearCompania = async (e: React.FormEvent) => {
        e.preventDefault()
        setProcesando(true)
        const payload = { nombre: form.nombre, descripcion: form.descripcion, coordinador_id: form.coordinador_id || userId! }
        const response = await crearCompaniaAction(payload)

        if (response.success) {
            toast.success('Grupo creado con éxito')
            setIsCreateModalOpen(false)
            setForm({ nombre: '', descripcion: '', coordinador_id: '' })
            setSearchProf('')
            fetchData()
        } else {
            toast.error(response.error || 'Error al crear el grupo')
        }
        setProcesando(false)
    }

    const handleEliminarCompania = async (companiaId: string, nombre: string) => {
        if (!window.confirm(`¿Seguro que querés eliminar el grupo "${nombre}"?`)) return
        setProcesando(true)
        const response = await eliminarCompaniaAction(companiaId)

        if (response.success) { toast.success('Eliminado'); fetchData() }
        else { toast.error(response.error || 'Error al eliminar') }
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

        if (esMiembro) {
            setMiembrosActuales(prev => prev.filter(id => id !== alumnoId))
            setCompanias(prev => prev.map(c => c.id === selectedCompania.id ? { ...c, miembros_count: (c.miembros_count || 1) - 1 } : c))
        } else {
            setMiembrosActuales(prev => [...prev, alumnoId])
            setCompanias(prev => prev.map(c => c.id === selectedCompania.id ? { ...c, miembros_count: (c.miembros_count || 0) + 1 } : c))
        }

        const response = await toggleMiembroCompaniaAction(selectedCompania.id, alumnoId, accion)
        if (response.success) { toast.success(accion === 'agregar' ? 'Alumno agregado' : 'Alumno removido') }
        else { toast.error(response.error || 'Error'); fetchData() }
    }

    // 🚀 RESTAURADO: El coordinador y el auxiliar también pueden agregar/quitar alumnos
    const puedeGestionarAlumnos = (companiaCoordinadorId: string) => {
        if (!userRole) return false;
        return ['admin', 'recepcion', 'auxiliar', 'coordinador'].includes(userRole) || (userRole === 'profesor' && userId === companiaCoordinadorId)
    }

    // 🚀 PROTECCIÓN GENERAL
    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24 selection:bg-blue-500 selection:text-white animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

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
                                Grupos {['admin', 'recepcion', 'profesor', 'auxiliar', 'coordinador'].includes(userRole || '') && <span className="text-gray-500 text-2xl">/ Staff</span>}
                            </h1>
                        </div>

                        {/* 🚀 EL COORDINADOR NO VE LOS BOTONES DE CREAR NI PRECIOS */}
                        {['admin', 'recepcion'].includes(userRole || '') && (
                            <div className="flex gap-2">
                                <button onClick={() => {
                                    const obj: any = {}
                                    companias.forEach(c => {
                                        obj[`cuota_compania_${c.id}_transf`] = preciosCompania[`cuota_compania_${c.id}_transf`] || 15000
                                        obj[`cuota_compania_${c.id}_efvo`] = preciosCompania[`cuota_compania_${c.id}_efvo`] || 13500
                                    })
                                    setPreciosEdit(obj)
                                    setIsConfigPreciosOpen(true)
                                }} className="bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl font-black uppercase text-xs hover:bg-white/10 transition-all flex items-center gap-2">
                                    <Settings2 size={16} /> Precios
                                </button>
                                <button onClick={() => setIsCreateModalOpen(true)} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
                                    <Plus size={16} /> Crear Grupo
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">

                {/* 🚀 CARTEL SI EL ALUMNO O COORDINADOR NO TIENEN GRUPOS */}
                {(!['admin', 'recepcion', 'auxiliar'].includes(userRole || '')) && companias.length === 0 && (
                    <div className="min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
                        <div className="max-w-md w-full bg-[#09090b] border border-blue-500/20 rounded-3xl p-8 text-center relative z-10 animate-in zoom-in-95 duration-500 shadow-2xl shadow-blue-500/5">
                            <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/20"><Lock className="text-blue-500 w-10 h-10" /></div>
                            <h1 className="text-2xl font-black uppercase tracking-tighter text-white mb-3">Acceso Restringido</h1>
                            <p className="text-gray-400 text-sm mb-6 leading-relaxed">Los Grupos Exclusivos son espacios de formación cerrada. Actualmente no estás asignado a ninguno.</p>
                            <Link href={userRole === 'alumno' ? "/explorar" : "/calendario"} className="w-full bg-[#111] text-gray-300 border border-white/10 font-bold uppercase py-4 rounded-xl hover:bg-white hover:text-black transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                {userRole === 'alumno' ? 'Volver a Cartelera' : 'Ir a mi Agenda'} <ChevronRight size={16} />
                            </Link>
                        </div>
                    </div>
                )}

                {/* 🚀 CARTEL PARA ADMIN SI AÚN NO CREÓ GRUPOS */}
                {['admin', 'recepcion', 'auxiliar'].includes(userRole || '') && companias.length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-3xl bg-[#111]/30">
                        <UsersRound size={48} className="text-gray-600 mb-4" />
                        <p className="text-gray-500 font-bold uppercase text-xs">No hay grupos creados aún.</p>
                        {['admin', 'recepcion'].includes(userRole || '') && (
                            <button onClick={() => setIsCreateModalOpen(true)} className="mt-6 bg-blue-600/20 text-blue-400 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2">
                                <Plus size={14} /> Crear el primero
                            </button>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {companias.map((compania) => (
                        <div key={compania.id} className="bg-[#09090b] border border-white/5 rounded-3xl overflow-hidden flex flex-col transition-all group hover:border-blue-500/30 hover:shadow-[0_0_30px_rgba(37,99,235,0.1)] relative">
                            {['admin', 'recepcion'].includes(userRole || '') && (
                                <div className="absolute top-4 right-4 z-20">
                                    <button onClick={(e) => { e.preventDefault(); handleEliminarCompania(compania.id, compania.nombre) }} disabled={procesando} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-colors border border-red-500/20 shadow-lg" title="Eliminar Grupo"><Trash2 size={16} /></button>
                                </div>
                            )}
                            <div className="p-6 border-b border-white/5 relative bg-gradient-to-br from-blue-500/10 to-transparent">
                                <span className="inline-block bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded mb-3">Grupo Exclusivo</span>
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
                                <Link href={`/companias/${compania.id}`} className="w-full bg-blue-600 text-white font-black uppercase py-3.5 rounded-xl hover:bg-blue-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg">
                                    Entrar al Espacio <ChevronRight size={16} />
                                </Link>

                                {puedeGestionarAlumnos(compania.coordinador_id) && (
                                    <button onClick={() => abrirGestionMiembros(compania)} className="w-full bg-white/5 text-white border border-white/10 font-bold uppercase py-3 rounded-xl hover:bg-white/10 transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                        <UserPlus size={14} /> Gestionar Alumnos
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* MODAL CONFIGURACIÓN DE PRECIOS MANUALES (SOLO ADMIN Y RECEP) */}
            {isConfigPreciosOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-2xl rounded-3xl p-8 shadow-2xl relative max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10 shrink-0">
                            <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><Settings2 className="text-blue-500" /> Precios de Grupos</h3>
                            <button onClick={() => setIsConfigPreciosOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>

                        <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                            {companias.map(compania => (
                                <div key={compania.id} className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4">
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest border-b border-white/5 pb-3 mb-2">{compania.nombre}</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Transf / MP ($)</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                                <input
                                                    type="number"
                                                    value={preciosEdit[`cuota_compania_${compania.id}_transf`] || ''}
                                                    onChange={e => setPreciosEdit({ ...preciosEdit, [`cuota_compania_${compania.id}_transf`]: e.target.value })}
                                                    className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-8 pr-3 text-white font-black text-sm outline-none focus:border-blue-500 transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Efectivo ($)</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                                <input
                                                    type="number"
                                                    value={preciosEdit[`cuota_compania_${compania.id}_efvo`] || ''}
                                                    onChange={e => setPreciosEdit({ ...preciosEdit, [`cuota_compania_${compania.id}_efvo`]: e.target.value })}
                                                    className="w-full bg-[#111] border border-blue-500/30 rounded-xl py-3 pl-8 pr-3 text-blue-400 font-black text-sm outline-none focus:border-blue-500 transition-all"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-6 border-t border-white/10 shrink-0 mt-4">
                            <button onClick={handleGuardarPrecios} disabled={procesando} className="w-full bg-blue-600 text-white font-black uppercase py-4 rounded-xl hover:bg-blue-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
                                {procesando ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Actualizar Todos los Precios</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: CREAR GRUPO (SOLO ADMIN Y RECEP) */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsCreateModalOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                            <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><Plus className="text-blue-500" /> Nuevo Grupo</h3>
                            <button onClick={() => setIsCreateModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <form onSubmit={handleCrearCompania} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre del Grupo</label>
                                <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500 transition-colors" placeholder="Ej: Grupo Contemporáneo" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Profesor Coordinador a cargo</label>
                                {form.coordinador_id ? (
                                    <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl transition-all">
                                        <div className="flex items-center gap-2">
                                            <Shield size={16} className="text-blue-400" />
                                            <span className="text-xs font-black text-blue-400 uppercase tracking-widest">
                                                {profesores.find(p => p.id === form.coordinador_id)?.nombre_completo || 'Seleccionado'}
                                            </span>
                                        </div>
                                        <button type="button" onClick={() => setForm({ ...form, coordinador_id: '' })} className="p-1 text-blue-400 hover:text-white bg-blue-500/20 hover:bg-blue-500/40 rounded-lg transition-colors" title="Cambiar profe">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3.5 text-gray-500" size={16} />
                                        <input
                                            type="text"
                                            placeholder="Buscar profesor por nombre..."
                                            value={searchProf}
                                            onChange={e => setSearchProf(e.target.value)}
                                            className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-10 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                                        />

                                        {searchProf.length > 0 && (
                                            <div className="absolute z-20 w-full mt-2 max-h-40 overflow-y-auto bg-[#1a1a1c] border border-white/10 rounded-xl shadow-2xl custom-scrollbar flex flex-col">
                                                {profesores
                                                    .filter(p => p.nombre_completo?.toLowerCase().includes(searchProf.toLowerCase()))
                                                    .map(p => (
                                                        <button key={p.id} type="button" onClick={() => { setForm({ ...form, coordinador_id: p.id }); setSearchProf('') }} className="text-left px-4 py-3 hover:bg-blue-500/20 text-xs font-bold text-gray-300 hover:text-blue-400 uppercase transition-colors border-b border-white/5 last:border-0">
                                                            {p.nombre_completo}
                                                        </button>
                                                    ))
                                                }
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

            {/* MODAL: GESTIONAR MIEMBROS (NO DISPONIBLE PARA AUX Y COORD) */}
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
                                <input type="text" placeholder="Buscar alumno para agregar o quitar..." value={searchAlumno} onChange={(e) => setSearchAlumno(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm outline-none focus:border-blue-500 transition-colors" />
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
                                                <button onClick={() => toggleMiembro(alumno.id)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shrink-0 transition-all ${esMiembro ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20' : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/20'}`}>
                                                    {esMiembro ? 'Remover' : 'Agregar'}
                                                </button>
                                            </div>
                                        )
                                    })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}