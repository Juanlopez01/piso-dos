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

    const fetchProfileAndBox = async (userId: string, isMounted: boolean = true) => {
        try {
            // 🛡️ ESCUDO DB: Máximo 4 segundos o pasa de largo
            const { data: profile, error: profileError } = await Promise.race([
                supabase.from('profiles').select('rol, nombre_completo').eq('id', userId).maybeSingle(),
                new Promise((resolve) => setTimeout(() => resolve({ data: null, error: new Error("TIMEOUT_DB") }), 4000))
            ]) as any;

            if (profileError) console.error("Error perfil:", profileError)

            const rolReal = profile?.rol || 'alumno'

            if (isMounted) {
                setUserRole(rolReal)
                setUserName(profile?.nombre_completo || 'Usuario')
            }

            if (['admin', 'recepcion'].includes(rolReal)) {
                // 🛡️ ESCUDO CAJA: Máximo 4 segundos
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
        }
    }

    useEffect(() => {
        let isMounted = true;
        console.log("🔄 Iniciando verificación global de sesión...")

        // 🚨 EL FAILSAFE GLOBAL IMPLACABLE: Destraba TODA la aplicación a los 4 segundos
        const failsafeTimeout = setTimeout(() => {
            if (isMounted) {
                console.warn("⏳ [FAILSAFE GLOBAL] Supabase se tildó. Destrabando la app completa a la fuerza.");
                setIsLoading(false);
            }
        }, 4000);

        const initSession = async () => {
            try {
                if (isMounted) setIsLoading(true);

                // 1. Verificación imperativa BLINDADA
                const { data: sessionData, error } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise((resolve) => setTimeout(() => resolve({ data: { session: null }, error: new Error("TIMEOUT_SESSION") }), 3000))
                ]) as any;

                if (error || !sessionData?.session?.user) {
                    console.log("👀 Sin usuario activo (Visitante)")
                    if (isMounted) {
                        setUserRole('visitante')
                        setUserName(null)
                        setIsBoxOpen(false)
                    }
                    return; // Cortamos acá
                }

                console.log("✅ Usuario global detectado:", sessionData.session.user.email)
                await fetchProfileAndBox(sessionData.session.user.id, isMounted)

            } catch (error) {
                console.error("❌ Error inicializando sesión global:", error)
            } finally {
                // EL SALVAVIDAS: Pase lo que pase, apagamos el timer y el loading
                clearTimeout(failsafeTimeout)
                if (isMounted) setIsLoading(false)
            }
        }

        // Ejecutamos la carga inicial
        initSession()

        // 2. EL DESPERTADOR: Actúa solo si hay un cambio de estado en vivo
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("🔔 Evento Auth Global:", event)

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
            clearTimeout(failsafeTimeout);
            subscription.unsubscribe()
        }
    }, [])

    const checkStatus = async () => {
        // 👈 CAMBIO CLAVE: Usamos getSession para no asfixiar al servidor si se llama desde otra parte
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) await fetchProfileAndBox(session.user.id)
    }

    return (
        <CashContext.Provider value={{ isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, checkStatus, isLoading }}>
            {children}
        </CashContext.Provider>
    )
}