import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBookingConfirmation } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { studentId, yearId } = await req.json()
    const supabase = createClient()
    const { data: student } = await supabase.from('students').select('*, parent:profiles(*)').eq('id', studentId).single()
    const { data: schedules } = await supabase.from('recurring_schedules').select('*').eq('student_id', studentId).eq('academic_year_id', yearId).eq('is_active', true)
    const { data: year } = await supabase.from('academic_years').select('*').eq('id', yearId).single()
    const { data: { user } } = await supabase.auth.getUser()
    if (!student || !schedules || !year) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Get parent email from auth
    const parentEmail = (student.parent as any)?.email || user?.email
    if (!parentEmail) return NextResponse.json({ error: 'No email' }, { status: 400 })
    await sendBookingConfirmation(parentEmail, (student.parent as any)?.first_name || '', student as any, schedules as any, year.name)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
