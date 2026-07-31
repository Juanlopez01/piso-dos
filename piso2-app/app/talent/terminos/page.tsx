'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Playfair_Display, Montserrat } from 'next/font/google'

const serif = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

const SECCIONES: { titulo: string; parrafos: string[] }[] = [
    {
        titulo: '1. Naturaleza de la postulación',
        parrafos: [
            'La inscripción en una búsqueda específica o el envío voluntario de material para integrar la Base de Talentos de PISO 2 constituye únicamente una manifestación de interés por parte del postulante y no genera obligación alguna para PISO 2 respecto de su selección, representación, contratación o incorporación a proyecto alguno.',
            'La decisión de seleccionar artistas para una búsqueda determinada será exclusivamente discrecional de PISO 2 y/o de la empresa, productor, agencia o cliente que solicite dicha búsqueda.',
        ],
    },
    {
        titulo: '2. Ausencia de garantía de contratación',
        parrafos: [
            'La postulación no implica promesa, expectativa legítima ni garantía de casting, audición, entrevista, contratación, representación artística, viaje, remuneración o participación en ningún proyecto. PISO 2 podrá declarar desierta una convocatoria, modificar sus requisitos, suspenderla, cancelarla o finalizarla sin necesidad de expresar causa y sin que ello genere derecho a reclamo, compensación o indemnización alguna.',
        ],
    },
    {
        titulo: '3. Base Permanente de Talentos',
        parrafos: [
            'El postulante autoriza a PISO 2 a incorporar la información suministrada, incluyendo fotografías, videos, reels, currículum y demás material enviado, a su Base Permanente de Talentos. La incorporación a dicha base tampoco implica obligación de contratación, representación exclusiva ni compromiso de convocatoria futura.',
        ],
    },
    {
        titulo: '4. Utilización del material e imagen',
        parrafos: [
            'El postulante autoriza expresamente a PISO 2 a utilizar, reproducir, almacenar, adaptar, publicar y comunicar las fotografías, videos y demás material aportado con fines institucionales, promocionales, comerciales, publicitarios, editoriales o vinculados a futuras convocatorias, tanto en la página web como en redes sociales, presentaciones comerciales y demás canales de comunicación de PISO 2, sin derecho a compensación económica alguna.',
            'Esta autorización permanecerá vigente mientras el perfil permanezca activo en la Base de Talentos o hasta que el postulante solicite por escrito su eliminación, sin afectar el material ya publicado con anterioridad.',
        ],
    },
    {
        titulo: '5. Reutilización del perfil',
        parrafos: [
            'PISO 2 podrá considerar el perfil del postulante para otras búsquedas, castings o proyectos compatibles con sus características artísticas o profesionales. Cuando el perfil sea propuesto para una búsqueda distinta, PISO 2 podrá comunicar previamente dicha posibilidad para confirmar su interés y disponibilidad.',
        ],
    },
    {
        titulo: '6. Comunicación de resultados',
        parrafos: [
            'PISO 2 podrá contactar únicamente a los artistas seleccionados para continuar un proceso de casting o contratación y/o a aquellos artistas que sean incorporados a la Base Permanente de Talentos. La falta de comunicación no implica evaluación negativa ni genera obligación de emitir devoluciones individuales.',
        ],
    },
    {
        titulo: '7. Rol de PISO 2',
        parrafos: [
            'PISO 2 actúa como organizador de convocatorias, administrador de su Base de Talentos y/o intermediario entre artistas y potenciales contratantes. Salvo manifestación expresa por escrito, no es agencia de representación ni empleador. Cuando la contratación corresponda a terceros (productoras, agencias, empresas o clientes), PISO 2 no será parte del contrato que eventualmente celebren dichas partes ni responderá por decisiones de selección, contratación, remuneraciones, condiciones laborales, migratorias, económicas, ejecución del trabajo, pagos, cancelaciones, modificaciones o incumplimientos derivados de dicha relación.',
        ],
    },
    {
        titulo: '8. Limitación de responsabilidad e indemnidad',
        parrafos: [
            'El postulante acepta que toda relación contractual que eventualmente celebre con terceros será de exclusiva responsabilidad entre dichas partes. En consecuencia, se obliga a mantener indemne a PISO 2, sus representantes, directivos, colaboradores y asociados frente a cualquier reclamo, acción, daño, perjuicio, costo o gasto, judicial o extrajudicial, que pudiera derivarse directa o indirectamente de su participación en una convocatoria, de un proceso de selección o de una eventual contratación con terceros.',
        ],
    },
    {
        titulo: '9. Protección de datos personales',
        parrafos: [
            'Los datos personales y el material artístico serán tratados conforme a la Ley N.º 25.326 de Protección de Datos Personales de la República Argentina y serán utilizados exclusivamente para la administración de la Base de Talentos, procesos de selección, comunicaciones institucionales y futuras convocatorias. El postulante podrá solicitar en cualquier momento la actualización, rectificación o eliminación de su información mediante comunicación escrita a PISO 2.',
        ],
    },
    {
        titulo: '10. Aceptación',
        parrafos: [
            'El envío de la postulación implica la aceptación plena de los presentes Términos y Condiciones y la declaración de que toda la información suministrada es verdadera y completa.',
        ],
    },
]

