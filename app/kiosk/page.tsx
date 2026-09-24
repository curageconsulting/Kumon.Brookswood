'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime } from '@/types'

type SessionWithStudent = {
  id: string
  start_time: string
  end_time: string
  status: string
  checked_in_at: string | null
  checked_out_at: string | null
  student: {
    id: string
    first_name: string
    last_name: string
    category: string
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
  return (
    <span className="font-mono font-bold text-2xl text-[#009FE3]">
      {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
    </span>
  )
}

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])
  return (
    <div className="text-center">
      <div className="text-5xl font-bold text-white font-mono tracking-wide">
        {time.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
      </div>
      <div className="text-white/70 text-lg mt-1">
        {time.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  )
}

// FIX 1: Get today's date in LOCAL time (not UTC) so Friday doesn't flip to Saturday at 5pm Pacific
function getLocalDateStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function KioskPage() {
  const [sessions, setSessions] = useState<SessionWithStudent[]>([])
  const [allStudents, setAllStudents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [recentAction, setRecentAction] = useState<{ name: string; action: string } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    load()
    // Auto-refresh every 30 seconds
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (recentAction) {
      const t = setTimeout(() => setRecentAction(null), 3000)
      return () => clearTimeout(t)
    }
  }, [recentAction])

  async function load() {
    const today = getLocalDateStr()

    // Load today's booked sessions for check-in state
    const { data: sessionData } = await supabase
      .from('sessions')
      .select(`
        id, start_time, end_time, status, checked_in_at, checked_out_at,
        student:students(id, first_name, last_name, category)
      `)
      .eq('session_date', today)
      .order('start_time', { ascending: true })

    // Build session map by booking student id
    const sessionByBookingId: Record<string, any> = {}
    const seen = new Set<string>()
    for (const s of (sessionData || [])) {
      const sid = s.student?.id
      if (!sid) continue
      // Keep the one with check-in data if multiple
      if (seen.has(sid) && !s.checked_in_at) continue
      seen.add(sid)
      sessionByBookingId[sid] = s
    }

    // Fetch kiosk check-in state for today (persists across refreshes)
    const { data: kioskCheckins } = await supabase
      .from('kiosk_checkins')
      .select('student_id, checked_in_at, checked_out_at')
      .eq('checkin_date', today)
    const kumonCheckinByStudentId: Record<string, any> = {}
    for (const kc of (kioskCheckins || [])) {
      if (kc.student_id) kumonCheckinByStudentId[kc.student_id] = kc
    }

    // Load ALL active kumon students for display
    const { data: kumonData } = await supabase
      .from('kumon_students')
      .select('id, kumon_student_id, name, status, parent_contact')
      .eq('status', 'active')
      .order('name', { ascending: true })

    // Deduplicate kumon students by kumon_student_id (one per student, not per subject)
    const seenKid = new Set<any>()
    const allStudents = (kumonData || []).filter((k: any) => {
      if (!k.kumon_student_id || seenKid.has(k.kumon_student_id)) return false
      seenKid.add(k.kumon_student_id)
      return true
    })

    // Merge: find booking session for each kumon student via kumon_student_id bridge
    const { data: bookingStudents } = await supabase
      .from('students')
      .select('id, kumon_student_id')
      .not('kumon_student_id', 'is', null)

    const bookingIdByKid: Record<string, string> = {}
    for (const b of (bookingStudents || [])) {
      if (b.kumon_student_id) bookingIdByKid[String(b.kumon_student_id)] = b.id
    }

    // Build unified student list
    const unified = allStudents.map((k: any) => {
      const bookingId = bookingIdByKid[String(k.kumon_student_id)]
      const session = bookingId ? sessionByBookingId[bookingId] : null
      const [firstName, ...rest] = (k.name || '').split(' ')
      return {
        kumonId: k.id,
        kumonStudentId: k.kumon_student_id,
        bookingStudentId: bookingId || null,
        firstName,
        lastName: rest.join(' '),
        sessionId: session?.id || null,
        checkedInAt: session?.checked_in_at || kumonCheckinByStudentId[k.id]?.checked_in_at || null,
        checkedOutAt: session?.checked_out_at || kumonCheckinByStudentId[k.id]?.checked_out_at || null,
        startTime: session?.start_time || null,
        endTime: session?.end_time || null,
        isBooked: !!session,
      }
    })

    setAllStudents(unified)
    setLoading(false)
  }

  async function walkInCheckIn(kumonStudentId: string, bookingStudentId: string | null, studentName: string) {
    setActionLoading(kumonStudentId)
    const now = new Date().toISOString()
    const today = getLocalDateStr()
    // Write to kiosk_checkins so check-in persists across refreshes
    await supabase.from('kiosk_checkins').upsert({
      id: `${kumonStudentId}|${today}`,
      student_id: kumonStudentId,
      checkin_date: today,
      checked_in_at: now,
    }, { onConflict: 'id' })

    if (bookingStudentId) {
      const { data: newSess } = await supabase.from('sessions').insert({
        student_id: bookingStudentId,
        session_date: today,
        start_time: new Date().toLocaleTimeString('en-CA', {hour:'2-digit', minute:'2-digit', hour12:false}),
        end_time: '19:00',
        status: 'makeup',
        checked_in_at: now,
      }).select().single()
      setAllStudents(prev => prev.map(s =>
        s.kumonId === kumonStudentId ? { ...s, sessionId: newSess?.id, checkedInAt: now, isBooked: true } : s
      ))
    } else {
      setAllStudents(prev => prev.map(s =>
        s.kumonId === kumonStudentId ? { ...s, checkedInAt: now } : s
      ))
    }
    setRecentAction({ name: studentName, action: 'checked in' })
    setActionLoading(null)
  }

  async function checkIn(sessionId: string, studentName: string) {
    setActionLoading(sessionId)
    const now = new Date().toISOString()
    await supabase.from('sessions')
      .update({ checked_in_at: now })
      .eq('id', sessionId)
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, checked_in_at: now } : s
    ))
    setRecentAction({ name: studentName, action: 'checked in' })
    setActionLoading(null)
  }

  async function walkInCheckOut(kumonStudentId: string, sessionId: string | null, studentName: string) {
    setActionLoading(kumonStudentId)
    const now = new Date().toISOString()
    if (sessionId) {
      await supabase.from('sessions').update({ checked_out_at: now }).eq('id', sessionId)
    }
    await supabase.from('kiosk_checkins').upsert({
      id: `${kumonStudentId}|${today}`,
      student_id: kumonStudentId,
      checkin_date: today,
      checked_out_at: now,
    }, { onConflict: 'id' })
    setAllStudents(prev => prev.map(s =>
      s.kumonId === kumonStudentId ? { ...s, checkedOutAt: now } : s
    ))
    setRecentAction({ name: studentName, action: 'checked out' })
    setActionLoading(null)
  }

  async function checkOut(sessionId: string, studentName: string) {
    setActionLoading(sessionId)
    const now = new Date().toISOString()
    await supabase.from('sessions')
      .update({ checked_out_at: now })
      .eq('id', sessionId)
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, checked_out_at: now } : s
    ))
    setRecentAction({ name: studentName, action: 'checked out' })
    setActionLoading(null)
  }

  // Derived lists from allStudents
  const filtered = allStudents.filter(s =>
    !search || (s.firstName + ' ' + s.lastName).toLowerCase().includes(search.toLowerCase())
  )
  const checkedIn = filtered.filter(s => s.checkedInAt && !s.checkedOutAt)
  const notArrived = filtered.filter(s => !s.checkedInAt)
  const checkedOut = filtered.filter(s => s.checkedOutAt)

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D1B2A] to-[#0077B6] flex flex-col">

      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/kumon-logo.png" alt="Kumon" className="h-12 rounded-lg" />
          <div>
            <div className="text-white font-bold text-xl">Kumon Brookswood</div>
            <div className="text-white/60 text-sm">Student Check-In</div>
          </div>
        </div>
        <Clock />
      </div>

      {/* Search */}
      <div className="px-8 pb-4">
        <input
          type="text"
          placeholder="🔍 Search student name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/20 outline-none focus:bg-white/20 text-sm"
        />
        <span className="text-white/40 text-xs ml-4">
          {filtered.length} students · {checkedIn.length} in center
        </span>
      </div>

      {/* Success toast */}
      {recentAction && (
        <div className="mx-8 mb-4 p-4 bg-green-400/20 border border-green-400/40 rounded-2xl text-center">
          <span className="text-green-300 font-semibold text-lg">
            ✅ {recentAction.name} successfully {recentAction.action}!
          </span>
        </div>
      )}

      <div className="flex-1 px-8 pb-8 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-white/50 text-lg">Loading students…</div>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Currently Present */}
            {checkedIn.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse"/>
                  <h2 className="text-white/80 text-sm font-semibold uppercase tracking-widest">
                    In Center ({checkedIn.length})
                  </h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {checkedIn.map(s => (
                    <div key={s.kumonId} className="bg-blue-500/20 border border-blue-400/40 rounded-2xl p-4 flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-blue-400/30 flex items-center justify-center text-2xl font-bold text-white">
                        {s.firstName?.[0]}{s.lastName?.[0]}
                      </div>
                      <div className="text-center">
                        <div className="text-white font-semibold text-sm">{s.firstName}</div>
                        <div className="text-white/60 text-xs">{s.lastName}</div>
                        {!s.isBooked && <div className="text-yellow-300 text-xs mt-1">Walk-in</div>}
                      </div>
                      <LiveTimer checkedInAt={s.checkedInAt} />
                      <div className="text-white/40 text-xs">
                        In: {new Date(s.checkedInAt).toLocaleTimeString('en-CA', {hour:'2-digit', minute:'2-digit', hour12:true})}
                      </div>
                      <button
                        onClick={() => walkInCheckOut(s.kumonId, s.sessionId, s.firstName)}
                        disabled={actionLoading === s.kumonId}
                        className="w-full py-3 rounded-xl bg-white text-[#0077B6] font-bold text-sm hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-50">
                        {actionLoading === s.kumonId ? '…' : '🚪 Check Out'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Not Yet Arrived — ALL active students */}
            {notArrived.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full bg-slate-400"/>
                  <h2 className="text-white/80 text-sm font-semibold uppercase tracking-widest">
                    All Students ({notArrived.length})
                  </h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {notArrived.map(s => (
                    <div key={s.kumonId} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-3 hover:bg-white/10 transition-colors">
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold text-white/70">
                        {s.firstName?.[0]}{s.lastName?.[0]}
                      </div>
                      <div className="text-center">
                        <div className="text-white font-semibold text-sm">{s.firstName}</div>
                        <div className="text-white/50 text-xs">{s.lastName}</div>
                        {s.startTime && (
                          <div className="text-white/30 text-xs mt-1">
                            Booked {s.startTime}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => walkInCheckIn(s.kumonId, s.bookingStudentId, s.firstName)}
                        disabled={actionLoading === s.kumonId}
                        className="w-full py-3 rounded-xl bg-[#009FE3] text-white font-bold text-sm hover:bg-[#0077B6] active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/30">
                        {actionLoading === s.kumonId ? '…' : '✅ Check In'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Checked Out */}
            {checkedOut.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full bg-green-400"/>
                  <h2 className="text-white/80 text-sm font-semibold uppercase tracking-widest">Done for Today ({checkedOut.length})</h2>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {checkedOut.map(s => {
                    const mins = s.checkedInAt && s.checkedOutAt
                      ? Math.round((new Date(s.checkedOutAt).getTime() - new Date(s.checkedInAt).getTime()) / 60000)
                      : null
                    return (
                      <div key={s.kumonId} className="bg-green-500/10 border border-green-400/20 rounded-xl p-3 flex flex-col items-center gap-1 opacity-60">
                        <div className="w-10 h-10 rounded-full bg-green-400/20 flex items-center justify-center text-lg font-bold text-green-300">
                          {s.firstName?.[0]}{s.lastName?.[0]}
                        </div>
                        <div className="text-green-300 text-xs font-medium">{s.firstName}</div>
                        {mins && <div className="text-green-400/60 text-[10px]">{mins} min</div>}
                        <div className="text-green-400/40 text-[10px]">✅ Done</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div className="flex items-center justify-center h-64">
                <div className="text-white/40 text-lg">No students found</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-8 py-4 border-t border-white/10 flex items-center justify-between">
        <div className="text-white/30 text-xs">Kumon Brookswood · 4043 200 St, Langley BC</div>
        <div className="text-white/30 text-xs">{allStudents.length} active students · Auto-refreshes every 30s</div>
      </div>
    </div>
  )
}
