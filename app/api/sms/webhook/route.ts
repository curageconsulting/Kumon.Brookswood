import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Twilio webhook for inbound SMS (STOP/HELP/YES responses)
// Set this URL in Twilio console: https://kumon-brookswood.vercel.app/api/sms/webhook

export async function POST(req: NextRequest) {
  const body = await req.formData()
  const from = body.get('From') as string
  const message = (body.get('Body') as string || '').trim().toUpperCase()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Clean phone for matching
  const phone = from.replace(/\D/g, '')

  let reply = ''

  if (message === 'STOP' || message === 'UNSUBSCRIBE' || message === 'CANCEL' || message === 'END' || message === 'QUIT') {
    // Opt out — update profile
    await supabase.from('profiles')
      .update({ sms_consent: false, sms_consent_at: null })
      .or(`phone.eq.${from},phone.eq.+${phone},phone.eq.+1${phone}`)
    reply = `You have been unsubscribed from Kumon Brookswood SMS notifications. You will receive no more messages. Reply START to resubscribe. Call (604) 245-2121 for help.`

  } else if (message === 'START' || message === 'YES' || message === 'UNSTOP') {
    // Opt back in
    await supabase.from('profiles')
      .update({ sms_consent: true, sms_consent_at: new Date().toISOString() })
      .or(`phone.eq.${from},phone.eq.+${phone},phone.eq.+1${phone}`)
    reply = `You have been resubscribed to Kumon Brookswood SMS notifications. Msg freq varies. Msg&data rates may apply. Reply STOP to unsubscribe.`

  } else if (message === 'HELP' || message === 'INFO') {
    reply = `Kumon Brookswood Learning Centre. 4043 200 St, Langley BC. (604) 245-2121. You receive session reminders & updates. Reply STOP to unsubscribe. Msg&data rates may apply.`
  }

  // Return TwiML response
  const twiml = reply
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' }
  })
}
