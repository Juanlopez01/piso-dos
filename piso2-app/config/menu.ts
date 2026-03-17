import {
    LayoutDashboard,
    CalendarDays,
    Users,
    CreditCard,
    Settings,
    Map,
    UserCircle,
    GraduationCap,
    ShoppingBasket,
    BookOpen,
    Wallet,
    Search,
    Store,
    Bell, // <-- Importamos el ícono de la campana
    MapPin
} from 'lucide-react'

export const menuItems = [
    // --- ADMIN Y RECEPCIÓN ---
    { name: 'Inicio', href: '/', icon: LayoutDashboard, roles: ['admin', 'recepcion'] },
    { name: 'Agenda', href: '/calendario', icon: CalendarDays, roles: ['admin', 'recepcion'] },
    { name: 'Alumnos / Profes', href: '/usuarios?ver=alumno', icon: GraduationCap, roles: ['admin', 'recepcion'] },
    { name: 'Alquileres', href: '/alquileres', icon: MapPin, roles: ['admin', 'recepcion'] },
    { name: 'Staff / Equipo', href: '/usuarios?ver=staff', icon: Users, roles: ['admin'] },
    { name: 'Productos', href: '/productos', icon: ShoppingBasket, roles: ['admin', 'recepcion'] },
    { name: 'Caja', href: '/caja', icon: CreditCard, roles: ['admin', 'recepcion'] },
    { name: 'Sedes', href: '/sedes', icon: Map, roles: ['admin'] },
    { name: 'Ajustes', href: '/configuracion', icon: Settings, roles: ['admin'] },
    // --- ALUMNO ---
    { name: 'Explorar', href: '/explorar', icon: Search, roles: ['alumno'] },
    { name: 'Tienda', href: '/tienda', icon: Store, roles: ['alumno'] },
    { name: 'Alquilar Sala', href: '/alquilar-sala', icon: MapPin, roles: ['alumno'] },
    // --- COMPARTIDO (PROFESOR Y ALUMNO) ---
    { name: 'Mis Clases', href: '/mis-clases', icon: BookOpen, roles: ['profesor', 'alumno'] },
    { name: 'La Liga', href: '/la-liga', icon: BookOpen, roles: ['profesor', 'alumno'] },

    // --- SOLO PROFESOR ---
    { name: 'Mis Pagos', href: '/mis-pagos', icon: Wallet, roles: ['profesor'] },

    // --- GENERALES (TODOS) ---
    // Agregamos Notificaciones para TODOS
    { name: 'Notificaciones', href: '/notificaciones', icon: Bell, roles: ['admin', 'recepcion', 'profesor', 'alumno'] },
    { name: 'Mi Perfil', href: '/perfil', icon: UserCircle, roles: ['admin', 'recepcion', 'profesor', 'alumno'] },
]