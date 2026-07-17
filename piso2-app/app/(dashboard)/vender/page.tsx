'use client'

import { useEffect, useState } from 'react'
import { useCash } from '@/context/CashContext'
import {
    crearLinkPagoAction, misLinksPagoAction, anularLinkPagoAction, productosVendiblesAction
} from '@/app/actions/links-pago'
import { toast, Toaster } from 'sonner'
import { Loader2, Link2, Copy, Check, MessageCircle, Ban, Lock, Tag } from 'lucide-react'

type Producto = { id: string; nombre: string; precio: number; creditos: number; tipo_clase: string }
type LinkPago = {
    id: string
    created_at: string
    precio_base: number
    descuento_pct: number
    monto_final: number
    cliente_nombre: string
    cliente_whatsapp: string
    estado: 'pendiente' | 'pagado' | 'anulado' | 'expirado'
    pagado_at: string | null
    expira_at: string
    productos: { nombre: string } | { nombre: string }[] | null
}

const ROLES_OK = ['vendedor', 'admin']

const inputCls = "w-full bg-black border border-white/10 rounded-lg py-2.5 px-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-colors"

// wa.me necesita el número con código de país y sin símbolos.
const waUrl = (tel: string, texto: string) => {
    let n = (tel || '').replace(/\D/g, '')
    if (n.startsWith('0')) n = n.slice(1)
    if (!n.startsWith('54')) n = '54' + n
    return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}

const nombreProducto = (l: LinkPago) =>
    (Array.isArray(l.productos) ? l.productos[0]?.nombre : l.productos?.nombre) || 'Producto'

const BADGES: Record<string, string> = {
    pendiente: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    pagado: 'bg-green-500/10 text-green-500 border-green-500/20',
    anulado: 'bg-white/5 text-gray-500 border-white/10',
    expirado: 'bg-white/5 text-gray-500 border-white/10',
}

