'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Ticket, Plus, ArrowLeft, RefreshCw, Trash2, Pencil, Check, X, CalendarDays, MapPin, DollarSign, Users, Globe, Copy, ScanLine, BarChart3, Download, ClipboardList, HardHat, Scale, EyeOff, UserPlus } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { montoServicio, conServicio, SERVICIO_PCT } from '@/utils/servicio'
import {
    getEventosAction, getEventoAction, crearEventoAction, editarEventoAction, cambiarEstadoEventoAction, toggleVentaOnlineAction, getReporteEventoAction, getLinkCompaniaAction,
    eliminarEventoAction, guardarEntradaAction, eliminarEntradaAction, registrarVentaAction, anularVentaAction,
    getEquipoAction, guardarMiembroEquipoAction, eliminarMiembroEquipoAction,
    getBorderauxAction, setRepartoPctAction, toggleIncluirEquipoAction, guardarGastoAction, eliminarGastoAction,
    getInvitadosAction, guardarInvitadoAction, togglePresenteInvitadoAction, eliminarInvitadoAction,
} from '@/app/actions/eventos'

type EventoRow = { id: string; nombre: string; fecha: string | null; lugar: string | null; estado: string; recaudado: number; vendidas: number }
type Entrada = { id: string; nombre: string; precio: number; cupo: number; vendidas: number; disponible: number; orden: number; oculta?: boolean; codigo_promo?: string | null }
type Venta = { id: string; comprador_nombre: string | null; comprador_contacto: string | null; medio_pago: string; total: number; estado: string; created_at: string; items: { nombre: string; cantidad: number; precio_unit: number }[] }
type Evento = { id: string; nombre: string; descripcion: string | null; fecha: string | null; lugar: string | null; estado: string; venta_online?: boolean }

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
const fmtFecha = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'
const ESTADOS: Record<string, { label: string; cls: string }> = {
    borrador: { label: 'Borrador', cls: 'bg-white/10 text-gray-300' },
    activo: { label: 'Activo', cls: 'bg-[#D4E655]/20 text-[#D4E655]' },
    finalizado: { label: 'Finalizado', cls: 'bg-blue-500/15 text-blue-300' },
}
const MEDIOS = ['efectivo', 'transferencia', 'mercadopago']

