'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, useMemo } from 'react'
import useSWR from 'swr'
import { format, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Wallet, Search, Loader2, ChevronDown, ChevronUp, Users, Calendar, DollarSign, Lock, FileSpreadsheet, CheckCircle2, X, Library, Smartphone, ArrowDownRight, Download, Trophy, User } from 'lucide-react'
import { useCash } from '@/context/CashContext'
import Link from 'next/link'
import { toast, Toaster } from 'sonner'
import { pagarClaseProfeAction } from '@/app/actions/liquidaciones'

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

type ClaseLiquidacion = {
    id: string
    nombre: string
    inicio: string
    tipo_acuerdo: 'porcentaje' | 'fijo'
    valor_acuerdo: number
    cant_alumnos: number
    total_clase: number
    pago_profe: number
    pagado_profe: boolean
    profesor_nombre: string
    alumnos_lista: { nombre: string; presente: boolean }[]
}

type ProfeLiquidacion = {
    id: string
    nombre: string
    clases: ClaseLiquidacion[]
    total_pago: number
    total_recaudado: number
}

type GrupoClaseLiquidacion = {
    nombre_grupo: string
    profesor_nombre: string
    clases: ClaseLiquidacion[]
    total_pago: number
    total_recaudado: number
    cant_alumnos_total: number
}

type TransaccionVirtual = {
    id: string
    concepto: string
    monto: number
    metodo_pago: string
    created_at: string
}

type ClaseRanking = {
    id: string
    nombre: string
    inicio: string
    profesor_nombre: string
    cant_alumnos: number
    total_recaudado: number
    categoria: 'regular' | 'especial' | 'grupo'
}

const fetchLiquidacionesGlobales = async ([key, mesKey]: [string, string]) => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error("No autenticado")

    const [yyyy, mm] = mesKey.split('-')
    const prevMonth = parseInt(mm) === 1 ? `${parseInt(yyyy) - 1}-12` : `${yyyy}-${String(parseInt(mm) - 1).padStart(2, '0')}`
    const nextMonth = parseInt(mm) === 12 ? `${parseInt(yyyy) + 1}-01` : `${yyyy}-${String(parseInt(mm) + 1).padStart(2, '0')}`

    // 🚀 AGREGAMOS compania_id Y liga_nivel A LA BÚSQUEDA
    const { data: clasesData, error } = await supabase
        .from('clases')
        .select(`
            id, nombre, inicio, tipo_clase, tipo_acuerdo, valor_acuerdo, estado, pagado_profe, compania_id, liga_nivel,
            profesor:profiles!profesor_id(id, nombre_completo),
            inscripciones ( valor_credito, presente, nombre_invitado, user:profiles(nombre_completo) )
        `)
        .neq('estado', 'cancelada')
        .gte('inicio', `${prevMonth}-25`)
        .lte('inicio', `${nextMonth}-05`)

    if (error) throw error

    const { data: movsData } = await supabase
        .from('caja_movimientos')
        .select('id, concepto, monto, metodo_pago, created_at, tipo')
        .in('metodo_pago', ['transferencia', 'mercadopago', 'mercadopago_manual', 'mp', 'online'])
        .gte('created_at', `${prevMonth}-25T00:00:00`)
        .lte('created_at', `${nextMonth}-05T23:59:59`)

    const { data: pagosOnlineData } = await supabase
        .from('pagos_online')
        .select('id, concepto, monto, estado, created_at')
        .eq('estado', 'approved')
        .gte('created_at', `${prevMonth}-25T00:00:00`)
        .lte('created_at', `${nextMonth}-05T23:59:59`)

    const liquidacionesPorProfe: Record<string, ProfeLiquidacion> = {}
    let totalGeneralPagar = 0
    let totalGeneralRecaudado = 0
    let totalYaPagado = 0

    const rankingClases: ClaseRanking[] = []

    if (clasesData) {
        clasesData.forEach((clase: any) => {
            if (!clase.inicio) return

            const [fechaParte] = clase.inicio.split('T')
            const [anio, mes] = fechaParte.split('-')
            if (`${anio}-${mes}` !== mesKey) return

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
            const cant_alumnos = inscripcionesArreglo.length
            const total_clase = inscripcionesArreglo.reduce((acc: number, insc: any) => acc + (Number(insc.valor_credito) || 0), 0)

            const alumnos_lista = inscripcionesArreglo.map((i: any) => {
                const nombreUsuario = Array.isArray(i.user) ? i.user[0]?.nombre_completo : i.user?.nombre_completo
                const nombreFinal = nombreUsuario || i.nombre_invitado || 'Alumno Desconocido'
                return { nombre: nombreFinal, presente: i.presente }
            })

            let pago_profe = 0
            if (clase.tipo_acuerdo === 'fijo') {
                pago_profe = Number(clase.valor_acuerdo) || 0
            } else {
                pago_profe = total_clase * ((Number(clase.valor_acuerdo) || 0) / 100)
            }

            liquidacionesPorProfe[profId].clases.push({
                id: clase.id,
                nombre: clase.nombre,
                inicio: clase.inicio,
                tipo_acuerdo: clase.tipo_acuerdo,
                valor_acuerdo: clase.valor_acuerdo,
                cant_alumnos,
                total_clase,
                pago_profe,
                pagado_profe: clase.pagado_profe || false,
                profesor_nombre: profNombre,
                alumnos_lista
            })

            if (clase.pagado_profe) {
                totalYaPagado += pago_profe;
            } else {
                liquidacionesPorProfe[profId].total_pago += pago_profe;
                totalGeneralPagar += pago_profe;
            }

            liquidacionesPorProfe[profId].total_recaudado += total_clase
            totalGeneralRecaudado += total_clase

            // 🚀 CATEGORIZACIÓN BLINDADA PARA EL RANKING
            const tipoClaseStr = (clase.tipo_clase || '').toLowerCase();
            let categoria: 'regular' | 'especial' | 'grupo' = 'regular';

            const perteneceAGrupo = tipoClaseStr === 'liga' ||
                tipoClaseStr.includes('compa') ||
                tipoClaseStr.includes('formacion') ||
                !!clase.compania_id ||
                !!clase.liga_nivel;

            if (perteneceAGrupo) {
                categoria = 'grupo';
            } else if (tipoClaseStr === 'especial' || tipoClaseStr === 'seminario') {
                categoria = 'especial';
            } else {
                categoria = 'regular'; // Solo si no tiene vinculación con compañías/liga cae acá
            }

            rankingClases.push({
                id: clase.id,
                nombre: clase.nombre,
                inicio: clase.inicio,
                profesor_nombre: profNombre,
                cant_alumnos,
                total_recaudado: total_clase,
                categoria
            });
        })
    }

    const arrayProfes = Object.values(liquidacionesPorProfe).sort((a, b) => a.nombre.localeCompare(b.nombre))
    arrayProfes.forEach(p => { p.clases.sort((a, b) => a.inicio.localeCompare(b.inicio)) })

    const transaccionesVirtuales: TransaccionVirtual[] = []
    let totalVirtual = 0

    if (movsData) {
        movsData.forEach((mov: any) => {
            if (!mov.created_at) return
            const [anio, mes] = mov.created_at.split('T')[0].split('-')

            if (`${anio}-${mes}` === mesKey) {
                if (mov.tipo === 'egreso' || Number(mov.monto) <= 0) return

                transaccionesVirtuales.push({
                    id: mov.id,
                    concepto: mov.concepto || 'Ingreso sin detalle',
                    monto: Number(mov.monto),
                    metodo_pago: mov.metodo_pago,
                    created_at: mov.created_at
                })
                totalVirtual += Number(mov.monto)
            }
        })
    }

    if (pagosOnlineData) {
        pagosOnlineData.forEach((pago: any) => {
            if (!pago.created_at) return
            const [anio, mes] = pago.created_at.split('T')[0].split('-')

            if (`${anio}-${mes}` === mesKey) {
                transaccionesVirtuales.push({
                    id: pago.id,
                    concepto: pago.concepto || 'Compra App (MercadoPago)',
                    monto: Number(pago.monto),
                    metodo_pago: 'mercadopago_online',
                    created_at: pago.created_at
                })
                totalVirtual += Number(pago.monto)
            }
        })
    }

    transaccionesVirtuales.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return {
        profesores: arrayProfes,
        totalGeneralPagar,
        totalGeneralRecaudado,
        transaccionesVirtuales,
        totalVirtual,
        rankingClases
    }
}

