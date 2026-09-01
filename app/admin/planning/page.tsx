'use client'
// @ts-nocheck
// ============================================================
// ADMIN PLANNING — full instructor planning portal, ported from
// the Student-planning app. Lives at /admin/planning.
// Reads/writes the kumon_* tables in the same Supabase project.
// ============================================================
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// ─── Data layer (kumon_* tables) ────────────────────────────────
const ALL_DAYS_DL = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

function rowToStudent(r: any) {
  const sd = r.schedule_days || {}
  const mathDays = r.math_schedule_days || sd.math || []
  const readingDays = r.reading_schedule_days || sd.reading || []
  return {
    id: r.id,
    kumonStudentId: r.kumon_student_id,
    name: r.name,
    status: r.status || 'active',
    parentName: r.parent_name,
    parentContact: r.parent_contact,
    parentEmail: r.parent_email,
    grade: r.grade,
    dob: r.dob,
    mathEnabled: r.math_enabled,
    mathLevel: r.math_level,
    mathWorksheet: r.math_worksheet,
    mathClassWS: r.math_class_ws,
    mathHomeworkWS: r.math_homework_ws,
    mathScheduleDays: mathDays,
    mathHomeworkDays: ALL_DAYS_DL.filter(d => !mathDays.includes(d)),
    readingEnabled: r.reading_enabled,
    readingLevel: r.reading_level,
    readingWorksheet: r.reading_worksheet,
    readingClassWS: r.reading_class_ws,
    readingHomeworkWS: r.reading_homework_ws,
    readingScheduleDays: readingDays,
    readingHomeworkDays: ALL_DAYS_DL.filter(d => !readingDays.includes(d)),
    kumonMoneyPerSheet: r.kumon_money_per_sheet,
  }
}

function studentToRow(s: any) {
  return {
    id: s.id,
    kumon_student_id: s.kumonStudentId ?? null,
    name: s.name,
    status: s.status || 'active',
    parent_name: s.parentName,
    parent_contact: s.parentContact,
    parent_email: s.parentEmail ?? null,
    grade: s.grade,
    dob: s.dob ?? null,
    math_enabled: s.mathEnabled,
    math_level: s.mathLevel,
    math_worksheet: s.mathWorksheet,
    math_class_ws: s.mathClassWS,
    math_homework_ws: s.mathHomeworkWS,

    reading_enabled: s.readingEnabled,
    reading_level: s.readingLevel,
    reading_worksheet: s.readingWorksheet,
    reading_class_ws: s.readingClassWS,
    reading_homework_ws: s.readingHomeworkWS,
    schedule_days: { math: s.mathScheduleDays ?? [], reading: s.readingScheduleDays ?? [] },
    kumon_money_per_sheet: s.kumonMoneyPerSheet,
  }
}

async function fetchStudents(includeInactive = false) {
  let q = supabase.from('kumon_students').select('*').order('name', { ascending: true })
  if (!includeInactive) q = q.eq('status', 'active')
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(rowToStudent)
}

async function upsertStudent(student: any) {
  const { error } = await supabase.from('kumon_students').upsert(studentToRow(student))
  if (error) throw error
}

async function setStudentStatus(id: string, status: string, kumonStudentId: any) {
  // 1) Planning side
  const { error } = await supabase.from('kumon_students').update({ status }).eq('id', id)
  if (error) throw error
  // 2) Booking portal side via the kumon_student_id bridge
  //    (mirrors the booking admin's own archive/reactivate flow)
  if (!kumonStudentId) return { bookingSynced: false, reason: "no Kumon ID on this student" }
  const { data: bookingRows, error: e2 } = await supabase.from('students')
    .select('id').eq('kumon_student_id', kumonStudentId)
  if (e2 || !bookingRows?.length) return { bookingSynced: false, reason: "no linked booking student" }
  const bookingStatus = status === 'inactive' ? 'archived' : 'active'
  const today = new Date().toISOString().split('T')[0]
  for (const b of bookingRows) {
    await supabase.from('students').update({ status: bookingStatus }).eq('id', b.id)
    if (status === 'inactive') {
      await supabase.from('sessions').update({ status: 'cancelled' })
        .eq('student_id', b.id).gte('session_date', today).eq('status', 'scheduled')
      await supabase.from('recurring_schedules').update({ is_active: false }).eq('student_id', b.id)
    }
  }
  return { bookingSynced: true }
}

async function deleteStudent(id: string) {
  const { error } = await supabase.from('kumon_students').delete().eq('id', id)
  if (error) throw error
}

async function fetchSessionsForMonth(fromDate: string, toDate: string) {
  const { data, error } = await supabase.from('kumon_sessions').select('*')
    .gte('session_date', fromDate).lte('session_date', toDate)
  if (error) throw error
  const out: any = {}
  for (const r of (data || [])) {
    out[r.student_id + '|' + r.session_date] = {
      present: r.present,
      math: r.math_data || {},
      reading: r.reading_data || {},
      kumonMoney: r.kumon_money,
      moneyTasks: r.money_tasks || undefined,
    }
  }
  return out
}

async function fetchSessionsForDate(dateStr: string) {
  const { data, error } = await supabase.from('kumon_sessions').select('*').eq('session_date', dateStr)
  if (error) throw error
  const out: any = {}
  for (const r of (data || [])) {
    out[r.student_id] = {
      present: r.present,
      math: r.math_data || {},
      reading: r.reading_data || {},
      kumonMoney: r.kumon_money,
      moneyTasks: r.money_tasks || undefined,
      selectedKeywords: r.selected_keywords || [],
      customComment: r.custom_comment || '',
    }
  }
  return out
}

async function upsertSession(studentId: string, date: string, sessionData: any) {
  const { error } = await supabase.from('kumon_sessions').upsert({
    student_id: studentId,
    session_date: date,
    present: sessionData.present ?? false,
    math_data: sessionData.math || {},
    reading_data: sessionData.reading || {},
    kumon_money: sessionData.kumonMoney ?? (sessionData.moneyTasks ? calcTaskMoney(sessionData.moneyTasks) : null),
    money_tasks: sessionData.moneyTasks || {},
    selected_keywords: sessionData.selectedKeywords || [],
    custom_comment: sessionData.customComment || '',
  })
  if (error) throw error
}

async function advanceStudentLevel(studentId: string, subject: string, newLevel: string, newWorksheet: number) {
  const updates = subject === 'math'
    ? { math_level: newLevel, math_worksheet: newWorksheet }
    : { reading_level: newLevel, reading_worksheet: newWorksheet }
  const { error } = await supabase.from('kumon_students').update(updates).eq('id', studentId)
  if (error) throw error
}

async function fetchSetting(key: string, fallback: any) {
  const { data, error } = await supabase.from('kumon_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw error
  return data ? data.value : fallback
}

async function saveSetting(key: string, value: any) {
  const { error } = await supabase.from('kumon_settings').upsert({ key, value })
  if (error) throw error
}

// ─── Goals (kumon_goals table) ──────────────────────────────────
async function fetchGoals() {
  const { data, error } = await supabase.from('kumon_goals').select('*').eq('status', 'active')
  if (error) throw error
  const out: any = {}
  for (const g of (data || [])) out[g.student_id + ':' + g.subject] = g
  return out
}
async function upsertGoal(goal: any) {
  const { error } = await supabase.from('kumon_goals').upsert(goal)
  if (error) throw error
}
async function removeGoal(id: string) {
  const { error } = await supabase.from('kumon_goals').update({ status: 'done' }).eq('id', id)
  if (error) throw error
}

// ─── Worksheet Plans (kumon_plans table) ────────────────────────
function planKey(studentId: string, subject: string, date: string) { return `${studentId}|${subject}|${date}` }
async function fetchPlansRange(fromDate: string, toDate: string) {
  const { data, error } = await supabase.from('kumon_plans').select('*')
    .gte('plan_date', fromDate).lte('plan_date', toDate)
  if (error) throw error
  const out: any = {}
  for (const p of (data || [])) out[planKey(p.student_id, p.subject, p.plan_date)] = p
  return out
}
async function upsertPlans(rows: any[]) {
  const { error } = await supabase.from('kumon_plans').upsert(rows)
  if (error) throw error
}
async function deletePlan(id: string) {
  const { error } = await supabase.from('kumon_plans').delete().eq('id', id)
  if (error) throw error
}

// ─── Kiosk check-in/out status (booking portal sessions bridge) ─
// Reads the booking portal's sessions for the date and maps them to
// kumon_students via students.kumon_student_id.
async function fetchKioskStatus(dateStr: string) {
  const { data, error } = await supabase.from('sessions')
    .select('checked_in_at, checked_out_at, status, student:students(kumon_student_id)')
    .eq('session_date', dateStr)
  if (error) throw error
  const out: any = {}
  for (const s of (data || [])) {
    const kid = s.student?.kumon_student_id
    if (!kid || !s.checked_in_at) continue
    const inAt = new Date(s.checked_in_at)
    const outAt = s.checked_out_at ? new Date(s.checked_out_at) : null
    const mins = Math.round(((outAt ? outAt.getTime() : Date.now()) - inAt.getTime()) / 60000)
    out[String(kid)] = { checkedIn: s.checked_in_at, checkedOut: s.checked_out_at, minutes: mins }
  }
  return out
}


// ─── Kumon level system (Math vs Reading differ) ───────────────
const MATH_LEVELS = ["6A","5A","4A","3A","2A","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"];
const READING_LEVELS = [
  "7A","6A","5A","4A","3A","2A",
  "A","AI","AII","B","BI","BII","C","CI","CII","D","DI","DII",
  "E","EI","EII","F","FI","FII","G","GI","GII","H","HI","HII",
  "I","I-I","I-II","J","K","L","M","N","O",
];
function levelsFor(subject){ return subject==="reading" ? READING_LEVELS : MATH_LEVELS; }
function nextLevel(level, subject){ const seq=levelsFor(subject); const i=seq.indexOf(level); return i>=0&&i<seq.length-1?seq[i+1]:level; }

const MAX_WS = 200;
const SCORE_CYCLE = [100,95,90,85,80,75,70];
const ALL_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_IDX = {0:"Sun",1:"Mon",2:"Tue",3:"Wed",4:"Thu",5:"Fri",6:"Sat"};
const GRADE_OPTIONS = ["Pre-K","Kindergarten","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"];

const DEFAULT_KEYWORDS = [
  "🌟 Excellent focus today","⚡ Great improvement in speed","💪 Outstanding effort",
  "😊 Very enthusiastic learner","🎯 Excellent accuracy","🏆 Near level mastery",
  "✅ Completed all planned work","📖 Please review errors at home","🚀 Ready for advancement",
  "👏 Keep up the great work","📈 Showing great progress","🔄 Needs more correction practice",
  "⏱️ Good timing today","🎉 Personal best!","💡 Quick learner",
];

function todayDayStr(ds){ return DAY_IDX[new Date(ds+"T12:00:00").getDay()]; }

// ─── Kumon Money — task-based reward system (per center's reward chart) ──
const MONEY_TASKS = [
  { key:"achievementTest", label:"Achievement Test (level promotion)", amount:20, emoji:"🏆" },
  { key:"zeroCorrections",  label:"Zero Corrections (class & homework)", amount:10, emoji:"✅" },
  { key:"sct",              label:"Worksheet done in SCT (standard time)", amount:10, emoji:"⏱️" },
  { key:"finishedHW",       label:"Finished all planned homework", amount:5, emoji:"📝" },
  { key:"sameDayCorrections", label:"Corrections done same day", amount:5, emoji:"🔄" },
  { key:"extraWork",        label:"Did extra work than planned", amount:5, emoji:"➕" },
  { key:"respectful",       label:"Respectful & listening to teacher", amount:1, emoji:"🙌" },
];
function calcTaskMoney(tasks){ if(!tasks) return 0; return MONEY_TASKS.reduce((sum,t)=>sum+(tasks[t.key]?t.amount:0),0); }
function initials(n){ return n.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }
const PALETTE = ["#3b82f6","#8b5cf6","#ec4899","#f59e0b","#10b981","#ef4444","#6366f1","#14b8a6","#f97316","#06b6d4"];
function sColor(id){ return PALETTE[String(id).split("").reduce((a,c)=>a+c.charCodeAt(0),0)%PALETTE.length]; }
function getWsItems(lvl,fromWs,done,subject){ const items=[]; let ws=fromWs,l=lvl; for(let i=0;i<done;i++){items.push({wsNum:ws,level:l});ws++;if(ws>MAX_WS){ws=1;l=nextLevel(l,subject);}} return items; }
function advancePos(level,ws,done,subject){ let w=ws+done,l=level; if(w>MAX_WS){w-=MAX_WS;l=nextLevel(level,subject);if(l===level)w=MAX_WS;} return {level:l,worksheet:Math.min(w,MAX_WS)}; }
function wsRange(level,from,done,subject){ if(!done) return `${level}${from}`; const items=getWsItems(level,from,done,subject); const last=items[items.length-1]; return `${level}${from}→${last.level}${last.wsNum}`; }
function cycleScore(s){ const i=SCORE_CYCLE.indexOf(s); return i>=0&&i<SCORE_CYCLE.length-1?SCORE_CYCLE[i+1]:100; }
function avgScore(scores){ if(!scores||!scores.length) return null; return Math.round(scores.reduce((a,b)=>a+b,0)/scores.length); }


// ─── Standard Completion Time (SCT) — minutes per worksheet ─────
// Source: Kumon SCT charts (Math 2022, Reading 2023). [min,max] per
// worksheet decade (index 0 = WS 1-10 ... 19 = WS 191-200).
// Not applicable: Math 6A-5A, Reading 7A-3A.
const MATH_SCT = {"4A":[[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2]],"3A":[[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[0.5,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2]],"2A":[[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2]],"A":[[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[2,3],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[2,3]],"B":[[1,2],[1,2],[2,3],[2,3],[2,3],[2,3],[2,3],[2,4],[2,4],[3,5],[1,2],[2,3],[2,3],[2,3],[2,3],[2,4],[2,3],[2,4],[2,4],[3,5]],"C":[[2,3],[2,3],[2,3],[2,3],[2,3],[2,4],[2,4],[2,4],[2,4],[2,4],[3,5],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[3,4],[3,5]],"D":[[2,3],[2,4],[2,4],[3,4],[3,5],[2,4],[3,4],[3,4],[3,4],[3,5],[3,5],[3,5],[3,5],[3,5],[4,6],[3,5],[2,3],[2,3],[2,4],[2,4]],"E":[[2,3],[2,3],[3,4],[3,4],[3,4],[3,5],[3,5],[3,5],[3,5],[4,6],[3,4],[3,5],[3,5],[4,6],[3,4],[3,5],[3,5],[3,5],[3,5],[3,5]],"F":[[3,5],[3,5],[4,6],[3,5],[4,6],[4,6],[3,5],[3,5],[3,5],[4,6],[4,6],[4,6],[4,6],[3,5],[4,6],[4,6],[4,6],[5,7],[3,5],[3,5]],"G":[[3,5],[3,5],[2,4],[3,5],[3,5],[4,6],[3,5],[4,6],[4,6],[4,6],[4,6],[4,6],[3,5],[3,5],[4,6],[4,6],[3,5],[4,6],[4,6],[4,6]],"H":[[4,6],[4,6],[5,8],[5,8],[5,8],[5,8],[5,8],[6,10],[6,10],[6,8],[6,8],[5,7],[5,7],[5,7],[5,7],[4,6],[5,7],[5,7],[5,7],[5,7]],"I":[[4,6],[5,7],[5,7],[5,7],[5,7],[5,7],[5,7],[5,7],[4,6],[5,7],[5,7],[5,7],[5,7],[5,7],[6,8],[6,8],[6,8],[7,10],[7,10],[7,10]],"J":[[5,8],[5,8],[5,8],[6,10],[6,10],[7,12],[6,10],[5,8],[6,10],[5,8],[6,10],[6,10],[6,10],[6,10],[6,10],[6,10],[6,10],[6,10],[6,10],[7,12]],"K":[[4,6],[5,8],[6,12],[7,14],[7,14],[7,14],[8,16],[7,14],[7,14],[8,16],[6,12],[7,14],[7,14],[7,14],[8,16],[7,14],[8,16],[6,12],[7,14],[8,16]],"L":[[6,12],[7,14],[8,16],[8,16],[8,16],[12,24],[15,30],[15,30],[15,30],[15,30],[15,30],[8,16],[12,24],[12,24],[15,30],[15,30],[15,30],[15,30],[30,60],[30,60]],"M":[[10,20],[10,20],[15,30],[15,30],[15,30],[15,30],[15,30],[15,30],[10,20],[10,20],[10,20],[10,20],[10,20],[15,30],[15,30],[15,30],[15,30],[15,30],[15,30],[15,30]],"N":[[10,20],[10,20],[15,30],[15,30],[20,40],[20,40],[10,20],[15,30],[15,30],[15,30],[15,30],[15,30],[15,30],[20,40],[15,30],[15,30],[15,30],[15,30],[20,40],[25,50]],"O":[[20,40],[25,50],[25,50],[25,50],[25,50],[15,30],[15,30],[15,30],[20,40],[15,30],[15,30],[20,40],[25,50],[25,50],[25,50],[25,50],[25,50],[30,60],[30,60],[30,60]]};
const READING_SCT = {"2A":[[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2],[1,2]],"AI":[[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3]],"AII":[[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3]],"BI":[[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3]],"BII":[[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3],[2,3]],"CI":[[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4]],"CII":[[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4]],"DI":[[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4]],"DII":[[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4],[2,4]],"EI":[[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4]],"EII":[[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4],[3,4]],"FI":[[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5]],"FII":[[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5]],"GI":[[3,5],[3,5],[3,5],[3,5],[3,5],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6]],"GII":[[3,5],[3,5],[3,5],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,6],[4,7]],"HI":[[4,6],[4,6],[4,6],[4,6],[4,6],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7]],"HII":[[4,6],[4,6],[4,6],[4,6],[4,6],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[5,8]],"I-I":[[4,6],[4,6],[4,6],[4,6],[4,6],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7],[4,7]],"I-II":[[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8],[5,8]],"J":[[7,10],[7,10],[6,9],[7,10],[7,10],[4,6],[7,10],[7,10],[7,10],[7,10],[6,9],[7,10],[5,7],[7,10],[7,10],[7,10],[7,10],[7,10],[7,10],[4,6]],"K":[[7,10],[9,14],[9,14],[9,14],[7,10],[9,14],[9,14],[9,14],[7,10],[9,14],[9,14],[7,10],[9,14],[9,14],[9,14],[7,10],[9,14],[9,14],[9,14],[9,14]],"L":[[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14],[9,14]]};
function sctFor(subject, level, ws) {
  const chart = subject === "reading" ? READING_SCT : MATH_SCT;
  let key = level;
  if (subject === "reading" && !chart[key]) {
    if (key === "I") key = "I-I";
    else if (chart[key + "I"]) key = key + "I"; // plain A..H -> AI..HI
  }
  const rows = chart[key];
  if (!rows) return null;
  const idx = Math.min(19, Math.max(0, Math.floor(((ws || 1) - 1) / 10)));
  return rows[idx];
}
function sctStatus(subject, level, ws, totalMinutes, done) {
  const range = sctFor(subject, level, ws);
  if (!range || !done || !totalMinutes || isNaN(totalMinutes)) return null;
  const perWS = totalMinutes / done;
  return { met: perWS <= range[1], fast: perWS < range[0], perWS, range };
}
function SctBadge({subject, level, ws, time, done}) {
  const st = sctStatus(subject, level, ws, parseFloat(time), done);
  if (!st) return null;
  const c = st.met ? "#16a34a" : "#dc2626";
  return (
    <span style={{fontSize:11,fontWeight:700,color:c,background:st.met?"#f0fdf4":"#fef2f2",border:`1.5px solid ${c}33`,borderRadius:8,padding:"4px 9px",whiteSpace:"nowrap"}}>
      {st.met ? (st.fast ? "⚡ Faster than SCT" : "✅ SCT met") : "⏱️ Over SCT"} · {st.perWS.toFixed(1)}m/WS (SCT {st.range[0]}–{st.range[1]})
    </span>
  );
}


