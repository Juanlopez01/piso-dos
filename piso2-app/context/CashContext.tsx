'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

type CashContextType = {
    isBoxOpen: boolean
    currentTurnoId: string | null
    currentSedeId: string | null
    userRole: string | null
    userName: string | null
    nivelLiga: number | null // 👈 NUEVA VARIABLE
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
    const [nivelLiga, setNivelLiga] = useState<number | null>(null) // 👈 NUEVO ESTADO
    const [isLoading, setIsLoading] = useState(true)

    const isFetchingRef = useRef(false)

    const fetchProfileAndBox = async (userId: string, isMounted: boolean = true) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        try {
            // 👈 NUEVO: Pedimos el nivel_liga a la BD
            const { data: profile } = await Promise.race([
                supabase.from('profiles').select('rol, nombre_completo, nivel_liga').eq('id', userId).maybeSingle(),
                new Promise((resolve) => setTimeout(() => resolve({ data: null }), 4000))
            ]) as any;

            const rolReal = profile?.rol || 'alumno'

            if (isMounted) {
                setUserRole(rolReal)
                setUserName(profile?.nombre_completo || 'Usuario')
                setNivelLiga(profile?.nivel_liga || null) // 👈 LO GUARDAMOS
            }

            if (['admin', 'recepcion'].includes(rolReal)) {
                const { data: turno } = await Promise.race([
                    supabase.from('caja_turnos').select('id, sede_id').eq('usuario_id', userId).eq('estado', 'abierta').maybeSingle(),
                    new Promise((resolve) => setTimeout(() => resolve({ data: null }), 4000))
                ]) as any;

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
        } finally {
            isFetchingRef.current = false;
        }
    }

    useEffect(() => {
        let isMounted = true;
        const failsafeTimeout = setTimeout(() => { if (isMounted) setIsLoading(false) }, 5000);

        const initSession = async () => {
            try {
                if (isMounted) setIsLoading(true);
                const { data: sessionData, error } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise((resolve) => setTimeout(() => resolve({ data: { session: null }, error: new Error("TIMEOUT") }), 3000))
                ]) as any;

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