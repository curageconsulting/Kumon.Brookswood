import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendAbsenceNotification } from '@/lib/sms'

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

    await supabase.from('sessions').update({ status: 'absent' }).eq('id', sessionId)

    const parent = (session.student as any)?.parent
    const phone = parent?.phone
    const parentName = parent?.first_name || 'Parent'
    const studentName = `${(session.student as any)?.first_name} ${(session.student as any)?.last_name}`

    let smsSent = false
    let smsError = null

    if (phone) {
      const result = await sendAbsenceNotification(phone, parentName, studentName, session.session_date, session.start_time)
      smsSent = result.success
      smsError = result.error
    }

    return NextResponse.json({
      success: true, smsSent, smsError, phone: phone || null,
      message: phone
        ? smsSent ? `Marked absent. SMS sent to ${phone}` : `Marked absent. SMS failed: ${smsError}`
        : 'Marked absent. No phone number on file.'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
