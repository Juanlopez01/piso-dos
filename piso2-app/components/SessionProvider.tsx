'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function SessionProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event: any) => {

            // 🛑 ELIMINAMOS el router.refresh() de SIGNED_IN y TOKEN_REFRESHED.
            // SWR y CashProvider ya actualizan los datos en vivo. 
            // Recargar el enrutador acá es lo que congelaba la app al cambiar de pestaña.

            // Solo escuchamos si la sesión muere definitivamente
            if (event === 'SIGNED_OUT') {
                router.push('/login')
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [router, supabase])

    return <>{children}</>
}