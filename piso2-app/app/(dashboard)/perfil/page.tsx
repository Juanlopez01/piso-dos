'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { Camera, User, Mail, Shield, Loader2, Calendar, Users, MapPin, Clock } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Tipos
type Profile = {
    id: string
    nombre_completo: string | null
    email: string
    rol: string
    avatar_url: string | null
}

type ClaseHoy = {
    id: string
    nombre: string
    inicio: string
    sala: { nombre: string; sede: { nombre: string } }
    _count: { asistencias: number } // Para contar alumnos
}

export default function PerfilPage() {
    const supabase = createClient()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)

    const [profile, setProfile] = useState<Profile | null>(null)
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

    // Estados para el Dashboard del Profesor
    const [clasesHoy, setClasesHoy] = useState<ClaseHoy[]>([])
    const [totalAlumnos, setTotalAlumnos] = useState(0)

    useEffect(() => {
        getProfile()
    }, [])

    const getProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }

            // 1. Datos del Perfil
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (error) throw error

            if (data) {
                setProfile(data)
                setAvatarUrl(data.avatar_url)

                // 2. Si es PROFE, cargamos su agenda del día
                if (data.rol === 'profesor') {
                    fetchProfessorStats(user.id)
                }
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const fetchProfessorStats = async (userId: string) => {
        const today = new Date()
        const start = new Date(today.setHours(0, 0, 0, 0)).toISOString()
        const end = new Date(today.setHours(23, 59, 59, 999)).toISOString()

        // Traemos las clases de hoy donde el profe es este usuario
        // Y hacemos un "join" con asistencias para contar
        const { data: clases } = await supabase
            .from('clases')
            .select(`
            id, nombre, inicio,
            sala:salas ( nombre, sede:sedes ( nombre ) ),
            asistencias ( count )
        `)
            .eq('profesor_id', userId)
            .gte('inicio', start)
            .lte('inicio', end)
            .order('inicio', { ascending: true })

        if (clases) {
            // Procesamos los datos para que sean fáciles de usar
            const clasesFormateadas = clases.map((c: any) => ({
                ...c,
                _count: { asistencias: c.asistencias[0]?.count || 0 }
            }))

            setClasesHoy(clasesFormateadas)

            // Sumamos el total de alumnos
            const total = clasesFormateadas.reduce((acc: number, curr: any) => acc + curr._count.asistencias, 0)
            setTotalAlumnos(total)
        }
    }

    const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setUploading(true)
            if (!event.target.files || event.target.files.length === 0) throw new Error('Seleccioná una imagen.')
            if (!profile) return

            const file = event.target.files[0]
            const fileExt = file.name.split('.').pop()
            const fileName = `${profile.id}-${Math.random()}.${fileExt}`

            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file)
            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)

            const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
            if (updateError) throw updateError

            setAvatarUrl(publicUrl)

        } catch (error: any) {
            alert('Error: ' + error.message)
        } finally {
            setUploading(false)
        }
    }

    if (loading) return <div className="p-10 text-piso2-lime animate-pulse">Cargando perfil...</div>

    return (
        <div className="max-w-4xl mx-auto pb-20 space-y-8">

            {/* HEADER */}
            <div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Mi Perfil</h2>
                <p className="text-gray-400 text-sm">Gestioná tu identidad en Piso 2.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* COLUMNA IZQUIERDA: TARJETA DE PERFIL */}
                <div className="lg:col-span-2 bg-[#09090b] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative h-fit">
                    <div className="h-32 bg-gradient-to-r from-piso2-lime/20 to-piso2-blue/20 border-b border-white/5"></div>
                    <div className="px-8 pb-8">
                        <div className="relative -mt-16 mb-6 inline-block group">
                            <div className="w-32 h-32 rounded-full border-4 border-[#09090b] overflow-hidden bg-black relative shadow-xl">
                                {avatarUrl ? (
                                    <Image src={avatarUrl} alt="Avatar" fill className="object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-white/10 text-white text-4xl font-black uppercase">{profile?.nombre_completo?.charAt(0) || <User />}</div>
                                )}
                                {uploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20"><Loader2 className="animate-spin text-piso2-lime" /></div>}
                            </div>
                            <label className="absolute bottom-0 right-0 bg-white text-black p-2 rounded-full cursor-pointer hover:bg-piso2-lime transition-colors shadow-lg z-10 border-4 border-[#09090b]">
                                <Camera size={20} />
                                <input type="file" className="hidden" accept="image/*" onChange={uploadAvatar} disabled={uploading} />
                            </label>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest flex items-center gap-2"><User size={12} /> Nombre</label>
                                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-white font-bold text-lg">{profile?.nombre_completo || 'Sin nombre'}</div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest flex items-center gap-2"><Shield size={12} /> Rol</label>
                                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-piso2-lime font-bold text-lg uppercase flex items-center gap-2">
                                        {profile?.rol}
                                        {profile?.rol === 'admin' && <span className="text-[10px] bg-red-500 text-black px-2 rounded-full">SUPERUSER</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest flex items-center gap-2"><Mail size={12} /> Email</label>
                                <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-gray-300 font-mono text-sm md:text-base">{profile?.email}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* COLUMNA DERECHA: DASHBOARD DOCENTE (Solo visible para Profesores) */}
                {profile?.rol === 'profesor' && (
                    <div className="space-y-4">

                        {/* METRICA: ALUMNOS DEL DIA */}
                        <div className="bg-piso2-lime text-black p-6 rounded-2xl shadow-[0_0_30px_rgba(204,255,0,0.1)] relative overflow-hidden group">
                            <div className="absolute -right-4 -bottom-4 text-black/10 transform rotate-12 group-hover:scale-110 transition-transform">
                                <Users size={100} />
                            </div>
                            <p className="text-xs font-black uppercase tracking-widest opacity-70 mb-1">Alumnos hoy</p>
                            <p className="text-5xl font-black tracking-tighter">{totalAlumnos}</p>
                            <p className="text-[10px] font-bold mt-2 uppercase">En {clasesHoy.length} Clases</p>
                        </div>

                        {/* LISTA: AGENDA */}
                        <div className="bg-[#09090b] border border-white/10 p-6 rounded-2xl h-fit">
                            <h3 className="text-white font-black uppercase text-sm mb-4 flex items-center gap-2">
                                <Calendar size={16} className="text-piso2-blue" /> Agenda de Hoy
                            </h3>

                            <div className="space-y-3">
                                {clasesHoy.length > 0 ? clasesHoy.map(clase => (
                                    <div key={clase.id} className="bg-white/5 p-3 rounded-lg border border-white/5 hover:border-piso2-blue/50 transition-colors">
                                        <div className="flex justify-between items-start">
                                            <span className="text-white font-bold text-sm">{clase.nombre}</span>
                                            <span className="text-xs font-mono text-piso2-blue">{format(new Date(clase.inicio), 'HH:mm')}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400 uppercase">
                                            <span className="flex items-center gap-1"><MapPin size={10} /> {clase.sala.sede.nombre}</span>
                                            <span className="flex items-center gap-1"><Users size={10} /> {clase._count.asistencias} Inscriptos</span>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-6 text-gray-500 text-xs">
                                        <p>¡Día libre! 🎉</p>
                                        <p>No tenés clases hoy.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                )}

            </div>
        </div>
    )
}