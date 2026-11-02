import { createClient } from '@/utils/supabase/server-helper'
import PanelLiga27 from './PanelLiga27'

export const dynamic = 'force-dynamic'

const ROLES_OK = ['admin', 'recepcion', 'coordinador']

export default async function Liga2027AdminPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    let rol = ''
    if (session?.user) {
        const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        rol = perfil?.rol || ''
    }
    if (!ROLES_OK.includes(rol)) {
        return (
            <div className="p-8 text-center text-white/60">
                <h1 className="text-xl font-bold text-white mb-2">La Liga 2027</h1>
                <p>No tenés permisos para ver esta sección.</p>
            </div>
        )
    }
    // La coordinadora no ve pagos (Fase 3): se le oculta precios + montos.
    const puedePagos = rol === 'admin' || rol === 'recepcion'
    return <PanelLiga27 puedePagos={puedePagos} />
}
