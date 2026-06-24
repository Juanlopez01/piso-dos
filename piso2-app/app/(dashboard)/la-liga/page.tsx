'use client'

import { createClient } from '@/utils/supabase/client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import useSWR from 'swr'
import {
    Lock, Loader2, AlertTriangle,
    Megaphone, BookOpen, GraduationCap, ChevronRight,
    CheckCircle2, AlertCircle, Users, ClipboardEdit, Save, FileText,
    Search, UserCog, UserMinus, Star, Send, Trash2, Clock, Settings2, Percent,
    X, Coins, CalendarDays, Activity, XCircle, Eye, Calendar, MapPin, User,
    Image as ImageIcon, CheckSquare, ChevronDown, ChevronUp
} from 'lucide-react'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast, Toaster } from 'sonner'
import { useCash } from '@/context/CashContext'

import {
    enviarAvisoAction,
    eliminarAvisoAction,
    guardarEvaluacionAction,
    actualizarPrecioGlobalAction,
    asignarBecaAction,
    inscribirPadronLigaAction,
    getNombresPerfilesAction
} from '@/app/actions/liga'

import {
    cambiarLigaAction,
    cobrarLigaAction
} from '@/app/actions/usuarios'

import MaterialesPanel from '@/components/MaterialesPanel'

const parseSafeDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return new Date()
    const cleanStr = dateStr.replace('+00:00', '').replace('+00', '').replace('Z', '').replace(' ', 'T')
    const parsed = new Date(cleanStr)
    return isNaN(parsed.getTime()) ? new Date() : parsed
}

type Estadisticas = {
    presentes: number
    ausentes: number
    justificadas: number
    saf: number
    medias_faltas: number
    total: number
    desglose?: Record<string, any>
}

const fetcherLiga = async (uid: string, paramMes: number, paramAnio: number, supabase: any) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (!profile) throw new Error("No profile")

    const isStaff = ['admin', 'recepcion', 'auxiliar', 'coordinador', 'profesor'].includes(profile.rol)
    const canManage = ['admin', 'recepcion', 'auxiliar', 'coordinador'].includes(profile.rol)
    const nivelAlumno = profile.nivel_liga || profile.nivel || 1

    let queryAvisos = supabase.from('liga_avisos').select('*, autor:profiles!liga_avisos_autor_id_fkey(nombre_completo)').order('created_at', { ascending: false }).limit(30)
    if (profile.rol === 'profesor') {
        queryAvisos = queryAvisos.or(`autor_id.eq.${uid},tipo_destino.eq.general`)
    } else if (!isStaff) {
        queryAvisos = queryAvisos.or(`tipo_destino.eq.general,and(tipo_destino.eq.nivel,nivel_destino.eq.${nivelAlumno}),and(tipo_destino.eq.individual,alumno_id.eq.${uid})`)
    }
    const { data: avisos } = await queryAvisos

    const inicioDelDia = new Date();
    inicioDelDia.setHours(0, 0, 0, 0);
    const hoyIso = inicioDelDia.toISOString();

    const cuatrimestreActual = '2026-1'
    const mesActual = paramMes
    const anioActual = paramAnio

    const { data: criteriosData } = await supabase.from('liga_criterios').select('*').order('nombre')

    const primerDiaMes = new Date(anioActual, mesActual - 1, 1).toISOString()
    const ultimoDiaMes = new Date(anioActual, mesActual, 0, 23, 59, 59, 999).toISOString()

    let queryClases = supabase
        .from('clases')
        .select(`id, nombre, inicio, fin, imagen_url, liga_nivel, profesor_id, profesor:profiles!clases_profesor_id_fkey(nombre_completo), sala:salas(nombre, sede:sedes(nombre))`)
        .eq('es_la_liga', true)
        .gte('inicio', primerDiaMes)
        .lte('inicio', ultimoDiaMes)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: true })

    if (profile.rol === 'profesor') queryClases = queryClases.eq('profesor_id', uid)
    else if (!isStaff) queryClases = queryClases.eq('liga_nivel', nivelAlumno)

    const { data: dataClases } = await queryClases

    let statsAsistencia: Record<string, Estadisticas> = {}
    let misInscripciones: any[] = []

    if (dataClases && dataClases.length > 0) {
        const todosIds = dataClases.map((c: any) => c.id)

        const { data: inscTodas } = await supabase
            .from('inscripciones')
            .select('user_id, clase_id, estado_asistencia')
            .in('clase_id', todosIds)

        if (inscTodas) {
            if (!isStaff) misInscripciones = inscTodas.filter((i: any) => i.user_id === uid);

            inscTodas.forEach((insc: any) => {
                const clase = dataClases.find((c: any) => c.id === insc.clase_id);
                const yaPaso = clase && new Date(clase.inicio).getTime() <= new Date().getTime();
                const nombreMateria = clase ? clase.nombre : 'Clase Desconocida';

                if (yaPaso && insc.user_id) {
                    if (!statsAsistencia[insc.user_id]) {
                        statsAsistencia[insc.user_id] = { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0, desglose: {} }
                    }

                    if (!statsAsistencia[insc.user_id].desglose![nombreMateria]) {
                        statsAsistencia[insc.user_id].desglose![nombreMateria] = { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0 }
                    }

                    statsAsistencia[insc.user_id].total++
                    statsAsistencia[insc.user_id].desglose![nombreMateria].total++

                    if (insc.estado_asistencia === 'presente') {
                        statsAsistencia[insc.user_id].presentes++
                        statsAsistencia[insc.user_id].desglose![nombreMateria].presentes++
                    }
                    else if (insc.estado_asistencia === 'ausente') {
                        statsAsistencia[insc.user_id].ausentes++
                        statsAsistencia[insc.user_id].desglose![nombreMateria].ausentes++
                    }
                    else if (insc.estado_asistencia === 'justificada') {
                        statsAsistencia[insc.user_id].justificadas++
                        statsAsistencia[insc.user_id].desglose![nombreMateria].justificadas++
                    }
                    else if (insc.estado_asistencia === 'saf') {
                        statsAsistencia[insc.user_id].saf++
                        statsAsistencia[insc.user_id].desglose![nombreMateria].saf++
                    }
                    else if (insc.estado_asistencia === 'media_falta') {
                        statsAsistencia[insc.user_id].medias_faltas++
                        statsAsistencia[insc.user_id].desglose![nombreMateria].medias_faltas++
                    }
                }
            })
        }
    }

    const clasesDelMes = (dataClases || []).map((c: any) => {
        const profNombre = Array.isArray(c.profesor) ? c.profesor[0]?.nombre_completo : c.profesor?.nombre_completo
        const salaData = Array.isArray(c.sala) ? c.sala[0] : c.sala
        const miInsc = !isStaff ? misInscripciones.find(i => i.clase_id === c.id) : null;

        return {
            id: c.id,
            nombre: c.nombre,
            inicio: c.inicio,
            fin: c.fin,
            imagen_url: c.imagen_url,
            profesor: { nombre_completo: profNombre || 'Staff' },
            sala: salaData,
            liga_nivel: c.liga_nivel,
            mi_estado_asistencia: miInsc ? miInsc.estado_asistencia : null,
            estoy_inscripto: !!miInsc
        }
    })

    let preciosLiga: any[] = []
    const { data: config } = await supabase.from('configuraciones').select('*').in('clave', [
        'cuota_liga_1_transf', 'cuota_liga_1_efvo',
        'cuota_liga_2_transf', 'cuota_liga_2_efvo'
    ])
    preciosLiga = config || []

    const getPrecioBase = (nivel: number, metodo: 'efvo' | 'transf') => {
        const p = preciosLiga.find(c => c.clave === `cuota_liga_${nivel}_${metodo}`)
        if (metodo === 'transf') return p ? Number(p.valor) : 15000
        return p ? Number(p.valor) : 13500
    }

    const { data: pagosLigaMes } = await supabase.from('liga_pagos').select('alumno_id, monto').eq('mes', mesActual).eq('anio', anioActual)

    let misEvaluaciones: any[] = []
    let deudaCuota = false
    let miSaldoPendiente = 0
    let miSaldoPendienteEfectivo = 0

    if (!isStaff) {
        const precioBaseTransf = getPrecioBase(nivelAlumno, 'transf')
        const precioBaseEfvo = getPrecioBase(nivelAlumno, 'efvo')
        const beca = profile.porcentaje_beca_liga || 0

        const precioFinal = precioBaseTransf - (precioBaseTransf * beca / 100)
        const precioEfectivo = precioBaseEfvo - (precioBaseEfvo * beca / 100)

        const totalAbonado = pagosLigaMes?.filter((p: any) => p.alumno_id === uid).reduce((acc: number, curr: any) => acc + Number(curr.monto), 0) || 0

        miSaldoPendiente = Math.max(0, precioFinal - totalAbonado)
        miSaldoPendienteEfectivo = Math.max(0, precioEfectivo - totalAbonado)

        deudaCuota = miSaldoPendiente > 0 && miSaldoPendienteEfectivo > 0

        const { data: evals } = await supabase.from('liga_evaluaciones').select('*').eq('alumno_id', uid).eq('cuatrimestre', cuatrimestreActual)
        if (evals) misEvaluaciones = evals
    }

    const disciplinasMap: Record<string, any> = {}
    if (dataClases) {
        dataClases.forEach((clase: any) => {
            const keyAgrupacion = `${clase.nombre}_Nivel_${clase.liga_nivel || 1}`;

            if (!disciplinasMap[keyAgrupacion]) {
                const profNombre = Array.isArray(clase.profesor) ? clase.profesor[0]?.nombre_completo : clase.profesor?.nombre_completo;
                disciplinasMap[keyAgrupacion] = { id: clase.id, nombre: clase.nombre, liga_nivel: clase.liga_nivel, profesor: profNombre || 'Staff', proxima_clase: null, clases_ids: [] }
            }
            disciplinasMap[keyAgrupacion].clases_ids.push(clase.id)

            if (clase.inicio >= hoyIso) {
                if (!disciplinasMap[keyAgrupacion].proxima_clase || clase.inicio < disciplinasMap[keyAgrupacion].proxima_clase) {
                    disciplinasMap[keyAgrupacion].proxima_clase = clase.inicio
                    const profNombre = Array.isArray(clase.profesor) ? clase.profesor[0]?.nombre_completo : clase.profesor?.nombre_completo;
                    disciplinasMap[keyAgrupacion].profesor = profNombre || 'Staff'
                    disciplinasMap[keyAgrupacion].id = clase.id
                }
            }
        })
    }

    const materias = Object.values(disciplinasMap).map((disciplina: any) => {
        let evaluacion = null
        if (!isStaff) evaluacion = misEvaluaciones.find(e => disciplina.clases_ids.includes(e.clase_id))
        return { ...disciplina, evaluacion: evaluacion || null }
    }).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre))

    let allStudents: any[] = []
    if (isStaff) {
        const { data: perfiles } = await supabase
            .from('profiles').select('id, nombre_completo, email, nivel_liga, porcentaje_beca_liga')
            .eq('rol', 'alumno').not('nivel_liga', 'is', null).order('nombre_completo', { ascending: true })

        if (perfiles) {
            allStudents = perfiles.filter((p: any) => p.nombre_completo && p.nombre_completo.trim() !== '').map((p: any) => {
                const precioBaseTransf = getPrecioBase(p.nivel_liga, 'transf')
                const precioBaseEfvo = getPrecioBase(p.nivel_liga, 'efvo')
                const beca = p.porcentaje_beca_liga || 0

                const precioFinal = precioBaseTransf - (precioBaseTransf * beca / 100)
                const precioEfectivo = precioBaseEfvo - (precioBaseEfvo * beca / 100)

                const totalAbonado = pagosLigaMes?.filter((pago: any) => pago.alumno_id === p.id).reduce((acc: number, curr: any) => acc + Number(curr.monto), 0) || 0

                const saldoPendiente = Math.max(0, precioFinal - totalAbonado)
                const saldoPendienteEfectivo = Math.max(0, precioEfectivo - totalAbonado)

                const pago_al_dia = saldoPendiente <= 0 || saldoPendienteEfectivo <= 0

                return {
                    ...p,
                    becaVisual: beca,
                    precioFinal,
                    precioEfectivo,
                    totalAbonado,
                    saldoPendiente,
                    saldoPendienteEfectivo,
                    pago_al_dia,
                    estadisticas: statsAsistencia[p.id] || { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0, desglose: {} }
                }
            })
        }
    }

    const legajoCompleto = isStaff ? true : Boolean(profile.edad && profile.direccion && profile.contacto_emergencia && profile.plan_medico && profile.condiciones_medicas)

    return {
        profile, isStaff, canManage, legajoCompleto, avisos: avisos || [],
        materias, deudaCuota, miSaldoPendiente, miSaldoPendienteEfectivo,
        allStudents, preciosLiga, criterios: criteriosData || [],
        clasesDelMes,
        miAsistencia: statsAsistencia[uid] || { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0, desglose: {} }
    }
}

