'use client'
import { DollarSign, Loader2, X } from 'lucide-react'
import type { ModalLiqGrupoState, GrupoRaw } from './_types'

type Props = {
    modal: ModalLiqGrupoState
    pagandoGrupoId: string | null
    onClose: () => void
    onPagar: (grupo: GrupoRaw, monto: number, destinatario: string, metodo: 'efectivo' | 'transferencia') => void
}

export default function ModalLiqGrupo({ modal, pagandoGrupoId, onClose, onPagar }: Props) {
    if (!modal.grupo) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in"
            onClick={() => !pagandoGrupoId && onClose()}
        >
            <div
                className="bg-[#09090b] border border-emerald-500/20 w-full max-w-sm rounded-3xl p-6 shadow-[0_0_50px_rgba(16,185,129,0.1)] relative"
                onClick={e => e.stopPropagation()}
            >
                <button onClick={() => !pagandoGrupoId && onClose()} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={20} />
                </button>
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                        <DollarSign className="text-emerald-500" size={24} />
                    </div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Liquidar Grupo</h3>
                    <p className="text-xs text-gray-400 mt-2 font-medium leading-relaxed">
                        Pago de <strong className="text-white">{modal.grupo.nombre}</strong> a{' '}
                        <strong className="text-emerald-400">{modal.destinatario}</strong>.
                    </p>
                    <div className="mt-4 p-3 bg-white/5 rounded-xl">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Monto a Pagar</p>
                        <p className="text-3xl font-black text-emerald-400 mt-1">${modal.montoPagar.toLocaleString()}</p>
                    </div>
                </div>
                <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest text-center">¿Cómo le pagaste?</p>
                    <button
                        onClick={() => onPagar(modal.grupo!, modal.montoPagar, modal.destinatario, 'efectivo')}
                        disabled={!!pagandoGrupoId}
                        className="w-full bg-[#111] hover:bg-white/10 border border-white/10 text-white font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2"
                    >
                        {pagandoGrupoId ? <Loader2 size={16} className="animate-spin" /> : '💵 Aboné en Efectivo'}
                    </button>
                    <button
                        onClick={() => onPagar(modal.grupo!, modal.montoPagar, modal.destinatario, 'transferencia')}
                        disabled={!!pagandoGrupoId}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase py-4 rounded-xl transition-all text-xs tracking-widest flex items-center justify-center gap-2"
                    >
                        {pagandoGrupoId ? <Loader2 size={16} className="animate-spin" /> : '📱 Hice Transferencia'}
                    </button>
                </div>
            </div>
        </div>
    )
}
