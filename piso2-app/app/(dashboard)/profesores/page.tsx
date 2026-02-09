'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import {
    User, Plus, Search, Mail, Phone, CreditCard, Users,
    Megaphone, Send, Trash2, CheckCircle, AlertCircle, Loader2
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { format } from 'date-fns'

type Docente = {
    id: string
    nombre: string
    apellido: string
    email: string
    telefono: string
    alias_cbu: string
    nombre_remplazo: string
    contacto_remplazo: string
}

type Comunicado = {
    id: string
    titulo: string
    mensaje: string
    created_at: string
}

export default function DocentesPage() {
    const supabase = createClient()
    const [docentes, setDocentes] = useState<Docente[]>([])
    const [comunicados, setComunicados] = useState<Comunicado[]>([])
    const [loading, setLoading] = useState(true)

    // Modales
    const [isNewDocenteOpen, setIsNewDocenteOpen] = useState(false)
    const [isNewAvisoOpen, setIsNewAvisoOpen] = useState(false)

    // Forms
    const [newDocente, setNewDocente] = useState({ nombre: '', apellido: '', email: '' })
    const [newAviso, setNewAviso] = useState({ titulo: '', mensaje: '' })
    const [creating, setCreating] = useState(false)

    useEffect(() => { fetchData() }, [])

    const fetchData = async () => {
        setLoading(true)
        // Traer Docentes
        const { data: dataDocentes } = await supabase.from('profiles').select('*').eq('rol', 'profesor')
        if (dataDocentes) setDocentes(dataDocentes as any)

        // Traer Comunicados
        const { data: dataAvisos } = await supabase.from('comunicados').select('*').order('created_at', { ascending: false })
        if (dataAvisos) setComunicados(dataAvisos)

        setLoading(false)
    }

    // 1. CREAR DOCENTE
    const handleCreateDocente = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)
        try {
            const tempPass = 'piso2.2026' // Contraseña default

            // Crear Auth User
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: newDocente.email,
                password: tempPass,
                options: { data: { nombre_completo: `${newDocente.nombre} ${newDocente.apellido}` } }
            })
            if (authError) throw authError

            if (authData.user) {
                // Asignar rol Profesor y guardar nombres
                await supabase.from('profiles').update({
                    rol: 'profesor',
                    nombre: newDocente.nombre,
                    apellido: newDocente.apellido,
                    nombre_completo: `${newDocente.nombre} ${newDocente.apellido}`
                }).eq('id', authData.user.id)

                toast.success('Docente creado', { description: `Pass temporal: ${tempPass}` })
                setIsNewDocenteOpen(false)
                setNewDocente({ nombre: '', apellido: '', email: '' })
                fetchData()
            }
        } catch (error: any) { toast.error(error.message) }
        finally { setCreating(false) }
    }

    // 2. CREAR COMUNICADO
    const handleCreateAviso = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)
        const { error } = await supabase.from('comunicados').insert(newAviso)
        if (error) {
            toast.error('Error al publicar aviso')
        } else {
            toast.success('Comunicado enviado a todos los docentes')
            setIsNewAvisoOpen(false)
            setNewAviso({ titulo: '', mensaje: '' })
            fetchData()
        }
        setCreating(false)
    }

    // Borrar Aviso
    const deleteAviso = async (id: string) => {
        if (!confirm('¿Borrar aviso?')) return
        await supabase.from('comunicados').delete().eq('id', id)
        fetchData()
    }

    return (
        <div className="pb-24 px-4 pt-4 md:p-8 min-h-screen bg-[#050505] text-white">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-8 border-b border-white/10 pb-6">
                <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-white">Staff Docente</h2>
                    <p className="text-[#D4E655] font-bold text-xs tracking-widest uppercase">Gestión y Comunicación</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setIsNewAvisoOpen(true)} className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-4 py-3 rounded-xl font-bold uppercase text-[10px] flex items-center gap-2">
                        <Megaphone size={16} /> Publicar Aviso
                    </button>
                    <button onClick={() => setIsNewDocenteOpen(true)} className="bg-[#D4E655] text-black px-4 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-white transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(212,230,85,0.3)]">
                        <User size={16} /> Nuevo Profe
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* LISTA DE DOCENTES */}
                <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2"><Users size={18} className="text-[#D4E655]" /> Plantel Activo</h3>

                    {loading ? <Loader2 className="animate-spin text-[#D4E655]" /> : (
                        <div className="grid gap-3">
                            {docentes.map(doc => (
                                <div key={doc.id} className="bg-[#09090b] border border-white/10 p-4 rounded-xl flex items-center justify-between group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[#D4E655] font-black border border-white/5">
                                            {doc.nombre?.[0]}{doc.apellido?.[0]}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white leading-none">{doc.nombre} {doc.apellido}</h4>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[10px] text-gray-500 uppercase flex items-center gap-1"><Mail size={10} /> {doc.email}</span>
                                                {/* INDICADOR DE CARGA DE DATOS */}
                                                {doc.nombre_remplazo ? (
                                                    <span className="text-[9px] bg-green-900/30 text-green-500 px-1.5 rounded flex items-center gap-1"><CheckCircle size={10} /> Datos OK</span>
                                                ) : (
                                                    <span className="text-[9px] bg-red-900/30 text-red-500 px-1.5 rounded flex items-center gap-1"><AlertCircle size={10} /> Datos Pendientes</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* INFO EXTRA (Hover o Click para ver detalles) */}
                                    <div className="text-right hidden md:block">
                                        <div className="text-[10px] text-gray-500 font-bold uppercase">Alias CBU</div>
                                        <div className="text-xs text-white font-mono">{doc.alias_cbu || '-'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* COMUNICADOS ACTIVOS */}
                <div>
                    <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2 mb-4"><Megaphone size={18} className="text-[#D4E655]" /> Avisos Recientes</h3>
                    <div className="space-y-3">
                        {comunicados.map(aviso => (
                            <div key={aviso.id} className="bg-[#111] border-l-4 border-[#D4E655] p-4 rounded-r-xl relative group">
                                <button onClick={() => deleteAviso(aviso.id)} className="absolute top-2 right-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                                <span className="text-[9px] font-bold text-gray-500 uppercase">{format(new Date(aviso.created_at), 'dd/MM')}</span>
                                <h4 className="font-black text-white uppercase text-sm mb-1">{aviso.titulo}</h4>
                                <p className="text-xs text-gray-400 leading-relaxed">{aviso.mensaje}</p>
                            </div>
                        ))}
                        {comunicados.length === 0 && <p className="text-gray-500 text-xs italic">No hay avisos publicados.</p>}
                    </div>
                </div>

            </div>

            {/* MODAL NUEVO DOCENTE */}
            {isNewDocenteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsNewDocenteOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-sm rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-white uppercase mb-4">Alta de Docente</h3>
                        <form onSubmit={handleCreateDocente} className="space-y-3">
                            <input required placeholder="Nombre" value={newDocente.nombre} onChange={e => setNewDocente({ ...newDocente, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" />
                            <input required placeholder="Apellido" value={newDocente.apellido} onChange={e => setNewDocente({ ...newDocente, apellido: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" />
                            <input required type="email" placeholder="Email (Usuario)" value={newDocente.email} onChange={e => setNewDocente({ ...newDocente, email: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" />

                            <p className="text-[10px] text-gray-500 mt-2 text-center bg-white/5 p-2 rounded">
                                Se creará con contraseña temporal: <span className="text-[#D4E655] font-mono font-bold">piso2.2026</span>
                            </p>

                            <button disabled={creating} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-3 rounded-xl mt-2 hover:bg-white transition-all text-xs tracking-widest">{creating ? <Loader2 className="animate-spin mx-auto" /> : 'Crear Usuario'}</button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL NUEVO AVISO */}
            {isNewAvisoOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsNewAvisoOpen(false)}>
                    <div className="bg-[#09090b] border border-white/10 w-full max-w-md rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-white uppercase mb-4 flex items-center gap-2"><Megaphone size={18} /> Nuevo Comunicado</h3>
                        <form onSubmit={handleCreateAviso} className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Título</label>
                                <input required value={newAviso.titulo} onChange={e => setNewAviso({ ...newAviso, titulo: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655]" placeholder="Ej: Reunión Mensual" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Mensaje</label>
                                <textarea required value={newAviso.mensaje} onChange={e => setNewAviso({ ...newAviso, mensaje: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-[#D4E655] h-32 resize-none" placeholder="Escribí el mensaje para todos los profes..." />
                            </div>
                            <button disabled={creating} type="submit" className="w-full bg-[#D4E655] text-black font-black uppercase py-3 rounded-xl mt-2 hover:bg-white transition-all text-xs tracking-widest">{creating ? <Loader2 className="animate-spin mx-auto" /> : 'Publicar Aviso'}</button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    )
}