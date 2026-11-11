'use client'

import { useEffect, useState } from 'react'
import { toast, Toaster } from 'sonner'
import {
    listPostulacionesLiga27Action, aprobarPostulacionLiga27Action, rechazarPostulacionLiga27Action,
    enviarMensajePostulacionLiga27Action, getInscripcionesLiga27Action, enviarBienvenidaLiga27Action,
    generarLinkPagoLiga27Action, registrarPagoLiga27Action, getLanzamientosAdminAction,
    guardarLanzamientoAction, getPreciosLiga27Action, guardarPreciosLiga27Action,
} from '@/app/actions/liga2027'
import {
    getDisciplinasLiga27Action, getDocentesLiga27Action, guardarDisciplinaLiga27Action,
    getExamenesDisciplinaLiga27Action, guardarExamenLiga27Action,
    getProgramaDisciplinaLiga27Action, guardarProgramaLiga27Action,
    getLibresLiga27Action, resolverLibreLiga27Action,
    getBeneficiosLiga27Action, guardarBeneficiosLiga27Action,
} from '@/app/actions/liga2027-academico'
import { AsistenciaEditor, ClaseEditor, NotasEditor } from './editores'
import { Loader2, Check, X, MessageSquare, Link2, Send, Plus } from 'lucide-react'
import { cuotasHabilitadas, CUOTAS_DESDE_LABEL } from '@/lib/liga27'

const card = "bg-[#111113] border border-white/10 rounded-xl p-5"
const btn = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
const input = "bg-[#1a1a1d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#D4E655]/50 w-full"
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function PanelLiga27({ puedePagos, esStaffGestion }: { puedePagos: boolean; esStaffGestion?: boolean }) {
    const tabs = [
        'Postulaciones', 'Inscripciones',
        ...(esStaffGestion ? ['Académico', 'Libres'] : []),
        'Lanzamiento',
        ...(puedePagos ? ['Precios', 'Beneficios'] : []),
    ]
    const [tab, setTab] = useState('Postulaciones')

    return (
        <div className="p-4 md:p-8 text-white">
            <Toaster position="top-center" richColors theme="dark" />
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black tracking-tight">La Liga <span className="text-[#D4E655]">2027</span></h1>
                    <p className="text-white/40 text-sm">Inscripción y pagos del programa.</p>
                </div>
            </div>

            <div className="flex gap-1 border-b border-white/10 mb-6 overflow-x-auto">
                {tabs.map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#D4E655] text-white font-semibold' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                        {t}
                    </button>
                ))}
            </div>

            {tab === 'Postulaciones' && <Postulaciones />}
            {tab === 'Inscripciones' && <Inscripciones puedePagos={puedePagos} />}
            {tab === 'Académico' && esStaffGestion && <Academico />}
            {tab === 'Libres' && esStaffGestion && <Libres puedePagos={puedePagos} />}
            {tab === 'Lanzamiento' && <Lanzamiento />}
            {tab === 'Precios' && puedePagos && <Precios />}
            {tab === 'Beneficios' && puedePagos && <Beneficios />}
        </div>
    )
}

