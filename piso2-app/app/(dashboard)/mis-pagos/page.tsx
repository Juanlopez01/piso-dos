'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { format, isSameMonth, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Wallet, Calendar, Loader2, ChevronDown, ChevronUp, CheckCircle, Clock, Users } from 'lucide-react'

type Inscripcion = {
    valor_credito: number
    presente: boolean
}

type ClaseLiquidacion = {
    id: string
    nombre: string
    inicio: string
    tipo_acuerdo: 'porcentaje' | 'fijo'
    valor_acuerdo: number
    estado: string
    inscripciones: Inscripcion[]
    // Valores calculados
    total_clase: number
    pago_profe: number
    cant_alumnos: number
}

type MesAgrupado = {
    mesKey: string // ej: "2026-02"
    nombreMes: string // ej: "Febrero 2026"
    esActual: boolean
    clases: ClaseLiquidacion[]
    total_recaudado_mes: number
    total_profe_mes: number
}

// 🚀 FETCHER EXTERNO CON SWR Y BLINDAJE
const fetchLiquidaciones = async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) throw new Error("No autenticado")

    // 1. Nombre del profe
    const { data: profile } = await supabase.from('profiles').select('nombre').eq('id', user.id).single()
    const userName = profile?.nombre || ''

    // 2. Traer todas las clases
    const { data: clasesData, error } = await supabase
        .from('clases')
        .select(`
            id, nombre, inicio, tipo_acuerdo, valor_acuerdo, estado,
            inscripciones ( valor_credito, presente )
        `)
        .eq('profesor_id', user.id)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: false })

    if (error) throw error

    const agrupados: Record<string, MesAgrupado> = {}
    const hoy = new Date()

    // Filtro de meses permitidos: 2 pasados, el actual, y 1 futuro
    const allowedMonths = [
        format(subMonths(hoy, 2), 'yyyy-MM'),
        format(subMonths(hoy, 1), 'yyyy-MM'),
        format(hoy, 'yyyy-MM'),
        format(addMonths(hoy, 1), 'yyyy-MM')
    ]

    if (clasesData) {
        console.log(clasesData);

        clasesData.forEach((clase: any) => {
            // Si la clase no tiene fecha, la saltamos para que no rompa nada
            if (!clase.inicio) return

            // 🚀 ZONA HORARIA BLINDADA (SIN ROMPER EL STRING ORIGINAL)
            // Extraemos solo el "2026-04-11" cortando por la "T"
            const soloFecha = clase.inicio.split('T')[0]

            // Le clavamos las 12 del mediodía para saber el mes sin importar la zona horaria
            const fechaClase = new Date(`${soloFecha}T12:00:00`)

            const mesKey = format(fechaClase, 'yyyy-MM')

            // Si el mes no está en la ventana (los 4 meses que filtramos), lo ignoramos
            if (!allowedMonths.includes(mesKey)) return

            const esActual = isSameMonth(fechaClase, hoy)

            if (!agrupados[mesKey]) {
                agrupados[mesKey] = {
                    mesKey,
                    nombreMes: format(fechaClase, "MMMM yyyy", { locale: es }),
                    esActual,
                    clases: [],
                    total_recaudado_mes: 0,
                    total_profe_mes: 0
                }
            }

            // 🛡️ BLINDAJE: Aseguramos que inscripciones sea un array
            const inscripcionesArreglo = Array.isArray(clase.inscripciones) ? clase.inscripciones : []

            const cant_alumnos = inscripcionesArreglo.filter((i: any) => i.presente).length
            const total_clase = inscripcionesArreglo.reduce((acc: number, insc: any) => acc + (Number(insc.valor_credito) || 0), 0)

            let pago_profe = 0
            if (clase.tipo_acuerdo === 'fijo') {
                pago_profe = Number(clase.valor_acuerdo) || 0
            } else {
                const porcentaje = (Number(clase.valor_acuerdo) || 0) / 100
                pago_profe = total_clase * porcentaje
            }

            const claseProcesada: ClaseLiquidacion = {
                ...clase,
                inicio: clase.inicio, // 👈 MAGIA: Le dejamos su fecha original INTACTA
                total_clase,
                pago_profe,
                cant_alumnos,
                inscripciones: inscripcionesArreglo
            }

            agrupados[mesKey].clases.push(claseProcesada)
            agrupados[mesKey].total_recaudado_mes += total_clase
            agrupados[mesKey].total_profe_mes += pago_profe
        })
    }

    const listaMeses = Object.values(agrupados).sort((a, b) => b.mesKey.localeCompare(a.mesKey))
    return { meses: listaMeses, userName }
}

