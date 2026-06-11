'use client'
import { Users, X } from 'lucide-react'
import type { ModalAlumnosState } from './_types'

type Props = {
    modal: ModalAlumnosState
    onClose: () => void
}

export default function ModalAlumnos({ modal, onClose }: Props) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in"
            onClick={onClose}
        >
            <div
                className="bg-[#09090b] border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[80vh]"
                onClick={e => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={20} />
                </button>

                <div className="mb-4 pr-6">
                    <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                        <Users className="text-[#D4E655]" size={20} />
                        Alumnos Inscriptos
                    </h3>
                    <p className="text-xs text-gray-400 mt-1 font-medium">{modal.claseNombre} • {modal.fecha}</p>
                </div>

                <div className="bg-[#111] rounded-xl border border-white/5 overflow-y-auto custom-scrollbar flex-1 p-2">
                    {modal.alumnos.length > 0 ? (
                        <ul className="divide-y divide-white/5">
                            {modal.alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre)).map((alumno, idx) => (
                                <li key={idx} className="py-4 px-3 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors rounded-lg border-b border-white/5 last:border-0">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${alumno.presente ? 'bg-[#D4E655]' : 'bg-red-500'}`} />
                                        <div className="flex flex-col">
                                            <span className={`font-bold uppercase tracking-wide text-xs flex flex-wrap items-center gap-2 ${alumno.presente ? 'text-gray-200' : 'text-gray-500'}`}>
                                                <span>{alumno.nombre} {!alumno.presente && '(Ausente)'}</span>
                                                {alumno.es_invitado && (
                                                    <span className="text-[8px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">
                                                        INVITADO
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0">
                                        <span className="bg-white/10 text-white font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-md mb-1 max-w-[120px] text-right truncate">
                                            {alumno.pack_nombre}
                                        </span>
                                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                                            Pago: {alumno.metodo}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-gray-500 text-center py-6 font-bold uppercase">Nadie se inscribió a esta clase</p>
                    )}
                </div>
            </div>
        </div>
    )
}
