'use server'

// ============================================================================
// PISO2 TALENT — Cuenta del talento (usuario = email + contraseña).
// Login propio de Talent, separado del de alumnos. El talento se registra, entra
// y edita sus fotos/datos cuando se lo pedimos. Todo pasa por el admin client
// (service role) porque talent_perfiles tiene RLS y nadie la toca desde el cliente.
// ============================================================================

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { hashPassword, verifyPassword, crearSesionTalento, leerSesionTalento, cerrarSesionTalento } from '@/lib/talent-session'
import { postularConPerfilAction } from '@/app/actions/talent'

const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
)

// Catálogos cerrados (los valida el server, no confiamos en el form).
// Talentos = las mismas opciones que ya existían en el form de Talent.
const TALENTOS_VALIDOS = ['Bailarín/a', 'Acróbata', 'Modelo', 'Cantante', 'Músico/a', 'Influencer', 'Actor/Actriz'] as const
const TALLES = ['XS', 'S', 'M', 'L']

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

// La edad siempre se calcula de la fecha de nacimiento (no se carga a mano).
function calcularEdad(fechaNac?: string | null): number | null {
    if (!fechaNac) return null
    const d = new Date(fechaNac)
    if (isNaN(d.getTime())) return null
    const edad = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000))
    return edad >= 0 && edad < 120 ? edad : null
}

// Lo que ve el cliente de su propio perfil (nunca el hash de la contraseña).
export type MiPerfil = {
    id: string
    email: string
    nombre: string
    apellido: string | null
    fecha_nacimiento: string | null
    edad: number | null
    sexo: string | null
    nacionalidad: string | null
    reside_argentina: boolean | null
    direccion: string | null
    instagram: string | null
    telefono: string | null
    altura: number | null
    peso: number | null
    idiomas: string | null
    talle_remera: string | null
    talle_pantalon: string | null
    talle_calzado: string | null
    talentos: string[]
    descripcion: string | null
    foto_primer_plano: string | null
    foto_cuerpo_entero: string | null
    foto_plano_americano: string | null
    foto_artistica: string | null
    fotos_extra: string[]
    videos: string[]
    acuerdo_aceptado: boolean
    acuerdo_version: string | null
    firma_fecha: string | null
    contrato_adjunto_url: string | null
    aceptado: boolean
    completo: boolean
}

const CAMPOS = 'id, email, nombre, apellido, fecha_nacimiento, edad, sexo, nacionalidad, reside_argentina, direccion, instagram, telefono, altura, peso, idiomas, talle_remera, talle_pantalon, talle_calzado, talentos, descripcion, foto_primer_plano, foto_cuerpo_entero, foto_plano_americano, foto_artistica, fotos_extra, videos, acuerdo_aceptado, acuerdo_version, firma_fecha, contrato_adjunto_url, aceptado, completo'

function aMiPerfil(d: any): MiPerfil {
    return {
        id: d.id, email: d.email, nombre: d.nombre, apellido: d.apellido ?? null,
        fecha_nacimiento: d.fecha_nacimiento ?? null, edad: d.edad ?? null, sexo: d.sexo ?? null,
        nacionalidad: d.nacionalidad ?? null, reside_argentina: d.reside_argentina ?? null,
        direccion: d.direccion ?? null, instagram: d.instagram ?? null, telefono: d.telefono ?? null,
        altura: d.altura ?? null, peso: d.peso ?? null, idiomas: d.idiomas ?? null,
        talle_remera: d.talle_remera ?? null, talle_pantalon: d.talle_pantalon ?? null, talle_calzado: d.talle_calzado ?? null,
        talentos: d.talentos || [], descripcion: d.descripcion ?? null,
        foto_primer_plano: d.foto_primer_plano ?? null, foto_cuerpo_entero: d.foto_cuerpo_entero ?? null,
        foto_plano_americano: d.foto_plano_americano ?? null, foto_artistica: d.foto_artistica ?? null,
        fotos_extra: d.fotos_extra || [], videos: d.videos || [],
        acuerdo_aceptado: !!d.acuerdo_aceptado, acuerdo_version: d.acuerdo_version ?? null,
        firma_fecha: d.firma_fecha ?? null, contrato_adjunto_url: d.contrato_adjunto_url ?? null,
        aceptado: !!d.aceptado, completo: !!d.completo,
    }
}

