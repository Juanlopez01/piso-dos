'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
    Search, Filter, User, Shield, Briefcase, GraduationCap,
    MessageSquare, Save, Loader2, Tag, X, Phone, UserPlus, Lock, ShieldAlert, CreditCard, Calendar
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { useCash } from '@/context/CashContext'
import { addDays, format } from 'date-fns'

type Ritmo = { id: string; nombre: string }

type Producto = {
    id: string
    nombre: string
    precio: number
    creditos: number
    tipo_clase: 'regular' | 'seminario'
}

function UsuariosContent() {
    const supabase = createClient()
    const searchParams = useSearchParams()

    const { userRole, isLoading: loadingContext } = useCash()

    // Estado Datos
    const [users, setUsers] = useState<any[]>([])
    const [ritmosDisponibles, setRitmosDisponibles] = useState<Ritmo[]>([])
    const [productos, setProductos] = useState<Producto[]>([]) // NUEVO ESTADO PARA PACKS
    const [loading, setLoading] = useState(true)

    // Filtros
    const [roleFilter, setRoleFilter] = useState('todos')
    const [interestFilter, setInterestFilter] = useState('')
    const [searchTerm, setSearchTerm] = useState('')

    // Modales y Procesos
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isPackModalOpen, setIsPackModalOpen] = useState(false) // MODAL PARA PACKS
    const [selectedUser, setSelectedUser] = useState<any>(null)
    const [cambiandoRolId, setCambiandoRolId] = useState<string | null>(null)
    const [assigningPack, setAssigningPack] = useState(false)

    // Forms
    const [editForm, setEditForm] = useState({ obs: '', intereses_ritmos: [] as string[] })
    const [createForm, setCreateForm] = useState({
        nombre: '', email: '', dni: '', telefono: '', rol: 'alumno'
    })
    const [packForm, setPackForm] = useState({ packId: '', monto: '', metodo: 'efectivo' })

    // Cargar Datos Iniciales
    useEffect(() => {
        if (!loadingContext) {
            fetchData()
        }

        const paramRole = searchParams.get('ver')
        if (paramRole) setRoleFilter(paramRole)
    }, [searchParams, loadingContext])

    // Función unificada para traer todo
    const fetchData = async () => {
        setLoading(true)

        // 1. Traer Ritmos
        const { data: ritmosData } = await supabase.from('ritmos').select('id, nombre').order('nombre')
        if (ritmosData) setRitmosDisponibles(ritmosData)

        // 2. Traer Usuarios 
        const { data: usersData } = await supabase.from('profiles').select('*').order('nombre_completo', { ascending: true })
        if (usersData) setUsers(usersData)

        // 3. Traer Packs/Productos activos
        const { data: prodsData } = await supabase.from('productos').select('*').eq('activo', true).order('tipo_clase').order('creditos')
        if (prodsData) setProductos(prodsData)

        setLoading(false)
    }

    // --- LÓGICA DE FILTRADO ---
    const filteredUsers = users.filter(u => {
        let matchesRole = true

        if (roleFilter === 'staff' && userRole !== 'admin') {
            return false
        }

        if (roleFilter === 'staff') {
            matchesRole = u.rol === 'admin' || u.rol === 'recepcion'
        } else if (roleFilter !== 'todos') {
            matchesRole = u.rol === roleFilter
        } else {
            if (userRole !== 'admin' && (u.rol === 'admin' || u.rol === 'recepcion')) {
                matchesRole = false
            }
        }

        const term = searchTerm.toLowerCase()
        const matchesSearch = u.nombre_completo?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)

        let matchesInterest = true
        if ((roleFilter === 'alumno' || roleFilter === 'todos') && interestFilter) {
            matchesInterest = u.intereses_ritmos && u.intereses_ritmos.includes(interestFilter)
        }

        return matchesRole && matchesSearch && matchesInterest
    })

    const getRitmoNombre = (id: string) => {
        const ritmo = ritmosDisponibles.find(r => r.id === id)
        return ritmo ? ritmo.nombre : 'Desconocido'
    }

    // --- CAMBIAR ROL ---
    const cambiarRol = async (usuarioId: string, nuevoRol: string) => {
        if (userRole !== 'admin') return toast.error('No tienes permisos')

        setCambiandoRolId(usuarioId)
        const { error } = await supabase
            .from('profiles')
            .update({ rol: nuevoRol as any })
            .eq('id', usuarioId)

        if (!error) {
            toast.success('Rol actualizado correctamente')
            setUsers(users.map(u => u.id === usuarioId ? { ...u, rol: nuevoRol } : u))
        } else {
            toast.error('Error al cambiar el rol')
        }
        setCambiandoRolId(null)
    }

    // --- CREAR USUARIO ---
    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)

        try {
            const res = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: createForm.email,
                    password: createForm.dni,
                    nombre: createForm.nombre,
                    rol: createForm.rol,
                    telefono: createForm.telefono
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Error al crear')

            toast.success(`${createForm.rol === 'profesor' ? 'Profesor' : 'Alumno'} creado correctamente`)
            setIsCreateOpen(false)
            setCreateForm({ nombre: '', email: '', dni: '', telefono: '', rol: 'alumno' })
            fetchData()

        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setCreating(false)
        }
    }

    // --- FUNCIONES DE EDICIÓN DE NOTAS/INTERESES ---
    const openEditModal = (user: any) => {
        setSelectedUser(user)
        setEditForm({
            obs: user.staff_observations || '',
            intereses_ritmos: user.intereses_ritmos || []
        })
        setIsEditOpen(true)
    }

    const toggleInterest = (ritmoId: string) => {
        setEditForm(prev => {
            const exists = prev.intereses_ritmos.includes(ritmoId)
            return {
                ...prev,
                intereses_ritmos: exists ? prev.intereses_ritmos.filter(id => id !== ritmoId) : [...prev.intereses_ritmos, ritmoId]
            }
        })
    }

    const handleSaveChanges = async () => {
        if (!selectedUser) return
        const { error } = await supabase
            .from('profiles')
            .update({
                staff_observations: editForm.obs,
                intereses_ritmos: editForm.intereses_ritmos
            })
            .eq('id', selectedUser.id)

        if (!error) {
            toast.success('Cambios guardados')
            setUsers(users.map(u => u.id === selectedUser.id ? { ...u, staff_observations: editForm.obs, intereses_ritmos: editForm.intereses_ritmos } : u))
            setIsEditOpen(false)
        } else {
            toast.error('Error al guardar')
        }
    }

    // --- FUNCIONES DE CARGA DE PACKS ---
    const openPackModal = (user: any) => {
        setSelectedUser(user)
        setPackForm({ packId: '', monto: '', metodo: 'efectivo' }) // Agregamos el método inicial
        setIsPackModalOpen(true)
    }

    const handlePackSelectionChange = (packId: string) => {
        const prod = productos.find(p => p.id === packId)
        // Usamos prev para mantener el método de pago que ya estaba seleccionado
        setPackForm(prev => ({
            ...prev,
            packId,
            monto: prod ? prod.precio.toString() : ''
        }))
    }

    const handleAssignPack = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!packForm.packId || packForm.monto === '') return toast.error('Completá los campos del pack')

        setAssigningPack(true)

        const prod = productos.find(p => p.id === packForm.packId)
        const montoNum = Number(packForm.monto)

        if (!prod) {
            setAssigningPack(false)
            return toast.error('Producto no encontrado')
        }

        const { data: { user } } = await supabase.auth.getUser()
        let turnoActivoId = null

        // SI HAY PLATA DE POR MEDIO, EXIGIMOS CAJA ABIERTA
        if (montoNum > 0 && user) {
            const { data: turno } = await supabase.from('caja_turnos')
                .select('id')
                .eq('usuario_id', user.id)
                .eq('estado', 'abierta')
                .maybeSingle()

            if (!turno) {
                setAssigningPack(false)
                return toast.error('¡Caja Cerrada! Abrí tu caja en Finanzas para poder cobrar.')
            }
            turnoActivoId = turno.id
        }

        // Calculamos fecha a 30 días
        const fechaVencimiento = addDays(new Date(), 30).toISOString()

        try {
            // 1. Guardar la "bolsita" en el historial (Ledger)
            const { error: errPack } = await supabase.from('alumno_packs').insert({
                user_id: selectedUser.id,
                producto_id: prod.id,
                tipo_clase: prod.tipo_clase,
                cantidad_inicial: prod.creditos,
                creditos_restantes: prod.creditos,
                monto_abonado: montoNum,
                fecha_vencimiento: fechaVencimiento,
                estado: 'activo'
            })
            if (errPack) throw errPack

            // 2. Sumar visualmente los créditos al perfil
            const fieldToUpdate = prod.tipo_clase === 'regular' ? 'creditos_regulares' : 'creditos_seminarios'
            const currentCreds = selectedUser[fieldToUpdate] || 0

            const { error: errProf } = await supabase.from('profiles').update({
                [fieldToUpdate]: currentCreds + prod.creditos
            }).eq('id', selectedUser.id)

            if (errProf) throw errProf

            // 3. REGISTRAR EL MOVIMIENTO EN CAJA (Si corresponde)
            if (montoNum > 0 && turnoActivoId) {
                const { error: errCaja } = await supabase.from('caja_movimientos').insert({
                    turno_id: turnoActivoId,
                    tipo: 'ingreso',
                    concepto: `Venta Pack: ${prod.nombre} (${selectedUser.nombre_completo})`,
                    monto: montoNum,
                    metodo_pago: packForm.metodo,
                    origen_referencia: 'sistema'
                })
                if (errCaja) console.error("Error al registrar en caja:", errCaja)
            }

            toast.success(`Pack asignado correctamente. Vence el ${format(new Date(fechaVencimiento), 'dd/MM/yyyy')}`)
            setIsPackModalOpen(false)
            fetchData()
        } catch (error: any) {
            toast.error(error.message || 'Error al asignar el pack')
        } finally {
            setAssigningPack(false)
        }
    }

    const [creating, setCreating] = useState(false)

    if (loading || loadingContext) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-10 h-10" /></div>

    const canCreate = userRole === 'admin' || userRole === 'recepcion'
    const isAdmin = userRole === 'admin'

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col gap-6 mb-8">
                <div className="flex justify-between items-end border-b border-white/10 pb-6">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter text-white leading-none">Directorio</h1>
                        <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">Gestión de Usuarios</p>
                    </div>
                    {canCreate && (
                        <button onClick={() => setIsCreateOpen(true)} className="bg-[#D4E655] text-black px-4 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-all flex items-center gap-2 shadow-lg">
                            <UserPlus size={16} /> Nuevo Usuario
                        </button>
                    )}
                </div>

                {/* BARRA HERRAMIENTAS */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div className="bg-[#111] p-1 rounded-xl border border-white/10 flex gap-1 w-full md:w-auto overflow-x-auto">
                        <button onClick={() => { setRoleFilter('todos'); setInterestFilter('') }} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${roleFilter === 'todos' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}><User size={14} /> Todos</button>
                        <button onClick={() => { setRoleFilter('alumno'); setInterestFilter('') }} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${roleFilter === 'alumno' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}><GraduationCap size={14} /> Alumnos</button>
                        <button onClick={() => { setRoleFilter('profesor'); setInterestFilter('') }} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${roleFilter === 'profesor' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}><Briefcase size={14} /> Profesores</button>

                        {isAdmin && (
                            <button onClick={() => { setRoleFilter('staff'); setInterestFilter('') }} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${roleFilter === 'staff' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}><Shield size={14} /> Staff</button>
                        )}
                    </div>

                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-3 text-gray-500" size={16} />
                        <input placeholder="Buscar..." className="w-full bg-[#111] border border-white/10 rounded-xl pl-10 p-2.5 text-sm text-white outline-none focus:border-[#D4E655]" onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>

                {/* Filtros Intereses */}
                {(roleFilter === 'alumno' || roleFilter === 'todos') && ritmosDisponibles.length > 0 && (
                    <div className="flex gap-2 flex-wrap pt-2">
                        <div className="flex items-center gap-2 mr-2"><Filter size={12} className="text-[#D4E655]" /><span className="text-[10px] font-bold text-gray-500 uppercase">Intereses:</span></div>
                        <button onClick={() => setInterestFilter('')} className={`text-[9px] font-bold px-3 py-1.5 rounded-lg border uppercase ${!interestFilter ? 'bg-white text-black border-white' : 'bg-transparent text-gray-600 border-white/10'}`}>Todos</button>
                        {ritmosDisponibles.map(ritmo => (
                            <button key={ritmo.id} onClick={() => setInterestFilter(ritmo.id === interestFilter ? '' : ritmo.id)} className={`text-[9px] font-bold px-3 py-1.5 rounded-lg border uppercase ${interestFilter === ritmo.id ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-500 border-white/10'}`}>{ritmo.nombre}</button>
                        ))}
                    </div>
                )}
            </div>

            {/* GRILLA DE USUARIOS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredUsers.map((u) => (
                    <div key={u.id} className="bg-[#09090b] border border-white/10 p-5 rounded-2xl flex flex-col justify-between gap-4 group hover:border-[#D4E655]/30 transition-all relative overflow-hidden shadow-sm">

                        {/* Badge Rol */}
                        <div className={`absolute top-0 right-0 px-3 py-1.5 rounded-bl-xl text-[8px] font-black uppercase tracking-widest ${u.rol === 'admin' ? 'bg-red-500/20 text-red-500' : u.rol === 'recepcion' ? 'bg-blue-500/20 text-blue-500' : u.rol === 'profesor' ? 'bg-purple-500/20 text-purple-500' : 'bg-white/5 text-gray-500'}`}>
                            {u.rol}
                        </div>

                        <div>
                            <div className="flex items-start gap-4 mb-3 mt-2">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black uppercase shrink-0 ${u.rol === 'alumno' ? 'bg-white/10 text-white' : 'bg-[#D4E655] text-black'}`}>
                                    {u.nombre_completo?.[0] || '?'}
                                </div>
                                <div className="min-w-0 pr-8">
                                    <h4 className="font-bold text-white uppercase text-sm truncate">{u.nombre_completo}</h4>
                                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{u.email}</p>
                                </div>
                            </div>

                            <div className="space-y-1 mb-3">
                                {u.telefono ? <div className="flex items-center gap-2 text-xs text-gray-400 bg-[#111] px-2 py-1.5 rounded-lg border border-white/5 w-fit"><Phone size={10} className="text-[#D4E655]" /> {u.telefono}</div> : <div className="text-[10px] text-gray-600 italic px-1">Sin teléfono</div>}
                            </div>

                            {/* Mostrar Resumen de Créditos Si es Alumno */}
                            {u.rol === 'alumno' && (
                                <div className="flex gap-2 mb-3">
                                    <div className="bg-white/5 px-2 py-1 rounded text-[10px] text-gray-400 uppercase font-bold">Reg: <span className="text-white text-xs">{u.creditos_regulares || 0}</span></div>
                                    <div className="bg-white/5 px-2 py-1 rounded text-[10px] text-gray-400 uppercase font-bold">Sem: <span className="text-purple-400 text-xs">{u.creditos_seminarios || 0}</span></div>
                                </div>
                            )}

                            {u.intereses_ritmos && u.intereses_ritmos.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                    {u.intereses_ritmos.slice(0, 3).map((ritmoId: string) => (
                                        <span key={ritmoId} className="text-[8px] bg-white/5 border border-white/5 text-gray-300 px-1.5 py-0.5 rounded uppercase font-bold">
                                            {getRitmoNombre(ritmoId)}
                                        </span>
                                    ))}
                                    {u.intereses_ritmos.length > 3 && <span className="text-[8px] text-gray-600 px-1 py-0.5 font-bold">+{u.intereses_ritmos.length - 3}</span>}
                                </div>
                            )}

                            {u.staff_observations && canCreate && <div className="bg-yellow-500/5 border border-yellow-500/20 p-2.5 rounded-lg mb-2"><p className="text-[10px] text-yellow-200/70 italic line-clamp-2">"{u.staff_observations}"</p></div>}
                        </div>

                        {/* ACCIONES */}
                        {canCreate && (
                            <div className="flex gap-2 mt-auto pt-2 border-t border-white/5 flex-wrap">
                                {/* Botón Cargar Pack (Solo para alumnos) */}
                                {u.rol === 'alumno' && (
                                    <button onClick={() => openPackModal(u)} className="w-full py-2.5 rounded-xl border bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500 hover:text-black text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-2 mb-2">
                                        <CreditCard size={12} /> Cargar Pack
                                    </button>
                                )}

                                <button onClick={() => openEditModal(u)} className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-2 ${u.staff_observations ? 'bg-[#D4E655]/10 text-[#D4E655] border-[#D4E655]/20' : 'bg-[#111] text-gray-500 border-white/5 hover:border-white/20 hover:text-white'}`}>
                                    <MessageSquare size={12} /> Notas
                                </button>

                                {isAdmin && (
                                    <div className="relative flex-1">
                                        <select
                                            disabled={cambiandoRolId === u.id}
                                            value={u.rol || ''}
                                            onChange={(e) => cambiarRol(u.id, e.target.value)}
                                            className={`w-full h-full py-2.5 px-2 rounded-xl text-[10px] font-black uppercase transition-colors border cursor-pointer outline-none appearance-none text-center ${cambiandoRolId === u.id ? 'bg-[#111] text-gray-600 border-white/5' : 'bg-[#111] text-gray-300 border-white/5 hover:border-white/20 hover:text-white'}`}
                                        >
                                            <option value="admin">Admin</option>
                                            <option value="recepcion">Recepción</option>
                                            <option value="profesor">Profesor</option>
                                            <option value="alumno">Alumno</option>
                                        </select>
                                        {cambiandoRolId === u.id && (
                                            <div className="absolute top-0 right-2 h-full flex items-center">
                                                <Loader2 size={12} className="animate-spin text-[#D4E655]" />
                                            </div>
                                        )}
                                    </div>
                                )}
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

            {/* MODAL EDITAR NOTAS */}
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
                                        const isActive = editForm.intereses_ritmos.includes(ritmo.id);
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

            {/* MODAL CREAR USUARIO */}
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

            {/* MODAL CARGAR PACK (NUEVO) */}
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
                                <select
                                    required
                                    value={packForm.packId}
                                    onChange={e => handlePackSelectionChange(e.target.value)}
                                    className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655]"
                                >
                                    <option value="" disabled>Seleccioná un producto...</option>
                                    {productos.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.nombre} ({p.creditos} clases) - ${p.precio.toLocaleString()}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {packForm.packId && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Monto Abonado ($)</label>
                                    <input
                                        required
                                        type="number"
                                        value={packForm.monto}
                                        onChange={e => setPackForm({ ...packForm, monto: e.target.value })}
                                        className="w-full bg-[#111] border border-[#D4E655]/30 rounded-xl p-4 text-[#D4E655] font-black text-lg outline-none focus:border-[#D4E655] transition-colors"
                                        placeholder="Monto final pagado"
                                    />
                                    <p className="text-[9px] text-gray-500 italic mt-1">Podés editar este monto si el alumno tuvo un descuento manual.</p>
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