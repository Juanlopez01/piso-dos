'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft, Save, Music, Sun, MonitorPlay, Boxes, CalendarClock, FileSignature, Check } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { getFichaTecnicaAction, guardarFichaTecnicaAction } from '@/app/actions/eventos'

type Ficha = Record<string, any>

export default function FichaTecnicaPage() {
    const params = useParams()
    const eventoId = params.id as string
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [nombre, setNombre] = useState('')
    const [f, setF] = useState<Ficha>({})
    const [updatedAt, setUpdatedAt] = useState<string | null>(null)

    const set = (k: string, v: any) => setF(prev => ({ ...prev, [k]: v }))

    useEffect(() => {
        (async () => {
            const r = await getFichaTecnicaAction(eventoId)
            if (r.ok) {
                setNombre(r.nombre)
                const { _updated_at, ...rest } = (r.ficha || {}) as any
                setF(rest)
                setUpdatedAt(_updated_at || null)
            } else toast.error((r as any).error || 'No se pudo cargar la ficha')
            setLoading(false)
        })()
    }, [eventoId])

    const guardar = async () => {
        setSaving(true)
        const r = await guardarFichaTecnicaAction(eventoId, f)
        if (r.ok) { toast.success('Ficha guardada'); setUpdatedAt(new Date().toISOString()) }
        else toast.error((r as any).error || 'No se pudo guardar')
        setSaving(false)
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#050505]"><Loader2 className="animate-spin text-[#D4E655]" /></div>

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-28">
            <Toaster theme="dark" position="top-center" richColors />

            <div className="max-w-2xl mx-auto px-4 pt-6">
                <Link href="/eventos" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-xs font-semibold uppercase tracking-wide mb-4">
                    <ArrowLeft size={14} /> Volver a eventos
                </Link>

                <div className="mb-6">
                    <p className="text-[10px] uppercase tracking-widest text-[#D4E655] font-black mb-1">Ficha técnica · Perfil vivo</p>
                    <h1 className="text-2xl font-black tracking-tight">{nombre}</h1>
                    <p className="text-xs text-gray-500 mt-1">Completala entre todos. Se guarda y la ve todo el equipo. Podés entrar y salir las veces que haga falta.</p>
                    {updatedAt && <p className="text-[10px] text-gray-600 mt-1">Última edición: {new Date(updatedAt).toLocaleString('es-AR')}</p>}
                </div>

                {/* Función */}
                <Section icon={CalendarClock} title="Función">
                    <Txt label="Días y horarios de función posibles" v={f.dias_horarios} on={v => set('dias_horarios', v)} ph="Ej: viernes 21h, sábado 20h y 22h" />
                    <Sel label="Tipo de sala" v={f.tipo_sala} on={v => set('tipo_sala', v)} opciones={['', 'Sala blanca', 'Sala negra', 'Sala entera']} />
                    <Area label="Necesidades de función" v={f.necesidades_funcion} on={v => set('necesidades_funcion', v)} ph="Cualquier cosa particular que necesiten para la función" />
                    <Txt label="Programación del meet con el equipo técnico" v={f.meet_tecnico} on={v => set('meet_tecnico', v)} ph="Fecha y hora de la reunión técnica" />
                </Section>

                {/* Sonido */}
                <Section icon={Music} title="Sonido">
                    <Chk label="Usa música / micrófonos / instrumentos en vivo" v={f.usa_sonido} on={v => set('usa_sonido', v)} />
                    <Area label="Entrega del track probado y cues específicos" v={f.track_cues} on={v => set('track_cues', v)} ph="Cómo y cuándo entregan el track, cues de sonido" />
                    <Area label="Requerimientos fuera del equipamiento de Piso 2" v={f.sonido_extra} on={v => set('sonido_extra', v)} ph="Equipo extra que traen o que necesitan" />
                    <Txt label="Encargado de sonido del elenco y contacto" v={f.encargado_sonido} on={v => set('encargado_sonido', v)} ph="Nombre y teléfono" />
                    <Chk label="Quieren que Piso 2 realice el track" v={f.track_por_piso2} on={v => set('track_por_piso2', v)} nota="Servicio adicional" />
                </Section>

                {/* Iluminación */}
                <Section icon={Sun} title="Iluminación">
                    <Area label="Climas y escenas de la obra" v={f.climas_escenas} on={v => set('climas_escenas', v)} ph="Descripción de los climas de luz por escena" />
                    <Txt label="Grabación de luces (fecha y hora)" v={f.grabacion_luces} on={v => set('grabacion_luces', v)} ph="Cuándo graban las luces" />
                    <Area label="Horas adicionales y requerimientos extra" v={f.luces_horas_extra} on={v => set('luces_horas_extra', v)} ph="Horas extra de sala, equipos especiales" />
                    <Txt label="Encargado de iluminación del elenco y contacto" v={f.encargado_luces} on={v => set('encargado_luces', v)} ph="Nombre y teléfono" />
                    <Chk label="Quieren que Piso 2 realice el diseño de iluminación" v={f.diseno_por_piso2} on={v => set('diseno_por_piso2', v)} nota="Servicio adicional" />
                </Section>

                {/* Proyecciones */}
                <Section icon={MonitorPlay} title="Proyecciones">
                    <Chk label="Usa proyecciones" v={f.usa_proyecciones} on={v => set('usa_proyecciones', v)} />
                    <Sel label="Cantidad de proyectores" v={f.proyectores} on={v => set('proyectores', v)} opciones={['', '1 proyector', '2 proyectores']} />
                    <Area label="Entrega del track de video editado" v={f.track_video} on={v => set('track_video', v)} ph="Cómo y cuándo entregan el video" />
                    <Txt label="Resolución" v={f.resolucion} on={v => set('resolucion', v)} ph="Ej: 1920x1080" />
                </Section>

                {/* Armado y ensayos */}
                <Section icon={Boxes} title="Armado de sala y ensayos">
                    <Area label="Escenografía, elementos y backstage" v={f.escenografia} on={v => set('escenografia', v)} ph="Qué llevan, qué necesitan de backstage" />
                    <Area label="Ubicación de técnica y armado de gradas" v={f.ubicacion_tecnica} on={v => set('ubicacion_tecnica', v)} ph="Dónde va la técnica, disposición de gradas" />
                    <Txt label="Ensayo general pactado (máx. 2 hs)" v={f.ensayo_general} on={v => set('ensayo_general', v)} ph="Fecha y hora del ensayo general" />
                    <Area label="Ensayos técnicos y sus condiciones" v={f.ensayos_tecnicos} on={v => set('ensayos_tecnicos', v)} ph="Ensayos técnicos acordados y condiciones" />
                </Section>

                {/* Acuerdo de sala */}
                <Section icon={FileSignature} title="Acuerdo de sala">
                    <div className="rounded-xl bg-[#111] border border-white/10 p-3 text-[11px] text-gray-400 leading-relaxed mb-3">
                        El uso de la sala está sujeto a la firma del <b className="text-gray-200">acuerdo de sala</b>. Se imprime, se firma y se entrega en Piso 2. Las opciones y valores de cada servicio (track, diseño de luces, horas y ensayos adicionales) se pactan y quedan asentados acá.
                    </div>
                    <Chk label="Acuerdo firmado y entregado" v={f.acuerdo_firmado} on={v => set('acuerdo_firmado', v)} />
                    <Area label="Notas del acuerdo (servicios pactados, valores, observaciones)" v={f.acuerdo_notas} on={v => set('acuerdo_notas', v)} ph="Servicios contratados a Piso 2, valores acordados, aclaraciones" />
                </Section>
            </div>

            {/* barra fija guardar */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#09090b]/95 backdrop-blur border-t border-white/10 p-3 z-40">
                <div className="max-w-2xl mx-auto">
                    <button onClick={guardar} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-[#D4E655] text-black font-black py-3.5 rounded-xl uppercase text-sm tracking-wide hover:bg-white transition-colors disabled:opacity-60">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar ficha
                    </button>
                </div>
            </div>
        </div>
    )
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
    return (
        <div className="mb-5 rounded-2xl bg-[#0b0b0d] border border-white/10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
                <Icon size={16} className="text-[#D4E655]" />
                <h2 className="font-black uppercase text-xs tracking-widest">{title}</h2>
            </div>
            <div className="p-4 space-y-4">{children}</div>
        </div>
    )
}

const lbl = 'block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5'
const inp = 'w-full bg-[#111] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-[#D4E655]/60 focus:outline-none'

function Txt({ label, v, on, ph }: { label: string; v: any; on: (v: string) => void; ph?: string }) {
    return <div><label className={lbl}>{label}</label><input className={inp} value={v || ''} onChange={e => on(e.target.value)} placeholder={ph} /></div>
}

function Area({ label, v, on, ph }: { label: string; v: any; on: (v: string) => void; ph?: string }) {
    return <div><label className={lbl}>{label}</label><textarea className={inp + ' min-h-[70px] resize-y'} value={v || ''} onChange={e => on(e.target.value)} placeholder={ph} /></div>
}

function Sel({ label, v, on, opciones }: { label: string; v: any; on: (v: string) => void; opciones: string[] }) {
    return (
        <div>
            <label className={lbl}>{label}</label>
            <select className={inp} value={v || ''} onChange={e => on(e.target.value)}>
                {opciones.map((o, i) => <option key={i} value={o}>{o || '— Elegir —'}</option>)}
            </select>
        </div>
    )
}

function Chk({ label, v, on, nota }: { label: string; v: any; on: (v: boolean) => void; nota?: string }) {
    return (
        <button type="button" onClick={() => on(!v)} className={`w-full flex items-center gap-3 text-left rounded-xl px-3 py-2.5 border transition-colors ${v ? 'bg-[#D4E655]/10 border-[#D4E655]/40' : 'bg-[#111] border-white/10 hover:border-white/25'}`}>
            <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border ${v ? 'bg-[#D4E655] border-[#D4E655]' : 'border-white/25'}`}>
                {v && <Check size={13} className="text-black" strokeWidth={3} />}
            </span>
            <span className="flex-1">
                <span className="block text-sm font-semibold text-gray-100">{label}</span>
                {nota && <span className="block text-[10px] uppercase tracking-widest text-gray-500 mt-0.5">{nota}</span>}
            </span>
        </button>
    )
}
