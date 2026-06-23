'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Loader2, UsersRound, Shield, ArrowLeft,
    MessageSquare, Calendar, Users, Info,
    Clock, MapPin, User, ChevronRight, Image as ImageIcon,
    Send, BellRing, X, Percent, CheckCircle2, AlertCircle, Coins,
    CalendarDays, Activity, XCircle, FileText, Eye, CheckSquare,
    Phone, Search, Wallet, Pencil
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCash } from '@/context/CashContext'
import { inscribirPadronCompaniaAction, obtenerPreciosCompaniaAction, registrarPagoProfeCompaniaAction, getPlanesCompaniaAction, upsertPlanCompaniaAction, eliminarPlanCompaniaAction, asignarPlanMiembroAction, gestionarClasesCompaniaMiembroAction } from '@/app/actions/companias'
import { cobrarCompaniaAction } from '@/app/actions/usuarios'
import MaterialesPanel from '@/components/MaterialesPanel'

type PlanCompania = {
    id: string
    compania_id: string
    nombre: string
    tipo: 'full' | 'dias'
    dias_semana: number | null
    precio_transf: number
    precio_efvo: number
}

type Compania = {
    id: string
    nombre: string
    descripcion: string
    coordinador_id: string
    coordinador?: { nombre_completo: string }
}

type Estadisticas = {
    presentes: number
    ausentes: number
    justificadas: number
    saf: number
    medias_faltas: number
    total: number
}

type Miembro = {
    id: string
    nombre_completo: string
    email: string
    telefono?: string | null
    porcentaje_beca_compania?: number
    pago_compania_al_dia?: boolean
    totalAbonado?: number
    saldoPendiente?: number
    saldoPendienteEfectivo?: number
    precioFinal?: number
    precioEfectivo?: number
    estadisticas?: Estadisticas
    plan_id?: string | null
}

type ClaseCompania = {
    id: string
    nombre: string
    inicio: string
    fin: string
    imagen_url: string | null
    profesor: { fontProfe?: string; nombre_completo: string }
    sala: { nombre: string; sede: { nombre: string } }
}

