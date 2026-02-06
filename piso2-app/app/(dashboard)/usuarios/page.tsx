'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { Shield, User, GraduationCap, Briefcase, Search, Lock, AlertTriangle, UserPlus, X, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createNewUser } from '@/actions/register-user' // <--- Importamos la acción

type UserRole = 'admin' | 'profesor' | 'recepcion' | 'alumno'

type Profile = {
    id: string
    email: string
    nombre_completo: string | null
    rol: UserRole
}

export default function UsuariosPage() {
    const supabase = createClient()
    const router = useRouter()

    // Estados de Datos
    const [users, setUsers] = useState<Profile[]>([])
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [myRole, setMyRole] = useState<UserRole | null>(null)

    // Estados de UI
    const [searchTerm, setSearchTerm] = useState('')
    const [updating, setUpdating] = useState<string | null>(null)

    // Estados del Modal "Nuevo Usuario"
    const [showModal, setShowModal] = useState(false)
    const [formState, setFormState] = useState({ nombre: '', email: '', dni: '' })
    const [isCreating, setIsCreating] = useState(false)

    useEffect(() => {
        checkMyRoleAndFetch()
    }, [])

    const checkMyRoleAndFetch = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }

            // Leer mi rol usando la función segura o lectura directa si la arreglamos
            const { data: myProfile, error: profileError } = await supabase
                .from('profiles')
                .select('rol')
                .eq('id', user.id)
                .single()

            const role = myProfile?.rol as UserRole
            setMyRole(role)

            if (role === 'profesor' || role === 'alumno') {
                alert("⛔ Acceso restringido.")
                router.push('/')
                return
            }

            fetchUsers()

        } catch (e) {
            console.error(e)
            setErrorMsg("Error de autenticación.")
            setLoading(false)
        }
    }

    const fetchUsers = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false })

        if (data) setUsers(data as any)
        setLoading(false)
    }

    const handleRoleChange = async (userId: string, newRole: string) => {
        setUpdating(userId)
        const { error } = await supabase.from('profiles').update({ rol: newRole }).eq('id', userId)
        if (error) alert('Error al actualizar rol')
        else setUsers(prev => prev.map(u => u.id === userId ? { ...u, rol: newRole as any } : u))
        setUpdating(null)
    }

    // MANEJO DEL FORMULARIO DE CREACIÓN
    const handleSubmitNewUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsCreating(true)

        const formData = new FormData()
        formData.append('nombre', formState.nombre)
        formData.append('email', formState.email)
        formData.append('dni', formState.dni)

        // Llamamos a la Server Action
        const result = await createNewUser(null, formData)

        if (result.success) {
            alert('✅ Usuario creado correctamente. Contraseña inicial: ' + formState.dni)
            setShowModal(false)
            setFormState({ nombre: '', email: '', dni: '' })
            fetchUsers() // Recargamos la lista
        } else {
            alert('❌ Error: ' + result.message)
        }
        setIsCreating(false)
    }

    const filteredUsers = users.filter(u =>
        (u.nombre_completo?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    )

    const getRoleBadge = (rol: string) => {
        switch (rol) {
            case 'admin': return { icon: Shield, color: 'text-red-500 bg-red-500/10 border-red-500/20' }
            case 'profesor': return { icon: Briefcase, color: 'text-piso2-blue bg-piso2-blue/10 border-piso2-blue/20' }
            case 'recepcion': return { icon: User, color: 'text-piso2-orange bg-piso2-orange/10 border-piso2-orange/20' }
            default: return { icon: GraduationCap, color: 'text-piso2-lime bg-piso2-lime/10 border-piso2-lime/20' }
        }
    }

    if (loading) return <div className="p-10 text-piso2-lime animate-pulse">Cargando...</div>
    if (errorMsg) return <div className="p-10 text-red-500">{errorMsg}</div>

    const isReadOnly = myRole !== 'admin'

    return (
        <div className="space-y-6 pb-20 relative">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/10 pb-6">
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Usuarios</h2>
                    <p className="text-gray-400 text-sm flex items-center gap-2">
                        Comunidad: {users.length} miembros.
                        {isReadOnly && <span className="bg-white/10 px-2 py-0.5 rounded text-xs text-yellow-400 font-bold flex items-center gap-1"><Lock size={10} /> SOLO LECTURA</span>}
                    </p>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    {/* BOTÓN NUEVO ALUMNO */}
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-piso2-lime text-black font-bold uppercase px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-white transition-colors"
                    >
                        <UserPlus size={18} strokeWidth={2.5} /> Nuevo Alumno
                    </button>

                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-3 text-gray-500" size={18} />
                        <input
                            type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-black border border-white/20 pl-10 pr-4 py-2 text-white outline-none focus:border-piso2-lime rounded-lg"
                        />
                    </div>
                </div>
            </div>

            {/* LISTA */}
            <div className="grid grid-cols-1 gap-4">
                {filteredUsers.map((user) => {
                    const badge = getRoleBadge(user.rol)
                    const Icon = badge.icon
                    return (
                        <div key={user.id} className="bg-[#09090b] border border-white/5 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 group hover:border-white/10 transition-colors">
                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <div className={`p-3 rounded-full ${badge.color}`}><Icon size={24} /></div>
                                <div>
                                    <h3 className="text-lg font-bold text-white leading-tight">{user.nombre_completo || 'Sin nombre'}</h3>
                                    <p className="text-sm text-gray-500">{user.email}</p>
                                </div>
                            </div>
                            <div className={`flex items-center gap-2 w-full md:w-auto p-1 rounded-lg border ${isReadOnly ? 'border-transparent opacity-70' : 'bg-black/50 border-white/5'}`}>
                                <span className="text-[10px] font-bold text-gray-500 uppercase px-2">Rol:</span>
                                <select
                                    value={user.rol} onChange={(e) => handleRoleChange(user.id, e.target.value)} disabled={isReadOnly || updating === user.id}
                                    className={`bg-transparent text-sm font-bold uppercase outline-none py-2 px-2 ${isReadOnly ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer'} ${user.rol === 'admin' ? 'text-red-500' : user.rol === 'profesor' ? 'text-piso2-blue' : user.rol === 'recepcion' ? 'text-piso2-orange' : 'text-piso2-lime'}`}
                                >
                                    <option value="alumno" className="bg-black text-gray-300">🎓 Alumno</option>
                                    <option value="profesor" className="bg-black text-piso2-blue">💼 Profesor</option>
                                    <option value="recepcion" className="bg-black text-piso2-orange">👋 Recepción</option>
                                    <option value="admin" className="bg-black text-red-500">🛡️ Admin</option>
                                </select>
                                {updating === user.id && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* --- MODAL CREAR USUARIO --- */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setShowModal(false)}>
                    <div className="bg-[#09090b] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Alta de Alumno</h3>
                            <button onClick={() => setShowModal(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>

                        <form onSubmit={handleSubmitNewUser} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Nombre Completo</label>
                                <input
                                    required autoFocus
                                    className="w-full bg-[#111] text-white border border-white/10 rounded-lg p-3 outline-none focus:border-piso2-lime"
                                    placeholder="Ej: Lionel Messi"
                                    value={formState.nombre}
                                    onChange={e => setFormState({ ...formState, nombre: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Email</label>
                                <input
                                    required type="email"
                                    className="w-full bg-[#111] text-white border border-white/10 rounded-lg p-3 outline-none focus:border-piso2-lime"
                                    placeholder="usuario@email.com"
                                    value={formState.email}
                                    onChange={e => setFormState({ ...formState, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">DNI (Será su contraseña)</label>
                                <input
                                    required type="number"
                                    className="w-full bg-[#111] text-white border border-white/10 rounded-lg p-3 outline-none focus:border-piso2-lime"
                                    placeholder="Sin puntos"
                                    value={formState.dni}
                                    onChange={e => setFormState({ ...formState, dni: e.target.value })}
                                />
                                <p className="text-[10px] text-gray-500">El alumno podrá cambiarla después.</p>
                            </div>

                            <button
                                type="submit"
                                disabled={isCreating}
                                className="w-full bg-piso2-lime text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all mt-4 flex justify-center"
                            >
                                {isCreating ? 'Registrando...' : 'Confirmar Alta'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    )
}