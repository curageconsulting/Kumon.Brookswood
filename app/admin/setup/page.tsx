'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function AdminSetupPage() {
  const [secret, setSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  async function createParents() {
    if (!secret) { setError('Please enter the admin secret'); return }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/admin/create-parents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${secret}` }
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); setLoading(false); return }
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          </Link>
          <h1 className="font-semibold text-slate-900">Admin Setup — Create Parent Accounts</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Bulk create parent accounts</h2>
          <p className="text-slate-500 text-sm mb-4">
            This will create login accounts for all 56 parent emails from the student roster.
            Existing accounts are skipped automatically.
            Temporary password: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">KumonBrookswood2026!</code>
          </p>

          <div className="mb-4">
            <label className="label">Admin secret</label>
            <input
              className="input"
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder="Enter your ADMIN_SECRET from Vercel"
            />
            <p className="text-xs text-slate-400 mt-1">This is the ADMIN_SECRET you set in Vercel environment variables.</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 mb-4">
              {error}
            </div>
          )}

          <button onClick={createParents} disabled={loading} className="btn-primary">
            {loading ? '⏳ Creating accounts… (this takes ~30 seconds)' : '🚀 Create all parent accounts'}
          </button>
        </div>

        {result && (
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4">✅ Done!</h2>
            <div className="space-y-0 mb-4">
              <div className="row">
                <span className="row-label">Created</span>
                <span className="row-val text-green-600 text-lg font-bold">{result.summary.created}</span>
              </div>
              <div className="row">
                <span className="row-label">Skipped (already existed)</span>
                <span className="row-val text-slate-500">{result.summary.skipped}</span>
              </div>
              <div className="row">
                <span className="row-label">Failed</span>
                <span className="row-val text-red-600">{result.summary.failed}</span>
              </div>
              <div className="row">
                <span className="row-label">Temp password</span>
                <span className="row-val font-mono text-xs">{result.temp_password}</span>
              </div>
            </div>

            {result.details.created.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-green-700 mb-1">✅ Created:</div>
                <div className="bg-green-50 rounded-lg p-3 text-xs text-green-800 space-y-0.5 max-h-48 overflow-y-auto">
                  {result.details.created.map((e: string) => <div key={e}>{e}</div>)}
                </div>
              </div>
            )}

            {result.details.skipped.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-slate-500 mb-1">⏭ Skipped (already existed):</div>
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-0.5 max-h-32 overflow-y-auto">
                  {result.details.skipped.map((e: string) => <div key={e}>{e}</div>)}
                </div>
              </div>
            )}

            {result.details.failed.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-red-700 mb-1">❌ Failed:</div>
                <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700 space-y-0.5">
                  {result.details.failed.map((e: string) => <div key={e}>{e}</div>)}
                </div>
              </div>
            )}

            <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
              <strong>Next step:</strong> Run <code>kumon_smart_fix.sql</code> in Supabase SQL Editor to link students to their parent accounts and fix any wrong category/subject bookings.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