export default function AdminLiquidacionesPage() {
    const { userRole, isLoading: loadingContext } = useCash()

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

    const [selectedMonth, setSelectedMonth] = useState(opcionesMeses[1])
    const [searchQuery, setSearchQuery] = useState('')
    const [expandedProf, setExpandedProf] = useState<string | null>(null)
    const [expandedClase, setExpandedClase] = useState<string | null>(null)

    const [vistaActiva, setVistaActiva] = useState<'docentes' | 'clases' | 'virtual' | 'ranking'>('docentes')

    const [rankingCategoria, setRankingCategoria] = useState<'regular' | 'especial' | 'grupo'>('regular')
    const [rankingOrden, setRankingOrden] = useState<'alumnos' | 'recaudacion'>('alumnos')

    const [modalPago, setModalPago] = useState<{ isOpen: boolean; clase: ClaseLiquidacion | null; nombreProfe: string }>({ isOpen: false, clase: null, nombreProfe: '' })
    const [modalAlumnos, setModalAlumnos] = useState<{ isOpen: boolean; claseNombre: string; fecha: string; alumnos: { nombre: string, presente: boolean }[] }>({ isOpen: false, claseNombre: '', fecha: '', alumnos: [] })
    const [procesandoPago, setProcesandoPago] = useState(false)

    const { data, isLoading, error, mutate } = useSWR(
        userRole && ['admin', 'recepcion'].includes(userRole) ? ['liquidaciones-global', selectedMonth] : null,
        fetchLiquidacionesGlobales,
        { revalidateOnFocus: false }
    )

    const handleProcesarPago = async (metodo: 'efectivo' | 'transferencia') => {
        if (!modalPago.clase) return
        setProcesandoPago(true)

        const res = await pagarClaseProfeAction(
            modalPago.clase.id,
            modalPago.clase.pago_profe,
            metodo,
            modalPago.clase.nombre,
            modalPago.nombreProfe
        )

        if (res.success) {
            toast.success(`Pago de $${modalPago.clase.pago_profe} registrado correctamente.`)
            mutate()
            setModalPago({ isOpen: false, clase: null, nombreProfe: '' })
        } else {
            toast.error(res.error || 'Error al procesar el pago')
        }
        setProcesandoPago(false)
    }

    const gruposDeClases = useMemo(() => {
        if (!data?.profesores) return []
        const todosLosGrupos: Record<string, GrupoClaseLiquidacion> = {}
        data.profesores.forEach(profe => {
            profe.clases.forEach(clase => {
                const nombreLimpiado = clase.nombre.trim().toUpperCase()
                const key = `${nombreLimpiado}-${clase.profesor_nombre}`

                if (!todosLosGrupos[key]) {
                    todosLosGrupos[key] = {
                        nombre_grupo: clase.nombre,
                        profesor_nombre: clase.profesor_nombre,
                        clases: [],
                        total_pago: 0,
                        total_recaudado: 0,
                        cant_alumnos_total: 0
                    }
                }
                todosLosGrupos[key].clases.push(clase)
                todosLosGrupos[key].total_pago += clase.pago_profe
                todosLosGrupos[key].total_recaudado += clase.total_clase
                todosLosGrupos[key].cant_alumnos_total += clase.cant_alumnos
            })
        })
        return Object.values(todosLosGrupos).sort((a, b) => a.nombre_grupo.localeCompare(b.nombre_grupo))
    }, [data])

    const clasesRankeadas = useMemo(() => {
        if (!data?.rankingClases) return [];
        const filtradas = data.rankingClases.filter((c: any) => c.categoria === rankingCategoria);
        if (rankingOrden === 'alumnos') {
            return filtradas.sort((a: any, b: any) => b.cant_alumnos - a.cant_alumnos);
        } else {
            return filtradas.sort((a: any, b: any) => b.total_recaudado - a.total_recaudado);
        }
    }, [data, rankingCategoria, rankingOrden]);

    if (loadingContext || isLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

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
    const transaccionesVirtuales = data?.transaccionesVirtuales || []
    const totalVirtual = data?.totalVirtual || 0

    const filtradosProfes = profesores.filter(p => p.nombre.toLowerCase().includes(searchQuery.toLowerCase()))
    const filtradosClases = gruposDeClases.filter(g => g.nombre_grupo.toLowerCase().includes(searchQuery.toLowerCase()) || g.profesor_nombre.toLowerCase().includes(searchQuery.toLowerCase()))
    const filtradosVirtuales = transaccionesVirtuales.filter(t => t.concepto.toLowerCase().includes(searchQuery.toLowerCase()))

    const exportarPDF = () => {
        const doc = new jsPDF()
        doc.setFontSize(16)
        doc.text(`Reporte de Ingresos Virtuales`, 14, 20)
        doc.setFontSize(10)
        doc.setTextColor(100)
        doc.text(`Periodo: ${selectedMonth}  |  Total Registrado: $${totalVirtual.toLocaleString()}`, 14, 26)

        const tableData = filtradosVirtuales.map(mov => [
            format(new Date(mov.created_at), "dd/MM/yyyy HH:mm"),
            mov.concepto,
            mov.metodo_pago === 'mp' ? 'MercadoPago' : mov.metodo_pago.replace('_', ' ').toUpperCase(),
            `$${mov.monto.toLocaleString()}`
        ])

        autoTable(doc, {
            startY: 32,
            head: [['Fecha / Hora', 'Concepto', 'Método', 'Monto']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [40, 40, 40], textColor: [212, 230, 85] },
            styles: { fontSize: 8 },
        })

        doc.save(`Ingresos_Virtuales_${selectedMonth}.pdf`)
        toast.success("PDF generado y descargado con éxito")
    }

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="mb-8 border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <FileSpreadsheet className="text-[#D4E655]" size={24} />
                        <span className="text-[#D4E655] font-bold text-[10px] tracking-[0.3em] uppercase">Panel de Pagos</span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1">
                        Liquidaciones
                    </h1>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                    {vistaActiva !== 'ranking' && (
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-3.5 text-gray-500" size={16} />
                            <input type="text" placeholder={vistaActiva === 'docentes' ? "Buscar profesor..." : vistaActiva === 'clases' ? "Buscar clase o profe..." : "Buscar concepto..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-10 text-white text-sm outline-none focus:border-[#D4E655] transition-colors" />
                        </div>
                    )}
                    <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setExpandedProf(null); setExpandedClase(null); }} className="w-full sm:w-auto bg-[#111] border border-[#D4E655]/30 rounded-xl p-3 text-white text-sm font-bold uppercase outline-none focus:border-[#D4E655] appearance-none">
                        {opcionesMeses.map(mes => {
                            const [y, m] = mes.split('-')
                            const date = new Date(Number(y), Number(m) - 1, 15)
                            return <option key={mes} value={mes}>{format(date, "MMMM yyyy", { locale: es })}</option>
                        })}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-[#111] border border-white/5 p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">A Pagar este Mes</p>
                        <p className="text-3xl font-black text-[#D4E655]">${data?.totalGeneralPagar.toLocaleString()}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-[#D4E655]/10 flex items-center justify-center"><DollarSign className="text-[#D4E655]" /></div>
                </div>
                <div className="bg-[#111] border border-white/5 p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Recaudado Bruto</p>
                        <p className="text-3xl font-black text-white">${data?.totalGeneralRecaudado.toLocaleString()}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center"><Wallet className="text-gray-400" /></div>
                </div>
            </div>

            <div className="flex gap-4 border-b border-white/10 mb-6 pb-4 overflow-x-auto custom-scrollbar">
                <button
                    onClick={() => setVistaActiva('docentes')}
                    className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all whitespace-nowrap ${vistaActiva === 'docentes' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white bg-[#111]'}`}
                >
                    <Users size={16} /> Por Docente
                </button>
                <button
                    onClick={() => setVistaActiva('clases')}
                    className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all whitespace-nowrap ${vistaActiva === 'clases' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white bg-[#111]'}`}
                >
                    <Library size={16} /> Por Clase
                </button>
                <button
                    onClick={() => setVistaActiva('ranking')}
                    className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all whitespace-nowrap ${vistaActiva === 'ranking' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white bg-[#111]'}`}
                >
                    <Trophy size={16} /> Ranking
                </button>
                <button
                    onClick={() => setVistaActiva('virtual')}
                    className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all whitespace-nowrap ${vistaActiva === 'virtual' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white bg-[#111]'}`}
                >
                    <Smartphone size={16} /> Ingresos Virtuales
                </button>
            </div>

            <div className="space-y-4">
                {/* VISTA 1: AGRUPADO POR DOCENTES */}
                {vistaActiva === 'docentes' && (
                    filtradosProfes.length === 0 ? (
                        <div className="text-center py-20 bg-[#111]/50 rounded-3xl border border-dashed border-white/10">
                            <Users className="mx-auto mb-3 text-gray-600" size={32} />
                            <p className="text-sm font-bold uppercase text-gray-500">No hay liquidaciones</p>
                            <p className="text-xs text-gray-600">No se encontraron profesores para el mes seleccionado.</p>
                        </div>
                    ) : (
                        filtradosProfes.map((profe) => {
                            const isOpen = expandedProf === profe.id

                            const clasesAgrupadas = profe.clases.reduce((acc: Record<string, ClaseLiquidacion[]>, clase) => {
                                const key = clase.nombre
                                if (!acc[key]) acc[key] = []
                                acc[key].push(clase)
                                return acc
                            }, {})

                            return (
                                <div key={profe.id} className={`bg-[#09090b] border ${isOpen ? 'border-[#D4E655]/30' : 'border-white/10'} rounded-2xl overflow-hidden transition-all duration-300`}>
                                    <button onClick={() => setExpandedProf(isOpen ? null : profe.id)} className="w-full p-5 flex flex-col md:flex-row justify-between items-start md:items-center bg-[#111]/50 hover:bg-[#111] transition-colors text-left gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white font-black text-lg border border-white/10">{profe.nombre[0]}</div>
                                            <div>
                                                <h3 className="text-lg font-black text-white uppercase">{profe.nombre}</h3>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{profe.clases.length} clases dictadas</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 w-full md:w-auto border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
                                            <div className="text-left md:text-right">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">A Liquidar</p>
                                                <p className={`text-xl font-black ${isOpen ? 'text-[#D4E655]' : 'text-white'}`}>${profe.total_pago.toLocaleString()}</p>
                                            </div>
                                            {isOpen ? <ChevronUp className="text-gray-500 shrink-0 hidden md:block" /> : <ChevronDown className="text-gray-500 shrink-0 hidden md:block" />}
                                        </div>
                                    </button>

                                    <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                        <div className="p-4 md:p-6 border-t border-white/5 bg-[#09090b]">
                                            {Object.entries(clasesAgrupadas).map(([nombreGrupo, clasesList], index) => (
                                                <div key={index} className="mb-8 last:mb-0">
                                                    <h4 className="text-white font-black uppercase tracking-widest border-b border-white/10 pb-2 mb-4 text-sm flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-[#D4E655]"></span>
                                                        {nombreGrupo}
                                                    </h4>

                                                    <div className="hidden md:block overflow-x-auto bg-[#111] rounded-xl border border-white/5">
                                                        <table className="w-full text-left border-collapse table-fixed">
                                                            <thead>
                                                                <tr className="text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10 bg-white/5">
                                                                    <th className="py-3 pl-4 w-[20%]">Fecha</th>
                                                                    <th className="py-3 text-center w-[15%]">Acuerdo</th>
                                                                    <th className="py-3 text-center w-[15%]">Inscriptos</th>
                                                                    <th className="py-3 text-right w-[15%]">Recaudado</th>
                                                                    <th className="py-3 text-right text-[#D4E655] w-[15%]">A Pagar</th>
                                                                    <th className="py-3 text-center w-[20%] pr-4">Estado</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-white/5 text-xs">
                                                                {clasesList.map((clase) => {
                                                                    const [fechaParte, horaParte] = clase.inicio.split('T')
                                                                    const [a, m, d] = fechaParte.split('-')
                                                                    const hora = horaParte ? horaParte.substring(0, 5) : '--:--'

                                                                    return (
                                                                        <tr key={clase.id} className="hover:bg-white/5 transition-colors group">
                                                                            <td className="py-3 pl-4 text-white font-bold">{d}/{m} <span className="text-gray-500 ml-1">{hora}</span></td>
                                                                            <td className="py-3 text-center text-gray-500 font-bold">{clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : `$${clase.valor_acuerdo}`}</td>
                                                                            <td className="py-3 text-center">
                                                                                <button
                                                                                    onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/${m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
                                                                                    className="bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors px-3 py-1 rounded flex items-center justify-center gap-1.5 w-fit mx-auto cursor-pointer"
                                                                                    title="Ver lista de inscriptos"
                                                                                >
                                                                                    <Users size={12} /> {clase.cant_alumnos}
                                                                                </button>
                                                                            </td>
                                                                            <td className="py-3 text-right text-gray-400">${clase.total_clase.toLocaleString()}</td>
                                                                            <td className="py-3 text-right font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</td>
                                                                            <td className="py-3 text-center pr-4">
                                                                                {clase.pagado_profe ? (
                                                                                    <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-1 rounded text-[9px] font-black flex items-center justify-center gap-1 mx-auto cursor-not-allowed w-full max-w-[100px]">
                                                                                        <CheckCircle2 size={12} /> OK
                                                                                    </span>
                                                                                ) : (
                                                                                    <button onClick={() => setModalPago({ isOpen: true, clase, nombreProfe: profe.nombre })} className="bg-[#D4E655]/10 hover:bg-[#D4E655] text-[#D4E655] hover:text-black border border-[#D4E655]/30 px-3 py-1 rounded text-[9px] font-black transition-colors mx-auto block w-full max-w-[100px]">
                                                                                        PAGAR
                                                                                    </button>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    )
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="md:hidden space-y-2">
                                                        {clasesList.map((clase) => {
                                                            const [fechaParte, horaParte] = clase.inicio.split('T')
                                                            const [a, m, d] = fechaParte.split('-')
                                                            const hora = horaParte ? horaParte.substring(0, 5) : '--:--'

                                                            return (
                                                                <div key={clase.id} className="bg-[#111] p-3 rounded-xl border border-white/5">
                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="bg-white/5 p-1.5 rounded"><Calendar size={14} className="text-gray-400" /></div>
                                                                            <p className="text-white font-bold text-sm">{d}/{m} <span className="text-gray-500 text-xs">- {hora}hs</span></p>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/${m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
                                                                            className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                                                                        >
                                                                            <Users size={10} /> {clase.cant_alumnos} pax
                                                                        </button>
                                                                    </div>
                                                                    <div className="flex justify-between items-end pt-2 border-t border-white/5 mt-2">
                                                                        <div>
                                                                            <p className="text-[8px] text-gray-500 uppercase font-bold">Acuerdo: {clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : `Fijo`}</p>
                                                                            <p className="text-[9px] text-gray-400 mt-0.5">Recaudado: ${clase.total_clase.toLocaleString()}</p>
                                                                        </div>
                                                                        <div className="text-right flex flex-col items-end gap-2">
                                                                            <div>
                                                                                <p className="text-[8px] text-[#D4E655]/70 uppercase font-bold">A Pagar</p>
                                                                                <p className="text-sm font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</p>
                                                                            </div>
                                                                            {clase.pagado_profe ? (
                                                                                <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded text-[8px] font-black flex items-center justify-center gap-1 cursor-not-allowed">
                                                                                    <CheckCircle2 size={10} /> PAGADO
                                                                                </span>
                                                                            ) : (
                                                                                <button onClick={() => setModalPago({ isOpen: true, clase, nombreProfe: profe.nombre })} className="bg-[#D4E655]/10 hover:bg-[#D4E655] text-[#D4E655] hover:text-black border border-[#D4E655]/30 px-3 py-1 rounded text-[9px] font-black transition-colors">
                                                                                    PAGAR
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )
                )}

                {/* VISTA 2: AGRUPADO POR CLASES */}
                {vistaActiva === 'clases' && (
                    filtradosClases.length === 0 ? (
                        <div className="text-center py-20 bg-[#111]/50 rounded-3xl border border-dashed border-white/10">
                            <Library className="mx-auto mb-3 text-gray-600" size={32} />
                            <p className="text-sm font-bold uppercase text-gray-500">No hay grupos de clase</p>
                            <p className="text-xs text-gray-600">No se encontraron clases para el mes seleccionado.</p>
                        </div>
                    ) : (
                        filtradosClases.map((grupo, idx) => {
                            const isOpen = expandedClase === grupo.nombre_grupo + grupo.profesor_nombre

                            return (
                                <div key={idx} className={`bg-[#09090b] border ${isOpen ? 'border-blue-500/30' : 'border-white/10'} rounded-2xl overflow-hidden transition-all duration-300`}>
                                    <button onClick={() => setExpandedClase(isOpen ? null : grupo.nombre_grupo + grupo.profesor_nombre)} className="w-full p-5 flex flex-col md:flex-row justify-between items-start md:items-center bg-[#111]/50 hover:bg-[#111] transition-colors text-left gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-black text-lg border border-blue-500/20">
                                                <Library size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-white uppercase">{grupo.nombre_grupo}</h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                                    Profe: <span className="text-gray-300">{grupo.profesor_nombre}</span> • {grupo.clases.length} clases
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 w-full md:w-auto border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
                                            <div className="text-left md:text-right hidden sm:block">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Inscriptos</p>
                                                <p className={`text-sm font-black text-white`}>{grupo.cant_alumnos_total} Alumnos</p>
                                            </div>
                                            <div className="text-left md:text-right">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Deuda Activa</p>
                                                <p className={`text-xl font-black ${isOpen ? 'text-[#D4E655]' : 'text-white'}`}>${grupo.total_pago.toLocaleString()}</p>
                                            </div>
                                            {isOpen ? <ChevronUp className="text-gray-500 shrink-0 hidden md:block" /> : <ChevronDown className="text-gray-500 shrink-0 hidden md:block" />}
                                        </div>
                                    </button>

                                    <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                        <div className="p-4 md:p-6 border-t border-white/5 bg-[#09090b]">
                                            <div className="hidden md:block overflow-x-auto bg-[#111] rounded-xl border border-white/5">
                                                <table className="w-full text-left border-collapse table-fixed">
                                                    <thead>
                                                        <tr className="text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10 bg-white/5">
                                                            <th className="py-3 pl-4 w-[20%]">Fecha</th>
                                                            <th className="py-3 text-center w-[15%]">Acuerdo</th>
                                                            <th className="py-3 text-center w-[15%]">Inscriptos</th>
                                                            <th className="py-3 text-right w-[15%]">Recaudado</th>
                                                            <th className="py-3 text-right text-[#D4E655] w-[15%]">A Pagar</th>
                                                            <th className="py-3 text-center w-[20%] pr-4">Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/5 text-xs">
                                                        {grupo.clases.map((clase) => {
                                                            const [fechaParte, horaParte] = clase.inicio.split('T')
                                                            const [a, m, d] = fechaParte.split('-')
                                                            const hora = horaParte ? horaParte.substring(0, 5) : '--:--'

                                                            return (
                                                                <tr key={clase.id} className="hover:bg-white/5 transition-colors group">
                                                                    <td className="py-3 pl-4 text-white font-bold">{d}/{m} <span className="text-gray-500 ml-1">{hora}</span></td>
                                                                    <td className="py-3 text-center text-gray-500 font-bold">{clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : `$${clase.valor_acuerdo}`}</td>
                                                                    <td className="py-3 text-center">
                                                                        <button
                                                                            onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/${m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
                                                                            className="bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors px-3 py-1 rounded flex items-center justify-center gap-1.5 w-fit mx-auto cursor-pointer"
                                                                            title="Ver lista de inscriptos"
                                                                        >
                                                                            <Users size={12} /> {clase.cant_alumnos}
                                                                        </button>
                                                                    </td>
                                                                    <td className="py-3 text-right text-gray-400">${clase.total_clase.toLocaleString()}</td>
                                                                    <td className="py-3 text-right font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</td>
                                                                    <td className="py-3 text-center pr-4">
                                                                        {clase.pagado_profe ? (
                                                                            <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-1 rounded text-[9px] font-black flex items-center justify-center gap-1 mx-auto cursor-not-allowed w-full max-w-[100px]">
                                                                                <CheckCircle2 size={12} /> OK
                                                                            </span>
                                                                        ) : (
                                                                            <button onClick={() => setModalPago({ isOpen: true, clase, nombreProfe: grupo.profesor_nombre })} className="bg-[#D4E655]/10 hover:bg-[#D4E655] text-[#D4E655] hover:text-black border border-[#D4E655]/30 px-3 py-1 rounded text-[9px] font-black transition-colors mx-auto block w-full max-w-[100px]">
                                                                                PAGAR
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            <div className="md:hidden space-y-2">
                                                {grupo.clases.map((clase) => {
                                                    const [fechaParte, horaParte] = clase.inicio.split('T')
                                                    const [a, m, d] = fechaParte.split('-')
                                                    const hora = horaParte ? horaParte.substring(0, 5) : '--:--'

                                                    return (
                                                        <div key={clase.id} className="bg-[#111] p-3 rounded-xl border border-white/5">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="bg-white/5 p-1.5 rounded"><Calendar size={14} className="text-gray-400" /></div>
                                                                    <p className="text-white font-bold text-sm">{d}/{m} <span className="text-gray-500 text-xs">- {hora}hs</span></p>
                                                                </div>
                                                                <button
                                                                    onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/${m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
                                                                    className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                                                                >
                                                                    <Users size={10} /> {clase.cant_alumnos} pax
                                                                </button>
                                                            </div>
                                                            <div className="flex justify-between items-end pt-2 border-t border-white/5 mt-2">
                                                                <div>
                                                                    <p className="text-[8px] text-gray-500 uppercase font-bold">Acuerdo: {clase.tipo_acuerdo === 'porcentaje' ? `${clase.valor_acuerdo}%` : `Fijo`}</p>
                                                                    <p className="text-[9px] text-gray-400 mt-0.5">Recaudado: ${clase.total_clase.toLocaleString()}</p>
                                                                </div>
                                                                <div className="text-right flex flex-col items-end gap-2">
                                                                    <div>
                                                                        <p className="text-[8px] text-[#D4E655]/70 uppercase font-bold">A Pagar</p>
                                                                        <p className="text-sm font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</p>
                                                                    </div>
                                                                    {clase.pagado_profe ? (
                                                                        <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded text-[8px] font-black flex items-center justify-center gap-1 cursor-not-allowed">
                                                                            <CheckCircle2 size={10} /> PAGADO
                                                                        </span>
                                                                    ) : (
                                                                        <button onClick={() => setModalPago({ isOpen: true, clase, nombreProfe: grupo.profesor_nombre })} className="bg-[#D4E655]/10 hover:bg-[#D4E655] text-[#D4E655] hover:text-black border border-[#D4E655]/30 px-3 py-1 rounded text-[9px] font-black transition-colors">
                                                                            PAGAR
                                                                        </button>
                                                                    )}
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
                    )
                )}

                {/* 🚀 VISTA 4: RANKING DE CLASES */}
                {vistaActiva === 'ranking' && (
                    <div className="animate-in fade-in">
                        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 mb-6 bg-[#09090b] border border-white/10 p-4 rounded-2xl">

                            <div className="flex bg-[#111] p-1 rounded-xl w-full lg:w-auto overflow-x-auto custom-scrollbar">
                                <button onClick={() => setRankingCategoria('regular')} className={`flex-1 md:flex-none md:px-6 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingCategoria === 'regular' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white'}`}>Regulares</button>
                                <button onClick={() => setRankingCategoria('especial')} className={`flex-1 md:flex-none md:px-6 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingCategoria === 'especial' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:text-white'}`}>Especiales</button>
                                <button onClick={() => setRankingCategoria('grupo')} className={`flex-1 md:flex-none md:px-6 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingCategoria === 'grupo' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-white'}`}>Grupos</button>
                            </div>

                            <div className="flex items-center gap-2 bg-[#111] p-1 rounded-xl w-full lg:w-auto shrink-0 overflow-x-auto custom-scrollbar">
                                <span className="text-[10px] font-bold text-gray-500 uppercase px-2 shrink-0">Ordenar por:</span>
                                <button onClick={() => setRankingOrden('alumnos')} className={`flex-1 md:flex-none px-4 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingOrden === 'alumnos' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-white'}`}>Alumnos</button>
                                <button onClick={() => setRankingOrden('recaudacion')} className={`flex-1 md:flex-none px-4 py-3 md:py-2 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${rankingOrden === 'recaudacion' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-white'}`}>Recaudación</button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {clasesRankeadas.length === 0 ? (
                                <div className="text-center py-16 bg-[#111]/50 rounded-2xl border border-dashed border-white/10">
                                    <Trophy className="mx-auto mb-3 text-gray-600" size={32} />
                                    <p className="text-xs font-bold uppercase text-gray-500">No hay clases en esta categoría</p>
                                </div>
                            ) : (
                                clasesRankeadas.map((c: any, idx: number) => (
                                    <div key={c.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-5 rounded-2xl border transition-all ${c.cant_alumnos <= 5 ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-[#111] border-white/5 hover:border-white/20'}`}>

                                        <div className="flex items-center gap-4 mb-4 sm:mb-0">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-gray-300 text-black' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/10 text-gray-400'}`}>
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white uppercase text-sm">{c.nombre}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase"><User size={10} className="inline mr-1" />{c.profesor_nombre}</span>
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase"><Calendar size={10} className="inline mr-1" />{format(new Date(c.inicio), "dd/MM")}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6 sm:text-right border-t sm:border-t-0 border-white/5 pt-4 sm:pt-0">
                                            <div className="flex-1 sm:flex-none">
                                                <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Alumnos</p>
                                                <p className={`text-xl font-black ${c.cant_alumnos <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                                                    {c.cant_alumnos}
                                                </p>
                                            </div>
                                            <div className="flex-1 sm:flex-none">
                                                <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Recaudado</p>
                                                <p className="text-xl font-black text-[#D4E655]">
                                                    ${c.total_recaudado.toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* VISTA 3: REPORTE DE TRANSACCIONES VIRTUALES CON PDF */}
                {vistaActiva === 'virtual' && (
                    <div className="bg-[#09090b] border border-white/10 rounded-2xl overflow-hidden shadow-xl animate-in fade-in">
                        <div className="p-6 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                                    <Smartphone className="text-[#D4E655]" />
                                    Detalle de Ingresos Virtuales
                                </h3>
                                <p className="text-xs text-gray-400 mt-1 font-medium">Transferencias y Mercado Pago reportados en este periodo</p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <button
                                    onClick={exportarPDF}
                                    className="bg-white/10 hover:bg-[#D4E655] hover:text-black text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border border-white/10 w-full sm:w-auto"
                                >
                                    <Download size={14} /> Bajar Reporte PDF
                                </button>
                                <div className="bg-[#111] px-4 py-2 rounded-xl border border-white/5 text-right w-full sm:w-auto">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Total Periodo</p>
                                    <p className="text-xl font-black text-[#D4E655]">${totalVirtual.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        {filtradosVirtuales.length === 0 ? (
                            <div className="text-center py-20 bg-[#111]/50">
                                <Wallet className="mx-auto mb-3 text-gray-600" size={32} />
                                <p className="text-sm font-bold uppercase text-gray-500">No hay movimientos</p>
                                <p className="text-xs text-gray-600">No se registraron transacciones virtuales para tu búsqueda.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10 bg-[#111]">
                                            <th className="py-4 pl-6">Fecha / Hora</th>
                                            <th className="py-4">Concepto del Ingreso</th>
                                            <th className="py-4">Método de Pago</th>
                                            <th className="py-4 pr-6 text-right">Monto Registrado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-sm">
                                        {filtradosVirtuales.map((mov) => {
                                            const fechaMov = new Date(mov.created_at)
                                            return (
                                                <tr key={mov.id} className="hover:bg-white/5 transition-colors group">
                                                    <td className="py-4 pl-6 text-gray-400 text-xs font-medium">
                                                        {format(fechaMov, "dd/MM/yyyy", { locale: es })}
                                                        <span className="opacity-50 ml-2">{format(fechaMov, "HH:mm")}</span>
                                                    </td>
                                                    <td className="py-4 text-white font-bold capitalize">
                                                        {mov.concepto}
                                                    </td>
                                                    <td className="py-4">
                                                        <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider ${mov.metodo_pago.includes('mercadopago') || mov.metodo_pago === 'mp' || mov.metodo_pago === 'online'
                                                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                                            }`}>
                                                            {mov.metodo_pago === 'mp' ? 'MercadoPago' : mov.metodo_pago.replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 pr-6 text-right font-black text-white flex items-center justify-end gap-1.5">
                                                        <ArrowDownRight size={14} className="text-[#D4E655]" />
                                                        ${mov.monto.toLocaleString()}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* MODAL FLOTANTE DE ALUMNOS INSCRIPTOS */}
            {modalAlumnos.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setModalAlumnos({ isOpen: false, claseNombre: '', fecha: '', alumnos: [] })}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setModalAlumnos({ isOpen: false, claseNombre: '', fecha: '', alumnos: [] })} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>

                        <div className="mb-4 pr-6">
                            <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                                <Users className="text-[#D4E655]" size={20} />
                                Alumnos Inscriptos
                            </h3>
                            <p className="text-xs text-gray-400 mt-1 font-medium">{modalAlumnos.claseNombre} • {modalAlumnos.fecha}</p>
                        </div>

                        <div className="bg-[#111] rounded-xl border border-white/5 overflow-y-auto custom-scrollbar flex-1 p-2">
                            {modalAlumnos.alumnos.length > 0 ? (
                                <ul className="divide-y divide-white/5">
                                    {modalAlumnos.alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre)).map((alumno, idx) => (
                                        <li key={idx} className={`py-3 px-3 text-xs font-bold uppercase tracking-wide flex items-center gap-3 ${alumno.presente ? 'text-gray-300' : 'text-gray-600'}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${alumno.presente ? 'bg-[#D4E655]' : 'bg-red-500'}`} />
                                            {alumno.nombre}
                                            {!alumno.presente && (
                                                <span className="text-[9px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded border border-red-500/20 ml-auto">Ausente</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-500 text-center py-6 font-bold uppercase">Nadie se inscribió a esta clase</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE PAGO FLOTANTE */}
            {modalPago.isOpen && modalPago.clase && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => !procesandoPago && setModalPago({ isOpen: false, clase: null, nombreProfe: '' })}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => !procesandoPago && setModalPago({ isOpen: false, clase: null, nombreProfe: '' })} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>

                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-[#D4E655]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#D4E655]/30">
                                <DollarSign className="text-[#D4E655]" size={24} />
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Pagar a Profe</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium">Vas a registrar el pago de <strong className="text-white">{modalPago.clase.nombre}</strong> a <strong className="text-white">{modalPago.nombreProfe}</strong>.</p>
                            <p className="text-3xl font-black text-[#D4E655] mt-4">${modalPago.clase.pago_profe.toLocaleString()}</p>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest text-center">¿Cómo le pagaste?</p>
                            <button onClick={() => handleProcesarPago('efectivo')} disabled={procesandoPago} className="w-full bg-[#111] hover:bg-white/10 border border-white/10 text-white font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : '💵 Aboné en Efectivo'}
                            </button>
                            <button onClick={() => handleProcesarPago('transferencia')} disabled={procesandoPago} className="w-full bg-[#D4E655] hover:bg-white text-black font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : '📱 Hice Transferencia'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}