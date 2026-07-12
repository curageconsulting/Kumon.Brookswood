'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Session, Student, formatDate, formatTime, canCancel, daysUntil, categoryLabel, subjectLabel, getDuration } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

type View = 'dashboard' | 'calendar'

const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Tooltip component
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onTouchStart={() => setShow(!show)}>
      {children}
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  )
}

function GuidanceBanner({ icon, title, message, color = 'blue' }: { icon: string; title: string; message: string; color?: 'blue'|'green'|'amber' }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  const styles = { blue: 'bg-blue-50 border-blue-100 text-blue-800', green: 'bg-green-50 border-green-100 text-green-800', amber: 'bg-amber-50 border-amber-100 text-amber-800' }
  return (
    <div className={`rounded-xl border p-4 flex gap-3 ${styles[color]}`}>
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs mt-0.5 opacity-80 leading-relaxed">{message}</div>
      </div>
      <button onClick={() => setDismissed(true)} className="text-current opacity-40 hover:opacity-70 flex-shrink-0 text-lg leading-none">×</button>
    </div>
  )
}

export default function ParentDashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('dashboard')
  const [calMonth, setCalMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: prof }, { data: studs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('students').select('*').eq('parent_id', user.id).eq('status', 'active'),
    ])
    setProfile(prof)
    setStudents(studs || [])
    if (studs?.length) {
      const ids = studs.map((s: Student) => s.id)
      const today = new Date().toISOString().slice(0, 10)
      const { data: sessions } = await supabase
        .from('sessions').select('*').in('student_id', ids)
        .in('status', ['scheduled', 'makeup'])
        .gte('session_date', today)
        .order('session_date', { ascending: true })
      setAllSessions(sessions || [])
    }
    setLoading(false)
  }

  function getStudent(id: string) { return students.find(s => s.id === id) }
  function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
  function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay() }
  function sessionsByDate(dateStr: string) { return allSessions.filter(s => s.session_date === dateStr) }
  function prevMonth() { setCalMonth(m => m.month === 0 ? { year: m.year-1, month:11 } : { ...m, month: m.month-1 }); setSelectedDay(null) }
  function nextMonth() { setCalMonth(m => m.month === 11 ? { year: m.year+1, month:0 } : { ...m, month: m.month+1 }); setSelectedDay(null) }

  async function signOut() { await supabase.auth.signOut(); window.location.href = '/auth/login' }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0077B6] to-[#009FE3] text-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/kumon-logo.png" alt="Kumon" className="h-9 rounded" />
            <div>
              <div className="font-semibold text-sm">Hi, {profile?.first_name || 'there'}!</div>
              <div className="text-white/70 text-xs">Kumon Brookswood</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/parent/account" className="text-white/70 hover:text-white text-xs border border-white/30 px-3 py-1.5 rounded-lg transition-colors">My account</Link>
            <button onClick={signOut} className="text-white/60 hover:text-white text-xs ml-1">Sign out</button>
          </div>
        </div>
        {(view === 'dashboard' || view === 'calendar') && students.length > 0 && (
          <div className="max-w-3xl mx-auto px-4 flex gap-1 pb-0">
            <button onClick={() => setView('dashboard')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${view === 'dashboard' ? 'bg-white text-[#0077B6]' : 'text-white/70 hover:text-white'}`}>📋 Upcoming</button>
            <button onClick={() => setView('calendar')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${view === 'calendar' ? 'bg-white text-[#0077B6]' : 'text-white/70 hover:text-white'}`}>📅 Calendar</button>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* No students — contact centre message */}
        {students.length === 0 && (
          <>
            <GuidanceBanner icon="👋" title="Welcome to Kumon Brookswood!" color="blue"
              message="Your child's sessions will appear here once the centre has set up their profile. If you're a new family, please contact us to enrol your child." />
            <div className="card p-8 text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#009FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              </div>
              <h3 className="font-semibold text-slate-900 mb-2 text-lg">No students enrolled yet</h3>
              <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
                To enrol your child, please contact Kumon Brookswood directly. We'll set up their profile and sessions for you.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a href="tel:+16042452121" className="btn-primary w-auto px-6 inline-flex">
                  📞 Call (604) 245-2121
                </a>
                <a href="mailto:brookswood@kumon.ca" className="btn-secondary w-auto px-6 inline-flex">
                  ✉️ Email us
                </a>
              </div>
              <p className="text-xs text-slate-400 mt-4">
                4043 200 St, Langley BC · Mon/Thu/Fri 2:30–6:00 PM · Sat 9:00 AM–12:00 PM
              </p>
            </div>
          </>
        )}

        {/* DASHBOARD VIEW */}
        {view === 'dashboard' && students.length > 0 && (
          <>
            <GuidanceBanner icon="💡" title="Managing your sessions" color="blue"
              message="Your sessions repeat every week. Use the Calendar tab to see all upcoming sessions. To skip a session, click Cancel at least 24 hours before — your recurring schedule stays unchanged." />
            {students.map(student => {
              const sessions = allSessions.filter(s => s.student_id === student.id).slice(0, 5)
              return (
                <div key={student.id} className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#E0F4FD] text-[#0077B6] flex items-center justify-center font-bold text-sm">
                        {student.first_name[0]}{student.last_name[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{student.first_name} {student.last_name}</div>
                        <div className="text-slate-500 text-xs">{categoryLabel(student.category)} · {subjectLabel(student.subjects)} · {getDuration(student.category, student.subjects)} min</div>
                      </div>
                    </div>
                    <span className={student.category === 'early_learner' ? 'badge-green' : 'badge-teal'}>{categoryLabel(student.category)}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {sessions.length === 0 ? (
                      <div className="px-5 py-4 text-sm text-slate-400">No upcoming sessions — please contact the centre</div>
                    ) : sessions.map(sess => {
                      const days = daysUntil(sess.session_date)
                      const cancellable = canCancel(sess.session_date, sess.start_time)
                      return (
                        <div key={sess.id} className="px-5 py-3 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{formatDate(sess.session_date)}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{formatTime(sess.start_time)} – {formatTime(sess.end_time)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={days <= 1 ? 'badge-amber' : 'badge-gray'}>{days}d away</span>
                            {cancellable ? (
                              <Tooltip text="Cancel this single session only. Your weekly recurring schedule stays unchanged. You can book a makeup session after cancelling.">
                                <Link href={`/parent/cancel/${sess.id}`} className="badge-red cursor-pointer hover:bg-red-100 transition-colors text-[11px]">Cancel</Link>
                              </Tooltip>
                            ) : (
                              <Tooltip text="Less than 24 hours away. Call (604) 245-2121 to make changes.">
                                <span className="badge-gray text-[10px] cursor-help">Locked 🔒</span>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <button onClick={() => { setSelectedStudent(student); setView('calendar') }} className="text-[#009FE3] text-xs font-medium hover:underline">
                      📅 View full year calendar →
                    </button>
                    <span className="text-xs text-slate-400">{allSessions.filter(s=>s.student_id===student.id).length} sessions booked</span>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* CALENDAR VIEW */}
        {view === 'calendar' && students.length > 0 && (
          <>
            {students.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setSelectedStudent(null)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!selectedStudent ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-600 border-slate-200'}`}>All students</button>
                {students.map(s => (
                  <button key={s.id} onClick={() => setSelectedStudent(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selectedStudent?.id === s.id ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-600 border-slate-200'}`}>
                    {s.first_name}
                  </button>
                ))}
              </div>
            )}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                </button>
                <h2 className="font-semibold text-slate-900">{FULL_MONTHS[calMonth.month]} {calMonth.year}</h2>
                <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
              <div className="grid grid-cols-7 border-b border-slate-50">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: getFirstDayOfMonth(calMonth.year, calMonth.month) }).map((_, i) => (
                  <div key={`e-${i}`} className="h-14 border-b border-r border-slate-50" />
                ))}
                {Array.from({ length: getDaysInMonth(calMonth.year, calMonth.month) }).map((_, i) => {
                  const day = i + 1
                  const dateStr = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                  const daySessions = sessionsByDate(dateStr).filter(s => !selectedStudent || s.student_id === selectedStudent.id)
                  const isToday = dateStr === today
                  const isPast = dateStr < today
                  const isSelected = selectedDay === dateStr
                  return (
                    <div key={day} onClick={() => daySessions.length > 0 ? setSelectedDay(isSelected ? null : dateStr) : null}
                      className={`h-14 border-b border-r border-slate-50 p-1 transition-colors ${daySessions.length > 0 ? 'cursor-pointer hover:bg-blue-50' : ''} ${isSelected ? 'bg-blue-50' : ''} ${isPast ? 'bg-slate-50/50' : ''}`}>
                      <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-[#009FE3] text-white' : isPast ? 'text-slate-300' : 'text-slate-700'}`}>{day}</div>
                      {daySessions.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {daySessions.slice(0, 2).map(s => {
                            const st = getStudent(s.student_id)
                            return (
                              <div key={s.id} className={`text-[10px] px-1 rounded truncate font-medium ${st?.category === 'early_learner' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {formatTime(s.start_time).replace(' AM','').replace(' PM','')} {st?.first_name}
                              </div>
                            )
                          })}
                          {daySessions.length > 2 && <div className="text-[10px] text-slate-400">+{daySessions.length-2}</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {selectedDay && (
              <div className="card p-4">
                <h3 className="font-semibold text-slate-900 text-sm mb-3">{formatDate(selectedDay)}</h3>
                <div className="space-y-2">
                  {sessionsByDate(selectedDay).filter(s => !selectedStudent || s.student_id === selectedStudent.id).map(sess => {
                    const st = getStudent(sess.student_id)
                    const cancellable = canCancel(sess.session_date, sess.start_time)
                    return (
                      <div key={sess.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div>
                          <div className="font-medium text-sm text-slate-900">{st?.first_name} {st?.last_name}</div>
                          <div className="text-xs text-slate-500">{formatTime(sess.start_time)} – {formatTime(sess.end_time)} · {subjectLabel(st?.subjects || 'math')}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {sess.status === 'makeup' && <span className="badge-amber text-[10px]">Makeup</span>}
                          {cancellable ? (
                            <Tooltip text="Cancel this one session only. Your weekly schedule continues as normal.">
                              <Link href={`/parent/cancel/${sess.id}`} className="badge-red cursor-pointer hover:bg-red-100 text-[11px]">Cancel</Link>
                            </Tooltip>
                          ) : (
                            <Tooltip text="Less than 24 hours away. Call (604) 245-2121 to make changes.">
                              <span className="badge-gray text-[10px] cursor-help">Locked 🔒</span>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3 text-xs text-slate-500 px-1">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-100 border border-green-200"/>Early Learner</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-100 border border-blue-200"/>Main Class</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#009FE3]"/>Today</div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
