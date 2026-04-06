'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, Suspense, useRef } from 'react'
import { useRouter } from 'next/navigation' // 🚀 Chau useSearchParams
import useSWR from 'swr'
import {
    User, Phone, CreditCard, Users, Save, Megaphone, Loader2,
    AlertTriangle, Mail, Calendar, LogOut, CheckCircle2, History,
    BookOpen, Star, Clock, AlertCircle, HeartPulse, FileUp, X, Lock
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'

// 🚀 IMPORTAMOS LA SERVER ACTION
import { actualizarPerfilAction } from '@/app/actions/perfil'

// --- TIPOS ---
type HistorialClase = { id: string; presente: boolean; clase: { nombre: string; inicio: string; tipo_clase: string; profesor: { nombre_completo: string } } }
type PackVencimiento = { fecha_vencimiento: string; creditos_restantes: number; tipo_clase: string }

type PerfilData = {
    profile: any
    email: string | undefined
    historialClases: HistorialClase[]
    avisos: any[]
    proximoVencimiento: PackVencimiento | null
}

// 🚀 FETCHER UNIFICADO DE SWR (Blindado contra la pelea de Tokens)
const fetcherPerfil = async (): Promise<PerfilData> => {
    const supabase = createClient()

    // 1. Pedimos el usuario. Si choca con el Middleware, atajamos el error.
    let { data: { user }, error: authError } = await supabase.auth.getUser()

    // 🛡️ EL ESCUDO MÁGICO: Si Supabase dice "Lock", esperamos 1 segundo y reintentamos.
    if (authError && (authError.message.includes('Lock') || authError.message.includes('stole'))) {
        console.warn("⏳ Choque de tokens detectado. Esperando al Middleware...")
        await new Promise(resolve => setTimeout(resolve, 1000)) // Esperamos 1 segundo
        const retry = await supabase.auth.getUser() // Reintentamos pacíficamente
        user = retry.data.user
        authError = retry.error
    }

    if (authError || !user) throw new Error("NO_AUTH")

    // 2. Limpieza silenciosa DESPUÉS de tener el usuario asegurado
    supabase.rpc('limpiar_creditos_vencidos').then(({ error }: any) => {
        if (error) console.error("Error silencioso limpiando créditos:", error)
    })

    // 3. Cargar Perfil
    const { data: dataProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*, creditos_regulares, creditos_seminarios')
        .eq('id', user.id)
        .single()

    if (profileError || !dataProfile) throw new Error("PERFIL_NOT_FOUND")

    let historial: HistorialClase[] = []
    let avisosData: any[] = []
    let proximoVencimiento: PackVencimiento | null = null

    // 4. Cargar dependencias según ROL
    if (dataProfile.rol === 'profesor') {
        const { data: dataAvisos } = await supabase.from('comunicados').select('*').order('created_at', { ascending: false })
        avisosData = dataAvisos || []
    } else {
        // Alumnos / Users
        const { data: dataHistorial } = await supabase
            .from('inscripciones')
            .select('id, presente, clase:clases(nombre, inicio, tipo_clase, profesor:profiles(nombre_completo))')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20)

        historial = (dataHistorial?.filter((h: any) => h.clase !== null) || []) as unknown as HistorialClase[]

        const hoyIso = new Date().toISOString()
        const { data: dataPacks } = await supabase
            .from('alumno_packs')
            .select('fecha_vencimiento, creditos_restantes, tipo_clase')
            .eq('user_id', user.id)
            .eq('estado', 'activo')
            .gt('creditos_restantes', 0)
            .gt('fecha_vencimiento', hoyIso)
            .order('fecha_vencimiento', { ascending: true })
            .limit(1)

        if (dataPacks && dataPacks.length > 0) proximoVencimiento = dataPacks[0]
    }

    return {
        profile: dataProfile,
        email: user.email,
        historialClases: historial,
        avisos: avisosData,
        proximoVencimiento
    }
}
function PerfilContent() {
    const [supabase] = useState(() => createClient())
    const router = useRouter()

    // 🛡️ Escudo Anti-Bucles para Mercado Pago
    const pagoProcesado = useRef(false)

    // 🚀 SWR AL MANDO
    const { data, error, isLoading, mutate } = useSWR<PerfilData>(
        'mi-perfil',
        fetcherPerfil,
        {
            revalidateOnFocus: false, // 🛑 Vital para evitar el robo de tokens al volver a la pestaña
            revalidateOnReconnect: false, // 🛑 Evita que intente reconectar al recuperar la red/pestaña
            dedupingInterval: 10000, // ⏱️ Si alguien pide los mismos datos en menos de 10s, usa la caché
            shouldRetryOnError: false
        }
    )

    // Redirección segura si expiró la sesión
    useEffect(() => {
        if (error?.message === "NO_AUTH") {
            window.location.href = '/login'
        }
    }, [error])

    const profile = data?.profile || null
    const historialClases = data?.historialClases || []
    const avisos = data?.avisos || []
    const proximoVencimiento = data?.proximoVencimiento || null
    const userEmail = data?.email || ''

    const [saving, setSaving] = useState(false)
    const [uploadingFile, setUploadingFile] = useState(false)
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmNewPassword, setConfirmNewPassword] = useState('')
    const [changingPassword, setChangingPassword] = useState(false)

    const [formData, setFormData] = useState({
        nombre: '', apellido: '', email: '', telefono: '', alias_cbu: '', nombre_remplazo: '', contacto_remplazo: '',
        edad: '', direccion: '', contacto_emergencia: '', plan_medico: '', condiciones_medicas: '', apto_fisico_url: ''
    })

    useEffect(() => {
        if (profile) {
            setFormData({
                nombre: profile.nombre || '', apellido: profile.apellido || '', email: userEmail,
                telefono: profile.telefono || '', alias_cbu: profile.alias_cbu || '',
                nombre_remplazo: profile.nombre_remplazo || '', contacto_remplazo: profile.contacto_remplazo || '',
                edad: profile.edad?.toString() || '', direccion: profile.direccion || '',
                contacto_emergencia: profile.contacto_emergencia || '', plan_medico: profile.plan_medico || '',
                condiciones_medicas: profile.condiciones_medicas || '', apto_fisico_url: profile.apto_fisico_url || ''
            })
        }
    }, [profile, userEmail])

    // 🚀 Manejo de Pagos MP (Bypass de Next.js para evitar spinners infinitos)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const urlParams = new URLSearchParams(window.location.search);
        const pagoStatus = urlParams.get('pago');

        if (pagoStatus && !pagoProcesado.current) {
            pagoProcesado.current = true;

            // Limpiamos la URL silenciosamente sin que Next.js colapse
            window.history.replaceState(null, '', window.location.pathname);

            if (pagoStatus === 'exito') {
                toast.success('¡Pago aprobado! Tus clases se acreditarán.', { duration: 6000 });
                // 🛑 ¡BORRAMOS EL MUTATE ACÁ! SWR ya lo está trayendo solito.
            }
            else if (pagoStatus === 'error') {
                toast.error('El pago no se procesó o fue cancelado.');
            }
            else if (pagoStatus === 'pendiente') {
                toast.info('Tu pago está pendiente de confirmación.');
            }
        }
    }, []); // 🛑 También borramos el mutate de los corchetes

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputElement = e.target;
        try {
            if (!inputElement.files || inputElement.files.length === 0 || !profile) return;
            setUploadingFile(true);
            const file = inputElement.files[0];
            const fileExt = file.name.split('.').pop();
            const filePath = `${profile.id}-${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage.from('apto_fisico').upload(filePath, file, { upsert: true });
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('apto_fisico').getPublicUrl(filePath);
            setFormData(prev => ({ ...prev, apto_fisico_url: publicUrl }));
            toast.success('Archivo subido correctamente. ¡Hacé clic en Guardar Perfil para confirmar!');
        } catch (error: any) {
            toast.error('Error al subir el archivo: ' + (error?.message || 'Error desconocido'));
        } finally {
            setUploadingFile(false);
            if (inputElement) inputElement.value = '';
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;

        setSaving(true);

        if (profile.rol === 'profesor' && (!formData.nombre_remplazo || !formData.contacto_remplazo)) {
            toast.error('Los datos de reemplazo son obligatorios para docentes');
            setSaving(false);
            return;
        }

        const updatePayload: any = {
            telefono: formData.telefono,
            alias_cbu: formData.alias_cbu,
            nombre_remplazo: formData.nombre_remplazo,
            contacto_remplazo: formData.contacto_remplazo,
            nombre_completo: `${formData.nombre} ${formData.apellido}`
        };

        if (profile.rol === 'alumno' || profile.rol === 'user') {
            updatePayload.edad = formData.edad ? parseInt(formData.edad) : null;
            updatePayload.direccion = formData.direccion;
            updatePayload.contacto_emergencia = formData.contacto_emergencia;
            updatePayload.plan_medico = formData.plan_medico;
            updatePayload.condiciones_medicas = formData.condiciones_medicas;
            updatePayload.apto_fisico_url = formData.apto_fisico_url;
        }

        // 🚀 SERVER ACTION AL RESCATE
        const response = await actualizarPerfilAction(updatePayload)

        if (response.success) {
            toast.success('Perfil actualizado correctamente');
            router.refresh()
            setTimeout(() => mutate(), 500)
        } else {
            toast.error(response.error || 'Error al guardar el perfil');
        }

        setSaving(false);
    }

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword.length < 6) return toast.error('La contraseña debe tener al menos 6 caracteres')
        if (newPassword !== confirmNewPassword) return toast.error('Las contraseñas no coinciden')

        setChangingPassword(true)
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword })
            if (error) throw error

            toast.success('¡Contraseña actualizada con éxito!')
            setIsPasswordModalOpen(false)
            setNewPassword('')
            setConfirmNewPassword('')
        } catch (error: any) {
            toast.error(error.message || 'Hubo un error al cambiar la contraseña')
        } finally {
            setChangingPassword(false)
        }
    }

    const handleLogout = async () => {
        try { await supabase.auth.signOut() } finally { window.location.href = '/' }
    }

    // ==========================================
    // ESCUDOS DE CARGA / ERROR
    // ==========================================

    if (error?.message === "NO_AUTH") {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center w-full">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest animate-pulse">Redirigiendo al inicio de sesión...</p>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center w-full gap-4">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12" />
                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest animate-pulse">
                    Cargando perfil...
                </p>
            </div>
        )
    }

    if (error || !profile) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-6 w-full animate-in fade-in">
                <AlertTriangle className="text-orange-500 w-16 h-16" />
                <h2 className="text-white font-black text-2xl uppercase tracking-tighter">Conexión Perdida</h2>

                {/* Imprimimos el error real por las dudas */}
                <p className="text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl font-mono text-xs text-center max-w-md px-4">
                    {error?.message || "Error desconocido al procesar datos."}
                </p>

                <div className="flex gap-4">
                    <button onClick={() => window.location.reload()} className="bg-white/10 text-white px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white hover:text-black transition-colors">
                        Refrescar
                    </button>
                    <button onClick={handleLogout} className="bg-[#D4E655] text-black px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-colors">
                        Iniciar sesión
                    </button>
                </div>
            </div>
        )
    }

    const isProfe = profile?.rol === 'profesor'
    const isAlumno = profile?.rol === 'alumno' || profile?.rol === 'user'
    const datosIncompletos = isProfe && (!formData.nombre_remplazo || !formData.contacto_remplazo || !formData.alias_cbu)

    let diasParaVencer = null
    let colorVencimiento = 'bg-blue-500/10 border-blue-500/30 text-blue-400'
    let iconoVencimiento = <Clock size={16} />

    if (proximoVencimiento) {
        diasParaVencer = differenceInDays(new Date(proximoVencimiento.fecha_vencimiento), new Date())
        if (diasParaVencer <= 7) {
            colorVencimiento = 'bg-orange-500/10 border-orange-500/30 text-orange-400 animate-pulse'
            iconoVencimiento = <AlertCircle size={16} />
        }
    }

    return (
        <div className="pb-24 min-h-screen bg-[#050505] text-white selection:bg-[#D4E655] selection:text-black">
            <Toaster position="top-center" richColors theme="dark" />

            <div className="px-4 py-8 md:px-8 border-b border-white/10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 shrink-0 rounded-full bg-[#D4E655] text-black flex items-center justify-center font-black text-2xl shadow-[0_0_20px_rgba(212,230,85,0.4)]">
                        {profile.nombre?.[0] || ''}{profile.apellido?.[0] || ''}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter text-white leading-none truncate">
                            {profile.nombre} {profile.apellido}
                        </h2>
                        <span className="text-[#D4E655] font-bold text-xs tracking-widest uppercase bg-[#D4E655]/10 px-2 py-0.5 rounded mt-2 inline-block">
                            {profile.rol === 'admin' ? 'Administrador' : isProfe ? 'Staff Docente' : 'Alumno'}
                        </span>
                    </div>
                </div>
                <button onClick={handleLogout} className="self-start sm:self-auto text-gray-500 hover:text-red-500 text-xs font-bold uppercase flex items-center gap-2 transition-colors">
                    <LogOut size={16} /> <span>Cerrar Sesión</span>
                </button>
            </div>

            <div className="px-4 py-8 md:px-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className={`space-y-6 ${isAlumno ? 'lg:col-span-1' : 'lg:col-span-2'}`}>
                    {isProfe && datosIncompletos && (
                        <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-xl flex items-start gap-3 animate-pulse">
                            <AlertTriangle className="text-orange-500 shrink-0" size={20} />
                            <div>
                                <h4 className="font-bold text-orange-500 uppercase text-xs">Acción Requerida</h4>
                                <p className="text-gray-400 text-xs">Necesitamos tu CBU y contacto de reemplazo.</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSave} className="bg-[#09090b] border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl space-y-8 flex flex-col h-full relative">
                        <div className="space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
                                <User size={16} className="text-[#D4E655]" /> Mis Datos
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nombre</label><input disabled value={formData.nombre} className="w-full bg-[#111] border border-white/5 rounded-lg p-3 text-gray-400 font-bold text-sm cursor-not-allowed" /></div>
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Apellido</label><input disabled value={formData.apellido} className="w-full bg-[#111] border border-white/5 rounded-lg p-3 text-gray-400 font-bold text-sm cursor-not-allowed" /></div>
                                <div className="space-y-1 sm:col-span-2"><label className="text-[9px] font-bold text-gray-500 uppercase">Email</label><input disabled value={formData.email} className="w-full bg-[#111] border border-white/5 rounded-lg p-3 text-gray-400 font-bold text-sm cursor-not-allowed" /></div>
                                <div className="space-y-1 sm:col-span-2"><label className="text-[9px] font-bold text-gray-500 uppercase">Teléfono</label><input required value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                            </div>
                        </div>

                        <div className="space-y-4 pt-2 border-t border-white/5 mt-2">
                            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 pb-2">
                                <Lock size={16} className="text-[#D4E655]" /> Seguridad
                            </h3>
                            <button type="button" onClick={() => setIsPasswordModalOpen(true)} className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors flex items-center justify-center gap-2">
                                <Lock size={14} /> Cambiar Contraseña
                            </button>
                        </div>

                        {isAlumno && (
                            <div className="space-y-4 pt-2 border-t border-white/5 mt-2">
                                <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 pb-2">
                                    <HeartPulse size={16} className="text-[#D4E655]" /> Ficha Médica
                                </h3>
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Edad</label><input type="number" value={formData.edad} onChange={e => setFormData({ ...formData, edad: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" placeholder="Ej: 22" /></div>
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Obra Social</label><input value={formData.plan_medico} onChange={e => setFormData({ ...formData, plan_medico: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" placeholder="Ej: OSDE" /></div>
                                    </div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Dirección</label><input value={formData.direccion} onChange={e => setFormData({ ...formData, direccion: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" placeholder="Calle y número" /></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Contacto de Emergencia</label><input value={formData.contacto_emergencia} onChange={e => setFormData({ ...formData, contacto_emergencia: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" placeholder="Nombre y Celular" /></div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-1"><AlertTriangle size={10} className="text-yellow-500" /> Condiciones Médicas</label>
                                        <textarea value={formData.condiciones_medicas} onChange={e => setFormData({ ...formData, condiciones_medicas: e.target.value })} className="w-full h-20 bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655] resize-none text-xs" placeholder="Presión alta, lesiones previas, etc." />
                                    </div>
                                    <div className="space-y-1 pt-4 border-t border-white/5 mt-2">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-1"><FileUp size={12} className="text-[#D4E655]" /> Apto Físico</label>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111] border border-white/10 rounded-lg p-3">
                                            {formData.apto_fisico_url ? (
                                                <div className="flex items-center gap-2 text-green-500 text-xs font-bold uppercase tracking-widest break-all">
                                                    <CheckCircle2 size={16} className="shrink-0" /> Cargado
                                                    <a href={formData.apto_fisico_url} target="_blank" rel="noreferrer" className="text-blue-400 lowercase font-normal underline ml-2 hover:text-blue-300">ver_archivo</a>
                                                </div>
                                            ) : (
                                                <div className="text-xs text-gray-500 font-bold uppercase tracking-widest">Falta Cargar</div>
                                            )}
                                            <label className={`shrink-0 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold uppercase px-4 py-2 rounded transition-colors flex items-center justify-center gap-2 ${uploadingFile ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                                                {uploadingFile ? <Loader2 size={12} className="animate-spin" /> : 'Subir Archivo'}
                                                <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {isProfe && (
                            <>
                                <div className="space-y-4 pt-2 border-t border-white/5 mt-2">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 pb-2"><CreditCard size={16} className="text-[#D4E655]" /> Cobros</h3>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Alias / CBU</label><input required value={formData.alias_cbu} onChange={e => setFormData({ ...formData, alias_cbu: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655] font-mono text-sm" /></div>
                                </div>
                                <div className="space-y-4 pt-2 border-t border-white/5 mt-2">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 pb-2"><Users size={16} className="text-[#D4E655]" /> Reemplazo</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nombre</label><input required value={formData.nombre_remplazo} onChange={e => setFormData({ ...formData, nombre_remplazo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Teléfono</label><input required value={formData.contacto_remplazo} onChange={e => setFormData({ ...formData, contacto_remplazo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                    </div>
                                </div>
                            </>
                        )}

                        <button type="submit" disabled={saving} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all shadow-lg flex items-center justify-center gap-2 mt-auto">
                            {saving ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Guardar Perfil</>}
                        </button>
                    </form>
                </div>

                {isAlumno && (
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-[#09090b] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl">
                            <h3 className="text-base sm:text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6"><CreditCard size={20} className="text-[#D4E655]" /> Mis Créditos Disponibles</h3>
                            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                                <div className="bg-[#111] border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-white/20 transition-all">
                                    <BookOpen size={24} className="text-gray-500 mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Regulares</p>
                                    <p className="text-3xl sm:text-4xl font-black text-white">{profile.creditos_regulares || 0}</p>
                                </div>
                                <div className="bg-[#111] border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-purple-500/30 transition-all">
                                    <Star size={24} className="text-purple-500 mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-1">Especiales</p>
                                    <p className="text-3xl sm:text-4xl font-black text-white">{profile.creditos_seminarios || 0}</p>
                                </div>
                            </div>

                            {proximoVencimiento && (
                                <div className={`border rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${colorVencimiento}`}>
                                    <div className="flex items-center gap-3 w-full">
                                        <div className="shrink-0 mt-0.5 sm:mt-0">{iconoVencimiento}</div>
                                        <div className="flex-1">
                                            <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest mb-0.5">{diasParaVencer && diasParaVencer <= 7 ? '¡Están por vencer!' : 'Próximo vencimiento'}</p>
                                            <p className="text-[9px] sm:text-[10px] opacity-80 leading-relaxed">Tenés {proximoVencimiento.creditos_restantes} clase(s) {proximoVencimiento.tipo_clase} que vencen el <strong>{format(new Date(proximoVencimiento.fecha_vencimiento), "d 'de' MMMM", { locale: es })}</strong>.</p>
                                        </div>
                                    </div>
                                    <button onClick={() => router.push('/explorar')} className="w-full sm:w-auto shrink-0 bg-black/20 hover:bg-black/40 text-current px-4 py-2 sm:py-3 rounded-lg text-[10px] font-black uppercase transition-colors">
                                        Usar Ahora
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="bg-[#09090b] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col h-[500px]">
                            <h3 className="text-base sm:text-lg font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-6 shrink-0"><History size={20} className="text-[#D4E655]" /> Historial de Asistencia</h3>
                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                                {historialClases.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                                        <Calendar size={48} className="mb-4" />
                                        <p className="text-xs font-bold uppercase text-center">Todavía no te anotaste a ninguna clase.</p>
                                    </div>
                                ) : (
                                    historialClases.map((historial) => {
                                        const fechaClase = new Date(historial.clase.inicio)
                                        const esPasada = fechaClase < new Date()
                                        return (
                                            <div key={historial.id} className="bg-[#111] border border-white/5 p-4 rounded-xl flex items-center justify-between gap-3 hover:bg-white/5 transition-colors group">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className="text-[9px] sm:text-[10px] text-[#D4E655] font-bold uppercase">{format(fechaClase, "EEE d MMM", { locale: es })}</span>
                                                        <span className="text-[9px] sm:text-[10px] text-gray-500 font-bold">{format(fechaClase, "HH:mm")}</span>
                                                    </div>
                                                    <h4 className="font-black text-white text-xs sm:text-sm uppercase truncate">{historial.clase.nombre}</h4>
                                                    <p className="text-[10px] sm:text-xs text-gray-500 truncate">con {historial.clase.profesor?.nombre_completo || 'Staff'}</p>
                                                </div>
                                                <div className="shrink-0 flex flex-col items-end gap-2">
                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border ${historial.clase.tipo_clase === 'Especial' ? 'border-purple-500/30 text-purple-400 bg-purple-500/10' : 'border-white/10 text-gray-400 bg-white/5'}`}>{historial.clase.tipo_clase}</span>
                                                    {esPasada ? (historial.presente ? <span className="text-[10px] sm:text-xs font-bold text-green-500 flex items-center gap-1"><CheckCircle2 size={12} /> Presente</span> : <span className="text-[10px] sm:text-xs font-bold text-red-500 flex items-center gap-1"><X size={12} /> Ausente</span>) : <span className="text-[10px] sm:text-xs font-bold text-blue-400">Próxima</span>}
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {isProfe && (
                    <div className="lg:col-span-1 h-max lg:sticky lg:top-8 mt-8 lg:mt-0">
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-5 sm:p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                            <h3 className="text-base sm:text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4 relative z-10"><Megaphone size={18} className="text-blue-400" /> Cartelera Staff</h3>
                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar relative z-10">
                                {avisos.map(aviso => (
                                    <div key={aviso.id} className="bg-black/40 border-l-2 border-blue-500 p-4 rounded-r-lg group hover:bg-white/5 transition-colors">
                                        <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">{format(new Date(aviso.created_at), 'dd MMM yyyy')}</span>
                                        <h4 className="font-bold text-white text-xs sm:text-sm uppercase mb-2">{aviso.titulo}</h4>
                                        <p className="text-[10px] sm:text-xs text-gray-400 leading-relaxed">{aviso.mensaje}</p>
                                    </div>
                                ))}
                                {avisos.length === 0 && <p className="text-gray-500 text-xs italic">No hay comunicados activos.</p>}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL DE CAMBIO DE CONTRASEÑA */}
            {isPasswordModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setIsPasswordModalOpen(false)}>
                    <div className="w-full max-w-md bg-[#09090b] border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                            <h3 className="text-xl font-black text-white uppercase flex items-center gap-2">
                                <Lock className="text-[#D4E655]" /> Cambiar Clave
                            </h3>
                            <button onClick={() => setIsPasswordModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handlePasswordChange} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nueva Contraseña</label>
                                <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-colors tracking-widest" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Confirmar Contraseña</label>
                                <input type="password" required value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="••••••••" className="w-full bg-[#111] border border-white/10 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-[#D4E655] transition-colors tracking-widest" />
                            </div>
                            <button type="submit" disabled={changingPassword} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-4 shadow-lg">
                                {changingPassword ? <Loader2 size={16} className="animate-spin" /> : 'Actualizar Contraseña'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function PerfilPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center w-full gap-4">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12" />
                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest animate-pulse">
                    Cargando perfil...
                </p>
            </div>
        }>
            <PerfilContent />
        </Suspense>
    )
}