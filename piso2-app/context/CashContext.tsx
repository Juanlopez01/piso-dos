'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type CashContextType = {
    isBoxOpen: boolean
    currentTurnoId: string | null
    currentSedeId: string | null
    userRole: string | null
    userName: string | null
    checkStatus: () => Promise<void>
    isLoading: boolean
}

const CashContext = createContext<CashContextType>({
    isBoxOpen: false, currentTurnoId: null, currentSedeId: null, userRole: null, userName: null, checkStatus: async () => { }, isLoading: true
})

export const useCash = () => useContext(CashContext)

export function CashProvider({ children }: { children: React.ReactNode }) {
    const supabase = createClient()

    const [isBoxOpen, setIsBoxOpen] = useState(false)
    const [currentTurnoId, setCurrentTurnoId] = useState<string | null>(null)
    const [currentSedeId, setCurrentSedeId] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userName, setUserName] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    // Agregamos isMounted para evitar actualizar estados si cambiamos de página rápido
    const fetchProfileAndBox = async (userId: string, isMounted: boolean = true) => {
        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('rol, nombre_completo')
                .eq('id', userId)
                .maybeSingle()

            if (profileError) console.error("Error perfil:", profileError)

            const rolReal = profile?.rol || 'alumno'

            if (isMounted) {
                setUserRole(rolReal)
                setUserName(profile?.nombre_completo || 'Usuario')
            }

            if (['admin', 'recepcion'].includes(rolReal)) {
                const { data: turno } = await supabase.from('caja_turnos')
                    .select('id, sede_id')
                    .eq('usuario_id', userId)
                    .eq('estado', 'abierta')
                    .maybeSingle()

                if (isMounted) {
                    if (turno) {
                        setIsBoxOpen(true)
                        setCurrentTurnoId(turno.id)
                        setCurrentSedeId(turno.sede_id)
                    } else {
                        setIsBoxOpen(false)
                        setCurrentTurnoId(null)
                        setCurrentSedeId(null)
                    }
                }
            }
        } catch (err) {
            console.error("Error fetching details:", err)
        }
    }

    useEffect(() => {
        let isMounted = true;
        console.log("🔄 Iniciando verificación de sesión...")

        const initSession = async () => {
            try {
                if (isMounted) setIsLoading(true);

                // 1. Verificación imperativa: Vamos a buscar la sesión sí o sí al cargar
                const { data: { session }, error } = await supabase.auth.getSession()

                if (error || !session?.user) {
                    console.log("👀 Sin usuario activo (Visitante)")
                    if (isMounted) {
                        setUserRole('visitante')
                        setUserName(null)
                        setIsBoxOpen(false)
                    }
                    return; // Cortamos acá
                }

                console.log("✅ Usuario detectado en inicio:", session.user.email)
                await fetchProfileAndBox(session.user.id, isMounted)

            } catch (error) {
                console.error("❌ Error inicializando sesión:", error)
            } finally {
                // EL SALVAVIDAS: Pase lo que pase, apagamos el loading
                if (isMounted) setIsLoading(false)
            }
        }

        // Ejecutamos la carga inicial
        initSession()

        // 2. EL DESPERTADOR: Actúa solo si hay un cambio de estado en vivo
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("🔔 Evento Auth:", event)

            if (event === 'SIGNED_OUT') {
                if (isMounted) {
                    setUserRole('visitante')
                    setUserName(null)
                    setIsBoxOpen(false)
                    setCurrentTurnoId(null)
                    setCurrentSedeId(null)
                    setIsLoading(false)
                }
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session?.user) {
                    await fetchProfileAndBox(session.user.id, isMounted)
                    if (isMounted) setIsLoading(false)
                }
            }
        })

        return () => {
            isMounted = false;
            subscription.unsubscribe()
        }
    }, [])

    const checkStatus = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) await fetchProfileAndBox(user.id)
    }

    return (
        <CashContext.Provider value={{ isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, checkStatus, isLoading }}>
            {children}
        </CashContext.Provider>
    )
}