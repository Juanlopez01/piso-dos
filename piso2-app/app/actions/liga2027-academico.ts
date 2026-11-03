'use server'

// ============================================================================
// LA LIGA 2027 — Server actions (FASE 2: Seguimiento académico).
// Evaluaciones A/B/C + devoluciones, asistencias + régimen de regularidad
// (libres del mes / del bloque, detectados solos), programa y portal docente.
//
// Staff (admin/recepcion/coordinador) y docentes (profesor dueño de la
// disciplina) se autentican con la sesión de Supabase. El alumno logueado lee
// SU propio académico por la cookie de La Liga 2027.
// ============================================================================

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const STAFF = ['admin', 'recepcion', 'coordinador']

// ─── Régimen de regularidad (defaults del doc; DECISIÓN ABIERTA #1) ──────────
// 2 faltas no justificadas en la misma disciplina en el mes → libre del mes.
// "+4 faltas" en la disciplina en el cuatrimestre (bloque) → libre del bloque.
// Si Santi define "+4" como "más de 4", cambiar a 5 en UMBRAL_LIBRE_BLOQUE.
const UMBRAL_LIBRE_MES = 2
const UMBRAL_LIBRE_BLOQUE = 4

async function gate(roles: string[] = STAFF): Promise<{ ok: boolean; userId?: string; rol?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !roles.includes(perfil.rol)) return { ok: false, error: 'Sin permisos' }
    return { ok: true, userId: session.user.id, rol: perfil.rol }
}

// Docente de SU disciplina, o staff. Devuelve el userId para auditar quién cargó.
async function gateDocenteODisciplina(disciplinaId: string): Promise<{ ok: boolean; userId?: string; rol?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil) return { ok: false, error: 'Sin permisos' }
    if (STAFF.includes(perfil.rol)) return { ok: true, userId: session.user.id, rol: perfil.rol }
    if (perfil.rol === 'profesor') {
        const admin = getAdminClient()
        const { data: disc } = await admin.from('liga27_disciplinas').select('docente_id').eq('id', disciplinaId).maybeSingle()
        if (disc?.docente_id === session.user.id) return { ok: true, userId: session.user.id, rol: 'profesor' }
    }
    return { ok: false, error: 'No sos docente de esta disciplina.' }
}

const LETRA_VAL: Record<string, number> = { A: 3, B: 2, C: 1 }
const VAL_LETRA = (n: number) => (n >= 2.5 ? 'A' : n >= 1.5 ? 'B' : 'C')

// ════════════════════════════════════════════════════════════════════════════
// DISCIPLINAS + EXÁMENES (staff)
// ════════════════════════════════════════════════════════════════════════════

export async function getDisciplinasLiga27Action() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return []
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil) return []
    const admin = getAdminClient()
    let q = admin.from('liga27_disciplinas').select('*').order('orden', { ascending: true })
    // El docente solo ve las suyas; el staff, todas.
    if (!STAFF.includes(perfil.rol)) {
        if (perfil.rol !== 'profesor') return []
        q = q.eq('docente_id', session.user.id)
    }
    const { data } = await q
    if (!data?.length) return []
    const docenteIds = [...new Set(data.map((d: any) => d.docente_id).filter(Boolean))]
    const docById: Record<string, string> = {}
    if (docenteIds.length) {
        const { data: docs } = await admin.from('profiles').select('id, nombre, apellido, nombre_completo').in('id', docenteIds)
        for (const d of (docs || [])) docById[d.id] = d.nombre_completo || [d.nombre, d.apellido].filter(Boolean).join(' ')
    }
    return data.map((d: any) => ({ ...d, docente_nombre: d.docente_id ? (docById[d.docente_id] || null) : null }))
}

export async function getDocentesLiga27Action() {
    const g = await gate(); if (!g.ok) return []
    const admin = getAdminClient()
    const { data } = await admin.from('profiles').select('id, nombre, apellido, nombre_completo').eq('rol', 'profesor').order('nombre_completo', { ascending: true })
    return (data || []).map((d: any) => ({ id: d.id, nombre: d.nombre_completo || [d.nombre, d.apellido].filter(Boolean).join(' ') }))
}

