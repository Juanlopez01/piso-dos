'use server'

// ============================================================================
// LA LIGA 2027 — Server actions (Inscripción + Pagos).
//
// Módulo namespaced `liga27_*`. Los alumnos de La Liga 2027 son alumnos NORMALES
// de 2M (auth user / profiles, rol 'alumno') y entran por /login como todos: la
// inscripción cuelga del profiles.id (liga27_inscripciones.profile_id). La
// postulación pública es solo un lead; al aprobar se crea/vincula el alumno.
//
// Todo pasa por el admin client (service role) porque las tablas liga27_* tienen
// RLS sin policy. El staff se autentica con la sesión de Supabase (profiles.rol).
// ============================================================================

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import crypto from 'crypto'
import { aplicarEfectoPagoLiga27 } from '@/app/actions/_liga27-pago'
import { cuotasHabilitadas, CUOTAS_DESDE_LABEL } from '@/lib/liga27'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

// Staff que puede gestionar La Liga 2027. Las escrituras de dinero exigen 'admin'
// o 'recepcion'; lectura también para 'coordinador' (sin ver pagos, Fase 3).
const STAFF_GESTION = ['admin', 'recepcion']
const STAFF_LECTURA = ['admin', 'recepcion', 'coordinador']

async function gateStaff(roles: string[] = STAFF_GESTION): Promise<{ ok: boolean; userId?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { ok: false, error: 'No autorizado' }
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
    if (!perfil || !roles.includes(perfil.rol)) return { ok: false, error: 'Sin permisos' }
    return { ok: true, userId: session.user.id }
}

// ════════════════════════════════════════════════════════════════════════════
// ALUMNO LOGUEADO (sesión normal de 2M / Supabase) — su perfil de La Liga 2027
// ════════════════════════════════════════════════════════════════════════════

// Id del alumno logueado por el login de 2M (Supabase auth). null si no hay sesión.
async function authUserId(): Promise<string | null> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.id || null
}

export type MiLiga27 = {
    perfil: any
    inscripcion: any | null
    pagos: any[]
    bloqueado: boolean
}

// Perfil + inscripción + estado de pago del alumno logueado (por su profiles.id).
export async function getMiLiga27Action(): Promise<MiLiga27 | null> {
    const uid = await authUserId()
    if (!uid) return null
    const admin = getAdminClient()
    const { data: prof } = await admin.from('profiles')
        .select('id, nombre, apellido, nombre_completo, email, telefono')
        .eq('id', uid).maybeSingle()
    if (!prof) return null
    const { data: inscripcion } = await admin.from('liga27_inscripciones')
        .select('*').eq('profile_id', uid).order('creado_at', { ascending: false }).limit(1).maybeSingle()
    let pagos: any[] = []
    if (inscripcion) {
        const { data: ps } = await admin.from('liga27_pagos')
            .select('id, concepto, mes, anio, monto, estado, metodo, pagado_at, creado_at')
            .eq('inscripcion_id', inscripcion.id).order('creado_at', { ascending: false })
        pagos = ps || []
    }
    const nombre = prof.nombre || (prof.nombre_completo || '').split(' ')[0] || 'Alumno/a'
    const apellido = prof.apellido || (prof.nombre_completo || '').split(' ').slice(1).join(' ') || ''
    const perfil = { id: prof.id, email: prof.email, nombre, apellido, telefono: prof.telefono, foto_url: null }
    return { perfil, inscripcion, pagos, bloqueado: inscripcion?.estado === 'bloqueado' }
}

// ¿El alumno logueado tiene inscripción a La Liga 2027? (para mostrar el menú).
export async function tengoInscripcionLiga27Action(): Promise<boolean> {
    const uid = await authUserId()
    if (!uid) return false
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_inscripciones').select('id').eq('profile_id', uid).limit(1).maybeSingle()
    return !!data
}

// Mes/año actual en hora AR.
function mesAnioAR(): { mes: number; anio: number } {
    const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number)
    return { mes: m, anio: y }
}

