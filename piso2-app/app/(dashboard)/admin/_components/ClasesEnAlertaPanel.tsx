'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert, Loader2, Users, MapPin, ChevronDown, ChevronUp, UserCheck, CheckCircle2 } from 'lucide-react'
import { getClasesEnAlertaAction, type ClaseAlerta } from '@/app/actions/alertas-clases'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function ClasesEnAlertaPanel() {
    const hoy = new Date()
    const [mes, setMes] = useState(hoy.getMonth() + 1)
    const [anio, setAnio] = useState(hoy.getFullYear())
    const [cargando, setCargando] = useState(true)
    const [alertas, setAlertas] = useState<ClaseAlerta[]>([])
    const [umbral, setUmbral] = useState(5)
    const [abierto, setAbierto] = useState(true)

    useEffect(() => {
        let cancel = false
        setCargando(true)
        getClasesEnAlertaAction(anio, mes).then(r => {
            if (cancel) return
            if (r.ok) { setAlertas(r.alertas); setUmbral(r.umbral) } else setAlertas([])
            setCargando(false)
        })
        return () => { cancel = true }
    }, [anio, mes])

    return (
        <div className="max-w-6xl mx-auto mb-8">
            <div className={`rounded-3xl border p-2 shadow-2xl ${alertas.length ? 'bg-red-950/20 border-red-500/30' : 'bg-[#111] border-white/5'}`}>
                <div className="bg-[#09090b] rounded-[20px] border border-white/5">
                    {/* Encabezado */}
                    <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center justify-between p-5 text-left">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${alertas.length ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                {alertas.length ? <ShieldAlert size={20} /> : <CheckCircle2 size={20} />}
                            </div>
                            <div>
                                <h2 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                                    Clases en alerta
                                    {!cargando && alertas.length > 0 && (
                                        <span className="bg-red-500 text-white text-[11px] font-black px-2 py-0.5 rounded-full">{alertas.length}</span>
                                    )}
                                </h2>
                                <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                                    Menos de {umbral} alumnos pagos en el mes · {MESES[mes - 1]} {anio}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <select
                                value={`${anio}-${mes}`}
                                onChange={e => { const [a, m] = e.target.value.split('-'); setAnio(Number(a)); setMes(Number(m)) }}
                                onClick={e => e.stopPropagation()}
                                className="bg-black border border-white/10 py-2 px-3 rounded-xl outline-none focus:border-[#D4E655] text-white text-[11px] font-bold uppercase cursor-pointer"
                            >
                                {[0, 1, 2].map(d => {
                                    const dt = new Date(hoy.getFullYear(), hoy.getMonth() - d, 1)
                                    const a = dt.getFullYear(), m = dt.getMonth() + 1
                                    return <option key={`${a}-${m}`} value={`${a}-${m}`}>{MESES[m - 1]} {a}</option>
                                })}
                            </select>
                            {abierto ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
                        </div>
                    </button>

                    {abierto && (
                        <div className="px-4 pb-4">
                            {cargando ? (
                                <div className="flex items-center justify-center py-8 text-gray-500 text-sm gap-2"><Loader2 size={18} className="animate-spin" /> Buscando…</div>
                            ) : alertas.length === 0 ? (
                                <div className="text-center py-8 text-emerald-400/80 text-sm font-medium">
                                    👌 Ninguna clase por debajo de {umbral} alumnos pagos este mes.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {alertas.map(a => (
                                        <div key={a.key} className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-black text-white truncate">{a.nombre}</p>
                                                <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                                    {a.profe && <span>{a.profe}</span>}
                                                    <span className="flex items-center gap-1"><MapPin size={11} /> {a.sedeNombre}</span>
                                                    <span>{a.nSesiones} {a.nSesiones === 1 ? 'clase' : 'clases'}</span>
                                                </p>
                                                <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-1">
                                                    <UserCheck size={12} className="text-gray-400" />
                                                    {a.receps.length ? <>Cubrió: <span className="text-gray-300 font-semibold">{a.receps.join(', ')}</span></> : <span className="italic">Sin recep en caja registrada</span>}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4 md:gap-5 shrink-0">
                                                <div className="text-center">
                                                    <p className={`text-2xl font-black leading-none ${a.nPagos <= 1 ? 'text-red-400' : 'text-amber-400'}`}>{a.nPagos}</p>
                                                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mt-1 flex items-center gap-1"><Users size={10} /> pagos</p>
                                                </div>
                                                {a.nInscriptos > a.nPagos && (
                                                    <div className="text-center">
                                                        <p className="text-xl font-black leading-none text-gray-400">{a.nInscriptos}</p>
                                                        <p className="text-[9px] uppercase tracking-widest text-gray-600 font-bold mt-1">anotados</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
