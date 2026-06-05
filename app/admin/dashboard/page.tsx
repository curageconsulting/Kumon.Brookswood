'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Student, Session, formatDate, formatTime, categoryLabel, subjectLabel } from '@/types'
import Link from 'next/link'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ students: 0, sessions: 0, cancellations: 0, families: 0 })
  const [todaySessions, setTodaySessions] = useState<(Session & { student: Student })[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
    setProfile(prof)
    const today = new Date().toISOString().slice(0, 10)
    const [students, sessions, cancellations, families, todaySess] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'scheduled').gte('session_date', today),
      supabase.from('cancellations').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'parent'),
      supabase.from('sessions').select('*, student:students(*)').eq('session_date', today).eq('status', 'scheduled').order('start_time'),
    ])
    setStats({ students: students.count||0, sessions: sessions.count||0, cancellations: cancellations.count||0, families: families.count||0 })
    setTodaySessions((todaySess.data || []) as any)
    setLoading(false)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/kumon-logo.png" alt="Kumon" className="h-8 rounded" />
            <div>
              <div className="font-semibold text-sm">Admin Dashboard</div>
              <div className="text-white/60 text-xs">Kumon Brookswood</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/admin/students" className="text-white/70 hover:text-white transition-colors">Students</Link>
            <Link href="/admin/schedules" className="text-white/70 hover:text-white transition-colors">Schedules</Link>
            <Link href="/admin/capacity" className="text-white/70 hover:text-white transition-colors">Capacity</Link>
            <button onClick={signOut} className="text-white/50 hover:text-white ml-2 transition-colors">Sign out</button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active students', val: stats.students, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Upcoming sessions', val: stats.sessions, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Registered families', val: stats.families, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Total cancellations', val: stats.cancellations, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(s => (
            <div key={s.label} className="card p-4 text-center">
              <div className={`text-3xl font-bold ${s.color} mb-1`}>{s.val}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Today's sessions */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 text-sm">Today's sessions — {formatDate(new Date().toISOString().slice(0,10))}</h2>
            <span className="badge-gray">{todaySessions.length} sessions</span>
          </div>
          {todaySessions.length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-400 text-center">No sessions scheduled today</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {todaySessions.map(sess => (
                <div key={sess.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{(sess.student as any)?.first_name} {(sess.student as any)?.last_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{subjectLabel((sess.student as any)?.subjects)} · {categoryLabel((sess.student as any)?.category)}</div>
                  </div>
                  <div className="text-sm text-slate-700 font-medium">{formatTime(sess.start_time)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/admin/students" className="card p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              </div>
              <div className="font-semibold text-sm text-slate-900">Manage students</div>
            </div>
            <p className="text-xs text-slate-500">Add, edit, archive students and assign categories</p>
          </Link>
          <Link href="/admin/schedules" className="card p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <div className="font-semibold text-sm text-slate-900">Schedules</div>
            </div>
            <p className="text-xs text-slate-500">Create recurring schedules and manage academic year</p>
          </Link>
          <Link href="/admin/capacity" className="card p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              </div>
              <div className="font-semibold text-sm text-slate-900">Capacity view</div>
            </div>
            <p className="text-xs text-slate-500">Monitor slot availability and prevent overbooking</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
