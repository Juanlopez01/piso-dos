import { getMiLiga27Action } from '@/app/actions/liga2027'
import { getMiAcademicoLiga27Action } from '@/app/actions/liga2027-academico'
import MiLigaPerfil from './MiLigaPerfil'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function MiLigaPage() {
    const data = await getMiLiga27Action()

    // Sin sesión de 2M (no debería pasar dentro del dashboard).
    if (!data) {
        return <div className="p-8 text-white/60 text-sm">Iniciá sesión para ver tu perfil de La Liga 2027.</div>
    }

    // Logueado pero sin inscripción a La Liga 2027.
    if (!data.inscripcion) {
        return (
            <div className="max-w-xl mx-auto px-6 py-20 text-center text-white">
                <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#D4E655] mb-3">La Liga 2027</p>
                <h1 className="text-2xl font-black mb-3">Todavía no estás inscripto/a</h1>
                <p className="text-white/50 text-sm mb-6">Cuando te aprueben la inscripción vas a ver acá tu perfil: notas, asistencia, programa y beneficios.</p>
                <Link href="/liga2027" className="inline-block bg-[#D4E655] text-black font-bold uppercase tracking-[0.2em] text-xs px-6 py-3 rounded-xl">Ver La Liga 2027</Link>
            </div>
        )
    }

    const academico = await getMiAcademicoLiga27Action().catch(() => null)
    return <MiLigaPerfil data={data} academico={academico} />
}
