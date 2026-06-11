'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
    ChevronLeft, Lock, Loader2,
    CheckCircle2, Settings2,
    X, Save, Phone,
    ChevronDown
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { Toaster } from 'sonner'

type CotizacionData = {
    nombre: string; marca: string; instagram: string; whatsapp: string; empresa: string;
    tipo: string; espacio: string;
    tecnica: string[];
    participantes: string;
    fecha: string; horario: string; duracion: number;
}

// --- PRECIOS POR DEFECTO ---
const DEFAULT_PRICING = {
    espacios: {
        'Sala Streaming': 100000,
        'Sala Negra': 120000,
        'Sala Blanca': 100000,
        'Otros espacios': 80000,
    },
    tecnica: {
        'Cámara Adicional': 15000,
        'Micrófono Adicional': 5000,
        'Pantalla / Iluminación Adicional': 10000,
        'Infinito': 20000,
        'Desarrollo Escenográfico': 50000,
        'Proyectores de Largo Alcance': 15000,
        'Diseño Gráfico': 20000,
        'Producción Creativa': 40000,
    }
}

// Salas que suman un recargo oculto (cubre armado/desarmado en otros sectores)
const SALAS_CON_RECARGO = ['Sala Negra', 'Sala Blanca', 'Otros espacios']
const RECARGO_SALA = 50000

// Equipos ya incluidos en Sala Streaming (no se cobran extra)
const EQUIPOS_INCLUIDOS_STREAMING = ['Cámara Adicional', 'Micrófono Adicional']

