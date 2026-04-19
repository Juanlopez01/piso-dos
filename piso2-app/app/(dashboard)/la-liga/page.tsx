'use client'

import { createClient } from '@/utils/supabase/client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import {
    Lock, Loader2, AlertTriangle, FileWarning,
    Megaphone, BookOpen, GraduationCap, ChevronRight,
    CheckCircle2, AlertCircle, CalendarX, Users, ClipboardEdit, Save, FileText,
    Search, UserCog, UserMinus, Star, Send, Trash2, Clock, Settings2, TrendingUp, Percent,
    X
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast, Toaster } from 'sonner'
import { useCash } from '@/context/CashContext'

// 🚀 IMPORTAMOS LAS SERVER ACTIONS
import {
    enviarAvisoAction,
    eliminarAvisoAction,
    guardarEvaluacionAction, actualizarPrecioGlobalAction,
    asignarBecaAction
} from '@/app/actions/liga'

// 🚀 IMPORTAMOS LA ACCIÓN "MÁGICA" DE USUARIOS (La que auto-inscribe)
import {

    cambiarLigaAction
} from '@/app/actions/usuarios'

const CRITERIOS_EVALUACION = [
    "Puntualidad", "Asistencia / regularidad", "Compromiso con la clase", "Actitud de trabajo",
    "Disposición para aprender", "Capacidad de recibir correcciones", "Respeto hacia docentes y compañeros",
    "Responsabilidad con tareas o consignas", "Avance técnico durante el período", "Coordinación corporal",
    "Control del movimiento", "Alineación corporal", "Uso del peso y del centro", "Claridad en la ejecución del movimiento",
    "Precisión en secuencias coreográficas", "Memoria corporal / retención de material", "Comprensión del ritmo",
    "Presencia escénica", "Proyección del movimiento", "Calidad interpretativa", "Búsqueda personal en el movimiento",
    "Creatividad", "Disponibilidad corporal", "Presentación personal / cuidado del cuerpo", "Concentración durante el trabajo",
    "Escucha grupal", "Sincronización con compañeros", "Adaptación al trabajo colectivo"
]

const parseSafeDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return new Date()
    const cleanStr = dateStr.replace('+00:00', '').replace('+00', '').replace('Z', '').replace(' ', 'T')
    const parsed = new Date(cleanStr)
    return isNaN(parsed.getTime()) ? new Date() : parsed
}

