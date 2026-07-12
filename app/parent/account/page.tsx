'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function ParentAccountPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [smsConsent, setSmsConsent] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)
    setFirstName(prof?.first_name || '')
    setLastName(prof?.last_name || '')
    setPhone(prof?.phone || '')
    setSmsConsent(prof?.sms_consent || false)
    setLoading(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (phone && !smsConsent) {
      toast.error('Please consent to SMS notifications or remove your phone number')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      sms_consent: smsConsent,
      sms_consent_at: smsConsent ? new Date().toISOString() : null,
    }).eq('id', profile.id)
    if (error) { toast.error('Failed to save'); setSaving(false); return }
    toast.success('Account updated!')
    setSaving(false)
    load()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/parent/dashboard" className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          </Link>
          <h1 className="font-semibold text-slate-900">My Account</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <form onSubmit={save} className="space-y-4">

          {/* Personal info */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm">Personal information</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First name</label>
                  <input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Sarah" required />
                </div>
                <div>
                  <label className="label">Last name</label>
                  <input className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Chen" required />
                </div>
              </div>
              <div>
                <label className="label">Email address</label>
                <input className="input bg-slate-100 cursor-not-allowed" value={profile?.email || ''} disabled />
                <p className="text-xs text-slate-400 mt-1">Email cannot be changed. Contact the centre if needed.</p>
              </div>
            </div>
          </div>

          {/* Phone + SMS consent */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-1 text-sm">📱 Mobile number & SMS notifications</h2>
            <p className="text-xs text-slate-500 mb-4">Add your mobile number to receive session reminders and absence notifications by text.</p>
            <div className="space-y-3">
              <div>
                <label className="label">Mobile number <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                <input className="input" type="tel" value={phone}
                  onChange={e => { setPhone(e.target.value); if (!e.target.value) setSmsConsent(false) }}
                  placeholder="+1 604 000 0000" />
              </div>

              {/* SMS Consent */}
              {phone && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={smsConsent} onChange={e => setSmsConsent(e.target.checked)}
                      className="mt-0.5 flex-shrink-0 w-4 h-4 accent-[#009FE3]" />
                    <span className="text-xs text-amber-800 leading-relaxed">
                      <strong>I consent to receiving SMS text messages</strong> from Kumon Brookswood Learning Centre at the number provided, including:
                      <ul className="mt-1 space-y-0.5 list-disc list-inside">
                        <li>Session reminders (morning of session day)</li>
                        <li>Absence notifications</li>
                        <li>Important schedule updates</li>
                      </ul>
                      Message and data rates may apply. You can withdraw consent at any time by unchecking this box or calling (604) 245-2121.
                    </span>
                  </label>
                </div>
              )}

              {/* Current consent status */}
              {profile?.sms_consent && profile?.phone && (
                <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-100 rounded-lg p-2.5">
                  <span>✅</span>
                  <span>SMS notifications active for {profile.phone}</span>
                </div>
              )}
              {!profile?.sms_consent && profile?.phone && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                  <span>⚠️</span>
                  <span>Phone on file but SMS consent not given — tick the box above to enable</span>
                </div>
              )}
            </div>
          </div>

          {/* What SMS messages you'll receive */}
          <div className="card p-4 bg-blue-50 border-blue-100">
            <h3 className="font-semibold text-blue-900 text-xs mb-2 uppercase tracking-wide">What you'll receive</h3>
            <div className="text-xs text-blue-700 space-y-1.5">
              <div className="flex items-start gap-2"><span>🌅</span><span><strong>Morning reminder</strong> — one SMS on days your child has a session</span></div>
              <div className="flex items-start gap-2"><span>🔴</span><span><strong>Absence alert</strong> — if your child is marked absent by the centre</span></div>
              <div className="flex items-start gap-2"><span>❌</span><span><strong>No</strong> marketing, promotions, or daily messages</span></div>
            </div>
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        {/* Change password */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-1 text-sm">Password</h2>
          <p className="text-xs text-slate-500 mb-3">Change your account password.</p>
          <button onClick={async () => {
            const { data: { user } } = await supabase.auth.getUser()
            await supabase.auth.resetPasswordForEmail(user?.email || '', {
              redirectTo: `${window.location.origin}/auth/reset-password`
            })
            toast.success('Password reset link sent to your email!')
          }} className="btn-secondary text-sm">
            Send password reset email
          </button>
        </div>
      </div>
    </div>
  )
}
