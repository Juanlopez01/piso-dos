'use client'

import { useState } from 'react'
import { toast, Toaster } from 'sonner'
import { Loader2, ShieldCheck } from 'lucide-react'

type LinkPublico = {
    id: string
    monto_final: number
    precio_base: number
    descuento_pct: number
    cliente_nombre: string
    producto_nombre: string
    creditos: number | null
    tipo_clase: string | null
}

const inputCls = "w-full bg-[#111] border border-white/10 rounded-lg py-3 px-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-colors"

export default function PagarForm({ link }: { link: LinkPublico }) {
    // El vendedor ya cargó el nombre; lo dejamos editable por si escribió mal.
    const [nombre, ...restoNombre] = link.cliente_nombre.split(' ')
    const [form, setForm] = useState({
        nombre: nombre || '',
        apellido: restoNombre.join(' '),
        email: '',
        dni: '',
        telefono: ''
    })
    const [enviando, setEnviando] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setEnviando(true)
        try {
            const res = await fetch('/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link_id: link.id, cliente: form })
            })
            const data = await res.json()
            if (!res.ok || !data.url) throw new Error(data.error || 'No se pudo generar el pago')
            // A Mercado Pago
            window.location.href = data.url
        } catch (err: any) {
            toast.error(err.message)
            setEnviando(false)
        }
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <Toaster position="top-center" richColors />

            <div className="w-full max-w-sm space-y-5">
                <div className="text-center">
                    <p className="text-[10px] font-black text-[#D4E655] uppercase tracking-[0.2em]">Piso 2</p>
                    <h1 className="text-xl font-black text-white uppercase mt-1">Confirmá tu compra</h1>
                </div>

                {/* ── QUÉ ESTÁ COMPRANDO ────────────────────────────────── */}
                <div className="bg-[#09090b] border border-white/10 rounded-2xl p-5 space-y-3">
                    <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Producto</p>
                        <p className="text-white font-bold text-sm">{link.producto_nombre}</p>
                        {link.creditos ? (
                            <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">{link.creditos} créditos</p>
                        ) : null}
                    </div>

                    <div className="border-t border-white/5 pt-3 flex items-baseline justify-between">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Total</p>
                        <div className="flex items-baseline gap-2">
                            {link.descuento_pct > 0 && (
                                <span className="text-xs text-gray-600 line-through font-bold">
                                    ${link.precio_base.toLocaleString()}
                                </span>
                            )}
                            <span className="text-3xl font-black text-[#D4E655]">
                                ${link.monto_final.toLocaleString()}
                            </span>
                        </div>
                    </div>
                    {link.descuento_pct > 0 && (
                        <p className="text-[10px] font-black text-[#D4E655]/70 uppercase text-right -mt-2">
                            Descuento del {link.descuento_pct}% aplicado
                        </p>
                    )}
                </div>

                {/* ── SUS DATOS ─────────────────────────────────────────── */}
                <form onSubmit={handleSubmit} className="bg-[#09090b] border border-white/10 rounded-2xl p-5 space-y-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Tus datos</p>

                    <div className="grid grid-cols-2 gap-3">
                        <input required placeholder="Nombre" value={form.nombre}
                            onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputCls} />
                        <input required placeholder="Apellido" value={form.apellido}
                            onChange={e => setForm({ ...form, apellido: e.target.value })} className={inputCls} />
                    </div>
                    <input required type="email" placeholder="Email" value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
                    <input required placeholder="DNI (será tu contraseña)" value={form.dni}
                        onChange={e => setForm({ ...form, dni: e.target.value })} className={inputCls} />
                    <input required placeholder="Teléfono" value={form.telefono}
                        onChange={e => setForm({ ...form, telefono: e.target.value })} className={inputCls} />

                    <button
                        type="submit" disabled={enviando}
                        className="w-full bg-[#D4E655] hover:bg-white disabled:opacity-40 text-black font-black uppercase py-3.5 rounded-xl transition-all text-[11px] tracking-widest flex items-center justify-center gap-2"
                    >
                        {enviando ? <Loader2 size={14} className="animate-spin" /> : null}
                        Pagar con Mercado Pago
                    </button>

                    <p className="text-[10px] text-gray-600 font-medium text-center flex items-center justify-center gap-1.5 pt-1">
                        <ShieldCheck size={12} /> Creamos tu cuenta con estos datos. Entrás con tu mail y tu DNI.
                    </p>
                </form>
            </div>
        </div>
    )
}
