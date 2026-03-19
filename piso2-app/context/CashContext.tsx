'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

type CashContextType = {
    isBoxOpen: boolean
    currentTurnoId: string | null
    currentSedeId: string | null
    userRole: string | null
    userName: string | null
    nivelLiga: number | null
    checkStatus: () => Promise<void>
    isLoading: boolean
}

const CashContext = createContext<CashContextType>({
    isBoxOpen: false, currentTurnoId: null, currentSedeId: null, userRole: null, userName: null, nivelLiga: null, checkStatus: async () => { }, isLoading: true
})

export const useCash = () => useContext(CashContext)

export function CashProvider({ children }: { children: React.ReactNode }) {
    const supabase = createClient()

    const [isBoxOpen, setIsBoxOpen] = useState(false)
    const [currentTurnoId, setCurrentTurnoId] = useState<string | null>(null)
    const [currentSedeId, setCurrentSedeId] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userName, setUserName] = useState<string | null>(null)
    const [nivelLiga, setNivelLiga] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    // El candado anti-spam sigue activo para proteger la DB
    const isFetchingRef = useRef(false)

    const fetchProfileAndBox = async (userId: string, isMounted: boolean = true) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        try {
            // Le sacamos el límite de tiempo. Ahora espera la respuesta real sí o sí.
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('rol, nombre_completo, nivel_liga')
                .eq('id', userId)
                .maybeSingle();

            if (profileError) throw profileError;

            if (isMounted && profile) {
                const rolReal = profile.rol || 'alumno'
                setUserRole(rolReal)
                setUserName(profile.nombre_completo || 'Usuario')
                setNivelLiga(profile.nivel_liga || null)

                if (['admin', 'recepcion'].includes(rolReal)) {
                    // También esperamos tranquilos el estado de la caja
                    const { data: turno } = await supabase
                        .from('caja_turnos')
                        .select('id, sede_id')
                        .eq('usuario_id', userId)
                        .eq('estado', 'abierta')
                        .maybeSingle();

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
            }
        } catch (err) {
            console.error("Error fetching details:", err)
        } finally {
            isFetchingRef.current = false;
        }
    }

    useEffect(() => {
        let isMounted = true;

        // Timeout de emergencia gigante (8 segundos) solo para que no se trabe el loader inicial
        const failsafeTimeout = setTimeout(() => {
            if (isMounted && isLoading) setIsLoading(false)
        }, 8000);

        const initSession = async () => {
            try {
                if (isMounted) setIsLoading(true);

                // Pedimos la sesión sin apurarla
                const { data: sessionData, error } = await supabase.auth.getSession();

                if (error || !sessionData?.session?.user) {
                    if (isMounted) {
                        setUserRole('visitante')
                        setUserName(null)
                        setNivelLiga(null)
                        setIsBoxOpen(false)
                    }
                    return;
                }

                await fetchProfileAndBox(sessionData.session.user.id, isMounted)

            } catch (error) {
                console.error("Error inicializando sesión global:", error)
            } finally {
                clearTimeout(failsafeTimeout)
                if (isMounted) setIsLoading(false)
            }
        }

        initSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
                if (isMounted) {
                    setUserRole('visitante')
                    setUserName(null)
                    setNivelLiga(null)
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
            clearTimeout(failsafeTimeout);
            subscription.unsubscribe()
        }
    }, [])

    const checkStatus = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) await fetchProfileAndBox(session.user.id)
    }

    return (
        <CashContext.Provider value={{ isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, checkStatus, isLoading }}>
            {children}
        </CashContext.Provider>
    )
}