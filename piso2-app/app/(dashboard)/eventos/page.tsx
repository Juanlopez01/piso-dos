'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Ticket, Plus, ArrowLeft, RefreshCw, Trash2, Pencil, Check, X, CalendarDays, MapPin, DollarSign, Users, Globe, Copy, ScanLine, BarChart3, Download, ClipboardList, HardHat, Scale, EyeOff, UserPlus, AlertTriangle, ShoppingCart, MessageCircle, CalendarPlus, Layers, Upload, Image as ImageIcon, Theater } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { optimizeImage } from '@/utils/optimizeImage'
import { montoServicio, conServicio, SERVICIO_PCT } from '@/utils/servicio'
import {
    getObrasDeEventoAction, getObrasAceptadasDisponiblesAction, vincularObraAEventoAction, desvincularObraAction,
} from '@/app/actions/convocatoria'
import {
    getEventosAction, getEventoAction, crearEventoAction, editarEventoAction, cambiarEstadoEventoAction, toggleVentaOnlineAction, getReporteEventoAction, getLinkCompaniaAction,
    eliminarEventoAction, guardarEntradaAction, eliminarEntradaAction, registrarVentaAction, anularVentaAction, reembolsarVentaAction, cancelarEventoAction,
    getEquipoAction, guardarMiembroEquipoAction, eliminarMiembroEquipoAction,
    getBorderauxAction, setRepartoPctAction, toggleIncluirEquipoAction, guardarGastoAction, eliminarGastoAction,
    getInvitadosAction, guardarInvitadoAction, togglePresenteInvitadoAction, eliminarInvitadoAction,
    getCarritosAbandonadosAction, descartarCarritoAction,
    getCiclosEventoAction, crearCicloEventoAction, asignarCicloAction, duplicarEventoAction,
    getLinkPuertaAction, getFechasHermanasAction, traspasarVentaAction,
} from '@/app/actions/eventos'

type EventoRow = { id: string; nombre: string; fecha: string | null; lugar: string | null; estado: string; recaudado: number; vendidas: number }
type Entrada = { id: string; nombre: string; precio: number; cupo: number; vendidas: number; disponible: number; orden: number; oculta?: boolean; codigo_promo?: string | null }
type Venta = { id: string; comprador_nombre: string | null; comprador_contacto: string | null; medio_pago: string; total: number; estado: string; canal?: string | null; reembolsada?: boolean; created_at: string; items: { nombre: string; cantidad: number; precio_unit: number }[] }
type Evento = { id: string; nombre: string; descripcion: string | null; fecha: string | null; lugar: string | null; estado: string; venta_online?: boolean; cancelado?: boolean; ciclo_id?: string | null; ciclo?: { nombre: string; slug: string } | null }

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR')
const fmtFecha = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'
const haceCuanto = (iso: string) => {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (min < 60) return `hace ${min} min`
    const hs = Math.floor(min / 60)
    if (hs < 24) return `hace ${hs} h`
    return `hace ${Math.floor(hs / 24)} d`
}
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

