// app/api/cron/overstay/route.ts — checks class-time limits, sends Web Push
// Limits: 45 min (1 subject) / 90 min (2 subjects), from kiosk check-in.
// Trigger every 5 min during centre hours (Vercel cron on Pro, or cron-job.org on Hobby).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@kumonbrookswood.ca',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const today = new Date().toISOString().split('T')[0]
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, checked_in_at, checked_out_at, overstay_notified_at, student:students(first_name, last_name, kumon_student_id)')
    .eq('session_date', today)
    .not('checked_in_at', 'is', null)
    .is('checked_out_at', null)
    .is('overstay_notified_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sessions?.length) return NextResponse.json({ ok: true, checked: 0, alerts: 0 })

  // Subject counts from the planning side via the kumon bridge
  const kids = sessions.map(s => s.student?.kumon_student_id).filter(Boolean)
  const { data: kumonRows } = kids.length
    ? await supabase.from('kumon_students').select('kumon_student_id, math_enabled, reading_enabled').in('kumon_student_id', kids)
    : { data: [] }
  const subjectCount: Record<string, number> = {}
  for (const k of (kumonRows || [])) {
    const n = (k.math_enabled ? 1 : 0) + (k.reading_enabled ? 1 : 0)
    const key = String(k.kumon_student_id)
    subjectCount[key] = Math.max(subjectCount[key] || 0, n)
  }

  const overdue = sessions.filter(s => {
    const mins = Math.round((Date.now() - new Date(s.checked_in_at).getTime()) / 60000)
    const kid = String(s.student?.kumon_student_id || '')
    const limit = (subjectCount[kid] || 1) >= 2 ? 90 : 45
    ;(s as any)._mins = mins; (s as any)._limit = limit
    return mins > limit
  })
  if (!overdue.length) return NextResponse.json({ ok: true, checked: sessions.length, alerts: 0 })

  const { data: subs } = await supabase.from('push_subscriptions').select('*')
  let sent = 0, pruned = 0
  for (const s of overdue) {
    const name = `${s.student?.first_name || ''} ${s.student?.last_name || ''}`.trim()
    const payload = JSON.stringify({
      title: '⏰ Class time exceeded',
      body: `${name} — ${(s as any)._mins} min in center (limit ${(s as any)._limit}). Time to wrap up!`,
      tag: `overstay-${s.id}`,
      url: '/admin/planning',
    })
    for (const sub of (subs || [])) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
        sent++
      } catch (e: any) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          pruned++
        }
      }
    }
    await supabase.from('sessions').update({ overstay_notified_at: new Date().toISOString() }).eq('id', s.id)
  }
  return NextResponse.json({ ok: true, checked: sessions.length, alerts: overdue.length, pushesSent: sent, prunedSubs: pruned })
}
