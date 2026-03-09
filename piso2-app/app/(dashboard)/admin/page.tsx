'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { TrendingUp, Users, Ticket, Star, Loader2 } from 'lucide-react'

export default function AdminDashboard() {
    const supabase = createClient()
    const [stats, setStats] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStats = async () => {
            // Un solo llamado, cero estrés para el navegador
            const { data, error } = await supabase.rpc('get_admin_dashboard_stats')
            if (!error && data) {
                setStats(data)
            }
            setLoading(false)
        }
        fetchStats()
    }, [])

    if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <div className="mb-8 border-b border-white/10 pb-6">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white">
                    General
                </h1>
                <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">
                    Resumen de la Academia
                </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-[#09090b] border border-white/10 p-6 rounded-3xl relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><TrendingUp size={100} /></div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2"><TrendingUp size={14} className="text-green-400" /> Ingresos del Mes</p>
                    <p className="text-4xl font-black text-white tracking-tighter">${Number(stats?.ingresos_mes || 0).toLocaleString()}</p>
                </div>

                <div className="bg-[#09090b] border border-white/10 p-6 rounded-3xl relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Users size={100} /></div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2"><Users size={14} className="text-blue-400" /> Alumnos Activos</p>
                    <p className="text-4xl font-black text-white tracking-tighter">{stats?.alumnos_activos || 0}</p>
                </div>

                <div className="bg-[#D4E655]/10 border border-[#D4E655]/30 p-6 rounded-3xl relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity text-[#D4E655]"><Ticket size={100} /></div>
                    <p className="text-[10px] text-[#D4E655] font-bold uppercase tracking-widest mb-2 flex items-center gap-2"><Ticket size={14} /> Créditos en Circulación</p>
                    <p className="text-4xl font-black text-[#D4E655] tracking-tighter">{stats?.creditos_flotantes || 0}</p>
                </div>
            </div>

            {/* Clases Populares */}
            <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                <h2 className="text-sm font-black uppercase text-white mb-6 flex items-center gap-2">
                    <Star size={16} className="text-[#D4E655]" /> Top Clases (Últimos 30 días)
                </h2>
                <div className="space-y-3">
                    {stats?.top_clases?.length === 0 ? (
                        <p className="text-gray-500 text-xs font-bold uppercase">No hay datos suficientes aún.</p>
                    ) : (
                        stats?.top_clases?.map((clase: any, index: number) => (
                            <div key={index} className="flex justify-between items-center border-b border-white/5 pb-3 last:border-0 last:pb-0">
                                <span className="font-bold text-white uppercase text-sm">{index + 1}. {clase.nombre}</span>
                                <span className="bg-white/10 px-3 py-1 rounded-lg text-xs font-black text-[#D4E655]">{clase.total_inscritos} pax</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}