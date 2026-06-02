'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
    ChevronLeft, Lock, Loader2, Video, Radio, Users,
    MonitorPlay, Mic, PlaySquare, Film, Sparkles, LayoutGrid,
    CheckCircle2, Plus, Calendar, Clock, Monitor, Settings2,
    X, Save, Phone, Receipt
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { Toaster } from 'sonner'

type CotizacionData = {
    nombre: string; marca: string; instagram: string; whatsapp: string; empresa: string;
    tipo: string; espacio: string; estilo: string;
    tecnica: string[];
    participantes: string;
    fecha: string; horario: string; duracion: number;
}

const GREEN_COLOR = '#1ed760' // Verde Spotify/Glow

// --- PRECIOS POR DEFECTO (RESPALDO) ---
const DEFAULT_PRICING = {
    espacios: {
        'Sala Streaming': 50000,
        'Sala Negra': 80000,
        'Sala Blanca': 70000,
        'Otros espacios': 40000,
        'Eventos externos': 100000,
    },
    tecnica: {
        'Cámaras': 15000,
        'Multicámara': 25000,
        'Micrófonos': 5000,
        'Iluminación': 10000,
        'Pantallas': 12000,
        'Proyectores': 15000,
        'Branding visual': 20000,
        'Clips para redes': 30000,
        'Producción creativa': 40000,
        'Operador técnico': 25000,
        'Streaming en vivo': 35000,
        'Invitados remotos': 15000,
        'Escenografía': 50000,
    }
}
const IMAGENES_TECNICA: Record<string, string> = {
    'Cámaras': '/images/tecnica/camaras.jpg',
    'Multicámara': '/images/tecnica/multicamara.jpg',
    'Micrófonos': '/images/tecnica/microfonos.jpg',
    'Iluminación': '/images/tecnica/iluminacion.jpg',
    'Pantallas': '/images/tecnica/pantallas.jpg',
    'Proyectores': '/images/tecnica/proyectores.jpg',
    'Branding visual': '/images/tecnica/branding.jpg',
    'Clips para redes': '/images/tecnica/clips.jpg',
    'Producción creativa': '/images/tecnica/produccion.jpg',
    'Operador técnico': '/images/tecnica/operador.jpg',
    'Streaming en vivo': '/images/tecnica/streaming.jpg',
    'Invitados remotos': '/images/tecnica/remotos.jpg',
    'Escenografía': '/images/tecnica/escenografia.jpg',
}

