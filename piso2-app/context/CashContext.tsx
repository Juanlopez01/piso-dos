'use client'

import { createContext, useContext, useEffect, useState } from 'react'
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

    const fetchProfileAndBox = async (userId: string, isMounted: boolean = true) => {
        try {
            // Le damos tiempo al celular para que traiga el perfil sin apurarlo
            const { data: profile } = await supabase
                .from('profiles')
                .select('rol, nombre_completo, nivel_liga')
                .eq('id', userId)
                .maybeSingle();

            const rolReal = profile?.rol || 'alumno'

            if (isMounted) {
                setUserRole(rolReal)
                setUserName(profile?.nombre_completo || 'Usuario')
                setNivelLiga(profile?.nivel_liga || null)
            }

            // Solo Admin y Recepción manejan caja
            if (['admin', 'recepcion'].includes(rolReal)) {
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
        } catch (err) {
            console.error("Error fetching details:", err)
        }
    }

    useEffect(() => {
        let isMounted = true;

        const initSession = async () => {
            try {
                if (isMounted) setIsLoading(true);

                // 🛑 CORRECCIÓN CRÍTICA: Ya no competimos contra el reloj. 
                // Esperamos la sesión oficial del navegador móvil.
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error || !session?.user) {
                    if (isMounted) {
                        setUserRole('visitante')
                        setUserName(null)
                        setNivelLiga(null)
                        setIsBoxOpen(false)
                    }
                    return;
                }

                await fetchProfileAndBox(session.user.id, isMounted)

            } catch (error) {
                console.error("Error inicializando sesión global:", error)
            } finally {
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