const fetcherLiga = async (uid: string, supabase: any) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (!profile) throw new Error("No profile")

    const isStaff = ['admin', 'recepcion', 'profesor'].includes(profile.rol)
    const canManage = ['admin', 'recepcion'].includes(profile.rol)
    const nivelAlumno = profile.nivel_liga || profile.nivel || 1

    let queryAvisos = supabase.from('liga_avisos').select('*, autor:profiles!liga_avisos_autor_id_fkey(nombre_completo)').order('created_at', { ascending: false }).limit(30)
    if (profile.rol === 'profesor') {
        queryAvisos = queryAvisos.or(`autor_id.eq.${uid},tipo_destino.eq.general`)
    } else if (!isStaff) {
        queryAvisos = queryAvisos.or(`tipo_destino.eq.general,and(tipo_destino.eq.nivel,nivel_destino.eq.${nivelAlumno}),and(tipo_destino.eq.individual,alumno_id.eq.${uid})`)
    }
    const { data: avisos } = await queryAvisos

    const hoyIso = new Date().toISOString()
    const cuatrimestreActual = '2026-1'

    let queryClases = supabase
        .from('clases')
        .select(`id, nombre, inicio, liga_nivel, profesor_id, profesor:profiles!clases_profesor_id_fkey(nombre_completo)`)
        .eq('es_la_liga', true)
        .neq('estado', 'cancelada')

    if (profile.rol === 'profesor') queryClases = queryClases.eq('profesor_id', uid)
    else if (!isStaff) queryClases = queryClases.eq('liga_nivel', nivelAlumno)

    const { data: dataClases } = await queryClases

    let misEvaluaciones: any[] = []
    let deudaCuota = false

    if (!isStaff) {
        const mesActual = new Date().getMonth() + 1
        const anioActual = new Date().getFullYear()
        const { data: pagoMes } = await supabase.from('liga_pagos').select('id').eq('alumno_id', uid).eq('mes', mesActual).eq('anio', anioActual).maybeSingle()
        deudaCuota = !pagoMes

        const { data: evals } = await supabase.from('liga_evaluaciones').select('*').eq('alumno_id', uid).eq('cuatrimestre', cuatrimestreActual)
        if (evals) misEvaluaciones = evals
    }

    const disciplinasMap: Record<string, any> = {}
    if (dataClases) {
        dataClases.forEach((clase: any) => {
            if (!disciplinasMap[clase.nombre]) {
                disciplinasMap[clase.nombre] = { id: clase.id, nombre: clase.nombre, liga_nivel: clase.liga_nivel, profesor: clase.profesor?.nombre_completo || 'Staff', proxima_clase: null, clases_ids: [] }
            }
            disciplinasMap[clase.nombre].clases_ids.push(clase.id)
            if (clase.inicio >= hoyIso) {
                if (!disciplinasMap[clase.nombre].proxima_clase || clase.inicio < disciplinasMap[clase.nombre].proxima_clase) {
                    disciplinasMap[clase.nombre].proxima_clase = clase.inicio
                    disciplinasMap[clase.nombre].profesor = clase.profesor?.nombre_completo || 'Staff'
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
        const { data: perfiles } = await supabase.from('profiles').select('id, nombre_completo, email, nivel_liga, porcentaje_beca').eq('rol', 'alumno').order('nombre_completo', { ascending: true })
        if (perfiles) allStudents = perfiles.filter((p: any) => p.nombre_completo && p.nombre_completo.trim() !== '')
    }

    let preciosLiga: any[] = []
    if (canManage) {
        const { data: config } = await supabase.from('configuraciones').select('*').like('clave', 'cuota_liga_%')
        preciosLiga = config || []
    }

    const legajoCompleto = isStaff ? true : Boolean(profile.edad && profile.direccion && profile.contacto_emergencia && profile.plan_medico && profile.condiciones_medicas)

    return { profile, isStaff, canManage, legajoCompleto, avisos: avisos || [], materias, deudaCuota, allStudents, preciosLiga }
}

function LaLigaContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [supabase] = useState(() => createClient())
    const { userId, isLoading: loadingContext } = useCash()

    const { data, isLoading: loadingSWR, mutate, error } = useSWR(
        !loadingContext && userId ? ['liga-data', userId] : null,
        ([_, uid]) => fetcherLiga(uid as string, supabase),
        { revalidateOnFocus: false }
    )

    const pagoNotificado = useRef(false)
    const [procesandoPago, setProcesandoPago] = useState(false)
    const [adminTab, setAdminTab] = useState<'evaluaciones' | 'gestion' | 'comunicados' | 'precios'>('evaluaciones')
    const [selectedMateria, setSelectedMateria] = useState<any>(null)
    const [alumnosList, setAlumnosList] = useState<any[]>([])
    const [loadingAlumnos, setLoadingAlumnos] = useState(false)

    // 🚀 Búsqueda y Filtros
    const [searchStudent, setSearchStudent] = useState('')
    const [levelFilter, setLevelFilter] = useState<'todos' | '1' | '2'>('todos') // Nuevo estado para los botones

    // Precios
    const [preciosEdit, setPreciosEdit] = useState<Record<string, string>>({})
    const [guardandoPrecios, setGuardandoPrecios] = useState(false)

    // Beca Modal
    const [becaModalOpen, setBecaModalOpen] = useState(false)
    const [selectedAlumnoBeca, setSelectedAlumnoBeca] = useState<any>(null)
    const [becaValue, setBecaValue] = useState(0)
    const [guardandoBeca, setGuardandoBeca] = useState(false)

    // Forms
    const [avisoForm, setAvisoForm] = useState({ titulo: '', mensaje: '', tipo_destino: 'general', nivel_destino: 1, alumno_id: '' })
    const [enviandoAviso, setEnviandoAviso] = useState(false)

    // Modales
    const [evalModalOpen, setEvalModalOpen] = useState(false)
    const [selectedAlumno, setSelectedAlumno] = useState<any>(null)
    const [notas, setNotas] = useState<Record<string, number>>({})
    const [observaciones, setObservaciones] = useState('')
    const [guardandoEval, setGuardandoEval] = useState(false)
    const [boletinModalOpen, setBoletinModalOpen] = useState(false)
    const [selectedBoletin, setSelectedBoletin] = useState<any>(null)

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

    if (loadingSWR || loadingContext) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12 mb-4" />
                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest animate-pulse">Cargando La Liga...</p>
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

    const { profile, isStaff, canManage, legajoCompleto, avisos, materias, deudaCuota, allStudents } = data
    const nivelActual = profile.nivel_liga || profile.nivel || 1

    // 🚀 LÓGICA DE FILTRADO (Buscador + Botones)
    const filteredStudents = allStudents.filter((s: any) => {
        const matchesSearch = (s.nombre_completo || '').toLowerCase().includes(searchStudent.toLowerCase())
        const matchesLevel = levelFilter === 'todos' ? true : String(s.nivel_liga) === levelFilter
        return matchesSearch && matchesLevel
    })

    const handleGuardarPrecios = async () => {
        setGuardandoPrecios(true)
        try {
            for (const clave in preciosEdit) {
                await actualizarPrecioGlobalAction(clave, Number(preciosEdit[clave]))
            }
            toast.success("Precios de cuotas actualizados")
            mutate()
        } catch (e) {
            toast.error("Error al guardar precios")
        } finally {
            setGuardandoPrecios(false)
        }
    }

    const generarLinkPagoLiga = async () => {
        setProcesandoPago(true)
        try {
            const mesActual = new Date().getMonth() + 1
            const anioActual = new Date().getFullYear()

            const clavePrecio = `cuota_liga_${nivelActual}`
            const precioBase = data.preciosLiga.find((p: any) => p.clave === clavePrecio)?.valor || 15000
            const porcentajeBeca = profile.porcentaje_beca || 0
            const precioFinal = precioBase - (precioBase * porcentajeBeca / 100)

            const res = await fetch('/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo: `Cuota La Liga - Mes ${mesActual}/${anioActual}`,
                    precio: precioFinal,
                    userId: userId,
                    tipo_pago: 'cuota_liga',
                    mes: mesActual,
                    anio: anioActual
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

    // 🚀 AHORA USA LA ACCIÓN MÁGICA CON AUTO-INSCRIPCIÓN
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
        CRITERIOS_EVALUACION.forEach(crit => notasIniciales[crit] = 0)
        setNotas(notasIniciales)
        setEvalModalOpen(true)
    }

    const calcularPromedio = () => {
        const valores = Object.values(notas).filter(v => v > 0)
        if (valores.length === 0) return 0
        const suma = valores.reduce((a, b) => a + b, 0)
        return (suma / valores.length).toFixed(2)
    }

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
                            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none">
                                La Liga {isStaff && <span className="text-gray-500 text-2xl">/ Staff</span>}
                            </h1>
                        </div>
                        {!isStaff && (
                            <span className="bg-[#D4E655] text-black px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest shadow-[0_0_15px_rgba(212,230,85,0.2)]">
                                Nivel {nivelActual}
                            </span>
                        )}
                    </div>

                    {isStaff && (
                        <div className="flex gap-6 border-b border-white/10 relative z-10 mt-2 overflow-x-auto custom-scrollbar">
                            <button onClick={() => setAdminTab('evaluaciones')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === 'evaluaciones' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                <ClipboardEdit size={14} className="inline mr-2 -mt-1" /> Evaluaciones
                            </button>
                            <button onClick={() => setAdminTab('comunicados')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === 'comunicados' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                <Megaphone size={14} className="inline mr-2 -mt-1" /> Comunicados
                            </button>
                            {canManage && (
                                <>
                                    <button onClick={() => setAdminTab('gestion')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === 'gestion' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                        <UserCog size={14} className="inline mr-2 -mt-1" /> Padrón
                                    </button>
                                    <button onClick={() => setAdminTab('precios')} className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === 'precios' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}>
                                        <Settings2 size={14} className="inline mr-2 -mt-1" /> Precios Cuotas
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">

                {!isStaff && (deudaCuota) && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="font-black text-red-500 uppercase text-xs tracking-widest mb-1">Cuota Vencida</h4>
                                <p className="text-gray-400 text-[10px] sm:text-xs">Tenés pendiente la cuota de este mes. Abonala para ver tu boletín.</p>
                            </div>
                        </div>
                        <button onClick={generarLinkPagoLiga} disabled={procesandoPago} className="shrink-0 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                            {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : 'Pagar Online con MP'}
                        </button>
                    </div>
                )}

                {canManage && adminTab === 'precios' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
                        <div className="bg-[#09090b] border border-white/5 rounded-3xl p-8 shadow-xl">
                            <h3 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-8">
                                <Settings2 className="text-[#D4E655]" /> Configurar Aranceles
                            </h3>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Cuota Liga Nivel 1 ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                        <input type="number" value={preciosEdit['cuota_liga_1'] || ''} onChange={e => setPreciosEdit({ ...preciosEdit, cuota_liga_1: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 pl-10 pr-4 text-white font-black text-lg outline-none focus:border-[#D4E655] transition-all" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Cuota Liga Nivel 2 ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                        <input type="number" value={preciosEdit['cuota_liga_2'] || ''} onChange={e => setPreciosEdit({ ...preciosEdit, cuota_liga_2: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 pl-10 pr-4 text-white font-black text-lg outline-none focus:border-[#D4E655] transition-all" />
                                    </div>
                                </div>
                                <button onClick={handleGuardarPrecios} disabled={guardandoPrecios} className="w-full bg-[#D4E655] text-black font-black uppercase py-5 rounded-2xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-[#D4E655]/10 mt-4">
                                    {guardandoPrecios ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Actualizar Precios</>}
                                </button>
                            </div>
                        </div>
                        <div className="bg-[#111] border border-white/5 rounded-3xl p-8 flex flex-col justify-center text-center">
                            <TrendingUp className="text-gray-700 w-16 h-16 mx-auto mb-4" />
                            <h4 className="text-white font-black uppercase text-sm mb-2">Información de Cobro</h4>
                            <p className="text-gray-500 text-xs leading-relaxed max-w-xs mx-auto">
                                Estos valores se aplican automáticamente como precio base al alumno. El sistema luego calculará el porcentaje de beca individual (si el alumno lo tiene) antes de efectuar el cobro.
                            </p>
                        </div>
                    </div>
                )}

                {canManage && adminTab === 'gestion' && (
                    <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6 shadow-xl animate-in fade-in">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-6 border-b border-white/5">
                            <h3 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2"><Users size={24} className="text-[#D4E655]" /> Padrón de Alumnos</h3>
                            <div className="relative w-full md:w-72">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input type="text" placeholder="Buscar..." value={searchStudent} onChange={(e) => setSearchStudent(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-xs font-bold outline-none focus:border-[#D4E655]" />
                            </div>
                        </div>

                        {/* 🚀 BOTONES DE FILTRO DE NIVEL */}
                        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar">
                            <button onClick={() => setLevelFilter('todos')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${levelFilter === 'todos' ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Todos</button>
                            <button onClick={() => setLevelFilter('1')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${levelFilter === '1' ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Nivel 1</button>
                            <button onClick={() => setLevelFilter('2')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${levelFilter === '2' ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Nivel 2</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredStudents.map((alumno: any) => (
                                <div key={alumno.id} className="bg-[#111] border border-white/5 rounded-xl p-4 flex flex-col justify-between gap-4 group hover:border-white/20 transition-all">
                                    <div>
                                        <h4 className="font-black text-white text-sm capitalize truncate">{alumno.nombre_completo}</h4>
                                        <span className="mt-1 inline-flex items-center gap-1 bg-[#D4E655]/10 text-[#D4E655] border border-[#D4E655]/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                            <Star size={10} className="fill-[#D4E655]/50" /> Nivel {alumno.nivel_liga || '-'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 border-t border-white/5 pt-3">
                                        <button onClick={() => cambiarNivelLiga(alumno.id, 1)} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-colors ${alumno.nivel_liga == 1 ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Nivel 1</button>
                                        <button onClick={() => cambiarNivelLiga(alumno.id, 2)} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-colors ${alumno.nivel_liga == 2 ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Nivel 2</button>

                                        <button onClick={() => { setSelectedAlumnoBeca(alumno); setBecaValue(alumno.porcentaje_beca || 0); setBecaModalOpen(true); }} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-colors ${alumno.porcentaje_beca > 0 ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black' : 'bg-white/5 text-gray-400 hover:bg-emerald-500 hover:text-black'}`}>
                                            <Percent size={12} /> {alumno.porcentaje_beca > 0 ? `${alumno.porcentaje_beca}%` : ''}
                                        </button>

                                        <button onClick={() => cambiarNivelLiga(alumno.id, null)} className="shrink-0 bg-red-500/10 hover:bg-red-500 text-red-500 px-3 py-2 rounded-lg text-[10px] font-black"><UserMinus size={14} /></button>
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
                            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/10 pb-2"><BookOpen size={16} className="text-[#D4E655]" /> Clases Formación</h3>
                            {materias.map((mat: any) => (
                                <div key={mat.id} onClick={() => cargarAlumnos(mat)} className={`bg-[#111] border rounded-xl p-4 cursor-pointer transition-all ${selectedMateria?.id === mat.id ? 'border-[#D4E655]' : 'border-white/5 hover:border-white/20'}`}>
                                    <div className="flex justify-between mb-1">
                                        <span className="text-[9px] font-bold text-gray-500 uppercase">Nivel {mat.liga_nivel}</span>
                                        {mat.proxima_clase && <span className="text-[9px] text-[#D4E655] font-bold uppercase">{format(parseSafeDate(mat.proxima_clase), "d MMM • HH:mm", { locale: es })}</span>}
                                    </div>
                                    <h4 className="font-black text-white uppercase text-sm truncate">{mat.nombre}</h4>
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
                            ) : <div className="flex flex-col items-center justify-center h-full text-gray-600 uppercase font-black text-xs opacity-50"><ClipboardEdit size={48} className="mb-4" /> Seleccioná una materia</div>}
                        </div>
                    </div>
                )}

                {/* --- VISTA ALUMNO DASHBOARD --- */}
                {!isStaff && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6 min-h-[400px]">
                                <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6"><BookOpen size={20} className="text-[#D4E655]" /> Mis Disciplinas</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {materias.map((materia: any) => (
                                        <div key={materia.id} onClick={() => {
                                            if (deudaCuota) return toast.error('Tenés que abonar para ver tu boletín.')
                                            if (materia.evaluacion) { setSelectedBoletin(materia); setBoletinModalOpen(true) }
                                            else toast.info('Evaluación pendiente.')
                                        }} className={`bg-[#111] border ${materia.evaluacion ? 'border-[#D4E655]/30 cursor-pointer hover:border-[#D4E655]' : 'border-white/5'} rounded-2xl p-5 flex flex-col relative overflow-hidden`}>
                                            <h4 className="font-black text-xl uppercase tracking-tighter text-white mb-1 truncate">{materia.nombre}</h4>
                                            <p className="text-[10px] text-gray-400 mb-5 uppercase font-bold tracking-widest">Prof: {materia.profesor}</p>
                                            <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-center">
                                                {materia.evaluacion ? <span className="bg-[#D4E655] text-black text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg flex items-center gap-2 w-full justify-center"><FileText size={14} /> Boletín</span> : <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">En Proceso</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-1">
                            <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                                <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-6 text-white"><Megaphone size={18} className="text-[#D4E655]" /> Avisos</h3>
                                <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
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
                )}
            </div>

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
                                {CRITERIOS_EVALUACION.map((crit, idx) => (
                                    <div key={idx} className="bg-[#111] border border-white/5 p-3 rounded-xl flex items-center justify-between gap-3 transition-colors">
                                        <label className="text-[10px] text-gray-300 font-bold uppercase flex-1">{crit}</label>
                                        <input type="number" min="0" max="10" value={notas[crit] || 0} onChange={e => { let val = parseInt(e.target.value) || 0; if (val > 10) val = 10; if (val < 0) val = 0; setNotas({ ...notas, [crit]: val }) }} className="w-14 bg-black border border-white/10 rounded p-2 text-center text-white font-black text-sm outline-none focus:border-[#D4E655]" />
                                    </div>
                                ))}
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