export default function VenderPage() {
    const { userRole, isLoading: loadingCtx } = useCash()

    const [productos, setProductos] = useState<Producto[]>([])
    const [descuentoMax, setDescuentoMax] = useState(0)
    const [links, setLinks] = useState<LinkPago[]>([])
    const [loading, setLoading] = useState(true)
    const [creando, setCreando] = useState(false)
    const [copiado, setCopiado] = useState<string | null>(null)

    const [form, setForm] = useState({ productoId: '', descuento: 0, nombre: '', whatsapp: '' })

    const habilitado = !!userRole && ROLES_OK.includes(userRole)

    const cargar = async () => {
        setLoading(true)
        const [cat, lst] = await Promise.all([productosVendiblesAction(), misLinksPagoAction()])
        setProductos(cat.productos as Producto[])
        setDescuentoMax(cat.descuentoMax)
        setLinks(lst.links as unknown as LinkPago[])
        setLoading(false)
    }

    useEffect(() => { if (habilitado) cargar() }, [habilitado])

    const urlDe = (id: string) =>
        `${typeof window !== 'undefined' ? window.location.origin : ''}/pagar/${id}`

    const mensajeDe = (l: LinkPago) =>
        `¡Hola ${l.cliente_nombre}! Te dejo el link para pagar tu ${nombreProducto(l)} en Piso 2: ${urlDe(l.id)}`

    const copiar = async (id: string) => {
        await navigator.clipboard.writeText(urlDe(id))
        setCopiado(id)
        toast.success('Link copiado')
        setTimeout(() => setCopiado(null), 2000)
    }

    const handleCrear = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreando(true)
        const res = await crearLinkPagoAction(form.productoId, form.descuento, form.nombre, form.whatsapp)
        if (res.success) {
            toast.success('Link generado')
            setForm({ productoId: '', descuento: 0, nombre: '', whatsapp: '' })
            await cargar()
        } else {
            toast.error(res.error || 'Error al generar el link')
        }
        setCreando(false)
    }

    const handleAnular = async (id: string) => {
        const res = await anularLinkPagoAction(id)
        if (res.success) { toast.success('Link anulado'); cargar() }
        else toast.error(res.error || 'Error')
    }

    const productoSel = productos.find(p => p.id === form.productoId)
    const previewMonto = productoSel
        ? Math.round(productoSel.precio - (productoSel.precio * (Number(form.descuento) || 0) / 100))
        : 0

    if (loadingCtx) return (
        <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
    )

    if (!habilitado) return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
            <Lock size={40} /><p className="uppercase tracking-widest text-sm font-bold">Solo vendedores</p>
        </div>
    )

    return (
        <div className="min-h-screen pb-24 p-4 md:p-8 space-y-6">
            <Toaster position="top-center" richColors />

            <div>
                <h1 className="text-2xl font-black text-white uppercase flex items-center gap-2">
                    <Link2 className="text-[#D4E655]" /> Links de Pago
                </h1>
                <p className="text-xs text-gray-400 mt-1 font-medium">
                    Generá un link oficial de Piso 2 y mandalo por WhatsApp. Cuando el cliente paga, se le acreditan los créditos solo.
                </p>
            </div>

            {/* ── NUEVO LINK ────────────────────────────────────────────── */}
            <form onSubmit={handleCrear} className="bg-[#09090b] border border-white/10 p-6 rounded-2xl space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Producto</label>
                        <select
                            required
                            value={form.productoId}
                            onChange={e => setForm({ ...form, productoId: e.target.value })}
                            className={inputCls}
                        >
                            <option value="">Elegí un producto…</option>
                            {productos.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre} — ${p.precio.toLocaleString()}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">
                            Descuento % {descuentoMax > 0 ? `(máx. ${descuentoMax}%)` : '(deshabilitado)'}
                        </label>
                        <input
                            type="number" min={0} max={descuentoMax} step="1"
                            disabled={descuentoMax === 0}
                            value={form.descuento}
                            onChange={e => setForm({ ...form, descuento: Number(e.target.value) })}
                            className={`${inputCls} disabled:opacity-40`}
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Nombre del cliente</label>
                        <input
                            required value={form.nombre}
                            onChange={e => setForm({ ...form, nombre: e.target.value })}
                            className={inputCls} placeholder="Juana Pérez"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">WhatsApp</label>
                        <input
                            required value={form.whatsapp}
                            onChange={e => setForm({ ...form, whatsapp: e.target.value })}
                            className={inputCls} placeholder="11 5555-4444"
                        />
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-t border-white/5 pt-4">
                    <div className="flex items-center gap-2">
                        <Tag size={16} className="text-gray-500" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">El cliente paga</span>
                        <span className="text-2xl font-black text-[#D4E655]">${previewMonto.toLocaleString()}</span>
                        {productoSel && Number(form.descuento) > 0 && (
                            <span className="text-xs text-gray-600 line-through font-bold">${productoSel.precio.toLocaleString()}</span>
                        )}
                    </div>
                    <button
                        type="submit" disabled={creando || !form.productoId}
                        className="w-full sm:w-auto bg-[#D4E655] hover:bg-white disabled:opacity-40 text-black font-black uppercase py-3 px-6 rounded-xl transition-all text-[10px] tracking-widest flex items-center justify-center gap-2"
                    >
                        {creando ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                        Generar link
                    </button>
                </div>
            </form>

            {/* ── LINKS GENERADOS ───────────────────────────────────────── */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : !links.length ? (
                <div className="text-center py-12 bg-[#111]/50 rounded-2xl border border-dashed border-white/10">
                    <p className="text-xs font-bold uppercase text-gray-500">Todavía no generaste ningún link</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {links.map(l => (
                        <div key={l.id} className="bg-[#111] border border-white/5 p-5 rounded-2xl flex flex-col justify-between gap-4">
                            <div>
                                <div className="flex justify-between items-start gap-2 mb-3">
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-white text-sm truncate">{l.cliente_nombre}</h4>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold truncate">{nombreProducto(l)}</p>
                                    </div>
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border shrink-0 ${BADGES[l.estado]}`}>
                                        {l.estado}
                                    </span>
                                </div>

                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-[#D4E655]">${Number(l.monto_final).toLocaleString()}</span>
                                    {Number(l.descuento_pct) > 0 && (
                                        <>
                                            <span className="text-xs text-gray-600 line-through font-bold">${Number(l.precio_base).toLocaleString()}</span>
                                            <span className="text-[9px] font-black text-[#D4E655]/70 uppercase">-{Number(l.descuento_pct)}%</span>
                                        </>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-600 font-bold mt-1">
                                    {l.estado === 'pagado' && l.pagado_at
                                        ? `Pagado el ${new Date(l.pagado_at).toLocaleDateString('es-AR')}`
                                        : `Vence el ${new Date(l.expira_at).toLocaleDateString('es-AR')}`}
                                </p>
                            </div>

                            {l.estado === 'pendiente' && (
                                <div className="flex gap-2 border-t border-white/5 pt-3">
                                    <a
                                        href={waUrl(l.cliente_whatsapp, mensajeDe(l))}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex-1 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-black font-black uppercase py-2.5 rounded-xl transition-all text-[10px] tracking-widest border border-green-500/30 flex items-center justify-center gap-1.5"
                                    >
                                        <MessageCircle size={13} /> Enviar
                                    </a>
                                    <button
                                        onClick={() => copiar(l.id)}
                                        className="bg-white/5 hover:bg-white/10 text-gray-400 p-2.5 rounded-xl transition-colors"
                                        title="Copiar link"
                                    >
                                        {copiado === l.id ? <Check size={16} className="text-[#D4E655]" /> : <Copy size={16} />}
                                    </button>
                                    <button
                                        onClick={() => handleAnular(l.id)}
                                        className="bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 p-2.5 rounded-xl transition-colors"
                                        title="Anular link"
                                    >
                                        <Ban size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