// AUTOPAGO del alumno logueado: genera (o reusa) un pago pendiente de su propia
// inscripción (matrícula o cuota del mes) y devuelve el link público para pagar.
// Reusa un pendiente existente para no duplicar, y no deja pagar lo ya saldado.
export async function generarMiPagoLiga27Action(payload: {
    concepto: 'matricula' | 'cuota'; mes?: number; anio?: number
}): Promise<{ ok: boolean; error?: string; url?: string }> {
    const uid = await authUserId()
    if (!uid) return { ok: false, error: 'Iniciá sesión.' }
    if (payload.concepto !== 'matricula' && payload.concepto !== 'cuota') return { ok: false, error: 'Concepto inválido.' }
    if (payload.concepto === 'cuota' && !cuotasHabilitadas()) return { ok: false, error: `Las cuotas se pagan a partir de ${CUOTAS_DESDE_LABEL}.` }
    const admin = getAdminClient()

    const { data: ins } = await admin.from('liga27_inscripciones')
        .select('id, plan, matricula_pagada')
        .eq('profile_id', uid).order('creado_at', { ascending: false }).limit(1).maybeSingle()
    if (!ins) return { ok: false, error: 'No tenés inscripción a La Liga 2027.' }

    if (payload.concepto === 'matricula' && ins.matricula_pagada) return { ok: false, error: 'Tu matrícula ya está paga.' }

    const { mes: mesAhora, anio: anioAhora } = mesAnioAR()
    const mes = payload.concepto === 'cuota' ? (payload.mes ?? mesAhora) : null
    const anio = payload.concepto === 'cuota' ? (payload.anio ?? anioAhora) : null

    // Cuota ya saldada de ese mes → no volver a cobrar.
    if (payload.concepto === 'cuota') {
        const { data: yaPaga } = await admin.from('liga27_pagos').select('id')
            .eq('inscripcion_id', ins.id).eq('concepto', 'cuota').eq('mes', mes).eq('anio', anio).eq('estado', 'pagado').maybeSingle()
        if (yaPaga) return { ok: false, error: `La cuota de ${mes}/${anio} ya está paga.` }
    }

    // ¿Hay un pendiente que sirva? → reusar su link (evita duplicados).
    let qPend = admin.from('liga27_pagos').select('id, token')
        .eq('inscripcion_id', ins.id).eq('concepto', payload.concepto).eq('estado', 'pendiente')
    if (payload.concepto === 'cuota') qPend = qPend.eq('mes', mes).eq('anio', anio)
    const { data: pend } = await qPend.order('creado_at', { ascending: false }).limit(1).maybeSingle()
    if (pend?.id && pend.token) return { ok: true, url: `${SITE()}/liga2027/pagar/${pend.id}?t=${pend.token}` }

    // Monto según concepto/plan.
    const precios = await getPreciosLiga27Action()
    const monto = payload.concepto === 'matricula'
        ? precios.liga27_matricula
        : (ins.plan === 'cuatrimestral' ? precios.liga27_cuota_cuatrimestral : precios.liga27_cuota_mensual)
    if (!monto || monto <= 0) return { ok: false, error: 'El monto todavía no está configurado. Escribile a administración.' }

    const token = crypto.randomBytes(12).toString('hex')
    const { data, error } = await admin.from('liga27_pagos').insert({
        inscripcion_id: ins.id, concepto: payload.concepto, mes, anio, monto,
        estado: 'pendiente', metodo: 'mercadopago', token,
    }).select('id').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, url: `${SITE()}/liga2027/pagar/${data.id}?t=${token}` }
}

