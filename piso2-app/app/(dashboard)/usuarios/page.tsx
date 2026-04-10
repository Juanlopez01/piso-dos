'use client'

import { createClient } from '@/utils/supabase/client'
import { useState, Suspense, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    Search, Filter, User, Shield, Briefcase, GraduationCap,
    MessageSquare, Save, Loader2, Tag, X, Phone, UserPlus, Lock, ShieldAlert, CreditCard, Calendar,
    Wallet, Trophy, Star, Snowflake
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { useCash } from '@/context/CashContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// 🚀 IMPORTAMOS LAS SERVER ACTIONS
import {
    cambiarRolAction,
    cambiarLigaAction,
    guardarPerfilAction,
    asignarPackAction,
    cobrarLigaAction
} from '@/app/actions/usuarios'

// --- TIPOS ESTRICTOS ---
type Ritmo = { id: string; nombre: string }
type Producto = { id: string; nombre: string; precio: number; creditos: number; tipo_clase: 'regular' | 'seminario' }

type RPCUsuario = {
    id: string
    nombre_completo: string | null
    email: string
    telefono: string | null
    rol: string
    nivel_liga: number | string | null
    creditos_regulares: number
    creditos_seminarios: number
    staff_observations: string | null
    intereses_ritmos: any
    is_frio: boolean
    intereses_procesados?: string[]
}

type RPCUsuariosData = {
    usuarios: RPCUsuario[] | null
    ritmos: Ritmo[] | null
    productos: Producto[] | null
}

const getInteresesSeguro = (intereses: any): string[] => {
    if (!intereses) return []
    if (Array.isArray(intereses)) return intereses.map(String)
    if (typeof intereses === 'string') {
        try {
            const parsed = JSON.parse(intereses)
            if (Array.isArray(parsed)) return parsed.map(String)
        } catch (e) {
            return [intereses]
        }
    }
    return []
}

// 🚀 EL FETCHER
const fetcher = async () => {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('get_usuarios_completo')

    if (error) throw error

    const typedData = data as unknown as RPCUsuariosData

    const usuariosProcesados = (typedData.usuarios || []).map(u => ({
        ...u,
        intereses_procesados: getInteresesSeguro(u.intereses_ritmos)
    }))

    return {
        usuarios: usuariosProcesados,
        ritmos: typedData.ritmos || [],
        productos: typedData.productos || []
    }
}

function UsuariosContent() {
    const [supabase] = useState(() => createClient())
    const searchParams = useSearchParams()
    const router = useRouter()

    const { userRole, isLoading: loadingContext } = useCash()

    // Filtros
    const [roleFilter, setRoleFilter] = useState(searchParams.get('ver') || 'todos')
    const [interestFilter, setInterestFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('todos')
    const [searchTerm, setSearchTerm] = useState('')

    // Modales y Procesos
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isPackModalOpen, setIsPackModalOpen] = useState(false)
    const [isCobroLigaOpen, setIsCobroLigaOpen] = useState(false)

    const [cobroLigaForm, setCobroLigaForm] = useState({ monto: '', metodo: 'efectivo' })
    const [selectedUser, setSelectedUser] = useState<any>(null)
    const [cambiandoRolId, setCambiandoRolId] = useState<string | null>(null)
    const [cambiandoLigaId, setCambiandoLigaId] = useState<string | null>(null)
    const [assigningPack, setAssigningPack] = useState(false)
    const [creating, setCreating] = useState(false)

    // Forms
    const [editForm, setEditForm] = useState({ obs: '', intereses_ritmos: [] as string[] })
    const [createForm, setCreateForm] = useState({ nombre: '', email: '', dni: '', telefono: '', rol: 'alumno' })
    const [packForm, setPackForm] = useState({ packId: '', monto: '', metodo: 'efectivo' })

    // 🚀 SWR (Limpio, delegando protección al Middleware y SWRProvider global)
    const { data, error, isLoading, mutate } = useSWR('usuarios_completo', fetcher, {
        revalidateOnFocus: false, // Evita recargar al volver de otra pestaña
    })

    useEffect(() => {
        if (error) toast.error('Error al cargar directorio. Revisá tu conexión.')
    }, [error])

    const users = data?.usuarios || []
    const ritmosDisponibles = data?.ritmos || []
    const productos = data?.productos || []

    const filteredUsers = users.filter(u => {
        let matchesRole = true
        if (roleFilter === 'staff' && userRole !== 'admin') return false
        if (roleFilter === 'staff') matchesRole = u.rol === 'admin' || u.rol === 'recepcion'
        else if (roleFilter !== 'todos') matchesRole = u.rol === roleFilter
        else if (userRole !== 'admin' && (u.rol === 'admin' || u.rol === 'recepcion')) matchesRole = false

        const term = searchTerm.toLowerCase()
        const matchesSearch = u.nombre_completo?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)

        let matchesInterest = true
        if ((roleFilter === 'alumno' || roleFilter === 'todos') && interestFilter) {
            matchesInterest = u.intereses_procesados?.includes(String(interestFilter)) || false
        }

        let matchesStatus = true
        if ((roleFilter === 'alumno' || roleFilter === 'todos')) {
            if (statusFilter === 'frios') matchesStatus = u.is_frio
            if (statusFilter === 'activos') matchesStatus = !u.is_frio
        }

        return matchesRole && matchesSearch && matchesInterest && matchesStatus
    })

    const getRitmoNombre = (id: string | number) => {
        const ritmo = ritmosDisponibles.find(r => String(r.id) === String(id))
        return ritmo ? ritmo.nombre : 'Desconocido'
    }

    const cambiarRol = async (usuarioId: string, nuevoRol: string) => {
        if (userRole !== 'admin') return toast.error('No tienes permisos')
        setCambiandoRolId(usuarioId)

        const response = await cambiarRolAction(usuarioId, nuevoRol)
        if (response.success) {
            toast.success('Rol actualizado correctamente')
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al cambiar el rol')
        }
        setCambiandoRolId(null)
    }

    const cambiarNivelLiga = async (usuarioId: string, nuevoNivel: number | null) => {
        const canCreate = userRole === 'admin' || userRole === 'recepcion'
        if (!canCreate) return toast.error('No tienes permisos')
        setCambiandoLigaId(usuarioId)

        const response = await cambiarLigaAction(usuarioId, nuevoNivel)
        if (response.success) {
            toast.success(nuevoNivel ? `Promovido a La Liga (Nivel ${nuevoNivel})` : 'Removido de La Liga')
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al actualizar el nivel')
        }
        setCambiandoLigaId(null)
    }

    // Alta Manual usa API (no hace falta pasarlo a Action porque usa un fetch que ya hace bypass a Supabase Client)
    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)
        try {
            const res = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: createForm.email, password: createForm.dni, nombre: createForm.nombre, rol: createForm.rol, telefono: createForm.telefono })
            })
            const dataRes = await res.json()
            if (!res.ok) throw new Error(dataRes.error || 'Error al crear')

            toast.success(`${createForm.rol === 'profesor' ? 'Profesor' : 'Alumno'} creado correctamente`)
            setIsCreateOpen(false)
            setCreateForm({ nombre: '', email: '', dni: '', telefono: '', rol: 'alumno' })

            router.refresh()
            setTimeout(() => mutate(), 500)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setCreating(false)
        }
    }

    const openEditModal = (user: any) => {
        setSelectedUser(user)
        setEditForm({
            obs: user.staff_observations || '',
            intereses_ritmos: user.intereses_procesados || []
        })
        setIsEditOpen(true)
    }

    const toggleInterest = (ritmoId: string | number) => {
        const strId = String(ritmoId)
        setEditForm(prev => ({
            ...prev,
            intereses_ritmos: prev.intereses_ritmos.includes(strId)
                ? prev.intereses_ritmos.filter(id => id !== strId)
                : [...prev.intereses_ritmos, strId]
        }))
    }

    const handleSaveChanges = async () => {
        if (!selectedUser) return

        const response = await guardarPerfilAction(selectedUser.id, editForm.obs, editForm.intereses_ritmos)
        if (response.success) {
            toast.success('Cambios guardados')
            setIsEditOpen(false)
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al guardar')
        }
    }

    const openPackModal = (user: any) => {
        setSelectedUser(user)
        setPackForm({ packId: '', monto: '', metodo: 'efectivo' })
        setIsPackModalOpen(true)
    }

    const handlePackSelectionChange = (packId: string) => {
        const prod = productos.find(p => p.id === packId)
        setPackForm(prev => ({ ...prev, packId, monto: prod ? prod.precio.toString() : '' }))
    }

    const handleAssignPack = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!packForm.packId || packForm.monto === '') return toast.error('Completá los campos del pack')

        const prod = productos.find(p => p.id === packForm.packId)
        const montoNum = Number(packForm.monto)
        if (!prod) return toast.error('Producto no encontrado')

        setAssigningPack(true)

        try {
            const response = await asignarPackAction(selectedUser.id, prod.tipo_clase, prod.creditos, montoNum, packForm.metodo)

            if (!response.success) throw new Error(response.error)

            toast.success(`Pack asignado correctamente. Créditos actualizados.`)
            setIsPackModalOpen(false)
            router.refresh()
            setTimeout(() => mutate(), 500)
        } catch (error: any) {
            toast.error(error.message || 'Error al asignar el pack')
        } finally {
            setAssigningPack(false)
        }
    }

    const openCobroLigaModal = (user: any) => {
        setSelectedUser(user)
        setCobroLigaForm({ monto: '', metodo: 'efectivo' })
        setIsCobroLigaOpen(true)
    }

    const handleCobrarLigaManual = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!cobroLigaForm.monto) return toast.error('Ingresá el monto a cobrar')

        setAssigningPack(true)

        try {
            const montoNum = Number(cobroLigaForm.monto)
            const response = await cobrarLigaAction(selectedUser.id, montoNum, cobroLigaForm.metodo)

            if (!response.success) throw new Error(response.error)

            toast.success('Cuota de La Liga cobrada exitosamente')
            setIsCobroLigaOpen(false)
            router.refresh()
            setTimeout(() => mutate(), 500)
        } catch (error: any) {
            toast.error(error.message || 'Error al cobrar')
        } finally {
            setAssigningPack(false)
        }
    }

    if ((isLoading && !users.length) || loadingContext) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-10 h-10" /></div>

    const canCreate = userRole === 'admin' || userRole === 'recepcion'
    const isAdmin = userRole === 'admin'

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex flex-col gap-6 mb-8">
                <div className="flex justify-between items-end border-b border-white/10 pb-6">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter text-white leading-none">
                            Directorio
                            {isLoading && <Loader2 size={16} className="inline ml-3 animate-spin text-[#D4E655]" />}
                        </h1>
                        <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Gestión de Usuarios</p>
                    </div>
                    {canCreate && (
                        <button onClick={() => setIsCreateOpen(true)} className="bg-[#D4E655] text-black px-4 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-all flex items-center gap-2 shadow-lg">
                            <UserPlus size={16} /> Nuevo Usuario
                        </button>
                    )}
                </div>

                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div className="bg-[#111] p-1 rounded-xl border border-white/10 flex gap-1 w-full md:w-auto overflow-x-auto">
                        <button onClick={() => { setRoleFilter('todos'); setInterestFilter(''); setStatusFilter('todos') }} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${roleFilter === 'todos' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}><User size={14} /> Todos</button>
                        <button onClick={() => { setRoleFilter('alumno'); setInterestFilter('') }} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${roleFilter === 'alumno' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}><GraduationCap size={14} /> Alumnos</button>
                        <button onClick={() => { setRoleFilter('profesor'); setInterestFilter(''); setStatusFilter('todos') }} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${roleFilter === 'profesor' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}><Briefcase size={14} /> Profesores</button>
                        {isAdmin && (
                            <button onClick={() => { setRoleFilter('staff'); setInterestFilter(''); setStatusFilter('todos') }} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${roleFilter === 'staff' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}><Shield size={14} /> Staff</button>
                        )}
                    </div>
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-3 text-gray-500" size={16} />
                        <input placeholder="Buscar por nombre o email..." className="w-full bg-[#111] border border-white/10 rounded-xl pl-10 p-2.5 text-sm text-white outline-none focus:border-[#D4E655]" onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>

                {(roleFilter === 'alumno' || roleFilter === 'todos') && (
                    <div className="flex flex-col gap-3 pt-2">
                        <div className="flex gap-2 flex-wrap items-center">
                            <div className="flex items-center gap-2 mr-2"><User size={12} className="text-[#D4E655]" /><span className="text-[10px] font-bold text-gray-500 uppercase">Actividad:</span></div>
                            <button onClick={() => setStatusFilter('todos')} className={`text-[9px] font-bold px-3 py-1.5 rounded-lg border uppercase transition-colors ${statusFilter === 'todos' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-600 border-white/10 hover:bg-white/5'}`}>Todos</button>
                            <button onClick={() => setStatusFilter('activos')} className={`text-[9px] font-bold px-3 py-1.5 rounded-lg border uppercase transition-colors ${statusFilter === 'activos' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-transparent text-gray-600 border-white/10 hover:bg-white/5'}`}>Activos</button>
                            <button onClick={() => setStatusFilter('frios')} className={`text-[9px] font-bold px-3 py-1.5 rounded-lg border uppercase transition-colors flex items-center gap-1 ${statusFilter === 'frios' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'bg-transparent text-gray-600 border-white/10 hover:bg-white/5'}`}><Snowflake size={10} /> Fríos</button>
                        </div>

                        {ritmosDisponibles.length > 0 && (
                            <div className="flex gap-2 flex-wrap items-center border-t border-white/5 pt-3">
                                <div className="flex items-center gap-2 mr-2"><Filter size={12} className="text-[#D4E655]" /><span className="text-[10px] font-bold text-gray-500 uppercase">Intereses:</span></div>
                                <button onClick={() => setInterestFilter('')} className={`text-[9px] font-bold px-3 py-1.5 rounded-lg border uppercase transition-colors ${!interestFilter ? 'bg-white text-black border-white' : 'bg-transparent text-gray-600 border-white/10 hover:bg-white/5'}`}>Todos</button>
                                {ritmosDisponibles.map(ritmo => (
                                    <button key={ritmo.id} onClick={() => setInterestFilter(ritmo.id === interestFilter ? '' : ritmo.id)} className={`text-[9px] font-bold px-3 py-1.5 rounded-lg border uppercase transition-colors ${interestFilter === ritmo.id ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-500 border-white/10 hover:bg-white/5'}`}>{ritmo.nombre}</button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredUsers.map((u) => (
                    <div key={u.id} className="bg-[#09090b] border border-white/10 p-5 rounded-2xl flex flex-col justify-between gap-4 group hover:border-[#D4E655]/30 transition-all relative overflow-hidden shadow-sm">

                        {u.is_frio && (
                            <div className="absolute top-0 left-0 px-3 py-1.5 rounded-br-xl bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase tracking-widest flex items-center gap-1 border-r border-b border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                                <Snowflake size={10} className="animate-pulse" /> Frío
                            </div>
                        )}

                        <div className={`absolute top-0 right-0 px-3 py-1.5 rounded-bl-xl text-[8px] font-black uppercase tracking-widest ${u.rol === 'admin' ? 'bg-red-500/20 text-red-500' : u.rol === 'recepcion' ? 'bg-blue-500/20 text-blue-500' : u.rol === 'profesor' ? 'bg-purple-500/20 text-purple-500' : 'bg-white/5 text-gray-500'}`}>
                            {u.rol}
                        </div>

                        <div>
                            <div className="flex items-start gap-4 mb-3 mt-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black uppercase shrink-0 ${u.rol === 'alumno' ? 'bg-white/10 text-white' : 'bg-[#D4E655] text-black'}`}>
                                    {u.nombre_completo?.[0] || '?'}
                                </div>
                                <div className="min-w-0 pr-8">
                                    <h4 className="font-bold text-white uppercase text-sm truncate">{u.nombre_completo}</h4>
                                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{u.email}</p>
                                </div>
                            </div>

                            <div className="space-y-1 mb-2">
                                {u.telefono ? <div className="flex items-center gap-2 text-xs text-gray-400 bg-[#111] px-2 py-1.5 rounded-lg border border-white/5 w-fit"><Phone size={10} className="text-[#D4E655]" /> {u.telefono}</div> : <div className="text-[10px] text-gray-600 italic px-1">Sin teléfono</div>}
                            </div>

                            {u.rol === 'alumno' && (u.nivel_liga === 1 || u.nivel_liga === 2 || u.nivel_liga === '1' || u.nivel_liga === '2') && (
                                <div className="mb-3">
                                    <span className="inline-flex items-center gap-1.5 bg-[#D4E655]/10 text-[#D4E655] border border-[#D4E655]/20 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(212,230,85,0.1)]">
                                        <Trophy size={10} className="text-[#D4E655]" /> La Liga • Nivel {u.nivel_liga}
                                    </span>
                                </div>
                            )}

                            {u.rol === 'alumno' && (
                                <div className="flex gap-2 mb-3">
                                    <div className="bg-white/5 px-2 py-1 rounded text-[10px] text-gray-400 uppercase font-bold">Reg: <span className="text-white text-xs">{u.creditos_regulares || 0}</span></div>
                                    <div className="bg-white/5 px-2 py-1 rounded text-[10px] text-gray-400 uppercase font-bold">Sem: <span className="text-purple-400 text-xs">{u.creditos_seminarios || 0}</span></div>
                                </div>
                            )}

                            {(() => {
                                const interArray = u.intereses_procesados || []
                                if (interArray.length === 0) return null

                                return (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {interArray.slice(0, 3).map((ritmoId: string) => (
                                            <span key={ritmoId} className="text-[8px] bg-white/5 border border-white/5 text-gray-300 px-1.5 py-0.5 rounded uppercase font-bold">
                                                {getRitmoNombre(ritmoId)}
                                            </span>
                                        ))}
                                        {interArray.length > 3 && <span className="text-[8px] text-gray-600 px-1 py-0.5 font-bold">+{interArray.length - 3}</span>}
                                    </div>
                                )
                            })()}

                            {u.staff_observations && canCreate && <div className="bg-yellow-500/5 border border-yellow-500/20 p-2.5 rounded-lg mb-2"><p className="text-[10px] text-yellow-200/70 italic line-clamp-2">"{u.staff_observations}"</p></div>}
                        </div>

                        {canCreate && (
                            <div className="flex flex-col gap-2 mt-auto pt-3 border-t border-white/5">
                                {u.rol === 'alumno' && (
                                    <div className="flex gap-2 w-full mb-2">
                                        <button onClick={() => openPackModal(u)} className="flex-1 py-2 rounded-xl border bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500 hover:text-black text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1.5">
                                            <CreditCard size={12} /> Pack
                                        </button>

                                        {(u.nivel_liga === 1 || u.nivel_liga === 2 || u.nivel_liga === '1' || u.nivel_liga === '2') && (
                                            <button onClick={() => openCobroLigaModal(u)} className="flex-1 py-2 rounded-xl border bg-[#D4E655]/10 text-[#D4E655] border-[#D4E655]/20 hover:bg-[#D4E655] hover:text-black text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(212,230,85,0.05)]">
                                                <Trophy size={12} /> Cuota Liga
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-2 w-full">
                                    <button onClick={() => openEditModal(u)} className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-2 ${u.staff_observations ? 'bg-[#D4E655]/10 text-[#D4E655] border-[#D4E655]/20' : 'bg-[#111] text-gray-500 border-white/5 hover:border-white/20 hover:text-white'}`}>
                                        <MessageSquare size={12} /> Notas / Perfil
                                    </button>

                                    {isAdmin && (
                                        <div className="relative flex-1">
                                            <select
                                                disabled={cambiandoRolId === u.id}
                                                value={u.rol || ''}
                                                onChange={(e) => cambiarRol(u.id, e.target.value)}
                                                className={`w-full h-full py-2.5 px-1 rounded-xl text-[10px] font-black uppercase transition-colors border cursor-pointer outline-none appearance-none text-center ${cambiandoRolId === u.id ? 'bg-[#111] text-gray-600 border-white/5' : 'bg-[#111] text-gray-300 border-white/5 hover:border-white/20 hover:text-white'}`}
                                            >
                                                <option value="admin">Admin</option>
                                                <option value="coordinador">Coordinador</option>
                                                <option value="recepcion">Recep.</option>
                                                <option value="profesor">Profe</option>
                                                <option value="alumno">Alumno</option>
                                            </select>
                                            {cambiandoRolId === u.id && <div className="absolute top-0 right-2 h-full flex items-center"><Loader2 size={12} className="animate-spin text-[#D4E655]" /></div>}
                                        </div>
                                    )}

                                    {u.rol === 'alumno' && (
                                        <div className="relative flex-1">
                                            <select
                                                disabled={cambiandoLigaId === u.id}
                                                value={(u.nivel_liga === 1 || u.nivel_liga === 2 || u.nivel_liga === '1' || u.nivel_liga === '2') ? u.nivel_liga : ''}
                                                onChange={(e) => cambiarNivelLiga(u.id, e.target.value ? Number(e.target.value) : null)}
                                                className={`w-full h-full py-2.5 px-1 rounded-xl text-[10px] font-black uppercase transition-colors border cursor-pointer outline-none appearance-none text-center ${cambiandoLigaId === u.id ? 'bg-[#111] text-gray-600 border-white/5' : (u.nivel_liga === 1 || u.nivel_liga === 2 || u.nivel_liga === '1' || u.nivel_liga === '2') ? 'bg-[#D4E655]/10 text-[#D4E655] border-[#D4E655]/30 hover:border-[#D4E655]' : 'bg-[#111] text-gray-400 border-white/5 hover:border-white/20 hover:text-white'}`}
                                            >
                                                <option value="">Sin Liga</option>
                                                <option value="1">Liga NVL 1</option>
                                                <option value="2">Liga NVL 2</option>
                                            </select>
                                            {cambiandoLigaId === u.id && <div className="absolute top-0 right-2 h-full flex items-center"><Loader2 size={12} className="animate-spin text-[#D4E655]" /></div>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {filteredUsers.length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/10 rounded-2xl">
                        <p className="text-gray-500 font-bold uppercase text-xs">No se encontraron usuarios.</p>
                    </div>
                )}
            </div>

            {/* MODALES */}
            {isEditOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
                        <div className="flex justify-between items-start mb-6 pb-4 border-b border-white/10">
                            <div><h3 className="text-xl font-black text-white uppercase flex items-center gap-2 truncate pr-4">{selectedUser?.nombre_completo}</h3><p className="text-[10px] font-bold text-gray-500 uppercase mt-1">{selectedUser?.email}</p></div>
                            <button onClick={() => setIsEditOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        {selectedUser?.rol === 'alumno' && (
                            <div className="mb-6">
                                <label className="text-[10px] font-bold text-[#D4E655] uppercase block mb-3 flex items-center gap-1"><Tag size={12} /> Intereses (Ritmos)</label>
                                <div className="flex flex-wrap gap-2">
                                    {ritmosDisponibles.map(ritmo => {
                                        const isActive = editForm.intereses_ritmos.includes(String(ritmo.id));
                                        return (
                                            <button key={ritmo.id} onClick={() => toggleInterest(ritmo.id)} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${isActive ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-500 border-white/10 hover:border-white/30'}`}>
                                                {ritmo.nombre}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="mb-6"><label className="text-[10px] font-bold text-[#D4E655] uppercase block mb-3 flex items-center gap-1"><Shield size={12} /> Observaciones Internas</label><textarea className="w-full h-32 bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655] resize-none" placeholder="Escribir nota secreta..." value={editForm.obs} onChange={(e) => setEditForm({ ...editForm, obs: e.target.value })} /></div>
                        <button onClick={handleSaveChanges} className="w-full bg-white text-black font-black uppercase py-4 rounded-xl hover:bg-gray-200 transition-all text-xs tracking-widest flex items-center justify-center gap-2"><Save size={16} /> Guardar Cambios</button>
                    </div>
                </div>
            )}

            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
                        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                            <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><UserPlus className="text-[#D4E655]" /> Alta Manual</h3>
                            <button onClick={() => setIsCreateOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Rol</label>
                                    <select value={createForm.rol} onChange={e => setCreateForm({ ...createForm, rol: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]">
                                        <option value="alumno">Alumno</option>
                                        <option value="profesor">Profesor</option>
                                        <option value="coordinador">Coordinador</option>
                                        {isAdmin && <option value="recepcion">Recepción</option>}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">DNI (Clave)</label>
                                    <input required type="text" value={createForm.dni} onChange={e => setCreateForm({ ...createForm, dni: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" placeholder="12345678" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Nombre Completo</label>
                                <input required value={createForm.nombre} onChange={e => setCreateForm({ ...createForm, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" placeholder="Ej: Juan Perez" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Email (Usuario)</label>
                                <input required type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" placeholder="profe@piso2.com" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Teléfono</label>
                                <input value={createForm.telefono} onChange={e => setCreateForm({ ...createForm, telefono: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]" placeholder="+54 9 11..." />
                            </div>
                            <div className="bg-yellow-500/5 border border-yellow-500/20 p-3 rounded-xl flex items-start gap-2">
                                <ShieldAlert size={14} className="text-yellow-500 mt-0.5 shrink-0" />
                                <p className="text-[10px] text-yellow-200/80 leading-relaxed">El DNI será la contraseña inicial. Solo un Administrador puede crear perfiles de Recepción o Admin por seguridad.</p>
                            </div>
                            <button disabled={creating} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4">
                                {creating ? <Loader2 className="animate-spin" /> : 'Crear Usuario'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {isPackModalOpen && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-2xl p-8 shadow-2xl relative">
                        <div className="flex justify-between items-start mb-6 pb-4 border-b border-white/10">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><CreditCard className="text-[#D4E655]" size={20} /> Cargar Pack</h3>
                                <p className="text-[10px] font-bold text-gray-500 uppercase mt-1">Para: <span className="text-white">{selectedUser.nombre_completo}</span></p>
                            </div>
                            <button onClick={() => setIsPackModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <form onSubmit={handleAssignPack} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Seleccionar Pack</label>
                                <select required value={packForm.packId} onChange={e => handlePackSelectionChange(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655]">
                                    <option value="" disabled>Seleccioná un producto...</option>
                                    {productos.map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre} ({p.creditos} clases) - ${p.precio.toLocaleString()}</option>
                                    ))}
                                </select>
                            </div>
                            {packForm.packId && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Método de Pago</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button type="button" onClick={() => setPackForm({ ...packForm, metodo: 'efectivo' })} className={`p-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${packForm.metodo === 'efectivo' ? 'bg-[#D4E655] border-[#D4E655] text-black font-black' : 'bg-transparent border-white/10 text-gray-500 hover:border-white/30'}`}><Wallet size={16} /> Efectivo</button>
                                        <button type="button" onClick={() => setPackForm({ ...packForm, metodo: 'transferencia' })} className={`p-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${packForm.metodo === 'transferencia' ? 'bg-[#D4E655] border-[#D4E655] text-black font-black' : 'bg-transparent border-white/10 text-gray-500 hover:border-white/30'}`}><CreditCard size={16} /> Transferencia</button>
                                    </div>
                                </div>
                            )}
                            <div className="bg-[#111] border border-white/5 p-4 rounded-xl flex items-start gap-3">
                                <Calendar size={16} className="text-blue-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-white font-bold uppercase tracking-widest mb-1">Vencimiento Automático</p>
                                    <p className="text-[10px] text-gray-400 leading-relaxed">El sistema le otorgará <strong>30 días exactos</strong> a partir de hoy para utilizar estos créditos.</p>
                                </div>
                            </div>
                            <button disabled={assigningPack} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4 shadow-lg">
                                {assigningPack ? <Loader2 className="animate-spin" /> : 'Confirmar Carga'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {isCobroLigaOpen && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-2xl p-8 shadow-2xl relative">
                        <div className="flex justify-between items-start mb-6 pb-4 border-b border-white/10">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><Trophy className="text-[#D4E655]" size={20} /> Cobrar La Liga</h3>
                                <p className="text-[10px] font-bold text-gray-500 uppercase mt-1">Para: <span className="text-white">{selectedUser.nombre_completo}</span></p>
                            </div>
                            <button onClick={() => setIsCobroLigaOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>

                        <form onSubmit={handleCobrarLigaManual} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Monto de la Cuota ($)</label>
                                <input required type="number" value={cobroLigaForm.monto} onChange={e => setCobroLigaForm({ ...cobroLigaForm, monto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655]" placeholder="Ej: 15000" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Método de Pago</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button type="button" onClick={() => setCobroLigaForm({ ...cobroLigaForm, metodo: 'efectivo' })} className={`p-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${cobroLigaForm.metodo === 'efectivo' ? 'bg-[#D4E655] border-[#D4E655] text-black font-black' : 'bg-transparent border-white/10 text-gray-500 hover:border-white/30'}`}>
                                        <Wallet size={16} /> Efectivo
                                    </button>
                                    <button type="button" onClick={() => setCobroLigaForm({ ...cobroLigaForm, metodo: 'transferencia' })} className={`p-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${cobroLigaForm.metodo === 'transferencia' ? 'bg-[#D4E655] border-[#D4E655] text-black font-black' : 'bg-transparent border-white/10 text-gray-500 hover:border-white/30'}`}>
                                        <CreditCard size={16} /> Transf.
                                    </button>
                                </div>
                            </div>

                            <div className="bg-[#111] border border-white/5 p-4 rounded-xl flex items-start gap-3">
                                <Calendar size={16} className="text-[#D4E655] mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-white font-bold uppercase tracking-widest mb-1">Periodo Actual</p>
                                    <p className="text-[10px] text-gray-400 leading-relaxed">Se registrará el pago correspondiente al mes de <strong>{format(new Date(), 'MMMM yyyy', { locale: es })}</strong>.</p>
                                </div>
                            </div>

                            <button disabled={assigningPack} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4 shadow-lg">
                                {assigningPack ? <Loader2 className="animate-spin" /> : 'Confirmar Cobro'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    )
}

export default function UsuariosPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#050505] flex items-center justify-center"><div className="text-[#D4E655] font-black text-xs uppercase animate-pulse">Cargando Directorio...</div></div>}>
            <UsuariosContent />
        </Suspense>
    )
}