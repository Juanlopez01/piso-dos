import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { CashProvider } from "@/context/CashContext";
import SWRProvider from "@/components/SWRProvider";
import SessionProvider from "@/components/SessionProvider"; // <--- NUEVO

import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Piso 2',
  description: 'Gestión de academia',
  // 👇 AGREGÁ ESTO PARA SALVARLE LA VIDA A LOS iPHONES
  icons: {
    icon: '/tu-logo-192.png', // El ícono normal para pestañas
    apple: '/tu-logo-192.png', // 🚀 ESTE ES EL QUE EXIGE EL iPHONE
  },
  // 👇 Y esto ayuda a que Chrome en Android lo tome mejor
  manifest: '/manifest.json' // o '/manifest.webmanifest' según cómo lo hayas llamado
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
      {/* Agregamos flex-col para mobile y md:flex-row para desktop para que el menú no rompa nada */}
      <body className={`${inter.className} bg-[#050505] text-white min-h-screen antialiased flex flex-col md:flex-row`}>

        {/* 🚀 2. EL GUARDIÁN SILENCIOSO ENVUELVE TODA LA APP */}
        <SWRProvider>
          <CashProvider>



            {/* 4. Envolvemos a children en un main que ocupe el resto del espacio */}
            <main className="flex-1 min-w-0 pb-16 md:pb-0">
              {children}
            </main>

            <Toaster position="top-center" richColors theme="dark" />

          </CashProvider>
        </SWRProvider>

      </body>
    </html>
  );
}