'use client'
import { SWRConfig } from 'swr'

export default function SWRProvider({ children }: { children: React.ReactNode }) {
    return (
        <SWRConfig
            value={{
                revalidateOnFocus: false,
                revalidateOnReconnect: false, // 🛑 APAGADO: Evita el choque al recargar
                keepPreviousData: true,
                dedupingInterval: 5000,
            }}
        >
            {children}
        </SWRConfig>
    )
}