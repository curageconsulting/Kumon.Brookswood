export type Role = 'admin' | 'parent'
export type Category = 'early_learner' | 'main'
export type Subject = 'math' | 'reading' | 'both'
export type StudentStatus = 'active' | 'archived'
export type DayOfWeek = 'monday' | 'thursday' | 'friday' | 'saturday'
export type SessionStatus = 'scheduled' | 'cancelled' | 'makeup'

export interface Profile {
  id: string
  role: Role
  first_name: string
  last_name: string
  email: string
  phone: string | null
  created_at: string
}

export interface Student {
  id: string
  parent_id: string
  first_name: string
  last_name: string
  category: Category
  subjects: Subject
  kumon_level: string | null
  status: StudentStatus
  created_at: string
  parent?: Profile
}

export interface AcademicYear {
  id: string
  name: string
  start_date: string
  end_date: string
  is_active: boolean
}

export interface RecurringSchedule {
  id: string
  student_id: string
  day_of_week: DayOfWeek
  start_time: string
  duration_mins: number
  academic_year_id: string
  is_active: boolean
  student?: Student
  academic_year?: AcademicYear
}

export interface Session {
  id: string
  student_id: string
  schedule_id: string
  session_date: string
  start_time: string
  end_time: string
  duration_mins: number
  status: SessionStatus
  makeup_for_id: string | null
  created_at: string
  student?: Student
  schedule?: RecurringSchedule
  cancellation?: Cancellation
  makeup_session?: Session
}

export interface Cancellation {
  id: string
  session_id: string
  cancelled_by: string
  reason: string | null
  cancelled_at: string
  canceller?: Profile
}

export interface SlotCapacity {
  day_of_week: DayOfWeek
  start_time: string
  category: Category
  booked_count: number
  max_capacity: number
  available: number
}

// Derived types
export const SESSION_DURATION: Record<Category, Record<Subject, number>> = {
  early_learner: { math: 30, reading: 30, both: 60 },
  main: { math: 45, reading: 45, both: 90 },
}

export const MAX_CAPACITY: Record<Category, number> = {
  early_learner: 6,
  main: 15,
}

export const OPERATING_HOURS: Record<DayOfWeek, { open: string; close: string }> = {
  monday: { open: '14:30', close: '18:00' },
  thursday: { open: '14:30', close: '18:00' },
  friday: { open: '14:30', close: '18:00' },
  saturday: { open: '09:00', close: '12:00' },
}

export const CANCELLATION_NOTICE_DAYS = 3

export function getDuration(category: Category, subjects: Subject): number {
  return SESSION_DURATION[category][subjects]
}

export function getSlots(day: DayOfWeek, category: Category, subjects: Subject): string[] {
  const hours = OPERATING_HOURS[day]
  const duration = getDuration(category, subjects)
  // Early Learner: every 30 min (group based)
  // Main Class: every 15 min (students work independently)
  const step = category === 'early_learner' ? 30 : 15
  const slots: string[] = []
  const [openH, openM] = hours.open.split(':').map(Number)
  const [closeH, closeM] = hours.close.split(':').map(Number)
  const openMin = openH * 60 + openM
  const closeMin = closeH * 60 + closeM
  let t = openMin
  while (t + duration <= closeMin) {
    const h = Math.floor(t / 60)
    const m = t % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    t += step
  }
  return slots
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${displayH}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export function canCancel(sessionDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sDate = new Date(sessionDate + 'T00:00:00')
  const diff = Math.round((sDate.getTime() - today.getTime()) / 86400000)
  return diff >= CANCELLATION_NOTICE_DAYS
}

export function daysUntil(sessionDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sDate = new Date(sessionDate + 'T00:00:00')
  return Math.round((sDate.getTime() - today.getTime()) / 86400000)
}

export function categoryLabel(category: Category): string {
  return category === 'early_learner' ? 'Early Learner' : 'Main Class'
}

export function subjectLabel(subject: Subject): string {
  return subject === 'both' ? 'Math + Reading' : subject === 'math' ? 'Mathematics' : 'Reading'
}
