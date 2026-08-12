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
  const mathDays = r.math_schedule_days || []
  const readingDays = r.reading_schedule_days || []
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
    math_schedule_days: s.mathScheduleDays ?? [],
    reading_enabled: s.readingEnabled,
    reading_level: s.readingLevel,
    reading_worksheet: s.readingWorksheet,
    reading_class_ws: s.readingClassWS,
    reading_homework_ws: s.readingHomeworkWS,
    reading_schedule_days: s.readingScheduleDays ?? [],
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

async function deleteStudent(id: string) {
  const { error } = await supabase.from('kumon_students').delete().eq('id', id)
  if (error) throw error
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
      } catch(e){ console.error(e); showToast("Failed to load data: "+e.message,"error"); }
      setLoading(false);
    })();
  },[]);

  useEffect(()=>{
    (async()=>{
      try { setSessionsToday(await fetchSessionsForDate(selectedDate)); }
      catch(e){ console.error(e); }
    })();
  },[selectedDate]);

  const todayDay = todayDayStr(selectedDate);
  const todayStudents = students.filter(s =>
    (s.mathEnabled && (s.mathScheduleDays.includes(todayDay) || s.mathHomeworkDays.includes(todayDay))) ||
    (s.readingEnabled && (s.readingScheduleDays.includes(todayDay) || s.readingHomeworkDays.includes(todayDay)))
  );
  const classStudents = todayStudents.filter(s =>
    (s.mathEnabled && s.mathScheduleDays.includes(todayDay)) || (s.readingEnabled && s.readingScheduleDays.includes(todayDay))
  );

  const getSession = (sid) => sessionsToday[sid] || {};
  const updateLocalSession = (sid, patch) => setSessionsToday(prev => ({...prev, [sid]: {...(prev[sid]||{}), ...patch}}));

  const openStudent = students.find(s=>s.id===sessionModal);
  const openSession = sessionModal ? getSession(sessionModal) : {};

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
          <div>
            <div style={{fontWeight:900,fontSize:18,letterSpacing:-0.4}}>📚 {centerName}</div>
            <div style={{fontSize:11,opacity:0.65,marginTop:2,letterSpacing:0.3}}>INSTRUCTOR PORTAL</div>
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
          {[{id:"today",l:"Today",i:"📋"},{id:"students",l:"Students",i:"👥"},{id:"settings",l:"Settings",i:"⚙️"}].map(t=>(
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
              getSession={getSession} onOpen={setSessionModal}
            />
          )}
          {tab==="students" && (
            <StudentsTab students={students} onEdit={setEditModal} onReload={async(inc)=>{ try{ setStudents(await fetchStudents(inc)); } catch(e){ showToast("Reload failed: "+e.message,"error"); } }} />
          )}
          {tab==="settings" && (
            <SettingsTab centerName={centerName} setCenterName={async v=>{setCenterName(v); await saveSetting('center_name',v); showToast("✅ Saved!");}}
              keywords={keywords} setKeywords={async v=>{setKeywords(v); await saveSetting('keywords',v);}} />
          )}
        </>}
      </div>

      {sessionModal && openStudent && (
        <SessionModal student={openStudent} session={openSession} keywords={keywords} centerName={centerName} date={selectedDate} todayDay={todayDay}
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
    </div>
  );
}

