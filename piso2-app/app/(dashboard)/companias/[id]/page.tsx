'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Loader2, UsersRound, Shield, ArrowLeft,
    MessageSquare, Calendar, Users, Info,
    Clock, MapPin, User, ChevronRight, Image as ImageIcon
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCash } from '@/context/CashContext'

type Compania = {
    id: string
    nombre: string
    descripcion: string
    coordinador_id: string
    coordinador?: { nombre_completo: string }
}

type Miembro = {
    id: string
    nombre_completo: string
    email: string
}

type ClaseCompania = {
    id: string
    nombre: string
    inicio: string
    fin: string
    imagen_url: string | null
    profesor: { nombre_completo: string }
    sala: { nombre: string; sede: { nombre: string } }
}

export default function CompaniaDetallePage() {
    const params = useParams()
    const router = useRouter()
    const [supabase] = useState(() => createClient())
    const { userRole, isLoading: loadingContext } = useCash()

    const [compania, setCompania] = useState<Compania | null>(null)
    const [miembros, setMiembros] = useState<Miembro[]>([])
    const [clases, setClases] = useState<ClaseCompania[]>([])
    const [loading, setLoading] = useState(true)

    // Pestañas de navegación interna
    const [activeTab, setActiveTab] = useState<'muro' | 'clases' | 'miembros'>('muro')

    useEffect(() => {
        if (!loadingContext) {
            verificarAccesoYCargar()
        }
    }, [loadingContext, params.id])

    const verificarAccesoYCargar = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            router.replace('/login')
            return
        }

        const companiaId = params.id as string

        // 1. EL PATOVICA
        const rolesPermitidos = ['admin', 'recepcion', 'profesor', 'coordinador']
        let tienePermiso = rolesPermitidos.includes(userRole || '')

        if (!tienePermiso && userRole === 'alumno') {
            const { data: esMiembro } = await supabase
                .from('perfiles_companias')
                .select('compania_id')
                .eq('compania_id', companiaId)
                .eq('perfil_id', user.id)
                .maybeSingle()

            if (esMiembro) tienePermiso = true
        }

        if (!tienePermiso) {
            toast.error('Acceso denegado. No perteneces a esta compañía.')
            router.replace('/companias')
            return
        }

        // 2. Cargamos Compañía
        const { data: dataCompania, error } = await supabase
            .from('companias')
            .select('*, coordinador:profiles!coordinador_id(nombre_completo)')
            .eq('id', companiaId)
            .single()

        if (error || !dataCompania) {
            toast.error('La compañía no existe')
            router.replace('/companias')
            return
        }
        setCompania(dataCompania)

        // 3. Cargamos Miembros
        const { data: dataMiembros } = await supabase
            .from('perfiles_companias')
            .select('perfil:profiles(id, nombre_completo, email)')
            .eq('compania_id', companiaId)

        if (dataMiembros) {
            const miembrosLimpios = dataMiembros.map((m: any) => m.perfil)
            miembrosLimpios.sort((a: { nombre_completo: string | null }, b: { nombre_completo: string | null }) =>
                (a.nombre_completo || '').localeCompare(b.nombre_completo || '')
            )
            setMiembros(miembrosLimpios)
        }

        // 4. CARGAMOS LAS CLASES EXCLUSIVAS (Solo la próxima de cada materia)
        const hoy = new Date().toISOString()
        const { data: dataClases } = await supabase
            .from('clases')
            .select(`
                id, nombre, inicio, fin, imagen_url,
                profesor:profiles!clases_profesor_id_fkey(nombre_completo),
                sala:salas(nombre, sede:sedes(nombre))
            `)
            .eq('compania_id', companiaId)
            .gte('inicio', hoy)
            .neq('estado', 'cancelada')
            .order('inicio', { ascending: true })

        if (dataClases) {
            // 🧠 AGRUPADOR MÁGICO: Como ya vienen ordenadas por fecha, 
            // solo nos guardamos la PRIMERA que aparezca de cada "materia".
            const clasesUnicas: ClaseCompania[] = []
            const materiasVistas = new Set<string>()

            dataClases.forEach((c: any) => {
                // Limpiamos los tipos por las dudas (el error de TS que me pasaste)
                const profNombre = Array.isArray(c.profesor) ? c.profesor[0]?.nombre_completo : c.profesor?.nombre_completo
                const salaData = Array.isArray(c.sala) ? c.sala[0] : c.sala

                // Creamos una "llave" única combinando nombre de la clase y profesor
                const keyMateria = `${c.nombre}-${profNombre}`

                // Si nunca vimos esta materia en el bucle, es la más próxima! La guardamos.
                if (!materiasVistas.has(keyMateria)) {
                    materiasVistas.add(keyMateria)
                    clasesUnicas.push({
                        id: c.id,
                        nombre: c.nombre,
                        inicio: c.inicio,
                        fin: c.fin,
                        imagen_url: c.imagen_url,
                        profesor: { nombre_completo: profNombre || 'Staff' },
                        sala: salaData
                    })
                }
            })

            setClases(clasesUnicas)
        }

        setLoading(false)
    }

    if (loading || loadingContext) {
        return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>
    }

    if (!compania) return null

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24 selection:bg-blue-500 selection:text-white animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER DE LA COMPAÑÍA */}
            <div className="bg-[#09090b] border-b border-white/5 pt-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

                <div className="max-w-4xl mx-auto px-4 md:px-8">
                    <Link href="/companias" className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors mb-6 relative z-10">
                        <ArrowLeft size={14} /> Volver a Compañías
                    </Link>

                    <div className="relative z-10 pb-8">
                        <span className="inline-block bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded mb-4 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                            Grupo Exclusivo
                        </span>
                        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none mb-4">
                            {compania.nombre}
                        </h1>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                            <div className="flex items-center gap-2 text-sm text-gray-300 font-bold bg-[#111] px-3 py-1.5 rounded-lg border border-white/5">
                                <Shield size={16} className="text-blue-400" />
                                Coord: {compania.coordinador?.nombre_completo || 'Staff Piso 2'}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-300 font-bold bg-[#111] px-3 py-1.5 rounded-lg border border-white/5">
                                <UsersRound size={16} className="text-blue-400" />
                                {miembros.length} Integrantes
                            </div>
                        </div>
                    </div>

                    {/* MENÚ DE PESTAÑAS */}
                    <div className="flex gap-6 relative z-10 overflow-x-auto custom-scrollbar">
                        <button
                            onClick={() => setActiveTab('muro')}
                            className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'muro' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <MessageSquare size={14} /> Muro / Avisos
                        </button>
                        <button
                            onClick={() => setActiveTab('clases')}
                            className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'clases' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Calendar size={14} /> Próximas Clases
                        </button>
                        <button
                            onClick={() => setActiveTab('miembros')}
                            className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'miembros' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Users size={14} /> Integrantes
                        </button>
                    </div>
                </div>
            </div>

            {/* CONTENIDO DE LAS PESTAÑAS */}
            <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">

                {/* 1. PESTAÑA: MURO / AVISOS */}
                {activeTab === 'muro' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 flex items-start gap-4">
                            <Info className="text-blue-400 shrink-0 mt-1" size={20} />
                            <div>
                                <h3 className="text-blue-400 font-black uppercase text-xs tracking-widest mb-1">Foco de la Compañía</h3>
                                <p className="text-sm text-blue-100/70 leading-relaxed">{compania.descripcion || 'Este grupo no tiene una descripción definida aún.'}</p>
                            </div>
                        </div>

                        <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                            <MessageSquare size={32} className="mx-auto mb-3 text-gray-600" />
                            <p className="text-gray-500 font-bold uppercase text-sm">El muro está vacío</p>
                            <p className="text-xs text-gray-600 mt-1">Pronto los coordinadores podrán publicar avisos acá.</p>
                        </div>
                    </div>
                )}

                {/* 2. PESTAÑA: CLASES */}
                {activeTab === 'clases' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {clases.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {clases.map((clase) => {
                                    const esHoy = isToday(new Date(clase.inicio))
                                    return (
                                        <div key={clase.id} className="bg-[#111] border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/30 transition-all group flex flex-col">
                                            {/* Imagen */}
                                            <div className="h-32 w-full relative bg-[#1a1a1c] border-b border-white/5 flex items-center justify-center overflow-hidden">
                                                {clase.imagen_url ? (
                                                    <Image src={clase.imagen_url} alt={clase.nombre} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                                                ) : (
                                                    <ImageIcon size={24} className="text-white/20" />
                                                )}
                                                {esHoy && <span className="absolute top-3 left-3 bg-blue-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-lg shadow-blue-500/40">⚡ Hoy</span>}
                                            </div>

                                            {/* Info */}
                                            <div className="p-5 flex-1">
                                                <h4 className="font-black uppercase text-white mb-1 truncate text-lg">{clase.nombre}</h4>
                                                <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-4">
                                                    <User size={12} className="text-blue-400" /> {clase.profesor?.nombre_completo}
                                                </p>
                                                <div className="space-y-2 border-t border-white/5 pt-4">
                                                    <p className="text-[10px] uppercase font-bold text-gray-500">Próximo Ensayo:</p>
                                                    <div className="flex items-center gap-3 text-xs text-gray-300 font-bold">
                                                        <Calendar size={14} className="text-blue-400" />
                                                        <span className="capitalize">{format(new Date(clase.inicio), "EEEE d MMMM", { locale: es })}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                                        <Clock size={14} className="text-white/30" />
                                                        <span>{format(new Date(clase.inicio), "HH:mm")} a {format(new Date(clase.fin), "HH:mm")} hs</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                                        <MapPin size={14} className="text-white/30" />
                                                        <span>{clase.sala?.nombre} <span className="text-[9px] opacity-50 uppercase border border-white/20 px-1 rounded ml-1">Sede {clase.sala?.sede?.nombre}</span></span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action */}
                                            <div className="p-4 bg-[#09090b] border-t border-white/5 mt-auto">
                                                <Link href={`/clase/${clase.id}`} className="w-full bg-blue-600/10 text-blue-400 border border-blue-600/20 py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">
                                                    Detalles de la Clase <ChevronRight size={14} />
                                                </Link>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                                <Calendar size={32} className="mx-auto mb-3 text-gray-600" />
                                <p className="text-gray-500 font-bold uppercase text-sm">Sin clases programadas</p>
                                <p className="text-xs text-gray-600 mt-1">Las clases creadas en la agenda para este grupo aparecerán acá.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. PESTAÑA: MIEMBROS */}
                {activeTab === 'miembros' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {miembros.length > 0 ? (
                                miembros.map((miembro) => (
                                    <div key={miembro.id} className="bg-[#111] border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:border-blue-500/30 transition-colors">
                                        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-black text-lg uppercase shrink-0 border border-blue-500/20">
                                            {miembro.nombre_completo?.[0] || '?'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-white uppercase truncate">{miembro.nombre_completo}</p>
                                            <p className="text-[10px] text-gray-500 truncate">{miembro.email}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full text-center py-20 border border-dashed border-white/10 rounded-3xl bg-[#111]/50">
                                    <UsersRound size={32} className="mx-auto mb-3 text-gray-600" />
                                    <p className="text-gray-500 font-bold uppercase text-sm">Grupo sin integrantes</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
    )
}