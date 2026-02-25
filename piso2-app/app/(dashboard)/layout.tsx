'use client' // <--- IMPORTANTE: Agregá esto al principio si no estaba

import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import { usePathname } from "next/navigation"; // <--- 1. Importar esto

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 2. Obtener la ruta actual
    const pathname = usePathname();

    return (
        <div className="flex h-screen w-full bg-[#050505] overflow-hidden">

            {/* Sidebar Fijo */}
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0">

                <MobileNav />

                <main className="flex-1 overflow-y-auto p-4 md:p-0 scroll-smooth">
                    <div className="max-w-7xl mx-auto w-full">

                        {/* 3. EL TRUCO MÁGICO: key={pathname} */}
                        {/* Esto obliga a que el contenido se reinicie al cambiar de link */}
                        <div key={pathname} className="animate-in fade-in duration-300">
                            {children}
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}