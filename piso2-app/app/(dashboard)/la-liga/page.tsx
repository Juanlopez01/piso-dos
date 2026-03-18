'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Lock, Loader2, AlertTriangle, FileWarning,
    Megaphone, BookOpen, GraduationCap, ChevronRight,
    CheckCircle2, AlertCircle, CalendarX, Users, ClipboardEdit, Save, FileText,
    Search, UserCog, UserMinus, Star, Send, Trash2, Clock
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast, Toaster } from 'sonner'

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

export default function LaLigaPage() {
    const supabase = createClient()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [profile, setProfile] = useState<any>(null)
    const [legajoCompleto, setLegajoCompleto] = useState(false)
    const [avisos, setAvisos] = useState<any[]>([])
    const [materias, setMaterias] = useState<any[]>([])
    const [deudaCuota, setDeudaCuota] = useState(false)
    const [procesandoPago, setProcesandoPago] = useState(false)

    // --- ESTADOS DOCENTE / ADMIN ---
    const [adminTab, setAdminTab] = useState<'evaluaciones' | 'gestion' | 'comunicados'>('evaluaciones')
    const [selectedMateria, setSelectedMateria] = useState<any>(null)
    const [alumnosList, setAlumnosList] = useState<any[]>([])
    const [loadingAlumnos, setLoadingAlumnos] = useState(false)

    // --- ESTADOS GESTIÓN DE ALUMNOS (ADMIN) ---
    const [allStudents, setAllStudents] = useState<any[]>([])
    const [searchStudent, setSearchStudent] = useState('')
    const [loadingGestion, setLoadingGestion] = useState(false)

    // --- ESTADOS COMUNICADOS ---
    const [avisoForm, setAvisoForm] = useState({ titulo: '', mensaje: '', tipo_destino: 'general', nivel_destino: 1, alumno_id: '' })
    const [enviandoAviso, setEnviandoAviso] = useState(false)

    // Modal Evaluación
    const [evalModalOpen, setEvalModalOpen] = useState(false)
    const [selectedAlumno, setSelectedAlumno] = useState<any>(null)
    const [notas, setNotas] = useState<Record<string, number>>({})
    const [observaciones, setObservaciones] = useState('')
    const [guardandoEval, setGuardandoEval] = useState(false)

    // Modal Boletín (Alumno)
    const [boletinModalOpen, setBoletinModalOpen] = useState(false)
    const [selectedBoletin, setSelectedBoletin] = useState<any>(null)

    const inicializado = useRef(false)

    // ==========================================
    // 1. CARGA INICIAL (BLINDADA CONTRA COLD BOOT)
    // ==========================================
    useEffect(() => {
        if (inicializado.current) return
        inicializado.current = true

        // ESCUDO 1: Temporizador de emergencia de 5 segundos
        const failsafeTimeout = setTimeout(() => {
            console.warn("Failsafe: La carga tardó demasiado, apagando loader.");
            setLoading(false);
        }, 5000);

        const fetchLaLigaData = async () => {
            try {
                setLoading(true)

                // ESCUDO 2: Leemos Mercado Pago directo de la URL
                const urlParams = new URLSearchParams(window.location.search)
                const pagoStatus = urlParams.get('pago')

                if (pagoStatus) {
                    if (pagoStatus === 'exito') toast.success('¡Pago aprobado! La cuota de La Liga fue abonada.')
                    else if (pagoStatus === 'error') toast.error('El pago no se procesó o fue cancelado.')
                    else if (pagoStatus === 'pendiente') toast.info('Tu pago está pendiente de confirmación.')
                    window.history.replaceState(null, '', window.location.pathname)
                }

                // ESCUDO 3: Sesión rápida sin asfixiar la base de datos
                const { data: sessionData } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 3000))
                ]) as any;

                let userId = sessionData?.session?.user?.id

                if (!userId) {
                    const { data: userData } = await Promise.race([
                        supabase.auth.getUser(),
                        new Promise((resolve) => setTimeout(() => resolve({ data: { user: null } }), 3000))
                    ]) as any;
                    userId = userData?.user?.id
                }

                if (!userId) {
                    window.location.href = '/login';
                    return;
                }

                const { data: dataProfile } = await supabase.from('profiles').select('*').eq('id', userId).single()

                if (dataProfile) {
                    setProfile(dataProfile)
                    const isProfe = dataProfile.rol === 'profesor' || dataProfile.rol === 'admin'

                    if (!isProfe) {
                        const tieneDatos = Boolean(
                            dataProfile.edad && dataProfile.direccion &&
                            dataProfile.contacto_emergencia && dataProfile.plan_medico &&
                            dataProfile.condiciones_medicas
                        )
                        setLegajoCompleto(tieneDatos)
                        if (!tieneDatos) return // Termina rápido si le falta el legajo
                    } else {
                        setLegajoCompleto(true)
                    }

                    const nivelAlumno = dataProfile.nivel_liga || dataProfile.nivel || 1

                    // --- TRAER AVISOS ---
                    let queryAvisos = supabase
                        .from('liga_avisos')
                        .select('*, autor:profiles!liga_avisos_autor_id_fkey(nombre_completo)')
                        .order('created_at', { ascending: false })
                        .limit(30)

                    if (dataProfile.rol === 'admin') {
                        // Admin ve todo
                    } else if (isProfe) {
                        queryAvisos = queryAvisos.or(`autor_id.eq.${userId},tipo_destino.eq.general`)
                    } else {
                        queryAvisos = queryAvisos.or(`tipo_destino.eq.general,and(tipo_destino.eq.nivel,nivel_destino.eq.${nivelAlumno}),and(tipo_destino.eq.individual,alumno_id.eq.${userId})`)
                    }

                    const { data: dataAvisos } = await queryAvisos
                    if (dataAvisos) setAvisos(dataAvisos)

                    // --- TRAER MATERIAS ---
                    const hoyIso = new Date().toISOString()
                    const cuatrimestreActual = '2026-1'

                    let queryClases = supabase.from('clases').select('id, nombre, inicio, liga_nivel, profesor_id, profesor:profiles(nombre_completo)').eq('es_la_liga', true).neq('estado', 'cancelada')

                    if (isProfe && dataProfile.rol !== 'admin') {
                        queryClases = queryClases.eq('profesor_id', userId)
                    } else if (!isProfe) {
                        queryClases = queryClases.eq('liga_nivel', nivelAlumno).gte('inicio', hoyIso).order('inicio', { ascending: true })
                    }

                    const { data: dataClases } = await queryClases

                    let misEvaluaciones: any[] = []
                    if (!isProfe) {
                        // 1. Verificar deuda del mes actual
                        const mesActual = new Date().getMonth() + 1
                        const anioActual = new Date().getFullYear()

                        const { data: pagoMes } = await supabase
                            .from('liga_pagos')
                            .select('id')
                            .eq('alumno_id', userId)
                            .eq('mes', mesActual)
                            .eq('anio', anioActual)
                            .maybeSingle()

                        setDeudaCuota(!pagoMes)

                        // 2. Traer evaluaciones
                        const { data: evals } = await supabase
                            .from('liga_evaluaciones')
                            .select('*')
                            .eq('alumno_id', userId)
                            .eq('cuatrimestre', cuatrimestreActual)

                        if (evals) misEvaluaciones = evals
                    }

                    if (dataClases) {
                        const disciplinasUnicas: any[] = []
                        const nombresVistos = new Set()

                        dataClases.forEach((clase: any) => {
                            if (!nombresVistos.has(clase.nombre)) {
                                nombresVistos.add(clase.nombre)
                                const evaluacion = misEvaluaciones.find(e => e.clase_id === clase.id)
                                disciplinasUnicas.push({
                                    id: clase.id,
                                    nombre: clase.nombre,
                                    liga_nivel: clase.liga_nivel,
                                    profesor: clase.profesor?.nombre_completo || 'Staff',
                                    proxima_clase: clase.inicio,
                                    evaluacion: evaluacion || null
                                })
                            }
                        })
                        setMaterias(disciplinasUnicas)
                    }

                    // SI ES PROFE/ADMIN, CARGAR ALUMNOS
                    if (isProfe) {
                        cargarTodosLosAlumnos(false)
                    }
                }
            } catch (error) {
                console.error("Error cargando La Liga:", error)
                setProfile(null)
            } finally {
                clearTimeout(failsafeTimeout)
                setLoading(false)
            }
        }

        fetchLaLigaData()
    }, [])

    // --- FUNCIONES GESTIÓN ADMIN ---
    const cargarTodosLosAlumnos = async (mostrarLoading = true) => {
        if (mostrarLoading) setLoadingGestion(true)
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, nombre, apellido, email, nivel_liga')
                .eq('rol', 'alumno')
                .not('nivel_liga', 'is', null)
                .order('nombre', { ascending: true })

            if (error) throw error
            if (data) setAllStudents(data.filter(p => p.nombre))
        } catch (error) {
            console.error("Error al cargar alumnos", error)
        } finally {
            if (mostrarLoading) setLoadingGestion(false)
        }
    }

    const cambiarNivelLiga = async (id: string, nuevoNivel: number | null) => {
        try {
            const { error } = await supabase.from('profiles').update({ nivel_liga: nuevoNivel }).eq('id', id)
            if (error) throw error

            if (nuevoNivel === null) {
                toast.success('Alumno removido de La Liga')
                setAllStudents(prev => prev.filter(a => a.id !== id))
            } else {
                toast.success(`Cambiado a Nivel ${nuevoNivel}`)
                setAllStudents(prev => prev.map(a => a.id === id ? { ...a, nivel_liga: nuevoNivel } : a))
            }
        } catch (error) {
            toast.error("Error al actualizar el nivel")
        }
    }

    useEffect(() => {
        if (adminTab === 'gestion' && allStudents.length === 0) {
            cargarTodosLosAlumnos()
        }
    }, [adminTab])

    // --- FUNCIONES COMUNICADOS ---
    const enviarAviso = async (e: React.FormEvent) => {
        e.preventDefault()
        setEnviandoAviso(true)
        try {
            if (!avisoForm.titulo || !avisoForm.mensaje) throw new Error("Completá título y mensaje")
            if (avisoForm.tipo_destino === 'individual' && !avisoForm.alumno_id) throw new Error("Seleccioná un alumno")

            const payload = {
                autor_id: profile.id,
                titulo: avisoForm.titulo,
                mensaje: avisoForm.mensaje,
                tipo_destino: avisoForm.tipo_destino,
                nivel_destino: avisoForm.tipo_destino === 'nivel' ? avisoForm.nivel_destino : null,
                alumno_id: avisoForm.tipo_destino === 'individual' ? avisoForm.alumno_id : null
            }

            const { error } = await supabase.from('liga_avisos').insert(payload)
            if (error) throw error

            toast.success("Comunicado enviado correctamente")
            setAvisoForm({ titulo: '', mensaje: '', tipo_destino: 'general', nivel_destino: 1, alumno_id: '' })
            // Recarga parcial ligera simulada para no volver a hacer Cold Boot
            window.location.reload()
        } catch (error: any) {
            toast.error(error.message || "Error al enviar aviso")
        } finally {
            setEnviandoAviso(false)
        }
    }

    const eliminarAviso = async (id: string) => {
        if (!confirm("¿Seguro que querés borrar este aviso?")) return
        try {
            const { error } = await supabase.from('liga_avisos').delete().eq('id', id)
            if (error) throw error
            toast.success("Aviso eliminado")
            setAvisos(prev => prev.filter(a => a.id !== id))
        } catch (error) {
            toast.error("Error al eliminar")
        }
    }

    // --- FUNCIONES EVALUACIÓN ---
    const cargarAlumnos = async (materia: any) => {
        setSelectedMateria(materia)
        setLoadingAlumnos(true)
        try {
            const { data: perfiles, error: errorPerfiles } = await supabase
                .from('profiles')
                .select('id, nombre, apellido, email, rol, nivel_liga')
                .eq('rol', 'alumno')
                .eq('nivel_liga', materia.liga_nivel)

            if (errorPerfiles) throw errorPerfiles
            const alumnosReales = perfiles ? perfiles.filter(p => p.nombre && p.nombre.trim() !== '') : []
            const cuatrimestreActual = '2026-1'
            const { data: evaluaciones } = await supabase
                .from('liga_evaluaciones')
                .select('alumno_id, nota_final, aprobado')
                .eq('clase_id', materia.id)
                .eq('cuatrimestre', cuatrimestreActual)

            const alumnosMapeados = alumnosReales.map(perfil => {
                const evalExistente = evaluaciones?.find(e => e.alumno_id === perfil.id)
                return { ...perfil, evaluacion: evalExistente || null }
            })

            setAlumnosList(alumnosMapeados)
        } catch (error: any) {
            toast.error('Error al cargar alumnos: ' + error.message)
        } finally {
            setLoadingAlumnos(false)
        }
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

    const guardarEvaluacion = async () => {
        setGuardandoEval(true)
        try {
            const notasFaltantes = Object.values(notas).some(v => v === 0 || isNaN(v))
            if (notasFaltantes) {
                toast.error('Por favor, calificá todos los criterios del 1 al 10 antes de guardar.')
                setGuardandoEval(false); return
            }

            const notaFinal = parseFloat(calcularPromedio() as string)
            const aprobado = notaFinal >= 6
            const cuatrimestreActual = '2026-1'

            const payload = {
                alumno_id: selectedAlumno.id,
                clase_id: selectedMateria.id,
                profesor_id: profile.id,
                cuatrimestre: cuatrimestreActual,
                anio: new Date().getFullYear(),
                criterios_notas: notas,
                observaciones_docente: observaciones,
                nota_final: notaFinal,
                aprobado: aprobado,
                requiere_recuperatorio: !aprobado
            }

            const { error } = await supabase.from('liga_evaluaciones').upsert(payload, { onConflict: 'alumno_id,clase_id,cuatrimestre' })
            if (error) throw error

            toast.success('Evaluación guardada correctamente')
            setEvalModalOpen(false)
            cargarAlumnos(selectedMateria)
        } catch (error: any) {
            toast.error('Error al guardar: ' + error.message)
        } finally {
            setGuardandoEval(false)
        }
    }

    // --- RENDERS ---
    if (loading) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12 mb-4" />
                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest animate-pulse">Cargando La Liga...</p>
            </div>
        )
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-6 w-full animate-in fade-in">
                <AlertTriangle className="text-orange-500 w-16 h-16" />
                <h2 className="text-white font-black text-2xl uppercase tracking-tighter">Conexión Perdida</h2>
                <div className="flex gap-4">
                    <button onClick={() => window.location.reload()} className="bg-white/10 text-white px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white hover:text-black transition-colors">Refrescar</button>
                    <button onClick={async () => { try { await supabase.auth.signOut() } catch (e) { } finally { window.location.href = '/login' } }} className="bg-[#D4E655] text-black px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-colors">Iniciar sesión</button>
                </div>
            </div>
        )
    }

    const isAdmin = profile?.rol === 'admin'
    const isProfe = profile?.rol === 'profesor' || profile?.rol === 'admin'
    const nivelActual = profile?.nivel_liga || profile?.nivel || 1
    const faltaAptoFisico = !profile?.apto_fisico_url

    if (!isProfe && !legajoCompleto) {
        return (
            <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#D4E655]/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="max-w-md w-full bg-[#09090b] border border-[#D4E655]/20 rounded-3xl p-8 text-center relative z-10 animate-in zoom-in-95 duration-500 shadow-2xl shadow-[#D4E655]/5">
                    <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/20"><Lock className="text-yellow-500 w-10 h-10" /></div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter text-white mb-3">Legajo Incompleto</h1>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed">Para acceder a <span className="text-[#D4E655] font-bold">La Liga</span>, primero completá tu ficha médica.</p>
                    <Link href="/perfil" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg">Ir a completar mi Perfil <ChevronRight size={16} /></Link>
                </div>
            </div>
        )
    }

    const filteredStudents = allStudents.filter(s =>
        (s.nombre + ' ' + s.apellido).toLowerCase().includes(searchStudent.toLowerCase())
    )

    const generarLinkPagoLiga = async () => {
        setProcesandoPago(true)
        try {
            const mesActual = new Date().getMonth() + 1
            const anioActual = new Date().getFullYear()
            const precioCuota = 15000 // <-- CAMBIÁ ESTE VALOR POR EL PRECIO REAL DE TU CUOTA

            const res = await fetch('/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo: `Cuota La Liga - Mes ${mesActual}/${anioActual}`,
                    precio: precioCuota,
                    usuarioId: profile.id,
                    tipo_pago: 'cuota_liga',
                    mes: mesActual,
                    anio: anioActual
                })
            })

            const data = await res.json()
            if (data.url) {
                window.location.href = data.url
            } else {
                throw new Error('No se pudo generar el link')
            }
        } catch (error) {
            toast.error('Error al conectar con Mercado Pago.')
        } finally {
            setProcesandoPago(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24 selection:bg-[#D4E655] selection:text-black">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER COMPARTIDO */}
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
                                La Liga {isProfe && <span className="text-gray-500 text-2xl">/ Staff</span>}
                            </h1>
                        </div>
                        {!isProfe && (
                            <div className="flex items-center gap-3">
                                <span className="bg-[#D4E655] text-black px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest shadow-[0_0_15px_rgba(212,230,85,0.2)]">
                                    Nivel {nivelActual}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* TABS PARA ADMIN / PROFESOR */}
                    {isProfe && (
                        <div className="flex gap-6 border-b border-white/10 relative z-10 mt-2 overflow-x-auto custom-scrollbar">
                            <button
                                onClick={() => setAdminTab('evaluaciones')}
                                className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === 'evaluaciones' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}
                            >
                                <ClipboardEdit size={14} className="inline mr-2 -mt-1" /> Evaluaciones
                            </button>
                            <button
                                onClick={() => setAdminTab('comunicados')}
                                className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === 'comunicados' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}
                            >
                                <Megaphone size={14} className="inline mr-2 -mt-1" /> Comunicados
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => setAdminTab('gestion')}
                                    className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === 'gestion' ? 'text-[#D4E655] border-b-2 border-[#D4E655]' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <UserCog size={14} className="inline mr-2 -mt-1" /> Padrón de Alumnos
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">

                {/* --- ALERTAS CRÍTICAS (SOLO ALUMNO) --- */}
                {!isProfe && (faltaAptoFisico || deudaCuota) && (
                    <div className="space-y-3">
                        {faltaAptoFisico && (
                            <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <FileWarning className="text-orange-500 shrink-0 mt-0.5" size={20} />
                                    <div>
                                        <h4 className="font-black text-orange-500 uppercase text-xs tracking-widest mb-1">Apto Físico Pendiente</h4>
                                        <p className="text-gray-400 text-[10px] sm:text-xs leading-relaxed">Aún no subiste tu certificado médico. Recordá que tenés tiempo máximo hasta <strong className="text-white">Mayo</strong>.</p>
                                    </div>
                                </div>
                                <Link href="/perfil" className="shrink-0 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-colors text-center">
                                    Subir Ahora
                                </Link>
                            </div>
                        )}
                        {deudaCuota && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                                    <div>
                                        <h4 className="font-black text-red-500 uppercase text-xs tracking-widest mb-1">Cuota Vencida</h4>
                                        <p className="text-gray-400 text-[10px] sm:text-xs leading-relaxed">Tenés pendiente la cuota de La Liga de este mes. Abonala para destrabar tu boletín.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={generarLinkPagoLiga}
                                    disabled={procesandoPago}
                                    className="shrink-0 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                                >
                                    {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : 'Pagar Online con MP'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* =========================================
                    VISTA GESTIÓN ADMIN
                ========================================= */}
                {isAdmin && adminTab === 'gestion' && (
                    <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6 min-h-[500px] flex flex-col shadow-xl animate-in fade-in">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/5">
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
                                    <Users size={24} className="text-[#D4E655]" /> Padrón de Alumnos
                                </h3>
                                <p className="text-xs text-gray-500 uppercase font-bold mt-1">Asigná o remové alumnos de los niveles de La Liga.</p>
                            </div>

                            <div className="relative w-full md:w-72">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar alumno..."
                                    value={searchStudent}
                                    onChange={(e) => setSearchStudent(e.target.value)}
                                    className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-xs font-bold outline-none focus:border-[#D4E655]"
                                />
                            </div>
                        </div>

                        {loadingGestion ? (
                            <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-10 h-10" /></div>
                        ) : (
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {filteredStudents.map(alumno => (
                                        <div key={alumno.id} className="bg-[#111] border border-white/5 rounded-xl p-4 flex flex-col justify-between gap-4 group hover:border-white/20 transition-all">
                                            <div>
                                                <h4 className="font-black text-white text-sm capitalize truncate">{alumno.nombre} {alumno.apellido}</h4>
                                                {alumno.nivel_liga ? (
                                                    <span className="mt-1 inline-flex items-center gap-1 bg-[#D4E655]/10 text-[#D4E655] border border-[#D4E655]/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                                                        <Star size={10} className="fill-[#D4E655]/50" /> Nivel {alumno.nivel_liga}
                                                    </span>
                                                ) : (
                                                    <span className="mt-1 inline-block text-[9px] font-bold text-gray-500 uppercase tracking-widest">Sin asignar</span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 border-t border-white/5 pt-3">
                                                {!alumno.nivel_liga ? (
                                                    <>
                                                        <button onClick={() => cambiarNivelLiga(alumno.id, 1)} className="flex-1 bg-white/5 hover:bg-purple-500/20 hover:text-purple-400 text-gray-400 py-2 rounded-lg text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1">Nivel 1</button>
                                                        <button onClick={() => cambiarNivelLiga(alumno.id, 2)} className="flex-1 bg-white/5 hover:bg-purple-500/20 hover:text-purple-400 text-gray-400 py-2 rounded-lg text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1">Nivel 2</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => cambiarNivelLiga(alumno.id, alumno.nivel_liga === 1 ? 2 : 1)}
                                                            className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg text-[10px] font-black uppercase transition-colors"
                                                        >
                                                            Pasar a Nivel {alumno.nivel_liga === 1 ? 2 : 1}
                                                        </button>
                                                        <button
                                                            onClick={() => cambiarNivelLiga(alumno.id, null)}
                                                            className="shrink-0 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-2 rounded-lg text-[10px] font-black transition-colors"
                                                            title="Remover de La Liga"
                                                        >
                                                            <UserMinus size={14} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {filteredStudents.length === 0 && (
                                        <div className="col-span-full py-12 text-center text-gray-500">
                                            <Search size={32} className="mx-auto mb-3 opacity-30" />
                                            <p className="text-xs font-bold uppercase tracking-widest">No se encontraron alumnos</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}


                {/* =========================================
                    VISTA COMUNICADOS (NUEVA PESTAÑA PROFE/ADMIN)
                ========================================= */}
                {isProfe && adminTab === 'comunicados' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in">
                        {/* Redactar Aviso */}
                        <div className="lg:col-span-5 bg-[#09090b] border border-white/5 rounded-3xl p-6 shadow-xl">
                            <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
                                <Send size={20} className="text-[#D4E655]" /> Redactar Aviso
                            </h3>

                            <form onSubmit={enviarAviso} className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Destinatarios</label>
                                    <select
                                        value={avisoForm.tipo_destino}
                                        onChange={e => setAvisoForm({ ...avisoForm, tipo_destino: e.target.value })}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]"
                                    >
                                        <option value="general">Toda La Liga (General)</option>
                                        <option value="nivel">Un Nivel Específico</option>
                                        <option value="individual">Un Alumno Específico</option>
                                    </select>
                                </div>

                                {avisoForm.tipo_destino === 'nivel' && (
                                    <div className="animate-in fade-in zoom-in-95">
                                        <label className="text-[10px] font-bold text-[#D4E655] uppercase tracking-widest mb-2 block">Seleccionar Nivel</label>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setAvisoForm({ ...avisoForm, nivel_destino: 1 })} className={`flex-1 py-3 rounded-xl border text-xs font-black uppercase transition-colors ${avisoForm.nivel_destino === 1 ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-400 border-white/10 hover:border-white/30'}`}>Nivel 1</button>
                                            <button type="button" onClick={() => setAvisoForm({ ...avisoForm, nivel_destino: 2 })} className={`flex-1 py-3 rounded-xl border text-xs font-black uppercase transition-colors ${avisoForm.nivel_destino === 2 ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-400 border-white/10 hover:border-white/30'}`}>Nivel 2</button>
                                        </div>
                                    </div>
                                )}

                                {avisoForm.tipo_destino === 'individual' && (
                                    <div className="animate-in fade-in zoom-in-95">
                                        <label className="text-[10px] font-bold text-[#D4E655] uppercase tracking-widest mb-2 block">Seleccionar Alumno</label>
                                        <select
                                            value={avisoForm.alumno_id}
                                            onChange={e => setAvisoForm({ ...avisoForm, alumno_id: e.target.value })}
                                            className="w-full bg-[#111] border border-[#D4E655]/50 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]"
                                        >
                                            <option value="">Elegí un alumno...</option>
                                            {allStudents.map(a => (
                                                <option key={a.id} value={a.id}>{a.nombre} {a.apellido} (Nivel {a.nivel_liga})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="pt-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Título del Aviso</label>
                                    <input
                                        type="text" required placeholder="Ej: Cambio de horario..."
                                        value={avisoForm.titulo} onChange={e => setAvisoForm({ ...avisoForm, titulo: e.target.value })}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655]"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Mensaje</label>
                                    <textarea
                                        required placeholder="Escribí el comunicado acá..."
                                        value={avisoForm.mensaje} onChange={e => setAvisoForm({ ...avisoForm, mensaje: e.target.value })}
                                        className="w-full h-32 bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#D4E655] resize-none"
                                    />
                                </div>

                                <button disabled={enviandoAviso} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4 shadow-lg">
                                    {enviandoAviso ? <Loader2 size={16} className="animate-spin" /> : <><Send size={16} /> Publicar Aviso</>}
                                </button>
                            </form>
                        </div>

                        {/* Historial de Avisos (Vista Profe) */}
                        <div className="lg:col-span-7 bg-[#111] border border-white/5 rounded-3xl p-6">
                            <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
                                <Megaphone size={20} className="text-[#D4E655]" /> Cartelera Activa
                            </h3>
                            <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                                {avisos.length > 0 ? avisos.map(aviso => (
                                    <div key={aviso.id} className="bg-[#09090b] border-l-2 border-[#D4E655] p-5 rounded-r-xl border-y border-r border-white/5 relative group">
                                        {/* Botón Borrar (Solo admin o el autor del aviso) */}
                                        {(isAdmin || aviso.autor_id === profile.id) && (
                                            <button
                                                onClick={() => eliminarAviso(aviso.id)}
                                                className="absolute top-4 right-4 text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}

                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[9px] font-black bg-white/10 text-white px-2 py-0.5 rounded uppercase">
                                                {aviso.tipo_destino === 'general' ? 'General' : aviso.tipo_destino === 'nivel' ? `Nivel ${aviso.nivel_destino}` : 'Individual'}
                                            </span>
                                            <span className="text-[9px] font-bold text-gray-500 uppercase">{format(new Date(aviso.created_at), 'dd MMM HH:mm', { locale: es })}</span>
                                        </div>
                                        <h4 className="font-bold text-white text-sm uppercase mb-1 pr-6">{aviso.titulo}</h4>
                                        <p className="text-xs text-gray-400 leading-relaxed mb-3">{aviso.mensaje}</p>
                                        <div className="text-[9px] text-gray-600 font-bold uppercase tracking-widest border-t border-white/5 pt-2">
                                            Por: {aviso?.autor?.nombre_completo || 'Staff'}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-12">
                                        <CheckCircle2 size={40} className="text-gray-700 mx-auto mb-3 opacity-50" />
                                        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">La cartelera está vacía</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}


                {/* =========================================
                    VISTA DOCENTE / STAFF (EVALUACIONES)
                ========================================= */}
                {isProfe && adminTab === 'evaluaciones' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in">
                        <div className="lg:col-span-4 space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/10 pb-2">
                                <BookOpen size={16} className="text-[#D4E655]" /> Mis Disciplinas
                            </h3>
                            {materias.length > 0 ? materias.map(mat => (
                                <div
                                    key={mat.id}
                                    onClick={() => cargarAlumnos(mat)}
                                    className={`bg-[#111] border rounded-xl p-4 cursor-pointer transition-all ${selectedMateria?.id === mat.id ? 'border-[#D4E655] shadow-[0_0_15px_rgba(212,230,85,0.1)]' : 'border-white/5 hover:border-white/20'}`}
                                >
                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Nivel {mat.liga_nivel}</span>
                                    <h4 className="font-black text-white uppercase text-sm truncate">{mat.nombre}</h4>
                                </div>
                            )) : (
                                <p className="text-xs text-gray-500 italic">No tenés materias asignadas en La Liga.</p>
                            )}
                        </div>

                        <div className="lg:col-span-8 bg-[#09090b] border border-white/5 rounded-3xl p-6 min-h-[400px] flex flex-col">
                            {selectedMateria ? (
                                <>
                                    <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                                        <div>
                                            <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2">
                                                <Users size={20} className="text-[#D4E655]" /> Alumnos
                                            </h3>
                                            <p className="text-xs text-gray-500 font-bold uppercase mt-1">{selectedMateria.nombre} • Nivel {selectedMateria.liga_nivel}</p>
                                        </div>
                                    </div>

                                    {loadingAlumnos ? (
                                        <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-gray-500" /></div>
                                    ) : alumnosList.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto pr-2 custom-scrollbar">
                                            {alumnosList.map(alumno => (
                                                <div key={alumno.id} className="bg-[#111] border border-white/5 rounded-xl p-4 flex items-center justify-between group">
                                                    <div>
                                                        <h4 className="font-bold text-white text-sm capitalize">{alumno.nombre} {alumno.apellido}</h4>
                                                        {alumno.evaluacion ? (
                                                            <div className={`mt-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${alumno.evaluacion.aprobado ? 'text-green-500' : 'text-red-500'}`}>
                                                                {alumno.evaluacion.aprobado ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                                                Nota: {alumno.evaluacion.nota_final}
                                                            </div>
                                                        ) : (
                                                            <span className="mt-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Pendiente de evaluación</span>
                                                        )}
                                                    </div>
                                                    <button onClick={() => abrirModalEvaluacion(alumno)} className="bg-white/5 hover:bg-[#D4E655] text-white hover:text-black w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0">
                                                        <ClipboardEdit size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 opacity-50">
                                            <Users size={40} className="mb-2" />
                                            <p className="text-xs font-bold uppercase">No hay alumnos en este nivel</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-600 opacity-50 text-center">
                                    <ClipboardEdit size={48} className="mb-4" />
                                    <h4 className="font-bold uppercase text-sm">Seleccioná una materia</h4>
                                    <p className="text-[10px] uppercase">Para ver y evaluar a tus alumnos</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* =========================================
                    VISTA ALUMNO (Dashboard Normal)
                ========================================= */}
                {!isProfe && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
                        {/* Materias del alumno */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-[#09090b] border border-white/5 rounded-3xl p-6 min-h-[400px]">
                                <h3 className="text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
                                    <BookOpen size={20} className="text-[#D4E655]" /> Mis Disciplinas
                                </h3>
                                {materias.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {materias.map((materia) => (
                                            <div
                                                key={materia.id}
                                                onClick={() => {
                                                    if (deudaCuota) {
                                                        return toast.error('¡Bloqueado! Tenés que abonar la cuota del mes para ver tu boletín.')
                                                    }
                                                    if (materia.evaluacion) {
                                                        setSelectedBoletin(materia)
                                                        setBoletinModalOpen(true)
                                                    } else {
                                                        toast.info('Todavía no tenés notas cargadas en esta disciplina.')
                                                    }
                                                }}
                                                className={`bg-[#111] border ${materia.evaluacion ? 'border-[#D4E655]/30 cursor-pointer hover:border-[#D4E655]' : 'border-white/5'} rounded-2xl p-5 transition-all group relative overflow-hidden flex flex-col`}
                                            >
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-[#D4E655]/5 rounded-full blur-2xl -mr-8 -mt-8 transition-all group-hover:bg-[#D4E655]/10"></div>

                                                <div className="flex justify-between items-start mb-4 relative z-10">
                                                    <span className="bg-white/5 text-gray-400 text-[9px] font-bold uppercase px-2 py-1 rounded">Materia Obligatoria</span>
                                                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                                                </div>

                                                <h4 className="font-black text-xl uppercase tracking-tighter text-white mb-1 group-hover:text-[#D4E655] transition-colors truncate relative z-10">
                                                    {materia.nombre}
                                                </h4>
                                                <p className="text-[10px] text-gray-400 mb-6 uppercase font-bold tracking-widest relative z-10">
                                                    Prof: {materia.profesor}
                                                </p>

                                                {/* NUEVO: Próxima Clase Siempre Visible */}
                                                {materia.proxima_clase && (
                                                    <div className="mb-4 relative z-10">
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest block mb-1 flex items-center gap-1">
                                                            <CalendarX size={10} /> Próxima Clase
                                                        </span>
                                                        <span className="text-xs font-black text-white bg-white/5 px-2 py-1.5 rounded-md border border-white/10 block w-max">
                                                            {format(new Date(materia.proxima_clase), "EEE d MMM • HH:mm", { locale: es })}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="pt-4 border-t border-white/5 mt-auto relative z-10 flex items-center justify-between">
                                                    {materia.evaluacion ? (
                                                        <span className="bg-[#D4E655] text-black text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg flex items-center gap-2 shadow-[0_0_10px_rgba(212,230,85,0.2)] w-full justify-center">
                                                            <FileText size={14} /> Ver Boletín
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest text-center w-full py-2 bg-white/5 rounded-lg border border-white/5">
                                                            Evaluación Pendiente
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                                        <CalendarX size={48} className="text-gray-700 mb-4" />
                                        <h4 className="font-bold text-gray-400 uppercase text-sm mb-1">Sin disciplinas asignadas</h4>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Cartelera ALUMNO */}
                        <div className="lg:col-span-1">
                            <div className="bg-[#111] border border-white/5 rounded-3xl p-6 relative lg:sticky lg:top-24">
                                <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-6 text-white border-b border-white/5 pb-4">
                                    <Megaphone size={18} className="text-[#D4E655]" /> Cartelera y Avisos
                                </h3>
                                <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                    {avisos.length > 0 ? avisos.map(aviso => (
                                        <div key={aviso.id} className="bg-black/40 border-l-2 border-[#D4E655] p-4 rounded-r-lg group hover:bg-white/5 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[9px] font-bold text-gray-500 uppercase">{format(new Date(aviso.created_at), 'dd MMM yyyy', { locale: es })}</span>
                                                {aviso.tipo_destino === 'individual' && <span className="bg-[#D4E655]/20 text-[#D4E655] text-[8px] font-black uppercase px-2 py-0.5 rounded">Solo para vos</span>}
                                            </div>
                                            <h4 className="font-bold text-white text-xs sm:text-sm uppercase mb-2">{aviso.titulo}</h4>
                                            <p className="text-[10px] sm:text-xs text-gray-400 leading-relaxed">{aviso.mensaje}</p>
                                        </div>
                                    )) : (
                                        <div className="text-center py-8">
                                            <CheckCircle2 size={32} className="text-gray-600 mx-auto mb-3 opacity-50" />
                                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">No hay avisos nuevos</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* =========================================
                MODALES (Evaluación y Boletín se mantienen igual)
            ========================================= */}

            {/* MODAL DE EVALUACIÓN (Solo Docentes) */}
            {isProfe && evalModalOpen && selectedAlumno && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setEvalModalOpen(false)}>
                    <div className="w-full max-w-5xl max-h-[95vh] bg-[#09090b] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-white/5 bg-[#111] flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-2xl font-black uppercase text-white tracking-tighter">Evaluación Cuatrimestral</h3>
                                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest mt-1">{selectedAlumno.nombre} {selectedAlumno.apellido} • {selectedMateria?.nombre}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest block">Promedio Final</span>
                                    <span className={`text-3xl font-black leading-none ${parseFloat(calcularPromedio() as string) >= 6 ? 'text-green-500' : 'text-red-500'}`}>{calcularPromedio()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs p-4 rounded-xl mb-6 font-medium flex gap-3 items-center">
                                <AlertCircle size={16} className="shrink-0" />
                                Calificá cada ítem del 1 al 10. Se requiere un promedio mayor a 6 para aprobar. El valor 0 significa "No evaluado".
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                                {CRITERIOS_EVALUACION.map((crit, idx) => (
                                    <div key={idx} className="bg-[#111] border border-white/5 p-3 rounded-xl flex items-center justify-between gap-3 hover:border-white/20 transition-colors">
                                        <label className="text-[10px] text-gray-300 font-bold uppercase leading-tight flex-1">{crit}</label>
                                        <input type="number" min="0" max="10" value={notas[crit] || 0} onChange={e => { let val = parseInt(e.target.value) || 0; if (val > 10) val = 10; if (val < 0) val = 0; setNotas({ ...notas, [crit]: val }) }} className="w-16 bg-black border border-white/10 rounded-lg p-2 text-center text-white font-black text-sm outline-none focus:border-[#D4E655]" />
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 border-t border-white/5 pt-6">
                                <label className="text-xs font-black uppercase text-[#D4E655] tracking-widest block mb-2">Observaciones y Devolución (Opcional)</label>
                                <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Escribí acá el feedback personalizado que el alumno leerá..." className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655] resize-none h-32" />
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/5 bg-[#111] flex justify-end gap-3 shrink-0">
                            <button onClick={() => setEvalModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-gray-400 text-xs uppercase hover:bg-white/5 transition-colors">Cancelar</button>
                            <button onClick={guardarEvaluacion} disabled={guardandoEval} className="px-8 py-3 bg-[#D4E655] text-black font-black uppercase rounded-xl hover:bg-white transition-all shadow-lg text-xs flex items-center gap-2">
                                {guardandoEval ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Guardar Evaluación</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE BOLETÍN (Solo Alumnos) */}
            {!isProfe && boletinModalOpen && selectedBoletin?.evaluacion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setBoletinModalOpen(false)}>
                    <div className="w-full max-w-4xl max-h-[95vh] bg-[#09090b] border border-[#D4E655]/30 rounded-2xl flex flex-col overflow-hidden shadow-2xl shadow-[#D4E655]/5" onClick={e => e.stopPropagation()}>
                        <div className="p-6 md:p-8 border-b border-white/5 bg-[#111] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shrink-0 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-[#D4E655]/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <FileText size={16} className="text-[#D4E655]" />
                                    <span className="text-[#D4E655] font-bold text-[10px] tracking-[0.2em] uppercase">Boletín Oficial • Cuatrimestre 1</span>
                                </div>
                                <h3 className="text-3xl font-black uppercase text-white tracking-tighter leading-none mb-1">{selectedBoletin.nombre}</h3>
                                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Prof: {selectedBoletin.profesor}</p>
                            </div>
                            <div className="relative z-10 bg-black/50 border border-white/10 rounded-2xl p-4 flex items-center gap-4 min-w-[160px]">
                                <div>
                                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Nota Final</span>
                                    <span className={`text-4xl font-black leading-none ${selectedBoletin.evaluacion.aprobado ? 'text-[#D4E655]' : 'text-red-500'}`}>
                                        {selectedBoletin.evaluacion.nota_final}
                                    </span>
                                </div>
                                <div className="border-l border-white/10 pl-4">
                                    {selectedBoletin.evaluacion.aprobado ? (
                                        <div className="flex flex-col items-center justify-center text-green-500">
                                            <CheckCircle2 size={24} className="mb-1" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Aprobado</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-red-500">
                                            <AlertTriangle size={24} className="mb-1" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">A Recuperar</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-[#09090b]">
                            {selectedBoletin.evaluacion.observaciones_docente && (
                                <div className="mb-8">
                                    <h4 className="text-xs font-black uppercase text-white tracking-widest border-b border-white/10 pb-2 mb-4">Devolución del Docente</h4>
                                    <div className="bg-[#111] border-l-4 border-[#D4E655] rounded-r-xl p-5">
                                        <p className="text-sm text-gray-300 leading-relaxed italic">"{selectedBoletin.evaluacion.observaciones_docente}"</p>
                                    </div>
                                </div>
                            )}
                            <div>
                                <h4 className="text-xs font-black uppercase text-white tracking-widest border-b border-white/10 pb-2 mb-4">Detalle por Criterio</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {Object.entries(selectedBoletin.evaluacion.criterios_notas || {}).map(([criterio, nota]: [string, any], idx) => (
                                        nota > 0 ? (
                                            <div key={idx} className="bg-[#111] border border-white/5 rounded-lg p-3 flex justify-between items-center group hover:bg-white/5 transition-colors">
                                                <span className="text-[10px] text-gray-400 font-bold uppercase leading-tight pr-2">{criterio}</span>
                                                <span className={`text-sm font-black w-8 h-8 rounded bg-black flex items-center justify-center shrink-0 border border-white/5 ${nota >= 6 ? 'text-green-400' : 'text-red-400'}`}>{nota}</span>
                                            </div>
                                        ) : null
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/5 bg-[#111] shrink-0 text-center">
                            <button onClick={() => setBoletinModalOpen(false)} className="w-full md:w-auto px-12 py-3 bg-white/5 text-white font-black uppercase rounded-xl hover:bg-white hover:text-black transition-all text-xs tracking-widest">Cerrar Boletín</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}