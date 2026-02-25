import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { CashProvider } from "@/context/CashContext"; // <--- 1. IMPORTARLO

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Piso 2 - Gestión",
  description: "Sistema de gestión",
};

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