'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    ShoppingBasket, Ticket, Star, Check,
    CreditCard, Smartphone, Zap, Loader2, Info
} from 'lucide-react'
import { toast, Toaster } from 'sonner'

type Producto = {
    id: string
    nombre: string
    precio: number
    creditos: number
    tipo_clase: 'regular' | 'seminario'
    descripcion?: string
}

export default function TiendaPage() {
    const supabase = createClient()
    const [productos, setProductos] = useState<Producto[]>([])
    const [loading, setLoading] = useState(true)
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
    const [selectedPack, setSelectedPack] = useState<Producto | null>(null)

    useEffect(() => {
        fetchProductos()
    }, [])

    const fetchProductos = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('productos')
            .select('*')
            .eq('activo', true)
            .order('precio', { ascending: true })

        if (data) setProductos(data as Producto[])
        setLoading(false)
    }

    const openCheckout = (producto: Producto) => {
        setSelectedPack(producto)
        setIsCheckoutOpen(true)
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    const regulares = productos.filter(p => p.tipo_clase === 'regular')
    const seminarios = productos.filter(p => p.tipo_clase === 'seminario')

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="mb-10 border-b border-white/10 pb-6 text-center md:text-left">
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">
                    Tienda de <span className="text-[#D4E655]">Créditos</span>
                </h1>
                <p className="text-gray-400 text-xs md:text-sm font-bold uppercase tracking-widest flex items-center justify-center md:justify-start gap-2">
                    <Zap size={14} className="text-[#D4E655]" /> Elegí tu pack y empezá a bailar
                </p>
            </div>

            {/* SECCIÓN REGULARES */}
            <div className="mb-16">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-[#D4E655] text-black p-2 rounded-lg"><Ticket size={20} /></div>
                    <h2 className="text-xl font-black uppercase tracking-tighter">Clases Regulares</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {regulares.map((p) => (
                        <div key={p.id} className="bg-[#09090b] border border-white/10 rounded-3xl p-6 flex flex-col hover:border-[#D4E655]/50 transition-all group relative overflow-hidden shadow-2xl">
                            {/* Badge de ahorro (si tiene más de 1 clase) */}
                            {p.creditos > 1 && (
                                <div className="absolute -right-8 top-4 rotate-45 bg-[#D4E655] text-black text-[8px] font-black uppercase px-10 py-1 shadow-lg">
                                    Ahorro
                                </div>
                            )}

                            <h3 className="text-xl font-black text-white uppercase mb-1">{p.nombre}</h3>
                            <div className="text-4xl font-black text-[#D4E655] mb-4">
                                ${p.precio.toLocaleString()}
                            </div>

                            <div className="space-y-3 mb-8 flex-1">
                                <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
                                    <Check size={16} className="text-[#D4E655]" /> {p.creditos} Clases Disponibles
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500 font-bold uppercase tracking-widest">
                                    <Info size={14} /> ${Math.round(p.precio / p.creditos).toLocaleString()} por clase
                                </div>
                            </div>

                            <button
                                onClick={() => openCheckout(p)}
                                className="w-full bg-[#111] hover:bg-white text-white hover:text-black border border-white/10 rounded-2xl py-4 font-black uppercase text-xs tracking-widest transition-all"
                            >
                                Comprar Ahora
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* SECCIÓN SEMINARIOS */}
            {seminarios.length > 0 && (
                <div>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-purple-600 text-white p-2 rounded-lg"><Star size={20} /></div>
                        <h2 className="text-xl font-black uppercase tracking-tighter">Seminarios & Especiales</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {seminarios.map((p) => (
                            <div key={p.id} className="bg-[#09090b] border border-purple-500/20 rounded-3xl p-6 flex flex-col hover:border-purple-500/50 transition-all group relative overflow-hidden shadow-2xl">
                                <h3 className="text-xl font-black text-white uppercase mb-1">{p.nombre}</h3>
                                <div className="text-4xl font-black text-purple-500 mb-4">
                                    ${p.precio.toLocaleString()}
                                </div>

                                <div className="space-y-3 mb-8 flex-1">
                                    <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
                                        <Check size={16} className="text-purple-500" /> {p.creditos} Créditos Especiales
                                    </div>
                                    <p className="text-xs text-gray-500 leading-relaxed italic">
                                        Válido para Workshops, Intensivos y clases masterclass.
                                    </p>
                                </div>

                                <button
                                    onClick={() => openCheckout(p)}
                                    className="w-full bg-purple-600/10 hover:bg-purple-600 text-purple-500 hover:text-white border border-purple-600/30 rounded-2xl py-4 font-black uppercase text-xs tracking-widest transition-all"
                                >
                                    Comprar Ahora
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MODAL DE CHECKOUT (Simulado por ahora) */}
            {isCheckoutOpen && selectedPack && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setIsCheckoutOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-[#D4E655] text-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(212,230,85,0.4)]">
                                <ShoppingBasket size={32} />
                            </div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Finalizar Compra</h3>
                            <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mt-1">{selectedPack.nombre}</p>
                        </div>

                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-gray-500 font-bold uppercase">Total a Transferir</span>
                                <span className="text-2xl font-black text-[#D4E655]">${selectedPack.precio.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-4 mb-8">
                            <p className="text-[10px] text-gray-500 font-black uppercase text-center tracking-widest">Información de Pago</p>
                            <div className="bg-[#111] p-4 rounded-2xl border border-white/5 space-y-2">
                                <p className="text-xs text-gray-400 flex justify-between"><span>Alias:</span> <span className="text-white font-mono font-bold">PISO2.DANZA.OK</span></p>
                                <p className="text-xs text-gray-400 flex justify-between"><span>Banco:</span> <span className="text-white font-bold uppercase">Mercado Pago</span></p>
                            </div>
                            <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                                Una vez realizada la transferencia, envianos el comprobante por WhatsApp para que acreditemos tus clases.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <a
                                href={`https://wa.me/5491122334455?text=Hola! Quiero comprar el ${selectedPack.nombre} de $${selectedPack.precio}`}
                                target="_blank"
                                className="w-full bg-[#25D366] text-black font-black uppercase py-4 rounded-2xl text-xs tracking-widest text-center flex items-center justify-center gap-2 hover:bg-white transition-all shadow-xl"
                            >
                                <Smartphone size={18} /> Enviar Comprobante
                            </a>
                            <button
                                onClick={() => setIsCheckoutOpen(false)}
                                className="w-full text-gray-500 font-bold uppercase text-[10px] hover:text-white transition-colors"
                            >
                                Volver atrás
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}