export default function CompaniaDetallePage() {
    const params = useParams()
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    // 🚀 CONTEXTO GLOBAL
    const { userRole, userId, permisosCoordinador, isLoading: loadingContext } = useCash()

    const [compania, setCompania] = useState<Compania | null>(null)
    const [miembros, setMiembros] = useState<Miembro[]>([])
    const [clases, setClases] = useState<ClaseCompania[]>([])
    const [loading, setLoading] = useState(true)

    const [activeTab, setActiveTab] = useState<'muro' | 'clases' | 'miembros' | 'estadisticas'>('muro')

    // MAQUINA DEL TIEMPO
    const [mesDashboard, setMesDashboard] = useState(new Date().getMonth() + 1)
    const [anioDashboard, setAnioDashboard] = useState(new Date().getFullYear())

    // COSTOS DINÁMICOS PARA LA HERRAMIENTA DE LIQUIDACIÓN
    const [costoDocentesFijo, setCostoDocentesFijo] = useState(40000)
    const [coordinacionFijaLiga, setCoordinacionFijaLiga] = useState(25000)
    const [valorClaseDocenteLiga, setValorClaseDocenteLiga] = useState(6000)
    const [liquidacionPagada, setLiquidacionPagada] = useState(false)
    const [registrandoLiquidacion, setRegistrandoLiquidacion] = useState(false)

    const [notifMessage, setNotifMessage] = useState('')
    const [sendingNotif, setSendingNotif] = useState(false)

    const [isIndividualNotifOpen, setIsIndividualNotifOpen] = useState(false)
    const [selectedAlumno, setSelectedAlumno] = useState<Miembro | null>(null)
    const [individualMessage, setIndividualMessage] = useState('')

    const [isPagoModalOpen, setIsPagoModalOpen] = useState(false)
    const [alumnoPago, setAlumnoPago] = useState<Miembro | null>(null)
    const [montoPago, setMontoPago] = useState<number | ''>('')
    const [metodoPago, setMetodoPago] = useState('efectivo')
    const [pagoMes, setPagoMes] = useState(mesDashboard)
    const [pagoAnio, setPagoAnio] = useState(anioDashboard)
    const [registrandoPago, setRegistrandoPago] = useState(false)

    const [procesandoPago, setProcesandoPago] = useState(false)
    const [inscribiendoMasivo, setInscribiendoMasivo] = useState(false)

    // Planes del grupo
    const [planes, setPlanes] = useState<PlanCompania[]>([])
    const [modalPlan, setModalPlan] = useState<{ isOpen: boolean; plan: Partial<PlanCompania> | null }>({ isOpen: false, plan: null })
    const [guardandoPlan, setGuardandoPlan] = useState(false)
    const [asignandoPlanId, setAsignandoPlanId] = useState<string | null>(null)

    // Modal elegir clases (plan días)
    const [modalClasesMiembro, setModalClasesMiembro] = useState<{ miembro: Miembro; clasesSeleccionadas: Set<string> } | null>(null)
    const [guardandoClases, setGuardandoClases] = useState(false)

    // Pago profe por clase (The Show)
    const [pagoProfeModal, setPagoProfeModal] = useState<{ claseId: string; nombreClase: string; fecha: string } | null>(null)
    const [pagoProfesMonto, setPagoProfesMonto] = useState<number | ''>(0)
    const [pagoProfeMetodo, setPagoProfeMetodo] = useState('efectivo')
    const [registrandoPagoProfe, setRegistrandoPagoProfe] = useState(false)
    const [clasesPagoProfeRegistrado, setClasesPagoProfeRegistrado] = useState<Set<string>>(new Set())
    const [totalPagadoProfesTheShow, setTotalPagadoProfesTheShow] = useState(0)
    // Pagos de drop-ins (clase suelta) que NO están en el padrón pero se liquidan con el grupo
    const [totalDropIn, setTotalDropIn] = useState(0)
    const [searchAlumno, setSearchAlumno] = useState('')
    const [miembrosActuales, setMiembrosActuales] = useState<string[]>([])
    const [allAlumnos, setAllAlumnos] = useState<any[]>([])

    useEffect(() => {
        if (!loadingContext) {
            verificarAccesoYCargar()
        }
    }, [loadingContext, params.id, mesDashboard, anioDashboard])

    const verificarAccesoYCargar = async () => {
        setLoading(true)

        if (!userId) {
            router.replace('/login')
            return
        }

        const companiaId = params.id as string

        const { data: dataCompania, error } = await supabase
            .from('companias')
            .select('*, coordinador:profiles!coordinador_id(nombre_completo)')
            .eq('id', companiaId)
            .single()

        if (error || !dataCompania) {
            toast.error('El grupo no existe')
            router.replace('/companias')
            return
        }
        setCompania(dataCompania)

        const mesKeyStr = `${mesDashboard}-${anioDashboard}`;
        const { data: liqCheck } = await supabase
            .from('caja_movimientos')
            .select('id')
            .eq('tipo', 'egreso')
            .ilike('concepto', `%Liquidación Grupo | ID: ${companiaId} | Mes: ${mesKeyStr}%`)
            .maybeSingle();
        setLiquidacionPagada(!!liqCheck);

        const esAdminORecepOAuxiliar = ['admin', 'recepcion', 'auxiliar'].includes(userRole || '')
        const esProfeCoordinador = userRole === 'profesor' && dataCompania.coordinador_id === userId
        const esProfeComun = userRole === 'profesor' && dataCompania.coordinador_id !== userId
        const esCoordinadorConLlave = userRole === 'coordinador' && permisosCoordinador.includes(companiaId)

        let tienePermiso = esAdminORecepOAuxiliar || esProfeCoordinador || esProfeComun || esCoordinadorConLlave

        if (userRole === 'alumno') {
            const { data: esMiembro } = await supabase
                .from('perfiles_companias')
                .select('compania_id')
                .eq('compania_id', companiaId)
                .eq('perfil_id', userId)
                .maybeSingle()

            if (esMiembro) tienePermiso = true
        }

        if (!tienePermiso) {
            toast.error('Acceso denegado. No tenés permisos para este grupo.')
            router.replace('/companias')
            return
        }

        const mesActual = mesDashboard
        const anioActual = anioDashboard

        const primerDiaMes = new Date(anioActual, mesActual - 1, 1).toISOString()
        const ultimoDiaMes = new Date(anioActual, mesActual, 0, 23, 59, 59, 999).toISOString()

        const { data: dataClases } = await supabase
            .from('clases')
            .select(`
                id, nombre, inicio, fin, imagen_url,
                profesor:profiles!clases_profesor_id_fkey(nombre_completo),
                sala:salas(nombre, sede:sedes(nombre))
            `)
            .eq('compania_id', companiaId)
            .gte('inicio', primerDiaMes)
            .lte('inicio', ultimoDiaMes)
            .neq('estado', 'cancelada')
            .order('inicio', { ascending: true })

        let statsAsistencia: Record<string, Estadisticas> = {}

        if (dataClases && dataClases.length > 0) {
            const clasesUnicas: ClaseCompania[] = []
            const materiasVistas = new Set<string>()
            const ahoraMs = new Date().getTime()

            dataClases.forEach((c: any) => {
                const profNombre = Array.isArray(c.profesor) ? c.profesor[0]?.nombre_completo : c.profesor?.nombre_completo
                const salaData = Array.isArray(c.sala) ? c.sala[0] : c.sala
                const keyMateria = `${c.nombre}-${profNombre}-${c.inicio}`

                if (!materiasVistas.has(keyMateria)) {
                    materiasVistas.add(keyMateria)
                    clasesUnicas.push({
                        id: c.id,
                        nombre: c.nombre,
                        inicio: c.inicio,
                        fin: c.fin,
                        imagen_url: c.imagen_url,
                        profesor: { nombre_completo: profNombre || 'Staff' },
                        sala: salaData
                    })
                }
            })

            setClases(clasesUnicas)

            const clasesIdsPasadas = dataClases.filter((c: any) => new Date(c.inicio).getTime() <= ahoraMs).map((c: any) => c.id)

            if (clasesIdsPasadas.length > 0) {
                const { data: iDelMes } = await supabase
                    .from('inscripciones')
                    .select('user_id, estado_asistencia')
                    .in('clase_id', clasesIdsPasadas)

                if (iDelMes) {
                    iDelMes.forEach((insc: any) => {
                        if (!insc.user_id) return
                        if (!statsAsistencia[insc.user_id]) {
                            statsAsistencia[insc.user_id] = { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0 }
                        }

                        statsAsistencia[insc.user_id].total++
                        if (insc.estado_asistencia === 'presente') statsAsistencia[insc.user_id].presentes++
                        else if (insc.estado_asistencia === 'ausente') statsAsistencia[insc.user_id].ausentes++
                        else if (insc.estado_asistencia === 'justificada') statsAsistencia[insc.user_id].justificadas++
                        else if (insc.estado_asistencia === 'saf') statsAsistencia[insc.user_id].saf++
                        else if (insc.estado_asistencia === 'media_falta') statsAsistencia[insc.user_id].medias_faltas++
                    })
                }
            }
        } else {
            setClases([])
        }

        const [{ data: dataMiembros }, planesLoaded] = await Promise.all([
            supabase
                .from('perfiles_companias')
                .select('perfil_id, plan_id, perfil:profiles(id, nombre_completo, email, telefono, porcentaje_beca_compania)')
                .eq('compania_id', companiaId),
            getPlanesCompaniaAction(companiaId)
        ])
        setPlanes(planesLoaded as PlanCompania[])

        // Pagos a profes registrados en caja para The Show
        const { data: pagosProfesRegistrados } = await supabase
            .from('caja_movimientos')
            .select('concepto, monto')
            .eq('tipo', 'egreso')
            .eq('origen_referencia', 'pago_profe_compania')
            .ilike('concepto', `%Grupo: ${companiaId}%`)

        const clasesYaPagadas = new Set<string>()
        let totalProfes = 0
        pagosProfesRegistrados?.forEach((p: any) => {
            const match = p.concepto?.match(/Clase: ([a-zA-Z0-9-]+) /)
            if (match?.[1]) clasesYaPagadas.add(match[1])
            totalProfes += Number(p.monto)
        })
        setClasesPagoProfeRegistrado(clasesYaPagadas)
        setTotalPagadoProfesTheShow(totalProfes)

        const configData = await obtenerPreciosCompaniaAction(companiaId);

        let precioBase = 15000;
        let precioBaseTransf: number | null = null;
        let precioBaseEfvo: number | null = null;

        configData?.forEach((c: any) => {
            const valorLimpio = String(c.valor).replace(/\./g, '').trim();
            if (c.clave === `cuota_compania_${companiaId}`) precioBase = Number(valorLimpio);
            if (c.clave === `cuota_compania_${companiaId}_transf`) precioBaseTransf = Number(valorLimpio);
            if (c.clave === `cuota_compania_${companiaId}_efvo`) precioBaseEfvo = Number(valorLimpio);
        })

        const finalPrecioTransf = precioBaseTransf !== null ? precioBaseTransf : precioBase;
        const finalPrecioEfvo = precioBaseEfvo !== null ? precioBaseEfvo : precioBase;

        if (dataMiembros) {
            setMiembrosActuales(dataMiembros.map((m: any) => m.perfil_id));

            // Map plan_id por perfil
            const planPorPerfil: Record<string, string | null> = {}
            dataMiembros.forEach((m: any) => { planPorPerfil[m.perfil_id] = m.plan_id || null })

            let miembrosData = dataMiembros.map((m: any) => m.perfil).filter(Boolean)

            const { data: pagosCia } = await supabase
                .from('companias_pagos')
                .select('alumno_id, monto')
                .eq('compania_id', companiaId)
                .eq('mes', mesActual)
                .eq('anio', anioActual)

            const miembrosCompletos = miembrosData.map((m: any) => {
                const totalAbonado = pagosCia?.filter((p: { alumno_id: string; monto: number | string }) => p.alumno_id === m.id).reduce((acc: number, curr: { monto: number | string }) => acc + Number(curr.monto), 0) || 0
                const beca = m.porcentaje_beca_compania || 0

                const planId = planPorPerfil[m.id] || null
                const planMiembro = planesLoaded.find((p: any) => p.id === planId)
                const precioTransfBase = planMiembro ? planMiembro.precio_transf : finalPrecioTransf
                const precioEfvoBase = planMiembro ? planMiembro.precio_efvo : finalPrecioEfvo

                const precioFinal = precioTransfBase - (precioTransfBase * beca / 100)
                const precioEfectivo = precioEfvoBase - (precioEfvoBase * beca / 100)

                const saldoPendiente = Math.max(0, precioFinal - totalAbonado)
                const saldoPendienteEfectivo = Math.max(0, precioEfectivo - totalAbonado)

                const alDia = saldoPendiente <= 0 || saldoPendienteEfectivo <= 0

                return {
                    ...m,
                    plan_id: planId,
                    totalAbonado,
                    saldoPendiente,
                    saldoPendienteEfectivo,
                    precioFinal,
                    precioEfectivo,
                    pago_compania_al_dia: alDia,
                    estadisticas: statsAsistencia[m.id] || { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0 }
                }
            })

            miembrosCompletos.sort((a: any, b: any) => (a.nombre_completo || '').localeCompare(b.nombre_completo || ''))
            setMiembros(miembrosCompletos)

            // Drop-ins: pagos del mes cuyo alumno NO está en el padrón (clase suelta).
            // Se suman a valor pleno porque se liquidan junto con el grupo.
            const padronIds = new Set(dataMiembros.map((m: any) => m.perfil_id))
            const dropInTotal = (pagosCia || [])
                .filter((p: any) => !padronIds.has(p.alumno_id))
                .reduce((acc: number, p: any) => acc + Number(p.monto), 0)
            setTotalDropIn(dropInTotal)
        } else {
            setTotalDropIn(0)
        }

        if (['admin', 'recepcion'].includes(userRole || '')) {
            const { data: alumnos } = await supabase.from('profiles').select('id, nombre_completo, email, telefono').eq('rol', 'alumno').order('nombre_completo')
            if (alumnos) setAllAlumnos(alumnos)
        }

        setLoading(false)
    }

    const handleInscripcionMasiva = async () => {
        if (!compania) return;
        setInscribiendoMasivo(true);
        try {
            const res = await inscribirPadronCompaniaAction(compania.id, mesDashboard, anioDashboard);
            if (res.success) {
                toast.success(res.message || 'Padrón inscripto con éxito a las clases del mes.');
                verificarAccesoYCargar();
            } else {
                throw new Error(res.error);
            }
        } catch (error: any) {
            toast.error(error.message || 'Error al realizar la inscripción masiva.');
        } finally {
            setInscribiendoMasivo(false);
        }
    };

    const handleSendGlobalNotif = async (e: React.FormEvent) => {
        e.preventDefault()
        if (miembros.length === 0) return toast.error("El grupo no tiene integrantes aún.")

        setSendingNotif(true)
        try {
            const notifs = miembros.map(m => ({
                usuario_id: m.id,
                titulo: `Aviso: ${compania?.nombre}`,
                mensaje: notifMessage,
                link: `/companias/${compania?.id}`,
                leido: false
            }))

            const { error } = await supabase.from('notificaciones').insert(notifs)
            if (error) throw error

            toast.success("Aviso enviado a todos los integrantes")
            setNotifMessage('')
        } catch (error: any) {
            toast.error("Hubo un error al enviar el aviso.")
        } finally {
            setSendingNotif(false)
        }
    }

    const handleSendIndividualNotif = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedAlumno) return

        setSendingNotif(true)
        try {
            const notif = {
                usuario_id: selectedAlumno.id,
                titulo: `Aviso de Coordinación: ${compania?.nombre}`,
                mensaje: individualMessage,
                link: `/companias/${compania?.id}`,
                leido: false
            }

            const { error } = await supabase.from('notificaciones').insert([notif])
            if (error) throw error

            toast.success(`Aviso enviado a ${selectedAlumno.nombre_completo}`)
            setIsIndividualNotifOpen(false)
            setIndividualMessage('')
            setSelectedAlumno(null)
        } catch (error: any) {
            toast.error("Hubo un error al enviar el mensaje.")
        } finally {
            setSendingNotif(false)
        }
    }

    const openPagoModal = (alumno: Miembro) => {
        setAlumnoPago(alumno)
        setMetodoPago('efectivo')
        setMontoPago(alumno.saldoPendienteEfectivo || 0)
        setPagoMes(mesDashboard)
        setPagoAnio(anioDashboard)
        setIsPagoModalOpen(true)
    }

    const handleRegistrarPago = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!alumnoPago || !montoPago || Number(montoPago) <= 0 || !compania?.id) return

        setRegistrandoPago(true)

        try {
            const res = await cobrarCompaniaAction(
                alumnoPago.id,
                compania.id,
                Number(montoPago),
                metodoPago,
                pagoMes,
                pagoAnio
            );

            if (!res.success) {
                throw new Error(res.error);
            }

            toast.success('Pago y movimiento de caja registrados correctamente');
            setIsPagoModalOpen(false);
            verificarAccesoYCargar();
        } catch (err: any) {
            console.error("🕵️‍♂️ DETALLE DEL ERROR:", err)
            toast.error(`Error: ${err.message || 'Desconocido'}`)
        } finally {
            setRegistrandoPago(false)
        }
    }

    const generarLinkPagoCompania = async () => {
        setProcesandoPago(true)
        try {
            const mesActual = mesDashboard
            const anioActual = anioDashboard

            const miPerfilCalculado = miembros.find(m => m.id === userId)
            const saldoACobrar = miPerfilCalculado?.saldoPendiente || miPerfilCalculado?.precioFinal || 15000

            const res = await fetch('/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo: `Cuota/Saldo ${compania?.nombre} - Mes ${mesActual}/${anioActual}`,
                    precio: saldoACobrar,
                    userId: userId,
                    tipo_pago: 'cuota_compania',
                    productoId: compania?.id,
                    mes: mesActual,
                    anio: anioActual
                })
            })

            const resData = await res.json()
            if (resData.url) window.location.href = resData.url
            else throw new Error(resData.error || 'No se pudo generar el link')
        } catch (err) {
            toast.error('Error al conectar con Mercado Pago.')
        } finally {
            setProcesandoPago(false)
        }
    }

    const abrirModalClasesMiembro = async (miembro: Miembro) => {
        if (!compania) return
        const supabase = createClient()
        const clasesIds = clases.map(c => c.id)
        const { data: inscripciones } = await supabase
            .from('inscripciones')
            .select('clase_id')
            .eq('user_id', miembro.id)
            .in('clase_id', clasesIds)
        const seleccionadas = new Set<string>((inscripciones || []).map((i: any) => i.clase_id as string))
        setModalClasesMiembro({ miembro, clasesSeleccionadas: seleccionadas })
    }

    const handleGuardarClasesMiembro = async () => {
        if (!modalClasesMiembro || !compania) return
        setGuardandoClases(true)
        try {
            const res = await gestionarClasesCompaniaMiembroAction(
                modalClasesMiembro.miembro.id,
                compania.id,
                Array.from(modalClasesMiembro.clasesSeleccionadas),
                clases.map(c => c.id)
            )
            if (!res.success) throw new Error(res.error)
            toast.success('Clases actualizadas')
            setModalClasesMiembro(null)
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setGuardandoClases(false)
        }
    }

    const handleGuardarPlan = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!compania || !modalPlan.plan) return
        setGuardandoPlan(true)
        try {
            const p = modalPlan.plan
            const res = await upsertPlanCompaniaAction({
                id: p.id,
                compania_id: compania.id,
                nombre: p.nombre!,
                tipo: p.tipo!,
                dias_semana: p.tipo === 'dias' ? (p.dias_semana ?? null) : null,
                precio_transf: p.precio_transf ?? 0,
                precio_efvo: p.precio_efvo ?? 0
            })
            if (!res.success) throw new Error(res.error)
            toast.success(p.id ? 'Plan actualizado' : 'Plan creado')
            setModalPlan({ isOpen: false, plan: null })
            verificarAccesoYCargar()
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setGuardandoPlan(false)
        }
    }

    const handleEliminarPlan = async (planId: string) => {
        if (!compania || !confirm('¿Eliminar este plan? Los miembros asignados quedarán sin plan.')) return
        const res = await eliminarPlanCompaniaAction(planId, compania.id)
        if (res.success) { toast.success('Plan eliminado'); verificarAccesoYCargar() }
        else toast.error(res.error)
    }

    const handleAsignarPlan = async (miembroId: string, planId: string | null) => {
        if (!compania) return
        setAsignandoPlanId(miembroId)
        const res = await asignarPlanMiembroAction(miembroId, compania.id, planId)
        if (res.success) verificarAccesoYCargar()
        else toast.error(res.error)
        setAsignandoPlanId(null)
    }

    const handleRegistrarPagoProfe = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!pagoProfeModal || !pagoProfesMonto || Number(pagoProfesMonto) <= 0 || !compania) return
        setRegistrandoPagoProfe(true)
        try {
            const res = await registrarPagoProfeCompaniaAction(
                compania.id,
                pagoProfeModal.claseId,
                pagoProfeModal.nombreClase,
                pagoProfeModal.fecha,
                Number(pagoProfesMonto),
                pagoProfeMetodo
            )
            if (!res.success) throw new Error(res.error)
            toast.success('Pago a docentes registrado en caja')
            setPagoProfeModal(null)
            verificarAccesoYCargar()
        } catch (err: any) {
            toast.error(err.message || 'Error al registrar')
        } finally {
            setRegistrandoPagoProfe(false)
        }
    }

    const openIndividualModal = (alumno: Miembro) => {
        setSelectedAlumno(alumno)
        setIndividualMessage('')
        setIsIndividualNotifOpen(true)
    }

    // 🚀 FUNCIÓN ACCIÓN REGISTRAR EN CAJA DIRECTO
    const handlePagarLiquidacionGrupo = async (metodo: 'efectivo' | 'transferencia') => {
        if (!compania || detalleLiquidacion.montoPagar <= 0) return;
        setRegistrandoLiquidacion(true);

        try {
            const mesKeyStr = `${mesDashboard}-${anioDashboard}`;
            const conceptoStr = `Liquidación Grupo | ID: ${compania.id} | Mes: ${mesKeyStr} | Destinatario: ${detalleLiquidacion.destinatario}`;

            const { error: errorMov } = await supabase.from('caja_movimientos').insert([{
                concepto: conceptoStr,
                monto: detalleLiquidacion.montoPagar,
                tipo: 'egreso',
                metodo_pago: metodo,
                created_at: new Date().toISOString()
            }]);

            if (errorMov) throw errorMov;

            toast.success(`Liquidación de $${detalleLiquidacion.montoPagar.toLocaleString()} registrada de forma exitosa en Caja.`);
            setLiquidacionPagada(true);
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar movimiento de caja');
        } finally {
            setRegistrandoLiquidacion(false);
        }
    };

    if (loading || loadingContext) {
        return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>
    }

    if (!compania) return null

    // 🚀 DECLARACIÓN DE VARIABLES EN ORDEN SECUENCIAL CORRECTO 🚀
    const isStaff = ['admin', 'recepcion', 'auxiliar'].includes(userRole || '') ||
        (userRole === 'profesor' && compania.coordinador_id === userId) ||
        (userRole === 'coordinador' && permisosCoordinador.includes(compania.id))

    const canSeeFinance = ['admin', 'recepcion'].includes(userRole || '')

    const miPerfilInfo = miembros.find(m => m.id === userId)
    const deboCompania = !miPerfilInfo?.pago_compania_al_dia && userRole === 'alumno'
    const esProyectoStaff = compania.nombre.toLowerCase().trim() === 'proyecto staff'

    // 🚀 LÓGICA DE REGLAS DE NEGOCIO Y POZO FINANCIERO DEL MES (SIEMPRE VALOR EFECTIVO)
    const totalRecaudadoReal = miembros.reduce((acc, m) => acc + (m.totalAbonado || 0), 0) + totalDropIn;

    const totalRecaudadoValorEfectivo = miembros.reduce((acc, m) => {
        const abonado = m.totalAbonado || 0;
        const precioEfectivo = m.precioEfectivo || 0;
        // Solo ingresa al Pozo el equivalente al valor efectivo de la cuota
        return acc + Math.min(abonado, precioEfectivo);
    }, 0) + totalDropIn; // Las clases sueltas (drop-in) se suman a valor pleno

    const nombreCiaLower = compania.nombre.toLowerCase();

    let detalleLiquidacion = {
        destinatario: 'Piso 2',
        montoPagar: 0,
        glosa: 'Cálculo general por defecto sin parámetros especiales asignados.',
        tipo: 'general'
    };

    if (nombreCiaLower.includes('ballroom')) {
        detalleLiquidacion = {
            destinatario: 'Evelyn Nowak',
            montoPagar: totalRecaudadoValorEfectivo * 0.60,
            glosa: 'El 60% del pozo acumulado (calculado al Valor Efectivo) en el mes se abona a Evelyn Nowak, quien gestiona el pago interno de docentes.',
            tipo: 'porcentaje'
        };
    } else if (nombreCiaLower.includes('c.i.a') || nombreCiaLower.includes('cia')) {
        detalleLiquidacion = {
            destinatario: 'Alexis Mirinda',
            montoPagar: totalRecaudadoValorEfectivo * 0.60,
            glosa: 'El 60% del pozo acumulado (calculado al Valor Efectivo) en el mes se abona a Alexis Mirinda, quien gestiona el pago interno de docentes.',
            tipo: 'porcentaje'
        };
    } else if (nombreCiaLower.includes('joven ballet')) {
        detalleLiquidacion = {
            destinatario: 'Franco y Eugenia',
            montoPagar: totalRecaudadoValorEfectivo * 0.60,
            glosa: 'El 60% del pozo acumulado (calculado al Valor Efectivo) en el mes se abona a Franco y Eugenia, quienes gestionan el pago interno de docentes.',
            tipo: 'porcentaje'
        };
    } else if (nombreCiaLower.includes('the show')) {
        const saldo = totalRecaudadoValorEfectivo - totalPagadoProfesTheShow;
        const pagoChiara = saldo > 0 ? saldo * 0.50 : 0;
        detalleLiquidacion = {
            destinatario: 'Chiara',
            montoPagar: pagoChiara,
            glosa: `Se restan los pagos a docentes ya registrados ($${totalPagadoProfesTheShow.toLocaleString()}) al pozo de Valor Efectivo ($${totalRecaudadoValorEfectivo.toLocaleString()}). Del remanente de $${saldo.toLocaleString()}, se abona el 50% a Chiara.`,
            tipo: 'the_show'
        };
    } else if (nombreCiaLower.includes('liga')) {
        const totalClasesDictadas = clases.length;
        const costoDocentesLiga = totalClasesDictadas * valorClaseDocenteLiga;
        const totalGastosLiga = costoDocentesLiga + coordinacionFijaLiga;
        const saldoPiso2 = totalRecaudadoValorEfectivo - totalGastosLiga;
        detalleLiquidacion = {
            destinatario: 'Coordinación + Docentes Liga',
            montoPagar: totalGastosLiga,
            glosa: `Docentes (${totalClasesDictadas} clases dictadas x $${valorClaseDocenteLiga}): $${costoDocentesLiga.toLocaleString()}. Coordinación Fija: $${coordinacionFijaLiga.toLocaleString()}. El saldo neto restante de $${saldoPiso2.toLocaleString()} pertenece a Piso 2.`,
            tipo: 'liga'
        };
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24 selection:bg-blue-500 selection:text-white animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="bg-[#09090b] border-b border-white/5 pt-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

                <div className="max-w-4xl mx-auto px-4 md:px-8">
                    <Link href="/companias" className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors mb-6 relative z-10">
                        <ArrowLeft size={14} /> Volver a Grupos
                    </Link>

                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 relative z-10 pb-8">
                        <div>
                            <span className="inline-block bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded mb-4 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                                Grupo Exclusivo
                            </span>
                            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none mb-4">
                                {compania.nombre}
                            </h1>

                            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                                <div className="flex items-center gap-2 text-sm text-gray-300 font-bold bg-[#111] px-3 py-1.5 rounded-lg border border-white/5">
                                    <Shield size={16} className="text-blue-400" />
                                    Coord: {compania.coordinador?.nombre_completo || 'Staff'}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-300 font-bold bg-[#111] px-3 py-1.5 rounded-lg border border-white/5">
                                    <UsersRound size={16} className="text-blue-400" />
                                    {miembros.length} Integrantes
                                </div>
                            </div>
                        </div>

                        {isStaff && (
                            <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-1.5 rounded-xl shadow-inner w-fit">
                                <CalendarDays size={16} className="text-gray-500 ml-2" />
                                <select value={mesDashboard} onChange={e => setMesDashboard(Number(e.target.value))} className="bg-transparent text-white text-xs font-bold uppercase outline-none cursor-pointer appearance-none px-2 py-1">
                                    {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => (
                                        <option key={i + 1} value={i + 1} className="bg-[#111] text-white">{m}</option>
                                    ))}
                                </select>
                                <span className="text-gray-600">/</span>
                                <select value={anioDashboard} onChange={e => setAnioDashboard(Number(e.target.value))} className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer appearance-none px-2 py-1">
                                    {[2025, 2026, 2027].map(y => (
                                        <option key={y} value={y} className="bg-[#111] text-white">{y}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-6 relative z-10 overflow-x-auto custom-scrollbar">
                        <button onClick={() => setActiveTab('muro')} className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'muro' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}><MessageSquare size={14} /> Muro / Avisos</button>
                        <button onClick={() => setActiveTab('clases')} className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'clases' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}><Calendar size={14} /> Clases del Mes</button>
                        {canSeeFinance && <button onClick={() => setActiveTab('miembros')} className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'miembros' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}><Users size={14} /> Padrón y Cobros</button>}
                        {isStaff && <button onClick={() => setActiveTab('estadisticas')} className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'estadisticas' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}><Activity size={14} /> Estadísticas</button>}
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">

                {deboCompania && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="font-black text-blue-500 uppercase text-xs tracking-widest mb-1">Cuota de Grupo Pendiente</h4>
                                {esProyectoStaff ? (
                                    <p className="text-gray-400 text-[10px] sm:text-xs">Aboná tu saldo de <strong className="text-white">${miPerfilInfo?.saldoPendienteEfectivo} (Efectivo) o ${miPerfilInfo?.saldoPendiente} (Transferencia)</strong> en la recepción.</p>
                                ) : (
                                    <p className="text-gray-400 text-[10px] sm:text-xs">
                                        Tenés un saldo pendiente de <strong className="text-white">${miPerfilInfo?.saldoPendienteEfectivo} (Efectivo) o ${miPerfilInfo?.saldoPendiente} (Transf)</strong>. Aboná para mantener tu lugar.
                                    </p>
                                )}
                            </div>
                        </div>

                        {!esProyectoStaff && (
                            <button onClick={generarLinkPagoCompania} disabled={procesandoPago} className="shrink-0 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                                {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : <><Coins size={14} /> Pagar ${miPerfilInfo?.saldoPendiente}</>}
                            </button>
                        )}
                    </div>
                )}

                {/* 1. PESTAÑA: MURO */}
                {activeTab === 'muro' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 flex items-start gap-4">
                            <Info className="text-blue-400 shrink-0 mt-1" size={20} />
                            <div>
                                <h3 className="text-blue-400 font-black uppercase text-xs tracking-widest mb-1">Foco del Grupo</h3>
                                <p className="text-sm text-blue-100/70 leading-relaxed">{compania.descripcion || 'Este grupo no tiene una descripción definida aún.'}</p>
                            </div>
                        </div>

                        {/* MATERIAL DE ESTUDIO (PDFs) — lo ven todos; suben coordinador del grupo + recep/admin */}
                        <MaterialesPanel
                            tipo="compania"
                            companiaId={compania.id}
                            canUpload={['admin', 'recepcion'].includes(userRole || '') || (userRole === 'profesor' && compania.coordinador_id === userId)}
                            accent="blue"
                        />

                        {isStaff ? (
                            <div className="bg-[#111] border border-white/5 rounded-3xl p-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                                <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-4 relative z-10">
                                    <MessageSquare size={18} className="text-blue-500" /> Publicar en el Muro (A todos)
                                </h3>
                                <form onSubmit={handleSendGlobalNotif} className="relative z-10 space-y-4">
                                    <textarea required value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="Escribí un aviso para todos los integrantes..." className="w-full bg-[#09090b] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-blue-500 min-h-[120px] resize-none transition-colors" />
                                    <div className="flex justify-end">
                                        <button disabled={sendingNotif} type="submit" className="w-full md:w-auto px-8 py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-blue-500 transition-colors shadow-lg">
                                            {sendingNotif ? <Loader2 size={16} className="animate-spin" /> : <><Send size={16} /> Enviar a {miembros.length} Alumnos</>}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        ) : (
                            <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                                <MessageSquare size={32} className="mx-auto mb-3 text-gray-600" />
                                <p className="text-gray-500 font-bold uppercase text-sm">El muro de avisos</p>
                                <p className="text-xs text-gray-600 mt-1">Los coordinadores publicarán información importante acá.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* 2. PESTAÑA: CLASES */}
                {activeTab === 'clases' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {clases.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {clases.map((clase) => {
                                    const [fechaParte, horaParte] = clase.inicio.split('T')
                                    const horaDisplay = horaParte ? horaParte.substring(0, 5) : ''
                                    const dateObj = new Date(`${fechaParte}T12:00:00`)
                                    const esHoy = isToday(dateObj)
                                    const yaPaso = dateObj < new Date(new Date().setHours(0, 0, 0, 0))
                                    const [finFecha, finHora] = clase.fin.split('T')
                                    const finDisplay = finHora ? finHora.substring(0, 5) : ''

                                    return (
                                        <div key={clase.id} className={`bg-[#111] border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/30 transition-all group flex flex-col ${yaPaso ? 'opacity-70 hover:opacity-100' : ''}`}>
                                            <div className="h-32 w-full relative bg-[#1a1a1c] border-b border-white/5 flex items-center justify-center overflow-hidden">
                                                {clase.imagen_url ? <Image src={clase.imagen_url} alt={clase.nombre} fill className={`object-cover transition-transform duration-500 ${yaPaso ? 'grayscale-[50%]' : 'group-hover:scale-105'}`} /> : <ImageIcon size={24} className="text-white/20" />}
                                                {esHoy && <span className="absolute top-3 left-3 bg-blue-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg shadow-blue-500/40">⚡ Hoy</span>}
                                                {yaPaso && <span className="absolute top-3 left-3 bg-gray-800 text-gray-400 text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg">Completada</span>}
                                            </div>
                                            <div className="p-5 flex-1">
                                                <h4 className="font-black uppercase text-white mb-1 truncate text-lg">{clase.nombre}</h4>
                                                <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-4"><User size={12} className="text-blue-400" /> {clase.profesor?.nombre_completo}</p>
                                                <div className="space-y-2 border-t border-white/5 pt-4">
                                                    <p className="text-[10px] uppercase font-bold text-gray-500">Día de Ensayo:</p>
                                                    <div className="flex items-center gap-3 text-xs text-gray-300 font-bold"><Calendar size={14} className="text-blue-400" /><span className="capitalize">{format(dateObj, "EEEE d MMMM", { locale: es })}</span></div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-400"><Clock size={14} /><span>{horaDisplay} a {finDisplay} hs</span></div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-400"><MapPin size={14} /><span>{clase.sala?.nombre} <span className="text-[9px] opacity-50 uppercase border border-white/20 px-1 rounded ml-1">Sede {clase.sala?.sede?.nombre}</span></span></div>
                                                </div>
                                            </div>
                                            <div className="p-4 bg-[#09090b] border-t border-white/5 mt-auto space-y-2">
                                                <Link href={isStaff ? `/clase/${clase.id}` : `/mis-clases`} className="w-full bg-blue-600/10 text-blue-400 border border-blue-600/20 py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">{isStaff ? 'Gestionar / Lista' : 'Ir a Mis Clases'} <ChevronRight size={14} /></Link>
                                                {canSeeFinance && nombreCiaLower.includes('the show') && (yaPaso || esHoy) && (
                                                    clasesPagoProfeRegistrado.has(clase.id)
                                                        ? <div className="w-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase"><CheckCircle2 size={12} /> Profe Pagado</div>
                                                        : <button onClick={() => { setPagoProfeModal({ claseId: clase.id, nombreClase: clase.nombre, fecha: fechaParte }); setPagoProfesMonto(costoDocentesFijo); setPagoProfeMetodo('efectivo') }} className="w-full bg-orange-500/10 text-orange-400 border border-orange-500/20 py-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase hover:bg-orange-500 hover:text-white transition-all"><Coins size={12} /> Registrar Pago Profe</button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50"><Calendar size={32} className="mx-auto mb-3 text-gray-600" /><p className="text-gray-500 font-bold uppercase text-sm">Sin clases en {mesDashboard}/{anioDashboard}</p></div>
                        )}
                    </div>
                )}

                {/* 3. PESTAÑA: MIEMBROS Y COBROS */}
                {canSeeFinance && activeTab === 'miembros' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">

                        {/* 🚀 PANEL DINÁMICO DE LIQUIDACIÓN DE GRUPO */}
                        <div className="bg-[#09090b] border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4 mb-6 relative z-10">
                                <div>
                                    <h3 className="text-lg font-black uppercase text-white flex items-center gap-2"><Wallet className="text-emerald-400" size={20} /> Cierre Financiero de Grupo</h3>
                                    <div className="mt-1 space-y-0.5">
                                        <p className="text-xs text-gray-500 font-medium">Ingreso Bruto Total: <strong className="text-white">${totalRecaudadoReal.toLocaleString()}</strong></p>
                                        <p className="text-[11px] text-emerald-400/80 font-bold uppercase tracking-widest">Pozo Valor Efectivo: <strong className="text-emerald-400">${totalRecaudadoValorEfectivo.toLocaleString()}</strong></p>
                                    </div>
                                </div>
                                <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/5 text-right w-full sm:w-auto">
                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">A Liquidar</p>
                                    <p className="text-xl font-black text-emerald-400">${detalleLiquidacion.montoPagar.toLocaleString()}</p>
                                </div>
                            </div>

                            {detalleLiquidacion.tipo === 'the_show' && (
                                <div className="bg-orange-500/5 border border-orange-500/20 p-3 rounded-xl mb-4 text-xs relative z-10 flex items-center justify-between gap-4">
                                    <span className="font-bold text-orange-400 uppercase tracking-wider">Pagado a Docentes este mes:</span>
                                    <span className="font-black text-white">${totalPagadoProfesTheShow.toLocaleString()}</span>
                                </div>
                            )}

                            {detalleLiquidacion.tipo === 'liga' && (
                                <div className="bg-[#111] p-4 rounded-xl border border-white/5 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs relative z-10">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"><label className="font-bold text-gray-400 uppercase">Coordinación Fija ($):</label><input type="number" value={coordinacionFijaLiga} onChange={e => setCoordinacionFijaLiga(Number(e.target.value))} className="bg-black border border-white/10 text-white rounded-lg p-2 font-black w-full sm:w-28 outline-none focus:border-blue-500" /></div>
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"><label className="font-bold text-gray-400 uppercase">Valor por Clase ($):</label><input type="number" value={valorClaseDocenteLiga} onChange={e => setValorClaseDocenteLiga(Number(e.target.value))} className="bg-black border border-white/10 text-white rounded-lg p-2 font-black w-full sm:w-28 outline-none focus:border-blue-500" /></div>
                                </div>
                            )}

                            <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-xs text-gray-400 leading-relaxed mb-6 relative z-10">
                                <span className="font-bold text-white uppercase block mb-1">Regla de Distribución Activa:</span>
                                {detalleLiquidacion.glosa}
                            </div>

                            {liquidacionPagada ? (
                                <div className="w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black py-4 rounded-xl flex items-center justify-center gap-2 uppercase tracking-widest text-xs cursor-not-allowed relative z-10"><CheckCircle2 size={16} /> Liquidación Registrada en Caja</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                                    <button disabled={registrandoLiquidacion || detalleLiquidacion.montoPagar <= 0} onClick={() => handlePagarLiquidacionGrupo('efectivo')} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">{registrandoLiquidacion ? <Loader2 className="animate-spin" /> : <>💵 Abonar en Efectivo (Caja)</>}</button>
                                    <button disabled={registrandoLiquidacion || detalleLiquidacion.montoPagar <= 0} onClick={() => handlePagarLiquidacionGrupo('transferencia')} className="bg-blue-600 hover:bg-blue-500 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">{registrandoLiquidacion ? <Loader2 className="animate-spin" /> : <>📱 Pagar por Transferencia</>}</button>
                                </div>
                            )}
                        </div>

                        {/* PLANES DEL GRUPO */}
                        <div className="bg-[#09090b] border border-white/10 rounded-2xl p-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-white font-black uppercase text-sm flex items-center gap-2">
                                    <Percent size={16} className="text-purple-400" /> Planes del Grupo
                                </h4>
                                {planes.length < 2 && (
                                    <button
                                        onClick={() => setModalPlan({ isOpen: true, plan: { compania_id: compania?.id, tipo: planes.length === 0 ? 'full' : 'dias', nombre: planes.length === 0 ? 'Full' : '', precio_transf: 0, precio_efvo: 0, dias_semana: null } })}
                                        className="bg-purple-600/20 text-purple-400 border border-purple-600/30 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-purple-600 hover:text-white transition-all flex items-center gap-1.5"
                                    >
                                        + Agregar Plan
                                    </button>
                                )}
                            </div>
                            {planes.length === 0 && (
                                <p className="text-gray-600 text-xs text-center py-3">Sin planes configurados. Se usa el precio global del grupo.</p>
                            )}
                            {planes.map(plan => (
                                <div key={plan.id} className="bg-[#111] border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-white font-black text-sm uppercase">{plan.nombre}</p>
                                        <p className="text-gray-500 text-[10px] mt-0.5">
                                            {plan.tipo === 'dias' ? `${plan.dias_semana} día${plan.dias_semana !== 1 ? 's' : ''}/semana · ` : 'Full · '}
                                            Efvo: ${plan.precio_efvo.toLocaleString()} · Transf: ${plan.precio_transf.toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button onClick={() => setModalPlan({ isOpen: true, plan: { ...plan } })} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-all"><Pencil size={13} className="text-gray-400" /></button>
                                        <button onClick={() => handleEliminarPlan(plan.id)} className="p-2 bg-red-500/10 hover:bg-red-500 rounded-lg transition-all"><X size={13} className="text-red-400 hover:text-white" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ASIGNACIÓN MASIVA */}
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-blue-500/5">
                            <div><h4 className="text-white font-black uppercase text-sm flex items-center gap-2"><CheckSquare size={16} className="text-blue-500" /> Asignación de Clases</h4><p className="text-gray-400 text-[10px] sm:text-xs mt-1">Inscribir a todos los alumnos del padrón a las clases del mes {mesDashboard}/{anioDashboard}</p></div>
                            <button onClick={handleInscripcionMasiva} disabled={inscribiendoMasivo || clases.length === 0} className="shrink-0 bg-blue-600 text-white hover:bg-blue-500 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">{inscribiendoMasivo ? <Loader2 size={16} className="animate-spin" /> : <><CalendarDays size={16} /> Inscribir al Mes</>}</button>
                        </div>

                        <div className="p-4 border-b border-white/5 bg-[#09090b] rounded-xl">
                            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} /><input type="text" placeholder="Buscar alumno..." value={searchAlumno} onChange={(e) => setSearchAlumno(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm outline-none focus:border-blue-500 transition-colors" /></div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {miembros.filter(a => a.nombre_completo?.toLowerCase().includes(searchAlumno.toLowerCase()) || a.email?.toLowerCase().includes(searchAlumno.toLowerCase())).map((miembro) => (
                                <div key={miembro.id} className="bg-[#111] border border-white/5 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-blue-500/30 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-4 overflow-hidden">
                                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-black text-sm uppercase shrink-0 border border-blue-500/20">{miembro.nombre_completo?.[0] || '?'}</div>
                                            <div className="min-w-0"><p className="text-sm font-bold text-white uppercase truncate">{miembro.nombre_completo}</p><p className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5"><Phone size={10} className="text-blue-400" />{miembro.telefono || 'Sin teléfono'}</p></div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button onClick={() => openPagoModal(miembro)} className="p-2.5 bg-white/5 text-gray-400 hover:text-white hover:bg-emerald-600 rounded-xl transition-all border border-transparent"><Coins size={14} /></button>
                                            <button onClick={() => openIndividualModal(miembro)} className="p-2.5 bg-white/5 text-gray-400 hover:text-white hover:bg-blue-600 rounded-xl transition-all"><BellRing size={14} /></button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5 mt-2">
                                        {(miembro.porcentaje_beca_compania ?? 0) > 0 && <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest"><Percent size={10} /> Beca {miembro.porcentaje_beca_compania}%</span>}
                                        <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${miembro.pago_compania_al_dia ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}><Coins size={10} /> Abonó ${miembro.totalAbonado} / ${miembro.precioEfectivo}</span>
                                        {!miembro.pago_compania_al_dia ? <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest"><AlertCircle size={10} /> Debe Efvo: ${miembro.saldoPendienteEfectivo} | Transf: ${miembro.saldoPendiente}</span> : <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest"><CheckCircle2 size={10} /> Al Día</span>}
                                    </div>
                                    {planes.length > 0 && (
                                        <div className="pt-2 mt-1 space-y-2">
                                            <select
                                                disabled={asignandoPlanId === miembro.id}
                                                value={miembro.plan_id || ''}
                                                onChange={e => handleAsignarPlan(miembro.id, e.target.value || null)}
                                                className="w-full bg-[#111] border border-purple-500/20 text-purple-300 text-[10px] font-black uppercase rounded-lg px-2 py-1.5 outline-none focus:border-purple-500 transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="">Sin plan asignado</option>
                                                {planes.map(p => (
                                                    <option key={p.id} value={p.id}>{p.nombre}{p.tipo === 'dias' ? ` (${p.dias_semana}d/sem)` : ''}</option>
                                                ))}
                                            </select>
                                            {planes.find(p => p.id === miembro.plan_id)?.tipo === 'dias' && clases.length > 0 && (
                                                <button
                                                    onClick={() => abrirModalClasesMiembro(miembro)}
                                                    className="w-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-yellow-500 hover:text-black transition-all flex items-center justify-center gap-1.5"
                                                >
                                                    <Calendar size={11} /> Elegir Clases del Mes
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 4. PESTAÑA: ESTADÍSTICAS */}
                {isStaff && activeTab === 'estadisticas' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-6">
                                <div><h3 className="text-xl font-black uppercase text-white flex items-center gap-2"><Activity className="text-blue-500" /> Control de Asistencias</h3><p className="text-xs text-gray-500 uppercase tracking-widest mt-1 font-bold">Mes analizado: {mesDashboard}/{anioDashboard}</p></div>
                                <span className="bg-white/5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-gray-400 border border-white/10 shrink-0">Clases Pasadas: {clases.filter(c => new Date(c.inicio).getTime() <= new Date().getTime()).length}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {miembros.map(m => {
                                    const total = m.estadisticas?.total || 0;
                                    const presentes = m.estadisticas?.presentes || 0;
                                    const saf = m.estadisticas?.saf || 0;
                                    const porcentaje = total > 0 ? Math.round(((presentes + saf) / total) * 100) : 0;

                                    return (
                                        <div key={m.id} className="bg-[#111] p-4 rounded-xl border border-white/5 flex flex-col gap-4 hover:border-white/20 transition-all group">
                                            <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                                <h4 className="font-bold text-sm uppercase text-white truncate max-w-[65%]">{m.nombre_completo}</h4>
                                                <span className={`text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest shrink-0 ${porcentaje >= 60 ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>{porcentaje}% Asist.</span>
                                            </div>
                                            <div className="grid grid-cols-5 gap-2 text-[10px] font-black uppercase tracking-widest">
                                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-green-500/5 text-green-500" title="Presentes"><CheckCircle2 size={14} /><span>{presentes} P</span></div>
                                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-red-500/5 text-red-500" title="Ausentes"><XCircle size={14} /><span>{m.estadisticas?.ausentes} A</span></div>
                                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-yellow-500/5 text-yellow-500" title="Medias Faltas"><Clock size={14} /><span>{m.estadisticas?.medias_faltas} MF</span></div>
                                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-blue-500/5 text-blue-500" title="Justificadas"><FileText size={14} /><span>{m.estadisticas?.justificadas} J</span></div>
                                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-purple-500/5 text-purple-500" title="SAF"><Eye size={14} /><span>{saf} SAF</span></div>
                                            </div>
                                            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1">
                                                <div className={`h-full rounded-full transition-all duration-1000 ${porcentaje >= 60 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${porcentaje}%` }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL: ELEGIR CLASES DEL MES (plan días) */}
            {modalClasesMiembro && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setModalClasesMiembro(null)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4 border-b border-white/10 pb-4 shrink-0">
                            <div>
                                <h3 className="text-base font-black text-white uppercase flex items-center gap-2">
                                    <Calendar className="text-yellow-400" size={16} /> Clases del Mes
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">{modalClasesMiembro.miembro.nombre_completo}</p>
                                <p className="text-[10px] text-yellow-400 font-bold mt-1">
                                    {modalClasesMiembro.clasesSeleccionadas.size} seleccionadas de {clases.length} clases
                                </p>
                            </div>
                            <button onClick={() => setModalClasesMiembro(null)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                            {clases.map(clase => {
                                const [fechaParte, horaParte] = clase.inicio.split('T')
                                const dateObj = new Date(`${fechaParte}T12:00:00`)
                                const seleccionada = modalClasesMiembro.clasesSeleccionadas.has(clase.id)
                                return (
                                    <button
                                        key={clase.id}
                                        type="button"
                                        onClick={() => {
                                            const next = new Set(modalClasesMiembro.clasesSeleccionadas)
                                            if (seleccionada) next.delete(clase.id)
                                            else next.add(clase.id)
                                            setModalClasesMiembro(prev => prev ? { ...prev, clasesSeleccionadas: next } : null)
                                        }}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${seleccionada ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-white/5 bg-[#111] hover:border-white/20'}`}
                                    >
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${seleccionada ? 'border-yellow-400 bg-yellow-400' : 'border-white/20'}`}>
                                            {seleccionada && <CheckCircle2 size={12} className="text-black" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-white text-xs font-bold uppercase truncate">{clase.nombre}</p>
                                            <p className="text-gray-500 text-[10px] capitalize">{format(dateObj, "EEEE d MMM", { locale: es })} · {horaParte?.substring(0, 5)} hs</p>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                        <div className="pt-4 shrink-0 border-t border-white/10 mt-3">
                            <button
                                disabled={guardandoClases}
                                onClick={handleGuardarClasesMiembro}
                                className="w-full bg-yellow-500 text-black font-black uppercase py-3 rounded-xl hover:bg-yellow-400 transition-all text-xs tracking-widest flex items-center justify-center gap-2"
                            >
                                {guardandoClases ? <Loader2 className="animate-spin" size={16} /> : <><CheckCircle2 size={14} /> Guardar Selección</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: PLAN */}
            {modalPlan.isOpen && modalPlan.plan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setModalPlan({ isOpen: false, plan: null })}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                            <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                                <Percent className="text-purple-400" size={18} /> {modalPlan.plan.id ? 'Editar Plan' : 'Nuevo Plan'}
                            </h3>
                            <button onClick={() => setModalPlan({ isOpen: false, plan: null })}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <form onSubmit={handleGuardarPlan} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Tipo de Plan</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['full', 'dias'] as const).map(tipo => (
                                        <button key={tipo} type="button"
                                            onClick={() => setModalPlan(prev => {
                                                if (!prev.plan) return prev
                                                return { ...prev, plan: { ...prev.plan, tipo, nombre: tipo === 'full' ? 'Full' : prev.plan.nombre === 'Full' ? '' : (prev.plan.nombre || ''), dias_semana: tipo === 'full' ? null : prev.plan.dias_semana } }
                                            })}
                                            className={`py-2.5 text-xs font-black uppercase rounded-xl border transition-all ${modalPlan.plan?.tipo === tipo ? 'border-purple-500 bg-purple-500/20 text-purple-300' : 'border-white/10 text-gray-500 hover:bg-white/5'}`}
                                        >
                                            {tipo === 'full' ? 'Full (ilimitado)' : 'X Días / Semana'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre del Plan</label>
                                <input required value={modalPlan.plan.nombre || ''} onChange={e => setModalPlan(prev => ({ ...prev, plan: { ...prev.plan!, nombre: e.target.value } }))} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-purple-500 transition-colors" placeholder={modalPlan.plan.tipo === 'full' ? 'Full' : 'Ej: 2 días'} />
                            </div>
                            {modalPlan.plan.tipo === 'dias' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Días por Semana</label>
                                    <input required type="number" min="1" max="6" value={modalPlan.plan.dias_semana ?? ''} onChange={e => setModalPlan(prev => ({ ...prev, plan: { ...prev.plan!, dias_semana: Number(e.target.value) } }))} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-purple-500 transition-colors" placeholder="Ej: 2" />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Precio Efectivo ($)</label>
                                    <input required type="number" min="0" value={modalPlan.plan.precio_efvo ?? ''} onChange={e => setModalPlan(prev => ({ ...prev, plan: { ...prev.plan!, precio_efvo: Number(e.target.value) } }))} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-purple-500 transition-colors" placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Precio Transf ($)</label>
                                    <input required type="number" min="0" value={modalPlan.plan.precio_transf ?? ''} onChange={e => setModalPlan(prev => ({ ...prev, plan: { ...prev.plan!, precio_transf: Number(e.target.value) } }))} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-purple-500 transition-colors" placeholder="0" />
                                </div>
                            </div>
                            <button disabled={guardandoPlan} type="submit" className="w-full bg-purple-600 text-white font-black uppercase py-4 rounded-xl hover:bg-purple-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-2">
                                {guardandoPlan ? <Loader2 className="animate-spin mx-auto" /> : <><CheckCircle2 size={16} /> {modalPlan.plan.id ? 'Guardar Cambios' : 'Crear Plan'}</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: PAGO PROFE THE SHOW */}
            {pagoProfeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setPagoProfeModal(null)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase flex items-center gap-2"><Coins className="text-orange-400" size={18} /> Pago a Docentes</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">{pagoProfeModal.nombreClase} · {pagoProfeModal.fecha}</p>
                            </div>
                            <button onClick={() => setPagoProfeModal(null)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <form onSubmit={handleRegistrarPagoProfe} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Método de Pago</label>
                                <select value={pagoProfeMetodo} onChange={e => setPagoProfeMetodo(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-orange-500 transition-colors appearance-none">
                                    <option value="efectivo">Efectivo</option>
                                    <option value="transferencia">Transferencia</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Monto ($)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                    <input type="number" required min="1" value={pagoProfesMonto} onChange={e => setPagoProfesMonto(e.target.value === '' ? '' : Number(e.target.value))} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white font-black outline-none focus:border-orange-500 transition-colors" />
                                </div>
                            </div>
                            <button disabled={registrandoPagoProfe} type="submit" className="w-full bg-orange-600 text-white font-black uppercase py-4 rounded-xl hover:bg-orange-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg mt-4">
                                {registrandoPagoProfe ? <Loader2 className="animate-spin mx-auto" /> : <><CheckCircle2 size={16} /> Registrar Egreso en Caja</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: REGISTRAR PAGO/SEÑA */}
            {isPagoModalOpen && alumnoPago && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsPagoModalOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase flex items-center gap-2"><Coins className="text-emerald-500" size={18} /> Registrar Pago</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Alumno: {alumnoPago.nombre_completo}</p>
                            </div>
                            <button onClick={() => setIsPagoModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <form onSubmit={handleRegistrarPago} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Mes</label>
                                    <select value={pagoMes} onChange={e => setPagoMes(Number(e.target.value))} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors cursor-pointer">
                                        {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                                            <option key={i + 1} value={i + 1}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Año</label>
                                    <select value={pagoAnio} onChange={e => setPagoAnio(Number(e.target.value))} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors cursor-pointer">
                                        {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Método de Pago</label>
                                <select value={metodoPago} onChange={e => { const newMethod = e.target.value; setMetodoPago(newMethod); if (alumnoPago) { setMontoPago(newMethod === 'efectivo' ? (alumnoPago.saldoPendienteEfectivo || 0) : (alumnoPago.saldoPendiente || 0)); } }} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors appearance-none"><option value="efectivo">Efectivo (Recepción)</option><option value="transferencia">Transferencia Bancaria</option><option value="mercadopago_manual">Mercado Pago (QR Físico)</option><option value="otro">Otro</option></select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Monto a Registrar ($)</label>
                                <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span><input type="number" required min="1" value={montoPago} onChange={e => setMontoPago(e.target.value === '' ? '' : Number(e.target.value))} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white font-black outline-none focus:border-emerald-500 transition-colors" /></div>
                                <p className="text-[10px] text-gray-500 text-right mt-1">Saldo sugerido: Efvo {alumnoPago.saldoPendienteEfectivo} / Otros {alumnoPago.saldoPendiente}</p>
                            </div>
                            <button disabled={registrandoPago} type="submit" className="w-full bg-emerald-600 text-white font-black uppercase py-4 rounded-xl hover:bg-emerald-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg mt-4">{registrandoPago ? <Loader2 className="animate-spin mx-auto" /> : <><CheckCircle2 size={16} /> Guardar Registro</>}</button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: AVISO INDIVIDUAL */}
            {isIndividualNotifOpen && selectedAlumno && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setIsIndividualNotifOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setIsIndividualNotifOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"><X size={20} /></button>
                        <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                            <div><h3 className="text-lg font-black text-white uppercase flex items-center gap-2"><BellRing className="text-blue-500" size={18} /> Aviso Directo</h3><p className="text-xs text-gray-500 mt-1">Para: {selectedAlumno.nombre_completo}</p></div>
                        </div>
                        <form onSubmit={handleSendIndividualNotif} className="space-y-4">
                            <textarea required value={individualMessage} onChange={e => setIndividualMessage(e.target.value)} placeholder={`Escribí un mensaje solo para ${selectedAlumno.nombre_completo}...`} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-blue-500 min-h-[120px] resize-none" />
                            <button disabled={sendingNotif} type="submit" className="w-full bg-blue-600 text-white font-black uppercase py-4 rounded-xl text-xs flex items-center justify-center gap-2">{sendingNotif ? <Loader2 className="animate-spin" /> : <><Send size={14} /> Enviar Mensaje</>}</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}