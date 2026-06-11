'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, useMemo, JSX } from 'react'
import useSWR from 'swr'
import { format, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Wallet, Search, Loader2, Users, DollarSign, Lock, FileSpreadsheet, Library, Smartphone, Trophy, Clock } from 'lucide-react'
import { useCash } from '@/context/CashContext'
import Link from 'next/link'
import { toast, Toaster } from 'sonner'
import { pagarClaseProfeAction, guardarValorHoraRecepAction, pagarStaffAction } from '@/app/actions/liquidaciones'

import type {
    ClaseLiquidacion, ProfeLiquidacion, GrupoClaseLiquidacion, GrupoRaw,
    TransaccionVirtual, ClaseRanking,
    ModalPagoState, ModalAlumnosState, ModalPagoMasivoState, ModalPagoStaffState, ModalLiqGrupoState
} from './_components/_types'

import TabDocentes from './_components/TabDocentes'
import TabClases from './_components/TabClases'
import TabRanking from './_components/TabRanking'
import TabVirtual from './_components/TabVirtual'
import TabRecepcion from './_components/TabRecepcion'
import TabGrupos from './_components/TabGrupos'
import ModalAlumnos from './_components/ModalAlumnos'
import ModalPago from './_components/ModalPago'
import ModalPagoMasivo from './_components/ModalPagoMasivo'
import ModalPagoStaff from './_components/ModalPagoStaff'
import ModalLiqGrupo from './_components/ModalLiqGrupo'

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
    const valorHoraConfig = configData?.valor ? Number(configData.valor) : 2500;

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
            if (match?.[1]) {
                pagosStaffPorId[match[1]] = (pagosStaffPorId[match[1]] || 0) + Number(pago.monto);
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
                liquidacionesPorProfe[profId] = { id: profId, nombre: profNombre, clases: [], total_pago: 0, total_recaudado: 0 }
            }

            const inscripcionesArreglo = Array.isArray(clase.inscripciones) ? clase.inscripciones : []
            const cant_alumnos = inscripcionesArreglo.length

            let total_bruto = 0
            let total_neto = 0

            inscripcionesArreglo.forEach((insc: any) => {
                const valorInscripcion = Number(insc.valor_credito) || 0;
                total_bruto += valorInscripcion;
                const metodo = (insc.metodo_pago || '').toLowerCase();
                const esPagoVirtual = ['transferencia', 'mercadopago', 'mp', 'online'].includes(metodo);
                total_neto += esPagoVirtual ? valorInscripcion * 0.9 : valorInscripcion;
            })

            const alumnos_lista = inscripcionesArreglo.map((i: any) => {
                const nombreUsuario = Array.isArray(i.user) ? i.user[0]?.nombre_completo : i.user?.nombre_completo;
                const nombreFinal = nombreUsuario || i.nombre_invitado || 'Alumno Desconocido';
                const esInvitado = i.modalidad?.toLowerCase() === 'invitado';
                const tipoClaseStr = (clase.tipo_clase || '').toLowerCase();
                const esGrupo = tipoClaseStr === 'liga' || tipoClaseStr.includes('compa') || tipoClaseStr.includes('formacion') || !!clase.compania_id || !!clase.liga_nivel;
                const infoPack = Array.isArray(i.pack) ? i.pack[0] : i.pack;
                const nombreProducto = infoPack?.producto?.nombre;
                const packNombre = esGrupo ? 'Crédito' : (nombreProducto || 'Clase Suelta');
                const metodo = infoPack?.metodo_pago || i.metodo_pago || 'Efectivo';
                return { nombre: nombreFinal, presente: i.presente, metodo, pack_nombre: packNombre, es_invitado: esInvitado };
            })

            let pago_profe = 0
            if (clase.tipo_acuerdo === 'fijo') {
                pago_profe = Number(clase.valor_acuerdo) || 0
            } else {
                pago_profe = total_neto * ((Number(clase.valor_acuerdo) || 0) / 100)
            }

            liquidacionesPorProfe[profId].clases.push({
                id: clase.id, nombre: clase.nombre, inicio: clase.inicio,
                tipo_acuerdo: clase.tipo_acuerdo, valor_acuerdo: clase.valor_acuerdo,
                cant_alumnos, total_clase: total_bruto, pago_profe,
                pagado_profe: clase.pagado_profe || false,
                profesor_nombre: profNombre, alumnos_lista
            })

            if (clase.pagado_profe) {
                // already paid — don't add to pending
            } else {
                liquidacionesPorProfe[profId].total_pago += pago_profe;
                totalGeneralPagar += pago_profe;
            }

            liquidacionesPorProfe[profId].total_recaudado += total_bruto
            totalGeneralRecaudado += total_bruto

            const tipoClaseStr = (clase.tipo_clase || '').toLowerCase();
            const perteneceAGrupo = tipoClaseStr === 'liga' || tipoClaseStr.includes('compa') || tipoClaseStr.includes('formacion') || !!clase.compania_id || !!clase.liga_nivel;
            const categoria: 'regular' | 'especial' | 'grupo' = perteneceAGrupo ? 'grupo' : (tipoClaseStr === 'especial' || tipoClaseStr === 'seminario') ? 'especial' : 'regular';

            rankingClases.push({ id: clase.id, nombre: clase.nombre, inicio: clase.inicio, profesor_nombre: profNombre, cant_alumnos, total_recaudado: total_bruto, categoria });
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
            if (`${anio}-${mes}` === mesKey && mov.tipo !== 'egreso' && Number(mov.monto) > 0) {
                transaccionesVirtuales.push({ id: mov.id, concepto: mov.concepto || 'Ingreso sin detalle', monto: Number(mov.monto), metodo_pago: mov.metodo_pago, created_at: mov.created_at })
                totalVirtual += Number(mov.monto)
            }
        })
    }

    if (pagosOnlineData) {
        pagosOnlineData.forEach((pago: any) => {
            if (!pago.created_at) return
            const [anio, mes] = pago.created_at.split('T')[0].split('-')
            if (`${anio}-${mes}` === mesKey) {
                transaccionesVirtuales.push({ id: pago.id, concepto: pago.concepto || 'Compra App (MercadoPago)', monto: Number(pago.monto), metodo_pago: 'mercadopago_online', created_at: pago.created_at })
                totalVirtual += Number(pago.monto)
            }
        })
    }

    transaccionesVirtuales.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const yearNum = Number(yyyy);
    const monthNum = Number(mm);
    const { data: turnosMes } = await supabase.from('caja_turnos')
        .select('usuario_id, fecha_apertura, fecha_cierre, usuario:profiles(nombre_completo)')
        .gte('fecha_apertura', new Date(yearNum, monthNum - 1, 1).toISOString())
        .lt('fecha_apertura', new Date(yearNum, monthNum, 1).toISOString())
        .not('fecha_cierre', 'is', null)

    const horasPorRecepcionista: Record<string, { id: string, nombre: string, horas: number, cantidad_turnos: number, total_pagado: number }> = {}

    if (turnosMes) {
        turnosMes.forEach((turno: any) => {
            if (!turno.fecha_apertura || !turno.fecha_cierre) return;
            const diffHoras = (new Date(turno.fecha_cierre).getTime() - new Date(turno.fecha_apertura).getTime()) / (1000 * 60 * 60);
            const uid = turno.usuario_id;
            if (!horasPorRecepcionista[uid]) {
                const nombre = Array.isArray(turno.usuario) ? turno.usuario[0]?.nombre_completo : turno.usuario?.nombre_completo;
                horasPorRecepcionista[uid] = { id: uid, nombre: nombre || 'Staff Desconocido', horas: 0, cantidad_turnos: 0, total_pagado: pagosStaffPorId[uid] || 0 };
            }
            horasPorRecepcionista[uid].horas += diffHoras;
            horasPorRecepcionista[uid].cantidad_turnos += 1;
        })
    }
    const reporteRecepcion = Object.values(horasPorRecepcionista).sort((a: any, b: any) => b.horas - a.horas);

    return { profesores: arrayProfes, totalGeneralPagar, totalGeneralRecaudado, transaccionesVirtuales, totalVirtual, rankingClases, reporteRecepcion, valorHoraConfig }
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

    const [modalPago, setModalPago] = useState<ModalPagoState>({ isOpen: false, clase: null, nombreProfe: '' })
    const [modalAlumnos, setModalAlumnos] = useState<ModalAlumnosState>({ isOpen: false, claseNombre: '', fecha: '', alumnos: [] })
    const [modalPagoMasivo, setModalPagoMasivo] = useState<ModalPagoMasivoState>({ isOpen: false, clases: [], nombreGrupo: '', nombreProfe: '', total: 0 })
    const [modalPagoStaff, setModalPagoStaff] = useState<ModalPagoStaffState>({ isOpen: false, staff: null, monto: 0 })
    const [modalLiqGrupo, setModalLiqGrupo] = useState<ModalLiqGrupoState>({ isOpen: false, grupo: null, montoPagar: 0, destinatario: '' })

    const [valorHoraRecep, setValorHoraRecep] = useState<number>(0)
    const [guardandoValor, setGuardandoValor] = useState(false)
    const [procesandoPago, setProcesandoPago] = useState(false)

    const [gruposRaw, setGruposRaw] = useState<GrupoRaw[]>([])
    const [loadingGrupos, setLoadingGrupos] = useState(false)
    const [costoDocTheShow, setCostoDocTheShow] = useState(40000)
    const [coordFijaLiga, setCoordFijaLiga] = useState(25000)
    const [valorClaseLiga, setValorClaseLiga] = useState(6000)
    const [pagandoGrupoId, setPagandoGrupoId] = useState<string | null>(null)

    const { data, isLoading, error, mutate } = useSWR(
        userRole && ['admin', 'recepcion'].includes(userRole) ? ['liquidaciones-global', selectedMonth] : null,
        fetchLiquidacionesGlobales,
        { revalidateOnFocus: false }
    )

    useEffect(() => {
        if (data?.valorHoraConfig && valorHoraRecep === 0) {
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

    const handlePagarGrupoAdmin = async (grupo: GrupoRaw, montoPagar: number, destinatario: string, metodo: 'efectivo' | 'transferencia') => {
        if (montoPagar <= 0) return
        setPagandoGrupoId(grupo.id)
        const supabase = createClient()
        const [yyyy, mm] = selectedMonth.split('-')
        const mesKeyStr = `${Number(mm)}-${Number(yyyy)}`
        const concepto = `Liquidación Grupo | ID: ${grupo.id} | Mes: ${mesKeyStr} | Destinatario: ${destinatario}`

        const { error } = await supabase.from('caja_movimientos').insert([{ concepto, monto: montoPagar, tipo: 'egreso', metodo_pago: metodo, created_at: new Date().toISOString() }])

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
        const res = await pagarStaffAction(modalPagoStaff.staff.id, modalPagoStaff.staff.nombre, modalPagoStaff.monto, metodo, selectedMonth)
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
        const res = await pagarClaseProfeAction(modalPago.clase.id, modalPago.clase.pago_profe, metodo, modalPago.clase.nombre, modalPago.nombreProfe)
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
            const res = await pagarClaseProfeAction(clase.id, clase.pago_profe, metodo, clase.nombre, modalPagoMasivo.nombreProfe)
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
                const key = `${clase.nombre.trim().toUpperCase()}-${clase.profesor_nombre}`
                if (!todosLosGrupos[key]) {
                    todosLosGrupos[key] = { nombre_grupo: clase.nombre, profesor_nombre: clase.profesor_nombre, clases: [], total_pago: 0, total_recaudado: 0, cant_alumnos_total: 0 }
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
        return rankingOrden === 'alumnos'
            ? filtradas.sort((a: any, b: any) => b.cant_alumnos - a.cant_alumnos)
            : filtradas.sort((a: any, b: any) => b.total_recaudado - a.total_recaudado);
    }, [data, rankingCategoria, rankingOrden]);

    if (loadingContext || isLoading) {
        return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>
    }

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

    if (error) {
        return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-red-500 font-bold uppercase">Error al cargar liquidaciones</div>
    }

    const profesores = data?.profesores || []
    const transaccionesVirtuales = data?.transaccionesVirtuales || []
    const totalVirtual = data?.totalVirtual || 0

    const filtradosProfes = profesores.filter(p => p.nombre.toLowerCase().includes(searchQuery.toLowerCase()))
    const filtradosClases = gruposDeClases.filter(g => g.nombre_grupo.toLowerCase().includes(searchQuery.toLowerCase()) || g.profesor_nombre.toLowerCase().includes(searchQuery.toLowerCase()))
    const filtradosVirtuales = transaccionesVirtuales.filter(t => t.concepto.toLowerCase().includes(searchQuery.toLowerCase()))

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* Header */}
            <div className="mb-8 border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <FileSpreadsheet className="text-[#D4E655]" size={24} />
                        <span className="text-[#D4E655] font-bold text-[10px] tracking-[0.3em] uppercase">Panel de Pagos</span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1">Liquidaciones</h1>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                    {vistaActiva !== 'ranking' && vistaActiva !== 'recepcion' && (
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-3.5 text-gray-500" size={16} />
                            <input
                                type="text"
                                placeholder={vistaActiva === 'docentes' ? "Buscar profesor..." : vistaActiva === 'clases' ? "Buscar clase o profe..." : vistaActiva === 'grupos' ? "Buscar grupo..." : "Buscar concepto..."}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#111] border border-white/10 rounded-xl p-3 pl-10 text-white text-sm outline-none focus:border-[#D4E655] transition-colors"
                            />
                        </div>
                    )}
                    <select
                        value={selectedMonth}
                        onChange={(e) => { setSelectedMonth(e.target.value); setExpandedProf(null); setExpandedClase(null); }}
                        className="w-full sm:w-auto bg-[#111] border border-[#D4E655]/30 rounded-xl p-3 text-white text-sm font-bold uppercase outline-none focus:border-[#D4E655] appearance-none"
                    >
                        {opcionesMeses.map(mes => {
                            const [y, m] = mes.split('-')
                            const date = new Date(Number(y), Number(m) - 1, 15)
                            return <option key={mes} value={mes}>{format(date, "MMMM yyyy", { locale: es })}</option>
                        })}
                    </select>
                </div>
            </div>

            {/* Stats */}
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

            {/* Tabs */}
            <div className="flex gap-4 border-b border-white/10 mb-6 pb-4 overflow-x-auto custom-scrollbar">
                {(['docentes', 'clases', 'ranking', 'virtual'] as const).map(vista => {
                    const labels: Record<string, { label: string; icon: JSX.Element }> = {
                        docentes: { label: 'Por Docente', icon: <Users size={16} /> },
                        clases: { label: 'Por Clase', icon: <Library size={16} /> },
                        ranking: { label: 'Ranking', icon: <Trophy size={16} /> },
                        virtual: { label: 'Ingresos Virtuales', icon: <Smartphone size={16} /> },
                    }
                    return (
                        <button
                            key={vista}
                            onClick={() => setVistaActiva(vista)}
                            className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all whitespace-nowrap ${vistaActiva === vista ? 'bg-[#D4E655] text-black' : 'text-gray-500 hover:text-white bg-[#111]'}`}
                        >
                            {labels[vista].icon} {labels[vista].label}
                        </button>
                    )
                })}
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

            {/* Tab content */}
            <div className="space-y-4">
                {vistaActiva === 'docentes' && (
                    <TabDocentes
                        filtradosProfes={filtradosProfes}
                        expandedProf={expandedProf}
                        setExpandedProf={setExpandedProf}
                        setModalPago={setModalPago}
                        setModalPagoMasivo={setModalPagoMasivo}
                        setModalAlumnos={setModalAlumnos}
                    />
                )}
                {vistaActiva === 'clases' && (
                    <TabClases
                        filtradosClases={filtradosClases}
                        expandedClase={expandedClase}
                        setExpandedClase={setExpandedClase}
                        setModalPago={setModalPago}
                        setModalAlumnos={setModalAlumnos}
                    />
                )}
                {vistaActiva === 'ranking' && (
                    <TabRanking
                        clasesRankeadas={clasesRankeadas}
                        rankingCategoria={rankingCategoria}
                        setRankingCategoria={setRankingCategoria}
                        rankingOrden={rankingOrden}
                        setRankingOrden={setRankingOrden}
                    />
                )}
                {vistaActiva === 'virtual' && (
                    <TabVirtual
                        filtradosVirtuales={filtradosVirtuales}
                        totalVirtual={totalVirtual}
                        selectedMonth={selectedMonth}
                    />
                )}
                {vistaActiva === 'recepcion' && (
                    <TabRecepcion
                        reporteRecepcion={data?.reporteRecepcion}
                        valorHoraRecep={valorHoraRecep}
                        setValorHoraRecep={setValorHoraRecep}
                        handleGuardarValorHora={handleGuardarValorHora}
                        guardandoValor={guardandoValor}
                        setModalPagoStaff={setModalPagoStaff}
                    />
                )}
                {vistaActiva === 'grupos' && (
                    <TabGrupos
                        gruposRaw={gruposRaw}
                        loadingGrupos={loadingGrupos}
                        searchQuery={searchQuery}
                        costoDocTheShow={costoDocTheShow}
                        setCostoDocTheShow={setCostoDocTheShow}
                        coordFijaLiga={coordFijaLiga}
                        setCoordFijaLiga={setCoordFijaLiga}
                        valorClaseLiga={valorClaseLiga}
                        setValorClaseLiga={setValorClaseLiga}
                        pagandoGrupoId={pagandoGrupoId}
                        setModalLiqGrupo={setModalLiqGrupo}
                    />
                )}
            </div>

            {/* Modals */}
            {modalAlumnos.isOpen && (
                <ModalAlumnos
                    modal={modalAlumnos}
                    onClose={() => setModalAlumnos({ isOpen: false, claseNombre: '', fecha: '', alumnos: [] })}
                />
            )}
            {modalPago.isOpen && modalPago.clase && (
                <ModalPago
                    modal={modalPago}
                    procesandoPago={procesandoPago}
                    onClose={() => setModalPago({ isOpen: false, clase: null, nombreProfe: '' })}
                    onPagar={handleProcesarPago}
                />
            )}
            {modalPagoMasivo.isOpen && modalPagoMasivo.clases.length > 0 && (
                <ModalPagoMasivo
                    modal={modalPagoMasivo}
                    procesandoPago={procesandoPago}
                    onClose={() => setModalPagoMasivo({ isOpen: false, clases: [], nombreGrupo: '', nombreProfe: '', total: 0 })}
                    onPagar={handleProcesarPagoMasivo}
                />
            )}
            {modalPagoStaff.isOpen && modalPagoStaff.staff && (
                <ModalPagoStaff
                    modal={modalPagoStaff}
                    procesandoPago={procesandoPago}
                    onClose={() => setModalPagoStaff({ isOpen: false, staff: null, monto: 0 })}
                    onPagar={handleProcesarPagoStaff}
                />
            )}
            {modalLiqGrupo.isOpen && modalLiqGrupo.grupo && (
                <ModalLiqGrupo
                    modal={modalLiqGrupo}
                    pagandoGrupoId={pagandoGrupoId}
                    onClose={() => setModalLiqGrupo({ isOpen: false, grupo: null, montoPagar: 0, destinatario: '' })}
                    onPagar={handlePagarGrupoAdmin}
                />
            )}
        </div>
    )
}
