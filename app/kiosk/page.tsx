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

export default function KioskPage() {
  const [sessions, setSessions] = useState<SessionWithStudent[]>([])
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

  // Clear recent action after 3 seconds
  useEffect(() => {
    if (recentAction) {
      const t = setTimeout(() => setRecentAction(null), 3000)
      return () => clearTimeout(t)
    }
  }, [recentAction])

  async function load() {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('sessions')
      .select(`
        id, start_time, end_time, status, checked_in_at, checked_out_at,
        student:students(id, first_name, last_name, category)
      `)
      .eq('session_date', today)
      .in('status', ['scheduled', 'makeup'])
      .order('start_time', { ascending: true })
    setSessions((data || []) as any)
    setLoading(false)
  }

  async function checkIn(sessionId: string, studentName: string) {
    setActionLoading(sessionId)
    const now = new Date().toISOString()
    await supabase.from('sessions')
      .update({ checked_in_at: now })
      .eq('id', sessionId)
    // Update local state immediately
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, checked_in_at: now } : s
    ))
    setRecentAction({ name: studentName, action: 'checked in' })
    setActionLoading(null)
  }

  async function checkOut(sessionId: string, studentName: string) {
    setActionLoading(sessionId)
    const now = new Date().toISOString()
    await supabase.from('sessions')
      .update({ checked_out_at: now })
      .eq('id', sessionId)
    // Update local state immediately
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, checked_out_at: now } : s
    ))
    setRecentAction({ name: studentName, action: 'checked out' })
    setActionLoading(null)
  }

  const checkedIn = sessions.filter(s => s.checked_in_at && !s.checked_out_at)
  const notArrived = sessions.filter(s => !s.checked_in_at)
  const checkedOut = sessions.filter(s => s.checked_out_at)

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D1B2A] to-[#0077B6] flex flex-col">

      {/* Header */}
      <div className="px-8 pt-8 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/kumon-logo.png" alt="Kumon" className="h-12 rounded-lg" />
          <div>
            <div className="text-white font-bold text-xl">Kumon Brookswood</div>
            <div className="text-white/60 text-sm">Student Check-In</div>
          </div>
        </div>
        <Clock />
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
            <div className="text-white/50 text-lg">Loading today's sessions…</div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="text-6xl mb-4">📚</div>
              <div className="text-white text-2xl font-semibold">No sessions today</div>
              <div className="text-white/50 mt-2">Check back on your next session day</div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Currently Present */}
            {checkedIn.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse"/>
                  <h2 className="text-white/80 text-sm font-semibold uppercase tracking-widest">Currently Present ({checkedIn.length})</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {checkedIn.map(sess => (
                    <div key={sess.id} className="bg-blue-500/20 border border-blue-400/40 rounded-2xl p-4 flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-blue-400/30 flex items-center justify-center text-2xl font-bold text-white">
                        {(sess.student as any)?.first_name?.[0]}{(sess.student as any)?.last_name?.[0]}
                      </div>
                      <div className="text-center">
                        <div className="text-white font-semibold text-sm">{(sess.student as any)?.first_name}</div>
                        <div className="text-white/60 text-xs">{(sess.student as any)?.last_name}</div>
                      </div>
                      <LiveTimer checkedInAt={sess.checked_in_at!} />
                      <div className="text-white/40 text-xs">
                        In: {new Date(sess.checked_in_at!).toLocaleTimeString('en-CA', { hour:'2-digit', minute:'2-digit', hour12:true })}
                      </div>
                      <button
                        onClick={() => checkOut(sess.id, `${(sess.student as any)?.first_name}`)}
                        disabled={actionLoading === sess.id}
                        className="w-full py-3 rounded-xl bg-white text-[#0077B6] font-bold text-sm hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-50">
                        {actionLoading === sess.id ? '…' : '🚪 Check Out'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Not Yet Arrived */}
            {notArrived.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full bg-slate-400"/>
                  <h2 className="text-white/80 text-sm font-semibold uppercase tracking-widest">Expected Today ({notArrived.length})</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {notArrived.map(sess => (
                    <div key={sess.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-3 hover:bg-white/10 transition-colors">
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold text-white/70">
                        {(sess.student as any)?.first_name?.[0]}{(sess.student as any)?.last_name?.[0]}
                      </div>
                      <div className="text-center">
                        <div className="text-white font-semibold text-sm">{(sess.student as any)?.first_name}</div>
                        <div className="text-white/50 text-xs">{(sess.student as any)?.last_name}</div>
                      </div>
                      <div className="text-white/40 text-xs">
                        {formatTime(sess.start_time)} – {formatTime(sess.end_time)}
                      </div>
                      <button
                        onClick={() => checkIn(sess.id, `${(sess.student as any)?.first_name}`)}
                        disabled={actionLoading === sess.id}
                        className="w-full py-3 rounded-xl bg-[#009FE3] text-white font-bold text-sm hover:bg-[#0077B6] active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/30">
                        {actionLoading === sess.id ? '…' : '✅ Check In'}
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
                  {checkedOut.map(sess => {
                    const mins = sess.checked_in_at && sess.checked_out_at
                      ? Math.round((new Date(sess.checked_out_at).getTime() - new Date(sess.checked_in_at).getTime()) / 60000)
                      : null
                    return (
                      <div key={sess.id} className="bg-green-500/10 border border-green-400/20 rounded-xl p-3 flex flex-col items-center gap-1 opacity-60">
                        <div className="w-10 h-10 rounded-full bg-green-400/20 flex items-center justify-center text-lg font-bold text-green-300">
                          {(sess.student as any)?.first_name?.[0]}{(sess.student as any)?.last_name?.[0]}
                        </div>
                        <div className="text-green-300 text-xs font-medium">{(sess.student as any)?.first_name}</div>
                        {mins && <div className="text-green-400/60 text-[10px]">{mins} min</div>}
                        <div className="text-green-400/40 text-[10px]">✅ Done</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-8 py-4 border-t border-white/10 flex items-center justify-between">
        <div className="text-white/30 text-xs">Kumon Brookswood · 4043 200 St, Langley BC</div>
        <div className="text-white/30 text-xs">{sessions.length} sessions today · Auto-refreshes every 30s</div>
      </div>
    </div>
  )
}
