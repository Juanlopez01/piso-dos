'use client'

import { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { AuthChangeEvent, Session } from '@supabase/supabase-js'

type CashContextType = {
    userId: string | null
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

    const [userId, setUserId] = useState<string | null>(null)
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

    console.log(`🟠 [CashContext] Render. isLoading=${isLoading} | userId=${userId} | isFetchingRef=${isFetching.current}`)

    const fetchProfileAndBox = useCallback(async (uid: string, isMounted: boolean = true, force: boolean = false) => {
        console.log(`🟠 [CashContext] -> Iniciando fetchProfileAndBox para UID: ${uid} | force: ${force}`)

        if (isFetching.current) {
            console.log("🟠 [CashContext] -> ABORTADO: Ya hay un fetch en progreso.")
            return;
        }
        if (!force && lastCheckedUser.current === uid) {
            console.log("🟠 [CashContext] -> ABORTADO: Ya tenemos la info de este usuario cacheadita.")
            return;
        }

        isFetching.current = true;
        console.log("🟠 [CashContext] -> Candado isFetching activado.")

        try {
            console.log("🟠 [CashContext] -> Consultando tabla 'profiles'...")
            const { data: profile, error: profErr } = await supabase.from('profiles').select('rol, nombre_completo, nivel_liga').eq('id', uid).single();
            if (profErr) console.error("❌ [CashContext] Error al buscar perfil:", profErr);

            const rolReal = profile?.rol || 'alumno'
            console.log(`🟠 [CashContext] -> Perfil encontrado. Rol: ${rolReal}`)

            let ligaAccess = false, compAccess = false;

            if (['admin', 'recepcion'].includes(rolReal)) {
                ligaAccess = true; compAccess = true;
            } else {
                if (rolReal === 'alumno') {
                    ligaAccess = !!profile?.nivel_liga;
                    console.log("🟠 [CashContext] -> Buscando permisos de compañía para alumno...")
                    const { data: comp } = await supabase.from('perfiles_companias').select('compania_id').eq('perfil_id', uid).limit(1);
                    compAccess = !!comp?.length;
                } else if (rolReal === 'profesor') {
                    console.log("🟠 [CashContext] -> Buscando permisos de liga/compañía para profesor...")
                    const [resLiga, resComp] = await Promise.all([
                        supabase.from('clases').select('id').eq('profesor_id', uid).eq('es_la_liga', true).limit(1),
                        supabase.from('clases').select('id').eq('profesor_id', uid).not('compania_id', 'is', null).limit(1)
                    ]);
                    ligaAccess = !!resLiga.data?.length; compAccess = !!resComp.data?.length;
                }
            }

            if (isMounted) {
                console.log("🟠 [CashContext] -> Guardando estados en React...")
                setUserId(uid)
                setUserRole(rolReal)
                setUserName(profile?.nombre_completo || 'Usuario')
                setNivelLiga(profile?.nivel_liga || null)
                setHasLigaAccess(ligaAccess)
                setHasCompaniaAccess(compAccess)
            }

            if (['admin', 'recepcion'].includes(rolReal)) {
                console.log("🟠 [CashContext] -> Consultando turnos de caja para Admin/Recepcion...")
                const { data: turno } = await supabase.from('caja_turnos').select('id, sede_id').eq('usuario_id', uid).eq('estado', 'abierta').maybeSingle();
                if (isMounted) {
                    setIsBoxOpen(!!turno); setCurrentTurnoId(turno?.id || null); setCurrentSedeId(turno?.sede_id || null);
                }
            }
            lastCheckedUser.current = uid;
            console.log("🟠 [CashContext] -> FETCH EXITOSO Y COMPLETADO.")
        } catch (err) {
            console.error("❌ [CashContext] Error brutal en fetchProfileAndBox:", err)
        } finally {
            isFetching.current = false;
            console.log("🟠 [CashContext] -> Candado isFetching desactivado.")
        }
    }, [supabase])

    useEffect(() => {
        console.log("🟠 [CashContext] Montando useEffect principal de sesión...")
        let isMounted = true;

        const initSession = async () => {
            console.log("🟠 [CashContext] Ejecutando initSession()...")
            try {
                if (isMounted) setIsLoading(true);

                console.log("🟠 [CashContext] Pidiendo sesión a Supabase...")
                const { data: { session }, error: sessErr } = await supabase.auth.getSession();

                if (sessErr) console.error("❌ [CashContext] Error al pedir sesión:", sessErr)
                console.log(`🟠 [CashContext] Resultado sesión: ${session ? 'Usuario logueado' : 'No hay usuario'}`)

                if (!session?.user) {
                    console.log("🟠 [CashContext] Limpiando estados a default (Visitante)")
                    if (isMounted) {
                        setUserId(null); setUserRole('visitante'); setUserName(null); setNivelLiga(null); setIsBoxOpen(false); setHasLigaAccess(false); setHasCompaniaAccess(false); lastCheckedUser.current = null;
                    }
                    return;
                }

                console.log("🟠 [CashContext] Usuario detectado. Llamando a fetchProfileAndBox...")
                await fetchProfileAndBox(session.user.id, isMounted, true)

            } catch (error) {
                console.error("❌ [CashContext] Error crítico en initSession:", error)
            } finally {
                console.log("🟠 [CashContext] Bloque Finally de initSession. Apagando Loader General.")
                if (isMounted) setIsLoading(false)
            }
        }

        initSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
            console.log(`🟠 [CashContext] Auth event escuchado: ${event}`)
            if (event === 'SIGNED_OUT') {
                if (isMounted) {
                    setUserId(null); setUserRole('visitante'); setUserName(null); setNivelLiga(null); setIsBoxOpen(false); setCurrentTurnoId(null); setCurrentSedeId(null); setHasLigaAccess(false); setHasCompaniaAccess(false); setIsLoading(false); lastCheckedUser.current = null;
                }
            } else if (event === 'SIGNED_IN' && session?.user) {
                await fetchProfileAndBox(session.user.id, isMounted, true)
                if (isMounted) setIsLoading(false)
            }
        })

        return () => {
            console.log("🟠 [CashContext] Desmontando componente...")
            isMounted = false; subscription.unsubscribe();
        }
    }, [fetchProfileAndBox, supabase])

    const checkStatus = useCallback(async () => {
        console.log("🟠 [CashContext] checkStatus forzado disparado.")
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) await fetchProfileAndBox(session.user.id, true, true)
    }, [fetchProfileAndBox, supabase])

    const contextValue = useMemo(() => ({
        userId, isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, hasLigaAccess, hasCompaniaAccess, checkStatus, isLoading
    }), [userId, isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, hasLigaAccess, hasCompaniaAccess, checkStatus, isLoading])

    return <CashContext.Provider value={contextValue}>{children}</CashContext.Provider>
}