// Límites (primer y último día) de un mes/año dado, en formato YYYY-MM-DD.
const boundsDelMes = (mes: number, anio: number) => {
    const mm = String(mes).padStart(2, '0')
    const ultimo = new Date(anio, mes, 0).getDate()
    return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

// 🚀 Fetcher independiente: calcula asistencias para un RANGO de fechas arbitrario.
// No toca el fetcher mensual (cuotas/clases/evaluaciones siguen por mes).
const fetcherAsistenciasRango = async (uid: string, desde: string, hasta: string, supabase: any) => {
    const { data: profile } = await supabase.from('profiles').select('rol, nivel_liga').eq('id', uid).single()
    const isStaff = ['admin', 'recepcion', 'auxiliar', 'coordinador', 'profesor'].includes(profile?.rol)
    const nivelAlumno = profile?.nivel_liga || 1

    const vacio = (): Estadisticas => ({ presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0, desglose: {} })

    // Mismo cálculo client-side que "Por Mes" (que funciona). Staff: TODOS los niveles.
    const desdeIso = new Date(`${desde}T00:00:00`).toISOString()
    const hastaIso = new Date(`${hasta}T23:59:59`).toISOString()

    let q = supabase.from('clases')
        .select('id, nombre, inicio, liga_nivel, profesor_id')
        .eq('es_la_liga', true)
        .gte('inicio', desdeIso)
        .lte('inicio', hastaIso)
        .neq('estado', 'cancelada')

    if (profile?.rol === 'profesor') q = q.eq('profesor_id', uid)
    else if (!isStaff) q = q.eq('liga_nivel', nivelAlumno)

    const { data: clases } = await q

    const statsAsistencia: Record<string, Estadisticas> = {}

    if (clases && clases.length > 0) {
        const ids = clases.map((c: any) => c.id)

        // Paginamos porque Supabase devuelve máx 1000 filas por consulta.
        // En rangos largos (ej: marzo → hoy) hay muchas más inscripciones y se truncaban.
        const insc: any[] = []
        const PAGE = 1000
        let from = 0
        while (true) {
            const { data: pagina } = await supabase
                .from('inscripciones')
                .select('user_id, clase_id, estado_asistencia')
                .in('clase_id', ids)
                .order('id', { ascending: true })
                .range(from, from + PAGE - 1)
            if (!pagina || pagina.length === 0) break
            insc.push(...pagina)
            if (pagina.length < PAGE) break
            from += PAGE
        }

        const ahora = new Date().getTime()
        const keyMap: Record<string, keyof Estadisticas> = {
            presente: 'presentes', ausente: 'ausentes', justificada: 'justificadas', saf: 'saf', media_falta: 'medias_faltas'
        }

        insc?.forEach((i: any) => {
            const clase = clases.find((c: any) => c.id === i.clase_id)
            const yaPaso = clase && new Date(clase.inicio).getTime() <= ahora
            if (!yaPaso || !i.user_id) return
            const mat = clase.nombre

            if (!statsAsistencia[i.user_id]) statsAsistencia[i.user_id] = vacio()
            if (!statsAsistencia[i.user_id].desglose![mat]) statsAsistencia[i.user_id].desglose![mat] = { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0 }

            statsAsistencia[i.user_id].total++
            statsAsistencia[i.user_id].desglose![mat].total++
            const k = keyMap[i.estado_asistencia]
            if (k) {
                (statsAsistencia[i.user_id][k] as number)++
                statsAsistencia[i.user_id].desglose![mat][k]++
            }
        })
    }

    // Nombres de los ex-liga (nivel_liga null) que el cliente no puede leer por RLS.
    let perfilesRango: Record<string, { nombre_completo: string; nivel_liga: number | null }> = {}
    if (isStaff) {
        const idsConAsistencia = Object.keys(statsAsistencia)
        if (idsConAsistencia.length > 0) perfilesRango = await getNombresPerfilesAction(idsConAsistencia)
    }

    return { statsAsistencia, miAsistencia: statsAsistencia[uid] || vacio(), perfilesRango }
}

function LaLigaContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [supabase] = useState(() => createClient())

    // 🚀 OBTENEMOS LOS ROLES Y PERMISOS DESDE EL CONTEXTO
    const { userId, isLoading: loadingContext, userRole, hasLigaAccess } = useCash()

    const [mesDashboard, setMesDashboard] = useState(new Date().getMonth() + 1)
    const [anioDashboard, setAnioDashboard] = useState(new Date().getFullYear())

    const { data, isLoading: loadingSWR, mutate, error } = useSWR(
        !loadingContext && userId ? ['liga-data', userId, mesDashboard, anioDashboard] : null,
        ([_, uid, m, a]) => fetcherLiga(uid as string, m as number, a as number, supabase),
        { revalidateOnFocus: false }
    )

    const pagoNotificado = useRef(false)
    const [procesandoPago, setProcesandoPago] = useState(false)
    const [adminTab, setAdminTab] = useState<'evaluaciones' | 'gestion' | 'comunicados' | 'precios' | 'clases' | 'estadisticas'>('evaluaciones')
    const [selectedMateria, setSelectedMateria] = useState<any>(null)
    const [alumnosList, setAlumnosList] = useState<any[]>([])
    const [loadingAlumnos, setLoadingAlumnos] = useState(false)

    const [searchStudent, setSearchStudent] = useState('')
    const [levelFilter, setLevelFilter] = useState<'todos' | '1' | '2'>('todos')
    const [nivelFiltroStats, setNivelFiltroStats] = useState<'todos' | '1' | '2'>('todos')

    const [preciosEdit, setPreciosEdit] = useState<Record<string, string>>({})
    const [guardandoPrecios, setGuardandoPrecios] = useState(false)
    const [nuevoCriterio, setNuevoCriterio] = useState('')

    const [becaModalOpen, setBecaModalOpen] = useState(false)
    const [selectedAlumnoBeca, setSelectedAlumnoBeca] = useState<any>(null)
    const [becaValue, setBecaValue] = useState(0)
    const [guardandoBeca, setGuardandoBeca] = useState(false)

    const [isPagoModalOpen, setIsPagoModalOpen] = useState(false)
    const [alumnoPago, setAlumnoPago] = useState<any>(null)
    const [montoPago, setMontoPago] = useState<number | ''>('')
    const [metodoPago, setMetodoPago] = useState('efectivo')

    const [pagoMes, setPagoMes] = useState(mesDashboard)
    const [pagoAnio, setPagoAnio] = useState(anioDashboard)

    const [registrandoPago, setRegistrandoPago] = useState(false)

    const [avisoForm, setAvisoForm] = useState({ titulo: '', mensaje: '', tipo_destino: 'general', nivel_destino: 1, alumno_id: '' })
    const [enviandoAviso, setEnviandoAviso] = useState(false)

    const [evalModalOpen, setEvalModalOpen] = useState(false)
    const [selectedAlumno, setSelectedAlumno] = useState<any>(null)
    const [notas, setNotas] = useState<Record<string, number>>({})
    const [observaciones, setObservaciones] = useState('')
    const [guardandoEval, setGuardandoEval] = useState(false)
    const [boletinModalOpen, setBoletinModalOpen] = useState(false)
    const [selectedBoletin, setSelectedBoletin] = useState<any>(null)

    const [inscribiendoNivel, setInscribiendoNivel] = useState<number | null>(null)
    const [expandedStudentStats, setExpandedStudentStats] = useState<string | null>(null)

    // 🚀 RANGO DE FECHAS para asistencias (filtro extra, no toca el mes/cuotas)
    // Arranca activo y pre-cargado con el rango del mes actual.
    const [rangoActivo, setRangoActivo] = useState(true)
    const [rangoManual, setRangoManual] = useState(false)
    const [fechaDesde, setFechaDesde] = useState(() => boundsDelMes(new Date().getMonth() + 1, new Date().getFullYear()).desde)
    const [fechaHasta, setFechaHasta] = useState(() => boundsDelMes(new Date().getMonth() + 1, new Date().getFullYear()).hasta)

    // Si el usuario no editó las fechas a mano, el rango sigue al selector de mes.
    useEffect(() => {
        if (rangoManual) return
        const b = boundsDelMes(mesDashboard, anioDashboard)
        setFechaDesde(b.desde)
        setFechaHasta(b.hasta)
    }, [mesDashboard, anioDashboard, rangoManual])

    const onChangeDesde = (v: string) => { setFechaDesde(v); setRangoManual(true) }
    const onChangeHasta = (v: string) => { setFechaHasta(v); setRangoManual(true) }

    const { data: rangoData } = useSWR(
        (!loadingContext && userId && rangoActivo && fechaDesde && fechaHasta && fechaDesde <= fechaHasta)
            ? ['liga-asist-rango', userId, fechaDesde, fechaHasta]
            : null,
        ([_, uid, d, h]) => fetcherAsistenciasRango(uid as string, d as string, h as string, supabase),
        { revalidateOnFocus: false }
    )

    useEffect(() => {
        const pagoStatus = searchParams.get('pago')
        if (pagoStatus === 'exito' && !pagoNotificado.current) {
            pagoNotificado.current = true
            toast.success('¡Pago de cuota aprobado exitosamente!', { duration: 5000 })
            router.replace('/la-liga', { scroll: false })
            setTimeout(() => mutate(), 1500)
        } else if (pagoStatus === 'error' && !pagoNotificado.current) {
            pagoNotificado.current = true
            toast.error('El pago no se procesó o fue rechazado.')
            router.replace('/la-liga', { scroll: false })
        }
    }, [searchParams, mutate, router])

    useEffect(() => {
        if (data?.preciosLiga) {
            const map: any = {}
            data.preciosLiga.forEach((p: any) => map[p.clave] = p.valor.toString())
            setPreciosEdit(map)
        }
    }, [data?.preciosLiga])

    const handleRegistrarPago = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!alumnoPago || !montoPago || Number(montoPago) <= 0) return

        setRegistrandoPago(true)
        try {
            const res = await cobrarLigaAction(alumnoPago.id, Number(montoPago), metodoPago, pagoMes, pagoAnio);
            if (!res.success) throw new Error(res.error);

            toast.success('Pago y movimiento de caja registrados');
            setIsPagoModalOpen(false);
            mutate();
        } catch (err: any) {
            toast.error(`Error: ${err.message || 'Desconocido'}`)
        } finally {
            setRegistrandoPago(false)
        }
    }

    const handleInscripcionMasivaLiga = async (nivel: number) => {
        setInscribiendoNivel(nivel);
        try {
            const res = await inscribirPadronLigaAction(nivel, mesDashboard, anioDashboard);
            if (res.success) {
                toast.success(res.message || `Padrón Nivel ${nivel} inscripto con éxito.`);
                mutate();
            } else {
                throw new Error(res.error);
            }
        } catch (error: any) {
            toast.error(error.message || 'Error al realizar la inscripción masiva.');
        } finally {
            setInscribiendoNivel(null);
        }
    };

    const handleGuardarPrecios = async () => {
        setGuardandoPrecios(true)
        try {
            let huboError = false;
            for (const clave of ['cuota_liga_1_transf', 'cuota_liga_1_efvo', 'cuota_liga_2_transf', 'cuota_liga_2_efvo']) {
                const valor = preciosEdit[clave]
                if (valor) {
                    const res = await actualizarPrecioGlobalAction(clave, Number(valor))
                    if (!res.success) {
                        toast.error(`Error guardando ${clave}: ${res.error}`)
                        huboError = true;
                    }
                }
            }
            if (!huboError) {
                toast.success("Precios actualizados exactamente")
                mutate()
            }
        } catch (e) {
            toast.error("Error de conexión al guardar precios")
        } finally {
            setGuardandoPrecios(false)
        }
    }

    const handleAddCriterio = async () => {
        if (!nuevoCriterio.trim()) return;
        const { error } = await supabase.from('liga_criterios').insert([{ nombre: nuevoCriterio.trim() }]);
        if (!error) {
            setNuevoCriterio('');
            toast.success("Ítem agregado exitosamente");
            mutate();
        } else {
            toast.error("Error al agregar el ítem");
        }
    };

    const handleEliminarCriterio = async (id: string) => {
        if (!confirm("¿Seguro que querés eliminar este ítem? Ya no aparecerá en las nuevas evaluaciones.")) return;
        const { error } = await supabase.from('liga_criterios').delete().eq('id', id);
        if (!error) {
            toast.success("Ítem eliminado");
            mutate();
        } else {
            toast.error("Error al eliminar");
        }
    };

    // 🚀 LA FUNCIÓN QUE FALTABA
    const generarLinkPagoLiga = async () => {
        setProcesandoPago(true)
        try {
            const res = await fetch('/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo: `Cuota/Saldo La Liga - Mes ${mesDashboard}/${anioDashboard}`,
                    precio: data?.miSaldoPendiente || 0,
                    userId: userId,
                    tipo_pago: 'cuota_liga',
                    mes: mesDashboard,
                    anio: anioDashboard
                })
            })

            const resData = await res.json()
            if (resData.url) window.location.href = resData.url
            else throw new Error('No se pudo generar el link')
        } catch (err) {
            toast.error('Error al conectar con Mercado Pago.')
        } finally {
            setProcesandoPago(false)
        }
    }

    const enviarAviso = async (e: React.FormEvent) => {
        e.preventDefault()
        setEnviandoAviso(true)
        if (!avisoForm.titulo || !avisoForm.mensaje) {
            setEnviandoAviso(false); return toast.error("Completá título y mensaje")
        }
        const payload = { titulo: avisoForm.titulo, mensaje: avisoForm.mensaje, tipo_destino: avisoForm.tipo_destino, nivel_destino: avisoForm.tipo_destino === 'nivel' ? avisoForm.nivel_destino : null, alumno_id: avisoForm.tipo_destino === 'individual' ? avisoForm.alumno_id : null }
        const response = await enviarAvisoAction(payload)
        if (response.success) {
            toast.success("Comunicado publicado")
            setAvisoForm({ titulo: '', mensaje: '', tipo_destino: 'general', nivel_destino: 1, alumno_id: '' })
            mutate()
        } else {
            toast.error(response.error || "Error")
        }
        setEnviandoAviso(false)
    }

    const eliminarAviso = async (id: string) => {
        if (!confirm("¿Borrar aviso?")) return
        const response = await eliminarAvisoAction(id)
        if (response.success) { toast.success("Eliminado"); mutate() }
    }

    const cambiarNivelLiga = async (id: string, nuevoNivel: number | null) => {
        const response = await cambiarLigaAction(id, nuevoNivel)
        if (response.success) {
            toast.success('Nivel actualizado y clases sincronizadas')
            mutate()
        } else {
            toast.error(response.error || 'Error al actualizar')
        }
    }

    const guardarEvaluacion = async () => {
        setGuardandoEval(true)
        const notasFaltantes = Object.values(notas).some(v => v === 0 || isNaN(v))
        if (notasFaltantes) { toast.error('Completá todas las notas.'); setGuardandoEval(false); return }
        const notaFinal = parseFloat(calcularPromedio() as string)
        const aprobado = notaFinal >= 6
        const cuatrimestreActual = '2026-1'
        const payload = { alumno_id: selectedAlumno.id, clase_id: selectedMateria.id, cuatrimestre: cuatrimestreActual, anio: new Date().getFullYear(), criterios_notas: notas, observaciones_docente: observaciones, nota_final: notaFinal, aprobado: aprobado, requiere_recuperatorio: !aprobado }
        const response = await guardarEvaluacionAction(payload)
        if (response.success) { toast.success('Guardado'); setEvalModalOpen(false); cargarAlumnos(selectedMateria); mutate() }
        setGuardandoEval(false)
    }

    const cargarAlumnos = async (materia: any) => {
        setSelectedMateria(materia)
        setLoadingAlumnos(true)
        try {
            const { data: perfiles } = await supabase.from('profiles').select('id, nombre_completo, email, rol, nivel_liga').eq('rol', 'alumno').eq('nivel_liga', materia.liga_nivel)
            const alumnosReales = perfiles ? perfiles.filter((p: any) => p.nombre_completo && p.nombre_completo.trim() !== '') : []
            const cuatrimestreActual = '2026-1'
            const { data: evaluaciones } = await supabase.from('liga_evaluaciones').select('alumno_id, nota_final, aprobado').eq('clase_id', materia.id).eq('cuatrimestre', cuatrimestreActual)

            // 🚀 FIX: EL NOMBRE DEL CAMPO ES evaluacion
            const alumnosMapeados = alumnosReales.map((perfil: any) => {
                const evalExistente = evaluaciones?.find((e: any) => e.alumno_id === perfil.id)
                return { ...perfil, evaluacion: evalExistente || null }
            })
            setAlumnosList(alumnosMapeados)
        } finally { setLoadingAlumnos(false) }
    }

    const abrirModalEvaluacion = async (alumno: any) => {
        setSelectedAlumno(alumno)
        setObservaciones('')
        const notasIniciales: Record<string, number> = {}

        if (alumno.evaluacion) {
            const { data: evalCompleta } = await supabase.from('liga_evaluaciones').select('criterios_notas, observaciones_docente').eq('alumno_id', alumno.id).eq('clase_id', selectedMateria.id).single()
            if (evalCompleta) {
                setNotas(evalCompleta.criterios_notas || {})
                setObservaciones(evalCompleta.observaciones_docente || '')
                setEvalModalOpen(true)
                return
            }
        }

        data?.criterios.forEach((c: any) => notasIniciales[c.nombre] = 0)
        setNotas(notasIniciales)
        setEvalModalOpen(true)
    }

    const calcularPromedio = () => {
        const valores = Object.values(notas).filter(v => v > 0)
        if (valores.length === 0) return 0
        const suma = valores.reduce((a, b) => a + b, 0)
        return (suma / valores.length).toFixed(2)
    }

    if (loadingSWR || loadingContext) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12 mb-4" />
                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest animate-pulse">Cargando La Liga...</p>
            </div>
        )
    }

    // 🚀 ESCUDO MÁGICO: ESCURRIMOS AL COORDINADOR SI NO TIENE LA LLAVE 'liga'
    if (userRole === 'coordinador' && !hasLigaAccess) {
        return (
            <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="max-w-md w-full bg-[#09090b] border border-pink-500/20 rounded-3xl p-8 text-center relative z-10 shadow-2xl">
                    <div className="w-20 h-20 bg-pink-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-pink-500/20"><Lock className="text-pink-500 w-10 h-10" /></div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter text-white mb-3">Acceso Restringido</h1>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed">No tenés permisos asignados para coordinar o gestionar el espacio de <span className="text-[#D4E655] font-bold">La Liga</span>.</p>
                    <Link href="/perfil" className="w-full bg-white/5 border border-white/10 text-white font-bold uppercase py-4 rounded-xl hover:bg-white hover:text-black transition-all text-xs tracking-widest flex items-center justify-center gap-2">Ir a mi Perfil <ChevronRight size={16} /></Link>
                </div>
            </div>
        )
    }

    if (error || !data?.profile) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-6 w-full animate-in fade-in">
                <AlertTriangle className="text-orange-500 w-16 h-16" />
                <h2 className="text-white font-black text-2xl uppercase tracking-tighter">Conexión Perdida</h2>
                <button onClick={() => window.location.reload()} className="bg-white/10 text-white px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white hover:text-black transition-colors">Refrescar</button>
            </div>
        )
    }

    const { profile, isStaff, canManage, legajoCompleto, avisos, materias, deudaCuota, miSaldoPendiente, miSaldoPendienteEfectivo, allStudents, criterios, clasesDelMes, miAsistencia } = data
    const nivelActual = profile.nivel_liga || profile.nivel || 1

    // 🚀 Asistencia a mostrar: por mes (default) o por rango si está activo
    const statsVacio: Estadisticas = { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0, desglose: {} }
    const asistenciaAlumna: Estadisticas = rangoActivo ? (rangoData?.miAsistencia || statsVacio) : miAsistencia
    const statsStaffRango: Record<string, Estadisticas> | null = rangoActivo ? (rangoData?.statsAsistencia || {}) : null
    const etiquetaPeriodo = rangoActivo ? `${fechaDesde} → ${fechaHasta}` : `${mesDashboard}/${anioDashboard}`
    const clasesPasadasMes = clasesDelMes.filter((c: any) => new Date(c.inicio).getTime() <= new Date().getTime()).length
    const hayDatosAsistencia = rangoActivo
        ? Object.values(statsStaffRango || {}).some((s) => (s.total || 0) > 0)
        : clasesPasadasMes > 0

    // Lista de estadísticas: alumnos actuales primero; al final, los que tienen
    // asistencia en el rango pero ya no están en la liga (con cartelito).
    const perfilesRango: Record<string, { nombre_completo: string; nivel_liga: number | null }> = (rangoActivo ? rangoData?.perfilesRango : null) || {}
    const idsActuales = new Set(allStudents.map((s: any) => s.id))
    const exLigaStudents = rangoActivo
        ? Object.keys(statsStaffRango || {})
            .filter(id => !idsActuales.has(id))
            .map(id => ({
                id,
                nombre_completo: perfilesRango[id]?.nombre_completo || 'Alumno',
                nivel_liga: perfilesRango[id]?.nivel_liga ?? null,
                exLiga: true
            }))
        : []
    const listaEstadisticas: any[] = [
        ...allStudents.map((s: any) => ({ ...s, exLiga: false })),
        ...exLigaStudents
    ]

    const filteredStudents = allStudents.filter((s: any) => {
        const matchesSearch = (s.nombre_completo || '').toLowerCase().includes(searchStudent.toLowerCase())
        const matchesLevel = levelFilter === 'todos' ? true : String(s.nivel_liga) === levelFilter
        return matchesSearch && matchesLevel
    })

    if (!isStaff && !legajoCompleto) {
        return (
            <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#D4E655]/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="max-w-md w-full bg-[#09090b] border border-[#D4E655]/20 rounded-3xl p-8 text-center relative z-10 animate-in zoom-in-95 duration-500 shadow-2xl">
                    <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/20"><Lock className="text-yellow-500 w-10 h-10" /></div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter text-white mb-3">Legajo Incompleto</h1>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed">Para acceder a <span className="text-[#D4E655] font-bold">La Liga</span>, primero completá tu ficha médica.</p>
                    <Link href="/perfil" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2">Ir a mi Perfil <ChevronRight size={16} /></Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24 selection:bg-[#D4E655] selection:text-black">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="bg-[#111] border-b border-white/5 pt-8 pb-0 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4E655]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="max-w-7xl mx-auto px-4 md:px-8">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 relative z-10 pb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <GraduationCap className="text-[#D4E655]" size={24} />
                                <span className="text-[#D4E655] font-bold text-[10px] tracking-[0.3em] uppercase">Programa de Formación</span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none flex flex-wrap items-center gap-3">
                                La Liga {isStaff && <span className="text-gray-500 text-2xl">/ Staff</span>}
                            </h1>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-1.5 rounded-xl shadow-inner">
                                <CalendarDays size={16} className="text-gray-500 ml-2" />
                                <select value={mesDashboard} onChange={e => setMesDashboard(Number(e.target.value))} className="bg-transparent text-white text-xs font-bold uppercase outline-none focus:ring-0 cursor-pointer appearance-none px-2 py-1">
                                    {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => (
                                        <option key={i + 1} value={i + 1} className="bg-[#111] text-white">{m}</option>
                                    ))}
                                </select>
                                <span className="text-gray-600">/</span>
                                <select value={anioDashboard} onChange={e => setAnioDashboard(Number(e.target.value))} className="bg-transparent text-white text-xs font-bold outline-none focus:ring-0 cursor-pointer appearance-none px-2 py-1">
                                    {[2025, 2026, 2027].map(y => (
                                        <option key={y} value={y} className="bg-[#111] text-white">{y}</option>
                                    ))}
                                </select>
                            </div>

                            {!isStaff && (
                                <span className="bg-[#D4E655] text-black px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest shadow-[0_0_15px_rgba(212,230,85,0.2)]">
                                    Nivel {nivelActual}
                                </span>
                            )}
                        </div>
                    </div>

                    {isStaff && (
                        <div className="flex gap-6 border-b border-white/10 relative z-10 mt-2 overflow-x-auto custom-scrollbar">
                            <button onClick={() => setAdminTab('evaluaciones')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${adminTab === 'evaluaciones' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                <ClipboardEdit size={14} /> Evaluaciones
                            </button>
                            <button onClick={() => setAdminTab('clases')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${adminTab === 'clases' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                <Calendar size={14} /> Clases del Mes
                            </button>
                            <button onClick={() => setAdminTab('comunicados')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${adminTab === 'comunicados' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                <Megaphone size={14} /> Comunicados
                            </button>
                            {canManage && (
                                <button onClick={() => setAdminTab('estadisticas')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${adminTab === 'estadisticas' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                    <Activity size={14} /> Estadísticas
                                </button>
                            )}
                            {/* 🚀 OCULTAMOS PADRÓN Y CONFIGURACIÓN A AUXILIARES Y COORDINADORES */}
                            {!['auxiliar', 'coordinador'].includes(userRole || '') && canManage && (
                                <>
                                    <button onClick={() => setAdminTab('gestion')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${adminTab === 'gestion' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                        <UserCog size={14} /> Padrón
                                    </button>
                                    <button onClick={() => setAdminTab('precios')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${adminTab === 'precios' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                        <Settings2 size={14} /> Configuración
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">

                {/* CARTEL ROJO DEL ALUMNO */}
                {!isStaff && (deudaCuota) && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="font-black text-red-500 uppercase text-xs tracking-widest mb-1">Saldo Pendiente</h4>
                                <p className="text-gray-400 text-[10px] sm:text-xs">
                                    Tenés un saldo de <strong className="text-white">${miSaldoPendienteEfectivo} (Efectivo) o ${miSaldoPendiente} (Transf)</strong> en La Liga para este mes. Abonalo para ver tu boletín.
                                </p>
                            </div>
                        </div>
                        <button onClick={generarLinkPagoLiga} disabled={procesandoPago} className="shrink-0 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                            {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : `Pagar $${miSaldoPendiente}`}
                        </button>
                    </div>
                )}

                {/* --- VISTA CONFIGURACIÓN (PRECIOS Y CRITERIOS) --- */}
                {!['auxiliar', 'coordinador'].includes(userRole || '') && canManage && adminTab === 'precios' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
                        <div className="bg-[#09090b] border border-white/5 rounded-3xl p-8 shadow-xl">
                            <h3 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-8">
                                <Settings2 className="text-[#D4E655]" /> Configurar Aranceles
                            </h3>

                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nivel 1 (Transferencia)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                            <input type="number" value={preciosEdit['cuota_liga_1_transf'] || ''} onChange={e => setPreciosEdit({ ...preciosEdit, cuota_liga_1_transf: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-8 pr-3 text-white font-bold text-sm outline-none focus:border-[#D4E655] transition-all" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-[#D4E655] uppercase tracking-widest">Nivel 1 (Efectivo)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                            <input type="number" value={preciosEdit['cuota_liga_1_efvo'] || ''} onChange={e => setPreciosEdit({ ...preciosEdit, cuota_liga_1_efvo: e.target.value })} className="w-full bg-[#111] border border-[#D4E655]/30 rounded-xl py-3 pl-8 pr-3 text-[#D4E655] font-bold text-sm outline-none focus:border-[#D4E655] transition-all" />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nivel 2 (Transferencia)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                            <input type="number" value={preciosEdit['cuota_liga_2_transf'] || ''} onChange={e => setPreciosEdit({ ...preciosEdit, cuota_liga_2_transf: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-8 pr-3 text-white font-bold text-sm outline-none focus:border-[#D4E655] transition-all" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-[#D4E655] uppercase tracking-widest">Nivel 2 (Efectivo)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                            <input type="number" value={preciosEdit['cuota_liga_2_efvo'] || ''} onChange={e => setPreciosEdit({ ...preciosEdit, cuota_liga_2_efvo: e.target.value })} className="w-full bg-[#111] border border-[#D4E655]/30 rounded-xl py-3 pl-8 pr-3 text-[#D4E655] font-bold text-sm outline-none focus:border-[#D4E655] transition-all" />
                                        </div>
                                    </div>
                                </div>
                                <button onClick={handleGuardarPrecios} disabled={guardandoPrecios} className="w-full bg-[#D4E655] text-black font-black uppercase py-5 rounded-2xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-[#D4E655]/10 mt-4">
                                    {guardandoPrecios ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Actualizar Precios Manuales</>}
                                </button>
                            </div>
                        </div>

                        <div className="bg-[#09090b] border border-white/5 rounded-3xl p-8 shadow-xl">
                            <h3 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6">
                                <ClipboardEdit className="text-[#D4E655]" /> Ítems de Evaluación
                            </h3>
                            <p className="text-xs text-gray-500 mb-6">Cargá los criterios que el staff evaluará a fin de cuatrimestre.</p>

                            <div className="flex gap-2 mb-6">
                                <input
                                    type="text"
                                    value={nuevoCriterio}
                                    onChange={(e) => setNuevoCriterio(e.target.value)}
                                    placeholder="Ej: Técnica Clásica"
                                    className="flex-1 bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#D4E655]"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddCriterio()}
                                />
                                <button onClick={handleAddCriterio} className="bg-[#D4E655] text-black px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-colors">
                                    Cargar
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                {criterios.map((c: any) => (
                                    <div key={c.id} className="bg-[#111] p-3 rounded-xl border border-white/5 flex justify-between items-center group">
                                        <span className="text-xs text-gray-300 font-bold uppercase">{c.nombre}</span>
                                        <button
                                            onClick={() => handleEliminarCriterio(c.id)}
                                            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-500 transition-opacity"
                                            title="Eliminar ítem"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                                {criterios.length === 0 && <p className="text-xs text-gray-600 italic">No hay ítems cargados.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- VISTA ESTADÍSTICAS --- */}
                {canManage && adminTab === 'estadisticas' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-6">
                                <div>
                                    <h3 className="text-xl font-black uppercase text-white flex items-center gap-2">
                                        <Activity className="text-[#D4E655]" /> Control de Asistencias
                                    </h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-widest mt-1 font-bold">Período analizado: {etiquetaPeriodo}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button onClick={() => setRangoActivo(v => !v)} className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${rangoActivo ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}>
                                        {rangoActivo ? 'Por Rango' : 'Por Mes'}
                                    </button>
                                    {rangoActivo && (
                                        <div className="flex items-center gap-1.5">
                                            <input type="date" value={fechaDesde} max={fechaHasta} onChange={e => onChangeDesde(e.target.value)} className="bg-[#111] border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white outline-none focus:border-[#D4E655] [color-scheme:dark]" />
                                            <span className="text-gray-600 text-xs">→</span>
                                            <input type="date" value={fechaHasta} min={fechaDesde} onChange={e => onChangeHasta(e.target.value)} className="bg-[#111] border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white outline-none focus:border-[#D4E655] [color-scheme:dark]" />
                                        </div>
                                    )}
                                    {/* Filtro por nivel */}
                                    <div className="flex items-center gap-1 bg-black/30 p-1 rounded-lg border border-white/5">
                                        {(['todos', '1', '2'] as const).map(n => (
                                            <button key={n} onClick={() => setNivelFiltroStats(n)} className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-all ${nivelFiltroStats === n ? 'bg-[#D4E655] text-black' : 'text-gray-400 hover:text-white'}`}>
                                                {n === 'todos' ? 'Todos' : `Nivel ${n}`}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {!hayDatosAsistencia ? (
                                <div className="text-center py-10 bg-[#111] rounded-2xl border border-white/5">
                                    <p className="text-gray-500 text-xs font-bold uppercase">{rangoActivo ? 'No hay asistencias registradas en este rango.' : 'No hay clases dictadas este mes para analizar.'}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {listaEstadisticas
                                        .filter(m => nivelFiltroStats === 'todos' || String(m.nivel_liga) === nivelFiltroStats)
                                        .map(m => {
                                        const est = rangoActivo ? (statsStaffRango?.[m.id] || statsVacio) : m.estadisticas;
                                        const total = est?.total || 0;
                                        const presentes = est?.presentes || 0;
                                        const saf = est?.saf || 0;
                                        const asistenciasReales = presentes + saf;
                                        const porcentaje = total > 0 ? Math.round((asistenciasReales / total) * 100) : 0;

                                        if (total === 0) return null;

                                        const isExpanded = expandedStudentStats === m.id;

                                        return (
                                            <div
                                                key={m.id}
                                                onClick={() => setExpandedStudentStats(isExpanded ? null : m.id)}
                                                className={`bg-[#111] p-4 rounded-xl border flex flex-col gap-4 hover:border-white/20 transition-all group cursor-pointer overflow-hidden ${m.exLiga ? 'border-orange-500/30 opacity-80' : 'border-white/5'}`}
                                            >
                                                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                                    <div>
                                                        <h4 className="font-bold text-sm uppercase text-white truncate max-w-[200px]">{m.nombre_completo}</h4>
                                                        {m.exLiga ? (
                                                            <span className="inline-block text-[8px] font-black uppercase tracking-widest mt-1 px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/30">
                                                                Ya no está en la Liga
                                                            </span>
                                                        ) : (
                                                            <p className="text-[9px] text-[#D4E655] font-bold uppercase tracking-widest mt-0.5">Nivel {m.nivel_liga}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest shrink-0 ${porcentaje >= 60 ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                                            {porcentaje}% Asist.
                                                        </span>
                                                        {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500 group-hover:text-white" />}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-5 gap-2 text-[10px] font-black uppercase tracking-widest">
                                                    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-green-500/5 text-green-500" title="Presentes">
                                                        <CheckCircle2 size={14} />
                                                        <span>{presentes} P</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-red-500/5 text-red-500" title="Ausentes">
                                                        <XCircle size={14} />
                                                        <span>{est?.ausentes} A</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-yellow-500/5 text-yellow-500" title="Medias Faltas">
                                                        <Clock size={14} />
                                                        <span>{est?.medias_faltas} MF</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-blue-500/5 text-blue-500" title="Justificadas">
                                                        <FileText size={14} />
                                                        <span>{est?.justificadas} J</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-purple-500/5 text-purple-500" title="SAF (Asistió pero no bailó)">
                                                        <Eye size={14} />
                                                        <span>{saf} SAF</span>
                                                    </div>
                                                </div>

                                                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1">
                                                    <div className={`h-full rounded-full transition-all duration-1000 ${porcentaje >= 60 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${porcentaje}%` }} />
                                                </div>

                                                {isExpanded && (
                                                    <div className="mt-2 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
                                                        <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Detalle por Materia</h5>
                                                        {est?.desglose && Object.keys(est.desglose).length > 0 ? (
                                                            <div className="space-y-2">
                                                                {Object.entries(est.desglose).map(([nombreMateria, statsMat]: [string, any]) => (
                                                                    <div key={nombreMateria} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-black/50 p-3 rounded-lg border border-white/5">
                                                                        <span className="text-[10px] font-bold text-white uppercase truncate flex-1 leading-tight pr-2">{nombreMateria}</span>
                                                                        <div className="flex items-center justify-end gap-2.5 shrink-0 text-[9px] font-black tracking-widest uppercase">
                                                                            {statsMat.presentes > 0 && <span className="text-green-500 flex items-center gap-0.5" title="Presentes"><CheckCircle2 size={10} /> {statsMat.presentes}</span>}
                                                                            {statsMat.ausentes > 0 && <span className="text-red-500 flex items-center gap-0.5" title="Ausentes"><XCircle size={10} /> {statsMat.ausentes}</span>}
                                                                            {statsMat.medias_faltas > 0 && <span className="text-yellow-500 flex items-center gap-0.5" title="Media Falta"><Clock size={10} /> {statsMat.medias_faltas}</span>}
                                                                            {statsMat.justificadas > 0 && <span className="text-blue-500 flex items-center gap-0.5" title="Justificadas"><FileText size={10} /> {statsMat.justificadas}</span>}
                                                                            {statsMat.saf > 0 && <span className="text-purple-400 flex items-center gap-0.5" title="SAF"><Eye size={10} /> {statsMat.saf}</span>}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-[10px] text-gray-600 italic uppercase font-bold">No hay detalles registrados.</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- VISTA CLASES DEL MES (STAFF) --- */}
                {isStaff && adminTab === 'clases' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                        {/* MATERIAL DE ESTUDIO (PDFs) por nivel — suben admin/recep/coordinador/profesor */}
                        <MaterialesPanel
                            tipo="liga"
                            nivelesUpload={[1, 2]}
                            canUpload={['admin', 'recepcion', 'coordinador', 'profesor'].includes(userRole || '')}
                            accent="lime"
                        />

                        {clasesDelMes.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {clasesDelMes.map((clase: any) => {
                                    const [fechaParte, horaParte] = clase.inicio.split('T')
                                    const horaDisplay = horaParte ? horaParte.substring(0, 5) : ''
                                    const dateObj = new Date(`${fechaParte}T12:00:00`)
                                    const esHoy = isToday(dateObj)
                                    const yaPaso = dateObj < new Date(new Date().setHours(0, 0, 0, 0))
                                    const [finFecha, finHora] = clase.fin.split('T')
                                    const finDisplay = finHora ? finHora.substring(0, 5) : ''

                                    return (
                                        <div key={clase.id} className={`bg-[#111] border border-white/5 rounded-2xl overflow-hidden hover:border-[#D4E655]/30 transition-all group flex flex-col ${yaPaso ? 'opacity-70 hover:opacity-100' : ''}`}>
                                            <div className="h-32 w-full relative bg-[#1a1a1c] border-b border-white/5 flex items-center justify-center overflow-hidden">
                                                {clase.imagen_url ? (
                                                    <Image src={clase.imagen_url} alt={clase.nombre} fill className={`object-cover transition-transform duration-500 ${yaPaso ? 'grayscale-[50%]' : 'group-hover:scale-105'}`} />
                                                ) : (
                                                    <ImageIcon size={24} className="text-white/20" />
                                                )}

                                                <span className="absolute top-3 right-3 bg-[#D4E655] text-black text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg">Nivel {clase.liga_nivel}</span>

                                                {esHoy && <span className="absolute top-3 left-3 bg-[#D4E655] text-black text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg">⚡ Hoy</span>}
                                                {yaPaso && <span className="absolute top-3 left-3 bg-gray-800 text-gray-400 text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg">Completada</span>}
                                            </div>

                                            <div className="p-5 flex-1">
                                                <h4 className="font-black uppercase text-white mb-1 truncate text-lg">{clase.nombre}</h4>
                                                <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-4">
                                                    <User size={12} className="text-[#D4E655]" /> {clase.profesor?.nombre_completo}
                                                </p>
                                                <div className="space-y-2 border-t border-white/5 pt-4">
                                                    <p className="text-[10px] uppercase font-bold text-gray-500">Día de Clase:</p>
                                                    <div className="flex items-center gap-3 text-xs text-gray-300 font-bold">
                                                        <Calendar size={14} className="text-[#D4E655]" />
                                                        <span className="capitalize">{format(dateObj, "EEEE d MMMM", { locale: es })}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                                        <Clock size={14} className="text-white/30" />
                                                        <span>{horaDisplay} a {finDisplay} hs</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                                        <MapPin size={14} className="text-white/30" />
                                                        <span>{clase.sala?.nombre} <span className="text-[9px] opacity-50 uppercase border border-white/20 px-1 rounded ml-1">Sede {clase.sala?.sede?.nombre}</span></span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-4 bg-[#09090b] border-t border-white/5 mt-auto">
                                                <Link href={`/clase/${clase.id}`} className="w-full bg-[#D4E655]/10 text-[#D4E655] border border-[#D4E655]/20 py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-[#D4E655] hover:text-black transition-all">
                                                    Gestionar / Lista <ChevronRight size={14} />
                                                </Link>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                                <Calendar size={32} className="mx-auto mb-3 text-gray-600" />
                                <p className="text-gray-500 font-bold uppercase text-sm">Sin clases programadas en {mesDashboard}/{anioDashboard}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* --- VISTA PADRÓN --- */}
                {!['auxiliar', 'coordinador'].includes(userRole || '') && canManage && adminTab === 'gestion' && (
                    <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6 shadow-xl animate-in fade-in">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-6 border-b border-white/5">
                            <h3 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2"><Users size={24} className="text-[#D4E655]" /> Padrón de Alumnos</h3>
                            <div className="relative w-full md:w-72">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input type="text" placeholder="Buscar..." value={searchStudent} onChange={(e) => setSearchStudent(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-xs font-bold outline-none focus:border-[#D4E655]" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 rounded-2xl p-4 flex flex-col justify-between gap-4 shadow-lg shadow-[#D4E655]/5">
                                <div>
                                    <h4 className="text-white font-black uppercase text-sm flex items-center gap-2"><CheckSquare size={16} className="text-[#D4E655]" /> Asignación Nivel 1</h4>
                                    <p className="text-gray-400 text-[10px] sm:text-xs mt-1">Inscribir a todos los alumnos del Nivel 1 a sus clases de {mesDashboard}/{anioDashboard}</p>
                                </div>
                                <button
                                    onClick={() => handleInscripcionMasivaLiga(1)}
                                    disabled={inscribiendoNivel !== null || allStudents.filter(s => s.nivel_liga == 1).length === 0}
                                    className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${allStudents.filter(s => s.nivel_liga == 1).length === 0 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-[#D4E655] text-black hover:bg-white'}`}
                                >
                                    {inscribiendoNivel === 1 ? <Loader2 size={16} className="animate-spin" /> : <><CalendarDays size={16} /> Inscribir Nivel 1</>}
                                </button>
                            </div>
                            <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 rounded-2xl p-4 flex flex-col justify-between gap-4 shadow-lg shadow-[#D4E655]/5">
                                <div>
                                    <h4 className="text-white font-black uppercase text-sm flex items-center gap-2"><CheckSquare size={16} className="text-[#D4E655]" /> Asignación Nivel 2</h4>
                                    <p className="text-gray-400 text-[10px] sm:text-xs mt-1">Inscribir a todos los alumnos del Nivel 2 a sus clases de {mesDashboard}/{anioDashboard}</p>
                                </div>
                                <button
                                    onClick={() => handleInscripcionMasivaLiga(2)}
                                    disabled={inscribiendoNivel !== null || allStudents.filter(s => s.nivel_liga == 2).length === 0}
                                    className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${allStudents.filter(s => s.nivel_liga == 2).length === 0 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-[#D4E655] text-black hover:bg-white'}`}
                                >
                                    {inscribiendoNivel === 2 ? <Loader2 size={16} className="animate-spin" /> : <><CalendarDays size={16} /> Inscribir Nivel 2</>}
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar">
                            <button onClick={() => setLevelFilter('todos')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${levelFilter === 'todos' ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Todos</button>
                            <button onClick={() => setLevelFilter('1')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${levelFilter === '1' ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Nivel 1</button>
                            <button onClick={() => setLevelFilter('2')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${levelFilter === '2' ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Nivel 2</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredStudents.map((alumno: any) => (
                                <div key={alumno.id} className="bg-[#111] border border-white/5 rounded-xl p-4 flex flex-col justify-between gap-4 group hover:border-white/20 transition-all">
                                    <div>
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h4 className="font-black text-white text-sm capitalize truncate">{alumno.nombre_completo}</h4>
                                                <span className="mt-1 inline-flex items-center gap-1 bg-[#D4E655]/10 text-[#D4E655] border border-[#D4E655]/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                                    <Star size={10} className="fill-[#D4E655]/50" /> Nivel {alumno.nivel_liga || '-'}
                                                </span>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setAlumnoPago(alumno);
                                                    setMetodoPago('efectivo');
                                                    setMontoPago(alumno.saldoPendienteEfectivo || 0);
                                                    setPagoMes(mesDashboard);
                                                    setPagoAnio(anioDashboard);
                                                    setIsPagoModalOpen(true);
                                                }}
                                                className="shrink-0 bg-white/5 hover:bg-emerald-500 text-gray-400 hover:text-black px-3 py-2 rounded-lg text-[10px] font-black transition-all flex items-center justify-center"
                                                title="Anotar pago"
                                            >
                                                <Coins size={14} />
                                            </button>
                                        </div>

                                        <div className="flex flex-wrap gap-2 pt-2 mt-2">
                                            {alumno.becaVisual > 0 && (
                                                <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                                    <Percent size={10} /> Beca {alumno.becaVisual}%
                                                </span>
                                            )}

                                            <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${alumno.pago_al_dia ? 'bg-[#D4E655]/10 text-[#D4E655] border-[#D4E655]/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                                                <Coins size={10} /> Abonó ${alumno.totalAbonado}
                                            </span>

                                            {!alumno.pago_al_dia ? (
                                                <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                                    <AlertCircle size={10} /> Debe Efvo: ${alumno.saldoPendienteEfectivo} | Transf: ${alumno.saldoPendiente}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 bg-[#D4E655]/10 text-[#D4E655] border border-[#D4E655]/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                                    <CheckCircle2 size={10} /> Al Día
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 border-t border-white/5 pt-3">
                                        <button onClick={() => cambiarNivelLiga(alumno.id, 1)} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-colors ${alumno.nivel_liga == 1 ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Nivel 1</button>
                                        <button onClick={() => cambiarNivelLiga(alumno.id, 2)} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-colors ${alumno.nivel_liga == 2 ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Nivel 2</button>

                                        <button onClick={() => { setSelectedAlumnoBeca(alumno); setBecaValue(alumno.becaVisual); setBecaModalOpen(true); }} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-colors ${alumno.becaVisual > 0 ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black' : 'bg-white/5 text-gray-400 hover:bg-emerald-500 hover:text-black'}`}>
                                            <Percent size={12} /> {alumno.becaVisual > 0 ? `${alumno.becaVisual}%` : ''}
                                        </button>

                                        <button onClick={() => cambiarNivelLiga(alumno.id, null)} className="shrink-0 bg-red-500/10 hover:bg-red-500 text-red-500 px-3 py-2 rounded-lg text-[10px] font-black" title="Remover de la Liga"><UserMinus size={14} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- VISTA COMUNICADOS --- */}
                {isStaff && adminTab === 'comunicados' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in">
                        <div className="lg:col-span-5 bg-[#09090b] border border-white/5 rounded-3xl p-6 shadow-xl h-fit">
                            <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6"><Send size={20} className="text-[#D4E655]" /> Redactar Aviso</h3>
                            <form onSubmit={enviarAviso} className="space-y-4">
                                <select value={avisoForm.tipo_destino} onChange={e => setAvisoForm({ ...avisoForm, tipo_destino: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none">
                                    <option value="general">Toda La Liga</option>
                                    <option value="nivel">Un Nivel</option>
                                    <option value="individual">Un Alumno</option>
                                </select>
                                {avisoForm.tipo_destino === 'nivel' && (
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setAvisoForm({ ...avisoForm, nivel_destino: 1 })} className={`flex-1 py-3 rounded-xl border text-xs font-black ${avisoForm.nivel_destino === 1 ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-400'}`}>Nivel 1</button>
                                        <button type="button" onClick={() => setAvisoForm({ ...avisoForm, nivel_destino: 2 })} className={`flex-1 py-3 rounded-xl border text-xs font-black ${avisoForm.nivel_destino === 2 ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-400'}`}>Nivel 2</button>
                                    </div>
                                )}
                                {avisoForm.tipo_destino === 'individual' && (
                                    <select value={avisoForm.alumno_id} onChange={e => setAvisoForm({ ...avisoForm, alumno_id: e.target.value })} className="w-full bg-[#111] border border-[#D4E655]/50 rounded-xl p-3 text-white text-sm">
                                        <option value="">Elegí un alumno...</option>
                                        {allStudents.map((a: any) => <option key={a.id} value={a.id}>{a.nombre_completo}</option>)}
                                    </select>
                                )}
                                <input type="text" required placeholder="Título..." value={avisoForm.titulo} onChange={e => setAvisoForm({ ...avisoForm, titulo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none" />
                                <textarea required placeholder="Mensaje..." value={avisoForm.mensaje} onChange={e => setAvisoForm({ ...avisoForm, mensaje: e.target.value })} className="w-full h-32 bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none resize-none" />
                                <button disabled={enviandoAviso} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs flex items-center justify-center gap-2">
                                    {enviandoAviso ? <Loader2 size={16} className="animate-spin" /> : <><Send size={16} /> Publicar</>}
                                </button>
                            </form>
                        </div>
                        <div className="lg:col-span-7 bg-[#111] border border-white/5 rounded-3xl p-6">
                            <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6"><Megaphone size={20} className="text-[#D4E655]" /> Cartelera Activa</h3>
                            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                {avisos.map((aviso: any) => (
                                    <div key={aviso.id} className="bg-[#09090b] border-l-2 border-[#D4E655] p-5 rounded-r-xl relative group">
                                        {(canManage || aviso.autor_id === userId) && (
                                            <button onClick={() => eliminarAviso(aviso.id)} className="absolute top-4 right-4 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                                        )}
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[9px] font-black bg-white/10 text-white px-2 py-0.5 rounded uppercase">{aviso.tipo_destino}</span>
                                            <span className="text-[9px] font-bold text-gray-500 uppercase">{format(new Date(aviso.created_at), 'dd MMM HH:mm', { locale: es })}</span>
                                        </div>
                                        <h4 className="font-bold text-white text-sm uppercase mb-1">{aviso.titulo}</h4>
                                        <p className="text-xs text-gray-400 mb-3">{aviso.mensaje}</p>
                                        <div className="text-[9px] text-gray-600 font-bold uppercase pt-2 border-t border-white/5">Por: {aviso?.autor?.nombre_completo || 'Staff'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- VISTA EVALUACIONES --- */}
                {isStaff && adminTab === 'evaluaciones' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in">
                        <div className="lg:col-span-4 space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/10 pb-2">
                                <BookOpen size={16} className="text-[#D4E655]" /> Clases Formación
                            </h3>
                            {materias.map((mat: any) => (
                                <div key={mat.id} className={`bg-[#111] border rounded-xl p-4 transition-all ${selectedMateria?.id === mat.id ? 'border-[#D4E655]' : 'border-white/5 hover:border-white/20'}`}>
                                    <div className="flex justify-between mb-1">
                                        <span className="text-[9px] font-bold text-gray-500 uppercase">Nivel {mat.liga_nivel}</span>
                                        {mat.proxima_clase && <span className="text-[9px] text-[#D4E655] font-bold uppercase">{format(parseSafeDate(mat.proxima_clase), "d MMM • HH:mm", { locale: es })}</span>}
                                    </div>
                                    <h4 className="font-black text-white uppercase text-sm truncate mb-3">{mat.nombre}</h4>

                                    <div className="flex gap-2">
                                        <button onClick={() => cargarAlumnos(mat)} className="flex-1 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold py-2 rounded-lg transition-all text-center">
                                            Evaluar
                                        </button>
                                        <Link href={`/clase/${mat.id}`} className="flex-1 bg-[#D4E655]/10 hover:bg-[#D4E655] text-[#D4E655] hover:text-black text-[10px] font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-1">
                                            <Users size={12} /> Asistencia
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="lg:col-span-8 bg-[#09090b] border border-white/5 rounded-3xl p-6 min-h-[400px]">
                            {selectedMateria ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {alumnosList.map((alumno: any) => (
                                        <div key={alumno.id} className="bg-[#111] border border-white/5 rounded-xl p-4 flex items-center justify-between">
                                            <div>
                                                <h4 className="font-bold text-white text-sm capitalize">{alumno.nombre_completo}</h4>
                                                {alumno.evaluacion ? <span className="text-[10px] font-black uppercase text-green-500 tracking-widest">Nota: {alumno.evaluacion.nota_final}</span> : <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Pendiente</span>}
                                            </div>
                                            <button onClick={() => abrirModalEvaluacion(alumno)} className="bg-white/5 hover:bg-[#D4E655] text-white hover:text-black w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0"><ClipboardEdit size={16} /></button>
                                        </div>
                                    ))}
                                </div>
                            ) : <div className="flex flex-col items-center justify-center h-full text-gray-600 uppercase font-black text-xs opacity-50"><ClipboardEdit size={48} className="mb-4" /> Seleccioná una materia para evaluar</div>}
                        </div>
                    </div>
                )}

                {/* --- VISTA ALUMNO DASHBOARD --- */}
                {!isStaff && (
                    <div className="space-y-6 animate-in fade-in">
                        {/* MATERIAL DE ESTUDIO (PDFs) de su nivel — solo lectura */}
                        <MaterialesPanel tipo="liga" ligaNivel={nivelActual} canUpload={false} accent="lime" />

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">

                                <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4E655]/5 rounded-full blur-2xl -mr-10 -mt-10" />
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 relative z-10">
                                        <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2"><Activity size={20} className="text-[#D4E655]" /> Mi Asistencia</h3>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button onClick={() => setRangoActivo(v => !v)} className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${rangoActivo ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}>
                                                {rangoActivo ? 'Por Rango' : 'Por Mes'}
                                            </button>
                                            {rangoActivo ? (
                                                <div className="flex items-center gap-1.5">
                                                    <input type="date" value={fechaDesde} max={fechaHasta} onChange={e => onChangeDesde(e.target.value)} className="bg-[#111] border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white outline-none focus:border-[#D4E655] [color-scheme:dark]" />
                                                    <span className="text-gray-600 text-xs">→</span>
                                                    <input type="date" value={fechaHasta} min={fechaDesde} onChange={e => onChangeHasta(e.target.value)} className="bg-[#111] border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white outline-none focus:border-[#D4E655] [color-scheme:dark]" />
                                                </div>
                                            ) : (
                                                <span className="text-[9px] font-bold text-gray-400 bg-white/5 px-2 py-1 rounded-md border border-white/10 uppercase tracking-widest">Mes {mesDashboard}/{anioDashboard}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[10px] font-black uppercase tracking-widest relative z-10">
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl bg-green-500/10 text-green-500 border border-green-500/20">
                                            <CheckCircle2 size={18} className="mb-1" />
                                            <span className="text-lg leading-none">{asistenciaAlumna.presentes}</span>
                                            <span className="opacity-70">Presentes</span>
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20">
                                            <XCircle size={18} className="mb-1" />
                                            <span className="text-lg leading-none">{asistenciaAlumna.ausentes}</span>
                                            <span className="opacity-70">Ausentes</span>
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                                            <Clock size={18} className="mb-1" />
                                            <span className="text-lg leading-none">{asistenciaAlumna.medias_faltas}</span>
                                            <span className="opacity-70 text-center">Medias<br />Faltas</span>
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                            <FileText size={18} className="mb-1" />
                                            <span className="text-lg leading-none">{asistenciaAlumna.justificadas}</span>
                                            <span className="opacity-70">Justific.</span>
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 col-span-2 md:col-span-1">
                                            <Eye size={18} className="mb-1" />
                                            <span className="text-lg leading-none">{asistenciaAlumna.saf}</span>
                                            <span className="opacity-70">S.A.F.</span>
                                        </div>
                                    </div>

                                    {/* 🚀 DESGLOSE POR MATERIA (para que no aparezca todo mezclado) */}
                                    {asistenciaAlumna.desglose && Object.keys(asistenciaAlumna.desglose).length > 0 && (
                                        <div className="mt-6 pt-6 border-t border-white/5 relative z-10">
                                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Detalle por Materia</h4>
                                            <div className="space-y-2">
                                                {Object.entries(asistenciaAlumna.desglose).map(([nombreMateria, statsMat]: [string, any]) => (
                                                    <div key={nombreMateria} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#111] p-3 rounded-xl border border-white/5">
                                                        <span className="text-[10px] font-bold text-white uppercase truncate flex-1 leading-tight pr-2">{nombreMateria}</span>
                                                        <div className="flex items-center justify-end gap-2.5 shrink-0 text-[9px] font-black tracking-widest uppercase">
                                                            {statsMat.presentes > 0 && <span className="text-green-500 flex items-center gap-0.5" title="Presentes"><CheckCircle2 size={10} /> {statsMat.presentes}</span>}
                                                            {statsMat.ausentes > 0 && <span className="text-red-500 flex items-center gap-0.5" title="Ausentes"><XCircle size={10} /> {statsMat.ausentes}</span>}
                                                            {statsMat.medias_faltas > 0 && <span className="text-yellow-500 flex items-center gap-0.5" title="Media Falta"><Clock size={10} /> {statsMat.medias_faltas}</span>}
                                                            {statsMat.justificadas > 0 && <span className="text-blue-500 flex items-center gap-0.5" title="Justificadas"><FileText size={10} /> {statsMat.justificadas}</span>}
                                                            {statsMat.saf > 0 && <span className="text-purple-400 flex items-center gap-0.5" title="SAF"><Eye size={10} /> {statsMat.saf}</span>}
                                                            {statsMat.total > 0 && <span className="text-gray-500 flex items-center gap-0.5" title="Total clases">/ {statsMat.total}</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6">
                                    <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6"><BookOpen size={20} className="text-[#D4E655]" /> Mis Disciplinas</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {materias.map((materia: any) => (
                                            <div key={materia.id} className="bg-[#111] border border-white/5 rounded-2xl p-5 flex flex-col relative overflow-hidden group hover:border-[#D4E655]/30 transition-all">
                                                <h4 className="font-black text-xl uppercase tracking-tighter text-white mb-1 truncate">{materia.nombre}</h4>
                                                <p className="text-[10px] text-gray-400 mb-5 uppercase font-bold tracking-widest">Prof: {materia.profesor}</p>

                                                <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                                                    {materia.evaluacion ? (
                                                        <>
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Nota Final</span>
                                                                <span className={`text-3xl font-black leading-none ${materia.evaluacion.aprobado ? 'text-green-500' : 'text-red-500'}`}>{materia.evaluacion.nota_final}</span>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    if (deudaCuota) return toast.error('Tenés que abonar tu saldo para ver tu boletín completo.')
                                                                    setSelectedBoletin(materia); setBoletinModalOpen(true);
                                                                }}
                                                                className="bg-white/5 hover:bg-[#D4E655] text-white hover:text-black text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-2 transition-all"
                                                            >
                                                                <FileText size={14} /> Boletín
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div className="w-full text-center">
                                                            <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Evaluación en proceso</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="lg:col-span-1">
                                <div className="bg-[#111] border border-white/5 rounded-3xl p-6 sticky top-8">
                                    <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-6 text-white"><Megaphone size={18} className="text-[#D4E655]" /> Avisos</h3>
                                    <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                                        {avisos.length === 0 ? <p className="text-xs text-gray-500 uppercase font-bold text-center py-8">Sin avisos recientes</p> : null}
                                        {avisos.map((aviso: any) => (
                                            <div key={aviso.id} className="bg-black/40 border-l-2 border-[#D4E655] p-4 rounded-r-lg">
                                                <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">{format(new Date(aviso.created_at), 'dd MMM yyyy', { locale: es })}</span>
                                                <h4 className="font-bold text-white text-xs sm:text-sm uppercase mb-2">{aviso.titulo}</h4>
                                                <p className="text-[10px] sm:text-xs text-gray-400 leading-relaxed">{aviso.mensaje}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                                <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2">
                                    <Calendar size={20} className="text-[#D4E655]" /> Mis clases del mes
                                </h3>
                            </div>

                            {clasesDelMes.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {clasesDelMes.map((clase: any) => {
                                        const [fechaParte, horaParte] = clase.inicio.split('T')
                                        const horaDisplay = horaParte ? horaParte.substring(0, 5) : ''
                                        const dateObj = new Date(`${fechaParte}T12:00:00`)
                                        const esHoy = isToday(dateObj)
                                        const yaPaso = dateObj < new Date(new Date().setHours(0, 0, 0, 0))
                                        const [finFecha, finHora] = clase.fin.split('T')
                                        const finDisplay = finHora ? finHora.substring(0, 5) : ''

                                        return (
                                            <div key={clase.id} className={`bg-[#111] border border-white/5 rounded-2xl overflow-hidden hover:border-[#D4E655]/30 transition-all group flex flex-col ${yaPaso ? 'opacity-70 hover:opacity-100' : ''}`}>
                                                <div className="h-32 w-full relative bg-[#1a1a1c] border-b border-white/5 flex items-center justify-center overflow-hidden">
                                                    {clase.imagen_url ? (
                                                        <Image src={clase.imagen_url} alt={clase.nombre} fill className={`object-cover transition-transform duration-500 ${yaPaso ? 'grayscale-[50%]' : 'group-hover:scale-105'}`} />
                                                    ) : (
                                                        <ImageIcon size={24} className="text-white/20" />
                                                    )}

                                                    {yaPaso ? (
                                                        <>
                                                            {clase.mi_estado_asistencia === 'presente' && <span className="absolute top-3 left-3 bg-green-500 text-black text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg flex items-center gap-1"><CheckCircle2 size={10} /> Presente</span>}
                                                            {clase.mi_estado_asistencia === 'ausente' && <span className="absolute top-3 left-3 bg-red-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg flex items-center gap-1"><XCircle size={10} /> Ausente</span>}
                                                            {clase.mi_estado_asistencia === 'media_falta' && <span className="absolute top-3 left-3 bg-yellow-500 text-black text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg flex items-center gap-1"><Clock size={10} /> Media Falta</span>}
                                                            {clase.mi_estado_asistencia === 'justificada' && <span className="absolute top-3 left-3 bg-blue-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg flex items-center gap-1"><FileText size={10} /> Justificada</span>}
                                                            {clase.mi_estado_asistencia === 'saf' && <span className="absolute top-3 left-3 bg-purple-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg flex items-center gap-1"><Eye size={10} /> S.A.F.</span>}
                                                            {!clase.estoy_inscripto && <span className="absolute top-3 left-3 bg-gray-800 text-gray-400 text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg">Ausente (No anotado)</span>}
                                                        </>
                                                    ) : (
                                                        <>
                                                            {clase.estoy_inscripto && <span className="absolute top-3 left-3 bg-blue-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg">Inscripto</span>}
                                                            {esHoy && <span className="absolute top-3 right-3 bg-[#D4E655] text-black text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg">⚡ Hoy</span>}
                                                        </>
                                                    )}
                                                </div>

                                                <div className="p-5 flex-1">
                                                    <h4 className="font-black uppercase text-white mb-1 truncate text-lg">{clase.nombre}</h4>
                                                    <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-4">
                                                        <User size={12} className="text-[#D4E655]" /> {clase.profesor?.nombre_completo}
                                                    </p>
                                                    <div className="space-y-2 border-t border-white/5 pt-4">
                                                        <p className="text-[10px] uppercase font-bold text-gray-500">Día de Clase:</p>
                                                        <div className="flex items-center gap-3 text-xs text-gray-300 font-bold">
                                                            <Calendar size={14} className="text-[#D4E655]" />
                                                            <span className="capitalize">{format(dateObj, "EEEE d MMMM", { locale: es })}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-xs text-gray-400">
                                                            <Clock size={14} className="text-white/30" />
                                                            <span>{horaDisplay} a {finDisplay} hs</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-xs text-gray-400">
                                                            <MapPin size={14} className="text-white/30" />
                                                            <span>{clase.sala?.nombre} <span className="text-[9px] opacity-50 uppercase border border-white/20 px-1 rounded ml-1">Sede {clase.sala?.sede?.nombre}</span></span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                                    <Calendar size={32} className="mx-auto mb-3 text-gray-600" />
                                    <p className="text-gray-500 font-bold uppercase text-sm">Sin clases programadas en {mesDashboard}/{anioDashboard}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL: REGISTRAR PAGO/SEÑA */}
            {isPagoModalOpen && alumnoPago && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsPagoModalOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase flex items-center gap-2"><Coins className="text-emerald-500" size={18} /> Registrar Pago La Liga</h3>
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
                                <select
                                    value={metodoPago}
                                    onChange={e => {
                                        const newMethod = e.target.value;
                                        setMetodoPago(newMethod);
                                        if (alumnoPago) {
                                            setMontoPago(newMethod === 'efectivo' ? (alumnoPago.saldoPendienteEfectivo || 0) : (alumnoPago.saldoPendiente || 0));
                                        }
                                    }}
                                    className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors appearance-none"
                                >
                                    <option value="efectivo">Efectivo (Recepción)</option>
                                    <option value="transferencia">Transferencia Bancaria</option>
                                    <option value="mercadopago_manual">Mercado Pago (QR Físico)</option>
                                    <option value="otro">Otro</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Monto a Registrar ($)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={montoPago}
                                        onChange={e => setMontoPago(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white font-black outline-none focus:border-emerald-500 transition-colors"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-500 text-right mt-1">Saldo sugerido: Efvo ${alumnoPago.saldoPendienteEfectivo} / Otros ${alumnoPago.saldoPendiente}</p>
                            </div>

                            <button disabled={registrandoPago} type="submit" className="w-full bg-emerald-600 text-white font-black uppercase py-4 rounded-xl hover:bg-emerald-500 transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg mt-4">
                                {registrandoPago ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={16} /> Guardar Registro</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL ASIGNAR BECA */}
            {canManage && becaModalOpen && selectedAlumnoBeca && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setBecaModalOpen(false)}>
                    <div className="w-full max-w-sm bg-[#09090b] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-white/5 bg-[#111] flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-black uppercase text-white tracking-tighter leading-none">Porcentaje Beca</h3>
                                <p className="text-[#D4E655] text-xs font-bold uppercase mt-1">{selectedAlumnoBeca.nombre_completo}</p>
                            </div>
                            <button onClick={() => setBecaModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                        </div>
                        <div className="p-6">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Descuento aplicado (%)</label>
                            <input type="number" min="0" max="100" value={becaValue} onChange={e => setBecaValue(Number(e.target.value))} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm font-black outline-none focus:border-[#D4E655] text-center" />
                            <p className="text-[9px] text-gray-500 mt-3 text-center leading-relaxed">Este descuento se aplicará automáticamente a la cuota de La Liga cuando se genere el link de pago.</p>
                        </div>
                        <div className="p-4 border-t border-white/5 bg-[#111] flex justify-end gap-3 shrink-0">
                            <button onClick={() => setBecaModalOpen(false)} className="px-6 py-3 font-bold text-gray-400 text-xs uppercase">Cancelar</button>
                            <button onClick={async () => {
                                setGuardandoBeca(true)
                                const res = await asignarBecaAction(selectedAlumnoBeca.id, becaValue)
                                if (res.success) { toast.success('Beca actualizada'); mutate(); setBecaModalOpen(false) }
                                else { toast.error('Error al guardar') }
                                setGuardandoBeca(false)
                            }} disabled={guardandoBeca} className="px-8 py-3 bg-[#D4E655] text-black font-black uppercase rounded-xl text-xs flex items-center gap-2">
                                {guardandoBeca ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL EVALUACIÓN */}
            {isStaff && evalModalOpen && selectedAlumno && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setEvalModalOpen(false)}>
                    <div className="w-full max-w-5xl max-h-[95vh] bg-[#09090b] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-white/5 bg-[#111] flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-2xl font-black uppercase text-white tracking-tighter leading-none">Evaluación Cuatrimestral</h3>
                                <p className="text-[#D4E655] text-xs font-bold uppercase mt-1">{selectedAlumno.nombre_completo}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest block">Promedio</span>
                                <span className={`text-3xl font-black leading-none ${parseFloat(calcularPromedio() as string) >= 6 ? 'text-green-500' : 'text-red-500'}`}>{calcularPromedio()}</span>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {criterios.map((crit: any, idx: number) => (
                                    <div key={idx} className="bg-[#111] border border-white/5 p-3 rounded-xl flex items-center justify-between gap-3 transition-colors">
                                        <label className="text-[10px] text-gray-300 font-bold uppercase flex-1">{crit.nombre}</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="10"
                                            value={notas[crit.nombre] || 0}
                                            onChange={e => {
                                                let val = parseInt(e.target.value) || 0;
                                                if (val > 10) val = 10;
                                                if (val < 0) val = 0;
                                                setNotas({ ...notas, [crit.nombre]: val })
                                            }}
                                            className="w-14 bg-black border border-white/10 rounded p-2 text-center text-white font-black text-sm outline-none focus:border-[#D4E655]"
                                        />
                                    </div>
                                ))}
                                {criterios.length === 0 && <p className="col-span-full text-xs text-gray-500 italic mt-2">No hay ítems de evaluación cargados en el sistema.</p>}
                            </div>
                            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Comentarios..." className="w-full mt-8 bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none h-32" />
                        </div>
                        <div className="p-4 border-t border-white/5 bg-[#111] flex justify-end gap-3 shrink-0">
                            <button onClick={() => setEvalModalOpen(false)} className="px-6 py-3 font-bold text-gray-400 text-xs uppercase">Cancelar</button>
                            <button onClick={guardarEvaluacion} disabled={guardandoEval} className="px-8 py-3 bg-[#D4E655] text-black font-black uppercase rounded-xl text-xs">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL BOLETÍN */}
            {!isStaff && boletinModalOpen && selectedBoletin?.evaluacion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setBoletinModalOpen(false)}>
                    <div className="w-full max-w-4xl max-h-[95vh] bg-[#09090b] border border-[#D4E655]/30 rounded-2xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-8 border-b border-white/5 bg-[#111] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shrink-0">
                            <div>
                                <span className="text-[#D4E655] font-bold text-[10px] tracking-[0.2em] uppercase">Boletín Oficial</span>
                                <h3 className="text-3xl font-black uppercase text-white tracking-tighter leading-none mb-1">{selectedBoletin.nombre}</h3>
                                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Prof: {selectedBoletin.profesor}</p>
                            </div>
                            <div className="bg-black/50 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                                <div>
                                    <span className="text-[9px] text-gray-500 font-bold uppercase block mb-1">Nota Final</span>
                                    <span className={`text-4xl font-black leading-none ${selectedBoletin.evaluacion.aprobado ? 'text-[#D4E655]' : 'text-red-500'}`}>{selectedBoletin.evaluacion.nota_final}</span>
                                </div>
                                <div className="border-l border-white/10 pl-4 flex flex-col items-center">
                                    {selectedBoletin.evaluacion.aprobado ? <CheckCircle2 size={24} className="text-green-500 mb-1" /> : <AlertTriangle size={24} className="text-red-500 mb-1" />}
                                    <span className="text-[9px] font-black uppercase tracking-widest">{selectedBoletin.evaluacion.aprobado ? 'Aprobado' : 'A Recuperar'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#09090b]">
                            {selectedBoletin.evaluacion.observaciones_docente && (
                                <div className="mb-8">
                                    <h4 className="text-xs font-black uppercase text-white tracking-widest border-b border-white/10 pb-2 mb-4">Devolución</h4>
                                    <p className="text-sm text-gray-300 italic">"{selectedBoletin.evaluacion.observaciones_docente}"</p>
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {Object.entries(selectedBoletin.evaluacion.criterios_notas || {}).map(([criterio, nota]: [string, any], idx) => (
                                    nota > 0 && (
                                        <div key={idx} className="bg-[#111] border border-white/5 rounded-lg p-3 flex justify-between items-center group hover:bg-white/5 transition-colors">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase leading-tight pr-2">{criterio}</span>
                                            <span className={`text-sm font-black w-8 h-8 rounded bg-black flex items-center justify-center shrink-0 border border-white/5 ${nota >= 6 ? 'text-green-400' : 'text-red-400'}`}>{nota}</span>
                                        </div>
                                    )
                                ))}
                            </div>
                        </div>
                        <div className="p-4 border-t border-white/5 bg-[#111] text-center">
                            <button onClick={() => setBoletinModalOpen(false)} className="px-12 py-3 bg-white/5 text-white font-black uppercase rounded-xl hover:bg-white hover:text-black transition-all text-xs">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function LaLigaPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12 mb-4" />
                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest animate-pulse">Cargando La Liga...</p>
            </div>
        }>
            <LaLigaContent />
        </Suspense>
    )
}