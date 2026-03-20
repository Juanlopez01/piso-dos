import { Home, Calendar as CalendarIcon, Users, Settings, Package, ShoppingBag, MapPin, Bell, UserCircle, GraduationCap, UsersRound } from 'lucide-react'

export const menuItems = [
    { name: 'Inicio', href: '/', icon: Home, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno', 'visitante'] },
    { name: 'Agenda', href: '/calendario', icon: CalendarIcon, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno', 'visitante'] },
    { name: 'Alumnos / Profes', href: '/usuarios', icon: Users, roles: ['admin', 'recepcion'] },
    { name: 'Staff / Equipo', href: '/staff', icon: Settings, roles: ['admin'] },
    { name: 'Alquileres', href: '/alquileres', icon: ShoppingBag, roles: ['admin', 'recepcion'] },
    { name: 'Productos', href: '/productos', icon: Package, roles: ['admin', 'recepcion'] },
    { name: 'Caja', href: '/caja', icon: ShoppingBag, roles: ['admin', 'recepcion'] },
    { name: 'Sedes', href: '/sedes', icon: MapPin, roles: ['admin'] },
    // 👇 Agregamos Compañías
    { name: 'Compañías', href: '/companias', icon: UsersRound, roles: ['admin', 'coordinador'] },
    // Sumamos al coordinador acá 👇
    { name: 'La Liga', href: '/la-liga', icon: GraduationCap, roles: ['admin', 'profesor', 'coordinador', 'alumno'] },
    { name: 'Notificaciones', href: '/notificaciones', icon: Bell, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno'] },
    { name: 'Mi Perfil', href: '/perfil', icon: UserCircle, roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno'] },
]