// Un perfil está "completo" cuando tiene las 3 fotos base, 3 videos y el acuerdo
// firmado. Lo recalculamos tras guardar datos o firmar.
async function recomputarCompleto(admin: ReturnType<typeof getAdminClient>, perfilId: string) {
    const { data: d } = await admin.from('talent_perfiles')
        .select('foto_primer_plano, foto_cuerpo_entero, foto_plano_americano, videos, acuerdo_aceptado')
        .eq('id', perfilId).maybeSingle()
    if (!d) return
    const videos = (d.videos || []).filter(Boolean)
    const completo = !!d.foto_primer_plano && !!d.foto_cuerpo_entero && !!d.foto_plano_americano && videos.length >= 3 && !!d.acuerdo_aceptado
    await admin.from('talent_perfiles').update({ completo }).eq('id', perfilId)
}

// ── Registro ────────────────────────────────────────────────────────────────
// Crea la cuenta. Si ya hay un perfil con ese email SIN contraseña (quedó de una
// postulación vieja), se la "reclama" seteándole la contraseña. Si ya tenía
// contraseña, pedimos que inicie sesión.
export async function registrarTalentoAction(payload: {
    email: string; password: string; nombre: string; apellido?: string
}): Promise<{ ok: boolean; error?: string }> {
    const email = (payload.email || '').trim().toLowerCase()
    const password = payload.password || ''
    if (!emailOk(email)) return { ok: false, error: 'Poné un email válido.' }
    if (password.length < 6) return { ok: false, error: 'La contraseña tiene que tener al menos 6 caracteres.' }
    if (!payload.nombre?.trim()) return { ok: false, error: 'Poné tu nombre.' }

    const admin = getAdminClient()
    const { data: existente } = await admin.from('talent_perfiles').select('id, password_hash').eq('email', email).maybeSingle()

    if (existente?.id) {
        if (existente.password_hash) return { ok: false, error: 'Ya existe una cuenta con ese email. Iniciá sesión.' }
        // Perfil viejo sin cuenta → lo reclama con esta contraseña.
        const { error } = await admin.from('talent_perfiles').update({
            password_hash: hashPassword(password),
            nombre: payload.nombre.trim(),
            apellido: payload.apellido?.trim() || null,
            updated_at: new Date().toISOString(),
        }).eq('id', existente.id)
        if (error) return { ok: false, error: error.message }
        await crearSesionTalento(existente.id)
        return { ok: true }
    }

    const { data, error } = await admin.from('talent_perfiles').insert({
        email,
        password_hash: hashPassword(password),
        nombre: payload.nombre.trim(),
        apellido: payload.apellido?.trim() || null,
    }).select('id').single()
    if (error) return { ok: false, error: error.message }
    await crearSesionTalento(data.id)
    return { ok: true }
}

// ── Login ───────────────────────────────────────────────────────────────────
export async function loginTalentoAction(payload: { email: string; password: string }): Promise<{ ok: boolean; error?: string }> {
    const email = (payload.email || '').trim().toLowerCase()
    if (!email || !payload.password) return { ok: false, error: 'Completá email y contraseña.' }
    const admin = getAdminClient()
    const { data } = await admin.from('talent_perfiles').select('id, password_hash').eq('email', email).maybeSingle()
    if (!data?.password_hash || !verifyPassword(payload.password, data.password_hash)) {
        return { ok: false, error: 'Email o contraseña incorrectos.' }
    }
    await crearSesionTalento(data.id)
    return { ok: true }
}

export async function logoutTalentoAction(): Promise<{ ok: boolean }> {
    await cerrarSesionTalento()
    return { ok: true }
}

// ── Postularse a una búsqueda (requiere cuenta) ──────────────────────────────
// El perfil sale de la sesión, nunca del cliente. Valida que el perfil esté
// completo y con el acuerdo firmado (lo hace postularConPerfilAction).
export async function postularABusquedaSesionAction(busquedaId: string): Promise<{ ok: boolean; error?: string }> {
    const perfilId = await leerSesionTalento()
    if (!perfilId) return { ok: false, error: 'Tenés que iniciar sesión.' }
    const res = await postularConPerfilAction(busquedaId, perfilId)
    return res.success ? { ok: true } : { ok: false, error: res.error }
}

// ── Mi perfil ───────────────────────────────────────────────────────────────
export async function getMiPerfilAction(): Promise<MiPerfil | null> {
    const perfilId = await leerSesionTalento()
    if (!perfilId) return null
    const admin = getAdminClient()
    const { data } = await admin.from('talent_perfiles').select(CAMPOS).eq('id', perfilId).maybeSingle()
    return data ? aMiPerfil(data) : null
}