// ─── Kumon Goal Setting & Communication Tool port ───────────────
// Projection engine + KIS/ASHR milestones from the official xlsm.
// Grade anchors = level the student completes by school-year end to
// be "on standard" (KIS). ASHR1/2/3 = 1/2/3 ladder steps ahead.
const MATH_KIS_ANCHOR = {"PK3":"5A","PK2":"4A","PK1":"3A","K":"2A",1:"A",2:"B",3:"C",4:"D",5:"E",6:"F",7:"G",8:"H",9:"I",10:"K",11:"M",12:"O"};
const READ_KIS_ANCHOR = {"PK3":"5A","PK2":"4A","PK1":"3A","K":"2A",1:"AI",2:"BI",3:"CI",4:"DI",5:"EI",6:"FI",7:"GI",8:"HI",9:"I-I",10:"J",11:"K",12:"L"};
const MILESTONE_BANDS = [
  {ahead:3,label:"ASHR3",medal:"💎",color:"#7c3aed"},
  {ahead:2,label:"ASHR2",medal:"🥇",color:"#d97706"},
  {ahead:1,label:"ASHR1",medal:"🥈",color:"#64748b"},
  {ahead:0,label:"KIS",medal:"🥉",color:"#b45309"},
];
function parseGrade(gradeText){
  if (gradeText == null) return null;
  const t = String(gradeText).trim().toUpperCase();
  if (t.startsWith("PK") || t.includes("PRE")) return t.match(/\d/) ? "PK"+t.match(/\d/)[0] : "PK1";
  if (t.startsWith("K")) return "K";
  const n = parseInt(t.replace(/[^0-9]/g,""));
  return isNaN(n) ? null : Math.min(12, Math.max(1, n));
}
function gradeAdvance(grade, years){
  const order = ["PK3","PK2","PK1","K",1,2,3,4,5,6,7,8,9,10,11,12];
  const i = order.indexOf(grade);
  if (i < 0) return grade;
  return order[Math.min(order.length-1, i + years)];
}
function gradeAtDate(baseGrade, date){
  // School advance month: September
  const now = new Date();
  let years = date.getFullYear() - now.getFullYear();
  if (date.getMonth() >= 8 && now.getMonth() < 8) years += 1;
  else if (date.getMonth() < 8 && now.getMonth() >= 8) years -= 1;
  return gradeAdvance(baseGrade, Math.max(0, years));
}
function milestoneFor(subject, grade, level){
  if (grade == null) return null;
  const anchors = subject === "reading" ? READ_KIS_ANCHOR : MATH_KIS_ANCHOR;
  const seq = levelsFor(subject);
  const anchor = anchors[grade];
  if (!anchor) return null;
  const ai = seq.indexOf(anchor), li = seq.indexOf(level);
  if (ai < 0 || li < 0) return null;
  const ahead = li - ai;
  for (const b of MILESTONE_BANDS) if (ahead >= b.ahead) return {...b, ahead};
  return null;
}
function studyToCalendarDays(studyDays, daysPerWeek){
  // Port of the xlsm H28 formula: spread study days over a week schedule
  if (daysPerWeek >= 7) return studyDays;
  if (studyDays % daysPerWeek === 0) return (studyDays/daysPerWeek - 1)*7 + daysPerWeek;
  return Math.floor(studyDays/daysPerWeek)*7 + (studyDays % daysPerWeek);
}
function buildProjection(subject, startLevel, startWs, wsPerDay, daysPerWeek, reps, baseGrade, maxLevels=14){
  const seq = levelsFor(subject);
  let i = seq.indexOf(startLevel);
  if (i < 0 || !wsPerDay) return [];
  const rows = []; let cum = 0;
  const today = new Date();
  for (let n = 0; i < seq.length && n < maxLevels; i++, n++) {
    const level = seq[i];
    const wsCount = n === 0 ? (MAX_WS - (startWs||1) + 1) : MAX_WS;
    const r = reps[level] ?? 1;
    const studyDays = Math.ceil((wsCount * r) / wsPerDay);
    const calDays = studyToCalendarDays(studyDays, daysPerWeek);
    cum += calDays;
    const finish = new Date(today.getTime() + cum*86400000);
    const grade = gradeAtDate(baseGrade, finish);
    rows.push({ level, wsCount, reps: r, studyDays, calDays, cum, finish, grade,
      milestone: milestoneFor(subject, grade, level) });
  }
  return rows;
}

// ─── Goal helpers ───────────────────────────────────────────────
function wsDistance(fromLevel, fromWs, toLevel, toWs, subject){
  const seq = levelsFor(subject);
  const fi = seq.indexOf(fromLevel), ti = seq.indexOf(toLevel);
  if (fi < 0 || ti < 0) return null;
  return (ti - fi) * MAX_WS + (toWs - fromWs);
}
function daysLeft(targetDate){
  if (!targetDate) return null;
  const t = new Date(targetDate + "T23:59:00"), now = new Date();
  return Math.max(0, Math.ceil((t - now) / 86400000));
}
function goalStats(goal, curLevel, curWs, subject){
  if (!goal) return null;
  const remaining = wsDistance(curLevel, curWs, goal.target_level, goal.target_worksheet, subject);
  const total = wsDistance(goal.start_level, goal.start_worksheet, goal.target_level, goal.target_worksheet, subject);
  const dl = daysLeft(goal.target_date);
  const done = total != null && remaining != null ? total - remaining : null;
  const pct = total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
  const perDay = remaining != null && dl ? Math.ceil(remaining / dl) : null;
  return { remaining, total, done, pct, dl, perDay, reached: remaining != null && remaining <= 0 };
}
function GoalChip({goal, level, worksheet, subject, color}){
  const g = goalStats(goal, level, worksheet, subject);
  if (!g) return null;
  if (g.reached) return <Tag c="#16a34a" bg="#f0fdf4">🎯 Goal {goal.target_level}{goal.target_worksheet} reached! 🎉</Tag>;
  return <Tag c={color} bg={color+"14"}>🎯 {goal.target_level}{goal.target_worksheet} · {g.remaining} WS left{g.dl!=null?` · ${g.dl}d`:""}{g.perDay?` · ~${g.perDay}/day`:""}</Tag>;
}

function naturalizeComments(keywords, customComment) {
  const phrases = (keywords||[]).map(k=>k.replace(/^[\p{Emoji}\s]+/u,"").trim()).filter(Boolean).map(p=>p.charAt(0).toLowerCase()+p.slice(1));
  const custom = (customComment||"").trim();
  if (phrases.length===0 && !custom) return "Keep encouraging daily practice — every session counts!";
  let sentence = "";
  if (phrases.length===1) sentence = `Today's session showed ${phrases[0]}.`;
  else if (phrases.length===2) sentence = `Today's session showed ${phrases[0]} and ${phrases[1]}.`;
  else if (phrases.length>2) sentence = `Today's session showed ${phrases.slice(0,-1).join(", ")}, and ${phrases[phrases.length-1]}.`;
  return [sentence, custom].filter(Boolean).join(" ");
}

function generateMessage(student, session, centerName, date) {
  if (!session?.present) return null;
  const m=session.math||{}, r=session.reading||{};
  const mDone=m.done||0, rDone=r.done||0, mAvg=avgScore(m.scores), rAvg=avgScore(r.scores);
  const money = session.kumonMoney ?? calcTaskMoney(session.moneyTasks);
  const earnedTasks = MONEY_TASKS.filter(t => session.moneyTasks?.[t.key]);
  const ds=new Date(date+"T12:00:00").toLocaleDateString("en-CA",{weekday:"long",month:"long",day:"numeric"});
  const mb=student.mathEnabled&&mDone>0?[
    `📐 *Math — ${wsRange(m.fromLevel||student.mathLevel,m.fromWorksheet||student.mathWorksheet,mDone,"math")}*`,
    `   • Worksheets: ${mDone}${m.timeMinutes?` in ${m.timeMinutes}min`:""}`,
    mAvg!=null?`   • Score: ${mAvg}%${mAvg===100?" 🌟":mAvg>=95?" ⭐":""}`:null,
    m.corrections==="done"?"   • Corrections: ✅ All done!":m.corrections==="pending"?"   • Corrections: ⏳ Please finish at home":null,
  ].filter(Boolean).join("\n"):"";
  const rb=student.readingEnabled&&rDone>0?[
    `📖 *Reading — ${wsRange(r.fromLevel||student.readingLevel,r.fromWorksheet||student.readingWorksheet,rDone,"reading")}*`,
    `   • Worksheets: ${rDone}${r.timeMinutes?` in ${r.timeMinutes}min`:""}`,
    rAvg!=null?`   • Score: ${rAvg}%${rAvg===100?" 🌟":rAvg>=95?" ⭐":""}`:null,
    r.corrections==="done"?"   • Corrections: ✅ All done!":r.corrections==="pending"?"   • Corrections: ⏳ Please finish at home":null,
  ].filter(Boolean).join("\n"):"";
  const comments = naturalizeComments(session.selectedKeywords, session.customComment);
  const hw=[student.mathEnabled&&mDone>0&&m.corrections==="pending"?"math corrections":"",student.readingEnabled&&rDone>0&&r.corrections==="pending"?"reading corrections":""].filter(Boolean);
  const moneyLine = earnedTasks.length>0
    ? `💰 *Kumon Money Earned: $${money}*\n${earnedTasks.map(t=>`   ${t.emoji} ${t.label} (+$${t.amount})`).join("\n")}`
    : `💰 *Kumon Money Earned: $${money}*`;
  return `Dear ${student.parentName||"Parent"},\n\nHere is ${student.name}'s Kumon update for *${ds}*! 📚\n\n${[mb,rb].filter(Boolean).join("\n\n")}\n\n${moneyLine}\n${hw.length?`\n📌 *Homework:* Please complete ${hw.join(" and ")} before the next session.\n`:""}\n📣 *Instructor's Comments:*\n${comments}\n\nSee you next session! 🌟\n${centerName}`;
}

function CounterBtn({onClick,children,size=36}){ return <button onClick={onClick} style={{width:size,height:size,border:"1.5px solid #e2e8f0",background:"white",borderRadius:8,fontWeight:700,fontSize:18,cursor:"pointer",color:"#475569",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{children}</button>; }
function SectionLabel({label,sub}){ return <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8,marginTop:4}}><div style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.6}}>{label}</div>{sub&&<div style={{fontSize:10,color:"#94a3b8"}}>{sub}</div>}</div>; }
function Tag({c,bg,children}){ return <span style={{fontSize:10,color:c,background:bg,padding:"2px 6px",borderRadius:6,fontWeight:600}}>{children}</span>; }
function LevelBadge({subject,level,worksheet,color}){ if(!level) return null; return <span style={{fontSize:11,fontWeight:700,color,background:color+"18",padding:"2px 7px",borderRadius:6,letterSpacing:0.3}}>{subject}: {level}{worksheet}</span>; }

