'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { categoryLabel, subjectLabel } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all'|'early_learner'|'main'|'no_teacher'>('all')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: studs }, { data: tchs }] = await Promise.all([
      supabase.from('students')
        .select(`
          *,
          parent:profiles(id, first_name, last_name, email),
          teacher:teachers(id, name)
        `)
        .eq('status', 'active')
        .order('last_name', { ascending: true }),
      supabase.from('teachers').select('*').eq('is_active', true).order('name'),
    ])
    setStudents(studs || [])
    setTeachers(tchs || [])
    setLoading(false)
  }

  async function assignTeacher(studentId: string, teacherId: string) {
    await supabase.from('students')
      .update({ teacher_id: teacherId || null })
      .eq('id', studentId)
    toast.success('Teacher assigned!')
    load()
  }

  async function archiveStudent(id: string) {
    await supabase.from('students').update({ status: 'archived' }).eq('id', id)
    toast.success('Student archived')
    load()
  }

  const filtered = students.filter(s => {
    const name = `${s.first_name} ${s.last_name}`.toLowerCase()
    const parentName = `${s.parent?.first_name || ''} ${s.parent?.last_name || ''}`.toLowerCase()
    const matchSearch = name.includes(search.toLowerCase()) || parentName.includes(search.toLowerCase())
    const matchFilter = filter === 'all' ? true
      : filter === 'no_teacher' ? !s.teacher_id
      : s.category === filter
    return matchSearch && matchFilter
  })

  const noTeacherCount = students.filter(s => !s.teacher_id).length

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
            <span className="badge-gray">{students.length} active</span>
            {noTeacherCount > 0 && (
              <span className="badge-amber cursor-pointer" onClick={() => setFilter('no_teacher')}>
                ⚠️ {noTeacherCount} without teacher
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <input className="input max-w-xs text-sm py-2" placeholder="Search students or parents…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {(['all','early_learner','main','no_teacher'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                ${filter === f ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#009FE3]'}`}>
              {f === 'all' ? 'All' : f === 'early_learner' ? 'Early Learner' : f === 'main' ? 'Main Class' : '⚠️ No teacher'}
            </button>
          ))}
        </div>

        {/* Students list */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-12 gap-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span className="col-span-3">Student</span>
            <span className="col-span-2">Category</span>
            <span className="col-span-3">Parent</span>
            <span className="col-span-3">Teacher</span>
            <span className="col-span-1"></span>
          </div>
          <div className="divide-y divide-slate-50">
            {filtered.map(st => {
              const parentName = st.parent?.first_name
                ? `${st.parent.first_name} ${st.parent.last_name}`
                : st.parent?.email || '—'
              const hasParentName = st.parent?.first_name && st.parent.first_name.trim() !== ''

              return (
                <div key={st.id} className="px-5 py-3.5 grid grid-cols-12 gap-3 items-center">
                  {/* Student */}
                  <div className="col-span-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#E0F4FD] text-[#0077B6] flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {st.first_name[0]}{st.last_name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{st.first_name} {st.last_name}</div>
                      <div className="text-xs text-slate-400">{subjectLabel(st.subjects)}</div>
                    </div>
                  </div>

                  {/* Category */}
                  <div className="col-span-2">
                    <span className={st.category === 'early_learner' ? 'badge-green' : 'badge-teal'}>
                      {categoryLabel(st.category)}
                    </span>
                  </div>

                  {/* Parent */}
                  <div className="col-span-3">
                    {hasParentName ? (
                      <div>
                        <div className="text-sm text-slate-700">{parentName}</div>
                        <div className="text-xs text-slate-400">{st.parent?.email}</div>
                      </div>
                    ) : st.parent?.email ? (
                      <div>
                        <div className="text-xs text-amber-600 font-medium">⚠️ Name not set</div>
                        <div className="text-xs text-slate-400">{st.parent.email}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-red-500">No parent account</span>
                    )}
                  </div>

                  {/* Teacher */}
                  <div className="col-span-3">
                    <select
                      className="input text-xs py-1.5"
                      value={st.teacher_id || ''}
                      onChange={e => assignTeacher(st.id, e.target.value)}>
                      <option value="">— Assign teacher —</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {!st.teacher_id && (
                      <div className="text-[10px] text-amber-500 mt-0.5">⚠️ No teacher assigned</div>
                    )}
                    {st.teacher && (
                      <div className="text-[10px] text-purple-500 mt-0.5">👩‍🏫 {st.teacher.name}</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex justify-end">
                    <Link href={`/admin/students/${st.id}`}
                      className="badge-teal cursor-pointer hover:bg-blue-100 text-[11px]">
                      Edit
                    </Link>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No students found</div>
            )}
          </div>
        </div>

        {/* Missing parent names notice */}
        {students.some(s => s.parent && (!s.parent.first_name || s.parent.first_name.trim() === '')) && (
          <div className="card p-4 border-amber-100 bg-amber-50">
            <p className="text-sm text-amber-700 font-medium">⚠️ Some parents haven't set their name yet</p>
            <p className="text-xs text-amber-600 mt-1">These are accounts created via bulk import. Parents will set their name when they first log in and update their profile. Their email is shown instead.</p>
          </div>
        )}
      </div>
    </div>
  )
}
