import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-piso2-dark">
            {/* 1. Sidebar Fijo (Solo Desktop) */}
            <Sidebar />

            {/* 2. Barra Móvil Fija (Solo Celular) */}
            <MobileNav />

            {/* 3. Contenedor Principal
         - md:ml-64: Deja espacio a la izquierda en PC
         - pb-20: Deja espacio abajo en Celular (para la barra)
      */}
            <main className="flex-1 md:ml-64 p-4 md:p-8 pb-24 md:pb-8 transition-all duration-300 w-full">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}