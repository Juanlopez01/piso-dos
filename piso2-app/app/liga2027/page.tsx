import { getLanzamientoActivoAction } from '@/app/actions/liga2027'
import InscripcionForm from './InscripcionForm'
import Link from 'next/link'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

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
            <div className={`min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center px-6 text-center ${sans.className}`}>
                <p className={`${serif.className} text-[11px] tracking-[0.5em] text-neutral-400 uppercase`}>Piso 2</p>
                <h1 className={`${serif.className} text-3xl md:text-4xl tracking-[0.1em] mt-2`}>LA LIGA 2027</h1>
                <p className="text-neutral-500 text-sm mt-4 max-w-md">Las inscripciones todavía no están abiertas. Volvé pronto.</p>
                <Link href="/" className="mt-8 text-xs uppercase tracking-[0.2em] text-neutral-900 underline underline-offset-4">Volver al inicio</Link>
            </div>
        )
    }

    const embed = lanz.video_url ? embedUrl(lanz.video_url) : null

    return (
        <div className={`min-h-screen bg-white text-neutral-900 ${sans.className}`}>
            <div className="bg-black text-white py-2.5">
                <div className="max-w-4xl mx-auto px-5 flex items-center justify-between">
                    <Link href="/" className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white">Piso 2</Link>
                    <Link href="/liga2027/login" className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white">Ya soy alumno →</Link>
                </div>
            </div>

            <header className="pt-14 pb-8 text-center px-6">
                <p className={`${serif.className} text-[11px] tracking-[0.5em] text-neutral-400 uppercase`}>Piso 2 · Inscripciones 2027</p>
                <h1 className={`${serif.className} text-4xl md:text-6xl tracking-[0.12em] font-medium mt-2`}>{lanz.titulo}</h1>
                {lanz.subtitulo && <p className="text-neutral-500 text-base mt-4 max-w-xl mx-auto leading-relaxed">{lanz.subtitulo}</p>}
            </header>

            {(embed || lanz.video_url) && (
                <div className="max-w-3xl mx-auto px-6 mb-10">
                    <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
                        {embed
                            ? <iframe src={embed} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                            : <video src={lanz.video_url!} controls className="w-full h-full object-contain" />}
                    </div>
                </div>
            )}

            {lanz.descripcion && (
                <section className="max-w-2xl mx-auto px-6 mb-14">
                    <div className="text-[15px] leading-relaxed text-neutral-700 whitespace-pre-line">{lanz.descripcion}</div>
                </section>
            )}

            <section id="inscripcion" className="max-w-xl mx-auto px-6 pb-24">
                <h2 className={`${serif.className} text-2xl tracking-[0.1em] text-center mb-2`}>Anotate</h2>
                <p className="text-neutral-500 text-sm text-center mb-8">Dejanos tus datos y elegí cómo querés avanzar.</p>
                <InscripcionForm lanzamientoId={lanz.id} />
            </section>
        </div>
    )
}
