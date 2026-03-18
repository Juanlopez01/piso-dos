
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { CashProvider } from "@/context/CashContext"; // <--- 1. IMPORTARLO
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Piso 2 | La Liga',
  description: 'Gestión y Programa de Formación',
  manifest: '/manifest.json', // 👈 Esto conecta con el archivo que creamos
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
  userScalable: false, // 👈 Esto evita que el usuario haga zoom pellizcando la pantalla, dándole sensación de App nativa
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

        {/* 2. EL ABRAZO: El Provider tiene que envolver TODO */}
        <CashProvider>

          {/* Aquí adentro está toda tu app (Sidebar, Páginas, etc) */}
          {children}

          <Toaster position="top-center" richColors theme="dark" />

        </CashProvider>

      </body>
    </html>
  );
}