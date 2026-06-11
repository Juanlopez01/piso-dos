'use client'
import { Smartphone, Wallet, ArrowDownRight, Download } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { TransaccionVirtual } from './_types'

type Props = {
    filtradosVirtuales: TransaccionVirtual[]
    totalVirtual: number
    selectedMonth: string
}

export default function TabVirtual({ filtradosVirtuales, totalVirtual, selectedMonth }: Props) {
    const exportarPDF = () => {
        const doc = new jsPDF()
        doc.setFontSize(16)
        doc.text('Reporte de Ingresos Virtuales', 14, 20)
        doc.setFontSize(10)
        doc.setTextColor(100)
        doc.text(`Periodo: ${selectedMonth}  |  Total Registrado: $${totalVirtual.toLocaleString()}`, 14, 26)

        const tableData = filtradosVirtuales.map(mov => [
            format(new Date(mov.created_at), "dd/MM/yyyy HH:mm"),
            mov.concepto,
            mov.metodo_pago === 'mp' ? 'MercadoPago' : mov.metodo_pago.replace('_', ' ').toUpperCase(),
            mov.metodo_pago === 'mercadopago_online' ? 'App' : (mov.sede_nombre || '—'),
            `$${mov.monto.toLocaleString()}`
        ])

        autoTable(doc, {
            startY: 32,
            head: [['Fecha / Hora', 'Concepto', 'Método', 'Sede', 'Monto']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [40, 40, 40], textColor: [212, 230, 85] },
            styles: { fontSize: 8 },
        })

        doc.save(`Ingresos_Virtuales_${selectedMonth}.pdf`)
        toast.success("PDF generado y descargado con éxito")
    }

    return (
        <div className="bg-[#09090b] border border-white/10 rounded-2xl overflow-hidden shadow-xl animate-in fade-in">
            <div className="p-6 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                        <Smartphone className="text-[#D4E655]" />
                        Detalle de Ingresos Virtuales
                    </h3>
                    <p className="text-xs text-gray-400 mt-1 font-medium">Transferencias y Mercado Pago reportados en este periodo</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <button
                        onClick={exportarPDF}
                        className="bg-white/10 hover:bg-[#D4E655] hover:text-black text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border border-white/10 w-full sm:w-auto"
                    >
                        <Download size={14} /> Bajar Reporte PDF
                    </button>
                    <div className="bg-[#111] px-4 py-2 rounded-xl border border-white/5 text-right w-full sm:w-auto">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Total Periodo</p>
                        <p className="text-xl font-black text-[#D4E655]">${totalVirtual.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {filtradosVirtuales.length === 0 ? (
                <div className="text-center py-20 bg-[#111]/50">
                    <Wallet className="mx-auto mb-3 text-gray-600" size={32} />
                    <p className="text-sm font-bold uppercase text-gray-500">No hay movimientos</p>
                    <p className="text-xs text-gray-600">No se registraron transacciones virtuales para tu búsqueda.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10 bg-[#111]">
                                <th className="py-4 pl-6">Fecha / Hora</th>
                                <th className="py-4">Concepto del Ingreso</th>
                                <th className="py-4">Método</th>
                                <th className="py-4">Sede</th>
                                <th className="py-4 pr-6 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm">
                            {filtradosVirtuales.map((mov) => {
                                const fechaMov = new Date(mov.created_at)
                                return (
                                    <tr key={mov.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="py-4 pl-6 text-gray-400 text-xs font-medium">
                                            {format(fechaMov, "dd/MM/yyyy", { locale: es })}
                                            <span className="opacity-50 ml-2">{format(fechaMov, "HH:mm")}</span>
                                        </td>
                                        <td className="py-4 text-white font-bold capitalize">{mov.concepto}</td>
                                        <td className="py-4">
                                            <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider ${mov.metodo_pago.includes('mercadopago') || mov.metodo_pago === 'mp' || mov.metodo_pago === 'online'
                                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                                }`}>
                                                {mov.metodo_pago === 'mp' ? 'MercadoPago' : mov.metodo_pago.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="py-4 text-xs text-gray-400 font-bold">
                                            {mov.metodo_pago === 'mercadopago_online' ? (
                                                <span className="text-purple-400">App</span>
                                            ) : (
                                                mov.sede_nombre || '—'
                                            )}
                                        </td>
                                        <td className="py-4 pr-6 text-right font-black text-white flex items-center justify-end gap-1.5">
                                            <ArrowDownRight size={14} className="text-[#D4E655]" />
                                            ${mov.monto.toLocaleString()}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
