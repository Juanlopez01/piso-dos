'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCash } from '@/context/CashContext'
import {
    crearVentaAction, listarVentasAction, cancelarVentaAction, catalogoVentasAction, toggleVendedorActivoAction
} from '@/app/actions/ventas'
import { toast, Toaster } from 'sonner'
import { Loader2, Link2, Copy, Check, MessageCircle, Ban, Lock, Tag, Download, Filter, Power, Users } from 'lucide-react'

type Producto = {
    id: string; nombre: string; precio: number; categoria: string
    comision_pct: number; permite_editar_precio: boolean; entrega_tipo: string
}
type Vendedor = { id: string; nombre_completo: string; vendedor_activo: boolean }
type Venta = {
    id: string; created_at: string; producto_nombre: string; categoria: string
    cantidad: number; precio_unitario: number; monto_total: number
    comision_pct: number; comision_monto: number
    comprador_nombre: string; comprador_telefono: string; comprador_email: string | null
    observaciones: string | null; estado: 'pendiente' | 'pagado' | 'cancelado' | 'vencido'
    pagado_at: string | null; expira_at: string
    vendedor: { nombre_completo: string } | { nombre_completo: string }[] | null
}

const ROLES_OK = ['vendedor', 'admin']
const inputCls = "w-full bg-black border border-white/10 rounded-lg py-2.5 px-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-colors"

const waUrl = (tel: string, texto: string) => {
    let n = (tel || '').replace(/\D/g, '')
    if (n.startsWith('0')) n = n.slice(1)
    if (!n.startsWith('54')) n = '54' + n
    return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}
const vendedorNom = (v: Venta) =>
    (Array.isArray(v.vendedor) ? v.vendedor[0]?.nombre_completo : v.vendedor?.nombre_completo) || '—'

const BADGES: Record<string, string> = {
    pendiente: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    pagado: 'bg-green-500/10 text-green-500 border-green-500/20',
    cancelado: 'bg-white/5 text-gray-500 border-white/10',
    vencido: 'bg-red-500/10 text-red-500 border-red-500/20',
}
const ESTADOS = ['pendiente', 'pagado', 'cancelado', 'vencido']