// Link para pagar un pago PENDIENTE existente que pertenece al alumno logueado
// (p. ej. una cuota que generó recepción). Valida la titularidad.
export async function urlPagoMiLiga27Action(pagoId: string): Promise<{ ok: boolean; error?: string; url?: string }> {
    const uid = await authUserId()
    if (!uid || !pagoId) return { ok: false, error: 'Iniciá sesión.' }
    const admin = getAdminClient()
    const { data: pago } = await admin.from('liga27_pagos')
        .select('id, token, estado, inscripcion_id, concepto').eq('id', pagoId).maybeSingle()
    if (!pago) return { ok: false, error: 'Pago no encontrado.' }
    if (pago.estado === 'pagado') return { ok: false, error: 'Ese pago ya está saldado.' }
    if (pago.concepto === 'cuota' && !cuotasHabilitadas()) return { ok: false, error: `Las cuotas se pagan a partir de ${CUOTAS_DESDE_LABEL}.` }
    const { data: ins } = await admin.from('liga27_inscripciones').select('profile_id').eq('id', pago.inscripcion_id).maybeSingle()
    if (!ins || ins.profile_id !== uid) return { ok: false, error: 'No autorizado.' }
    return { ok: true, url: `${SITE()}/liga2027/pagar/${pago.id}?t=${pago.token}` }
}

// Busca un alumno de 2M por email; si no existe, lo crea (rol 'alumno'). Devuelve
// su profiles.id. El profiles se crea solo por trigger desde user_metadata.
async function buscarOCrearAlumno(admin: ReturnType<typeof getAdminClient>, datos: {
    email: string; nombre?: string; apellido?: string; telefono?: string
}): Promise<{ ok: boolean; profileId?: string; creado?: boolean; error?: string }> {
    const email = (datos.email || '').trim().toLowerCase()
    if (!emailOk(email)) return { ok: false, error: 'La postulación no tiene un email válido.' }

    const { data: existente } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
    if (existente?.id) return { ok: true, profileId: existente.id, creado: false }

    // Cuenta nueva: contraseña aleatoria; el alumno la define con el link de
    // recuperación que va en la bienvenida.
    const nombre = (datos.nombre || '').trim()
    const apellido = (datos.apellido || '').trim()
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password: crypto.randomBytes(12).toString('hex'),
        email_confirm: true,
        user_metadata: {
            nombre, apellido,
            nombre_completo: `${nombre} ${apellido}`.trim() || nombre,
            telefono: datos.telefono?.trim() || null,
            rol: 'alumno',
        },
    })
    if (error) {
        if (error.message.includes('already registered')) {
            const { data: ex2 } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
            if (ex2?.id) return { ok: true, profileId: ex2.id, creado: false }
        }
        return { ok: false, error: error.message }
    }
    return { ok: true, profileId: data.user.id, creado: true }
}

// ════════════════════════════════════════════════════════════════════════════
// LANDING / LANZAMIENTOS (público + admin)
// ════════════════════════════════════════════════════════════════════════════

// Lanzamiento activo para el CTA de la home y la página pública del programa.
export async function getLanzamientoActivoAction() {
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_lanzamientos')
        .select('id, titulo, subtitulo, video_url, descripcion, cta_texto, slug, activo, orden')
        .eq('activo', true).order('orden', { ascending: true }).limit(1).maybeSingle()
    return data || null
}

export async function getLanzamientoBySlugAction(slug: string) {
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_lanzamientos')
        .select('id, titulo, subtitulo, video_url, descripcion, cta_texto, slug, activo')
        .eq('slug', slug).maybeSingle()
    return data || null
}

export async function getLanzamientosAdminAction() {
    const g = await gateStaff(STAFF_LECTURA); if (!g.ok) return []
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_lanzamientos').select('*').order('orden', { ascending: true })
    return data || []
}

function slugify(s: string) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'liga-2027'
}

