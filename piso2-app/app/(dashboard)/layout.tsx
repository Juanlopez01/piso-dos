import Sidebar from '@/components/Sidebar'
import MobileNav from '@/components/MobileNav'
import CajaApertura from '@/components/CajaApertura'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-screen w-full bg-[#050505] text-white overflow-hidden">

            {/* 1. SIDEBAR ESCRITORIO */}
            {/* - hidden md:flex: Se oculta en móvil, aparece flexible en escritorio.
          - w-64: Ancho fijo.
          - shrink-0: CLAVE. Prohibido achicarse.
      */}
            <aside className="hidden md:flex w-64 flex-col border-r border-white/10 bg-[#09090b] h-full shrink-0">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <Sidebar />
                </div>
            </aside>

            {/* 2. CONTENEDOR PRINCIPAL */}
            {/* min-w-0: CLAVE. Evita que tablas anchas rompan el layout */}
            <div className="flex-1 flex flex-col min-w-0 relative h-full">

                {/* Modal de Caja (Siempre disponible, invisible hasta que se activa) */}
                <CajaApertura />

                {/* 3. MAIN CONTENT (Scrollable) */}
                {/* pb-24 en móvil para que el menú de abajo no tape el contenido */}
                <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#050505] pb-24 md:pb-0">
                    <div className="h-full w-full">
                        {children}
                    </div>
                </main>

                {/* 4. MOBILE NAV (Solo Móvil - Fijo Abajo) */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#09090b] border-t border-white/10">
                    <MobileNav />
                </div>
            </div>
        </div>
    )
}