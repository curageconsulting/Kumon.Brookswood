'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime, categoryLabel, subjectLabel } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

type SessionWithStudent = {
  id: string
  start_time: string
  end_time: string
  duration_mins: number
  status: string
  checked_in_at: string | null
  checked_out_at: string | null
  reminder_sent_at: string | null
  student: {
    id: string
    first_name: string
    last_name: string
    category: string
    subjects: string
    teacher?: { name: string } | null
    parent?: { first_name: string; phone: string | null } | null
  }
}

function LiveTimer({ checkedInAt }: { checkedInAt: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(checkedInAt).getTime()
    const update = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [checkedInAt])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const isOvertime = mins >= 90
  const isLong = mins >= 60

  return (
    <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full
      ${isOvertime ? 'bg-red-100 text-red-700' : isLong ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
      ⏱ {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
    </span>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({ students: 0, sessions: 0, cancellations: 0, families: 0 })
  const [daySessions, setDaySessions] = useState<SessionWithStudent[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [actionLoading, setActionLoading] = useState<string | null>(null)
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
      .select(`
        id, start_time, end_time, duration_mins, status,
        checked_in_at, checked_out_at, reminder_sent_at,
        student:students(
          id, first_name, last_name, category, subjects,
          teacher:teachers(name),
          parent:profiles(first_name, phone)
        )
      `)
      .eq('session_date', selectedDate)
      .in('status', ['scheduled', 'makeup', 'absent'])
      .order('start_time', { ascending: true })
    setDaySessions((data || []) as any)
  }

  async function callApi(url: string, sessionId: string, successMsg?: string) {
    setActionLoading(sessionId + url)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })
      const data = await res.json()
      if (data.success || data.success === undefined) {
        toast.success(successMsg || data.message || 'Done!')
        if (data.minutes_spent) {
          toast.success(`Time spent: ${data.minutes_spent} minutes`, { duration: 5000 })
        }
        loadDaySessions()
      } else {
        toast.error(data.error || 'Something went wrong')
      }
    } catch (e) {
      toast.error('Network error')
    }
    setActionLoading(null)
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

  function formatDuration(checkedIn: string, checkedOut: string) {
    const mins = Math.round((new Date(checkedOut).getTime() - new Date(checkedIn).getTime()) / 60000)
    return `${mins} min`
  }

  const isToday = selectedDate === new Date().toISOString().slice(0, 10)
  const presentCount = daySessions.filter(s => s.checked_in_at && !s.checked_out_at).length
  const checkedOutCount = daySessions.filter(s => s.checked_out_at).length
  const absentCount = daySessions.filter(s => s.status === 'absent').length
  const notArrivedCount = daySessions.filter(s => !s.checked_in_at && s.status !== 'absent').length

  const slotGroups = daySessions.reduce((acc, sess) => {
    const key = sess.start_time.slice(0, 5)
    if (!acc[key]) acc[key] = []
    acc[key].push(sess)
    return acc
  }, {} as Record<string, SessionWithStudent[]>)

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>

  return (
    <div className="min-h-screen bg-slate-50">
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
            <Link href="/admin/students" className="text-white/70 hover:text-white">Students</Link>
            <Link href="/admin/teachers" className="text-white/70 hover:text-white">Teachers</Link>
            <Link href="/admin/schedules" className="text-white/70 hover:text-white">Schedules</Link>
            <Link href="/admin/capacity" className="text-white/70 hover:text-white">Capacity</Link>
            <button onClick={signOut} className="text-white/50 hover:text-white ml-2">Sign out</button>
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
              <button onClick={() => changeDay(-1)} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
              </button>
              <div className="text-center">
                <div className="font-semibold text-slate-900 text-sm">{formatDisplayDate(selectedDate)}</div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-green-600">✅ {checkedOutCount} done</span>
                  <span className="text-blue-600">🔵 {presentCount} present</span>
                  <span className="text-slate-400">⏳ {notArrivedCount} expected</span>
                  {absentCount > 0 && <span className="text-red-500">🔴 {absentCount} absent</span>}
                </div>
              </div>
              <button onClick={() => changeDay(1)} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>

            {!isToday && (
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex justify-center">
                <button onClick={() => setSelectedDate(new Date().toISOString().slice(0,10))} className="text-xs text-[#009FE3] hover:underline">Jump to today →</button>
              </div>
            )}

            {daySessions.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">No sessions on this day</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {Object.keys(slotGroups).sort().map(time => {
                  const slotSessions = slotGroups[time]
                  const elCount = slotSessions.filter(s => s.student?.category === 'early_learner' && s.status !== 'absent').length
                  const mcCount = slotSessions.filter(s => s.student?.category === 'main' && s.status !== 'absent').length
                  return (
                    <div key={time}>
                      <div className="px-5 py-2 bg-slate-50 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">{formatTime(time+':00')}</span>
                        <div className="flex gap-1.5">
                          {elCount > 0 && <span className="badge-green text-[10px]">EL {elCount}/6</span>}
                          {mcCount > 0 && <span className="badge-teal text-[10px]">MC {mcCount}/15</span>}
                        </div>
                      </div>
                      {slotSessions.map(sess => {
                        const isCheckedIn = !!sess.checked_in_at && !sess.checked_out_at
                        const isCheckedOut = !!sess.checked_out_at
                        const isAbsent = sess.status === 'absent'
                        const loading = actionLoading?.startsWith(sess.id)

                        return (
                          <div key={sess.id} className={`px-5 py-3 border-b border-slate-50 last:border-0
                            ${isAbsent ? 'bg-red-50/40' : isCheckedOut ? 'bg-green-50/30' : isCheckedIn ? 'bg-blue-50/30' : ''}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                {/* Status dot */}
                                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5
                                  ${isAbsent ? 'bg-red-400' : isCheckedOut ? 'bg-green-400' : isCheckedIn ? 'bg-blue-400 animate-pulse' : 'bg-slate-300'}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-slate-900">
                                      {sess.student?.first_name} {sess.student?.last_name}
                                    </span>
                                    {isAbsent && <span className="badge-red text-[10px]">Absent</span>}
                                    {sess.status === 'makeup' && <span className="badge-amber text-[10px]">Makeup</span>}
                                    {sess.reminder_sent_at && <span className="text-[10px] text-blue-400">💬 Reminded</span>}
                                    {/* Live timer if checked in */}
                                    {isCheckedIn && <LiveTimer checkedInAt={sess.checked_in_at!} />}
                                    {/* Duration if checked out */}
                                    {isCheckedOut && (
                                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                        ✅ {formatDuration(sess.checked_in_at!, sess.checked_out_at!)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                                    <span>{formatTime(sess.start_time)}–{formatTime(sess.end_time)}</span>
                                    <span>·</span>
                                    <span>{subjectLabel(sess.student?.subjects as any)}</span>
                                    {sess.student?.teacher && <span className="text-purple-500">· 👩‍🏫 {(sess.student.teacher as any).name}</span>}
                                    {(sess.student?.parent as any)?.phone && (
                                      <span className="text-slate-400">· 📞 {(sess.student.parent as any).phone}</span>
                                    )}
                                  </div>
                                  {/* Check-in/out times */}
                                  {sess.checked_in_at && (
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      In: {new Date(sess.checked_in_at).toLocaleTimeString('en-CA', { hour:'2-digit', minute:'2-digit' })}
                                      {sess.checked_out_at && ` · Out: ${new Date(sess.checked_out_at).toLocaleTimeString('en-CA', { hour:'2-digit', minute:'2-digit' })}`}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Action buttons */}
                              {!isAbsent && (
                                <div className="flex flex-col gap-1.5 flex-shrink-0">
                                  {!isCheckedIn && !isCheckedOut && (
                                    <>
                                      <button onClick={() => callApi('/api/sessions/checkin', sess.id, `${sess.student?.first_name} checked in!`)}
                                        disabled={!!loading}
                                        className="text-[11px] px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 font-medium transition-colors">
                                        {loading ? '…' : '✅ Check In'}
                                      </button>
                                      <button onClick={() => callApi('/api/sms/absent', sess.id, 'Marked absent')}
                                        disabled={!!loading}
                                        className="text-[11px] px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-medium transition-colors">
                                        {loading ? '…' : '🔴 Absent'}
                                      </button>
                                    </>
                                  )}
                                  {isCheckedIn && !isCheckedOut && (
                                    <button onClick={() => callApi('/api/sessions/checkout', sess.id, `${sess.student?.first_name} checked out!`)}
                                      disabled={!!loading}
                                      className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-medium transition-colors">
                                      {loading ? '…' : '🚪 Check Out'}
                                    </button>
                                  )}
                                  {isCheckedOut && (
                                    <span className="text-[10px] text-green-600 font-medium">Session complete</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="space-y-3">
            <div className="card p-4">
              <label className="label">Jump to date</label>
              <input type="date" className="input text-sm" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            </div>

            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 text-sm mb-3">Day summary</h3>
              <div className="space-y-2 text-sm">
                <div className="row"><span className="row-label">Total expected</span><span className="row-val font-bold text-[#009FE3]">{daySessions.length}</span></div>
                <div className="row"><span className="row-label">✅ Checked out</span><span className="row-val text-green-600">{checkedOutCount}</span></div>
                <div className="row"><span className="row-label">🔵 Present now</span><span className="row-val text-blue-600">{presentCount}</span></div>
                <div className="row"><span className="row-label">⏳ Not arrived</span><span className="row-val text-slate-500">{notArrivedCount}</span></div>
                <div className="row"><span className="row-label">🔴 Absent</span><span className="row-val text-red-500">{absentCount}</span></div>
              </div>
            </div>

            <div className="card p-4 bg-slate-50">
              <h3 className="font-semibold text-slate-700 text-xs mb-2 uppercase tracking-wide">Legend</h3>
              <div className="text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-300"/><span>Not arrived yet</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"/><span>Currently present (timer running)</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-400"/><span>Checked out (session complete)</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-400"/><span>Marked absent (SMS sent)</span></div>
              </div>
            </div>

            <div className="card p-4 bg-blue-50 border-blue-100">
              <h3 className="font-semibold text-blue-900 text-xs mb-2 uppercase tracking-wide">Auto reminders</h3>
              <p className="text-xs text-blue-700">SMS reminders are sent automatically 8 hours before each session to parents who have a phone number on file.</p>
            </div>

            <div className="card p-4 space-y-2">
              <h3 className="font-semibold text-slate-900 text-sm mb-1">Quick links</h3>
              <Link href="/admin/students" className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#009FE3] py-1">👥 Students</Link>
              <Link href="/admin/teachers" className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#009FE3] py-1">👩‍🏫 Teachers</Link>
              <Link href="/admin/schedules" className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#009FE3] py-1">📅 Schedules</Link>
              <Link href="/admin/capacity" className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#009FE3] py-1">📊 Capacity</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
