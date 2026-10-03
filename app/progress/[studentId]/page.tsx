'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'

const MATH_SEQ = ["6A","5A","4A","3A","2A","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"]
const READ_SEQ = ["7A","6A","5A","4A","3A","2A","AI","AII","BI","BII","CI","CII","DI","DII","EI","EII","FI","FII","GI","GII","HI","HII","I-I","I-II","J","K","L","M","N","O"]
const MATH_KIS:any = {"PK":"2A","K":"2A",1:"A",2:"B",3:"C",4:"D",5:"E",6:"F",7:"G",8:"H",9:"I",10:"K",11:"M",12:"O"}
const READ_KIS:any = {"PK":"2A","K":"2A",1:"AI",2:"BI",3:"CI",4:"DI",5:"EI",6:"FI",7:"GI",8:"HI",9:"I-I",10:"J",11:"K",12:"L"}

function levelProgress(seq:string[],sL:string,sW:number,cL:string,cW:number,tL:string){
  try{
    const si=seq.indexOf(sL),ci=seq.indexOf(cL),ti=seq.indexOf(tL)
    if(si<0||ci<0||ti<0) return 0
    const total=(ti-si)*200+(200-sW)
    const done=(ci-si)*200+(cW-sW)
    return Math.min(100,Math.max(0,Math.round(done/Math.max(1,total)*100)))
  }catch{return 0}
}

function milestoneFor(subject:string,grade:any,level:string){
  const seq=subject==='math'?MATH_SEQ:READ_SEQ
  const kis=subject==='math'?MATH_KIS:READ_KIS
  const kisLvl=kis[grade]; if(!kisLvl) return null
  try{
    const ahead=seq.indexOf(level)-seq.indexOf(kisLvl)
    if(ahead>=3) return {medal:'💎',label:'Platinum Honor Roll',color:'#7c3aed',bg:'linear-gradient(135deg,#f5f3ff,#ede9fe)'}
    if(ahead>=2) return {medal:'🥇',label:'Gold Honor Roll',color:'#d97706',bg:'linear-gradient(135deg,#fffbeb,#fef3c7)'}
    if(ahead>=1) return {medal:'🥈',label:'Silver Honor Roll',color:'#475569',bg:'linear-gradient(135deg,#f8fafc,#f1f5f9)'}
    if(ahead>=0) return {medal:'🥉',label:'Bronze Honor Roll',color:'#92400e',bg:'linear-gradient(135deg,#fef9c3,#fef3c7)'}
    return {medal:'📈',label:'Working Toward Standard',color:'#3b82f6',bg:'linear-gradient(135deg,#eff6ff,#dbeafe)'}
  }catch{return null}
}

