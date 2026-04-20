import { Home, Calendar as CalendarIcon, Users, Settings, Package, ShoppingBag, MapPin, Bell, UserCircle, GraduationCap, UsersRound, Search, ShoppingBagIcon, BookOpen, Wallet, FileSpreadsheet } from 'lucide-react'

export const menuItems = [
    // --- TOP: LOS 4 BOTONES DE ALUMNOS Y PROFES (Para el menú del celu) ---
    // Alumno 1
    { name: 'Explorar', href: '/explorar', icon: Search, roles: ['admin', 'coordinador', 'alumno', 'visitante', 'recepcion'] },
    // Alumno 2 | Profe 1
    { name: 'Mi Perfil', href: '/perfil', icon: UserCircle, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno'] },
    // Alumno 3 | Profe 2
    { name: 'Mis Clases', href: '/mis-clases', icon: BookOpen, roles: ['profesor', 'alumno'] },
    // Alumno 4
    { name: 'Tienda', href: '/tienda', icon: ShoppingBagIcon, roles: ['admin', 'coordinador', 'alumno'] },
    // Profe 3
    { name: 'Mis Pagos', href: '/mis-pagos', icon: Wallet, roles: ['profesor'] },
    // Profe 4
    { name: 'Notificaciones', href: '/notificaciones', icon: Bell, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno'] },

    // --- RESTO DEL MENÚ (Para Admin, Recepción y vistas generales) ---
    { name: 'Inicio', href: '/', icon: Home, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno', 'visitante'] },
    { name: 'Agenda', href: '/calendario', icon: CalendarIcon, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'visitante'] },
    { name: 'Alumnos / Profes', href: '/usuarios', icon: Users, roles: ['admin', 'recepcion'] },
    { name: 'Staff / Equipo', href: '/usuarios?ver=staff', icon: Settings, roles: ['admin'] },
    { name: 'Alquileres', href: '/alquileres', icon: ShoppingBag, roles: ['admin', 'recepcion'] },
    { name: 'Productos', href: '/productos', icon: Package, roles: ['admin', 'recepcion'] },
    { name: 'Caja', href: '/caja', icon: ShoppingBag, roles: ['admin', 'recepcion'] },
    {
        name: 'Liquidaciones',
        href: '/liquidaciones',
        icon: FileSpreadsheet, // Importá FileSpreadsheet de lucide-react
        roles: ['admin', 'recepcion']
    },
    { name: 'Sedes', href: '/sedes', icon: MapPin, roles: ['admin'] },
    { name: 'Compañías', href: '/companias', icon: UsersRound, roles: ['admin', 'coordinador', 'profesor', 'alumno'] },
    { name: 'La Liga', href: '/la-liga', icon: GraduationCap, roles: ['admin', 'profesor', 'coordinador', 'alumno'] },
    { name: 'Alquilar sala', href: '/alquilar-sala', icon: ShoppingBagIcon, roles: ['admin', 'profesor', 'coordinador', 'alumno'] },
]