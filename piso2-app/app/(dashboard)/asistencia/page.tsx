'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MapPin, User, Plus, Search, Trash2, ArrowLeft, DollarSign, UserPlus } from 'lucide-react'

// --- TIPOS ---
type Clase = {
    id: string
    nombre: string
    inicio: string
    fin: string
    sala: { nombre: string; sede: { nombre: string } } | null
    profesor: { nombre_completo: string } | null
}

type Alumno = {
    id: string
    nombre_completo: string
    email: string
    rol: string
}

type Asistencia = {
    id: string
    alumno: Alumno
    pagado: boolean
    metodo_pago: string
}

export default function AsistenciaPage() {
    const supabase = createClient()

    // Estados Generales
    const [loading, setLoading] = useState(true)
    const [clasesHoy, setClasesHoy] = useState<Clase[]>([])
    const [selectedClase, setSelectedClase] = useState<Clase | null>(null)

    // Estados de la Clase
    const [asistentes, setAsistentes] = useState<Asistencia[]>([])
    const [busqueda, setBusqueda] = useState('')
    const [resultadosBusqueda, setResultadosBusqueda] = useState<Alumno[]>([])
    const [creandoInvitado, setCreandoInvitado] = useState(false)

    useEffect(() => {
        fetchClasesHoy()
    }, [])

    // 1. CARGAR CLASES (Con lógica de roles)
    const fetchClasesHoy = async () => {
        setLoading(true)
        const hoy = new Date()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        let query = supabase
            .from('clases')
            .select(`
        id, nombre, inicio, fin,
        sala:salas ( nombre, sede:sedes ( nombre ) ),
        profesor:profiles ( nombre_completo ),
        profesor_id
      `)
            .order('inicio', { ascending: true })

        const start = new Date(hoy.setHours(0, 0, 0, 0)).toISOString()
        const end = new Date(hoy.setHours(23, 59, 59, 999)).toISOString()
        query = query.gte('inicio', start).lte('inicio', end)

        const { data: clasesData } = await query

        if (clasesData) {
            const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
            let clasesFiltradas = clasesData as any[]

            // FILTRO DE ROL: Profesor ve solo suyas. Recepción/Admin ven todas.
            if (profile?.rol === 'profesor') {
                clasesFiltradas = clasesData.filter(c => c.profesor_id === user.id)
            }
            setClasesHoy(clasesFiltradas)
        }
        setLoading(false)
    }

    // 2. ABRIR CLASE
    const openClase = async (clase: Clase) => {
        setSelectedClase(clase)
        fetchAsistentes(clase.id)
    }

    const fetchAsistentes = async (claseId: string) => {
        const { data } = await supabase
            .from('asistencias')
            .select(`
        id, pagado, metodo_pago,
        alumno:profiles!alumno_id ( id, nombre_completo, email, rol )
      `)
            .eq('clase_id', claseId)

        if (data) setAsistentes(data as any)
    }

    // 3. BUSCADOR
    useEffect(() => {
        const searchAlumnos = async () => {
            if (busqueda.length < 2) {
                setResultadosBusqueda([])
                return
            }
            const { data } = await supabase
                .from('profiles')
                .select('id, nombre_completo, email, rol')
                .ilike('nombre_completo', `%${busqueda}%`)
                .limit(5)

            if (data) {
                // Filtrar los que ya están presentes
                const idsPresentes = asistentes.map(a => a.alumno.id)
                setResultadosBusqueda((data as any).filter((u: Alumno) => !idsPresentes.includes(u.id)))
            }
        }
        const timeout = setTimeout(searchAlumnos, 300)
        return () => clearTimeout(timeout)
    }, [busqueda, asistentes])

    // 4. AGREGAR EXISTENTE
    const handleAgregar = async (alumno: Alumno) => {
        if (!selectedClase) return
        const { error } = await supabase.from('asistencias').insert([{
            clase_id: selectedClase.id, alumno_id: alumno.id, presente: true, pagado: false
        }])

        if (!error) {
            fetchAsistentes(selectedClase.id)
            setBusqueda('')
        } else {
            alert('Error: ' + error.message)
        }
    }

    // 5. CREAR INVITADO (NUEVA FUNCIÓN) 🌟
    const handleCrearInvitado = async () => {
        if (!selectedClase || !busqueda) return
        setCreandoInvitado(true)

        // A. Crear Perfil "Fantasma"
        // Generamos un ID random (Supabase lo hace solo si omitimos ID, pero necesitamos el ID devuelto)
        // El email tiene que ser único, inventamos uno con timestamp
        const fakeEmail = `invitado-${Date.now()}@piso2.temp`

        const { data: newUser, error: userError } = await supabase
            .from('profiles')
            .insert([{
                id: crypto.randomUUID(),
                nombre_completo: busqueda, // Usamos lo que escribió en el buscador
                email: fakeEmail,
                rol: 'alumno' // Lo creamos como alumno/invitado
            }])
            .select()
            .single()

        if (userError) {
            alert('Error al crear invitado: ' + userError.message)
            setCreandoInvitado(false)
            return
        }

        // B. Asignarlo a la clase
        if (newUser) {
            const { error: asistError } = await supabase.from('asistencias').insert([{
                clase_id: selectedClase.id,
                alumno_id: newUser.id,
                presente: true,
                pagado: false
            }])

            if (!asistError) {
                fetchAsistentes(selectedClase.id)
                setBusqueda('')
            }
        }
        setCreandoInvitado(false)
    }

    // ACCIONES EXTRAS
    const handleBorrar = async (id: string) => {
        if (!confirm('¿Quitar de la lista?')) return
        await supabase.from('asistencias').delete().eq('id', id)
        if (selectedClase) fetchAsistentes(selectedClase.id)
    }

    const togglePagado = async (id: string, estado: boolean) => {
        await supabase.from('asistencias').update({ pagado: !estado }).eq('id', id)
        if (selectedClase) fetchAsistentes(selectedClase.id)
    }


    // --- VISTA LISTADO CLASES ---
    if (!selectedClase) {
        return (
            <div className="space-y-6 pb-20">
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Asistencia</h2>
                    <p className="text-piso2-lime text-sm font-bold uppercase tracking-widest">
                        {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
                    </p>
                </div>

                {loading ? <p className="text-gray-500 animate-pulse">Cargando clases...</p> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {clasesHoy.length > 0 ? clasesHoy.map(clase => (
                            <div key={clase.id} onClick={() => openClase(clase)} className="bg-[#09090b] border border-white/10 p-5 rounded-xl cursor-pointer hover:border-piso2-lime hover:bg-white/5 transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <span className="text-3xl font-black text-white group-hover:text-piso2-lime transition-colors">
                                        {format(new Date(clase.inicio), 'HH:mm')}
                                    </span>
                                    <span className="bg-white/10 text-[10px] font-bold uppercase px-2 py-1 rounded text-white border border-white/5">
                                        {clase.sala?.sede?.nombre}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold text-white uppercase leading-none mb-2">{clase.nombre}</h3>
                                <p className="text-xs text-gray-500 flex items-center gap-2"><MapPin size={12} /> {clase.sala?.nombre}</p>
                                <p className="text-xs text-gray-500 flex items-center gap-2 mt-1"><User size={12} /> {clase.profesor?.nombre_completo || 'Staff'}</p>
                                <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                                    <span className="text-xs font-bold text-piso2-lime uppercase flex items-center gap-1">Tomar Lista <ArrowLeft size={12} className="rotate-180" /></span>
                                </div>
                            </div>
                        )) : (
                            <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-xl text-gray-500">
                                <p>No hay clases para tu rol hoy.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    // --- VISTA DENTRO DE LA CLASE ---
    return (
        <div className="space-y-6 pb-20 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                <button onClick={() => setSelectedClase(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft size={20} className="text-white" /></button>
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">{selectedClase.nombre}</h2>
                    <p className="text-gray-400 text-xs mt-1">{format(new Date(selectedClase.inicio), 'HH:mm')} • {selectedClase.sala?.sede?.nombre}</p>
                </div>
                <div className="ml-auto text-right">
                    <span className="block text-3xl font-black text-piso2-lime">{asistentes.length}</span>
                    <span className="text-[10px] font-bold uppercase text-gray-500">Presentes</span>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 flex-1 overflow-hidden">

                {/* BUSCADOR + CREAR INVITADO */}
                <div className="lg:w-1/3 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-gray-500" size={18} />
                        <input
                            className="w-full bg-black border border-white/20 pl-10 pr-4 py-3 text-white outline-none focus:border-piso2-lime rounded-lg placeholder:text-gray-700 font-bold"
                            placeholder="Buscar o crear nuevo..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        {/* Resultados existentes */}
                        {resultadosBusqueda.map(alumno => (
                            <div key={alumno.id} onClick={() => handleAgregar(alumno)} className="flex items-center justify-between p-3 bg-[#111] border border-white/5 rounded-lg cursor-pointer hover:bg-piso2-lime hover:text-black group transition-colors">
                                <div><p className="font-bold text-sm">{alumno.nombre_completo}</p><p className="text-[10px] text-gray-500 group-hover:text-black/60">{alumno.rol}</p></div>
                                <Plus size={18} />
                            </div>
                        ))}

                        {/* BOTÓN MÁGICO: CREAR INVITADO */}
                        {busqueda.length >= 2 && resultadosBusqueda.length === 0 && (
                            <button
                                onClick={handleCrearInvitado}
                                disabled={creandoInvitado}
                                className="w-full flex items-center justify-between p-3 bg-piso2-blue/10 border border-piso2-blue/30 rounded-lg cursor-pointer hover:bg-piso2-blue hover:text-white group transition-all text-left"
                            >
                                <div>
                                    <p className="font-bold text-sm text-piso2-blue group-hover:text-white">
                                        {creandoInvitado ? 'Creando...' : `Crear Invitado: "${busqueda}"`}
                                    </p>
                                    <p className="text-[10px] text-piso2-blue/60 group-hover:text-white/80">
                                        No existe en la base. Agregarlo ahora.
                                    </p>
                                </div>
                                <UserPlus size={18} className="text-piso2-blue group-hover:text-white" />
                            </button>
                        )}
                    </div>
                </div>

                {/* LISTA DE PRESENTES */}
                <div className="flex-1 bg-[#111] rounded-xl border border-white/5 overflow-hidden flex flex-col">
                    <div className="p-4 bg-white/5 border-b border-white/5"><h3 className="font-bold text-white uppercase text-xs tracking-widest">Lista de Asistencia</h3></div>

                    <div className="overflow-y-auto flex-1 p-2 space-y-1">
                        {asistentes.length > 0 ? asistentes.map((asistencia) => (
                            <div key={asistencia.id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg group border-b border-white/5 last:border-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-gray-400">
                                        {asistencia.alumno.nombre_completo.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">{asistencia.alumno.nombre_completo}</p>
                                        <p className="text-[10px] text-gray-500 uppercase flex items-center gap-1">
                                            {asistencia.alumno.email.includes('invitado') ? <span className="text-yellow-500">Invitado</span> : asistencia.alumno.rol}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => togglePagado(asistencia.id, asistencia.pagado)} className={`px-3 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${asistencia.pagado ? 'bg-piso2-lime text-black' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                        <DollarSign size={10} /> {asistencia.pagado ? 'Pagado' : 'Debe'}
                                    </button>
                                    <button onClick={() => handleBorrar(asistencia.id)} className="text-gray-600 hover:text-red-500 transition-colors p-2"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        )) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50">
                                <User size={32} className="mb-2" />
                                <p className="text-xs uppercase font-bold">Aún no hay presentes</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}