// ── Beneficios por categoría A/B/C (Fase 3) ───────────────────────────────────
function Beneficios() {
    const [data, setData] = useState<{ letra: string; items: string[]; nota: string | null }[] | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    useEffect(() => { getBeneficiosLiga27Action().then(setData) }, [])

    const guardar = async (letra: string, texto: string, nota: string) => {
        setBusy(letra)
        const items = texto.split('\n').map(s => s.trim()).filter(Boolean)
        const r = await guardarBeneficiosLiga27Action({ letra: letra as 'A' | 'B' | 'C', items, nota })
        if (r.ok) { toast.success(`Beneficios de ${letra} guardados.`); setData(await getBeneficiosLiga27Action()) } else toast.error(r.error || 'Error')
        setBusy(null)
    }
    if (!data) return <Loader2 className="animate-spin text-white/40" />
    const COLOR: Record<string, string> = { A: 'text-green-400', B: 'text-amber-400', C: 'text-red-400' }
    return (
        <div className="space-y-4">
            <p className="text-sm text-white/60">Lo que ve el alumno en su pestaña <b>Beneficios</b> según la letra de su promedio general. Un beneficio por línea. Se asignan al cierre de cada bloque.</p>
            <div className="grid md:grid-cols-3 gap-4">
                {data.map(b => (
                    <div key={b.letra} className={`${card} space-y-3`}>
                        <h3 className={`font-black text-lg ${COLOR[b.letra]}`}>Categoría {b.letra}</h3>
                        <div><label className="text-xs text-white/50">Beneficios (uno por línea)</label>
                            <textarea defaultValue={b.items.join('\n')} id={`ben-${b.letra}`} className={input} rows={6} /></div>
                        <div><label className="text-xs text-white/50">Nota (opcional)</label>
                            <input defaultValue={b.nota || ''} id={`bennota-${b.letra}`} className={input} /></div>
                        <button onClick={() => guardar(b.letra,
                            (document.getElementById(`ben-${b.letra}`) as HTMLTextAreaElement)?.value || '',
                            (document.getElementById(`bennota-${b.letra}`) as HTMLInputElement)?.value || '',
                        )} disabled={busy === b.letra} className={`${btn} bg-[#D4E655] text-black`}>{busy === b.letra ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}</button>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Académico (disciplinas + docentes + exámenes + programa + cargas) ─────────
function Academico() {
    const [discs, setDiscs] = useState<any[]>([])
    const [docentes, setDocentes] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const [edit, setEdit] = useState<any | null>(null)
    const [sel, setSel] = useState<string>('')
    const [sub, setSub] = useState<'examenes' | 'programa' | 'asistencia' | 'clase' | 'notas'>('examenes')
    const [busy, setBusy] = useState(false)

    const cargar = async () => { setCargando(true); const [d, dc] = await Promise.all([getDisciplinasLiga27Action(), getDocentesLiga27Action()]); setDiscs(d); setDocentes(dc); setCargando(false) }
    useEffect(() => { cargar() }, [])

    const guardar = async () => {
        if (!edit?.nombre?.trim()) return toast.error('Poné un nombre.')
        setBusy(true)
        const r = await guardarDisciplinaLiga27Action({ id: edit.id, nombre: edit.nombre, bloque: Number(edit.bloque) || 1, docente_id: edit.docente_id || null, orden: Number(edit.orden) || 0, activa: edit.activa ?? true })
        if (r.ok) { toast.success('Guardado.'); setEdit(null); cargar() } else toast.error(r.error || 'Error')
        setBusy(false)
    }

    if (cargando) return <Loader2 className="animate-spin text-white/40" />
    return (
        <div className="grid md:grid-cols-[320px_1fr] gap-5">
            <div className="space-y-3">
                {!edit && <button onClick={() => setEdit({ nombre: '', bloque: 1, orden: discs.length, activa: true })} className={`${btn} bg-[#D4E655] text-black flex items-center gap-1`}><Plus size={14} /> Nueva disciplina</button>}
                {edit && (
                    <div className={`${card} space-y-3`}>
                        <h3 className="font-semibold text-sm">{edit.id ? 'Editar' : 'Nueva'} disciplina</h3>
                        <div><label className="text-xs text-white/50">Nombre</label><input value={edit.nombre || ''} onChange={e => setEdit({ ...edit, nombre: e.target.value })} className={input} /></div>
                        <div className="grid grid-cols-2 gap-2">
                            <div><label className="text-xs text-white/50">Bloque</label><select value={edit.bloque ?? 1} onChange={e => setEdit({ ...edit, bloque: Number(e.target.value) })} className={input}><option value={1}>1</option><option value={2}>2</option></select></div>
                            <div><label className="text-xs text-white/50">Orden</label><input type="number" value={edit.orden ?? 0} onChange={e => setEdit({ ...edit, orden: e.target.value })} className={input} /></div>
                        </div>
                        <div><label className="text-xs text-white/50">Docente</label>
                            <select value={edit.docente_id || ''} onChange={e => setEdit({ ...edit, docente_id: e.target.value || null })} className={input}>
                                <option value="">— Sin asignar —</option>
                                {docentes.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                            </select></div>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.activa ?? true} onChange={e => setEdit({ ...edit, activa: e.target.checked })} /> Activa</label>
                        <div className="flex gap-2"><button onClick={guardar} disabled={busy} className={`${btn} bg-[#D4E655] text-black`}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}</button><button onClick={() => setEdit(null)} className={`${btn} bg-white/5 text-white/60`}>Cancelar</button></div>
                    </div>
                )}
                <div className="space-y-1.5">
                    {discs.map(d => (
                        <div key={d.id} className={`rounded-lg px-3 py-2 cursor-pointer ${sel === d.id ? 'bg-[#D4E655]/15 border border-[#D4E655]/30' : 'bg-white/5 hover:bg-white/10'}`} onClick={() => setSel(d.id)}>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{d.nombre}</span>
                                <button onClick={e => { e.stopPropagation(); setEdit(d) }} className="text-[11px] text-white/40 hover:text-white">editar</button>
                            </div>
                            <p className="text-[11px] text-white/40">Bloque {d.bloque} · {d.docente_nombre || 'sin docente'}{d.activa ? '' : ' · inactiva'}</p>
                        </div>
                    ))}
                    {discs.length === 0 && <p className="text-white/40 text-sm">No hay disciplinas. Creá la primera.</p>}
                </div>
            </div>

            <div>
                {!sel ? <p className="text-white/40 text-sm">Elegí una disciplina para ver exámenes, programa y cargar asistencia/notas.</p> : (
                    <>
                        <div className="flex gap-1 border-b border-white/10 mb-5 overflow-x-auto">
                            {([['examenes', 'Exámenes'], ['programa', 'Programa'], ['asistencia', 'Asistencia'], ['clase', 'Clase'], ['notas', 'Notas']] as const).map(([k, l]) => (
                                <button key={k} onClick={() => setSub(k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${sub === k ? 'border-[#D4E655] text-white font-semibold' : 'border-transparent text-white/40 hover:text-white/70'}`}>{l}</button>
                            ))}
                        </div>
                        {sub === 'examenes' && <Examenes disciplinaId={sel} key={sel + 'e'} />}
                        {sub === 'programa' && <Programa disciplinaId={sel} key={sel + 'p'} />}
                        {sub === 'asistencia' && <AsistenciaEditor disciplinaId={sel} key={sel + 'a'} />}
                        {sub === 'clase' && <ClaseEditor disciplinaId={sel} key={sel + 'c'} />}
                        {sub === 'notas' && <NotasEditor disciplinaId={sel} key={sel + 'n'} />}
                    </>
                )}
            </div>
        </div>
    )
}

function Examenes({ disciplinaId }: { disciplinaId: string }) {
    const [exs, setExs] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const cargar = async () => { setCargando(true); setExs(await getExamenesDisciplinaLiga27Action(disciplinaId)); setCargando(false) }
    useEffect(() => { cargar() }, [disciplinaId])
    const guardar = async (numero: 1 | 2, fecha: string, libera: boolean) => {
        const r = await guardarExamenLiga27Action({ disciplina_id: disciplinaId, numero, fecha: fecha || null, libera_bloque: libera })
        if (r.ok) { toast.success('Examen guardado.'); cargar() } else toast.error(r.error || 'Error')
    }
    if (cargando) return <Loader2 className="animate-spin text-white/40" />
    return (
        <div className="space-y-3">
            {[1, 2].map(n => {
                const e = exs.find(x => x.numero === n)
                return (
                    <div key={n} className={`${card} flex items-center gap-3 flex-wrap`}>
                        <span className="text-sm font-semibold w-24">Examen {n}</span>
                        <input type="date" defaultValue={e?.fecha || ''} id={`ex-${disciplinaId}-${n}`} className={`${input} w-auto`} />
                        <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" defaultChecked={!!e?.libera_bloque} id={`lib-${disciplinaId}-${n}`} /> Libera el bloque 2</label>
                        <button onClick={() => {
                            const f = (document.getElementById(`ex-${disciplinaId}-${n}`) as HTMLInputElement)?.value
                            const l = (document.getElementById(`lib-${disciplinaId}-${n}`) as HTMLInputElement)?.checked
                            guardar(n as 1 | 2, f, l)
                        }} className={`${btn} bg-[#D4E655] text-black`}>{e ? 'Actualizar' : 'Crear'}</button>
                    </div>
                )
            })}
        </div>
    )
}

function Programa({ disciplinaId }: { disciplinaId: string }) {
    const [items, setItems] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const [edit, setEdit] = useState<any | null>(null)
    const cargar = async () => { setCargando(true); setItems(await getProgramaDisciplinaLiga27Action(disciplinaId)); setCargando(false) }
    useEffect(() => { cargar() }, [disciplinaId])
    const guardar = async () => {
        const r = await guardarProgramaLiga27Action({ id: edit.id, disciplina_id: disciplinaId, bloque: Number(edit.bloque) || 1, titulo: edit.titulo, contenido: edit.contenido, bloqueado: !!edit.bloqueado, orden: Number(edit.orden) || 0 })
        if (r.ok) { toast.success('Guardado.'); setEdit(null); cargar() } else toast.error(r.error || 'Error')
    }
    if (cargando) return <Loader2 className="animate-spin text-white/40" />
    return (
        <div className="space-y-3">
            {!edit && <button onClick={() => setEdit({ bloque: 1, orden: items.length })} className={`${btn} bg-[#D4E655] text-black flex items-center gap-1`}><Plus size={14} /> Agregar ítem al programa</button>}
            {edit && (
                <div className={`${card} space-y-3`}>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-xs text-white/50">Bloque</label><select value={edit.bloque ?? 1} onChange={e => setEdit({ ...edit, bloque: Number(e.target.value) })} className={input}><option value={1}>1</option><option value={2}>2</option></select></div>
                        <div><label className="text-xs text-white/50">Orden</label><input type="number" value={edit.orden ?? 0} onChange={e => setEdit({ ...edit, orden: e.target.value })} className={input} /></div>
                    </div>
                    <div><label className="text-xs text-white/50">Título</label><input value={edit.titulo || ''} onChange={e => setEdit({ ...edit, titulo: e.target.value })} className={input} /></div>
                    <div><label className="text-xs text-white/50">Contenido</label><textarea value={edit.contenido || ''} onChange={e => setEdit({ ...edit, contenido: e.target.value })} className={input} rows={4} /></div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.bloqueado} onChange={e => setEdit({ ...edit, bloqueado: e.target.checked })} /> Bloqueado (gris para el alumno hasta liberar)</label>
                    <div className="flex gap-2"><button onClick={guardar} className={`${btn} bg-[#D4E655] text-black`}>Guardar</button><button onClick={() => setEdit(null)} className={`${btn} bg-white/5 text-white/60`}>Cancelar</button></div>
                </div>
            )}
            {items.map(it => (
                <div key={it.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-sm">Bloque {it.bloque}{it.titulo ? ` · ${it.titulo}` : ''} {it.bloqueado && <span className="text-[11px] text-white/40">(bloqueado)</span>}</span>
                    <button onClick={() => setEdit(it)} className="text-[11px] text-white/40 hover:text-white">editar</button>
                </div>
            ))}
        </div>
    )
}

// ── Libres (régimen de regularidad) ───────────────────────────────────────────
function Libres({ puedePagos }: { puedePagos: boolean }) {
    const [items, setItems] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)
    const cargar = async () => { setCargando(true); setItems(await getLibresLiga27Action()); setCargando(false) }
    useEffect(() => { cargar() }, [])

    const resolver = async (id: string) => {
        setBusy(id); const r = await resolverLibreLiga27Action(id)
        if (r.ok) { toast.success('Marcado como resuelto.'); cargar() } else toast.error(r.error || 'Error'); setBusy(null)
    }
    const linkExamenLibre = async (inscripcionId: string) => {
        setBusy(inscripcionId)
        const r = await generarLinkPagoLiga27Action({ inscripcionId, concepto: 'examen_libre' })
        if (r.ok && r.url) { try { await navigator.clipboard.writeText(r.url) } catch { }; toast.success('Link de matrícula (examen libre) copiado.', { description: r.url, duration: 8000 }) }
        else toast.error(r.error || 'Error')
        setBusy(null)
    }

    if (cargando) return <Loader2 className="animate-spin text-white/40" />
    if (!items.length) return <p className="text-white/40 text-sm">No hay alumnos libres. El sistema los detecta solo al cargar asistencia.</p>
    return (
        <div className="space-y-2">
            {items.map(l => (
                <div key={l.id} className={`${card} flex items-start justify-between gap-3 flex-wrap ${l.tipo === 'bloque' ? 'border-red-500/30' : ''}`}>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{l.alumno}</span>
                            <span className="text-white/50 text-sm">· {l.disciplina}</span>
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${l.tipo === 'bloque' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>{l.tipo === 'bloque' ? 'Libre del bloque' : `Libre del mes ${l.mes}/${l.anio}`}</span>
                            {l.resuelto && <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-300">Resuelto</span>}
                        </div>
                        <p className="text-xs text-white/50 mt-1">{l.motivo} · {l.faltas} faltas</p>
                    </div>
                    {l.tipo === 'bloque' && !l.resuelto && (
                        <div className="flex gap-2">
                            {puedePagos && <button onClick={() => linkExamenLibre(l.inscripcion_id)} disabled={busy === l.inscripcion_id} className={`${btn} bg-[#009ee3]/80 hover:bg-[#009ee3] text-white flex items-center gap-1`}><Link2 size={13} /> Link examen libre</button>}
                            {puedePagos && <button onClick={() => resolver(l.id)} disabled={busy === l.id} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70`}>Marcar resuelto</button>}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

// ── Postulaciones ─────────────────────────────────────────────────────────────
function Postulaciones() {
    const [items, setItems] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const [filtro, setFiltro] = useState('pendiente')
    const [msgPara, setMsgPara] = useState<string | null>(null)
    const [msgTexto, setMsgTexto] = useState('')
    const [busy, setBusy] = useState<string | null>(null)

    const cargar = async () => { setCargando(true); setItems(await listPostulacionesLiga27Action(filtro || undefined)); setCargando(false) }
    useEffect(() => { cargar() }, [filtro])

    const aprobar = async (id: string, plan?: 'mensual' | 'cuatrimestral') => {
        setBusy(id)
        const r = await aprobarPostulacionLiga27Action(id, plan)
        if (r.ok) { toast.success('Aprobada. Se creó la inscripción.'); cargar() } else toast.error(r.error || 'Error')
        setBusy(null)
    }
    const rechazar = async (id: string) => {
        setBusy(id)
        const r = await rechazarPostulacionLiga27Action(id)
        if (r.ok) { toast.success('Marcada como no aprobada.'); cargar() } else toast.error(r.error || 'Error')
        setBusy(null)
    }
    const enviarMsg = async (id: string) => {
        if (!msgTexto.trim()) return toast.error('Escribí un mensaje.')
        setBusy(id)
        const r = await enviarMensajePostulacionLiga27Action(id, msgTexto)
        if (r.ok) { toast.success('Mensaje enviado.'); setMsgPara(null); setMsgTexto('') } else toast.error(r.error || 'Error')
        setBusy(null)
    }
    // Normaliza un teléfono AR a formato wa.me (solo dígitos, con prefijo 54 9).
    const telWa = (tel?: string | null) => {
        let d = (tel || '').replace(/\D/g, '')
        if (!d) return ''
        if (d.startsWith('54')) d = d.slice(2)
        if (d.startsWith('0')) d = d.slice(1)
        if (d.startsWith('9')) d = d.slice(1)
        d = d.replace(/^(\d{2,4})15/, '$1')
        return '549' + d
    }
    // Abre WhatsApp con el postulante, con un mensaje según su estado.
    const whatsappPostulante = (p: any) => {
        const tel = telWa(p.telefono)
        if (!tel) return toast.error('El postulante no tiene teléfono cargado.')
        const nombre = (p.nombre || '').split(' ')[0] || ''
        const msg = p.estado === 'aprobada'
            ? `¡Hola${nombre ? ' ' + nombre : ''}! Buenas noticias: quedaste en La Liga 2027 de Piso 2 🎉 Te cuento cómo seguir 👇`
            : `¡Hola${nombre ? ' ' + nombre : ''}! Te escribimos de Piso 2 por tu postulación a La Liga 2027.`
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    const CONTACTO: Record<string, string> = { llamar: '📞 Que lo llamen', escribir: '✍️ Que le escriban', anotarse: '✅ Anotarse directo' }

    return (
        <div>
            <div className="flex gap-2 mb-4">
                {[['pendiente', 'Pendientes'], ['aprobada', 'Aprobadas'], ['no', 'No aprobadas'], ['', 'Todas']].map(([v, l]) => (
                    <button key={v} onClick={() => setFiltro(v)} className={`${btn} ${filtro === v ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>{l}</button>
                ))}
            </div>
            {cargando ? <Loader2 className="animate-spin text-white/40" /> : items.length === 0 ? <p className="text-white/40 text-sm">No hay postulaciones.</p> : (
                <div className="space-y-3">
                    {items.map(p => (
                        <div key={p.id} className={card}>
                            <div className="flex items-start gap-4">
                                {p.foto_url ? <img src={p.foto_url} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center text-white/30 text-xl">{(p.nombre || '?')[0]}</div>}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold">{p.nombre}</h3>
                                        <span className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/70">{CONTACTO[p.tipo_contacto] || p.tipo_contacto}</span>
                                        {p.estado !== 'pendiente' && <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-white/40 capitalize">{p.estado}</span>}
                                    </div>
                                    <p className="text-xs text-white/50 mt-1">{p.email}{p.telefono ? ` · ${p.telefono}` : ''}{p.instagram ? ` · ${p.instagram}` : ''}{p.ciudad ? ` · ${p.ciudad}` : ''}</p>
                                    {p.nota && <p className="text-sm text-white/70 mt-2 bg-white/5 rounded-lg p-2">{p.nota}</p>}

                                    {p.estado === 'pendiente' && (
                                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                                            <button onClick={() => aprobar(p.id, 'mensual')} disabled={busy === p.id} className={`${btn} bg-green-600/80 hover:bg-green-600 text-white flex items-center gap-1`}><Check size={13} /> Aprobar (mensual)</button>
                                            <button onClick={() => aprobar(p.id, 'cuatrimestral')} disabled={busy === p.id} className={`${btn} bg-green-700/70 hover:bg-green-700 text-white flex items-center gap-1`}><Check size={13} /> Aprobar (cuatrimestral)</button>
                                            <button onClick={() => rechazar(p.id)} disabled={busy === p.id} className={`${btn} bg-white/5 hover:bg-red-600/30 text-white/70 flex items-center gap-1`}><X size={13} /> No aprobar</button>
                                            {p.telefono && <button onClick={() => whatsappPostulante(p)} className={`${btn} bg-[#25D366]/90 hover:bg-[#25D366] text-black font-bold flex items-center gap-1`}><MessageSquare size={13} /> WhatsApp</button>}
                                            <button onClick={() => setMsgPara(msgPara === p.id ? null : p.id)} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70 flex items-center gap-1`}><MessageSquare size={13} /> Mensaje interno</button>
                                        </div>
                                    )}
                                    {p.estado !== 'pendiente' && p.telefono && (
                                        <div className="mt-3">
                                            <button onClick={() => whatsappPostulante(p)} className={`${btn} bg-[#25D366]/90 hover:bg-[#25D366] text-black font-bold flex items-center gap-1`}><MessageSquare size={13} /> WhatsApp</button>
                                        </div>
                                    )}
                                    {msgPara === p.id && (
                                        <div className="mt-3 flex gap-2">
                                            <input value={msgTexto} onChange={e => setMsgTexto(e.target.value)} className={input} placeholder="Escribí un mensaje al postulante…" />
                                            <button onClick={() => enviarMsg(p.id)} disabled={busy === p.id} className={`${btn} bg-[#D4E655] text-black flex items-center gap-1 shrink-0`}><Send size={13} /> Enviar</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Inscripciones ─────────────────────────────────────────────────────────────
function Inscripciones({ puedePagos }: { puedePagos: boolean }) {
    const [items, setItems] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)
    const hoy = new Date()
    const hayCuotas = cuotasHabilitadas() // cuotas recién desde enero 2027

    const cargar = async () => { setCargando(true); setItems(await getInscripcionesLiga27Action()); setCargando(false) }
    useEffect(() => { cargar() }, [])

    const bienvenida = async (id: string) => {
        setBusy(id); const r = await enviarBienvenidaLiga27Action(id)
        if (r.ok) { toast.success('Bienvenida enviada.'); cargar() } else toast.error(r.error || 'Error'); setBusy(null)
    }
    const linkPago = async (insId: string, concepto: 'matricula' | 'cuota') => {
        setBusy(insId)
        const r = await generarLinkPagoLiga27Action(concepto === 'cuota'
            ? { inscripcionId: insId, concepto, mes: hoy.getMonth() + 1, anio: hoy.getFullYear() }
            : { inscripcionId: insId, concepto })
        if (r.ok && r.url) {
            try { await navigator.clipboard.writeText(r.url) } catch { }
            toast.success('Link copiado. Pegalo en WhatsApp/mail.', { description: r.url, duration: 8000 })
        } else toast.error(r.error || 'Error')
        setBusy(null)
    }
    // Normaliza un teléfono AR a formato wa.me (solo dígitos, con prefijo 54 9).
    const telWa = (tel?: string | null) => {
        let d = (tel || '').replace(/\D/g, '')
        if (!d) return ''
        if (d.startsWith('54')) d = d.slice(2)
        if (d.startsWith('0')) d = d.slice(1)
        if (d.startsWith('9')) d = d.slice(1)
        // quitar el "15" de celular si quedó al inicio del número local
        d = d.replace(/^(\d{2,4})15/, '$1')
        return '549' + d
    }
    // Genera el link de pago y abre WhatsApp con el mensaje ya armado.
    const whatsappPago = async (i: any, concepto: 'matricula' | 'cuota') => {
        setBusy(i.id)
        const r = await generarLinkPagoLiga27Action(concepto === 'cuota'
            ? { inscripcionId: i.id, concepto, mes: hoy.getMonth() + 1, anio: hoy.getFullYear() }
            : { inscripcionId: i.id, concepto })
        setBusy(null)
        if (!r.ok || !r.url) return toast.error(r.error || 'No se pudo generar el link.')
        const nombre = (i.perfil?.nombre || '').split(' ')[0] || ''
        const quePaga = concepto === 'cuota' ? `la cuota de ${MESES[hoy.getMonth() + 1]}` : 'la matrícula'
        const msg = `Hola${nombre ? ' ' + nombre : ''}! Te paso el link para pagar ${quePaga} de La Liga 2027 (Piso 2): ${r.url}`
        const tel = telWa(i.perfil?.telefono)
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank')
    }
    const pagoManual = async (insId: string, concepto: 'matricula' | 'cuota') => {
        const montoStr = window.prompt(`Monto del pago (${concepto}) en efectivo/transferencia:`)
        if (!montoStr) return
        const monto = Number(montoStr.replace(/[^\d]/g, ''))
        if (!monto) return toast.error('Monto inválido.')
        const metodo = window.prompt('Método (efectivo / transferencia / tarjeta):', 'efectivo') || 'efectivo'
        setBusy(insId)
        const r = await registrarPagoLiga27Action(concepto === 'cuota'
            ? { inscripcionId: insId, concepto, mes: hoy.getMonth() + 1, anio: hoy.getFullYear(), monto, metodo }
            : { inscripcionId: insId, concepto, monto, metodo })
        if (r.ok) { toast.success('Pago registrado.'); cargar() } else toast.error(r.error || 'Error'); setBusy(null)
    }

    const EST: Record<string, string> = { postulado: 'bg-amber-500/20 text-amber-300', aprobado: 'bg-green-500/20 text-green-300', bloqueado: 'bg-red-500/20 text-red-300', baja: 'bg-white/10 text-white/40' }

    if (cargando) return <Loader2 className="animate-spin text-white/40" />
    if (!items.length) return <p className="text-white/40 text-sm">Todavía no hay inscripciones. Aprobá postulaciones para crearlas.</p>
    return (
        <div className="space-y-3">
            {items.map(i => (
                <div key={i.id} className={card}>
                    <div className="flex items-start gap-4 flex-wrap">
                        {i.perfil?.foto_url ? <img src={i.perfil.foto_url} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-white/30">{(i.perfil?.nombre || '?')[0]}</div>}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold">{i.perfil?.nombre} {i.perfil?.apellido || ''}</h3>
                                <span className={`text-[11px] px-2 py-0.5 rounded capitalize ${EST[i.estado] || 'bg-white/10'}`}>{i.estado}</span>
                                {i.plan && <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-white/50">{i.plan}</span>}
                                <span className={`text-[11px] px-2 py-0.5 rounded ${i.matricula_pagada ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}`}>Matrícula {i.matricula_pagada ? 'OK' : 'pend.'}</span>
                            </div>
                            <p className="text-xs text-white/50 mt-1">{i.perfil?.email}{i.perfil?.telefono ? ` · ${i.perfil.telefono}` : ''}</p>
                            {i.bloqueado_motivo && <p className="text-xs text-red-300 mt-1">⚠ {i.bloqueado_motivo}</p>}
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                                {!i.bienvenida_enviada && <button onClick={() => bienvenida(i.id)} disabled={busy === i.id} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70`}>Enviar bienvenida</button>}
                                {puedePagos && <>
                                    <button onClick={() => whatsappPago(i, 'matricula')} disabled={busy === i.id} className={`${btn} bg-[#25D366]/90 hover:bg-[#25D366] text-black font-bold flex items-center gap-1`}><MessageSquare size={13} /> WhatsApp matrícula</button>
                                    <button onClick={() => linkPago(i.id, 'matricula')} disabled={busy === i.id} className={`${btn} bg-[#009ee3]/80 hover:bg-[#009ee3] text-white flex items-center gap-1`}><Link2 size={13} /> Copiar link matrícula</button>
                                    <button onClick={() => pagoManual(i.id, 'matricula')} disabled={busy === i.id} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70`}>+ Pago matrícula</button>
                                    {hayCuotas ? <>
                                        <button onClick={() => whatsappPago(i, 'cuota')} disabled={busy === i.id} className={`${btn} bg-[#25D366]/70 hover:bg-[#25D366] text-black font-bold flex items-center gap-1`}><MessageSquare size={13} /> WhatsApp cuota {MESES[hoy.getMonth() + 1]}</button>
                                        <button onClick={() => linkPago(i.id, 'cuota')} disabled={busy === i.id} className={`${btn} bg-[#009ee3]/60 hover:bg-[#009ee3] text-white flex items-center gap-1`}><Link2 size={13} /> Copiar link cuota</button>
                                        <button onClick={() => pagoManual(i.id, 'cuota')} disabled={busy === i.id} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70`}>+ Pago cuota</button>
                                    </> : <span className="text-[10px] text-white/30 self-center">Cuotas desde {CUOTAS_DESDE_LABEL}</span>}
                                </>}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

// ── Lanzamiento ───────────────────────────────────────────────────────────────
function Lanzamiento() {
    const [items, setItems] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const [edit, setEdit] = useState<any | null>(null)
    const [busy, setBusy] = useState(false)

    const cargar = async () => { setCargando(true); setItems(await getLanzamientosAdminAction()); setCargando(false) }
    useEffect(() => { cargar() }, [])

    const guardar = async () => {
        if (!edit?.titulo?.trim()) return toast.error('Poné un título.')
        setBusy(true)
        const r = await guardarLanzamientoAction({
            id: edit.id, titulo: edit.titulo, subtitulo: edit.subtitulo, video_url: edit.video_url,
            descripcion: edit.descripcion, cta_texto: edit.cta_texto, activo: !!edit.activo, orden: Number(edit.orden) || 0,
        })
        if (r.ok) { toast.success('Guardado.'); setEdit(null); cargar() } else toast.error(r.error || 'Error')
        setBusy(false)
    }

    if (cargando) return <Loader2 className="animate-spin text-white/40" />
    return (
        <div className="space-y-4">
            {!edit && <button onClick={() => setEdit({ titulo: '', activo: true, cta_texto: 'Inscripciones 2027', orden: 0 })} className={`${btn} bg-[#D4E655] text-black flex items-center gap-1`}><Plus size={14} /> Nuevo lanzamiento</button>}

            {edit && (
                <div className={`${card} space-y-3`}>
                    <h3 className="font-semibold">{edit.id ? 'Editar' : 'Nuevo'} lanzamiento</h3>
                    <div><label className="text-xs text-white/50">Título</label><input value={edit.titulo || ''} onChange={e => setEdit({ ...edit, titulo: e.target.value })} className={input} /></div>
                    <div><label className="text-xs text-white/50">Subtítulo</label><input value={edit.subtitulo || ''} onChange={e => setEdit({ ...edit, subtitulo: e.target.value })} className={input} /></div>
                    <div><label className="text-xs text-white/50">Video (link YouTube o mp4)</label><input value={edit.video_url || ''} onChange={e => setEdit({ ...edit, video_url: e.target.value })} className={input} placeholder="https://youtu.be/…" /></div>
                    <div><label className="text-xs text-white/50">Descripción del programa / etapas</label><textarea value={edit.descripcion || ''} onChange={e => setEdit({ ...edit, descripcion: e.target.value })} className={input} rows={6} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-white/50">Texto del botón (CTA)</label><input value={edit.cta_texto || ''} onChange={e => setEdit({ ...edit, cta_texto: e.target.value })} className={input} /></div>
                        <div><label className="text-xs text-white/50">Orden</label><input type="number" value={edit.orden ?? 0} onChange={e => setEdit({ ...edit, orden: e.target.value })} className={input} /></div>
                    </div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.activo} onChange={e => setEdit({ ...edit, activo: e.target.checked })} /> Activo (muestra el CTA en la home y abre la página pública)</label>
                    <div className="flex gap-2">
                        <button onClick={guardar} disabled={busy} className={`${btn} bg-[#D4E655] text-black`}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}</button>
                        <button onClick={() => setEdit(null)} className={`${btn} bg-white/5 text-white/60`}>Cancelar</button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {items.map(l => (
                    <div key={l.id} className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3">
                        <div>
                            <div className="flex items-center gap-2"><span className="font-semibold">{l.titulo}</span>
                                {l.activo ? <span className="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-300">Activo</span> : <span className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/40">Inactivo</span>}</div>
                            <p className="text-xs text-white/40">/liga2027 · {l.slug}</p>
                        </div>
                        <button onClick={() => setEdit(l)} className={`${btn} bg-white/5 hover:bg-white/10 text-white/70`}>Editar</button>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Precios ───────────────────────────────────────────────────────────────────
function Precios() {
    const [p, setP] = useState<Record<string, number> | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => { getPreciosLiga27Action().then(setP) }, [])

    const guardar = async () => {
        if (!p) return
        setBusy(true)
        const r = await guardarPreciosLiga27Action(p)
        if (r.ok) toast.success('Precios guardados.'); else toast.error(r.error || 'Error')
        setBusy(false)
    }
    if (!p) return <Loader2 className="animate-spin text-white/40" />
    const field = (k: string, label: string) => (
        <div><label className="text-xs text-white/50">{label}</label>
            <input type="number" value={p[k] ?? 0} onChange={e => setP({ ...p, [k]: Number(e.target.value) })} className={input} /></div>
    )
    return (
        <div className={`${card} max-w-md space-y-4`}>
            <p className="text-sm text-white/60">Montos de La Liga 2027. Se usan para los links de pago y el registro manual.</p>
            {field('liga27_matricula', 'Matrícula ($)')}
            {field('liga27_cuota_mensual', 'Cuota mensual ($)')}
            {field('liga27_cuota_cuatrimestral', 'Cuota cuatrimestral — por mes ($)')}
            <button onClick={guardar} disabled={busy} className={`${btn} bg-[#D4E655] text-black`}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Guardar precios'}</button>
        </div>
    )
}
