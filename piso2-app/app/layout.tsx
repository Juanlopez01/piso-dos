import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { CashProvider } from "@/context/CashContext";
import SWRProvider from "@/components/SWRProvider";
import type { Metadata, Viewport } from 'next'

// 🚀 1. IMPORTÁ TU SIDEBAR ACÁ (Cambiá la ruta si está en otra carpeta)
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export const metadata: Metadata = {
  title: 'Piso 2 | La Liga',
  description: 'Gestión y Programa de Formación',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Piso 2',
  },
}

export const viewport: Viewport = {
  themeColor: '#050505',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      {/* 🚀 2. Le agregamos "flex" al body para poner el sidebar al lado del contenido */}
      <body className={`${inter.className} bg-[#050505] text-white min-h-screen antialiased flex`}>

        <SWRProvider>
          <CashProvider>


            {/* 4. Envolvemos a children en un main que ocupe el resto del espacio */}
            <main className="flex-1 min-w-0">
              {children}
            </main>

            <Toaster position="top-center" richColors theme="dark" />

          </CashProvider>
        </SWRProvider>

      </body>
    </html>
  );
}