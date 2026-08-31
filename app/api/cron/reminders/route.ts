import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSessionReminder } from '@/lib/sms'

export async function GET(req: NextRequest) {
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
  const today = now.toISOString().slice(0, 10)

  // FIX: Only send reminders for active students (not archived/inactive)
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      id, session_date, start_time, reminder_sent_at,
      student:students(
        first_name, last_name, status,
        parent:profiles(first_name, phone)
      )
    `)
    .eq('status', 'scheduled')
    .eq('session_date', today)
    .is('reminder_sent_at', null)

  if (!sessions?.length) {
    return NextResponse.json({ message: 'No reminders to send', count: 0 })
  }

  const results = { sent: 0, skipped: 0, failed: 0, details: [] as string[] }

  for (const session of sessions) {
    const student = session.student as any
    const studentName = `${student?.first_name} ${student?.last_name}`

    // FIX: Skip archived or inactive students
    if (student?.status === 'archived' || student?.status === 'inactive') {
      results.skipped++
      results.details.push(`${studentName}: skipped (${student.status})`)
      continue
    }

    const parent = student?.parent
    const phone = parent?.phone
    const parentName = parent?.first_name || 'Parent'

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
