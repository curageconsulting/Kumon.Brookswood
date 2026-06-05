import { Resend } from 'resend'
import { Session, Student, RecurringSchedule } from '@/types'
import { formatDate, formatTime, subjectLabel, categoryLabel } from '@/types'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'Kumon Brookswood <noreply@kumonbrookswood.ca>'

function baseTemplate(content: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f8fb;margin:0;padding:20px}
.card{background:#fff;border-radius:12px;max-width:560px;margin:0 auto;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.header{background:#009FE3;padding:24px 32px;text-align:center}
.header h1{color:#fff;margin:0;font-size:20px;font-weight:600}
.header p{color:rgba(255,255,255,.8);margin:4px 0 0;font-size:14px}
.body{padding:32px}
.info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0eeea;font-size:14px}
.info-row:last-child{border-bottom:none}
.info-label{color:#6b6b67}
.info-val{font-weight:600;color:#0d1b2a;text-align:right}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;background:#e0f4fd;color:#0077b6}
.footer{padding:20px 32px;text-align:center;font-size:12px;color:#9b9b96;border-top:1px solid #f0eeea}
.btn{display:inline-block;background:#009FE3;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;margin:16px 0}
</style></head>
<body><div class="card">${content}<div class="footer">Kumon Brookswood Learning Centre<br>4043 200 St, Langley, BC V3A 1K8 &nbsp;·&nbsp; (604) 245-2121</div></div></body>
</html>`
}

export async function sendBookingConfirmation(
  parentEmail: string,
  parentName: string,
  student: Student,
  schedules: RecurringSchedule[],
  academicYearName: string
) {
  const scheduleRows = schedules.map(s => `
    <div class="info-row">
      <span class="info-label">${s.day_of_week.charAt(0).toUpperCase() + s.day_of_week.slice(1)}</span>
      <span class="info-val">${formatTime(s.start_time)}</span>
    </div>`).join('')

  const html = baseTemplate(`
    <div class="header">
      <h1>Booking confirmed</h1>
      <p>Sessions have been scheduled for ${student.first_name}</p>
    </div>
    <div class="body">
      <div class="info-row"><span class="info-label">Student</span><span class="info-val">${student.first_name} ${student.last_name}</span></div>
      <div class="info-row"><span class="info-label">Category</span><span class="info-val"><span class="badge">${categoryLabel(student.category)}</span></span></div>
      <div class="info-row"><span class="info-label">Subjects</span><span class="info-val">${subjectLabel(student.subjects)}</span></div>
      <div class="info-row"><span class="info-label">Academic year</span><span class="info-val">${academicYearName}</span></div>
      ${scheduleRows}
      <p style="font-size:13px;color:#6b6b67;margin-top:16px">Sessions repeat every week throughout the academic year. You can cancel individual sessions (3+ days in advance) through the parent portal.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/parent/dashboard" class="btn">View my schedule</a>
    </div>`)

  await resend.emails.send({
    from: FROM,
    to: parentEmail,
    subject: `Kumon Brookswood — Sessions confirmed for ${student.first_name}`,
    html,
  })
}

export async function sendCancellationConfirmation(
  parentEmail: string,
  student: Student,
  session: Session
) {
  const html = baseTemplate(`
    <div class="header">
      <h1>Session cancelled</h1>
      <p>${student.first_name} ${student.last_name}</p>
    </div>
    <div class="body">
      <div class="info-row"><span class="info-label">Student</span><span class="info-val">${student.first_name} ${student.last_name}</span></div>
      <div class="info-row"><span class="info-label">Cancelled session</span><span class="info-val">${formatDate(session.session_date)}</span></div>
      <div class="info-row"><span class="info-label">Time</span><span class="info-val">${formatTime(session.start_time)}</span></div>
      <div class="info-row"><span class="info-label">Cancelled on</span><span class="info-val">${formatDate(new Date().toISOString().slice(0,10))}</span></div>
      <p style="font-size:13px;color:#6b6b67;margin-top:16px">You can book a makeup session to replace this one through the parent portal.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/parent/bookings" class="btn">Book a makeup session</a>
    </div>`)

  await resend.emails.send({
    from: FROM,
    to: parentEmail,
    subject: `Kumon Brookswood — Session cancelled for ${student.first_name}`,
    html,
  })
}

export async function sendMakeupConfirmation(
  parentEmail: string,
  student: Student,
  makeupSession: Session
) {
  const html = baseTemplate(`
    <div class="header">
      <h1>Makeup session booked</h1>
      <p>${student.first_name} ${student.last_name}</p>
    </div>
    <div class="body">
      <div class="info-row"><span class="info-label">Student</span><span class="info-val">${student.first_name} ${student.last_name}</span></div>
      <div class="info-row"><span class="info-label">Makeup date</span><span class="info-val">${formatDate(makeupSession.session_date)}</span></div>
      <div class="info-row"><span class="info-label">Time</span><span class="info-val">${formatTime(makeupSession.start_time)} – ${formatTime(makeupSession.end_time)}</span></div>
      <p style="font-size:13px;color:#6b6b67;margin-top:16px">Your recurring weekly schedule remains unchanged.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/parent/dashboard" class="btn">View my schedule</a>
    </div>`)

  await resend.emails.send({
    from: FROM,
    to: parentEmail,
    subject: `Kumon Brookswood — Makeup session confirmed for ${student.first_name}`,
    html,
  })
}