export default function VenderPage() {
    const { userRole, isLoading: loadingCtx } = useCash()

    const [productos, setProductos] = useState<Producto[]>([])
    const [vendedores, setVendedores] = useState<Vendedor[]>([])
    const [esAdmin, setEsAdmin] = useState(false)
    const [ventas, setVentas] = useState<Venta[]>([])
    const [loading, setLoading] = useState(true)
    const [creando, setCreando] = useState(false)
    const [copiado, setCopiado] = useState<string | null>(null)

    const [form, setForm] = useState({
        productoId: '', cantidad: 1, precioUnitario: '' as number | '',
        nombre: '', telefono: '', email: '', observaciones: ''
    })
    const [filtros, setFiltros] = useState({ vendedorId: '', estado: '', categoria: '', desde: '', hasta: '' })

    const habilitado = !!userRole && ROLES_OK.includes(userRole)

    const cargarCatalogo = async () => {
        const cat = await catalogoVentasAction()
        setProductos(cat.productos as Producto[])
        setVendedores(cat.vendedores as Vendedor[])
        setEsAdmin(cat.esAdmin)
    }
    const cargarVentas = async () => {
        setLoading(true)
        const lst = await listarVentasAction(esAdmin ? filtros : undefined)
        setVentas(lst.ventas as unknown as Venta[])
        setLoading(false)
    }

    useEffect(() => { if (habilitado) cargarCatalogo() }, [habilitado])
    useEffect(() => { if (habilitado) cargarVentas() }, [habilitado, esAdmin, JSON.stringify(filtros)])

    const urlDe = (id: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/pagar/${id}`
    const mensajeDe = (v: Venta) =>
        `¡Hola ${v.comprador_nombre}! Te dejo el link para pagar tu ${v.producto_nombre} en Piso 2: ${urlDe(v.id)}`

    const copiar = async (id: string) => {
        await navigator.clipboard.writeText(urlDe(id))
        setCopiado(id); toast.success('Link copiado')
        setTimeout(() => setCopiado(null), 2000)
    }

    const handleCrear = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreando(true)
        const res = await crearVentaAction({
            productoId: form.productoId,
            cantidad: Number(form.cantidad),
            precioUnitario: form.precioUnitario === '' ? undefined : Number(form.precioUnitario),
            compradorNombre: form.nombre,
            compradorTelefono: form.telefono,
            compradorEmail: form.email || undefined,
            observaciones: form.observaciones || undefined
        })
        if (res.success) {
            toast.success('Venta cargada y link generado')
            setForm({ productoId: '', cantidad: 1, precioUnitario: '', nombre: '', telefono: '', email: '', observaciones: '' })
            cargarVentas()
        } else {
            toast.error(res.error || 'Error al cargar la venta')
        }
        setCreando(false)
    }

    const handleCancelar = async (id: string) => {
        const res = await cancelarVentaAction(id)
        if (res.success) { toast.success('Venta cancelada'); cargarVentas() }
        else toast.error(res.error || 'Error')
    }

    const handleToggleVendedor = async (v: Vendedor) => {
        const res = await toggleVendedorActivoAction(v.id, !v.vendedor_activo)
        if (res.success) { toast.success(v.vendedor_activo ? 'Vendedor desactivado' : 'Vendedor activado'); cargarCatalogo() }
        else toast.error(res.error || 'Error')
    }

    const productoSel = productos.find(p => p.id === form.productoId)
    const precioEfectivo = productoSel
        ? (productoSel.permite_editar_precio && form.precioUnitario !== '' ? Number(form.precioUnitario) : productoSel.precio)
        : 0
    const previewTotal = precioEfectivo * (Number(form.cantidad) || 1)

    // Totales del panel admin (solo cuentan lo efectivamente pagado)
    const totales = useMemo(() => {
        const pagadas = ventas.filter(v => v.estado === 'pagado')
        return {
            cantidad: pagadas.length,
            facturado: pagadas.reduce((a, v) => a + Number(v.monto_total), 0),
            comisiones: pagadas.reduce((a, v) => a + Number(v.comision_monto), 0),
        }
    }, [ventas])

    const exportarCSV = () => {
        const head = ['Fecha', 'Vendedor', 'Cliente', 'Telefono', 'Email', 'Producto', 'Categoria', 'Cantidad', 'PrecioUnit', 'Total', 'ComisionPct', 'ComisionMonto', 'Estado', 'Observaciones']
        const rows = ventas.map(v => [
            new Date(v.created_at).toLocaleString('es-AR'), vendedorNom(v), v.comprador_nombre,
            v.comprador_telefono, v.comprador_email || '', v.producto_nombre, v.categoria,
            v.cantidad, v.precio_unitario, v.monto_total, v.comision_pct, v.comision_monto,
            v.estado, (v.observaciones || '').replace(/[\n;]/g, ' ')
        ])
        const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `ventas_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
    }

    if (loadingCtx) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
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
                    <Link2 className="text-[#D4E655]" /> {esAdmin ? 'Ventas Externas' : 'Mis Ventas'}
                </h1>
                <p className="text-xs text-gray-400 mt-1 font-medium">
                    Cargá la venta y el sistema genera el link de Mercado Pago. Mandalo por WhatsApp; cuando el cliente paga, la venta se marca sola.
                </p>
            </div>

            {/* ── NUEVA VENTA ───────────────────────────────────────────── */}
            <form onSubmit={handleCrear} className="bg-[#09090b] border border-white/10 p-6 rounded-2xl space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Nueva Venta</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Producto</label>
                        <select required value={form.productoId}
                            onChange={e => setForm({ ...form, productoId: e.target.value, precioUnitario: '' })} className={inputCls}>
                            <option value="">Elegí un producto…</option>
                            {productos.map(p => (
                                <option key={p.id} value={p.id}>{p.categoria} · {p.nombre} — ${p.precio.toLocaleString()}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Cantidad</label>
                        <input type="number" min={1} step={1} required value={form.cantidad}
                            onChange={e => setForm({ ...form, cantidad: Number(e.target.value) })} className={inputCls} />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">
                            Precio unitario {productoSel && !productoSel.permite_editar_precio ? '(fijo)' : ''}
                        </label>
                        <input type="number" min={0}
                            disabled={!productoSel?.permite_editar_precio}
                            value={form.precioUnitario === '' ? (productoSel?.precio ?? '') : form.precioUnitario}
                            onChange={e => setForm({ ...form, precioUnitario: e.target.value === '' ? '' : Number(e.target.value) })}
                            className={`${inputCls} disabled:opacity-50`} />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Nombre y apellido del comprador</label>
                        <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputCls} placeholder="Juana Pérez" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Teléfono</label>
                        <input required value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className={inputCls} placeholder="11 5555-4444" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Mail (opcional)</label>
                        <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="juana@mail.com" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Observaciones (opcional)</label>
                        <input value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={inputCls} placeholder="Notas de la venta" />
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-t border-white/5 pt-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Tag size={16} className="text-gray-500" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">El cliente paga</span>
                        <span className="text-2xl font-black text-[#D4E655]">${previewTotal.toLocaleString()}</span>
                        {productoSel && productoSel.comision_pct > 0 && (
                            <span className="text-[10px] font-bold text-gray-500 uppercase">· comisión ${Math.round(previewTotal * productoSel.comision_pct / 100).toLocaleString()} ({productoSel.comision_pct}%)</span>
                        )}
                    </div>
                    <button type="submit" disabled={creando || !form.productoId}
                        className="w-full sm:w-auto bg-[#D4E655] hover:bg-white disabled:opacity-40 text-black font-black uppercase py-3 px-6 rounded-xl transition-all text-[10px] tracking-widest flex items-center justify-center gap-2">
                        {creando ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Cargar venta y generar link
                    </button>
                </div>
            </form>

            {/* ── PANEL ADMIN: filtros + totales + export ───────────────── */}
            {esAdmin && (
                <div className="bg-[#09090b] border border-white/10 p-5 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><Filter size={14} /> Filtros</h3>
                        <button onClick={exportarCSV} className="bg-white/5 hover:bg-white/10 text-white font-bold uppercase text-[10px] tracking-widest py-2 px-4 rounded-lg flex items-center gap-2 transition-colors">
                            <Download size={14} /> Exportar CSV
                        </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <select value={filtros.vendedorId} onChange={e => setFiltros({ ...filtros, vendedorId: e.target.value })} className={inputCls}>
                            <option value="">Todos los vendedores</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre_completo}</option>)}
                        </select>
                        <select value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value })} className={inputCls}>
                            <option value="">Todos los estados</option>
                            {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input value={filtros.categoria} onChange={e => setFiltros({ ...filtros, categoria: e.target.value })} className={inputCls} placeholder="Categoría" />
                        <input type="date" value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })} className={inputCls} />
                        <input type="date" value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 border-t border-white/5 pt-4">
                        <div><p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Ventas pagadas</p><p className="text-xl font-black text-white">{totales.cantidad}</p></div>
                        <div><p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Facturado</p><p className="text-xl font-black text-[#D4E655]">${totales.facturado.toLocaleString()}</p></div>
                        <div><p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Comisiones</p><p className="text-xl font-black text-white">${totales.comisiones.toLocaleString()}</p></div>
                    </div>
                </div>
            )}

            {/* ── PANEL ADMIN: gestión de vendedores ────────────────────── */}
            {esAdmin && vendedores.length > 0 && (
                <div className="bg-[#09090b] border border-white/10 p-5 rounded-2xl space-y-3">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><Users size={14} /> Vendedores</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {vendedores.map(v => (
                            <div key={v.id} className="flex items-center justify-between bg-[#111] border border-white/5 rounded-xl px-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{v.nombre_completo}</p>
                                    <p className={`text-[9px] font-black uppercase tracking-widest ${v.vendedor_activo ? 'text-green-500' : 'text-gray-500'}`}>{v.vendedor_activo ? 'Activo' : 'Inactivo'}</p>
                                </div>
                                <button onClick={() => handleToggleVendedor(v)} className={`p-2 rounded-lg transition-colors shrink-0 ${v.vendedor_activo ? 'text-gray-500 hover:text-red-500 hover:bg-red-500/10' : 'text-green-500 hover:bg-green-500/10'}`} title={v.vendedor_activo ? 'Desactivar' : 'Activar'}>
                                    <Power size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── LISTADO ───────────────────────────────────────────────── */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#D4E655]" /></div>
            ) : !ventas.length ? (
                <div className="text-center py-12 bg-[#111]/50 rounded-2xl border border-dashed border-white/10">
                    <p className="text-xs font-bold uppercase text-gray-500">No hay ventas todavía</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {ventas.map(v => (
                        <div key={v.id} className="bg-[#111] border border-white/5 p-5 rounded-2xl flex flex-col justify-between gap-4">
                            <div>
                                <div className="flex justify-between items-start gap-2 mb-2">
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-white text-sm truncate">{v.comprador_nombre}</h4>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold truncate">{v.cantidad}× {v.producto_nombre}</p>
                                        {esAdmin && <p className="text-[9px] text-gray-600 uppercase font-bold truncate mt-0.5">Vend: {vendedorNom(v)}</p>}
                                    </div>
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border shrink-0 ${BADGES[v.estado]}`}>{v.estado}</span>
                                </div>

                                <span className="text-2xl font-black text-[#D4E655]">${Number(v.monto_total).toLocaleString()}</span>
                                {v.observaciones && <p className="text-[10px] text-gray-500 font-medium mt-1 italic truncate">{v.observaciones}</p>}
                                <p className="text-[10px] text-gray-600 font-bold mt-1">
                                    {v.estado === 'pagado' && v.pagado_at
                                        ? `Pagado el ${new Date(v.pagado_at).toLocaleDateString('es-AR')}`
                                        : v.estado === 'pendiente'
                                            ? `Vence el ${new Date(v.expira_at).toLocaleDateString('es-AR')}`
                                            : new Date(v.created_at).toLocaleDateString('es-AR')}
                                </p>
                            </div>

                            {v.estado === 'pendiente' && (
                                <div className="flex gap-2 border-t border-white/5 pt-3">
                                    <a href={waUrl(v.comprador_telefono, mensajeDe(v))} target="_blank" rel="noopener noreferrer"
                                        className="flex-1 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-black font-black uppercase py-2.5 rounded-xl transition-all text-[10px] tracking-widest border border-green-500/30 flex items-center justify-center gap-1.5">
                                        <MessageCircle size={13} /> Enviar
                                    </a>
                                    <button onClick={() => copiar(v.id)} className="bg-white/5 hover:bg-white/10 text-gray-400 p-2.5 rounded-xl transition-colors" title="Copiar link">
                                        {copiado === v.id ? <Check size={16} className="text-[#D4E655]" /> : <Copy size={16} />}
                                    </button>
                                    <button onClick={() => handleCancelar(v.id)} className="bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 p-2.5 rounded-xl transition-colors" title="Cancelar venta">
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
