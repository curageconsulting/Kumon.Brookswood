'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Session, Student, formatDate, formatTime, canCancel, daysUntil, categoryLabel, subjectLabel } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function ParentDashboard() {
  const [students, setStudents] = useState<Student[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
      const studentIds = studs.map((s: Student) => s.id)
      const today = new Date().toISOString().slice(0, 10)
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .in('student_id', studentIds)
        .eq('status', 'scheduled')
        .gte('session_date', today)
        .order('session_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(20)
      setUpcomingSessions(sessions || [])
    }
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  function getStudent(id: string) { return students.find(s => s.id === id) }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0077B6] to-[#009FE3] text-white">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/kumon-logo.png" alt="Kumon" className="h-9 rounded" />
            <div>
              <div className="font-semibold text-sm">Hi, {profile?.first_name}!</div>
              <div className="text-white/70 text-xs">Kumon Brookswood</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/parent/bookings" className="text-white/80 hover:text-white text-xs border border-white/30 px-3 py-1.5 rounded-lg transition-colors">
              Makeup sessions
            </Link>
            <button onClick={signOut} className="text-white/60 hover:text-white text-xs ml-1">Sign out</button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Students */}
        {students.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-[#009FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">No students yet</h3>
            <p className="text-slate-500 text-sm">Your students will appear here once the centre has set up your child's profile.</p>
          </div>
        ) : (
          <>
            {/* Student cards */}
            {students.map(st => {
              const sessions = upcomingSessions.filter(s => s.student_id === st.id)
              return (
                <div key={st.id} className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#E0F4FD] text-[#0077B6] flex items-center justify-center font-bold text-sm">
                        {st.first_name[0]}{st.last_name[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{st.first_name} {st.last_name}</div>
                        <div className="text-slate-500 text-xs">{categoryLabel(st.category)} · {subjectLabel(st.subjects)}</div>
                      </div>
                    </div>
                    <span className={st.category === 'early_learner' ? 'badge-green' : 'badge-teal'}>
                      {categoryLabel(st.category)}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {sessions.length === 0 ? (
                      <div className="px-5 py-4 text-sm text-slate-400">No upcoming sessions scheduled</div>
                    ) : sessions.slice(0, 5).map(sess => {
                      const days = daysUntil(sess.session_date)
                      const cancellable = canCancel(sess.session_date)
                      return (
                        <div key={sess.id} className="px-5 py-3 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{formatDate(sess.session_date)}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{formatTime(sess.start_time)} – {formatTime(sess.end_time)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={days <= 3 ? 'badge-amber' : 'badge-gray'}>{days}d away</span>
                            {cancellable ? (
                              <Link href={`/parent/cancel/${sess.id}`} className="badge-red cursor-pointer hover:bg-red-100 transition-colors">Cancel</Link>
                            ) : (
                              <span className="badge-gray text-[10px]">Cannot cancel</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/parent/bookings" className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <div><div className="text-sm font-semibold text-slate-900">Makeup sessions</div>
                <div className="text-xs text-slate-400">Book a replacement</div></div>
              </Link>
              <Link href="/parent/account" className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                </div>
                <div><div className="text-sm font-semibold text-slate-900">My account</div>
                <div className="text-xs text-slate-400">Profile & settings</div></div>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
