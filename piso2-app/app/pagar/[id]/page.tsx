import { getVentaPublicaAction } from '@/app/actions/ventas'
import PagarForm from './PagarForm'

const MENSAJES: Record<string, { titulo: string; detalle: string }> = {
    inexistente: { titulo: 'Link no encontrado', detalle: 'Revisá que hayas copiado el link completo.' },
    pagado: { titulo: '¡Esta venta ya fue pagada!', detalle: 'Si ya pagaste, entrá con tu mail y tu DNI como contraseña.' },
    cancelado: { titulo: 'Venta cancelada', detalle: 'Pedile un link nuevo a la persona que te lo mandó.' },
    vencido: { titulo: 'Link vencido', detalle: 'Pedile un link nuevo a la persona que te lo mandó.' },
}

export default async function PagarPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const res = await getVentaPublicaAction(id)

    if (!res.ok) {
        const m = MENSAJES[res.motivo]
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-3 p-6 text-center">
                <h1 className="text-xl font-black text-white uppercase">{m.titulo}</h1>
                <p className="text-sm text-gray-500 font-medium max-w-xs">{m.detalle}</p>
            </div>
        )
    }

    return <PagarForm venta={res.venta} />
}
