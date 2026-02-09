'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { menuItems } from '@/config/menu'
import { LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }
    // SI ESTAMOS EN LA LANDING O LOGIN, DESAPARECER
    if (pathname === '/' || pathname === '/login') return null;
    // TRUCO: 'hidden md:flex' hace que desaparezca en móviles
    return (
        <aside className="hidden md:flex w-64 bg-black border-r border-white/10 h-screen flex-col fixed left-0 top-0 z-50">

            {/* LOGO */}
            <div className="h-20 flex items-center justify-center border-b border-white/10">
                <h1 className="text-2xl font-black text-white tracking-tighter">
                    PISO<span className="text-piso2-lime">2</span>
                </h1>
            </div>

            {/* MENÚ VERTICAL */}
            <nav className="flex-1 p-4 space-y-2">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-md transition-all text-sm font-bold uppercase tracking-wider
                ${isActive
                                    ? 'bg-piso2-lime text-black shadow-[0_0_15px_rgba(204,255,0,0.3)]'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }
              `}
                        >
                            <item.icon size={20} />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            {/* BOTÓN SALIR */}
            <div className="p-4 border-t border-white/10">
                <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-3 text-red-500 hover:bg-red-500/10 rounded-md transition-colors text-xs font-bold uppercase">
                    <LogOut size={18} /> Salir
                </button>
            </div>
        </aside>
    )
}