'use client'
import { DollarSign, Loader2, X } from 'lucide-react'
import type { ModalPagoState } from './_types'

type Props = {
    modal: ModalPagoState
    procesandoPago: boolean
    onClose: () => void
    onPagar: (metodo: 'efectivo' | 'transferencia') => void
}

export default function ModalPago({ modal, procesandoPago, onClose, onPagar }: Props) {
    if (!modal.clase) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in"
            onClick={() => !procesandoPago && onClose()}
        >
            <div
                className="bg-[#09090b] border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative"
                onClick={e => e.stopPropagation()}
            >
                <button onClick={() => !procesandoPago && onClose()} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={20} />
                </button>

                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-[#D4E655]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#D4E655]/30">
                        <DollarSign className="text-[#D4E655]" size={24} />
                    </div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Pago Individual</h3>
                    <p className="text-xs text-gray-400 mt-2 font-medium">
                        Vas a registrar el pago de <strong className="text-white">{modal.clase.nombre}</strong> a <strong className="text-white">{modal.nombreProfe}</strong>.
                    </p>
                    <p className="text-3xl font-black text-[#D4E655] mt-4">${modal.clase.pago_profe.toLocaleString()}</p>
                </div>

                <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest text-center">¿Cómo le pagaste?</p>
                    <button
                        onClick={() => onPagar('efectivo')}
                        disabled={procesandoPago}
                        className="w-full bg-[#111] hover:bg-white/10 border border-white/10 text-white font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2"
                    >
                        {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : '💵 Aboné en Efectivo'}
                    </button>
                    <button
                        onClick={() => onPagar('transferencia')}
                        disabled={procesandoPago}
                        className="w-full bg-[#D4E655] hover:bg-white text-black font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2"
                    >
                        {procesandoPago ? <Loader2 size={16} className="animate-spin" /> : '📱 Hice Transferencia'}
                    </button>
                </div>
            </div>
        </div>
    )
}
