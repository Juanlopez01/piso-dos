'use client'

// Perfil de La Liga 2027 del alumno LOGUEADO con la cuenta normal de 2M.
// Estilo 2M (oscuro), dentro del dashboard (el sidebar ya tiene el logout).

import { useState } from 'react'
import { type MiLiga27, generarMiPagoLiga27Action, urlPagoMiLiga27Action } from '@/app/actions/liga2027'
import { GraduationCap, CalendarCheck, BookOpen, Gift, AlertTriangle, Lock, Loader2 } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { cuotasHabilitadas, CUOTAS_DESDE_LABEL } from '@/lib/liga27'

const TABS = [
    { key: 'evaluaciones', label: 'Evaluaciones', icon: GraduationCap },
    { key: 'asistencias', label: 'Asistencias', icon: CalendarCheck },
    { key: 'programa', label: 'Programa', icon: BookOpen },
    { key: 'beneficios', label: 'Beneficios', icon: Gift },
]

const ESTADO_LABEL: Record<string, { txt: string; cls: string }> = {
    postulado: { txt: 'Postulado', cls: 'bg-amber-500/20 text-amber-300' },
    aprobado: { txt: 'Al día', cls: 'bg-green-500/20 text-green-300' },
    bloqueado: { txt: 'Bloqueado', cls: 'bg-red-500/20 text-red-300' },
    baja: { txt: 'Baja', cls: 'bg-white/10 text-white/50' },
}

function Proximamente({ texto }: { texto: string }) {
    return (
        <div className="text-center py-16 text-white/40">
            <Lock size={30} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">{texto}</p>
        </div>
    )
}

const NOTA_CLS: Record<string, string> = { A: 'bg-green-500/20 text-green-300', B: 'bg-amber-500/20 text-amber-300', C: 'bg-red-500/20 text-red-300' }
const COND: Record<string, { txt: string; cls: string }> = {
    regular: { txt: 'Regular', cls: 'bg-green-500/20 text-green-300' },
    libre_mes: { txt: 'Libre del mes', cls: 'bg-amber-500/20 text-amber-300' },
    libre_bloque: { txt: 'Libre del bloque', cls: 'bg-red-500/20 text-red-300' },
}
const BENEFICIOS_FALLBACK: Record<string, string[]> = {
    A: ['Prioridad en audiciones y castings', 'Acceso a salas para ensayar', 'Descuentos y becas', 'Acceso a oportunidades y actividades extra'],
    B: ['Acceso a salas para ensayar (con reserva)', 'Descuentos seleccionados', 'Participación en actividades'],
    C: ['Acompañamiento para mejorar tu promedio', 'Acceso a los contenidos del programa'],
}