export default function CotizadorPage() {
    const [supabase] = useState(() => createClient())
    const [step, setStep] = useState(1)
    const [loadingDb, setLoadingDb] = useState(true)
    const [formData, setFormData] = useState<CotizacionData>({
        nombre: '', marca: '', instagram: '', whatsapp: '', empresa: '',
        tipo: '', espacio: '', tecnica: [], participantes: '',
        fecha: '', horario: '', duracion: 1
    })

    const [pricingConfig, setPricingConfig] = useState(DEFAULT_PRICING)
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
    const [passwordInput, setPasswordInput] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [guardandoDb, setGuardandoDb] = useState(false)

    useEffect(() => {
        const cargarPrecios = async () => {
            setLoadingDb(true)
            try {
                const { data } = await supabase
                    .from('configuraciones')
                    .select('clave, valor')
                    .ilike('clave', 'stream_%')

                if (data && data.length > 0) {
                    const loadedPricing = JSON.parse(JSON.stringify(DEFAULT_PRICING))
                    data.forEach((item: any) => {
                        if (item.clave.startsWith('stream_espacio_')) {
                            const key = item.clave.replace('stream_espacio_', '')
                            if (loadedPricing.espacios[key] !== undefined) loadedPricing.espacios[key] = Number(item.valor)
                        } else if (item.clave.startsWith('stream_tecnica_')) {
                            const key = item.clave.replace('stream_tecnica_', '')
                            if (loadedPricing.tecnica[key] !== undefined) loadedPricing.tecnica[key] = Number(item.valor)
                        }
                    })
                    setPricingConfig(loadedPricing)
                }
            } catch (e) {
                console.error("Error cargando configuración:", e)
            } finally {
                setLoadingDb(false)
            }
        }
        cargarPrecios()
    }, [supabase])

    // --- PANTALLA 1: TIPOS (orden 1-6) ---
    const tipos = [
        { nombre: 'Podcast', subtitulo: 'Solo Audio', image: '/podcast.jpg', esExterno: false },
        { nombre: 'Streaming', subtitulo: '', image: '/streaming.jpeg', esExterno: false },
        { nombre: 'Grabaciones', subtitulo: 'On Demand', image: '/grabaciones.jpeg', esExterno: false },
        { nombre: 'Transmisión de Eventos', subtitulo: '', image: 'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273212/5C318F3E-0064-4DD1-802A-2301A6115FA6_2_iwwqs2.jpg', esExterno: false },
        { nombre: 'Cobertura de Eventos Externos', subtitulo: '', image: 'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273164/DSC08820_fkpapk.jpg', esExterno: true },
        { nombre: 'Contenido para redes', subtitulo: '', image: '/redes.jpg', esExterno: false },
    ]

    // --- PANTALLA 2: SALAS (sin Eventos externos) ---
    const espacios = [
        { id: 'Sala Streaming', desc: 'Multicámara, monitores y setup completo para streaming profesional.', img: '/sala-redes.jpg' },
        { id: 'Sala Negra', desc: 'Ambiente cinematic, ideal para producciones premium y entrevistas.', img: '/sala-negra.jpeg' },
        { id: 'Sala Blanca', desc: 'Espacio luminoso y versátil para contenido clean y corporativo.', img: '/sala-blanca.jpeg' },
        { id: 'Otros espacios', desc: 'Salas adicionales y espacios creativos de Piso 2.', img: 'https://res.cloudinary.com/dceyxuuqa/image/upload/v1774273212/IMG_0556_2_mwuo4s.jpg' },
    ]

    // Para Podcast: solo mostrar Sala Streaming
    const espaciosDelTipo = useMemo(() => {
        if (formData.tipo === 'Podcast') return espacios.filter(e => e.id === 'Sala Streaming')
        return espacios
    }, [formData.tipo])

    const tecnicas = Object.keys(pricingConfig.tecnica)

    const participantesOpt = ['1-2', '3-5', '5-10', '+10']

    // --- DURACIONES: solo horas enteras ---
    const duraciones = [
        { value: 1, label: '1 hora' },
        { value: 2, label: '2 horas' },
        { value: 3, label: '3 horas' },
        { value: 4, label: '4 horas o más' },
    ]

    // --- CÁLCULO: precio sala + extras con 20% markup + recargo oculto de salas no-streaming ---
    const valorEstimado = useMemo(() => {
        const base = pricingConfig.espacios[formData.espacio as keyof typeof pricingConfig.espacios] || 0
        const extras = formData.tecnica.reduce((acc, item) => {
            const precioBase = pricingConfig.tecnica[item as keyof typeof pricingConfig.tecnica] || 0
            return acc + precioBase * 1.2 // 20% markup para Piso 2
        }, 0)
        const recargo = SALAS_CON_RECARGO.includes(formData.espacio) ? RECARGO_SALA : 0
        return (base + extras) * formData.duracion + recargo
    }, [formData, pricingConfig])

    // --- NAVEGACIÓN ---
    // Se salta el antiguo paso 4 (estética), que fue eliminado del flujo.
    const handleNext = () => {
        if (step === 3) {
            setStep(5) // salta estética
        } else {
            setStep(prev => prev + 1)
        }
    }

    const handleBack = () => {
        if (step === 5) {
            setStep(3) // salta hacia atrás por encima de estética
        } else if (step === 8 && formData.tipo === 'Cobertura de Eventos Externos') {
            setStep(2)
        } else {
            setStep(prev => prev - 1)
        }
    }

    const toggleTecnica = (item: string) => {
        if (formData.espacio === 'Sala Streaming' && EQUIPOS_INCLUIDOS_STREAMING.includes(item)) return
        setFormData(prev => ({
            ...prev,
            tecnica: prev.tecnica.includes(item)
                ? prev.tecnica.filter(t => t !== item)
                : [...prev.tecnica, item]
        }))
    }

    const verifyPassword = (e: React.FormEvent) => {
        e.preventDefault()
        if (passwordInput === 'adminstream123') {
            setShowPasswordPrompt(false)
            setPasswordInput('')
            setShowSettings(true)
        } else {
            import('sonner').then(({ toast }) => toast.error('Contraseña incorrecta'))
        }
    }

    const handleGuardarPreciosDb = async () => {
        setGuardandoDb(true)
        try {
            const payload: any[] = []
            Object.entries(pricingConfig.espacios).forEach(([key, val]) => {
                payload.push({ clave: `stream_espacio_${key}`, valor: val })
            })
            Object.entries(pricingConfig.tecnica).forEach(([key, val]) => {
                payload.push({ clave: `stream_tecnica_${key}`, valor: val })
            })
            const { error } = await supabase.from('configuraciones').upsert(payload, { onConflict: 'clave' })
            if (error) throw error
            import('sonner').then(({ toast }) => toast.success('Precios guardados correctamente'))
            setShowSettings(false)
        } catch (e: any) {
            import('sonner').then(({ toast }) => toast.error(`Error: ${e.message}`))
        } finally {
            setGuardandoDb(false)
        }
    }

    const enviarWhatsApp = () => {
        const esCobertura = formData.tipo === 'Cobertura de Eventos Externos'
        const texto = esCobertura
            ? `¡Hola Piso 2! Me interesa coordinar una Cobertura de Evento Externo.\n\n*Nombre:* ${formData.nombre}\n*Marca:* ${formData.marca}\n*WhatsApp:* ${formData.whatsapp}${formData.empresa ? `\n*Empresa:* ${formData.empresa}` : ''}`
            : `¡Hola Piso 2! Completé el formulario de solicitud de presupuesto en la web.\n\n*Nombre:* ${formData.nombre}\n*Marca:* ${formData.marca}\n*Instagram:* ${formData.instagram}\n*Formato:* ${formData.tipo}\n*Set:* ${formData.espacio}\n*Adicionales:* ${formData.tecnica.length > 0 ? formData.tecnica.join(', ') : 'Ninguno'}\n*Participantes:* ${formData.participantes}\n*Fecha:* ${formData.fecha} a las ${formData.horario} hs\n*Duración:* ${formData.duracion} hora${formData.duracion > 1 ? 's' : ''}\n*Presupuesto estimado:* $${valorEstimado.toLocaleString('es-AR')}`
        window.open(`https://wa.me/5491171190301?text=${encodeURIComponent(texto)}`, '_blank')
    }

    if (loadingDb) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#1ed760] w-12 h-12 mb-4" />
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest animate-pulse">Sincronizando Cotizador...</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center relative selection:bg-[#1ed760] selection:text-black font-sans pb-16 md:pb-0 overflow-hidden">

            <div className="absolute inset-0 bg-[url('/banner-piso.png')] bg-cover bg-center opacity-40 pointer-events-none z-0" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/50 via-transparent to-[#050505] pointer-events-none z-0" />

            <div className="w-full max-w-4xl p-6 relative z-10">
                <Toaster position="top-center" richColors theme="dark" />

                {(step > 1 && step < 8) || (step === 8 && formData.tipo === 'Cobertura de Eventos Externos') ? (
                    <button onClick={handleBack} className="absolute top-8 left-8 text-gray-400 hover:text-white flex items-center gap-2 transition-colors z-20 font-bold uppercase text-xs tracking-wider">
                        <ChevronLeft size={20} /> Volver
                    </button>
                ) : null}

                <div className="w-full max-w-4xl p-6 relative z-10">

                    {/* --- PASO 1: DATOS PERSONALES --- */}
                    {step === 1 && (
                        <div className="max-w-md mx-auto animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex justify-center mb-8">
                                <img src="/2S-verde.png" alt="Logo 2S" className="h-16 w-auto object-contain drop-shadow-[0_0_20px_rgba(30,215,96,0.4)]" />
                            </div>
                            <div className="bg-[#0a0a0c] border border-white/5 rounded-3xl p-8 shadow-2xl">
                                <h2 className="text-2xl font-black mb-6 text-center uppercase tracking-tighter text-white">Contanos de tu proyecto</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1 block">
                                            Nombre y Apellido <span className="text-[#1ed760]">*</span>
                                        </label>
                                        <input value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm" placeholder="Ej: Juan Pérez" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Marca / Nombre del Programa <span className="text-gray-700">(Opcional)</span></label>
                                        <input value={formData.marca} onChange={e => setFormData({ ...formData, marca: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm" placeholder="Ej: Piso 2 Stream" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Usuario de Instagram <span className="text-gray-700">(Opcional)</span></label>
                                        <input value={formData.instagram} onChange={e => setFormData({ ...formData, instagram: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm" placeholder="@usuario" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1 block">
                                            Número de celular (WhatsApp) <span className="text-[#1ed760]">*</span>
                                        </label>
                                        <input
                                            type="tel"
                                            inputMode="numeric"
                                            value={formData.whatsapp}
                                            onChange={e => {
                                                const soloNumeros = e.target.value.replace(/[^0-9+\s\-()]/g, '')
                                                setFormData({ ...formData, whatsapp: soloNumeros })
                                            }}
                                            className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm"
                                            placeholder="+54 9 11..."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Productora / Empresa <span className="text-gray-700">(Opcional)</span></label>
                                        <input value={formData.empresa} onChange={e => setFormData({ ...formData, empresa: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm" placeholder="Compañía" />
                                    </div>
                                    <button onClick={handleNext} disabled={!formData.nombre.trim() || !formData.whatsapp.trim()} className="w-full bg-[#1ed760] text-black font-black uppercase tracking-widest py-4 rounded-xl mt-4 hover:bg-white hover:shadow-[0_0_25px_rgba(30,215,96,0.3)] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed">
                                        Continuar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- PASO 2: TIPO DE CONTENIDO --- */}
                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                            <h2 className="text-3xl font-black mb-10 text-center uppercase tracking-tighter">¿Qué formato vas a realizar?</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10 max-w-3xl mx-auto">
                                {tipos.map(tipo => (
                                    <button
                                        key={tipo.nombre}
                                        onClick={() => {
                                            setFormData({ ...formData, tipo: tipo.nombre })
                                            if (tipo.esExterno) setStep(8)
                                        }}
                                        className={`relative h-36 rounded-2xl overflow-hidden group border transition-all duration-300 ${formData.tipo === tipo.nombre ? 'border-[#1ed760] shadow-[0_0_25px_rgba(30,215,96,0.25)]' : 'border-white/5 hover:border-white/20'}`}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent z-10" />
                                        <div className="absolute inset-0 bg-[#111] transform group-hover:scale-110 transition-transform duration-500">
                                            <div className="h-full w-full relative overflow-hidden">
                                                <img src={tipo.image} alt={tipo.nombre} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-60 group-hover:opacity-90" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-black/20" />
                                            </div>
                                        </div>
                                        <div className="absolute bottom-3 left-4 z-20">
                                            <span className="font-black uppercase text-xs tracking-wider block">{tipo.nombre}</span>
                                            {tipo.subtitulo && (
                                                <span className="text-[9px] text-[#1ed760]/80 font-bold uppercase tracking-wider">({tipo.subtitulo})</span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="flex justify-center">
                                <button onClick={handleNext} disabled={!formData.tipo || formData.tipo === 'Cobertura de Eventos Externos'} className="bg-[#1ed760] text-black font-black uppercase tracking-widest px-12 py-4 rounded-full hover:bg-white hover:shadow-[0_0_20px_rgba(30,215,96,0.3)] transition-all disabled:opacity-40">
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- PASO 3: ESPACIO / SALA --- */}
                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                            <h2 className="text-3xl font-black mb-4 text-center uppercase tracking-tighter">Elegí tu set de grabación</h2>

                            {formData.tipo === 'Podcast' && (
                                <p className="text-center text-[#1ed760] text-[10px] uppercase font-bold tracking-widest mb-6 bg-[#1ed760]/10 px-4 py-1.5 rounded-full inline-flex items-center gap-2 border border-[#1ed760]/20 mx-auto block w-fit">
                                    <Lock size={12} /> Podcast: disponible solo en Sala Streaming
                                </p>
                            )}

                            <div className={`grid grid-cols-1 gap-4 mb-10 ${formData.tipo === 'Podcast' ? 'max-w-xs mx-auto' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
                                {espaciosDelTipo.map(esp => (
                                    <button
                                        key={esp.id}
                                        onClick={() => setFormData({ ...formData, espacio: esp.id })}
                                        className={`flex flex-col text-left group p-1 rounded-2xl transition-all duration-300 border ${formData.espacio === esp.id ? 'border-[#1ed760] bg-white/5 shadow-[0_0_25px_rgba(30,215,96,0.2)]' : 'border-transparent hover:bg-white/5'}`}
                                    >
                                        <div className="h-40 w-full rounded-xl bg-[#111] mb-4 relative overflow-hidden">
                                            <img src={esp.img} alt={esp.id} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-60 group-hover:opacity-90" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-black/20" />
                                        </div>
                                        <div className="px-3 pb-3">
                                            <h3 className="font-black text-white uppercase text-sm mb-2">{esp.id}</h3>
                                            <p className="text-xs text-gray-500 leading-relaxed">{esp.desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <div className="flex justify-center">
                                <button onClick={handleNext} disabled={!formData.espacio} className="bg-[#1ed760] text-black font-black uppercase tracking-widest px-12 py-4 rounded-full hover:bg-white hover:shadow-[0_0_20px_rgba(30,215,96,0.3)] transition-all disabled:opacity-40">
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- PASO 5: EQUIPAMIENTO Y ADICIONALES --- */}
                    {step === 5 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col items-center">
                            <h2 className="text-3xl font-black mb-4 text-center uppercase tracking-tighter">Equipamiento y Adicionales</h2>
                            <p className="text-center text-gray-500 text-xs uppercase tracking-widest mb-4 font-bold">
                                Seleccioná todo lo que necesite tu producción
                            </p>

                            {formData.espacio === 'Sala Streaming' ? (
                                <div className="mb-8 text-center animate-in fade-in">
                                    <p className="text-[#1ed760] text-[10px] uppercase font-bold tracking-widest bg-[#1ed760]/10 px-4 py-1.5 rounded-full inline-flex items-center gap-2 border border-[#1ed760]/20">
                                        <Lock size={12} /> Algunos equipos ya vienen incluidos en esta sala
                                    </p>
                                </div>
                            ) : (
                                <div className="mb-8 h-[30px]" />
                            )}

                            <div className="flex flex-wrap justify-center gap-3 mb-10 max-w-3xl mx-auto">
                                {tecnicas.map(tec => {
                                    const isBlocked = formData.espacio === 'Sala Streaming' && EQUIPOS_INCLUIDOS_STREAMING.includes(tec)
                                    const isSelected = formData.tecnica.includes(tec) && !isBlocked

                                    return (
                                        <button
                                            key={tec}
                                            onClick={() => toggleTecnica(tec)}
                                            disabled={isBlocked}
                                            className={`relative overflow-hidden px-5 py-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 border
                                                ${isBlocked
                                                    ? 'border-white/5 text-gray-600 bg-[#111] cursor-not-allowed opacity-40'
                                                    : isSelected
                                                        ? 'border-[#1ed760] text-[#1ed760] bg-[#1ed760]/10 shadow-[0_0_20px_rgba(30,215,96,0.25)] scale-[1.02]'
                                                        : 'border-white/10 text-gray-300 bg-[#111] hover:border-white/30'
                                                }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                {tec}
                                                {isBlocked && <Lock size={12} className="text-gray-600" />}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="flex justify-center w-full">
                                <button onClick={handleNext} className="bg-[#1ed760] text-black font-black uppercase tracking-widest px-12 py-4 rounded-full hover:bg-white hover:shadow-[0_0_20px_rgba(30,215,96,0.3)] transition-all">
                                    Siguiente
                                </button>
                            </div>

                            <div className="mt-8 max-w-lg mx-auto text-center">
                                <p className="text-gray-300/80 text-sm leading-relaxed font-medium">
                                    * TRES CÁMARAS, TRES MICRÓFONOS, DOS PANTALLAS,<br />
                                    OPERACIÓN TÉCNICA, DOS PANELES LED, SWITCH, CONTROLADOR.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* --- PASO 6: CANTIDAD DE PERSONAS --- */}
                    {step === 6 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-500 text-center">
                            <h2 className="text-3xl font-black mb-10 uppercase tracking-tighter">¿Cuántas personas en el set?</h2>
                            <div className="flex flex-wrap justify-center gap-4 mb-12">
                                {participantesOpt.map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setFormData({ ...formData, participantes: p })}
                                        className={`w-32 h-16 rounded-2xl font-black text-lg transition-all duration-300 border-2 ${formData.participantes === p ? 'bg-transparent border-[#1ed760] text-white shadow-[0_0_25px_rgba(30,215,96,0.25)]' : 'bg-[#111] border-transparent text-gray-600 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <div className="flex justify-center">
                                <button onClick={handleNext} disabled={!formData.participantes} className="bg-[#1ed760] text-black font-black uppercase tracking-widest px-12 py-4 rounded-full hover:bg-white hover:shadow-[0_0_20px_rgba(30,215,96,0.3)] transition-all disabled:opacity-40">
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- PASO 7: FECHA Y TIEMPO --- */}
                    {step === 7 && (
                        <div className="max-w-md mx-auto bg-[#0a0a0c] border border-white/5 rounded-3xl p-8 shadow-2xl animate-in fade-in slide-in-from-right-8 duration-500">
                            <h2 className="text-2xl font-black mb-8 text-center uppercase tracking-tighter text-white">Fecha y tiempo de sesión</h2>
                            <div className="space-y-5">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Día tentativo</label>
                                    <input
                                        type="date"
                                        value={formData.fecha}
                                        onChange={e => setFormData({ ...formData, fecha: e.target.value })}
                                        onClick={(e) => 'showPicker' in HTMLInputElement.prototype && (e.target as HTMLInputElement).showPicker()}
                                        className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] transition-colors text-sm text-white cursor-pointer [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Hora de inicio</label>
                                    <div className="relative">
                                        <select
                                            value={formData.horario}
                                            onChange={e => setFormData({ ...formData, horario: e.target.value })}
                                            className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] transition-colors text-sm text-white appearance-none cursor-pointer"
                                        >
                                            <option value="">Seleccioná un horario</option>
                                            {Array.from({ length: 48 }, (_, i) => {
                                                const totalMins = i * 30
                                                const h = String(Math.floor(totalMins / 60)).padStart(2, '0')
                                                const m = String(totalMins % 60).padStart(2, '0')
                                                return <option key={`${h}:${m}`} value={`${h}:${m}`}>{h}:{m} hs</option>
                                            })}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Duración de la sesión</label>
                                    <div className="relative">
                                        <select
                                            value={formData.duracion}
                                            onChange={e => setFormData({ ...formData, duracion: Number(e.target.value) })}
                                            className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] transition-colors text-sm text-white appearance-none cursor-pointer"
                                        >
                                            {duraciones.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    </div>
                                </div>
                                <button
                                    onClick={handleNext}
                                    disabled={!formData.fecha || !formData.horario}
                                    className="w-full bg-[#1ed760] text-black font-black uppercase tracking-widest py-4 rounded-xl mt-6 hover:bg-white hover:shadow-[0_0_25px_rgba(30,215,96,0.3)] transition-all disabled:opacity-40"
                                >
                                    Solicitar Presupuesto
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- PASO 8: MENSAJE FINAL --- */}
                    {step === 8 && (
                        <div className="max-w-lg mx-auto animate-in zoom-in-95 duration-700">
                            <div className="bg-[#0a0a0c] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-[#1ed760]/10 rounded-full blur-[100px] pointer-events-none" />

                                <div className="flex items-center gap-4 mb-6 relative z-10">
                                    <div className="w-14 h-14 rounded-full bg-[#1ed760]/10 flex items-center justify-center border border-[#1ed760]/20 shrink-0">
                                        <CheckCircle2 className="text-[#1ed760]" size={28} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black uppercase tracking-tighter text-white leading-tight">¡Gracias por contactarte con 2S!</h2>
                                        {formData.tipo === 'Cobertura de Eventos Externos'
                                            ? <p className="text-gray-400 text-xs mt-0.5">Escribinos por WhatsApp y te damos todos los detalles.</p>
                                            : <p className="text-gray-500 text-xs mt-0.5">A la brevedad alguien del equipo se pondrá en contacto con vos.</p>
                                        }
                                    </div>
                                </div>

                                {formData.tipo !== 'Cobertura de Eventos Externos' && (
                                    <div className="relative z-10 bg-black/40 border border-white/5 rounded-2xl p-5 mb-6 space-y-3">
                                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-4">Resumen de tu solicitud</p>
                                        {[
                                            { label: 'Formato', value: formData.tipo },
                                            { label: 'Set', value: formData.espacio },
                                            { label: 'Adicionales', value: formData.tecnica.length > 0 ? formData.tecnica.join(', ') : 'Ninguno' },
                                            { label: 'Participantes', value: formData.participantes },
                                            { label: 'Fecha', value: formData.fecha ? `${formData.fecha} a las ${formData.horario} hs` : '—' },
                                            { label: 'Duración', value: formData.duracion === 4 ? '4 horas o más' : `${formData.duracion} hora${formData.duracion > 1 ? 's' : ''}` },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="flex justify-between items-start gap-4">
                                                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider shrink-0">{label}</span>
                                                <span className="text-xs text-gray-300 text-right">{value}</span>
                                            </div>
                                        ))}
                                        <div className="border-t border-white/10 pt-3 mt-3 flex justify-between items-center">
                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Presupuesto estimado</span>
                                            <span className="text-2xl font-black text-[#1ed760]">${valorEstimado.toLocaleString('es-AR')}</span>
                                        </div>
                                        <p className="text-[9px] text-gray-700 text-right">* Sujeto a disponibilidad y confirmación del equipo</p>
                                    </div>
                                )}

                                <button
                                    onClick={enviarWhatsApp}
                                    className="w-full bg-[#1ed760] text-black font-black uppercase tracking-widest py-5 rounded-2xl hover:bg-white hover:shadow-[0_0_30px_rgba(30,215,96,0.4)] transition-all duration-300 flex items-center justify-center gap-2 text-xs relative z-10"
                                >
                                    <Phone size={16} /> Enviar mensaje a 2S por WhatsApp
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* --- BOTÓN OCULTO (MODO DIOS) --- */}
                <div className="fixed bottom-0 w-full flex max-w-4xl justify-between items-center p-4 text-[10px] text-gray-700 z-0">
                    <span>Piso 2 Media Studio • 2026</span>
                    <button onDoubleClick={() => setShowPasswordPrompt(true)} className="w-8 h-8 flex items-end justify-end outline-none hover:opacity-40 transition-opacity">
                        <Lock size={16} />
                    </button>
                </div>

                {/* MODAL CONTRASEÑA */}
                {showPasswordPrompt && (
                    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                        <form onSubmit={verifyPassword} className="bg-[#111] border border-white/10 p-6 rounded-2xl max-w-sm w-full relative shadow-2xl">
                            <button type="button" onClick={() => setShowPasswordPrompt(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={16} /></button>
                            <h3 className="text-white font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2"><Lock size={14} className="text-[#1ed760]" /> Seguridad Cotizador</h3>
                            <input type="password" autoFocus placeholder="Contraseña..." value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#1ed760] mb-4" />
                            <button type="submit" className="w-full bg-[#1ed760] text-black font-black uppercase text-xs py-3 rounded-xl transition-transform active:scale-95">Validar</button>
                        </form>
                    </div>
                )}

                {/* PANEL ADMIN: EDITAR PRECIOS */}
                {showSettings && (
                    <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex flex-col animate-in slide-in-from-bottom-10">
                        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-[#09090b] sticky top-0 z-10">
                            <h2 className="text-xl font-black text-white uppercase flex items-center gap-2">
                                <Settings2 className="text-[#1ed760]" /> Configuración de Precios Web
                            </h2>
                            <button onClick={() => setShowSettings(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar max-w-5xl mx-auto w-full">
                            <div className="bg-[#111] border border-white/5 p-6 rounded-3xl mb-8 shadow-xl">
                                <h3 className="text-[#1ed760] font-black uppercase text-xs tracking-widest mb-6 border-b border-white/10 pb-2">Precio Base por Hora — Estudio / Locación</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {Object.entries(pricingConfig.espacios).map(([espacio, precio]) => (
                                        <div key={espacio} className="flex justify-between items-center bg-black/50 border border-white/5 p-3 rounded-xl">
                                            <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">{espacio}</span>
                                            <div className="relative w-32">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                                <input type="number" value={precio} onChange={e => setPricingConfig({ ...pricingConfig, espacios: { ...pricingConfig.espacios, [espacio]: Number(e.target.value) } })} className="w-full bg-transparent border border-white/10 rounded-lg py-2 pl-7 pr-3 text-white text-sm font-black outline-none focus:border-[#1ed760] text-center" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-600 mt-4 font-bold uppercase">* Salas Negra, Blanca y Otros Espacios suman $50.000 de recargo automático (cubre logística interna).</p>
                            </div>

                            <div className="bg-[#111] border border-white/5 p-6 rounded-3xl mb-8 shadow-xl">
                                <h3 className="text-[#1ed760] font-black uppercase text-xs tracking-widest mb-2 border-b border-white/10 pb-2">Equipamiento Adicional — Costo de Alquiler Base</h3>
                                <p className="text-[10px] text-gray-500 mb-6 font-bold uppercase">El sistema aplica 20% de markup automáticamente sobre cada valor ingresado.</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {Object.entries(pricingConfig.tecnica).map(([item, precio]) => (
                                        <div key={item} className="flex justify-between items-center bg-black/50 border border-white/5 p-3 rounded-xl">
                                            <span className="text-[10px] font-bold text-gray-300 uppercase truncate pr-2">{item}</span>
                                            <div className="relative w-28 shrink-0">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                                <input type="number" value={precio} onChange={e => setPricingConfig({ ...pricingConfig, tecnica: { ...pricingConfig.tecnica, [item]: Number(e.target.value) } })} className="w-full bg-transparent border border-white/10 rounded-lg py-1.5 pl-6 pr-2 text-white text-xs font-black outline-none focus:border-[#1ed760] text-center" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-white/10 bg-[#09090b] flex justify-end gap-4 shrink-0">
                            <button onClick={() => setShowSettings(false)} className="px-6 py-3 font-bold text-gray-400 text-xs uppercase hover:text-white">Cancelar</button>
                            <button onClick={handleGuardarPreciosDb} disabled={guardandoDb} className="px-8 py-3 bg-[#1ed760] text-black font-black uppercase rounded-xl text-xs flex items-center gap-2 hover:bg-white hover:shadow-[0_0_20px_rgba(30,215,96,0.3)] transition-all">
                                {guardandoDb ? <Loader2 className="animate-spin" /> : <><Save size={16} /> Guardar en la Base de Datos</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
