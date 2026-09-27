import { useEffect, useState, useMemo } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { eventTypeDisplay } from '../../domain/eventTypes'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import { registrantService } from '../../services/registrantService'
import { eventService } from '../../services/eventService'
import { interviewService } from '../../services/interviewService'
import { employmentService } from '../../services/employmentService'
import { applicationService } from '../../services/applicationService'

const COLORS = ['#0b6efd', '#2ea44f', '#d4820a', '#c0392b', '#8e44ad', '#16a085', '#f39c12', '#2c3e50']

// ─── Shared Components ───
function StatCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-75">{label}</p>
      <p className="mt-1 text-3xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  )
}

function FunnelRow({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="w-32 text-sm font-medium text-slate-700">{label}</div>
      <div className="flex-1">
        <div className="h-8 rounded-lg bg-slate-100 overflow-hidden">
          <div className="h-full rounded-lg flex items-center px-3 text-xs font-bold text-white" style={{ width: `${pct}%`, backgroundColor: color }}>
            {value.toLocaleString()} ({pct}%)
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {children}
    </div>
  )
}

function PivotTable({ columns, data, exportFileName }) {
  function handleExport() {
    if (!data || data.length === 0) { toast.info('No data'); return }
    const rows = data.map(row => {
      const obj = {}
      columns.forEach(c => { obj[c.label] = row[c.key] ?? '' })
      return obj
    })
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${exportFileName}-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${data.length} rows`)
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <span className="text-xs text-slate-500">{data.length} row(s)</span>
        <button onClick={handleExport} disabled={data.length === 0} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              {columns.map(c => <th key={c.key} className="px-4 py-2">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {columns.map(c => <td key={c.key} className="px-4 py-2 text-slate-700">{row[c.key]}</td>)}
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-slate-400">No data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AdminReports() {
  const [registrants, setRegistrants] = useState([])
  const [interviews, setInterviews] = useState([])
  const [vacancies, setVacancies] = useState([])
  const [events, setEvents] = useState([])
  const [applications, setApplications] = useState([])
  const [outcomes, setOutcomes] = useState([])
  const [ofwProfiles, setOfwProfiles] = useState([])
  const [workerProfiles, setWorkerProfiles] = useState([])
  const [_followUps, setFollowUps] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    let alive = true
    async function loadData() {
      setLoading(true)
      try {
        const [regData, intData, vacData, evData, appData, outcomeData, ofwData, workerData, followUpData] = await Promise.all([
          registrantService.listForReports(),
          interviewService.listForReports(),
          eventVacancyService.listForReports(),
          eventService.listAllAdmin(),
          applicationService.listForReports(),
          employmentService.listOutcomesForReports(),
          employmentService.listReturningOfw(),
          employmentService.listReturningWorkers(),
          employmentService.listFollowUps(),
        ])
        if (!alive) return
        setRegistrants(regData || [])
        setInterviews(intData || [])
        setVacancies(vacData || [])
        setEvents(evData || [])
        setApplications(appData || [])
        setOutcomes(outcomeData || [])
        setOfwProfiles(ofwData || [])
        setWorkerProfiles(workerData || [])
        setFollowUps(followUpData || [])
      } catch (err) {
        console.error(err)
        toast.error('Failed to load report data')
      } finally {
        if (alive) setLoading(false)
      }
    }
    loadData()
    return () => { alive = false }
  }, [])

  // ─── Filters ───
  const reg = useMemo(() => selectedEvent ? registrants.filter(r => r.event_id === selectedEvent) : registrants, [registrants, selectedEvent])
  const ints = useMemo(() => selectedEvent ? interviews.filter(i => i.event_id === selectedEvent) : interviews, [interviews, selectedEvent])
  const vacs = useMemo(() => selectedEvent ? vacancies.filter(v => v.event_id === selectedEvent) : vacancies, [vacancies, selectedEvent])
  const apps = useMemo(() => {
    if (!selectedEvent) return applications
    return applications.filter(a => a.registrants?.event_id === selectedEvent)
  }, [applications, selectedEvent])
  const emOutcomes = useMemo(() => {
    if (!selectedEvent) return outcomes
    return outcomes.filter(o => o.applications?.registrants?.event_id === selectedEvent)
  }, [outcomes, selectedEvent])

  // ─── Overview: Employment Funnel ───
  const funnel = useMemo(() => {
    const totalRegistered = reg.length
    const attended = reg.filter(r => r.check_in_status === 'checked_in').length
    const applied = apps.length
    const totalInterviews = ints.length
    const offered = emOutcomes.filter(o => o.outcome === 'hired' || o.outcome === 'pending' || o.outcome === 'offer_declined').length
    const hired = emOutcomes.filter(o => o.outcome === 'hired').length
    const hots = ints.filter(i => i.interview_status === 'hots').length
    const qualified = ints.filter(i => i.interview_status === 'qualified').length
    const nearHire = ints.filter(i => i.interview_status === 'near_hire').length
    const notQualified = ints.filter(i => i.interview_status === 'not_qualified').length
    const attendanceRate = totalRegistered > 0 ? Math.round((attended / totalRegistered) * 100) : 0
    const hireRate = totalInterviews > 0 ? Math.round((hired / totalInterviews) * 100) : 0
    return { totalRegistered, attended, applied, totalInterviews, offered, hired, hots, qualified, nearHire, notQualified, attendanceRate, hireRate }
  }, [reg, ints, apps, emOutcomes])

  // ─── Priority Groups ───
  const priorityGroups = useMemo(() => {
    const groups = [
      { key: 'returning_ofw', label: 'Returning OFW', icon: '✈️' },
      { key: 'returning_worker', label: 'Returning Worker – Cagayan', icon: '🔄' },
      { key: 'has_disability', label: 'PWD', icon: '♿' },
      { key: 'first_time_jobseeker', label: 'First-Time Jobseeker', icon: '🆕' },
    ]
    return groups.map(g => {
      const members = reg.filter(r => r[g.key])
      const memberIds = new Set(members.map(r => r.id))
      const memberInterviews = ints.filter(i => memberIds.has(i.registrant_id))
      const memberApps = apps.filter(a => memberIds.has(a.registrant_id))
      const memberOutcomes = emOutcomes.filter(o => memberIds.has(o.applications?.registrants?.id))
      const hired = memberOutcomes.filter(o => o.outcome === 'hired').length
      const offered = memberOutcomes.filter(o => o.outcome === 'hired' || o.outcome === 'pending' || o.outcome === 'offer_declined').length
      const attended = members.filter(r => r.check_in_status === 'checked_in').length
      const hots = memberInterviews.filter(i => i.interview_status === 'hots').length
      const qualified = memberInterviews.filter(i => i.interview_status === 'qualified').length
      const nearHire = memberInterviews.filter(i => i.interview_status === 'near_hire').length
      return {
        ...g,
        registered: members.length,
        attended,
        attendanceRate: members.length > 0 ? Math.round((attended / members.length) * 100) : 0,
        applied: memberApps.length,
        interviewed: memberInterviews.length,
        offered,
        hired,
        hots,
        qualified,
        nearHire,
      }
    })
  }, [reg, ints, apps, emOutcomes])

  // ─── Returning OFW Report ───
  const returningOfwReport = useMemo(() => {
    return ofwProfiles.map(p => ({
      registrant_id: p.registrant_id,
      name: reg.find(r => r.id === p.registrant_id)?.unique_id || '',
      country_last_worked: p.country_last_worked || '',
      previous_occupation: p.previous_occupation || '',
      previous_industry: p.previous_industry || '',
      years_abroad: p.years_abroad || '',
      date_returned: p.date_returned || '',
      desired_local_occupation: p.desired_local_occupation || '',
      applications: apps.filter(a => a.registrant_id === p.registrant_id).length,
      interviews: ints.filter(i => i.registrant_id === p.registrant_id).length,
      hires: emOutcomes.filter(o => o.applications?.registrant_id === p.registrant_id && o.outcome === 'hired').length,
    }))
  }, [ofwProfiles, apps, ints, emOutcomes, reg])

  // ─── Returning Worker – Cagayan Report ───
  const returningWorkerReport = useMemo(() => {
    return workerProfiles.map(p => ({
      registrant_id: p.registrant_id,
      name: reg.find(r => r.id === p.registrant_id)?.unique_id || '',
      home_province: p.home_province || '',
      home_municipality: p.home_municipality || '',
      previous_work_region: p.previous_work_region || '',
      previous_work_province: p.previous_work_province || '',
      previous_work_city: p.previous_work_city || '',
      previous_occupation: p.previous_occupation || '',
      previous_industry: p.previous_industry || '',
      return_status: p.return_status || '',
      desired_cagayan_occupation: p.desired_cagayan_occupation || '',
      applications: apps.filter(a => a.registrant_id === p.registrant_id).length,
      interviews: ints.filter(i => i.registrant_id === p.registrant_id).length,
      hires: emOutcomes.filter(o => o.applications?.registrant_id === p.registrant_id && o.outcome === 'hired').length,
    }))
  }, [workerProfiles, apps, ints, emOutcomes, reg])

  // ─── PWD Report ───
  const pwdReport = useMemo(() => {
    const pwdRegistrants = reg.filter(r => r.has_disability)
    const pwdIds = new Set(pwdRegistrants.map(r => r.id))
    return {
      registrants: pwdRegistrants.length,
      attended: pwdRegistrants.filter(r => r.check_in_status === 'checked_in').length,
      applications: apps.filter(a => pwdIds.has(a.registrant_id)).length,
      interviews: ints.filter(i => pwdIds.has(i.registrant_id)).length,
      offers: emOutcomes.filter(o => pwdIds.has(o.applications?.registrant_id) && (o.outcome === 'hired' || o.outcome === 'pending' || o.outcome === 'offer_declined')).length,
      hires: emOutcomes.filter(o => pwdIds.has(o.applications?.registrant_id) && o.outcome === 'hired').length,
      accommodation_needed: pwdRegistrants.filter(r => r.accommodation_needed).length,
    }
  }, [reg, apps, ints, emOutcomes])

  // ─── First-Time Jobseeker Report ───
  const firstTimeJobseekerReport = useMemo(() => {
    const ftjRegistrants = reg.filter(r => r.first_time_jobseeker)
    const ftjIds = new Set(ftjRegistrants.map(r => r.id))
    return {
      registrants: ftjRegistrants.length,
      attended: ftjRegistrants.filter(r => r.check_in_status === 'checked_in').length,
      applications: apps.filter(a => ftjIds.has(a.registrant_id)).length,
      interviews: ints.filter(i => ftjIds.has(i.registrant_id)).length,
      offers: emOutcomes.filter(o => ftjIds.has(o.applications?.registrant_id) && (o.outcome === 'hired' || o.outcome === 'pending' || o.outcome === 'offer_declined')).length,
      hires: emOutcomes.filter(o => ftjIds.has(o.applications?.registrant_id) && o.outcome === 'hired').length,
      schools: ftjRegistrants.filter(r => r.first_time_school).length,
      ojt_experience: ftjRegistrants.filter(r => r.first_time_ojt_experience).length,
    }
  }, [reg, apps, ints, emOutcomes])

  // ─── Geographic Analytics ───
  const byMunicipality = useMemo(() => {
    const map = {}
    reg.forEach(r => {
      const key = r.municipality_city || 'Unknown'
      if (!map[key]) map[key] = { municipality: key, total: 0, checkedIn: 0, interviews: 0, hots: 0 }
      map[key].total++
      if (r.check_in_status === 'checked_in') map[key].checkedIn++
    })
    ints.forEach(i => {
      const key = i.registrants?.municipality_city || 'Unknown'
      if (map[key]) {
        map[key].interviews++
        if (i.interview_status === 'hots') map[key].hots++
      }
    })
    return Object.values(map).map(r => ({
      ...r,
      checkInRate: r.total > 0 ? Math.round((r.checkedIn / r.total) * 100) : 0,
      placementRate: r.interviews > 0 ? Math.round((r.hots / r.interviews) * 100) : 0,
    })).sort((a, b) => b.total - a.total)
  }, [reg, ints])

  const byProvince = useMemo(() => {
    const map = {}
    reg.forEach(r => {
      const key = r.province || 'Unknown'
      if (!map[key]) map[key] = { province: key, total: 0, checkedIn: 0 }
      map[key].total++
      if (r.check_in_status === 'checked_in') map[key].checkedIn++
    })
    return Object.values(map).map(r => ({ ...r, rate: r.total > 0 ? Math.round((r.checkedIn / r.total) * 100) : 0 })).sort((a, b) => b.total - a.total)
  }, [reg])

  // ─── Skills Gap ───
  const skillsGap = useMemo(() => {
    const skillMap = {}
    reg.forEach(r => {
      const skills = (r.course_program || '').split(/[,;/]/).map(s => s.trim()).filter(Boolean)
      skills.forEach(s => { skillMap[s] = (skillMap[s] || 0) + 1 })
    })
    const demandMap = {}
    vacs.forEach(v => {
      const quals = (v.vacancy_definitions?.qualifications || '').split(/[,;/]/).map(s => s.trim()).filter(Boolean)
      quals.forEach(q => { demandMap[q] = (demandMap[q] || 0) + (v.slots_offered || 0) })
    })
    const allSkills = new Set([...Object.keys(skillMap), ...Object.keys(demandMap)])
    return [...allSkills].map(skill => ({
      skill,
      jobseekers: skillMap[skill] || 0,
      vacancies: demandMap[skill] || 0,
      gap: (skillMap[skill] || 0) - (demandMap[skill] || 0),
    })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 20)
  }, [reg, vacs])

  // ─── Employment Outcomes ───
  const interviewOutcomes = useMemo(() => {
    const byCompany = {}
    ints.forEach(i => {
      const company = i.company || 'Unknown'
      if (!byCompany[company]) byCompany[company] = { company: company, total: 0, hots: 0, qualified: 0, nearHire: 0, notQualified: 0 }
      byCompany[company].total++
      if (i.interview_status === 'hots') byCompany[company].hots++
      else if (i.interview_status === 'qualified') byCompany[company].qualified++
      else if (i.interview_status === 'near_hire') byCompany[company].nearHire++
      else if (i.interview_status === 'not_qualified') byCompany[company].notQualified++
    })
    return Object.values(byCompany).map(c => ({
      ...c,
      placementRate: c.total > 0 ? Math.round((c.hots / c.total) * 100) : 0,
    })).sort((a, b) => b.hots - a.hots)
  }, [ints])

  // ─── Employment by Preference ───
  const byPreference = useMemo(() => {
    const map = { Local: 0, Overseas: 0, Both: 0 }
    ints.forEach(i => { const p = i.registrants?.employment_preference || 'Unknown'; map[p] = (map[p] || 0) + 1 })
    return [
      { name: 'Local', value: map.Local || 0 },
      { name: 'Overseas', value: map.Overseas || 0 },
      { name: 'Both', value: map.Both || 0 },
    ]
  }, [ints])

  // ─── Event Summary ───
  const eventSummary = useMemo(() => {
    return events.map(ev => {
      const evReg = registrants.filter(r => r.event_id === ev.id)
      const evInts = interviews.filter(i => i.event_id === ev.id)
      const evVacs = vacancies.filter(v => v.event_id === ev.id)
      const totalSlots = evVacs.reduce((s, v) => s + (v.slots_offered || 0), 0)
      const filledSlots = evVacs.reduce((s, v) => s + (v.slots_filled || 0), 0)
      return {
        event: ev.event_name,
        date: ev.event_date,
        location: ev.location,
        registered: evReg.length,
        attended: evReg.filter(r => r.check_in_status === 'checked_in').length,
        walkins: evReg.filter(r => r.registration_type === 'walkin').length,
        interviews: evInts.length,
        hots: evInts.filter(i => i.interview_status === 'hots').length,
        vacancies: evVacs.length,
        totalSlots,
        filledSlots,
        attendanceRate: evReg.length > 0 ? Math.round((evReg.filter(r => r.check_in_status === 'checked_in').length / evReg.length) * 100) : 0,
        fillRate: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0,
      }
    }).sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [events, registrants, interviews, vacancies])

  const tabs = [
    { key: 'overview', label: '📊 Overview & Funnel' },
    { key: 'priority', label: '👥 Priority Groups' },
    { key: 'ofw', label: '✈️ Returning OFW' },
    { key: 'worker', label: '🔄 Returning Worker' },
    { key: 'pwd', label: '♿ PWD' },
    { key: 'ftj', label: '🆕 First-Time Jobseeker' },
    { key: 'geographic', label: '📍 Geographic' },
    { key: 'skills', label: '🔧 Skills Gap' },
    { key: 'outcomes', label: '🎯 Outcomes' },
    { key: 'events', label: '📅 Events' },
  ]

  const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="grid min-h-screen place-items-center text-slate-500">Loading reports...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employment, Job Fair & Workforce Reintegration Reports</h1>
          <p className="text-sm text-slate-600">{registrants.length} registrants • {interviews.length} interviews • {vacancies.length} vacancies</p>
        </div>
      </div>

      {/* Event Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Event:</label>
        <select
          value={selectedEvent || ''}
          onChange={e => setSelectedEvent(e.target.value || null)}
          className={inputCls + ' max-w-xs'}
        >
          <option value="">All Events</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>{ev.event_name} — {format(new Date(ev.event_date), 'MMM d, yyyy')} — {eventTypeDisplay(ev)}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* OVERVIEW & FUNNEL */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Registrants" value={funnel.totalRegistered} color="blue" />
            <StatCard label="Attended" value={funnel.attended} sub={`${funnel.attendanceRate}%`} color="green" />
            <StatCard label="Applied" value={funnel.applied} color="purple" />
            <StatCard label="Interviewed" value={funnel.totalInterviews} color="indigo" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Hired (Verified)" value={funnel.hired} sub={`${funnel.hireRate}% hire rate`} color="emerald" />
            <StatCard label="Qualified (Interview)" value={funnel.qualified} color="blue" />
            <StatCard label="Near Hires" value={funnel.nearHire} color="amber" />
            <StatCard label="Not Qualified" value={funnel.notQualified} color="red" />
          </div>

          {/* Employment Funnel */}
          <Section title="Employment Funnel">
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <FunnelRow label="Registered" value={funnel.totalRegistered} total={funnel.totalRegistered} color="#0b6efd" />
              <FunnelRow label="Attended" value={funnel.attended} total={funnel.totalRegistered} color="#2ea44f" />
              <FunnelRow label="Applied" value={funnel.applied} total={funnel.totalRegistered} color="#8e44ad" />
              <FunnelRow label="Interviewed" value={funnel.totalInterviews} total={funnel.totalRegistered} color="#d4820a" />
              <FunnelRow label="Hired (Verified)" value={funnel.hired} total={funnel.totalRegistered} color="#c0392b" />
            </div>
          </Section>

          {/* Interview Outcome Summary */}
          <Section title="Interview Outcomes">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase text-emerald-700">Qualified</p>
                <p className="text-2xl font-bold text-emerald-900">{funnel.qualified}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase text-amber-700">Near Hire</p>
                <p className="text-2xl font-bold text-amber-900">{funnel.nearHire}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase text-blue-700">HOTS</p>
                <p className="text-2xl font-bold text-blue-900">{funnel.hots}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-xs font-semibold uppercase text-red-700">Not Qualified</p>
                <p className="text-2xl font-bold text-red-900">{funnel.notQualified}</p>
              </div>
            </div>
          </Section>

          {/* Interview Outcomes by Company */}
          <Section title="Employment Outcomes by Employer">
            <PivotTable
              columns={[
                { key: 'company', label: 'Company' },
                { key: 'total', label: 'Total' },
                { key: 'hots', label: 'HOTS' },
                { key: 'qualified', label: 'Qualified' },
                { key: 'nearHire', label: 'Near Hire' },
                { key: 'notQualified', label: 'Not Qualified' },
                { key: 'placementRate', label: 'Placement %' },
              ]}
              data={interviewOutcomes.map(o => ({ ...o, placementRate: o.placementRate + '%' }))}
              exportFileName="employment-outcomes"
            />
          </Section>

          {/* Local vs Overseas */}
          <Section title="Interviews by Employment Preference">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={byPreference}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8e44ad" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <PivotTable columns={[{ key: 'name', label: 'Preference' }, { key: 'value', label: 'Count' }]} data={byPreference} exportFileName="local-vs-overseas" />
            </div>
          </Section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* PRIORITY GROUPS */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'priority' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {priorityGroups.map(g => (
              <div key={g.key} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{g.icon}</span>
                  <span className="text-3xl font-bold text-slate-900">{g.registered}</span>
                </div>
                <p className="text-sm font-semibold text-slate-700">{g.label}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <div className="flex justify-between"><span>Attended</span><span className="font-medium text-slate-700">{g.attended}</span></div>
                  <div className="flex justify-between"><span>Applied</span><span className="font-medium text-slate-700">{g.applied}</span></div>
                  <div className="flex justify-between"><span>Interviewed</span><span className="font-medium text-slate-700">{g.interviewed}</span></div>
                  <div className="flex justify-between"><span>Offers</span><span className="font-medium text-slate-700">{g.offered}</span></div>
                  <div className="flex justify-between"><span>Hired</span><span className="font-bold text-green-700">{g.hired}</span></div>
                </div>
              </div>
            ))}
          </div>

          <Section title="Priority Group Summary">
            <PivotTable
              columns={[
                { key: 'group', label: 'Group' },
                { key: 'registered', label: 'Registered' },
                { key: 'attended', label: 'Attended' },
                { key: 'applied', label: 'Applied' },
                { key: 'interviewed', label: 'Interviewed' },
                { key: 'offered', label: 'Offered' },
                { key: 'hired', label: 'Hired' },
              ]}
              data={crossGroupData}
              exportFileName="priority-groups-summary"
            />
          </Section>

          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            <strong>Note:</strong> Priority groups may overlap — one person may qualify for multiple programs (e.g., a returning OFW who is also PWD). Groups are not mutually exclusive, so totals should not be summed as unique individuals.
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* RETURNING OFW */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ofw' && (
        <div className="space-y-6">
          <Section title="Returning OFW Report">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total OFWs" value={ofwProfiles.length} color="blue" />
              <StatCard label="Applying Locally" value={ofwProfiles.filter(p => p.wants_local_employment).length} color="green" />
              <StatCard label="Applied" value={apps.filter(a => ofwProfiles.some(p => p.registrant_id === a.registrant_id)).length} color="purple" />
              <StatCard label="Hired" value={emOutcomes.filter(o => ofwProfiles.some(p => p.registrant_id === o.applications?.registrant_id) && o.outcome === 'hired').length} color="emerald" />
            </div>
            <PivotTable
              columns={[
                { key: 'name', label: 'Unique ID' },
                { key: 'country_last_worked', label: 'Country' },
                { key: 'previous_occupation', label: 'Previous Occupation' },
                { key: 'years_abroad', label: 'Years Abroad' },
                { key: 'desired_local_occupation', label: 'Desired Local Occupation' },
                { key: 'applications', label: 'Applications' },
                { key: 'interviews', label: 'Interviews' },
                { key: 'hires', label: 'Hires' },
              ]}
              data={returningOfwReport}
              exportFileName="returning-ofw-report"
            />
          </Section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* RETURNING WORKER – CAGAYAN */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'worker' && (
        <div className="space-y-6">
          <Section title="Returning Worker – Cagayan Report">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Workers" value={workerProfiles.length} color="blue" />
              <StatCard label="Already Returned" value={workerProfiles.filter(p => p.return_status === 'already_returned').length} color="green" />
              <StatCard label="Applied" value={apps.filter(a => workerProfiles.some(p => p.registrant_id === a.registrant_id)).length} color="purple" />
              <StatCard label="Hired" value={emOutcomes.filter(o => workerProfiles.some(p => p.registrant_id === o.applications?.registrant_id) && o.outcome === 'hired').length} color="emerald" />
            </div>
            <PivotTable
              columns={[
                { key: 'name', label: 'Unique ID' },
                { key: 'home_municipality', label: 'Home Municipality' },
                { key: 'previous_work_region', label: 'Previous Work Region' },
                { key: 'previous_work_province', label: 'Previous Work Province' },
                { key: 'previous_occupation', label: 'Previous Occupation' },
                { key: 'return_status', label: 'Return Status' },
                { key: 'desired_cagayan_occupation', label: 'Desired Occupation' },
                { key: 'applications', label: 'Applications' },
                { key: 'interviews', label: 'Interviews' },
                { key: 'hires', label: 'Hires' },
              ]}
              data={returningWorkerReport}
              exportFileName="returning-worker-report"
            />
          </Section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* PWD REPORT */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pwd' && (
        <div className="space-y-6">
          <Section title="PWD Report">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="PWD Registrants" value={pwdReport.registrants} color="blue" />
              <StatCard label="Attended" value={pwdReport.attended} color="green" />
              <StatCard label="Applied" value={pwdReport.applications} color="purple" />
              <StatCard label="Hired" value={pwdReport.hires} color="emerald" />
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Total Registrants</span><span className="font-medium">{pwdReport.registrants}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Attended</span><span className="font-medium">{pwdReport.attended}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Applications</span><span className="font-medium">{pwdReport.applications}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Interviews</span><span className="font-medium">{pwdReport.interviews}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Offers</span><span className="font-medium">{pwdReport.offers}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Hired</span><span className="font-bold text-green-700">{pwdReport.hires}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Accommodation Needed</span><span className="font-medium">{pwdReport.accommodation_needed}</span></div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FIRST-TIME JOBSEEKER REPORT */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ftj' && (
        <div className="space-y-6">
          <Section title="First-Time Jobseeker Report">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Registrants" value={firstTimeJobseekerReport.registrants} color="blue" />
              <StatCard label="Attended" value={firstTimeJobseekerReport.attended} color="green" />
              <StatCard label="Applied" value={firstTimeJobseekerReport.applications} color="purple" />
              <StatCard label="Hired" value={firstTimeJobseekerReport.hires} color="emerald" />
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Total Registrants</span><span className="font-medium">{firstTimeJobseekerReport.registrants}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Attended</span><span className="font-medium">{firstTimeJobseekerReport.attended}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Applications</span><span className="font-medium">{firstTimeJobseekerReport.applications}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Interviews</span><span className="font-medium">{firstTimeJobseekerReport.interviews}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Offers</span><span className="font-medium">{firstTimeJobseekerReport.offers}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Hired</span><span className="font-bold text-green-700">{firstTimeJobseekerReport.hires}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Has School Info</span><span className="font-medium">{firstTimeJobseekerReport.schools}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Has OJT Experience</span><span className="font-medium">{firstTimeJobseekerReport.ojt_experience}</span></div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* GEOGRAPHIC ANALYTICS */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'geographic' && (
        <div className="space-y-6">
          <Section title="Registrations by Municipality">
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={byMunicipality.slice(0, 15)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="municipality" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" name="Registered" fill="#0b6efd" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="checkedIn" name="Attended" fill="#2ea44f" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="hots" name="HOTS" fill="#c0392b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <PivotTable
              columns={[
                { key: 'municipality', label: 'Municipality' },
                { key: 'total', label: 'Registered' },
                { key: 'checkedIn', label: 'Attended' },
                { key: 'checkInRate', label: 'Check-in %' },
                { key: 'interviews', label: 'Interviews' },
                { key: 'hots', label: 'HOTS' },
                { key: 'placementRate', label: 'Placement %' },
              ]}
              data={byMunicipality.map(r => ({ ...r, checkInRate: r.checkInRate + '%', placementRate: r.placementRate + '%' }))}
              exportFileName="geographic-municipality"
            />
          </Section>

          <Section title="Registrations by Province">
            <PivotTable
              columns={[
                { key: 'province', label: 'Province' },
                { key: 'total', label: 'Registered' },
                { key: 'checkedIn', label: 'Attended' },
                { key: 'rate', label: 'Attendance %' },
              ]}
              data={byProvince.map(r => ({ ...r, rate: r.rate + '%' }))}
              exportFileName="geographic-province"
            />
          </Section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SKILLS GAP */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          <Section title="Skills Gap Analysis — Jobseeker Skills vs Employer Demand">
            <p className="text-sm text-slate-600">Compares jobseeker course/program against vacancy qualifications. Negative gap = high demand, low supply. Positive gap = surplus.</p>
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={skillsGap.slice(0, 15)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" />
                  <YAxis type="category" dataKey="skill" tick={{ fontSize: 11 }} width={150} stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="jobseekers" name="Jobseekers" fill="#0b6efd" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="vacancies" name="Vacancies" fill="#c0392b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <PivotTable
              columns={[
                { key: 'skill', label: 'Skill / Program' },
                { key: 'jobseekers', label: 'Jobseekers' },
                { key: 'vacancies', label: 'Vacancies' },
                { key: 'gap', label: 'Gap (+/-)' },
              ]}
              data={skillsGap}
              exportFileName="skills-gap"
            />
          </Section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* EMPLOYMENT OUTCOMES */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'outcomes' && (
        <div className="space-y-6">
          <Section title="Interview Outcomes by Event">
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={events.map(ev => {
                  const evInts = interviews.filter(i => i.event_id === ev.id)
                  return {
                    event: ev.event_name,
                    total: evInts.length,
                    hots: evInts.filter(i => i.interview_status === 'hots').length,
                    qualified: evInts.filter(i => i.interview_status === 'qualified').length,
                    nearHire: evInts.filter(i => i.interview_status === 'near_hire').length,
                    notQualified: evInts.filter(i => i.interview_status === 'not_qualified').length,
                  }
                }).sort((a, b) => b.total - a.total)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="event" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="hots" name="HOTS" fill="#2ea44f" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="qualified" name="Qualified" fill="#0b6efd" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="nearHire" name="Near Hire" fill="#d4820a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="notQualified" name="Not Qualified" fill="#c0392b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Vacancy Fill Rates by Employer">
            <PivotTable
              columns={[
                { key: 'company', label: 'Company' },
                { key: 'position', label: 'Position' },
                { key: 'slotsOffered', label: 'Offered' },
                { key: 'slotsFilled', label: 'Filled' },
                { key: 'fillRate', label: 'Fill Rate' },
              ]}
              data={vacs.reduce((acc, v) => {
                const key = `${v.vacancy_definitions?.company_name} — ${v.vacancy_definitions?.position}`
                const existing = acc.find(a => a.key === key)
                if (existing) {
                  existing.slotsOffered += v.slots_offered || 0
                  existing.slotsFilled += v.slots_filled || 0
                } else {
                  acc.push({
                    key,
                    company: v.vacancy_definitions?.company_name || 'Unknown',
                    position: v.vacancy_definitions?.position || 'Unknown',
                    slotsOffered: v.slots_offered || 0,
                    slotsFilled: v.slots_filled || 0,
                  })
                }
                return acc
              }, []).map(v => ({ ...v, fillRate: v.slotsOffered > 0 ? Math.round((v.slotsFilled / v.slotsOffered) * 100) + '%' : '0%' })).sort((a, b) => b.slotsOffered - a.slotsOffered)}
              exportFileName="vacancy-fill-rates"
            />
          </Section>

          <Section title="Interviews by Employment Preference (Local vs Overseas)">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={byPreference} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                      {byPreference.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <PivotTable columns={[{ key: 'name', label: 'Preference' }, { key: 'value', label: 'Interview Count' }]} data={byPreference} exportFileName="local-vs-overseas-interviews" />
            </div>
          </Section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* EVENT REPORTS */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          <Section title="Event Summary">
            <PivotTable
              columns={[
                { key: 'event', label: 'Event' },
                { key: 'date', label: 'Date' },
                { key: 'location', label: 'Location' },
                { key: 'registered', label: 'Registered' },
                { key: 'attended', label: 'Attended' },
                { key: 'walkins', label: 'Walk-ins' },
                { key: 'attendanceRate', label: 'Attendance %' },
                { key: 'interviews', label: 'Interviews' },
                { key: 'hots', label: 'HOTS' },
                { key: 'totalSlots', label: 'Vacancies' },
                { key: 'fillRate', label: 'Fill Rate' },
              ]}
              data={eventSummary.map(e => ({ ...e, date: format(new Date(e.date), 'MMM d, yyyy'), attendanceRate: e.attendanceRate + '%', fillRate: e.fillRate + '%' }))}
              exportFileName="event-summary"
            />
          </Section>
        </div>
      )}
    </div>
  )
}