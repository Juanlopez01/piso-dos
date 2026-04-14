'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, useMemo } from 'react'
import useSWR from 'swr'
import { format, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Wallet, Search, Loader2, ChevronDown, ChevronUp, Users, Calendar, DollarSign, Lock, FileSpreadsheet } from 'lucide-react'
import { useCash } from '@/context/CashContext'
import Link from 'next/link'

type ClaseLiquidacion = {
    id: string
    nombre: string
    inicio: string
    tipo_acuerdo: 'porcentaje' | 'fijo'
    valor_acuerdo: number
    cant_alumnos: number
    total_clase: number
    pago_profe: number
}

type ProfeLiquidacion = {
    id: string
    nombre: string
    clases: ClaseLiquidacion[]
    total_pago: number
    total_recaudado: number
}

// 🚀 FETCHER GLOBAL: Busca todas las clases del mes y las agrupa por profe
const fetchLiquidacionesGlobales = async ([key, mesKey]: [string, string]) => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error("No autenticado")

    // Generamos un margen amplio (mes anterior y siguiente) para evitar problemas de UTC
    const [yyyy, mm] = mesKey.split('-')
    const prevMonth = parseInt(mm) === 1 ? `${parseInt(yyyy) - 1}-12` : `${yyyy}-${String(parseInt(mm) - 1).padStart(2, '0')}`
    const nextMonth = parseInt(mm) === 12 ? `${parseInt(yyyy) + 1}-01` : `${yyyy}-${String(parseInt(mm) + 1).padStart(2, '0')}`

    const { data: clasesData, error } = await supabase
        .from('clases')
        .select(`
            id, nombre, inicio, tipo_acuerdo, valor_acuerdo, estado,
            profesor:profiles!profesor_id(id, nombre_completo),
            inscripciones ( valor_credito, presente )
        `)
        .neq('estado', 'cancelada')
        .gte('inicio', `${prevMonth}-25`) // Margen seguro
        .lte('inicio', `${nextMonth}-05`) // Margen seguro

    if (error) throw error

    const liquidacionesPorProfe: Record<string, ProfeLiquidacion> = {}
    let totalGeneralPagar = 0
    let totalGeneralRecaudado = 0

    if (clasesData) {
        clasesData.forEach((clase: any) => {
            if (!clase.inicio) return

            // 🚀 Filtramos EXACTAMENTE por el mes seleccionado usando el string original
            const [fechaParte] = clase.inicio.split('T')
            const [anio, mes] = fechaParte.split('-')
            if (`${anio}-${mes}` !== mesKey) return // Descartamos si no es del mes pedido

            const profId = clase.profesor?.id || 'sin-profe'
            const profNombre = clase.profesor?.nombre_completo || 'Staff Sin Asignar'

            if (!liquidacionesPorProfe[profId]) {
                liquidacionesPorProfe[profId] = {
                    id: profId,
                    nombre: profNombre,
                    clases: [],
                    total_pago: 0,
                    total_recaudado: 0
                }
            }

            const inscripcionesArreglo = Array.isArray(clase.inscripciones) ? clase.inscripciones : []
            const cant_alumnos = inscripcionesArreglo.filter((i: any) => i.presente).length
            const total_clase = inscripcionesArreglo.reduce((acc: number, insc: any) => acc + (Number(insc.valor_credito) || 0), 0)

            let pago_profe = 0
            if (clase.tipo_acuerdo === 'fijo') {
                pago_profe = Number(clase.valor_acuerdo) || 0
            } else {
                pago_profe = total_clase * ((Number(clase.valor_acuerdo) || 0) / 100)
            }

            liquidacionesPorProfe[profId].clases.push({
                id: clase.id,
                nombre: clase.nombre,
                inicio: clase.inicio, // Guardamos original
                tipo_acuerdo: clase.tipo_acuerdo,
                valor_acuerdo: clase.valor_acuerdo,
                cant_alumnos,
                total_clase,
                pago_profe
            })

            liquidacionesPorProfe[profId].total_pago += pago_profe
            liquidacionesPorProfe[profId].total_recaudado += total_clase

            totalGeneralPagar += pago_profe
            totalGeneralRecaudado += total_clase
        })
    }

    // Convertimos a array y ordenamos alfabéticamente
    const arrayProfes = Object.values(liquidacionesPorProfe).sort((a, b) => a.nombre.localeCompare(b.nombre))

    // Ordenamos las clases de cada profe por fecha
    arrayProfes.forEach(p => {
        p.clases.sort((a, b) => a.inicio.localeCompare(b.inicio))
    })

    return {
        profesores: arrayProfes,
        totalGeneralPagar,
        totalGeneralRecaudado
    }
}

