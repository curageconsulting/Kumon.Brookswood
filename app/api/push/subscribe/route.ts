// app/api/push/subscribe/route.ts — stores a device's push subscription
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const sub = await req.json()
  if (!sub?.endpoint || !sub?.keys) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, keys: sub.keys, device_label: sub.deviceLabel || null },
    { onConflict: 'endpoint' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
