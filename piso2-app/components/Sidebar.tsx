'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, UserCircle, Shield, Radio, LogIn, UsersRound } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { menuItems } from '@/config/menu'
import { useCash } from '@/context/CashContext'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'

export default function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const [unreadNotifs, setUnreadNotifs] = useState(0)

    // 👈 1. Traemos los accesos inteligentes del contexto
    const { isBoxOpen, userRole, userName, hasLigaAccess, hasCompaniaAccess, isLoading } = useCash()

    // --- LÓGICA DE NOTIFICACIONES EN TIEMPO REAL ---
    useEffect(() => {
        if (isLoading || !userRole || userRole === 'visitante') return

        const fetchNotifsCount = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                const userId = session?.user?.id

                if (!userId) return

                const { count } = await supabase
                    .from('notificaciones')
                    .select('*', { count: 'exact', head: true })
                    .eq('usuario_id', userId)
                    .eq('leido', false)

                setUnreadNotifs(count || 0)
            } catch (error) {
                console.error("Error silencioso en notificaciones del sidebar:", error)
            }
        }

        fetchNotifsCount()

        const channel = supabase
            .channel('sidebar_notifs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, () => {
                fetchNotifsCount()
            })
            .subscribe()

        const handleLocalUpdate = () => fetchNotifsCount()
        window.addEventListener('notificaciones_actualizadas', handleLocalUpdate)

        return () => {
            supabase.removeChannel(channel)
            window.removeEventListener('notificaciones_actualizadas', handleLocalUpdate)
        }
    }, [isLoading, userRole, supabase])

    // --- LÓGICA LOGOUT ---
    const handleSignOut = async () => {
        if (isLoggingOut) return;

        if (userRole === 'recepcion' && isBoxOpen) {
            return toast.error('¡Caja Abierta! Cerrala antes de salir.')
        }

        setIsLoggingOut(true)

        try {
            await supabase.auth.signOut()
        } catch (error) {
            console.error("Error al cerrar sesión:", error)
        } finally {
            // Forzamos la recarga limpia hacia la Home
            window.location.href = '/'
        }
    }

    // --- LÓGICA DE MENÚ ---
    const role = isLoading ? 'visitante' : (userRole || 'visitante')

    const visibleItems = menuItems.filter(item => {
        // 1. Filtros Mágicos de La Liga y Compañías
        if (item.name === 'La Liga' && !hasLigaAccess) return false;
        if (item.name === 'Compañías' && !hasCompaniaAccess) return false;

        // 2. Ocultamos "Agenda" a los alumnos y profesores
        if ((role === 'alumno' || role === 'profesor') && item.name === 'Agenda') return false;

        // 3. Listas explícitas
        if (role === 'admin') return ['Inicio', 'Agenda', 'Alumnos / Profes', 'Staff / Equipo', 'Productos', 'La Liga', 'Compañías', 'Caja', 'Sedes', 'Notificaciones', 'Mi Perfil'].includes(item.name)

        // 👈 Los visitantes también deben ver Explorar en vez de Agenda
        if (role === 'visitante') return ['Inicio', 'Explorar'].includes(item.name)

        if (role === 'recepcion') {
            if (!isBoxOpen) return ['Inicio', 'Agenda', 'Caja', 'Mi Perfil', 'Notificaciones', 'La Liga', 'Compañías'].includes(item.name)
            return ['Inicio', 'Agenda', 'Alumnos / Profes', 'Alquileres', 'Productos', 'Caja', 'Notificaciones', 'Mi Perfil', 'La Liga', 'Compañías'].includes(item.name)
        }

        return item.roles.includes(role)
    })

    // --- RENDERIZADO ---
    return (
        <aside className="
        hidden md:flex flex-col 
        w-64 min-w-[16rem] h-full 
        border-r border-white/10 bg-[#09090b]
        shrink-0
    ">
            {/* HEADER */}
            <div className="p-6 shrink-0">
                <h1 className="text-2xl font-black uppercase tracking-tighter text-white">
                    Piso <span className="text-[#D4E655]">2</span>
                </h1>

                {/* Indicador de Estado (Solo Staff) */}
                {!isLoading && (role === 'recepcion') && (
                    <div className="mt-2 flex items-center gap-2 animate-in fade-in duration-500">
                        <span className={`w-2 h-2 rounded-full ${isBoxOpen ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                        <span className="text-[10px] uppercase font-bold text-gray-500">
                            {isBoxOpen ? 'Caja Abierta' : 'Caja Cerrada'}
                        </span>
                    </div>
                )}
            </div>

            {/* NAV */}
            <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
                {isLoading ? (
                    [1, 2, 3].map(i => <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />)
                ) : (
                    visibleItems.map((item) => {
                        const isActive = pathname === item.href
                        const isNotifs = item.name === 'Notificaciones'

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`
                                    flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all group
                                    ${isActive
                                        ? "bg-[#D4E655] text-black shadow-[0_0_15px_rgba(212,230,85,0.3)]"
                                        : "text-gray-400 hover:text-white hover:bg-white/5"}
                                `}
                                prefetch={false}
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon size={18} className={isActive ? 'text-black' : 'text-gray-500 group-hover:text-white'} />
                                    {item.name}
                                </div>

                                {/* Badge de Notificaciones */}
                                {isNotifs && unreadNotifs > 0 && (
                                    <span className={`
                                        text-[9px] font-black px-2 py-0.5 rounded-full
                                        ${isActive ? 'bg-black text-[#D4E655]' : 'bg-red-500 text-white'}
                                    `}>
                                        {unreadNotifs > 99 ? '+99' : unreadNotifs}
                                    </span>
                                )}
                            </Link>
                        )
                    })
                )}
            </nav>

            {/* FOOTER */}
            <div className="p-4 border-t border-white/10 bg-[#050505] shrink-0">
                {!isLoading && role !== 'visitante' ? (
                    <>
                        <div className="flex items-center gap-3 mb-4 px-2 overflow-hidden">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                                <UserCircle size={20} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{userName || 'Usuario'}</p>
                                <p className="text-[10px] text-[#D4E655] uppercase font-black flex items-center gap-1">
                                    {/* 👈 Ícono personalizado para cada tipo de staff */}
                                    {role === 'admin' ? <Shield size={10} /> : role === 'coordinador' ? <UsersRound size={10} /> : <Radio size={10} />} {role}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleSignOut}
                            disabled={isLoggingOut}
                            className={`flex items-center justify-center gap-2 w-full px-4 py-3 text-xs font-black uppercase rounded-xl transition-all 
                                ${isLoggingOut
                                    ? 'bg-red-500/5 text-red-500/50 cursor-not-allowed'
                                    : 'text-red-500 bg-red-500/10 hover:bg-red-500 hover:text-white'}`}
                        >
                            <LogOut size={14} className={isLoggingOut ? 'animate-pulse' : ''} />
                            {isLoggingOut ? 'Saliendo...' : 'Cerrar Sesión'}
                        </button>
                    </>
                ) : (
                    <Link
                        href="/login"
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 text-xs font-black uppercase text-[#D4E655] bg-[#D4E655]/10 hover:bg-[#D4E655] hover:text-black rounded-xl transition-all"
                    >
                        <LogIn size={14} /> Iniciar Sesión
                    </Link>
                )}
            </div>
        </aside>
    )
}