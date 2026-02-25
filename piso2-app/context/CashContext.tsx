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

    // Función auxiliar para cargar datos del perfil una vez que tenemos usuario
    const fetchProfileAndBox = async (userId: string) => {
        try {
            // 1. Buscar Perfil
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('rol, nombre_completo')
                .eq('id', userId)
                .maybeSingle()

            if (profileError) console.error("Error perfil:", profileError)

            const rolReal = profile?.rol || 'alumno'
            setUserRole(rolReal)
            setUserName(profile?.nombre_completo || 'Usuario')

            // 2. Buscar Caja (Solo si es Staff)
            if (['admin', 'recepcion'].includes(rolReal)) {
                const { data: turno } = await supabase.from('caja_turnos')
                    .select('id, sede_id')
                    .eq('usuario_id', userId)
                    .eq('estado', 'abierta')
                    .maybeSingle()

                if (turno) {
                    setIsBoxOpen(true)
                    setCurrentTurnoId(turno.id)
                    setCurrentSedeId(turno.sede_id)
                } else {
                    setIsBoxOpen(false)
                }
            }
        } catch (err) {
            console.error("Error fetching details:", err)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        console.log("🔄 Iniciando listener de autenticación...")

        // SUSCRIPCIÓN A CAMBIOS DE AUTH (Login, Logout, Auto-restore)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("🔔 Evento Auth:", event)

            if (session?.user) {
                console.log("✅ Usuario detectado:", session.user.email)
                await fetchProfileAndBox(session.user.id)
            } else {
                console.log("👀 Sin usuario (Visitante)")
                setUserRole('visitante')
                setUserName(null)
                setIsBoxOpen(false)
                setIsLoading(false)
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [])

    // Mantenemos checkStatus por compatibilidad, pero ya no es el motor principal
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