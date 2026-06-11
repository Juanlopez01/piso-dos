'use client'

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef, ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { UserRole } from '@/types/database'

type CashContextType = {
    userId: string | null
    isBoxOpen: boolean
    currentTurnoId: string | null
    currentSedeId: string | null
    userRole: UserRole | null
    userName: string | null
    nivelLiga: number | null
    hasLigaAccess: boolean
    hasCompaniaAccess: boolean
    permisosCoordinador: string[]
    checkStatus: () => Promise<void>
    isLoading: boolean
}

const CashContext = createContext<CashContextType>({
    userId: null, isBoxOpen: false, currentTurnoId: null, currentSedeId: null,
    userRole: null, userName: null, nivelLiga: null,
    hasLigaAccess: false, hasCompaniaAccess: false,
    permisosCoordinador: [], checkStatus: async () => { }, isLoading: true
})

export const useCash = () => useContext(CashContext)

export function CashProvider({ children }: { children: ReactNode }) {
    const [supabase] = useState(() => createClient())

    const [userId, setUserId] = useState<string | null>(null)
    const [isBoxOpen, setIsBoxOpen] = useState(false)
    const [currentTurnoId, setCurrentTurnoId] = useState<string | null>(null)
    const [currentSedeId, setCurrentSedeId] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<UserRole | null>(null)
    const [userName, setUserName] = useState<string | null>(null)
    const [nivelLiga, setNivelLiga] = useState<number | null>(null)
    const [hasLigaAccess, setHasLigaAccess] = useState(false)
    const [hasCompaniaAccess, setHasCompaniaAccess] = useState(false)
    const [permisosCoordinador, setPermisosCoordinador] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const lastCheckedUser = useRef<string | null>(null)
    const isFetching = useRef(false)

    const fetchProfileAndBox = useCallback(async (uid: string, force = false) => {
        if (isFetching.current) return
        if (!force && lastCheckedUser.current === uid) return

        isFetching.current = true

        try {
            const realizarConsulta = async () => {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('rol, nombre_completo, nivel_liga, permisos_grupos')
                    .eq('id', uid)
                    .single()

                const rolReal = (profile?.rol ?? 'alumno') as UserRole
                let ligaAccess = false
                let compAccess = false
                const misPermisos: string[] = (profile?.permisos_grupos as string[]) ?? []

                if (rolReal === 'admin' || rolReal === 'recepcion' || rolReal === 'auxiliar') {
                    ligaAccess = true
                    compAccess = true
                } else if (rolReal === 'coordinador') {
                    ligaAccess = misPermisos.includes('liga')
                    compAccess = misPermisos.some(p => p !== 'liga')
                } else if (rolReal === 'alumno') {
                    ligaAccess = !!profile?.nivel_liga
                    const { data: comp } = await supabase
                        .from('perfiles_companias')
                        .select('compania_id')
                        .eq('perfil_id', uid)
                        .limit(1)
                    compAccess = !!(comp && comp.length > 0)
                } else if (rolReal === 'profesor') {
                    const [resLiga, resComp, resCoord] = await Promise.all([
                        supabase.from('clases').select('id').eq('profesor_id', uid).eq('es_la_liga', true).limit(1),
                        supabase.from('clases').select('id').eq('profesor_id', uid).not('compania_id', 'is', null).limit(1),
                        supabase.from('companias').select('id').eq('coordinador_id', uid).limit(1)
                    ])
                    ligaAccess = !!(resLiga.data?.length)
                    compAccess = !!(resComp.data?.length) || !!(resCoord.data?.length)
                }

                setUserId(uid)
                setUserRole(rolReal)
                setUserName(profile?.nombre_completo ?? 'Usuario')
                setNivelLiga(profile?.nivel_liga ?? null)
                setHasLigaAccess(ligaAccess)
                setHasCompaniaAccess(compAccess)
                setPermisosCoordinador(misPermisos)

                if (rolReal === 'admin' || rolReal === 'recepcion' || rolReal === 'auxiliar') {
                    const { data: turno } = await supabase
                        .from('caja_turnos')
                        .select('id, sede_id')
                        .eq('usuario_id', uid)
                        .eq('estado', 'abierta')
                        .maybeSingle()
                    setIsBoxOpen(!!turno)
                    setCurrentTurnoId(turno?.id ?? null)
                    setCurrentSedeId(turno?.sede_id ?? null)
                }
            }

            await Promise.race([
                realizarConsulta(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SUPABASE')), 6000))
            ])

            lastCheckedUser.current = uid
        } catch (err) {
            console.error('[CashContext] Error cargando perfil:', err)
        } finally {
            isFetching.current = false
        }
    }, [supabase])

    useEffect(() => {
        let isMounted = true

        supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
            if (session?.user) {
                fetchProfileAndBox(session.user.id, true).finally(() => {
                    if (isMounted) setIsLoading(false)
                })
            } else {
                if (isMounted) setIsLoading(false)
            }
        }).catch(() => {
            if (isMounted) setIsLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            if (event === 'SIGNED_OUT') {
                setUserId(null)
                setUserRole(null)
                setUserName(null)
                setNivelLiga(null)
                setIsBoxOpen(false)
                setCurrentTurnoId(null)
                setCurrentSedeId(null)
                setHasLigaAccess(false)
                setHasCompaniaAccess(false)
                setPermisosCoordinador([])
                lastCheckedUser.current = null
                window.location.href = '/login'
            } else if (event === 'SIGNED_IN' && session?.user) {
                fetchProfileAndBox(session.user.id, true)
            }
        })

        return () => {
            isMounted = false
            subscription.unsubscribe()
        }
    }, [fetchProfileAndBox, supabase])

    const checkStatus = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) await fetchProfileAndBox(session.user.id, true)
    }, [fetchProfileAndBox, supabase])

    const contextValue = useMemo(() => ({
        userId, isBoxOpen, currentTurnoId, currentSedeId,
        userRole, userName, nivelLiga,
        hasLigaAccess, hasCompaniaAccess, permisosCoordinador,
        checkStatus, isLoading
    }), [userId, isBoxOpen, currentTurnoId, currentSedeId, userRole, userName, nivelLiga, hasLigaAccess, hasCompaniaAccess, permisosCoordinador, checkStatus, isLoading])

    return <CashContext.Provider value={contextValue}>{children}</CashContext.Provider>
}
