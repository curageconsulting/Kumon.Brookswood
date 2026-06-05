import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMakeupConfirmation } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { studentId, makeupDate, makeupTime } = await req.json()
    const supabase = createClient()
    const { data: student } = await supabase.from('students').select('*, parent:profiles(*)').eq('id', studentId).single()
    if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Build a minimal session object for the email
    const makeupSession = { session_date: makeupDate, start_time: makeupTime, end_time: makeupTime } as any
    const parentEmail = (student.parent as any)?.email
    if (!parentEmail) return NextResponse.json({ error: 'No email' }, { status: 400 })
    await sendMakeupConfirmation(parentEmail, student as any, makeupSession)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
