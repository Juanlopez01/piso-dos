'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronLeft, Sparkles, Send, Users, Clock, Target, GraduationCap, User as UserIcon, Phone, Lightbulb } from 'lucide-react'
import { Montserrat } from 'next/font/google'

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '700', '900'] })

// WhatsApp del estudio
const WHATSAPP_ESTUDIO = '5491171190301'

export default function NuevaGeneracionPage() {
    const [form, setForm] = useState({
        nombre: '',
        contacto: '',
        experiencia: '',
        nombreClase: '',
        propuesta: '',
        publico: '',
        tieneAlumnos: '' as '' | 'si' | 'no',
        horarios: ''
    })
    const [error, setError] = useState('')

    const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }))

    const handleEnviar = () => {
        const { nombre, contacto, experiencia, nombreClase, propuesta, publico, tieneAlumnos, horarios } = form
        if (!nombre.trim() || !contacto.trim() || !experiencia.trim() || !nombreClase.trim() || !propuesta.trim() || !publico.trim() || !tieneAlumnos || !horarios.trim()) {
            setError('Completá todos los campos antes de enviar.')
            return
        }
        setError('')

        const mensaje =
            `*NUEVA GENERACIÓN — Propuesta para dar clases en Piso 2*\n\n` +
            `👤 *Nombre:* ${nombre}\n` +
            `📱 *Contacto:* ${contacto}\n\n` +
            `🎓 *Experiencia / Formación:*\n${experiencia}\n\n` +
            `💡 *Clase propuesta:* ${nombreClase}\n${propuesta}\n\n` +
            `🎯 *Público objetivo:* ${publico}\n\n` +
            `👥 *¿Ya tiene alumnos?:* ${tieneAlumnos === 'si' ? 'Sí' : 'No'}\n\n` +
            `🕒 *Horarios deseados:* ${horarios}`

        const url = `https://wa.me/${WHATSAPP_ESTUDIO}?text=${encodeURIComponent(mensaje)}`
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    const inputClass = "w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-[#D4E655] transition-colors placeholder:text-gray-600"
    const labelClass = "flex items-center gap-2 text-[10px] font-black text-[#D4E655] uppercase tracking-[0.2em] mb-2"

    return (
        <div className={`min-h-screen bg-[#050505] text-white selection:bg-[#D4E655] selection:text-black ${montserrat.className}`}>
            {/* NAV */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5 h-20">
                <div className="max-w-4xl mx-auto px-6 h-full flex justify-between items-center">
                    <Link href="/" className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase hover:text-white transition-colors">
                        <ChevronLeft size={16} /> Volver al inicio
                    </Link>
                    <img src='/2-verde.png' className="w-8" alt="Piso 2" />
                </div>
            </nav>

            <div className="max-w-2xl mx-auto px-6 pt-32 pb-24">
                {/* HEADER */}
                <div className="mb-12 relative">
                    <div className="absolute -top-10 left-0 w-40 h-40 bg-[#D4E655]/10 rounded-full blur-[80px] pointer-events-none" />
                    <div className="flex items-center gap-2 mb-4 relative z-10">
                        <Sparkles className="text-[#D4E655]" size={20} />
                        <span className="text-[#D4E655] font-bold text-[10px] tracking-[0.4em] uppercase">Nueva Generación</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-[0.95] mb-5 relative z-10">
                        ¿Querés dar <br /><span className="text-[#D4E655]">clases en Piso 2?</span>
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-lg relative z-10">
                        Buscamos profes con propuestas frescas. Contanos sobre vos y tu clase: completá el formulario y se envía directo por WhatsApp al estudio para que lo revisemos.
                    </p>
                </div>

                {/* FORM */}
                <div className="space-y-6">
                    <div>
                        <label className={labelClass}><UserIcon size={12} /> Nombre completo</label>
                        <input className={inputClass} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Tu nombre y apellido" />
                    </div>

                    <div>
                        <label className={labelClass}><Phone size={12} /> Contacto</label>
                        <input className={inputClass} value={form.contacto} onChange={e => set('contacto', e.target.value)} placeholder="Teléfono / email / Instagram" />
                    </div>

                    <div>
                        <label className={labelClass}><GraduationCap size={12} /> Experiencia / Formación</label>
                        <textarea className={`${inputClass} min-h-[110px] resize-none`} value={form.experiencia} onChange={e => set('experiencia', e.target.value)} placeholder="Tu trayectoria, formación, dónde diste clases, etc." />
                    </div>

                    <div>
                        <label className={labelClass}><Lightbulb size={12} /> Nombre de tu clase</label>
                        <input className={inputClass} value={form.nombreClase} onChange={e => set('nombreClase', e.target.value)} placeholder="Ej: Heels Intermedio, Contemporáneo, etc." />
                    </div>

                    <div>
                        <label className={labelClass}><Lightbulb size={12} /> Propuesta de la clase</label>
                        <textarea className={`${inputClass} min-h-[110px] resize-none`} value={form.propuesta} onChange={e => set('propuesta', e.target.value)} placeholder="De qué se trata, estilo, qué la hace distinta..." />
                    </div>

                    <div>
                        <label className={labelClass}><Target size={12} /> Público objetivo</label>
                        <input className={inputClass} value={form.publico} onChange={e => set('publico', e.target.value)} placeholder="¿A quién apunta? Nivel, edad, perfil..." />
                    </div>

                    <div>
                        <label className={labelClass}><Users size={12} /> ¿Ya tenés alumnos?</label>
                        <div className="grid grid-cols-2 gap-3">
                            {(['si', 'no'] as const).map(op => (
                                <button
                                    key={op}
                                    type="button"
                                    onClick={() => set('tieneAlumnos', op)}
                                    className={`py-4 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${form.tieneAlumnos === op ? 'bg-[#D4E655] text-black border-[#D4E655]' : 'bg-[#111] text-gray-400 border-white/10 hover:border-white/30'}`}
                                >
                                    {op === 'si' ? 'Sí, ya tengo' : 'No, todavía no'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}><Clock size={12} /> Horarios deseados</label>
                        <textarea className={`${inputClass} min-h-[90px] resize-none`} value={form.horarios} onChange={e => set('horarios', e.target.value)} placeholder="Días y franjas horarias que te quedan cómodos" />
                    </div>

                    {error && (
                        <p className="text-red-400 text-xs font-bold uppercase tracking-widest text-center">{error}</p>
                    )}

                    <button
                        onClick={handleEnviar}
                        className="w-full bg-[#D4E655] text-black font-black uppercase py-5 rounded-xl hover:bg-white transition-all text-xs tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-[#D4E655]/10 mt-2"
                    >
                        <Send size={16} /> Enviar por WhatsApp
                    </button>
                    <p className="text-center text-[10px] text-gray-600 uppercase tracking-widest">Se abrirá WhatsApp con tu propuesta lista para enviar</p>
                </div>
            </div>
        </div>
    )
}
