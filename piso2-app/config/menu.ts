import {
    LayoutDashboard,
    CalendarDays,
    Users,
    CreditCard,
    Settings,
    Map
} from 'lucide-react'

export const menuItems = [
    { name: 'Inicio', href: '/', icon: LayoutDashboard },
    { name: 'Agenda', href: '/calendario', icon: CalendarDays },
    { name: 'Alumnos', href: '/alumnos', icon: Users },
    { name: 'Usuarios', href: '/usuarios', icon: Users },
    { name: 'Caja', href: '/caja', icon: CreditCard },
    { name: 'Sedes', href: '/sedes', icon: Map },
    { name: 'Ajustes', href: '/configuracion', icon: Settings },
    { name: 'Mi Perfil', href: '/perfil', icon: Users },
]