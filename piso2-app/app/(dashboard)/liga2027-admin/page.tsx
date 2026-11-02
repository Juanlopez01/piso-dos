import { createClient } from '@/utils/supabase/server-helper'
import PanelLiga27 from './PanelLiga27'
import DocentePanel from './DocentePanel'

export const dynamic = 'force-dynamic'

const STAFF_OK = ['admin', 'recepcion', 'coordinador']

export default async function Liga2027AdminPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    let rol = ''
    if (session?.user) {
        const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
        rol = perfil?.rol || ''
    }
    // El docente de La Liga ve SU portal (solo sus disciplinas).
    if (rol === 'profesor') return <DocentePanel />
    if (!STAFF_OK.includes(rol)) {
        return (
            <div className="p-8 text-center text-white/60">
                <h1 className="text-xl font-bold text-white mb-2">La Liga 2027</h1>
                <p>No tenés permisos para ver esta sección.</p>
            </div>
        )
    }
    // La coordinadora no ve pagos (Fase 3): se le oculta precios + montos.
    const puedePagos = rol === 'admin' || rol === 'recepcion'
    const esStaffGestion = rol === 'admin' || rol === 'recepcion'
    return <PanelLiga27 puedePagos={puedePagos} esStaffGestion={esStaffGestion} />
}