export async function guardarLanzamientoAction(payload: {
    id?: string; titulo: string; subtitulo?: string; video_url?: string
    descripcion?: string; cta_texto?: string; activo?: boolean; orden?: number
}): Promise<{ ok: boolean; error?: string; id?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    if (!payload.titulo?.trim()) return { ok: false, error: 'Poné un título.' }
    const admin = getAdminClient()
    const row: any = {
        titulo: payload.titulo.trim(),
        subtitulo: payload.subtitulo?.trim() || null,
        video_url: payload.video_url?.trim() || null,
        descripcion: payload.descripcion || null,
        cta_texto: payload.cta_texto?.trim() || 'Inscripciones 2027',
        activo: !!payload.activo,
        orden: payload.orden ?? 0,
    }
    if (payload.id) {
        const { error } = await admin.from('liga27_lanzamientos').update(row).eq('id', payload.id)
        if (error) return { ok: false, error: error.message }
        revalidatePath('/'); revalidatePath('/liga2027'); revalidatePath('/la-liga-2027')
        return { ok: true, id: payload.id }
    }
    row.slug = slugify(payload.titulo)
    const { data, error } = await admin.from('liga27_lanzamientos').insert(row).select('id').single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/'); revalidatePath('/liga2027')
    return { ok: true, id: data.id }
}

// ════════════════════════════════════════════════════════════════════════════
// POSTULACIÓN PÚBLICA (3 CTAs) + aprobación
// ════════════════════════════════════════════════════════════════════════════

// Registra la postulación como LEAD (sin crear cuenta). La cuenta de alumno de 2M
// se crea/vincula recién al aprobar (aprobarPostulacionLiga27Action).
export async function postularLiga27Action(payload: {
    nombre: string; email: string; telefono?: string; instagram?: string
    fecha_nac?: string | null; ciudad?: string; foto_url?: string
    tipo_contacto: 'llamar' | 'escribir' | 'anotarse'; nota?: string
    lanzamiento_id?: string
}): Promise<{ ok: boolean; error?: string }> {
    const email = (payload.email || '').trim().toLowerCase()
    if (!payload.nombre?.trim()) return { ok: false, error: 'Poné tu nombre.' }
    if (!emailOk(email)) return { ok: false, error: 'Poné un email válido.' }
    if (!['llamar', 'escribir', 'anotarse'].includes(payload.tipo_contacto)) return { ok: false, error: 'Elegí una opción.' }

    const admin = getAdminClient()

    const { error } = await admin.from('liga27_postulaciones').insert({
        lanzamiento_id: payload.lanzamiento_id || null,
        nombre: payload.nombre.trim(),
        email,
        telefono: payload.telefono?.trim() || null,
        instagram: payload.instagram?.trim() || null,
        fecha_nac: payload.fecha_nac || null,
        ciudad: payload.ciudad?.trim() || null,
        foto_url: payload.foto_url || null,
        tipo_contacto: payload.tipo_contacto,
        nota: payload.nota?.trim() || null,
        estado: 'pendiente',
    })
    if (error) return { ok: false, error: error.message }

    // Avisar al staff.
    try {
        const { data: staff } = await admin.from('profiles').select('id').in('rol', STAFF_GESTION)
        if (staff?.length) await admin.from('notificaciones').insert(staff.map((s: any) => ({
            usuario_id: s.id,
            titulo: '🏆 Nueva postulación La Liga 2027',
            mensaje: `${payload.nombre.trim()} se postuló (${payload.tipo_contacto}).`,
            link: '/la-liga?tab=liga2027',
            leido: false,
        })))
    } catch { /* best-effort */ }

    revalidatePath('/la-liga')
    return { ok: true }
}

export async function listPostulacionesLiga27Action(estado?: string) {
    const g = await gateStaff(STAFF_LECTURA); if (!g.ok) return []
    const admin = getAdminClient()
    let q = admin.from('liga27_postulaciones').select('*').order('creado_at', { ascending: false })
    if (estado) q = q.eq('estado', estado)
    const { data } = await q
    return data || []
}

