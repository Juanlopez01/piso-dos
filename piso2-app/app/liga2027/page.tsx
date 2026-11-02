import { getLanzamientoActivoAction } from '@/app/actions/liga2027'
import InscripcionForm from './InscripcionForm'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function embedUrl(url: string): string | null {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`
    return null
}

export default async function Liga2027Page() {
    const lanz = await getLanzamientoActivoAction()

    if (!lanz) {
        return (
            <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center px-6 text-center">
                <p className="text-[10px] tracking-[0.4em] text-[#D4E655] uppercase font-black">Piso 2 · La Liga</p>
                <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mt-3">La Liga 2027</h1>
                <p className="text-gray-400 text-sm mt-4 max-w-md">Las inscripciones todavía no están abiertas. Volvé pronto.</p>
                <Link href="/" className="mt-8 text-[10px] uppercase tracking-[0.3em] text-white/60 hover:text-white font-black">← Volver al inicio</Link>
            </div>
        )
    }

    const embed = lanz.video_url ? embedUrl(lanz.video_url) : null

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            <div className="border-b border-white/10 py-3">
                <div className="max-w-4xl mx-auto px-5 flex items-center justify-between">
                    <Link href="/" className="text-[10px] font-black tracking-[0.3em] uppercase text-white/60 hover:text-white">← Piso 2</Link>
                    <Link href="/login" className="text-[10px] font-black tracking-[0.3em] uppercase text-white/60 hover:text-[#D4E655]">Ya soy alumno →</Link>
                </div>
            </div>

            <header className="pt-16 pb-8 text-center px-6 relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#D4E655]/10 blur-[120px] pointer-events-none" />
                <div className="relative">
                    <p className="text-[10px] font-black tracking-[0.4em] text-[#D4E655] uppercase">🏆 Formación · La Liga</p>
                    <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mt-3 leading-[0.9]">{lanz.titulo}</h1>
                    {lanz.subtitulo && <p className="text-gray-400 text-base mt-5 max-w-xl mx-auto leading-relaxed font-medium">{lanz.subtitulo}</p>}
                </div>
            </header>

            {embed ? (
                // YouTube (u otro embed): horizontal 16:9.
                <div className="max-w-3xl mx-auto px-6 mb-10">
                    <div className="aspect-video w-full bg-black rounded-xl overflow-hidden border border-white/10">
                        <iframe src={embed} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    </div>
                </div>
            ) : lanz.video_url ? (
                // Video propio (mp4): formato vertical 9:16, tipo celular, centrado.
                <div className="mx-auto px-6 mb-10 w-full max-w-[360px]">
                    <div className="aspect-[9/16] w-full bg-black rounded-2xl overflow-hidden border border-white/10">
                        <video src={lanz.video_url} controls playsInline className="w-full h-full object-contain" />
                    </div>
                </div>
            ) : null}

            {lanz.descripcion && (
                <section className="max-w-2xl mx-auto px-6 mb-14">
                    <div className="text-[15px] leading-relaxed text-gray-300 whitespace-pre-line">{lanz.descripcion}</div>
                </section>
            )}

            <section id="inscripcion" className="max-w-xl mx-auto px-6 pb-24">
                <h2 className="text-3xl font-black uppercase tracking-tighter text-center mb-2">Anotate</h2>
                <p className="text-gray-500 text-sm text-center mb-8">Dejanos tus datos y elegí cómo querés avanzar.</p>
                <InscripcionForm lanzamientoId={lanz.id} />
            </section>
        </div>
    )
}
