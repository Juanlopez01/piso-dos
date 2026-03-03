'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { format, startOfDay, endOfDay, isBefore, startOfToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, Clock, MapPin, Loader2, Music, AlertCircle, MessageCircle, Info, CheckCircle } from 'lucide-react'
import { Toaster, toast } from 'sonner'

type Sala = { id: string; nombre: string; sede_id: string; sede: { nombre: string } }
type Ocupacion = { inicio: Date; fin: Date; motivo: string }

export default function PublicAlquilerPage() {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)

    // Datos
    const [salas, setSalas] = useState<Sala[]>([])
    const [ocupaciones, setOcupaciones] = useState<Ocupacion[]>([])

    // Formulario
    const [selectedSalaId, setSelectedSalaId] = useState('')
    const [selectedDate, setSelectedDate] = useState<string>('')
    const [horaInicio, setHoraInicio] = useState('10:00')
    const [horaFin, setHoraFin] = useState('12:00')

    const numeroWhatsApp = '5491100000000' // <--- CAMBIÁ ESTO POR EL NÚMERO DEL ESTUDIO

    useEffect(() => {
        fetchSalas()
    }, [])

    useEffect(() => {
        if (selectedSalaId && selectedDate) {
            fetchOcupaciones(selectedSalaId, selectedDate)
        } else {
            setOcupaciones([])
        }
    }, [selectedSalaId, selectedDate])

    const fetchSalas = async () => {
        setLoading(true)
        const { data } = await supabase.from('salas').select('id, nombre, sede_id, sede:sedes(nombre)').order('nombre')
        if (data) setSalas(data as any)
        setLoading(false)
    }

    const fetchOcupaciones = async (salaId: string, fechaStr: string) => {
        // Desarmamos la fecha para forzar la zona horaria local (Argentina)
        const [year, month, day] = fechaStr.split('-').map(Number)
        const startOfDayObj = new Date(year, month - 1, day, 0, 0, 0)
        const endOfDayObj = new Date(year, month - 1, day, 23, 59, 59)

        // Traer clases (que usan timestamp)
        const { data: clases } = await supabase
            .from('clases')
            .select('inicio, fin, nombre')
            .eq('sala_id', salaId)
            .neq('estado', 'cancelada')
            .gte('inicio', startOfDayObj.toISOString())
            .lte('fin', endOfDayObj.toISOString())

        // Traer alquileres (que usan fecha YYYY-MM-DD y horas separadas)
        const { data: alquileres } = await supabase
            .from('alquileres')
            .select('fecha, hora_inicio, hora_fin')
            .eq('sala_id', salaId)
            .eq('fecha', fechaStr)
            .in('estado', ['confirmado', 'pagado', 'pendiente']) // Pendiente bloquea para que no pidan 2 veces lo mismo

        const ocupacionesDia: Ocupacion[] = []

        if (clases) {
            clases.forEach(c => ocupacionesDia.push({
                inicio: new Date(c.inicio),
                fin: new Date(c.fin),
                motivo: 'Clase'
            }))
        }

        if (alquileres) {
            alquileres.forEach(a => {
                // Reconstruimos la fecha/hora de inicio y fin localmente
                const [hIni, mIni] = a.hora_inicio.split(':').map(Number)
                const [hFin, mFin] = a.hora_fin.split(':').map(Number)

                ocupacionesDia.push({
                    inicio: new Date(year, month - 1, day, hIni, mIni),
                    fin: new Date(year, month - 1, day, hFin, mFin),
                    motivo: 'Ocupado'
                })
            })
        }

        // Ordenar cronológicamente
        ocupacionesDia.sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
        setOcupaciones(ocupacionesDia)
    }

    const checkDisponibilidad = () => {
        if (!selectedDate || !horaInicio || !horaFin) return true

        const dateObj = new Date(selectedDate + 'T00:00:00')
        const [hStart, mStart] = horaInicio.split(':').map(Number)
        const [hEnd, mEnd] = horaFin.split(':').map(Number)

        const reqStart = new Date(dateObj)
        reqStart.setHours(hStart, mStart, 0, 0)

        const reqEnd = new Date(dateObj)
        reqEnd.setHours(hEnd, mEnd, 0, 0)

        if (reqEnd <= reqStart) {
            toast.error("La hora de fin debe ser mayor a la de inicio")
            return false
        }

        // Verificar si es en el pasado
        if (reqStart < new Date()) {
            toast.error("No podés reservar en un horario pasado")
            return false
        }

        // Verificar superposición
        const isConflict = ocupaciones.some(oc => {
            return (reqStart < oc.fin && reqEnd > oc.inicio)
        })

        if (isConflict) {
            toast.error("¡El horario seleccionado se pisa con otra actividad!")
            return false
        }

        return true
    }

    const handleSolicitar = () => {
        if (!selectedSalaId || !selectedDate) {
            return toast.error("Completá todos los campos")
        }

        if (!checkDisponibilidad()) return

        const sala = salas.find(s => s.id === selectedSalaId)
        const dateObj = new Date(selectedDate + 'T00:00:00')
        const fechaFormateada = format(dateObj, "EEEE d 'de' MMMM", { locale: es })

        const mensaje = `¡Hola! 👋 Quería consultar el presupuesto para alquilar una sala.\n\n` +
            `🏢 *Sala:* ${sala?.nombre} (${sala?.sede?.nombre})\n` +
            `📅 *Fecha:* ${fechaFormateada}\n` +
            `⏰ *Horario:* ${horaInicio} a ${horaFin} hs\n\n` +
            `¿Me confirman disponibilidad y tarifas? ¡Gracias!`

        const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`
        window.open(url, '_blank')
    }


    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>

    // Agrupar salas por sede para el select
    const sedesUnicas = Array.from(new Set(salas.map(s => s.sede.nombre)))

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="max-w-3xl mx-auto">
                {/* HEADER */}
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-[#D4E655]/10 rounded-full flex items-center justify-center mx-auto mb-4 text-[#D4E655]">
                        <Music size={32} />
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">
                        Alquilar Sala
                    </h1>
                    <p className="text-gray-400 text-sm font-medium">
                        Consultá disponibilidad y pedí tu presupuesto por WhatsApp.
                    </p>
                </div>

                <div className="bg-[#09090b] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl space-y-8">

                    {/* PASO 1: SALA Y FECHA */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-[#D4E655] uppercase tracking-widest flex items-center gap-2"><MapPin size={14} /> 1. Elegí la Sala</label>
                            <select
                                value={selectedSalaId}
                                onChange={e => setSelectedSalaId(e.target.value)}
                                className="w-full bg-[#111] border border-white/20 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors"
                            >
                                <option value="">Seleccionar sala...</option>
                                {sedesUnicas.map(sedeNombre => (
                                    <optgroup key={sedeNombre} label={`Sede ${sedeNombre}`} className="bg-black text-gray-400">
                                        {salas.filter(s => s.sede.nombre === sedeNombre).map(sala => (
                                            <option key={sala.id} value={sala.id} className="text-white">{sala.nombre}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-[#D4E655] uppercase tracking-widest flex items-center gap-2"><Calendar size={14} /> 2. ¿Qué día?</label>
                            <input
                                type="date"
                                min={format(new Date(), 'yyyy-MM-dd')}
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                className="w-full bg-[#111] border border-white/20 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors [color-scheme:dark]"
                            />
                        </div>
                    </div>

                    {/* VISTA DE DISPONIBILIDAD (Aparece al elegir sala y día) */}
                    {selectedSalaId && selectedDate && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 border-t border-white/10 pt-8">
                            <div className="mb-6">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Disponibilidad del Día</h3>

                                {ocupaciones.length > 0 ? (
                                    <div className="space-y-2 bg-[#111] p-4 rounded-xl border border-white/5">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold mb-3 flex items-center gap-1"><AlertCircle size={12} /> Horarios ya ocupados:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {ocupaciones.map((oc, idx) => (
                                                <div key={idx} className="bg-white/5 border border-white/10 px-3 py-2 rounded-lg flex items-center gap-2">
                                                    <span className="text-xs font-mono text-gray-300">
                                                        {format(oc.inicio, 'HH:mm')} a {format(oc.fin, 'HH:mm')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl text-green-400 text-xs font-bold uppercase flex items-center gap-2">
                                        <CheckCircle size={16} /> La sala está completamente libre este día.
                                    </div>
                                )}
                            </div>

                            {/* PASO 3: ELEGIR HORARIO */}
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-[#D4E655] uppercase tracking-widest flex items-center gap-2"><Clock size={14} /> 3. Horario Deseado</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Desde</label>
                                        <input
                                            type="time"
                                            value={horaInicio}
                                            onChange={e => setHoraInicio(e.target.value)}
                                            className="w-full bg-[#111] border border-white/20 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Hasta</label>
                                        <input
                                            type="time"
                                            value={horaFin}
                                            onChange={e => setHoraFin(e.target.value)}
                                            className="w-full bg-[#111] border border-white/20 rounded-xl p-4 text-white font-bold outline-none focus:border-[#D4E655] transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* BOTÓN WHATSAPP */}
                            <div className="pt-8">
                                <button
                                    onClick={handleSolicitar}
                                    className="w-full bg-[#25D366] hover:bg-[#1DA851] text-black font-black uppercase tracking-widest py-5 rounded-xl shadow-[0_0_20px_rgba(37,211,102,0.3)] transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
                                >
                                    <MessageCircle size={20} />
                                    Pedir Presupuesto
                                </button>
                                <p className="text-center text-[10px] text-gray-500 mt-3 font-medium">
                                    Serás redirigido a WhatsApp para confirmar la disponibilidad y tarifario con recepción.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}