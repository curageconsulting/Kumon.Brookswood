'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type KumonStudent = {
  id: string
  name: string
  math_enabled: boolean
  math_level: string | null
  math_worksheet: number | null
  math_class_ws: number | null
  reading_enabled: boolean
  reading_level: string | null
  reading_worksheet: number | null
  reading_class_ws: number | null
}

type KumonSession = {
  student_id: string
  session_date: string
  present: boolean
  math_data: {
    done?: number
    fromLevel?: string
    fromWorksheet?: number
    scores?: number[]
    corrections?: string
    timeMinutes?: string
  }
  reading_data: {
    done?: number
    fromLevel?: string
    fromWorksheet?: number
    scores?: number[]
    corrections?: string
  }
  kumon_money?: number
  selected_keywords?: string[]
  custom_comment?: string
}

type StudentProgress = {
  bookingName: string
  kumonStudentId: number | null
  kumonStudent: KumonStudent | null
  sessions: KumonSession[]
}

function avgScore(scores?: number[]) {
  if (!scores?.length) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

function scoreStyle(score: number) {
  if (score === 100) return 'text-green-700 bg-green-100'
  if (score >= 95) return 'text-blue-700 bg-blue-100'
  if (score >= 85) return 'text-amber-700 bg-amber-100'
  return 'text-red-700 bg-red-100'
}

function naturalComment(keywords?: string[], comment?: string) {
  const phrases = (keywords || [])
    .map(k => k.replace(/^[\p{Emoji}\s]+/u, '').trim())
    .filter(Boolean)
    .map(p => p.charAt(0).toLowerCase() + p.slice(1))
  const custom = (comment || '').trim()
  if (!phrases.length && !custom) return null
  let sentence = ''
  if (phrases.length === 1) sentence = `Today showed ${phrases[0]}.`
  else if (phrases.length === 2) sentence = `Today showed ${phrases[0]} and ${phrases[1]}.`
  else if (phrases.length > 2) sentence = `Today showed ${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}.`
  return [sentence, custom].filter(Boolean).join(' ')
}

export default function ParentProgress() {
  const [profile, setProfile] = useState<any>(null)
  const [progress, setProgress] = useState<StudentProgress[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }

    const [{ data: prof }, { data: bookingStudents }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('students').select('*').eq('parent_id', user.id).eq('status', 'active'),
    ])
    setProfile(prof)

    if (!bookingStudents?.length) { setLoading(false); return }

    const results: StudentProgress[] = []

    for (const bs of bookingStudents) {
      let kumonStudent: KumonStudent | null = null
      let sessions: KumonSession[] = []

      if (bs.kumon_student_id) {
        const { data: ks } = await supabase
          .from('kumon_students')
          .select('*')
          .eq('kumon_student_id', bs.kumon_student_id)
          .single()

        if (ks) {
          kumonStudent = ks as KumonStudent
          const { data: sess } = await supabase
            .from('kumon_sessions')
            .select('*')
            .eq('student_id', ks.id)
            .eq('present', true)
            .order('session_date', { ascending: false })
            .limit(20)
          sessions = (sess || []) as KumonSession[]
        }
      }

      results.push({
        bookingName: `${bs.first_name} ${bs.last_name}`,
        kumonStudentId: bs.kumon_student_id ?? null,
        kumonStudent,
        sessions,
      })
    }

    setProgress(results)
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading…</div>
    </div>
  )

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
          <button onClick={signOut} className="text-white/60 hover:text-white text-xs">Sign out</button>
        </div>
        <div className="max-w-3xl mx-auto px-4 flex gap-1 pb-0 overflow-x-auto">
          <Link href="/parent/dashboard" className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-white/70 hover:text-white whitespace-nowrap">📋 Sessions</Link>
          <Link href="/parent/progress" className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors bg-white text-[#0077B6] whitespace-nowrap">📈 Progress</Link>
          <Link href="/parent/notifications" className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-white/70 hover:text-white whitespace-nowrap">🔔 Alerts</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {progress.length === 0 ? (
          <div className="card p-8 text-center text-slate-400 text-sm">No students found.</div>
        ) : progress.map((p, i) => (
          <div key={i} className="space-y-4">
            <h2 className="font-bold text-slate-900 text-base">{p.bookingName}</h2>

            {!p.kumonStudent ? (
              <div className="card p-6 text-center">
                <div className="text-4xl mb-3">📚</div>
                <div className="font-semibold text-slate-700 mb-1">Progress tracking coming soon</div>
                <div className="text-sm text-slate-500 leading-relaxed">
                  Once your child attends their first session, their worksheet progress,
                  scores and instructor comments will appear here.
                </div>
              </div>
            ) : (
              <>
                {/* Current level */}
                <div className="card p-5">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Current Level</div>
                  <div className="flex gap-3 flex-wrap">
                    {p.kumonStudent.math_enabled && p.kumonStudent.math_level && (
                      <div className="flex-1 min-w-[140px] bg-blue-50 rounded-xl p-4">
                        <div className="text-xs text-blue-500 font-bold mb-1 tracking-wide">📐 MATH</div>
                        <div className="text-4xl font-black text-blue-700 leading-none">{p.kumonStudent.math_level}</div>
                        <div className="text-xs text-blue-400 mt-1.5">Worksheet #{p.kumonStudent.math_worksheet}</div>
                        {p.kumonStudent.math_class_ws && (
                          <div className="text-xs text-blue-300 mt-0.5">{p.kumonStudent.math_class_ws} sheets per class</div>
                        )}
                      </div>
                    )}
                    {p.kumonStudent.reading_enabled && p.kumonStudent.reading_level && (
                      <div className="flex-1 min-w-[140px] bg-pink-50 rounded-xl p-4">
                        <div className="text-xs text-pink-500 font-bold mb-1 tracking-wide">📖 READING</div>
                        <div className="text-4xl font-black text-pink-600 leading-none">{p.kumonStudent.reading_level}</div>
                        <div className="text-xs text-pink-400 mt-1.5">Worksheet #{p.kumonStudent.reading_worksheet}</div>
                        {p.kumonStudent.reading_class_ws && (
                          <div className="text-xs text-pink-300 mt-0.5">{p.kumonStudent.reading_class_ws} sheets per class</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Attendance summary */}
                {p.sessions.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-black text-slate-800">{p.sessions.length}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Sessions attended</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-black text-blue-600">
                        {(() => {
                          const scores = p.sessions.flatMap(s => s.math_data?.scores || [])
                          return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) + '%' : '—'
                        })()}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">Avg math score</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-black text-pink-500">
                        {(() => {
                          const scores = p.sessions.flatMap(s => s.reading_data?.scores || [])
                          return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) + '%' : '—'
                        })()}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">Avg reading score</div>
                    </div>
                  </div>
                )}

                {/* Session history */}
                {p.sessions.length === 0 ? (
                  <div className="card p-5 text-center text-slate-400 text-sm">No sessions recorded yet.</div>
                ) : (
                  <div className="card overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Recent Sessions</div>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {p.sessions.map((sess, si) => {
                        const mDone = sess.math_data?.done || 0
                        const rDone = sess.reading_data?.done || 0
                        const mAvg = avgScore(sess.math_data?.scores)
                        const rAvg = avgScore(sess.reading_data?.scores)
                        const date = new Date(sess.session_date + 'T12:00:00')
                        const dateStr = date.toLocaleDateString('en-CA', {
                          weekday: 'short', month: 'short', day: 'numeric'
                        })
                        const comment = naturalComment(sess.selected_keywords, sess.custom_comment)

                        return (
                          <div key={si} className="px-5 py-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="font-semibold text-slate-900 text-sm">{dateStr}</div>
                              <div className="flex gap-1.5 flex-shrink-0">
                                {mDone > 0 && mAvg !== null && (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreStyle(mAvg)}`}>
                                    📐 {mAvg}%
                                  </span>
                                )}
                                {rDone > 0 && rAvg !== null && (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreStyle(rAvg)}`}>
                                    📖 {rAvg}%
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-2">
                              {mDone > 0 && (
                                <span>
                                  📐 {mDone} worksheet{mDone > 1 ? 's' : ''} · {sess.math_data.fromLevel}{sess.math_data.fromWorksheet}
                                  {sess.math_data.corrections === 'done' ? ' · ✅ corrections done'
                                    : sess.math_data.corrections === 'pending' ? ' · ⏳ corrections at home' : ''}
                                  {sess.math_data.timeMinutes ? ` · ${sess.math_data.timeMinutes} min` : ''}
                                </span>
                              )}
                              {rDone > 0 && (
                                <span>
                                  📖 {rDone} worksheet{rDone > 1 ? 's' : ''} · {sess.reading_data.fromLevel}{sess.reading_data.fromWorksheet}
                                  {sess.reading_data.corrections === 'done' ? ' · ✅ corrections done'
                                    : sess.reading_data.corrections === 'pending' ? ' · ⏳ corrections at home' : ''}
                                </span>
                              )}
                            </div>

                            {comment && (
                              <div className="text-xs text-slate-500 italic bg-slate-50 rounded-lg px-3 py-2">
                                "{comment}"
                              </div>
                            )}

                            {(sess.kumon_money ?? 0) > 0 && (
                              <div className="text-xs text-purple-600 font-semibold mt-2">
                                💰 Earned ${sess.kumon_money} Kumon Money
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
