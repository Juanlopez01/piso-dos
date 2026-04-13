'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { Bell, CheckCircle2, Circle, Loader2, ArrowRight, Trash2, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast, Toaster } from 'sonner'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useCash } from '@/context/CashContext' // 🚀 IMPORTAMOS EL CONTEXTO GLOBAL

type Notificacion = {
    id: string
    titulo: string
    mensaje: string
    leido: boolean
    link: string | null
    created_at: string
}

// 🚀 FETCHER ORDENADO (Recibe el UID directamente)
const fetcherNotificaciones = async (uid: string, supabase: any): Promise<Notificacion[]> => {
    const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('usuario_id', uid)
        .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return data || []
}

export default function NotificacionesPage() {
    // 1. Singleton de Supabase
    const [supabase] = useState(() => createClient())
    const router = useRouter()

    // 2. Extraemos el ID del usuario desde el Contexto (Sin pelear por la sesión)
    const { userId, isLoading: contextLoading } = useCash()

    // 3. SWR: Se encarga del caché y la carga automática
    const { data: notificaciones, error, isLoading, mutate } = useSWR<Notificacion[]>(
        !contextLoading && userId ? ['notificaciones', userId] : null,
        ([_, uid]) => fetcherNotificaciones(uid as string, supabase),
        { revalidateOnFocus: true }
    )

    // 4. SUSCRIPCIÓN EN TIEMPO REAL (Para que caigan al instante)
    useEffect(() => {
        if (!userId) return

        const channel = supabase
            .channel('realtime_notifs_page')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notificaciones',
                filter: `usuario_id=eq.${userId}` // 🚀 Escuchamos solo nuestras notificaciones
            }, () => {
                // Le avisamos a SWR que hay datos nuevos
                mutate()
                // Opcional: Un sonido o toast extra si estás en la página
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [userId, supabase, mutate])

    const handleClickNotificacion = async (id: string, leido: boolean, link: string | null) => {
        // 🚀 MUTACIÓN OPTIMISTA: Lo marcamos como leído en la pantalla al instante
        if (!leido && notificaciones) {
            const nuevasNotifs = notificaciones.map(n => n.id === id ? { ...n, leido: true } : n)
            mutate(nuevasNotifs, false)

            // Impactamos en la base de datos de fondo
            await supabase.from('notificaciones').update({ leido: true }).eq('id', id)
            mutate() // Sincronizamos por las dudas

            // Le avisamos al Sidebar
            window.dispatchEvent(new Event('notificaciones_actualizadas'))
        }

        // Redirigimos si hay link
        if (link) router.push(link)
    }

    const marcarTodasLeidas = async () => {
        if (!userId || !notificaciones) return

        // Mutación optimista
        const nuevasNotifs = notificaciones.map(n => ({ ...n, leido: true }))
        mutate(nuevasNotifs, false)

        // Impacto real
        await supabase.from('notificaciones').update({ leido: true }).eq('usuario_id', userId).eq('leido', false)
        toast.success('Todas marcadas como leídas')
        mutate() // Sincronizamos
        window.dispatchEvent(new Event('notificaciones_actualizadas'))
    }

    const eliminarLeidas = async () => {
        if (!userId || !notificaciones) return

        // Mutación optimista
        const nuevasNotifs = notificaciones.filter(n => !n.leido)
        mutate(nuevasNotifs, false)

        // Impacto real
        await supabase.from('notificaciones').delete().eq('usuario_id', userId).eq('leido', true)
        toast.success('Notificaciones leídas eliminadas')
        mutate() // Sincronizamos
    }

    // --- ESTADOS DE CARGA Y ERROR ---
    if (isLoading || contextLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    if (error) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-4">
                <AlertTriangle className="text-orange-500 w-16 h-16" />
                <h2 className="text-white font-black text-2xl uppercase">Error al cargar</h2>
                <button onClick={() => window.location.reload()} className="bg-[#D4E655] text-black px-6 py-3 rounded-xl font-black uppercase text-xs">Refrescar</button>
            </div>
        )
    }

    const safeNotificaciones = notificaciones || []
    const unreadCount = safeNotificaciones.filter(n => !n.leido).length

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white mb-1 flex items-center gap-3">
                        <Bell className="text-[#D4E655]" size={32} />
                        Notificaciones
                    </h1>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                        Tus avisos y novedades
                    </p>
                </div>

                <div className="flex gap-3">
                    {unreadCount > 0 && (
                        <button onClick={marcarTodasLeidas} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase transition-colors">
                            Marcar todas leídas
                        </button>
                    )}
                    {safeNotificaciones.some(n => n.leido) && (
                        <button onClick={eliminarLeidas} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-xl text-xs font-bold uppercase transition-colors flex items-center gap-2">
                            <Trash2 size={14} /> Limpiar Leídas
                        </button>
                    )}
                </div>
            </div>

            {/* LISTA DE NOTIFICACIONES */}
            <div className="max-w-3xl space-y-3">
                {safeNotificaciones.length === 0 ? (
                    <div className="bg-[#111] border border-white/5 rounded-2xl p-12 text-center text-gray-500">
                        <Bell className="mx-auto mb-4 opacity-20" size={48} />
                        <p className="font-bold uppercase text-sm">No tenés notificaciones nuevas.</p>
                        <p className="text-xs mt-1">¡Todo al día!</p>
                    </div>
                ) : (
                    safeNotificaciones.map((n) => (
                        <div
                            key={n.id}
                            onClick={() => handleClickNotificacion(n.id, n.leido, n.link)}
                            className={`group border rounded-2xl p-5 transition-all cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-4 
                                ${n.leido
                                    ? 'bg-[#09090b] border-white/5 opacity-70 hover:opacity-100 hover:border-white/20'
                                    : 'bg-[#111] border-[#D4E655]/30 shadow-lg hover:border-[#D4E655]/60'}`}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`mt-1 shrink-0 ${n.leido ? 'text-gray-600' : 'text-[#D4E655]'}`}>
                                    {n.leido ? <CheckCircle2 size={24} /> : <Circle fill="currentColor" size={24} />}
                                </div>
                                <div>
                                    <h3 className={`text-lg uppercase leading-tight mb-1 ${n.leido ? 'font-bold text-gray-300' : 'font-black text-white'}`}>
                                        {n.titulo}
                                    </h3>
                                    <p className={`text-sm leading-relaxed mb-2 ${n.leido ? 'text-gray-500' : 'text-gray-300'}`}>
                                        {n.mensaje}
                                    </p>
                                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                                    </p>
                                </div>
                            </div>

                            {n.link && (
                                <div className={`shrink-0 p-3 rounded-xl transition-colors ${n.leido ? 'bg-white/5 text-gray-400 group-hover:bg-white/10 group-hover:text-white' : 'bg-[#D4E655]/10 text-[#D4E655] group-hover:bg-[#D4E655] group-hover:text-black'}`}>
                                    <ArrowRight size={20} />
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}