// Subida de flyer reusable → devuelve la URL pública (bucket talent, carpeta eventos/).
function FlyerUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
    const [supabase] = useState(() => createClient())
    const [subiendo, setSubiendo] = useState(false)
    const subir = async (file: File | null) => {
        if (!file) return
        setSubiendo(true)
        try {
            const opt = await optimizeImage(file, { maxDim: 1600 })
            const ext = opt.name.split('.').pop()
            const path = `eventos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error } = await supabase.storage.from('talent').upload(path, opt)
            if (error) throw error
            onChange(supabase.storage.from('talent').getPublicUrl(path).data.publicUrl)
        } catch (e: any) { toast.error('No se pudo subir el flyer: ' + (e.message || '')) }
        setSubiendo(false)
    }
    return (
        <div className="flex items-center gap-3">
            {value
                ? <div className="relative w-16 h-20 rounded-lg overflow-hidden border border-white/10 shrink-0"><img src={value} alt="" className="w-full h-full object-cover" /><button type="button" onClick={() => onChange('')} className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"><X size={11} /></button></div>
                : <label className="w-16 h-20 border border-dashed border-white/20 rounded-lg flex items-center justify-center cursor-pointer hover:border-white/40 text-gray-500 shrink-0">{subiendo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}<input type="file" accept="image/*" className="hidden" onChange={e => subir(e.target.files?.[0] || null)} /></label>}
            <span className="text-[11px] text-gray-500">{value ? 'Flyer cargado' : 'Subí el flyer del evento (opcional)'}</span>
        </div>
    )
}

function ModalNuevo({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
    const [nombre, setNombre] = useState('')
    const [fecha, setFecha] = useState('')
    const [lugar, setLugar] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [flyer, setFlyer] = useState('')
    const [saving, setSaving] = useState(false)

    const crear = async () => {
        if (!nombre.trim()) return toast.error('Poné un nombre')
        setSaving(true)
        const r = await crearEventoAction({ nombre, fecha: fecha || null, lugar, descripcion, flyer_url: flyer })
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
                    <Campo label="Flyer"><FlyerUploader value={flyer} onChange={setFlyer} /></Campo>
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
    const [carritos, setCarritos] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const cargarInvitados = async () => {
        const r = await getInvitadosAction(eventoId)
        if (r.ok) { setInvitados(r.invitados); setInvStats({ total: r.totalInvitados, presentes: r.presentes }) }
    }
    const cargarCarritos = async () => {
        const r = await getCarritosAbandonadosAction(eventoId)
        if (r.ok) setCarritos(r.carritos)
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
        cargarCarritos()
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
    const [ultimaVenta, setUltimaVenta] = useState<{ id: string; token: string } | null>(null)
    const totalVenta = entradas.reduce((s, e) => s + (cant[e.id] || 0) * e.precio, 0)
    const totalEntradasVenta = entradas.reduce((s, e) => s + (cant[e.id] || 0), 0)

    const registrar = async () => {
        const items = entradas.map(e => ({ entrada_id: e.id, cantidad: cant[e.id] || 0 })).filter(i => i.cantidad > 0)
        if (!items.length) return toast.error('Elegí al menos una entrada')
        setVendiendo(true)
        const r = await registrarVentaAction({ evento_id: eventoId, comprador_nombre: comprador, comprador_contacto: contacto, medio_pago: medio, items })
        if (r.ok) { toast.success(`Venta registrada · ${pesos(r.total)}`); setUltimaVenta({ id: r.id, token: (r as any).token }); setCant({}); setComprador(''); setContacto(''); cargar() }
        else toast.error(r.error || 'Error')
        setVendiendo(false)
    }
    const reembolsar = async (v: Venta) => {
        const esOnline = v.canal === 'online'
        const msg = esOnline
            ? `¿Reembolsar esta venta? Se devuelve ${pesos(v.total)} por Mercado Pago y se anulan sus entradas.`
            : `¿Reembolsar esta venta? Marcala como devuelta (${pesos(v.total)} en mano) y se anulan sus entradas.`
        if (!confirm(msg)) return
        const r = await reembolsarVentaAction(v.id)
        if (r.ok) { toast.success(r.viaMP ? 'Reembolsado por Mercado Pago' : 'Marcada como reembolsada (en mano)'); cargar() }
        else toast.error(r.error || 'Error')
    }

    // --- carritos abandonados ---
    const mensajeCarrito = (c: any) => `Hola ${c.nombre}! Vimos que empezaste a comprar tu entrada para "${evento?.nombre}" y no llegaste a completar el pago. Podés terminarla acá: ${window.location.origin}/evento/${eventoId} . ¡Te esperamos!`
    const copiarMsgCarrito = (c: any) => { navigator.clipboard.writeText(mensajeCarrito(c)); toast.success('Mensaje copiado') }
    const descartarCarrito = async (id: string) => {
        if (!confirm('¿Descartar esta orden pendiente? No se puede deshacer.')) return
        const r = await descartarCarritoAction(id)
        if (r.ok) cargarCarritos(); else toast.error((r as any).error || 'Error')
    }

    // --- ciclo (varias fechas) ---
    const [ciclos, setCiclos] = useState<any[]>([])
    const [nombreCiclo, setNombreCiclo] = useState('')
    const [fechaDup, setFechaDup] = useState('')
    const cargarCiclos = async () => { const r = await getCiclosEventoAction(); if (r.ok) setCiclos(r.ciclos) }
    useEffect(() => { cargarCiclos() }, [])
    const crearCiclo = async () => {
        const nombre = nombreCiclo.trim() || evento?.nombre || ''
        if (!nombre) return toast.error('Poné un nombre al ciclo')
        const r = await crearCicloEventoAction({ nombre, eventoId })
        if (r.ok) { toast.success('Ciclo creado. Esta función quedó como su primera fecha.'); setNombreCiclo(''); cargar(); cargarCiclos() }
        else toast.error((r as any).error || 'Error')
    }
    const asignarCiclo = async (cicloId: string) => {
        const r = await asignarCicloAction(eventoId, cicloId || null)
        if (r.ok) cargar(); else toast.error((r as any).error || 'Error')
    }
    const duplicarFecha = async () => {
        const r = await duplicarEventoAction(eventoId, fechaDup || null)
        if (r.ok) { toast.success('Fecha duplicada (en borrador). Revisala y activala.'); setFechaDup('') }
        else toast.error((r as any).error || 'Error')
    }
    const copiarLinkCiclo = () => {
        if (!evento?.ciclo?.slug) return
        navigator.clipboard.writeText(`${window.location.origin}/ciclo/${evento.ciclo.slug}`)
        toast.success('Link del ciclo copiado')
    }
    const cambiarFlyer = async (url: string) => {
        const r = await editarEventoAction(eventoId, { flyer_url: url || null })
        if (r.ok) setEvento(ev => ev ? { ...ev, flyer_url: url || null } as any : ev); else toast.error((r as any).error || 'Error')
    }

    // --- obras del evento (varias obras en un programa) ---
    const [obras, setObras] = useState<any[]>([])
    const [obrasDisp, setObrasDisp] = useState<any[]>([])
    const cargarObras = async () => {
        const [a, b] = await Promise.all([getObrasDeEventoAction(eventoId), getObrasAceptadasDisponiblesAction(eventoId)])
        if (a.ok) setObras(a.obras)
        if (b.ok) setObrasDisp(b.obras)
    }
    useEffect(() => { cargarObras() }, [eventoId])
    const agregarObra = async (propuestaId: string) => {
        const r = await vincularObraAEventoAction(propuestaId, eventoId)
        if (r.ok) cargarObras(); else toast.error((r as any).error || 'Error')
    }
    const quitarObra = async (propuestaId: string) => {
        const r = await desvincularObraAction(propuestaId)
        if (r.ok) cargarObras(); else toast.error((r as any).error || 'Error')
    }

    // --- link de puerta (gente externa) ---
    const copiarLinkPuerta = async () => {
        const r = await getLinkPuertaAction(eventoId)
        if (!r.ok) return toast.error((r as any).error || 'Error')
        navigator.clipboard.writeText(`${window.location.origin}/puerta/${eventoId}?t=${r.token}`)
        toast.success('Link de puerta copiado (leer QR + cargar ventas)')
    }

    // --- traspaso de fecha ---
    const [fechasHermanas, setFechasHermanas] = useState<any[]>([])
    const [traspasando, setTraspasando] = useState<string | null>(null)
    useEffect(() => { (async () => { const r = await getFechasHermanasAction(eventoId); if (r.ok) setFechasHermanas(r.fechas) })() }, [eventoId, evento?.ciclo_id])
    const traspasar = async (ventaId: string, destino: string) => {
        if (!destino) return
        const r = await traspasarVentaAction(ventaId, destino)
        if (r.ok) { toast.success('Entradas traspasadas a la otra fecha'); setTraspasando(null); cargar() }
        else toast.error((r as any).error || 'Error')
    }

    // --- cancelar función ---
    const [cancelacion, setCancelacion] = useState<any>(null)
    const cancelarFuncion = async () => {
        if (!confirm(`¿Cancelar la función "${evento?.nombre}"?\n\nSe reembolsan TODAS las ventas confirmadas (Mercado Pago las online, en mano las de mostrador) y se cortan las ventas nuevas. No se puede deshacer.`)) return
        const r = await cancelarEventoAction(eventoId)
        if (r.ok) { setCancelacion(r); toast.success('Función cancelada'); cargar() }
        else toast.error((r as any).error || 'Error')
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
                    <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">{evento.nombre} {evento.cancelado && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 uppercase font-bold">Cancelada</span>}</h1>
                    <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1"><CalendarDays size={12} /> {fmtFecha(evento.fecha)}</span>
                        {evento.lugar && <span className="flex items-center gap-1"><MapPin size={12} /> {evento.lugar}</span>}
                    </p>
                </div>
                <button onClick={borrarEvento} className="text-gray-600 hover:text-red-400 p-2"><Trash2 size={16} /></button>
            </div>

            {evento.cancelado && (
                <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-[12px] text-red-300 flex items-center gap-2">
                    <AlertTriangle size={15} /> Función cancelada. Las ventas nuevas están cortadas y las confirmadas fueron reembolsadas.
                </div>
            )}

            {/* estado */}
            <div className="flex flex-wrap gap-2 mb-4">
                {(['borrador', 'activo', 'finalizado'] as const).map(s => (
                    <button key={s} onClick={() => setEstado(s)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${evento.estado === s ? ESTADOS[s].cls + ' ring-1 ring-white/20' : 'bg-white/5 text-gray-500 hover:text-white'}`}>{ESTADOS[s].label}</button>
                ))}
                {!evento.cancelado && (
                    <button onClick={cancelarFuncion} className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors flex items-center gap-1.5"><AlertTriangle size={13} /> Cancelar función</button>
                )}
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

            {/* ciclo de varias fechas */}
            <div className="mb-5 bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                    <Layers size={15} className={evento.ciclo_id ? 'text-[#D4E655]' : 'text-gray-500'} />
                    <span className="text-xs font-semibold text-gray-300">Ciclo / varias fechas</span>
                </div>
                {evento.ciclo_id ? (
                    <div className="space-y-2">
                        <p className="text-[11px] text-gray-400">Esta función es parte del ciclo <b className="text-gray-200">“{evento.ciclo?.nombre}”</b>. El público elige la fecha en el link del ciclo.</p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={copiarLinkCiclo} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide bg-[#D4E655]/15 text-[#D4E655] px-3 py-1.5 rounded-lg"><Copy size={12} /> Copiar link del ciclo</button>
                            <a href={`/ciclo/${evento.ciclo?.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-1.5 rounded-lg"><Ticket size={12} /> Ver ciclo</a>
                            <button onClick={() => asignarCiclo('')} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide bg-white/5 hover:bg-white/10 text-gray-400 px-3 py-1.5 rounded-lg"><X size={12} /> Quitar del ciclo</button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                            <span className="text-[11px] text-gray-500">Duplicar a otra fecha:</span>
                            <input value={fechaDup} onChange={e => setFechaDup(e.target.value)} type="datetime-local" className="inp w-52" />
                            <button onClick={duplicarFecha} className="bg-[#D4E655] text-black px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wide flex items-center gap-1"><CalendarPlus size={13} /> Duplicar función</button>
                        </div>
                        <p className="text-[10px] text-gray-600">La copia clona los tipos de entrada y queda en borrador para revisarla.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-[11px] text-gray-500">Si esta obra se repite en varias fechas, agrupalas en un ciclo: el público entra a un solo link y elige la función.</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <input value={nombreCiclo} onChange={e => setNombreCiclo(e.target.value)} placeholder={`Nombre del ciclo (ej: ${evento.nombre})`} className="inp flex-1 min-w-[160px]" />
                            <button onClick={crearCiclo} className="bg-[#D4E655] text-black px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1"><Plus size={14} /> Crear ciclo</button>
                        </div>
                        {ciclos.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-gray-500">o sumala a uno:</span>
                                <select onChange={e => e.target.value && asignarCiclo(e.target.value)} defaultValue="" className="inp flex-1">
                                    <option value="">Elegir ciclo…</option>
                                    {ciclos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* flyer del evento */}
            <div className="mb-5 bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2"><ImageIcon size={15} className="text-gray-400" /><span className="text-xs font-semibold text-gray-300">Flyer del evento</span></div>
                <FlyerUploader value={(evento as any).flyer_url || ''} onChange={cambiarFlyer} />
            </div>

            {/* obras del evento (programa) */}
            <div className="mb-5 bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2"><Theater size={15} className="text-gray-400" /><span className="text-xs font-semibold text-gray-300">Obras en este evento</span></div>
                {obras.length > 0 ? (
                    <div className="space-y-1.5 mb-2">
                        {obras.map(o => (
                            <div key={o.id} className="flex items-center gap-2 bg-[#111] border border-white/10 rounded-lg px-3 py-2">
                                {o.imagenes?.[0] && <img src={o.imagenes[0]} alt="" className="w-8 h-10 object-cover rounded shrink-0" />}
                                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{o.titulo}</p><p className="text-[10px] text-gray-500 truncate">{[o.compania, o.duracion_min && `${o.duracion_min} min`].filter(Boolean).join(' · ')}</p></div>
                                <button onClick={() => quitarObra(o.id)} className="text-gray-600 hover:text-red-400 p-1"><X size={14} /></button>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-[11px] text-gray-500 mb-2">Sin obras vinculadas. Podés armar un programa con varias obras aprobadas.</p>}
                {obrasDisp.length > 0 && (
                    <select onChange={e => { if (e.target.value) { agregarObra(e.target.value); e.target.value = '' } }} defaultValue="" className="inp w-full">
                        <option value="">+ Agregar obra aprobada…</option>
                        {obrasDisp.map(o => <option key={o.id} value={o.id}>{o.titulo}{o.compania ? ` — ${o.compania}` : ''}</option>)}
                    </select>
                )}
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
            <button onClick={copiarLinkCompania} className="w-full flex items-center justify-center gap-2 mb-2 bg-[#0e0e10] border border-white/10 text-gray-300 py-2.5 rounded-xl text-[11px] font-semibold uppercase tracking-wide hover:border-white/30 transition-colors">
                <Copy size={14} /> Copiar link para la compañía (ve sus ventas en vivo)
            </button>

            {/* link de puerta para gente externa */}
            <button onClick={copiarLinkPuerta} className="w-full flex items-center justify-center gap-2 mb-5 bg-[#0e0e10] border border-white/10 text-gray-300 py-2.5 rounded-xl text-[11px] font-semibold uppercase tracking-wide hover:border-white/30 transition-colors">
                <ScanLine size={14} /> Copiar link de puerta (gente externa: leer QR + vender)
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

            {/* resultado de cancelación */}
            {cancelacion && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setCancelacion(null)}>
                    <div className="bg-[#09090b] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <div><p className="font-black uppercase tracking-tight flex items-center gap-2"><AlertTriangle size={18} className="text-red-400" /> Función cancelada</p><p className="text-[11px] text-gray-500 truncate">{cancelacion.nombre}</p></div>
                            <button onClick={() => setCancelacion(null)} className="p-2 bg-white/5 rounded-full text-gray-300"><X size={16} /></button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                <Stat label="Reembolsadas" value={cancelacion.reembolsadasOk} icon={Check} />
                                <Stat label="Monto devuelto" value={pesos(cancelacion.montoTotal)} accent icon={DollarSign} />
                            </div>
                            {cancelacion.fallidas > 0 && <p className="text-[12px] text-red-400 flex items-center gap-1.5"><AlertTriangle size={14} /> {cancelacion.fallidas} venta(s) no se pudieron reembolsar por Mercado Pago — reintentá "Reembolsar" en cada una.</p>}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Avisar a los compradores ({cancelacion.afectados.length})</p>
                                    <button onClick={() => { navigator.clipboard.writeText(cancelacion.afectados.map((a: any) => a.contacto).filter(Boolean).join(', ')); toast.success('Contactos copiados') }} className="text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-white flex items-center gap-1"><Copy size={12} /> Copiar contactos</button>
                                </div>
                                <div className="rounded-lg bg-[#0e0e10] border border-white/10 p-3 mb-2">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Mensaje sugerido</p>
                                    <p className="text-[12px] text-gray-300">Hola! Lamentablemente la función <b>“{cancelacion.nombre}”</b> fue cancelada. Te devolvimos el importe de tu entrada{cancelacion.montoTotal ? '' : ''}. Ante cualquier duda escribinos. ¡Gracias!</p>
                                    <button onClick={() => { navigator.clipboard.writeText(`Hola! Lamentablemente la función “${cancelacion.nombre}” fue cancelada. Te devolvimos el importe de tu entrada. Ante cualquier duda escribinos. ¡Gracias!`); toast.success('Mensaje copiado') }} className="mt-2 text-[10px] font-bold uppercase tracking-wide bg-white/5 text-gray-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Copy size={12} /> Copiar mensaje</button>
                                </div>
                                <div className="space-y-1.5">
                                    {cancelacion.afectados.map((a: any, i: number) => (
                                        <div key={i} className="bg-[#0e0e10] border border-white/10 rounded-lg px-3 py-2 flex justify-between items-center gap-2">
                                            <div className="min-w-0"><p className="text-sm font-medium truncate">{a.nombre}</p><p className="text-[11px] text-gray-500 truncate">{a.contacto || 'sin contacto'} · {a.canal}</p></div>
                                            <div className="text-right shrink-0"><p className="text-sm text-gray-300">{pesos(a.total)}</p><p className={`text-[9px] uppercase font-bold ${String(a.reembolso).startsWith('FALLÓ') ? 'text-red-400' : 'text-emerald-400'}`}>{a.reembolso}</p></div>
                                        </div>
                                    ))}
                                    {cancelacion.afectados.length === 0 && <p className="text-xs text-gray-500">No había ventas confirmadas.</p>}
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
                        {ultimaVenta?.token && (
                            <div className="flex items-center justify-between gap-2 bg-[#D4E655]/10 border border-[#D4E655]/30 rounded-xl px-3 py-2.5">
                                <span className="text-[11px] text-gray-300">Última venta lista, con sus QR.</span>
                                <div className="flex gap-2">
                                    <a href={`/entradas/${ultimaVenta.id}?t=${ultimaVenta.token}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-[#D4E655] text-black px-3 py-1.5 rounded-lg"><Ticket size={12} /> Ver entradas</a>
                                    <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/entradas/${ultimaVenta.id}?t=${ultimaVenta.token}`); toast.success('Link de las entradas copiado') }} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-white/5 text-gray-300 px-3 py-1.5 rounded-lg"><Copy size={12} /> Copiar</button>
                                </div>
                            </div>
                        )}
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
                                        <p className="font-bold text-sm truncate">{v.comprador_nombre || 'Sin nombre'}
                                            {v.reembolsada ? <span className="text-[9px] text-amber-400 uppercase"> · reembolsada</span> : v.estado === 'anulada' && <span className="text-[9px] text-red-400 uppercase"> · anulada</span>}
                                        </p>
                                        <p className="text-[11px] text-gray-500 truncate">{v.items.map(i => `${i.cantidad}× ${i.nombre}`).join(' · ')}</p>
                                        <p className="text-[10px] text-gray-600 capitalize">{v.canal || 'mostrador'} · {v.medio_pago} · {fmtFecha(v.created_at)}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-black text-[#D4E655]">{pesos(v.total)}</p>
                                        {v.estado === 'confirmada' && <div className="flex gap-2 justify-end">
                                            {fechasHermanas.length > 0 && <button onClick={() => setTraspasando(traspasando === v.id ? null : v.id)} className="text-[10px] text-gray-500 hover:text-blue-400 uppercase font-semibold">Traspasar</button>}
                                            <button onClick={() => reembolsar(v)} className="text-[10px] text-gray-500 hover:text-amber-400 uppercase font-semibold">Reembolsar</button>
                                        </div>}
                                    </div>
                                </div>
                                {traspasando === v.id && (
                                    <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
                                        <span className="text-[10px] text-gray-500 uppercase tracking-wide">Mover a:</span>
                                        <select defaultValue="" onChange={e => traspasar(v.id, e.target.value)} className="inp flex-1 text-xs">
                                            <option value="">Elegir fecha…</option>
                                            {fechasHermanas.map(f => <option key={f.id} value={f.id}>{f.fecha ? new Date(f.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Seccion>

            {/* carritos abandonados */}
            {carritos.length > 0 && (
                <Seccion titulo={`Carritos abandonados (${carritos.length})`}>
                    <p className="text-[11px] text-gray-500 -mt-1 mb-3 flex items-center gap-1.5"><ShoppingCart size={13} className="text-[#D4E655]" /> Empezaron la compra online y no pagaron. Escribiles para que la completen.</p>
                    <div className="space-y-2">
                        {carritos.map(c => (
                            <div key={c.id} className="bg-[#0e0e10] border border-white/10 rounded-xl p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm truncate">{c.nombre}</p>
                                        <p className="text-[11px] text-gray-500 truncate">{c.detalle || 'Sin detalle'} · {pesos(c.total)}</p>
                                        <p className="text-[10px] text-gray-600">{c.contacto || 'sin contacto'} · {haceCuanto(c.created_at)}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => copiarMsgCarrito(c)} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-[#D4E655]/15 text-[#D4E655] px-2.5 py-1.5 rounded-lg" title="Copiar mensaje para invitarlo a completar"><MessageCircle size={12} /> Mensaje</button>
                                        {c.contacto && <button onClick={() => { navigator.clipboard.writeText(c.contacto); toast.success('Contacto copiado') }} className="text-gray-400 hover:text-white p-1.5" title="Copiar contacto"><Copy size={13} /></button>}
                                        <button onClick={() => descartarCarrito(c.id)} className="text-gray-600 hover:text-red-400 p-1.5" title="Descartar"><Trash2 size={13} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button onClick={() => { navigator.clipboard.writeText(carritos.map(c => c.contacto).filter(Boolean).join(', ')); toast.success('Contactos copiados') }} className="w-full flex items-center justify-center gap-2 bg-[#111] border border-white/10 text-gray-300 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide hover:border-white/30"><Copy size={12} /> Copiar todos los contactos</button>
                    </div>
                </Seccion>
            )}

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
