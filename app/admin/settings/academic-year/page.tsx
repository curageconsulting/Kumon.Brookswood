'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AcademicYear } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function AcademicYearPage() {
  const [years, setYears] = useState<AcademicYear[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('academic_years').select('*').order('start_date', { ascending: false })
    setYears(data || [])
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('academic_years').insert({ ...form, is_active: true })
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Academic year created!')
    setForm({ name: '', start_date: '', end_date: '' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function setActive(id: string) {
    await supabase.from('academic_years').update({ is_active: false }).neq('id', id)
    await supabase.from('academic_years').update({ is_active: true }).eq('id', id)
    toast.success('Active year updated')
    load()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </Link>
            <h1 className="font-semibold text-slate-900">Academic Years</h1>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary text-xs px-4 py-2">+ New year</button>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {showForm && (
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm">Add academic year</h2>
            <form onSubmit={save} className="space-y-3">
              <div><label className="label">Year name</label>
                <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. 2026–2027" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Start date</label>
                  <input className="input" type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} required /></div>
                <div><label className="label">End date</label>
                  <input className="input" type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} required /></div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Create year'}</button>
              </div>
            </form>
          </div>
        )}
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-50">
            {years.map(y => (
              <div key={y.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{y.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{y.start_date} → {y.end_date}</div>
                </div>
                <div className="flex items-center gap-2">
                  {y.is_active ? <span className="badge-green">Active</span> : (
                    <button onClick={() => setActive(y.id)} className="badge-gray hover:bg-slate-200 cursor-pointer">Set active</button>
                  )}
                </div>
              </div>
            ))}
            {years.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">No academic years defined yet</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
