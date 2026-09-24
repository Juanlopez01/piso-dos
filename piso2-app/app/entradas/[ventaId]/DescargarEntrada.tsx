'use client'

import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { Download, Loader2 } from 'lucide-react'

type Ticket = { codigo: string; entrada: string }

// Botón que arma un PDF con la(s) entrada(s) (QR + datos) y lo descarga.
// Reusa los QR que ya generó el server (data URLs), así el PDF sale al instante.
export default function DescargarEntrada({ evento, fecha, lugar, comprador, tickets, qrs }: {
    evento: string; fecha: string | null; lugar: string | null; comprador: string
    tickets: Ticket[]; qrs: string[]
}) {
    const [generando, setGenerando] = useState(false)

    const descargar = async () => {
        setGenerando(true)
        try {
            const doc = new jsPDF({ unit: 'mm', format: 'a4' })
            const W = 210, H = 297
            const centro = (txt: string | string[], y: number) => doc.text(txt as any, W / 2, y, { align: 'center' })

            tickets.forEach((tk, i) => {
                if (i > 0) doc.addPage()
                let y = 26
                doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(15)
                centro('PISO2', y); y += 11

                doc.setFontSize(16)
                const nombre = doc.splitTextToSize(evento, W - 40)
                centro(nombre, y); y += nombre.length * 7 + 2

                doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(90)
                const sub = [fecha, lugar].filter(Boolean).join(' · ')
                if (sub) { const l = doc.splitTextToSize(sub, W - 40); centro(l, y); y += l.length * 5 }
                y += 6

                doc.setFontSize(9); doc.setTextColor(130)
                centro((tk.entrada || 'Entrada').toUpperCase(), y); y += 7

                const size = 78
                try { doc.addImage(qrs[i], 'PNG', (W - size) / 2, y, size, size) } catch { }
                y += size + 8

                doc.setFont('courier', 'normal'); doc.setFontSize(11); doc.setTextColor(50)
                centro(tk.codigo, y); y += 9

                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(120)
                centro(`${comprador} · entrada ${i + 1} de ${tickets.length}`, y)

                doc.setFontSize(8); doc.setTextColor(150)
                centro('Mostrá este QR en la puerta. Cada entrada se usa una sola vez.', H - 16)
            })

            const base = `Entrada-${evento}`.replace(/[^\w\-]+/g, '_').slice(0, 50) || 'Entrada'
            doc.save(`${base}.pdf`)
        } finally {
            setGenerando(false)
        }
    }

    return (
        <button onClick={descargar} disabled={generando}
            className="w-full flex items-center justify-center gap-2 bg-black text-white font-bold text-sm rounded-2xl py-3.5 hover:bg-neutral-800 transition-colors disabled:opacity-50">
            {generando ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
            {generando ? 'Generando…' : `Descargar ${tickets.length === 1 ? 'entrada' : 'entradas'} (PDF)`}
        </button>
    )
}
