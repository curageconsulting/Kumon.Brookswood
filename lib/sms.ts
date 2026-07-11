// Twilio SMS service for Kumon Brookswood

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER!

async function sendSMS(to: string, message: string, checkConsent = true): Promise<{ success: boolean; error?: string }> {
  try {
    // Clean phone number
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

// SMS Templates

export async function sendAbsenceNotification(
  parentPhone: string,
  parentName: string,
  studentName: string,
  sessionDate: string,
  sessionTime: string
) {
  const date = new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', month: 'short', day: 'numeric'
  })
  const [h, m] = sessionTime.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const displayH = h > 12 ? h - 12 : h
  const time = `${displayH}:${String(m).padStart(2,'0')} ${suffix}`

  const message = `Hi ${parentName}, this is Kumon Brookswood. ${studentName} was marked absent for their session on ${date} at ${time}. Please call us at (604) 245-2121 if you have any questions. - Kumon Brookswood`
  return sendSMS(parentPhone, message)
}

export async function sendSessionReminder(
  parentPhone: string,
  parentName: string,
  studentName: string,
  sessionDate: string,
  sessionTime: string
) {
  const date = new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', month: 'short', day: 'numeric'
  })
  const [h, m] = sessionTime.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const displayH = h > 12 ? h - 12 : h
  const time = `${displayH}:${String(m).padStart(2,'0')} ${suffix}`

  const message = `Hi ${parentName}, reminder: ${studentName} has a Kumon session tomorrow (${date}) at ${time}. See you then! - Kumon Brookswood`
  return sendSMS(parentPhone, message)
}

export async function sendCancellationSMS(
  parentPhone: string,
  parentName: string,
  studentName: string,
  sessionDate: string,
  sessionTime: string
) {
  const date = new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', month: 'short', day: 'numeric'
  })
  const [h, m] = sessionTime.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const displayH = h > 12 ? h - 12 : h
  const time = `${displayH}:${String(m).padStart(2,'0')} ${suffix}`

  const message = `Hi ${parentName}, ${studentName}'s session on ${date} at ${time} has been cancelled. You can book a makeup session at https://kumon-brookswood.vercel.app - Kumon Brookswood`
  return sendSMS(parentPhone, message)
}

export async function sendMakeupSMS(
  parentPhone: string,
  parentName: string,
  studentName: string,
  sessionDate: string,
  sessionTime: string
) {
  const date = new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', month: 'short', day: 'numeric'
  })
  const [h, m] = sessionTime.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const displayH = h > 12 ? h - 12 : h
  const time = `${displayH}:${String(m).padStart(2,'0')} ${suffix}`

  const message = `Hi ${parentName}, ${studentName}'s makeup session is confirmed for ${date} at ${time}. See you then! - Kumon Brookswood`
  return sendSMS(parentPhone, message)
}
