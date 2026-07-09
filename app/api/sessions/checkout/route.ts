import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()
    const supabase = createClient()

    // Get check-in time to calculate duration
    const { data: session } = await supabase
      .from('sessions')
      .select('checked_in_at, start_time, student:students(first_name, last_name, parent:profiles(first_name, phone))')
      .eq('id', sessionId)
      .single()

    const checkoutTime = new Date()
    await supabase.from('sessions')
      .update({ checked_out_at: checkoutTime.toISOString() })
      .eq('id', sessionId)

    // Calculate actual time spent
    let minutesSpent = null
    if (session?.checked_in_at) {
      const checkinTime = new Date(session.checked_in_at)
      minutesSpent = Math.round((checkoutTime.getTime() - checkinTime.getTime()) / 60000)
    }

    return NextResponse.json({
      success: true,
      checked_out_at: checkoutTime.toISOString(),
      minutes_spent: minutesSpent
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
