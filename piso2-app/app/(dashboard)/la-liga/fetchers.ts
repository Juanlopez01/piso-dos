import { format } from 'date-fns'
import { getNombresPerfilesAction } from '@/app/actions/liga'

export const parseSafeDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return new Date()
    const cleanStr = dateStr.replace('+00:00', '').replace('+00', '').replace('Z', '').replace(' ', 'T')
    const parsed = new Date(cleanStr)
    return isNaN(parsed.getTime()) ? new Date() : parsed
}

export type Estadisticas = {
    presentes: number
    ausentes: number
    justificadas: number
    saf: number
    medias_faltas: number
    total: number
    desglose?: Record<string, any>
}

// Cuatrimestres: 1ero = hasta julio (meses 1-7), 2do = desde agosto (meses 8-12).
export function cuatriDe(mes: number, anio: number) { return `${anio}-${mes <= 7 ? '1' : '2'}` }
export function numCuatri(cuatriKey: string) { return (cuatriKey || '').split('-')[1] === '2' ? 2 : 1 }
export function labelCuatri(cuatriKey: string) { return numCuatri(cuatriKey) === 2 ? '2do Cuatrimestre' : '1er Cuatrimestre' }

export const fetcherLiga = async (uid: string, paramMes: number, paramAnio: number, supabase: any) => {
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

    // 🚀 Override de cuota por mes (si existe fila para este mes/nivel, pisa el precio global)
    const { data: cuotasMes } = await supabase.from('liga_cuotas')
        .select('nivel, precio_transf, precio_efvo')
        .eq('anio', anioActual).eq('mes', mesActual)
    const cuotaMesOverride: Record<number, { transf: number; efvo: number }> = {}
    cuotasMes?.forEach((c: any) => { cuotaMesOverride[c.nivel] = { transf: Number(c.precio_transf), efvo: Number(c.precio_efvo) } })

    const getPrecioBase = (nivel: number, metodo: 'efvo' | 'transf') => {
        const ov = cuotaMesOverride[nivel]
        if (ov) return metodo === 'transf' ? ov.transf : ov.efvo
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

        // Traemos TODAS (los dos cuatrimestres) para mostrarlas separadas.
        const { data: evals } = await supabase.from('liga_evaluaciones').select('*').eq('alumno_id', uid)
        if (evals) misEvaluaciones = evals
    }

    // Clave normalizada (ignora espacios, mayúsculas y ACENTOS del nombre) para que
    // "TECNICA CLASICA", "TÉCNICA CLÁSICA" y "Técnica Clásica " sean la MISMA materia
    // (idem "FLEX Y FUERZA"), y para matchear la nota por materia+nivel (no por el
    // clase_id de un mes puntual).
    const normKey = (nombre: string, nivel: any) => `${(nombre || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()}_N${nivel || 1}`

    const disciplinasMap: Record<string, any> = {}
    if (dataClases) {
        dataClases.forEach((clase: any) => {
            const keyAgrupacion = normKey(clase.nombre, clase.liga_nivel);

            if (!disciplinasMap[keyAgrupacion]) {
                const profNombre = Array.isArray(clase.profesor) ? clase.profesor[0]?.nombre_completo : clase.profesor?.nombre_completo;
                disciplinasMap[keyAgrupacion] = { id: clase.id, key: keyAgrupacion, nombre: (clase.nombre || '').trim(), liga_nivel: clase.liga_nivel, profesor: profNombre || 'Staff', proxima_clase: null, clases_ids: [] }
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

    // Las notas se guardan contra un clase_id puntual (de un mes). Para mostrarlas
    // sin importar qué mes esté viendo el alumno, resolvemos cada nota a su
    // materia+nivel y matcheamos por esa clave normalizada.
    let evalKeyPorClaseId: Record<string, string> = {}
    let misNotas: any[] = []
    if (!isStaff && misEvaluaciones.length) {
        const idsEval = [...new Set(misEvaluaciones.map(e => e.clase_id))]
        const { data: clasesEval } = await supabase
            .from('clases')
            .select('id, nombre, liga_nivel')
            .in('id', idsEval)
        const claseById: Record<string, any> = {}
        for (const c of (clasesEval || [])) {
            evalKeyPorClaseId[c.id] = normKey(c.nombre, c.liga_nivel)
            claseById[c.id] = c
        }

        // Boletín directo: una fila por materia+nivel POR cuatrimestre (la más reciente).
        // La nota va SOLO por nombre de materia (+ nivel), sin atarla a ninguna profe.
        const porMateria: Record<string, any> = {}
        for (const e of [...misEvaluaciones].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))) {
            const c = claseById[e.clase_id]
            if (!c) continue
            const cuatri = e.cuatrimestre || cuatriDe(mesActual, anioActual)
            porMateria[`${cuatri}|${normKey(c.nombre, c.liga_nivel)}`] = {
                materia: (c.nombre || '').trim(),
                nivel: c.liga_nivel,
                cuatri,
                cuatriNum: numCuatri(cuatri),
                nota_final: e.nota_final,
                aprobado: e.aprobado,
                requiere_recuperatorio: e.requiere_recuperatorio,
                criterios_notas: e.criterios_notas,
                observaciones_docente: e.observaciones_docente,
            }
        }
        misNotas = Object.values(porMateria).sort((a: any, b: any) => (b.cuatriNum - a.cuatriNum) || a.materia.localeCompare(b.materia))
    }

    const materias = Object.values(disciplinasMap).map((disciplina: any) => {
        let evaluacion = null
        if (!isStaff) evaluacion = misEvaluaciones.find(e => evalKeyPorClaseId[e.clase_id] === disciplina.key)
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
        materias, misNotas, deudaCuota, miSaldoPendiente, miSaldoPendienteEfectivo,
        allStudents, preciosLiga, criterios: criteriosData || [],
        clasesDelMes, cuotaMesOverride,
        miAsistencia: statsAsistencia[uid] || { presentes: 0, ausentes: 0, justificadas: 0, saf: 0, medias_faltas: 0, total: 0, desglose: {} }
    }
}

// Límites (primer y último día) de un mes/año dado, en formato YYYY-MM-DD.
export const boundsDelMes = (mes: number, anio: number) => {
    const mm = String(mes).padStart(2, '0')
    const ultimo = new Date(anio, mes, 0).getDate()
    return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

// 🚀 Fetcher independiente: calcula asistencias para un RANGO de fechas arbitrario.
// No toca el fetcher mensual (cuotas/clases/evaluaciones siguen por mes).
export const fetcherAsistenciasRango = async (uid: string, desde: string, hasta: string, supabase: any) => {
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

