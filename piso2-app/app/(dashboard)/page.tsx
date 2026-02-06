'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirigir directamente al Calendario (Agenda) que es lo más útil
    router.push('/calendario')
  }, [])

  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
      <p className="animate-pulse text-xs font-bold uppercase tracking-widest">Cargando Piso 2...</p>
    </div>
  )
}