// ─── App Root ───────────────────────────────────────────────────
export default function AdminPlanning() {
  const [tab,setTab] = useState("today");
  const [students,setStudents] = useState([]);
  const [sessionsToday,setSessionsToday] = useState({});
  const [selectedDate,setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [centerName,setCenterName] = useState("Kumon Learning Center");
  const [keywords,setKeywords] = useState(DEFAULT_KEYWORDS);
  const [goals,setGoals] = useState({});
  const [goalModal,setGoalModal] = useState(null); // {studentId, subject} | null
  const [projModal,setProjModal] = useState(null); // {studentId, subject} | null
  const [plans,setPlans] = useState({});
  const [kiosk,setKiosk] = useState({});
  const [notifOn,setNotifOn] = useState(typeof Notification!=="undefined" && Notification.permission==="granted");
  const [notified,setNotified] = useState({});
  const [planModal,setPlanModal] = useState(null); // studentId | null
  const [monthSessions,setMonthSessions] = useState({});
  const [sessionModal,setSessionModal] = useState(null);
  const [editModal,setEditModal] = useState(null);
  const [loading,setLoading] = useState(true);
  const [toast,setToast] = useState(null);

  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2500); };

  useEffect(()=>{
    (async()=>{
      try {
        const [studentsData, cn, kw] = await Promise.all([
          fetchStudents(),
          fetchSetting('center_name','Kumon Learning Center'),
          fetchSetting('keywords', DEFAULT_KEYWORDS),
        ]);
        setStudents(studentsData); setCenterName(cn); setKeywords(kw);
        try { setGoals(await fetchGoals()); }
        catch(ge){ console.warn("Goals unavailable (run kumon_goals.sql):", ge.message); }
        try {
          const d0 = new Date(); d0.setDate(d0.getDate()-7);
          const d1 = new Date(); d1.setDate(d1.getDate()+28);
          setPlans(await fetchPlansRange(d0.toISOString().split("T")[0], d1.toISOString().split("T")[0]));
        } catch(pe){ console.warn("Plans unavailable (run kumon_plans.sql):", pe.message); }
      } catch(e){ console.error(e); showToast("Failed to load data: "+e.message,"error"); }
      setLoading(false);
    })();
  },[]);

  useEffect(()=>{
    (async()=>{
      try { setSessionsToday(await fetchSessionsForDate(selectedDate)); }
      catch(e){ console.error(e); }
      try {
        const ref = new Date(selectedDate+"T12:00:00");
        const y = ref.getFullYear(), m = ref.getMonth();
        const from = `${y}-${String(m+1).padStart(2,"0")}-01`;
        const last = new Date(y, m+1, 0).getDate();
        const to = `${y}-${String(m+1).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
        setMonthSessions(await fetchSessionsForMonth(from, to));
      } catch(e){ console.warn("Month sessions:", e.message); }
      try { setKiosk(await fetchKioskStatus(selectedDate)); }
      catch(e){ console.warn("Kiosk status unavailable:", e.message); }
    })();
  },[selectedDate]);

  // ─── Class-time watch: poll kiosk every 60s, alert on overstay ──
  // Limit: 45 min for 1-subject students, 90 min for 2-subject students.
  const overstayList = (() => {
    const todayReal = new Date().toISOString().split("T")[0];
    if (selectedDate !== todayReal) return [];
    const out = [];
    for (const s of students) {
      if (s.status==="inactive" || !s.kumonStudentId) continue;
      const ks = kiosk[String(s.kumonStudentId)];
      if (!ks || ks.checkedOut) continue;
      const limit = (s.mathEnabled && s.readingEnabled) ? 90 : 45;
      if (ks.minutes > limit) out.push({ student: s, minutes: ks.minutes, limit, over: ks.minutes - limit });
    }
    return out.sort((a,b)=>b.over-a.over);
  })();

  useEffect(()=>{
    const tick = async ()=>{
      const todayReal = new Date().toISOString().split("T")[0];
      if (selectedDate !== todayReal) return;
      try { setKiosk(await fetchKioskStatus(selectedDate)); } catch(e){}
    };
    const iv = setInterval(tick, 60000);
    return ()=>clearInterval(iv);
  },[selectedDate]);

  useEffect(()=>{
    if (!overstayList.length) return;
    for (const o of overstayList) {
      const key = o.student.id + ":" + (kiosk[String(o.student.kumonStudentId)]?.checkedIn || "");
      if (notified[key]) continue;
      setNotified(p=>({...p,[key]:true}));
      if (notifOn && typeof Notification!=="undefined" && Notification.permission==="granted") {
        try { new Notification("⏰ Class time exceeded", {
          body: `${o.student.name} — ${o.minutes} min in center (limit ${o.limit} min). Time to wrap up!`,
          tag: key, requireInteraction: true,
        }); } catch(e){}
      }
    }
  },[kiosk]);

  const enableNotifications = async ()=>{
    if (typeof Notification==="undefined") { showToast("Notifications not supported on this browser","error"); return; }
    const perm = await Notification.requestPermission();
    if (perm!=="granted") { showToast("Notifications blocked — allow them in browser settings","error"); return; }
    setNotifOn(true);
    // Web Push: subscribe this device so alerts arrive even with the app closed
    try {
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (vapid && "serviceWorker" in navigator && "PushManager" in window) {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const b64 = vapid.replace(/-/g,"+").replace(/_/g,"/");
        const pad = "=".repeat((4 - b64.length % 4) % 4);
        const raw = atob(b64 + pad);
        const key = new Uint8Array([...raw].map(c=>c.charCodeAt(0)));
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const j = sub.toJSON();
        await fetch("/api/push/subscribe", { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys, deviceLabel: navigator.userAgent.slice(0,80) }) });
        showToast("🔔 Push alerts on — works even when the app is closed");
        return;
      }
    } catch(e){ console.warn("Push subscribe failed, in-page alerts only:", e); }
    showToast("🔔 Overstay alerts on while this page is open");
  };

  const todayDay = todayDayStr(selectedDate);
  const todayStudents = students.filter(s =>
    s.status !== "inactive" && (
    (s.mathEnabled && (s.mathScheduleDays.includes(todayDay) || s.mathHomeworkDays.includes(todayDay))) ||
    (s.readingEnabled && (s.readingScheduleDays.includes(todayDay) || s.readingHomeworkDays.includes(todayDay))))
  );
  const classStudents = todayStudents.filter(s =>
    (s.mathEnabled && s.mathScheduleDays.includes(todayDay)) || (s.readingEnabled && s.readingScheduleDays.includes(todayDay))
  );

  const getSession = (sid) => sessionsToday[sid] || {};
  const updateLocalSession = (sid, patch) => setSessionsToday(prev => ({...prev, [sid]: {...(prev[sid]||{}), ...patch}}));

  const openStudent = students.find(s=>s.id===sessionModal);
  const openSession = sessionModal ? getSession(sessionModal) : {};

  const shiftSessionDate = async (n) => {
    const sid = sessionModal;
    const sess = sid ? getSession(sid) : null;
    if (sid && sess && sess.hasOwnProperty("present")) {
      try { await upsertSession(sid, selectedDate, sess); }
      catch(e){ showToast("Save failed: "+e.message,"error"); return; }
    }
    const d = new Date(selectedDate+"T12:00:00"); d.setDate(d.getDate()+n);
    setSelectedDate(d.toISOString().split("T")[0]);
    if (sid) showToast("✅ Saved — switched day");
  };

  const saveSession = async (advance) => {
    const sid = sessionModal;
    const sess = getSession(sid);
    const student = students.find(s=>s.id===sid);
    try {
      await upsertSession(sid, selectedDate, sess);
      if (advance && student) {
        let updates = {};
        if (student.mathEnabled && sess.math?.done>0) {
          const n = advancePos(student.mathLevel, student.mathWorksheet, sess.math.done, "math");
          await advanceStudentLevel(sid, 'math', n.level, n.worksheet);
          updates.mathLevel = n.level; updates.mathWorksheet = n.worksheet;
        }
        if (student.readingEnabled && sess.reading?.done>0) {
          const n = advancePos(student.readingLevel, student.readingWorksheet, sess.reading.done, "reading");
          await advanceStudentLevel(sid, 'reading', n.level, n.worksheet);
          updates.readingLevel = n.level; updates.readingWorksheet = n.worksheet;
        }
        setStudents(prev => prev.map(s => s.id===sid ? {...s, ...updates} : s));
        showToast("✅ Saved & level updated!");
      } else {
        showToast("✅ Session saved!");
      }
    } catch(e) { console.error(e); showToast("Save failed: "+e.message,"error"); }
    setSessionModal(null);
  };

  return (
    <div style={{fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',background:"#f0f4f8",minHeight:"100vh"}}>
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.type==="success"?"#059669":"#dc2626",color:"white",padding:"10px 22px",borderRadius:10,fontWeight:700,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",whiteSpace:"nowrap",fontSize:14}}>{toast.msg}</div>}

      <div style={{background:"linear-gradient(135deg,#0f2d6b,#1e40af,#2563eb)",padding:"14px 16px",color:"white"}}>
        <div style={{maxWidth:700,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <a href="/admin/dashboard" style={{border:"none",background:"rgba(255,255,255,0.15)",borderRadius:8,padding:"6px 11px",color:"white",fontSize:13,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>← Dashboard</a>
            <div>
              <div style={{fontWeight:900,fontSize:18,letterSpacing:-0.4}}>📚 {centerName}</div>
              <div style={{fontSize:11,opacity:0.65,marginTop:2,letterSpacing:0.3}}>INSTRUCTOR PORTAL</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:13,fontWeight:700}}>{new Date(selectedDate+"T12:00:00").toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"})}</div>
            <div style={{marginTop:5,display:"flex",gap:5,justifyContent:"flex-end"}}>
              <span style={{background:"rgba(255,255,255,0.18)",borderRadius:10,padding:"2px 9px",fontSize:10}}>{classStudents.length} class today</span>
              <span style={{background:"rgba(255,255,255,0.18)",borderRadius:10,padding:"2px 9px",fontSize:10}}>{students.length} enrolled</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{background:"white",borderBottom:"1px solid #e2e8f0"}}>
        <div style={{maxWidth:700,margin:"0 auto",display:"flex"}}>
          {[{id:"today",l:"Today",i:"📋"},{id:"plan",l:"Plan",i:"📅"},{id:"goals",l:"Goals",i:"🎯"},{id:"students",l:"Students",i:"👥"},{id:"settings",l:"Settings",i:"⚙️"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 4px 8px",border:"none",background:"transparent",color:tab===t.id?"#1e40af":"#94a3b8",borderBottom:tab===t.id?"3px solid #1e40af":"3px solid transparent",fontWeight:tab===t.id?700:500,fontSize:11,cursor:"pointer"}}>
              <div style={{fontSize:18}}>{t.i}</div><div style={{marginTop:2}}>{t.l}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:700,margin:"0 auto",padding:14}}>
        {loading ? (
          <div style={{textAlign:"center",padding:48,color:"#94a3b8"}}>Loading students…</div>
        ) : <>
          {tab==="today" && (
            <TodayTab
              classStudents={classStudents} allTodayStudents={todayStudents} todayDay={todayDay}
              selectedDate={selectedDate} setSelectedDate={setSelectedDate}
              getSession={getSession} onOpen={setSessionModal} goals={goals} plans={plans} kiosk={kiosk}
              allStudents={students} onSetup={setEditModal}
              overstayList={overstayList} notifOn={notifOn} onEnableNotifications={enableNotifications}
              monthSessions={monthSessions} setMonthSessions={setMonthSessions}
              setPlans={setPlans} showToast={showToast}
            />
          )}
          {tab==="plan" && (
            <PlanTab students={students} plans={plans} onPlan={setPlanModal}
              onDelete={async p=>{ try{ await deletePlan(p.id); setPlans(prev=>{ const n={...prev}; delete n[planKey(p.student_id,p.subject,p.plan_date)]; return n; }); showToast("Plan removed"); } catch(e){ showToast("Failed: "+e.message,"error"); } }} />
          )}
          {tab==="goals" && (
            <GoalsTab students={students} goals={goals} onEdit={setGoalModal} onProject={setProjModal}
              onRemove={async g=>{ try{ await removeGoal(g.id); const n={...goals}; delete n[g.student_id+':'+g.subject]; setGoals(n); showToast("Goal completed 🎉"); } catch(e){ showToast("Failed: "+e.message,"error"); } }} />
          )}
          {tab==="students" && (
            <StudentsTab students={students} onEdit={setEditModal}
              onToggleStatus={async s=>{
                const next = s.status==="inactive" ? "active" : "inactive";
                try {
                  const res = await setStudentStatus(s.id, next, s.kumonStudentId);
                  setStudents(prev=>prev.map(x=>x.id===s.id?{...x,status:next}:x));
                  const base = next==="active" ? `✅ ${s.name} is active` : `⏸️ ${s.name} marked inactive`;
                  showToast(res.bookingSynced ? base + " · booking portal synced" : base + ` · planning only (${res.reason})`);
                } catch(e){ showToast("Update failed: "+e.message,"error"); }
              }}
              onReload={async(inc)=>{ try{ setStudents(await fetchStudents(inc)); } catch(e){ showToast("Reload failed: "+e.message,"error"); } }} />
          )}
          {tab==="settings" && (
            <SettingsTab centerName={centerName} setCenterName={async v=>{setCenterName(v); await saveSetting('center_name',v); showToast("✅ Saved!");}}
              keywords={keywords} setKeywords={async v=>{setKeywords(v); await saveSetting('keywords',v);}} />
          )}
        </>}
      </div>

      {sessionModal && openStudent && (
        <SessionModal student={openStudent} session={openSession} keywords={keywords} centerName={centerName} date={selectedDate} todayDay={todayDay} goals={goals}
          plan={{math:plans[planKey(openStudent.id,"math",selectedDate)],reading:plans[planKey(openStudent.id,"reading",selectedDate)]}}
          kioskStatus={kiosk[String(openStudent.kumonStudentId)]}
          onShiftDate={shiftSessionDate}
          onUpdate={patch=>updateLocalSession(sessionModal,patch)}
          onClose={advance=>saveSession(advance)}
          onCancel={()=>setSessionModal(null)}
        />
      )}

      {editModal && (
        <EditStudentModal
          student={editModal==="new"?null:students.find(s=>s.id===editModal)}
          onSave={async data=>{
            try {
              const id = editModal==="new" ? "s"+Date.now() : editModal;
              await upsertStudent({...data, id});
              if (editModal==="new") setStudents(p=>[...p,{...data,id}]);
              else setStudents(p=>p.map(s=>s.id===editModal?{...s,...data}:s));
              setEditModal(null);
              showToast(editModal==="new"?"✅ Added!":"✅ Updated!");
            } catch(e){ showToast("Save failed: "+e.message,"error"); }
          }}
          onDelete={editModal!=="new"?async()=>{
            try { await deleteStudent(editModal); setStudents(p=>p.filter(s=>s.id!==editModal)); setEditModal(null); showToast("Removed","error"); }
            catch(e){ showToast("Delete failed: "+e.message,"error"); }
          }:null}
          onClose={()=>setEditModal(null)}
        />
      )}

      {goalModal && (
        <GoalModal
          student={students.find(s=>s.id===goalModal.studentId)}
          subject={goalModal.subject}
          goal={goals[goalModal.studentId+':'+goalModal.subject]}
          onSave={async data=>{
            try {
              await upsertGoal(data);
              setGoals(prev=>({...prev, [data.student_id+':'+data.subject]: data}));
              setGoalModal(null); showToast("🎯 Goal saved!");
            } catch(e){ showToast("Save failed: "+e.message+(e.message?.includes("kumon_goals")?" — run kumon_goals.sql in Supabase":""),"error"); }
          }}
          onClose={()=>setGoalModal(null)}
        />
      )}

      {planModal && (
        <PlanModal
          student={students.find(s=>s.id===planModal)}
          plans={plans}
          onSave={async rows=>{
            try {
              await upsertPlans(rows);
              setPlans(prev=>{ const n={...prev}; for (const r of rows) n[planKey(r.student_id,r.subject,r.plan_date)]=r; return n; });
              showToast(`📅 ${rows.length} day-plans saved!`);
              setPlanModal(null);
            } catch(e){ showToast("Save failed: "+e.message+(e.message?.includes("kumon_plans")?" — run kumon_plans.sql":""),"error"); }
          }}
          onClose={()=>setPlanModal(null)}
        />
      )}

      {projModal && (
        <ProjectionModal
          student={students.find(s=>s.id===projModal.studentId)}
          subject={projModal.subject}
          showToast={showToast}
          onSetGoal={async data=>{
            try {
              await upsertGoal(data);
              setGoals(prev=>({...prev, [data.student_id+':'+data.subject]: data}));
              showToast(`🎯 Goal set: complete ${data.target_level} by ${data.target_date}`);
            } catch(e){ showToast("Goal failed: "+e.message,"error"); }
          }}
          onClose={()=>setProjModal(null)}
        />
      )}
    </div>
  );
}

// ─── Today Tab ───────────────────────────────────────────────────
function TodayTab({classStudents,allTodayStudents,todayDay,selectedDate,setSelectedDate,getSession,onOpen,goals,plans={},setPlans,kiosk={},allStudents=[],onSetup,overstayList=[],notifOn,onEnableNotifications,monthSessions={},setMonthSessions,showToast}:any) {
  const [viewMode,setViewMode] = useState("cards"); // "cards" | "table" | "record"
  const shiftDate=n=>{const d=new Date(selectedDate+"T12:00:00");d.setDate(d.getDate()+n);setSelectedDate(d.toISOString().split("T")[0]);};
  const homeworkOnly = allTodayStudents.filter(s => !classStudents.includes(s));
  const presentCount = classStudents.filter(s=>getSession(s.id).present).length;

  return (
    <div>
      <div style={{background:"white",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
        <button onClick={()=>shiftDate(-1)} style={{border:"none",background:"#f1f5f9",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontSize:16}}>‹</button>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} style={{flex:1,border:"none",textAlign:"center",fontSize:14,fontWeight:700,color:"#1e293b",background:"transparent",cursor:"pointer"}}/>
        <button onClick={()=>shiftDate(1)} style={{border:"none",background:"#f1f5f9",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontSize:16}}>›</button>
        <button onClick={()=>setSelectedDate(new Date().toISOString().split("T")[0])} style={{border:"none",background:"#eff6ff",color:"#1e40af",borderRadius:8,padding:"7px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>Today</button>
      </div>

      {overstayList.length>0 && (
        <div style={{background:"#fef2f2",border:"2px solid #fca5a5",borderRadius:12,padding:"11px 13px",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:800,color:"#dc2626",marginBottom:7}}>⏰ Class time exceeded — {overstayList.length} student{overstayList.length>1?"s":""} should head home</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {overstayList.map(o=>(
              <div key={o.student.id} onClick={()=>onOpen(o.student.id)} style={{display:"flex",alignItems:"center",gap:9,background:"white",borderRadius:9,padding:"7px 11px",cursor:"pointer"}}>
                <span style={{width:28,height:28,borderRadius:"50%",background:sColor(o.student.id),color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:10}}>{initials(o.student.name)}</span>
                <span style={{flex:1,fontWeight:700,fontSize:13,color:"#1e293b"}}>{o.student.name}</span>
                <span style={{fontSize:11,fontWeight:800,color:"#dc2626"}}>{o.minutes} min <span style={{color:"#94a3b8",fontWeight:600}}>/ {o.limit}</span> · +{o.over} over</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!notifOn && typeof Notification!=="undefined" && (
        <button onClick={onEnableNotifications} style={{width:"100%",marginBottom:12,padding:"9px",border:"1.5px dashed #cbd5e1",background:"white",color:"#64748b",borderRadius:10,fontWeight:700,fontSize:12,cursor:"pointer"}}>
          🔔 Enable overstay alerts on this device (45 min · 1 subject / 90 min · 2 subjects)
        </button>
      )}
      {(() => {
        const needsSetup = allStudents.filter(s => s.status !== "inactive" && !s.mathEnabled && !s.readingEnabled);
        if (!needsSetup.length) return null;
        return (
          <div style={{background:"#fff7ed",border:"1.5px solid #fdba74",borderRadius:12,padding:"11px 13px",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:800,color:"#c2410c",marginBottom:8}}>🆕 New students — needs setup ({needsSetup.length})</div>
            <div style={{fontSize:10,color:"#9a3412",marginBottom:8}}>Imported from the Kumon roster but subjects, levels, and class days aren't set yet. Tap to configure after speaking with the parent.</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {needsSetup.map(s=>(
                <div key={s.id} onClick={()=>onSetup&&onSetup(s.id)} style={{display:"flex",alignItems:"center",gap:9,background:"white",borderRadius:9,padding:"8px 11px",cursor:"pointer"}}>
                  <span style={{width:30,height:30,borderRadius:"50%",background:sColor(s.id),color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11}}>{initials(s.name)}</span>
                  <span style={{flex:1,minWidth:0}}>
                    <span style={{fontWeight:700,fontSize:13,color:"#1e293b",display:"block"}}>{s.name}</span>
                    <span style={{fontSize:10,color:"#64748b"}}>{s.grade||"grade —"}{s.parentName?` · ${s.parentName}`:""}{s.parentContact?` · ${s.parentContact}`:""}</span>
                  </span>
                  <span style={{fontSize:11,fontWeight:700,color:"#ea580c",whiteSpace:"nowrap"}}>Set up ›</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {classStudents.length>0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
          <div style={{background:"#eff6ff",borderRadius:10,padding:"10px 8px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:"#3b82f6"}}>{classStudents.length}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>Class Today</div></div>
          <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 8px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:"#16a34a"}}>{presentCount}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>Marked</div></div>
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <button onClick={()=>setViewMode("cards")} style={{flex:1,padding:"8px",border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",background:viewMode==="cards"?"#1e40af":"#f1f5f9",color:viewMode==="cards"?"white":"#64748b"}}>🪪 Cards</button>
        <button onClick={()=>setViewMode("table")} style={{flex:1,padding:"8px",border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",background:viewMode==="table"?"#1e40af":"#f1f5f9",color:viewMode==="table"?"white":"#64748b"}}>📊 Table</button>
        <button onClick={()=>setViewMode("record")} style={{flex:1,padding:"8px",border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",background:viewMode==="record"?"#1e40af":"#f1f5f9",color:viewMode==="record"?"white":"#64748b"}}>📋 Record</button>
      </div>

      {viewMode==="table" ? (
        <DayTableView students={allTodayStudents} classStudents={classStudents} todayDay={todayDay} getSession={getSession} onOpen={onOpen} plans={plans} selectedDate={selectedDate} kiosk={kiosk} />
      ) : viewMode==="record" ? (
        <RecordBookView students={allStudents} selectedDate={selectedDate} getSession={getSession} onOpen={onOpen} plans={plans} monthSessions={monthSessions}
          onSavePlan={async (rows:any[])=>{ await upsertPlans(rows); setPlans((prev:any)=>{ const n={...prev}; for(const r of rows) n[planKey(r.student_id,r.subject,r.plan_date)]=r; return n; }); showToast("📅 Plan saved!"); }}
          onDeletePlan={async (p:any)=>{ await deletePlan(p.id); setPlans((prev:any)=>{ const n={...prev}; delete n[planKey(p.student_id,p.subject,p.plan_date)]; return n; }); showToast("Plan removed"); }}
          onMonthChange={async (y:number,m:number)=>{
            try {
              const from=`${y}-${String(m+1).padStart(2,"0")}-01`;
              const last=new Date(y,m+1,0).getDate();
              const to=`${y}-${String(m+1).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
              const ms = await fetchSessionsForMonth(from,to);
              setMonthSessions(ms);
            } catch(e){ console.warn(e); }
          }}
        />
      ) : <>
        {classStudents.length===0 ? (
          <div style={{textAlign:"center",padding:32,color:"#94a3b8"}}>
            <div style={{fontSize:40}}>📭</div>
            <div style={{fontWeight:700,marginTop:8,fontSize:14}}>No class sessions scheduled for {todayDay}</div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:homeworkOnly.length>0?20:0}}>
            {classStudents.map(s=><StudentCard key={s.id} student={s} session={getSession(s.id)} todayDay={todayDay} onOpen={()=>onOpen(s.id)} isClassDay goals={goals} plan={{math:plans[planKey(s.id,"math",selectedDate)],reading:plans[planKey(s.id,"reading",selectedDate)]}} kioskStatus={kiosk[String(s.kumonStudentId)]}/>)}
          </div>
        )}

        {homeworkOnly.length>0 && <>
          <SectionLabel label={`📝 Homework Day (${todayDay})`} sub={`${homeworkOnly.length} students`} />
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {homeworkOnly.map(s=><StudentCard key={s.id} student={s} session={getSession(s.id)} todayDay={todayDay} onOpen={()=>onOpen(s.id)} isClassDay={false} goals={goals} plan={{math:plans[planKey(s.id,"math",selectedDate)],reading:plans[planKey(s.id,"reading",selectedDate)]}} kioskStatus={kiosk[String(s.kumonStudentId)]}/>)}
          </div>
        </>}
      </>}
    </div>
  );
}



