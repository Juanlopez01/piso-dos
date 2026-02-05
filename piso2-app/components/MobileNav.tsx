'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { menuItems } from '@/config/menu'

export default function MobileNav() {
    const pathname = usePathname()

    // TRUCO: 'md:hidden' hace que desaparezca en PC
    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-black border-t border-white/10 h-16 z-50 md:hidden pb-safe">
            <div className="flex justify-around items-center h-full">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center justify-center w-full h-full space-y-1
                ${isActive ? 'text-piso2-lime' : 'text-gray-500'}
              `}
                        >
                            {/* Icono un poco más grande para el dedo */}
                            <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />

                            {/* Texto chiquito (opcional, a veces solo el icono queda mejor) */}
                            <span className="text-[10px] font-bold uppercase tracking-wide">
                                {item.name}
                            </span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}