'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, useMemo } from 'react'
import useSWR from 'swr'
import { format, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Wallet, Search, Loader2, ChevronDown, ChevronUp, Users, Calendar, DollarSign, Lock, FileSpreadsheet, CheckCircle2, X, Library, Smartphone, ArrowDownRight, Download, Trophy, User, Clock, Save } from 'lucide-react'
import { useCash } from '@/context/CashContext'
import Link from 'next/link'
import { toast, Toaster } from 'sonner'
import { pagarClaseProfeAction, guardarValorHoraRecepAction, pagarStaffAction } from '@/app/actions/liquidaciones'

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
    alumnos_lista: { nombre: string; presente: boolean; metodo: string; pack_nombre: string; es_invitado: boolean }[]
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

type GrupoRaw = {
    id: string
    nombre: string
    totalRecaudado: number
    cantClases: number
    yaLiquidado: boolean
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

    const { data: configData } = await supabase
        .from('configuraciones')
        .select('valor')
        .eq('clave', 'valor_hora_recepcion')
        .maybeSingle();
    const valorHoraConfig = configData && configData.valor ? Number(configData.valor) : 2500;

    const { data: clasesData, error } = await supabase
        .from('clases')
        .select(`
            id, nombre, inicio, tipo_clase, tipo_acuerdo, valor_acuerdo, estado, pagado_profe, compania_id, liga_nivel,
            profesor:profiles!profesor_id(id, nombre_completo),
            inscripciones ( 
                valor_credito, 
                presente, 
                nombre_invitado,
                metodo_pago,
                modalidad,
                user:profiles(nombre_completo),
                pack:alumno_packs(
                    metodo_pago,
                    producto:productos(nombre)
                ) 
            )
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

    const { data: pagosStaffData } = await supabase
        .from('caja_movimientos')
        .select('concepto, monto')
        .eq('tipo', 'egreso')
        .ilike('concepto', `%Pago Staff | ID:% | Mes: ${mesKey}%`);

    const pagosStaffPorId: Record<string, number> = {};
    if (pagosStaffData) {
        pagosStaffData.forEach((pago: any) => {
            const match = pago.concepto?.match(/ID: ([a-zA-Z0-9-]+) /);
            if (match && match[1]) {
                const uid = match[1];
                pagosStaffPorId[uid] = (pagosStaffPorId[uid] || 0) + Number(pago.monto);
            }
        });
    }

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

            let total_bruto = 0;
            let total_neto = 0;

            inscripcionesArreglo.forEach((insc: any) => {
                const valorInscripcion = Number(insc.valor_credito) || 0;
                total_bruto += valorInscripcion;

                const infoPack = Array.isArray(insc.pack) ? insc.pack[0] : insc.pack;
                const metodo = (infoPack?.metodo_pago || insc.metodo_pago || 'efectivo').toLowerCase();

                if (metodo !== 'efectivo') {
                    total_neto += valorInscripcion * 0.9;
                } else {
                    total_neto += valorInscripcion;
                }
            })

            const alumnos_lista = inscripcionesArreglo.map((i: any) => {
                const nombreUsuario = Array.isArray(i.user) ? i.user[0]?.nombre_completo : i.user?.nombre_completo;
                const nombreFinal = nombreUsuario || i.nombre_invitado || 'Alumno Desconocido';

                const esInvitado = i.modalidad?.toLowerCase() === 'invitado';

                const tipoClaseStr = (clase.tipo_clase || '').toLowerCase();
                const esGrupo = tipoClaseStr === 'liga' || tipoClaseStr.includes('compa') || tipoClaseStr.includes('formacion') || !!clase.compania_id || !!clase.liga_nivel;

                const infoPack = Array.isArray(i.pack) ? i.pack[0] : i.pack;
                const nombreProducto = infoPack?.producto?.nombre;

                let packNombre = 'Crédito';

                if (!esGrupo) {
                    packNombre = nombreProducto ? nombreProducto : 'Clase Suelta';
                }

                const metodo = (infoPack?.metodo_pago || i.metodo_pago || 'Efectivo');

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
                pago_profe = total_neto * ((Number(clase.valor_acuerdo) || 0) / 100)
            }

            liquidacionesPorProfe[profId].clases.push({
                id: clase.id,
                nombre: clase.nombre,
                inicio: clase.inicio,
                tipo_acuerdo: clase.tipo_acuerdo,
                valor_acuerdo: clase.valor_acuerdo,
                cant_alumnos,
                total_clase: total_bruto,
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

            liquidacionesPorProfe[profId].total_recaudado += total_bruto
            totalGeneralRecaudado += total_bruto

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
                categoria = 'regular';
            }

            rankingClases.push({
                id: clase.id,
                nombre: clase.nombre,
                inicio: clase.inicio,
                profesor_nombre: profNombre,
                cant_alumnos,
                total_recaudado: total_bruto,
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

    const yearNum = Number(yyyy);
    const monthNum = Number(mm);
    const inicioMesCalendario = new Date(yearNum, monthNum - 1, 1).toISOString();
    const finMesCalendario = new Date(yearNum, monthNum, 1).toISOString();

    const { data: turnosMes } = await supabase.from('caja_turnos')
        .select(`usuario_id, fecha_apertura, fecha_cierre, usuario:profiles(nombre_completo)`)
        .gte('fecha_apertura', inicioMesCalendario)
        .lt('fecha_apertura', finMesCalendario)
        .not('fecha_cierre', 'is', null)

    const horasPorRecepcionista: Record<string, { id: string, nombre: string, horas: number, cantidad_turnos: number, total_pagado: number }> = {}

    if (turnosMes) {
        turnosMes.forEach((turno: any) => {
            if (!turno.fecha_apertura || !turno.fecha_cierre) return;

            const apertura = new Date(turno.fecha_apertura).getTime();
            const cierre = new Date(turno.fecha_cierre).getTime();
            const diffHoras = (cierre - apertura) / (1000 * 60 * 60);
            const uid = turno.usuario_id;

            if (!horasPorRecepcionista[uid]) {
                const nombreUsuario = Array.isArray(turno.usuario) ? turno.usuario[0]?.nombre_completo : turno.usuario?.nombre_completo;
                horasPorRecepcionista[uid] = {
                    id: uid,
                    nombre: nombreUsuario || 'Staff Desconocido',
                    horas: 0,
                    cantidad_turnos: 0,
                    total_pagado: pagosStaffPorId[uid] || 0
                };
            }

            horasPorRecepcionista[uid].horas += diffHoras;
            horasPorRecepcionista[uid].cantidad_turnos += 1;
        })
    }
    const reporteRecepcion = Object.values(horasPorRecepcionista).sort((a: any, b: any) => b.horas - a.horas);

    return {
        profesores: arrayProfes,
        totalGeneralPagar,
        totalGeneralRecaudado,
        transaccionesVirtuales,
        totalVirtual,
        rankingClases,
        reporteRecepcion,
        valorHoraConfig
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

    const [vistaActiva, setVistaActiva] = useState<'docentes' | 'clases' | 'virtual' | 'ranking' | 'recepcion' | 'grupos'>('docentes')

    const [rankingCategoria, setRankingCategoria] = useState<'regular' | 'especial' | 'grupo'>('regular')
    const [rankingOrden, setRankingOrden] = useState<'alumnos' | 'recaudacion'>('alumnos')

    const [modalPago, setModalPago] = useState<{ isOpen: boolean; clase: ClaseLiquidacion | null; nombreProfe: string }>({ isOpen: false, clase: null, nombreProfe: '' })

    const [modalAlumnos, setModalAlumnos] = useState<{ isOpen: boolean; claseNombre: string; fecha: string; alumnos: { nombre: string, presente: boolean, metodo: string, pack_nombre: string, es_invitado: boolean }[] }>({ isOpen: false, claseNombre: '', fecha: '', alumnos: [] })

    const [modalPagoMasivo, setModalPagoMasivo] = useState<{ isOpen: boolean; clases: ClaseLiquidacion[]; nombreGrupo: string; nombreProfe: string; total: number }>({ isOpen: false, clases: [], nombreGrupo: '', nombreProfe: '', total: 0 })

    const [valorHoraRecep, setValorHoraRecep] = useState<number>(0)
    const [guardandoValor, setGuardandoValor] = useState(false)
    const [modalPagoStaff, setModalPagoStaff] = useState<{ isOpen: boolean; staff: any; monto: number }>({ isOpen: false, staff: null, monto: 0 })

    const [procesandoPago, setProcesandoPago] = useState(false)

    const [gruposRaw, setGruposRaw] = useState<GrupoRaw[]>([])
    const [loadingGrupos, setLoadingGrupos] = useState(false)
    const [costoDocTheShow, setCostoDocTheShow] = useState(40000)
    const [coordFijaLiga, setCoordFijaLiga] = useState(25000)
    const [valorClaseLiga, setValorClaseLiga] = useState(6000)
    const [pagandoGrupoId, setPagandoGrupoId] = useState<string | null>(null)
    const [modalLiqGrupo, setModalLiqGrupo] = useState<{ isOpen: boolean; grupo: GrupoRaw | null; montoPagar: number; destinatario: string }>({ isOpen: false, grupo: null, montoPagar: 0, destinatario: '' })

    const { data, isLoading, error, mutate } = useSWR(
        userRole && ['admin', 'recepcion'].includes(userRole) ? ['liquidaciones-global', selectedMonth] : null,
        fetchLiquidacionesGlobales,
        { revalidateOnFocus: false }
    )

    useEffect(() => {
        if (data && data.valorHoraConfig && valorHoraRecep === 0) {
            setValorHoraRecep(data.valorHoraConfig)
        }
    }, [data])

    useEffect(() => {
        if (vistaActiva !== 'grupos' || !userRole || !['admin', 'recepcion'].includes(userRole)) return

        setLoadingGrupos(true)
        const supabase = createClient()
        const [yyyy, mm] = selectedMonth.split('-')
        const mes = Number(mm)
        const anio = Number(yyyy)

        Promise.all([
            supabase.from('companias').select('id, nombre').order('nombre'),
            supabase.from('companias_pagos').select('compania_id, monto, metodo_pago').eq('mes', mes).eq('anio', anio),
            supabase.from('clases').select('compania_id')
                .not('compania_id', 'is', null)
                .gte('inicio', new Date(anio, mes - 1, 1).toISOString())
                .lte('inicio', new Date(anio, mes, 0, 23, 59, 59, 999).toISOString())
                .neq('estado', 'cancelada'),
            supabase.from('caja_movimientos').select('concepto')
                .eq('tipo', 'egreso')
                .ilike('concepto', `%Liquidación Grupo | ID: % | Mes: ${mes}-${anio}%`)
        ]).then(([{ data: companias }, { data: pagos }, { data: clasesMes }, { data: movLiquidadas }]) => {
            if (!companias) { setLoadingGrupos(false); return }

            const liquidadasIds = new Set<string>()
            movLiquidadas?.forEach((l: any) => {
                const match = l.concepto?.match(/ID: ([a-zA-Z0-9-]+) /)
                if (match?.[1]) liquidadasIds.add(match[1])
            })

            const result: GrupoRaw[] = companias.map((c: any) => ({
                id: c.id,
                nombre: c.nombre,
                totalRecaudado: pagos?.filter((p: any) => p.compania_id === c.id)
                    .reduce((acc: number, p: any) => {
                        const monto = Number(p.monto)
                        return acc + (p.metodo_pago === 'efectivo' ? monto : monto / 1.1)
                    }, 0) || 0,
                cantClases: clasesMes?.filter((cl: any) => cl.compania_id === c.id).length || 0,
                yaLiquidado: liquidadasIds.has(c.id)
            }))

            setGruposRaw(result.filter(g => g.totalRecaudado > 0 || g.cantClases > 0))
            setLoadingGrupos(false)
        }).catch(() => setLoadingGrupos(false))
    }, [vistaActiva, selectedMonth])

    const handlePagarGrupoAdmin = async (
        grupo: GrupoRaw, montoPagar: number, destinatario: string,
        metodo: 'efectivo' | 'transferencia'
    ) => {
        if (montoPagar <= 0) return
        setPagandoGrupoId(grupo.id)
        const supabase = createClient()
        const [yyyy, mm] = selectedMonth.split('-')
        const mesKeyStr = `${Number(mm)}-${Number(yyyy)}`
        const concepto = `Liquidación Grupo | ID: ${grupo.id} | Mes: ${mesKeyStr} | Destinatario: ${destinatario}`

        const { error } = await supabase.from('caja_movimientos').insert([{
            concepto, monto: montoPagar, tipo: 'egreso',
            metodo_pago: metodo, created_at: new Date().toISOString()
        }])

        if (error) {
            toast.error('Error: ' + error.message)
        } else {
            toast.success(`Liquidación de $${montoPagar.toLocaleString()} registrada en Caja.`)
            setGruposRaw(prev => prev.map(g => g.id === grupo.id ? { ...g, yaLiquidado: true } : g))
            setModalLiqGrupo({ isOpen: false, grupo: null, montoPagar: 0, destinatario: '' })
        }
        setPagandoGrupoId(null)
    }

    const handleGuardarValorHora = async () => {
        setGuardandoValor(true)
        const res = await guardarValorHoraRecepAction(valorHoraRecep)
        if (res.success) {
            toast.success('Valor por hora actualizado exitosamente.')
            mutate()
        } else {
            toast.error(res.error || 'Error al guardar el valor de la hora.')
        }
        setGuardandoValor(false)
    }

    const handleProcesarPagoStaff = async (metodo: 'efectivo' | 'transferencia') => {
        if (!modalPagoStaff.staff) return
        setProcesandoPago(true)

        const res = await pagarStaffAction(
            modalPagoStaff.staff.id,
            modalPagoStaff.staff.nombre,
            modalPagoStaff.monto,
            metodo,
            selectedMonth
        )

        if (res.success) {
            toast.success(`Pago de $${modalPagoStaff.monto.toLocaleString()} registrado al Staff.`)
            mutate()
            setModalPagoStaff({ isOpen: false, staff: null, monto: 0 })
        } else {
            toast.error(res.error || 'Asegurate de tener un Turno de Caja Abierto para poder registrar este pago.')
        }
        setProcesandoPago(false)
    }

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

    const handleProcesarPagoMasivo = async (metodo: 'efectivo' | 'transferencia') => {
        if (!modalPagoMasivo.clases.length) return
        setProcesandoPago(true)

        let successCount = 0
        for (const clase of modalPagoMasivo.clases) {
            const res = await pagarClaseProfeAction(
                clase.id,
                clase.pago_profe,
                metodo,
                clase.nombre,
                modalPagoMasivo.nombreProfe
            )
            if (res.success) successCount++
        }

        if (successCount === modalPagoMasivo.clases.length) {
            toast.success(`¡Excelente! Se liquidaron ${successCount} clases correctamente.`)
        } else {
            toast.warning(`Atención: Se liquidaron ${successCount} de ${modalPagoMasivo.clases.length} clases.`)
        }

        mutate()
        setModalPagoMasivo({ isOpen: false, clases: [], nombreGrupo: '', nombreProfe: '', total: 0 })
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
                    {vistaActiva !== 'ranking' && vistaActiva !== 'recepcion' && (
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-3.5 text-gray-500" size={16} />
                            <input type="text" placeholder={vistaActiva === 'docentes' ? "Buscar profesor..." : vistaActiva === 'clases' ? "Buscar clase o profe..." : vistaActiva === 'grupos' ? "Buscar grupo..." : "Buscar concepto..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-10 text-white text-sm outline-none focus:border-[#D4E655] transition-colors" />
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
                {userRole === 'admin' && (
                    <button
                        onClick={() => setVistaActiva('recepcion')}
                        className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all whitespace-nowrap ${vistaActiva === 'recepcion' ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white bg-[#111]'}`}
                    >
                        <Clock size={16} /> Staff / Recepción
                    </button>
                )}
                <button
                    onClick={() => setVistaActiva('grupos')}
                    className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all whitespace-nowrap ${vistaActiva === 'grupos' ? 'bg-emerald-500 text-black' : 'text-gray-500 hover:text-white bg-[#111]'}`}
                >
                    <Users size={16} /> Grupos
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
                                            {Object.entries(clasesAgrupadas).map(([nombreGrupo, clasesList], index) => {

                                                // 🔥 CALCULAMOS EL SUBTOTAL SOLO DE LO QUE FALTA PAGAR DE ESTE GRUPO
                                                const clasesPendientes = clasesList.filter(c => !c.pagado_profe)
                                                const subtotalPendiente = clasesPendientes.reduce((acc, c) => acc + c.pago_profe, 0)

                                                return (
                                                    <div key={index} className="mb-8 last:mb-0">
                                                        <h4 className="text-white font-black uppercase tracking-widest border-b border-white/10 pb-2 mb-4 text-sm flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-[#D4E655]"></span>
                                                            {nombreGrupo}
                                                        </h4>

                                                        {/* TABLA DE ESCRITORIO */}
                                                        <div className="hidden md:block overflow-hidden bg-[#111] rounded-xl border border-white/5">
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
                                                                                        onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/{m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
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

                                                            {/* 🔥 NUEVO FOOTER: SUBTOTAL Y BOTÓN DE PAGO MASIVO (ESCRITORIO) */}
                                                            {subtotalPendiente > 0 ? (
                                                                <div className="bg-[#1a1a15] p-4 flex justify-between items-center border-t border-[#D4E655]/20">
                                                                    <div>
                                                                        <p className="text-[10px] text-[#D4E655] uppercase font-bold tracking-widest mb-1">Subtotal Pendiente de este bloque</p>
                                                                        <p className="text-xl font-black text-white">${subtotalPendiente.toLocaleString()}</p>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setModalPagoMasivo({ isOpen: true, clases: clasesPendientes, nombreGrupo, nombreProfe: profe.nombre, total: subtotalPendiente })}
                                                                        className="bg-[#D4E655] hover:bg-white text-black px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(212,230,85,0.2)]"
                                                                    >
                                                                        Liquidar Bloque Completo
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="bg-white/5 p-4 text-center border-t border-white/5">
                                                                    <p className="text-xs text-gray-500 font-bold uppercase flex items-center justify-center gap-2">
                                                                        <CheckCircle2 size={14} className="text-green-500" />
                                                                        Todas las clases de este bloque están pagadas
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* VISTA MOBILE */}
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
                                                                                onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/{m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
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

                                                            {/* 🔥 NUEVO FOOTER: SUBTOTAL Y BOTÓN DE PAGO MASIVO (MOBILE) */}
                                                            {subtotalPendiente > 0 && (
                                                                <div className="bg-[#1a1a15] p-4 mt-4 rounded-xl border border-[#D4E655]/30">
                                                                    <p className="text-[10px] text-[#D4E655] uppercase font-bold tracking-widest text-center mb-1">Subtotal Pendiente</p>
                                                                    <p className="text-2xl font-black text-white text-center mb-3">${subtotalPendiente.toLocaleString()}</p>
                                                                    <button
                                                                        onClick={() => setModalPagoMasivo({ isOpen: true, clases: clasesPendientes, nombreGrupo, nombreProfe: profe.nombre, total: subtotalPendiente })}
                                                                        className="w-full bg-[#D4E655] hover:bg-white text-black py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                                                    >
                                                                        Liquidar Bloque
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
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
                                                                            onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/{m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
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
                                                                    onClick={() => setModalAlumnos({ isOpen: true, claseNombre: clase.nombre, fecha: `${d}/{m} - ${hora}hs`, alumnos: clase.alumnos_lista })}
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

                {/* 🚀 VISTA 5: RECEPCIÓN Y STAFF */}
                {vistaActiva === 'recepcion' && (
                    <div className="animate-in fade-in space-y-6">
                        <div className="bg-[#09090b] border border-white/10 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                                    <Clock className="text-[#D4E655]" />
                                    Liquidación de Staff
                                </h3>
                                <p className="text-xs text-gray-400 mt-1 font-medium">Horas calculadas según las aperturas y cierres de caja del mes.</p>
                            </div>
                            <div className="bg-[#111] border border-white/5 p-2 rounded-xl flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest sm:pl-2">Valor por Hora:</label>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <div className="relative flex-1 sm:flex-none">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                        <input
                                            type="number"
                                            value={valorHoraRecep}
                                            onChange={(e) => setValorHoraRecep(Number(e.target.value))}
                                            className="w-full sm:w-32 bg-black border border-white/10 rounded-lg py-2 pl-7 pr-3 text-white text-sm font-black outline-none focus:border-[#D4E655] transition-colors"
                                        />
                                    </div>
                                    <button
                                        onClick={handleGuardarValorHora}
                                        disabled={guardandoValor}
                                        className="bg-[#D4E655] hover:bg-white text-black p-2 rounded-lg transition-colors"
                                        title="Guardar valor para todo el staff"
                                    >
                                        {guardandoValor ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {data?.reporteRecepcion?.length === 0 ? (
                                <div className="col-span-full text-center py-12 bg-[#111]/50 rounded-2xl border border-dashed border-white/10">
                                    <p className="text-xs font-bold uppercase text-gray-500">No hay turnos registrados este mes</p>
                                </div>
                            ) : (
                                data?.reporteRecepcion?.map((recep: any) => {
                                    const aPagarTotal = recep.horas * valorHoraRecep;
                                    const saldoPendiente = Math.max(0, aPagarTotal - recep.total_pagado);

                                    return (
                                        <div key={recep.id} className="bg-[#111] border border-white/5 p-5 rounded-2xl hover:border-white/20 transition-all flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400 font-black shrink-0">
                                                        {recep.nombre[0]}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-white text-sm truncate">{recep.nombre}</h4>
                                                        <p className="text-[10px] text-gray-500 uppercase font-bold">{recep.cantidad_turnos} turnos ({recep.horas.toFixed(2)} hs)</p>
                                                    </div>
                                                </div>

                                                <div className="border-t border-white/5 pt-4 space-y-2 mb-4">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-gray-500 font-bold uppercase tracking-wider">Total Generado</span>
                                                        <span className="text-white font-black">${aPagarTotal.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-gray-500 font-bold uppercase tracking-wider">Ya Pagado</span>
                                                        <span className="text-gray-400 font-black">-${recep.total_pagado.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
                                                <div className="flex justify-between items-end">
                                                    <p className="text-[10px] text-[#D4E655]/70 uppercase font-bold tracking-widest">Saldo Pendiente</p>
                                                    <p className="text-2xl font-black text-[#D4E655]">${saldoPendiente.toLocaleString()}</p>
                                                </div>

                                                {saldoPendiente > 0 ? (
                                                    <button
                                                        onClick={() => setModalPagoStaff({ isOpen: true, staff: recep, monto: saldoPendiente })}
                                                        className="w-full bg-[#D4E655]/10 hover:bg-[#D4E655] text-[#D4E655] hover:text-black font-black uppercase py-2.5 rounded-xl transition-all text-[10px] tracking-widest border border-[#D4E655]/30"
                                                    >
                                                        Registrar Pago
                                                    </button>
                                                ) : (
                                                    <div className="w-full bg-green-500/10 border border-green-500/20 text-green-500 font-black uppercase py-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] tracking-widest cursor-not-allowed">
                                                        <CheckCircle2 size={14} /> Todo Pagado
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* VISTA 6: LIQUIDACIONES DE GRUPOS */}
                {vistaActiva === 'grupos' && (
                    <div className="animate-in fade-in space-y-4">
                        {loadingGrupos ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="animate-spin text-emerald-400 w-8 h-8" />
                            </div>
                        ) : gruposRaw.length === 0 ? (
                            <div className="text-center py-20 bg-[#111]/50 rounded-3xl border border-dashed border-white/10">
                                <Users className="mx-auto mb-3 text-gray-600" size={32} />
                                <p className="text-sm font-bold uppercase text-gray-500">Sin actividad en grupos</p>
                                <p className="text-xs text-gray-600">No hubo recaudación ni clases en grupos para este mes.</p>
                            </div>
                        ) : (
                            gruposRaw
                                .filter(g => g.nombre.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map(grupo => {
                                    const nombreLow = grupo.nombre.toLowerCase()
                                    let destinatario = 'Piso 2', montoPagar = 0, glosa = 'Sin regla definida.', tipo = 'general'

                                    if (nombreLow.includes('ballroom')) {
                                        destinatario = 'Evelyn Nowak'
                                        montoPagar = grupo.totalRecaudado * 0.60
                                        glosa = `60% del pozo (Valor Efectivo) de $${grupo.totalRecaudado.toLocaleString()} para Evelyn Nowak.`
                                        tipo = 'porcentaje'
                                    } else if (nombreLow.includes('c.i.a') || nombreLow.includes('cia')) {
                                        destinatario = 'Alexis Mirinda'
                                        montoPagar = grupo.totalRecaudado * 0.60
                                        glosa = `60% del pozo (Valor Efectivo) de $${grupo.totalRecaudado.toLocaleString()} para Alexis Mirinda.`
                                        tipo = 'porcentaje'
                                    } else if (nombreLow.includes('joven ballet')) {
                                        destinatario = 'Franco y Eugenia'
                                        montoPagar = grupo.totalRecaudado * 0.60
                                        glosa = `60% del pozo (Valor Efectivo) de $${grupo.totalRecaudado.toLocaleString()} para Franco y Eugenia.`
                                        tipo = 'porcentaje'
                                    } else if (nombreLow.includes('the show')) {
                                        const saldo = grupo.totalRecaudado - costoDocTheShow
                                        montoPagar = saldo > 0 ? saldo * 0.50 : 0
                                        destinatario = 'Chiara'
                                        glosa = `Pozo efectivo $${grupo.totalRecaudado.toLocaleString()} − Docentes $${costoDocTheShow.toLocaleString()} = $${Math.max(0, saldo).toLocaleString()} → 50% para Chiara.`
                                        tipo = 'the_show'
                                    } else if (nombreLow.includes('liga')) {
                                        const costoDoc = grupo.cantClases * valorClaseLiga
                                        montoPagar = costoDoc + coordFijaLiga
                                        destinatario = 'Coordinación + Docentes Liga'
                                        glosa = `${grupo.cantClases} clases × $${valorClaseLiga.toLocaleString()} + coord fija $${coordFijaLiga.toLocaleString()} = $${montoPagar.toLocaleString()}.`
                                        tipo = 'liga'
                                    }

                                    return (
                                        <div key={grupo.id} className={`bg-[#09090b] border ${grupo.yaLiquidado ? 'border-emerald-500/20' : 'border-white/10'} rounded-2xl p-5`}>
                                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex flex-wrap items-center gap-2 mb-3">
                                                        <h3 className="text-lg font-black text-white uppercase">{grupo.nombre}</h3>
                                                        {grupo.yaLiquidado && (
                                                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-black flex items-center gap-1">
                                                                <CheckCircle2 size={10} /> Liquidado
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3 text-xs">
                                                        <div>
                                                            <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Recaudado</p>
                                                            <p className="font-black text-white">${grupo.totalRecaudado.toLocaleString()}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Para</p>
                                                            <p className="font-black text-emerald-400">{destinatario}</p>
                                                        </div>
                                                        {tipo === 'liga' && (
                                                            <div>
                                                                <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Clases</p>
                                                                <p className="font-black text-white">{grupo.cantClases}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <p className="text-[10px] text-gray-500 leading-relaxed mb-3">{glosa}</p>

                                                    {tipo === 'the_show' && (
                                                        <div className="flex items-center gap-3 bg-[#111] p-2 rounded-lg border border-white/5 w-fit">
                                                            <label className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Costo Docentes:</label>
                                                            <span className="text-gray-500 text-xs">$</span>
                                                            <input type="number" value={costoDocTheShow} onChange={e => setCostoDocTheShow(Number(e.target.value))} className="bg-black border border-white/10 text-white rounded-lg px-2 py-1 font-black w-24 outline-none focus:border-emerald-500 text-xs" />
                                                        </div>
                                                    )}

                                                    {tipo === 'liga' && (
                                                        <div className="flex flex-wrap gap-3 bg-[#111] p-2 rounded-lg border border-white/5">
                                                            <div className="flex items-center gap-2">
                                                                <label className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Coord ($):</label>
                                                                <input type="number" value={coordFijaLiga} onChange={e => setCoordFijaLiga(Number(e.target.value))} className="bg-black border border-white/10 text-white rounded-lg px-2 py-1 font-black w-24 outline-none focus:border-emerald-500 text-xs" />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <label className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">$/Clase:</label>
                                                                <input type="number" value={valorClaseLiga} onChange={e => setValorClaseLiga(Number(e.target.value))} className="bg-black border border-white/10 text-white rounded-lg px-2 py-1 font-black w-20 outline-none focus:border-emerald-500 text-xs" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col items-start md:items-end gap-3 shrink-0 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                                                    <div className="md:text-right">
                                                        <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">A Pagar</p>
                                                        <p className="text-2xl font-black text-emerald-400">${montoPagar.toLocaleString()}</p>
                                                    </div>

                                                    {grupo.yaLiquidado ? (
                                                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-not-allowed">
                                                            <CheckCircle2 size={12} /> En Caja
                                                        </div>
                                                    ) : montoPagar > 0 ? (
                                                        <button
                                                            onClick={() => setModalLiqGrupo({ isOpen: true, grupo, montoPagar, destinatario })}
                                                            disabled={!!pagandoGrupoId}
                                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase py-2.5 px-5 rounded-xl text-[10px] tracking-widest transition-all flex items-center gap-2 shadow-lg"
                                                        >
                                                            <DollarSign size={14} /> Registrar Pago
                                                        </button>
                                                    ) : (
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase">Sin monto</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
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

                        {/* 🚀 LISTADO DE ALUMNOS CON LOS PACKS Y COLORES */}
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
                                                        {/* 🚀 ETIQUETA INVITADO (Ajustado por modalidad) */}
                                                        {alumno.es_invitado && (
                                                            <span className="text-[8px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">
                                                                INVITADO
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* 🚀 CARTELITO LLAMATIVO Y MÉTODO DE PAGO */}
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

            {/* 🔥 NUEVO MODAL DE PAGO A STAFF */}
            {modalPagoStaff.isOpen && modalPagoStaff.staff && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => !procesandoPago && setModalPagoStaff({ isOpen: false, staff: null, monto: 0 })}>
                    <div className="bg-[#09090b] border border-blue-500/20 w-full max-w-sm rounded-3xl p-6 shadow-[0_0_50px_rgba(59,130,246,0.1)] relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => !procesandoPago && setModalPagoStaff({ isOpen: false, staff: null, monto: 0 })} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>

                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                                <Clock className="text-blue-500" size={24} />
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Pagar a Staff</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium leading-relaxed">
                                Vas a registrar la liquidación de horas del mes para <strong className="text-white">{modalPagoStaff.staff.nombre}</strong>.
                            </p>

                            <div className="mt-4 p-3 bg-white/5 rounded-xl">
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Monto a Pagar</p>
                                <p className="text-3xl font-black text-[#D4E655] mt-1">${modalPagoStaff.monto.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest text-center">¿Cómo le pagaste?</p>
                            <button onClick={() => handleProcesarPagoStaff('efectivo')} disabled={procesandoPago} className="w-full bg-[#111] hover:bg-white/10 border border-white/10 text-white font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : '💵 Aboné en Efectivo'}
                            </button>
                            <button onClick={() => handleProcesarPagoStaff('transferencia')} disabled={procesandoPago} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : '📱 Hice Transferencia'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE PAGO MASIVO DE CLASES (POR BLOQUE) */}
            {modalPagoMasivo.isOpen && modalPagoMasivo.clases.length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => !procesandoPago && setModalPagoMasivo({ isOpen: false, clases: [], nombreGrupo: '', nombreProfe: '', total: 0 })}>
                    <div className="bg-[#09090b] border border-[#D4E655]/20 w-full max-w-sm rounded-3xl p-6 shadow-[0_0_50px_rgba(212,230,85,0.1)] relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => !procesandoPago && setModalPagoMasivo({ isOpen: false, clases: [], nombreGrupo: '', nombreProfe: '', total: 0 })} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>

                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-[#D4E655]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#D4E655]/30">
                                <DollarSign className="text-[#D4E655]" size={24} />
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Liquidar Bloque</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium leading-relaxed">
                                Vas a pagar todas las clases pendientes de <br />
                                <strong className="text-white">{modalPagoMasivo.nombreGrupo}</strong> dictadas por <strong className="text-white">{modalPagoMasivo.nombreProfe}</strong>.
                            </p>

                            <div className="mt-4 p-3 bg-white/5 rounded-xl">
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Total Acumulado ({modalPagoMasivo.clases.length} clases)</p>
                                <p className="text-3xl font-black text-[#D4E655] mt-1">${modalPagoMasivo.total.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest text-center">¿Cómo le pagaste?</p>
                            <button onClick={() => handleProcesarPagoMasivo('efectivo')} disabled={procesandoPago} className="w-full bg-[#111] hover:bg-white/10 border border-white/10 text-white font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : '💵 Aboné en Efectivo'}
                            </button>
                            <button onClick={() => handleProcesarPagoMasivo('transferencia')} disabled={procesandoPago} className="w-full bg-[#D4E655] hover:bg-white text-black font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : '📱 Hice Transferencia'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE PAGO INDIVIDUAL */}
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
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Pago Individual</h3>
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

            {/* MODAL: LIQUIDAR GRUPO */}
            {modalLiqGrupo.isOpen && modalLiqGrupo.grupo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => !pagandoGrupoId && setModalLiqGrupo({ isOpen: false, grupo: null, montoPagar: 0, destinatario: '' })}>
                    <div className="bg-[#09090b] border border-emerald-500/20 w-full max-w-sm rounded-3xl p-6 shadow-[0_0_50px_rgba(16,185,129,0.1)] relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => !pagandoGrupoId && setModalLiqGrupo({ isOpen: false, grupo: null, montoPagar: 0, destinatario: '' })} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                                <DollarSign className="text-emerald-500" size={24} />
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Liquidar Grupo</h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium leading-relaxed">
                                Pago de <strong className="text-white">{modalLiqGrupo.grupo.nombre}</strong> a{' '}
                                <strong className="text-emerald-400">{modalLiqGrupo.destinatario}</strong>.
                            </p>
                            <div className="mt-4 p-3 bg-white/5 rounded-xl">
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Monto a Pagar</p>
                                <p className="text-3xl font-black text-emerald-400 mt-1">${modalLiqGrupo.montoPagar.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest text-center">¿Cómo le pagaste?</p>
                            <button onClick={() => handlePagarGrupoAdmin(modalLiqGrupo.grupo!, modalLiqGrupo.montoPagar, modalLiqGrupo.destinatario, 'efectivo')} disabled={!!pagandoGrupoId} className="w-full bg-[#111] hover:bg-white/10 border border-white/10 text-white font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                {pagandoGrupoId ? <Loader2 size={16} className="animate-spin" /> : '💵 Aboné en Efectivo'}
                            </button>
                            <button onClick={() => handlePagarGrupoAdmin(modalLiqGrupo.grupo!, modalLiqGrupo.montoPagar, modalLiqGrupo.destinatario, 'transferencia')} disabled={!!pagandoGrupoId} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2">
                                {pagandoGrupoId ? <Loader2 size={16} className="animate-spin" /> : '📱 Hice Transferencia'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}