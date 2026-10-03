import { Home, Calendar as CalendarIcon, CalendarCheck, Users, Settings, Package, ShoppingBag, MapPin, Bell, UserCircle, GraduationCap, UsersRound, Search, ShoppingBagIcon, BookOpen, Wallet, FileSpreadsheet, Megaphone, Sparkles, Link2, MessageCircle, Ticket, Theater, ClipboardList } from 'lucide-react'

// Tópicos del menú. Se muestran en este orden; el header aparece solo si el rol
// tiene al menos un item visible en ese grupo. Los grupos sin label (top/cuenta)
// se renderizan sin encabezado (arriba de todo / abajo de todo).
export const menuGroups: { key: string; label: string | null }[] = [
    { key: 'top', label: null },
    { key: 'miespacio', label: 'Mi espacio' },
    { key: 'recepcion', label: 'Recepción' },
    { key: 'escuela', label: 'Escuela' },
    { key: 'comunicacion', label: 'Comunicación' },
    { key: 'piso2e', label: 'PISO2E' },
    { key: 'admin', label: 'Administración' },
    { key: 'cuenta', label: null },
]

export const menuItems = [
    // --- TOP: LOS 4 BOTONES DE ALUMNOS Y PROFES (Para el menú del celu) ---
    // El ORDEN de este array define la barra inferior del celular (primeros 4).
    { name: 'Explorar', href: '/explorar', icon: Search, grupo: 'top', roles: ['admin', 'coordinador', 'alumno', 'visitante', 'recepcion', 'auxiliar', 'vendedor'] },
    { name: 'Mi Perfil', href: '/perfil', icon: UserCircle, grupo: 'cuenta', roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno', 'auxiliar', 'vendedor', 'audiciones'] },
    { name: 'Mis Clases', href: '/mis-clases', icon: BookOpen, grupo: 'miespacio', roles: ['profesor', 'alumno'] },
    { name: 'Tienda', href: '/tienda', icon: ShoppingBagIcon, grupo: 'miespacio', roles: ['admin', 'coordinador', 'alumno'] },
    { name: 'Mis Pagos', href: '/mis-pagos', icon: Wallet, grupo: 'miespacio', roles: ['profesor'] },
    { name: 'Notificaciones', href: '/notificaciones', icon: Bell, grupo: 'cuenta', roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno', 'auxiliar', 'vendedor', 'audiciones'] },
    // Vendedor 1: su única herramienta
    { name: 'Ventas', href: '/vender', icon: Link2, grupo: 'top', roles: ['vendedor'] },

    // --- RESTO DEL MENÚ ---
    { name: 'Inicio', href: '/', icon: Home, grupo: 'top', roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'alumno', 'visitante', 'auxiliar', 'vendedor', 'audiciones'] },
    { name: 'Agenda', href: '/calendario', icon: CalendarIcon, grupo: 'recepcion', roles: ['admin', 'recepcion', 'profesor', 'coordinador', 'visitante', 'auxiliar'] },
    { name: 'Alumnos / Profes', href: '/usuarios', icon: Users, grupo: 'escuela', roles: ['admin', 'recepcion'] },
    { name: 'Staff / Equipo', href: '/usuarios?ver=staff', icon: Settings, grupo: 'admin', roles: ['admin'] },
    { name: 'Alquileres', href: '/alquileres', icon: ShoppingBag, grupo: 'recepcion', roles: ['admin', 'recepcion', 'auxiliar'] },
    { name: 'Productos', href: '/productos', icon: Package, grupo: 'recepcion', roles: ['admin', 'recepcion'] },
    { name: 'Caja', href: '/caja', icon: ShoppingBag, grupo: 'recepcion', roles: ['admin', 'recepcion', 'auxiliar'] },
    { name: 'Administración', href: '/reporte-caja', icon: Wallet, grupo: 'admin', roles: ['admin', 'recepcion'] },
    { name: 'Métricas', href: '/metricas', icon: FileSpreadsheet, grupo: 'admin', roles: ['admin'] },
    { name: 'Liquidaciones', href: '/liquidaciones', icon: FileSpreadsheet, grupo: 'admin', roles: ['admin', 'recepcion'] },
    { name: 'Remarketing', href: '/remarketing', icon: Megaphone, grupo: 'comunicacion', roles: ['admin', 'recepcion'] },
    { name: 'Sedes', href: '/sedes', icon: MapPin, grupo: 'admin', roles: ['admin'] },
    { name: 'Grupos', href: '/companias', icon: UsersRound, grupo: 'escuela', roles: ['admin', 'coordinador', 'profesor', 'alumno'] },
    { name: 'Talents', href: '/talents', icon: Sparkles, grupo: 'escuela', roles: ['admin'] },
    { name: 'Consultas', href: '/consultas', icon: MessageCircle, grupo: 'comunicacion', roles: ['admin', 'recepcion'] },
    { name: 'Resumen Clases', href: '/resumen-clases', icon: ClipboardList, grupo: 'escuela', roles: ['admin', 'recepcion'] },
    { name: 'Eventos', href: '/eventos', icon: Ticket, grupo: 'piso2e', roles: ['admin', 'recepcion', 'curador'] },
    { name: 'Cartelera', href: '/funciones', icon: CalendarCheck, grupo: 'piso2e', roles: ['admin', 'recepcion', 'curador', 'jefe_sala', 'tecnica'] },
    { name: 'Curaduría', href: '/curaduria', icon: Theater, grupo: 'piso2e', roles: ['admin', 'recepcion', 'curador'] },
    { name: 'Piso 2 On Tour', href: '/audiciones', icon: Sparkles, grupo: 'escuela', roles: ['admin', 'audiciones'] },
    { name: 'Sumate a Talent', href: '/talent/postular', icon: Sparkles, grupo: 'miespacio', roles: ['alumno', 'profesor', 'coordinador'] },
    { name: 'La Liga', href: '/la-liga', icon: GraduationCap, grupo: 'escuela', roles: ['admin', 'profesor', 'coordinador', 'alumno', 'auxiliar'] },
    { name: 'Alquilar sala', href: '/alquilar-sala', icon: ShoppingBagIcon, grupo: 'miespacio', roles: ['admin', 'profesor', 'coordinador', 'alumno'] },
]