export default function EventosPage() {
    const [eventos, setEventos] = useState<EventoRow[]>([])
    const [loading, setLoading] = useState(true)
    const [sel, setSel] = useState<string | null>(null)
    const [nuevo, setNuevo] = useState(false)

    const cargar = async () => {
        setLoading(true)
        const r = await getEventosAction()
        if (r.ok) setEventos(r.eventos as EventoRow[])
        else toast.error(r.error || 'Error al cargar')
        setLoading(false)
    }
    useEffect(() => { cargar() }, [])

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            {sel ? (
                <Detalle eventoId={sel} onBack={() => { setSel(null); cargar() }} />
            ) : (
                <>
                    <div className="flex items-end justify-between gap-3 mb-6">
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2">
                                <Ticket className="text-[#D4E655]" size={26} /> Eventos
                            </h1>
                            <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">PISO2E · Ticketera</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={cargar} className="px-3 py-2.5 rounded-xl bg-[#111] border border-white/10 text-gray-300 hover:text-white"><RefreshCw size={16} /></button>
                            <button onClick={() => setNuevo(true)} className="px-4 py-2.5 rounded-xl bg-[#D4E655] text-black font-bold text-xs uppercase tracking-wide flex items-center gap-2 hover:bg-white"><Plus size={16} /> Nuevo</button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>
                    ) : eventos.length === 0 ? (
                        <div className="min-h-[40vh] flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                            <Ticket size={34} className="opacity-40" />
                            <p className="text-sm font-medium">Todavía no hay eventos. Creá el primero con “Nuevo”.</p>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto grid gap-3">
                            {eventos.map(e => (
                                <button key={e.id} onClick={() => setSel(e.id)} className="text-left bg-[#09090b] border border-white/10 rounded-2xl p-4 hover:border-[#D4E655]/40 transition-colors flex items-center gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold truncate">{e.nombre}</p>
                                            <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-bold ${ESTADOS[e.estado]?.cls}`}>{ESTADOS[e.estado]?.label}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-3">
                                            <span className="flex items-center gap-1"><CalendarDays size={12} /> {fmtFecha(e.fecha)}</span>
                                            {e.lugar && <span className="flex items-center gap-1 truncate"><MapPin size={12} /> {e.lugar}</span>}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[#D4E655] font-black">{pesos(e.recaudado)}</p>
                                        <p className="text-[10px] text-gray-500">{e.vendidas} entradas</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {nuevo && <ModalNuevo onClose={() => setNuevo(false)} onCreated={(id) => { setNuevo(false); cargar(); setSel(id) }} />}
        </div>
    )
}

function ModalNuevo({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
    const [nombre, setNombre] = useState('')
    const [fecha, setFecha] = useState('')
    const [lugar, setLugar] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [saving, setSaving] = useState(false)

    const crear = async () => {
        if (!nombre.trim()) return toast.error('Poné un nombre')
        setSaving(true)
        const r = await crearEventoAction({ nombre, fecha: fecha || null, lugar, descripcion })
        if (r.ok) { toast.success('Evento creado'); onCreated(r.id) }
        else { toast.error(r.error || 'Error'); setSaving(false) }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
            <div className="bg-[#09090b] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-black uppercase tracking-tight">Nuevo evento</h2>
                    <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-300"><X size={16} /></button>
                </div>
                <div className="space-y-3">
                    <Campo label="Nombre"><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Muestra de fin de año" className="inp w-full" /></Campo>
                    <Campo label="Fecha y hora"><input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} className="inp w-full" /></Campo>
                    <Campo label="Lugar"><input value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Teatro / Sede Obelisco…" className="inp w-full" /></Campo>
                    <Campo label="Descripción (opcional)"><textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2} className="inp w-full resize-none" /></Campo>
                    <button onClick={crear} disabled={saving} className="w-full bg-[#D4E655] text-black font-bold py-3 rounded-xl uppercase text-xs tracking-wide hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Crear evento
                    </button>
                </div>
            </div>
        </div>
    )
}

function Detalle({ eventoId, onBack }: { eventoId: string; onBack: () => void }) {
    const [evento, setEvento] = useState<Evento | null>(null)
    const [entradas, setEntradas] = useState<Entrada[]>([])
    const [ventas, setVentas] = useState<Venta[]>([])
    const [equipo, setEquipo] = useState<any[]>([])
    const [totalEquipo, setTotalEquipo] = useState(0)
    const [borderaux, setBorderaux] = useState<any>(null)
    const [invitados, setInvitados] = useState<any[]>([])
    const [invStats, setInvStats] = useState({ total: 0, presentes: 0 })
    const [loading, setLoading] = useState(true)

    const cargarInvitados = async () => {
        const r = await getInvitadosAction(eventoId)
        if (r.ok) { setInvitados(r.invitados); setInvStats({ total: r.totalInvitados, presentes: r.presentes }) }
    }

    const cargarBorderaux = async () => {
        const r = await getBorderauxAction(eventoId)
        if (r.ok) setBorderaux(r)
    }
    const cargar = async () => {
        const r = await getEventoAction(eventoId)
        if (r.ok) { setEvento(r.evento as Evento); setEntradas(r.entradas as Entrada[]); setVentas(r.ventas as Venta[]) }
        else toast.error(r.error || 'Error')
        cargarBorderaux()
        setLoading(false)
    }
    const cargarEquipo = async () => {
        const r = await getEquipoAction(eventoId)
        if (r.ok) { setEquipo(r.equipo); setTotalEquipo(r.totalEquipo) }
        cargarBorderaux()
    }
    useEffect(() => { cargar(); cargarEquipo(); cargarInvitados() }, [eventoId])

    // --- entradas (alta/edición inline) ---
    const [nuevaEnt, setNuevaEnt] = useState({ nombre: '', precio: '', cupo: '', oculta: false, codigo_promo: '' })
    const [editEnt, setEditEnt] = useState<string | null>(null)
    const [editVals, setEditVals] = useState({ nombre: '', precio: '', cupo: '', oculta: false, codigo_promo: '' })

    const agregarEntrada = async () => {
        if (!nuevaEnt.nombre.trim()) return toast.error('Nombre de la entrada')
        if (nuevaEnt.oculta && !nuevaEnt.codigo_promo.trim()) return toast.error('Ponele un código de promo a la entrada oculta')
        const r = await guardarEntradaAction({ evento_id: eventoId, nombre: nuevaEnt.nombre, precio: Number(nuevaEnt.precio), cupo: Number(nuevaEnt.cupo), orden: entradas.length, oculta: nuevaEnt.oculta, codigo_promo: nuevaEnt.codigo_promo })
        if (r.ok) { setNuevaEnt({ nombre: '', precio: '', cupo: '', oculta: false, codigo_promo: '' }); cargar() } else toast.error(r.error || 'Error')
    }
    const guardarEdit = async (id: string) => {
        if (editVals.oculta && !editVals.codigo_promo.trim()) return toast.error('Ponele un código de promo a la entrada oculta')
        const r = await guardarEntradaAction({ id, evento_id: eventoId, nombre: editVals.nombre, precio: Number(editVals.precio), cupo: Number(editVals.cupo), oculta: editVals.oculta, codigo_promo: editVals.codigo_promo })
        if (r.ok) { setEditEnt(null); cargar() } else toast.error(r.error || 'Error')
    }
    const copiarLinkPromo = (codigo: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/evento/${eventoId}?promo=${encodeURIComponent(codigo)}`)
        toast.success('Link con la promo copiado')
    }
    const borrarEntrada = async (id: string) => {
        const r = await eliminarEntradaAction(id)
        if (r.ok) cargar(); else toast.error(r.error || 'Error')
    }

    const toggleOnline = async () => {
        const nuevo = !evento?.venta_online
        const r = await toggleVentaOnlineAction(eventoId, nuevo)
        if (r.ok) setEvento(ev => ev ? { ...ev, venta_online: nuevo } : ev)
        else toast.error(r.error || 'Error')
    }
    const copiarLinkCompra = () => {
        navigator.clipboard.writeText(`${window.location.origin}/evento/${eventoId}`)
        toast.success('Link de compra copiado')
    }
    const copiarLinkCompania = async () => {
        const r = await getLinkCompaniaAction(eventoId)
        if (!r.ok) return toast.error((r as any).error || 'Error')
        navigator.clipboard.writeText(`${window.location.origin}/compania/${eventoId}?t=${r.token}`)
        toast.success('Link de la compañía copiado (ve las ventas en vivo)')
    }

    const [reporte, setReporte] = useState<any>(null)
    const abrirReporte = async () => {
        const r = await getReporteEventoAction(eventoId)
        if (r.ok) setReporte(r); else toast.error((r as any).error || 'Error')
    }
    const descargarCSV = () => {
        if (!reporte) return
        const head = ['Comprador', 'Contacto', 'Entradas', 'Detalle', 'Total', 'Canal', 'Medio', 'Ingresados', 'Fecha']
        const rows = reporte.filas.map((f: any) => [f.comprador, f.contacto, f.entradas, f.detalle, f.total, f.canal, f.medio, f.ingresados, new Date(f.fecha).toLocaleString('es-AR')])
        const csv = [head, ...rows].map((r: any[]) => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `reporte-${(evento?.nombre || 'evento').replace(/[^a-z0-9]+/gi, '-')}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    const setEstado = async (estado: 'borrador' | 'activo' | 'finalizado') => {
        const r = await cambiarEstadoEventoAction(eventoId, estado)
        if (r.ok) setEvento(ev => ev ? { ...ev, estado } : ev); else toast.error(r.error || 'Error')
    }
    const borrarEvento = async () => {
        if (!confirm('¿Borrar este evento?')) return
        const r = await eliminarEventoAction(eventoId)
        if (r.ok) { toast.success('Evento borrado'); onBack() } else toast.error(r.error || 'Error')
    }

    // --- registrar venta ---
    const [cant, setCant] = useState<Record<string, number>>({})
    const [comprador, setComprador] = useState('')
    const [contacto, setContacto] = useState('')
    const [medio, setMedio] = useState('efectivo')
    const [vendiendo, setVendiendo] = useState(false)
    const totalVenta = entradas.reduce((s, e) => s + (cant[e.id] || 0) * e.precio, 0)
    const totalEntradasVenta = entradas.reduce((s, e) => s + (cant[e.id] || 0), 0)

    const registrar = async () => {
        const items = entradas.map(e => ({ entrada_id: e.id, cantidad: cant[e.id] || 0 })).filter(i => i.cantidad > 0)
        if (!items.length) return toast.error('Elegí al menos una entrada')
        setVendiendo(true)
        const r = await registrarVentaAction({ evento_id: eventoId, comprador_nombre: comprador, comprador_contacto: contacto, medio_pago: medio, items })
        if (r.ok) { toast.success(`Venta registrada · ${pesos(r.total)}`); setCant({}); setComprador(''); setContacto(''); cargar() }
        else toast.error(r.error || 'Error')
        setVendiendo(false)
    }
    const anular = async (id: string) => {
        if (!confirm('¿Anular esta venta? Se libera el cupo.')) return
        const r = await anularVentaAction(id)
        if (r.ok) cargar(); else toast.error(r.error || 'Error')
    }

    // --- equipo de función ---
    const [nuevoMiembro, setNuevoMiembro] = useState({ nombre: '', rol: '', monto: '' })
    const [editMiembro, setEditMiembro] = useState<string | null>(null)
    const [editMiembroVals, setEditMiembroVals] = useState({ nombre: '', rol: '', monto: '' })
    const agregarMiembro = async () => {
        if (!nuevoMiembro.nombre.trim()) return toast.error('Nombre de quien trabajó')
        const r = await guardarMiembroEquipoAction({ evento_id: eventoId, nombre: nuevoMiembro.nombre, rol: nuevoMiembro.rol, monto: Number(nuevoMiembro.monto) })
        if (r.ok) { setNuevoMiembro({ nombre: '', rol: '', monto: '' }); cargarEquipo() } else toast.error(r.error || 'Error')
    }
    const guardarEditMiembro = async (id: string) => {
        const r = await guardarMiembroEquipoAction({ id, evento_id: eventoId, nombre: editMiembroVals.nombre, rol: editMiembroVals.rol, monto: Number(editMiembroVals.monto) })
        if (r.ok) { setEditMiembro(null); cargarEquipo() } else toast.error(r.error || 'Error')
    }
    const borrarMiembro = async (id: string) => {
        const r = await eliminarMiembroEquipoAction(id)
        if (r.ok) cargarEquipo(); else toast.error(r.error || 'Error')
    }

    // --- borderaux ---
    const [nuevoGasto, setNuevoGasto] = useState({ concepto: '', monto: '' })
    const [editGasto, setEditGasto] = useState<string | null>(null)
    const [editGastoVals, setEditGastoVals] = useState({ concepto: '', monto: '' })
    const [pctInput, setPctInput] = useState('')
    useEffect(() => { if (borderaux) setPctInput(String(borderaux.pct)) }, [borderaux?.pct])

    const guardarPct = async () => {
        const p = Math.max(0, Math.min(100, Number(pctInput) || 0))
        const r = await setRepartoPctAction(eventoId, p)
        if (r.ok) cargarBorderaux(); else toast.error(r.error || 'Error')
    }
    const toggleEquipoBorderaux = async () => {
        const r = await toggleIncluirEquipoAction(eventoId, !(borderaux?.incluirEquipo))
        if (r.ok) cargarBorderaux(); else toast.error(r.error || 'Error')
    }
    const agregarGasto = async () => {
        if (!nuevoGasto.concepto.trim()) return toast.error('Concepto del gasto')
        const r = await guardarGastoAction({ evento_id: eventoId, concepto: nuevoGasto.concepto, monto: Number(nuevoGasto.monto) })
        if (r.ok) { setNuevoGasto({ concepto: '', monto: '' }); cargarBorderaux() } else toast.error(r.error || 'Error')
    }
    const guardarEditGasto = async (id: string) => {
        const r = await guardarGastoAction({ id, evento_id: eventoId, concepto: editGastoVals.concepto, monto: Number(editGastoVals.monto) })
        if (r.ok) { setEditGasto(null); cargarBorderaux() } else toast.error(r.error || 'Error')
    }
    const borrarGasto = async (id: string) => {
        const r = await eliminarGastoAction(id)
        if (r.ok) cargarBorderaux(); else toast.error(r.error || 'Error')
    }
    const descargarBorderaux = () => {
        if (!borderaux) return
        const lin: any[] = [
            ['BORDERAUX', evento?.nombre || ''],
            [],
            ['Ingresos totales', borderaux.ingresos],
            ['Ventas confirmadas', borderaux.ventasCount],
            [`Cargo de servicio (${SERVICIO_PCT}%) → Piso 2`, borderaux.servicio],
            ['Valor de entradas (base a repartir)', borderaux.baseEntradas],
            [],
            ['DEDUCCIONES'],
            [`Equipo de función${borderaux.incluirEquipo ? '' : ' (NO incluido)'}`, borderaux.totalEquipo],
            ...borderaux.gastos.map((g: any) => [g.concepto, Number(g.monto)]),
            ['Total deducido', borderaux.deducido],
            [],
            ['Neto a repartir', borderaux.neto],
            [`Compañía (${borderaux.pct}%)`, borderaux.compania],
            [`Piso 2 reparto (${100 - borderaux.pct}%)`, borderaux.piso2Reparto],
            [`Servicio (${SERVICIO_PCT}%)`, borderaux.servicio],
            ['Piso 2 total (reparto + servicio)', borderaux.piso2],
        ]
        const csv = lin.map((r: any[]) => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `borderaux-${(evento?.nombre || 'evento').replace(/[^a-z0-9]+/gi, '-')}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    // --- invitados ---
    const [nuevoInv, setNuevoInv] = useState({ nombre: '', contacto: '', cantidad: '1' })
    const [editInv, setEditInv] = useState<string | null>(null)
    const [editInvVals, setEditInvVals] = useState({ nombre: '', contacto: '', cantidad: '1' })
    const agregarInvitado = async () => {
        if (!nuevoInv.nombre.trim()) return toast.error('Nombre del invitado')
        const r = await guardarInvitadoAction({ evento_id: eventoId, nombre: nuevoInv.nombre, contacto: nuevoInv.contacto, cantidad: Number(nuevoInv.cantidad) })
        if (r.ok) { setNuevoInv({ nombre: '', contacto: '', cantidad: '1' }); cargarInvitados() } else toast.error(r.error || 'Error')
    }
    const guardarEditInv = async (id: string) => {
        const r = await guardarInvitadoAction({ id, evento_id: eventoId, nombre: editInvVals.nombre, contacto: editInvVals.contacto, cantidad: Number(editInvVals.cantidad) })
        if (r.ok) { setEditInv(null); cargarInvitados() } else toast.error(r.error || 'Error')
    }
    const togglePresente = async (id: string, valor: boolean) => {
        const r = await togglePresenteInvitadoAction(id, valor)
        if (r.ok) cargarInvitados(); else toast.error(r.error || 'Error')
    }
    const borrarInvitado = async (id: string) => {
        const r = await eliminarInvitadoAction(id)
        if (r.ok) cargarInvitados(); else toast.error(r.error || 'Error')
    }

    if (loading || !evento) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>

    const recaudado = ventas.filter(v => v.estado === 'confirmada').reduce((s, v) => s + Number(v.total), 0)
    const vendidasTot = entradas.reduce((s, e) => s + e.vendidas, 0)
    const cupoTot = entradas.reduce((s, e) => s + e.cupo, 0)

    return (
        <div className="max-w-3xl mx-auto">
            <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide mb-4"><ArrowLeft size={15} /> Volver</button>

            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight">{evento.nombre}</h1>
                    <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1"><CalendarDays size={12} /> {fmtFecha(evento.fecha)}</span>
                        {evento.lugar && <span className="flex items-center gap-1"><MapPin size={12} /> {evento.lugar}</span>}
                    </p>
                </div>
                <button onClick={borrarEvento} className="text-gray-600 hover:text-red-400 p-2"><Trash2 size={16} /></button>
            </div>

            {/* estado */}
            <div className="flex gap-2 mb-4">
                {(['borrador', 'activo', 'finalizado'] as const).map(s => (
                    <button key={s} onClick={() => setEstado(s)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${evento.estado === s ? ESTADOS[s].cls + ' ring-1 ring-white/20' : 'bg-white/5 text-gray-500 hover:text-white'}`}>{ESTADOS[s].label}</button>
                ))}
            </div>

            {/* venta online */}
            <div className="flex flex-wrap items-center gap-2 mb-5 bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                <Globe size={15} className={evento.venta_online ? 'text-[#D4E655]' : 'text-gray-500'} />
                <span className="text-xs font-semibold text-gray-300">Venta online</span>
                <button onClick={toggleOnline} className={`ml-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors ${evento.venta_online ? 'bg-[#D4E655] text-black' : 'bg-white/10 text-gray-400'}`}>{evento.venta_online ? 'Activada' : 'Desactivada'}</button>
                {evento.venta_online && (
                    <>
                        <button onClick={copiarLinkCompra} className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-1.5 rounded-lg"><Copy size={12} /> Copiar link</button>
                        <a href={`/evento/${eventoId}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-1.5 rounded-lg"><Ticket size={12} /> Ver</a>
                    </>
                )}
                {!evento.venta_online && <span className="ml-auto text-[10px] text-gray-500">Activala y compartí el link para vender entradas online.</span>}
            </div>

            {/* check-in + reporte */}
            <div className="grid grid-cols-2 gap-2 mb-5">
                <Link href={`/eventos/${eventoId}/checkin`} className="flex items-center justify-center gap-2 bg-[#D4E655] text-black font-bold py-3 rounded-xl uppercase text-[11px] tracking-wide hover:bg-white transition-colors">
                    <ScanLine size={15} /> Check-in
                </Link>
                <button onClick={abrirReporte} className="flex items-center justify-center gap-2 bg-[#111] border border-white/10 text-gray-200 font-bold py-3 rounded-xl uppercase text-[11px] tracking-wide hover:border-white/30 transition-colors">
                    <BarChart3 size={15} /> Reporte
                </button>
            </div>

            {/* ficha técnica */}
            <Link href={`/eventos/${eventoId}/ficha`} className="w-full flex items-center justify-center gap-2 mb-2 bg-[#0e0e10] border border-white/10 text-gray-300 py-2.5 rounded-xl text-[11px] font-semibold uppercase tracking-wide hover:border-white/30 transition-colors">
                <ClipboardList size={14} /> Ficha técnica de la obra (sonido, luces, armado…)
            </Link>

            {/* acceso de la compañía */}
            <button onClick={copiarLinkCompania} className="w-full flex items-center justify-center gap-2 mb-5 bg-[#0e0e10] border border-white/10 text-gray-300 py-2.5 rounded-xl text-[11px] font-semibold uppercase tracking-wide hover:border-white/30 transition-colors">
                <Copy size={14} /> Copiar link para la compañía (ve sus ventas en vivo)
            </button>

            {reporte && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setReporte(null)}>
                    <div className="bg-[#09090b] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                            <div><p className="font-black uppercase tracking-tight flex items-center gap-2"><BarChart3 size={18} className="text-[#D4E655]" /> Reporte</p><p className="text-[11px] text-gray-500 truncate">{reporte.evento.nombre}</p></div>
                            <div className="flex items-center gap-2">
                                <button onClick={descargarCSV} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide bg-[#D4E655] text-black px-3 py-2 rounded-lg"><Download size={13} /> CSV</button>
                                <button onClick={() => setReporte(null)} className="p-2 bg-white/5 rounded-full text-gray-300"><X size={16} /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <Stat label="Recaudado" value={pesos(reporte.totales.recaudado)} accent icon={DollarSign} />
                                <Stat label="Vendidas" value={`${reporte.totales.vendidas}${reporte.totales.cupo ? ` / ${reporte.totales.cupo}` : ''}`} icon={Ticket} />
                                <Stat label="Ventas" value={reporte.totales.ventas} icon={Users} />
                                <Stat label="Ingresados" value={`${reporte.totales.ingresados}/${reporte.totales.tickets}`} icon={ScanLine} />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Por tipo de entrada</p>
                                <div className="space-y-1.5">
                                    {reporte.porTipo.map((t: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between bg-[#0e0e10] border border-white/10 rounded-lg px-3 py-2 text-sm">
                                            <span className="font-medium">{t.nombre}</span>
                                            <span className="text-gray-400 text-xs">{t.vendidas}/{t.cupo} · {pesos(t.recaudado)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Por canal</p>{Object.entries(reporte.porCanal).map(([k, v]: [string, any]) => (<div key={k} className="flex justify-between text-sm text-gray-300 capitalize mb-1"><span>{k}</span><span className="text-gray-500 text-xs">{v.cant} · {pesos(v.monto)}</span></div>))}</div>
                                <div><p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Por medio</p>{Object.entries(reporte.porMedio).map(([k, v]: [string, any]) => (<div key={k} className="flex justify-between text-sm text-gray-300 capitalize mb-1"><span>{k}</span><span className="text-gray-500 text-xs">{v.cant} · {pesos(v.monto)}</span></div>))}</div>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Compradores ({reporte.filas.length})</p>
                                <div className="space-y-1.5">
                                    {reporte.filas.map((f: any, i: number) => (
                                        <div key={i} className="bg-[#0e0e10] border border-white/10 rounded-lg px-3 py-2">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="min-w-0"><p className="font-medium text-sm truncate">{f.comprador}</p><p className="text-[11px] text-gray-500 truncate">{f.detalle}{f.contacto ? ` · ${f.contacto}` : ''}</p></div>
                                                <div className="text-right shrink-0"><p className="text-[#D4E655] font-bold text-sm">{pesos(f.total)}</p><p className="text-[10px] text-gray-500 capitalize">{f.canal} · {f.ingresados} ✓</p></div>
                                            </div>
                                        </div>
                                    ))}
                                    {reporte.filas.length === 0 && <p className="text-xs text-gray-500">Sin ventas confirmadas todavía.</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <Stat label="Recaudado" value={pesos(recaudado)} accent icon={DollarSign} />
                <Stat label="Vendidas" value={`${vendidasTot}${cupoTot ? ` / ${cupoTot}` : ''}`} icon={Ticket} />
                <Stat label="Ventas" value={ventas.filter(v => v.estado === 'confirmada').length} icon={Users} />
            </div>

            {/* entradas */}
            <Seccion titulo="Tipos de entrada">
                <div className="space-y-2">
                    {entradas.map(e => (
                        <div key={e.id} className="bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                            {editEnt === e.id ? (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input value={editVals.nombre} onChange={ev => setEditVals(v => ({ ...v, nombre: ev.target.value }))} className="inp flex-1 min-w-[120px]" />
                                        <input value={editVals.precio} onChange={ev => setEditVals(v => ({ ...v, precio: ev.target.value }))} type="number" placeholder="Precio" className="inp w-24" />
                                        <input value={editVals.cupo} onChange={ev => setEditVals(v => ({ ...v, cupo: ev.target.value }))} type="number" placeholder="Cupo" className="inp w-20" />
                                        <button onClick={() => guardarEdit(e.id)} className="bg-[#D4E655] text-black p-2 rounded-lg"><Check size={15} /></button>
                                        <button onClick={() => setEditEnt(null)} className="bg-white/10 text-gray-300 p-2 rounded-lg"><X size={15} /></button>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button type="button" onClick={() => setEditVals(v => ({ ...v, oculta: !v.oculta }))} className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${editVals.oculta ? 'bg-purple-500/15 border-purple-400/40 text-purple-300' : 'bg-white/5 border-white/10 text-gray-400'}`}><EyeOff size={13} /> Oculta (promo)</button>
                                        {editVals.oculta && <input value={editVals.codigo_promo} onChange={ev => setEditVals(v => ({ ...v, codigo_promo: ev.target.value }))} placeholder="Código de promo" className="inp flex-1 min-w-[120px]" />}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate flex items-center gap-1.5">{e.nombre} {e.oculta && <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 uppercase font-bold"><EyeOff size={10} /> Oculta</span>}</p>
                                        <p className="text-[11px] text-gray-500">{pesos(e.precio)} · {e.vendidas}/{e.cupo} vendidas · <span className={e.disponible > 0 ? 'text-[#D4E655]' : 'text-red-400'}>{e.disponible} libres</span></p>
                                        {e.oculta && e.codigo_promo && (
                                            <button onClick={() => copiarLinkPromo(e.codigo_promo!)} className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-purple-300/80 hover:text-purple-300"><Copy size={11} /> Copiar link con promo “{e.codigo_promo}”</button>
                                        )}
                                    </div>
                                    <button onClick={() => { setEditEnt(e.id); setEditVals({ nombre: e.nombre, precio: String(e.precio), cupo: String(e.cupo), oculta: !!e.oculta, codigo_promo: e.codigo_promo || '' }) }} className="text-gray-500 hover:text-white p-1.5"><Pencil size={14} /></button>
                                    <button onClick={() => borrarEntrada(e.id)} className="text-gray-600 hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
                                </div>
                            )}
                        </div>
                    ))}
                    {/* alta */}
                    <div className="bg-[#0e0e10] border border-dashed border-white/15 rounded-xl p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <input value={nuevaEnt.nombre} onChange={e => setNuevaEnt(v => ({ ...v, nombre: e.target.value }))} placeholder="Tipo (General, VIP, 2x1…)" className="inp flex-1 min-w-[120px]" />
                            <input value={nuevaEnt.precio} onChange={e => setNuevaEnt(v => ({ ...v, precio: e.target.value }))} type="number" placeholder="Precio" className="inp w-24" />
                            <input value={nuevaEnt.cupo} onChange={e => setNuevaEnt(v => ({ ...v, cupo: e.target.value }))} type="number" placeholder="Cupo" className="inp w-20" />
                            <button onClick={agregarEntrada} className="bg-[#D4E655] text-black px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1"><Plus size={14} /> Agregar</button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => setNuevaEnt(v => ({ ...v, oculta: !v.oculta }))} className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${nuevaEnt.oculta ? 'bg-purple-500/15 border-purple-400/40 text-purple-300' : 'bg-white/5 border-white/10 text-gray-400'}`}><EyeOff size={13} /> Oculta (promo)</button>
                            {nuevaEnt.oculta && <input value={nuevaEnt.codigo_promo} onChange={e => setNuevaEnt(v => ({ ...v, codigo_promo: e.target.value }))} placeholder="Código de promo (ej: 2x1, AMIGOS)" className="inp flex-1 min-w-[140px]" />}
                        </div>
                        {nuevaEnt.oculta && <p className="text-[10px] text-gray-500">No aparece en la venta pública; solo con el link <span className="text-purple-300">?promo=código</span>.</p>}
                    </div>
                </div>
            </Seccion>

            {/* registrar venta */}
            {entradas.length > 0 && (
                <Seccion titulo="Registrar venta">
                    <div className="space-y-3">
                        <div className="space-y-2">
                            {entradas.map(e => (
                                <div key={e.id} className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{e.nombre} <span className="text-gray-500 text-xs">· {pesos(e.precio)}</span></p>
                                        <p className="text-[10px] text-gray-600">{e.disponible} disponibles</p>
                                    </div>
                                    <input type="number" min={0} max={e.disponible} value={cant[e.id] || ''} onChange={ev => setCant(c => ({ ...c, [e.id]: Math.max(0, Math.min(e.disponible, Math.floor(Number(ev.target.value) || 0))) }))} placeholder="0" className="inp w-20 text-center" disabled={e.disponible <= 0} />
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input value={comprador} onChange={e => setComprador(e.target.value)} placeholder="Nombre del comprador" className="inp w-full" />
                            <input value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Tel / mail (opcional)" className="inp w-full" />
                        </div>
                        <div className="flex items-center gap-2">
                            <select value={medio} onChange={e => setMedio(e.target.value)} className="inp flex-1 capitalize">
                                {MEDIOS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <div className="text-right px-2">
                                <p className="text-[10px] text-gray-500 uppercase">Total {totalVenta > 0 && <span className="normal-case">(entradas {pesos(totalVenta)} + {SERVICIO_PCT}% servicio {pesos(montoServicio(totalVenta))})</span>}</p>
                                <p className="text-lg font-black text-[#D4E655]">{pesos(conServicio(totalVenta))}</p>
                            </div>
                        </div>
                        <button onClick={registrar} disabled={vendiendo || totalEntradasVenta === 0} className="w-full bg-[#D4E655] text-black font-bold py-3 rounded-xl uppercase text-xs tracking-wide hover:bg-white disabled:opacity-40 flex items-center justify-center gap-2">
                            {vendiendo ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Registrar venta ({totalEntradasVenta} entrada{totalEntradasVenta === 1 ? '' : 's'})
                        </button>
                    </div>
                </Seccion>
            )}

            {/* ventas */}
            <Seccion titulo={`Ventas (${ventas.length})`}>
                {ventas.length === 0 ? (
                    <p className="text-xs text-gray-500">Todavía no hay ventas.</p>
                ) : (
                    <div className="space-y-2">
                        {ventas.map(v => (
                            <div key={v.id} className={`bg-[#0e0e10] border rounded-xl p-3 ${v.estado === 'anulada' ? 'border-red-500/20 opacity-60' : 'border-white/10'}`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm truncate">{v.comprador_nombre || 'Sin nombre'} {v.estado === 'anulada' && <span className="text-[9px] text-red-400 uppercase">· anulada</span>}</p>
                                        <p className="text-[11px] text-gray-500 truncate">{v.items.map(i => `${i.cantidad}× ${i.nombre}`).join(' · ')}</p>
                                        <p className="text-[10px] text-gray-600 capitalize">{v.medio_pago} · {fmtFecha(v.created_at)}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-black text-[#D4E655]">{pesos(v.total)}</p>
                                        {v.estado === 'confirmada' && <button onClick={() => anular(v.id)} className="text-[10px] text-gray-500 hover:text-red-400 uppercase font-semibold">Anular</button>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Seccion>

            {/* lista de invitados */}
            <Seccion titulo="Lista de invitados">
                <p className="text-[11px] text-gray-500 -mt-1 mb-3 flex items-center gap-1.5"><UserPlus size={13} className="text-[#D4E655]" /> Cupos sin cargo. En la puerta se marca “llegó”.</p>
                <div className="space-y-2">
                    {invitados.map(inv => (
                        <div key={inv.id} className="bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                            {editInv === inv.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <input value={editInvVals.nombre} onChange={e => setEditInvVals(v => ({ ...v, nombre: e.target.value }))} placeholder="Nombre" className="inp flex-1 min-w-[110px]" />
                                    <input value={editInvVals.contacto} onChange={e => setEditInvVals(v => ({ ...v, contacto: e.target.value }))} placeholder="Contacto" className="inp w-32" />
                                    <input value={editInvVals.cantidad} onChange={e => setEditInvVals(v => ({ ...v, cantidad: e.target.value }))} type="number" min={1} placeholder="Cant." className="inp w-16" />
                                    <button onClick={() => guardarEditInv(inv.id)} className="bg-[#D4E655] text-black p-2 rounded-lg"><Check size={15} /></button>
                                    <button onClick={() => setEditInv(null)} className="bg-white/10 text-gray-300 p-2 rounded-lg"><X size={15} /></button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <button onClick={() => togglePresente(inv.id, !inv.presente)} className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border transition-colors ${inv.presente ? 'bg-[#D4E655] border-[#D4E655]' : 'border-white/25'}`} title={inv.presente ? 'Llegó' : 'Marcar llegada'}>
                                        {inv.presente && <Check size={13} className="text-black" strokeWidth={3} />}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-bold text-sm truncate ${inv.presente ? 'text-gray-100' : 'text-gray-300'}`}>{inv.nombre} {inv.cantidad > 1 && <span className="text-[10px] font-semibold text-gray-500">×{inv.cantidad}</span>}</p>
                                        {inv.contacto && <p className="text-[11px] text-gray-500 truncate">{inv.contacto}</p>}
                                    </div>
                                    {inv.presente && <span className="text-[10px] text-[#D4E655] uppercase font-bold tracking-wide">Llegó</span>}
                                    <button onClick={() => { setEditInv(inv.id); setEditInvVals({ nombre: inv.nombre, contacto: inv.contacto || '', cantidad: String(inv.cantidad || 1) }) }} className="text-gray-500 hover:text-white p-1.5"><Pencil size={14} /></button>
                                    <button onClick={() => borrarInvitado(inv.id)} className="text-gray-600 hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
                                </div>
                            )}
                        </div>
                    ))}
                    {/* alta */}
                    <div className="flex flex-wrap items-center gap-2 bg-[#0e0e10] border border-dashed border-white/15 rounded-xl p-3">
                        <input value={nuevoInv.nombre} onChange={e => setNuevoInv(v => ({ ...v, nombre: e.target.value }))} placeholder="Nombre del invitado" className="inp flex-1 min-w-[120px]" />
                        <input value={nuevoInv.contacto} onChange={e => setNuevoInv(v => ({ ...v, contacto: e.target.value }))} placeholder="Contacto (opcional)" className="inp w-32" />
                        <input value={nuevoInv.cantidad} onChange={e => setNuevoInv(v => ({ ...v, cantidad: e.target.value }))} type="number" min={1} placeholder="Cant." className="inp w-16" />
                        <button onClick={agregarInvitado} className="bg-[#D4E655] text-black px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1"><Plus size={14} /> Agregar</button>
                    </div>
                    {invitados.length > 0 && (
                        <div className="flex items-center justify-between pt-1 px-1">
                            <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Invitados</span>
                            <span className="font-black text-white">{invStats.presentes}/{invStats.total} llegaron</span>
                        </div>
                    )}
                </div>
            </Seccion>

            {/* equipo de función */}
            <Seccion titulo="Equipo de función">
                <p className="text-[11px] text-gray-500 -mt-1 mb-3 flex items-center gap-1.5"><HardHat size={13} className="text-[#D4E655]" /> Quién trabajó en la función y su cachet. Alimenta el borderaux.</p>
                <div className="space-y-2">
                    {equipo.map(m => (
                        <div key={m.id} className="bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                            {editMiembro === m.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <input value={editMiembroVals.nombre} onChange={e => setEditMiembroVals(v => ({ ...v, nombre: e.target.value }))} placeholder="Nombre" className="inp flex-1 min-w-[110px]" />
                                    <input value={editMiembroVals.rol} onChange={e => setEditMiembroVals(v => ({ ...v, rol: e.target.value }))} placeholder="Rol" className="inp w-28" />
                                    <input value={editMiembroVals.monto} onChange={e => setEditMiembroVals(v => ({ ...v, monto: e.target.value }))} type="number" placeholder="Cachet" className="inp w-24" />
                                    <button onClick={() => guardarEditMiembro(m.id)} className="bg-[#D4E655] text-black p-2 rounded-lg"><Check size={15} /></button>
                                    <button onClick={() => setEditMiembro(null)} className="bg-white/10 text-gray-300 p-2 rounded-lg"><X size={15} /></button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate">{m.nombre} {m.rol && <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">· {m.rol}</span>}</p>
                                        <p className="text-[11px] text-gray-500">{pesos(Number(m.monto))}</p>
                                    </div>
                                    <button onClick={() => { setEditMiembro(m.id); setEditMiembroVals({ nombre: m.nombre, rol: m.rol || '', monto: String(m.monto || '') }) }} className="text-gray-500 hover:text-white p-1.5"><Pencil size={14} /></button>
                                    <button onClick={() => borrarMiembro(m.id)} className="text-gray-600 hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
                                </div>
                            )}
                        </div>
                    ))}
                    {/* alta */}
                    <div className="flex flex-wrap items-center gap-2 bg-[#0e0e10] border border-dashed border-white/15 rounded-xl p-3">
                        <input value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro(v => ({ ...v, nombre: e.target.value }))} placeholder="Nombre" className="inp flex-1 min-w-[110px]" />
                        <input value={nuevoMiembro.rol} onChange={e => setNuevoMiembro(v => ({ ...v, rol: e.target.value }))} placeholder="Rol (sonido, luces…)" className="inp w-36" />
                        <input value={nuevoMiembro.monto} onChange={e => setNuevoMiembro(v => ({ ...v, monto: e.target.value }))} type="number" placeholder="Cachet" className="inp w-24" />
                        <button onClick={agregarMiembro} className="bg-[#D4E655] text-black px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1"><Plus size={14} /> Agregar</button>
                    </div>
                    {equipo.length > 0 && (
                        <div className="flex items-center justify-between pt-1 px-1">
                            <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Total equipo</span>
                            <span className="font-black text-white">{pesos(totalEquipo)}</span>
                        </div>
                    )}
                </div>
            </Seccion>

            {/* borderaux / liquidación */}
            {borderaux && (
                <Seccion titulo="Borderaux / liquidación">
                    <p className="text-[11px] text-gray-500 -mt-1 mb-3 flex items-center gap-1.5"><Scale size={13} className="text-[#D4E655]" /> Ingresos menos deducciones, repartido con la compañía.</p>

                    {/* ingresos */}
                    <div className="bg-[#0e0e10] border border-white/10 rounded-xl p-3 mb-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-gray-100">Ingresos totales</p>
                                <p className="text-[10px] text-gray-500">{borderaux.ventasCount} venta{borderaux.ventasCount === 1 ? '' : 's'} confirmada{borderaux.ventasCount === 1 ? '' : 's'}</p>
                            </div>
                            <p className="font-black text-[#D4E655]">{pesos(borderaux.ingresos)}</p>
                        </div>
                        <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                            <div className="flex items-center justify-between text-[11px]"><span className="text-gray-500">Cargo de servicio ({SERVICIO_PCT}%) → Piso 2</span><span className="text-gray-400">{pesos(borderaux.servicio)}</span></div>
                            <div className="flex items-center justify-between text-[11px]"><span className="text-gray-500">Valor de entradas (base a repartir)</span><span className="text-gray-300 font-semibold">{pesos(borderaux.baseEntradas)}</span></div>
                        </div>
                    </div>

                    {/* deducciones */}
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Deducciones</p>
                    <div className="space-y-2 mb-3">
                        {/* equipo de función (auto) */}
                        <div className="flex items-center gap-3 bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                            <button onClick={toggleEquipoBorderaux} className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border transition-colors ${borderaux.incluirEquipo ? 'bg-[#D4E655] border-[#D4E655]' : 'border-white/25'}`}>
                                {borderaux.incluirEquipo && <Check size={13} className="text-black" strokeWidth={3} />}
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-100">Equipo de función</p>
                                <p className="text-[10px] text-gray-500">{borderaux.incluirEquipo ? 'Se descuenta del reparto' : 'No se descuenta'}</p>
                            </div>
                            <p className={`font-bold ${borderaux.incluirEquipo ? 'text-gray-200' : 'text-gray-600 line-through'}`}>{pesos(borderaux.totalEquipo)}</p>
                        </div>
                        {/* gastos manuales */}
                        {borderaux.gastos.map((g: any) => (
                            <div key={g.id} className="bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                                {editGasto === g.id ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input value={editGastoVals.concepto} onChange={e => setEditGastoVals(v => ({ ...v, concepto: e.target.value }))} placeholder="Concepto" className="inp flex-1 min-w-[120px]" />
                                        <input value={editGastoVals.monto} onChange={e => setEditGastoVals(v => ({ ...v, monto: e.target.value }))} type="number" placeholder="Monto" className="inp w-24" />
                                        <button onClick={() => guardarEditGasto(g.id)} className="bg-[#D4E655] text-black p-2 rounded-lg"><Check size={15} /></button>
                                        <button onClick={() => setEditGasto(null)} className="bg-white/10 text-gray-300 p-2 rounded-lg"><X size={15} /></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <p className="flex-1 min-w-0 text-sm font-medium text-gray-100 truncate">{g.concepto}</p>
                                        <p className="font-bold text-gray-200">{pesos(Number(g.monto))}</p>
                                        <button onClick={() => { setEditGasto(g.id); setEditGastoVals({ concepto: g.concepto, monto: String(g.monto || '') }) }} className="text-gray-500 hover:text-white p-1.5"><Pencil size={14} /></button>
                                        <button onClick={() => borrarGasto(g.id)} className="text-gray-600 hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {/* alta gasto */}
                        <div className="flex flex-wrap items-center gap-2 bg-[#0e0e10] border border-dashed border-white/15 rounded-xl p-3">
                            <input value={nuevoGasto.concepto} onChange={e => setNuevoGasto(v => ({ ...v, concepto: e.target.value }))} placeholder="Concepto (servicio, gasto…)" className="inp flex-1 min-w-[120px]" />
                            <input value={nuevoGasto.monto} onChange={e => setNuevoGasto(v => ({ ...v, monto: e.target.value }))} type="number" placeholder="Monto" className="inp w-24" />
                            <button onClick={agregarGasto} className="bg-[#D4E655] text-black px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1"><Plus size={14} /> Agregar</button>
                        </div>
                        <div className="flex items-center justify-between pt-1 px-1">
                            <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Total deducido</span>
                            <span className="font-black text-white">{pesos(borderaux.deducido)}</span>
                        </div>
                    </div>

                    {/* reparto */}
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-[11px] text-gray-400 font-semibold">% para la compañía</span>
                        <input value={pctInput} onChange={e => setPctInput(e.target.value)} onBlur={guardarPct} type="number" min={0} max={100} className="inp w-20 text-center" />
                        <span className="text-[11px] text-gray-600">Piso 2: {100 - (Number(pctInput) || 0)}%</span>
                    </div>

                    <div className="rounded-xl bg-[#D4E655]/10 border border-[#D4E655]/30 p-4 mb-3">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Neto a repartir</span>
                            <span className={`font-black ${borderaux.neto < 0 ? 'text-red-400' : 'text-white'}`}>{pesos(borderaux.neto)}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 mb-2">Valor de entradas − deducciones (el servicio no se reparte).</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-black/30 p-3">
                                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Compañía ({borderaux.pct}%)</p>
                                <p className="text-lg font-black text-[#D4E655]">{pesos(borderaux.compania)}</p>
                            </div>
                            <div className="rounded-lg bg-black/30 p-3">
                                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Piso 2</p>
                                <p className="text-lg font-black text-white">{pesos(borderaux.piso2)}</p>
                                <p className="text-[9px] text-gray-500 mt-0.5">{pesos(borderaux.piso2Reparto)} ({100 - borderaux.pct}%) + {pesos(borderaux.servicio)} servicio</p>
                            </div>
                        </div>
                    </div>

                    <button onClick={descargarBorderaux} className="w-full flex items-center justify-center gap-2 bg-[#111] border border-white/10 text-gray-200 font-bold py-2.5 rounded-xl uppercase text-[11px] tracking-wide hover:border-white/30 transition-colors">
                        <Download size={14} /> Descargar borderaux (CSV)
                    </button>
                </Seccion>
            )}
        </div>
    )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block"><span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{label}</span><div className="mt-1">{children}</div></label>
}
function Stat({ label, value, icon: Icon, accent }: { label: string; value: any; icon: any; accent?: boolean }) {
    return (
        <div className={`rounded-2xl p-3 border ${accent ? 'bg-[#D4E655]/10 border-[#D4E655]/30' : 'bg-[#09090b] border-white/10'}`}>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold flex items-center gap-1"><Icon size={11} /> {label}</p>
            <p className={`text-lg font-black mt-1 ${accent ? 'text-[#D4E655]' : 'text-white'}`}>{value}</p>
        </div>
    )
}
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div className="bg-[#09090b] border border-white/10 rounded-2xl p-4 mb-4">
            <p className="text-xs font-black uppercase tracking-widest text-gray-300 mb-3">{titulo}</p>
            {children}
        </div>
    )
}
