'use client'

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef, ReactNode } from 'react'
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

export function CashProvider({ children }: { children: ReactNode }) {
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

    const fetchProfileAndBox = useCallback(async (uid: string, force: boolean = false) => {
        console.log(`🟠 [CashContext] -> Iniciando fetchProfileAndBox para UID: ${uid} | force: ${force}`)

        if (isFetching.current) {
            console.log("🟠 [CashContext] -> ABORTADO: Ya hay un fetch en progreso.")
            return;
        }
        if (!force && lastCheckedUser.current === uid) {
            console.log("🟠 [CashContext] -> ABORTADO: Info ya en caché.")
            return;
        }

        isFetching.current = true;
        console.log("🟠 [CashContext] -> Candado isFetching activado.")

        try {
            const realizarConsulta = async () => {
                console.log("🟠 [CashContext] -> Consultando tabla 'profiles'...")
                const { data: profile, error: profErr } = await supabase.from('profiles').select('rol, nombre_completo, nivel_liga').eq('id', uid).single();

                if (profErr) console.error("❌ [CashContext] Error al buscar perfil:", profErr);

                const rolReal = profile?.rol || 'alumno'
                console.log(`🟠 [CashContext] -> Perfil encontrado. Rol: ${rolReal}`)

                let ligaAccess = false, compAccess = false;

                if (rolReal === 'admin' || rolReal === 'recepcion') {
                    ligaAccess = true; compAccess = true;
                } else {
                    if (rolReal === 'alumno' || rolReal === 'user') {
                        ligaAccess = !!profile?.nivel_liga;
                        console.log("🟠 [CashContext] -> Buscando permisos de compañía para alumno...")
                        const { data: comp } = await supabase.from('perfiles_companias').select('compania_id').eq('perfil_id', uid).limit(1);
                        compAccess = !!(comp && comp.length > 0);
                    } else if (rolReal === 'profesor') {
                        console.log("🟠 [CashContext] -> Buscando permisos de liga/compañía para profesor...")
                        const [resLiga, resComp, resCoord] = await Promise.all([
                            supabase.from('clases').select('id').eq('profesor_id', uid).eq('es_la_liga', true).limit(1),
                            supabase.from('clases').select('id').eq('profesor_id', uid).not('compania_id', 'is', null).limit(1),
                            // 🚀 NUEVA CONSULTA: Chequeamos si este profe figura como coordinador de alguna compañía
                            supabase.from('companias').select('id').eq('coordinador_id', uid).limit(1)
                        ]);

                        ligaAccess = !!(resLiga.data && resLiga.data.length > 0);

                        // 🚀 MAGIA: Tiene acceso a la pestaña si da clases en una compañía O SI coordina alguna
                        compAccess = !!(resComp.data && resComp.data.length > 0) || !!(resCoord.data && resCoord.data.length > 0);
                    }
                }

                console.log("🟠 [CashContext] -> Guardando estados en React...")
                setUserId(uid);
                setUserRole(rolReal);
                setUserName(profile?.nombre_completo || 'Usuario');
                setNivelLiga(profile?.nivel_liga || null);
                setHasLigaAccess(ligaAccess);
                setHasCompaniaAccess(compAccess);

                if (rolReal === 'admin' || rolReal === 'recepcion') {
                    console.log("🟠 [CashContext] -> Consultando turnos de caja para Admin/Recepcion...")
                    const { data: turno } = await supabase.from('caja_turnos').select('id, sede_id').eq('usuario_id', uid).eq('estado', 'abierta').maybeSingle();
                    setIsBoxOpen(!!turno);
                    setCurrentTurnoId(turno?.id || null);
                    setCurrentSedeId(turno?.sede_id || null);
                }
            }

            console.log("🟠 [CashContext] -> Lanzando carrera contra el Timeout de 6s...")
            await Promise.race([
                realizarConsulta(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT_SUPABASE")), 6000))
            ]);

            lastCheckedUser.current = uid;
            console.log("🟠 [CashContext] -> FETCH EXITOSO Y COMPLETADO.")
        } catch (err) {
            console.error("❌ [CashContext] Error cargando perfil en CashContext:", err)
        } finally {
            isFetching.current = false;
            console.log("🟠 [CashContext] -> Candado isFetching desactivado.")
        }
    }, [supabase])

    useEffect(() => {
        console.log("🟠 [CashContext] Montando useEffect principal de sesión...")
        let isMounted = true;

        console.log("🟠 [CashContext] Pidiendo sesión inicial a Supabase...")
        supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
            console.log(`🟠 [CashContext] Resultado sesión inicial: ${session ? 'Usuario logueado' : 'No hay usuario'}`)
            if (session?.user) {
                fetchProfileAndBox(session.user.id, true).finally(() => {
                    if (isMounted) {
                        console.log("🟠 [CashContext] Apagando isLoading general.")
                        setIsLoading(false);
                    }
                });
            } else {
                if (isMounted) setIsLoading(false);
            }
        }).catch((err: any) => {
            console.error("❌ [CashContext] Error al pedir sesión inicial:", err)
            if (isMounted) setIsLoading(false);
        });

        console.log("🟠 [CashContext] Suscribiendo a onAuthStateChange...")
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            console.log(`🟠 [CashContext] Auth event escuchado: ${event}`)
            if (event === 'SIGNED_OUT') {
                console.log("🟠 [CashContext] Usuario deslogueado. Limpiando estados y redirigiendo...")
                setUserId(null); setUserRole('visitante'); setUserName(null); setNivelLiga(null); setIsBoxOpen(false); setCurrentTurnoId(null); setCurrentSedeId(null); setHasLigaAccess(false); setHasCompaniaAccess(false); lastCheckedUser.current = null;
                window.location.href = '/login'
            } else if (event === 'SIGNED_IN' && session?.user) {
                console.log("🟠 [CashContext] Usuario logueado. Fetching profile...")
                fetchProfileAndBox(session.user.id, true);
            }
        });

        return () => {
            console.log("🟠 [CashContext] Desmontando componente...")
            isMounted = false;
            subscription.unsubscribe();
        }
    }, [fetchProfileAndBox, supabase])

    const checkStatus = useCallback(async () => {
        console.log("🟠 [CashContext] checkStatus forzado disparado.")
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) await fetchProfileAndBox(session.user.id, true)
    }, [fetchProfileAndBox, supabase])

    const contextValue = useMemo(() => ({
        userId, isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, hasLigaAccess, hasCompaniaAccess, checkStatus, isLoading
    }), [userId, isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, hasLigaAccess, hasCompaniaAccess, checkStatus, isLoading])

    return <CashContext.Provider value={contextValue}>{children}</CashContext.Provider>
}