// Guarda los datos del perfil del talento logueado. No toca email ni contraseña.
// La edad se recalcula de la fecha de nacimiento. El acuerdo/firma va aparte.
export async function guardarMiPerfilAction(payload: {
    nombre: string; apellido?: string; fecha_nacimiento?: string | null; sexo?: string
    nacionalidad?: string; residenteArgentina?: boolean; direccion?: string
    instagram?: string; telefono?: string; altura?: number; peso?: number; idiomas?: string
    talleRemera?: string; tallePantalon?: string; talleCalzado?: string
    talentos?: string[]; descripcion?: string
    fotoPrimerPlano?: string; fotoCuerpoEntero?: string; fotoPlanoAmericano?: string; fotoArtistica?: string
    fotosExtra?: string[]; videos?: string[]
}): Promise<{ ok: boolean; error?: string }> {
    const perfilId = await leerSesionTalento()
    if (!perfilId) return { ok: false, error: 'Tenés que iniciar sesión.' }
    if (!payload.nombre?.trim()) return { ok: false, error: 'El nombre no puede quedar vacío.' }

    const talentos = (payload.talentos || []).filter(t => (TALENTOS_VALIDOS as readonly string[]).includes(t))
    const talle = (v?: string) => (v && TALLES.includes(v)) ? v : null
    const videos = (payload.videos || []).map(v => v?.trim()).filter(Boolean)
    const fechaNac = payload.fecha_nacimiento || null

    const row: any = {
        nombre: payload.nombre.trim(),
        apellido: payload.apellido?.trim() || null,
        fecha_nacimiento: fechaNac,
        edad: calcularEdad(fechaNac),
        sexo: ['mujeres', 'varones'].includes(payload.sexo || '') ? payload.sexo : null,
        nacionalidad: payload.nacionalidad?.trim() || null,
        reside_argentina: payload.residenteArgentina ?? null,
        direccion: payload.direccion?.trim() || null,
        instagram: payload.instagram?.trim() || null,
        telefono: payload.telefono?.trim() || null,
        altura: payload.altura ?? null,
        peso: payload.peso ?? null,
        idiomas: payload.idiomas?.trim() || null,
        talle_remera: talle(payload.talleRemera),
        talle_pantalon: talle(payload.tallePantalon),
        talle_calzado: payload.talleCalzado?.trim() || null,
        talentos,
        descripcion: payload.descripcion?.trim() || null,
        foto_primer_plano: payload.fotoPrimerPlano || null,
        foto_cuerpo_entero: payload.fotoCuerpoEntero || null,
        foto_plano_americano: payload.fotoPlanoAmericano || null,
        foto_artistica: payload.fotoArtistica || null,
        fotos_extra: payload.fotosExtra || [],
        videos,
        updated_at: new Date().toISOString(),
    }

    const admin = getAdminClient()
    const { error } = await admin.from('talent_perfiles').update(row).eq('id', perfilId)
    if (error) return { ok: false, error: error.message }
    await recomputarCompleto(admin, perfilId)
    return { ok: true }
}

// Firma digital del acuerdo único de inscripción a PISO2 TALENT: la firma se
// dibuja y se sube como PNG al bucket; acá guardamos la URL y los datos del
// firmante.
export async function firmarAcuerdoMiPerfilAction(payload: {
    firmaUrl: string; firmaAclaracion: string; firmaDni: string
    representanteNombre?: string; representanteDni?: string; firmaUbicacion?: string
}): Promise<{ ok: boolean; error?: string }> {
    const perfilId = await leerSesionTalento()
    if (!perfilId) return { ok: false, error: 'Tenés que iniciar sesión.' }
    if (!payload.firmaUrl) return { ok: false, error: 'Falta tu firma.' }
    if (!payload.firmaAclaracion?.trim() || !payload.firmaDni?.trim()) return { ok: false, error: 'Completá la aclaración (nombre) y el DNI de la firma.' }

    const admin = getAdminClient()
    const { error } = await admin.from('talent_perfiles').update({
        acuerdo_version: 'inscripcion',
        acuerdo_aceptado: true,
        firma_url: payload.firmaUrl,
        firma_aclaracion: payload.firmaAclaracion.trim(),
        firma_dni: payload.firmaDni.trim(),
        representante_nombre: payload.representanteNombre?.trim() || null,
        representante_dni: payload.representanteDni?.trim() || null,
        firma_fecha: new Date().toISOString(),
        firma_ubicacion: payload.firmaUbicacion?.trim() || null,
        updated_at: new Date().toISOString(),
    }).eq('id', perfilId)
    if (error) return { ok: false, error: error.message }
    await recomputarCompleto(admin, perfilId)
    return { ok: true }
}
