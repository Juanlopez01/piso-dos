'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { LogOut, UserCircle, Shield, Radio, LogIn, UsersRound } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { menuItems } from '@/config/menu'
import { useCash } from '@/context/CashContext'
import { toast } from 'sonner'
import { useState, useEffect, Suspense } from 'react'

function SidebarContent() {
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [supabase] = useState(() => createClient())

    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const [unreadNotifs, setUnreadNotifs] = useState(0)

    const { userRole, isBoxOpen, hasLigaAccess, hasCompaniaAccess, isLoading, userId } = useCash()

    useEffect(() => {
        // Solo buscamos notificaciones si ya cargó el usuario y tenemos el ID listo
        if (!isLoading && userId && userRole && userRole !== 'visitante') {
            const fetchNotifs = async () => {
                const { count } = await supabase
                    .from('notificaciones')
                    .select('*', { count: 'exact', head: true })
                    .eq('usuario_id', userId) // 👈 Usamos el ID directo del contexto
                    .eq('leido', false)
                setUnreadNotifs(count || 0)
            }
            fetchNotifs()
        }
    }, [pathname, isLoading, userId, userRole, supabase])

    const visibleItems = menuItems.filter(item => {
        if (item.name === 'La Liga' && !hasLigaAccess) return false;
        if (item.name === 'Compañías' && !hasCompaniaAccess) return false;

        if ((userRole === 'alumno' || userRole === 'profesor') && item.name === 'Agenda') return false;

        if (userRole === 'admin') return ['Inicio', 'Agenda', 'Alquileres', 'Explorar', 'Alumnos / Profes', 'Staff / Equipo', 'Productos', 'La Liga', 'Compañías', 'Caja', 'Liquidaciones', 'Sedes', 'Notificaciones', 'Mi Perfil'].includes(item.name)
        if (userRole === 'visitante') return ['Inicio', 'Explorar'].includes(item.name)

        // 🚀 Agregamos "Compañías" al listado base que ven los profes
        if (userRole === 'profesor') {
            return ['Inicio', 'Mis Clases', 'Mis Pagos', 'Compañías', 'La Liga', 'Notificaciones', 'Mi Perfil'].includes(item.name)
        }

        if (userRole === 'recepcion') {
            if (!isBoxOpen) return ['Inicio', 'Agenda', 'Caja', 'Mi Perfil', 'Notificaciones', 'La Liga', 'Compañías'].includes(item.name)
            return ['Inicio', 'Agenda', 'Alumnos / Profes', 'Alquileres', 'Productos', 'Caja', 'Liquidaciones', 'Notificaciones', 'Mi Perfil', 'La Liga', 'Compañías'].includes(item.name)
        }

        return item.roles.includes(userRole || 'visitante')
    })

    const handleSignOut = async () => {
        if (isLoggingOut) return;
        if (userRole === 'recepcion' && isBoxOpen) {
            return toast.error('¡Caja Abierta! Cerrala antes de salir.')
        }
        setIsLoggingOut(true)
        try {
            await supabase.auth.signOut()
        } finally {
            window.location.href = '/'
        }
    }

    if (isLoading) return <div className="w-64 bg-[#09090b] border-r border-white/5 hidden md:flex" />

    return (
        <aside className="w-64 bg-[#09090b] border-r border-white/5 hidden md:flex flex-col h-screen sticky top-0">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <Link href="/" className="font-black text-2xl tracking-tighter text-white hover:text-[#D4E655] transition-colors">
                    PISO<span className="text-[#D4E655]">2</span>
                </Link>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
                <div className="mb-4 px-3">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        {userRole === 'admin' ? <Shield size={12} className="text-red-500" /> : userRole === 'recepcion' ? <Radio size={12} className="text-blue-500" /> : userRole === 'visitante' ? <UserCircle size={12} /> : <UsersRound size={12} />}
                        {userRole || 'visitante'}
                    </p>
                </div>

                {visibleItems.map((item) => {
                    let isActive = false;
                    if (item.name === 'Staff / Equipo') {
                        isActive = pathname === '/usuarios' && searchParams.get('ver') === 'staff';
                    } else if (item.name === 'Alumnos / Profes') {
                        isActive = pathname === '/usuarios' && searchParams.get('ver') !== 'staff';
                    } else {
                        isActive = pathname === item.href;
                    }

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${isActive ? 'bg-[#D4E655] text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                            {item.name}
                            {item.name === 'Notificaciones' && unreadNotifs > 0 && (
                                <span className={`ml-auto w-5 h-5 flex items-center justify-center rounded-full text-[9px] font-black ${isActive ? 'bg-black text-[#D4E655]' : 'bg-[#D4E655] text-black'}`}>
                                    {unreadNotifs}
                                </span>
                            )}
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 border-t border-white/5">
                {userRole === 'visitante' ? (
                    <Link href="/login" className="flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all bg-[#D4E655]/10 text-[#D4E655] hover:bg-[#D4E655] hover:text-black">
                        <LogIn size={18} /> Iniciar Sesión
                    </Link>
                ) : (
                    <button
                        onClick={handleSignOut}
                        disabled={isLoggingOut}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all text-gray-500 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                    >
                        <LogOut size={18} /> {isLoggingOut ? 'Saliendo...' : 'Cerrar Sesión'}
                    </button>
                )}
            </div>
        </aside>
    )
}

// EL ESCUDO ESTÁ ACÁ 👇
export default function Sidebar() {
    return (
        <Suspense fallback={<div className="w-64 bg-[#09090b] border-r border-white/5 hidden md:flex" />}>
            <SidebarContent />
        </Suspense>
    )
}