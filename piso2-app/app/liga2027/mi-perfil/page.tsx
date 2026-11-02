import { getMiLiga27Action } from '@/app/actions/liga2027'
import { getMiAcademicoLiga27Action } from '@/app/actions/liga2027-academico'
import { redirect } from 'next/navigation'
import PerfilTabs from './PerfilTabs'

export const dynamic = 'force-dynamic'

export default async function MiPerfilLiga27Page() {
    const data = await getMiLiga27Action()
    if (!data) redirect('/liga2027/login')
    const academico = await getMiAcademicoLiga27Action().catch(() => null)
    return <PerfilTabs data={data} academico={academico} />
}
