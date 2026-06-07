'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Session, Student, formatDate, formatTime, getSlots, canCancel } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function ParentBookingsPage() {
  const [cancelledSessions, setCancelledSessions] = useState<(Session & { student: Student })[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: studs } = await supabase.from('students').select('*').eq('parent_id', user.id).eq('status', 'active')
    setStudents(studs || [])
    if (studs?.length) {
      const ids = studs.map((s: Student) => s.id)
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*, student:students(*)')
        .in('student_id', ids)
        .eq('status', 'cancelled')
        .is('makeup_for_id', null)
        .gte('session_date', new Date().toISOString().slice(0, 10))
        .order('session_date', { ascending: true })
      setCancelledSessions((sessions || []) as any)
    }
    setLoading(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/parent/dashboard" className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          </Link>
          <h1 className="font-semibold text-slate-900">Makeup Sessions</h1>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {cancelledSessions.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-[#009FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">No makeup sessions needed</h3>
            <p className="text-slate-500 text-sm mb-4">When you cancel a session, you can book a replacement here.</p>
            <Link href="/parent/dashboard" className="btn-primary w-auto px-6 inline-flex">← Back to dashboard</Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">You have {cancelledSessions.length} cancelled session{cancelledSessions.length !== 1 ? 's' : ''} that can be rescheduled.</p>
            {cancelledSessions.map(sess => (
              <div key={sess.id} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-slate-900">{(sess.student as any)?.first_name} {(sess.student as any)?.last_name}</div>
                    <div className="text-sm text-slate-500">{formatDate(sess.session_date)} · {formatTime(sess.start_time)}</div>
                  </div>
                  <span className="badge-red">Cancelled</span>
                </div>
                <Link href={`/parent/cancel/${sess.id}`} className="btn-primary text-sm">Book makeup session →</Link>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
