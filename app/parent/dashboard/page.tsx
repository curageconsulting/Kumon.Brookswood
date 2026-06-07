'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Session, Student, formatDate, formatTime, canCancel, daysUntil, categoryLabel, subjectLabel, getDuration, getSlots, DayOfWeek } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

type Step = 'dashboard' | 'add_student' | 'book_day1' | 'book_slot1' | 'book_day2' | 'book_slot2' | 'confirm'

const DAYS: DayOfWeek[] = ['monday', 'thursday', 'friday', 'saturday']
const DAY_LABELS: Record<DayOfWeek, string> = { monday: 'Monday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' }
const DAY_HOURS: Record<DayOfWeek, string> = { monday: '2:30 – 6:00 PM', thursday: '2:30 – 6:00 PM', friday: '2:30 – 6:00 PM', saturday: '9:00 AM – 12:00 PM' }

export default function ParentDashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('dashboard')

  // Add student form
  const [sfn, setSfn] = useState('')
  const [sln, setSln] = useState('')
  const [category, setCategory] = useState<'early_learner'|'main'>('early_learner')
  const [subjects, setSubjects] = useState<'math'|'reading'|'both'>('math')
  const [saving, setSaving] = useState(false)
  const [newStudent, setNewStudent] = useState<Student|null>(null)

  // Booking
  const [day1, setDay1] = useState<DayOfWeek|null>(null)
  const [slot1, setSlot1] = useState<string|null>(null)
  const [day2, setDay2] = useState<DayOfWeek|null>(null)
  const [slot2, setSlot2] = useState<string|null>(null)
  const [slotCapacity, setSlotCapacity] = useState<Record<string, number>>({})
  const [booking, setBooking] = useState(false)

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
        .eq('status', 'scheduled').gte('session_date', today)
        .order('session_date', { ascending: true }).limit(20)
      setUpcomingSessions(sessions || [])
    }
    setLoading(false)
  }

  async function loadCapacity(day: DayOfWeek, cat: 'early_learner'|'main', subj: 'math'|'reading'|'both') {
    const slots = getSlots(day, cat, subj)
    const today = new Date()
    let nextDate = new Date(today)
    const dowMap: Record<DayOfWeek, number> = { monday:1, thursday:4, friday:5, saturday:6 }
    let diff = dowMap[day] - today.getDay()
    if (diff <= 0) diff += 7
    nextDate.setDate(today.getDate() + diff)
    const dateStr = nextDate.toISOString().slice(0, 10)
    const cap: Record<string, number> = {}
    for (const slot of slots) {
      const { count } = await supabase.from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('session_date', dateStr).eq('start_time', slot).eq('status', 'scheduled')
      cap[slot] = count || 0
    }
    setSlotCapacity(cap)
    return slots
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!sfn || !sln) { toast.error('Please enter student name'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: st, error } = await supabase.from('students').insert({
      parent_id: user!.id, first_name: sfn, last_name: sln,
      category, subjects, status: 'active'
    }).select().single()
    if (error) { toast.error('Failed to add student'); setSaving(false); return }
    setNewStudent(st as Student)
    setSaving(false)
    setStep('book_day1')
  }

  async function pickDay(which: 1|2, day: DayOfWeek) {
    const st = newStudent!
    if (which === 1) {
      setDay1(day); setSlot1(null)
      await loadCapacity(day, st.category, st.subjects)
      setStep('book_slot1')
    } else {
      setDay2(day); setSlot2(null)
      await loadCapacity(day, st.category, st.subjects)
      setStep('book_slot2')
    }
  }

  async function confirmBooking() {
    if (!newStudent || !day1 || !slot1 || !day2 || !slot2) return
    setBooking(true)
    const dur = getDuration(newStudent.category, newStudent.subjects)
    const { data: years } = await supabase.from('academic_years').select('*').eq('is_active', true).single()
    
    for (const [day, slot] of [[day1, slot1], [day2, slot2]]) {
      // Create recurring schedule
      const { data: sched } = await supabase.from('recurring_schedules').insert({
        student_id: newStudent.id, day_of_week: day,
        start_time: slot, duration_mins: dur,
        academic_year_id: (years as any)?.id || null, is_active: true
      }).select().single()
      // Generate sessions if academic year exists
      if (sched && (years as any)?.id) {
        await supabase.rpc('generate_sessions_from_schedule', { schedule_id: (sched as any).id })
      }
    }
    toast.success('Sessions booked successfully!')
    setBooking(false)
    setStep('dashboard')
    setSfn(''); setSln(''); setNewStudent(null)
    setDay1(null); setSlot1(null); setDay2(null); setSlot2(null)
    load()
  }

  function availBadge(booked: number, max: number) {
    const left = max - booked
    if (left <= 0) return <span className="badge-red text-[10px]">Full</span>
    if (booked / max >= 0.5) return <span className="badge-amber text-[10px]">🟡 {left} left</span>
    return <span className="badge-green text-[10px]">🟢 {left} left</span>
  }

  async function signOut() { await supabase.auth.signOut(); window.location.href = '/auth/login' }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>

  const st = newStudent

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0077B6] to-[#009FE3] text-white">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/kumon-logo.png" alt="Kumon" className="h-9 rounded" />
            <div>
              <div className="font-semibold text-sm">Hi, {profile?.first_name || 'there'}!</div>
              <div className="text-white/70 text-xs">Kumon Brookswood</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {step !== 'dashboard' && (
              <button onClick={() => { setStep('dashboard'); setNewStudent(null) }} className="text-white/80 hover:text-white text-xs border border-white/30 px-3 py-1.5 rounded-lg">Cancel</button>
            )}
            <button onClick={signOut} className="text-white/60 hover:text-white text-xs">Sign out</button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* DASHBOARD */}
        {step === 'dashboard' && (
          <>
            {students.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-[#009FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Add your child to get started</h3>
                <p className="text-slate-500 text-sm mb-4">Add your child's details and book their weekly sessions.</p>
                <button onClick={() => setStep('add_student')} className="btn-primary w-auto px-6 inline-flex">+ Add student</button>
              </div>
            ) : (
              <>
                {students.map(student => {
                  const sessions = upcomingSessions.filter(s => s.student_id === student.id)
                  return (
                    <div key={student.id} className="card overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#E0F4FD] text-[#0077B6] flex items-center justify-center font-bold text-sm">
                            {student.first_name[0]}{student.last_name[0]}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">{student.first_name} {student.last_name}</div>
                            <div className="text-slate-500 text-xs">{categoryLabel(student.category)} · {subjectLabel(student.subjects)}</div>
                          </div>
                        </div>
                        <span className={student.category === 'early_learner' ? 'badge-green' : 'badge-teal'}>{categoryLabel(student.category)}</span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {sessions.length === 0 ? (
                          <div className="px-5 py-4 text-sm text-slate-400">No upcoming sessions</div>
                        ) : sessions.slice(0, 5).map(sess => {
                          const days = daysUntil(sess.session_date)
                          return (
                            <div key={sess.id} className="px-5 py-3 flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium text-slate-900">{formatDate(sess.session_date)}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{formatTime(sess.start_time)} – {formatTime(sess.end_time)}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={days <= 3 ? 'badge-amber' : 'badge-gray'}>{days}d away</span>
                                {canCancel(sess.session_date) && (
                                  <Link href={`/parent/cancel/${sess.id}`} className="badge-red cursor-pointer hover:bg-red-100 transition-colors">Cancel</Link>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => setStep('add_student')} className="btn-secondary">+ Add another student</button>
              </>
            )}
          </>
        )}

        {/* ADD STUDENT */}
        {step === 'add_student' && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-[#009FE3] text-white flex items-center justify-center text-xs font-bold">1</div>
              <h2 className="font-semibold text-slate-900">Student details</h2>
              <span className="text-slate-400 text-xs ml-auto">Step 1 of 3</span>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">First name</label>
                  <input className="input" value={sfn} onChange={e => setSfn(e.target.value)} placeholder="Alex" required /></div>
                <div><label className="label">Last name</label>
                  <input className="input" value={sln} onChange={e => setSln(e.target.value)} placeholder="Chen" required /></div>
              </div>
              <div>
                <label className="label">Class type</label>
                <div className="grid grid-cols-2 gap-3">
                  {([['early_learner','Early Learner','Age 3–9 · 30 min sessions'], ['main','Main Class','Age 10+ · 45 min sessions']] as const).map(([val, label, desc]) => (
                    <button key={val} type="button" onClick={() => setCategory(val)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${category === val ? 'border-[#009FE3] bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="font-semibold text-sm text-slate-900">{label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Subjects</label>
                <div className="grid grid-cols-3 gap-3">
                  {([['math','Mathematics','📐'], ['reading','Reading','📖'], ['both','Math + Reading','📐📖']] as const).map(([val, label, icon]) => (
                    <button key={val} type="button" onClick={() => setSubjects(val)}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${subjects === val ? 'border-[#009FE3] bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="text-lg">{icon}</div>
                      <div className="font-medium text-xs text-slate-900 mt-1">{label}</div>
                      <div className="text-[10px] text-slate-400">{category === 'early_learner' ? (val === 'both' ? '60 min' : '30 min') : (val === 'both' ? '90 min' : '45 min')}</div>
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Continue to book sessions →'}
              </button>
            </form>
          </div>
        )}

        {/* PICK DAY 1 */}
        {step === 'book_day1' && st && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-[#009FE3] text-white flex items-center justify-center text-xs font-bold">2</div>
              <h2 className="font-semibold text-slate-900">Choose Day 1</h2>
              <span className="text-slate-400 text-xs ml-auto">Step 2 of 3</span>
            </div>
            <p className="text-slate-500 text-sm mb-4 ml-9">Students attend twice a week. Pick your first preferred day.</p>
            <div className="space-y-2">
              {DAYS.map(d => (
                <button key={d} onClick={() => pickDay(1, d)}
                  className="w-full p-3 rounded-lg border border-slate-200 hover:border-[#009FE3] hover:bg-blue-50 text-left flex justify-between items-center transition-all">
                  <span className="font-medium text-slate-900">{DAY_LABELS[d]}</span>
                  <span className="text-xs text-slate-400">{DAY_HOURS[d]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PICK SLOT 1 */}
        {step === 'book_slot1' && st && day1 && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-[#009FE3] text-white flex items-center justify-center text-xs font-bold">2</div>
              <h2 className="font-semibold text-slate-900">{DAY_LABELS[day1]} — Pick a time</h2>
            </div>
            <p className="text-slate-500 text-sm mb-4 ml-9">Session duration: {getDuration(st.category, st.subjects)} min</p>
            <div className="grid grid-cols-2 gap-3">
              {getSlots(day1, st.category, st.subjects).map(slot => {
                const booked = slotCapacity[slot] || 0
                const max = st.category === 'early_learner' ? 6 : 15
                const full = booked >= max
                const sel = slot1 === slot
                return (
                  <button key={slot} disabled={full} onClick={() => setSlot1(slot)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${full ? 'opacity-40 cursor-not-allowed border-slate-100 bg-slate-50' : sel ? 'border-[#009FE3] bg-blue-50' : 'border-slate-200 hover:border-[#009FE3] hover:bg-blue-50/50'}`}>
                    <div className="font-semibold text-sm text-slate-900">{formatTime(slot)}</div>
                    <div className="mt-1">{availBadge(booked, max)}</div>
                  </button>
                )
              })}
            </div>
            <button disabled={!slot1} onClick={() => setStep('book_day2')} className="btn-primary mt-4">
              Continue → Pick Day 2
            </button>
          </div>
        )}

        {/* PICK DAY 2 */}
        {step === 'book_day2' && st && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-[#009FE3] text-white flex items-center justify-center text-xs font-bold">2</div>
              <h2 className="font-semibold text-slate-900">Choose Day 2</h2>
            </div>
            <p className="text-slate-500 text-sm mb-4 ml-9">Pick a different day from {DAY_LABELS[day1!]}.</p>
            <div className="space-y-2">
              {DAYS.filter(d => d !== day1).map(d => (
                <button key={d} onClick={() => pickDay(2, d)}
                  className="w-full p-3 rounded-lg border border-slate-200 hover:border-[#009FE3] hover:bg-blue-50 text-left flex justify-between items-center transition-all">
                  <span className="font-medium text-slate-900">{DAY_LABELS[d]}</span>
                  <span className="text-xs text-slate-400">{DAY_HOURS[d]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PICK SLOT 2 */}
        {step === 'book_slot2' && st && day2 && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-[#009FE3] text-white flex items-center justify-center text-xs font-bold">2</div>
              <h2 className="font-semibold text-slate-900">{DAY_LABELS[day2]} — Pick a time</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {getSlots(day2, st.category, st.subjects).map(slot => {
                const booked = slotCapacity[slot] || 0
                const max = st.category === 'early_learner' ? 6 : 15
                const full = booked >= max
                const sel = slot2 === slot
                return (
                  <button key={slot} disabled={full} onClick={() => setSlot2(slot)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${full ? 'opacity-40 cursor-not-allowed border-slate-100 bg-slate-50' : sel ? 'border-[#009FE3] bg-blue-50' : 'border-slate-200 hover:border-[#009FE3] hover:bg-blue-50/50'}`}>
                    <div className="font-semibold text-sm text-slate-900">{formatTime(slot)}</div>
                    <div className="mt-1">{availBadge(booked, max)}</div>
                  </button>
                )
              })}
            </div>
            <button disabled={!slot2} onClick={() => setStep('confirm')} className="btn-primary mt-4">
              Review booking →
            </button>
          </div>
        )}

        {/* CONFIRM */}
        {step === 'confirm' && st && day1 && slot1 && day2 && slot2 && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-[#009FE3] text-white flex items-center justify-center text-xs font-bold">3</div>
              <h2 className="font-semibold text-slate-900">Confirm booking</h2>
              <span className="text-slate-400 text-xs ml-auto">Step 3 of 3</span>
            </div>
            <div className="space-y-0 mb-4">
              <div className="row"><span className="row-label">Student</span><span className="row-val">{st.first_name} {st.last_name}</span></div>
              <div className="row"><span className="row-label">Class type</span><span className="row-val">{categoryLabel(st.category)}</span></div>
              <div className="row"><span className="row-label">Subjects</span><span className="row-val">{subjectLabel(st.subjects)}</span></div>
              <div className="row"><span className="row-label">Session length</span><span className="row-val">{getDuration(st.category, st.subjects)} min</span></div>
              <div className="row"><span className="row-label">Day 1</span><span className="row-val">{DAY_LABELS[day1]} · {formatTime(slot1)}</span></div>
              <div className="row"><span className="row-label">Day 2</span><span className="row-val">{DAY_LABELS[day2]} · {formatTime(slot2)}</span></div>
              <div className="row"><span className="row-label">Frequency</span><span className="row-val">Weekly (recurring)</span></div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 mb-4">
              Cancellations must be made at least 3 days before the session. Your recurring schedule stays unchanged when you cancel a single session.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('book_day1')} className="btn-secondary flex-1">← Change</button>
              <button onClick={confirmBooking} disabled={booking} className="btn-primary flex-1">
                {booking ? 'Booking…' : '✓ Confirm booking'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
