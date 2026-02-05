import Sidebar from '@/components/Sidebar'
import MobileNav from '@/components/MobileNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-piso2-dark">
            {/* NAVEGACIÓN */}
            <Sidebar />
            <MobileNav />

            {/* CONTENEDOR DEL CONTENIDO
        md:ml-64 -> En PC, deja margen a la izquierda para el Sidebar
        pb-20    -> En Móvil, deja padding abajo para que la barra no tape el contenido
        md:pb-8  -> En PC, saca ese padding de abajo excesivo
      */}
            <main className="md:ml-64 pb-24 md:pb-8 p-4 md:p-8 transition-all duration-300">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    )
}