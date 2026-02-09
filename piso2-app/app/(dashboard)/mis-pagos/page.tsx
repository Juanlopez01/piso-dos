'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { FileText, Download, CheckCircle, Clock, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Liquidacion = {
    id: string
    mes: string
    monto: number
    estado: string
    created_at: string
}

export default function MisPagosPage() {
    const supabase = createClient()
    const [pagos, setPagos] = useState<Liquidacion[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchPagos = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data } = await supabase
                .from('liquidaciones')
                .select('*')
                .eq('profesor_id', user.id)
                .order('mes', { ascending: false })

            if (data) setPagos(data)
            setLoading(false)
        }
        fetchPagos()
    }, [])

    return (
        <div className="p-8 text-white min-h-screen bg-[#050505]">
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-1">Mis Liquidaciones</h2>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-8">Historial de Pagos</p>

            {loading ? <Loader2 className="animate-spin text-[#D4E655]" /> : (
                <div className="grid gap-4 max-w-2xl">
                    {pagos.map((pago) => (
                        <div key={pago.id} className="bg-[#09090b] border border-white/10 p-6 rounded-2xl flex items-center justify-between group hover:border-[#D4E655]/50 transition-all">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${pago.estado === 'pagado' ? 'bg-[#D4E655]/10 border-[#D4E655]/20 text-[#D4E655]' : 'bg-gray-800 border-white/5 text-gray-500'}`}><FileText size={20} /></div>
                                <div>
                                    <h3 className="text-xl font-black uppercase text-white capitalize">{format(new Date(pago.mes), 'MMMM yyyy', { locale: es })}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        {pago.estado === 'pagado' ?
                                            <span className="text-[10px] font-bold bg-[#D4E655] text-black px-2 py-0.5 rounded uppercase flex items-center gap-1"><CheckCircle size={10} /> Pagado</span> :
                                            <span className="text-[10px] font-bold bg-white/10 text-gray-400 px-2 py-0.5 rounded uppercase flex items-center gap-1"><Clock size={10} /> Pendiente</span>
                                        }
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-black text-white tracking-tight">${pago.monto.toLocaleString()}</div>
                            </div>
                        </div>
                    ))}
                    {pagos.length === 0 && <p className="text-gray-500 text-sm">No hay liquidaciones publicadas aún.</p>}
                </div>
            )}
        </div>
    )
}