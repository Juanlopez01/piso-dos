'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home, Calendar, Users, DollarSign, User, ClipboardCheck, History } from 'lucide-react'

// CONFIGURACIÓN DE MENÚ
const ALL_ITEMS = [
    { name: 'Inicio', href: '/', icon: Home }, // Dashboard general (si está vacío, redirigir)
    { name: 'Agenda', href: '/calendario', icon: Calendar }, // Ver clases disponibles
    { name: 'Asistencia', href: '/asistencia', icon: ClipboardCheck }, // Tomar lista (Profe/Admin)
    { name: 'Mis Clases', href: '/mis-clases', icon: History }, // Ver mi historial (Alumno)
    { name: 'Usuarios', href: '/usuarios', icon: Users }, // Gestión (Admin)
    // { name: 'Caja', href: '/caja', icon: DollarSign }, // <-- COMENTADO HASTA QUE ESTÉ LISTO
    { name: 'Perfil', href: '/perfil', icon: User },
]

export default function BottomNavigation() {
    const pathname = usePathname()
    const supabase = createClient()
    const [role, setRole] = useState<string>('alumno')

    useEffect(() => {
        const getRole = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
                if (data) setRole(data.rol)
            }
        }
        getRole()
    }, [])

    // FILTRO ESTRATÉGICO (Aquí definimos qué ve cada uno)
    const getVisibleItems = () => {
        switch (role) {
            case 'admin':
                return ['/calendario', '/usuarios', '/asistencia', '/perfil'] // Saqué '/' home si está vacía

            case 'recepcion':
                return ['/calendario', '/asistencia', '/usuarios', '/perfil']

            case 'profesor':
                return ['/calendario', '/asistencia', '/perfil']

            default: // ALUMNO
                // El alumno ve: Agenda (para saber qué hay), Mis Clases (su historial), Perfil
                return ['/calendario', '/mis-clases', '/perfil']
        }
    }

    const visibleHrefs = getVisibleItems()
    const items = ALL_ITEMS.filter(i => visibleHrefs.includes(i.href))

    // 1. SI ESTAMOS EN LA LANDING O LOGIN, NO MOSTRAR NADA
    if (pathname === '/' || pathname === '/login') return null;

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#09090b]/95 backdrop-blur-md border-t border-white/10 z-50 pb-safe">
            {/* Usamos justify-around para que queden centrados y prolijos */}
            <div className="flex justify-around items-center h-16 px-2">
                {items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center w-full h-full transition-colors ${isActive ? 'text-piso2-lime' : 'text-gray-500'}`}>
                            <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
                            <span className="text-[9px] font-bold uppercase tracking-wide">{item.name}</span>
                            {isActive && <div className="absolute bottom-1 w-1 h-1 bg-piso2-lime rounded-full"></div>}
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}