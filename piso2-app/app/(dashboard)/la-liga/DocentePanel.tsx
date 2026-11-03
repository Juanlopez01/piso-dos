'use client'

import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { getDisciplinasLiga27Action } from '@/app/actions/liga2027-academico'
import { AsistenciaEditor, ClaseEditor, NotasEditor } from './editores'
import { Loader2 } from 'lucide-react'

const btn = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"

export default function DocentePanel() {
    const [disciplinas, setDisciplinas] = useState<any[]>([])
    const [sel, setSel] = useState<string>('')
    const [cargando, setCargando] = useState(true)
    const [sub, setSub] = useState<'asistencia' | 'clase' | 'notas'>('asistencia')

    useEffect(() => { getDisciplinasLiga27Action().then(d => { setDisciplinas(d); setCargando(false); if (d[0]) setSel(d[0].id) }) }, [])

    if (cargando) return <div className="p-8 text-white"><Loader2 className="animate-spin text-white/40" /></div>
    return (
        <div className="p-4 md:p-8 text-white">
            <Toaster position="top-center" richColors theme="dark" />
            <h1 className="text-2xl font-black tracking-tight mb-1">Portal docente · La Liga <span className="text-[#D4E655]">2027</span></h1>
            <p className="text-white/40 text-sm mb-6">Cargá asistencia, contenidos y notas de tus disciplinas.</p>

            {disciplinas.length === 0 ? (
                <p className="text-white/40">Todavía no tenés disciplinas asignadas. Pedile a la coordinación que te asigne una.</p>
            ) : (
                <>
                    <div className="flex gap-2 flex-wrap mb-5">
                        {disciplinas.map(d => (
                            <button key={d.id} onClick={() => setSel(d.id)} className={`${btn} ${sel === d.id ? 'bg-[#D4E655] text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
                                {d.nombre} <span className="opacity-60">· B{d.bloque}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-1 border-b border-white/10 mb-6">
                        {([['asistencia', 'Asistencia'], ['clase', 'Clase (contenido)'], ['notas', 'Notas']] as const).map(([k, l]) => (
                            <button key={k} onClick={() => setSub(k)} className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${sub === k ? 'border-[#D4E655] text-white font-semibold' : 'border-transparent text-white/40 hover:text-white/70'}`}>{l}</button>
                        ))}
                    </div>

                    {sel && sub === 'asistencia' && <AsistenciaEditor disciplinaId={sel} key={sel + 'a'} />}
                    {sel && sub === 'clase' && <ClaseEditor disciplinaId={sel} key={sel + 'c'} />}
                    {sel && sub === 'notas' && <NotasEditor disciplinaId={sel} key={sel + 'n'} />}
                </>
            )}
        </div>
    )
}