export default function MisPagosPage() {
    const [expandedMonth, setExpandedGroup] = useState<string | null>(null)

    // 🚀 USAMOS SWR PARA CACHEO Y ESTADO DE CARGA
    const { data, isLoading, error } = useSWR('liquidaciones-profe', fetchLiquidaciones, {
        revalidateOnFocus: false
    })

    // Expandir el primer mes automáticamente cuando llegan los datos
    useEffect(() => {
        if (data?.meses && data.meses.length > 0 && !expandedMonth) {
            setExpandedGroup(data.meses[0].mesKey)
        }
    }, [data?.meses, expandedMonth])

    if (isLoading) {
        return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>
    }

    if (error) {
        return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-red-500 font-bold uppercase">Error al cargar pagos</div>
    }

    const meses = data?.meses || []
    const userName = data?.userName || ''

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">

            {/* HEADER */}
            <div className="mb-8 border-b border-white/10 pb-6">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1">
                    Mis Pagos
                </h1>
                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest">
                    Liquidaciones e Historial • {userName}
                </p>
            </div>

            {/* LISTA DE MESES (Historial) */}
            <div className="space-y-6 max-w-5xl">
                {meses.length === 0 ? (
                    <div className="bg-[#111] border border-white/5 rounded-2xl p-12 text-center text-gray-500">
                        <Wallet className="mx-auto mb-4 opacity-20" size={48} />
                        <p className="font-bold uppercase text-sm">No hay clases registradas en este período.</p>
                        <p className="text-xs mt-1">Solo se muestran los dos meses anteriores, el mes actual y el mes próximo.</p>
                    </div>
                ) : (
                    meses.map((mes) => {
                        const isOpen = expandedMonth === mes.mesKey

                        return (
                            <div key={mes.mesKey} className={`bg-[#09090b] border ${mes.esActual ? 'border-[#D4E655]/30' : 'border-white/10'} rounded-2xl overflow-hidden transition-all duration-300 shadow-xl`}>

                                {/* CABECERA DEL MES */}
                                <button
                                    onClick={() => setExpandedGroup(isOpen ? null : mes.mesKey)}
                                    className="w-full p-5 flex flex-col md:flex-row justify-between items-start md:items-center bg-[#111]/50 hover:bg-[#111] transition-colors text-left gap-4"
                                >
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h2 className="text-2xl font-black text-white uppercase capitalize">{mes.nombreMes}</h2>
                                            {mes.esActual ? (
                                                <span className="bg-[#D4E655]/10 text-[#D4E655] text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full flex items-center gap-1">
                                                    <Clock size={10} /> En Curso
                                                </span>
                                            ) : (
                                                <span className="bg-white/10 text-gray-400 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full flex items-center gap-1">
                                                    <CheckCircle size={10} /> Cerrado
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                                            {mes.clases.length} clases dictadas
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-6 w-full md:w-auto border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
                                        <div className="text-left md:text-right">
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Mi Liquidación</p>
                                            <p className={`text-2xl font-black ${mes.esActual ? 'text-[#D4E655]' : 'text-white'}`}>
                                                ${mes.total_profe_mes.toLocaleString()}
                                            </p>
                                        </div>
                                        {isOpen ? <ChevronUp className="text-gray-500 shrink-0 hidden md:block" /> : <ChevronDown className="text-gray-500 shrink-0 hidden md:block" />}
                                    </div>
                                </button>

                                {/* CUADRO TIPO EXCEL */}
                                <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="p-4 md:p-6 border-t border-white/5 bg-[#09090b]">

                                        {/* VERSIÓN DESKTOP (Tabla) */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10">
                                                        <th className="pb-3 pl-2">Fecha</th>
                                                        <th className="pb-3">Clase</th>
                                                        <th className="pb-3 text-center">Acuerdo</th>
                                                        <th className="pb-3 text-center">Alumnos</th>
                                                        <th className="pb-3 text-right text-[#D4E655]">Mi Pago</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5 text-sm">
                                                    {mes.clases.map((clase) => {
                                                        // 🚀 MAGIA: Extraemos la hora directamente del texto para evitar el ajuste de zona horaria
                                                        const [fechaParte, horaParte] = clase.inicio.split('T');
                                                        const horaDisplay = horaParte ? horaParte.substring(0, 5) : '00:00';

                                                        // Extraemos día/mes manualmente del string YYYY-MM-DD
                                                        const [anio, mesStr, dia] = fechaParte.split('-');
                                                        const fechaDisplay = `${dia}/${mesStr}`;

                                                        return (
                                                            <tr key={clase.id} className="hover:bg-white/5 transition-colors group">
                                                                <td className="py-4 pl-2 text-gray-400 font-medium">
                                                                    {fechaDisplay} <span className="text-xs ml-1 opacity-50">{horaDisplay}</span>
                                                                </td>
                                                                <td className="py-4 font-bold text-white uppercase">{clase.nombre}</td>
                                                                <td className="py-4 text-center text-xs text-gray-500 uppercase font-bold">
                                                                    {clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : `Fijo: $${clase.valor_acuerdo}`}
                                                                </td>
                                                                <td className="py-4 text-center">
                                                                    <span className="bg-white/10 px-2 py-1 rounded text-xs font-bold flex items-center justify-center gap-1 w-fit mx-auto">
                                                                        <Users size={12} /> {clase.cant_alumnos}
                                                                    </span>
                                                                </td>
                                                                <td className="py-4 text-right font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* VERSIÓN MOBILE (Tarjetas Listadas) */}
                                        <div className="md:hidden space-y-3">
                                            {mes.clases.map((clase) => {
                                                // 🚀 MISMA LÓGICA: Extracción manual de texto
                                                const [fechaParte, horaParte] = clase.inicio.split('T');
                                                const horaDisplay = horaParte ? horaParte.substring(0, 5) : '00:00';
                                                const [anio, mesStr, dia] = fechaParte.split('-');
                                                const fechaDisplay = `${dia}/${mesStr}`;

                                                return (
                                                    <div key={clase.id} className="bg-[#111] p-4 rounded-xl border border-white/5">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div>
                                                                <h4 className="font-bold text-white uppercase leading-tight">{clase.nombre}</h4>
                                                                <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                                                                    <Calendar size={10} /> {fechaDisplay} - {horaDisplay} hs
                                                                </p>
                                                            </div>
                                                            <span className="bg-white/10 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1">
                                                                <Users size={10} /> {clase.cant_alumnos}
                                                            </span>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/5">
                                                            <div>
                                                                <p className="text-[9px] text-gray-500 uppercase font-bold">Acuerdo</p>
                                                                <p className="text-xs text-gray-300">{clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : 'Monto Fijo'}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[9px] text-gray-500 uppercase font-bold">Mi Pago</p>
                                                                <p className="text-sm font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>

                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

        </div>
    )
}