'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast, Toaster } from 'sonner'

export default function PagarCliente({ pagoId, token }: { pagoId: string; token: string }) {
    const [cargando, setCargando] = useState(false)

    const pagar = async () => {
        setCargando(true)
        try {
            const r = await fetch('/api/mercadopago/liga27-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pagoId, token }),
            })
            const data = await r.json()
            if (!r.ok || !data.url) throw new Error(data.error || 'No se pudo generar el pago')
            window.location.href = data.url
        } catch (e: any) {
            toast.error(e.message || 'No se pudo generar el pago')
            setCargando(false)
        }
    }

    return (
        <>
            <Toaster position="top-center" richColors theme="dark" />
            <button onClick={pagar} disabled={cargando}
                className="w-full mt-8 bg-[#009ee3] text-white font-semibold uppercase tracking-[0.15em] text-sm py-4 rounded-lg hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {cargando ? <Loader2 size={16} className="animate-spin" /> : null} Pagar con Mercado Pago
            </button>
        </>
    )
}