export default function TerminosTalentPage() {
    return (
        <div className={`min-h-screen bg-white text-neutral-900 ${sans.className}`}>
            {/* BARRA SUPERIOR */}
            <div className="bg-black text-white py-2.5">
                <div className="max-w-3xl mx-auto px-5">
                    <Link href="/talent" className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/70 hover:text-white flex items-center gap-1.5">
                        <ArrowLeft size={13} /> Piso 2 Talent
                    </Link>
                </div>
            </div>

            {/* HEADER */}
            <header className="pt-12 pb-8 text-center px-6">
                <p className={`${serif.className} text-[11px] tracking-[0.5em] text-neutral-500 uppercase`}>Piso 2 Multiespacio</p>
                <h1 className={`${serif.className} text-3xl md:text-4xl tracking-[0.1em] font-medium mt-2 leading-tight`}>
                    Términos y Condiciones<br className="hidden md:block" /> de Postulación
                </h1>
            </header>

            {/* CONTENIDO */}
            <main className="max-w-3xl mx-auto px-6 pb-24">
                <p className="text-neutral-600 text-sm md:text-[15px] leading-relaxed font-light mb-10">
                    Al completar y enviar la presente postulación, el/la postulante declara haber leído, comprendido y aceptado las siguientes condiciones:
                </p>

                <div className="space-y-9">
                    {SECCIONES.map((s) => (
                        <section key={s.titulo}>
                            <h2 className={`${serif.className} text-lg md:text-xl tracking-wide mb-3`}>{s.titulo}</h2>
                            <div className="space-y-3 text-neutral-600 text-sm md:text-[15px] leading-relaxed font-light">
                                {s.parrafos.map((p, i) => <p key={i}>{p}</p>)}
                            </div>
                        </section>
                    ))}
                </div>

                <div className="mt-14 text-center">
                    <Link href="/talent/postular" className="inline-block text-[11px] font-semibold tracking-[0.2em] uppercase border border-neutral-900 px-8 py-3.5 hover:bg-neutral-900 hover:text-white transition-colors">
                        Ir a postularme
                    </Link>
                </div>
            </main>

            {/* FOOTER */}
            <footer className="bg-neutral-900 text-white py-10 text-center">
                <div className={`${serif.className} leading-none`}>
                    <p className="text-[10px] tracking-[0.55em] text-white/50 uppercase">Piso 2</p>
                    <p className="text-2xl tracking-[0.15em] font-medium mt-1">TALENT</p>
                </div>
            </footer>
        </div>
    )
}