// Aprobar: crea/vincula el alumno de 2M (por email) y crea/activa su inscripción
// (estado 'aprobado'). No cobra: la matrícula va por link de pago. El alumno entra
// por /login normal; si la cuenta es nueva, define su clave con la bienvenida.
export async function aprobarPostulacionLiga27Action(postulacionId: string, plan?: 'mensual' | 'cuatrimestral'): Promise<{ ok: boolean; error?: string; inscripcionId?: string; cuentaCreada?: boolean }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const { data: post } = await admin.from('liga27_postulaciones').select('*').eq('id', postulacionId).maybeSingle()
    if (!post) return { ok: false, error: 'Postulación no encontrada' }

    // Alumno de 2M (existente por email, o nuevo).
    const [nombre, ...rest] = (post.nombre || '').trim().split(' ')
    const cuenta = await buscarOCrearAlumno(admin, {
        email: post.email, nombre, apellido: rest.join(' '), telefono: post.telefono,
    })
    if (!cuenta.ok || !cuenta.profileId) return { ok: false, error: cuenta.error || 'No se pudo crear la cuenta del alumno.' }
    const profileId = cuenta.profileId

    // Inscripción (una por alumno+lanzamiento).
    const { data: existente } = await admin.from('liga27_inscripciones')
        .select('id').eq('profile_id', profileId).eq('lanzamiento_id', post.lanzamiento_id).maybeSingle()
    let inscripcionId = existente?.id
    if (inscripcionId) {
        await admin.from('liga27_inscripciones').update({ estado: 'aprobado', plan: plan || null }).eq('id', inscripcionId)
    } else {
        const { data: ins, error } = await admin.from('liga27_inscripciones').insert({
            profile_id: profileId,
            lanzamiento_id: post.lanzamiento_id,
            estado: 'aprobado',
            plan: plan || null,
        }).select('id').single()
        if (error) return { ok: false, error: error.message }
        inscripcionId = ins.id
    }

    await admin.from('liga27_postulaciones').update({ estado: 'aprobada' }).eq('id', postulacionId)
    revalidatePath('/la-liga')
    return { ok: true, inscripcionId, cuentaCreada: cuenta.creado }
}

