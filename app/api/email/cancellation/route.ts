import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendCancellationConfirmation } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { sessionId, studentId } = await req.json()
    const supabase = createClient()
    const [{ data: session }, { data: student }] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('students').select('*, parent:profiles(*)').eq('id', studentId).single(),
    ])
    if (!session || !student) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const parentEmail = (student.parent as any)?.email
    if (!parentEmail) return NextResponse.json({ error: 'No email' }, { status: 400 })
    await sendCancellationConfirmation(parentEmail, student as any, session as any)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
