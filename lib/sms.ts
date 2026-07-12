// Twilio SMS service for Kumon Brookswood
// CASL & CTIA compliant SMS templates

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER!

// Standard opt-out footer required by CTIA/CASL
const OPT_OUT = `Reply STOP to unsubscribe or HELP for info. Msg&data rates may apply.`

function formatDateTime(sessionDate: string, sessionTime: string) {
  const date = new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', month: 'short', day: 'numeric'
  })
  const [h, m] = sessionTime.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  const time = `${displayH}:${String(m).padStart(2,'0')} ${suffix}`
  return { date, time }
}

async function sendSMS(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  try {
    let phone = to.replace(/\D/g, '')
    if (phone.length === 10) phone = `+1${phone}`
    else if (phone.length === 11 && phone[0] === '1') phone = `+${phone}`
    else phone = `+${phone}`

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: TWILIO_FROM,
          To: phone,
          Body: message,
        }),
      }
    )

    const data = await response.json()
    if (!response.ok) {
      console.error('Twilio error:', data)
      return { success: false, error: data.message || 'SMS failed' }
    }
    return { success: true }
  } catch (e: any) {
    console.error('SMS error:', e)
    return { success: false, error: e.message }
  }
}

// ============================================================
// COMPLIANT SMS TEMPLATES
// All messages include:
// - Clear sender identification (Kumon Brookswood)
// - STOP opt-out instruction
// - HELP info option
// - Msg&data rates disclosure
// ============================================================

// First message sent to a new parent — opt-in confirmation
export async function sendWelcomeSMS(
  parentPhone: string,
  parentName: string
) {
  const message = `Hi ${parentName}, you are now enrolled to receive session updates from Kumon Brookswood Learning Centre. Msg freq varies. ${OPT_OUT} Questions? Call (604) 245-2121.`
  return sendSMS(parentPhone, message)
}

// Day-of session reminder
export async function sendSessionReminder(
  parentPhone: string,
  parentName: string,
  studentName: string,
  sessionDate: string,
  sessionTime: string
) {
  const { date, time } = formatDateTime(sessionDate, sessionTime)
  const message = `Kumon Brookswood: Hi ${parentName}, ${studentName} has a session TODAY (${date}) at ${time}. See you soon! ${OPT_OUT}`
  return sendSMS(parentPhone, message)
}

// Absence notification
export async function sendAbsenceNotification(
  parentPhone: string,
  parentName: string,
  studentName: string,
  sessionDate: string,
  sessionTime: string
) {
  const { date, time } = formatDateTime(sessionDate, sessionTime)
  const message = `Kumon Brookswood: Hi ${parentName}, ${studentName} was marked absent for their session on ${date} at ${time}. Questions? Call (604) 245-2121. ${OPT_OUT}`
  return sendSMS(parentPhone, message)
}

// Session cancellation
export async function sendCancellationSMS(
  parentPhone: string,
  parentName: string,
  studentName: string,
  sessionDate: string,
  sessionTime: string
) {
  const { date, time } = formatDateTime(sessionDate, sessionTime)
  const message = `Kumon Brookswood: Hi ${parentName}, ${studentName}'s session on ${date} at ${time} has been cancelled. Book a makeup at kumon-brookswood.vercel.app ${OPT_OUT}`
  return sendSMS(parentPhone, message)
}

// Makeup session confirmation
export async function sendMakeupSMS(
  parentPhone: string,
  parentName: string,
  studentName: string,
  sessionDate: string,
  sessionTime: string
) {
  const { date, time } = formatDateTime(sessionDate, sessionTime)
  const message = `Kumon Brookswood: Hi ${parentName}, ${studentName}'s makeup session is confirmed for ${date} at ${time}. See you then! ${OPT_OUT}`
  return sendSMS(parentPhone, message)
}

// Check-out summary (future use)
export async function sendCheckoutSummary(
  parentPhone: string,
  parentName: string,
  studentName: string,
  minutesSpent: number
) {
  const message = `Kumon Brookswood: Hi ${parentName}, ${studentName} has completed today's session (${minutesSpent} min). Great work! ${OPT_OUT}`
  return sendSMS(parentPhone, message)
}
