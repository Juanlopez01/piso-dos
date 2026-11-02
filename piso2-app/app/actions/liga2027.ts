'use server'

// ============================================================================
// LA LIGA 2027 — Server actions (FASE 1: Inscripción + Pagos).
//
// Módulo namespaced `liga27_*`. La cuenta del alumno es propia (email+contraseña,
// cookie HMAC en lib/liga27-session.ts), igual que Talent: todo pasa por el admin
// client (service role) porque las tablas tienen RLS sin policy.
//
// El staff (recepción/admin) se autentica con la sesión de Supabase (profiles.rol).
// ============================================================================

import { createClient } from '@/utils/supabase/server-helper'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import crypto from 'crypto'
import {
    hashPassword, verifyPassword,
    crearSesionLiga27, leerSesionLiga27, cerrarSesionLiga27,
} from '@/lib/liga27-session'
import { aplicarEfectoPagoLiga27 } from '@/app/actions/_liga27-pago'

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
// CUENTA DEL ALUMNO (registro / login / sesión)
// ════════════════════════════════════════════════════════════════════════════

export async function registrarAlumnoLiga27Action(payload: {
    email: string; password: string; nombre: string; apellido?: string
}): Promise<{ ok: boolean; error?: string }> {
    const email = (payload.email || '').trim().toLowerCase()
    const password = payload.password || ''
    if (!emailOk(email)) return { ok: false, error: 'Poné un email válido.' }
    if (password.length < 6) return { ok: false, error: 'La contraseña tiene que tener al menos 6 caracteres.' }
    if (!payload.nombre?.trim()) return { ok: false, error: 'Poné tu nombre.' }

    const admin = getAdminClient()
    const { data: existente } = await admin.from('liga27_perfiles').select('id, password_hash').eq('email', email).maybeSingle()

    if (existente?.id) {
        if (existente.password_hash) return { ok: false, error: 'Ya existe una cuenta con ese email. Iniciá sesión.' }
        // Perfil creado por una postulación previa (sin cuenta) → lo reclama.
        const { error } = await admin.from('liga27_perfiles').update({
            password_hash: hashPassword(password),
            nombre: payload.nombre.trim(),
            apellido: payload.apellido?.trim() || null,
            updated_at: new Date().toISOString(),
        }).eq('id', existente.id)
        if (error) return { ok: false, error: error.message }
        await crearSesionLiga27(existente.id)
        return { ok: true }
    }

    const { data, error } = await admin.from('liga27_perfiles').insert({
        email,
        password_hash: hashPassword(password),
        nombre: payload.nombre.trim(),
        apellido: payload.apellido?.trim() || null,
    }).select('id').single()
    if (error) return { ok: false, error: error.message }
    await crearSesionLiga27(data.id)
    return { ok: true }
}

export async function loginAlumnoLiga27Action(payload: { email: string; password: string }): Promise<{ ok: boolean; error?: string }> {
    const email = (payload.email || '').trim().toLowerCase()
    if (!email || !payload.password) return { ok: false, error: 'Completá email y contraseña.' }
    const admin = getAdminClient()
    const { data } = await admin.from('liga27_perfiles').select('id, password_hash').eq('email', email).maybeSingle()
    if (!data?.password_hash || !verifyPassword(payload.password, data.password_hash)) {
        return { ok: false, error: 'Email o contraseña incorrectos.' }
    }
    await crearSesionLiga27(data.id)
    return { ok: true }
}