export async function guardarDisciplinaLiga27Action(payload: {
    id?: string; nombre: string; bloque?: number; docente_id?: string | null; orden?: number; activa?: boolean
}): Promise<{ ok: boolean; error?: string; id?: string }> {
    const g = await gate(['admin', 'recepcion']); if (!g.ok) return { ok: false, error: g.error }
    if (!payload.nombre?.trim()) return { ok: false, error: 'Poné un nombre.' }
    const admin = getAdminClient()
    const row: any = {
        nombre: payload.nombre.trim(),
        bloque: payload.bloque ?? 1,
        docente_id: payload.docente_id || null,
        orden: payload.orden ?? 0,
        activa: payload.activa ?? true,
    }
    if (payload.id) {
        const { error } = await admin.from('liga27_disciplinas').update(row).eq('id', payload.id)
        if (error) return { ok: false, error: error.message }
        revalidatePath('/la-liga')
        return { ok: true, id: payload.id }
    }
    const { data, error } = await admin.from('liga27_disciplinas').insert(row).select('id').single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/la-liga')
    return { ok: true, id: data.id }
}

export async function getExamenesDisciplinaLiga27Action(disciplinaId: string) {
    const g = await gateDocenteODisciplina(disciplinaId); if (!g.ok) return []
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_examenes').select('*').eq('disciplina_id', disciplinaId).order('numero', { ascending: true })
    return data || []
}

