'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    User, Phone, CreditCard, Users, Save, Megaphone, Loader2,
    AlertTriangle, Mail, Calendar, LogOut, CheckCircle2, History,
    BookOpen, Star, Clock, AlertCircle, HeartPulse, FileUp, X
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { useRouter } from 'next/navigation'

// --- TIPOS ---
type HistorialClase = { id: string; presente: boolean; clase: { nombre: string; inicio: string; tipo_clase: string; profesor: { nombre_completo: string } } }
type PackVencimiento = { fecha_vencimiento: string; creditos_restantes: number; tipo_clase: string }

export default function PerfilPage() {
    const supabase = createClient()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [loadingMsg, setLoadingMsg] = useState("Iniciando conexión...") // 👈 Nuevo estado para dar feedback visual
    const [saving, setSaving] = useState(false)
    const [uploadingFile, setUploadingFile] = useState(false)

    const [profile, setProfile] = useState<any>(null)
    const [avisos, setAvisos] = useState<any[]>([])
    const [historialClases, setHistorialClases] = useState<HistorialClase[]>([])
    const [proximoVencimiento, setProximoVencimiento] = useState<PackVencimiento | null>(null)

    const [formData, setFormData] = useState({
        nombre: '', apellido: '', email: '', telefono: '', alias_cbu: '', nombre_remplazo: '', contacto_remplazo: '',
        edad: '', direccion: '', contacto_emergencia: '', plan_medico: '', condiciones_medicas: '', apto_fisico_url: ''
    })

    useEffect(() => {
        let isMounted = true // Control de montaje nativo y seguro

        const iniciarTodo = async () => {
            try {
                if (!isMounted) return
                setLoading(true)

                // 1. LEER MERCADO PAGO (Silencioso)
                const urlParams = new URLSearchParams(window.location.search)
                const pagoStatus = urlParams.get('pago')
                if (pagoStatus) {
                    if (pagoStatus === 'exito') toast.success('¡Pago aprobado! Tus clases se acreditarán.')
                    else if (pagoStatus === 'error') toast.error('El pago no se procesó o fue cancelado.')
                    else if (pagoStatus === 'pendiente') toast.info('Tu pago está pendiente de confirmación.')
                    window.history.replaceState(null, '', window.location.pathname)
                }

                // 2. BUSCAMOS SESIÓN (Lectura local instantánea para resistir el F5)
                if (isMounted) setLoadingMsg("Verificando credenciales...")
                const { data: { session }, error: sessionError } = await supabase.auth.getSession()

                let userId = session?.user?.id

                // Si la sesión rápida falla, hacemos un re-intento con el servidor
                if (!userId) {
                    const { data: { user } } = await supabase.auth.getUser()
                    userId = user?.id
                }

                if (!userId) {
                    window.location.href = '/login'
                    return
                }

                // 3. LIMPIEZA DE CRÉDITOS (En segundo plano)
                supabase.rpc('limpiar_creditos_vencidos').then(({ error }) => { if (error) console.error(error) })

                // 4. CARGAMOS PERFIL
                if (isMounted) setLoadingMsg("Sincronizando perfil...")
                const { data: dataProfile, error: profileError } = await supabase
                    .from('profiles').select('*, creditos_regulares, creditos_seminarios').eq('id', userId).single()

                if (profileError || !dataProfile) throw new Error("Perfil no encontrado")

                if (isMounted) {
                    setProfile(dataProfile)
                    setFormData({
                        nombre: dataProfile.nombre || '', apellido: dataProfile.apellido || '', email: session?.user?.email || '',
                        telefono: dataProfile.telefono || '', alias_cbu: dataProfile.alias_cbu || '',
                        nombre_remplazo: dataProfile.nombre_remplazo || '', contacto_remplazo: dataProfile.contacto_remplazo || '',
                        edad: dataProfile.edad?.toString() || '', direccion: dataProfile.direccion || '',
                        contacto_emergencia: dataProfile.contacto_emergencia || '', plan_medico: dataProfile.plan_medico || '',
                        condiciones_medicas: dataProfile.condiciones_medicas || '', apto_fisico_url: dataProfile.apto_fisico_url || ''
                    })
                }

                // 5. DATOS ADICIONALES SEGÚN ROL
                if (isMounted) setLoadingMsg("Cargando tu información...")
                if (dataProfile.rol === 'profesor' && isMounted) {
                    const { data: dataAvisos } = await supabase.from('comunicados').select('*').order('created_at', { ascending: false })
                    if (dataAvisos) setAvisos(dataAvisos)
                }

                if ((dataProfile.rol === 'alumno' || dataProfile.rol === 'user') && isMounted) {
                    const { data: dataHistorial } = await supabase.from('inscripciones').select('id, presente, clase:clases(nombre, inicio, tipo_clase, profesor:profiles(nombre_completo))').eq('user_id', userId).order('created_at', { ascending: false }).limit(20)
                    if (dataHistorial) setHistorialClases(dataHistorial.filter((h: any) => h.clase !== null) as unknown as HistorialClase[])

                    const hoyIso = new Date().toISOString()
                    const { data: dataPacks } = await supabase.from('alumno_packs').select('fecha_vencimiento, creditos_restantes, tipo_clase').eq('user_id', userId).eq('estado', 'activo').gt('creditos_restantes', 0).gt('fecha_vencimiento', hoyIso).order('fecha_vencimiento', { ascending: true }).limit(1)
                    if (dataPacks && dataPacks.length > 0) setProximoVencimiento(dataPacks[0])
                }

            } catch (error) {
                console.error("Error crítico en la carga:", error)
                if (isMounted) setProfile(null)
            } finally {
                if (isMounted) setLoading(false)
            }
        }

        iniciarTodo()

        return () => { isMounted = false } // Limpiamos si el componente se desmonta
    }, [])

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputElement = e.target;
        try {
            if (!inputElement.files || inputElement.files.length === 0) return;
            setUploadingFile(true);
            const file = inputElement.files[0];
            const fileExt = file.name.split('.').pop();
            const filePath = `${profile.id}-${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage.from('apto_fisico').upload(filePath, file, { upsert: true });
            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('apto_fisico').getPublicUrl(filePath);
            setFormData(prev => ({ ...prev, apto_fisico_url: data.publicUrl }));
            toast.success('Archivo subido correctamente. ¡No olvides guardar tu perfil!');
        } catch (error: any) {
            toast.error('Error al subir el archivo: ' + (error?.message || 'Error desconocido'));
        } finally {
            setUploadingFile(false);
            if (inputElement) inputElement.value = '';
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (profile.rol === 'profesor' && (!formData.nombre_remplazo || !formData.contacto_remplazo)) {
                toast.error('Los datos de reemplazo son obligatorios para docentes');
                return;
            }

            const updatePayload: any = {
                telefono: formData.telefono, alias_cbu: formData.alias_cbu,
                nombre_remplazo: formData.nombre_remplazo, contacto_remplazo: formData.contacto_remplazo,
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

            const { error } = await supabase.from('profiles').update(updatePayload).eq('id', profile.id);
            if (error) throw error;

            toast.success('Perfil actualizado correctamente');
            window.location.reload()
        } catch (error: any) {
            toast.error('Error al guardar el perfil');
        } finally {
            setSaving(false);
        }
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        window.location.href = '/login'
    }

    // ==========================================
    // ESCUDOS DE RENDERIZADO VISUALES
    // ==========================================
    if (loading) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center w-full gap-4">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12" />
                <p className="text-[#D4E655] text-xs font-bold uppercase tracking-widest animate-pulse">
                    {loadingMsg}
                </p>
            </div>
        )
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-6 w-full animate-in fade-in">
                <AlertTriangle className="text-orange-500 w-16 h-16" />
                <h2 className="text-white font-black text-2xl uppercase tracking-tighter">Conexión Perdida</h2>
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs text-center max-w-sm px-4">
                    Tuvimos un problema al cargar tus datos desde el servidor. Por favor, refrescá la página.
                </p>
                <div className="flex gap-4">
                    <button onClick={() => window.location.reload()} className="bg-white/10 text-white px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white hover:text-black transition-colors">
                        Refrescar
                    </button>
                    <button
                        onClick={async () => {
                            try { await supabase.auth.signOut() } catch (e) { } finally { window.location.href = '/login' }
                        }}
                        className="bg-[#D4E655] text-black px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-white transition-colors"
                    >
                        Iniciar sesión
                    </button>
                </div>
            </div>
        )
    }

    // ==========================================
    // INTERFAZ DE USUARIO NORMAL
    // ==========================================
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

            {/* HEADER PERFIL */}
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

            {/* CONTENEDOR PRINCIPAL */}
            <div className="px-4 py-8 md:px-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* COLUMNA 1: FORMULARIO */}
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

                    <form onSubmit={handleSave} className="bg-[#09090b] border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl space-y-8 flex flex-col h-full">
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

                        {isAlumno && (
                            <div className="space-y-4 pt-2">
                                <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
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
                                <div className="space-y-4 pt-2">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2"><CreditCard size={16} className="text-[#D4E655]" /> Cobros</h3>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Alias / CBU</label><input required value={formData.alias_cbu} onChange={e => setFormData({ ...formData, alias_cbu: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655] font-mono text-sm" /></div>
                                </div>
                                <div className="space-y-4 pt-2">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2"><Users size={16} className="text-[#D4E655]" /> Reemplazo</h3>
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

                {/* COLUMNA 2 Y 3: PANELES */}
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
                                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-1">Seminarios</p>
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
                                    <button onClick={() => window.location.href = '/explorar'} className="w-full sm:w-auto shrink-0 bg-black/20 hover:bg-black/40 text-current px-4 py-2 sm:py-3 rounded-lg text-[10px] font-black uppercase transition-colors">
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

                {/* COLUMNA DER: CARTELERA (SOLO PROFES) */}
                {isProfe && (
                    <div className="lg:col-span-1">
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-5 sm:p-6 relative overflow-hidden lg:sticky lg:top-8">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                            <h3 className="text-base sm:text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4 relative z-10"><Megaphone size={18} className="text-blue-400" /> Cartelera Staff</h3>
                            <div className="space-y-4 max-h-[400px] lg:max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
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
        </div>
    )
}