import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()
    const supabase = createClient()
    await supabase.from('sessions')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('id', sessionId)
    return NextResponse.json({ success: true, checked_in_at: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