export default function CotizadorPage() {
    const [supabase] = useState(() => createClient())
    const [step, setStep] = useState(1)
    const [loadingDb, setLoadingDb] = useState(true)
    const [formData, setFormData] = useState<CotizacionData>({
        nombre: '', marca: '', instagram: '', whatsapp: '', empresa: '',
        tipo: '', espacio: '', estilo: '', tecnica: [], participantes: '',
        fecha: '', horario: '', duracion: 1
    })

    // --- ESTADOS DE PRECIOS Y MODO ADMIN ---
    const [pricingConfig, setPricingConfig] = useState(DEFAULT_PRICING)
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
    const [passwordInput, setPasswordInput] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [guardandoDb, setGuardandoDb] = useState(false)

    // --- 🚀 CARGAR PRECIOS (ADAPTADO A COLUMNA NUMÉRICA) ---
    useEffect(() => {
        const cargarPrecios = async () => {
            setLoadingDb(true)
            try {
                const { data, error } = await supabase
                    .from('configuraciones')
                    .select('clave, valor')
                    .ilike('clave', 'stream_%')

                if (data && data.length > 0) {
                    const loadedPricing = JSON.parse(JSON.stringify(DEFAULT_PRICING)) // Copia profunda
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
                console.error("Error cargando configuración de precios:", e)
            } finally {
                setLoadingDb(false)
            }
        }
        cargarPrecios()
    }, [supabase])

    // Opciones estáticas del flujo
    const tipos = [
        { nombre: 'Podcast', image: '/podcast.jpg' },
        { nombre: 'Streaming', image: '/podcast.jpg' },
        { nombre: 'Eventos', image: '/podcast.jpg' },
        { nombre: 'Grabaciones', image: '/podcast.jpg' },
        { nombre: 'Show en vivo', image: '/podcast.jpg' },
        { nombre: 'Contenido para redes', image: '/podcast.jpg' },
    ]
    const espacios = [
        { id: 'Sala Streaming', desc: 'Multicámara, monitores y setup completo para streaming profesional.', img: '/images/sala-streaming.jpg' },
        { id: 'Sala Negra', desc: 'Ambiente cinematic, ideal para producciones premium y entrevistas.', img: '/images/sala-negra.jpg' },
        { id: 'Sala Blanca', desc: 'Espacio luminoso y versátil para contenido clean y corporativo.', img: '/images/sala-blanca.jpg' },
        { id: 'Otros espacios', desc: 'Salas adicionales y espacios creativos de Piso 2.', img: '/images/sala-otros.jpg' },
        { id: 'Eventos externos', desc: 'Llevamos la producción a tu locación o evento.', img: '/images/eventos-externos.jpg' }
    ]
    const estilos = ['Gaming', 'Show en vivo', 'Producción premium', 'Streamer setup', 'Podcast relajado', 'Cinematic', 'Minimalista', 'Tech', 'Corporativo premium']
    const tecnicas = Object.keys(pricingConfig.tecnica)
    const participantesOpt = ['1-2', '3-5', '5-10', '+10']
    const duraciones = [
        { value: 1, label: '1 hora' },
        { value: 2, label: '2 horas' },
        { value: 3, label: '3 horas' },
        { value: 4, label: 'Media jornada (4h)' },
        { value: 8, label: 'Jornada completa (8h)' },
    ]

    // --- CÁLCULO ESTIMATIVO ---
    const valorEstimado = useMemo(() => {
        let base = pricingConfig.espacios[formData.espacio as keyof typeof pricingConfig.espacios] || 0;
        let extras = formData.tecnica.reduce((acc, item) => acc + (pricingConfig.tecnica[item as keyof typeof pricingConfig.tecnica] || 0), 0);
        return (base + extras) * formData.duracion;
    }, [formData, pricingConfig])

    const handleNext = () => setStep(prev => prev + 1)
    const handleBack = () => setStep(prev => prev - 1)

    const toggleTecnica = (item: string) => {
        setFormData(prev => ({
            ...prev,
            tecnica: prev.tecnica.includes(item)
                ? prev.tecnica.filter(t => t !== item)
                : [...prev.tecnica, item]
        }))
    }

    // --- VERIFICAR CONTRASEÑA ---
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

    // --- 🚀 GUARDAR EN BASE DE DATOS (ADAPTADO A COLUMNA NUMÉRICA) ---
    const handleGuardarPreciosDb = async () => {
        setGuardandoDb(true)
        try {
            // Desarmamos el objeto en filas individuales
            const payload: any[] = []

            Object.entries(pricingConfig.espacios).forEach(([key, val]) => {
                payload.push({ clave: `stream_espacio_${key}`, valor: val })
            })

            Object.entries(pricingConfig.tecnica).forEach(([key, val]) => {
                payload.push({ clave: `stream_tecnica_${key}`, valor: val })
            })

            const { error } = await supabase
                .from('configuraciones')
                .upsert(payload, { onConflict: 'clave' })

            if (error) throw error
            import('sonner').then(({ toast }) => toast.success('Precios guardados en la base de datos con éxito'))
            setShowSettings(false)
        } catch (e: any) {
            import('sonner').then(({ toast }) => toast.error(`Error al guardar: ${e.message}`))
        } finally {
            setGuardandoDb(false)
        }
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
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center relative selection:bg-[#1ed760] selection:text-black font-sans pb-16 md:pb-0">
            <Toaster position="top-center" richColors theme="dark" />

            {step > 1 && step < 8 && (
                <button onClick={handleBack} className="absolute top-8 left-8 text-gray-400 hover:text-white flex items-center gap-2 transition-colors z-20 font-bold uppercase text-xs tracking-wider">
                    <ChevronLeft size={20} /> Volver
                </button>
            )}

            <div className="w-full max-w-4xl p-6 relative z-10">

                {/* --- PASO 1: DATOS PERSONALES --- */}
                {step === 1 && (
                    <div className="max-w-md mx-auto animate-in fade-in zoom-in-95 duration-500">

                        {/* LOGO 2S CENTRADO ARRIBA */}
                        <div className="flex justify-center mb-8">
                            <img
                                src="/2S-verde.png" // Ajustá la ruta o extensión de tu logo de Piso 2
                                alt="Logo 2S"
                                className="h-16 w-auto object-contain drop-shadow-[0_0_20px_rgba(30,215,96,0.4)]"
                            />
                        </div>

                        {/* CONTENEDOR DEL FORMULARIO */}
                        <div className="bg-[#0a0a0c] border border-white/5 rounded-3xl p-8 shadow-2xl">
                            <h2 className="text-2xl font-black mb-6 text-center uppercase tracking-tighter text-white">Contanos de tu proyecto</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Nombre completo</label>
                                    <input value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm" placeholder="Ej: Juan Pérez" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Marca / Nombre del Programa</label>
                                    <input value={formData.marca} onChange={e => setFormData({ ...formData, marca: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm" placeholder="Ej: Piso 2 Stream" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Usuario de Instagram</label>
                                    <input value={formData.instagram} onChange={e => setFormData({ ...formData, instagram: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm" placeholder="@usuario" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">WhatsApp de contacto</label>
                                    <input value={formData.whatsapp} onChange={e => setFormData({ ...formData, whatsapp: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm" placeholder="+54 9..." />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Productora / Empresa (Opcional)</label>
                                    <input value={formData.empresa} onChange={e => setFormData({ ...formData, empresa: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] focus:shadow-[0_0_15px_rgba(30,215,96,0.15)] transition-all text-sm" placeholder="Compañía" />
                                </div>
                                <button onClick={handleNext} disabled={!formData.nombre || !formData.whatsapp} className="w-full bg-[#1ed760] text-black font-black uppercase tracking-widest py-4 rounded-xl mt-4 hover:bg-white hover:shadow-[0_0_25px_rgba(30,215,96,0.3)] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed">
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
                                    onClick={() => setFormData({ ...formData, tipo: tipo.nombre })}
                                    className={`relative h-36 rounded-2xl overflow-hidden group border transition-all duration-300 ${formData.tipo === tipo.nombre ? 'border-[#1ed760] shadow-[0_0_25px_rgba(30,215,96,0.25)]' : 'border-white/5 hover:border-white/20'}`}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent z-10" />
                                    <div className="absolute inset-0 bg-[#111] transform group-hover:scale-110 group-focus:scale-110 transition-transform duration-500 flex items-center justify-center">
                                        <div className="h-40 w-full rounded-xl bg-[#111] mb-4 relative overflow-hidden">
                                            <img
                                                src={tipo.image}
                                                alt={tipo.nombre}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-60 group-hover:opacity-90"
                                            />
                                            {/* Gradiente oscuro inferior para asegurar contraste */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-black/20" />
                                        </div>
                                    </div>
                                    <span className="absolute bottom-4 left-4 z-20 font-black uppercase text-xs tracking-wider">{tipo.nombre}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-center">
                            <button onClick={handleNext} disabled={!formData.tipo} className="bg-[#1ed760] text-black font-black uppercase tracking-widest px-12 py-4 rounded-full hover:bg-white hover:shadow-[0_0_20px_rgba(30,215,96,0.3)] transition-all disabled:opacity-40">
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}

                {/* --- PASO 3: ESPACIO / SALA --- */}
                {step === 3 && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                        <h2 className="text-3xl font-black mb-10 text-center uppercase tracking-tighter">Elegí tu set de grabación</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                            {espacios.map(esp => (
                                <button
                                    key={esp.id}
                                    onClick={() => setFormData({ ...formData, espacio: esp.id })}
                                    className={`flex flex-col text-left group p-1 rounded-2xl transition-all duration-300 border ${formData.espacio === esp.id ? 'border-[#1ed760] bg-white/5 shadow-[0_0_25px_rgba(30,215,96,0.2)]' : 'border-transparent hover:bg-white/5'}`}
                                >
                                    {/* CONTENEDOR DE IMAGEN MEJORADO */}
                                    <div className="h-40 w-full rounded-xl bg-[#111] mb-4 relative overflow-hidden">
                                        <img
                                            src={esp.img}
                                            alt={esp.id}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-60 group-hover:opacity-90"
                                        />
                                        {/* Gradiente oscuro inferior para asegurar contraste */}
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

                {/* --- PASO 4: ESTILO --- */}
                {step === 4 && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                        <h2 className="text-3xl font-black mb-10 text-center uppercase tracking-tighter">¿Qué estética buscás?</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10 max-w-4xl mx-auto">
                            {estilos.map(estilo => (
                                <button
                                    key={estilo}
                                    onClick={() => setFormData({ ...formData, estilo })}
                                    className={`relative h-24 rounded-2xl overflow-hidden group border transition-all duration-300 ${formData.estilo === estilo ? 'border-[#1ed760] shadow-[0_0_25px_rgba(30,215,96,0.25)]' : 'border-white/5 hover:border-white/20'}`}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-black/20 z-10" />
                                    <div className="absolute inset-0 bg-[#111] transform group-hover:scale-110 transition-transform duration-500" />
                                    <span className="absolute bottom-3 left-4 z-20 font-bold text-xs uppercase tracking-wider text-white">{estilo}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-center">
                            <button onClick={handleNext} disabled={!formData.estilo} className="bg-[#1ed760] text-black font-black uppercase tracking-widest px-12 py-4 rounded-full hover:bg-white hover:shadow-[0_0_20px_rgba(30,215,96,0.3)] transition-all disabled:opacity-40">
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}

                {/* --- PASO 5: TÉCNICA --- */}
                {step === 5 && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                        <h2 className="text-3xl font-black mb-4 text-center uppercase tracking-tighter">Equipamiento y Adicionales</h2>
                        <p className="text-center text-gray-500 text-xs uppercase tracking-widest mb-10 font-bold">Seleccioná todo lo que necesite tu producción</p>
                        <div className="flex flex-wrap justify-center gap-3 mb-12 max-w-3xl mx-auto">
                            {tecnicas.map(tec => {
                                const isSelected = formData.tecnica.includes(tec);
                                const bgImagen = IMAGENES_TECNICA[tec] || '/images/tecnica/default.jpg';

                                return (
                                    <button
                                        key={tec}
                                        onClick={() => toggleTecnica(tec)}
                                        style={{ backgroundImage: `url(${bgImagen})` }}
                                        className={`relative overflow-hidden bg-cover bg-center px-5 py-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 border ${isSelected
                                            ? 'border-[#1ed760] text-[#1ed760] shadow-[0_0_20px_rgba(30,215,96,0.25)] scale-[1.02]'
                                            : 'border-white/10 text-gray-300 hover:border-white/30'
                                            }`}
                                    >
                                        {/* Capa de oscurecimiento (Overlay) dinámico */}
                                        <div className={`absolute inset-0 transition-colors duration-300 ${isSelected ? 'bg-black/60 backdrop-blur-[1px]' : 'bg-black/75 hover:bg-black/65'
                                            }`} />

                                        {/* Texto posicionado por encima de la imagen y del overlay */}
                                        <span className="relative z-10 block pointer-events-none">
                                            {tec}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                        <div className="flex justify-center">
                            <button onClick={handleNext} className="bg-[#1ed760] text-black font-black uppercase tracking-widest px-12 py-4 rounded-full hover:bg-white hover:shadow-[0_0_20px_rgba(30,215,96,0.3)] transition-all">
                                Siguiente
                            </button>
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

                {/* --- PASO 7: AGENDAR FECHA --- */}
                {step === 7 && (
                    <div className="max-w-md mx-auto bg-[#0a0a0c] border border-white/5 rounded-3xl p-8 shadow-2xl animate-in fade-in slide-in-from-right-8 duration-500">
                        <h2 className="text-2xl font-black mb-8 text-center uppercase tracking-tighter text-white">Fecha y tiempo de sesión</h2>
                        <div className="space-y-5">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Día tentativo</label>
                                <input type="date" value={formData.fecha} onChange={e => setFormData({ ...formData, fecha: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] transition-colors text-sm text-white color-scheme-dark" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Hora de inicio</label>
                                <input type="time" value={formData.horario} onChange={e => setFormData({ ...formData, horario: e.target.value })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] transition-colors text-sm text-white" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Duración de la sesión</label>
                                <select value={formData.duracion} onChange={e => setFormData({ ...formData, duracion: Number(e.target.value) })} className="w-full bg-[#111] border border-white/10 rounded-xl p-3 outline-none focus:border-[#1ed760] transition-colors text-sm text-white appearance-none cursor-pointer">
                                    {duraciones.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                </select>
                            </div>
                            <button onClick={handleNext} disabled={!formData.fecha || !formData.horario} className="w-full bg-[#1ed760] text-black font-black uppercase tracking-widest py-4 rounded-xl mt-6 hover:bg-white hover:shadow-[0_0_25px_rgba(30,215,96,0.3)] transition-all disabled:opacity-40">
                                Armar presupuesto
                            </button>
                        </div>
                    </div>
                )}

                {/* --- PASO 8: DETALLE Y COTIZACIÓN FINAL --- */}
                {step === 8 && (
                    <div className="max-w-2xl mx-auto animate-in zoom-in-95 duration-700">
                        <div className="bg-[#0a0a0c] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
                            {/* Efecto de luz de fondo */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-[#1ed760]/10 rounded-full blur-[100px] pointer-events-none" />

                            <h2 className="text-2xl font-black uppercase tracking-tighter text-white text-center mb-1">Tu Proyecto</h2>
                            <p className="text-center text-gray-500 text-[10px] uppercase font-bold tracking-widest mb-8">Detalles técnicos del setup</p>

                            <div className="space-y-4 mb-8 relative z-10 border-b border-white/5 pb-4">
                                <div className="flex justify-between border-b border-white/5 pb-3">
                                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Formato</span>
                                    <span className="text-sm text-white font-black uppercase">{formData.tipo}</span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-3">
                                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Estudio</span>
                                    <span className="text-sm text-white font-black uppercase">{formData.espacio}</span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-3">
                                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Estética</span>
                                    <span className="text-sm text-white font-black uppercase">{formData.estilo}</span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-3">
                                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Set completo para</span>
                                    <span className="text-sm text-white font-black uppercase">{formData.participantes} Personas</span>
                                </div>
                                {formData.tecnica.length > 0 && (
                                    <div className="flex justify-between border-b border-white/5 pb-3">
                                        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Adicionales</span>
                                        <span className="text-xs text-gray-300 font-bold uppercase text-right max-w-[70%]">{formData.tecnica.join(', ')}</span>
                                    </div>
                                )}
                                <div className="flex justify-between pb-2">
                                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Reserva</span>
                                    <span className="text-sm text-white font-black uppercase">{formData.fecha} | {formData.horario} hs ({formData.duracion}h)</span>
                                </div>
                            </div>

                            <div className="bg-[#1ed760]/10 border border-[#1ed760]/20 rounded-2xl p-6 text-center mb-6 relative z-10 shadow-[0_0_30px_rgba(30,215,96,0.1)]">
                                <p className="text-[10px] text-[#1ed760] font-black uppercase tracking-widest mb-1">Presupuesto Base sugerido</p>
                                <div className="text-4xl md:text-5xl font-black text-white tracking-tighter">
                                    <span className="text-sm text-gray-500 mr-2 uppercase font-bold">ARS</span>
                                    ${valorEstimado.toLocaleString('es-AR')}
                                </div>
                            </div>

                            <p className="text-xs text-gray-400 text-center italic mb-8">
                                Recomendamos: {formData.espacio} para tu estilo {formData.estilo}.
                            </p>

                            <button
                                onClick={() => {
                                    const texto = `¡Hola Piso 2! Armé mi presupuesto en la web para una sesión de Streaming:\n\n*Nombre:* ${formData.nombre}\n*Marca:* ${formData.marca}\n*Formato:* ${formData.tipo}\n*Set:* ${formData.espacio}\n*Estética:* ${formData.estilo}\n*Adicionales:* ${formData.tecnica.length > 0 ? formData.tecnica.join(', ') : 'Ninguno'}\n*Fecha/Hora:* ${formData.fecha} a las ${formData.horario} hs\n*Tiempo:* ${formData.duracion} horas\n\n*Presupuesto sugerido:* $${valorEstimado.toLocaleString()}`;
                                    window.open(`https://wa.me/5491171190301?text=${encodeURIComponent(texto)}`, '_blank');
                                }}
                                className="w-full bg-[#1ed760] text-black font-black uppercase tracking-widest py-5 rounded-2xl hover:bg-white hover:shadow-[0_0_30px_rgba(30,215,96,0.4)] transition-all duration-300 flex items-center justify-center gap-2 text-xs"
                            >
                                <Phone size={16} /> Enviar cotización por WhatsApp
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* --- BOTÓN DE POLÍTICA OCULTO (MODO DIOS) --- */}
            <div className="fixed bottom-0 w-full flex justify-between p-4 text-[10px] text-gray-700 z-0">
                <span>Piso 2 Media Studio • 2026</span>

                <button
                    onDoubleClick={() => setShowPasswordPrompt(true)}
                    className="w-8 h-8 flex items-end justify-end outline-none opacity-5 hover:opacity-40 transition-opacity"
                >
                    <Lock size={12} />
                </button>
            </div>

            {/* MODAL INGRESAR CONTRASEÑA */}
            {showPasswordPrompt && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <form onSubmit={verifyPassword} className="bg-[#111] border border-white/10 p-6 rounded-2xl max-w-sm w-full relative shadow-2xl">
                        <button type="button" onClick={() => setShowPasswordPrompt(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={16} /></button>
                        <h3 className="text-white font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2"><Lock size={14} className="text-[#1ed760]" /> Seguridad Cotizador</h3>
                        <input
                            type="password"
                            autoFocus
                            placeholder="Contraseña..."
                            value={passwordInput}
                            onChange={e => setPasswordInput(e.target.value)}
                            className="w-full bg-black border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-[#1ed760] mb-4"
                        />
                        <button type="submit" className="w-full bg-[#1ed760] text-black font-black uppercase text-xs py-3 rounded-xl transition-transform active:scale-95">Validar</button>
                    </form>
                </div>
            )}

            {/* PANEL EDITAR PRECIOS EN BASE DE DATOS */}
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
                            <h3 className="text-[#1ed760] font-black uppercase text-xs tracking-widest mb-6 border-b border-white/10 pb-2">Precios Base por Estudio / Locación</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.entries(pricingConfig.espacios).map(([espacio, precio]) => (
                                    <div key={espacio} className="flex justify-between items-center bg-black/50 border border-white/5 p-3 rounded-xl">
                                        <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">{espacio}</span>
                                        <div className="relative w-32">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                            <input
                                                type="number"
                                                value={precio}
                                                onChange={e => setPricingConfig({
                                                    ...pricingConfig,
                                                    espacios: { ...pricingConfig.espacios, [espacio]: Number(e.target.value) }
                                                })}
                                                className="w-full bg-transparent border border-white/10 rounded-lg py-2 pl-7 pr-3 text-white text-sm font-black outline-none focus:border-[#1ed760] text-center"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-[#111] border border-white/5 p-6 rounded-3xl mb-8 shadow-xl">
                            <h3 className="text-[#1ed760] font-black uppercase text-xs tracking-widest mb-6 border-b border-white/10 pb-2">Técnica y Adicionales (Por Hora de Reservas)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Object.entries(pricingConfig.tecnica).map(([item, precio]) => (
                                    <div key={item} className="flex justify-between items-center bg-black/50 border border-white/5 p-3 rounded-xl">
                                        <span className="text-[10px] font-bold text-gray-300 uppercase truncate pr-2">{item}</span>
                                        <div className="relative w-28 shrink-0">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                            <input
                                                type="number"
                                                value={precio}
                                                onChange={e => setPricingConfig({
                                                    ...pricingConfig,
                                                    tecnica: { ...pricingConfig.tecnica, [item]: Number(e.target.value) }
                                                })}
                                                className="w-full bg-transparent border border-white/10 rounded-lg py-1.5 pl-6 pr-2 text-white text-xs font-black outline-none focus:border-[#1ed760] text-center"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>

                    <div className="p-6 border-t border-white/10 bg-[#09090b] flex justify-end gap-4 shrink-0">
                        <button onClick={() => setShowSettings(false)} className="px-6 py-3 font-bold text-gray-400 text-xs uppercase hover:text-white">Cancelar</button>
                        <button onClick={handleGuardarPreciosDb} disabled={guardandoDb} className="px-8 py-3 bg-[#1ed760] text-black font-black uppercase rounded-xl text-xs flex items-center gap-2 hover:bg-white hover:shadow-[0_0_20px_rgba(30,215,96,0.3)] transition-all duration-300">
                            {guardandoDb ? <Loader2 className="animate-spin" /> : <><Save size={16} /> Guardar en la Base de Datos</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}