// ─── Day Plan Modal — edit/set plan for a specific date from record view ──
function DayPlanModal({student,dateStr,subject,existingPlan,plans,onSave,onDelete,onClose}:any) {
  const isMath = subject==="math"
  const color = isMath?"#3b82f6":"#ec4899"
  const seq = levelsFor(subject)
  const curLevel = isMath?student.mathLevel:student.readingLevel
  const curWs = isMath?student.mathWorksheet:student.readingWorksheet
  const lastPlanBefore = () => {
    const prior = Object.values(plans)
      .filter((p:any)=>p.student_id===student.id&&p.subject===subject&&p.plan_date<dateStr)
      .sort((a:any,b:any)=>a.plan_date<b.plan_date?1:-1)[0] as any
    if (prior) { const nxt = advancePos(prior.level,prior.start_ws,prior.ws_count,subject); return {level:nxt.level,ws:nxt.worksheet}; }
    return {level:curLevel,ws:curWs}
  }
  const def = existingPlan
    ? {level:existingPlan.level,ws:existingPlan.start_ws,count:existingPlan.ws_count,note:existingPlan.note||""}
    : {...lastPlanBefore(),count:isMath?(student.mathClassWS||5):(student.readingClassWS||5),note:""}
  const [level,setLevel] = useState(def.level)
  const [ws,setWs] = useState(def.ws)
  const [count,setCount] = useState(def.count)
  const [note,setNote] = useState(def.note)
  const fmt = new Date(dateStr+"T12:00:00").toLocaleDateString("en-CA",{weekday:"long",month:"short",day:"numeric"})
  const endWs = Math.min(200,ws+count-1)
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:600,display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:700,margin:"0 auto",background:"white",borderRadius:"20px 20px 0 0",padding:"16px 16px 32px"}}>
        <div style={{width:40,height:4,background:"#e2e8f0",borderRadius:2,margin:"0 auto 14px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:"#1e293b"}}>📅 {existingPlan?"Edit":"Set"} Plan</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{student.name} · {isMath?"📐 Math":"📖 Reading"} · {fmt}</div>
          </div>
          <button onClick={onClose} style={{border:"none",background:"#f1f5f9",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:14}}>✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          <div style={{background:"#f8fafc",borderRadius:10,padding:"8px 10px"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#475569",marginBottom:5}}>LEVEL</div>
            <select value={level} onChange={e=>setLevel(e.target.value)} style={{width:"100%",border:"none",background:"transparent",fontSize:15,fontWeight:700,color,outline:"none"}}>
              {seq.map((l:string)=><option key={l}>{l}</option>)}
            </select>
          </div>
          <div style={{background:"#f8fafc",borderRadius:10,padding:"8px 10px"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#475569",marginBottom:5}}>START WS</div>
            <input type="number" inputMode="numeric" min={1} max={200} value={ws}
              onChange={e=>setWs(Math.max(1,Math.min(200,parseInt(e.target.value)||1)))}
              style={{width:"100%",border:"none",background:"transparent",fontSize:15,fontWeight:700,color:"#1e293b",outline:"none"}}/>
          </div>
        </div>
        <div style={{background:"#f8fafc",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:"#475569",marginBottom:8}}>WORKSHEETS</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <CounterBtn size={28} onClick={()=>setCount(Math.max(1,count-1))}>−</CounterBtn>
            <span style={{flex:1,textAlign:"center",fontWeight:900,fontSize:24,color:"#1e293b"}}>{count}</span>
            <CounterBtn size={28} onClick={()=>setCount(Math.min(20,count+1))}>+</CounterBtn>
          </div>
          <div style={{textAlign:"center",fontSize:12,color,fontWeight:700,marginTop:6}}>{level}{ws} → {level}{endWs}</div>
        </div>
        <input value={note} onChange={e=>setNote(e.target.value)}
          placeholder="Note — e.g. missed class, carry-forward from Mon"
          style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"9px 12px",fontSize:12,boxSizing:"border-box" as any,outline:"none",marginBottom:12}}/>
        <div style={{display:"flex",gap:8}}>
          {existingPlan&&<button onClick={()=>onDelete(existingPlan)} style={{padding:"12px 14px",border:"1.5px solid #fca5a5",background:"#fef2f2",color:"#dc2626",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13}}>🗑</button>}
          <button onClick={onClose} style={{padding:"12px 14px",border:"1.5px solid #e2e8f0",background:"white",color:"#64748b",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13}}>Cancel</button>
          <button onClick={()=>onSave({id:`p_${student.id}_${subject}_${dateStr}`,student_id:student.id,subject,plan_date:dateStr,level,start_ws:ws,ws_count:count,note:note||null})}
            style={{flex:1,padding:"12px",border:"none",background:`linear-gradient(135deg,${color},${color}bb)`,color:"white",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer"}}>
            💾 Save Plan
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Record Book View — paper record sheet style ────────────────
// Layout mirrors the Kumon record book exactly:
// Each ROW = one session date. Columns: Date | Level | No. (start WS) | Time | Score boxes 1..N
// Score boxes map to individual worksheets done that day.
// Circle = corrections verified for that worksheet.
function RecordBookView({students,selectedDate,getSession,onOpen,plans={},monthSessions={},onMonthChange,onSavePlan,onDeletePlan}:any) {
  const todayRef = new Date()
  const [dayPlanModal,setDayPlanModal] = useState<any>(null)
  const [viewYear,setViewYear] = useState(todayRef.getFullYear())
  const [viewMonth,setViewMonth] = useState(todayRef.getMonth())
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate()
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-CA",{month:"long",year:"numeric"})
  const MAX_SCORE_COLS = 10
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  const monthStr = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}`
  const shiftMonth = (n) => {
    const d = new Date(viewYear, viewMonth+n, 1)
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth())
    onMonthChange && onMonthChange(d.getFullYear(), d.getMonth())
  }
  const active = students.filter(s=>s.status!=="inactive")
  if (!active.length) return <div style={{textAlign:"center",padding:32,color:"#94a3b8"}}>No students</div>
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"white",borderRadius:12,padding:"10px 16px",boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
        <button onClick={()=>shiftMonth(-1)} style={{border:"none",background:"#f1f5f9",borderRadius:8,padding:"6px 14px",fontWeight:800,fontSize:16,cursor:"pointer",color:"#475569"}}>‹</button>
        <span style={{fontWeight:800,fontSize:15,color:"#1e293b"}}>{monthLabel}</span>
        <button onClick={()=>shiftMonth(1)} style={{border:"none",background:"#f1f5f9",borderRadius:8,padding:"6px 14px",fontWeight:800,fontSize:16,cursor:"pointer",color:"#475569"}}>›</button>
      </div>
      {active.map(s=>(
        <div key={s.id} style={{background:"white",borderRadius:12,boxShadow:"0 1px 3px rgba(0,0,0,0.08)",overflow:"hidden"}}>
          <div style={{background:"#1e3a8a",color:"white",padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:800,fontSize:14}}>{s.name}</span>
            <span style={{fontSize:11,opacity:0.75}}>{monthLabel} · {s.grade||"—"}</span>
          </div>
          {[s.mathEnabled&&{sub:"math",label:"Math",color:"#3b82f6",level:s.mathLevel,ws:s.mathWorksheet},
            s.readingEnabled&&{sub:"reading",label:"Reading",color:"#ec4899",level:s.readingLevel,ws:s.readingWorksheet}]
            .filter(Boolean).map(({sub,label,color,level,ws})=>(
            <div key={sub} style={{borderTop:`2px solid ${color}22`}}>
              <div style={{fontSize:10,fontWeight:800,color,padding:"3px 12px",background:color+"0a"}}>{label.toUpperCase()}</div>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",fontSize:11,width:"100%",minWidth:400}}>
                  <thead>
                    <tr style={{background:"#f8fafc",borderBottom:"1.5px solid #e2e8f0"}}>
                      {["Date","Day","C/H","Level","No.","Time",...Array.from({length:MAX_SCORE_COLS},(_,i)=>i+1)].map((h,i)=>(
                        <th key={i} style={{padding:"4px 3px",textAlign:"center",color:"#475569",fontWeight:700,borderRight:"1px solid #e2e8f0",whiteSpace:"nowrap",minWidth:i<6?26:22,fontSize:i>=6?10:11}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({length:daysInMonth},(_,di)=>{
                      const dayNum = di+1
                      const dateStr = `${monthStr}-${String(dayNum).padStart(2,"0")}`
                      const dow = new Date(dateStr+"T12:00:00").getDay()
                      const dayLabel = DAY_NAMES[dow]
                      const plan = plans[planKey(s.id,sub,dateStr)]
                      const isToday = dateStr===selectedDate
                      const rawSess = isToday ? getSession(s.id) : monthSessions[s.id+"|"+dateStr]
                      const sd = rawSess ? (sub==="math"?rawSess.math:rawSess.reading) : null
                      const done = sd?.done||0
                      const scores = sd?.scores||[]
                      const circled = sd?.circled||[]
                      const fromLevel = sd?.fromLevel||plan?.level||level
                      const fromWs = sd?.fromWorksheet||plan?.start_ws||ws
                      const plannedCount = plan?.ws_count||0
                      const timeMin = sd?.timeMinutes
                      const timePerWS = (timeMin&&done) ? (parseFloat(timeMin)/done).toFixed(1) : null
                      const wsItems = (done>0||plannedCount>0) ? getWsItems(fromLevel,fromWs,Math.max(done,plannedCount),sub) : []
                      const isClassDay = (sub==="math"?s.mathScheduleDays:s.readingScheduleDays)?.includes(dayLabel)
                      const hasAnything = done>0||plannedCount>0
                      const allCircled = done>0&&circled.filter(Boolean).length===done
                      const isFuture = dateStr>selectedDate
                      const rowBg = !hasAnything?"white":allCircled?"#f0fdf4":done>0&&scores.some(v=>v<100)?"#fffbeb":done>0?"#f8faff":"#faf5ff"
                      return (
                        <tr key={dayNum}
                          onClick={()=>setDayPlanModal({student:s,dateStr,subject:sub,existingPlan:plan||null})}
                          style={{borderBottom:"1px solid #f1f5f9",cursor:"pointer",
                            background:rowBg,opacity:isFuture&&!hasAnything?0.4:1,
                            outline:isToday?"2px solid "+color:"none",outlineOffset:"-1px"}}>
                          <td style={{padding:"4px 3px",textAlign:"center",fontWeight:isToday?800:400,color:isToday?color:"#475569",borderRight:"1px solid #e2e8f0"}}>{dayNum}</td>
                          <td style={{padding:"4px 3px",textAlign:"center",color:"#94a3b8",fontSize:9,borderRight:"1px solid #e2e8f0"}}>{dayLabel}</td>
                          <td style={{padding:"4px 3px",textAlign:"center",borderRight:"1px solid #e2e8f0"}}>
                            {isClassDay?<span style={{fontSize:9,fontWeight:800,color,background:color+"18",borderRadius:4,padding:"1px 4px"}}>C</span>
                              :hasAnything?<span style={{fontSize:9,color:"#64748b",background:"#f1f5f9",borderRadius:4,padding:"1px 4px",fontWeight:700}}>H</span>:null}
                          </td>
                          <td style={{padding:"4px 3px",textAlign:"center",fontWeight:700,color:done>0?color:plannedCount?"#94a3b8":"#e2e8f0",borderRight:"1px solid #e2e8f0"}}>{hasAnything?fromLevel:""}</td>
                          <td style={{padding:"4px 3px",textAlign:"center",fontWeight:700,color:done>0?"#1e293b":plannedCount?"#94a3b8":"#e2e8f0",borderRight:"1px solid #e2e8f0"}}>{hasAnything?fromWs:""}</td>
                          <td style={{padding:"4px 3px",textAlign:"center",color:"#64748b",borderRight:"1px solid #e2e8f0"}}>{timePerWS?`${timePerWS}m`:""}</td>
                          {Array.from({length:MAX_SCORE_COLS},(_,i)=>{
                            const sc = scores[i], isCircled = circled[i]
                            const hasDone = i<done, isPlanned = !hasDone&&i<plannedCount
                            const wsItem = wsItems[i]
                            return (
                              <td key={i} style={{padding:"2px 1px",textAlign:"center",borderRight:i<MAX_SCORE_COLS-1?"1px solid #f1f5f9":"none"}}>
                                {hasDone?(
                                  <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",fontSize:10,fontWeight:800,
                                    border:isCircled?"2.5px solid #16a34a":"1.5px solid #e2e8f0",
                                    background:isCircled?"#dcfce7":sc<100?"#fef9c3":"white",
                                    color:isCircled?"#16a34a":sc<100?"#d97706":"#374151"}}>{sc!=null?sc:""}</span>
                                ):isPlanned?(
                                  <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",fontSize:8,border:"1.5px dashed #cbd5e1",color:"#94a3b8"}}>{wsItem?wsItem.wsNum:""}</span>
                                ):null}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:"#f8fafc",borderTop:"1.5px solid #e2e8f0"}}>
                      <td colSpan={6} style={{padding:"4px 8px",fontSize:10,color:"#64748b",fontWeight:700}}>
                        {Object.values(plans).filter((p:any)=>p.student_id===s.id&&p.subject===sub&&p.plan_date?.startsWith(monthStr)).length} planned days
                      </td>
                      <td colSpan={MAX_SCORE_COLS} style={{padding:"4px 8px",fontSize:10,fontWeight:700,color,textAlign:"right"}}>Current: {level}{ws}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}
      {dayPlanModal&&(
        <DayPlanModal
          student={dayPlanModal.student} dateStr={dayPlanModal.dateStr}
          subject={dayPlanModal.subject} existingPlan={dayPlanModal.existingPlan}
          plans={plans}
          onSave={async (row:any)=>{ await onSavePlan([row]); setDayPlanModal(null); }}
          onDelete={async (p:any)=>{ await onDeletePlan(p); setDayPlanModal(null); }}
          onClose={()=>setDayPlanModal(null)}
        />
      )}
    </div>
  )
}

function DayTableView({students,classStudents,todayDay,getSession,onOpen,plans={},selectedDate,kiosk={}}) {
  if (students.length===0) return (
    <div style={{textAlign:"center",padding:32,color:"#94a3b8"}}>
      <div style={{fontSize:40}}>📭</div>
      <div style={{fontWeight:700,marginTop:8,fontSize:14}}>No students scheduled for {todayDay}</div>
    </div>
  );
  return (
    <div style={{ background:"white", borderRadius:12, overflow:"auto", boxShadow:"0 1px 3px rgba(0,0,0,0.07)" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead>
          <tr style={{ background:"#1e3a8a", color:"white" }}>
            <th style={{ padding:"8px 10px", textAlign:"left", position:"sticky", left:0, background:"#1e3a8a" }}>Student</th>
            <th style={{ padding:"8px 10px", textAlign:"left" }}>📐 Math Level</th>
            <th style={{ padding:"8px 10px", textAlign:"left" }}>📖 Reading Level</th>
            <th style={{ padding:"8px 10px", textAlign:"center" }}>Status</th>
            <th style={{ padding:"8px 10px", textAlign:"center" }}>💰</th>
          </tr>
        </thead>
        <tbody>
          {students.map(s=>{
            const sess=getSession(s.id);
            const isClass=classStudents.includes(s);
            const mathToday = s.mathEnabled && s.mathScheduleDays.includes(todayDay);
            const readToday = s.readingEnabled && s.readingScheduleDays.includes(todayDay);
            const mDone=sess.math?.done||0, rDone=sess.reading?.done||0;
            const money=sess.kumonMoney ?? calcTaskMoney(sess.moneyTasks);
            const mPlan = plans[planKey(s.id,"math",selectedDate)];
            const rPlan = plans[planKey(s.id,"reading",selectedDate)];
            const mPlanned = mPlan ? `${mPlan.level}${mPlan.start_ws}–${Math.min(200,mPlan.start_ws+mPlan.ws_count-1)}` : (mathToday? s.mathClassWS : s.mathHomeworkWS);
            const rPlanned = rPlan ? `${rPlan.level}${rPlan.start_ws}–${Math.min(200,rPlan.start_ws+rPlan.ws_count-1)}` : (readToday? s.readingClassWS : s.readingHomeworkWS);
            return (
              <tr key={s.id} onClick={()=>onOpen(s.id)} style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer", background:sess.present?(mDone+rDone>0?"#f0fdf4":"#fffbeb"):"white" }}>
                <td style={{ padding:"8px 10px", fontWeight:700, color:"#1e293b", position:"sticky", left:0, background:"inherit", whiteSpace:"nowrap" }}>
                  {s.name}
                  {!isClass && <span style={{ marginLeft:5, fontSize:9, color:"#16a34a", background:"#f0fdf4", borderRadius:8, padding:"1px 5px" }}>HW</span>}
                </td>
                <td style={{ padding:"8px 10px", color:"#3b82f6", fontWeight:600 }}>
                  {s.mathEnabled ? `${s.mathLevel}${s.mathWorksheet}${mDone>0?` → ${wsRange(sess.math.fromLevel||s.mathLevel,sess.math.fromWorksheet||s.mathWorksheet,mDone,"math").split("→")[1]}`:""} ${mPlanned!=null?`(plan ${mPlanned})`:""}` : "—"}
                </td>
                <td style={{ padding:"8px 10px", color:"#ec4899", fontWeight:600 }}>
                  {s.readingEnabled ? `${s.readingLevel}${s.readingWorksheet}${rDone>0?` → ${wsRange(sess.reading.fromLevel||s.readingLevel,sess.reading.fromWorksheet||s.readingWorksheet,rDone,"reading").split("→")[1]}`:""} ${rPlanned!=null?`(plan ${rPlanned})`:""}` : "—"}
                </td>
                <td style={{ padding:"8px 10px", textAlign:"center" }}>
                  {(() => {
                    const ks = kiosk[String(s.kumonStudentId)];
                    if (!sess.hasOwnProperty("present")) return ks
                      ? (ks.checkedOut ? <span style={{color:"#64748b",fontWeight:700,fontSize:10}}>🔵 Left</span> : <span style={{color:"#15803d",fontWeight:700,fontSize:10}}>🟢 In</span>)
                      : <span style={{color:"#cbd5e1"}}>—</span>;
                    if (!sess.present) return <span style={{color:"#dc2626",fontWeight:700}}>Absent</span>;
                    const sctChecks = [];
                    if (mDone>0 && sess.math?.timeMinutes) sctChecks.push(sctStatus("math", sess.math.fromLevel||s.mathLevel, sess.math.fromWorksheet||s.mathWorksheet, parseFloat(sess.math.timeMinutes), mDone));
                    if (rDone>0 && sess.reading?.timeMinutes) sctChecks.push(sctStatus("reading", sess.reading.fromLevel||s.readingLevel, sess.reading.fromWorksheet||s.readingWorksheet, parseFloat(sess.reading.timeMinutes), rDone));
                    const valid = sctChecks.filter(Boolean);
                    const sctIcon = !valid.length ? "" : valid.every(c=>c.met) ? " ⏱️✅" : " ⏱️🔴";
                    return <span style={{color:"#16a34a",fontWeight:700}} title={valid.length?(valid.every(c=>c.met)?"Within SCT":"Over SCT"):""}>✓ {mDone+rDone}WS{sctIcon}</span>;
                  })()}
                </td>
                <td style={{ padding:"8px 10px", textAlign:"center", fontWeight:800, color:"#7c3aed" }}>{money>0?`$${money}`:"—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StudentCard({student,session,todayDay,onOpen,isClassDay,goals={},plan={},kioskStatus}) {
  const mDone=session.math?.done||0, rDone=session.reading?.done||0, total=mDone+rDone;
  const isPresent=session.present, isTouched=session.hasOwnProperty("present");
  const money=session.kumonMoney ?? calcTaskMoney(session.moneyTasks);
  const mAvg=avgScore(session.math?.scores), rAvg=avgScore(session.reading?.scores);
  const dot = !isTouched?"#cbd5e1":!isPresent?"#f87171":total>0?"#34d399":"#fbbf24";

  const mathToday = student.mathEnabled && student.mathScheduleDays.includes(todayDay);
  const readToday = student.readingEnabled && student.readingScheduleDays.includes(todayDay);

  return (
    <div onClick={onOpen} style={{background:"white",borderRadius:12,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px rgba(0,0,0,0.08)",border:isClassDay?"2px solid transparent":"1.5px dashed #e2e8f0",position:"relative",overflow:"hidden",opacity:isClassDay?1:0.85}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:4,background:sColor(student.id),borderRadius:"12px 0 0 12px"}}/>
      <div style={{width:42,height:42,borderRadius:"50%",background:sColor(student.id),color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{initials(student.name)}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>{student.name}</div>
        <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{student.grade}
          {kioskStatus&&(kioskStatus.checkedOut
            ? <span style={{marginLeft:6,fontSize:9,fontWeight:800,color:"#64748b",background:"#f1f5f9",borderRadius:8,padding:"1px 7px"}}>🔵 Left · {kioskStatus.minutes}min</span>
            : kioskStatus.minutes > ((student.mathEnabled&&student.readingEnabled)?90:45)
              ? <span style={{marginLeft:6,fontSize:9,fontWeight:800,color:"#dc2626",background:"#fef2f2",borderRadius:8,padding:"1px 7px"}}>⏰ {kioskStatus.minutes}min — over time!</span>
              : <span style={{marginLeft:6,fontSize:9,fontWeight:800,color:"#15803d",background:"#f0fdf4",borderRadius:8,padding:"1px 7px"}}>🟢 In center · {kioskStatus.minutes}min</span>)}
        </div>
        <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
          {student.mathEnabled&&<LevelBadge subject={mathToday?"Math":"Math (HW)"} level={student.mathLevel} worksheet={student.mathWorksheet} color="#3b82f6"/>}
          {student.readingEnabled&&<LevelBadge subject={readToday?"Read":"Read (HW)"} level={student.readingLevel} worksheet={student.readingWorksheet} color="#ec4899"/>}
        </div>
        {(plan.math||plan.reading)&&<div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
          {plan.math&&<Tag c="#3b82f6" bg="#eff6ff">📅 Plan {plan.math.level}{plan.math.start_ws}–{Math.min(200,plan.math.start_ws+plan.math.ws_count-1)}</Tag>}
          {plan.reading&&<Tag c="#ec4899" bg="#fdf2f8">📅 Plan {plan.reading.level}{plan.reading.start_ws}–{Math.min(200,plan.reading.start_ws+plan.reading.ws_count-1)}</Tag>}
        </div>}
        <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
          {student.mathEnabled&&<GoalChip goal={goals[student.id+':math']} level={student.mathLevel} worksheet={student.mathWorksheet} subject="math" color="#3b82f6"/>}
          {student.readingEnabled&&<GoalChip goal={goals[student.id+':reading']} level={student.readingLevel} worksheet={student.readingWorksheet} subject="reading" color="#ec4899"/>}
        </div>
        {total>0&&<div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
          {mDone>0&&mAvg!=null&&<Tag c="#3b82f6" bg="#eff6ff">📐 {mDone}WS · {mAvg}%</Tag>}
          {rDone>0&&rAvg!=null&&<Tag c="#ec4899" bg="#fdf2f8">📖 {rDone}WS · {rAvg}%</Tag>}
          {money>0&&<Tag c="#7c3aed" bg="#faf5ff">💰 ${money}</Tag>}
        </div>}
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:dot,marginLeft:"auto",marginBottom:4}}/>
        <div style={{fontSize:10,color:"#94a3b8",whiteSpace:"nowrap"}}>{!isTouched?"Tap to mark":!isPresent?"Absent":total>0?`${total} WS`:"In progress"}</div>
        <div style={{color:"#cbd5e1",fontSize:20,marginTop:2}}>›</div>
      </div>
    </div>
  );
}

// ─── Session Modal ─────────────────────────────────────────────
function SessionModal({student,session:s,keywords,centerName,date,todayDay,goals={},plan={},kioskStatus,onShiftDate,onUpdate,onClose,onCancel}) {
  const [showMsg,setShowMsg]=useState(false),[copied,setCopied]=useState(false);
  useEffect(()=>{
    if(!s.hasOwnProperty("present")) onUpdate({
      present:true,
      math:{done:0,fromLevel:plan.math?.level||student.mathLevel,fromWorksheet:plan.math?.start_ws||student.mathWorksheet,scores:[],circled:[],corrections:"none",timeMinutes:""},
      reading:{done:0,fromLevel:plan.reading?.level||student.readingLevel,fromWorksheet:plan.reading?.start_ws||student.readingWorksheet,scores:[],circled:[],corrections:"none",timeMinutes:""},
    });
  },[date]);

  const present=s.present??true;
  const m=s.math||{done:0,scores:[],corrections:"none"};
  const r=s.reading||{done:0,scores:[],corrections:"none"};
  const totalDone=(m.done||0)+(r.done||0);
  const moneyTasks = s.moneyTasks || {};
  const autoMoney = calcTaskMoney(moneyTasks);
  const money=s.kumonMoney!==undefined&&s.kumonMoney!==null?s.kumonMoney:autoMoney;
  const message=generateMessage(student,{...s,math:m,reading:r,kumonMoney:money},centerName,date);
  const copyMsg=async()=>{ try{await navigator.clipboard.writeText(message);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{} };

  const mathToday = student.mathEnabled && student.mathScheduleDays.includes(todayDay);
  const readToday = student.readingEnabled && student.readingScheduleDays.includes(todayDay);

  const updMath=u=>onUpdate({math:{...m,fromLevel:m.fromLevel||student.mathLevel,fromWorksheet:m.fromWorksheet||student.mathWorksheet,...u}});
  const updRead=u=>onUpdate({reading:{...r,fromLevel:r.fromLevel||student.readingLevel,fromWorksheet:r.fromWorksheet||student.readingWorksheet,...u}});

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{width:"100%",maxWidth:700,margin:"0 auto",background:"white",borderRadius:"20px 20px 0 0",maxHeight:"93vh",overflowY:"auto",paddingBottom:28}}>
        <div style={{padding:"12px 16px 0",position:"sticky",top:0,background:"white",zIndex:10,borderRadius:"20px 20px 0 0",borderBottom:"1px solid #f1f5f9"}}>
          <div style={{width:40,height:4,background:"#e2e8f0",borderRadius:2,margin:"0 auto 12px"}}/>
          <div style={{display:"flex",alignItems:"center",gap:12,paddingBottom:12}}>
            <div style={{width:46,height:46,borderRadius:"50%",background:sColor(student.id),color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,flexShrink:0}}>{initials(student.name)}</div>
            <div>
              <div style={{fontWeight:800,fontSize:17,color:"#1e293b"}}>{student.name}</div>
              <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                {student.mathEnabled&&<LevelBadge subject="Math" level={student.mathLevel} worksheet={student.mathWorksheet} color="#3b82f6"/>}
                {student.readingEnabled&&<LevelBadge subject="Read" level={student.readingLevel} worksheet={student.readingWorksheet} color="#ec4899"/>}
                <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                  <button onClick={()=>onShiftDate&&onShiftDate(-1)} style={{border:"none",background:"#f1f5f9",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:12,fontWeight:800,color:"#475569"}}>‹</button>
                  <span style={{fontSize:11,color:"#475569",fontWeight:700,whiteSpace:"nowrap"}}>{new Date(date+"T12:00:00").toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"})}</span>
                  <button onClick={()=>onShiftDate&&onShiftDate(1)} style={{border:"none",background:"#f1f5f9",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:12,fontWeight:800,color:"#475569"}}>›</button>
                </span>
              </div>
            </div>
            <button onClick={onCancel} style={{marginLeft:"auto",border:"none",background:"#f1f5f9",borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        </div>

        <div style={{padding:"14px 16px 0"}}>
          {kioskStatus&&<div style={{display:"flex",alignItems:"center",gap:8,background:kioskStatus.checkedOut?"#f8fafc":"#f0fdf4",border:`1.5px solid ${kioskStatus.checkedOut?"#e2e8f0":"#86efac"}`,borderRadius:10,padding:"8px 12px",marginBottom:12,fontSize:12,fontWeight:700,color:kioskStatus.checkedOut?"#475569":"#15803d"}}>
            {kioskStatus.checkedOut?"🔵":"🟢"} Kiosk: checked in {new Date(kioskStatus.checkedIn).toLocaleTimeString("en-CA",{hour:"numeric",minute:"2-digit"})}
            {kioskStatus.checkedOut?` → out ${new Date(kioskStatus.checkedOut).toLocaleTimeString("en-CA",{hour:"numeric",minute:"2-digit"})}`:""} · {kioskStatus.minutes} min
          </div>}
          <SectionLabel label="Attendance"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            {[{v:true,label:"✓  Present",bg:"#f0fdf4",border:"#86efac",c:"#16a34a"},{v:false,label:"✗  Absent",bg:"#fef2f2",border:"#fca5a5",c:"#dc2626"}].map(opt=>(
              <button key={String(opt.v)} onClick={()=>onUpdate({present:opt.v})} style={{padding:"13px",border:`2px solid ${present===opt.v?opt.border:"#e2e8f0"}`,background:present===opt.v?opt.bg:"white",color:present===opt.v?opt.c:"#94a3b8",borderRadius:10,fontWeight:700,fontSize:16,cursor:"pointer"}}>{opt.label}</button>
            ))}
          </div>

          {present&&<>
            {student.mathEnabled&&<SubjectSection subject="Math" emoji="📐" color="#3b82f6" level={plan.math?.level||student.mathLevel} worksheet={plan.math?.start_ws||student.mathWorksheet} data={m} onUpdate={updMath} dayType={mathToday?"Class day":"Homework day"} plannedWS={plan.math?plan.math.ws_count:(mathToday?student.mathClassWS:student.mathHomeworkWS)} planLabel={plan.math?`📅 ${plan.math.level}${plan.math.start_ws}–${Math.min(200,plan.math.start_ws+plan.math.ws_count-1)}`:null}/>}
            {student.readingEnabled&&<SubjectSection subject="Reading" emoji="📖" color="#ec4899" level={plan.reading?.level||student.readingLevel} worksheet={plan.reading?.start_ws||student.readingWorksheet} data={r} onUpdate={updRead} dayType={readToday?"Class day":"Homework day"} plannedWS={plan.reading?plan.reading.ws_count:(readToday?student.readingClassWS:student.readingHomeworkWS)} planLabel={plan.reading?`📅 ${plan.reading.level}${plan.reading.start_ws}–${Math.min(200,plan.reading.start_ws+plan.reading.ws_count-1)}`:null}/>}

            {(() => {
              const subs = [];
              if (student.mathEnabled && (m.done||0)>0) subs.push(m);
              if (student.readingEnabled && (r.done||0)>0) subs.push(r);
              if (!subs.length || moneyTasks.sameDayCorrections) return null;
              const allCircled = subs.every(x => (x.circled||[]).length>=(x.done||0) && (x.circled||[]).slice(0,x.done).every(Boolean));
              if (!allCircled) return null;
              return (
                <div style={{display:"flex",alignItems:"center",gap:10,background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"9px 12px",marginBottom:12}}>
                  <span style={{flex:1,fontSize:12,color:"#1d4ed8",fontWeight:700}}>⭕ All corrections circled — done same day!</span>
                  <button onClick={()=>onUpdate({moneyTasks:{...moneyTasks,sameDayCorrections:true},kumonMoney:undefined})} style={{border:"none",background:"#2563eb",color:"white",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+$5 Same-day</button>
                </div>
              );
            })()}
            {(() => {
              const checks = [];
              if (student.mathEnabled && (m.done||0)>0 && m.timeMinutes) checks.push(sctStatus("math", m.fromLevel||student.mathLevel, m.fromWorksheet||student.mathWorksheet, parseFloat(m.timeMinutes), m.done));
              if (student.readingEnabled && (r.done||0)>0 && r.timeMinutes) checks.push(sctStatus("reading", r.fromLevel||student.readingLevel, r.fromWorksheet||student.readingWorksheet, parseFloat(r.timeMinutes), r.done));
              const valid = checks.filter(Boolean);
              if (!valid.length || moneyTasks.sct || !valid.every(c=>c.met)) return null;
              return (
                <div style={{display:"flex",alignItems:"center",gap:10,background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:10,padding:"9px 12px",marginBottom:12}}>
                  <span style={{flex:1,fontSize:12,color:"#15803d",fontWeight:700}}>⏱️ All worksheets within SCT!</span>
                  <button onClick={()=>onUpdate({moneyTasks:{...moneyTasks,sct:true},kumonMoney:undefined})} style={{border:"none",background:"#16a34a",color:"white",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+$10 SCT</button>
                </div>
              );
            })()}
            {(() => {
              const plannedM = student.mathEnabled ? (plan.math?plan.math.ws_count:(mathToday?student.mathClassWS:student.mathHomeworkWS)) || 0 : 0;
              const plannedR = student.readingEnabled ? (plan.reading?plan.reading.ws_count:(readToday?student.readingClassWS:student.readingHomeworkWS)) || 0 : 0;
              const extraCount = Math.max(0,(m.done||0)-plannedM) + Math.max(0,(r.done||0)-plannedR);
              if (extraCount<=0 || moneyTasks.extraWork) return null;
              return (
                <div style={{display:"flex",alignItems:"center",gap:10,background:"#fff7ed",border:"1.5px solid #fdba74",borderRadius:10,padding:"9px 12px",marginBottom:12}}>
                  <span style={{flex:1,fontSize:12,color:"#c2410c",fontWeight:700}}>💪 {extraCount} WS beyond plan — extra work!</span>
                  <button onClick={()=>onUpdate({moneyTasks:{...moneyTasks,extraWork:true},kumonMoney:undefined})} style={{border:"none",background:"#ea580c",color:"white",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+$5 Extra Work</button>
                </div>
              );
            })()}
            {(() => {
              const mg = student.mathEnabled && goals[student.id+':math'];
              const rg = student.readingEnabled && goals[student.id+':reading'];
              if (!mg && !rg) return null;
              const chip = (goal, level, ws, done, subject, color, label) => {
                if (!goal) return null;
                const after = advancePos(level, ws, done||0, subject);
                const g = goalStats(goal, after.level, after.worksheet, subject);
                if (!g) return null;
                return <span key={subject} style={{fontSize:11,fontWeight:700,color:g.reached?"#16a34a":color,background:(g.reached?"#16a34a":color)+"14",borderRadius:8,padding:"4px 9px"}}>{label} 🎯 {g.reached?"Goal reached! 🎉":`${g.remaining} WS to ${goal.target_level}${goal.target_worksheet}${g.dl!=null?` · ${g.dl}d`:""}`}</span>;
              };
              return (
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {chip(mg, student.mathLevel, student.mathWorksheet, m.done, "math", "#3b82f6", "📐")}
                  {chip(rg, student.readingLevel, student.readingWorksheet, r.done, "reading", "#ec4899", "📖")}
                </div>
              );
            })()}
            <SectionLabel label="Kumon Money 💰" sub={`Total: $${money}${s.kumonMoney!==undefined&&s.kumonMoney!==autoMoney?" (manual)":""}`}/>
            <div style={{ background:"#faf5ff", borderRadius:10, padding:"10px 12px", marginBottom:16 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:10 }}>
                {MONEY_TASKS.map(t=>{
                  const checked = !!moneyTasks[t.key];
                  return (
                    <button key={t.key} onClick={()=>onUpdate({moneyTasks:{...moneyTasks,[t.key]:!checked}, kumonMoney:undefined})}
                      style={{ display:"flex", alignItems:"center", gap:10, border:`1.5px solid ${checked?"#a78bfa":"#e2e8f0"}`, background:checked?"#ede9fe":"white", borderRadius:8, padding:"8px 10px", cursor:"pointer", textAlign:"left" }}>
                      <span style={{ fontSize:16 }}>{checked?"☑️":"⬜"}</span>
                      <span style={{ flex:1, fontSize:12, color:checked?"#5b21b6":"#475569", fontWeight:checked?700:500 }}>{t.emoji} {t.label}</span>
                      <span style={{ fontSize:13, fontWeight:800, color:checked?"#7c3aed":"#94a3b8" }}>+${t.amount}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, borderTop:"1.5px solid #e9d5ff", paddingTop:10 }}>
                <span style={{ fontSize:12, color:"#7c3aed", fontWeight:700, flex:1 }}>Total Kumon Money</span>
                <CounterBtn onClick={()=>onUpdate({kumonMoney:Math.max(0,money-1)})} size={30}>−</CounterBtn>
                <span style={{ minWidth:50, textAlign:"center", fontWeight:900, fontSize:22, color:"#7c3aed" }}>${money}</span>
                <CounterBtn onClick={()=>onUpdate({kumonMoney:money+1})} size={30}>+</CounterBtn>
                {s.kumonMoney!==undefined&&s.kumonMoney!==autoMoney&&<button onClick={()=>onUpdate({kumonMoney:undefined})} style={{ border:"none", background:"#ede9fe", color:"#7c3aed", borderRadius:6, padding:"5px 9px", fontSize:10, cursor:"pointer", fontWeight:700 }}>Reset</button>}
              </div>
            </div>

            <SectionLabel label="Instructor Comments" sub="Tap to select"/>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
              {keywords.map((kw,i)=>{const sel=(s.selectedKeywords||[]).includes(kw);return<button key={i} onClick={()=>{const next=sel?(s.selectedKeywords||[]).filter(k=>k!==kw):[...(s.selectedKeywords||[]),kw];onUpdate({selectedKeywords:next});}} style={{padding:"6px 11px",border:`1.5px solid ${sel?"#3b82f6":"#e2e8f0"}`,background:sel?"#eff6ff":"white",color:sel?"#1d4ed8":"#64748b",borderRadius:20,fontSize:12,cursor:"pointer",fontWeight:sel?700:400}}>{kw}</button>;})}
            </div>
            <textarea value={s.customComment||""} onChange={e=>onUpdate({customComment:e.target.value})} placeholder="Custom note (optional)..." style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 12px",fontSize:13,resize:"vertical",minHeight:50,boxSizing:"border-box",fontFamily:"inherit",marginBottom:14,outline:"none"}}/>

            <div style={{marginBottom:14}}>
              <button onClick={()=>setShowMsg(p=>!p)} style={{width:"100%",border:"1.5px solid #e2e8f0",background:"#f8fafc",borderRadius:10,padding:"11px 14px",fontSize:13,color:"#475569",cursor:"pointer",fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>📨 Parent Message Preview</span><span style={{color:"#94a3b8"}}>{showMsg?"▲":"▼"}</span>
              </button>
              {showMsg&&<div style={{border:"1.5px solid #e2e8f0",borderTop:"none",borderRadius:"0 0 10px 10px",padding:14,background:"white"}}><pre style={{fontSize:12,color:"#1e293b",whiteSpace:"pre-wrap",fontFamily:"inherit",margin:0,lineHeight:1.7}}>{message}</pre></div>}
            </div>

            {/* Send via channel buttons */}
            <SectionLabel label="Send To Parent" sub={student.parentContact||student.parentEmail?"":"Add phone/email in Edit Student"}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}}>
              <a href={student.parentContact?`https://wa.me/${student.parentContact.replace(/[^0-9]/g,"")}?text=${encodeURIComponent(message||"")}`:undefined}
                target="_blank" rel="noreferrer"
                onClick={e=>{ if(!student.parentContact) e.preventDefault(); }}
                style={{ textAlign:"center", padding:"10px 4px", borderRadius:8, fontWeight:700, fontSize:12, textDecoration:"none", border:"1.5px solid #25D366", color:student.parentContact?"#16a34a":"#cbd5e1", background:student.parentContact?"#f0fdf4":"#f8fafc", cursor:student.parentContact?"pointer":"default" }}>
                💬 WhatsApp
              </a>
              <a href={student.parentContact?`sms:${student.parentContact.replace(/[^0-9+]/g,"")}?body=${encodeURIComponent(message||"")}`:undefined}
                onClick={e=>{ if(!student.parentContact) e.preventDefault(); }}
                style={{ textAlign:"center", padding:"10px 4px", borderRadius:8, fontWeight:700, fontSize:12, textDecoration:"none", border:"1.5px solid #3b82f6", color:student.parentContact?"#1d4ed8":"#cbd5e1", background:student.parentContact?"#eff6ff":"#f8fafc", cursor:student.parentContact?"pointer":"default" }}>
                📱 SMS
              </a>
              <a href={student.parentEmail?`mailto:${student.parentEmail}?subject=${encodeURIComponent(`${student.name}'s Kumon Update`)}&body=${encodeURIComponent(message||"")}`:undefined}
                onClick={e=>{ if(!student.parentEmail) e.preventDefault(); }}
                style={{ textAlign:"center", padding:"10px 4px", borderRadius:8, fontWeight:700, fontSize:12, textDecoration:"none", border:"1.5px solid #f59e0b", color:student.parentEmail?"#b45309":"#cbd5e1", background:student.parentEmail?"#fffbeb":"#f8fafc", cursor:student.parentEmail?"pointer":"default" }}>
                ✉️ Email
              </a>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <button onClick={copyMsg} style={{padding:"14px",border:`2px solid ${copied?"#86efac":"#3b82f6"}`,background:copied?"#f0fdf4":"white",color:copied?"#16a34a":"#3b82f6",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer"}}>{copied?"✓ Copied!":"📋 Copy Message"}</button>
              <button onClick={()=>onClose(true)} style={{padding:"14px",border:"none",background:"linear-gradient(135deg,#1e40af,#5b21b6)",color:"white",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer"}}>✅ Save & Update Level</button>
            </div>
            <button onClick={()=>onClose(false)} style={{width:"100%",padding:"11px",border:"1.5px solid #e2e8f0",background:"white",color:"#64748b",borderRadius:10,fontWeight:600,fontSize:13,cursor:"pointer"}}>Save without updating level</button>
          </>}

          {!present&&<div style={{textAlign:"center",padding:28,color:"#94a3b8"}}><div style={{fontSize:44}}>🏠</div><div style={{fontWeight:700,marginTop:10,fontSize:15}}>Marked as Absent</div><button onClick={()=>onClose(false)} style={{marginTop:18,padding:"12px 36px",border:"none",background:"#1e40af",color:"white",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:14}}>Save & Close</button></div>}
        </div>
      </div>
    </div>
  );
}

function SubjectSection({subject,emoji,color,level,worksheet,data,onUpdate,dayType,plannedWS,planLabel}) {
  const subjectKey = subject.toLowerCase();
  const done=data.done||0,fromLevel=data.fromLevel||level,fromWs=data.fromWorksheet||worksheet,scores=data.scores||[],circled=data.circled||[],corrections=data.corrections||"none",time=data.timeMinutes||"";
  const wsItems=getWsItems(fromLevel,fromWs,done,subjectKey);
  const setDone=nd=>{const cur=data.scores||[];const ns=nd>cur.length?[...cur,...Array(nd-cur.length).fill(100)]:cur.slice(0,nd);const nc=(data.circled||[]).slice(0,nd);onUpdate({done:nd,scores:ns,circled:nc});};
  const setScore=(i,v)=>{const sc=[...scores];sc[i]=v;onUpdate({scores:sc});};
  const toggleCircle=i=>{const c=[...(data.circled||[])];c[i]=!c[i];onUpdate({circled:c});};
  const fillPlanned=()=>{ if(plannedWS) setDone(plannedWS); };
  return (
    <div style={{background:"#f8fafc",borderRadius:12,padding:"12px 14px",marginBottom:14,border:`1.5px solid ${color}22`}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{fontSize:16}}>{emoji}</span><span style={{fontWeight:800,fontSize:14,color}}>{subject}</span>
        <span style={{fontSize:11,color:"#94a3b8",background:"white",border:`1px solid ${color}33`,borderRadius:12,padding:"1px 7px"}}>{fromLevel}{fromWs}{done>0&&wsItems.length?` → ${wsItems[wsItems.length-1].level}${wsItems[wsItems.length-1].wsNum}`:""}</span>
        {dayType && <span style={{fontSize:10,color:dayType==="Class day"?"#1e40af":"#16a34a",background:dayType==="Class day"?"#eff6ff":"#f0fdf4",borderRadius:10,padding:"2px 8px",fontWeight:700}}>{dayType}</span>}
        {planLabel && <span style={{fontSize:10,color:"#7c3aed",background:"#faf5ff",borderRadius:10,padding:"2px 8px",fontWeight:700}}>{planLabel}</span>}
        {planLabel && done===0 && <button onClick={fillPlanned} style={{marginLeft:"auto",border:"none",background:color,color:"white",borderRadius:8,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Fill planned ✓</button>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:done>0?12:0}}>
        <span style={{fontSize:13,color:"#64748b",fontWeight:600}}>Worksheets done {plannedWS!=null && <span style={{color:done>=plannedWS&&plannedWS>0?"#16a34a":"#94a3b8",fontWeight:700}}>(planned: {plannedWS})</span>}</span>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <CounterBtn onClick={()=>setDone(Math.max(0,done-1))}>−</CounterBtn>
          <span style={{minWidth:30,textAlign:"center",fontWeight:900,fontSize:24,color:done>0?color:"#cbd5e1"}}>{done}</span>
          <CounterBtn onClick={()=>setDone(done+1)}>+</CounterBtn>
        </div>
      </div>
      {done>0&&<>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,background:"white",borderRadius:8,padding:"8px 12px",border:"1.5px solid #e2e8f0",flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:"#64748b",fontWeight:600}}>⏱️ Time</span>
          <input type="number" inputMode="numeric" pattern="[0-9]*" value={time} onChange={e=>onUpdate({timeMinutes:e.target.value.replace(/[^0-9]/g,"")})} placeholder="0" min={0} step={1} style={{flex:1,border:"none",textAlign:"right",fontSize:15,fontWeight:700,color:"#1e293b",outline:"none",background:"transparent",maxWidth:70,minWidth:50}}/>
          <span style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>min total</span>
          <SctBadge subject={subjectKey} level={fromLevel} ws={fromWs} time={time} done={done}/>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase"}}>Scores</span>
            <div style={{display:"flex",gap:5}}>
              <button onClick={()=>onUpdate({scores:Array(done).fill(100)})} style={{border:"none",background:"#f0fdf4",color:"#16a34a",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>All 100</button>
              <button onClick={()=>onUpdate({scores:Array(done).fill(95)})} style={{border:"none",background:"#eff6ff",color:"#3b82f6",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>All 95</button>
              <button onClick={()=>onUpdate({circled:Array(done).fill(true)})} style={{border:"none",background:"#f0fdf4",color:"#16a34a",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>⭕ All</button>
            </div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {wsItems.map((item,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",boxShadow:circled[i]?"0 0 0 2.5px #16a34a":"none",borderRadius:6}}>
                <div onClick={()=>toggleCircle(i)} style={{background:circled[i]?"#16a34a":color,color:"white",fontSize:9,fontWeight:700,padding:"2px 5px",borderRadius:"5px 5px 0 0",whiteSpace:"nowrap",cursor:"pointer",alignSelf:"stretch",textAlign:"center"}} title="Tap when corrections are done (circle)">{circled[i]?"⭕ ":""}{item.level}{item.wsNum}</div>
                <div onClick={()=>setScore(i,cycleScore(scores[i]??100))} style={{border:`1.5px solid ${(scores[i]??100)<100?"#fde68a":"#e2e8f0"}`,borderTop:"none",borderRadius:"0 0 5px 5px",padding:"3px 6px",background:(scores[i]??100)<100?"#fffbeb":"white",color:(scores[i]??100)<100?"#d97706":"#1e293b",fontWeight:700,fontSize:13,minWidth:36,textAlign:"center",cursor:"pointer",alignSelf:"stretch"}}>{scores[i]??100}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",marginBottom:6}}>Corrections ♦</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {[{v:"done",l:"✅ Done",bg:"#f0fdf4",border:"#86efac",c:"#16a34a"},{v:"pending",l:"⏳ Pending",bg:"#fffbeb",border:"#fde68a",c:"#d97706"},{v:"none",l:"— N/A",bg:"white",border:"#e2e8f0",c:"#94a3b8"}].map(opt=>(
            <button key={opt.v} onClick={()=>onUpdate({corrections:opt.v})} style={{padding:"9px 4px",border:`2px solid ${corrections===opt.v?opt.border:"#e2e8f0"}`,background:corrections===opt.v?opt.bg:"white",color:corrections===opt.v?opt.c:"#94a3b8",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}>{opt.l}</button>
          ))}
        </div>
      </>}
    </div>
  );
}



// ─── Projection Modal — port of the Goal Setting & Communication Tool ──
function ProjectionModal({student,subject,onSetGoal,onClose,showToast}) {
  const isMath = subject === "math";
  const curLevel = isMath ? student.mathLevel : student.readingLevel;
  const curWs = isMath ? student.mathWorksheet : student.readingWorksheet;
  const color = isMath ? "#3b82f6" : "#ec4899";
  const settingKey = `projection_${student.id}_${subject}`;
  const [wsPerDay,setWsPerDay] = useState(5);
  const [daysPerWeek,setDaysPerWeek] = useState(7);
  const [reps,setReps] = useState({});
  const [loaded,setLoaded] = useState(false);
  useEffect(()=>{ (async()=>{
    try { const p = await fetchSetting(settingKey, null);
      if (p) { setWsPerDay(p.wsPerDay||5); setDaysPerWeek(p.daysPerWeek||7); setReps(p.reps||{}); } }
    catch(e){ console.warn(e); }
    setLoaded(true);
  })(); },[]);
  const baseGrade = parseGrade(student.grade);
  const rows = buildProjection(subject, curLevel, curWs, wsPerDay, daysPerWeek, reps, baseGrade);
  const fmtD = d => d.toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"2-digit"});
  const cycleReps = lvl => setReps(p=>({...p,[lvl]: ((p[lvl]??1) % 3) + 1 }));
  const save = async()=>{ try{ await saveSetting(settingKey,{wsPerDay,daysPerWeek,reps}); showToast("📈 Projection saved!"); }catch(e){ showToast("Save failed: "+e.message,"error"); } };
  const Counter = ({v,set,min,max,label}) => (
    <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"8px 10px"}}>
      <div style={{fontSize:10,fontWeight:700,color:"#475569",marginBottom:5}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <CounterBtn size={28} onClick={()=>set(Math.max(min,v-1))}>−</CounterBtn>
        <span style={{flex:1,textAlign:"center",fontWeight:900,fontSize:18,color:"#1e293b"}}>{v}</span>
        <CounterBtn size={28} onClick={()=>set(Math.min(max,v+1))}>+</CounterBtn>
      </div>
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500,display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:700,margin:"0 auto",background:"white",borderRadius:"20px 20px 0 0",maxHeight:"92vh",overflowY:"auto",paddingBottom:28}}>
        <div style={{padding:"12px 16px",position:"sticky",top:0,background:"white",zIndex:10,borderBottom:"1px solid #f1f5f9",borderRadius:"20px 20px 0 0"}}>
          <div style={{width:40,height:4,background:"#e2e8f0",borderRadius:2,margin:"0 auto 10px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:800,fontSize:16,color:"#1e293b"}}>📈 {isMath?"Math":"Reading"} Projection</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{student.name} · from <b style={{color}}>{curLevel}{curWs}</b>{baseGrade!=null&&<> · Grade {baseGrade}</>}</div>
            </div>
            <button onClick={onClose} style={{border:"none",background:"#f1f5f9",borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        </div>
        <div style={{padding:16}}>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <Counter v={wsPerDay} set={setWsPerDay} min={1} max={30} label="WORKSHEETS / DAY"/>
            <Counter v={daysPerWeek} set={setDaysPerWeek} min={1} max={7} label="STUDY DAYS / WEEK"/>
          </div>
          <div style={{fontSize:10,color:"#94a3b8",marginBottom:10}}>Tap a Reps value to cycle 1→2→3 (how many times the level is repeated). Tap 🎯 to set that level's completion as the goal.</div>
          {!loaded ? <div style={{textAlign:"center",padding:30,color:"#94a3b8"}}>Loading…</div> : (
          <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#1e3a8a",color:"white"}}>
                <th style={{padding:"7px 8px",textAlign:"left"}}>Level</th>
                <th style={{padding:"7px 6px"}}>WS</th>
                <th style={{padding:"7px 6px"}}>Reps</th>
                <th style={{padding:"7px 6px"}}>Days</th>
                <th style={{padding:"7px 8px",textAlign:"left"}}>Finish</th>
                <th style={{padding:"7px 6px"}}>Honor</th>
                <th style={{padding:"7px 4px"}}></th>
              </tr></thead>
              <tbody>
                {rows.map((row,idx)=>(
                  <tr key={row.level} style={{borderBottom:"1px solid #f1f5f9",background:idx===0?color+"0a":"white"}}>
                    <td style={{padding:"7px 8px",fontWeight:800,color}}>{row.level}</td>
                    <td style={{padding:"7px 6px",textAlign:"center",color:"#64748b"}}>{row.wsCount}</td>
                    <td onClick={()=>cycleReps(row.level)} style={{padding:"7px 6px",textAlign:"center",cursor:"pointer",fontWeight:800,color:row.reps>1?"#ea580c":"#94a3b8",background:row.reps>1?"#fff7ed":"transparent"}}>×{row.reps}</td>
                    <td style={{padding:"7px 6px",textAlign:"center",color:"#64748b"}} title={`${row.studyDays} study days`}>{row.cum}</td>
                    <td style={{padding:"7px 8px",fontWeight:700,color:"#1e293b",whiteSpace:"nowrap"}}>{fmtD(row.finish)} <span style={{fontSize:9,color:"#94a3b8"}}>Gr {row.grade}</span></td>
                    <td style={{padding:"7px 6px",textAlign:"center"}}>{row.milestone && <span title={`${row.milestone.label} — ${row.milestone.ahead} level(s) ahead of grade`} style={{fontSize:13}}>{row.milestone.medal}</span>}</td>
                    <td style={{padding:"7px 4px",textAlign:"center"}}>
                      <button onClick={()=>onSetGoal({
                          id:`g_${student.id}_${subject}`, student_id:student.id, subject,
                          target_level:row.level, target_worksheet:200,
                          target_date:row.finish.toISOString().split("T")[0],
                          start_level:curLevel, start_worksheet:curWs, status:'active'
                        })} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:13}} title="Set as goal">🎯</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>)}
          <div style={{display:"flex",gap:4,flexWrap:"wrap",margin:"10px 0 14px",fontSize:10,color:"#64748b"}}>
            {MILESTONE_BANDS.slice().reverse().map(b=><span key={b.label} style={{background:"#f8fafc",borderRadius:6,padding:"3px 8px"}}>{b.medal} {b.label} = {b.ahead===0?"on grade standard":`${b.ahead} ahead`}</span>)}
          </div>
          <button onClick={save} style={{width:"100%",padding:"13px",border:"none",background:"linear-gradient(135deg,#1e40af,#5b21b6)",color:"white",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer"}}>💾 Save Projection Settings</button>
        </div>
      </div>
    </div>
  );
}


// ─── Plan Tab — week/vacation worksheet planning ────────────────
function PlanTab({students,plans,onPlan,onDelete}) {
  const active = students.filter(s=>s.status!=="inactive");
  const todayStr = new Date().toISOString().split("T")[0];
  const upcoming = Object.values(plans).filter(p=>p.plan_date>=todayStr).sort((a,b)=>a.plan_date<b.plan_date?-1:1);
  const byDate = {};
  for (const p of upcoming) { (byDate[p.plan_date] = byDate[p.plan_date] || []).push(p); }
  const nameOf = id => students.find(s=>s.id===id)?.name || "?";
  return (
    <div>
      <div style={{background:"#fefce8",border:"1.5px solid #fde68a",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#92400e",marginBottom:12,lineHeight:1.6}}>
        📅 Plan worksheets before students arrive — scores and time stay blank until correction time. For vacations, plan 2–3 weeks at once and use the handover list to load the folder.
      </div>
      <SectionLabel label="Plan a student" />
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {active.map(s=>(
          <button key={s.id} onClick={()=>onPlan(s.id)} style={{display:"flex",alignItems:"center",gap:6,border:"1.5px solid #e2e8f0",background:"white",borderRadius:20,padding:"5px 12px 5px 5px",cursor:"pointer"}}>
            <span style={{width:26,height:26,borderRadius:"50%",background:sColor(s.id),color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:10}}>{initials(s.name)}</span>
            <span style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{s.name.split(" ")[0]}</span>
          </button>
        ))}
      </div>
      <SectionLabel label="Upcoming plans" sub={`${upcoming.length} entries`}/>
      {upcoming.length===0 && <div style={{textAlign:"center",padding:24,color:"#94a3b8",fontSize:13}}>Nothing planned yet — tap a student above to start.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {Object.entries(byDate).map(([date,list])=>(
          <div key={date} style={{background:"white",borderRadius:12,padding:"11px 13px",boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:7}}>
              {new Date(date+"T12:00:00").toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"})}
              {date===todayStr&&<span style={{marginLeft:6,fontSize:9,color:"#1e40af",background:"#eff6ff",borderRadius:8,padding:"1px 7px"}}>TODAY</span>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {list.map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                  <span style={{fontWeight:700,color:"#1e293b",minWidth:90,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nameOf(p.student_id)}</span>
                  <span style={{fontWeight:700,color:p.subject==="math"?"#3b82f6":"#ec4899"}}>{p.subject==="math"?"📐":"📖"} {p.level}{p.start_ws}–{Math.min(200,p.start_ws+p.ws_count-1)}</span>
                  <span style={{color:"#94a3b8",fontSize:10}}>{p.ws_count} WS{p.note?` · ${p.note}`:""}</span>
                  <button onClick={()=>onDelete(p)} style={{marginLeft:"auto",border:"none",background:"#fef2f2",color:"#dc2626",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Plan Modal — generate a run of daily worksheet plans ───────
function PlanModal({student,plans,onSave,onClose}) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [startDate,setStartDate] = useState(todayStr);
  const [days,setDays] = useState(7);
  const [note,setNote] = useState("");
  const [mathOn,setMathOn] = useState(!!student.mathEnabled);
  const [readOn,setReadOn] = useState(!!student.readingEnabled);
  const [mathPerDay,setMathPerDay] = useState(student.mathClassWS||5);
  const [readPerDay,setReadPerDay] = useState(student.readingClassWS||5);
  const [copied,setCopied] = useState(false);
  const [overrides,setOverrides] = useState({}); // { "date|subject": {level,start_ws,ws_count} }
  const [editRow,setEditRow] = useState(null);   // "date|subject" | null

  // Continue from the last existing plan if there is one after today, else current position
  const lastPlanned = (subject)=>{
    const mine = Object.values(plans).filter(p=>p.student_id===student.id&&p.subject===subject).sort((a,b)=>a.plan_date<b.plan_date?-1:1);
    const last = mine[mine.length-1];
    if (last && last.plan_date >= todayStr) {
      const after = advancePos(last.level, last.start_ws, last.ws_count, subject);
      return { level: after.level, ws: after.worksheet };
    }
    return subject==="math" ? { level: student.mathLevel, ws: student.mathWorksheet } : { level: student.readingLevel, ws: student.readingWorksheet };
  };

  const buildRows = ()=>{
    const rows = [];
    const positions = { math: lastPlanned("math"), reading: lastPlanned("reading") };
    for (let d=0; d<days; d++) {
      const dt = new Date(startDate+"T12:00:00"); dt.setDate(dt.getDate()+d);
      const dateStr = dt.toISOString().split("T")[0];
      for (const [sub,on,perDay] of [["math",mathOn,mathPerDay],["reading",readOn,readPerDay]]) {
        if (!on || !perDay) continue;
        const key = `${dateStr}|${sub}`;
        const ov = overrides[key];
        const pos = ov ? { level: ov.level, ws: ov.start_ws } : positions[sub];
        const count = ov?.ws_count ?? perDay;
        rows.push({
          id:`p_${student.id}_${sub}_${dateStr}`, student_id:student.id, subject:sub,
          plan_date:dateStr, level:pos.level, start_ws:pos.ws, ws_count:count, note:note||null,
          _key:key, _edited:!!ov,
        });
        const nxt = advancePos(pos.level, pos.ws, count, sub);
        positions[sub] = { level:nxt.level, ws:nxt.worksheet };
      }
    }
    return rows;
  };
  const preview = buildRows();
  const fmt = ds => new Date(ds+"T12:00:00").toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"});
  const handover = ()=>{
    const lines = [`${student.name} — Worksheet plan (${fmt(startDate)} → ${fmt(preview[preview.length-1]?.plan_date||startDate)})`];
    const byDate = {};
    for (const r of preview) (byDate[r.plan_date]=byDate[r.plan_date]||[]).push(r);
    for (const [d,list] of Object.entries(byDate))
      lines.push(`${fmt(d)}: ` + list.map(r=>`${r.subject==="math"?"Math":"Reading"} ${r.level}${r.start_ws}–${Math.min(200,r.start_ws+r.ws_count-1)}`).join("  ·  "));
    lines.push(`Total: ${preview.reduce((a,r)=>a+r.ws_count,0)} worksheets`);
    return lines.join("\n");
  };
  const copyHandover = async()=>{ try{ await navigator.clipboard.writeText(handover()); setCopied(true); setTimeout(()=>setCopied(false),2500);}catch{} };
  const Counter = ({v,set,min,max}) => (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <CounterBtn size={26} onClick={()=>set(Math.max(min,v-1))}>−</CounterBtn>
      <span style={{minWidth:26,textAlign:"center",fontWeight:900,fontSize:16}}>{v}</span>
      <CounterBtn size={26} onClick={()=>set(Math.min(max,v+1))}>+</CounterBtn>
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500,display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:700,margin:"0 auto",background:"white",borderRadius:"20px 20px 0 0",maxHeight:"92vh",overflowY:"auto",paddingBottom:28}}>
        <div style={{padding:"12px 16px",position:"sticky",top:0,background:"white",zIndex:10,borderBottom:"1px solid #f1f5f9",borderRadius:"20px 20px 0 0"}}>
          <div style={{width:40,height:4,background:"#e2e8f0",borderRadius:2,margin:"0 auto 10px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:800,fontSize:16,color:"#1e293b"}}>📅 Plan Worksheets — {student.name}</div>
            <button onClick={onClose} style={{border:"none",background:"#f1f5f9",borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        </div>
        <div style={{padding:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:8,marginBottom:12}}>
            <div style={{background:"#f8fafc",borderRadius:10,padding:"8px 10px"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#475569",marginBottom:5}}>START DATE</div>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{width:"100%",border:"none",background:"transparent",fontSize:14,fontWeight:700,outline:"none"}}/>
            </div>
            <div style={{background:"#f8fafc",borderRadius:10,padding:"8px 10px"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#475569",marginBottom:5}}>DAYS</div>
              <Counter v={days} set={setDays} min={1} max={28}/>
            </div>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {[7,14,21].map(n=><button key={n} onClick={()=>setDays(n)} style={{flex:1,padding:"7px",border:`1.5px solid ${days===n?"#1e40af":"#e2e8f0"}`,background:days===n?"#eff6ff":"white",color:days===n?"#1e40af":"#64748b",borderRadius:8,fontWeight:700,fontSize:11,cursor:"pointer"}}>{n===7?"1 week":n===14?"2 weeks ✈️":"3 weeks ✈️"}</button>)}
          </div>
          {[student.mathEnabled&&["Math","#3b82f6",mathOn,setMathOn,mathPerDay,setMathPerDay,lastPlanned("math")],
            student.readingEnabled&&["Reading","#ec4899",readOn,setReadOn,readPerDay,setReadPerDay,lastPlanned("reading")]]
            .filter(Boolean).map(([label,color,on,setOn,perDay,setPerDay,from])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:10,background:on?color+"0a":"#f8fafc",border:`1.5px solid ${on?color+"44":"#e2e8f0"}`,borderRadius:10,padding:"9px 12px",marginBottom:8}}>
              <button onClick={()=>setOn(!on)} style={{border:"none",background:on?color:"#e2e8f0",color:"white",borderRadius:14,padding:"4px 11px",fontWeight:700,fontSize:11,cursor:"pointer"}}>{label}</button>
              <span style={{fontSize:11,color:"#64748b"}}>from <b style={{color}}>{from.level}{from.ws}</b></span>
              {on && <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:10,color:"#64748b",fontWeight:700}}>WS/day</span>
                <Counter v={perDay} set={setPerDay} min={1} max={20}/>
              </span>}
            </div>
          ))}
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (optional) — e.g. vacation, achievement test prep" style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"9px 12px",fontSize:12,boxSizing:"border-box",outline:"none",marginBottom:12}}/>

          <SectionLabel label="Preview — tap any day to edit" sub={`${preview.length} entries · ${preview.reduce((a,r)=>a+r.ws_count,0)} WS total`}/>
          <div style={{background:"#f8fafc",borderRadius:10,padding:"9px 12px",marginBottom:14,maxHeight:230,overflowY:"auto"}}>
            {preview.map(r=>{
              const isEditing = editRow===r._key;
              const color = r.subject==="math"?"#3b82f6":"#ec4899";
              const seq = levelsFor(r.subject);
              const setOv = patch => setOverrides(p=>({...p,[r._key]:{level:r.level,start_ws:r.start_ws,ws_count:r.ws_count,...(p[r._key]||{}),...patch}}));
              return (
              <div key={r.id} style={{borderBottom:"1px solid #eef2f7"}}>
                <div onClick={()=>setEditRow(isEditing?null:r._key)} style={{display:"flex",gap:8,fontSize:12,padding:"5px 0",alignItems:"center",cursor:"pointer"}}>
                  <span style={{color:"#64748b",minWidth:86}}>{fmt(r.plan_date)}</span>
                  <span style={{fontWeight:700,color}}>{r.subject==="math"?"📐":"📖"} {r.level}{r.start_ws}–{Math.min(200,r.start_ws+r.ws_count-1)}</span>
                  <span style={{fontSize:10,color:"#94a3b8"}}>{r.ws_count} WS</span>
                  {r._edited&&<span style={{fontSize:9,color:"#ea580c",background:"#fff7ed",borderRadius:6,padding:"1px 6px",fontWeight:700}}>edited</span>}
                  <span style={{marginLeft:"auto",color:"#cbd5e1",fontSize:12}}>{isEditing?"▲":"✎"}</span>
                </div>
                {isEditing&&(
                  <div style={{display:"flex",gap:6,alignItems:"center",padding:"4px 0 8px 86px",flexWrap:"wrap"}}>
                    <select value={r.level} onChange={e=>setOv({level:e.target.value,start_ws:1})} style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 6px",fontSize:12,background:"white"}}>{seq.map(l=><option key={l}>{l}</option>)}</select>
                    <span style={{fontSize:10,color:"#64748b",fontWeight:700}}>WS</span>
                    <input type="number" inputMode="numeric" min={1} max={200} value={r.start_ws} onChange={e=>setOv({start_ws:Math.max(1,Math.min(200,parseInt(e.target.value)||1))})} style={{width:56,border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 6px",fontSize:12,outline:"none"}}/>
                    <span style={{fontSize:10,color:"#64748b",fontWeight:700}}>Count</span>
                    <input type="number" inputMode="numeric" min={1} max={30} value={r.ws_count} onChange={e=>setOv({ws_count:Math.max(1,Math.min(30,parseInt(e.target.value)||1))})} style={{width:48,border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 6px",fontSize:12,outline:"none"}}/>
                    {r._edited&&<button onClick={e=>{e.stopPropagation();setOverrides(p=>{const n={...p};delete n[r._key];return n;});}} style={{border:"none",background:"#f1f5f9",color:"#64748b",borderRadius:7,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Reset</button>}
                  </div>
                )}
              </div>
            );})}
            {preview.length===0&&<div style={{color:"#94a3b8",fontSize:12}}>Enable a subject to preview.</div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={copyHandover} style={{padding:"13px",border:`2px solid ${copied?"#86efac":"#e2e8f0"}`,background:copied?"#f0fdf4":"white",color:copied?"#16a34a":"#475569",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer"}}>{copied?"✓ Copied!":"📄 Copy Handover List"}</button>
            <button onClick={()=>preview.length&&onSave(preview.map(({_key,_edited,...row})=>row))} style={{padding:"13px",border:"none",background:preview.length?"linear-gradient(135deg,#1e40af,#5b21b6)":"#e2e8f0",color:preview.length?"white":"#94a3b8",borderRadius:10,fontWeight:700,fontSize:14,cursor:preview.length?"pointer":"default"}}>💾 Save Plan</button>
          </div>
          <div style={{fontSize:10,color:"#94a3b8",marginTop:10,lineHeight:1.6}}>Saving overwrites any existing plan for the same student + subject + date. Sequences continue automatically from the latest saved plan — and editing a day reflows every day after it (repeat a level, jump ahead, or lighten a day, and the rest adjusts).</div>
        </div>
      </div>
    </div>
  );
}

// ─── Goals Tab — set targets & track daily distance ─────────────
function GoalsTab({students,goals,onEdit,onRemove,onProject}) {
  const active = students.filter(s=>s.status!=="inactive");
  return (
    <div>
      <div style={{background:"#fefce8",border:"1.5px solid #fde68a",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#92400e",marginBottom:12,lineHeight:1.6}}>
        🎯 Set a target level + worksheet + date per subject. Progress updates automatically as students advance — each card shows worksheets left, days left, and the pace needed.
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {active.map(s=>(
          <div key={s.id} style={{background:"white",borderRadius:12,padding:"13px 14px",boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:sColor(s.id),color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,flexShrink:0}}>{initials(s.name)}</div>
              <div style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>{s.name}</div>
            </div>
            {[s.mathEnabled&&{sub:"math",label:"📐 Math",color:"#3b82f6",level:s.mathLevel,ws:s.mathWorksheet},
              s.readingEnabled&&{sub:"reading",label:"📖 Reading",color:"#ec4899",level:s.readingLevel,ws:s.readingWorksheet}]
              .filter(Boolean).map(({sub,label,color,level,ws})=>{
              const goal = goals[s.id+':'+sub];
              const g = goalStats(goal, level, ws, sub);
              return (
                <div key={sub} style={{background:"#f8fafc",borderRadius:9,padding:"9px 11px",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:12,fontWeight:700,color,minWidth:78}}>{label}</span>
                    <span style={{fontSize:11,color:"#64748b"}}>Now: <b>{level}{ws}</b></span>
                    {goal ? <>
                      <span style={{fontSize:11,color:"#64748b"}}>→ Goal: <b>{goal.target_level}{goal.target_worksheet}</b>{goal.target_date?` by ${goal.target_date}`:""}</span>
                      <span style={{marginLeft:"auto",display:"flex",gap:5}}>
                        <button onClick={()=>onProject({studentId:s.id,subject:sub})} style={{border:"none",background:"#faf5ff",color:"#7c3aed",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📈</button>
                        <button onClick={()=>onEdit({studentId:s.id,subject:sub})} style={{border:"none",background:"#eff6ff",color:"#1d4ed8",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Edit</button>
                        <button onClick={()=>onRemove(goal)} style={{border:"none",background:"#f0fdf4",color:"#16a34a",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>✓ Done</button>
                      </span>
                    </> : (
                      <span style={{marginLeft:"auto",display:"flex",gap:5}}>
                        <button onClick={()=>onProject({studentId:s.id,subject:sub})} style={{border:"none",background:"#faf5ff",color:"#7c3aed",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📈</button>
                        <button onClick={()=>onEdit({studentId:s.id,subject:sub})} style={{border:"1.5px dashed #cbd5e1",background:"white",color:"#64748b",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Set goal</button>
                      </span>
                    )}
                  </div>
                  {g && !g.reached && <>
                    <div style={{height:7,background:"#e2e8f0",borderRadius:4,marginTop:8,overflow:"hidden"}}>
                      <div style={{height:"100%",width:g.pct+"%",background:color,borderRadius:4,transition:"width 0.3s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:10,color:"#64748b",fontWeight:600}}>
                      <span>{g.pct}% · {g.done}/{g.total} WS</span>
                      <span style={{color:g.dl!=null&&g.perDay>3?"#dc2626":"#64748b"}}>{g.remaining} WS left{g.dl!=null?` · ${g.dl} days`:""}{g.perDay?` · needs ~${g.perDay}/day`:""}</span>
                    </div>
                  </>}
                  {g && g.reached && <div style={{marginTop:6,fontSize:11,fontWeight:700,color:"#16a34a"}}>🎉 Goal reached — mark Done to celebrate & set the next one!</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Goal Modal ─────────────────────────────────────────────────
function GoalModal({student,subject,goal,onSave,onClose}) {
  const isMath = subject==="math";
  const seq = levelsFor(subject);
  const curLevel = isMath ? student.mathLevel : student.readingLevel;
  const curWs = isMath ? student.mathWorksheet : student.readingWorksheet;
  const defDate = () => { const d=new Date(); d.setMonth(d.getMonth()+1); return d.toISOString().split("T")[0]; };
  const [f,setF]=useState({
    target_level: goal?.target_level || curLevel,
    target_worksheet: goal?.target_worksheet || Math.min(MAX_WS, curWs+50),
    target_date: goal?.target_date || defDate(),
  });
  const preview = wsDistance(curLevel, curWs, f.target_level, f.target_worksheet, subject);
  const dl = daysLeft(f.target_date);
  const valid = preview != null && preview > 0;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500,display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:700,margin:"0 auto",background:"white",borderRadius:"20px 20px 0 0",padding:"16px 16px 30px"}}>
        <div style={{width:40,height:4,background:"#e2e8f0",borderRadius:2,margin:"0 auto 14px"}}/>
        <div style={{fontWeight:800,fontSize:16,color:"#1e293b",marginBottom:2}}>🎯 {goal?"Edit":"Set"} {isMath?"Math":"Reading"} Goal</div>
        <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>{student.name} · currently at <b>{curLevel}{curWs}</b></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.3fr",gap:8,marginBottom:12}}>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>Target Level</label>
            <select value={f.target_level} onChange={e=>setF(p=>({...p,target_level:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 8px",fontSize:13,background:"white"}}>{seq.map(l=><option key={l}>{l}</option>)}</select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>Target WS</label>
            <input type="number" min={1} max={200} value={f.target_worksheet} onChange={e=>setF(p=>({...p,target_worksheet:Math.max(1,Math.min(MAX_WS,parseInt(e.target.value)||1))}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 8px",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>Target Date</label>
            <input type="date" value={f.target_date} onChange={e=>setF(p=>({...p,target_date:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
          </div>
        </div>
        <div style={{background:valid?"#eff6ff":"#fef2f2",borderRadius:9,padding:"9px 12px",fontSize:12,color:valid?"#1e40af":"#dc2626",fontWeight:600,marginBottom:14}}>
          {valid ? <>📏 {preview} worksheets from today{dl!=null?` · ${dl} days`:""}{dl?` · ~${Math.ceil(preview/Math.max(1,dl))}/day needed`:""}</> : "Target must be ahead of the current position"}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{padding:"12px 18px",border:"1.5px solid #e2e8f0",background:"white",color:"#64748b",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13}}>Cancel</button>
          <button onClick={()=>valid&&onSave({
              id: goal?.id || `g_${student.id}_${subject}`,
              student_id: student.id, subject,
              target_level: f.target_level, target_worksheet: f.target_worksheet, target_date: f.target_date,
              start_level: goal?.start_level || curLevel, start_worksheet: goal?.start_worksheet || curWs,
              status: 'active',
            })}
            style={{flex:1,padding:"12px",border:"none",background:valid?"linear-gradient(135deg,#1e40af,#5b21b6)":"#e2e8f0",color:valid?"white":"#94a3b8",borderRadius:10,fontWeight:700,fontSize:14,cursor:valid?"pointer":"default"}}>Save Goal</button>
        </div>
      </div>
    </div>
  );
}

// ─── Student completeness checker ──────────────────────────────────
function missingFields(s) {
  const issues = [];
  if (!s.mathEnabled && !s.readingEnabled)
    issues.push({ field:"subjects", label:"No subjects enabled", severity:"critical" });
  if (s.mathEnabled && !s.mathLevel)
    issues.push({ field:"mathLevel", label:"Math level not set", severity:"critical" });
  if (s.readingEnabled && !s.readingLevel)
    issues.push({ field:"readingLevel", label:"Reading level not set", severity:"critical" });
  if (s.mathEnabled && !(s.mathScheduleDays?.length))
    issues.push({ field:"mathDays", label:"Math class days not set", severity:"high" });
  if (s.readingEnabled && !(s.readingScheduleDays?.length))
    issues.push({ field:"readingDays", label:"Reading class days not set", severity:"high" });
  if (s.mathEnabled && !s.mathWorksheet)
    issues.push({ field:"mathWS", label:"Math starting worksheet not set", severity:"high" });
  if (s.readingEnabled && !s.readingWorksheet)
    issues.push({ field:"readingWS", label:"Reading starting worksheet not set", severity:"high" });
  if (s.mathEnabled && !s.mathClassWS)
    issues.push({ field:"mathClassWS", label:"Math worksheets/class not set", severity:"medium" });
  if (s.readingEnabled && !s.readingClassWS)
    issues.push({ field:"readClassWS", label:"Reading worksheets/class not set", severity:"medium" });
  if (!s.parentName)
    issues.push({ field:"parentName", label:"Parent name missing", severity:"medium" });
  if (!s.parentContact)
    issues.push({ field:"parentContact", label:"Parent phone missing", severity:"medium" });
  if (!s.parentEmail)
    issues.push({ field:"parentEmail", label:"Parent email missing", severity:"low" });
  if (!s.grade)
    issues.push({ field:"grade", label:"Grade not set", severity:"low" });
  return issues;
}
const SEVERITY_COLOR = { critical:"#dc2626", high:"#ea580c", medium:"#d97706", low:"#64748b" };
const SEVERITY_BG    = { critical:"#fef2f2", high:"#fff7ed", medium:"#fffbeb", low:"#f8fafc" };

// ─── Students Tab ─────────────────────────────────────────────────
function StudentsTab({students,onEdit,onToggleStatus,onReload}) {
  const [search,setSearch]=useState("");
  const [showInactive,setShowInactive]=useState(false);
  const [view,setView]=useState("all"); // "all" | "issues"
  const active = students.filter(s=>s.status!=="inactive");
  const withIssues = active.filter(s=>missingFields(s).length>0).sort((a,b)=>missingFields(b).length-missingFields(a).length);
  const filtered = (view==="issues" ? withIssues : students)
    .filter(s=>s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s=>view==="issues" || showInactive || s.status!=="inactive");
  const criticalCount = withIssues.filter(s=>missingFields(s).some(i=>i.severity==="critical")).length;
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search students..." style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none",background:"white"}}/>
        <button onClick={()=>onEdit("new")} style={{padding:"10px 16px",border:"none",background:"#1e40af",color:"white",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13,whiteSpace:"nowrap"}}>+ Add</button>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        <button onClick={()=>setView("all")} style={{flex:1,padding:"8px",border:"none",borderRadius:8,fontWeight:700,fontSize:11,cursor:"pointer",background:view==="all"?"#1e40af":"#f1f5f9",color:view==="all"?"white":"#64748b"}}>All Students</button>
        <button onClick={()=>setView("issues")} style={{flex:1,padding:"8px",border:"none",borderRadius:8,fontWeight:700,fontSize:11,cursor:"pointer",background:view==="issues"?"#dc2626":"#f1f5f9",color:view==="issues"?"white":"#64748b",position:"relative"}}>
          ⚠️ Needs Attention {withIssues.length>0&&<span style={{background:criticalCount?"#dc2626":"#ea580c",color:"white",borderRadius:10,padding:"1px 7px",fontSize:10,marginLeft:4}}>{withIssues.length}</span>}
        </button>
      </div>
      {view==="issues" && withIssues.length===0 && <div style={{textAlign:"center",padding:32,color:"#16a34a",fontWeight:700,fontSize:14}}>✅ All students are fully set up!</div>}
      {view==="all" && <button onClick={()=>{ const next=!showInactive; setShowInactive(next); onReload(next); }} style={{ border:"none", background:showInactive?"#fef2f2":"#f8fafc", color:showInactive?"#dc2626":"#64748b", borderRadius:8, padding:"7px 12px", fontWeight:700, fontSize:11, cursor:"pointer", marginBottom:12 }}>
        {showInactive?"👁️ Showing inactive — tap to hide":"👁️‍🗨️ Show inactive students"}
      </button>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(s=>(
          <div key={s.id} onClick={()=>onEdit(s.id)} style={{background:"white",borderRadius:12,padding:"13px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px rgba(0,0,0,0.07)",opacity:s.status==="inactive"?0.55:1,border:missingFields(s).some(i=>i.severity==="critical")?"1.5px solid #fca5a5":missingFields(s).length?"1.5px solid #fed7aa":"1.5px solid transparent"}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:sColor(s.id),color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{initials(s.name)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,color:"#1e293b",fontSize:14,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                {s.name}
                {s.status==="inactive" && <span style={{fontSize:9,color:"#dc2626",background:"#fef2f2",borderRadius:8,padding:"1px 7px",fontWeight:700}}>INACTIVE</span>}
                {s.status!=="inactive" && !s.mathEnabled && !s.readingEnabled && <span style={{fontSize:9,color:"#ea580c",background:"#fff7ed",borderRadius:8,padding:"1px 7px",fontWeight:700}}>🆕 NEEDS SETUP</span>}
              </div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{s.grade}</div>
              <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
                {s.mathEnabled&&<LevelBadge subject="Math" level={s.mathLevel} worksheet={s.mathWorksheet} color="#3b82f6"/>}
                {s.readingEnabled&&<LevelBadge subject="Read" level={s.readingLevel} worksheet={s.readingWorksheet} color="#ec4899"/>}
              </div>
              <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>
                {s.mathEnabled&&`Math: ${s.mathScheduleDays?.join(",")||"— no days set"}`}{s.mathEnabled&&s.readingEnabled&&" · "}
                {s.readingEnabled&&`Read: ${s.readingScheduleDays?.join(",")||"— no days set"}`}
              </div>
              {missingFields(s).length>0 && <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>
                {missingFields(s).map(i=>(
                  <span key={i.field} style={{fontSize:9,fontWeight:700,color:SEVERITY_COLOR[i.severity],background:SEVERITY_BG[i.severity],borderRadius:6,padding:"2px 6px"}}>{i.label}</span>
                ))}
              </div>}
            </div>
            <button onClick={e=>{e.stopPropagation(); onToggleStatus&&onToggleStatus(s);}}
              style={{border:"none",background:s.status==="inactive"?"#f0fdf4":"#fef2f2",color:s.status==="inactive"?"#16a34a":"#dc2626",borderRadius:8,padding:"6px 10px",fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              {s.status==="inactive"?"▶️ Activate":"⏸️ Deactivate"}
            </button>
            <span style={{color:"#cbd5e1",fontSize:20}}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────────────
function SettingsTab({centerName,setCenterName,keywords,setKeywords}) {
  const [editCenter,setEditCenter]=useState(centerName),[newKw,setNewKw]=useState("");
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:"white",borderRadius:12,padding:16,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
        <div style={{fontWeight:700,fontSize:14,color:"#1e293b",marginBottom:12}}>🏫 Center Name</div>
        <div style={{display:"flex",gap:8}}>
          <input value={editCenter} onChange={e=>setEditCenter(e.target.value)} style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:14,outline:"none"}}/>
          <button onClick={()=>setCenterName(editCenter)} style={{border:"none",background:"#1e40af",color:"white",borderRadius:8,padding:"9px 18px",fontWeight:700,cursor:"pointer"}}>Save</button>
        </div>
      </div>
      <div style={{background:"white",borderRadius:12,padding:16,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
        <div style={{fontWeight:700,fontSize:14,color:"#1e293b",marginBottom:12}}>💬 Quick Comment Keywords</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={newKw} onChange={e=>setNewKw(e.target.value)} placeholder="e.g. 🎯 Excellent accuracy" style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,outline:"none"}} onKeyDown={e=>{if(e.key==="Enter"&&newKw.trim()){setKeywords([...keywords,newKw.trim()]);setNewKw("");}}}/>
          <button onClick={()=>{if(newKw.trim()){setKeywords([...keywords,newKw.trim()]);setNewKw("");}}} style={{border:"none",background:"#1e40af",color:"white",borderRadius:8,padding:"9px 16px",fontWeight:700,cursor:"pointer",fontSize:18}}>+</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:280,overflowY:"auto"}}>
          {keywords.map((kw,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#f8fafc",borderRadius:8,padding:"8px 12px"}}>
              <span style={{flex:1,fontSize:13}}>{kw}</span>
              <button onClick={()=>setKeywords(keywords.filter((_,j)=>j!==i))} style={{border:"none",background:"#fee2e2",color:"#dc2626",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:"#eff6ff",borderRadius:12,padding:14,fontSize:12,color:"#1e40af",lineHeight:1.8}}>
        <strong>📅 Schedule rule:</strong><br/>
        Any day NOT listed as a class day is automatically a homework day for that subject —
        no separate setup needed. Math and Reading can have different class days for the same student.
      </div>
    </div>
  );
}

// ─── Edit Student Modal ───────────────────────────────────────────
function EditStudentModal({student,onSave,onDelete,onClose}) {
  const [f,setF]=useState({
    name:student?.name||"", parentName:student?.parentName||"", parentContact:student?.parentContact||"", parentEmail:student?.parentEmail||"",
    grade:student?.grade||"Grade 3", kumonMoneyPerSheet:student?.kumonMoneyPerSheet||5,
    status:student?.status||"active",
    mathEnabled:student?.mathEnabled??false, mathLevel:student?.mathLevel||"A", mathWorksheet:student?.mathWorksheet||1,
    mathClassWS:student?.mathClassWS||2, mathHomeworkWS:student?.mathHomeworkWS||1, mathScheduleDays:student?.mathScheduleDays||[],
    readingEnabled:student?.readingEnabled??false, readingLevel:student?.readingLevel||"7A", readingWorksheet:student?.readingWorksheet||1,
    readingClassWS:student?.readingClassWS||2, readingHomeworkWS:student?.readingHomeworkWS||1, readingScheduleDays:student?.readingScheduleDays||[],
  });
  const upd=(k,v)=>setF(p=>({...p,[k]:v}));
  const valid=f.name.trim()&&(f.mathEnabled||f.readingEnabled);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:400,display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:700,margin:"0 auto",background:"white",borderRadius:"20px 20px 0 0",maxHeight:"91vh",overflowY:"auto",paddingBottom:28}}>
        <div style={{padding:"12px 16px 0",position:"sticky",top:0,background:"white",borderBottom:"1px solid #f1f5f9"}}>
          <div style={{width:40,height:4,background:"#e2e8f0",borderRadius:2,margin:"0 auto 12px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:12}}>
            <div style={{fontWeight:800,fontSize:17}}>{student?"Edit Student":"Add Student"}</div>
            <button onClick={onClose} style={{border:"none",background:"#f1f5f9",borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        </div>
        <div style={{padding:16}}>
          {[{k:"name",l:"Student Name *",ph:"Full name"},{k:"parentName",l:"Parent / Guardian",ph:"Parent's name"},{k:"parentContact",l:"WhatsApp / Phone (with country code)",ph:"+16040000000"},{k:"parentEmail",l:"Parent Email",ph:"parent@email.com"}].map(({k,l,ph})=>(
            <div key={k} style={{marginBottom:13}}>
              <label style={{fontSize:12,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>{l}</label>
              <input value={f[k]} onChange={e=>upd(k,e.target.value)} placeholder={ph} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:14,boxSizing:"border-box",outline:"none"}}/>
            </div>
          ))}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:13}}>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>Grade</label>
              <select value={f.grade} onChange={e=>upd("grade",e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:13,background:"white"}}>{GRADE_OPTIONS.map(g=><option key={g}>{g}</option>)}</select>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>Kumon $ / Sheet</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}><CounterBtn onClick={()=>upd("kumonMoneyPerSheet",Math.max(1,f.kumonMoneyPerSheet-1))}>−</CounterBtn><span style={{flex:1,textAlign:"center",fontWeight:800,fontSize:18}}>${f.kumonMoneyPerSheet}</span><CounterBtn onClick={()=>upd("kumonMoneyPerSheet",f.kumonMoneyPerSheet+1)}>+</CounterBtn></div>
            </div>
          </div>
          {student && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:f.status==="active"?"#f0fdf4":"#fef2f2", borderRadius:10, padding:"10px 14px", marginBottom:13 }}>
              <span style={{ fontSize:13, fontWeight:700, color:f.status==="active"?"#16a34a":"#dc2626" }}>{f.status==="active"?"✅ Active Student":"⏸️ Inactive (discontinued)"}</span>
              <button onClick={()=>upd("status", f.status==="active"?"inactive":"active")} style={{ border:"none", background:f.status==="active"?"#dc2626":"#16a34a", color:"white", borderRadius:8, padding:"6px 14px", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                {f.status==="active"?"Mark Inactive":"Reactivate"}
              </button>
            </div>
          )}
          <SubjectSetup subject="Math" color="#3b82f6" levels={MATH_LEVELS} enabled={f.mathEnabled} level={f.mathLevel} worksheet={f.mathWorksheet} classWS={f.mathClassWS} homeworkWS={f.mathHomeworkWS} scheduleDays={f.mathScheduleDays}
            onToggle={v=>upd("mathEnabled",v)} onLevel={v=>upd("mathLevel",v)} onWorksheet={v=>upd("mathWorksheet",v)} onClassWS={v=>upd("mathClassWS",v)} onHomeworkWS={v=>upd("mathHomeworkWS",v)} onScheduleDays={v=>upd("mathScheduleDays",v)} />
          <SubjectSetup subject="Reading" color="#ec4899" levels={READING_LEVELS} enabled={f.readingEnabled} level={f.readingLevel} worksheet={f.readingWorksheet} classWS={f.readingClassWS} homeworkWS={f.readingHomeworkWS} scheduleDays={f.readingScheduleDays}
            onToggle={v=>upd("readingEnabled",v)} onLevel={v=>upd("readingLevel",v)} onWorksheet={v=>upd("readingWorksheet",v)} onClassWS={v=>upd("readingClassWS",v)} onHomeworkWS={v=>upd("readingHomeworkWS",v)} onScheduleDays={v=>upd("readingScheduleDays",v)} />
          <div style={{display:"flex",gap:8,marginTop:20}}>
            {onDelete&&<button onClick={onDelete} style={{padding:"12px 16px",border:"2px solid #fee2e2",background:"white",color:"#dc2626",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13}}>🗑️ Delete</button>}
            <button onClick={()=>valid&&onSave(f)} style={{flex:1,padding:"14px",border:"none",background:valid?"linear-gradient(135deg,#1e40af,#5b21b6)":"#e2e8f0",color:valid?"white":"#94a3b8",borderRadius:10,fontWeight:700,fontSize:15,cursor:valid?"pointer":"default"}}>{student?"Save Changes":"➕ Add Student"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubjectSetup({subject,color,levels,enabled,level,worksheet,classWS,homeworkWS,scheduleDays,onToggle,onLevel,onWorksheet,onClassWS,onHomeworkWS,onScheduleDays}) {
  const toggleDay=d=>onScheduleDays(scheduleDays.includes(d)?scheduleDays.filter(x=>x!==d):[...scheduleDays,d]);
  return (
    <div style={{background:enabled?`${color}08`:"#f8fafc",border:`1.5px solid ${enabled?color+"33":"#e2e8f0"}`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:enabled?12:0}}>
        <span style={{fontWeight:700,fontSize:14,color:enabled?color:"#94a3b8"}}>{subject==="Math"?"📐":"📖"} {subject}</span>
        <button onClick={()=>onToggle(!enabled)} style={{border:"none",background:enabled?color:"#e2e8f0",color:"white",borderRadius:20,padding:"5px 14px",fontWeight:700,fontSize:12,cursor:"pointer"}}>{enabled?"Enabled":"Disabled"}</button>
      </div>
      {enabled&&<>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>Level</label>
            <select value={level} onChange={e=>onLevel(e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 8px",fontSize:12,background:"white"}}>{levels.map(l=><option key={l}>{l}</option>)}</select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>WS #</label>
            <input type="number" value={worksheet} min={1} max={200} onChange={e=>onWorksheet(Math.max(1,Math.min(200,parseInt(e.target.value)||1)))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 8px",fontSize:12,boxSizing:"border-box",outline:"none"}}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>WS/Class</label>
            <div style={{display:"flex",alignItems:"center",gap:3}}><button onClick={()=>onClassWS(Math.max(0,classWS-1))} style={{width:24,height:26,border:"1px solid #e2e8f0",background:"#f8fafc",borderRadius:5,fontSize:14,cursor:"pointer",fontWeight:700}}>−</button><span style={{flex:1,textAlign:"center",fontWeight:800,fontSize:14}}>{classWS}</span><button onClick={()=>onClassWS(classWS+1)} style={{width:24,height:26,border:"1px solid #e2e8f0",background:"#f8fafc",borderRadius:5,fontSize:14,cursor:"pointer",fontWeight:700}}>+</button></div>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:5}}>WS/Homework</label>
            <div style={{display:"flex",alignItems:"center",gap:3}}><button onClick={()=>onHomeworkWS(Math.max(0,homeworkWS-1))} style={{width:24,height:26,border:"1px solid #e2e8f0",background:"#f8fafc",borderRadius:5,fontSize:14,cursor:"pointer",fontWeight:700}}>−</button><span style={{flex:1,textAlign:"center",fontWeight:800,fontSize:14}}>{homeworkWS}</span><button onClick={()=>onHomeworkWS(homeworkWS+1)} style={{width:24,height:26,border:"1px solid #e2e8f0",background:"#f8fafc",borderRadius:5,fontSize:14,cursor:"pointer",fontWeight:700}}>+</button></div>
          </div>
        </div>
        <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:6}}>Class Days (everything else = homework)</label>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {ALL_DAYS.map(d=><button key={d} onClick={()=>toggleDay(d)} style={{padding:"6px 10px",border:`1.5px solid ${scheduleDays.includes(d)?color:"#e2e8f0"}`,background:scheduleDays.includes(d)?color+"18":"white",color:scheduleDays.includes(d)?color:"#94a3b8",borderRadius:7,fontWeight:700,fontSize:11,cursor:"pointer"}}>{d}</button>)}
        </div>
      </>}
    </div>
  );
}
