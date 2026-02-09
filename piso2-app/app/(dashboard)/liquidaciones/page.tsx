'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    DollarSign, Calendar, User, Download, CheckCircle, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast, Toaster } from 'sonner'

type ResumenDocente = {
    profesor_id: string
    nombre: string
    clases_dictadas: number
    alumnos_total: number
    total_a_liquidar: number
}

export default function LiquidacionesPage() {
    const supabase = createClient()
    const [resumenes, setResumenes] = useState<ResumenDocente[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedMonth, setSelectedMonth] = useState(new Date())

    // PRECIOS BASE EFECTIVO
    const PRECIOS_BASE = { Regular: 14000, Especial: 16000 }

    useEffect(() => { fetchLiquidaciones() }, [selectedMonth])

    const fetchLiquidaciones = async () => {
        setLoading(true)
        const start = startOfMonth(selectedMonth).toISOString()
        const end = endOfMonth(selectedMonth).toISOString()

        const { data: clases } = await supabase
            .from('clases')
            .select(`id, tipo_acuerdo, valor_acuerdo, tipo_clase, profesor_id, profesor:profiles(id, nombre_completo), inscripciones(count)`)
            .gte('inicio', start)
            .lte('inicio', end)
            .eq('estado', 'activa')

        if (!clases) { setLoading(false); return }

        const mapDocentes = new Map<string, ResumenDocente>()

        clases.forEach((clase: any) => {
            const profeId = clase.profesor_id
            if (!profeId) return

            const alumnosCount = clase.inscripciones[0]?.count || 0
            let gananciaClase = 0

            if (clase.tipo_acuerdo === 'fijo') {
                gananciaClase = clase.valor_acuerdo
            } else {
                const precioBase = clase.tipo_clase === 'Especial' ? PRECIOS_BASE.Especial : PRECIOS_BASE.Regular
                const totalBaseEfvo = alumnosCount * precioBase
                gananciaClase = (totalBaseEfvo * clase.valor_acuerdo) / 100
            }

            const actual = mapDocentes.get(profeId) || {
                profesor_id: profeId, nombre: clase.profesor?.nombre_completo || 'Sin Nombre',
                clases_dictadas: 0, alumnos_total: 0, total_a_liquidar: 0
            }
            actual.clases_dictadas += 1
            actual.alumnos_total += alumnosCount
            actual.total_a_liquidar += gananciaClase
            mapDocentes.set(profeId, actual)
        })

        setResumenes(Array.from(mapDocentes.values()))
        setLoading(false)
    }

    const publicarLiquidacion = async (docente: ResumenDocente) => {
        if (!confirm(`¿Publicar liquidación de $${docente.total_a_liquidar.toLocaleString()} para ${docente.nombre}?`)) return

        const { error } = await supabase.from('liquidaciones').insert({
            profesor_id: docente.profesor_id,
            mes: startOfMonth(selectedMonth), // Guardamos el primer día del mes
            monto: docente.total_a_liquidar,
            estado: 'pendiente',
            detalle: `Liquidación automática: ${docente.clases_dictadas} clases, ${docente.alumnos_total} alumnos.`
        })

        if (error) toast.error('Error al publicar')
        else toast.success('Liquidación publicada correctamente')
    }

    return (
        <div className="pb-24 px-4 pt-4 md:p-8 min-h-screen bg-[#050505] text-white">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-8 border-b border-white/10 pb-6">
                <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-white">Liquidaciones</h2>
                    <p className="text-[#D4E655] font-bold text-xs tracking-widest uppercase">Control Mensual</p>
                </div>

                <div className="flex items-center gap-2 bg-[#111] border border-white/10 rounded-xl p-1">
                    <button onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white"><ChevronLeft size={16} /></button>
                    <div className="px-4 text-sm font-bold uppercase w-32 text-center">{format(selectedMonth, 'MMMM yyyy', { locale: es })}</div>
                    <button onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white"><ChevronRight size={16} /></button>
                </div>
            </div>

            {loading ? <div className="flex justify-center p-20"><Loader2 className="animate-spin text-[#D4E655]" /></div> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {resumenes.map((docente) => (
                        <div key={docente.profesor_id} className="bg-[#09090b] border border-white/10 rounded-2xl p-6 hover:border-[#D4E655]/50 transition-all group relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4E655]/5 rounded-full blur-3xl -mr-16 -mt-16 transition-opacity opacity-50 group-hover:opacity-100"></div>
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[#D4E655] border border-white/5"><User size={18} /></div>
                                    <div><h3 className="font-bold text-lg leading-none">{docente.nombre}</h3><span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Profesor</span></div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-6 border-y border-white/5 py-4">
                                <div className="text-center border-r border-white/5"><div className="text-2xl font-black text-white">{docente.clases_dictadas}</div><div className="text-[9px] uppercase text-gray-500 font-bold">Clases</div></div>
                                <div className="text-center"><div className="text-2xl font-black text-white">{docente.alumnos_total}</div><div className="text-[9px] uppercase text-gray-500 font-bold">Alumnos</div></div>
                            </div>
                            <div className="flex justify-between items-end">
                                <div><p className="text-[9px] uppercase text-gray-500 font-bold mb-1">A Liquidar (Efectivo)</p><div className="text-3xl font-black text-[#D4E655] tracking-tight">${docente.total_a_liquidar.toLocaleString()}</div></div>
                                <button onClick={() => publicarLiquidacion(docente)} className="bg-white/5 hover:bg-[#D4E655] hover:text-black p-3 rounded-xl text-white transition-colors border border-white/5" title="Publicar para el docente"><CheckCircle size={20} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}