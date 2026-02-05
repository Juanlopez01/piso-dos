'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { MapPin, Plus, Trash2, Home, LayoutTemplate } from 'lucide-react'

// Definimos los tipos de datos (Sede contiene un array de Salas)
type Sala = {
    id: string
    nombre: string
}

type Sede = {
    id: string
    nombre: string
    direccion: string | null
    salas: Sala[]
}

export default function SedesPage() {
    const supabase = createClient()
    const [sedes, setSedes] = useState<Sede[]>([])
    const [loading, setLoading] = useState(true)

    // Estados para crear SEDE
    const [nombreSede, setNombreSede] = useState('')
    const [direccionSede, setDireccionSede] = useState('')

    // Estado temporal para crear SALA (Guardamos el nombre que se está escribiendo en cada sede)
    // Ejemplo: { 'id-sede-1': 'Sala Nueva' }
    const [inputsSala, setInputsSala] = useState<Record<string, string>>({})

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        // TRUCO: Pedimos las sedes Y sus salas anidadas
        const { data } = await supabase
            .from('sedes')
            .select('*, salas(*)')
            .order('created_at', { ascending: true })

        if (data) setSedes(data)
        setLoading(false)
    }

    // --- LÓGICA DE SEDES ---
    const handleCrearSede = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!nombreSede) return
        const { error } = await supabase.from('sedes').insert([{ nombre: nombreSede, direccion: direccionSede }])
        if (!error) {
            setNombreSede(''); setDireccionSede(''); fetchData();
        }
    }

    const handleBorrarSede = async (id: string) => {
        if (!confirm('¿Seguro? Se borrarán todas las salas y clases de esta sede.')) return
        const { error } = await supabase.from('sedes').delete().match({ id })
        if (!error) fetchData()
    }

    // --- LÓGICA DE SALAS ---
    const handleCrearSala = async (sedeId: string) => {
        const nombreSala = inputsSala[sedeId]
        if (!nombreSala) return

        const { error } = await supabase.from('salas').insert([{ nombre: nombreSala, sede_id: sedeId }])

        if (error) {
            alert(error.message)
        } else {
            // Limpiar el input solo de esa sede
            setInputsSala(prev => ({ ...prev, [sedeId]: '' }))
            fetchData()
        }
    }

    const handleBorrarSala = async (salaId: string) => {
        if (!confirm('¿Borrar esta sala?')) return
        const { error } = await supabase.from('salas').delete().match({ id: salaId })
        if (!error) fetchData()
    }

    return (
        <div className="space-y-8 pb-20">

            {/* HEADER */}
            <div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Sedes y Salas</h2>
            </div>

            {/* FORMULARIO CREAR SEDE */}
            <form onSubmit={handleCrearSede} className="bg-piso2-gray p-6 border border-white/10 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Nueva Sede</label>
                    <input
                        value={nombreSede} onChange={(e) => setNombreSede(e.target.value)}
                        placeholder="Nombre de la Sede"
                        className="w-full bg-black border border-white/20 text-white p-3 focus:border-piso2-lime outline-none"
                    />
                </div>
                <div className="flex-1 w-full">
                    <input
                        value={direccionSede} onChange={(e) => setDireccionSede(e.target.value)}
                        placeholder="Dirección (Opcional)"
                        className="w-full bg-black border border-white/20 text-white p-3 focus:border-piso2-lime outline-none"
                    />
                </div>
                <button type="submit" className="bg-white text-black font-bold uppercase px-6 py-3 hover:bg-piso2-lime transition-colors w-full md:w-auto">
                    Crear Sede
                </button>
            </form>

            {/* GRILLA DE SEDES */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {loading ? <p>Cargando...</p> : sedes.map((sede) => (
                    <div key={sede.id} className="bg-black border border-white/10 flex flex-col">

                        {/* CABECERA DE LA TARJETA (SEDE) */}
                        <div className="p-6 border-b border-white/10 flex justify-between items-start bg-white/5">
                            <div className="flex gap-4">
                                <div className="bg-piso2-lime p-3 rounded-none text-black">
                                    <Home size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white uppercase">{sede.nombre}</h3>
                                    <div className="flex items-center gap-2 text-gray-400 text-xs mt-1">
                                        <MapPin size={12} /> {sede.direccion || 'Sin dirección'}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => handleBorrarSede(sede.id)} className="text-gray-600 hover:text-red-500 p-2">
                                <Trash2 size={18} />
                            </button>
                        </div>

                        {/* CUERPO DE LA TARJETA (SALAS) */}
                        <div className="p-6 flex-1 space-y-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                                <LayoutTemplate size={14} /> Salas Disponibles
                            </h4>

                            {/* Lista de salas existentes */}
                            <div className="space-y-2">
                                {sede.salas && sede.salas.length > 0 ? (
                                    sede.salas.map(sala => (
                                        <div key={sala.id} className="flex justify-between items-center bg-piso2-gray px-4 py-3 border-l-2 border-piso2-lime">
                                            <span className="text-sm font-bold text-white uppercase">{sala.nombre}</span>
                                            <button onClick={() => handleBorrarSala(sala.id)} className="text-gray-600 hover:text-red-500">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-gray-600 text-xs italic">No hay salas creadas aún.</p>
                                )}
                            </div>
                        </div>

                        {/* PIE DE LA TARJETA (AGREGAR SALA) */}
                        <div className="p-4 bg-piso2-gray/50 border-t border-white/10 flex gap-2">
                            <input
                                placeholder="Nombre nueva sala..."
                                className="flex-1 bg-black border border-white/10 text-white text-sm px-3 py-2 focus:border-piso2-lime outline-none"
                                value={inputsSala[sede.id] || ''}
                                onChange={(e) => setInputsSala(prev => ({ ...prev, [sede.id]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && handleCrearSala(sede.id)}
                            />
                            <button
                                onClick={() => handleCrearSala(sede.id)}
                                className="bg-piso2-lime/20 text-piso2-lime hover:bg-piso2-lime hover:text-black border border-piso2-lime px-3 transition-colors"
                            >
                                <Plus size={20} />
                            </button>
                        </div>

                    </div>
                ))}
            </div>
        </div>
    )
}