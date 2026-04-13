'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function SessionProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    console.log("🔵 [SessionProvider] Renderizando componente padre...")

    useEffect(() => {
        console.log("🔵 [SessionProvider] Montando listener de Supabase Auth...")

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event: any, session: any) => {
            console.log(`🔵 [SessionProvider] 🔔 EVENTO AUTH DISPARADO: ${event} | Usuario: ${session?.user?.id || 'Ninguno'}`)

            if (event === 'SIGNED_OUT') {
                console.log("🔵 [SessionProvider] Usuario deslogueado, pateando al login...")
                router.push('/login')
            }
        })

        return () => {
            console.log("🔵 [SessionProvider] Desmontando listener...")
            subscription.unsubscribe()
        }
    }, [router, supabase])

    return <>{children}</>
}