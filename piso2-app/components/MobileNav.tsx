'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { menuItems } from '@/config/menu'

export default function MobileNav() {
    const pathname = usePathname()
    const supabase = createClient()
    const [role, setRole] = useState<string | null>(null)

    useEffect(() => {
        async function getRole() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
                setRole(data?.rol)
            }
        }
        getRole()
    }, [])

    // Filtramos por rol y limitamos a 5 items para que quepan bien abajo
    const filteredMenu = menuItems
        .filter(item => item.roles.includes(role || ''))
        .slice(0, 5)

    return (
        <nav className="bg-[#09090b]/90 backdrop-blur-xl border-t border-white/10 pb-safe pt-2 px-2 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
            <div className="flex justify-around items-center h-16">
                {filteredMenu.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center gap-1 transition-all flex-1 ${isActive ? 'text-[#D4E655]' : 'text-gray-500'}`}
                        >
                            <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-[#D4E655]/10' : ''}`}>
                                <item.icon size={22} strokeWidth={isActive ? 3 : 2} />
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest leading-none">{item.name}</span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}