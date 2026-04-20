'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Menu, X, LogOut, UserCircle, Shield, Radio, LogIn, UsersRound } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { menuItems } from '@/config/menu'
import { useCash } from '@/context/CashContext'
import { toast } from 'sonner'

// 👇 1. Le cambiamos el nombre al componente principal
function MobileNavContent() {
    const [isOpen, setIsOpen] = useState(false)
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [unreadNotifs, setUnreadNotifs] = useState(0)
    const [isLoggingOut, setIsLoggingOut] = useState(false)

    // 🛡️ ESCUDO: Congela la conexión a la base de datos
    const [supabase] = useState(() => createClient())

    const { userRole, isBoxOpen, hasLigaAccess, hasCompaniaAccess, isLoading, userId } = useCash()

    useEffect(() => {
        setIsOpen(false) // Cierra el menú al cambiar de ruta
    }, [pathname, searchParams])

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
        // 1. Filtro de La Liga
        if (item.name === 'La Liga' && !hasLigaAccess) return false;

        // 🚀 2. EL PATOVICA DE COMPAÑÍAS: Si es profe, lo dejamos pasar siempre. 
        // El CashContext ya determinó en hasCompaniaAccess si tiene poderes.
        if (item.name === 'Compañías' && !hasCompaniaAccess && userRole !== 'profesor') return false;

        // 3. Ocultar agenda a alumnos y profes
        if ((userRole === 'alumno' || userRole === 'profesor') && item.name === 'Agenda') return false;

        // 4. Permisos por Rol
        if (userRole === 'admin') return ['Inicio', 'Agenda', 'Explorar', 'Alumnos / Profes', 'Staff / Equipo', 'Productos', 'La Liga', 'Compañías', 'Liquidaciones', 'Caja', 'Sedes', 'Notificaciones', 'Mi Perfil'].includes(item.name)
        if (userRole === 'visitante') return ['Inicio', 'Explorar'].includes(item.name)

        // 🚀 5. PERMISOS DEL PROFE: Agregamos Compañías explícitamente acá
        if (userRole === 'profesor') {
            return ['Inicio', 'Mis Clases', 'Mis Pagos', 'Compañías', 'La Liga', 'Notificaciones', 'Mi Perfil'].includes(item.name)
        }

        if (userRole === 'recepcion') {
            if (!isBoxOpen) return ['Inicio', 'Agenda', 'Caja', 'Mi Perfil', 'Explorar', 'Notificaciones', 'La Liga', 'Compañías'].includes(item.name)
            return ['Inicio', 'Agenda', 'Alumnos / Profes', 'Explorar', 'Alquileres', 'Productos', 'Caja', 'Liquidaciones', 'Notificaciones', 'Mi Perfil', 'La Liga', 'Compañías'].includes(item.name)
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
            window.location.href = '/' // 👈 Redirección dura
        }
    }

    // 👈 Función para que detecte Staff vs Alumnos correctamente
    const checkIsActive = (itemName: string, itemHref: string) => {
        if (itemName === 'Staff / Equipo') {
            return pathname === '/usuarios' && searchParams.get('ver') === 'staff';
        } else if (itemName === 'Alumnos / Profes') {
            return pathname === '/usuarios' && searchParams.get('ver') !== 'staff';
        }
        return pathname === itemHref;
    }

    if (isLoading) return null

    return (
        <div className="md:hidden relative z-50">
            <div className="fixed bottom-0 left-0 right-0 bg-[#09090b] border-t border-white/10 h-16 flex items-center justify-around px-4 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                {visibleItems.slice(0, 4).map((item) => {
                    const isActive = checkIsActive(item.name, item.href)
                    return (
                        <Link key={item.name} href={item.href} className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors relative ${isActive ? 'text-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                            {isActive && <div className="absolute top-0 w-8 h-1 bg-[#D4E655] rounded-b-full shadow-[0_0_10px_rgba(212,230,85,0.5)]"></div>}
                            <div className="relative">
                                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'mt-1' : ''} />
                                {item.name === 'Notificaciones' && unreadNotifs > 0 && (
                                    <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] font-black flex items-center justify-center border border-black shadow-lg">
                                        {unreadNotifs}
                                    </span>
                                )}
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-wider">{item.name}</span>
                        </Link>
                    )
                })}
                <button onClick={() => setIsOpen(!isOpen)} className="flex flex-col items-center justify-center w-16 h-full gap-1 text-gray-500 hover:text-white transition-colors">
                    <Menu size={20} />
                    <span className="text-[8px] font-black uppercase tracking-wider">Menú</span>
                </button>
            </div>

            {/* OVERLAY DEL MENÚ */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex flex-col animate-in fade-in slide-in-from-bottom-10 pb-16">
                    <div className="flex justify-between items-center p-6 border-b border-white/10">
                        <span className="font-black text-2xl tracking-tighter text-white">PISO<span className="text-[#D4E655]">2</span></span>
                        <button onClick={() => setIsOpen(false)} className="p-2 bg-white/5 rounded-full text-white"><X size={20} /></button>
                    </div>

                    <div className="p-4 px-6 flex items-center gap-2 border-b border-white/5 pb-4">
                        {userRole === 'admin' ? <Shield size={14} className="text-red-500" /> : userRole === 'recepcion' ? <Radio size={14} className="text-blue-500" /> : userRole === 'visitante' ? <UserCircle size={14} className="text-gray-500" /> : <UsersRound size={14} className="text-[#D4E655]" />}
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Conectado como: {userRole || 'visitante'}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {visibleItems.map((item) => {
                            const isActive = checkIsActive(item.name, item.href)
                            return (
                                <Link key={item.name} href={item.href} className={`flex items-center gap-4 px-4 py-4 rounded-xl text-sm font-bold uppercase tracking-widest transition-all ${isActive ? 'bg-[#D4E655] text-black shadow-lg' : 'text-gray-300 hover:text-white bg-white/5 hover:bg-white/10'}`}>
                                    <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                                    {item.name}
                                    {item.name === 'Notificaciones' && unreadNotifs > 0 && (
                                        <span className={`ml-auto w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black ${isActive ? 'bg-black text-[#D4E655]' : 'bg-[#D4E655] text-black'}`}>
                                            {unreadNotifs}
                                        </span>
                                    )}
                                </Link>
                            )
                        })}
                    </div>

                    <div className="p-6 border-t border-white/10 mt-auto">
                        {userRole === 'visitante' ? (
                            <Link href="/login" className="flex items-center justify-center gap-3 px-4 py-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all bg-[#D4E655] text-black shadow-[0_0_20px_rgba(212,230,85,0.3)]">
                                <LogIn size={20} /> Iniciar Sesión
                            </Link>
                        ) : (
                            <button onClick={handleSignOut} disabled={isLoggingOut} className="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white disabled:opacity-50">
                                <LogOut size={20} /> {isLoggingOut ? 'Saliendo...' : 'Cerrar Sesión'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// 👇 2. Exportamos por defecto el componente blindado
export default function MobileNav() {
    return (
        <Suspense fallback={<div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#09090b] border-t border-white/10 z-40" />}>
            <MobileNavContent />
        </Suspense>
    )
}