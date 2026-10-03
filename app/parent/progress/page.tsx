'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const MATH_SEQ = ["6A","5A","4A","3A","2A","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"]
const READ_SEQ = ["7A","6A","5A","4A","3A","2A","AI","AII","BI","BII","CI","CII","DI","DII","EI","EII","FI","FII","GI","GII","HI","HII","I-I","I-II","J","K","L","M","N","O"]
const MATH_KIS:any = {"PK":"2A","K":"2A",1:"A",2:"B",3:"C",4:"D",5:"E",6:"F",7:"G",8:"H",9:"I",10:"K",11:"M",12:"O"}
const READ_KIS:any = {"PK":"2A","K":"2A",1:"AI",2:"BI",3:"CI",4:"DI",5:"EI",6:"FI",7:"GI",8:"HI",9:"I-I",10:"J",11:"K",12:"L"}

function wsProgress(seq:string[], fromLvl:string, fromWs:number, toLvl:string, toWs=200) {
  try {
    const fi=seq.indexOf(fromLvl), ti=seq.indexOf(toLvl)
    if (fi<0||ti<0) return 0
    const total=(ti-fi)*200+(toWs-1)
    const done=(fi-fi)*200+(fromWs-1) // always 0 from start... use dynamic
    return Math.min(100, Math.max(0, Math.round((fromWs-1)/Math.max(1,total)*100)))
  } catch { return 0 }
}

function levelProgress(seq:string[], startLvl:string, startWs:number, curLvl:string, curWs:number, targetLvl:string) {
  try {
    const si=seq.indexOf(startLvl), ci=seq.indexOf(curLvl), ti=seq.indexOf(targetLvl)
    if (si<0||ci<0||ti<0) return 0
    const total=(ti-si)*200+(200-startWs)
    const done=(ci-si)*200+(curWs-startWs)
    return Math.min(100,Math.max(0,Math.round(done/Math.max(1,total)*100)))
  } catch { return 0 }
}

function milestoneFor(subject:string, grade:any, level:string) {
  const seq = subject==='math'?MATH_SEQ:READ_SEQ
  const kis = subject==='math'?MATH_KIS:READ_KIS
  const kisLvl = kis[grade]
  if (!kisLvl) return null
  try {
    const ki=seq.indexOf(kisLvl), ci=seq.indexOf(level)
    const ahead=ci-ki
    if (ahead>=3) return {medal:"💎",label:"Platinum",color:"#7c3aed",bg:"#f5f3ff"}
    if (ahead>=2) return {medal:"🥇",label:"Gold",color:"#d97706",bg:"#fffbeb"}
    if (ahead>=1) return {medal:"🥈",label:"Silver",color:"#64748b",bg:"#f8fafc"}
    if (ahead>=0) return {medal:"🥉",label:"Bronze",color:"#b45309",bg:"#fef9c3"}
    return {medal:"📈",label:"Working Toward Standard",color:"#3b82f6",bg:"#eff6ff"}
  } catch { return null }
}

function avgScore(scores?:number[]) {
  if (!scores?.length) return null
  const v = scores.filter(s=>s!=null&&s!==undefined)
  return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null
}

function naturalComment(keywords?:string[], comment?:string) {
  const phrases=(keywords||[]).map(k=>k.replace(/^[\p{Emoji}\s]+/u,'').trim()).filter(Boolean)
  const custom=(comment||'').trim()
  if (!phrases.length&&!custom) return null
  let sentence=''
  if (phrases.length===1) sentence=`Showed ${phrases[0]}.`
  else if (phrases.length===2) sentence=`Showed ${phrases[0]} and ${phrases[1]}.`
  else if (phrases.length>2) sentence=`Showed ${phrases.slice(0,-1).join(', ')}, and ${phrases[phrases.length-1]}.`
  return [sentence,custom].filter(Boolean).join(' ')
}

function ProgressRing({pct,color,size=80}:{pct:number,color:string,size?:number}) {
  const r=size/2-6, circ=2*Math.PI*r
  const dash=circ*(pct/100), gap=circ-dash
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={6}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
        style={{transition:'stroke-dasharray 1s ease'}}/>
    </svg>
  )
}