function TabEvaluaciones({ academico }: { academico: any }) {
    const evs = academico?.evaluaciones || []
    if (!evs.length) return <Proximamente texto="Todavía no hay disciplinas cargadas." />
    return (
        <div className="divide-y divide-white/5">
            {evs.map((d: any, i: number) => (
                <div key={i} className="p-4">
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{d.disciplina}</span>
                        <span className="text-[11px] text-white/30">Bloque {d.bloque}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                        {d.examenes.map((e: any, j: number) => (
                            <div key={j} className="flex items-start gap-3 text-sm">
                                <span className="text-white/40 w-20 shrink-0">Examen {e.numero}</span>
                                {e.puntaje
                                    ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${NOTA_CLS[e.puntaje]}`}>{e.puntaje}</span>
                                    : <span className="text-[11px] text-white/25">sin nota</span>}
                                {e.observaciones && <span className="text-white/60 text-xs flex-1">{e.observaciones}</span>}
                            </div>
                        ))}
                        {d.examenes.length === 0 && <p className="text-xs text-white/25">Sin exámenes aún.</p>}
                    </div>
                </div>
            ))}
        </div>
    )
}

function TabAsistencias({ academico }: { academico: any }) {
    const asis = academico?.asistencias || []
    if (!asis.length) return <Proximamente texto="Todavía no hay asistencia registrada." />
    return (
        <div className="divide-y divide-white/5">
            {asis.map((d: any, i: number) => {
                const c = COND[d.condicion] || COND.regular
                return (
                    <div key={i} className="p-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-semibold text-sm">{d.disciplina}</span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${c.cls}`}>{c.txt}</span>
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-white/60">
                            <span>Presentes: <b className="text-white">{d.presentes}</b></span>
                            <span>Faltas: <b className={d.faltas > 0 ? 'text-red-400' : 'text-white'}>{d.faltas}</b></span>
                            {d.justificadas > 0 && <span>Justificadas: <b className="text-white">{d.justificadas}</b></span>}
                        </div>
                        {d.libre_bloque_motivo && <p className="text-xs text-red-300 mt-2 bg-red-500/10 rounded p-2">{d.libre_bloque_motivo}</p>}
                        {d.condicion === 'libre_mes' && <p className="text-xs text-amber-300 mt-2">Quedaste libre de esta disciplina en el mes por acumular 2 faltas.</p>}
                    </div>
                )
            })}
        </div>
    )
}

function TabPrograma({ academico }: { academico: any }) {
    const prog = academico?.programa || []
    const hayItems = prog.some((p: any) => p.items.length)
    if (!hayItems) return <Proximamente texto="El programa y los contenidos por bloque van a aparecer acá." />
    return (
        <div className="divide-y divide-white/5">
            {prog.map((d: any, i: number) => d.items.length > 0 && (
                <div key={i} className="p-4">
                    <span className="font-semibold text-sm">{d.disciplina}</span>
                    <div className="mt-2 space-y-2">
                        {d.items.map((it: any, j: number) => (
                            <div key={j} className={`rounded-lg p-3 ${it.bloqueado ? 'bg-white/[0.03] text-white/40' : 'bg-white/5'}`}>
                                <div className="flex items-center gap-2">
                                    {it.bloqueado && <Lock size={13} />}
                                    <span className="text-sm font-medium text-white">Bloque {it.bloque}{it.titulo ? ` · ${it.titulo}` : ''}</span>
                                </div>
                                {it.bloqueado
                                    ? <p className="text-xs mt-1">Se desbloquea al aprobar el bloque anterior.</p>
                                    : it.contenido && <p className="text-sm mt-1 whitespace-pre-line text-white/60">{it.contenido}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

function TabBeneficios({ letra, beneficios }: { letra: string; beneficios?: { letra: string; items: string[]; nota: string | null }[] }) {
    const byLetra: Record<string, { items: string[]; nota: string | null }> = {}
    for (const b of (beneficios || [])) byLetra[b.letra] = { items: b.items, nota: b.nota }
    return (
        <div className="p-4 space-y-3">
            <p className="text-sm text-white/50">Tus beneficios dependen de tu categoría general (promedio A/B/C). Hoy estás en <b className="text-white">{letra !== '—' ? letra : 'sin categoría aún'}</b>.</p>
            {(['A', 'B', 'C'] as const).map(l => {
                const activo = letra === l
                const items = byLetra[l]?.items?.length ? byLetra[l].items : BENEFICIOS_FALLBACK[l]
                const nota = byLetra[l]?.nota
                return (
                    <div key={l} className={`rounded-xl border p-4 ${activo ? 'border-[#D4E655]/50 bg-[#D4E655]/5' : 'border-white/10 opacity-50'}`}>
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold px-2 py-0.5 rounded ${NOTA_CLS[l]}`}>{l}</span>
                            {activo && <span className="text-[10px] font-semibold uppercase tracking-wider text-[#D4E655]">Tu categoría</span>}
                        </div>
                        <ul className="mt-2 space-y-1">
                            {items.map((b, i) => <li key={i} className="text-sm text-white/60 flex gap-2"><span className="text-white/30">·</span>{b}</li>)}
                        </ul>
                        {nota && <p className="text-[11px] text-white/30 mt-2">{nota}</p>}
                    </div>
                )
            })}
            <p className="text-[11px] text-white/30">Los beneficios se asignan al cierre de cada bloque. La lista final la define la dirección.</p>
        </div>
    )
}

export default function MiLigaPerfil({ data, academico }: { data: MiLiga27; academico?: any }) {
    const [tab, setTab] = useState('evaluaciones')
    const [pagando, setPagando] = useState<string | null>(null)
    const { perfil, inscripcion, pagos, bloqueado } = data
    const letra = inscripcion?.letra_actual || inscripcion?.promedio_letra || '—'
    const estado = inscripcion?.estado || 'postulado'
    const estInfo = ESTADO_LABEL[estado] || ESTADO_LABEL.postulado

    // Mes/año actual (AR) para el botón de cuota.
    const [mesAhora] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', month: '2-digit' }).format(new Date()).split('-').map(Number)
    // Las cuotas recién se pagan a partir de enero 2027.
    const hayCuotas = cuotasHabilitadas()

    const irAPagar = async (key: string, run: () => Promise<{ ok: boolean; error?: string; url?: string }>) => {
        setPagando(key)
        const r = await run()
        if (r.ok && r.url) { window.location.href = r.url; return }
        toast.error(r.error || 'No se pudo iniciar el pago.')
        setPagando(null)
    }

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            <Toaster position="top-center" richColors theme="dark" />
            <div className="max-w-3xl mx-auto px-5 py-8">
                <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#D4E655] mb-5">🏆 La Liga 2027</p>

                {/* Cabecera del perfil */}
                <div className="flex items-center gap-4">
                    {perfil.foto_url
                        ? <img src={perfil.foto_url} alt="" className="w-20 h-20 rounded-full object-cover" />
                        : <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-2xl font-black text-white/40">{(perfil.nombre || '?')[0]}</div>}
                    <div className="flex-1">
                        <h1 className="text-2xl font-black uppercase tracking-tight">{perfil.nombre} {perfil.apellido || ''}</h1>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${estInfo.cls}`}>{estInfo.txt}</span>
                            <span className="text-xs text-white/50">Categoría general: <b className="text-white">{letra}</b></span>
                        </div>
                    </div>
                </div>

                {/* Cartel de bloqueo por mora */}
                {bloqueado && (
                    <div className="mt-6 flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-red-300">Tu perfil está bloqueado</p>
                            <p className="text-xs text-red-300/80 mt-1">{inscripcion?.bloqueado_motivo || 'Hay un pago pendiente.'} Comunicate con el área administrativa para regularizarlo.</p>
                        </div>
                    </div>
                )}

                {/* Estado de pago */}
                <div className="mt-6 bg-[#111113] border border-white/10 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-black uppercase tracking-wider text-white/50">Estado de pago</h2>
                        <span className="text-xs text-white/60">Matrícula: <b className={inscripcion?.matricula_pagada ? 'text-green-400' : 'text-amber-400'}>{inscripcion?.matricula_pagada ? 'Pagada' : 'Pendiente'}</b></span>
                    </div>

                    {/* Botones de autopago (el alumno paga su matrícula / cuota por MP) */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {!inscripcion?.matricula_pagada && (
                            <button onClick={() => irAPagar('matricula', () => generarMiPagoLiga27Action({ concepto: 'matricula' }))}
                                disabled={!!pagando}
                                className="bg-[#009ee3] hover:brightness-110 text-white font-semibold uppercase tracking-[0.12em] text-[11px] px-4 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2 transition">
                                {pagando === 'matricula' ? <Loader2 size={13} className="animate-spin" /> : null} Pagar matrícula
                            </button>
                        )}
                        {hayCuotas && (
                            <button onClick={() => irAPagar('cuota', () => generarMiPagoLiga27Action({ concepto: 'cuota' }))}
                                disabled={!!pagando}
                                className="bg-[#009ee3]/80 hover:brightness-110 text-white font-semibold uppercase tracking-[0.12em] text-[11px] px-4 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2 transition">
                                {pagando === 'cuota' ? <Loader2 size={13} className="animate-spin" /> : null} Pagar cuota {String(mesAhora).padStart(2, '0')}
                            </button>
                        )}
                    </div>
                    {!hayCuotas && <p className="text-[11px] text-white/35 mb-4 -mt-2">Las cuotas se empiezan a pagar a partir de {CUOTAS_DESDE_LABEL}.</p>}

                    {pagos.length === 0
                        ? <p className="text-sm text-white/30">Todavía no hay pagos registrados.</p>
                        : (
                            <div className="divide-y divide-white/5">
                                {pagos.map(p => (
                                    <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                                        <span className="capitalize text-white/80">{p.concepto}{p.mes ? ` · ${p.mes}/${p.anio}` : ''}</span>
                                        <span className="flex items-center gap-3">
                                            <span className="text-white/50">${Number(p.monto).toLocaleString('es-AR')}</span>
                                            {p.estado === 'pendiente'
                                                ? (p.concepto === 'cuota' && !hayCuotas)
                                                    ? <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-white/10 text-white/50">Desde {CUOTAS_DESDE_LABEL}</span>
                                                    : <button onClick={() => irAPagar('row-' + p.id, () => urlPagoMiLiga27Action(p.id))} disabled={!!pagando}
                                                        className="bg-[#009ee3] hover:brightness-110 text-white font-semibold uppercase tracking-wider text-[10px] px-3 py-1 rounded disabled:opacity-50 flex items-center gap-1.5 transition">
                                                        {pagando === 'row-' + p.id ? <Loader2 size={11} className="animate-spin" /> : null} Pagar
                                                    </button>
                                                : <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${p.estado === 'pagado' ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50'}`}>{p.estado}</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                </div>

                {/* Tabs */}
                <div className="mt-8 flex gap-1 border-b border-white/10 overflow-x-auto">
                    {TABS.map(t => {
                        const Icon = t.icon
                        const active = tab === t.key
                        return (
                            <button key={t.key} onClick={() => setTab(t.key)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${active ? 'border-[#D4E655] text-white font-semibold' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                                <Icon size={15} /> {t.label}
                            </button>
                        )
                    })}
                </div>

                <div className="bg-[#111113] border border-white/10 border-t-0 rounded-b-xl">
                    {tab === 'evaluaciones' && <TabEvaluaciones academico={academico} />}
                    {tab === 'asistencias' && <TabAsistencias academico={academico} />}
                    {tab === 'programa' && <TabPrograma academico={academico} />}
                    {tab === 'beneficios' && <TabBeneficios letra={letra} beneficios={academico?.beneficios} />}
                </div>
            </div>
        </div>
    )
}
