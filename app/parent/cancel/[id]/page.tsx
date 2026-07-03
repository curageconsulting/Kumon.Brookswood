'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Session, Student, SlotCapacity, canCancel, daysUntil, formatDate, formatTime, getSlots, OPERATING_HOURS } from '@/types'
import toast from 'react-hot-toast'
import Link from 'next/link'

type Step = 'review' | 'confirm_cancel' | 'book_makeup' | 'done'

export default function CancelSessionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<Session | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [step, setStep] = useState<Step>('review')
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [availableSlots, setAvailableSlots] = useState<{ day: string; date: string; slots: { time: string; booked: number; max: number }[] }[]>([])
  const [selectedMakeup, setSelectedMakeup] = useState<{ date: string; time: string } | null>(null)
  const [bookingMakeup, setBookingMakeup] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    const { data: sess } = await supabase.from('sessions').select('*').eq('id', id).single()
    if (!sess) { toast.error('Session not found'); router.push('/parent/dashboard'); return }
    const { data: stud } = await supabase.from('students').select('*').eq('id', sess.student_id).single()
    setSession(sess)
    setStudent(stud)
    setLoading(false)
  }

  async function handleCancel() {
    if (!session || !student) return
    setCancelling(true)
    const { data: { user } } = await supabase.auth.getUser()
    // Update session status
    await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', session.id)
    // Log cancellation
    await supabase.from('cancellations').insert({ session_id: session.id, cancelled_by: user!.id })
    // Send email via API
    await fetch('/api/email/cancellation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, studentId: student.id }),
    })
    setCancelling(false)
    setStep('book_makeup')
    loadMakeupSlots()
  }

  async function loadMakeupSlots() {
    if (!student) return
    const today = new Date()
    const upcoming: typeof availableSlots = []
    const days: { name: string; dow: 0|1|2|3|4|5|6 }[] = [
      { name: 'monday', dow: 1 }, { name: 'thursday', dow: 4 },
      { name: 'friday', dow: 5 }, { name: 'saturday', dow: 6 }
    ]
    // Find next 2 weeks of available days
    for (let offset = 1; offset <= 14; offset++) {
      const d = new Date(today)
      d.setDate(today.getDate() + offset)
      const dow = d.getDay()
      const dayInfo = days.find(x => x.dow === dow)
      if (!dayInfo) continue
      const dateStr = d.toISOString().slice(0, 10)
      const slots = getSlots(dayInfo.name as any, student.category, student.subjects)
      // Check capacity for each slot
      const slotData = []
      for (const slotTime of slots) {
        const { count } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('session_date', dateStr)
          .eq('start_time', slotTime)
          .eq('status', 'scheduled')
        const max = student.category === 'early_learner' ? 6 : 15
        slotData.push({ time: slotTime, booked: count || 0, max })
      }
      upcoming.push({ day: dayInfo.name, date: dateStr, slots: slotData })
      if (upcoming.length >= 6) break
    }
    setAvailableSlots(upcoming)
  }

  async function bookMakeup() {
    if (!selectedMakeup || !session || !student) return
    setBookingMakeup(true)
    const duration = student.category === 'early_learner'
      ? (student.subjects === 'both' ? 60 : 30)
      : (student.subjects === 'both' ? 90 : 45)
    const [h, m] = selectedMakeup.time.split(':').map(Number)
    const endH = Math.floor((h * 60 + m + duration) / 60)
    const endM = (h * 60 + m + duration) % 60
    const endTime = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`
    const { error } = await supabase.from('sessions').insert({
      student_id: student.id,
      session_date: selectedMakeup.date,
      start_time: selectedMakeup.time,
      end_time: endTime,
      duration_mins: duration,
      status: 'makeup',
      makeup_for_id: session.id,
    })
    if (error) { toast.error('Failed to book makeup session'); setBookingMakeup(false); return }
    await fetch('/api/email/makeup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, studentId: student.id, makeupDate: selectedMakeup.date, makeupTime: selectedMakeup.time }),
    })
    setStep('done')
    setBookingMakeup(false)
  }

  function availabilityBadge(booked: number, max: number) {
    const pct = booked / max
    if (booked >= max) return <span className="badge-red text-[10px]">Full</span>
    if (pct >= 0.5) return <span className="badge-amber text-[10px]">{max - booked} left</span>
    return <span className="badge-green text-[10px]">{max - booked} left</span>
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>
  if (!session || !student) return null

  const cancellable = canCancel(session.session_date)
  const days = daysUntil(session.session_date)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/parent/dashboard" className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          </Link>
          <h1 className="font-semibold text-slate-900 text-base">
            {step === 'book_makeup' ? 'Book makeup session' : step === 'done' ? 'All done!' : 'Cancel session'}
          </h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Review step */}
        {step === 'review' && (
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm">Session details</h2>
            <div className="space-y-0">
              <div className="row"><span className="row-label">Student</span><span className="row-val">{student.first_name} {student.last_name}</span></div>
              <div className="row"><span className="row-label">Date</span><span className="row-val">{formatDate(session.session_date)}</span></div>
              <div className="row"><span className="row-label">Time</span><span className="row-val">{formatTime(session.start_time)} – {formatTime(session.end_time)}</span></div>
              <div className="row"><span className="row-label">Days away</span><span className="row-val">
                <span className={days <= 3 ? 'badge-red' : days <= 5 ? 'badge-amber' : 'badge-green'}>{days} days</span>
              </span></div>
            </div>
            {!cancellable ? (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                <strong>Cannot cancel online.</strong> Cancellations must be made at least 24 hours before the session. Please call (604) 245-2121 to speak with the centre.
              </div>
            ) : (
              <>
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                  Cancelling this session only affects this one occurrence. Your recurring weekly schedule stays unchanged. You can book a makeup session after cancelling.
                </div>
                <button onClick={() => setStep('confirm_cancel')} className="btn-danger w-full mt-4">
                  Cancel this session
                </button>
              </>
            )}
          </div>
        )}

        {/* Confirm cancel */}
        {step === 'confirm_cancel' && (
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-2 text-sm">Confirm cancellation</h2>
            <p className="text-slate-500 text-sm mb-4">Are you sure you want to cancel {student.first_name}'s session on {formatDate(session.session_date)} at {formatTime(session.start_time)}?</p>
            <div className="flex gap-3">
              <button onClick={() => setStep('review')} className="btn-secondary flex-1">Keep session</button>
              <button onClick={handleCancel} disabled={cancelling} className="btn-danger flex-1">
                {cancelling ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        )}

        {/* Book makeup */}
        {step === 'book_makeup' && (
          <>
            <div className="card p-4 bg-green-50 border-green-100">
              <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                Session cancelled successfully
              </div>
              <p className="text-green-600 text-xs mt-1">A confirmation email has been sent. Would you like to book a makeup session?</p>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-slate-900 mb-1 text-sm">Choose a makeup slot</h2>
              <p className="text-slate-500 text-xs mb-4">Available sessions in the next 2 weeks. 🟢 = available, 🟡 = limited, 🔴 = full.</p>
              {availableSlots.length === 0 ? (
                <div className="text-slate-400 text-sm text-center py-4">Loading available slots…</div>
              ) : (
                <div className="space-y-4">
                  {availableSlots.map(({ day, date, slots }) => (
                    <div key={date}>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{formatDate(date)}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {slots.map(s => {
                          const full = s.booked >= s.max
                          const sel = selectedMakeup?.date === date && selectedMakeup?.time === s.time
                          return (
                            <button key={s.time} disabled={full}
                              onClick={() => setSelectedMakeup({ date, time: s.time })}
                              className={`p-3 rounded-lg border text-left transition-all ${full ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-100' : sel ? 'border-[#009FE3] bg-blue-50 border-2' : 'border-slate-200 hover:border-[#009FE3] hover:bg-blue-50/50'}`}>
                              <div className="text-sm font-semibold text-slate-900">{formatTime(s.time)}</div>
                              <div className="mt-1">{availabilityBadge(s.booked, s.max)}</div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Link href="/parent/dashboard" className="btn-secondary flex-1">Skip for now</Link>
              <button onClick={bookMakeup} disabled={!selectedMakeup || bookingMakeup} className="btn-primary flex-1">
                {bookingMakeup ? 'Booking…' : 'Confirm makeup →'}
              </button>
            </div>
          </>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="card p-8 text-center">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <h2 className="font-semibold text-slate-900 mb-2">All done!</h2>
            <p className="text-slate-500 text-sm mb-5">Your makeup session on {selectedMakeup && formatDate(selectedMakeup.date)} at {selectedMakeup && formatTime(selectedMakeup.time)} has been confirmed. A confirmation email is on its way.</p>
            <Link href="/parent/dashboard" className="btn-primary">← Back to dashboard</Link>
          </div>
        )}
      </div>
    </div>
  )
}
