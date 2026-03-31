'use client'

import { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { AuthChangeEvent, Session } from '@supabase/supabase-js'

type CashContextType = {
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
    isBoxOpen: false, currentTurnoId: null, currentSedeId: null, userRole: null, userName: null, nivelLiga: null, hasLigaAccess: false, hasCompaniaAccess: false, checkStatus: async () => { }, isLoading: true
})

export const useCash = () => useContext(CashContext)

export function CashProvider({ children }: { children: React.ReactNode }) {
    const [supabase] = useState(() => createClient())

    const [isBoxOpen, setIsBoxOpen] = useState(false)
    const [currentTurnoId, setCurrentTurnoId] = useState<string | null>(null)
    const [currentSedeId, setCurrentSedeId] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userName, setUserName] = useState<string | null>(null)
    const [nivelLiga, setNivelLiga] = useState<number | null>(null)

    const [hasLigaAccess, setHasLigaAccess] = useState(false)
    const [hasCompaniaAccess, setHasCompaniaAccess] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // 🌟 OPTIMIZACIÓN: Ref para saber quién fue el último usuario chequeado y no recargar de más
    const lastCheckedUser = useRef<string | null>(null)
    const isFetching = useRef(false)

    const fetchProfileAndBox = useCallback(async (userId: string, isMounted: boolean = true, force: boolean = false) => {
        // 🌟 OPTIMIZACIÓN: Si ya estamos trayendo datos o si es el mismo usuario y no forzamos, cortamos.
        if (isFetching.current) return;
        if (!force && lastCheckedUser.current === userId) return;

        isFetching.current = true;

        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('rol, nombre_completo, nivel_liga')
                .eq('id', userId)
                .maybeSingle();

            const rolReal = profile?.rol || 'alumno'

            let ligaAccess = false;
            let compAccess = false;

            if (['admin', 'recepcion'].includes(rolReal)) {
                ligaAccess = true;
                compAccess = true;
            } else {
                if (rolReal === 'alumno') {
                    ligaAccess = !!profile?.nivel_liga;
                    const { data: comp } = await supabase.from('perfiles_companias').select('compania_id').eq('perfil_id', userId).limit(1);
                    compAccess = !!comp?.length;
                } else if (rolReal === 'profesor') {
                    const [resLiga, resComp] = await Promise.all([
                        supabase.from('clases').select('id').eq('profesor_id', userId).eq('es_la_liga', true).limit(1),
                        supabase.from('clases').select('id').eq('profesor_id', userId).not('compania_id', 'is', null).limit(1)
                    ]);
                    ligaAccess = !!resLiga.data?.length;
                    compAccess = !!resComp.data?.length;
                } else if (rolReal === 'coordinador') {
                    ligaAccess = true;
                    const { data: comp } = await supabase.from('companias').select('id').eq('coordinador_id', userId).limit(1);
                    compAccess = !!comp?.length;
                }
            }

            if (isMounted) {
                setUserRole(rolReal)
                setUserName(profile?.nombre_completo || 'Usuario')
                setNivelLiga(profile?.nivel_liga || null)
                setHasLigaAccess(ligaAccess)
                setHasCompaniaAccess(compAccess)
            }

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

            lastCheckedUser.current = userId; // Marcamos como último chequeado exitoso
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

                const { data: { session }, error } = await supabase.auth.getSession();

                if (error || !session?.user) {
                    if (isMounted) {
                        setUserRole('visitante')
                        setUserName(null)
                        setNivelLiga(null)
                        setIsBoxOpen(false)
                        setHasLigaAccess(false)
                        setHasCompaniaAccess(false)
                        lastCheckedUser.current = null;
                    }
                    return;
                }

                await fetchProfileAndBox(session.user.id, isMounted, true) // Forzamos en la primera carga

            } catch (error) {
                console.error("Error inicializando sesión global:", error)
            } finally {
                if (isMounted) setIsLoading(false)
            }
        }

        initSession()

        // 👇 EL DESPERTADOR CON FRENO 👇
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
                    if (session?.user && isMounted) {
                        // Solo recarga si cambió de usuario de fondo
                        if (session.user.id !== lastCheckedUser.current) {
                            fetchProfileAndBox(session.user.id, isMounted, true);
                        }
                    }
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
            if (event === 'SIGNED_OUT') {
                if (isMounted) {
                    setUserRole('visitante')
                    setUserName(null)
                    setNivelLiga(null)
                    setIsBoxOpen(false)
                    setCurrentTurnoId(null)
                    setCurrentSedeId(null)
                    setHasLigaAccess(false)
                    setHasCompaniaAccess(false)
                    setIsLoading(false)
                    lastCheckedUser.current = null;
                }
            } else if (event === 'SIGNED_IN') { // Sacamos el TOKEN_REFRESHED para no spamear la base de datos
                if (session?.user) {
                    await fetchProfileAndBox(session.user.id, isMounted, true)
                    if (isMounted) setIsLoading(false)
                }
            }
        })

        return () => {
            isMounted = false;
            subscription.unsubscribe();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
    }, [fetchProfileAndBox, supabase])

    const checkStatus = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) await fetchProfileAndBox(session.user.id, true, true) // Check manual fuerza la recarga
    }, [fetchProfileAndBox, supabase])

    const contextValue = useMemo(() => ({
        isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, hasLigaAccess, hasCompaniaAccess, checkStatus, isLoading
    }), [isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, hasLigaAccess, hasCompaniaAccess, checkStatus, isLoading])

    return (
        <CashContext.Provider value={contextValue}>
            {children}
        </CashContext.Provider>
    )
}