import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSessionReminder } from '@/lib/sms'

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()
    const supabase = createClient()

    const { data: session } = await supabase
      .from('sessions')
      .select(`*, student:students(first_name, last_name, parent:profiles(first_name, phone))`)
      .eq('id', sessionId)
      .single()

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const parent = (session.student as any)?.parent
    const phone = parent?.phone

    if (!phone) return NextResponse.json({ error: 'No phone number on file' }, { status: 400 })

    const result = await sendSessionReminder(
      phone, parent?.first_name || 'Parent',
      `${(session.student as any)?.first_name} ${(session.student as any)?.last_name}`,
      session.session_date, session.start_time
    )

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
