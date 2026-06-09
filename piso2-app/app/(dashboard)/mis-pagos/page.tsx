'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { format, isSameMonth, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Wallet, Calendar, Loader2, ChevronDown, ChevronUp, CheckCircle, Clock, Users, X } from 'lucide-react'

type ClaseLiquidacion = {
    id: string
    nombre: string
    inicio: string
    tipo_acuerdo: 'porcentaje' | 'fijo'
    valor_acuerdo: number
    estado: string
    total_clase: number
    pago_profe: number
    cant_alumnos: number
    alumnos_lista: { nombre: string; presente: boolean; metodo: string; pack_nombre: string; es_invitado: boolean }[]
}

type MesAgrupado = {
    mesKey: string
    nombreMes: string
    esActual: boolean
    clases: ClaseLiquidacion[]
    total_recaudado_mes: number
    total_profe_mes: number
}

// 🚀 FETCHER EXTERNO CON SWR
const fetchLiquidaciones = async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) throw new Error("No autenticado")

    const { data: profile } = await supabase.from('profiles').select('nombre').eq('id', user.id).single()
    const userName = profile?.nombre || ''

    // 🚀 CONSULTA DEFINITIVA: Usamos los nombres reales de las tablas para el JOIN anidado
    const { data: clasesData, error } = await supabase
        .from('clases')
        .select(`
            id, nombre, inicio, tipo_acuerdo, valor_acuerdo, estado, tipo_clase, compania_id, liga_nivel,
            inscripciones ( 
                valor_credito, 
                presente,
                nombre_invitado,
                metodo_pago,
                modalidad,
                pack_usado_id,
                user:profiles(nombre_completo),
                alumno_packs (
                    id,
                    metodo_pago,
                    producto_id,
                    productos (
                        id,
                        nombre
                    )
                ) 
            )
        `)
        .eq('profesor_id', user.id)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: false })

    if (error) {
        console.error("🚨 Error de Supabase:", error);
        throw error;
    }

    const agrupados: Record<string, MesAgrupado> = {}
    const hoy = new Date()

    const allowedMonths = [
        format(subMonths(hoy, 2), 'yyyy-MM'),
        format(subMonths(hoy, 1), 'yyyy-MM'),
        format(hoy, 'yyyy-MM'),
        format(addMonths(hoy, 1), 'yyyy-MM')
    ]

    if (clasesData) {
        clasesData.forEach((clase: any) => {
            if (!clase.inicio) return

            const soloFecha = clase.inicio.split('T')[0]
            const fechaClase = new Date(`${soloFecha}T12:00:00`)
            const mesKey = format(fechaClase, 'yyyy-MM')

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

            const inscripcionesArreglo = Array.isArray(clase.inscripciones) ? clase.inscripciones : []

            const cant_alumnos = inscripcionesArreglo.filter((i: any) => i.presente).length

            let total_bruto = 0;
            let total_neto = 0;

            inscripcionesArreglo.forEach((insc: any) => {
                const valorInscripcion = Number(insc.valor_credito) || 0;
                total_bruto += valorInscripcion;

                const rawPack = insc.alumno_packs;
                const infoPack = Array.isArray(rawPack) ? rawPack[0] : rawPack;
                const metodo = (infoPack?.metodo_pago || insc.metodo_pago || 'efectivo').toLowerCase();
                const esInvitado = insc.modalidad?.toLowerCase() === 'invitado';

                if (metodo !== 'efectivo' && !esInvitado) {
                    total_neto += valorInscripcion * 0.9;
                } else {
                    total_neto += valorInscripcion;
                }
            })

            // 🚀 MAPEO "TODOTERRENO": Extrae el nombre venga como venga
            const alumnos_lista = inscripcionesArreglo.map((i: any) => {
                const nombreUsuario = Array.isArray(i.user) ? i.user[0]?.nombre_completo : i.user?.nombre_completo;
                const nombreFinal = nombreUsuario || i.nombre_invitado || 'Alumno Desconocido';

                const modalidadClean = (i.modalidad || '').toLowerCase();
                const esInvitado = modalidadClean === 'invitado';
                const esCredito = modalidadClean === 'credito' || modalidadClean === 'crédito';

                const tipoClaseStr = (clase.tipo_clase || '').toLowerCase();
                const esGrupo = tipoClaseStr === 'liga' || tipoClaseStr.includes('compa') || tipoClaseStr.includes('formacion') || !!clase.compania_id || !!clase.liga_nivel;

                // 1. Atrapamos el pack
                const rawPack = i.alumno_packs || i.pack || i.pack_usado;
                const packObj = Array.isArray(rawPack) ? rawPack[0] : rawPack;

                // 2. Atrapamos el producto
                const rawProd = packObj?.productos || packObj?.producto;
                const prodObj = Array.isArray(rawProd) ? rawProd[0] : rawProd;

                // 3. Extraemos el nombre
                const nombreProducto = prodObj?.nombre;

                let packNombre = 'Crédito';

                if (esGrupo) {
                    packNombre = 'Crédito';
                } else if (esCredito) {
                    if (nombreProducto) {
                        packNombre = nombreProducto; // 🚀 ACÁ SE MUESTRA "Pack 4 clases regulares"
                    } else if (i.pack_usado_id || packObj) {
                        packNombre = 'Pase / Pack';
                    } else {
                        packNombre = 'Crédito';
                    }
                } else if (esInvitado) {
                    packNombre = 'Invitado';
                } else {
                    packNombre = 'Clase Suelta';
                }

                const metodo = esInvitado ? 'Invitado' : (packObj?.metodo_pago || i.metodo_pago || 'Efectivo');

                return {
                    nombre: nombreFinal,
                    presente: i.presente,
                    metodo,
                    pack_nombre: packNombre,
                    es_invitado: esInvitado
                };
            })

            let pago_profe = 0
            if (clase.tipo_acuerdo === 'fijo') {
                pago_profe = Number(clase.valor_acuerdo) || 0
            } else {
                const porcentaje = (Number(clase.valor_acuerdo) || 0) / 100
                pago_profe = total_neto * porcentaje
            }

            const claseProcesada: ClaseLiquidacion = {
                ...clase,
                inicio: clase.inicio,
                total_clase: total_bruto,
                pago_profe,
                cant_alumnos,
                alumnos_lista
            }

            agrupados[mesKey].clases.push(claseProcesada)
            agrupados[mesKey].total_recaudado_mes += total_bruto
            agrupados[mesKey].total_profe_mes += pago_profe
        })
    }

    const listaMeses = Object.values(agrupados).sort((a, b) => b.mesKey.localeCompare(a.mesKey))
    return { meses: listaMeses, userName }
}