// ─── Today Tab ───────────────────────────────────────────────────
function TodayTab({classStudents,allTodayStudents,todayDay,selectedDate,setSelectedDate,getSession,onOpen}) {
  const [viewMode,setViewMode] = useState("cards"); // "cards" | "table"
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

      {classStudents.length>0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
          <div style={{background:"#eff6ff",borderRadius:10,padding:"10px 8px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:"#3b82f6"}}>{classStudents.length}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>Class Today</div></div>
          <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 8px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:"#16a34a"}}>{presentCount}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>Marked</div></div>
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <button onClick={()=>setViewMode("cards")} style={{flex:1,padding:"8px",border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",background:viewMode==="cards"?"#1e40af":"#f1f5f9",color:viewMode==="cards"?"white":"#64748b"}}>🪪 Cards</button>
        <button onClick={()=>setViewMode("table")} style={{flex:1,padding:"8px",border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",background:viewMode==="table"?"#1e40af":"#f1f5f9",color:viewMode==="table"?"white":"#64748b"}}>📊 Table</button>
      </div>

      {viewMode==="table" ? (
        <DayTableView students={allTodayStudents} classStudents={classStudents} todayDay={todayDay} getSession={getSession} onOpen={onOpen} />
      ) : <>
        {classStudents.length===0 ? (
          <div style={{textAlign:"center",padding:32,color:"#94a3b8"}}>
            <div style={{fontSize:40}}>📭</div>
            <div style={{fontWeight:700,marginTop:8,fontSize:14}}>No class sessions scheduled for {todayDay}</div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:homeworkOnly.length>0?20:0}}>
            {classStudents.map(s=><StudentCard key={s.id} student={s} session={getSession(s.id)} todayDay={todayDay} onOpen={()=>onOpen(s.id)} isClassDay/>)}
          </div>
        )}

        {homeworkOnly.length>0 && <>
          <SectionLabel label={`📝 Homework Day (${todayDay})`} sub={`${homeworkOnly.length} students`} />
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {homeworkOnly.map(s=><StudentCard key={s.id} student={s} session={getSession(s.id)} todayDay={todayDay} onOpen={()=>onOpen(s.id)} isClassDay={false}/>)}
          </div>
        </>}
      </>}
    </div>
  );
}

// ─── Day Table View — spreadsheet-style overview of all students ──
function DayTableView({students,classStudents,todayDay,getSession,onOpen}) {
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
            const mPlanned = mathToday? s.mathClassWS : s.mathHomeworkWS;
            const rPlanned = readToday? s.readingClassWS : s.readingHomeworkWS;
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
                  {!sess.hasOwnProperty("present") ? <span style={{color:"#cbd5e1"}}>—</span> :
                   !sess.present ? <span style={{color:"#dc2626",fontWeight:700}}>Absent</span> :
                   <span style={{color:"#16a34a",fontWeight:700}}>✓ {mDone+rDone}WS</span>}
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

function StudentCard({student,session,todayDay,onOpen,isClassDay}) {
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
        <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{student.grade}</div>
        <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
          {student.mathEnabled&&<LevelBadge subject={mathToday?"Math":"Math (HW)"} level={student.mathLevel} worksheet={student.mathWorksheet} color="#3b82f6"/>}
          {student.readingEnabled&&<LevelBadge subject={readToday?"Read":"Read (HW)"} level={student.readingLevel} worksheet={student.readingWorksheet} color="#ec4899"/>}
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
function SessionModal({student,session:s,keywords,centerName,date,todayDay,onUpdate,onClose,onCancel}) {
  const [showMsg,setShowMsg]=useState(false),[copied,setCopied]=useState(false);
  useEffect(()=>{
    if(!s.hasOwnProperty("present")) onUpdate({
      present:true,
      math:{done:0,fromLevel:student.mathLevel,fromWorksheet:student.mathWorksheet,scores:[],corrections:"none",timeMinutes:""},
      reading:{done:0,fromLevel:student.readingLevel,fromWorksheet:student.readingWorksheet,scores:[],corrections:"none",timeMinutes:""},
    });
  },[]);

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
                <span style={{fontSize:11,color:"#94a3b8"}}>{new Date(date+"T12:00:00").toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"})}</span>
              </div>
            </div>
            <button onClick={onCancel} style={{marginLeft:"auto",border:"none",background:"#f1f5f9",borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        </div>

        <div style={{padding:"14px 16px 0"}}>
          <SectionLabel label="Attendance"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            {[{v:true,label:"✓  Present",bg:"#f0fdf4",border:"#86efac",c:"#16a34a"},{v:false,label:"✗  Absent",bg:"#fef2f2",border:"#fca5a5",c:"#dc2626"}].map(opt=>(
              <button key={String(opt.v)} onClick={()=>onUpdate({present:opt.v})} style={{padding:"13px",border:`2px solid ${present===opt.v?opt.border:"#e2e8f0"}`,background:present===opt.v?opt.bg:"white",color:present===opt.v?opt.c:"#94a3b8",borderRadius:10,fontWeight:700,fontSize:16,cursor:"pointer"}}>{opt.label}</button>
            ))}
          </div>

          {present&&<>
            {student.mathEnabled&&<SubjectSection subject="Math" emoji="📐" color="#3b82f6" level={student.mathLevel} worksheet={student.mathWorksheet} data={m} onUpdate={updMath} dayType={mathToday?"Class day":"Homework day"} plannedWS={mathToday?student.mathClassWS:student.mathHomeworkWS}/>}
            {student.readingEnabled&&<SubjectSection subject="Reading" emoji="📖" color="#ec4899" level={student.readingLevel} worksheet={student.readingWorksheet} data={r} onUpdate={updRead} dayType={readToday?"Class day":"Homework day"} plannedWS={readToday?student.readingClassWS:student.readingHomeworkWS}/>}

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

function SubjectSection({subject,emoji,color,level,worksheet,data,onUpdate,dayType,plannedWS}) {
  const subjectKey = subject.toLowerCase();
  const done=data.done||0,fromLevel=data.fromLevel||level,fromWs=data.fromWorksheet||worksheet,scores=data.scores||[],corrections=data.corrections||"none",time=data.timeMinutes||"";
  const wsItems=getWsItems(fromLevel,fromWs,done,subjectKey);
  const setDone=nd=>{const cur=data.scores||[];const ns=nd>cur.length?[...cur,...Array(nd-cur.length).fill(100)]:cur.slice(0,nd);onUpdate({done:nd,scores:ns});};
  const setScore=(i,v)=>{const sc=[...scores];sc[i]=v;onUpdate({scores:sc});};
  return (
    <div style={{background:"#f8fafc",borderRadius:12,padding:"12px 14px",marginBottom:14,border:`1.5px solid ${color}22`}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{fontSize:16}}>{emoji}</span><span style={{fontWeight:800,fontSize:14,color}}>{subject}</span>
        <span style={{fontSize:11,color:"#94a3b8",background:"white",border:`1px solid ${color}33`,borderRadius:12,padding:"1px 7px"}}>{fromLevel}{fromWs}{done>0&&wsItems.length?` → ${wsItems[wsItems.length-1].level}${wsItems[wsItems.length-1].wsNum}`:""}</span>
        {dayType && <span style={{fontSize:10,color:dayType==="Class day"?"#1e40af":"#16a34a",background:dayType==="Class day"?"#eff6ff":"#f0fdf4",borderRadius:10,padding:"2px 8px",fontWeight:700}}>{dayType}</span>}
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
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,background:"white",borderRadius:8,padding:"8px 12px",border:"1.5px solid #e2e8f0"}}>
          <span style={{fontSize:13,color:"#64748b",fontWeight:600}}>⏱️ Time</span>
          <input type="number" value={time} onChange={e=>onUpdate({timeMinutes:e.target.value})} placeholder="0.0" min={0} step={0.1} style={{flex:1,border:"none",textAlign:"right",fontSize:15,fontWeight:700,color:"#1e293b",outline:"none",background:"transparent",maxWidth:70}}/>
          <span style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>min</span>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase"}}>Scores</span>
            <div style={{display:"flex",gap:5}}>
              <button onClick={()=>onUpdate({scores:Array(done).fill(100)})} style={{border:"none",background:"#f0fdf4",color:"#16a34a",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>All 100</button>
              <button onClick={()=>onUpdate({scores:Array(done).fill(95)})} style={{border:"none",background:"#eff6ff",color:"#3b82f6",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>All 95</button>
            </div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {wsItems.map((item,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer"}} onClick={()=>setScore(i,cycleScore(scores[i]??100))}>
                <div style={{background:color,color:"white",fontSize:9,fontWeight:700,padding:"2px 5px",borderRadius:"5px 5px 0 0",whiteSpace:"nowrap"}}>{item.level}{item.wsNum}</div>
                <div style={{border:`1.5px solid ${(scores[i]??100)<100?"#fde68a":"#e2e8f0"}`,borderTop:"none",borderRadius:"0 0 5px 5px",padding:"3px 6px",background:(scores[i]??100)<100?"#fffbeb":"white",color:(scores[i]??100)<100?"#d97706":"#1e293b",fontWeight:700,fontSize:13,minWidth:36,textAlign:"center"}}>{scores[i]??100}</div>
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

// ─── Students Tab ─────────────────────────────────────────────────
function StudentsTab({students,onEdit,onReload}) {
  const [search,setSearch]=useState("");
  const [showInactive,setShowInactive]=useState(false);
  const filtered=students.filter(s=>s.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search students..." style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:14,outline:"none",background:"white"}}/>
        <button onClick={()=>onEdit("new")} style={{padding:"10px 16px",border:"none",background:"#1e40af",color:"white",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13,whiteSpace:"nowrap"}}>+ Add</button>
      </div>
      <button onClick={()=>{ const next=!showInactive; setShowInactive(next); onReload(next); }} style={{ border:"none", background:showInactive?"#fef2f2":"#f8fafc", color:showInactive?"#dc2626":"#64748b", borderRadius:8, padding:"7px 12px", fontWeight:700, fontSize:11, cursor:"pointer", marginBottom:12 }}>
        {showInactive?"👁️ Showing inactive — tap to hide":"👁️‍🗨️ Show inactive students"}
      </button>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(s=>(
          <div key={s.id} onClick={()=>onEdit(s.id)} style={{background:"white",borderRadius:12,padding:"13px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px rgba(0,0,0,0.07)",opacity:s.status==="inactive"?0.55:1}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:sColor(s.id),color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{initials(s.name)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,color:"#1e293b",fontSize:14,display:"flex",alignItems:"center",gap:6}}>
                {s.name}
                {s.status==="inactive" && <span style={{fontSize:9,color:"#dc2626",background:"#fef2f2",borderRadius:8,padding:"1px 7px",fontWeight:700}}>INACTIVE</span>}
              </div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{s.grade}</div>
              <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
                {s.mathEnabled&&<LevelBadge subject="Math" level={s.mathLevel} worksheet={s.mathWorksheet} color="#3b82f6"/>}
                {s.readingEnabled&&<LevelBadge subject="Read" level={s.readingLevel} worksheet={s.readingWorksheet} color="#ec4899"/>}
              </div>
              <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>
                {s.mathEnabled&&`Math: ${s.mathScheduleDays.join(",")||"—"}`}{s.mathEnabled&&s.readingEnabled&&" · "}
                {s.readingEnabled&&`Read: ${s.readingScheduleDays.join(",")||"—"}`}
              </div>
            </div>
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
