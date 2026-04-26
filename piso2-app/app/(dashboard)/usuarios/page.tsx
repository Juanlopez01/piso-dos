'use client'

import { createClient } from '@/utils/supabase/client'
import { useState, Suspense, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    Search, Filter, User, Shield, Briefcase, GraduationCap,
    MessageSquare, Save, Loader2, Tag, X, Phone, UserPlus, Lock, ShieldAlert, CreditCard, Calendar,
    Wallet, Trophy, Star, Snowflake, UsersRound, Percent, Camera, IdCard, Mail, Activity, TrendingUp
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { useCash } from '@/context/CashContext'

import {
    cambiarRolAction,
    cambiarLigaAction,
    guardarPerfilAction,
    asignarPackAction,
    cobrarLigaAction,
    cobrarCompaniaAction
} from '@/app/actions/usuarios'

type Ritmo = { id: string; nombre: string }
type Producto = { id: string; nombre: string; precio: number; creditos: number; tipo_clase: 'regular' | 'seminario' | 'exclusivo' }
type CompaniaBasica = { id: string; nombre: string }
type PaseExclusivo = { pase_referencia: string; cantidad: number }

type RPCUsuario = {
    id: string
    nombre_completo: string | null
    email: string
    telefono: string | null
    dni?: string | null
    rol: string
    nivel_liga: number | string | null
    creditos_regulares: number
    staff_observations: string | null
    intereses_ritmos: string | string[] | null
    is_frio: boolean
}

type RPCUsuariosData = {
    usuarios: RPCUsuario[] | null
    ritmos: Ritmo[] | null
    productos: Producto[] | null
}

type UsuarioDirectorio = RPCUsuario & {
    intereses_procesados: string[]
    porcentaje_beca_liga: number
    porcentaje_beca_compania: number
    companias: CompaniaBasica[]
    creditos_especiales: number
    pases_exclusivos: PaseExclusivo[]
    avatar_url: string | null
}

const getInteresesSeguro = (intereses: string | string[] | null | undefined): string[] => {
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

const fetcher = async (): Promise<{ usuarios: UsuarioDirectorio[], ritmos: Ritmo[], productos: Producto[] }> => {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('get_usuarios_completo')
    if (error) throw error
    const typedData = data as unknown as RPCUsuariosData

    const { data: pcData } = await supabase.from('perfiles_companias').select('perfil_id, compania:companias(id, nombre)')

    // 🚀 AHORA PEDIMOS LAS DOS BECAS POR SEPARADO
    const { data: extraProfileData } = await supabase.from('profiles').select('id, porcentaje_beca_liga, porcentaje_beca_compania, creditos_especiales, avatar_url, dni')
    const { data: pasesData } = await supabase.from('pases_exclusivos').select('usuario_id, pase_referencia, cantidad')

    const usuariosProcesados: UsuarioDirectorio[] = (typedData.usuarios || []).map((u: RPCUsuario) => {
        const misCompanias = pcData?.filter((pc: any) => pc.perfil_id === u.id).map((pc: any) => pc.compania as unknown as CompaniaBasica) || []
        const extraData = extraProfileData?.find((p: any) => p.id === u.id)
        const misPases = pasesData?.filter((p: any) => p.usuario_id === u.id) || []

        return {
            ...u,
            dni: extraData?.dni || null,
            intereses_procesados: getInteresesSeguro(u.intereses_ritmos),
            companias: misCompanias,
            porcentaje_beca_liga: extraData?.porcentaje_beca_liga || 0,
            porcentaje_beca_compania: extraData?.porcentaje_beca_compania || 0,
            creditos_especiales: extraData?.creditos_especiales || 0,
            pases_exclusivos: misPases,
            avatar_url: extraData?.avatar_url || null
        }
    })

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

    const [roleFilter, setRoleFilter] = useState(searchParams.get('ver') || 'todos')
    const [interestFilter, setInterestFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('todos')
    const [searchTerm, setSearchTerm] = useState('')

    const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false)
    const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false)
    const [isPackModalOpen, setIsPackModalOpen] = useState<boolean>(false)
    const [isCobroLigaOpen, setIsCobroLigaOpen] = useState<boolean>(false)
    const [isCobroCompaniaOpen, setIsCobroCompaniaOpen] = useState<boolean>(false)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)

    const [selectedUser, setSelectedUser] = useState<UsuarioDirectorio | null>(null)
    const [cambiandoRolId, setCambiandoRolId] = useState<string | null>(null)
    const [cambiandoLigaId, setCambiandoLigaId] = useState<string | null>(null)
    const [assigningPack, setAssigningPack] = useState<boolean>(false)
    const [creating, setCreating] = useState<boolean>(false)

    const [userStats, setUserStats] = useState<any>(null)
    const [loadingStats, setLoadingStats] = useState(false)

    const [cobroLigaForm, setCobroLigaForm] = useState({ monto: '', metodo: 'efectivo' })
    const [cobroCompaniaForm, setCobroCompaniaForm] = useState({ monto: '', metodo: 'efectivo', companiaId: '' })

    // 🚀 FORMULARIO DE EDICIÓN ACTUALIZADO CON LAS DOS BECAS
    const [editForm, setEditForm] = useState({ obs: '', intereses_ritmos: [] as string[], becaLiga: 0, becaCompania: 0 })

    const [createForm, setCreateForm] = useState({ nombre: '', email: '', dni: '', telefono: '', rol: 'alumno' })
    const [packForm, setPackForm] = useState({ packId: '', monto: '', metodo: 'efectivo' })

    const { data, error, isLoading, mutate } = useSWR('usuarios_completo', fetcher, { revalidateOnFocus: false })

    useEffect(() => {
        if (error) toast.error('Error al cargar directorio. Revisá tu conexión.')
    }, [error])

    const users = data?.usuarios || []
    const ritmosDisponibles = data?.ritmos || []
    const productos = data?.productos || []

    const filteredUsers = users.filter((u: UsuarioDirectorio) => {
        let matchesRole = true
        if (roleFilter === 'staff' && userRole !== 'admin') return false
        if (roleFilter === 'staff') matchesRole = u.rol === 'admin' || u.rol === 'recepcion'
        else if (roleFilter !== 'todos') matchesRole = u.rol === roleFilter
        else if (userRole !== 'admin' && (u.rol === 'admin' || u.rol === 'recepcion')) matchesRole = false

        const term = searchTerm.toLowerCase()
        const matchesSearch = (u.nombre_completo?.toLowerCase().includes(term) || false) || (u.email.toLowerCase().includes(term))

        let matchesInterest = true
        if ((roleFilter === 'alumno' || roleFilter === 'todos') && interestFilter) {
            matchesInterest = u.intereses_procesados.includes(String(interestFilter))
        }

        let matchesStatus = true
        if ((roleFilter === 'alumno' || roleFilter === 'todos')) {
            if (statusFilter === 'frios') matchesStatus = u.is_frio
            if (statusFilter === 'activos') matchesStatus = !u.is_frio
        }

        return matchesRole && matchesSearch && matchesInterest && matchesStatus
    })

    const getRitmoNombre = (id: string | number): string => {
        const ritmo = ritmosDisponibles.find(r => String(r.id) === String(id))
        return ritmo ? ritmo.nombre : 'Desconocido'
    }

    const cambiarRol = async (usuarioId: string, nuevoRol: string) => {
        if (userRole !== 'admin') return toast.error('No tienes permisos')
        setCambiandoRolId(usuarioId)
        const response = await cambiarRolAction(usuarioId, nuevoRol)
        if (response.success) { toast.success('Rol actualizado'); mutate() }
        else { toast.error(response.error) }
        setCambiandoRolId(null)
    }

    const cambiarNivelLiga = async (usuarioId: string, nuevoNivel: number | null) => {
        if (!['admin', 'recepcion'].includes(userRole as string)) return toast.error('No tienes permisos')
        setCambiandoLigaId(usuarioId)
        const response = await cambiarLigaAction(usuarioId, nuevoNivel)
        if (response.success) { toast.success('Nivel de liga actualizado'); mutate() }
        else { toast.error(response.error) }
        setCambiandoLigaId(null)
    }

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

            toast.success(`Usuario creado correctamente`)
            setIsCreateOpen(false)
            setCreateForm({ nombre: '', email: '', dni: '', telefono: '', rol: 'alumno' })
            mutate()
        } catch (error: unknown) {
            if (error instanceof Error) toast.error(error.message)
            else toast.error('Error desconocido')
        } finally {
            setCreating(false)
        }
    }

    const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>, userId: string) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploadingAvatar(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${userId}-${Math.random()}.${fileExt}`
            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file)
            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
            const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId)
            if (updateError) throw updateError

            toast.success('Foto de perfil actualizada')
            mutate()
            if (selectedUser && selectedUser.id === userId) {
                setSelectedUser({ ...selectedUser, avatar_url: publicUrl })
            }
        } catch (err: any) {
            toast.error(err.message || 'Error al subir foto')
        } finally {
            setUploadingAvatar(false)
        }
    }

    const openDetailModal = async (user: UsuarioDirectorio) => {
        setSelectedUser(user)
        setUserStats(null)
        setEditForm({
            obs: user.staff_observations || '',
            intereses_ritmos: user.intereses_procesados || [],
            becaLiga: user.porcentaje_beca_liga || 0,
            becaCompania: user.porcentaje_beca_compania || 0
        })
        setIsDetailOpen(true)
        setLoadingStats(true)

        try {
            const { data: stats, error } = await supabase.rpc('get_user_metrics_v2', {
                p_id: user.id,
                p_role: user.rol
            })

            if (error) throw error;
            if (stats) setUserStats(stats);

        } catch (error: any) {
            console.error("Error al cargar métricas:", error);
            toast.error("No se pudieron cargar las estadísticas.");
        }

        setLoadingStats(false)
    }

    const toggleInterest = (ritmoId: string | number) => {
        const strId = String(ritmoId)
        setEditForm(prev => ({
            ...prev,
            intereses_ritmos: prev.intereses_ritmos.includes(strId) ? prev.intereses_ritmos.filter(id => id !== strId) : [...prev.intereses_ritmos, strId]
        }))
    }

    const handleSaveChanges = async () => {
        if (!selectedUser) return

        // 🚀 AHORA MANDAMOS LAS BECAS AL GUARDAR
        const response = await guardarPerfilAction(
            selectedUser.id,
            editForm.obs,
            editForm.intereses_ritmos,
            editForm.becaLiga,
            editForm.becaCompania
        )

        if (response.success) { toast.success('Ficha guardada'); mutate() }
        else { toast.error(response.error) }
    }

    const openPackModal = (user: UsuarioDirectorio) => {
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
        if (!packForm.packId || packForm.monto === '') return toast.error('Completá los campos')
        const prod = productos.find(p => p.id === packForm.packId)
        if (!prod) return toast.error('Producto no encontrado')
        setAssigningPack(true)
        try {
            const response = await asignarPackAction(selectedUser!.id, prod.tipo_clase, prod.creditos, Number(packForm.monto), packForm.metodo)
            if (!response.success) throw new Error(response.error)
            toast.success(`Pack asignado.`)
            setIsPackModalOpen(false)
            mutate()
        } catch (error: unknown) {
            if (error instanceof Error) toast.error(error.message)
        } finally {
            setAssigningPack(false)
        }
    }

    const openCobroLigaModal = (user: UsuarioDirectorio) => {
        setSelectedUser(user)
        setCobroLigaForm({ monto: '', metodo: 'efectivo' })
        setIsCobroLigaOpen(true)
    }

    const handleCobrarLigaManual = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!cobroLigaForm.monto || !selectedUser) return toast.error('Ingresá el monto a cobrar')
        setAssigningPack(true)
        try {
            // 🚀 USA LA BECA DE LIGA Específica
            const descuentoBeca = (Number(cobroLigaForm.monto) * (selectedUser.porcentaje_beca_liga || 0)) / 100;
            const montoFinal = Number(cobroLigaForm.monto) - descuentoBeca;

            const response = await cobrarLigaAction(selectedUser.id, montoFinal, cobroLigaForm.metodo)
            if (!response.success) throw new Error(response.error)
            toast.success('Cuota cobrada exitosamente')
            setIsCobroLigaOpen(false)
            mutate()
        } catch (error: unknown) {
            if (error instanceof Error) toast.error(error.message)
        } finally {
            setAssigningPack(false)
        }
    }

    const openCobroCompaniaModal = (user: UsuarioDirectorio) => {
        setSelectedUser(user)
        setCobroCompaniaForm({
            monto: '',
            metodo: 'efectivo',
            companiaId: user.companias.length === 1 ? user.companias[0].id : ''
        })
        setIsCobroCompaniaOpen(true)
    }

    const handleCobrarCompaniaManual = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!cobroCompaniaForm.monto || !cobroCompaniaForm.companiaId || !selectedUser) return toast.error('Completá el monto y la compañía')
        setAssigningPack(true)
        try {
            // 🚀 USA LA BECA DE COMPAÑÍA Específica
            const descuentoBeca = (Number(cobroCompaniaForm.monto) * (selectedUser.porcentaje_beca_compania || 0)) / 100;
            const montoFinal = Number(cobroCompaniaForm.monto) - descuentoBeca;

            const response = await cobrarCompaniaAction(selectedUser.id, cobroCompaniaForm.companiaId, montoFinal, cobroCompaniaForm.metodo)
            if (!response.success) throw new Error(response.error)
            toast.success('Cuota de Compañía cobrada')
            setIsCobroCompaniaOpen(false)
            mutate()
        } catch (error: unknown) {
            if (error instanceof Error) toast.error(error.message)
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
                {filteredUsers.map((u: UsuarioDirectorio) => {
                    const totalPasesExclusivos = u.pases_exclusivos?.reduce((acc, p) => acc + p.cantidad, 0) || 0;

                    return (
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
                                    {u.avatar_url ? (
                                        <img src={u.avatar_url} alt={u.nombre_completo || ''} className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/10" />
                                    ) : (
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black uppercase shrink-0 ${u.rol === 'alumno' ? 'bg-white/10 text-white' : 'bg-[#D4E655] text-black'}`}>
                                            {u.nombre_completo?.[0] || '?'}
                                        </div>
                                    )}
                                    <div className="min-w-0 pr-8">
                                        <h4 onClick={() => openDetailModal(u)} className="font-bold text-white uppercase text-sm truncate cursor-pointer hover:text-[#D4E655] transition-colors">{u.nombre_completo}</h4>
                                        <p className="text-[10px] text-gray-500 truncate mt-0.5">{u.email}</p>
                                    </div>
                                </div>

                                <div className="space-y-1 mb-2">
                                    {u.telefono ? <div className="flex items-center gap-2 text-xs text-gray-400 bg-[#111] px-2 py-1.5 rounded-lg border border-white/5 w-fit"><Phone size={10} className="text-[#D4E655]" /> {u.telefono}</div> : <div className="text-[10px] text-gray-600 italic px-1">Sin teléfono</div>}
                                </div>

                                <div className="flex flex-wrap gap-2 mb-3">
                                    {u.rol === 'alumno' && (u.nivel_liga === 1 || u.nivel_liga === 2 || u.nivel_liga === '1' || u.nivel_liga === '2') && (
                                        <span className="inline-flex items-center gap-1.5 bg-[#D4E655]/10 text-[#D4E655] border border-[#D4E655]/20 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">
                                            <Trophy size={10} className="text-[#D4E655]" /> Liga • NVL {u.nivel_liga}
                                        </span>
                                    )}
                                    {u.companias && u.companias.length > 0 && (
                                        <span className="inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">
                                            <UsersRound size={10} /> {u.companias.length} Grupo{u.companias.length > 1 ? 's' : ''}
                                        </span>
                                    )}

                                    {/* 🚀 ETIQUETAS DE BECAS SEPARADAS */}
                                    {(u.porcentaje_beca_liga ?? 0) > 0 && (
                                        <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">
                                            <Percent size={10} /> Beca Liga {u.porcentaje_beca_liga}%
                                        </span>
                                    )}
                                    {(u.porcentaje_beca_compania ?? 0) > 0 && (
                                        <span className="inline-flex items-center gap-1.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">
                                            <Percent size={10} /> Beca Grupo {u.porcentaje_beca_compania}%
                                        </span>
                                    )}
                                </div>

                                {u.rol === 'alumno' && (
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        <div className="bg-white/5 px-2 py-1 rounded text-[10px] text-gray-400 uppercase font-bold border border-white/5">Reg: <span className="text-white text-xs">{u.creditos_regulares || 0}</span></div>
                                        <div className="bg-white/5 px-2 py-1 rounded text-[10px] text-gray-400 uppercase font-bold border border-white/5">Esp: <span className="text-purple-400 text-xs">{u.creditos_especiales || 0}</span></div>
                                        {totalPasesExclusivos > 0 && (
                                            <div className="bg-white/5 px-2 py-1 rounded text-[10px] text-gray-400 uppercase font-bold border border-white/5" title="Pases Exclusivos">
                                                Exc: <span className="text-blue-400 text-xs">{totalPasesExclusivos}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {u.intereses_procesados.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {u.intereses_procesados.slice(0, 3).map((ritmoId: string) => (
                                            <span key={ritmoId} className="text-[8px] bg-[#111] border border-white/10 text-gray-400 px-1.5 py-0.5 rounded uppercase font-bold">
                                                {getRitmoNombre(ritmoId)}
                                            </span>
                                        ))}
                                        {u.intereses_procesados.length > 3 && <span className="text-[8px] text-gray-600 px-1 py-0.5 font-bold">+{u.intereses_procesados.length - 3}</span>}
                                    </div>
                                )}
                            </div>

                            {canCreate && (
                                <div className="flex flex-col gap-2 mt-auto pt-3 border-t border-white/5">
                                    {u.rol === 'alumno' && (
                                        <div className="flex flex-wrap gap-2 w-full mb-2">
                                            <button onClick={() => openPackModal(u)} className="flex-1 py-2 rounded-xl border bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500 hover:text-black text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1.5">
                                                <CreditCard size={12} /> Pack
                                            </button>

                                            {(u.nivel_liga === 1 || u.nivel_liga === 2 || u.nivel_liga === '1' || u.nivel_liga === '2') && (
                                                <button onClick={() => openCobroLigaModal(u)} className="flex-1 py-2 rounded-xl border bg-[#D4E655]/10 text-[#D4E655] border-[#D4E655]/20 hover:bg-[#D4E655] hover:text-black text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(212,230,85,0.05)]">
                                                    <Trophy size={12} /> C. Liga
                                                </button>
                                            )}

                                            {u.companias && u.companias.length > 0 && (
                                                <button onClick={() => openCobroCompaniaModal(u)} className="flex-1 py-2 rounded-xl border bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500 hover:text-white text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1.5">
                                                    <UsersRound size={12} /> C. Grupo
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex gap-2 w-full flex-wrap">
                                        <button onClick={() => openDetailModal(u)} className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-2 ${u.staff_observations ? 'bg-[#D4E655]/10 text-[#D4E655] border-[#D4E655]/20' : 'bg-[#111] text-gray-400 border-white/5 hover:border-white/20 hover:text-white'}`}>
                                            <IdCard size={14} /> Ficha Completa
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
                                                    <option value="1">Liga Nvl 1</option>
                                                    <option value="2">Liga Nvl 2</option>
                                                </select>
                                                {cambiandoLigaId === u.id && <div className="absolute top-0 right-2 h-full flex items-center"><Loader2 size={12} className="animate-spin text-[#D4E655]" /></div>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filteredUsers.length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/10 rounded-2xl">
                        <p className="text-gray-500 font-bold uppercase text-xs">No se encontraron usuarios.</p>
                    </div>
                )}
            </div>

            {/* FICHA DETALLADA DEL ALUMNO/PROFESOR */}
            {isDetailOpen && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in overflow-y-auto">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl relative my-auto flex flex-col md:flex-row">

                        <button onClick={() => setIsDetailOpen(false)} className="absolute top-6 right-6 z-10 p-2 bg-black/50 backdrop-blur-md rounded-full text-gray-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>

                        <div className="w-full md:w-1/3 bg-[#111] border-r border-white/5 p-8 flex flex-col items-center border-b md:border-b-0">
                            <div className="relative group mb-6">
                                <div className={`w-32 h-32 rounded-3xl overflow-hidden bg-white/5 border-2 border-white/10 flex items-center justify-center text-4xl font-black uppercase text-gray-500 shadow-xl transition-all ${uploadingAvatar ? 'opacity-50' : 'group-hover:border-[#D4E655]'}`}>
                                    {selectedUser.avatar_url ? (
                                        <img src={selectedUser.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        selectedUser.nombre_completo?.[0] || '?'
                                    )}
                                </div>
                                <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-3xl text-[#D4E655]">
                                    {uploadingAvatar ? <Loader2 className="animate-spin" /> : <><Camera size={24} className="mb-2" /><span className="text-[10px] font-black uppercase tracking-widest">Cambiar</span></>}
                                    <input type="file" accept="image/*" className="hidden" disabled={uploadingAvatar} onChange={(e) => handleUploadAvatar(e, selectedUser.id)} />
                                </label>
                            </div>

                            <h3 className="text-xl font-black text-white uppercase text-center mb-1 leading-tight">{selectedUser.nombre_completo}</h3>
                            <span className="bg-[#D4E655]/10 text-[#D4E655] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">
                                Rol: {selectedUser.rol}
                            </span>

                            <div className="w-full space-y-4">
                                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                                    <IdCard size={16} className="text-gray-500" />
                                    <div><p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">DNI / Documento</p><p className="text-xs text-white font-bold">{selectedUser.dni || 'No registrado'}</p></div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                                    <Mail size={16} className="text-gray-500" />
                                    <div className="overflow-hidden"><p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Email</p><p className="text-xs text-white font-bold truncate">{selectedUser.email}</p></div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                                    <Phone size={16} className="text-gray-500" />
                                    <div><p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Teléfono</p><p className="text-xs text-white font-bold">{selectedUser.telefono || 'No registrado'}</p></div>
                                </div>
                            </div>
                        </div>

                        <div className="w-full md:w-2/3 p-8 flex flex-col h-full bg-[#09090b]">

                            {selectedUser.rol === 'alumno' && (
                                <>
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                                        <CreditCard size={16} className="text-[#D4E655]" /> Estado de Cuenta
                                    </h4>

                                    <div className="grid grid-cols-3 gap-3 mb-6">
                                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-1">Regulares</span>
                                            <span className="text-3xl font-black text-white">{selectedUser.creditos_regulares}</span>
                                        </div>
                                        <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1">Especiales</span>
                                            <span className="text-3xl font-black text-white">{selectedUser.creditos_especiales}</span>
                                        </div>
                                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">Exclusivos</span>
                                            <span className="text-3xl font-black text-white">{selectedUser.pases_exclusivos.reduce((a, p) => a + p.cantidad, 0)}</span>
                                        </div>
                                    </div>

                                    {/* 🚀 FORMULARIOS DE BECAS INDEPENDIENTES */}
                                    <div className="grid grid-cols-2 gap-4 mb-8">
                                        <div className="bg-[#111] border border-emerald-500/20 rounded-xl p-4">
                                            <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-2">Beca La Liga (%)</label>
                                            <input type="number" min="0" max="100" value={editForm.becaLiga} onChange={e => setEditForm({ ...editForm, becaLiga: Number(e.target.value) })} className="w-full bg-black border border-white/10 rounded-lg p-2 text-white text-sm font-black outline-none focus:border-emerald-500 text-center" />
                                        </div>
                                        <div className="bg-[#111] border border-teal-500/20 rounded-xl p-4">
                                            <label className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block mb-2">Beca Compañía (%)</label>
                                            <input type="number" min="0" max="100" value={editForm.becaCompania} onChange={e => setEditForm({ ...editForm, becaCompania: Number(e.target.value) })} className="w-full bg-black border border-white/10 rounded-lg p-2 text-white text-sm font-black outline-none focus:border-teal-500 text-center" />
                                        </div>
                                    </div>
                                </>
                            )}

                            <h4 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-white/5 pb-2 mt-2">
                                <Activity size={16} className="text-[#D4E655]" /> Métricas de Rendimiento
                            </h4>

                            <div className="mb-8">
                                {loadingStats ? (
                                    <div className="flex items-center justify-center py-6 border border-dashed border-white/10 rounded-2xl">
                                        <Loader2 className="animate-spin text-[#D4E655]" />
                                    </div>
                                ) : userStats ? (
                                    selectedUser.rol === 'profesor' ? (
                                        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Total Clases Dictadas</p>
                                                <p className="text-sm text-gray-500 font-bold">Histórico registrado en sistema</p>
                                            </div>
                                            <div className="text-4xl font-black text-[#D4E655]">{userStats.clases_dadas_historico || 0}</div>
                                        </div>
                                    ) : selectedUser.rol === 'alumno' ? (
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            <div className="bg-[#111] border border-white/10 rounded-2xl p-4">
                                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Anotadas</p>
                                                <div className="text-2xl font-black text-white">{userStats.total_anotadas || 0}</div>
                                            </div>
                                            <div className="bg-[#111] border border-white/10 rounded-2xl p-4">
                                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Asistencias</p>
                                                <div className="text-2xl font-black text-white">{userStats.asistencias || 0}</div>
                                            </div>
                                            <div className="col-span-2 md:col-span-1 bg-[#D4E655]/10 border border-[#D4E655]/30 rounded-2xl p-4 flex flex-col items-center justify-center">
                                                <p className="text-[10px] text-[#D4E655] font-black uppercase tracking-widest mb-1">Presentismo</p>
                                                <div className="text-2xl font-black text-[#D4E655]">{userStats.porcentaje_presentismo || 0}%</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-500 italic">No hay métricas disponibles para este rol.</p>
                                    )
                                ) : (
                                    <p className="text-xs text-gray-500">Error al cargar estadísticas.</p>
                                )}
                            </div>

                            {selectedUser.rol === 'alumno' && (
                                <>
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                                        <Tag size={16} className="text-[#D4E655]" /> Intereses Coreográficos
                                    </h4>
                                    <div className="flex flex-wrap gap-2 mb-8">
                                        {ritmosDisponibles.map(ritmo => {
                                            const isActive = editForm.intereses_ritmos.includes(String(ritmo.id));
                                            return (
                                                <button key={ritmo.id} onClick={() => toggleInterest(ritmo.id)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${isActive ? 'bg-[#D4E655] text-black border-[#D4E655] shadow-lg shadow-[#D4E655]/20' : 'bg-[#111] text-gray-500 border-white/5 hover:border-white/30'}`}>
                                                    {ritmo.nombre}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </>
                            )}

                            <h4 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-white/5 pb-2 mt-auto">
                                <Shield size={16} className="text-yellow-500" /> Notas Confidenciales (Staff)
                            </h4>
                            <textarea
                                className="w-full flex-1 min-h-[120px] bg-[#111] border border-white/10 rounded-2xl p-5 text-white text-sm outline-none focus:border-yellow-500/50 resize-none transition-colors"
                                placeholder="Escribir observaciones internas, lesiones, consideraciones..."
                                value={editForm.obs}
                                onChange={(e) => setEditForm({ ...editForm, obs: e.target.value })}
                            />

                            <button onClick={handleSaveChanges} className="w-full mt-6 bg-white text-black font-black uppercase py-4 rounded-xl hover:bg-gray-200 transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl shrink-0">
                                <Save size={16} /> Guardar Cambios en Ficha
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODALES VIEJOS SE MANTIENEN (Create, Pack, Cobros) */}
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
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Monto Base de la Cuota ($)</label>
                                <input required type="number" value={cobroLigaForm.monto} onChange={e => setCobroLigaForm({ ...cobroLigaForm, monto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655]" placeholder="Ej: 15000" />
                            </div>

                            {selectedUser.porcentaje_beca_liga > 0 && cobroLigaForm.monto && (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex flex-col gap-2">
                                    <div className="flex justify-between text-xs text-gray-400"><span>Monto Base:</span><span>${Number(cobroLigaForm.monto).toLocaleString()}</span></div>
                                    <div className="flex justify-between text-xs text-emerald-400 font-bold"><span>Beca Liga ({selectedUser.porcentaje_beca_liga}%):</span><span>- ${((Number(cobroLigaForm.monto) * selectedUser.porcentaje_beca_liga) / 100).toLocaleString()}</span></div>
                                    <div className="h-px bg-white/10 my-1"></div>
                                    <div className="flex justify-between text-lg text-white font-black"><span>Total a Cobrar:</span><span>${(Number(cobroLigaForm.monto) - ((Number(cobroLigaForm.monto) * selectedUser.porcentaje_beca_liga) / 100)).toLocaleString()}</span></div>
                                </div>
                            )}

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

                            <button disabled={assigningPack} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4 shadow-lg">
                                {assigningPack ? <Loader2 className="animate-spin" /> : 'Confirmar Cobro'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {isCobroCompaniaOpen && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-2xl p-8 shadow-2xl relative">
                        <div className="flex justify-between items-start mb-6 pb-4 border-b border-white/10">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><UsersRound className="text-blue-500" size={20} /> Cobrar Compañía</h3>
                                <p className="text-[10px] font-bold text-gray-500 uppercase mt-1">Para: <span className="text-white">{selectedUser.nombre_completo}</span></p>
                            </div>
                            <button onClick={() => setIsCobroCompaniaOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>

                        <form onSubmit={handleCobrarCompaniaManual} className="space-y-5">
                            {selectedUser.companias && selectedUser.companias.length > 1 && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">¿Qué compañía vas a cobrar?</label>
                                    <select required value={cobroCompaniaForm.companiaId} onChange={e => setCobroCompaniaForm({ ...cobroCompaniaForm, companiaId: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-blue-500">
                                        <option value="" disabled>Elegí una compañía...</option>
                                        {selectedUser.companias.map((c: any) => (
                                            <option key={c.id} value={c.id}>{c.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Monto Base ($)</label>
                                <input required type="number" value={cobroCompaniaForm.monto} onChange={e => setCobroCompaniaForm({ ...cobroCompaniaForm, monto: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-blue-500" placeholder="Ej: 15000" />
                            </div>

                            {selectedUser.porcentaje_beca_compania > 0 && cobroCompaniaForm.monto && (
                                <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-xl flex flex-col gap-2">
                                    <div className="flex justify-between text-xs text-gray-400"><span>Monto Base:</span><span>${Number(cobroCompaniaForm.monto).toLocaleString()}</span></div>
                                    <div className="flex justify-between text-xs text-teal-400 font-bold"><span>Beca Grupo ({selectedUser.porcentaje_beca_compania}%):</span><span>- ${((Number(cobroCompaniaForm.monto) * selectedUser.porcentaje_beca_compania) / 100).toLocaleString()}</span></div>
                                    <div className="h-px bg-white/10 my-1"></div>
                                    <div className="flex justify-between text-lg text-white font-black"><span>Total a Pagar:</span><span>${(Number(cobroCompaniaForm.monto) - ((Number(cobroCompaniaForm.monto) * selectedUser.porcentaje_beca_compania) / 100)).toLocaleString()}</span></div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Método de Pago</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button type="button" onClick={() => setCobroCompaniaForm({ ...cobroCompaniaForm, metodo: 'efectivo' })} className={`p-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${cobroCompaniaForm.metodo === 'efectivo' ? 'bg-blue-600 border-blue-500 text-white font-black' : 'bg-transparent border-white/10 text-gray-500 hover:border-white/30'}`}><Wallet size={16} /> Efectivo</button>
                                    <button type="button" onClick={() => setCobroCompaniaForm({ ...cobroCompaniaForm, metodo: 'transferencia' })} className={`p-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${cobroCompaniaForm.metodo === 'transferencia' ? 'bg-blue-600 border-blue-500 text-white font-black' : 'bg-transparent border-white/10 text-gray-500 hover:border-white/30'}`}><CreditCard size={16} /> Transf.</button>
                                </div>
                            </div>

                            <button disabled={assigningPack} type="submit" className="w-full bg-blue-600 text-white font-black uppercase py-4 rounded-xl hover:bg-blue-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4">
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
        <Suspense fallback={<div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-10 h-10" /></div>}>
            <UsuariosContent />
        </Suspense>
    )
}