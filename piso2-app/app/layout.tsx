import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Piso 2",
  description: "Sistema de Gestión",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased bg-piso2-dark text-white">
        {children}
      </body>
    </html>
  );
}