export async function guardarExamenLiga27Action(payload: {
    id?: string; disciplina_id: string; numero: 1 | 2; fecha?: string | null; libera_bloque?: boolean
}): Promise<{ ok: boolean; error?: string }> {
    const g = await gate(['admin', 'recepcion']); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const row: any = { disciplina_id: payload.disciplina_id, numero: payload.numero, fecha: payload.fecha || null, libera_bloque: !!payload.libera_bloque }
    const { error } = payload.id
        ? await admin.from('liga27_examenes').update(row).eq('id', payload.id)
        : await admin.from('liga27_examenes').upsert(row, { onConflict: 'disciplina_id,numero' })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/la-liga')
    return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════════
// ALUMNOS DE UNA DISCIPLINA (para tomar asistencia / cargar notas)
// ════════════════════════════════════════════════════════════════════════════

export async function getAlumnosDisciplinaLiga27Action(disciplinaId: string) {
    const g = await gateDocenteODisciplina(disciplinaId); if (!g.ok) return []
    const admin = getAdminClient()
    // Todos los inscriptos activos del programa (no 'baja').
    const { data: inss } = await admin.from('liga27_inscripciones').select('id, profile_id, estado').neq('estado', 'baja').order('creado_at', { ascending: true })
    if (!inss?.length) return []
    const pById = await perfilesLiga27ByProfileId(admin, inss.map((i: any) => i.profile_id))
    return inss.map((i: any) => ({ inscripcion_id: i.id, estado: i.estado, perfil: i.profile_id ? (pById[i.profile_id] || null) : null }))
}

// Datos de display del alumno (nombre/apellido) desde profiles, por profile_id.
async function perfilesLiga27ByProfileId(admin: ReturnType<typeof getAdminClient>, ids: (string | null)[]): Promise<Record<string, any>> {
    const profileIds = [...new Set(ids.filter(Boolean))] as string[]
    const out: Record<string, any> = {}
    if (!profileIds.length) return out
    const { data: perfiles } = await admin.from('profiles').select('id, nombre, apellido, nombre_completo').in('id', profileIds)
    for (const p of (perfiles || [])) {
        const nombre = p.nombre || (p.nombre_completo || '').split(' ')[0] || ''
        const apellido = p.apellido || (p.nombre_completo || '').split(' ').slice(1).join(' ') || ''
        out[p.id] = { id: p.id, nombre, apellido, foto_url: null }
    }
    return out
}

// ════════════════════════════════════════════════════════════════════════════
// EVALUACIONES (notas A/B/C + devoluciones)
// ════════════════════════════════════════════════════════════════════════════

export async function guardarNotaExamenLiga27Action(payload: {
    inscripcionId: string; examenId: string; puntaje: 'A' | 'B' | 'C' | null; observaciones?: string
}): Promise<{ ok: boolean; error?: string }> {
    // El docente solo puede cargar notas de SU disciplina.
    const admin = getAdminClient()
    const { data: ex } = await admin.from('liga27_examenes').select('disciplina_id').eq('id', payload.examenId).maybeSingle()
    if (!ex) return { ok: false, error: 'Examen no encontrado' }
    const g = await gateDocenteODisciplina(ex.disciplina_id); if (!g.ok) return { ok: false, error: g.error }

    const { error } = await admin.from('liga27_alumno_examen').upsert({
        inscripcion_id: payload.inscripcionId,
        examen_id: payload.examenId,
        puntaje: payload.puntaje,
        observaciones: payload.observaciones?.trim() || null,
        cargado_por: g.userId,
        actualizado_at: new Date().toISOString(),
    }, { onConflict: 'inscripcion_id,examen_id' })
    if (error) return { ok: false, error: error.message }

    await recomputarLetra(admin, payload.inscripcionId)

    // Avisar al alumno (notificación interna del alumno de La Liga no existe;
    // dejamos revalidate para que su perfil se actualice al entrar).
    revalidatePath('/la-liga')
    return { ok: true }
}

// Promedio general (A=3,B=2,C=1) de TODOS los puntajes cargados → letra.
async function recomputarLetra(admin: ReturnType<typeof getAdminClient>, inscripcionId: string) {
    const { data: notas } = await admin.from('liga27_alumno_examen').select('puntaje').eq('inscripcion_id', inscripcionId)
    const vals = (notas || []).map((n: any) => LETRA_VAL[n.puntaje]).filter((v: number | undefined) => typeof v === 'number') as number[]
    if (!vals.length) {
        await admin.from('liga27_inscripciones').update({ promedio_letra: null, letra_actual: null }).eq('id', inscripcionId)
        return
    }
    const prom = vals.reduce((a, b) => a + b, 0) / vals.length
    const letra = VAL_LETRA(prom)
    await admin.from('liga27_inscripciones').update({ promedio_letra: letra, letra_actual: letra }).eq('id', inscripcionId)
}

// Todas las notas de una disciplina (para la grilla del docente): por examen y
// por inscripción. Devuelve un mapa `${inscripcionId}:${examenId}` → {puntaje, obs}.
export async function getNotasDisciplinaLiga27Action(disciplinaId: string): Promise<Record<string, { puntaje: string | null; observaciones: string | null }>> {
    const g = await gateDocenteODisciplina(disciplinaId); if (!g.ok) return {}
    const admin = getAdminClient()
    const { data: exs } = await admin.from('liga27_examenes').select('id').eq('disciplina_id', disciplinaId)
    const ids = (exs || []).map((e: any) => e.id)
    if (!ids.length) return {}
    const { data } = await admin.from('liga27_alumno_examen').select('inscripcion_id, examen_id, puntaje, observaciones').in('examen_id', ids)
    const out: Record<string, { puntaje: string | null; observaciones: string | null }> = {}
    for (const n of (data || [])) out[`${n.inscripcion_id}:${n.examen_id}`] = { puntaje: n.puntaje, observaciones: n.observaciones }
    return out
}

// Asistencia ya cargada de una disciplina en una fecha → mapa inscripcionId → {presente, justificada}.
export async function getAsistenciaFechaLiga27Action(disciplinaId: string, claseFecha: string): Promise<Record<string, { presente: boolean; justificada: boolean }>> {
    const g = await gateDocenteODisciplina(disciplinaId); if (!g.ok) return {}
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_asistencia').select('inscripcion_id, presente, justificada').eq('disciplina_id', disciplinaId).eq('clase_fecha', claseFecha)
    const out: Record<string, { presente: boolean; justificada: boolean }> = {}
    for (const a of (data || [])) out[a.inscripcion_id] = { presente: a.presente, justificada: a.justificada }
    return out
}

// Contenido ya cargado de una disciplina en una fecha.
export async function getClaseContenidoFechaLiga27Action(disciplinaId: string, claseFecha: string) {
    const g = await gateDocenteODisciplina(disciplinaId); if (!g.ok) return null
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_clases_contenido').select('*').eq('disciplina_id', disciplinaId).eq('clase_fecha', claseFecha).maybeSingle()
    return data || null
}

// Notas cargadas de una inscripción (staff/docente), por examen.
export async function getNotasInscripcionLiga27Action(inscripcionId: string) {
    const g = await gate(['admin', 'recepcion', 'coordinador', 'profesor']); if (!g.ok) return []
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_alumno_examen').select('examen_id, puntaje, observaciones').eq('inscripcion_id', inscripcionId)
    return data || []
}

// ════════════════════════════════════════════════════════════════════════════
// ASISTENCIAS + RÉGIMEN DE REGULARIDAD
// ════════════════════════════════════════════════════════════════════════════

export async function tomarAsistenciaLiga27Action(payload: {
    disciplinaId: string; clase_fecha: string
    marcas: { inscripcionId: string; presente: boolean }[]
}): Promise<{ ok: boolean; error?: string }> {
    const g = await gateDocenteODisciplina(payload.disciplinaId); if (!g.ok) return { ok: false, error: g.error }
    if (!payload.clase_fecha) return { ok: false, error: 'Elegí la fecha de la clase.' }
    const admin = getAdminClient()

    const filas = payload.marcas.map(m => ({
        inscripcion_id: m.inscripcionId,
        disciplina_id: payload.disciplinaId,
        clase_fecha: payload.clase_fecha,
        presente: m.presente,
        modificada_por: g.userId,
        modificada_at: new Date().toISOString(),
    }))
    if (filas.length) {
        const { error } = await admin.from('liga27_asistencia').upsert(filas, { onConflict: 'inscripcion_id,disciplina_id,clase_fecha' })
        if (error) return { ok: false, error: error.message }
    }
    await admin.from('liga27_asistencia_historial').insert({
        disciplina_id: payload.disciplinaId, clase_fecha: payload.clase_fecha,
        accion: 'tomar', detalle: `Se tomó asistencia de ${filas.length} alumno(s).`, autor_id: g.userId,
    })
    // Recalcular regularidad de cada alumno marcado.
    for (const m of payload.marcas) await recomputarRegularidad(admin, m.inscripcionId, payload.disciplinaId)

    revalidatePath('/la-liga')
    return { ok: true }
}

// Corrección / justificación de una asistencia puntual (con historial).
export async function corregirAsistenciaLiga27Action(payload: {
    inscripcionId: string; disciplinaId: string; clase_fecha: string
    presente?: boolean; justificada?: boolean; nota?: string
}): Promise<{ ok: boolean; error?: string }> {
    const g = await gate(['admin', 'recepcion']); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const row: any = { modificada_por: g.userId, modificada_at: new Date().toISOString() }
    if (payload.presente !== undefined) row.presente = payload.presente
    if (payload.justificada !== undefined) row.justificada = payload.justificada
    if (payload.nota !== undefined) row.nota = payload.nota?.trim() || null
    row.inscripcion_id = payload.inscripcionId
    row.disciplina_id = payload.disciplinaId
    row.clase_fecha = payload.clase_fecha
    const { error } = await admin.from('liga27_asistencia').upsert(row, { onConflict: 'inscripcion_id,disciplina_id,clase_fecha' })
    if (error) return { ok: false, error: error.message }
    await admin.from('liga27_asistencia_historial').insert({
        inscripcion_id: payload.inscripcionId, disciplina_id: payload.disciplinaId, clase_fecha: payload.clase_fecha,
        accion: payload.justificada ? 'justificar' : 'corregir',
        detalle: `presente=${payload.presente ?? '-'} justificada=${payload.justificada ?? '-'}${payload.nota ? ' · ' + payload.nota : ''}`,
        autor_id: g.userId,
    })
    await recomputarRegularidad(admin, payload.inscripcionId, payload.disciplinaId)
    revalidatePath('/la-liga')
    return { ok: true }
}

// Recalcula los libres (mes + bloque) de un alumno en una disciplina a partir de
// las faltas NO justificadas. Inserta/borra filas de liga27_libres para reflejar
// el estado actual, y notifica al staff al alcanzar un límite.
async function recomputarRegularidad(admin: ReturnType<typeof getAdminClient>, inscripcionId: string, disciplinaId: string) {
    const { data: disc } = await admin.from('liga27_disciplinas').select('bloque, nombre').eq('id', disciplinaId).maybeSingle()
    const bloque = disc?.bloque ?? 1
    const { data: asis } = await admin.from('liga27_asistencia')
        .select('clase_fecha, presente, justificada').eq('inscripcion_id', inscripcionId).eq('disciplina_id', disciplinaId)

    // Faltas no justificadas por mes y total del bloque (= todas, la disciplina es de un bloque).
    const faltasPorMes: Record<string, { mes: number; anio: number; n: number }> = {}
    let faltasBloque = 0
    for (const a of (asis || [])) {
        if (a.presente || a.justificada) continue
        faltasBloque++
        const d = new Date(a.clase_fecha + 'T00:00:00')
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        if (!faltasPorMes[key]) faltasPorMes[key] = { mes: d.getMonth() + 1, anio: d.getFullYear(), n: 0 }
        faltasPorMes[key].n++
    }

    // Libres del MES: upsert donde se superó el umbral; borrar donde ya no.
    const { data: libresMes } = await admin.from('liga27_libres').select('id, mes, anio').eq('inscripcion_id', inscripcionId).eq('disciplina_id', disciplinaId).eq('tipo', 'mes')
    const mesesLibre = new Set(Object.values(faltasPorMes).filter(m => m.n >= UMBRAL_LIBRE_MES).map(m => `${m.anio}-${m.mes}`))
    const yaEraLibreMes = new Set((libresMes || []).map((l: any) => `${l.anio}-${l.mes}`))
    for (const m of Object.values(faltasPorMes)) {
        if (m.n >= UMBRAL_LIBRE_MES) {
            await admin.from('liga27_libres').upsert({
                inscripcion_id: inscripcionId, disciplina_id: disciplinaId, tipo: 'mes',
                mes: m.mes, anio: m.anio, bloque, faltas: m.n,
                motivo: `${m.n} faltas en ${disc?.nombre || 'la disciplina'} (${m.mes}/${m.anio})`,
            }, { onConflict: 'inscripcion_id,disciplina_id,tipo,mes,anio,bloque' })
            // Alerta (solo la primera vez que cae libre ese mes, para no repetir).
            if (!yaEraLibreMes.has(`${m.anio}-${m.mes}`)) {
                try {
                    const { data: staff } = await admin.from('profiles').select('id').in('rol', ['admin', 'recepcion', 'coordinador'])
                    if (staff?.length) await admin.from('notificaciones').insert(staff.map((s: any) => ({
                        usuario_id: s.id, titulo: '🟠 Libre del mes — La Liga 2027',
                        mensaje: `Un alumno quedó libre de ${disc?.nombre || 'una disciplina'} en ${m.mes}/${m.anio} por ${m.n} faltas.`,
                        link: '/la-liga?tab=liga2027', leido: false,
                    })))
                } catch { /* best-effort */ }
            }
        }
    }
    for (const l of (libresMes || [])) {
        if (!mesesLibre.has(`${l.anio}-${l.mes}`)) await admin.from('liga27_libres').delete().eq('id', l.id)
    }

    // Libre del BLOQUE: una sola fila por disciplina+bloque+año.
    const anioBloque = Object.values(faltasPorMes)[0]?.anio || new Date().getFullYear()
    const { data: libreBloque } = await admin.from('liga27_libres').select('id, resuelto').eq('inscripcion_id', inscripcionId).eq('disciplina_id', disciplinaId).eq('tipo', 'bloque').maybeSingle()
    if (faltasBloque >= UMBRAL_LIBRE_BLOQUE) {
        if (!libreBloque) {
            await admin.from('liga27_libres').insert({
                inscripcion_id: inscripcionId, disciplina_id: disciplinaId, tipo: 'bloque',
                bloque, anio: anioBloque, faltas: faltasBloque,
                motivo: `${faltasBloque} faltas en ${disc?.nombre || 'la disciplina'} en el cuatrimestre: queda libre del bloque (rinde libre + repaga matrícula).`,
            })
            // Avisar al staff (incluye coordinación: ve todo menos pagos).
            try {
                const { data: staff } = await admin.from('profiles').select('id').in('rol', ['admin', 'recepcion', 'coordinador'])
                if (staff?.length) await admin.from('notificaciones').insert(staff.map((s: any) => ({
                    usuario_id: s.id, titulo: '⚠️ Alumno libre del bloque — La Liga 2027',
                    mensaje: `Un alumno quedó libre de ${disc?.nombre || 'una disciplina'} por ${faltasBloque} faltas. Debe rendir libre y repagar matrícula.`,
                    link: '/la-liga?tab=liga2027', leido: false,
                })))
            } catch { /* best-effort */ }
        } else if (!libreBloque.resuelto) {
            await admin.from('liga27_libres').update({ faltas: faltasBloque }).eq('id', libreBloque.id)
        }
    } else if (libreBloque && !libreBloque.resuelto) {
        // Cayó por debajo del umbral (p. ej. se justificó una falta) → quitar.
        await admin.from('liga27_libres').delete().eq('id', libreBloque.id)
    }
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 3 — BENEFICIOS POR CATEGORÍA A/B/C
// Una fila por letra con una lista de beneficios. La dirección (admin/recepción)
// edita; el alumno consulta las 3 categorías pero solo tiene activa la suya.
// ════════════════════════════════════════════════════════════════════════════

const BENEFICIOS_DEFAULT: Record<string, string[]> = {
    A: ['Prioridad en audiciones y castings', 'Acceso a salas para ensayar', 'Descuentos y becas', 'Acceso a oportunidades y actividades extra'],
    B: ['Acceso a salas para ensayar (con reserva)', 'Descuentos seleccionados', 'Participación en actividades'],
    C: ['Acompañamiento para mejorar tu promedio', 'Acceso a los contenidos del programa'],
}

// Devuelve las 3 letras con sus items (fallback a los defaults si la tabla está
// vacía). Lectura: cualquier staff (admin/recepción/coordinación).
export async function getBeneficiosLiga27Action(): Promise<{ letra: string; items: string[]; nota: string | null }[]> {
    const g = await gate(); if (!g.ok) return []
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_beneficios').select('letra, items, nota')
    const byLetra: Record<string, any> = {}; for (const r of (data || [])) byLetra[r.letra] = r
    return (['A', 'B', 'C'] as const).map(l => ({
        letra: l,
        items: Array.isArray(byLetra[l]?.items) ? byLetra[l].items : BENEFICIOS_DEFAULT[l],
        nota: byLetra[l]?.nota ?? null,
    }))
}

export async function guardarBeneficiosLiga27Action(payload: {
    letra: 'A' | 'B' | 'C'; items: string[]; nota?: string
}): Promise<{ ok: boolean; error?: string }> {
    const g = await gate(['admin', 'recepcion']); if (!g.ok) return { ok: false, error: g.error }
    const items = (payload.items || []).map(s => s.trim()).filter(Boolean)
    const admin = getAdminClient()
    const { error } = await admin.from('liga27_beneficios').upsert({
        letra: payload.letra, items, nota: payload.nota?.trim() || null,
        actualizado_por: g.userId, actualizado_at: new Date().toISOString(),
    }, { onConflict: 'letra' })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/la-liga')
    return { ok: true }
}

// Beneficios para el perfil del alumno (sin gate de staff; lo llama su propio
// académico). Siempre devuelve las 3 letras.
async function beneficiosParaAlumno(admin: ReturnType<typeof getAdminClient>): Promise<{ letra: string; items: string[]; nota: string | null }[]> {
    const { data } = await admin.from('liga27_beneficios').select('letra, items, nota')
    const byLetra: Record<string, any> = {}; for (const r of (data || [])) byLetra[r.letra] = r
    return (['A', 'B', 'C'] as const).map(l => ({
        letra: l,
        items: Array.isArray(byLetra[l]?.items) ? byLetra[l].items : BENEFICIOS_DEFAULT[l],
        nota: byLetra[l]?.nota ?? null,
    }))
}

// Libres para administración (gestión). Con perfil + disciplina.
export async function getLibresLiga27Action() {
    const g = await gate(); if (!g.ok) return []
    const admin = getAdminClient()
    const { data: libres } = await admin.from('liga27_libres').select('*').order('creado_at', { ascending: false })
    if (!libres?.length) return []
    const inscIds = [...new Set(libres.map((l: any) => l.inscripcion_id))]
    const discIds = [...new Set(libres.map((l: any) => l.disciplina_id))]
    const { data: inss } = await admin.from('liga27_inscripciones').select('id, profile_id').in('id', inscIds)
    const perfById = await perfilesLiga27ByProfileId(admin, (inss || []).map((i: any) => i.profile_id))
    const { data: discs } = await admin.from('liga27_disciplinas').select('id, nombre').in('id', discIds)
    const insById: Record<string, any> = {}; for (const i of (inss || [])) insById[i.id] = i
    const discById: Record<string, any> = {}; for (const d of (discs || [])) discById[d.id] = d
    return libres.map((l: any) => {
        const ins = insById[l.inscripcion_id]
        const perf = ins?.profile_id ? perfById[ins.profile_id] : null
        return { ...l, alumno: perf ? `${perf.nombre} ${perf.apellido || ''}`.trim() : '—', disciplina: discById[l.disciplina_id]?.nombre || '—' }
    })
}

export async function resolverLibreLiga27Action(libreId: string): Promise<{ ok: boolean; error?: string }> {
    const g = await gate(['admin', 'recepcion']); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const { error } = await admin.from('liga27_libres').update({ resuelto: true }).eq('id', libreId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/la-liga')
    return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════════
// PROGRAMA + CONTENIDO POR CLASE (portal docente)
// ════════════════════════════════════════════════════════════════════════════

export async function getProgramaDisciplinaLiga27Action(disciplinaId: string) {
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_programa').select('*').eq('disciplina_id', disciplinaId).order('orden', { ascending: true })
    return data || []
}

export async function guardarProgramaLiga27Action(payload: {
    id?: string; disciplina_id: string; bloque?: number; titulo?: string; contenido?: string; bloqueado?: boolean; orden?: number
}): Promise<{ ok: boolean; error?: string }> {
    const g = await gate(['admin', 'recepcion']); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const row: any = {
        disciplina_id: payload.disciplina_id, bloque: payload.bloque ?? 1,
        titulo: payload.titulo?.trim() || null, contenido: payload.contenido || null,
        bloqueado: !!payload.bloqueado, orden: payload.orden ?? 0,
    }
    const { error } = payload.id
        ? await admin.from('liga27_programa').update(row).eq('id', payload.id)
        : await admin.from('liga27_programa').insert(row)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/la-liga')
    return { ok: true }
}

export async function getClasesContenidoLiga27Action(disciplinaId: string) {
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_clases_contenido').select('*').eq('disciplina_id', disciplinaId).order('clase_fecha', { ascending: false })
    return data || []
}

export async function guardarClaseContenidoLiga27Action(payload: {
    disciplina_id: string; clase_fecha: string; contenido?: string; metodo_evaluacion?: string
    reemplazo_nombre?: string; reemplazo_contacto?: string
}): Promise<{ ok: boolean; error?: string }> {
    const g = await gateDocenteODisciplina(payload.disciplina_id); if (!g.ok) return { ok: false, error: g.error }
    if (!payload.clase_fecha) return { ok: false, error: 'Elegí la fecha de la clase.' }
    const admin = getAdminClient()
    const { error } = await admin.from('liga27_clases_contenido').upsert({
        disciplina_id: payload.disciplina_id, clase_fecha: payload.clase_fecha,
        contenido: payload.contenido?.trim() || null, metodo_evaluacion: payload.metodo_evaluacion?.trim() || null,
        reemplazo_nombre: payload.reemplazo_nombre?.trim() || null, reemplazo_contacto: payload.reemplazo_contacto?.trim() || null,
        cargado_por: g.userId, creado_at: new Date().toISOString(),
    }, { onConflict: 'disciplina_id,clase_fecha' })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/la-liga')
    return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════════
// ALUMNO LOGUEADO — su académico (4 pestañas con datos reales)
// ════════════════════════════════════════════════════════════════════════════

export async function getMiAcademicoLiga27Action(): Promise<any | null> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return null
    const admin = getAdminClient()
    const { data: ins } = await admin.from('liga27_inscripciones').select('id, letra_actual, promedio_letra').eq('profile_id', uid).order('creado_at', { ascending: false }).limit(1).maybeSingle()
    if (!ins) return { inscripcion: null, evaluaciones: [], asistencias: [], programa: [], beneficios: await beneficiosParaAlumno(admin) }

    const { data: disciplinas } = await admin.from('liga27_disciplinas').select('id, nombre, bloque, orden').eq('activa', true).order('orden', { ascending: true })
    const discIds = (disciplinas || []).map((d: any) => d.id)

    // Evaluaciones por disciplina.
    const { data: examenes } = discIds.length ? await admin.from('liga27_examenes').select('id, disciplina_id, numero').in('disciplina_id', discIds) : { data: [] as any[] }
    const { data: notas } = await admin.from('liga27_alumno_examen').select('examen_id, puntaje, observaciones').eq('inscripcion_id', ins.id)
    const notaByExamen: Record<string, any> = {}; for (const n of (notas || [])) notaByExamen[n.examen_id] = n

    const evaluaciones = (disciplinas || []).map((d: any) => {
        const exs = (examenes || []).filter((e: any) => e.disciplina_id === d.id).sort((a: any, b: any) => a.numero - b.numero)
        return {
            disciplina: d.nombre, bloque: d.bloque,
            examenes: exs.map((e: any) => ({ numero: e.numero, puntaje: notaByExamen[e.id]?.puntaje || null, observaciones: notaByExamen[e.id]?.observaciones || null })),
        }
    })

    // Asistencias por disciplina + condición de regularidad.
    const { data: asis } = await admin.from('liga27_asistencia').select('disciplina_id, clase_fecha, presente, justificada').eq('inscripcion_id', ins.id)
    const { data: libres } = await admin.from('liga27_libres').select('disciplina_id, tipo, mes, anio, faltas, resuelto, motivo').eq('inscripcion_id', ins.id)
    const asistencias = (disciplinas || []).map((d: any) => {
        const rows = (asis || []).filter((a: any) => a.disciplina_id === d.id)
        const presentes = rows.filter((a: any) => a.presente).length
        const ausentes = rows.filter((a: any) => !a.presente && !a.justificada).length
        const justificadas = rows.filter((a: any) => !a.presente && a.justificada).length
        const libDisc = (libres || []).filter((l: any) => l.disciplina_id === d.id)
        const libreBloque = libDisc.find((l: any) => l.tipo === 'bloque' && !l.resuelto)
        const libresMes = libDisc.filter((l: any) => l.tipo === 'mes')
        return {
            disciplina: d.nombre, presentes, ausentes, justificadas, faltas: ausentes,
            condicion: libreBloque ? 'libre_bloque' : (libresMes.length ? 'libre_mes' : 'regular'),
            libre_bloque_motivo: libreBloque?.motivo || null,
            libres_mes: libresMes.map((l: any) => ({ mes: l.mes, anio: l.anio, faltas: l.faltas })),
        }
    })

    // Programa por disciplina (bloque 2 bloqueado si corresponde).
    const { data: prog } = discIds.length ? await admin.from('liga27_programa').select('disciplina_id, bloque, titulo, contenido, bloqueado, orden').in('disciplina_id', discIds).order('orden', { ascending: true }) : { data: [] as any[] }
    const programa = (disciplinas || []).map((d: any) => ({
        disciplina: d.nombre,
        items: (prog || []).filter((p: any) => p.disciplina_id === d.id),
    }))

    // Beneficios de las 3 categorías (la activa es la letra del alumno).
    const beneficios = await beneficiosParaAlumno(admin)

    return { inscripcion: ins, evaluaciones, asistencias, programa, beneficios }
}