function ProgressRing({pct,color,size=100}:{pct:number,color:string,size?:number}){
  const r=size/2-8,circ=2*Math.PI*r
  return(
    <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${circ*(pct/100)} ${circ*(1-pct/100)}`} strokeLinecap="round"
        style={{transition:'stroke-dasharray 1.5s cubic-bezier(0.34,1.56,0.64,1)'}}/>
    </svg>
  )
}

function avgScore(scores?:number[]){
  const v=(scores||[]).filter(s=>s!=null)
  return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null
}

export default function PublicProgress(){
  const params=useParams()
  const studentId=params?.studentId as string
  const [student,setStudent]=useState<any>(null)
  const [goals,setGoals]=useState<any[]>([])
  const [sessions,setSessions]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [notFound,setNotFound]=useState(false)
  const supabase=createClient()

  useEffect(()=>{
    if(!studentId) return
    ;(async()=>{
      const {data:ks}=await supabase.from('kumon_students')
        .select('*').eq('id',studentId).single()
      if(!ks){setNotFound(true);setLoading(false);return}
      const [{data:g},{data:s}]=await Promise.all([
        supabase.from('kumon_goals').select('*').eq('student_id',studentId).eq('status','active'),
        supabase.from('kumon_sessions').select('*').eq('student_id',studentId).eq('present',true).order('session_date',{ascending:false}).limit(20),
      ])
      setStudent(ks); setGoals(g||[]); setSessions(s||[])
      setLoading(false)
    })()
  },[studentId])

  if(loading) return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f172a'}}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
        <div style={{width:48,height:48,border:'4px solid #0077B6',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
        <div style={{color:'rgba(255,255,255,0.5)',fontSize:13}}>Loading progress…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if(notFound) return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f172a',flexDirection:'column',gap:16}}>
      <div style={{fontSize:64}}>🔍</div>
      <div style={{color:'white',fontWeight:800,fontSize:20}}>Student not found</div>
      <div style={{color:'rgba(255,255,255,0.5)',fontSize:14}}>This link may have expired or be incorrect.</div>
    </div>
  )

  const grade=student?.grade
  const gradeNum=grade?parseInt(grade.replace(/\D/g,''))||null:null
  const mathGoal=goals.find(g=>g.subject==='math')
  const readGoal=goals.find(g=>g.subject==='reading')
  const recentSess=sessions.slice(0,5)
  const totalWs=sessions.reduce((a:number,s:any)=>a+(s.math_data?.done||0)+(s.reading_data?.done||0),0)
  const allScores=sessions.flatMap((s:any)=>[...(s.math_data?.scores||[]),...(s.reading_data?.scores||[])]).filter((v:any)=>v!=null)
  const overallAvg=allScores.length?Math.round(allScores.reduce((a:number,b:number)=>a+b,0)/allScores.length):null

  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0f172a 0%,#1e3a8a 45%,#0077B6 100%)'}}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(0,119,182,0.3)}50%{box-shadow:0 0 40px rgba(0,119,182,0.6)}}
        .fade{animation:fadeUp 0.6s ease forwards;opacity:0}
      `}</style>

      {/* Hero */}
      <div style={{maxWidth:640,margin:'0 auto',padding:'40px 20px 0'}}>
        {/* Centre branding */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:32}} className="fade">
          <img src="/kumon-logo.png" alt="Kumon" style={{height:36,borderRadius:8}}/>
          <div>
            <div style={{color:'white',fontWeight:700,fontSize:13}}>Kumon Brookswood</div>
            <div style={{color:'rgba(255,255,255,0.5)',fontSize:11}}>Learning Centre · Langley, BC</div>
          </div>
        </div>

        {/* Student hero card */}
        <div style={{background:'rgba(255,255,255,0.08)',backdropFilter:'blur(20px)',borderRadius:24,
          border:'1px solid rgba(255,255,255,0.15)',padding:'28px 24px',marginBottom:20,animation:'fadeUp 0.5s ease forwards',opacity:0}}>
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20}}>
            <div style={{width:64,height:64,borderRadius:'50%',
              background:'linear-gradient(135deg,#0077B6,#7c3aed)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:28,fontWeight:900,color:'white',animation:'glow 3s ease infinite',flexShrink:0}}>
              {student.name[0]}
            </div>
            <div>
              <div style={{color:'white',fontWeight:900,fontSize:24,lineHeight:1.1}}>{student.name}</div>
              <div style={{color:'rgba(255,255,255,0.6)',fontSize:13,marginTop:4}}>
                {grade?`Grade ${grade} · `:''}Student Progress Report
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
            {[
              {val:sessions.length,label:'Sessions',icon:'📅'},
              {val:totalWs,label:'Worksheets',icon:'📝'},
              {val:overallAvg?`${overallAvg}%`:'—',label:'Avg Score',icon:'⭐'},
            ].map((st,i)=>(
              <div key={i} style={{background:'rgba(255,255,255,0.1)',borderRadius:12,padding:'12px 8px',textAlign:'center'}}>
                <div style={{fontSize:18}}>{st.icon}</div>
                <div style={{fontWeight:900,fontSize:20,color:'white',marginTop:4}}>{st.val}</div>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',marginTop:2}}>{st.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Goal cards */}
        {(mathGoal||readGoal)&&(
          <div style={{marginBottom:20}} className="fade" style={{animationDelay:'0.1s',opacity:0}}>
            <div style={{color:'rgba(255,255,255,0.6)',fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:12}}>🎯 1-YEAR GOALS</div>
            <div style={{display:'grid',gridTemplateColumns:mathGoal&&readGoal?'1fr 1fr':'1fr',gap:12}}>
              {[mathGoal&&{goal:mathGoal,sub:'math',color:'#3b82f6',bg:'rgba(59,130,246,0.15)',label:'📐 Math'},
                readGoal&&{goal:readGoal,sub:'reading',color:'#ec4899',bg:'rgba(236,72,153,0.15)',label:'📖 Reading'}]
                .filter(Boolean).map(({goal,sub,color,bg,label}:any)=>{
                const seq=sub==='math'?MATH_SEQ:READ_SEQ
                const curLvl=sub==='math'?student.math_level:student.reading_level
                const curWs=sub==='math'?student.math_worksheet:student.reading_worksheet
                const pct=curLvl&&goal.start_level?levelProgress(seq,goal.start_level,goal.start_worksheet,curLvl,curWs||1,goal.target_level):0
                const ms=gradeNum?milestoneFor(sub,gradeNum,curLvl||'A'):null
                const td=goal.target_date?new Date(goal.target_date).toLocaleDateString('en-CA',{month:'long',year:'numeric'}):null
                const dLeft=goal.target_date?Math.max(0,Math.round((new Date(goal.target_date).getTime()-Date.now())/86400000)):null

                return(
                <div key={sub} style={{background:bg,backdropFilter:'blur(10px)',borderRadius:20,
                  border:`1px solid ${color}40`,padding:'20px 18px',position:'relative',overflow:'hidden'}}>
                  <div style={{position:'absolute',top:-30,right:-30,width:100,height:100,borderRadius:'50%',
                    background:color+'20',filter:'blur(20px)'}}/>
                  <div style={{fontSize:11,fontWeight:800,color,letterSpacing:1,marginBottom:14}}>{label}</div>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                    <div style={{position:'relative',flexShrink:0}}>
                      <ProgressRing pct={pct} color={color} size={80}/>
                      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
                        fontWeight:900,fontSize:15,color:'white'}}>{pct}%</div>
                    </div>
                    <div>
                      <div style={{fontWeight:900,fontSize:20,color:'white',lineHeight:1.1}}>
                        {curLvl} <span style={{color:'rgba(255,255,255,0.4)',fontSize:14}}>→</span> {goal.target_level}
                      </div>
                      {td&&<div style={{fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:4}}>Target: {td}</div>}
                      {dLeft!=null&&<div style={{fontSize:11,color,marginTop:2,fontWeight:700}}>
                        {dLeft>0?`${dLeft} days to go`:'🎉 Goal reached!'}
                      </div>}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{background:'rgba(255,255,255,0.1)',borderRadius:6,height:6,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:6,background:`linear-gradient(90deg,${color},${color}80)`,
                      width:`${pct}%`,transition:'width 1.5s cubic-bezier(0.34,1.56,0.64,1)'}}/>
                  </div>
                  {ms&&(
                    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:12,
                      background:'rgba(255,255,255,0.1)',borderRadius:10,padding:'6px 10px',width:'fit-content'}}>
                      <span style={{fontSize:16}}>{ms.medal}</span>
                      <span style={{fontSize:11,fontWeight:700,color:'white'}}>{ms.label}</span>
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        )}

        {/* Recent sessions */}
        {recentSess.length>0&&(
          <div style={{background:'rgba(255,255,255,0.97)',borderRadius:20,overflow:'hidden',marginBottom:20}}
            className="fade" style={{animationDelay:'0.2s',opacity:0}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:11,fontWeight:800,color:'#94a3b8',letterSpacing:1}}>RECENT SESSIONS</div>
            </div>
            {recentSess.map((s:any,i:number)=>{
              const mAvg=avgScore(s.math_data?.scores),rAvg=avgScore(s.reading_data?.scores)
              const mDone=s.math_data?.done||0,rDone=s.reading_data?.done||0
              const dt=new Date(s.session_date+'T12:00:00').toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'})
              const comment=[...(s.selected_keywords||[]).map((k:string)=>k.replace(/^[\p{Emoji}\s]+/u,'').trim()),s.custom_comment||''].filter(Boolean).join(' · ')
              return(
                <div key={i} style={{padding:'14px 20px',borderBottom:i<recentSess.length-1?'1px solid #f8fafc':'none'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <div style={{fontWeight:700,color:'#1e293b',fontSize:13}}>{dt}</div>
                    <div style={{display:'flex',gap:5}}>
                      {mDone>0&&mAvg!=null&&<span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,
                        background:mAvg===100?'#dcfce7':mAvg>=95?'#dbeafe':'#fef3c7',
                        color:mAvg===100?'#16a34a':mAvg>=95?'#1d4ed8':'#d97706'}}>📐{mAvg}%</span>}
                      {rDone>0&&rAvg!=null&&<span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,
                        background:rAvg===100?'#dcfce7':rAvg>=95?'#fce7f3':'#fef3c7',
                        color:rAvg===100?'#16a34a':rAvg>=95?'#be185d':'#d97706'}}>📖{rAvg}%</span>}
                    </div>
                  </div>
                  <div style={{fontSize:12,color:'#64748b'}}>
                    {mDone>0&&`📐 ${mDone} WS · ${s.math_data?.fromLevel}${s.math_data?.fromWorksheet}  `}
                    {rDone>0&&`📖 ${rDone} WS · ${s.reading_data?.fromLevel}${s.reading_data?.fromWorksheet}`}
                  </div>
                  {comment&&<div style={{fontSize:11,color:'#94a3b8',marginTop:4,fontStyle:'italic'}}>"{comment}"</div>}
                  {(s.kumon_money||0)>0&&<div style={{fontSize:11,color:'#7c3aed',fontWeight:700,marginTop:4}}>💰 +${s.kumon_money} Kumon Money</div>}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{textAlign:'center',padding:'24px 0',color:'rgba(255,255,255,0.3)',fontSize:12}}>
          <div style={{marginBottom:4}}>Kumon Brookswood Learning Centre</div>
          <div>4043 200 St, Langley BC · kumon-brookswood.vercel.app</div>
        </div>
      </div>
    </div>
  )
}