function MonthSparkline({sessions,subject}:{sessions:any[],subject:string}) {
  const last12 = sessions.slice(0,12).reverse()
  const max = 10
  return (
    <div style={{display:'flex',alignItems:'flex-end',gap:2,height:28}}>
      {last12.map((s,i)=>{
        const d = subject==='math'?s.math_data?.done:s.reading_data?.done
        const h = Math.max(4,Math.round(((d||0)/max)*28))
        const avg = avgScore(subject==='math'?s.math_data?.scores:s.reading_data?.scores)
        const col = avg===100?'#16a34a':avg!=null&&avg>=95?'#3b82f6':avg!=null&&avg>=85?'#f59e0b':'#ef4444'
        return <div key={i} style={{width:6,height:h,borderRadius:3,background:d?col:'#e2e8f0',transition:'height 0.5s'}}/>
      })}
    </div>
  )
}

export default function ParentProgress() {
  const [profile,setProfile]=useState<any>(null)
  const [progress,setProgress]=useState<any[]>([])
  const [goals,setGoals]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const supabase=createClient()

  useEffect(()=>{load()},[])

  async function load() {
    const {data:{user}}=await supabase.auth.getUser()
    if (!user){window.location.href='/auth/login';return}
    const [{data:prof},{data:bookingStudents}]=await Promise.all([
      supabase.from('profiles').select('*').eq('id',user.id).single(),
      supabase.from('students').select('*').eq('parent_id',user.id).eq('status','active'),
    ])
    setProfile(prof)
    if (!bookingStudents?.length){setLoading(false);return}
    const results:any[]=[]
    const allGoals:any[]=[]
    for (const bs of bookingStudents) {
      let ks:any=null, sessions:any[]=[]
      if (bs.kumon_student_id) {
        const {data:k}=await supabase.from('kumon_students').select('*').eq('kumon_student_id',bs.kumon_student_id).single()
        if (k) {
          ks=k
          const [{data:sess},{data:g}]=await Promise.all([
            supabase.from('kumon_sessions').select('*').eq('student_id',k.id).eq('present',true).order('session_date',{ascending:false}).limit(30),
            supabase.from('kumon_goals').select('*').eq('student_id',k.id).eq('status','active'),
          ])
          sessions=(sess||[])
          allGoals.push(...(g||[]))
        }
      }
      results.push({bookingName:`${bs.first_name} ${bs.last_name}`,bs,ks,sessions})
    }
    setProgress(results); setGoals(allGoals); setLoading(false)
  }

  async function signOut(){await supabase.auth.signOut();window.location.href='/auth/login'}

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f8fafc'}}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        <div style={{width:40,height:40,border:'3px solid #0077B6',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
        <div style={{color:'#64748b',fontSize:13}}>Loading progress…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0f172a 0%,#1e3a8a 40%,#0077B6 100%)',paddingBottom:60}}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}
        .card{background:rgba(255,255,255,0.97);border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,0.12)}
        .fade-up{animation:fadeUp 0.5s ease forwards}
      `}</style>

      {/* Header */}
      <div style={{maxWidth:640,margin:'0 auto',padding:'0 16px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 0 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <img src="/kumon-logo.png" alt="Kumon" style={{height:40,borderRadius:10}}/>
            <div>
              <div style={{color:'white',fontWeight:800,fontSize:16}}>Hi, {profile?.first_name||'there'}! 👋</div>
              <div style={{color:'rgba(255,255,255,0.6)',fontSize:12}}>Kumon Brookswood Learning Centre</div>
            </div>
          </div>
          <button onClick={signOut} style={{color:'rgba(255,255,255,0.5)',fontSize:12,border:'none',background:'none',cursor:'pointer'}}>Sign out</button>
        </div>

        {/* Nav tabs */}
        <div style={{display:'flex',gap:4,marginBottom:24}}>
          {[{href:'/parent/dashboard',label:'📋 Sessions'},{href:'/parent/progress',label:'📈 Progress',active:true},{href:'/parent/notifications',label:'🔔 Alerts'}].map(t=>(
            <Link key={t.href} href={t.href} style={{padding:'8px 16px',borderRadius:10,fontSize:13,fontWeight:t.active?700:500,
              background:t.active?'white':'rgba(255,255,255,0.15)',
              color:t.active?'#0077B6':'rgba(255,255,255,0.8)',textDecoration:'none'}}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:640,margin:'0 auto',padding:'0 16px',display:'flex',flexDirection:'column',gap:24}}>
        {progress.length===0?(
          <div className="card" style={{padding:40,textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:12}}>📚</div>
            <div style={{fontWeight:700,color:'#1e293b',marginBottom:4}}>No students found</div>
            <div style={{color:'#64748b',fontSize:13}}>Contact the centre to link your child's account.</div>
          </div>
        ):progress.map((p,pi)=>{
          const mathGoal=goals.find(g=>g.student_id===p.ks?.id&&g.subject==='math')
          const readGoal=goals.find(g=>g.student_id===p.ks?.id&&g.subject==='reading')
          const grade=p.ks?.grade
          const gradeNum=grade?parseInt(grade.replace(/\D/g,''))||grade:null
          const thisMonthSess=p.sessions.filter((s:any)=>s.session_date?.startsWith(new Date().toISOString().slice(0,7)))
          const totalWsDone=p.sessions.reduce((a:number,s:any)=>{
            return a+(s.math_data?.done||0)+(s.reading_data?.done||0)
          },0)

          return (
          <div key={pi} className="fade-up" style={{animationDelay:`${pi*0.1}s`,opacity:0}}>

            {/* Student name card */}
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
              <div style={{width:48,height:48,borderRadius:'50%',background:'linear-gradient(135deg,#0077B6,#5b21b6)',
                display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:20,color:'white',boxShadow:'0 4px 12px rgba(0,119,182,0.4)'}}>
                {p.bookingName[0]}
              </div>
              <div>
                <div style={{fontWeight:800,fontSize:18,color:'white'}}>{p.bookingName}</div>
                <div style={{color:'rgba(255,255,255,0.6)',fontSize:12}}>{grade?`Grade ${grade} · `:''}Kumon Student</div>
              </div>
            </div>

            {!p.ks?(
              <div className="card" style={{padding:32,textAlign:'center'}}>
                <div style={{fontSize:40,marginBottom:8}}>🔗</div>
                <div style={{fontWeight:700,color:'#1e293b',marginBottom:4}}>Progress tracking coming soon</div>
                <div style={{color:'#64748b',fontSize:13}}>Your child's worksheets and scores will appear here after their first session.</div>
              </div>
            ):(
              <>
              {/* Goal Progress Cards */}
              {(mathGoal||readGoal)&&(
                <div style={{display:'grid',gridTemplateColumns:mathGoal&&readGoal?'1fr 1fr':'1fr',gap:12,marginBottom:12}}>
                  {[mathGoal&&{goal:mathGoal,subject:'math',color:'#3b82f6',emoji:'📐'},
                    readGoal&&{goal:readGoal,subject:'reading',color:'#ec4899',emoji:'📖'}]
                    .filter(Boolean).map(({goal,subject,color,emoji}:any)=>{
                    const seq=subject==='math'?MATH_SEQ:READ_SEQ
                    const curLvl=subject==='math'?p.ks.math_level:p.ks.reading_level
                    const curWs=subject==='math'?p.ks.math_worksheet:p.ks.reading_worksheet
                    const pct=curLvl&&goal.start_level?levelProgress(seq,goal.start_level,goal.start_worksheet,curLvl,curWs||1,goal.target_level):0
                    const ms=gradeNum?milestoneFor(subject,gradeNum,curLvl||'A'):null
                    const targetDate=goal.target_date?new Date(goal.target_date).toLocaleDateString('en-CA',{month:'short',year:'numeric'}):null
                    const daysLeft=goal.target_date?Math.max(0,Math.round((new Date(goal.target_date).getTime()-Date.now())/86400000)):null

                    return (
                    <div key={subject} className="card" style={{padding:20,position:'relative',overflow:'hidden'}}>
                      {/* Background glow */}
                      <div style={{position:'absolute',top:-20,right:-20,width:80,height:80,borderRadius:'50%',
                        background:color+'20',filter:'blur(20px)'}}/>

                      <div style={{fontSize:10,fontWeight:800,color,letterSpacing:1,marginBottom:12}}>{emoji} {subject.toUpperCase()} GOAL</div>

                      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                        <div style={{position:'relative',flexShrink:0}}>
                          <ProgressRing pct={pct} color={color} size={72}/>
                          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
                            fontWeight:900,fontSize:16,color}}>{pct}%</div>
                        </div>
                        <div>
                          <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>Current → Target</div>
                          <div style={{fontWeight:900,fontSize:18,color:'#1e293b'}}>
                            <span style={{color}}>{curLvl}{curWs}</span>
                            <span style={{color:'#cbd5e1',margin:'0 4px'}}>→</span>
                            <span style={{color:'#1e293b'}}>{goal.target_level}</span>
                          </div>
                          {targetDate&&<div style={{fontSize:11,color:'#64748b',marginTop:2}}>by {targetDate}</div>}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{background:'#f1f5f9',borderRadius:6,height:8,marginBottom:10,overflow:'hidden'}}>
                        <div style={{height:'100%',borderRadius:6,background:`linear-gradient(90deg,${color},${color}99)`,
                          width:`${pct}%`,transition:'width 1.2s ease'}}/>
                      </div>

                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        {ms&&(
                          <div style={{display:'flex',alignItems:'center',gap:4,background:ms.bg,borderRadius:8,padding:'4px 10px'}}>
                            <span style={{fontSize:14}}>{ms.medal}</span>
                            <span style={{fontSize:11,fontWeight:700,color:ms.color}}>{ms.label}</span>
                          </div>
                        )}
                        {daysLeft!=null&&(
                          <div style={{fontSize:11,color:'#94a3b8'}}>
                            {daysLeft>0?`${daysLeft} days to go`:'🎉 Goal reached!'}
                          </div>
                        )}
                      </div>
                    </div>
                  )})}
                </div>
              )}

              {/* Stats row */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
                {[
                  {val:thisMonthSess.length,label:'Sessions this month',color:'#0077B6'},
                  {val:totalWsDone,label:'Total worksheets done',color:'#7c3aed'},
                  {val:(()=>{const sc=p.sessions.flatMap((s:any)=>[...(s.math_data?.scores||[]),...(s.reading_data?.scores||[])]).filter((v:any)=>v!=null);return sc.length?Math.round(sc.reduce((a:number,b:number)=>a+b,0)/sc.length)+'%':'—'})(),label:'Avg score',color:'#16a34a'},
                ].map((st,i)=>(
                  <div key={i} className="card" style={{padding:'14px 12px',textAlign:'center'}}>
                    <div style={{fontWeight:900,fontSize:22,color:st.color}}>{st.val}</div>
                    <div style={{fontSize:10,color:'#94a3b8',marginTop:2,lineHeight:1.3}}>{st.label}</div>
                  </div>
                ))}
              </div>

              {/* Current level + sparkline */}
              <div className="card" style={{padding:20,marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:800,color:'#94a3b8',letterSpacing:1,marginBottom:14}}>CURRENT LEVEL</div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  {p.ks.math_enabled&&p.ks.math_level&&(
                    <div style={{flex:1,minWidth:120,background:'linear-gradient(135deg,#eff6ff,#dbeafe)',borderRadius:14,padding:'14px 16px'}}>
                      <div style={{fontSize:10,color:'#3b82f6',fontWeight:800,marginBottom:4}}>📐 MATH</div>
                      <div style={{fontWeight:900,fontSize:36,color:'#1d4ed8',lineHeight:1}}>{p.ks.math_level}</div>
                      <div style={{fontSize:11,color:'#93c5fd',marginTop:4}}>WS #{p.ks.math_worksheet}</div>
                      <div style={{marginTop:8}}><MonthSparkline sessions={p.sessions} subject="math"/></div>
                    </div>
                  )}
                  {p.ks.reading_enabled&&p.ks.reading_level&&(
                    <div style={{flex:1,minWidth:120,background:'linear-gradient(135deg,#fdf2f8,#fce7f3)',borderRadius:14,padding:'14px 16px'}}>
                      <div style={{fontSize:10,color:'#ec4899',fontWeight:800,marginBottom:4}}>📖 READING</div>
                      <div style={{fontWeight:900,fontSize:36,color:'#be185d',lineHeight:1}}>{p.ks.reading_level}</div>
                      <div style={{fontSize:11,color:'#f9a8d4',marginTop:4}}>WS #{p.ks.reading_worksheet}</div>
                      <div style={{marginTop:8}}><MonthSparkline sessions={p.sessions} subject="reading"/></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Session history */}
              {p.sessions.length>0&&(
                <div className="card" style={{overflow:'hidden'}}>
                  <div style={{padding:'14px 20px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontSize:10,fontWeight:800,color:'#94a3b8',letterSpacing:1}}>RECENT SESSIONS</div>
                    <div style={{fontSize:11,color:'#94a3b8'}}>{p.sessions.length} recorded</div>
                  </div>
                  {p.sessions.slice(0,8).map((sess:any,si:number)=>{
                    const mDone=sess.math_data?.done||0,rDone=sess.reading_data?.done||0
                    const mAvg=avgScore(sess.math_data?.scores),rAvg=avgScore(sess.reading_data?.scores)
                    const dt=new Date(sess.session_date+'T12:00:00')
                    const ds=dt.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'})
                    const comment=naturalComment(sess.selected_keywords,sess.custom_comment)
                    const totalWs=mDone+rDone
                    return (
                      <div key={si} style={{padding:'14px 20px',borderBottom:si<p.sessions.slice(0,8).length-1?'1px solid #f8fafc':'none'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                          <div style={{fontWeight:700,color:'#1e293b',fontSize:13}}>{ds}</div>
                          <div style={{display:'flex',gap:6}}>
                            {mDone>0&&mAvg!=null&&(
                              <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,
                                background:mAvg===100?'#dcfce7':mAvg>=95?'#dbeafe':mAvg>=85?'#fef3c7':'#fee2e2',
                                color:mAvg===100?'#16a34a':mAvg>=95?'#1d4ed8':mAvg>=85?'#d97706':'#dc2626'}}>
                                📐 {mAvg}%
                              </span>
                            )}
                            {rDone>0&&rAvg!=null&&(
                              <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,
                                background:rAvg===100?'#dcfce7':rAvg>=95?'#fce7f3':rAvg>=85?'#fef3c7':'#fee2e2',
                                color:rAvg===100?'#16a34a':rAvg>=95?'#be185d':rAvg>=85?'#d97706':'#dc2626'}}>
                                📖 {rAvg}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{display:'flex',gap:12,fontSize:12,color:'#64748b',flexWrap:'wrap',marginBottom:comment?6:0}}>
                          {mDone>0&&<span>📐 {mDone} WS · {sess.math_data?.fromLevel}{sess.math_data?.fromWorksheet}</span>}
                          {rDone>0&&<span>📖 {rDone} WS · {sess.reading_data?.fromLevel}{sess.reading_data?.fromWorksheet}</span>}
                          {sess.math_data?.timeMinutes&&<span>⏱ {sess.math_data.timeMinutes}m</span>}
                          {(sess.kumon_money||0)>0&&<span style={{color:'#7c3aed',fontWeight:700}}>💰 +${sess.kumon_money}</span>}
                        </div>
                        {comment&&(
                          <div style={{fontSize:12,color:'#64748b',fontStyle:'italic',background:'#f8fafc',
                            borderRadius:8,padding:'6px 12px',borderLeft:'3px solid #e2e8f0'}}>
                            "{comment}"
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              </>
            )}
          </div>
        )})}

        {/* Footer */}
        <div style={{textAlign:'center',padding:'20px 0',color:'rgba(255,255,255,0.4)',fontSize:12}}>
          Kumon Brookswood Learning Centre · 4043 200 St, Langley BC
        </div>
      </div>
    </div>
  )
}
