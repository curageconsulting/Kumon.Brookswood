'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({})
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: tchs } = await supabase.from('teachers').select('*').order('name')
    setTeachers(tchs || [])
    // Get student counts per teacher
    const { data: counts } = await supabase
      .from('students')
      .select('teacher_id')
      .eq('status', 'active')
      .not('teacher_id', 'is', null)
    const map: Record<string, number> = {}
    ;(counts || []).forEach((s: any) => {
      map[s.teacher_id] = (map[s.teacher_id] || 0) + 1
    })
    setStudentCounts(map)
  }

  async function addTeacher(e: React.FormEvent) {
    e.preventDefault()
    if (!name) return
    setSaving(true)
    const { error } = await supabase.from('teachers').insert({ name, email: email || null, phone: phone || null })
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Teacher added!')
    setName(''); setEmail(''); setPhone('')
    setShowForm(false); setSaving(false)
    load()
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('teachers').update({ is_active: !current }).eq('id', id)
    toast.success(current ? 'Teacher deactivated' : 'Teacher reactivated')
    load()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <h1 className="font-semibold text-slate-900">Teachers</h1>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary text-xs px-4 py-2">+ Add teacher</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {showForm && (
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm">Add teacher</h2>
            <form onSubmit={addTeacher} className="space-y-3">
              <div><label className="label">Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Teacher name" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Email (optional)</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teacher@email.com" /></div>
                <div><label className="label">Phone (optional)</label>
                  <input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="604-000-0000" /></div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Add teacher'}</button>
              </div>
            </form>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-50">
            <span className="text-xs text-slate-500">{teachers.filter(t => t.is_active).length} active teachers</span>
          </div>
          <div className="divide-y divide-slate-50">
            {teachers.map(t => (
              <div key={t.id} className={`px-5 py-4 flex items-center justify-between ${!t.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-sm">
                    {t.name.split(' ').map((n: string) => n[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 text-sm">{t.name}</div>
                    <div className="text-xs text-slate-500">
                      {studentCounts[t.id] || 0} students assigned
                      {t.email && ` · ${t.email}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!t.is_active && <span className="badge-gray">Inactive</span>}
                  <Link href={`/admin/teachers/${t.id}`} className="badge-teal cursor-pointer hover:bg-blue-100">View students</Link>
                  <button onClick={() => toggleActive(t.id, t.is_active)}
                    className={t.is_active ? 'badge-red cursor-pointer hover:bg-red-100' : 'badge-green cursor-pointer hover:bg-green-100'}>
                    {t.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            ))}
            {teachers.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">No teachers added yet</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