export default function AdminLiquidacionesPage() {
    const { userRole, isLoading: loadingContext } = useCash()

    // Generar opciones de meses (3 atrás, actual, 1 adelante)
    const opcionesMeses = useMemo(() => {
        const hoy = new Date()
        return [
            format(addMonths(hoy, 1), 'yyyy-MM'),
            format(hoy, 'yyyy-MM'),
            format(subMonths(hoy, 1), 'yyyy-MM'),
            format(subMonths(hoy, 2), 'yyyy-MM'),
            format(subMonths(hoy, 3), 'yyyy-MM'),
        ]
    }, [])

    const [selectedMonth, setSelectedMonth] = useState(opcionesMeses[1]) // Por defecto el mes actual
    const [searchQuery, setSearchQuery] = useState('')
    const [expandedProf, setExpandedProf] = useState<string | null>(null)

    // 🚀 SWR Fetching
    const { data, isLoading, error } = useSWR(
        userRole && ['admin', 'recepcion'].includes(userRole) ? ['liquidaciones-global', selectedMonth] : null,
        fetchLiquidacionesGlobales,
        { revalidateOnFocus: false }
    )

    if (loadingContext || isLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    // 🛡️ PATOVICA DE ACCESO
    if (!['admin', 'recepcion'].includes(userRole || '')) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4">
                <Lock className="text-red-500 w-16 h-16 mb-4" />
                <h1 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Acceso Denegado</h1>
                <p className="text-gray-500 text-sm mb-6">Solo Administración y Recepción pueden ver las liquidaciones globales.</p>
                <Link href="/" className="bg-white/10 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs">Volver al Inicio</Link>
            </div>
        )
    }

    if (error) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-red-500 font-bold uppercase">Error al cargar liquidaciones</div>

    const profesores = data?.profesores || []
    const filtrados = profesores.filter(p => p.nombre.toLowerCase().includes(searchQuery.toLowerCase()))

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">

            {/* HEADER Y CONTROLES */}
            <div className="mb-8 border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <FileSpreadsheet className="text-[#D4E655]" size={24} />
                        <span className="text-[#D4E655] font-bold text-[10px] tracking-[0.3em] uppercase">Panel de Pagos</span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1">
                        Liquidaciones Staff
                    </h1>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-3.5 text-gray-500" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar profesor..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-10 text-white text-sm outline-none focus:border-[#D4E655] transition-colors"
                        />
                    </div>
                    <select
                        value={selectedMonth}
                        onChange={(e) => { setSelectedMonth(e.target.value); setExpandedProf(null); }}
                        className="w-full sm:w-auto bg-[#111] border border-[#D4E655]/30 rounded-xl p-3 text-white text-sm font-bold uppercase outline-none focus:border-[#D4E655] appearance-none"
                    >
                        {opcionesMeses.map(mes => {
                            const [y, m] = mes.split('-')
                            const date = new Date(parseInt(y), parseInt(m) - 1, 15)
                            return <option key={mes} value={mes}>{format(date, "MMMM yyyy", { locale: es })}</option>
                        })}
                    </select>
                </div>
            </div>

            {/* TARJETAS RESUMEN DEL MES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-[#111] border border-white/5 p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">A Pagar este Mes (Profes)</p>
                        <p className="text-3xl font-black text-[#D4E655]">${data?.totalGeneralPagar.toLocaleString()}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-[#D4E655]/10 flex items-center justify-center"><DollarSign className="text-[#D4E655]" /></div>
                </div>
                <div className="bg-[#111] border border-white/5 p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total Movido Contable</p>
                        <p className="text-3xl font-black text-white">${data?.totalGeneralRecaudado.toLocaleString()}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center"><Wallet className="text-gray-400" /></div>
                </div>
            </div>

            {/* LISTA DE PROFESORES */}
            <div className="space-y-4">
                {filtrados.length === 0 ? (
                    <div className="text-center py-20 bg-[#111]/50 rounded-3xl border border-dashed border-white/10">
                        <Users className="mx-auto mb-3 text-gray-600" size={32} />
                        <p className="text-sm font-bold uppercase text-gray-500">No hay liquidaciones</p>
                        <p className="text-xs text-gray-600">No se encontraron clases para el filtro seleccionado.</p>
                    </div>
                ) : (
                    filtrados.map((profe) => {
                        const isOpen = expandedProf === profe.id

                        return (
                            <div key={profe.id} className={`bg-[#09090b] border ${isOpen ? 'border-[#D4E655]/30' : 'border-white/10'} rounded-2xl overflow-hidden transition-all duration-300`}>

                                {/* CABECERA DEL PROFE */}
                                <button
                                    onClick={() => setExpandedProf(isOpen ? null : profe.id)}
                                    className="w-full p-5 flex flex-col md:flex-row justify-between items-start md:items-center bg-[#111]/50 hover:bg-[#111] transition-colors text-left gap-4"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white font-black text-lg border border-white/10">
                                            {profe.nombre[0]}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white uppercase">{profe.nombre}</h3>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                                                {profe.clases.length} clases dictadas
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6 w-full md:w-auto border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
                                        <div className="text-left md:text-right">
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Liquidación</p>
                                            <p className={`text-xl font-black ${isOpen ? 'text-[#D4E655]' : 'text-white'}`}>
                                                ${profe.total_pago.toLocaleString()}
                                            </p>
                                        </div>
                                        {isOpen ? <ChevronUp className="text-gray-500 shrink-0 hidden md:block" /> : <ChevronDown className="text-gray-500 shrink-0 hidden md:block" />}
                                    </div>
                                </button>

                                {/* DETALLE DE CLASES (Expandible) */}
                                <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="p-4 md:p-6 border-t border-white/5 bg-[#09090b]">

                                        {/* TABLA DESKTOP */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10">
                                                        <th className="pb-3 pl-2">Fecha</th>
                                                        <th className="pb-3">Clase</th>
                                                        <th className="pb-3 text-center">Acuerdo</th>
                                                        <th className="pb-3 text-center">Pax</th>
                                                        <th className="pb-3 text-right">Recaudado</th>
                                                        <th className="pb-3 text-right text-[#D4E655]">A Pagar</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5 text-xs">
                                                    {profe.clases.map((clase) => {
                                                        const [fechaParte, horaParte] = clase.inicio.split('T')
                                                        const [a, m, d] = fechaParte.split('-')
                                                        const hora = horaParte ? horaParte.substring(0, 5) : '--:--'

                                                        return (
                                                            <tr key={clase.id} className="hover:bg-white/5 transition-colors group">
                                                                <td className="py-3 pl-2 text-gray-400 font-medium">{d}/{m} <span className="opacity-50 ml-1">{hora}</span></td>
                                                                <td className="py-3 font-bold text-white uppercase">{clase.nombre}</td>
                                                                <td className="py-3 text-center text-gray-500 font-bold">{clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : `$${clase.valor_acuerdo}`}</td>
                                                                <td className="py-3 text-center"><span className="bg-white/10 px-2 py-0.5 rounded flex items-center justify-center gap-1 w-fit mx-auto"><Users size={10} /> {clase.cant_alumnos}</span></td>
                                                                <td className="py-3 text-right text-gray-400">${clase.total_clase.toLocaleString()}</td>
                                                                <td className="py-3 text-right font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* TARJETAS MOBILE */}
                                        <div className="md:hidden space-y-2">
                                            {profe.clases.map((clase) => {
                                                const [fechaParte, horaParte] = clase.inicio.split('T')
                                                const [a, m, d] = fechaParte.split('-')
                                                const hora = horaParte ? horaParte.substring(0, 5) : '--:--'

                                                return (
                                                    <div key={clase.id} className="bg-[#111] p-3 rounded-xl border border-white/5">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div>
                                                                <h4 className="font-bold text-white uppercase text-xs">{clase.nombre}</h4>
                                                                <p className="text-[10px] text-gray-400 mt-0.5"><Calendar size={10} className="inline mr-1" /> {d}/{m} - {hora}hs</p>
                                                            </div>
                                                            <span className="bg-white/10 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"><Users size={10} /> {clase.cant_alumnos}</span>
                                                        </div>
                                                        <div className="flex justify-between items-end pt-2 border-t border-white/5 mt-2">
                                                            <div>
                                                                <p className="text-[8px] text-gray-500 uppercase font-bold">Acuerdo: {clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : `Fijo`}</p>
                                                                <p className="text-[9px] text-gray-400 mt-0.5">Recaudado: ${clase.total_clase.toLocaleString()}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[8px] text-[#D4E655]/70 uppercase font-bold">A Pagar</p>
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