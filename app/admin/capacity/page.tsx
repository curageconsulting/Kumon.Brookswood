'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime, categoryLabel, subjectLabel } from '@/types'
import Link from 'next/link'

const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

type SessionWithStudent = {
  id: string
  session_date: string
  start_time: string
  end_time: string
  duration_mins: number
  status: string
  student: { first_name: string; last_name: string; category: string; subjects: string }
}

export default function AdminCapacityPage() {
  const [sessions, setSessions] = useState<SessionWithStudent[]>([])
  const [calMonth, setCalMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'calendar'|'day'>('calendar')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'early_learner'|'main'>('all')
  const supabase = createClient()

  useEffect(() => { load() }, [calMonth])

  async function load() {
    setLoading(true)
    const startDate = `${calMonth.year}-${String(calMonth.month + 1).padStart(2,'0')}-01`
    const endDate = `${calMonth.year}-${String(calMonth.month + 1).padStart(2,'0')}-${new Date(calMonth.year, calMonth.month + 1, 0).getDate()}`
    const { data } = await supabase
      .from('sessions')
      .select('*, student:students(first_name, last_name, category, subjects)')
      .gte('session_date', startDate)
      .lte('session_date', endDate)
      .eq('status', 'scheduled')
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })
    setSessions((data || []) as any)
    setLoading(false)
  }

  function getDaysInMonth() { return new Date(calMonth.year, calMonth.month + 1, 0).getDate() }
  function getFirstDay() { return new Date(calMonth.year, calMonth.month, 1).getDay() }
  
  function dateStr(day: number) {
    return `${calMonth.year}-${String(calMonth.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }

  function sessionsForDate(date: string) {
    return sessions.filter(s => s.session_date === date && (filter === 'all' || (s.student as any)?.category === filter))
  }

  function prevMonth() {
    setCalMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 })
    setSelectedDay(null)
  }
  function nextMonth() {
    setCalMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 })
    setSelectedDay(null)
  }

  const today = new Date().toISOString().slice(0, 10)
  const selectedSessions = selectedDay ? sessionsForDate(selectedDay) : []

  // Group sessions by time slot for selected day
  const slotGroups = selectedSessions.reduce((acc, sess) => {
    const key = sess.start_time.slice(0,5)
    if (!acc[key]) acc[key] = []
    acc[key].push(sess)
    return acc
  }, {} as Record<string, SessionWithStudent[]>)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <h1 className="font-semibold text-slate-900">Capacity Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            {(['all','early_learner','main'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filter === f ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#009FE3]'}`}>
                {f === 'all' ? 'All' : f === 'early_learner' ? 'Early Learner' : 'Main Class'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Calendar */}
          <div className="lg:col-span-2 card overflow-hidden">
            {/* Month nav */}
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
              </button>
              <div className="text-center">
                <h2 className="font-semibold text-slate-900">{FULL_MONTHS[calMonth.month]} {calMonth.year}</h2>
                <p className="text-xs text-slate-400">{sessions.length} sessions this month</p>
              </div>
              <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-50 bg-slate-50">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400">{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7">
              {Array.from({ length: getFirstDay() }).map((_, i) => (
                <div key={`e-${i}`} className="h-20 border-b border-r border-slate-50 bg-slate-50/30" />
              ))}
              {Array.from({ length: getDaysInMonth() }).map((_, i) => {
                const day = i + 1
                const ds = dateStr(day)
                const daySessions = sessionsForDate(ds)
                const earlyCount = daySessions.filter(s => (s.student as any)?.category === 'early_learner').length
                const mainCount = daySessions.filter(s => (s.student as any)?.category === 'main').length
                const isToday = ds === today
                const isPast = ds < today
                const isSelected = selectedDay === ds
                const isOpen = [1,4,5,6].includes(new Date(ds + 'T12:00').getDay()) // Mon, Thu, Fri, Sat

                return (
                  <div key={day} onClick={() => daySessions.length > 0 && setSelectedDay(isSelected ? null : ds)}
                    className={`h-20 border-b border-r border-slate-50 p-1.5 transition-all
                      ${daySessions.length > 0 ? 'cursor-pointer hover:bg-blue-50/50' : ''}
                      ${isSelected ? 'bg-blue-50 ring-2 ring-inset ring-[#009FE3]' : ''}
                      ${isPast && !isToday ? 'opacity-50' : ''}
                      ${!isOpen ? 'bg-slate-50/50' : ''}`}>
                    <div className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-1
                      ${isToday ? 'bg-[#009FE3] text-white' : 'text-slate-600'}`}>
                      {day}
                    </div>
                    {daySessions.length > 0 && (
                      <div className="space-y-0.5">
                        {earlyCount > 0 && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"/>
                            <span className="text-[10px] text-green-700 font-medium">{earlyCount} EL</span>
                          </div>
                        )}
                        {mainCount > 0 && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"/>
                            <span className="text-[10px] text-blue-700 font-medium">{mainCount} MC</span>
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 font-medium">{daySessions.length} total</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="px-4 py-3 border-t border-slate-50 flex gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-400"/>Early Learner</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-400"/>Main Class</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#009FE3]"/>Today</div>
            </div>
          </div>

          {/* Day detail panel */}
          <div className="space-y-3">
            {selectedDay ? (
              <>
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-900 text-sm">
                      {new Date(selectedDay + 'T12:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </h3>
                    <span className="badge-teal">{selectedSessions.length} students</span>
                  </div>
                  {Object.keys(slotGroups).sort().map(time => {
                    const slotSessions = slotGroups[time]
                    const earlyInSlot = slotSessions.filter(s => (s.student as any)?.category === 'early_learner').length
                    const mainInSlot = slotSessions.filter(s => (s.student as any)?.category === 'main').length
                    return (
                      <div key={time} className="mb-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-slate-700">{formatTime(time + ':00')}</span>
                          <div className="flex gap-1">
                            {earlyInSlot > 0 && <span className="badge-green text-[10px]">{earlyInSlot}/{6} EL</span>}
                            {mainInSlot > 0 && <span className="badge-teal text-[10px]">{mainInSlot}/{15} MC</span>}
                          </div>
                        </div>
                        {slotSessions.map(sess => (
                          <div key={sess.id} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg mb-1 text-xs
                            ${(sess.student as any)?.category === 'early_learner' ? 'bg-green-50 border border-green-100' : 'bg-blue-50 border border-blue-100'}`}>
                            <div>
                              <span className="font-medium text-slate-900">{(sess.student as any)?.first_name} {(sess.student as any)?.last_name}</span>
                              <span className="text-slate-500 ml-1">· {formatTime(sess.start_time)} – {formatTime(sess.end_time)}</span>
                            </div>
                            <span className={(sess.student as any)?.category === 'early_learner' ? 'text-green-600' : 'text-blue-600'}>
                              {sess.duration_mins}m
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>

                {/* Staffing summary */}
                <div className="card p-4">
                  <h3 className="font-semibold text-slate-900 text-sm mb-3">Staffing summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="row"><span className="row-label">Total students</span><span className="row-val font-bold text-[#009FE3]">{selectedSessions.length}</span></div>
                    <div className="row"><span className="row-label">Early Learners</span><span className="row-val text-green-600">{selectedSessions.filter(s=>(s.student as any)?.category==='early_learner').length}</span></div>
                    <div className="row"><span className="row-label">Main Class</span><span className="row-val text-blue-600">{selectedSessions.filter(s=>(s.student as any)?.category==='main').length}</span></div>
                    <div className="row"><span className="row-label">Peak hour slots</span><span className="row-val">{Object.keys(slotGroups).length} active slots</span></div>
                  </div>
                </div>
              </>
            ) : (
              <div className="card p-6 text-center">
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5 text-[#009FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <p className="text-slate-500 text-sm">Click any day with sessions to see the detailed schedule and staffing summary</p>
              </div>
            )}

            {/* Monthly summary */}
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 text-sm mb-3">This month</h3>
              <div className="space-y-2 text-sm">
                <div className="row"><span className="row-label">Total sessions</span><span className="row-val font-bold">{sessions.length}</span></div>
                <div className="row"><span className="row-label">Early Learner</span><span className="row-val text-green-600">{sessions.filter(s=>(s.student as any)?.category==='early_learner').length}</span></div>
                <div className="row"><span className="row-label">Main Class</span><span className="row-val text-blue-600">{sessions.filter(s=>(s.student as any)?.category==='main').length}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
