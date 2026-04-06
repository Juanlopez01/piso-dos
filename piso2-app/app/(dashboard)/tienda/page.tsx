'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    ShoppingBasket, Ticket, Star, Check,
    Smartphone, Zap, Loader2, Info, Tag, X, CreditCard
} from 'lucide-react'
import { toast, Toaster } from 'sonner'

// --- TIPOS ---
type Producto = {
    id: string
    nombre: string
    precio: number
    creditos: number
    tipo_clase: 'regular' | 'seminario'
    descripcion?: string
}

type Cupon = {
    id: string
    codigo: string
    porcentaje: number
}

type TiendaData = {
    userProfile: { id: string, creditos_regulares: number, creditos_seminarios: number } | null
    productos: Producto[]
}

// 🚀 FETCHER UNIFICADO DE SWR
const fetcherTienda = async (): Promise<TiendaData> => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let userProfile = null
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, creditos_regulares, creditos_seminarios')
            .eq('id', user.id)
            .single()
        if (profile) userProfile = profile
    }

    const { data: productos } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('precio', { ascending: true })

    return {
        userProfile,
        productos: (productos as Producto[]) || []
    }
}

function TiendaContent() {
    const [supabase] = useState(() => createClient())
    const searchParams = useSearchParams()
    const router = useRouter()

    // 🚀 SWR AL MANDO
    const { data, isLoading, mutate } = useSWR<TiendaData>(
        'tienda-datos',
        fetcherTienda,
        {
            revalidateOnFocus: true, // Clave para cuando vuelven de MercadoPago
            dedupingInterval: 5000 // Evita doble fetch rápido
        }
    )

    const productos = data?.productos || []
    const userProfile = data?.userProfile || null
    const userId = userProfile?.id || null

    // Checkout States
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
    const [selectedPack, setSelectedPack] = useState<Producto | null>(null)

    // Cupones States
    const [cuponInput, setCuponInput] = useState('')
    const [cuponAplicado, setCuponAplicado] = useState<Cupon | null>(null)
    const [validandoCupon, setValidandoCupon] = useState(false)

    // MP States
    const [generandoPago, setGenerandoPago] = useState(false)

    // 🪄 EFECTO PARA LOS CARTELITOS DE MERCADO PAGO
    useEffect(() => {
        const pagoStatus = searchParams.get('pago')

        if (pagoStatus) {
            if (pagoStatus === 'exito') {
                toast.success('¡Pago aprobado! Tus clases se acreditarán en breves instantes.', { duration: 8000 })
                mutate() // Forzamos actualización de créditos si el pago fue un éxito
            } else if (pagoStatus === 'error') {
                toast.error('El pago no se pudo procesar o fue cancelado.')
            } else if (pagoStatus === 'pendiente') {
                toast.info('Tu pago está pendiente de confirmación.')
            }

            // Limpiamos la URL de forma silenciosa
            window.history.replaceState(null, '', window.location.pathname)
        }
    }, [searchParams, mutate])

    const openCheckout = (producto: Producto) => {
        if (!userId) {
            toast.error("Debes iniciar sesión para comprar")
            return
        }
        setSelectedPack(producto)
        setCuponInput('')
        setCuponAplicado(null)
        setIsCheckoutOpen(true)
    }

    // --- LÓGICA DE CUPONES ---
    const handleValidarCupon = async () => {
        if (!cuponInput.trim()) return toast.error('Ingresá un código válido')
        if (!userId) return toast.error('Debes iniciar sesión para usar cupones')

        setValidandoCupon(true)
        const codigoLimpio = cuponInput.trim().toUpperCase()

        try {
            const { data: cupon, error: errCupon } = await supabase
                .from('cupones')
                .select('*')
                .eq('codigo', codigoLimpio)
                .eq('activo', true)
                .single()

            if (errCupon || !cupon) {
                setValidandoCupon(false)
                return toast.error('El cupón no existe o expiró')
            }

            const { data: uso } = await supabase
                .from('cupones_usados')
                .select('id')
                .eq('cupon_id', cupon.id)
                .eq('user_id', userId)
                .maybeSingle()

            if (uso) {
                setValidandoCupon(false)
                return toast.error('Ya utilizaste este cupón anteriormente')
            }

            setCuponAplicado(cupon)
            toast.success(`¡Cupón ${cupon.porcentaje}% aplicado!`)
        } catch (error) {
            toast.error('Error al validar cupón')
        }
        setValidandoCupon(false)
    }

    const removeCupon = () => {
        setCuponAplicado(null)
        setCuponInput('')
    }

    // --- LÓGICA MERCADO PAGO ---
    const handlePagarConMP = async () => {
        if (!userId) return toast.error('Debes iniciar sesión')
        if (!selectedPack) return

        // 🚀 TRUCO ANTI-BLOQUEO: Abrimos la pestaña en el milisegundo del clic (vacía por ahora)
        const nuevaPestana = window.open('about:blank', '_blank')
        if (nuevaPestana) {
            nuevaPestana.document.write('<h2 style="font-family:sans-serif;text-align:center;margin-top:50px;">Conectando con Mercado Pago...</h2>')
        }

        setGenerandoPago(true)
        try {
            const res = await fetch('/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productoId: selectedPack.id,
                    userId: userId,
                    cuponId: cuponAplicado ? cuponAplicado.id : null,
                    tipo_pago: 'pack'
                })
            })

            const responseData = await res.json()

            if (!res.ok || responseData.error) {
                if (nuevaPestana) nuevaPestana.close() // Cerramos la pestaña si algo falla
                toast.error("Hubo un error al generar el pago: " + responseData.error)
                setGenerandoPago(false)
                return
            }

            if (responseData.url) {
                // 🚀 Le inyectamos la URL de Mercado Pago a la pestaña que ya abrimos
                if (nuevaPestana) {
                    nuevaPestana.location.href = responseData.url
                } else {
                    // Failsafe extremo por si el navegador bloqueó hasta la pestaña vacía
                    window.location.href = responseData.url
                }

                toast.success('Pestaña de pago abierta. ¡Volvé cuando termines!', { duration: 5000 })
                setIsCheckoutOpen(false) // Cerramos el modal de tu web
            }

        } catch (error: any) {
            if (nuevaPestana) nuevaPestana.close()
            toast.error(error.message)
        } finally {
            setGenerandoPago(false)
        }
    }
    const precioBase = selectedPack?.precio || 0
    const descuentoDinero = cuponAplicado ? (precioBase * (cuponAplicado.porcentaje / 100)) : 0
    const precioFinal = precioBase - descuentoDinero

    const getMensajeWhatsApp = () => {
        let msg = `Hola! Quiero pagar por transferencia el ${selectedPack?.nombre} de $${precioBase.toLocaleString()}`
        if (cuponAplicado) msg += `.\n\n*Aviso:* Apliqué el cupón ${cuponAplicado.codigo}, así que el total es $${precioFinal.toLocaleString()}`
        return encodeURIComponent(msg)
    }

    if (isLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    const regulares = productos.filter(p => p.tipo_clase === 'regular')
    const seminarios = productos.filter(p => p.tipo_clase === 'seminario')

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER TIENDA */}
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
                            {p.creditos > 1 && (
                                <div className="absolute -right-8 top-4 rotate-45 bg-[#D4E655] text-black text-[8px] font-black uppercase px-10 py-1 shadow-lg">Ahorro</div>
                            )}
                            <h3 className="text-xl font-black text-white uppercase mb-1">{p.nombre}</h3>
                            <div className="text-4xl font-black text-[#D4E655] mb-4">${p.precio.toLocaleString()}</div>
                            <div className="space-y-3 mb-8 flex-1">
                                <div className="flex items-center gap-2 text-sm text-gray-300 font-medium"><Check size={16} className="text-[#D4E655]" /> {p.creditos} Clases Disponibles</div>
                                <div className="flex items-center gap-2 text-xs text-gray-500 font-bold uppercase tracking-widest"><Info size={14} /> ${Math.round(p.precio / p.creditos).toLocaleString()} por clase</div>
                            </div>
                            <button onClick={() => openCheckout(p)} className="w-full bg-[#111] hover:bg-white text-white hover:text-black border border-white/10 rounded-2xl py-4 font-black uppercase text-xs tracking-widest transition-all">
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
                        <h2 className="text-xl font-black uppercase tracking-tighter">Especiales</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {seminarios.map((p) => (
                            <div key={p.id} className="bg-[#09090b] border border-purple-500/20 rounded-3xl p-6 flex flex-col hover:border-purple-500/50 transition-all group relative overflow-hidden shadow-2xl">
                                <h3 className="text-xl font-black text-white uppercase mb-1">{p.nombre}</h3>
                                <div className="text-4xl font-black text-purple-500 mb-4">${p.precio.toLocaleString()}</div>
                                <div className="space-y-3 mb-8 flex-1">
                                    <div className="flex items-center gap-2 text-sm text-gray-300 font-medium"><Check size={16} className="text-purple-500" /> {p.creditos} Créditos Especiales</div>
                                    <p className="text-xs text-gray-500 leading-relaxed italic">Válido para Workshops, Intensivos y clases masterclass.</p>
                                </div>
                                <button onClick={() => openCheckout(p)} className="w-full bg-purple-600/10 hover:bg-purple-600 text-purple-500 hover:text-white border border-purple-600/30 rounded-2xl py-4 font-black uppercase text-xs tracking-widest transition-all">
                                    Comprar Ahora
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MODAL DE CHECKOUT */}
            {isCheckoutOpen && selectedPack && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in" onClick={() => !generandoPago && setIsCheckoutOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-[#D4E655] text-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(212,230,85,0.4)]">
                                <ShoppingBasket size={32} />
                            </div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Finalizar Compra</h3>
                            <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mt-1">{selectedPack.nombre}</p>
                        </div>

                        {/* --- ZONA CUPONES --- */}
                        <div className="mb-6 bg-[#111] p-1 rounded-xl border border-white/5 flex">
                            {cuponAplicado ? (
                                <div className="w-full flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Tag size={16} className="text-green-500" />
                                        <span className="text-green-500 font-bold text-sm uppercase">{cuponAplicado.codigo}</span>
                                        <span className="bg-green-500 text-black text-[9px] font-black px-2 py-0.5 rounded ml-1">-{cuponAplicado.porcentaje}%</span>
                                    </div>
                                    <button onClick={removeCupon} className="text-gray-500 hover:text-white transition-colors"><X size={16} /></button>
                                </div>
                            ) : (
                                <>
                                    <input type="text" placeholder="Código de Descuento" value={cuponInput} onChange={e => setCuponInput(e.target.value.toUpperCase())} className="flex-1 bg-transparent text-white text-sm px-4 outline-none font-mono uppercase" />
                                    <button onClick={handleValidarCupon} disabled={validandoCupon} className="bg-white/10 hover:bg-[#D4E655] text-gray-300 hover:text-black font-bold text-[10px] uppercase px-4 py-3 rounded-lg transition-colors flex items-center">
                                        {validandoCupon ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
                                    </button>
                                </>
                            )}
                        </div>

                        {/* --- ZONA TOTALES --- */}
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mb-8">
                            {cuponAplicado && (
                                <div className="flex justify-between items-center mb-1 text-gray-500">
                                    <span className="text-[10px] font-bold uppercase">Precio Base</span>
                                    <span className="text-sm line-through">${precioBase.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-300 font-bold uppercase">Total a Pagar</span>
                                <span className="text-3xl font-black text-[#D4E655]">${precioFinal.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* --- BOTONES DE PAGO --- */}
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handlePagarConMP}
                                disabled={generandoPago}
                                className="w-full bg-[#009EE3] text-white font-black uppercase py-4 rounded-2xl text-xs tracking-widest text-center flex items-center justify-center gap-2 hover:bg-[#008CC9] transition-all shadow-[0_0_20px_rgba(0,158,227,0.3)]"
                            >
                                {generandoPago ? <Loader2 className="animate-spin" size={18} /> : <><CreditCard size={18} /> Pagar con Mercado Pago</>}
                            </button>

                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-white/10"></div>
                                <span className="flex-shrink-0 mx-4 text-[9px] font-black uppercase text-gray-600 tracking-widest">O también</span>
                                <div className="flex-grow border-t border-white/10"></div>
                            </div>

                            <a
                                href={`https://wa.me/5491122334455?text=${getMensajeWhatsApp()}`}
                                target="_blank"
                                className="w-full bg-[#111] border border-white/10 text-gray-300 font-bold uppercase py-3.5 rounded-xl text-[10px] tracking-widest text-center flex items-center justify-center gap-2 hover:bg-white hover:text-black transition-all"
                            >
                                <Smartphone size={14} /> Pagar por Transferencia Manual
                            </a>

                            <button onClick={() => setIsCheckoutOpen(false)} disabled={generandoPago} className="w-full text-gray-500 font-bold uppercase text-[10px] hover:text-white transition-colors mt-2">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function TiendaPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>}>
            <TiendaContent />
        </Suspense>
    )
}