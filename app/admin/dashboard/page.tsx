'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime, categoryLabel, subjectLabel } from '@/types'
import Link from 'next/link'

type SessionWithStudent = {
  id: string
  start_time: string
  end_time: string
  duration_mins: number
  status: string
  student: {
    first_name: string
    last_name: string
    category: string
    subjects: string
    teacher?: { name: string }
  }
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({ students: 0, sessions: 0, cancellations: 0, families: 0 })
  const [daySessions, setDaySessions] = useState<SessionWithStudent[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const supabase = createClient()

  useEffect(() => { loadStats() }, [])
  useEffect(() => { loadDaySessions() }, [selectedDate])

  async function loadStats() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
    setProfile(prof)
    const today = new Date().toISOString().slice(0, 10)
    const [students, sessions, cancellations, families] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'scheduled').gte('session_date', today),
      supabase.from('cancellations').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'parent'),
    ])
    setStats({ students: students.count||0, sessions: sessions.count||0, cancellations: cancellations.count||0, families: families.count||0 })
    setLoading(false)
  }

  async function loadDaySessions() {
    const { data } = await supabase
      .from('sessions')
      .select('*, student:students(first_name, last_name, category, subjects, teacher:teachers(name))')
      .eq('session_date', selectedDate)
      .in('status', ['scheduled', 'makeup'])
      .order('start_time', { ascending: true })
    setDaySessions((data || []) as any)
  }

  function changeDay(offset: number) {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + offset)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  function formatDisplayDate(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00')
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const label = dateStr === today ? ' (Today)' : dateStr === tomorrow ? ' (Tomorrow)' : dateStr === yesterday ? ' (Yesterday)' : ''
    return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' }) + label
  }

  const isToday = selectedDate === new Date().toISOString().slice(0, 10)
  const isPast = selectedDate < new Date().toISOString().slice(0, 10)

  // Group by time slot
  const slotGroups = daySessions.reduce((acc, sess) => {
    const key = sess.start_time.slice(0, 5)
    if (!acc[key]) acc[key] = []
    acc[key].push(sess)
    return acc
  }, {} as Record<string, SessionWithStudent[]>)

  const earlyCount = daySessions.filter(s => s.student?.category === 'early_learner').length
  const mainCount = daySessions.filter(s => s.student?.category === 'main').length

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/kumon-logo.png" alt="Kumon" className="h-8 rounded" />
            <div>
              <div className="font-semibold text-sm">Admin — {profile?.first_name}</div>
              <div className="text-white/60 text-xs">Kumon Brookswood</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/admin/students" className="text-white/70 hover:text-white transition-colors">Students</Link>
            <Link href="/admin/teachers" className="text-white/70 hover:text-white transition-colors">Teachers</Link>
            <Link href="/admin/schedules" className="text-white/70 hover:text-white transition-colors">Schedules</Link>
            <Link href="/admin/capacity" className="text-white/70 hover:text-white transition-colors">Capacity</Link>
            <button onClick={signOut} className="text-white/50 hover:text-white ml-2 transition-colors">Sign out</button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active students', val: stats.students, color: 'text-blue-600' },
            { label: 'Upcoming sessions', val: stats.sessions, color: 'text-green-600' },
            { label: 'Registered families', val: stats.families, color: 'text-purple-600' },
            { label: 'Total cancellations', val: stats.cancellations, color: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="card p-4 text-center">
              <div className={`text-3xl font-bold ${s.color} mb-1`}>{s.val}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Day view */}
          <div className="lg:col-span-2 card overflow-hidden">
            {/* Day navigation */}
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <button onClick={() => changeDay(-1)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
              </button>
              <div className="text-center">
                <div className="font-semibold text-slate-900 text-sm">{formatDisplayDate(selectedDate)}</div>
                <div className="text-xs text-slate-400 mt-0.5">{daySessions.length} sessions · {earlyCount} EL · {mainCount} MC</div>
              </div>
              <button onClick={() => changeDay(1)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>

            {/* Jump to today */}
            {!isToday && (
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex justify-center">
                <button onClick={() => setSelectedDate(new Date().toISOString().slice(0,10))} className="text-xs text-[#009FE3] hover:underline">
                  Jump to today →
                </button>
              </div>
            )}

            {/* Sessions list */}
            {daySessions.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="text-slate-400 text-sm">No sessions on this day</div>
                <div className="text-slate-300 text-xs mt-1">Centre is closed or no bookings</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {Object.keys(slotGroups).sort().map(time => {
                  const slotSessions = slotGroups[time]
                  const elCount = slotSessions.filter(s => s.student?.category === 'early_learner').length
                  const mcCount = slotSessions.filter(s => s.student?.category === 'main').length
                  return (
                    <div key={time}>
                      {/* Time slot header */}
                      <div className="px-5 py-2 bg-slate-50 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">{formatTime(time + ':00')}</span>
                        <div className="flex gap-1.5">
                          {elCount > 0 && <span className="badge-green text-[10px]">{elCount}/{6} EL</span>}
                          {mcCount > 0 && <span className="badge-teal text-[10px]">{mcCount}/{15} MC</span>}
                        </div>
                      </div>
                      {/* Students in slot */}
                      {slotSessions.map(sess => (
                        <div key={sess.id} className={`px-5 py-3 flex items-center justify-between border-b border-slate-50 last:border-0
                          ${sess.status === 'makeup' ? 'bg-amber-50/30' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sess.student?.category === 'early_learner' ? 'bg-green-400' : 'bg-blue-400'}`} />
                            <div>
                              <div className="text-sm font-medium text-slate-900">
                                {sess.student?.first_name} {sess.student?.last_name}
                                {sess.status === 'makeup' && <span className="badge-amber text-[10px] ml-2">Makeup</span>}
                              </div>
                              <div className="text-xs text-slate-500">
                                {formatTime(sess.start_time)} – {formatTime(sess.end_time)} · {subjectLabel(sess.student?.subjects as any)}
                                {sess.student?.teacher && <span className="ml-2 text-purple-500">👩‍🏫 {(sess.student.teacher as any).name}</span>}
                              </div>
                            </div>
                          </div>
                          <span className={sess.student?.category === 'early_learner' ? 'badge-green text-[10px]' : 'badge-teal text-[10px]'}>
                            {categoryLabel(sess.student?.category as any)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="space-y-3">
            {/* Quick date picker */}
            <div className="card p-4">
              <label className="label">Jump to date</label>
              <input type="date" className="input text-sm" value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)} />
            </div>

            {/* Day summary */}
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 text-sm mb-3">Day summary</h3>
              <div className="space-y-2 text-sm">
                <div className="row"><span className="row-label">Total students</span><span className="row-val font-bold text-[#009FE3]">{daySessions.length}</span></div>
                <div className="row"><span className="row-label">Early Learner</span><span className="row-val text-green-600">{earlyCount}</span></div>
                <div className="row"><span className="row-label">Main Class</span><span className="row-val text-blue-600">{mainCount}</span></div>
                <div className="row"><span className="row-label">Time slots</span><span className="row-val">{Object.keys(slotGroups).length}</span></div>
                <div className="row"><span className="row-label">Makeup sessions</span><span className="row-val text-amber-600">{daySessions.filter(s=>s.status==='makeup').length}</span></div>
              </div>
            </div>

            {/* Quick links */}
            <div className="card p-4 space-y-2">
              <h3 className="font-semibold text-slate-900 text-sm mb-1">Quick links</h3>
              <Link href="/admin/students" className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#009FE3] transition-colors py-1">
                👥 Manage students
              </Link>
              <Link href="/admin/teachers" className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#009FE3] transition-colors py-1">
                👩‍🏫 Manage teachers
              </Link>
              <Link href="/admin/schedules" className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#009FE3] transition-colors py-1">
                📅 Schedules
              </Link>
              <Link href="/admin/capacity" className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#009FE3] transition-colors py-1">
                📊 Capacity calendar
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
