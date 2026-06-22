import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const PARENT_EMAILS = [
  'ebiere_adegbesan@yahoo.com','aracor.arathoon@gmail.com','binder_athwal@hotmail.com',
  'aanchal.sandhu@yahoo.in','pavi_bagri@yahoo.co.in','ranu_dhindsa@hotmail.com',
  'satwantbahia@gmail.com','backup.shubhadarshi@gmail.com','jaspreet.khehra@yahoo.com',
  'mantacheema1991@gmail.com','kjem_21@hotmail.com','duanavpreet@gmail.com',
  'analidiachis2022@gmail.com','bz100@shaw.ca','gurninderg@gmail.com',
  'adhieudau@gmail.com','julia.gordenchuk@gmail.com','hgrewal2008@gmail.com',
  'mandeepgrewal@shaw.ca','cdgoldie@gmail.com','darcilcampbell@gmail.com',
  'maninder2201@yahoo.com','meghaabrol@gmail.com','krystlelasota@gmail.com',
  'beverlyneufeld@telus.net','blancalazorealtor@gmail.com','kaylee.england@gov.bc.ca',
  'candicenolan@shaw.ca','manda_majstorovic@outlook.com','sandymann530@gmail.com',
  'carolineleahmartin@gmail.com','tina.tresa1990@gmail.com','nancy.nguyen@gmail.com',
  'ltran881@gmail.com','pannu@hotmail.ca','vishwa22690@gmail.com',
  'ingrid.cazares@gmail.com','makaylaw94@live.ca','lanaalkabak@gmail.com',
  'kikky_2015@yahoo.com','mishl_sun@hotmail.com','navjot23.gill@gmail.com',
  'nina_chohan@hotmail.com','roseanu1986@yahoo.com','melshepherd@outlook.com',
  'sujata.suju@gmail.com','powarrj@gmail.com','cinnamonbits17@hotmail.com',
  'rkhatra19@gmail.com','newlifelindama@gmail.com','rorow26933342@gmail.com',
  'fin@adriantumusok.com','nehav6262@gmail.com','nicole.williams83@outlook.com',
  'zainstra@gmail.com','aleen.aram@yahoo.com',
]

const TEMP_PASSWORD = 'KumonBrookswood2026!'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const results = { created: [] as string[], skipped: [] as string[], failed: [] as string[] }

  const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existingEmails = new Set(existingUsers?.users?.map(u => u.email?.toLowerCase()) || [])

  for (const email of PARENT_EMAILS) {
    if (existingEmails.has(email.toLowerCase())) {
      results.skipped.push(email)
      continue
    }
    const { error } = await supabase.auth.admin.createUser({
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'parent', first_name: '', last_name: '' }
    })
    if (error) {
      results.failed.push(`${email}: ${error.message}`)
    } else {
      results.created.push(email)
    }
    await new Promise(r => setTimeout(r, 150))
  }

  return NextResponse.json({
    summary: { created: results.created.length, skipped: results.skipped.length, failed: results.failed.length },
    details: results,
    temp_password: TEMP_PASSWORD,
  })
}

export async function GET() {
  return NextResponse.json({ 
    message: 'POST with Authorization: Bearer YOUR_ADMIN_SECRET to create accounts',
    total_emails: PARENT_EMAILS.length
  })
}
