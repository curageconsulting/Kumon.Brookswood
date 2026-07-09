'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { categoryLabel, subjectLabel, getDuration, getSlots, formatTime, DayOfWeek } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

const DAYS: DayOfWeek[] = ['monday', 'thursday', 'friday', 'saturday']
const DAY_LABELS: Record<DayOfWeek, string> = { monday: 'Monday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' }

type AddForm = {
  first_name: string
  last_name: string
  parent_email: string
  category: 'early_learner' | 'main'
  subjects: 'math' | 'reading' | 'both'
  day1: DayOfWeek
  time1: string
  day2: DayOfWeek
  time2: string
}

const INIT_FORM: AddForm = {
  first_name: '', last_name: '', parent_email: '',
  category: 'main', subjects: 'math',
  day1: 'monday', time1: '',
  day2: 'thursday', time2: '',
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all'|'early_learner'|'main'|'no_teacher'|'archived'>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState<AddForm>(INIT_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [filter])

  async function load() {
    const statusFilter = filter === 'archived' ? ['archived'] : ['active']
    const [{ data: studs }, { data: tchs }] = await Promise.all([
      supabase.from('students')
        .select(`*, parent:profiles(id, first_name, last_name, email, phone), teacher:teachers(id, name)`)
        .in('status', statusFilter)
        .order('last_name', { ascending: true }),
      supabase.from('teachers').select('*').eq('is_active', true).order('name'),
    ])
    setStudents(studs || [])
    setTeachers(tchs || [])
    setLoading(false)
  }

  async function assignTeacher(studentId: string, teacherId: string) {
    await supabase.from('students').update({ teacher_id: teacherId || null }).eq('id', studentId)
    toast.success('Teacher assigned!')
    load()
  }

  async function archiveStudent(id: string) {
    // Archive — keeps record but marks as left
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('students').update({ status: 'archived' }).eq('id', id)
    // Cancel all future sessions
    await supabase.from('sessions')
      .update({ status: 'cancelled' })
      .eq('student_id', id)
      .gte('session_date', today)
      .eq('status', 'scheduled')
    // Deactivate recurring schedules
    await supabase.from('recurring_schedules').update({ is_active: false }).eq('student_id', id)
    toast.success('Student marked as left — future sessions cancelled')
    load()
  }

  async function deleteStudent(id: string) {
    setDeleting(true)
    // Hard delete — removes all data
    await supabase.from('sessions').delete().eq('student_id', id)
    await supabase.from('recurring_schedules').delete().eq('student_id', id)
    await supabase.from('students').delete().eq('id', id)
    toast.success('Student permanently deleted')
    setConfirmDelete(null)
    setDeleting(false)
    load()
  }

  async function restoreStudent(id: string) {
    await supabase.from('students').update({ status: 'active' }).eq('id', id)
    toast.success('Student restored!')
    load()
  }

  async function quickAddStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name || !form.last_name || !form.parent_email) {
      toast.error('Please fill in all required fields')
      return
    }
    if (!form.time1 || !form.time2) {
      toast.error('Please select times for both days')
      return
    }
    if (form.day1 === form.day2) {
      toast.error('Please select two different days')
      return
    }
    setSaving(true)

    // Find parent profile by email
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'parent')

    // Look up by auth email
    const { data: authUser } = await supabase.auth.admin?.listUsers() as any
    // Use service role — instead look in profiles.email column
    const { data: parentProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', form.parent_email.toLowerCase())
      .single()

    if (!parentProfile) {
      toast.error(`No parent account found for ${form.parent_email}. Create their account first from Admin Setup.`)
      setSaving(false)
      return
    }

    const dur = getDuration(form.category, form.subjects)

    // Insert student
    const { data: student, error } = await supabase.from('students').insert({
      parent_id: parentProfile.id,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      category: form.category,
      subjects: form.subjects,
      status: 'active',
    }).select().single()

    if (error || !student) {
      toast.error('Failed to create student: ' + error?.message)
      setSaving(false)
      return
    }

    // Get academic year
    const { data: year } = await supabase.from('academic_years').select('id').eq('is_active', true).single()

    // Create schedules + sessions for both days
    const DOW: Record<DayOfWeek, number> = { monday:1, thursday:4, friday:5, saturday:6 }
    const start = new Date()
    start.setDate(start.getDate() + 1)
    const end = new Date(start)
    end.setFullYear(end.getFullYear() + 1)

    for (const [day, time] of [[form.day1, form.time1], [form.day2, form.time2]]) {
      const [h, m] = (time as string).split(':').map(Number)
      const endMins = h * 60 + m + dur
      const startTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
      const endTime = `${Math.floor(endMins/60).toString().padStart(2,'0')}:${(endMins%60).toString().padStart(2,'0')}:00`

      const { data: sched } = await supabase.from('recurring_schedules').insert({
        student_id: (student as any).id,
        day_of_week: day,
        start_time: startTime,
        duration_mins: dur,
        academic_year_id: (year as any)?.id || null,
        is_active: true,
      }).select().single()

      if (sched) {
        const sessions = []
        const cur = new Date(start)
        while (cur <= end) {
          if (cur.getDay() === DOW[day as DayOfWeek]) {
            sessions.push({
              student_id: (student as any).id,
              schedule_id: (sched as any).id,
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
    }

    toast.success(`${form.first_name} added with ${Math.floor(365 * 2 / 7)} sessions booked! 🎉`)
    setForm(INIT_FORM)
    setShowAddForm(false)
    setSaving(false)
    load()
  }

  const filtered = students.filter(s => {
    const name = `${s.first_name} ${s.last_name}`.toLowerCase()
    const parentName = `${s.parent?.first_name || ''} ${s.parent?.last_name || ''}`.toLowerCase()
    const matchSearch = name.includes(search.toLowerCase()) || parentName.includes(search.toLowerCase()) || (s.parent?.email || '').includes(search.toLowerCase())
    const matchFilter = filter === 'archived' ? true
      : filter === 'all' ? true
      : filter === 'no_teacher' ? !s.teacher_id
      : s.category === filter
    return matchSearch && matchFilter
  })

  const noTeacherCount = students.filter(s => !s.teacher_id && s.status === 'active').length

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <h1 className="font-semibold text-slate-900">Students</h1>
            <span className="badge-gray">{students.length} {filter === 'archived' ? 'archived' : 'active'}</span>
            {noTeacherCount > 0 && filter !== 'archived' && (
              <span className="badge-amber cursor-pointer" onClick={() => setFilter('no_teacher')}>
                ⚠️ {noTeacherCount} without teacher
              </span>
            )}
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary text-xs px-4 py-2">
            {showAddForm ? '✕ Cancel' : '+ Add student'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* Quick Add Form */}
        {showAddForm && (
          <div className="card p-5 border-blue-100 bg-blue-50/30">
            <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              ➕ Quick Add Student
              <span className="text-xs font-normal text-slate-500">Sessions booked automatically for 1 year</span>
            </h2>
            <form onSubmit={quickAddStudent} className="space-y-4">
              {/* Student name + parent email */}
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">First name *</label>
                  <input className="input" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} placeholder="Alex" required /></div>
                <div><label className="label">Last name *</label>
                  <input className="input" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} placeholder="Chen" required /></div>
                <div><label className="label">Parent email *</label>
                  <input className="input" type="email" value={form.parent_email} onChange={e => setForm({...form, parent_email: e.target.value})} placeholder="parent@email.com" required /></div>
              </div>

              {/* Category + Subjects */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Class type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['early_learner','main'] as const).map(c => (
                      <button key={c} type="button" onClick={() => setForm({...form, category: c, time1: '', time2: ''})}
                        className={`p-2 rounded-lg border-2 text-xs font-medium transition-all text-center
                          ${form.category === c ? 'border-[#009FE3] bg-blue-50 text-[#009FE3]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        {c === 'early_learner' ? '🟢 Early Learner' : '🔵 Main Class'}
                      </button>
                    ))}
                  </div>
                </div>
                <div><label className="label">Subjects</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['math','reading','both'] as const).map(s => (
                      <button key={s} type="button" onClick={() => setForm({...form, subjects: s, time1: '', time2: ''})}
                        className={`p-2 rounded-lg border-2 text-xs font-medium transition-all text-center
                          ${form.subjects === s ? 'border-[#009FE3] bg-blue-50 text-[#009FE3]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        {s === 'math' ? '📐 Math' : s === 'reading' ? '📖 Reading' : '📐📖 Both'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Session info */}
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                Session duration: <strong>{getDuration(form.category, form.subjects)} min</strong> · Attends twice a week
              </div>

              {/* Day + Time pickers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Day 1</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input" value={form.day1} onChange={e => setForm({...form, day1: e.target.value as DayOfWeek, time1: ''})}>
                      {DAYS.filter(d => d !== form.day2).map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                    </select>
                    <select className="input" value={form.time1} onChange={e => setForm({...form, time1: e.target.value})} required>
                      <option value="">Time…</option>
                      {getSlots(form.day1, form.category, form.subjects).map(s => (
                        <option key={s} value={s}>{formatTime(s)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Day 2</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input" value={form.day2} onChange={e => setForm({...form, day2: e.target.value as DayOfWeek, time2: ''})}>
                      {DAYS.filter(d => d !== form.day1).map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                    </select>
                    <select className="input" value={form.time2} onChange={e => setForm({...form, time2: e.target.value})} required>
                      <option value="">Time…</option>
                      {getSlots(form.day2, form.category, form.subjects).map(s => (
                        <option key={s} value={s}>{formatTime(s)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowAddForm(false); setForm(INIT_FORM) }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Adding & booking sessions…' : '✅ Add student & book sessions'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <input className="input max-w-xs text-sm py-2" placeholder="Search students or parents…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {(['all','early_learner','main','no_teacher','archived'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                ${filter === f ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#009FE3]'}`}>
              {f === 'all' ? 'All active' : f === 'early_learner' ? 'Early Learner' : f === 'main' ? 'Main Class' : f === 'no_teacher' ? '⚠️ No teacher' : '🗃 Archived'}
            </button>
          ))}
        </div>

        {/* Delete confirmation modal */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card p-6 max-w-sm w-full">
              <h3 className="font-semibold text-slate-900 mb-2">Permanently delete student?</h3>
              <p className="text-sm text-slate-500 mb-4">
                This will permanently delete the student and <strong>all their sessions, schedules and attendance records</strong>. This cannot be undone.
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
                💡 Tip: Use <strong>"Mark as Left"</strong> instead to keep records for reference while removing them from active scheduling.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={() => deleteStudent(confirmDelete)} disabled={deleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-all text-sm disabled:opacity-40">
                  {deleting ? 'Deleting…' : 'Yes, permanently delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Students list */}
        <div className="card overflow-hidden">

          <div className="divide-y divide-slate-50">
            {filtered.map(st => {
              const parentName = st.parent?.first_name
                ? `${st.parent.first_name} ${st.parent.last_name}`
                : st.parent?.email || '—'
              const hasParentName = st.parent?.first_name && st.parent.first_name.trim() !== ''
              const isArchived = st.status === 'archived'

              return (
                <div key={st.id} className={`px-4 py-4 ${isArchived ? 'opacity-60 bg-slate-50/50' : ''}`}>
                  <div className="flex flex-wrap items-start gap-3">
                  {/* Student */}
                  <div className="flex items-center gap-2.5 min-w-[160px] flex-1">
                    <div className="w-8 h-8 rounded-full bg-[#E0F4FD] text-[#0077B6] flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {st.first_name[0]}{st.last_name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{st.first_name} {st.last_name}</div>
                      <div className="text-xs text-slate-400">{subjectLabel(st.subjects)}</div>
                    </div>
                  </div>

                  {/* Category */}
                  <div className="min-w-[100px]">
                    <span className={st.category === 'early_learner' ? 'badge-green' : 'badge-teal'}>
                      {categoryLabel(st.category)}
                    </span>
                    {isArchived && <div className="badge-gray text-[10px] mt-1">Left</div>}
                  </div>

                  {/* Parent */}
                  <div className="min-w-[160px] flex-1">
                    {hasParentName ? (
                      <div>
                        <div className="text-sm text-slate-700">{parentName}</div>
                        <div className="text-xs text-slate-400">{st.parent?.email}</div>
                        {st.parent?.phone && (
                          <a href={`tel:${st.parent.phone}`} className="text-xs text-[#009FE3] hover:underline">📞 {st.parent.phone}</a>
                        )}
                      </div>
                    ) : st.parent?.email ? (
                      <div>
                        <div className="text-xs text-amber-600 font-medium">⚠️ Name not set</div>
                        <div className="text-xs text-slate-400">{st.parent.email}</div>
                        {st.parent?.phone && (
                          <a href={`tel:${st.parent.phone}`} className="text-xs text-[#009FE3] hover:underline">📞 {st.parent.phone}</a>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-red-500">No parent account</span>
                    )}
                  </div>

                  {/* Teacher */}
                  <div className="min-w-[100px]">
                    {!isArchived ? (
                      <div>
                        <select className="input text-xs py-1.5" value={st.teacher_id || ''}
                          onChange={e => assignTeacher(st.id, e.target.value)}>
                          <option value="">— Assign —</option>
                          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        {!st.teacher_id && <div className="text-[10px] text-amber-500 mt-0.5">⚠️ Unassigned</div>}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">{st.teacher?.name || '—'}</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-wrap ml-auto">
                    {!isArchived ? (
                      <>
                        <Link href={`/admin/students/${st.id}`} className="badge-teal cursor-pointer hover:bg-blue-100 text-[11px]">Edit</Link>
                        <button onClick={() => archiveStudent(st.id)}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 font-semibold">
                          Left
                        </button>
                        <button onClick={() => setConfirmDelete(st.id)}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-semibold">
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => restoreStudent(st.id)}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 font-semibold">
                          Restore
                        </button>
                        <button onClick={() => setConfirmDelete(st.id)}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-semibold">
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No students found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