export async function rechazarPostulacionLiga27Action(postulacionId: string): Promise<{ ok: boolean; error?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const { error } = await admin.from('liga27_postulaciones').update({ estado: 'no' }).eq('id', postulacionId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/la-liga')
    return { ok: true }
}

// Mensaje directo al postulante (mail). Best-effort si Resend está configurado.
export async function enviarMensajePostulacionLiga27Action(postulacionId: string, texto: string): Promise<{ ok: boolean; error?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    if (!texto?.trim()) return { ok: false, error: 'Escribí un mensaje.' }
    const admin = getAdminClient()
    const { data: post } = await admin.from('liga27_postulaciones').select('email, nombre').eq('id', postulacionId).maybeSingle()
    if (!post?.email) return { ok: false, error: 'La postulación no tiene email.' }
    try {
        const { enviarMail } = await import('@/lib/mail')
        const r = await enviarMail({
            to: post.email,
            subject: 'La Liga 2027 · Piso 2',
            html: mailSimpleHTML(post.nombre || '', texto.trim()),
        })
        if (!r.ok && !r.skipped) return { ok: false, error: r.error || 'No se pudo enviar el mail.' }
    } catch (e: any) { return { ok: false, error: e.message } }
    return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════════
// PERFIL / INSCRIPCIONES (staff) + bienvenida
// ════════════════════════════════════════════════════════════════════════════

export async function getInscripcionesLiga27Action() {
    const g = await gateStaff(STAFF_LECTURA); if (!g.ok) return []
    const admin = getAdminClient()
    const { data: inss } = await admin.from('liga27_inscripciones').select('*').order('creado_at', { ascending: false })
    if (!inss?.length) return []
    const profileIds = [...new Set(inss.map((i: any) => i.profile_id).filter(Boolean))]
    const pById: Record<string, any> = {}
    if (profileIds.length) {
        const { data: perfiles } = await admin.from('profiles')
            .select('id, nombre, apellido, nombre_completo, email, telefono').in('id', profileIds)
        for (const p of (perfiles || [])) {
            const nombre = p.nombre || (p.nombre_completo || '').split(' ')[0] || ''
            const apellido = p.apellido || (p.nombre_completo || '').split(' ').slice(1).join(' ') || ''
            pById[p.id] = { id: p.id, nombre, apellido, email: p.email, telefono: p.telefono, foto_url: null }
        }
    }
    return inss.map((i: any) => ({ ...i, perfil: i.profile_id ? (pById[i.profile_id] || null) : null }))
}

export async function enviarBienvenidaLiga27Action(inscripcionId: string): Promise<{ ok: boolean; error?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const { data: ins } = await admin.from('liga27_inscripciones').select('id, profile_id, bienvenida_enviada').eq('id', inscripcionId).maybeSingle()
    if (!ins) return { ok: false, error: 'Inscripción no encontrada' }
    if (!ins.profile_id) return { ok: false, error: 'La inscripción no tiene alumno vinculado.' }
    const { data: perfil } = await admin.from('profiles').select('email, nombre, nombre_completo').eq('id', ins.profile_id).maybeSingle()
    if (!perfil?.email) return { ok: false, error: 'El alumno no tiene email cargado.' }

    // Link para que el alumno defina su contraseña (entra por /login de 2M).
    let linkClave = ''
    try {
        const { data: link } = await admin.auth.admin.generateLink({
            type: 'recovery', email: perfil.email, options: { redirectTo: `${SITE()}/act-password` },
        })
        const url = (link as any)?.properties?.action_link
        if (url) linkClave = `\n\nDefiní tu contraseña acá: ${url}`
    } catch { /* best-effort */ }

    try {
        const { enviarMail } = await import('@/lib/mail')
        await enviarMail({
            to: perfil.email,
            subject: '¡Bienvenid@ a La Liga 2027! · Piso 2',
            html: mailSimpleHTML(perfil.nombre || perfil.nombre_completo || '',
                'Tu lugar en La Liga 2027 quedó confirmado. Vas a ver tu perfil (notas, asistencia y pagos) ingresando con tu cuenta de Piso 2 en: ' + SITE() + '/login' + linkClave),
        })
    } catch { /* best-effort */ }
    await admin.from('liga27_inscripciones').update({ bienvenida_enviada: true }).eq('id', inscripcionId)
    revalidatePath('/la-liga')
    return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════════
// PAGOS (matrícula + cuotas + bloqueo por mora)
// ════════════════════════════════════════════════════════════════════════════

export async function getPreciosLiga27Action(): Promise<Record<string, number>> {
    const admin = getAdminClient()
    const { data } = await admin.from('configuraciones').select('clave, valor')
        .in('clave', ['liga27_matricula', 'liga27_cuota_mensual', 'liga27_cuota_cuatrimestral'])
    const out: Record<string, number> = { liga27_matricula: 0, liga27_cuota_mensual: 0, liga27_cuota_cuatrimestral: 0 }
    for (const r of (data || [])) out[r.clave] = Number(r.valor) || 0
    return out
}

export async function guardarPreciosLiga27Action(precios: { liga27_matricula?: number; liga27_cuota_mensual?: number; liga27_cuota_cuatrimestral?: number }): Promise<{ ok: boolean; error?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const filas = Object.entries(precios)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([clave, valor]) => ({ clave, valor: Number(valor) || 0 }))
    if (!filas.length) return { ok: true }
    const { error } = await admin.from('configuraciones').upsert(filas, { onConflict: 'clave' })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/la-liga')
    return { ok: true }
}

// Registrar un pago manual/presencial (caja). Marca 'pagado' y, si es cuota del
// mes vigente, desbloquea la inscripción. Si es matrícula, setea matricula_pagada.
export async function registrarPagoLiga27Action(payload: {
    inscripcionId: string; concepto: 'matricula' | 'cuota' | 'examen_libre'
    mes?: number; anio?: number; monto: number; metodo: string
}): Promise<{ ok: boolean; error?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    if (payload.concepto === 'cuota' && !cuotasHabilitadas()) return { ok: false, error: `Las cuotas se cobran a partir de ${CUOTAS_DESDE_LABEL}.` }
    const admin = getAdminClient()
    const { error } = await admin.from('liga27_pagos').insert({
        inscripcion_id: payload.inscripcionId,
        concepto: payload.concepto,
        mes: payload.mes ?? null,
        anio: payload.anio ?? null,
        monto: Number(payload.monto) || 0,
        estado: 'pagado',
        metodo: payload.metodo || 'efectivo',
        pagado_at: new Date().toISOString(),
    })
    if (error) return { ok: false, error: error.message }
    await aplicarEfectoPagoLiga27(admin, payload.inscripcionId, payload.concepto)
    revalidatePath('/la-liga')
    return { ok: true }
}

// Lectura pública del pago por id + token (para la página /liga2027/pagar/[id]).
// No expone datos sensibles; solo lo necesario para mostrar y pagar.
export async function getPagoPublicoLiga27Action(id: string, token: string) {
    if (!id || !token) return null
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_pagos')
        .select('id, concepto, mes, anio, monto, estado, token').eq('id', id).maybeSingle()
    if (!data || data.token !== token) return null
    const { token: _t, ...publico } = data as any
    return publico
}

// Genera un link de pago de MP para la matrícula o una cuota: crea el liga27_pago
// 'pendiente' con token y devuelve la URL pública /liga2027/pagar/<id>?t=<token>.
export async function generarLinkPagoLiga27Action(payload: {
    inscripcionId: string; concepto: 'matricula' | 'cuota' | 'examen_libre'
    mes?: number; anio?: number; monto?: number
}): Promise<{ ok: boolean; error?: string; url?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    if (payload.concepto === 'cuota' && !cuotasHabilitadas()) return { ok: false, error: `Las cuotas se cobran a partir de ${CUOTAS_DESDE_LABEL}.` }
    const admin = getAdminClient()

    // Monto: el pasado, o el configurado según concepto/plan.
    let monto = Number(payload.monto) || 0
    if (!monto) {
        const precios = await getPreciosLiga27Action()
        if (payload.concepto === 'matricula' || payload.concepto === 'examen_libre') monto = precios.liga27_matricula
        else {
            const { data: ins } = await admin.from('liga27_inscripciones').select('plan').eq('id', payload.inscripcionId).maybeSingle()
            monto = ins?.plan === 'cuatrimestral' ? precios.liga27_cuota_cuatrimestral : precios.liga27_cuota_mensual
        }
    }
    if (!monto || monto <= 0) return { ok: false, error: 'Configurá primero el monto (precios de La Liga 2027).' }

    const token = crypto.randomBytes(12).toString('hex')
    const { data, error } = await admin.from('liga27_pagos').insert({
        inscripcion_id: payload.inscripcionId,
        concepto: payload.concepto,
        mes: payload.mes ?? null,
        anio: payload.anio ?? null,
        monto,
        estado: 'pendiente',
        metodo: 'mercadopago',
        token,
    }).select('id').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, url: `${SITE()}/liga2027/pagar/${data.id}?t=${token}` }
}

// ── HTML simple para los mails (layout mínimo, texto con saltos de línea) ─────
function mailSimpleHTML(nombre: string, texto: string) {
    const safe = (texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')
    return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <div style="background:#000;color:#fff;padding:18px 24px;font-weight:600;letter-spacing:.2em">PISO 2 · LA LIGA 2027</div>
        <div style="padding:24px">
            ${nombre ? `<p style="margin:0 0 12px">Hola ${nombre.replace(/</g, '')},</p>` : ''}
            <div style="font-size:15px;line-height:1.6">${safe}</div>
        </div>
    </div>`
}
