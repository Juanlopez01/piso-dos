'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, UserCircle, Loader2 } from 'lucide-react'
import { menuItems } from '@/config/menu' // Ajustá la ruta según donde lo tengas

export default function Sidebar() {
    const pathname = usePathname()
    const supabase = createClient()
    const [role, setRole] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function getRole() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
                setRole(data?.rol || 'recepcion')
            }
            setLoading(false)
        }
        getRole()
    }, [])

    // Filtramos el menú por el rol obtenido
    const filteredMenu = menuItems.filter(item => item.roles.includes(role || ''))

    if (loading) {
        return (
            <div className="flex flex-col h-full p-8 items-center bg-[#09090b]">
                <Loader2 className="animate-spin text-[#D4E655]" />
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full p-4 bg-[#09090b]">
            {/* BRAND / LOGO */}
            <div className="mb-10 px-4 pt-4">
                <h1 className="text-2xl font-black text-white uppercase tracking-tighter italic leading-none">Piso 2</h1>
                <p className="text-[9px] text-[#D4E655] font-black uppercase tracking-[0.3em] mt-1">Management</p>
            </div>

            {/* NAV LINKS */}
            <nav className="flex-1 space-y-1">
                {filteredMenu.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all uppercase tracking-tight ${isActive
                                ? 'bg-[#D4E655] text-black shadow-[0_0_20px_rgba(212,230,85,0.15)]'
                                : 'text-gray-500 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <item.icon size={20} strokeWidth={isActive ? 3 : 2} />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            {/* PROFILE & LOGOUT SECTION */}
            <div className="pt-4 border-t border-white/10">
                <div className="px-4 py-3 flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-[#D4E655]/10 flex items-center justify-center text-[#D4E655]">
                        <UserCircle size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-gray-500 uppercase leading-none mb-1">Sesión</p>
                        <p className="text-xs font-bold text-white uppercase truncate">{role === 'admin' ? 'Administrador' : 'Recepción'}</p>
                    </div>
                </div>
                <button
                    onClick={async () => {
                        await supabase.auth.signOut()
                        window.location.href = '/login'
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-red-500 transition-colors font-bold text-xs uppercase"
                >
                    <LogOut size={18} /> Cerrar Sesión
                </button>
            </div>
        </div>
    )
}