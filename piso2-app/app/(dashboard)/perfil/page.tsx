'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    User, Phone, CreditCard, Users, Save, Megaphone, Loader2,
    AlertTriangle, Mail, Calendar, LogOut
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

export default function PerfilPage() {
    const supabase = createClient()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [profile, setProfile] = useState<any>(null)
    const [avisos, setAvisos] = useState<any[]>([]) // Solo para profes

    // Estado del Formulario
    const [formData, setFormData] = useState({
        nombre: '', apellido: '', email: '', telefono: '',
        alias_cbu: '', nombre_remplazo: '', contacto_remplazo: ''
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }

        // 1. Perfil
        const { data: dataProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

        if (dataProfile) {
            setProfile(dataProfile)
            setFormData({
                nombre: dataProfile.nombre || '',
                apellido: dataProfile.apellido || '',
                email: user.email || '',
                telefono: dataProfile.telefono || '',
                alias_cbu: dataProfile.alias_cbu || '',
                nombre_remplazo: dataProfile.nombre_remplazo || '',
                contacto_remplazo: dataProfile.contacto_remplazo || ''
            })

            // 2. Avisos (Solo si es PROFE)
            if (dataProfile.rol === 'profesor') {
                const { data: dataAvisos } = await supabase
                    .from('comunicados')
                    .select('*')
                    .order('created_at', { ascending: false })
                if (dataAvisos) setAvisos(dataAvisos)
            }
        }
        setLoading(false)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        // Validaciones Específicas Profe
        if (profile.rol === 'profesor') {
            if (!formData.nombre_remplazo || !formData.contacto_remplazo) {
                toast.error('Los datos de reemplazo son obligatorios para docentes')
                setSaving(false)
                return
            }
        }

        const { error } = await supabase.from('profiles').update({
            telefono: formData.telefono,
            alias_cbu: formData.alias_cbu,
            nombre_remplazo: formData.nombre_remplazo,
            contacto_remplazo: formData.contacto_remplazo,
            nombre_completo: `${formData.nombre} ${formData.apellido}`
        }).eq('id', profile.id)

        if (error) toast.error('Error al guardar')
        else toast.success('Perfil actualizado correctamente')

        setSaving(false)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655]" /></div>

    const isProfe = profile?.rol === 'profesor'
    const isAlumno = profile?.rol === 'alumno' || profile?.rol === 'user' // Asumiendo rol default
    const datosIncompletos = isProfe && (!formData.nombre_remplazo || !formData.contacto_remplazo || !formData.alias_cbu)

    return (
        <div className="pb-24 px-4 pt-4 md:p-8 min-h-screen bg-[#050505] text-white">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER PERFIL */}
            <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-[#D4E655] text-black flex items-center justify-center font-black text-2xl shadow-[0_0_20px_rgba(212,230,85,0.4)]">
                        {profile.nombre?.[0]}{profile.apellido?.[0]}
                    </div>
                    <div>
                        <h2 className="text-3xl font-black uppercase tracking-tighter text-white leading-none">{profile.nombre} {profile.apellido}</h2>
                        <span className="text-[#D4E655] font-bold text-xs tracking-widest uppercase bg-[#D4E655]/10 px-2 py-0.5 rounded mt-1 inline-block">
                            {profile.rol === 'admin' ? 'Administrador' : isProfe ? 'Staff Docente' : 'Alumno'}
                        </span>
                    </div>
                </div>
                <button onClick={handleLogout} className="text-gray-500 hover:text-red-500 text-xs font-bold uppercase flex items-center gap-2 transition-colors">
                    <LogOut size={16} /> Cerrar Sesión
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* --- COLUMNA IZQ: FORMULARIO (PARA TODOS) --- */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Alerta Docentes */}
                    {isProfe && datosIncompletos && (
                        <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-xl flex items-start gap-3 animate-pulse">
                            <AlertTriangle className="text-orange-500 shrink-0" size={20} />
                            <div>
                                <h4 className="font-bold text-orange-500 uppercase text-xs">Acción Requerida</h4>
                                <p className="text-gray-400 text-xs">Para poder liquidar tus sueldos, necesitamos tu CBU y contacto de reemplazo.</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSave} className="bg-[#09090b] border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl space-y-8">

                        {/* 1. Datos Personales (Todos) */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
                                <User size={16} className="text-[#D4E655]" /> Datos Personales
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nombre</label><input disabled value={formData.nombre} className="w-full bg-[#111] border border-white/5 rounded-lg p-3 text-gray-400 font-bold text-sm cursor-not-allowed" /></div>
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Apellido</label><input disabled value={formData.apellido} className="w-full bg-[#111] border border-white/5 rounded-lg p-3 text-gray-400 font-bold text-sm cursor-not-allowed" /></div>
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Email</label><input disabled value={formData.email} className="w-full bg-[#111] border border-white/5 rounded-lg p-3 text-gray-400 font-bold text-sm cursor-not-allowed" /></div>
                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Teléfono</label><input required value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                            </div>
                        </div>

                        {/* 2. Sección Exclusiva ALUMNOS */}
                        {isAlumno && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
                                    <CreditCard size={16} className="text-[#D4E655]" /> Mis Créditos
                                </h3>
                                <div className="bg-[#D4E655]/10 border border-[#D4E655]/20 p-4 rounded-xl flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-[#D4E655]">Saldo Disponible</p>
                                        <p className="text-3xl font-black text-white">{profile.creditos || 0}</p>
                                    </div>
                                    <button type="button" className="bg-[#D4E655] text-black px-4 py-2 rounded-lg text-xs font-black uppercase hover:bg-white transition-colors">
                                        Comprar Packs
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 3. Sección Exclusiva DOCENTES */}
                        {isProfe && (
                            <>
                                {/* Datos Bancarios */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
                                        <CreditCard size={16} className="text-[#D4E655]" /> Cobros
                                    </h3>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Alias / CBU</label>
                                        <input required placeholder="Ej: mi.alias.banco" value={formData.alias_cbu} onChange={e => setFormData({ ...formData, alias_cbu: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655] font-mono text-sm" />
                                    </div>
                                </div>

                                {/* Reemplazo */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
                                        <Users size={16} className="text-[#D4E655]" /> Reemplazo (Obligatorio)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Nombre Completo</label><input required placeholder="Ej: Maria Lopez" value={formData.nombre_remplazo} onChange={e => setFormData({ ...formData, nombre_remplazo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                        <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Teléfono / Contacto</label><input required placeholder="Ej: 3624..." value={formData.contacto_remplazo} onChange={e => setFormData({ ...formData, contacto_remplazo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-[#D4E655]" /></div>
                                    </div>
                                </div>
                            </>
                        )}

                        <button type="submit" disabled={saving} className="w-full bg-[#D4E655] text-black font-black uppercase py-4 rounded-xl hover:bg-white transition-all shadow-lg flex items-center justify-center gap-2">
                            {saving ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Guardar Cambios</>}
                        </button>
                    </form>
                </div>

                {/* --- COLUMNA DER: CARTELERA (SOLO PROFES) --- */}
                {isProfe && (
                    <div>
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 relative overflow-hidden sticky top-8">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                            <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4 relative z-10">
                                <Megaphone size={18} className="text-blue-400" /> Cartelera Staff
                            </h3>

                            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                {avisos.map(aviso => (
                                    <div key={aviso.id} className="bg-black/40 border-l-2 border-blue-500 p-4 rounded-r-lg group hover:bg-white/5 transition-colors">
                                        <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">{format(new Date(aviso.created_at), 'dd MMM yyyy')}</span>
                                        <h4 className="font-bold text-white text-sm uppercase mb-2">{aviso.titulo}</h4>
                                        <p className="text-xs text-gray-400 leading-relaxed">{aviso.mensaje}</p>
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