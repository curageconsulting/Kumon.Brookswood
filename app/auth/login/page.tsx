'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [smsConsent, setSmsConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { toast.error(error.message); setLoading(false); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    router.push(profile?.role === 'admin' ? '/admin/dashboard' : '/parent/dashboard')
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName || !lastName) { toast.error('Please enter your name'); return }
    if (phone && !smsConsent) { toast.error('Please consent to SMS notifications or remove your phone number'); return }
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { first_name: firstName, last_name: lastName, role: 'parent' } }
    })
    if (error) { toast.error(error.message); setLoading(false); return }

    // Update profile with phone + consent
    if (data.user) {
      await supabase.from('profiles').update({
        phone: phone || null,
        sms_consent: smsConsent,
        sms_consent_at: smsConsent ? new Date().toISOString() : null,
      }).eq('id', data.user.id)
    }

    toast.success('Account created! You can now sign in.')
    setMode('login')
    setLoading(false)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`
    })
    if (error) { toast.error(error.message) }
    else { toast.success('Password reset link sent to your email!'); setMode('login') }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-sm">

        {/* Hero */}
        <div className="relative rounded-2xl overflow-hidden mb-4 shadow-lg h-36">
          <img src="/centre.jpg" alt="Kumon Brookswood Centre" className="w-full h-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />
          <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
            <img src="/kumon-logo.png" alt="Kumon" className="h-10 rounded-md" />
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">Brookswood Centre</h1>
              <p className="text-white/80 text-xs">Parent booking portal</p>
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="card p-3 mb-4 flex gap-4 text-xs text-slate-500">
          <a href="https://maps.google.com/?q=4043+200+St+Langley+BC" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-[#009FE3] transition-colors">
            <svg className="w-3.5 h-3.5 text-[#009FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            4043 200 St, Langley BC
          </a>
          <a href="tel:+16042452121" className="flex items-center gap-1.5 hover:text-[#009FE3] transition-colors">
            <svg className="w-3.5 h-3.5 text-[#009FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            (604) 245-2121
          </a>
        </div>

        {/* Auth card */}
        <div className="card p-6">

          {/* SIGN IN */}
          {mode === 'login' && (
            <>
              <h2 className="text-base font-semibold mb-1">Welcome back</h2>
              <p className="text-slate-500 text-sm mb-5">Sign in to view and manage your child's sessions.</p>
              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <label className="label">Email address</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoComplete="email" required />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
                </div>
                <button className="btn-primary w-full mt-1" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in →'}
                </button>
              </form>
              <div className="mt-5 pt-4 border-t border-slate-100 text-center space-y-2">
                <p className="text-xs text-slate-400">New to Kumon Brookswood?</p>
                <button onClick={() => setMode('register')} className="text-[#009FE3] hover:underline text-sm font-medium">Create a parent account →</button>
              </div>
              <button onClick={() => setMode('reset')} className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600">Forgot password?</button>
            </>
          )}

          {/* REGISTER */}
          {mode === 'register' && (
            <>
              <h2 className="text-base font-semibold mb-1">Create your account</h2>
              <p className="text-slate-500 text-sm mb-1">Register as a parent to book and manage your child's Kumon sessions online.</p>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-xs text-blue-700 space-y-1">
                <div className="font-semibold mb-1">After registering you can:</div>
                <div className="flex items-start gap-1.5">✅ <span>Add your child and choose their subjects</span></div>
                <div className="flex items-start gap-1.5">✅ <span>Pick two weekly session days and times</span></div>
                <div className="flex items-start gap-1.5">✅ <span>View and manage sessions for the whole year</span></div>
                <div className="flex items-start gap-1.5">✅ <span>Cancel sessions and book makeup classes</span></div>
              </div>

              <form onSubmit={handleRegister} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">First name</label>
                    <input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Sarah" autoComplete="given-name" required />
                  </div>
                  <div>
                    <label className="label">Last name</label>
                    <input className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Chen" autoComplete="family-name" required />
                  </div>
                </div>
                <div>
                  <label className="label">Email address</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoComplete="email" required />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" autoComplete="new-password" required />
                </div>
                <div>
                  <label className="label">
                    Mobile number <span className="text-slate-400 font-normal normal-case">(optional — for SMS updates)</span>
                  </label>
                  <input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 604 000 0000" autoComplete="tel" />
                </div>

                {/* SMS Consent — only show if phone entered */}
                {phone && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smsConsent}
                        onChange={e => setSmsConsent(e.target.checked)}
                        className="mt-0.5 flex-shrink-0 w-4 h-4 accent-[#009FE3]"
                      />
                      <span className="text-xs text-amber-800 leading-relaxed">
                        <strong>I consent to receiving SMS text messages</strong> from Kumon Brookswood Learning Centre at the number provided, including session reminders, absence notifications, and important updates. Message and data rates may apply. You can opt out at any time by contacting us at (604) 245-2121.
                      </span>
                    </label>
                  </div>
                )}

                <button className="btn-primary w-full mt-1" disabled={loading}>
                  {loading ? 'Creating account…' : 'Create account →'}
                </button>
              </form>
              <button onClick={() => setMode('login')} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600">← Back to sign in</button>
            </>
          )}

          {/* RESET */}
          {mode === 'reset' && (
            <>
              <h2 className="text-base font-semibold mb-1">Reset your password</h2>
              <p className="text-slate-500 text-sm mb-5">Enter your email and we'll send you a link to set a new password.</p>
              <form onSubmit={handleReset} className="space-y-3">
                <div>
                  <label className="label">Email address</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoComplete="email" required />
                </div>
                <button className="btn-primary w-full mt-1" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link →'}
                </button>
              </form>
              <button onClick={() => setMode('login')} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600">← Back to sign in</button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Questions? Call us at <a href="tel:+16042452121" className="text-[#009FE3] hover:underline">(604) 245-2121</a>
        </p>
      </div>
    </div>
  )
}
