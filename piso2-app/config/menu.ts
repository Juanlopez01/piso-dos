import {
    LayoutDashboard,
    CalendarDays,
    Users,
    CreditCard,
    Settings,
    Map,
    UserCircle,
    UserCheck,
    Music
} from 'lucide-react'

export const menuItems = [
    { name: 'Inicio', href: '/', icon: LayoutDashboard, roles: ['admin', 'recepcion'] },
    { name: 'Agenda', href: '/calendario', icon: CalendarDays, roles: ['admin', 'recepcion'] },
    { name: 'Alquileres', href: '/alquileres', icon: Music, roles: ['admin', 'recepcion'] }, // Lo sumamos que es clave
    { name: 'Alumnos', href: '/alumnos', icon: UserCheck, roles: ['admin', 'recepcion'] },
    { name: 'Caja', href: '/caja', icon: CreditCard, roles: ['admin', 'recepcion'] },

    // Solo Admins (Gestión y Configuración)
    { name: 'Usuarios / Staff', href: '/usuarios', icon: Users, roles: ['admin'] },
    { name: 'Sedes', href: '/sedes', icon: Map, roles: ['admin'] },
    { name: 'Ajustes', href: '/configuracion', icon: Settings, roles: ['admin'] },

    // Perfil (Todos)
    { name: 'Mi Perfil', href: '/perfil', icon: UserCircle, roles: ['admin', 'recepcion'] },
]