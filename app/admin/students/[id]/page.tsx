'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Student, RecurringSchedule, formatTime, getDuration, getSlots, DayOfWeek, categoryLabel, subjectLabel } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

const DAYS: DayOfWeek[] = ['monday', 'thursday', 'friday', 'saturday']
const DAY_LABELS: Record<DayOfWeek, string> = { monday: 'Monday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' }

export default function AdminStudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [student, setStudent] = useState<Student | null>(null)
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Edit schedule state
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null)
  const [newDay, setNewDay] = useState<DayOfWeek>('monday')
  const [newTime, setNewTime] = useState('')
  const [regenerating, setRegenerating] = useState(false)

  // Add schedule state
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [addDay, setAddDay] = useState<DayOfWeek>('monday')
  const [addTime, setAddTime] = useState('')

  useEffect(() => { load() }, [id])

  async function load() {
    const [{ data: st }, { data: scheds }, { data: tchs }] = await Promise.all([
      supabase.from('students').select('*, teacher:teachers(*)').eq('id', id).single(),
      supabase.from('recurring_schedules').select('*').eq('student_id', id).eq('is_active', true).order('day_of_week'),
      supabase.from('teachers').select('*').eq('is_active', true).order('name'),
    ])
    setStudent(st as any)
    setSchedules(scheds || [])
    setTeachers(tchs || [])
    setLoading(false)
  }

  async function assignTeacher(teacherId: string) {
    await supabase.from('students').update({ teacher_id: teacherId || null }).eq('id', id)
    toast.success('Teacher assigned!')
    load()
  }

  async function updateSchedule(schedId: string) {
    if (!newDay || !newTime || !student) return
    setSaving(true)
    const dur = getDuration(student.category, student.subjects)

    // Deactivate old schedule
    await supabase.from('recurring_schedules').update({ is_active: false }).eq('id', schedId)

    // Delete future sessions for old schedule
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('sessions')
      .delete()
      .eq('schedule_id', schedId)
      .gte('session_date', today)
      .eq('status', 'scheduled')

    // Create new schedule
    const [h, m] = newTime.split(':').map(Number)
    const endMins = h * 60 + m + dur
    const endTime = `${Math.floor(endMins/60).toString().padStart(2,'0')}:${(endMins%60).toString().padStart(2,'0')}:00`
    const startTime = `${newTime}:00`

    const { data: newSched } = await supabase.from('recurring_schedules').insert({
      student_id: id,
      day_of_week: newDay,
      start_time: startTime,
      duration_mins: dur,
      academic_year_id: (await supabase.from('academic_years').select('id').eq('is_active', true).single()).data?.id,
      is_active: true,
    }).select().single()

    if (newSched) {
      // Generate new sessions
      const DOW: Record<DayOfWeek, number> = { monday:1, thursday:4, friday:5, saturday:6 }
      const start = new Date()
      start.setDate(start.getDate() + 1)
      const end = new Date(start)
      end.setFullYear(end.getFullYear() + 1)
      const sessions = []
      const cur = new Date(start)
      while (cur <= end) {
        if (cur.getDay() === DOW[newDay]) {
          sessions.push({
            student_id: id,
            schedule_id: (newSched as any).id,
            session_date: cur.toISOString().slice(0, 10),
            start_time: startTime,
            end_time: endTime,
            duration_mins: dur,
            status: 'scheduled'
          })
        }
        cur.setDate(cur.getDate() + 1)
      }
      if (sessions.length > 0) {
        await supabase.from('sessions').insert(sessions)
      }
    }

    toast.success('Schedule updated and sessions regenerated!')
    setEditingSchedule(null)
    setSaving(false)
    load()
  }

  async function deactivateSchedule(schedId: string) {
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('recurring_schedules').update({ is_active: false }).eq('id', schedId)
    await supabase.from('sessions').delete().eq('schedule_id', schedId).gte('session_date', today).eq('status', 'scheduled')
    toast.success('Schedule removed')
    load()
  }

  async function addSchedule() {
    if (!addDay || !addTime || !student) return
    setSaving(true)
    const dur = getDuration(student.category, student.subjects)
    const [h, m] = addTime.split(':').map(Number)
    const endMins = h * 60 + m + dur
    const endTime = `${Math.floor(endMins/60).toString().padStart(2,'0')}:${(endMins%60).toString().padStart(2,'0')}:00`
    const startTime = `${addTime}:00`

    const { data: newSched } = await supabase.from('recurring_schedules').insert({
      student_id: id,
      day_of_week: addDay,
      start_time: startTime,
      duration_mins: dur,
      academic_year_id: (await supabase.from('academic_years').select('id').eq('is_active', true).single()).data?.id,
      is_active: true,
    }).select().single()

    if (newSched) {
      const DOW: Record<DayOfWeek, number> = { monday:1, thursday:4, friday:5, saturday:6 }
      const start = new Date()
      start.setDate(start.getDate() + 1)
      const end = new Date(start)
      end.setFullYear(end.getFullYear() + 1)
      const sessions = []
      const cur = new Date(start)
      while (cur <= end) {
        if (cur.getDay() === DOW[addDay]) {
          sessions.push({
            student_id: id,
            schedule_id: (newSched as any).id,
            session_date: cur.toISOString().slice(0, 10),
            start_time: startTime,
            end_time: endTime,
            duration_mins: dur,
            status: 'scheduled'
          })
        }
        cur.setDate(cur.getDate() + 1)
      }
      if (sessions.length > 0) await supabase.from('sessions').insert(sessions)
    }

    toast.success('Schedule added!')
    setShowAddSchedule(false)
    setAddDay('monday')
    setAddTime('')
    setSaving(false)
    load()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>
  if (!student) return null

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/students" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <div>
              <h1 className="font-semibold text-slate-900">{student.first_name} {student.last_name}</h1>
              <p className="text-xs text-slate-500">{categoryLabel(student.category)} · {subjectLabel(student.subjects)}</p>
            </div>
          </div>
          <span className={student.category === 'early_learner' ? 'badge-green' : 'badge-teal'}>{categoryLabel(student.category)}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Teacher assignment */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 text-sm flex items-center gap-2">
            👩‍🏫 Assigned teacher
          </h2>
          <select className="input" value={(student as any).teacher_id || ''} onChange={e => assignTeacher(e.target.value)}>
            <option value="">— No teacher assigned —</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {teachers.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">No teachers added yet. <Link href="/admin/teachers" className="text-[#009FE3] hover:underline">Add teachers →</Link></p>
          )}
        </div>

        {/* Schedules */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 text-sm">📅 Recurring schedules</h2>
            <button onClick={() => setShowAddSchedule(!showAddSchedule)} className="btn-primary text-xs px-3 py-1.5">+ Add day</button>
          </div>

          {/* Add schedule form */}
          {showAddSchedule && (
            <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="label">Day</label>
                  <select className="input" value={addDay} onChange={e => { setAddDay(e.target.value as DayOfWeek); setAddTime('') }}>
                    {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Time</label>
                  <select className="input" value={addTime} onChange={e => setAddTime(e.target.value)}>
                    <option value="">Select time…</option>
                    {getSlots(addDay, student.category, student.subjects).map(s => (
                      <option key={s} value={s}>{formatTime(s)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAddSchedule(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={addSchedule} disabled={!addTime || saving} className="btn-primary flex-1">{saving ? 'Adding…' : 'Add schedule'}</button>
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-50">
            {schedules.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-slate-400">No active schedules</div>
            ) : schedules.map(sched => (
              <div key={sched.id} className="px-5 py-4">
                {editingSchedule === sched.id ? (
                  <div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="label">New day</label>
                        <select className="input" value={newDay} onChange={e => { setNewDay(e.target.value as DayOfWeek); setNewTime('') }}>
                          {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">New time</label>
                        <select className="input" value={newTime} onChange={e => setNewTime(e.target.value)}>
                          <option value="">Select time…</option>
                          {getSlots(newDay, student.category, student.subjects).map(s => (
                            <option key={s} value={s}>{formatTime(s)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 mb-3">
                      ⚠️ This will delete all future sessions for this day and regenerate them at the new time.
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingSchedule(null)} className="btn-secondary flex-1">Cancel</button>
                      <button onClick={() => updateSchedule(sched.id)} disabled={!newTime || saving} className="btn-primary flex-1">
                        {saving ? 'Updating…' : 'Save & regenerate sessions'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-900 text-sm">{DAY_LABELS[sched.day_of_week]}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{formatTime(sched.start_time)} · {sched.duration_mins} min</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        setEditingSchedule(sched.id)
                        setNewDay(sched.day_of_week)
                        setNewTime(sched.start_time.slice(0,5))
                      }} className="badge-teal cursor-pointer hover:bg-blue-100">Edit</button>
                      <button onClick={() => deactivateSchedule(sched.id)} className="badge-red cursor-pointer hover:bg-red-100">Remove</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Student info */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 text-sm">Student info</h2>
          <div className="space-y-0">
            <div className="row"><span className="row-label">Kumon Student ID</span>
              <input className="input max-w-[180px] text-xs py-1.5" defaultValue={student.kumon_student_id || ''}
                onBlur={async e => {
                  await supabase.from('students').update({ kumon_student_id: e.target.value || null }).eq('id', id)
                  toast.success('Student ID updated')
                }} placeholder="e.g. 1242550363740" />
            </div>
            <div className="row"><span className="row-label">Category</span>
              <select className="input max-w-[180px] text-xs py-1.5" value={student.category}
                onChange={async e => {
                  await supabase.from('students').update({ category: e.target.value }).eq('id', id)
                  toast.success('Category updated')
                  load()
                }}>
                <option value="early_learner">Early Learner</option>
                <option value="main">Main Class</option>
              </select>
            </div>
            <div className="row"><span className="row-label">Subjects</span>
              <select className="input max-w-[180px] text-xs py-1.5" value={student.subjects}
                onChange={async e => {
                  await supabase.from('students').update({ subjects: e.target.value }).eq('id', id)
                  toast.success('Subjects updated')
                  load()
                }}>
                <option value="math">Mathematics</option>
                <option value="reading">Reading</option>
                <option value="both">Math + Reading</option>
              </select>
            </div>
            <div className="row"><span className="row-label">Kumon level</span>
              <input className="input max-w-[120px] text-xs py-1.5" defaultValue={student.kumon_level || ''}
                onBlur={async e => {
                  await supabase.from('students').update({ kumon_level: e.target.value || null }).eq('id', id)
                  toast.success('Level updated')
                }} placeholder="e.g. 3A" />
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="card p-5 border-red-100">
          <h2 className="font-semibold text-slate-900 mb-1 text-sm">⚠️ Danger zone</h2>
          <p className="text-xs text-slate-500 mb-4">These actions affect the student's record and sessions.</p>
          <div className="flex flex-col gap-3">
            {student.status === 'active' ? (
              <>
                <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50">
                  <div>
                    <div className="text-sm font-medium text-amber-800">Mark as Left</div>
                    <div className="text-xs text-amber-600">Cancels all future sessions. Record kept for reference. Can be restored.</div>
                  </div>
                  <button onClick={async () => {
                    const today = new Date().toISOString().slice(0, 10)
                    await supabase.from('students').update({ status: 'archived' }).eq('id', id)
                    await supabase.from('sessions').update({ status: 'cancelled' }).eq('student_id', id).gte('session_date', today).eq('status', 'scheduled')
                    await supabase.from('recurring_schedules').update({ is_active: false }).eq('student_id', id)
                    toast.success('Student marked as left')
                    router.push('/admin/students')
                  }} className="btn-secondary text-xs px-4 py-2 border-amber-300 text-amber-700 hover:bg-amber-100 ml-4 flex-shrink-0">
                    Mark as Left
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50">
                  <div>
                    <div className="text-sm font-medium text-red-800">Permanently Delete</div>
                    <div className="text-xs text-red-600">Removes student + all sessions + all schedules forever. Cannot be undone.</div>
                  </div>
                  <button onClick={async () => {
                    if (!window.confirm(`Are you sure you want to permanently delete ${student.first_name} ${student.last_name}? This cannot be undone.`)) return
                    await supabase.from('sessions').delete().eq('student_id', id)
                    await supabase.from('recurring_schedules').delete().eq('student_id', id)
                    await supabase.from('students').delete().eq('id', id)
                    toast.success('Student permanently deleted')
                    router.push('/admin/students')
                  }} className="btn-danger text-xs px-4 py-2 ml-4 flex-shrink-0">
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50">
                <div>
                  <div className="text-sm font-medium text-green-800">Restore Student</div>
                  <div className="text-xs text-green-600">Re-activates the student. You'll need to re-add their schedule.</div>
                </div>
                <button onClick={async () => {
                  await supabase.from('students').update({ status: 'active' }).eq('id', id)
                  toast.success('Student restored!')
                  load()
                }} className="btn-secondary text-xs px-4 py-2 border-green-300 text-green-700 hover:bg-green-100 ml-4 flex-shrink-0">
                  Restore
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
