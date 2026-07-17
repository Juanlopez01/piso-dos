import { Home, Calendar as CalendarIcon, Users, Settings, Package, ShoppingBag, MapPin, Bell, UserCircle, GraduationCap, UsersRound, Search, ShoppingBagIcon, BookOpen, Wallet, FileSpreadsheet, Megaphone, Sparkles, Link2 } from 'lucide-react'

export const menuItems = [
    // --- TOP: LOS 4 BOTONES DE ALUMNOS Y PROFES (Para el menú del celu) ---
    // Alumno 1
    { name: 'Explorar', href: '/explorar', icon: Search, roles: ['admin', 'coordinador', 'alumno', 'visitante', 'recepcion', 'auxiliar'] },
    // Alumno 2 | Profe 1
    { name: 'Mi Perfil', href: '/perfil', icon: UserCircle, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno', 'auxiliar', 'vendedor'] },
    // Alumno 3 | Profe 2
    { name: 'Mis Clases', href: '/mis-clases', icon: BookOpen, roles: ['profesor', 'alumno'] },
    // Alumno 4
    { name: 'Tienda', href: '/tienda', icon: ShoppingBagIcon, roles: ['admin', 'coordinador', 'alumno'] },
    // Profe 3
    { name: 'Mis Pagos', href: '/mis-pagos', icon: Wallet, roles: ['profesor'] },
    // Profe 4
    { name: 'Notificaciones', href: '/notificaciones', icon: Bell, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno', 'auxiliar', 'vendedor'] },
    // Vendedor 1: su única herramienta
    { name: 'Links de Pago', href: '/vender', icon: Link2, roles: ['admin', 'vendedor'] },

    // --- RESTO DEL MENÚ (Para Admin, Recepción y vistas generales) ---
    { name: 'Inicio', href: '/', icon: Home, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno', 'visitante', 'auxiliar', 'vendedor'] },
    { name: 'Agenda', href: '/calendario', icon: CalendarIcon, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'visitante', 'auxiliar'] },
    { name: 'Alumnos / Profes', href: '/usuarios', icon: Users, roles: ['admin', 'recepcion'] },
    { name: 'Staff / Equipo', href: '/usuarios?ver=staff', icon: Settings, roles: ['admin'] },
    { name: 'Alquileres', href: '/alquileres', icon: ShoppingBag, roles: ['admin', 'recepcion'] },
    { name: 'Productos', href: '/productos', icon: Package, roles: ['admin', 'recepcion'] },
    { name: 'Caja', href: '/caja', icon: ShoppingBag, roles: ['admin', 'recepcion', 'auxiliar'] },
    {
        name: 'Liquidaciones',
        href: '/liquidaciones',
        icon: FileSpreadsheet,
        roles: ['admin', 'recepcion']
    },
    {
        name: 'Remarketing',
        href: '/remarketing',
        icon: Megaphone,
        roles: ['admin', 'recepcion']
    },
    { name: 'Sedes', href: '/sedes', icon: MapPin, roles: ['admin'] },
    { name: 'Grupos', href: '/companias', icon: UsersRound, roles: ['admin', 'coordinador', 'profesor', 'alumno'] },
    { name: 'Talents', href: '/talents', icon: Sparkles, roles: ['admin'] },
    { name: 'La Liga', href: '/la-liga', icon: GraduationCap, roles: ['admin', 'profesor', 'coordinador', 'alumno', 'auxiliar'] },
    { name: 'Alquilar sala', href: '/alquilar-sala', icon: ShoppingBagIcon, roles: ['admin', 'profesor', 'coordinador', 'alumno'] },
]