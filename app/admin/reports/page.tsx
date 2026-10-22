'use client'
// @ts-nocheck
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const supabase = createClient()

function fmt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function duration(inAt: string | null, outAt: string | null) {
  if (!inAt || !outAt) return '—'
  const mins = Math.round((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000)
  if (mins < 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function durationMins(inAt: string | null, outAt: string | null) {
  if (!inAt || !outAt) return null
  const mins = Math.round((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000)
  return mins < 0 ? null : mins
}

export default function AttendanceReports() {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)
  const [rows, setRows] = useState<any[]>([])
  const [students, setStudents] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [sortCol, setSortCol] = useState<string>('checkin_date')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [search, setSearch] = useState('')

  useEffect(() => { loadStudents() }, [])
  useEffect(() => { if (Object.keys(students).length) loadReport() }, [from, to, students])

  async function loadStudents() {
    const { data } = await supabase.from('kumon_students').select('id, name, math_level, reading_level')
    const map: Record<string, any> = {}
    for (const s of data || []) map[s.id] = s
    setStudents(map)
  }

  async function loadReport() {
    setLoading(true)
    const { data, error } = await supabase
      .from('kiosk_checkins')
      .select('*')
      .gte('checkin_date', from)
      .lte('checkin_date', to)
      .order('checkin_date', { ascending: false })
    if (!error) setRows(data || [])
    setLoading(false)
  }

  function sortedRows() {
    let r = [...rows]
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(row => {
        const s = students[row.student_id]
        return s?.name?.toLowerCase().includes(q)
      })
    }
    r.sort((a, b) => {
      let av: any, bv: any
      if (sortCol === 'name') {
        av = students[a.student_id]?.name || ''
        bv = students[b.student_id]?.name || ''
      } else if (sortCol === 'duration') {
        av = durationMins(a.checked_in_at, a.checked_out_at) ?? -1
        bv = durationMins(b.checked_in_at, b.checked_out_at) ?? -1
      } else {
        av = a[sortCol] || ''
        bv = b[sortCol] || ''
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return r
  }

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function arrow(col: string) {
    if (sortCol !== col) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  function downloadCSV() {
    const displayed = sortedRows()
    const headers = ['Date', 'Student', 'Math Level', 'Reading Level', 'Check-In', 'Check-Out', 'Duration (mins)']
    const csvRows = [headers.join(',')]
    for (const row of displayed) {
      const s = students[row.student_id] || {}
      const mins = durationMins(row.checked_in_at, row.checked_out_at)
      csvRows.push([
        row.checkin_date,
        `"${s.name || row.student_id}"`,
        s.math_level || '',
        s.reading_level || '',
        fmt(row.checked_in_at),
        fmt(row.checked_out_at),
        mins ?? '',
      ].join(','))
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const displayed = sortedRows()
  const totalSessions = displayed.length
  const completed = displayed.filter(r => r.checked_out_at).length
  const avgMins = (() => {
    const valid = displayed.map(r => durationMins(r.checked_in_at, r.checked_out_at)).filter(m => m !== null) as number[]
    if (!valid.length) return null
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
  })()

  const th = {
    padding: '10px 14px',
    textAlign: 'left' as const,
    fontSize: 12,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    borderBottom: '2px solid #e2e8f0',
    cursor: 'pointer',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  }
  const td = {
    padding: '10px 14px',
    fontSize: 14,
    borderBottom: '1px solid #f1f5f9',
    color: '#1e293b',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1e3a5f', color: 'white', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link href="/admin/dashboard" style={{ color: 'white', textDecoration: 'none', fontSize: 20 }}>←</Link>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Attendance Reports</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Kumon Brookswood — kiosk check-in data</div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>FROM</div>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: 14 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>TO</div>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: 14 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>SEARCH</div>
            <input type="text" placeholder="Student name..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: 14, width: 180 }} />
          </div>
          <button onClick={downloadCSV}
            style={{ padding: '9px 18px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⬇ Download CSV
          </button>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Check-ins', value: totalSessions },
            { label: 'Checked Out', value: completed },
            { label: 'Still In / Unknown', value: totalSessions - completed },
            { label: 'Avg Time (mins)', value: avgMins ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'white', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#1e3a5f' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No records found for this date range.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={th} onClick={() => toggleSort('checkin_date')}>Date{arrow('checkin_date')}</th>
                    <th style={th} onClick={() => toggleSort('name')}>Student{arrow('name')}</th>
                    <th style={th}>Math</th>
                    <th style={th}>Reading</th>
                    <th style={th} onClick={() => toggleSort('checked_in_at')}>Check-In{arrow('checked_in_at')}</th>
                    <th style={th} onClick={() => toggleSort('checked_out_at')}>Check-Out{arrow('checked_out_at')}</th>
                    <th style={th} onClick={() => toggleSort('duration')}>Time Spent{arrow('duration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((row, i) => {
                    const s = students[row.student_id] || {}
                    const mins = durationMins(row.checked_in_at, row.checked_out_at)
                    const isLong = mins !== null && mins > 90
                    const isShort = mins !== null && mins < 30
                    return (
                      <tr key={row.id || i} style={{ background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                        <td style={td}>{row.checkin_date}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{s.name || row.student_id}</td>
                        <td style={{ ...td, color: '#6366f1', fontSize: 12 }}>{s.math_level || '—'}</td>
                        <td style={{ ...td, color: '#0ea5e9', fontSize: 12 }}>{s.reading_level || '—'}</td>
                        <td style={td}>{fmt(row.checked_in_at)}</td>
                        <td style={{ ...td, color: row.checked_out_at ? '#1e293b' : '#94a3b8' }}>
                          {row.checked_out_at ? fmt(row.checked_out_at) : 'Not checked out'}
                        </td>
                        <td style={{ ...td }}>
                          {mins !== null ? (
                            <span style={{
                              background: isLong ? '#fef2f2' : isShort ? '#fffbeb' : '#f0fdf4',
                              color: isLong ? '#dc2626' : isShort ? '#d97706' : '#16a34a',
                              padding: '3px 8px', borderRadius: 6, fontWeight: 600, fontSize: 13
                            }}>
                              {duration(row.checked_in_at, row.checked_out_at)}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
          {displayed.length} record{displayed.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
