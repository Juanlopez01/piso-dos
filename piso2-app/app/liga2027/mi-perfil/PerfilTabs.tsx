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

const NOTA_CLS: Record<string, string> = { A: 'bg-green-100 text-green-800', B: 'bg-amber-100 text-amber-800', C: 'bg-red-100 text-red-800' }
const COND: Record<string, { txt: string; cls: string }> = {
    regular: { txt: 'Regular', cls: 'bg-green-100 text-green-800' },
    libre_mes: { txt: 'Libre del mes', cls: 'bg-amber-100 text-amber-800' },
    libre_bloque: { txt: 'Libre del bloque', cls: 'bg-red-100 text-red-800' },
}
const BENEFICIOS: Record<string, string[]> = {
    A: ['Prioridad en audiciones y castings', 'Acceso a salas para ensayar', 'Descuentos y becas', 'Acceso a oportunidades y actividades extra'],
    B: ['Acceso a salas para ensayar (con reserva)', 'Descuentos seleccionados', 'Participación en actividades'],
    C: ['Acompañamiento para mejorar tu promedio', 'Acceso a los contenidos del programa'],
}

// Tab de Evaluaciones
function TabEvaluaciones({ academico }: { academico: any }) {
    const evs = academico?.evaluaciones || []
    if (!evs.length) return <Proximamente texto="Todavía no hay disciplinas cargadas." />
    return (
        <div className="divide-y divide-neutral-100">
            {evs.map((d: any, i: number) => (
                <div key={i} className="p-4">
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{d.disciplina}</span>
                        <span className="text-[11px] text-neutral-400">Bloque {d.bloque}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                        {d.examenes.map((e: any, j: number) => (
                            <div key={j} className="flex items-start gap-3 text-sm">
                                <span className="text-neutral-400 w-20 shrink-0">Examen {e.numero}</span>
                                {e.puntaje
                                    ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${NOTA_CLS[e.puntaje]}`}>{e.puntaje}</span>
                                    : <span className="text-[11px] text-neutral-300">sin nota</span>}
                                {e.observaciones && <span className="text-neutral-500 text-xs flex-1">{e.observaciones}</span>}
                            </div>
                        ))}
                        {d.examenes.length === 0 && <p className="text-xs text-neutral-300">Sin exámenes aún.</p>}
                    </div>
                </div>
            ))}
        </div>
    )
}

// Tab de Asistencias
function TabAsistencias({ academico }: { academico: any }) {
    const asis = academico?.asistencias || []
    if (!asis.length) return <Proximamente texto="Todavía no hay asistencia registrada." />
    return (
        <div className="divide-y divide-neutral-100">
            {asis.map((d: any, i: number) => {
                const c = COND[d.condicion] || COND.regular
                return (
                    <div key={i} className="p-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-semibold text-sm">{d.disciplina}</span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${c.cls}`}>{c.txt}</span>
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-neutral-600">
                            <span>Presentes: <b>{d.presentes}</b></span>
                            <span>Faltas: <b className={d.faltas > 0 ? 'text-red-600' : ''}>{d.faltas}</b></span>
                            {d.justificadas > 0 && <span>Justificadas: <b>{d.justificadas}</b></span>}
                        </div>
                        {d.libre_bloque_motivo && <p className="text-xs text-red-600 mt-2 bg-red-50 rounded p-2">{d.libre_bloque_motivo}</p>}
                        {d.condicion === 'libre_mes' && <p className="text-xs text-amber-700 mt-2">Quedaste libre de esta disciplina en el mes por acumular 2 faltas.</p>}
                    </div>
                )
            })}
        </div>
    )
}

// Tab de Programa
function TabPrograma({ academico }: { academico: any }) {
    const prog = academico?.programa || []
    const hayItems = prog.some((p: any) => p.items.length)
    if (!hayItems) return <Proximamente texto="El programa y los contenidos por bloque van a aparecer acá." />
    return (
        <div className="divide-y divide-neutral-100">
            {prog.map((d: any, i: number) => d.items.length > 0 && (
                <div key={i} className="p-4">
                    <span className="font-semibold text-sm">{d.disciplina}</span>
                    <div className="mt-2 space-y-2">
                        {d.items.map((it: any, j: number) => (
                            <div key={j} className={`rounded-lg p-3 ${it.bloqueado ? 'bg-neutral-100 text-neutral-400' : 'bg-neutral-50'}`}>
                                <div className="flex items-center gap-2">
                                    {it.bloqueado && <Lock size={13} />}
                                    <span className="text-sm font-medium">Bloque {it.bloque}{it.titulo ? ` · ${it.titulo}` : ''}</span>
                                </div>
                                {it.bloqueado
                                    ? <p className="text-xs mt-1">Se desbloquea al aprobar el bloque anterior.</p>
                                    : it.contenido && <p className="text-sm mt-1 whitespace-pre-line text-neutral-600">{it.contenido}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

// Tab de Beneficios
function TabBeneficios({ letra }: { letra: string }) {
    return (
        <div className="p-4 space-y-3">
            <p className="text-sm text-neutral-500">Tus beneficios dependen de tu categoría general (promedio A/B/C). Hoy estás en <b className="text-neutral-900">{letra !== '—' ? letra : 'sin categoría aún'}</b>.</p>
            {(['A', 'B', 'C'] as const).map(l => {
                const activo = letra === l
                return (
                    <div key={l} className={`rounded-xl border p-4 ${activo ? 'border-black bg-neutral-50' : 'border-neutral-200 opacity-60'}`}>
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold px-2 py-0.5 rounded ${NOTA_CLS[l]}`}>{l}</span>
                            {activo && <span className="text-[10px] font-semibold uppercase tracking-wider text-green-700">Tu categoría</span>}
                        </div>
                        <ul className="mt-2 space-y-1">
                            {BENEFICIOS[l].map((b, i) => <li key={i} className="text-sm text-neutral-600 flex gap-2"><span>·</span>{b}</li>)}
                        </ul>
                    </div>
                )
            })}
            <p className="text-[11px] text-neutral-400">Los beneficios se asignan al cierre de cada bloque. La lista final la define la dirección.</p>
        </div>
    )
}

export default function PerfilTabs({ data, academico }: { data: MiLiga27; academico?: any }) {
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
                    {tab === 'evaluaciones' && <TabEvaluaciones academico={academico} />}
                    {tab === 'asistencias' && <TabAsistencias academico={academico} />}
                    {tab === 'programa' && <TabPrograma academico={academico} />}
                    {tab === 'beneficios' && <TabBeneficios letra={letra} />}
                </div>
            </div>
        </div>
    )
}
