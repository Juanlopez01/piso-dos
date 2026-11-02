'use client'

// Editores compartidos por el portal docente y el panel de staff (recepción
// también toma asistencia / carga contenidos y notas). Cada uno opera sobre una
// disciplina; el acceso lo valida el server action (docente de su disciplina o staff).

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
    getAlumnosDisciplinaLiga27Action, tomarAsistenciaLiga27Action, getAsistenciaFechaLiga27Action,
    getExamenesDisciplinaLiga27Action, guardarNotaExamenLiga27Action, getNotasDisciplinaLiga27Action,
    getClaseContenidoFechaLiga27Action, guardarClaseContenidoLiga27Action,
} from '@/app/actions/liga2027-academico'
import { Loader2, Check, X, Save } from 'lucide-react'

const card = "bg-[#111113] border border-white/10 rounded-xl p-5"
const btn = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
const input = "bg-[#1a1a1d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#D4E655]/50 w-full"
const hoyISO = () => new Date().toISOString().slice(0, 10)

export function AsistenciaEditor({ disciplinaId }: { disciplinaId: string }) {
    const [fecha, setFecha] = useState(hoyISO())
    const [alumnos, setAlumnos] = useState<any[]>([])
    const [marcas, setMarcas] = useState<Record<string, boolean>>({})
    const [cargando, setCargando] = useState(true)
    const [guardando, setGuardando] = useState(false)

    const cargar = async () => {
        setCargando(true)
        const [al, prev] = await Promise.all([getAlumnosDisciplinaLiga27Action(disciplinaId), getAsistenciaFechaLiga27Action(disciplinaId, fecha)])
        setAlumnos(al)
        const m: Record<string, boolean> = {}
        for (const a of al) m[a.inscripcion_id] = prev[a.inscripcion_id]?.presente ?? false
        setMarcas(m); setCargando(false)
    }
    useEffect(() => { cargar() }, [disciplinaId, fecha])

    const guardar = async () => {
        setGuardando(true)
        const r = await tomarAsistenciaLiga27Action({ disciplinaId, clase_fecha: fecha, marcas: alumnos.map(a => ({ inscripcionId: a.inscripcion_id, presente: !!marcas[a.inscripcion_id] })) })
        if (r.ok) toast.success('Asistencia guardada.'); else toast.error(r.error || 'Error')
        setGuardando(false)
    }

    return (
        <div className={`${card} space-y-4`}>
            <div className="flex items-center gap-3 flex-wrap"><label className="text-sm text-white/60">Fecha de la clase</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={`${input} w-auto`} /></div>
            {cargando ? <Loader2 className="animate-spin text-white/40" /> : alumnos.length === 0 ? <p className="text-white/40 text-sm">No hay alumnos inscriptos todavía.</p> : (
                <>
                    <div className="space-y-1.5">
                        {alumnos.map(a => {
                            const p = !!marcas[a.inscripcion_id]
                            return (
                                <div key={a.inscripcion_id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                                    <span className="text-sm">{a.perfil?.nombre} {a.perfil?.apellido || ''}</span>
                                    <div className="flex gap-1">
                                        <button onClick={() => setMarcas(m => ({ ...m, [a.inscripcion_id]: true }))} className={`${btn} ${p ? 'bg-green-600 text-white' : 'bg-white/5 text-white/40'} flex items-center gap-1`}><Check size={13} /> Presente</button>
                                        <button onClick={() => setMarcas(m => ({ ...m, [a.inscripcion_id]: false }))} className={`${btn} ${!p ? 'bg-red-600/80 text-white' : 'bg-white/5 text-white/40'} flex items-center gap-1`}><X size={13} /> Ausente</button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <button onClick={guardar} disabled={guardando} className={`${btn} bg-[#D4E655] text-black flex items-center gap-1`}>{guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar asistencia</button>
                </>
            )}
        </div>
    )
}

export function ClaseEditor({ disciplinaId }: { disciplinaId: string }) {
    const [fecha, setFecha] = useState(hoyISO())
    const [form, setForm] = useState({ contenido: '', metodo_evaluacion: '', reemplazo_nombre: '', reemplazo_contacto: '' })
    const [cargando, setCargando] = useState(true)
    const [guardando, setGuardando] = useState(false)

    useEffect(() => {
        setCargando(true)
        getClaseContenidoFechaLiga27Action(disciplinaId, fecha).then(d => {
            setForm({ contenido: d?.contenido || '', metodo_evaluacion: d?.metodo_evaluacion || '', reemplazo_nombre: d?.reemplazo_nombre || '', reemplazo_contacto: d?.reemplazo_contacto || '' })
            setCargando(false)
        })
    }, [disciplinaId, fecha])

    const guardar = async () => {
        setGuardando(true)
        const r = await guardarClaseContenidoLiga27Action({ disciplina_id: disciplinaId, clase_fecha: fecha, ...form })
        if (r.ok) toast.success('Guardado.'); else toast.error(r.error || 'Error')
        setGuardando(false)
    }
    const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

    return (
        <div className={`${card} space-y-3`}>
            <div className="flex items-center gap-3"><label className="text-sm text-white/60">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={`${input} w-auto`} /></div>
            {cargando ? <Loader2 className="animate-spin text-white/40" /> : <>
                <div><label className="text-xs text-white/50">Contenido dado</label><textarea value={form.contenido} onChange={e => set('contenido', e.target.value)} className={input} rows={3} /></div>
                <div><label className="text-xs text-white/50">Método de evaluación</label><input value={form.metodo_evaluacion} onChange={e => set('metodo_evaluacion', e.target.value)} className={input} /></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-white/50">Reemplazo (nombre)</label><input value={form.reemplazo_nombre} onChange={e => set('reemplazo_nombre', e.target.value)} className={input} placeholder="Si hubo reemplazo" /></div>
                    <div><label className="text-xs text-white/50">Reemplazo (contacto)</label><input value={form.reemplazo_contacto} onChange={e => set('reemplazo_contacto', e.target.value)} className={input} /></div>
                </div>
                <button onClick={guardar} disabled={guardando} className={`${btn} bg-[#D4E655] text-black flex items-center gap-1`}>{guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar clase</button>
            </>}
        </div>
    )
}

export function NotasEditor({ disciplinaId }: { disciplinaId: string }) {
    const [examenes, setExamenes] = useState<any[]>([])
    const [alumnos, setAlumnos] = useState<any[]>([])
    const [notas, setNotas] = useState<Record<string, { puntaje: string | null; observaciones: string | null }>>({})
    const [cargando, setCargando] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)

    const cargar = async () => {
        setCargando(true)
        const [exs, al, ns] = await Promise.all([getExamenesDisciplinaLiga27Action(disciplinaId), getAlumnosDisciplinaLiga27Action(disciplinaId), getNotasDisciplinaLiga27Action(disciplinaId)])
        setExamenes(exs); setAlumnos(al); setNotas(ns); setCargando(false)
    }
    useEffect(() => { cargar() }, [disciplinaId])

    const setNota = async (inscripcionId: string, examenId: string, puntaje: 'A' | 'B' | 'C') => {
        const key = `${inscripcionId}:${examenId}`
        setBusy(key)
        const obs = notas[key]?.observaciones || ''
        const r = await guardarNotaExamenLiga27Action({ inscripcionId, examenId, puntaje, observaciones: obs })
        if (r.ok) setNotas(n => ({ ...n, [key]: { puntaje, observaciones: obs } })); else toast.error(r.error || 'Error')
        setBusy(null)
    }
    const setObs = async (inscripcionId: string, examenId: string, observaciones: string) => {
        const key = `${inscripcionId}:${examenId}`
        const puntaje = (notas[key]?.puntaje as any) || null
        const r = await guardarNotaExamenLiga27Action({ inscripcionId, examenId, puntaje, observaciones })
        if (r.ok) setNotas(n => ({ ...n, [key]: { puntaje, observaciones } })); else toast.error(r.error || 'Error')
    }

    if (cargando) return <Loader2 className="animate-spin text-white/40" />
    if (!examenes.length) return <p className="text-white/40 text-sm">Esta disciplina todavía no tiene exámenes.</p>
    if (!alumnos.length) return <p className="text-white/40 text-sm">No hay alumnos inscriptos todavía.</p>

    return (
        <div className="space-y-3">
            {alumnos.map(a => (
                <div key={a.inscripcion_id} className={card}>
                    <h3 className="font-semibold text-sm mb-3">{a.perfil?.nombre} {a.perfil?.apellido || ''}</h3>
                    <div className="space-y-3">
                        {examenes.map(e => {
                            const key = `${a.inscripcion_id}:${e.id}`
                            const nota = notas[key]
                            return (
                                <div key={e.id} className="bg-white/5 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs text-white/50 w-20">Examen {e.numero}</span>
                                        {(['A', 'B', 'C'] as const).map(p => (
                                            <button key={p} onClick={() => setNota(a.inscripcion_id, e.id, p)} disabled={busy === key}
                                                className={`${btn} ${nota?.puntaje === p ? (p === 'A' ? 'bg-green-600' : p === 'B' ? 'bg-amber-600' : 'bg-red-600') + ' text-white' : 'bg-white/10 text-white/50'}`}>{p}</button>
                                        ))}
                                    </div>
                                    <input defaultValue={nota?.observaciones || ''} onBlur={ev => setObs(a.inscripcion_id, e.id, ev.target.value)} className={input} placeholder="Devolución / observaciones (se guarda al salir del campo)" />
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