export default function MisPagosPage() {
    const [expandedMonth, setExpandedGroup] = useState<string | null>(null)
    const [modalAlumnos, setModalAlumnos] = useState<{ isOpen: boolean; claseNombre: string; fecha: string; alumnos: { nombre: string, presente: boolean, metodo: string, pack_nombre: string, es_invitado: boolean }[] }>({ isOpen: false, claseNombre: '', fecha: '', alumnos: [] })

    const { data, isLoading, error } = useSWR('liquidaciones-profe', fetchLiquidaciones, {
        revalidateOnFocus: false
    })

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
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in relative">

            <div className="mb-8 border-b border-white/10 pb-6">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1">
                    Mis Pagos
                </h1>
                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest">
                    Liquidaciones e Historial • {userName}
                </p>
            </div>

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

                                <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="p-4 md:p-6 border-t border-white/5 bg-[#09090b]">

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
                                                        const [fechaParte, horaParte] = clase.inicio.split('T');
                                                        const horaDisplay = horaParte ? horaParte.substring(0, 5) : '00:00';
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
                                                                    <button
                                                                        onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${fechaDisplay} - ${horaDisplay}hs`, alumnos: clase.alumnos_lista })}
                                                                        className="bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors px-3 py-1 rounded text-xs font-bold flex items-center justify-center gap-1.5 w-fit mx-auto cursor-pointer"
                                                                        title="Ver lista de inscriptos"
                                                                    >
                                                                        <Users size={12} /> {clase.cant_alumnos}
                                                                    </button>
                                                                </td>
                                                                <td className="py-4 text-right font-black text-[#D4E655]">${clase.pago_profe.toLocaleString()}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="md:hidden space-y-3">
                                            {mes.clases.map((clase) => {
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
                                                            <button
                                                                onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${fechaDisplay} - ${horaDisplay}hs`, alumnos: clase.alumnos_lista })}
                                                                className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors"
                                                            >
                                                                <Users size={10} /> {clase.cant_alumnos} pax
                                                            </button>
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

            {/* MODAL FLOTANTE DE ALUMNOS */}
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
                                        <li key={idx} className="py-4 px-3 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors rounded-lg border-b border-white/5 last:border-0">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${alumno.presente ? 'bg-[#D4E655]' : 'bg-red-500'}`} />
                                                <div className="flex flex-col">
                                                    <span className={`font-bold uppercase tracking-wide text-xs flex flex-wrap items-center gap-2 ${alumno.presente ? 'text-gray-200' : 'text-gray-500'}`}>
                                                        <span>{alumno.nombre} {!alumno.presente && '(Ausente)'}</span>
                                                        {alumno.es_invitado && (
                                                            <span className="text-[8px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">
                                                                INVITADO
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end shrink-0">
                                                <span className="bg-white/10 text-white font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-md mb-1 max-w-[120px] text-right truncate">
                                                    {alumno.pack_nombre}
                                                </span>
                                                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                                                    Pago: {alumno.metodo}
                                                </span>
                                            </div>
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
        </div>
    )
}