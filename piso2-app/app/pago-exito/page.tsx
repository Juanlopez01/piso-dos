'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import Link from 'next/link'

function PagoExitoContent() {
    const searchParams = useSearchParams()
    const destino = searchParams.get('destino') || '/perfil'

    return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4">
            <div className="bg-[#111] border border-white/10 p-8 md:p-10 rounded-3xl text-center max-w-sm w-full animate-in zoom-in-95 duration-500 shadow-2xl">

                <div className="w-24 h-24 bg-[#D4E655]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#D4E655]/20">
                    <CheckCircle2 className="text-[#D4E655] w-12 h-12" />
                </div>

                <h1 className="text-3xl font-black uppercase text-white mb-2 tracking-tighter">¡Pago Aprobado!</h1>
                <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                    Tu pago ya fue registrado y acreditado en el sistema con éxito.
                </p>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8">
                    <p className="text-xs text-gray-300 font-bold uppercase tracking-widest mb-2">📱 Si estás en el celular:</p>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                        Ya podés cerrar esta ventana del navegador y volver a abrir la aplicación para ver tus cambios.
                    </p>
                </div>

                <Link
                    href={destino}
                    className="w-full bg-[#D4E655] text-black font-black uppercase tracking-widest text-xs py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-white transition-all shadow-lg shadow-[#D4E655]/20"
                >
                    Ir a mi cuenta <ChevronRight size={16} />
                </Link>

            </div>
        </div>
    )
}

export default function PagoExitoPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
            <PagoExitoContent />
        </Suspense>
    )
}