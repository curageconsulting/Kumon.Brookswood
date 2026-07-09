import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSessionReminder } from '@/lib/sms'

// This endpoint is called by Vercel Cron every hour
// It sends SMS reminders 8 hours before each session

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const now = new Date()

  // Runs once daily at 8am
  // Sends reminders for ALL sessions happening today
  const today = now.toISOString().slice(0, 10)

  // Get all scheduled sessions for today that haven't had reminder sent
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      id, session_date, start_time, reminder_sent_at,
      student:students(
        first_name, last_name,
        parent:profiles(first_name, phone)
      )
    `)
    .eq('status', 'scheduled')
    .eq('session_date', today)
    .is('reminder_sent_at', null)

  if (!sessions?.length) {
    return NextResponse.json({ message: 'No reminders to send', count: 0 })
  }

  const toRemind = sessions || []

  const results = { sent: 0, skipped: 0, failed: 0, details: [] as string[] }

  for (const session of toRemind) {
    const parent = (session.student as any)?.parent
    const phone = parent?.phone
    const parentName = parent?.first_name || 'Parent'
    const studentName = `${(session.student as any)?.first_name} ${(session.student as any)?.last_name}`

    if (!phone) {
      results.skipped++
      results.details.push(`${studentName}: no phone`)
      continue
    }

    const result = await sendSessionReminder(
      phone, parentName, studentName,
      session.session_date, session.start_time
    )

    if (result.success) {
      // Mark reminder as sent
      await supabase.from('sessions')
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', session.id)
      results.sent++
      results.details.push(`${studentName}: ✅ sent to ${phone}`)
    } else {
      results.failed++
      results.details.push(`${studentName}: ❌ failed - ${result.error}`)
    }
  }

  console.log('Reminder cron results:', results)
  return NextResponse.json({ message: 'Reminders processed', ...results })
}
