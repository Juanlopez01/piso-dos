'use client'
import { SWRConfig } from 'swr'

export default function SWRProvider({ children }: { children: React.ReactNode }) {
    return (
        <SWRConfig
            value={{
                revalidateOnFocus: false, // 🔥 Apagamos el principal causante del cuelgue
                revalidateOnReconnect: true,
                keepPreviousData: true,
                dedupingInterval: 5000,
            }}
        >
            {children}
        </SWRConfig>
    )
}