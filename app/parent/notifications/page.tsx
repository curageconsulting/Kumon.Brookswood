'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import toast from 'react-hot-toast'

type NotifPrefs = {
  whatsapp_number: string
  sms_number: string
  email: string
  whatsapp_opt_in: boolean
  sms_opt_in: boolean
  email_opt_in: boolean
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-[#009FE3]' : 'bg-slate-300'}`}
      aria-label={on ? 'Disable' : 'Enable'}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export default function ParentNotifications() {
  const [profile, setProfile] = useState<any>(null)
  const [prefs, setPrefs] = useState<NotifPrefs>({
    whatsapp_number: '',
    sms_number: '',
    email: '',
    whatsapp_opt_in: false,
    sms_opt_in: false,
    email_opt_in: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }

    const [{ data: prof }, { data: existing }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('notification_preferences').select('*').eq('parent_id', user.id).maybeSingle(),
    ])
    setProfile(prof)

    if (existing) {
      setPrefs({
        whatsapp_number: existing.whatsapp_number || '',
        sms_number: existing.sms_number || '',
        email: existing.email || user.email || '',
        whatsapp_opt_in: existing.whatsapp_opt_in || false,
        sms_opt_in: existing.sms_opt_in || false,
        email_opt_in: existing.email_opt_in || false,
      })
    } else {
      setPrefs(p => ({ ...p, email: user.email || '' }))
    }
    setLoading(false)
  }

  async function save() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('notification_preferences').upsert({
      parent_id: user.id, ...prefs,
    })
    if (error) toast.error('Failed to save — please try again')
    else toast.success('Preferences saved! ✅')
    setSaving(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading…</div>
    </div>
  )

  const anyEnabled = prefs.whatsapp_opt_in || prefs.sms_opt_in || prefs.email_opt_in

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0077B6] to-[#009FE3] text-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/kumon-logo.png" alt="Kumon" className="h-9 rounded" />
            <div>
              <div className="font-semibold text-sm">Hi, {profile?.first_name || 'there'}!</div>
              <div className="text-white/70 text-xs">Kumon Brookswood</div>
            </div>
          </div>
          <button onClick={signOut} className="text-white/60 hover:text-white text-xs">Sign out</button>
        </div>
        <div className="max-w-3xl mx-auto px-4 flex gap-1 pb-0 overflow-x-auto">
          <Link href="/parent/dashboard" className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-white/70 hover:text-white whitespace-nowrap">📋 Sessions</Link>
          <Link href="/parent/progress" className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-white/70 hover:text-white whitespace-nowrap">📈 Progress</Link>
          <Link href="/parent/notifications" className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors bg-white text-[#0077B6] whitespace-nowrap">🔔 Alerts</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800 leading-relaxed">
          <strong>How session alerts work:</strong> After each class, your child's instructor marks their progress.
          You'll receive a summary through your chosen channel — worksheets completed, scores, instructor comments, and Kumon Money earned.
        </div>

        <div className="card p-5 space-y-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Choose your channels</div>

          {/* WhatsApp */}
          <div className={`rounded-xl border-2 p-4 transition-all ${prefs.whatsapp_opt_in ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#25D366]/10 flex items-center justify-center text-xl flex-shrink-0">💬</div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">WhatsApp</div>
                  <div className="text-xs text-slate-500">Recommended for most parents</div>
                </div>
              </div>
              <Toggle on={prefs.whatsapp_opt_in} onChange={() => setPrefs(p => ({ ...p, whatsapp_opt_in: !p.whatsapp_opt_in }))} />
            </div>
            {prefs.whatsapp_opt_in && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  WhatsApp number <span className="font-normal text-slate-400">(include country code)</span>
                </label>
                <input
                  type="tel"
                  value={prefs.whatsapp_number}
                  onChange={e => setPrefs(p => ({ ...p, whatsapp_number: e.target.value }))}
                  placeholder="+1 604 555 0000"
                  className="input text-sm"
                />
              </div>
            )}
          </div>

          {/* SMS */}
          <div className={`rounded-xl border-2 p-4 transition-all ${prefs.sms_opt_in ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xl flex-shrink-0">📱</div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">SMS / iMessage</div>
                  <div className="text-xs text-slate-500">Text message to any phone</div>
                </div>
              </div>
              <Toggle on={prefs.sms_opt_in} onChange={() => setPrefs(p => ({ ...p, sms_opt_in: !p.sms_opt_in }))} />
            </div>
            {prefs.sms_opt_in && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Mobile number <span className="font-normal text-slate-400">(include country code)</span>
                </label>
                <input
                  type="tel"
                  value={prefs.sms_number}
                  onChange={e => setPrefs(p => ({ ...p, sms_number: e.target.value }))}
                  placeholder="+1 604 555 0000"
                  className="input text-sm"
                />
              </div>
            )}
          </div>

          {/* Email */}
          <div className={`rounded-xl border-2 p-4 transition-all ${prefs.email_opt_in ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-xl flex-shrink-0">✉️</div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Email</div>
                  <div className="text-xs text-slate-500">Session summary to your inbox</div>
                </div>
              </div>
              <Toggle on={prefs.email_opt_in} onChange={() => setPrefs(p => ({ ...p, email_opt_in: !p.email_opt_in }))} />
            </div>
            {prefs.email_opt_in && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Email address</label>
                <input
                  type="email"
                  value={prefs.email}
                  onChange={e => setPrefs(p => ({ ...p, email: e.target.value }))}
                  placeholder="you@email.com"
                  className="input text-sm"
                />
              </div>
            )}
          </div>

          {!anyEnabled && (
            <div className="text-xs text-slate-400 text-center py-1">
              Enable at least one channel to receive session updates
            </div>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving…' : '✓ Save preferences'}
          </button>
        </div>
      </div>
    </div>
  )
}
