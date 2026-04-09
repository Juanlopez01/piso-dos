'use client'

import { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { AuthChangeEvent, Session } from '@supabase/supabase-js'

type CashContextType = {
    userId: string | null // 👈 NUEVO: Lo guardamos acá para no pedirlo mil veces
    isBoxOpen: boolean
    currentTurnoId: string | null
    currentSedeId: string | null
    userRole: string | null
    userName: string | null
    nivelLiga: number | null
    hasLigaAccess: boolean
    hasCompaniaAccess: boolean
    checkStatus: () => Promise<void>
    isLoading: boolean
}

const CashContext = createContext<CashContextType>({
    userId: null, isBoxOpen: false, currentTurnoId: null, currentSedeId: null, userRole: null, userName: null, nivelLiga: null, hasLigaAccess: false, hasCompaniaAccess: false, checkStatus: async () => { }, isLoading: true
})

export const useCash = () => useContext(CashContext)

export function CashProvider({ children }: { children: React.ReactNode }) {
    const [supabase] = useState(() => createClient())

    const [userId, setUserId] = useState<string | null>(null) // 👈 NUEVO
    const [isBoxOpen, setIsBoxOpen] = useState(false)
    const [currentTurnoId, setCurrentTurnoId] = useState<string | null>(null)
    const [currentSedeId, setCurrentSedeId] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userName, setUserName] = useState<string | null>(null)
    const [nivelLiga, setNivelLiga] = useState<number | null>(null)
    const [hasLigaAccess, setHasLigaAccess] = useState(false)
    const [hasCompaniaAccess, setHasCompaniaAccess] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    const lastCheckedUser = useRef<string | null>(null)
    const isFetching = useRef(false)

    const fetchProfileAndBox = useCallback(async (uid: string, isMounted: boolean = true, force: boolean = false) => {
        if (isFetching.current) return;
        if (!force && lastCheckedUser.current === uid) return;

        isFetching.current = true;

        try {
            const { data: profile } = await supabase.from('profiles').select('rol, nombre_completo, nivel_liga').eq('id', uid).single();
            const rolReal = profile?.rol || 'alumno'

            let ligaAccess = false, compAccess = false;

            if (['admin', 'recepcion'].includes(rolReal)) {
                ligaAccess = true; compAccess = true;
            } else {
                if (rolReal === 'alumno') {
                    ligaAccess = !!profile?.nivel_liga;
                    const { data: comp } = await supabase.from('perfiles_companias').select('compania_id').eq('perfil_id', uid).limit(1);
                    compAccess = !!comp?.length;
                } else if (rolReal === 'profesor') {
                    const [resLiga, resComp] = await Promise.all([
                        supabase.from('clases').select('id').eq('profesor_id', uid).eq('es_la_liga', true).limit(1),
                        supabase.from('clases').select('id').eq('profesor_id', uid).not('compania_id', 'is', null).limit(1)
                    ]);
                    ligaAccess = !!resLiga.data?.length; compAccess = !!resComp.data?.length;
                }
            }

            if (isMounted) {
                setUserId(uid) // 👈 Guardamos el ID
                setUserRole(rolReal)
                setUserName(profile?.nombre_completo || 'Usuario')
                setNivelLiga(profile?.nivel_liga || null)
                setHasLigaAccess(ligaAccess)
                setHasCompaniaAccess(compAccess)
            }

            if (['admin', 'recepcion'].includes(rolReal)) {
                const { data: turno } = await supabase.from('caja_turnos').select('id, sede_id').eq('usuario_id', uid).eq('estado', 'abierta').maybeSingle();
                if (isMounted) {
                    setIsBoxOpen(!!turno); setCurrentTurnoId(turno?.id || null); setCurrentSedeId(turno?.sede_id || null);
                }
            }
            lastCheckedUser.current = uid;
        } catch (err) {
            console.error("Error fetching details:", err)
        } finally {
            isFetching.current = false;
        }
    }, [supabase])

    useEffect(() => {
        let isMounted = true;
        const initSession = async () => {
            try {
                if (isMounted) setIsLoading(true);
                const { data: { session } } = await supabase.auth.getSession();

                if (!session?.user) {
                    if (isMounted) {
                        setUserId(null); setUserRole('visitante'); setUserName(null); setNivelLiga(null); setIsBoxOpen(false); setHasLigaAccess(false); setHasCompaniaAccess(false); lastCheckedUser.current = null;
                    }
                    return;
                }
                await fetchProfileAndBox(session.user.id, isMounted, true)
            } catch (error) {
                console.error("Error inicializando sesión:", error)
            } finally {
                if (isMounted) setIsLoading(false)
            }
        }
        initSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
            if (event === 'SIGNED_OUT') {
                if (isMounted) {
                    setUserId(null); setUserRole('visitante'); setUserName(null); setNivelLiga(null); setIsBoxOpen(false); setCurrentTurnoId(null); setCurrentSedeId(null); setHasLigaAccess(false); setHasCompaniaAccess(false); setIsLoading(false); lastCheckedUser.current = null;
                }
            } else if (event === 'SIGNED_IN' && session?.user) {
                await fetchProfileAndBox(session.user.id, isMounted, true)
                if (isMounted) setIsLoading(false)
            }
        })
        return () => { isMounted = false; subscription.unsubscribe(); }
    }, [fetchProfileAndBox, supabase])

    const checkStatus = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) await fetchProfileAndBox(session.user.id, true, true)
    }, [fetchProfileAndBox, supabase])

    const contextValue = useMemo(() => ({
        userId, isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, hasLigaAccess, hasCompaniaAccess, checkStatus, isLoading
    }), [userId, isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, hasLigaAccess, hasCompaniaAccess, checkStatus, isLoading])

    return <CashContext.Provider value={contextValue}>{children}</CashContext.Provider>
}