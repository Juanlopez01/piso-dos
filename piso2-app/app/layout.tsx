import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { CashProvider } from "@/context/CashContext";
import SWRProvider from "@/components/SWRProvider"; // <--- 1. IMPORTAMOS EL NUEVO PROVIDER
import type { Metadata, Viewport } from 'next'

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
      <body className={`${inter.className} bg-[#050505] text-white min-h-screen antialiased`}>

        {/* 2. EL GRAN ABRAZO: El SWRProvider envuelve toda la app para aplicar la config global */}
        <SWRProvider>
          <CashProvider>

            {/* Aquí adentro está toda tu app (Sidebar, Páginas, etc) */}
            {children}

            <Toaster position="top-center" richColors theme="dark" />

          </CashProvider>
        </SWRProvider>

      </body>
    </html>
  );
}