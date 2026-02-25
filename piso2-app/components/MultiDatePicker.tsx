'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import {
    format, addMonths, subMonths, startOfMonth, endOfMonth,
    eachDayOfInterval, isSameDay, getDay
} from 'date-fns'
import { es } from 'date-fns/locale'

interface MultiDatePickerProps {
    selectedDates: Date[]
    onChange: (dates: Date[]) => void
}

export default function MultiDatePicker({ selectedDates, onChange }: MultiDatePickerProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date())

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

    const toggleDate = (date: Date) => {
        const exists = selectedDates.find(d => isSameDay(d, date))
        if (exists) {
            onChange(selectedDates.filter(d => !isSameDay(d, date)))
        } else {
            const newDates = [...selectedDates, date].sort((a, b) => a.getTime() - b.getTime())
            onChange(newDates)
        }
    }

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth)
    })

    const startDay = getDay(startOfMonth(currentMonth))
    const emptyDays = Array(startDay === 0 ? 6 : startDay - 1).fill(null)

    return (
        <div className="bg-[#111] border border-white/10 rounded-xl p-3 w-full mx-auto select-none">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <button type="button" onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"><ChevronLeft size={20} /></button>
                <span className="font-black text-white uppercase text-sm tracking-wide">{format(currentMonth, 'MMMM yyyy', { locale: es })}</span>
                <button type="button" onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"><ChevronRight size={20} /></button>
            </div>

            {/* Días Semanal */}
            <div className="grid grid-cols-7 mb-2 text-center">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                    <span key={i} className="text-[10px] font-black text-gray-600 uppercase">{d}</span>
                ))}
            </div>

            {/* Grilla Días */}
            <div className="grid grid-cols-7 gap-1 mb-4">
                {emptyDays.map((_, i) => <div key={`empty-${i}`} />)}
                {daysInMonth.map(day => {
                    const isSelected = selectedDates.find(d => isSameDay(d, day))
                    const isToday = isSameDay(day, new Date())
                    return (
                        <button
                            key={day.toString()}
                            type="button"
                            onClick={() => toggleDate(day)}
                            className={`
                aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all relative
                ${isSelected ? 'bg-[#D4E655] text-black shadow-lg scale-105 z-10' : 'text-gray-300 hover:bg-white/10 active:scale-95'}
                ${isToday && !isSelected ? 'border border-[#D4E655] text-[#D4E655]' : ''}
              `}
                        >
                            {format(day, 'd')}
                        </button>
                    )
                })}
            </div>

            {/* Footer */}
            {selectedDates.length > 0 && (
                <div className="border-t border-white/10 pt-3 flex justify-between items-center animate-in fade-in slide-in-from-top-1">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">{selectedDates.length} DÍAS ELEGIDOS</span>
                    <button type="button" onClick={() => onChange([])} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 font-bold uppercase py-1 px-2 rounded hover:bg-red-500/10 transition-colors">
                        <Trash2 size={12} /> Limpiar
                    </button>
                </div>
            )}
        </div>
    )
}