export async function logoutAlumnoLiga27Action(): Promise<{ ok: boolean }> {
    await cerrarSesionLiga27()
    return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════════
// MI PERFIL (vista del alumno logueado) — perfil + inscripción + estado de pago
// ════════════════════════════════════════════════════════════════════════════

export type MiLiga27 = {
    perfil: any
    inscripcion: any | null
    pagos: any[]
    bloqueado: boolean
}

export async function getMiLiga27Action(): Promise<MiLiga27 | null> {
    const perfilId = await leerSesionLiga27()
    if (!perfilId) return null
    const admin = getAdminClient()
    const { data: perfil } = await admin.from('liga27_perfiles')
        .select('id, email, nombre, apellido, telefono, instagram, fecha_nac, ciudad, foto_url, dni')
        .eq('id', perfilId).maybeSingle()
    if (!perfil) return null
    const { data: inscripcion } = await admin.from('liga27_inscripciones')
        .select('*').eq('perfil_id', perfilId).order('creado_at', { ascending: false }).limit(1).maybeSingle()
    let pagos: any[] = []
    if (inscripcion) {
        const { data: ps } = await admin.from('liga27_pagos')
            .select('id, concepto, mes, anio, monto, estado, metodo, pagado_at, creado_at')
            .eq('inscripcion_id', inscripcion.id).order('creado_at', { ascending: false })
        pagos = ps || []
    }
    return { perfil, inscripcion, pagos, bloqueado: inscripcion?.estado === 'bloqueado' }
}

export async function guardarMiPerfilLiga27Action(payload: {
    nombre: string; apellido?: string; telefono?: string; instagram?: string
    fecha_nac?: string | null; ciudad?: string; foto_url?: string; dni?: string
}): Promise<{ ok: boolean; error?: string }> {
    const perfilId = await leerSesionLiga27()
    if (!perfilId) return { ok: false, error: 'Tenés que iniciar sesión.' }
    if (!payload.nombre?.trim()) return { ok: false, error: 'El nombre no puede quedar vacío.' }
    const admin = getAdminClient()
    const { error } = await admin.from('liga27_perfiles').update({
        nombre: payload.nombre.trim(),
        apellido: payload.apellido?.trim() || null,
        telefono: payload.telefono?.trim() || null,
        instagram: payload.instagram?.trim() || null,
        fecha_nac: payload.fecha_nac || null,
        ciudad: payload.ciudad?.trim() || null,
        foto_url: payload.foto_url || undefined,
        dni: payload.dni?.trim() || null,
        updated_at: new Date().toISOString(),
    }).eq('id', perfilId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
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

// Crea/reclama el perfil (por email) y registra la postulación. Para "anotarse"
// pedimos cuenta: si viene con sesión la usamos; si no, creamos el perfil sin
// contraseña (se reclama después con el registro por email).
export async function postularLiga27Action(payload: {
    nombre: string; email: string; telefono?: string; instagram?: string
    fecha_nac?: string | null; ciudad?: string; foto_url?: string
    tipo_contacto: 'llamar' | 'escribir' | 'anotarse'; nota?: string
    lanzamiento_id?: string
}): Promise<{ ok: boolean; error?: string; perfilId?: string }> {
    const email = (payload.email || '').trim().toLowerCase()
    if (!payload.nombre?.trim()) return { ok: false, error: 'Poné tu nombre.' }
    if (!emailOk(email)) return { ok: false, error: 'Poné un email válido.' }
    if (!['llamar', 'escribir', 'anotarse'].includes(payload.tipo_contacto)) return { ok: false, error: 'Elegí una opción.' }

    const admin = getAdminClient()

    // Perfil por sesión o por email (reclamo).
    let perfilId = await leerSesionLiga27()
    if (!perfilId) {
        const { data: ex } = await admin.from('liga27_perfiles').select('id').eq('email', email).maybeSingle()
        if (ex?.id) {
            perfilId = ex.id
            await admin.from('liga27_perfiles').update({
                nombre: payload.nombre.trim(),
                telefono: payload.telefono?.trim() || null,
                instagram: payload.instagram?.trim() || null,
                fecha_nac: payload.fecha_nac || null,
                ciudad: payload.ciudad?.trim() || null,
                foto_url: payload.foto_url || undefined,
                updated_at: new Date().toISOString(),
            }).eq('id', ex.id)
        } else {
            const { data: nuevo, error: e1 } = await admin.from('liga27_perfiles').insert({
                email,
                nombre: payload.nombre.trim(),
                telefono: payload.telefono?.trim() || null,
                instagram: payload.instagram?.trim() || null,
                fecha_nac: payload.fecha_nac || null,
                ciudad: payload.ciudad?.trim() || null,
                foto_url: payload.foto_url || null,
            }).select('id').single()
            if (e1) return { ok: false, error: e1.message }
            perfilId = nuevo.id
        }
    }

    const { error } = await admin.from('liga27_postulaciones').insert({
        perfil_id: perfilId,
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
            link: '/liga2027-admin',
            leido: false,
        })))
    } catch { /* best-effort */ }

    revalidatePath('/liga2027-admin')
    return { ok: true, perfilId: perfilId || undefined }
}

export async function listPostulacionesLiga27Action(estado?: string) {
    const g = await gateStaff(STAFF_LECTURA); if (!g.ok) return []
    const admin = getAdminClient()
    let q = admin.from('liga27_postulaciones').select('*').order('creado_at', { ascending: false })
    if (estado) q = q.eq('estado', estado)
    const { data } = await q
    return data || []
}

