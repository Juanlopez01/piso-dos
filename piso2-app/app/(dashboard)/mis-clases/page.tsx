'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarCheck, MapPin, User, Clock, Loader2 } from 'lucide-react'
import Image from 'next/image'

type Historial = {
    id: string
    created_at: string
    clase: {
        nombre: string
        inicio: string
        imagen_url: string | null
        sala: { nombre: string; sede: { nombre: string } }
        profesor: { nombre_completo: string }
    }
}

export default function MisClasesPage() {
    const supabase = createClient()
    const [historial, setHistorial] = useState<Historial[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchHistorial()
    }, [])

    const fetchHistorial = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
            .from('asistencias')
            .select(`
        id, created_at,
        clase:clases (
          nombre, inicio, imagen_url,
          sala:salas ( nombre, sede:sedes ( nombre ) ),
          profesor:profiles ( nombre_completo )
        )
      `)
            .eq('alumno_id', user.id)
            .eq('presente', true)
            .order('created_at', { ascending: false }) // Las más recientes primero

        if (data) setHistorial(data as any)
        setLoading(false)
    }

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-piso2-lime" /></div>

    return (
        <div className="pb-24 px-4 pt-4">
            <div className="mb-6">
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Mis Clases</h2>
                <p className="text-piso2-lime font-bold text-xs tracking-widest uppercase">
                    Historial de Asistencia • {historial.length} Clases
                </p>
            </div>

            <div className="space-y-4">
                {historial.length > 0 ? (
                    historial.map((item) => (
                        <div key={item.id} className="bg-[#111] border border-white/5 rounded-xl overflow-hidden flex flex-row">
                            {/* Fecha (Columna Izq) */}
                            <div className="bg-white/5 w-16 flex flex-col items-center justify-center p-2 text-center border-r border-white/5">
                                <span className="text-xs font-bold text-gray-400 uppercase">{format(new Date(item.clase.inicio), 'MMM', { locale: es })}</span>
                                <span className="text-2xl font-black text-white">{format(new Date(item.clase.inicio), 'd')}</span>
                            </div>

                            {/* Info (Centro) */}
                            <div className="flex-1 p-3 flex flex-col justify-center">
                                <h4 className="text-sm font-bold text-white uppercase leading-tight mb-1">{item.clase.nombre}</h4>
                                <div className="text-[10px] text-gray-500 font-medium space-y-0.5">
                                    <p className="flex items-center gap-1"><Clock size={10} /> {format(new Date(item.clase.inicio), 'HH:mm')} hs</p>
                                    <p className="flex items-center gap-1"><User size={10} /> {item.clase.profesor?.nombre_completo || 'Staff'}</p>
                                    <p className="flex items-center gap-1"><MapPin size={10} /> {item.clase.sala?.sede?.nombre}</p>
                                </div>
                            </div>

                            {/* Icono Check (Derecha) */}
                            <div className="w-10 flex items-center justify-center text-piso2-lime bg-piso2-lime/5">
                                <CalendarCheck size={20} />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-12 border border-dashed border-white/10 rounded-xl text-gray-500">
                        <p className="text-sm font-bold uppercase">Aún no tenés asistencias.</p>
                        <p className="text-xs mt-1">¡Anotate en tu primera clase!</p>
                    </div>
                )}
            </div>
        </div>
    )
}