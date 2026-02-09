'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    Calendar, Clock, DollarSign, FileText,
    MessageCircle, CheckCircle, XCircle, Plus,
    Calculator, MapPin, Loader2, RefreshCw, Settings, Save,
    Sun, Moon, Users, Eye, Edit3
} from 'lucide-react'
import {
    format, getDay, getDaysInMonth, addHours, addMonths,
    startOfMonth, endOfMonth
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'

// Definición de corte horario (Interno)
const HORARIO_NOCTURNO = { start: 18, end: 22 }

export default function AlquileresPage() {
    const supabase = createClient()

    // Data
    const [alquileres, setAlquileres] = useState<any[]>([])
    const [salas, setSalas] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Modales
    const [isModalOpen, setIsModalOpen] = useState(false) // Crear
    const [isConfigOpen, setIsConfigOpen] = useState(false) // Tarifas
    const [isRenovacionOpen, setIsRenovacionOpen] = useState(false) // Renovar
    const [isDetailOpen, setIsDetailOpen] = useState(false) // Ver Detalle

    const [selectedAlquiler, setSelectedAlquiler] = useState<any>(null) // Para ver detalle

    const [formStep, setFormStep] = useState(1)
    const [mesRenovacion, setMesRenovacion] = useState(addMonths(new Date(), 1))
    const [renovaciones, setRenovaciones] = useState<any[]>([])

    // Formulario Creación
    const [formData, setFormData] = useState({
        cliente_nombre: '', cliente_telefono: '', cliente_email: '',
        sala_id: '', fecha: '', hora_inicio: '10:00', duracion: 2,
        tipo_uso: 'Ensayo', cantidad_personas: 1, es_fijo: false,
        mes_fijo: new Date().toISOString().slice(0, 7)
    })

    // Estado Edición Precios
    const [preciosEdit, setPreciosEdit] = useState<any[]>([])

    const [presupuesto, setPresupuesto] = useState({
        precio_hora: 0, cantidad_horas: 0, cantidad_dias: 1, total: 0, detalle: '', dias_calculados: [] as string[]
    })

    useEffect(() => { fetchData() }, [])

    useEffect(() => {
        if (isModalOpen && formData.sala_id && formData.fecha) {
            calcularPresupuesto()
        }
    }, [formData, salas])

    const fetchData = async () => {
        setLoading(true)
        const { data: listAlquileres } = await supabase.from('alquileres').select(`*, sala:salas(nombre, sede:sedes(nombre))`).order('fecha_inicio', { ascending: false })
        const { data: listSalas } = await supabase.from('salas').select('*').order('nombre')

        if (listAlquileres) setAlquileres(listAlquileres)
        if (listSalas) {
            setSalas(listSalas)
            setPreciosEdit(listSalas)
        }
        setLoading(false)
    }

    // --- LÓGICA DE PRECIOS POR FRANJA ---
    const getTarifaUnit = (salaId: string, fecha: Date, horaStr: string) => {
        const sala = salas.find(s => s.id === salaId)
        if (!sala) return 0

        const esFinde = getDay(fecha) === 0 || getDay(fecha) === 6
        const [hora] = horaStr.split(':').map(Number)

        const esNocturno = hora >= HORARIO_NOCTURNO.start && hora < HORARIO_NOCTURNO.end

        if (esFinde) return sala.precio_finde || 0
        if (esNocturno) return sala.precio_pico || 0
        return sala.precio_valle || 0
    }

    const calcularDiasDelMes = (anio: number, mes: number, diaSemana: number) => {
        const diasEnMes = getDaysInMonth(new Date(anio, mes - 1))
        const fechas = []
        for (let d = 1; d <= diasEnMes; d++) {
            const fechaIter = new Date(anio, mes - 1, d)
            if (getDay(fechaIter) === diaSemana) fechas.push(fechaIter)
        }
        return fechas
    }

    const calcularPresupuesto = () => {
        if (!formData.sala_id || !formData.fecha) return
        const fechaObj = new Date(formData.fecha + 'T00:00:00')
        const precioBase = getTarifaUnit(formData.sala_id, fechaObj, formData.hora_inicio)
        const precioFinalUnit = formData.tipo_uso === 'Producción' ? precioBase * 1.5 : precioBase

        let cantDias = 1
        let listaFechas: Date[] = [fechaObj]

        if (formData.es_fijo) {
            const [anio, mes] = formData.mes_fijo.split('-').map(Number)
            listaFechas = calcularDiasDelMes(anio, mes, getDay(fechaObj))
            cantDias = listaFechas.length
        }

        const total = precioFinalUnit * formData.duracion * cantDias
        const diasStr = listaFechas.map(d => format(d, 'dd/MM')).join(', ')

        setPresupuesto({
            precio_hora: precioFinalUnit,
            cantidad_horas: formData.duracion,
            cantidad_dias: cantDias,
            total: total,
            detalle: formData.es_fijo ? `Mensual (${cantDias} días): ${diasStr}` : `Fecha única: ${diasStr}`,
            dias_calculados: listaFechas.map(d => format(d, 'dd/MM'))
        })
    }

    const handleUpdatePrecios = async () => {
        try {
            const updates = preciosEdit.map(sala =>
                supabase.from('salas').update({
                    precio_valle: sala.precio_valle,
                    precio_pico: sala.precio_pico,
                    precio_finde: sala.precio_finde
                }).eq('id', sala.id)
            )
            await Promise.all(updates)
            toast.success('Tarifario actualizado correctamente')
            setIsConfigOpen(false)
            fetchData()
        } catch (error) { toast.error('Error al guardar') }
    }

    // --- ACTIONS ---
    const openDetail = (alquiler: any) => {
        setSelectedAlquiler(alquiler)
        setIsDetailOpen(true)
    }

    const prepararRenovacion = () => {
        const fijos = alquileres.filter(a => a.es_fijo && a.estado !== 'cancelada')
        const proyeccion = fijos.map(alq => {
            const fechaOriginal = new Date(alq.fecha_inicio)
            const diaSemana = getDay(fechaOriginal)
            const horaStr = format(fechaOriginal, 'HH:mm')
            const nuevasFechas = calcularDiasDelMes(mesRenovacion.getFullYear(), mesRenovacion.getMonth() + 1, diaSemana)
            const precioUnit = getTarifaUnit(alq.sala_id, nuevasFechas[0], horaStr)
            const precioFinalUnit = alq.tipo_uso === 'Producción' ? precioUnit * 1.5 : precioUnit
            const nuevoTotal = precioFinalUnit * alq.duracion_horas * nuevasFechas.length
            return { ...alq, id_origen: alq.id, nueva_fecha_inicio: nuevasFechas[0], nuevas_fechas_txt: nuevasFechas.map(d => format(d, 'dd/MM')).join(', '), dias_count: nuevasFechas.length, nuevo_total: nuevoTotal }
        })
        setRenovaciones(proyeccion)
        setIsRenovacionOpen(true)
    }

    const confirmarRenovacion = async (item: any) => {
        const fechaStart = new Date(item.nueva_fecha_inicio)
        const [h, m] = format(new Date(item.fecha_inicio), 'HH:mm').split(':')
        fechaStart.setHours(Number(h), Number(m))
        const fechaEnd = addHours(fechaStart, item.duracion_horas)
        const payload = { cliente_nombre: item.cliente_nombre, cliente_telefono: item.cliente_telefono, cliente_email: item.cliente_email, sala_id: item.sala_id, fecha_inicio: fechaStart.toISOString(), fecha_fin: fechaEnd.toISOString(), duracion_horas: item.duracion_horas, tipo_uso: item.tipo_uso, es_fijo: true, monto_total: item.nuevo_total, estado: 'presupuesto', notas: `Renovación Automática. Días: ${item.nuevas_fechas_txt}`, cantidad_personas: item.cantidad_personas }
        const { error } = await supabase.from('alquileres').insert(payload)
        if (!error) { toast.success(`Renovado: ${item.cliente_nombre}`); setRenovaciones(prev => prev.filter(r => r.id_origen !== item.id_origen)); fetchData() }
    }

    const copiarPresupuesto = (data: any = null, isRenovacion: boolean = false) => {
        const target = data || { ...formData, ...presupuesto, sala_nombre: salas.find(s => s.id === formData.sala_id)?.nombre }
        const nombreSala = isRenovacion ? target.sala.nombre : target.sala_nombre
        const diasTxt = isRenovacion ? target.nuevas_fechas_txt : target.detalle
        const total = isRenovacion ? target.nuevo_total : target.total
        const mesTxt = isRenovacion ? format(mesRenovacion, 'MMMM', { locale: es }) : format(new Date(target.fecha), 'MMMM', { locale: es })

        // Agregamos cantidad de personas al mensaje
        const pax = isRenovacion ? target.cantidad_personas : (target.cantidad_personas || formData.cantidad_personas)

        const texto = `Hola ${target.cliente_nombre}! 👋\n\nTe paso el detalle de alquiler para *${mesTxt.toUpperCase()}*:\n\n📍 *Espacio:* ${nombreSala}\n👥 *Personas:* ${pax}\n📅 *Días:* ${diasTxt}\n⏰ *Horario:* ${format(new Date(isRenovacion ? target.nueva_fecha_inicio : target.fecha), 'HH:mm')} (${target.duracion || target.duracion_horas}hs)\n\n💰 *Valor Actualizado:* $${total.toLocaleString()}\n\n_Avisame para dejar confirmado el mes!_`
        navigator.clipboard.writeText(texto)
        toast.success('Mensaje copiado')
    }

    const handleSaveNew = async () => {
        const fechaStart = new Date(`${formData.fecha}T${formData.hora_inicio}:00`)
        const fechaEnd = addHours(fechaStart, formData.duracion)
        const { error } = await supabase.from('alquileres').insert({
            cliente_nombre: formData.cliente_nombre, cliente_telefono: formData.cliente_telefono, cliente_email: formData.cliente_email,
            sala_id: formData.sala_id, fecha_inicio: fechaStart.toISOString(), fecha_fin: fechaEnd.toISOString(),
            duracion_horas: formData.duracion, tipo_uso: formData.tipo_uso, es_fijo: formData.es_fijo,
            monto_total: presupuesto.total, estado: 'presupuesto', notas: presupuesto.detalle,
            cantidad_personas: formData.cantidad_personas // Guardamos personas
        })
        if (!error) { toast.success('Guardado'); setIsModalOpen(false); fetchData() }
    }

    const changeStatus = async (id: string, status: string) => {
        await supabase.from('alquileres').update({ estado: status }).eq('id', id)
        fetchData()
        toast.success('Estado actualizado')
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>

    return (
        <div className="pb-24 px-4 pt-4 md:p-8 min-h-screen bg-[#050505] text-white">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-8 border-b border-white/10 pb-6">
                <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-white">Alquileres</h2>
                    <p className="text-[#D4E655] font-bold text-xs tracking-widest uppercase">Gestión de Espacios</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setIsConfigOpen(true)} className="bg-white/5 border border-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-xl font-bold uppercase text-[10px] flex items-center gap-2">
                        <Settings size={16} /> <span className="hidden md:inline">Tarifas</span>
                    </button>
                    <button onClick={prepararRenovacion} className="bg-white/10 border border-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-xl font-bold uppercase text-[10px] flex items-center gap-2">
                        <RefreshCw size={16} /> <span className="hidden md:inline">Renovar Mes</span>
                    </button>
                    <button onClick={() => { setFormStep(1); setIsModalOpen(true) }} className="bg-[#D4E655] text-black px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(212,230,85,0.3)]">
                        <Plus size={16} /> Nuevo
                    </button>
                </div>
            </div>

            {/* LISTADO */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 mb-2"><FileText size={16} /> Presupuestos</h3>
                    {alquileres.filter(a => a.estado === 'presupuesto').map(alq => (
                        <div key={alq.id} className="bg-[#09090b] border border-white/10 p-4 rounded-xl relative group hover:border-[#D4E655]/30 transition-all overflow-hidden">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-white text-lg truncate">{alq.cliente_nombre}</h4>
                                <div className="flex gap-2">
                                    <button onClick={() => openDetail(alq)} className="p-1 hover:text-[#D4E655] transition-colors"><Eye size={16} /></button>
                                    <span className="bg-yellow-500/10 text-yellow-500 text-[9px] px-2 py-1 rounded font-black uppercase whitespace-nowrap">Pendiente</span>
                                </div>
                            </div>
                            <div className="text-xs text-gray-400 mb-3 space-y-1">
                                <p className="flex items-center gap-2 truncate"><MapPin size={12} className="text-[#D4E655] shrink-0" /> {alq.sala?.nombre}</p>
                                <p className="flex items-center gap-2 truncate"><Calendar size={12} className="text-[#D4E655] shrink-0" /> {format(new Date(alq.fecha_inicio), 'dd/MM HH:mm')} ({alq.duracion_horas}hs)</p>
                                <p className="flex items-center gap-2"><DollarSign size={12} className="text-[#D4E655] shrink-0" /> Total: <span className="text-white font-bold">${alq.monto_total?.toLocaleString()}</span></p>
                            </div>
                            <div className="flex gap-2 border-t border-white/5 pt-3">
                                <button onClick={() => changeStatus(alq.id, 'confirmado')} className="flex-1 bg-white/5 hover:bg-[#D4E655] hover:text-black text-white text-[10px] font-bold uppercase py-2 rounded transition-colors flex items-center justify-center gap-1"><CheckCircle size={12} /> OK</button>
                                <button onClick={() => copiarPresupuesto(alq, false)} className="flex-1 bg-green-900/20 hover:bg-green-500 hover:text-black text-green-500 text-[10px] font-bold uppercase py-2 rounded transition-colors flex items-center justify-center gap-1"><MessageCircle size={12} /> Wtsp</button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-[#D4E655] flex items-center gap-2 mb-2"><CheckCircle size={16} /> Confirmados</h3>
                    {alquileres.filter(a => a.estado === 'confirmado' || a.estado === 'pagado').map(alq => (
                        <div key={alq.id} className="bg-[#111] border-l-4 border-[#D4E655] p-4 rounded-r-xl relative overflow-hidden">
                            <div className="flex justify-between items-center">
                                <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-white uppercase text-sm truncate">{alq.cliente_nombre}</h4>
                                        <button onClick={() => openDetail(alq)} className="p-1 text-gray-500 hover:text-[#D4E655]"><Eye size={12} /></button>
                                    </div>
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mt-1 truncate">{alq.sala?.nombre} • {format(new Date(alq.fecha_inicio), 'dd/MM - HH:mm')}</p>
                                </div>
                                <div className="text-right shrink-0"><div className="text-lg font-black text-[#D4E655]">${alq.monto_total?.toLocaleString()}</div><button onClick={() => changeStatus(alq.id, 'pagado')} className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase mt-1 ${alq.estado === 'pagado' ? 'bg-green-500 text-black' : 'bg-red-500/20 text-red-500 animate-pulse cursor-pointer'}`}>{alq.estado === 'pagado' ? 'Pagado' : 'Impago'}</button></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- MODAL DETALLE (VER FICHA TÉCNICA) --- */}
            {isDetailOpen && selectedAlquiler && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase leading-none mb-1">{selectedAlquiler.cliente_nombre}</h3>
                                <p className="text-xs text-gray-500 uppercase tracking-widest">{selectedAlquiler.tipo_uso} • {selectedAlquiler.es_fijo ? 'Mensual' : 'Eventual'}</p>
                            </div>
                            <button onClick={() => setIsDetailOpen(false)}><XCircle className="text-gray-500 hover:text-white" /></button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#111] p-3 rounded-xl border border-white/5">
                                    <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Fecha & Hora</span>
                                    <div className="text-sm font-bold text-white">{format(new Date(selectedAlquiler.fecha_inicio), 'dd/MM HH:mm')}</div>
                                    <div className="text-[10px] text-[#D4E655]">{selectedAlquiler.duracion_horas} horas</div>
                                </div>
                                <div className="bg-[#111] p-3 rounded-xl border border-white/5">
                                    <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Sala</span>
                                    <div className="text-sm font-bold text-white">{selectedAlquiler.sala?.nombre}</div>
                                    <div className="text-[10px] text-gray-400">{selectedAlquiler.sala?.sede?.nombre}</div>
                                </div>
                            </div>

                            <div className="bg-[#111] p-3 rounded-xl border border-white/5 flex justify-between items-center">
                                <div>
                                    <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Personas</span>
                                    <div className="text-sm font-bold text-white flex items-center gap-2">
                                        <Users size={14} className="text-[#D4E655]" /> {selectedAlquiler.cantidad_personas} Persona/s
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Contacto</span>
                                    <div className="text-xs text-white">{selectedAlquiler.cliente_telefono}</div>
                                </div>
                            </div>

                            {selectedAlquiler.notas && (
                                <div className="bg-[#111] p-3 rounded-xl border border-white/5">
                                    <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Notas / Días</span>
                                    <p className="text-xs text-gray-300 italic">{selectedAlquiler.notas}</p>
                                </div>
                            )}

                            <div className="border-t border-white/10 pt-4 mt-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-xs font-bold text-gray-500 uppercase">Monto Total</span>
                                    <span className="text-3xl font-black text-[#D4E655] tracking-tight">${selectedAlquiler.monto_total?.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL CONFIGURAR TARIFAS (VERSIÓN TABLA ALINEADA) --- */}
            {isConfigOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-white/10 flex justify-between items-center shrink-0 bg-[#09090b] z-10">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><Settings className="text-[#D4E655]" /> Tarifas Base</h3>
                                <p className="text-xs text-gray-500 mt-1">Configuración de valor hora por sala y franja.</p>
                            </div>
                            <button onClick={() => setIsConfigOpen(false)}><XCircle className="text-gray-500 hover:text-white" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-0">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#111] sticky top-0 z-20 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                                    <tr>
                                        <th className="p-4 border-b border-white/10">Sala</th>
                                        <th className="p-4 border-b border-white/10 text-center text-yellow-500">
                                            <div className="flex items-center justify-center gap-1"><Sun size={14} /> <span>9 a 17hs</span></div>
                                        </th>
                                        <th className="p-4 border-b border-white/10 text-center text-[#D4E655]">
                                            <div className="flex items-center justify-center gap-1"><Clock size={14} /> <span>18 a 22hs</span></div>
                                        </th>
                                        <th className="p-4 border-b border-white/10 text-center text-purple-500">
                                            <div className="flex items-center justify-center gap-1"><Calendar size={14} /> <span>Finde</span></div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {preciosEdit.map((sala, idx) => (
                                        <tr key={sala.id} className="hover:bg-white/5 transition-colors">
                                            <td className="p-4">
                                                <div className="font-bold text-white text-sm">{sala.nombre}</div>
                                                <div className="text-[9px] text-gray-500 uppercase">{sala.sede?.nombre}</div>
                                            </td>
                                            <td className="p-3">
                                                <div className="relative max-w-[100px] mx-auto">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">$</span>
                                                    <input type="number" value={sala.precio_valle} onChange={e => { const newArr = [...preciosEdit]; newArr[idx].precio_valle = Number(e.target.value); setPreciosEdit(newArr); }} className="w-full bg-black border border-white/10 rounded-lg pl-6 pr-2 py-2 text-white text-sm font-bold text-center outline-none focus:border-yellow-500" />
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <div className="relative max-w-[100px] mx-auto">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">$</span>
                                                    <input type="number" value={sala.precio_pico} onChange={e => { const newArr = [...preciosEdit]; newArr[idx].precio_pico = Number(e.target.value); setPreciosEdit(newArr); }} className="w-full bg-black border border-white/10 rounded-lg pl-6 pr-2 py-2 text-white text-sm font-bold text-center outline-none focus:border-[#D4E655]" />
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <div className="relative max-w-[100px] mx-auto">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">$</span>
                                                    <input type="number" value={sala.precio_finde} onChange={e => { const newArr = [...preciosEdit]; newArr[idx].precio_finde = Number(e.target.value); setPreciosEdit(newArr); }} className="w-full bg-black border border-white/10 rounded-lg pl-6 pr-2 py-2 text-white text-sm font-bold text-center outline-none focus:border-purple-500" />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 border-t border-white/10 bg-[#111] flex justify-end shrink-0 z-10">
                            <button onClick={handleUpdatePrecios} className="bg-[#D4E655] text-black px-8 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-all flex items-center gap-2 shadow-lg">
                                <Save size={16} /> Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL RENOVACIÓN (FIXED) --- */}
            {isRenovacionOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-4 md:p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase flex items-center gap-2"><RefreshCw className="text-[#D4E655]" /> Renovar Alquileres</h3>
                                <p className="text-xs text-gray-500 mt-1">Proyección: <span className="text-white font-bold uppercase">{format(mesRenovacion, 'MMMM yyyy', { locale: es })}</span></p>
                            </div>
                            <button onClick={() => setIsRenovacionOpen(false)}><XCircle className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                            {renovaciones.length === 0 ? <p className="text-center text-gray-500 py-10">No hay alquileres fijos activos.</p> : (
                                renovaciones.map((item, idx) => (
                                    <div key={idx} className="bg-[#111] border border-white/10 p-4 rounded-xl flex flex-col md:flex-row items-center gap-6">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1"><h4 className="font-bold text-white text-lg truncate">{item.cliente_nombre}</h4><span className="text-[10px] bg-white/10 px-2 rounded uppercase text-gray-400 shrink-0">{item.sala?.nombre}</span></div>
                                            <div className="text-xs text-gray-400 flex flex-col gap-1"><span className="flex items-center gap-1 truncate"><Calendar size={12} /> Días: {item.nuevas_fechas_txt}</span><span className="flex items-center gap-1 text-[#D4E655] font-bold"><Clock size={12} /> {item.dias_count} Clases en el mes</span></div>
                                        </div>
                                        <div className="text-right shrink-0"><p className="text-[10px] text-gray-500 uppercase">Nuevo Total</p><p className="text-2xl font-black text-white">${item.nuevo_total.toLocaleString()}</p></div>
                                        <div className="flex flex-col gap-2 w-full md:w-auto"><button onClick={() => copiarPresupuesto(item, true)} className="px-4 py-2 bg-green-900/20 text-green-500 rounded-lg text-[10px] font-bold uppercase hover:bg-green-500 hover:text-black flex items-center justify-center gap-2"><MessageCircle size={14} /> Avisar</button><button onClick={() => confirmarRenovacion(item)} className="px-4 py-2 bg-[#D4E655] text-black rounded-lg text-[10px] font-bold uppercase hover:bg-white flex items-center justify-center gap-2"><CheckCircle size={14} /> Renovar</button></div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL NUEVO (Cotizador) --- */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-lg max-h-[90vh] rounded-2xl p-6 shadow-2xl relative overflow-y-auto">
                        <h3 className="text-xl font-black text-white uppercase mb-6 flex items-center gap-2"><Calculator className="text-[#D4E655]" /> Cotizador</h3>
                        {formStep === 1 ? (
                            <div className="space-y-4">
                                <input placeholder="Nombre" value={formData.cliente_nombre} onChange={e => setFormData({ ...formData, cliente_nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" autoFocus />
                                <div className="grid grid-cols-2 gap-4"><input placeholder="Teléfono" value={formData.cliente_telefono} onChange={e => setFormData({ ...formData, cliente_telefono: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" /><input placeholder="Email" value={formData.cliente_email} onChange={e => setFormData({ ...formData, cliente_email: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" /></div>
                                <button onClick={() => setFormStep(2)} disabled={!formData.cliente_nombre} className="w-full bg-[#D4E655] text-black font-black uppercase py-3 rounded-xl mt-4 text-xs tracking-widest disabled:opacity-50">Siguiente</button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Sala</label><select value={formData.sala_id} onChange={e => setFormData({ ...formData, sala_id: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]"><option value="">Seleccionar...</option>{salas.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.sede?.nombre})</option>)}</select></div>
                                <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Fecha</label><input type="date" value={formData.fecha} onChange={e => setFormData({ ...formData, fecha: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" /></div><div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Tipo</label><select value={formData.tipo_uso} onChange={e => setFormData({ ...formData, tipo_uso: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]"><option value="Ensayo">Ensayo</option><option value="Clase">Clase</option><option value="Producción">Producción</option><option value="Evento">Evento</option></select></div></div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Hora</label><input type="time" value={formData.hora_inicio} onChange={e => setFormData({ ...formData, hora_inicio: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" /></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Duración</label><input type="number" min="1" value={formData.duracion} onChange={e => setFormData({ ...formData, duracion: Number(e.target.value) })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" /></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Personas</label><input type="number" min="1" value={formData.cantidad_personas} onChange={e => setFormData({ ...formData, cantidad_personas: Number(e.target.value) })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" /></div>
                                </div>
                                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-lg cursor-pointer border border-white/5 hover:border-[#D4E655]" onClick={() => setFormData({ ...formData, es_fijo: !formData.es_fijo })}><div className={`w-8 h-4 rounded-full relative transition-colors ${formData.es_fijo ? 'bg-[#D4E655]' : 'bg-gray-600'}`}><div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${formData.es_fijo ? 'left-4.5' : 'left-0.5'}`}></div></div><span className="text-xs font-bold uppercase text-white">Alquiler Fijo Mensual</span></div>
                                <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 p-4 rounded-xl mt-4"><div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold uppercase text-[#D4E655]">Presupuesto</span><span className="text-2xl font-black text-white">${presupuesto.total.toLocaleString()}</span></div><p className="text-[10px] text-gray-400">{presupuesto.detalle}</p></div>
                                <div className="flex gap-2 mt-4"><button onClick={() => setFormStep(1)} className="flex-1 bg-white/5 text-white font-bold uppercase py-3 rounded-xl hover:bg-white/10 text-xs tracking-widest">Atrás</button><button onClick={() => copiarPresupuesto(null, false)} className="flex-1 bg-green-600 text-white font-bold uppercase py-3 rounded-xl hover:bg-green-500 text-xs tracking-widest flex items-center justify-center gap-2"><MessageCircle size={14} /> Wtsp</button><button onClick={handleSaveNew} className="flex-1 bg-[#D4E655] text-black font-black uppercase py-3 rounded-xl hover:bg-white text-xs tracking-widest">Guardar</button></div>
                            </div>
                        )}
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white"><XCircle size={20} /></button>
                    </div>
                </div>
            )}
        </div>
    )
}