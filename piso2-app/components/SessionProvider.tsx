'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function SessionProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    // 🚀 EL FIX MÁGICO: Congelamos el cliente para que no se multiplique al navegar
    const [supabase] = useState(() => createClient())

    useEffect(() => {
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event: any) => {
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