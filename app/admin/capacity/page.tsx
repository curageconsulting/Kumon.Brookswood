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
  student: {
    id: string
    first_name: string
    last_name: string
    category: string
    subjects: string
    teacher?: { name: string } | null
  }
}

export default function AdminCapacityPage() {
  const [sessions, setSessions] = useState<SessionWithStudent[]>([])
  const [calMonth, setCalMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() })
  const [selectedDay, setSelectedDay] = useState<string | null>(new Date().toISOString().slice(0,10))
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'early_learner'|'main'>('all')
  const supabase = createClient()

  useEffect(() => { load() }, [calMonth])

  async function load() {
    setLoading(true)
    const startDate = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-01`
    const endDate = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${new Date(calMonth.year, calMonth.month+1, 0).getDate()}`
    const { data } = await supabase
      .from('sessions')
      .select('*, student:students(id, first_name, last_name, category, subjects, teacher:teachers(name))')
      .gte('session_date', startDate)
      .lte('session_date', endDate)
      .eq('status', 'scheduled')
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })
    setSessions((data || []) as any)
    setLoading(false)
  }

  function getDaysInMonth() { return new Date(calMonth.year, calMonth.month+1, 0).getDate() }
  function getFirstDay() { return new Date(calMonth.year, calMonth.month, 1).getDay() }
  function dateStr(day: number) {
    return `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }
  function sessionsForDate(date: string) {
    return sessions.filter(s => s.session_date === date && (filter === 'all' || s.student?.category === filter))
  }
  function prevMonth() { setCalMonth(m => m.month === 0 ? { year: m.year-1, month:11 } : { ...m, month: m.month-1 }); setSelectedDay(null) }
  function nextMonth() { setCalMonth(m => m.month === 11 ? { year: m.year+1, month:0 } : { ...m, month: m.month+1 }); setSelectedDay(null) }

  const today = new Date().toISOString().slice(0,10)
  const selectedSessions = selectedDay ? sessionsForDate(selectedDay) : []

  // Group by time slot
  const slotGroups = selectedSessions.reduce((acc, sess) => {
    const key = sess.start_time.slice(0,5)
    if (!acc[key]) acc[key] = []
    acc[key].push(sess)
    return acc
  }, {} as Record<string, SessionWithStudent[]>)

  const noTeacherInDay = selectedSessions.filter(s => !s.student?.teacher).length

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <h1 className="font-semibold text-slate-900">Capacity Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            {(['all','early_learner','main'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                  ${filter === f ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#009FE3]'}`}>
                {f === 'all' ? 'All' : f === 'early_learner' ? 'Early Learner' : 'Main Class'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Calendar — 2 cols */}
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
              <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
              </button>
              <div className="text-center">
                <h2 className="font-semibold text-slate-900 text-sm">{FULL_MONTHS[calMonth.month]} {calMonth.year}</h2>
                <p className="text-xs text-slate-400">{sessions.length} sessions</p>
              </div>
              <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
            <div className="grid grid-cols-7 border-b border-slate-50 bg-slate-50">
              {['S','M','T','W','T','F','S'].map((d,i) => (
                <div key={i} className="py-2 text-center text-xs font-semibold text-slate-400">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: getFirstDay() }).map((_, i) => (
                <div key={`e-${i}`} className="h-16 border-b border-r border-slate-50 bg-slate-50/30" />
              ))}
              {Array.from({ length: getDaysInMonth() }).map((_, i) => {
                const day = i + 1
                const ds = dateStr(day)
                const daySessions = sessionsForDate(ds)
                const elCount = daySessions.filter(s => s.student?.category === 'early_learner').length
                const mcCount = daySessions.filter(s => s.student?.category === 'main').length
                const isToday = ds === today
                const isPast = ds < today
                const isSelected = selectedDay === ds
                const noTeacher = daySessions.filter(s => !s.student?.teacher).length

                return (
                  <div key={day}
                    onClick={() => setSelectedDay(isSelected ? null : ds)}
                    className={`h-16 border-b border-r border-slate-50 p-1 transition-all cursor-pointer
                      ${isSelected ? 'bg-blue-50 ring-2 ring-inset ring-[#009FE3]' : 'hover:bg-blue-50/40'}
                      ${isPast && !isToday ? 'opacity-60' : ''}`}>
                    <div className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-0.5
                      ${isToday ? 'bg-[#009FE3] text-white' : 'text-slate-600'}`}>{day}</div>
                    {daySessions.length > 0 && (
                      <div className="space-y-0.5">
                        {elCount > 0 && <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-400"/><span className="text-[9px] text-green-700 font-medium">{elCount} EL</span></div>}
                        {mcCount > 0 && <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"/><span className="text-[9px] text-blue-700 font-medium">{mcCount} MC</span></div>}
                        {noTeacher > 0 && <div className="text-[9px] text-amber-500">⚠️{noTeacher}</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="px-4 py-2 border-t border-slate-50 flex gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-400"/>EL</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-400"/>MC</div>
              <div className="flex items-center gap-1"><span className="text-amber-500">⚠️</span>No teacher</div>
            </div>
          </div>

          {/* Day detail — 3 cols */}
          <div className="lg:col-span-3 space-y-3">
            {selectedDay ? (
              <>
                {/* Day header */}
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-slate-900">
                      {new Date(selectedDay+'T12:00').toLocaleDateString('en-CA', { weekday:'long', month:'short', day:'numeric', year:'numeric' })}
                    </h3>
                    <div className="flex gap-1.5">
                      <span className="badge-teal">{selectedSessions.length} students</span>
                      {noTeacherInDay > 0 && <span className="badge-amber">⚠️ {noTeacherInDay} no teacher</span>}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span className="text-green-600 font-medium">{selectedSessions.filter(s=>s.student?.category==='early_learner').length} Early Learner</span>
                    <span className="text-blue-600 font-medium">{selectedSessions.filter(s=>s.student?.category==='main').length} Main Class</span>
                    <span>{Object.keys(slotGroups).length} time slots</span>
                  </div>
                </div>

                {/* Slots */}
                {Object.keys(slotGroups).sort().map(time => {
                  const slotSessions = slotGroups[time]
                  const elInSlot = slotSessions.filter(s => s.student?.category === 'early_learner').length
                  const mcInSlot = slotSessions.filter(s => s.student?.category === 'main').length
                  const elFull = elInSlot >= 6
                  const mcFull = mcInSlot >= 15

                  return (
                    <div key={time} className="card overflow-hidden">
                      {/* Slot header */}
                      <div className={`px-4 py-2.5 flex items-center justify-between border-b border-slate-50
                        ${elFull || mcFull ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <span className="font-semibold text-slate-800 text-sm">{formatTime(time+':00')}</span>
                        <div className="flex gap-1.5">
                          {elInSlot > 0 && (
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full
                              ${elFull ? 'bg-red-100 text-red-700' : elInSlot/6 >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              EL {elInSlot}/6
                            </span>
                          )}
                          {mcInSlot > 0 && (
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full
                              ${mcFull ? 'bg-red-100 text-red-700' : mcInSlot/15 >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              MC {mcInSlot}/15
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Students in slot */}
                      <div className="divide-y divide-slate-50">
                        {slotSessions.map(sess => (
                          <div key={sess.id} className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0
                                ${sess.student?.category === 'early_learner' ? 'bg-green-400' : 'bg-blue-400'}`} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-900">
                                    {sess.student?.first_name} {sess.student?.last_name}
                                  </span>
                                  <span className={sess.student?.category === 'early_learner' ? 'badge-green text-[10px]' : 'badge-teal text-[10px]'}>
                                    {categoryLabel(sess.student?.category as any)}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                  <span>{formatTime(sess.start_time)} – {formatTime(sess.end_time)}</span>
                                  <span>·</span>
                                  <span>{subjectLabel(sess.student?.subjects as any)}</span>
                                  {sess.student?.teacher ? (
                                    <span className="text-purple-500">· 👩‍🏫 {(sess.student.teacher as any).name}</span>
                                  ) : (
                                    <span className="text-amber-500">· ⚠️ No teacher</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* Edit link */}
                            <Link href={`/admin/students/${sess.student?.id}`}
                              className="badge-teal cursor-pointer hover:bg-blue-100 text-[11px] flex-shrink-0">
                              Edit
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            ) : (
              <div className="card p-8 text-center">
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-[#009FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <p className="text-slate-500 text-sm">Click any day on the calendar to see the full schedule, capacity and student details</p>
              </div>
            )}

            {/* Monthly summary */}
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 text-sm mb-3">Month summary — {FULL_MONTHS[calMonth.month]}</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xl font-bold text-slate-900">{sessions.length}</div>
                  <div className="text-xs text-slate-500">Total sessions</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-xl font-bold text-green-700">{sessions.filter(s=>s.student?.category==='early_learner').length}</div>
                  <div className="text-xs text-slate-500">Early Learner</div>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-xl font-bold text-blue-700">{sessions.filter(s=>s.student?.category==='main').length}</div>
                  <div className="text-xs text-slate-500">Main Class</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
