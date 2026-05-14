'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useCash } from '@/context/CashContext'
import { useRouter } from 'next/navigation'
import { Loader2, Calendar, CheckSquare, BarChart3, Clock, MapPin, Package, Star, Users } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { generarReporteMensualAction } from '@/app/actions/reportes'

function AdminContent() {
    const { userRole, isLoading: loadingContext } = useCash()
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    // --- NOMBRES DE MESES ---
    const mesesNombres = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    // --- ESTADOS DEL REPORTE MENSUAL ---
    const hoy = new Date();
    const [mes, setMes] = useState(hoy.getMonth() + 1);
    const [anio, setAnio] = useState(hoy.getFullYear());

    const [companiasDisp, setCompaniasDisp] = useState<any[]>([]);
    const [companiasSel, setCompaniasSel] = useState<string[]>([]);

    const [generando, setGenerando] = useState(false);
    const [reporte, setReporte] = useState<any>(null);

    // 1. Redirigir si no es admin
    useEffect(() => {
        if (!loadingContext && userRole !== 'admin') {
            router.push('/');
        }
    }, [userRole, loadingContext, router]);

    // 2. Cargar Lista de Compañías
    useEffect(() => {
        const fetchInitialData = async () => {
            if (userRole !== 'admin') return;
            const { data: dataCias } = await supabase.from('companias').select('id, nombre').order('nombre');
            if (dataCias) {
                setCompaniasDisp(dataCias);
                setCompaniasSel(dataCias.map((c: any) => c.id));
            }
        }
        fetchInitialData()
    }, [supabase, userRole])

    // --- ACCIONES DEL REPORTE ---
    const handleGenerar = async () => {
        setGenerando(true);
        const res = await generarReporteMensualAction(mes, anio, companiasSel);

        if (res.success) {
            setReporte(res.data);
            toast.success("Reporte generado con éxito");
        } else {
            toast.error(res.error || "Error al generar reporte");
        }
        setGenerando(false);
    }

    const toggleCia = (id: string) => {
        setCompaniasSel(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
    }

    const formatHs = (horas: number) => {
        const h = Math.floor(horas);
        const m = Math.round((horas - h) * 60);
        return `${h}h ${m}m`;
    }

    if (loadingContext) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4E655] w-12 h-12" /></div>

    if (userRole !== 'admin') return null;

    return (
        <div className="p-4 md:p-8 min-h-screen bg-[#050505] text-white pb-32 animate-in fade-in">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER */}
            <div className="mb-8 border-b border-white/10 pb-6 max-w-6xl mx-auto">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white">
                    Reporte de Liquidación
                </h1>
                <p className="text-[#D4E655] font-bold text-xs uppercase tracking-widest mt-1">
                    Herramienta Exclusiva de Administración
                </p>
            </div>

            {/* 🚀 CAJA DE FILTROS PREMIUM */}
            <div className="bg-[#111] border border-white/5 rounded-3xl p-2 shadow-2xl mb-8 max-w-6xl mx-auto">
                <div className="bg-[#09090b] rounded-[20px] p-6 border border-white/5">

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                        {/* COLUMNA PERIODO (Ocupa 3 de 12) */}
                        <div className="lg:col-span-3 flex flex-col justify-start h-full">
                            <label className="text-[10px] font-bold uppercase text-gray-500 tracking-widest flex items-center gap-1.5 mb-3">
                                <Calendar size={14} className="text-[#D4E655]" /> Periodo de Análisis
                            </label>
                            <div className="flex gap-2">
                                <select
                                    value={mes}
                                    onChange={e => setMes(Number(e.target.value))}
                                    className="w-3/5 bg-black border border-white/10 py-3.5 px-3 rounded-xl outline-none focus:border-[#D4E655] text-white text-xs font-black uppercase cursor-pointer transition-colors"
                                >
                                    {mesesNombres.map((nombre, index) => (
                                        <option key={index + 1} value={index + 1}>{nombre}</option>
                                    ))}
                                </select>
                                <select
                                    value={anio}
                                    onChange={e => setAnio(Number(e.target.value))}
                                    className="w-2/5 bg-black border border-white/10 py-3.5 px-3 rounded-xl outline-none focus:border-[#D4E655] text-white text-xs font-black uppercase cursor-pointer text-center transition-colors"
                                >
                                    {[2024, 2025, 2026, 2027].map(a => (
                                        <option key={a} value={a}>{a}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* COLUMNA GRUPOS (Ocupa 6 de 12) */}
                        <div className="lg:col-span-6 flex flex-col justify-start h-full border-t lg:border-t-0 lg:border-l border-white/10 pt-4 lg:pt-0 lg:pl-8">
                            <label className="text-[10px] font-bold uppercase text-gray-500 tracking-widest flex items-center gap-1.5 mb-3">
                                <CheckSquare size={14} className="text-gray-400" /> Grupos a Incluir
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {companiasDisp.map(cia => {
                                    const isSelected = companiasSel.includes(cia.id);
                                    return (
                                        <button
                                            key={cia.id}
                                            onClick={() => toggleCia(cia.id)}
                                            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${isSelected
                                                    ? 'bg-white text-black shadow-[0_4px_15px_rgba(255,255,255,0.15)] scale-[1.02] border border-white'
                                                    : 'bg-black text-gray-500 border border-white/10 hover:border-white/30 hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            {cia.nombre}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* COLUMNA BOTON (Ocupa 3 de 12) */}
                        <div className="lg:col-span-3 flex flex-col justify-end h-full mt-2 lg:mt-0">
                            {/* Un espaciador invisible para empujar el botón hacia abajo y que alinee con los selectores */}
                            <div className="hidden lg:block h-[26px]"></div>
                            <button
                                onClick={handleGenerar}
                                disabled={generando}
                                className="w-full py-4 bg-[#D4E655] text-black font-black uppercase tracking-widest rounded-xl hover:bg-white hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(212,230,85,0.15)] text-xs"
                            >
                                {generando ? <Loader2 className="animate-spin" size={16} /> : <><BarChart3 size={16} /> Generar Reporte</>}
                            </button>
                        </div>

                    </div>
                </div>
            </div>

            {/* VISTA DEL REPORTE GENERADO */}
            {reporte && (
                <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500 max-w-6xl mx-auto">

                    {/* 1 y 2. CLASES Y PACKS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[#09090b] border border-white/10 rounded-3xl p-5 md:p-8">
                            <h3 className="text-base font-black text-[#D4E655] uppercase flex items-center gap-2 mb-6"><Package size={18} /> Regulares (y Exclusivas)</h3>
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-center">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Packs Vendidos</p>
                                    <p className="text-3xl font-black">{reporte.packs.regular.total_vendidos}</p>
                                </div>
                                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-center">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Clases Tomadas</p>
                                    <p className="text-3xl font-black text-[#D4E655]">{reporte.tomadas.regulares}</p>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Desglose de Ventas:</p>
                                <div className="flex justify-between text-xs bg-black px-4 py-2.5 rounded-xl border border-white/5"><span>Sueltas</span><span className="font-bold text-white">{reporte.packs.regular.sueltas}</span></div>
                                <div className="flex justify-between text-xs bg-black px-4 py-2.5 rounded-xl border border-white/5"><span>Packs x4</span><span className="font-bold text-white">{reporte.packs.regular.x4}</span></div>
                                <div className="flex justify-between text-xs bg-black px-4 py-2.5 rounded-xl border border-white/5"><span>Packs x8</span><span className="font-bold text-white">{reporte.packs.regular.x8}</span></div>
                                <div className="flex justify-between text-xs bg-black px-4 py-2.5 rounded-xl border border-white/5"><span>Packs x12</span><span className="font-bold text-white">{reporte.packs.regular.x12}</span></div>
                            </div>
                        </div>

                        <div className="bg-[#09090b] border border-white/10 rounded-3xl p-5 md:p-8">
                            <h3 className="text-base font-black text-purple-400 uppercase flex items-center gap-2 mb-6"><Package size={18} /> Clases Especiales</h3>
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-center">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Packs Vendidos</p>
                                    <p className="text-3xl font-black">{reporte.packs.especial.total_vendidos}</p>
                                </div>
                                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-center">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Clases Tomadas</p>
                                    <p className="text-3xl font-black text-purple-400">{reporte.tomadas.especiales}</p>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Desglose de Ventas:</p>
                                <div className="flex justify-between text-xs bg-black px-4 py-2.5 rounded-xl border border-white/5"><span>Sueltas</span><span className="font-bold text-white">{reporte.packs.especial.sueltas}</span></div>
                                <div className="flex justify-between text-xs bg-black px-4 py-2.5 rounded-xl border border-white/5"><span>Packs x4</span><span className="font-bold text-white">{reporte.packs.especial.x4}</span></div>
                                <div className="flex justify-between text-xs bg-black px-4 py-2.5 rounded-xl border border-white/5"><span>Packs x8</span><span className="font-bold text-white">{reporte.packs.especial.x8}</span></div>
                                <div className="flex justify-between text-xs bg-black px-4 py-2.5 rounded-xl border border-white/5"><span>Packs x12</span><span className="font-bold text-white">{reporte.packs.especial.x12}</span></div>
                            </div>
                        </div>
                    </div>

                    {/* 3. LIGA Y COMPAÑIAS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-[#09090b] border border-yellow-500/20 rounded-3xl p-6">
                            <h3 className="text-base font-black text-yellow-500 uppercase mb-4 tracking-widest flex items-center justify-center gap-2"><Star size={16} /> La Liga</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5"><span className="text-[10px] text-gray-400 font-bold uppercase">Participantes</span><span className="text-lg font-black">{reporte.liga.participantes}</span></div>
                                <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5"><span className="text-[10px] text-gray-400 font-bold uppercase">Recaudado</span><span className="text-lg font-black text-white">${reporte.liga.recaudacion.toLocaleString()}</span></div>
                                <div className="flex justify-between items-center bg-yellow-500/10 p-3 rounded-xl border border-yellow-500/20 mt-4"><span className="text-xs text-yellow-500 font-black uppercase">A pagar Profes</span><span className="text-xl font-black text-yellow-500">${Math.round(reporte.liga.pago_docentes).toLocaleString()}</span></div>
                            </div>
                        </div>

                        {reporte.companias.map((cia: any) => (
                            <div key={cia.nombre} className="bg-[#09090b] border border-blue-500/20 rounded-3xl p-6">
                                <h3 className="text-base font-black text-blue-400 uppercase mb-4 tracking-widest flex items-center justify-center gap-2"><Users size={16} /> {cia.nombre}</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5"><span className="text-[10px] text-gray-400 font-bold uppercase">Participantes</span><span className="text-lg font-black">{cia.participantes}</span></div>
                                    <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5"><span className="text-[10px] text-gray-400 font-bold uppercase">Recaudado</span><span className="text-lg font-black text-white">${cia.recaudacion.toLocaleString()}</span></div>
                                    <div className="flex justify-between items-center bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 mt-4"><span className="text-xs text-blue-400 font-black uppercase">A pagar Profes</span><span className="text-xl font-black text-blue-400">${Math.round(cia.pago_docentes).toLocaleString()}</span></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 4. RECEPCIÓN Y SEDES */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[#09090b] border border-white/10 rounded-3xl p-6">
                            <h3 className="text-base font-black text-white uppercase flex items-center gap-2 mb-6"><Clock size={18} className="text-[#D4E655]" /> Horas Recepción</h3>
                            <div className="space-y-3">
                                {reporte.horasRecep.length === 0 ? <p className="text-xs text-gray-500 italic text-center py-4">No hay turnos registrados</p> : null}
                                {reporte.horasRecep.sort((a: any, b: any) => b.horas - a.horas).map((r: any) => (
                                    <div key={r.nombre} className="flex justify-between items-center bg-white/5 px-4 py-3 rounded-xl border border-white/5">
                                        <span className="text-xs font-bold uppercase text-gray-300">{r.nombre}</span>
                                        <span className="text-base font-black text-[#D4E655]">{formatHs(r.horas)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-[#09090b] border border-white/10 rounded-3xl p-6">
                            <h3 className="text-base font-black text-white uppercase flex items-center gap-2 mb-6"><MapPin size={18} className="text-green-500" /> Ingresos por Sede</h3>
                            <div className="space-y-3">
                                {reporte.sedes.length === 0 ? <p className="text-[10px] text-gray-500 italic text-center py-4">No hay ingresos registrados</p> : null}
                                {reporte.sedes.sort((a: any, b: any) => b.monto - a.monto).map((s: any) => (
                                    <div key={s.nombre} className="flex justify-between items-center bg-white/5 px-4 py-3 rounded-xl border border-white/5">
                                        <span className="text-xs font-bold uppercase text-gray-300">{s.nombre}</span>
                                        <span className="text-base font-black text-green-400">${s.monto.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    )
}

export default function AdminDashboard() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <Loader2 className="animate-spin text-[#D4E655] w-12 h-12" />
            </div>
        }>
            <AdminContent />
        </Suspense>
    )
}