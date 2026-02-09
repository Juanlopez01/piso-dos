'use client'
import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { MapPin, Lock, Play, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function CajaApertura() {
    const supabase = createClient()
    const [isOpen, setIsOpen] = useState(false)
    const [checking, setChecking] = useState(true)
    const [sedes, setSedes] = useState<any[]>([])
    const [selectedSede, setSelectedSede] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        checkPermisosYTurno()
    }, [])

    const checkPermisosYTurno = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 1. CHEQUEAR ROL
            const { data: profile } = await supabase
                .from('profiles')
                .select('rol')
                .eq('id', user.id)
                .single()

            // CORRECCIÓN: Si NO es recepcion, no molestamos. 
            // El Admin entra libre, los Profes y Alumnos también.
            if (profile?.rol !== 'recepcion') {
                setChecking(false)
                return
            }

            // 2. Si es Recepción, chequeamos si tiene turno abierto
            const { data: turno } = await supabase.from('caja_turnos')
                .select('id')
                .eq('usuario_id', user.id)
                .eq('estado', 'abierta')
                .maybeSingle()

            if (!turno) {
                // No tiene turno -> Bloqueamos y mostramos selector de sede
                const { data: dataSedes } = await supabase.from('sedes').select('id, nombre')
                if (dataSedes) setSedes(dataSedes)
                setIsOpen(true)
            }
        } catch (error) {
            console.error('Error verificando caja:', error)
        } finally {
            setChecking(false)
        }
    }

    const handleAbrirCaja = async () => {
        if (!selectedSede) return toast.error('Seleccioná una sede')
        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()

        const { error } = await supabase.from('caja_turnos').insert({
            usuario_id: user?.id,
            sede_id: selectedSede,
            estado: 'abierta',
            saldo_inicial: 0
        })

        if (error) {
            toast.error('Error al abrir caja')
        } else {
            toast.success('¡Turno iniciado correctamente!')
            setIsOpen(false)
            window.location.reload()
        }
        setLoading(false)
    }

    if (checking || !isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in">
            <div className="w-full max-w-md bg-[#09090b] border border-white/10 rounded-2xl p-8 text-center shadow-2xl relative">

                <div className="w-20 h-20 bg-[#D4E655] rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(212,230,85,0.3)] animate-bounce">
                    <Lock size={32} className="text-black" />
                </div>

                <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Iniciar Turno</h2>
                <p className="text-gray-400 text-sm mb-8">Hola! Para comenzar a operar la caja, por favor indicá tu sede actual.</p>

                <div className="space-y-3">
                    {sedes.map((sede) => (
                        <button
                            key={sede.id}
                            onClick={() => setSelectedSede(sede.id)}
                            className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all group ${selectedSede === sede.id ? 'bg-[#D4E655] border-[#D4E655] text-black scale-[1.02]' : 'bg-[#111] border-white/10 text-white hover:border-white/30 hover:bg-white/5'}`}
                        >
                            <span className="font-bold uppercase text-sm flex items-center gap-3">
                                <MapPin size={18} className={selectedSede === sede.id ? 'text-black' : 'text-[#D4E655]'} />
                                {sede.nombre}
                            </span>
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedSede === sede.id ? 'border-black' : 'border-white/20'}`}>
                                {selectedSede === sede.id && <div className="w-2 h-2 bg-black rounded-full" />}
                            </div>
                        </button>
                    ))}

                    <button
                        onClick={handleAbrirCaja}
                        disabled={!selectedSede || loading}
                        className="w-full py-4 bg-white text-black font-black uppercase rounded-xl hover:bg-gray-200 transition-all text-xs tracking-widest flex items-center justify-center gap-2 mt-6 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <><Play size={16} /> Iniciar Operación</>}
                    </button>
                </div>
            </div>
        </div>
    )
}