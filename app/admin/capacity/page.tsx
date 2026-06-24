'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime, categoryLabel, subjectLabel } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

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
    teacher_id: string | null
    teacher?: { id: string; name: string } | null
  }
}

export default function AdminCapacityPage() {
  const [sessions, setSessions] = useState<SessionWithStudent[]>([])
  const [calMonth, setCalMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() })
  const [selectedDay, setSelectedDay] = useState<string | null>(new Date().toISOString().slice(0,10))
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'early_learner'|'main'>('all')
  const [teacherFilter, setTeacherFilter] = useState<string>('all')
  const [teachers, setTeachers] = useState<any[]>([])
  const [savingTeacher, setSavingTeacher] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [calMonth])
  useEffect(() => { loadTeachers() }, [])

  async function loadTeachers() {
    const { data } = await supabase.from('teachers').select('*').eq('is_active', true).order('name')
    setTeachers(data || [])
  }

  async function load() {
    setLoading(true)
    const startDate = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-01`
    const endDate = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${new Date(calMonth.year, calMonth.month+1, 0).getDate()}`
    const { data } = await supabase
      .from('sessions')
      .select('*, student:students(id, first_name, last_name, category, subjects, teacher_id, teacher:teachers(id, name))')
      .gte('session_date', startDate)
      .lte('session_date', endDate)
      .eq('status', 'scheduled')
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })
    setSessions((data || []) as any)
    setLoading(false)
  }

  async function assignTeacher(studentId: string, teacherId: string) {
    setSavingTeacher(studentId)
    await supabase.from('students')
      .update({ teacher_id: teacherId || null })
      .eq('id', studentId)
    // Update local state immediately without full reload
    setSessions(prev => prev.map(s => {
      if (s.student?.id === studentId) {
        const teacher = teachers.find(t => t.id === teacherId)
        return {
          ...s,
          student: {
            ...s.student,
            teacher_id: teacherId || null,
            teacher: teacher ? { id: teacher.id, name: teacher.name } : null
          }
        }
      }
      return s
    }))
    toast.success('Teacher assigned!')
    setSavingTeacher(null)
  }

  function getDaysInMonth() { return new Date(calMonth.year, calMonth.month+1, 0).getDate() }
  function getFirstDay() { return new Date(calMonth.year, calMonth.month, 1).getDay() }
  function dateStr(day: number) {
    return `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }
  function sessionsForDate(date: string) {
    return sessions.filter(s => {
      const matchDate = s.session_date === date
      const matchCat = filter === 'all' || s.student?.category === filter
      const matchTeacher = teacherFilter === 'all' ? true
        : teacherFilter === 'unassigned' ? !s.student?.teacher_id
        : s.student?.teacher_id === teacherFilter
      return matchDate && matchCat && matchTeacher
    })
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

  // Count teacher load per slot (how many students each teacher has in that slot)
  function teacherLoadInSlot(slotSessions: SessionWithStudent[]) {
    const load: Record<string, { name: string; count: number }> = {}
    slotSessions.forEach(s => {
      const t = s.student?.teacher
      if (t) {
        if (!load[t.id]) load[t.id] = { name: t.name, count: 0 }
        load[t.id].count++
      }
    })
    return load
  }

  const noTeacherInDay = selectedSessions.filter(s => !s.student?.teacher_id).length

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <h1 className="font-semibold text-slate-900">Capacity & Teacher Planning</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Category filter */}
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-1">
              {(['all','early_learner','main'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                    ${filter === f ? 'bg-white text-[#009FE3] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {f === 'all' ? 'All classes' : f === 'early_learner' ? '🟢 Early Learner' : '🔵 Main Class'}
                </button>
              ))}
            </div>
            {/* Teacher filter */}
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setTeacherFilter('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                  ${teacherFilter === 'all' ? 'bg-white text-[#009FE3] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                All teachers
              </button>
              <button onClick={() => setTeacherFilter('unassigned')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                  ${teacherFilter === 'unassigned' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                ⚠️ Unassigned
              </button>
              {teachers.map(t => (
                <button key={t.id} onClick={() => setTeacherFilter(t.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                    ${teacherFilter === t.id ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  👩‍🏫 {t.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Calendar */}
          <div className="lg:col-span-2 card overflow-hidden self-start">
            <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
              <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
              </button>
              <div className="text-center">
                <h2 className="font-semibold text-slate-900 text-sm">{FULL_MONTHS[calMonth.month]} {calMonth.year}</h2>
                <p className="text-xs text-slate-400">{sessions.length} sessions this month</p>
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
              {Array.from({ length: getFirstDay() }).map((_,i) => (
                <div key={`e-${i}`} className="h-16 border-b border-r border-slate-50 bg-slate-50/30" />
              ))}
              {Array.from({ length: getDaysInMonth() }).map((_,i) => {
                const day = i+1
                const ds = dateStr(day)
                const daySessions = sessionsForDate(ds)
                const elCount = daySessions.filter(s => s.student?.category === 'early_learner').length
                const mcCount = daySessions.filter(s => s.student?.category === 'main').length
                const noTeacher = daySessions.filter(s => !s.student?.teacher_id).length
                const isToday = ds === today
                const isPast = ds < today
                const isSelected = selectedDay === ds

                return (
                  <div key={day} onClick={() => setSelectedDay(isSelected ? null : ds)}
                    className={`h-16 border-b border-r border-slate-50 p-1 transition-all cursor-pointer
                      ${isSelected ? 'bg-blue-50 ring-2 ring-inset ring-[#009FE3]' : 'hover:bg-blue-50/40'}
                      ${isPast && !isToday ? 'opacity-60' : ''}`}>
                    <div className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-0.5
                      ${isToday ? 'bg-[#009FE3] text-white' : 'text-slate-600'}`}>{day}</div>
                    {daySessions.length > 0 && (
                      <div className="space-y-0.5">
                        {elCount > 0 && <div className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"/><span className="text-[9px] text-green-700 font-medium">{elCount} EL</span></div>}
                        {mcCount > 0 && <div className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0"/><span className="text-[9px] text-blue-700 font-medium">{mcCount} MC</span></div>}
                        {noTeacher > 0 && <div className="text-[9px] text-amber-500 font-medium">⚠️{noTeacher}</div>}
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

            {/* Monthly summary */}
            <div className="px-4 py-4 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Month total</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-lg font-bold text-slate-900">{sessions.length}</div>
                  <div className="text-[10px] text-slate-500">Sessions</div>
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                  <div className="text-lg font-bold text-green-700">{sessions.filter(s=>s.student?.category==='early_learner').length}</div>
                  <div className="text-[10px] text-slate-500">EL</div>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <div className="text-lg font-bold text-blue-700">{sessions.filter(s=>s.student?.category==='main').length}</div>
                  <div className="text-[10px] text-slate-500">MC</div>
                </div>
              </div>
            </div>
          </div>

          {/* Day detail */}
          <div className="lg:col-span-3 space-y-3">
            {/* Active filter banner */}
            {(teacherFilter !== 'all' || filter !== 'all') && (
              <div className="card p-3 flex items-center justify-between bg-purple-50 border-purple-100">
                <div className="text-xs text-purple-700 font-medium flex items-center gap-2">
                  <span>🔍 Filtering:</span>
                  {filter !== 'all' && <span className="badge-teal">{filter === 'early_learner' ? 'Early Learner' : 'Main Class'}</span>}
                  {teacherFilter === 'unassigned' && <span className="badge-amber">⚠️ Unassigned only</span>}
                  {teacherFilter !== 'all' && teacherFilter !== 'unassigned' && (
                    <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                      👩‍🏫 {teachers.find(t => t.id === teacherFilter)?.name}
                    </span>
                  )}
                </div>
                <button onClick={() => { setFilter('all'); setTeacherFilter('all') }}
                  className="text-xs text-purple-500 hover:text-purple-700 underline">Clear filters</button>
              </div>
            )}

            {selectedDay ? (
              <>
                {/* Day header */}
                <div className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {new Date(selectedDay+'T12:00').toLocaleDateString('en-CA', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
                      </h3>
                      <div className="flex gap-3 text-xs mt-1">
                        <span className="text-green-600 font-medium">{selectedSessions.filter(s=>s.student?.category==='early_learner').length} Early Learner</span>
                        <span className="text-blue-600 font-medium">{selectedSessions.filter(s=>s.student?.category==='main').length} Main Class</span>
                        {noTeacherInDay > 0 && <span className="text-amber-500 font-medium">⚠️ {noTeacherInDay} without teacher</span>}
                      </div>
                    </div>
                    <span className="badge-teal">{selectedSessions.length} students</span>
                  </div>
                </div>

                {selectedSessions.length === 0 ? (
                  <div className="card p-6 text-center text-sm text-slate-400">No sessions on this day</div>
                ) : (
                  Object.keys(slotGroups).sort().map(time => {
                    const slotSessions = slotGroups[time]
                    const elInSlot = slotSessions.filter(s => s.student?.category === 'early_learner').length
                    const mcInSlot = slotSessions.filter(s => s.student?.category === 'main').length
                    const teacherLoad = teacherLoadInSlot(slotSessions)

                    return (
                      <div key={time} className="card overflow-hidden">
                        {/* Slot header */}
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-slate-800">{formatTime(time+':00')}</span>
                            <div className="flex gap-1.5">
                              {elInSlot > 0 && (
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full
                                  ${elInSlot >= 6 ? 'bg-red-100 text-red-700' : elInSlot/6 >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                  EL {elInSlot}/6
                                </span>
                              )}
                              {mcInSlot > 0 && (
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full
                                  ${mcInSlot >= 15 ? 'bg-red-100 text-red-700' : mcInSlot/15 >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                  MC {mcInSlot}/15
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Teacher load summary for this slot */}
                          {Object.values(teacherLoad).length > 0 && (
                            <div className="flex gap-1.5 flex-wrap justify-end">
                              {Object.values(teacherLoad).map(({ name, count }) => (
                                <span key={name} className={`text-[10px] px-2 py-0.5 rounded-full font-medium
                                  ${count >= 6 ? 'bg-red-100 text-red-700' : count >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                                  👩‍🏫 {name.split(' ')[0]}: {count}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Students */}
                        <div className="divide-y divide-slate-50">
                          {slotSessions.map(sess => (
                            <div key={sess.id} className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0
                                  ${sess.student?.category === 'early_learner' ? 'bg-green-400' : 'bg-blue-400'}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-slate-900">
                                      {sess.student?.first_name} {sess.student?.last_name}
                                    </span>
                                    <span className={sess.student?.category === 'early_learner' ? 'badge-green text-[10px]' : 'badge-teal text-[10px]'}>
                                      {categoryLabel(sess.student?.category as any)}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                      {formatTime(sess.start_time)}–{formatTime(sess.end_time)} · {subjectLabel(sess.student?.subjects as any)}
                                    </span>
                                  </div>
                                  {/* Teacher dropdown — inline on capacity page */}
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-xs text-slate-400 flex-shrink-0">👩‍🏫</span>
                                    <select
                                      className={`text-xs py-1 px-2 border rounded-lg flex-1 max-w-[220px] transition-colors
                                        ${!sess.student?.teacher_id
                                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                                          : 'border-slate-200 bg-white text-slate-700'}`}
                                      value={sess.student?.teacher_id || ''}
                                      disabled={savingTeacher === sess.student?.id}
                                      onChange={e => assignTeacher(sess.student.id, e.target.value)}>
                                      <option value="">— Assign teacher —</option>
                                      {teachers.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                    {savingTeacher === sess.student?.id && (
                                      <span className="text-xs text-slate-400">Saving…</span>
                                    )}
                                    {sess.student?.teacher_id && !savingTeacher && (
                                      <span className="text-xs text-green-600">✓</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
              </>
            ) : (
              <div className="card p-10 text-center">
                <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-[#009FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">Select a day to plan teachers</p>
                <p className="text-slate-400 text-xs">Click any day on the calendar to see all sessions and assign teachers directly</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
