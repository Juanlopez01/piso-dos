'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LogOut, UserCircle, Shield, Radio, LogIn, UsersRound } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { menuItems } from '@/config/menu'
import { useCash } from '@/context/CashContext'
import { toast } from 'sonner'

export default function MobileNav() {
    const [isOpen, setIsOpen] = useState(false) // Controla si el menú está abierto
    const pathname = usePathname()
    const supabase = createClient()

    // 👈 1. Conectamos los accesos inteligentes del contexto
    const { isBoxOpen, userRole, userName, hasLigaAccess, hasCompaniaAccess, isLoading } = useCash()

    const handleSignOut = async () => {
        if (userRole === 'recepcion' && isBoxOpen) {
            return toast.error('¡Caja Abierta! Cerrala antes de salir.')
        }
        await supabase.auth.signOut()
        window.location.href = '/'
    }

    // --- LÓGICA DE MENÚ (IDÉNTICA AL SIDEBAR) ---
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

    return (
        <>
            {/* BARRA SUPERIOR (Visible solo en móvil) */}
            <div className="md:hidden h-16 bg-[#09090b] border-b border-white/10 flex items-center justify-between px-4 sticky top-0 z-40 shrink-0">

                {/* LOGO + INDICADOR */}
                <div className="flex flex-col justify-center">
                    <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">
                        Piso <span className="text-[#D4E655]">2</span>
                    </h1>
                    {/* Indicador de Caja (Solo Staff) */}
                    {!isLoading && role === 'recepcion' && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${isBoxOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                            <span className="text-[9px] uppercase font-bold text-gray-500">
                                {isBoxOpen ? 'Abierta' : 'Cerrada'}
                            </span>
                        </div>
                    )}
                </div>

                {/* BOTÓN HAMBURGUESA */}
                <button
                    onClick={() => setIsOpen(true)}
                    className="p-2 text-white hover:bg-white/10 rounded-xl transition-all"
                >
                    <Menu size={24} />
                </button>
            </div>

            {/* MENÚ DESPLEGABLE (OVERLAY) */}
            {isOpen && (
                <div className="fixed inset-0 z-50 md:hidden flex flex-col">

                    {/* FONDO OSCURO (Click para cerrar) */}
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* CONTENIDO DEL MENÚ (Desliza desde la derecha) */}
                    <div className="relative w-4/5 max-w-xs h-full bg-[#09090b] border-l border-white/10 ml-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">

                        {/* CABECERA DEL MENÚ */}
                        <div className="p-6 flex items-center justify-between border-b border-white/10">
                            <h2 className="text-lg font-black uppercase text-white">Menú</h2>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* LISTA DE NAVEGACIÓN */}
                        <nav className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {isLoading ? (
                                // Esqueleto simple
                                [1, 2, 3].map(i => <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />)
                            ) : (
                                visibleItems.map((item) => {
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setIsOpen(false)} // Cerrar al hacer click
                                            className={`
                                                flex items-center gap-4 px-4 py-4 rounded-xl text-sm font-bold transition-all
                                                ${isActive
                                                    ? "bg-[#D4E655] text-black shadow-[0_0_15px_rgba(212,230,85,0.3)]"
                                                    : "text-gray-400 hover:text-white hover:bg-white/5"}
                                            `}
                                        >
                                            <item.icon size={20} />
                                            {item.name}
                                        </Link>
                                    )
                                })
                            )}
                        </nav>

                        {/* FOOTER DEL MENÚ */}
                        <div className="p-4 border-t border-white/10 bg-[#050505]">
                            {!isLoading && role !== 'visitante' ? (
                                <>
                                    <div className="flex items-center gap-3 mb-4 px-2">
                                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                                            <UserCircle size={24} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-bold text-white truncate">{userName || 'Usuario'}</p>
                                            <p className="text-[10px] text-[#D4E655] uppercase font-black flex items-center gap-1">
                                                {role === 'admin' ? <Shield size={10} /> : role === 'coordinador' ? <UsersRound size={10} /> : <Radio size={10} />} {role}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={handleSignOut} className="flex items-center justify-center gap-2 w-full px-4 py-4 text-xs font-black uppercase text-red-500 bg-red-500/10 hover:bg-red-500 hover:text-white rounded-xl transition-all">
                                        <LogOut size={16} /> Cerrar Sesión
                                    </button>
                                </>
                            ) : (
                                <Link href="/login" onClick={() => setIsOpen(false)} className="flex items-center justify-center gap-2 w-full px-4 py-4 text-xs font-black uppercase text-[#D4E655] bg-[#D4E655]/10 hover:bg-[#D4E655] hover:text-black rounded-xl transition-all">
                                    <LogIn size={16} /> Iniciar Sesión
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}