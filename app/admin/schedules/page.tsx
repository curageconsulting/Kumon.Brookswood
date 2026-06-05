'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Student, AcademicYear, RecurringSchedule, getSlots, formatTime, categoryLabel, subjectLabel, getDuration } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function AdminSchedulesPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [schedules, setSchedules] = useState<(RecurringSchedule & { student: Student })[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [slot1, setSlot1] = useState({ day: '', time: '' })
  const [slot2, setSlot2] = useState({ day: '', time: '' })
  const supabase = createClient()

  const DAYS = ['monday', 'thursday', 'friday', 'saturday']

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: studs }, { data: yrData }, { data: scheds }] = await Promise.all([
      supabase.from('students').select('*').eq('status', 'active'),
      supabase.from('academic_years').select('*').order('start_date', { ascending: false }),
      supabase.from('recurring_schedules').select('*, student:students(*)').eq('is_active', true).order('created_at', { ascending: false }),
    ])
    setStudents(studs || [])
    setYears(yrData || [])
    setSchedules((scheds || []) as any)
  }

  async function createSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!slot1.day || !slot1.time || !slot2.day || !slot2.time) { toast.error('Please select both days and times'); return }
    if (slot1.day === slot2.day) { toast.error('Days must be different'); return }
    setSaving(true)

    const student = students.find(s => s.id === selectedStudent)!
    const duration = getDuration(student.category, student.subjects)

    // Create both recurring schedules
    for (const slot of [slot1, slot2]) {
      const { data: sched, error } = await supabase.from('recurring_schedules').insert({
        student_id: selectedStudent,
        day_of_week: slot.day,
        start_time: slot.time,
        duration_mins: duration,
        academic_year_id: selectedYear,
        is_active: true,
      }).select().single()
      if (error) { toast.error('Failed to create schedule'); setSaving(false); return }
      // Generate sessions
      await supabase.rpc('generate_sessions_from_schedule', { schedule_id: sched.id })
    }

    // Send confirmation email
    await fetch('/api/email/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: selectedStudent, yearId: selectedYear }),
    })

    toast.success('Schedule created and sessions generated!')
    setShowForm(false)
    setSaving(false)
    load()
  }

  function getSlotsForStudent(day: string) {
    const student = students.find(s => s.id === selectedStudent)
    if (!student) return []
    return getSlots(day as any, student.category, student.subjects)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <h1 className="font-semibold text-slate-900">Recurring Schedules</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/settings/academic-year" className="btn-secondary text-xs px-3 py-2">Manage academic year</Link>
            <button onClick={() => setShowForm(true)} className="btn-primary text-xs px-4 py-2">+ Create schedule</button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Create schedule form */}
        {showForm && (
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm">Create recurring schedule</h2>
            <form onSubmit={createSchedule} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Student</label>
                  <select className="input" value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} required>
                    <option value="">Select student…</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({categoryLabel(s.category)})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Academic year</label>
                  <select className="input" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} required>
                    <option value="">Select year…</option>
                    {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                </div>
              </div>

              {selectedStudent && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                  {(() => {
                    const s = students.find(x => x.id === selectedStudent)!
                    const dur = getDuration(s.category, s.subjects)
                    return `${categoryLabel(s.category)} · ${subjectLabel(s.subjects)} · ${dur} min sessions`
                  })()}
                </div>
              )}

              {/* Slot 1 */}
              <div>
                <label className="label">Day 1</label>
                <div className="grid grid-cols-2 gap-3">
                  <select className="input" value={slot1.day} onChange={e => setSlot1({day: e.target.value, time: ''})} required>
                    <option value="">Select day…</option>
                    {DAYS.map(d => <option key={d} value={d} disabled={d === slot2.day}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
                  </select>
                  <select className="input" value={slot1.time} onChange={e => setSlot1({...slot1, time: e.target.value})} required disabled={!slot1.day}>
                    <option value="">Select time…</option>
                    {getSlotsForStudent(slot1.day).map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                  </select>
                </div>
              </div>

              {/* Slot 2 */}
              <div>
                <label className="label">Day 2</label>
                <div className="grid grid-cols-2 gap-3">
                  <select className="input" value={slot2.day} onChange={e => setSlot2({day: e.target.value, time: ''})} required>
                    <option value="">Select day…</option>
                    {DAYS.map(d => <option key={d} value={d} disabled={d === slot1.day}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
                  </select>
                  <select className="input" value={slot2.time} onChange={e => setSlot2({...slot2, time: e.target.value})} required disabled={!slot2.day}>
                    <option value="">Select time…</option>
                    {getSlotsForStudent(slot2.day).map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Creating…' : 'Create & generate sessions'}</button>
              </div>
            </form>
          </div>
        )}

        {/* Schedules list */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-50">
            <span className="text-xs text-slate-500">{schedules.length} active schedule{schedules.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {schedules.map(sched => (
              <div key={sched.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {(sched.student as any)?.first_name} {(sched.student as any)?.last_name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {sched.day_of_week.charAt(0).toUpperCase()+sched.day_of_week.slice(1)} at {formatTime(sched.start_time)} · {sched.duration_mins} min
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={(sched.student as any)?.category === 'early_learner' ? 'badge-green' : 'badge-teal'}>
                    {categoryLabel((sched.student as any)?.category)}
                  </span>
                  <button onClick={async () => {
                    await supabase.from('recurring_schedules').update({ is_active: false }).eq('id', sched.id)
                    toast.success('Schedule deactivated')
                    load()
                  }} className="badge-red cursor-pointer hover:bg-red-100">Deactivate</button>
                </div>
              </div>
            ))}
            {schedules.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">No schedules yet</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
