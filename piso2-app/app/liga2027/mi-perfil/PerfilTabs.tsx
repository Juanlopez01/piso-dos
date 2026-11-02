'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { logoutAlumnoLiga27Action, type MiLiga27 } from '@/app/actions/liga2027'
import { GraduationCap, CalendarCheck, BookOpen, Gift, LogOut, AlertTriangle, Lock } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const TABS = [
    { key: 'evaluaciones', label: 'Evaluaciones', icon: GraduationCap },
    { key: 'asistencias', label: 'Asistencias', icon: CalendarCheck },
    { key: 'programa', label: 'Programa', icon: BookOpen },
    { key: 'beneficios', label: 'Beneficios', icon: Gift },
]

const ESTADO_LABEL: Record<string, { txt: string; cls: string }> = {
    postulado: { txt: 'Postulado', cls: 'bg-amber-100 text-amber-800' },
    aprobado: { txt: 'Al día', cls: 'bg-green-100 text-green-800' },
    bloqueado: { txt: 'Bloqueado', cls: 'bg-red-100 text-red-800' },
    baja: { txt: 'Baja', cls: 'bg-neutral-200 text-neutral-600' },
}

function Proximamente({ texto }: { texto: string }) {
    return (
        <div className="text-center py-16 text-neutral-400">
            <Lock size={30} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">{texto}</p>
        </div>
    )
}

export default function PerfilTabs({ data }: { data: MiLiga27 }) {
    const router = useRouter()
    const [tab, setTab] = useState('evaluaciones')
    const { perfil, inscripcion, pagos, bloqueado } = data
    const letra = inscripcion?.letra_actual || inscripcion?.promedio_letra || '—'
    const estado = inscripcion?.estado || 'postulado'
    const estInfo = ESTADO_LABEL[estado] || ESTADO_LABEL.postulado

    const salir = async () => { await logoutAlumnoLiga27Action(); router.push('/liga2027/login') }

    return (
        <div className={`min-h-screen bg-neutral-50 text-neutral-900 ${sans.className}`}>
            <div className="bg-black text-white py-2.5">
                <div className="max-w-3xl mx-auto px-5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70">Piso 2 · La Liga 2027</span>
                    <button onClick={salir} className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white flex items-center gap-1.5"><LogOut size={12} /> Salir</button>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-5 py-8">
                {/* Cabecera del perfil */}
                <div className="flex items-center gap-4">
                    {perfil.foto_url
                        ? <img src={perfil.foto_url} alt="" className="w-20 h-20 rounded-full object-cover" />
                        : <div className="w-20 h-20 rounded-full bg-neutral-200 flex items-center justify-center text-2xl font-semibold text-neutral-400">{(perfil.nombre || '?')[0]}</div>}
                    <div className="flex-1">
                        <h1 className={`${serif.className} text-2xl tracking-wide`}>{perfil.nombre} {perfil.apellido || ''}</h1>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${estInfo.cls}`}>{estInfo.txt}</span>
                            <span className="text-xs text-neutral-500">Categoría general: <b className="text-neutral-900">{letra}</b></span>
                        </div>
                    </div>
                </div>

                {/* Cartel de bloqueo por mora */}
                {bloqueado && (
                    <div className="mt-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                        <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-red-800">Tu perfil está bloqueado</p>
                            <p className="text-xs text-red-700 mt-1">{inscripcion?.bloqueado_motivo || 'Hay un pago pendiente.'} Comunicate con el área administrativa para regularizarlo.</p>
                        </div>
                    </div>
                )}

                {/* Estado de pago */}
                <div className="mt-6 bg-white border border-neutral-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Estado de pago</h2>
                        <span className="text-xs">Matrícula: <b className={inscripcion?.matricula_pagada ? 'text-green-700' : 'text-amber-700'}>{inscripcion?.matricula_pagada ? 'Pagada' : 'Pendiente'}</b></span>
                    </div>
                    {pagos.length === 0
                        ? <p className="text-sm text-neutral-400">Todavía no hay pagos registrados.</p>
                        : (
                            <div className="divide-y divide-neutral-100">
                                {pagos.map(p => (
                                    <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                                        <span className="capitalize">{p.concepto}{p.mes ? ` · ${p.mes}/${p.anio}` : ''}</span>
                                        <span className="flex items-center gap-3">
                                            <span className="text-neutral-500">${Number(p.monto).toLocaleString('es-AR')}</span>
                                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${p.estado === 'pagado' ? 'bg-green-100 text-green-800' : p.estado === 'pendiente' ? 'bg-amber-100 text-amber-800' : 'bg-neutral-200 text-neutral-600'}`}>{p.estado}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                </div>

                {/* Tabs */}
                <div className="mt-8 flex gap-1 border-b border-neutral-200 overflow-x-auto">
                    {TABS.map(t => {
                        const Icon = t.icon
                        const active = tab === t.key
                        return (
                            <button key={t.key} onClick={() => setTab(t.key)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${active ? 'border-black text-black font-semibold' : 'border-transparent text-neutral-400 hover:text-neutral-700'}`}>
                                <Icon size={15} /> {t.label}
                            </button>
                        )
                    })}
                </div>

                <div className="bg-white border border-neutral-200 border-t-0 rounded-b-xl">
                    {tab === 'evaluaciones' && <Proximamente texto="Tus notas por disciplina van a aparecer acá cuando arranque el programa." />}
                    {tab === 'asistencias' && <Proximamente texto="Tu asistencia y tu condición de regularidad van a aparecer acá." />}
                    {tab === 'programa' && <Proximamente texto="El programa y los contenidos por bloque van a aparecer acá." />}
                    {tab === 'beneficios' && <Proximamente texto="Tus beneficios según tu categoría van a aparecer acá." />}
                </div>
            </div>
        </div>
    )
}
