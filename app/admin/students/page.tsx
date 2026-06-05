'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Student, Profile, categoryLabel, subjectLabel } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

type FormData = {
  parent_email: string
  first_name: string
  last_name: string
  category: 'early_learner' | 'main'
  subjects: 'math' | 'reading' | 'both'
  kumon_level: string
}

const INIT: FormData = { parent_email: '', first_name: '', last_name: '', category: 'early_learner', subjects: 'math', kumon_level: '' }

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<(Student & { parent: Profile })[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormData>(INIT)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'early_learner' | 'main'>('all')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('students')
      .select('*, parent:profiles(*)')
      .order('created_at', { ascending: false })
    setStudents((data || []) as any)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    // Find parent by email
    const { data: parentProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'parent')
      .single()

    // For demo: in production, look up by auth user email
    // Here we use a simpler approach - admin enters parent's user ID or email
    const { data: authUsers } = await supabase.auth.admin?.listUsers() || { data: null }

    // Insert student - parent_id would be resolved from email in production
    const { error } = await supabase.from('students').insert({
      parent_id: parentProfile?.id, // simplified - real app resolves from email
      first_name: form.first_name,
      last_name: form.last_name,
      category: form.category,
      subjects: form.subjects,
      kumon_level: form.kumon_level || null,
      status: 'active',
    })

    if (error) { toast.error('Failed to save student'); setSaving(false); return }
    toast.success('Student added!')
    setForm(INIT)
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function toggleStatus(student: Student) {
    const newStatus = student.status === 'active' ? 'archived' : 'active'
    await supabase.from('students').update({ status: newStatus }).eq('id', student.id)
    toast.success(newStatus === 'archived' ? 'Student archived' : 'Student restored')
    load()
  }

  const filtered = students.filter(s => {
    const matchSearch = `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || s.category === filter
    return matchSearch && matchFilter
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <h1 className="font-semibold text-slate-900">Students</h1>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary text-xs px-4 py-2">+ Add student</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Add student form */}
        {showForm && (
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm">Add new student</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div><label className="label">Parent email</label>
                <input className="input" type="email" value={form.parent_email} onChange={e => setForm({...form, parent_email: e.target.value})} placeholder="parent@email.com" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Student first name</label>
                  <input className="input" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} placeholder="Alex" required /></div>
                <div><label className="label">Student last name</label>
                  <input className="input" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} placeholder="Chen" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Category</label>
                  <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value as any})}>
                    <option value="early_learner">Early Learner (Age 3–9)</option>
                    <option value="main">Main Class (Age 9+)</option>
                  </select></div>
                <div><label className="label">Subjects</label>
                  <select className="input" value={form.subjects} onChange={e => setForm({...form, subjects: e.target.value as any})}>
                    <option value="math">Mathematics only</option>
                    <option value="reading">Reading only</option>
                    <option value="both">Math + Reading</option>
                  </select></div>
              </div>
              <div><label className="label">Kumon level (admin only)</label>
                <input className="input" value={form.kumon_level} onChange={e => setForm({...form, kumon_level: e.target.value})} placeholder="e.g. 3A" /></div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Add student'}</button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <input className="input max-w-xs text-sm py-2" placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} />
          {(['all','early_learner','main'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filter === f ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#009FE3]'}`}>
              {f === 'all' ? 'All' : categoryLabel(f)}
            </button>
          ))}
        </div>

        {/* Students list */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500">{filtered.length} student{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {filtered.map(st => (
              <div key={st.id} className={`px-5 py-3.5 flex items-center justify-between ${st.status === 'archived' ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#E0F4FD] text-[#0077B6] flex items-center justify-center font-bold text-xs">
                    {st.first_name[0]}{st.last_name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{st.first_name} {st.last_name}</div>
                    <div className="text-xs text-slate-500">{subjectLabel(st.subjects)} · {st.kumon_level ? `Level ${st.kumon_level}` : 'No level set'}</div>
                    {st.parent && <div className="text-xs text-slate-400">Parent: {(st.parent as any).first_name} {(st.parent as any).last_name}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={st.category === 'early_learner' ? 'badge-green' : 'badge-teal'}>{categoryLabel(st.category)}</span>
                  {st.status === 'archived' && <span className="badge-gray">Archived</span>}
                  <Link href={`/admin/students/${st.id}`} className="badge-gray hover:bg-slate-200 transition-colors cursor-pointer">Edit</Link>
                  <button onClick={() => toggleStatus(st)} className={st.status === 'active' ? 'badge-red cursor-pointer hover:bg-red-100' : 'badge-green cursor-pointer hover:bg-green-100'}>
                    {st.status === 'active' ? 'Archive' : 'Restore'}
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No students found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