// Aprobar: marca la postulación 'aprobada' y crea/activa la inscripción del
// perfil (estado 'aprobado'). No cobra: la matrícula va por link de pago (1.4).
export async function aprobarPostulacionLiga27Action(postulacionId: string, plan?: 'mensual' | 'cuatrimestral'): Promise<{ ok: boolean; error?: string; inscripcionId?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const { data: post } = await admin.from('liga27_postulaciones').select('*').eq('id', postulacionId).maybeSingle()
    if (!post) return { ok: false, error: 'Postulación no encontrada' }
    if (!post.perfil_id) return { ok: false, error: 'La postulación no tiene perfil asociado' }

    // Inscripción (upsert por perfil+lanzamiento).
    const { data: existente } = await admin.from('liga27_inscripciones')
        .select('id').eq('perfil_id', post.perfil_id).eq('lanzamiento_id', post.lanzamiento_id).maybeSingle()
    let inscripcionId = existente?.id
    if (inscripcionId) {
        await admin.from('liga27_inscripciones').update({ estado: 'aprobado', plan: plan || null }).eq('id', inscripcionId)
    } else {
        const { data: ins, error } = await admin.from('liga27_inscripciones').insert({
            perfil_id: post.perfil_id,
            lanzamiento_id: post.lanzamiento_id,
            estado: 'aprobado',
            plan: plan || null,
        }).select('id').single()
        if (error) return { ok: false, error: error.message }
        inscripcionId = ins.id
    }

    await admin.from('liga27_postulaciones').update({ estado: 'aprobada' }).eq('id', postulacionId)
    revalidatePath('/liga2027-admin')
    return { ok: true, inscripcionId }
}

export async function rechazarPostulacionLiga27Action(postulacionId: string): Promise<{ ok: boolean; error?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const { error } = await admin.from('liga27_postulaciones').update({ estado: 'no' }).eq('id', postulacionId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/liga2027-admin')
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
    const perfilIds = [...new Set(inss.map((i: any) => i.perfil_id))]
    const { data: perfiles } = await admin.from('liga27_perfiles')
        .select('id, nombre, apellido, email, telefono, instagram, foto_url, ciudad').in('id', perfilIds)
    const pById: Record<string, any> = {}
    for (const p of (perfiles || [])) pById[p.id] = p
    return inss.map((i: any) => ({ ...i, perfil: pById[i.perfil_id] || null }))
}

export async function enviarBienvenidaLiga27Action(inscripcionId: string): Promise<{ ok: boolean; error?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
    const admin = getAdminClient()
    const { data: ins } = await admin.from('liga27_inscripciones').select('id, perfil_id, bienvenida_enviada').eq('id', inscripcionId).maybeSingle()
    if (!ins) return { ok: false, error: 'Inscripción no encontrada' }
    const { data: perfil } = await admin.from('liga27_perfiles').select('email, nombre').eq('id', ins.perfil_id).maybeSingle()
    if (!perfil?.email) return { ok: false, error: 'El perfil no tiene email.' }
    try {
        const { enviarMail } = await import('@/lib/mail')
        await enviarMail({
            to: perfil.email,
            subject: '¡Bienvenid@ a La Liga 2027! · Piso 2',
            html: mailSimpleHTML(perfil.nombre || '',
                'Tu lugar en La Liga 2027 quedó confirmado. Entrá a tu perfil para ver tu estado, tus notas y tu asistencia a medida que arranque el programa.\n\nCreá o reclamá tu cuenta con este mismo email en: ' + SITE() + '/liga2027/login'),
        })
    } catch { /* best-effort */ }
    await admin.from('liga27_inscripciones').update({ bienvenida_enviada: true }).eq('id', inscripcionId)
    revalidatePath('/liga2027-admin')
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
    revalidatePath('/liga2027-admin')
    return { ok: true }
}

// Registrar un pago manual/presencial (caja). Marca 'pagado' y, si es cuota del
// mes vigente, desbloquea la inscripción. Si es matrícula, setea matricula_pagada.
export async function registrarPagoLiga27Action(payload: {
    inscripcionId: string; concepto: 'matricula' | 'cuota' | 'examen_libre'
    mes?: number; anio?: number; monto: number; metodo: string
}): Promise<{ ok: boolean; error?: string }> {
    const g = await gateStaff(); if (!g.ok) return { ok: false, error: g.error }
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
    revalidatePath('/liga2027-admin')
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
