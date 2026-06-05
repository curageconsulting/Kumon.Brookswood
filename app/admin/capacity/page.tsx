'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime, OPERATING_HOURS } from '@/types'
import Link from 'next/link'

type DayCapacity = {
  time: string
  early_booked: number
  main_booked: number
}

export default function AdminCapacityPage() {
  const [selectedDay, setSelectedDay] = useState<'monday'|'thursday'|'friday'|'saturday'>('monday')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [capacity, setCapacity] = useState<DayCapacity[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const DAYS = ['monday', 'thursday', 'friday', 'saturday'] as const
  const MAX_EARLY = 6, MAX_MAIN = 15

  useEffect(() => { loadCapacity() }, [selectedDate])

  async function loadCapacity() {
    setLoading(true)
    const { data } = await supabase
      .from('sessions')
      .select('start_time, student:students(category)')
      .eq('session_date', selectedDate)
      .eq('status', 'scheduled')

    const slotMap: Record<string, { early: number; main: number }> = {}
    ;(data || []).forEach((s: any) => {
      const t = s.start_time.slice(0,5)
      if (!slotMap[t]) slotMap[t] = { early: 0, main: 0 }
      if (s.student?.category === 'early_learner') slotMap[t].early++
      else slotMap[t].main++
    })

    // Generate all possible time slots
    const dayOfWeek = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as any
    const hours = OPERATING_HOURS[dayOfWeek]
    const slots: DayCapacity[] = []
    if (hours) {
      const [oh, om] = hours.open.split(':').map(Number)
      const [ch, cm] = hours.close.split(':').map(Number)
      let t = oh * 60 + om
      const end = ch * 60 + cm
      while (t < end) {
        const h = Math.floor(t / 60), m = t % 60
        const key = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
        slots.push({ time: key, early_booked: slotMap[key]?.early || 0, main_booked: slotMap[key]?.main || 0 })
        t += 30
      }
    }
    setCapacity(slots)
    setLoading(false)
  }

  function bar(booked: number, max: number, color: string) {
    const pct = Math.min((booked / max) * 100, 100)
    const bg = booked >= max ? 'bg-red-400' : booked / max >= 0.5 ? 'bg-amber-400' : 'bg-green-400'
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-2 rounded-full transition-all ${bg}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-slate-700 w-10 text-right">{booked}/{max}</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <h1 className="font-semibold text-slate-900">Capacity Dashboard</h1>
          </div>
          <input type="date" className="input text-sm py-2 max-w-[180px]" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Legend */}
        <div className="flex gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-400 rounded-full"/>> 50% free</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-amber-400 rounded-full"/>Limited</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-400 rounded-full"/>Full</div>
        </div>

        {/* Capacity table */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-50 bg-slate-50">
            <div className="grid grid-cols-4 gap-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <span>Time slot</span>
              <span>Early Learner <span className="font-normal text-slate-400">(max {MAX_EARLY})</span></span>
              <span>Main Class <span className="font-normal text-slate-400">(max {MAX_MAIN})</span></span>
              <span>Status</span>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
            ) : capacity.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No sessions on this date (centre may be closed)</div>
            ) : capacity.map(slot => {
              const earlyFull = slot.early_booked >= MAX_EARLY
              const mainFull = slot.main_booked >= MAX_MAIN
              return (
                <div key={slot.time} className="px-5 py-3.5 grid grid-cols-4 gap-3 items-center">
                  <div className="text-sm font-semibold text-slate-900">{formatTime(slot.time)}</div>
                  <div>{bar(slot.early_booked, MAX_EARLY, 'green')}</div>
                  <div>{bar(slot.main_booked, MAX_MAIN, 'blue')}</div>
                  <div className="flex gap-1 flex-wrap">
                    {earlyFull && mainFull ? <span className="badge-red text-[10px]">All full</span>
                      : earlyFull ? <span className="badge-red text-[10px]">EL full</span>
                      : mainFull ? <span className="badge-amber text-[10px]">MC full</span>
                      : <span className="badge-green text-[10px]">Available</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Summary */}
        {capacity.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{capacity.reduce((a, s) => a + s.early_booked, 0)}</div>
              <div className="text-xs text-slate-500 mt-1">Total Early Learner bookings</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{capacity.reduce((a, s) => a + s.main_booked, 0)}</div>
              <div className="text-xs text-slate-500 mt-1">Total Main Class bookings</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
