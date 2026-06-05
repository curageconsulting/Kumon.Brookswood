'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
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
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { first_name: firstName, last_name: lastName, role: 'parent' } }
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    // Update phone if provided
    if (phone) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('profiles').update({ phone }).eq('id', user.id)
    }
    toast.success('Account created! Please check your email to verify.')
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
    else { toast.success('Password reset email sent!'); setMode('login') }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
      {/* Hero card */}
      <div className="w-full max-w-sm">
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

        {/* Address bar */}
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
          {mode === 'login' && (
            <>
              <h2 className="text-base font-semibold mb-1">Sign in</h2>
              <p className="text-slate-500 text-sm mb-5">Sign in to manage your child's sessions.</p>
              <form onSubmit={handleLogin} className="space-y-3">
                <div><label className="label">Email</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required /></div>
                <div><label className="label">Password</label>
                  <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /></div>
                <button className="btn-primary w-full mt-1" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in →'}
                </button>
              </form>
              <div className="mt-4 flex flex-col gap-2 text-center text-sm">
                <button onClick={() => setMode('register')} className="text-[#009FE3] hover:underline">Create an account</button>
                <button onClick={() => setMode('reset')} className="text-slate-400 hover:text-slate-600 text-xs">Forgot password?</button>
              </div>
            </>
          )}

          {mode === 'register' && (
            <>
              <h2 className="text-base font-semibold mb-1">Create account</h2>
              <p className="text-slate-500 text-sm mb-5">First time? Set up your parent account.</p>
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">First name</label>
                    <input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Sarah" required /></div>
                  <div><label className="label">Last name</label>
                    <input className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Chen" required /></div>
                </div>
                <div><label className="label">Email</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required /></div>
                <div><label className="label">Password</label>
                  <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" required /></div>
                <div><label className="label">Phone (optional)</label>
                  <input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 604 000 0000" /></div>
                <button className="btn-primary w-full mt-1" disabled={loading}>
                  {loading ? 'Creating account…' : 'Create account →'}
                </button>
              </form>
              <button onClick={() => setMode('login')} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600">← Back to sign in</button>
            </>
          )}

          {mode === 'reset' && (
            <>
              <h2 className="text-base font-semibold mb-1">Reset password</h2>
              <p className="text-slate-500 text-sm mb-5">We'll send you a link to reset your password.</p>
              <form onSubmit={handleReset} className="space-y-3">
                <div><label className="label">Email</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required /></div>
                <button className="btn-primary w-full mt-1" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link →'}
                </button>
              </form>
              <button onClick={() => setMode('login')} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600">← Back to sign in</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
