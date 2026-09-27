import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { eventTypeDisplay } from '../../domain/eventTypes'
import Papa from 'papaparse'
import { supervisorService } from '../../services/supervisorService'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'

const COLORS = ['#0b6efd', '#2ea44f', '#d4820a', '#c0392b', '#8e44ad', '#16a085', '#f39c12', '#2c3e50']

// ----- Pixel design tokens (shared with scanner/calendar/dashboard pages) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 bg-white pixel-shadow'
const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-slate-900 px-4 font-bold uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300'
const BTN_AMBER = `${BTN} bg-role-supervisor text-white`
const BTN_GHOST = `${BTN} bg-white text-slate-800`

export default function ReportsPage() {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [registrants, setRegistrants] = useState([])
  const [interviews, setInterviews] = useState([])
  const [referrals, setReferrals] = useState([])
  const [vacancies, setVacancies] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('municipality')

  const isProvincial = profile?.is_provincial === true
  const supervisorJurisdiction = profile?.jurisdiction || ''

  const fetchVisibleEvents = useCallback(async () => {
    try {
      return await supervisorService.fetchVisibleEvents({
        isProvincial,
        jurisdiction: supervisorJurisdiction,
      })
    } catch {
      return []
    }
  }, [isProvincial, supervisorJurisdiction])

  const fetchAllData = useCallback(async (visibleEventIds) => {
    setLoading(true)
    try {
      const data = await supervisorService.fetchReportData({ selectedEvent, visibleEventIds })
      setRegistrants(data.registrants)
      setInterviews(data.interviews)
      setReferrals(data.referrals)
      setVacancies(data.vacancies)
    } catch (err) {
      console.error('Failed to load report data:', err)
      toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }, [selectedEvent])

  useEffect(() => {
    fetchVisibleEvents().then(ev => {
      setEvents(ev)
      fetchAllData(ev.map(e => e.id))
    })
  }, [fetchVisibleEvents, fetchAllData])

  // ─── Pivot: Registrations by Municipality ───
  const byMunicipality = useMemo(() => {
    const map = {}
    registrants.forEach(r => {
      const key = r.municipality_city || 'Unknown'
      if (!map[key]) map[key] = { municipality: key, total: 0, checkedIn: 0, walkIns: 0, preregistered: 0 }
      map[key].total++
      if (r.check_in_status === 'checked_in') map[key].checkedIn++
      if (r.registration_type === 'walkin') map[key].walkIns++
      else map[key].preregistered++
    })
    return Object.values(map)
      .map(r => ({ ...r, checkInRate: r.total > 0 ? Math.round((r.checkedIn / r.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [registrants])

  // ─── Pivot: Registrations by Vacancy ───
  const byVacancy = useMemo(() => {
    const map = {}
    vacancies.forEach(v => {
      const key = `${v.vacancy_definitions?.company_name} — ${v.vacancy_definitions?.position}`
      if (!map[key]) map[key] = { vacancy: key, company: v.vacancy_definitions?.company_name || '', position: v.vacancy_definitions?.position || '', slotsOffered: 0, slotsFilled: 0 }
      map[key].slotsOffered += v.slots_offered || 0
      map[key].slotsFilled += v.slots_filled || 0
    })
    return Object.values(map)
      .map(v => ({ ...v, fillRate: v.slotsOffered > 0 ? Math.round((v.slotsFilled / v.slotsOffered) * 100) : 0 }))
      .sort((a, b) => b.slotsOffered - a.slotsOffered)
  }, [vacancies])

  // ─── Pivot: Interview Outcomes by Company ───
  const interviewByCompany = useMemo(() => {
    const map = {}
    interviews.forEach(i => {
      const key = i.company || 'Unknown'
      if (!map[key]) map[key] = { company: key, total: 0, qualified: 0, not_qualified: 0, near_hire: 0, hots: 0 }
      map[key].total++
      if (i.interview_status) map[key][i.interview_status] = (map[key][i.interview_status] || 0) + 1
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [interviews])

  // ─── Pivot: Check-in Rate by Event ───
  const checkinByEvent = useMemo(() => {
    const map = {}
    registrants.forEach(r => {
      const key = r.events?.event_name || 'Unknown'
      if (!map[key]) map[key] = { event: key, total: 0, checkedIn: 0, walkIns: 0 }
      map[key].total++
      if (r.check_in_status === 'checked_in') map[key].checkedIn++
      if (r.registration_type === 'walkin') map[key].walkIns++
    })
    return Object.values(map)
      .map(e => ({ ...e, checkInRate: e.total > 0 ? Math.round((e.checkedIn / e.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [registrants])

  // ─── Pivot: Demographics ───
  const demographics = useMemo(() => {
    const sexMap = {}
    const eduMap = {}
    const empMap = {}
    registrants.forEach(r => {
      const sex = r.sex || 'Unknown'
      sexMap[sex] = (sexMap[sex] || 0) + 1
      const edu = r.highest_educational_attainment || 'Unknown'
      eduMap[edu] = (eduMap[edu] || 0) + 1
      const emp = r.employment_preference || 'Unknown'
      empMap[emp] = (empMap[emp] || 0) + 1
    })
    return {
      bySex: Object.entries(sexMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      byEducation: Object.entries(eduMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      byEmployment: Object.entries(empMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    }
  }, [registrants])

  // ─── Export helpers ───
  function exportCsv(rows, fileName) {
    if (!rows || rows.length === 0) { toast.info('No data to export'); return }
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName}-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} rows as CSV`)
  }

  function exportFullRegistrantsCsv() {
    if (registrants.length === 0) { toast.info('No registrants to export'); return }
    const rows = registrants.map(r => ({
      'Unique ID': r.id?.slice(0, 8) || '',
      'Name': [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' '),
      'Email': r.email || '',
      'Sex': r.sex || '',
      'Civil Status': r.civil_status || '',
      'Province': r.province || '',
      'Municipality': r.municipality_city || '',
      'Barangay': r.barangay || '',
      'Education': r.highest_educational_attainment || '',
      'Employment Preference': r.employment_preference || '',
      'Check-in Status': r.check_in_status || '',
      'Registration Type': r.registration_type || '',
      'Event': r.events?.event_name || '',
      'First-Time Jobseeker': r.first_time_jobseeker ? 'Yes' : 'No',
      'PWD': r.has_disability ? 'Yes' : 'No',
      'Returning Worker': r.returning_worker ? 'Yes' : 'No',
      'Returning OFW': r.returning_ofw ? 'Yes' : 'No',
      'Registered': r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy HH:mm') : '',
    }))
    exportCsv(rows, 'all-registrants')
  }

  function exportFullInterviewsCsv() {
    if (interviews.length === 0) { toast.info('No interviews to export'); return }
    const rows = interviews.map(i => ({
      'Name': [i.registrants?.first_name, i.registrants?.last_name].filter(Boolean).join(' '),
      'Municipality': i.registrants?.municipality_city || '',
      'Company': i.company || '',
      'Position': i.position || '',
      'Status': i.interview_status?.replace('_', ' ') || '',
      'Event': i.events?.event_name || '',
      'Date': i.interview_date ? format(new Date(i.interview_date), 'MMM d, yyyy HH:mm') : '',
    }))
    exportCsv(rows, 'all-interviews')
  }

  const tabs = [
    { key: 'municipality', label: 'By Municipality' },
    { key: 'vacancy', label: 'By Vacancy' },
    { key: 'interviews', label: 'Interview Outcomes' },
    { key: 'checkin', label: 'Check-in Rates' },
    { key: 'demographics', label: 'Demographics' },
  ]

  const inputCls = 'min-h-[44px] w-full rounded-lg border-2 border-slate-900 bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-pink-300'

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50" role="status">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5" aria-hidden>
            {[0, 1, 2].map(i => (
              <span key={i} className="pixel-blink inline-block h-2.5 w-2.5 bg-role-supervisor" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Loading reports…</p>
        </div>
      </main>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Reports & Pivots</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isProvincial ? 'All municipalities' : supervisorJurisdiction} • {registrants.length} registrants • {interviews.length} interviews • {referrals.length} referrals
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportFullRegistrantsCsv} className={`${BTN_AMBER} text-xs`}>
            Export All Registrants
          </button>
          <button onClick={exportFullInterviewsCsv} className={`${BTN_GHOST} text-xs`}>
            Export All Interviews
          </button>
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
          <option value="">All Events in Jurisdiction</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>{ev.event_name} — {format(new Date(ev.event_date), 'MMM d, yyyy')} — {eventTypeDisplay(ev)}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border-2 border-slate-900 bg-slate-100 p-1 pixel-shadow-sm" role="tablist" aria-label="Report views">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`relative min-w-max flex-1 rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300 ${
              activeTab === tab.key
                ? 'bg-role-supervisor/15 text-slate-900'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {activeTab === tab.key && (
              <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-role-supervisor" />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── By Municipality ─── */}
      {activeTab === 'municipality' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Registrations by Municipality</h2>
            <button
              onClick={() => exportCsv(byMunicipality.map(r => ({
                Municipality: r.municipality, Total: r.total, 'Checked In': r.checkedIn,
                'Walk-ins': r.walkIns, 'Pre-registered': r.preregistered, 'Check-in Rate': r.checkInRate + '%'
              })), 'registrations-by-municipality')}
              className={`${BTN_GHOST} px-3 text-xs`}
            >
              Export CSV
            </button>
          </div>
          <div className={`${PANEL} p-5`}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byMunicipality.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="municipality" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total" fill="#0b6efd" radius={[4, 4, 0, 0]} />
                <Bar dataKey="checkedIn" name="Checked In" fill="#2ea44f" radius={[4, 4, 0, 0]} />
                <Bar dataKey="walkIns" name="Walk-ins" fill="#d4820a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={`overflow-x-auto ${PANEL}`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Municipality</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Checked In</th>
                  <th className="px-4 py-3">Walk-ins</th>
                  <th className="px-4 py-3">Pre-registered</th>
                  <th className="px-4 py-3">Check-in Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byMunicipality.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.municipality}</td>
                    <td className="px-4 py-3 text-slate-700">{r.total}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{r.checkedIn}</td>
                    <td className="px-4 py-3 text-amber-700">{r.walkIns}</td>
                    <td className="px-4 py-3 text-blue-700">{r.preregistered}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-slate-200">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: `${r.checkInRate}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-600">{r.checkInRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {byMunicipality.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── By Vacancy ─── */}
      {activeTab === 'vacancy' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Vacancy Fill Rates</h2>
            <button
              onClick={() => exportCsv(byVacancy.map(v => ({
                Company: v.company, Position: v.position, 'Slots Offered': v.slotsOffered,
                'Slots Filled': v.slotsFilled, 'Fill Rate': v.fillRate + '%'
              })), 'vacancy-fill-rates')}
              className={`${BTN_GHOST} px-3 text-xs`}
            >
              Export CSV
            </button>
          </div>
          <div className={`${PANEL} p-5`}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byVacancy.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="position" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="slotsOffered" name="Offered" fill="#0b6efd" radius={[4, 4, 0, 0]} />
                <Bar dataKey="slotsFilled" name="Filled" fill="#2ea44f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={`overflow-x-auto ${PANEL}`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3">Slots Offered</th>
                  <th className="px-4 py-3">Slots Filled</th>
                  <th className="px-4 py-3">Fill Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byVacancy.map((v, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{v.company}</td>
                    <td className="px-4 py-3 text-slate-700">{v.position}</td>
                    <td className="px-4 py-3 text-blue-700 font-medium">{v.slotsOffered}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{v.slotsFilled}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-slate-200">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: `${v.fillRate}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-600">{v.fillRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {byVacancy.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Interview Outcomes ─── */}
      {activeTab === 'interviews' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Interview Outcomes by Company</h2>
            <button
              onClick={() => exportCsv(interviewByCompany.map(r => ({
                Company: r.company, Total: r.total, Qualified: r.qualified,
                'Not Qualified': r.not_qualified, 'Near Hire': r.near_hire, HOTS: r.hots
              })), 'interview-outcomes')}
              className={`${BTN_GHOST} px-3 text-xs`}
            >
              Export CSV
            </button>
          </div>
          <div className={`${PANEL} p-5`}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={interviewByCompany.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="company" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="qualified" name="Qualified" fill="#2ea44f" radius={[4, 4, 0, 0]} />
                <Bar dataKey="not_qualified" name="Not Qualified" fill="#c0392b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="near_hire" name="Near Hire" fill="#d4820a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="hots" name="HOTS" fill="#0b6efd" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={`overflow-x-auto ${PANEL}`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Qualified</th>
                  <th className="px-4 py-3">Not Qualified</th>
                  <th className="px-4 py-3">Near Hire</th>
                  <th className="px-4 py-3">HOTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {interviewByCompany.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.company}</td>
                    <td className="px-4 py-3 text-slate-700">{r.total}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{r.qualified}</td>
                    <td className="px-4 py-3 text-red-700">{r.not_qualified}</td>
                    <td className="px-4 py-3 text-amber-700">{r.near_hire}</td>
                    <td className="px-4 py-3 text-blue-700 font-medium">{r.hots}</td>
                  </tr>
                ))}
                {interviewByCompany.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Check-in Rates ─── */}
      {activeTab === 'checkin' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Check-in Rate by Event</h2>
            <button
              onClick={() => exportCsv(checkinByEvent.map(e => ({
                Event: e.event, Total: e.total, 'Checked In': e.checkedIn,
                'Walk-ins': e.walkIns, 'Check-in Rate': e.checkInRate + '%'
              })), 'checkin-rates')}
              className={`${BTN_GHOST} px-3 text-xs`}
            >
              Export CSV
            </button>
          </div>
          <div className={`${PANEL} p-5`}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={checkinByEvent}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="event" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Registered" fill="#0b6efd" radius={[4, 4, 0, 0]} />
                <Bar dataKey="checkedIn" name="Checked In" fill="#2ea44f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={`overflow-x-auto ${PANEL}`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3">Checked In</th>
                  <th className="px-4 py-3">Walk-ins</th>
                  <th className="px-4 py-3">Check-in Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {checkinByEvent.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{e.event}</td>
                    <td className="px-4 py-3 text-slate-700">{e.total}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{e.checkedIn}</td>
                    <td className="px-4 py-3 text-amber-700">{e.walkIns}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-slate-200">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: `${e.checkInRate}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-600">{e.checkInRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {checkinByEvent.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Demographics ─── */}
      {activeTab === 'demographics' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Demographics Summary</h2>
            <button
              onClick={() => {
                const rows = [
                  ...demographics.bySex.map(d => ({ Category: 'Sex', Value: d.name, Count: d.value })),
                  ...demographics.byEducation.map(d => ({ Category: 'Education', Value: d.name, Count: d.value })),
                  ...demographics.byEmployment.map(d => ({ Category: 'Employment Preference', Value: d.name, Count: d.value })),
                ]
                exportCsv(rows, 'demographics-summary')
              }}
              className={`${BTN_GHOST} px-3 text-xs`}
            >
              Export CSV
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Sex */}
            <div className={`${PANEL} p-5`}>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">By Sex</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={demographics.bySex} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                    {demographics.bySex.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Education */}
            <div className={`${PANEL} p-5`}>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">By Education</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={demographics.byEducation}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0b6efd" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Employment */}
            <div className={`${PANEL} p-5`}>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">By Employment Preference</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={demographics.byEmployment} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                    {demographics.byEmployment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className={`overflow-x-auto ${PANEL}`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Count</th>
                  <th className="px-4 py-3">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {demographics.bySex.map((d, i) => (
                  <tr key={`sex-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Sex</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                    <td className="px-4 py-3 text-slate-700">{d.value}</td>
                    <td className="px-4 py-3 text-slate-600">{registrants.length > 0 ? Math.round((d.value / registrants.length) * 100) : 0}%</td>
                  </tr>
                ))}
                {demographics.byEducation.map((d, i) => (
                  <tr key={`edu-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Education</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                    <td className="px-4 py-3 text-slate-700">{d.value}</td>
                    <td className="px-4 py-3 text-slate-600">{registrants.length > 0 ? Math.round((d.value / registrants.length) * 100) : 0}%</td>
                  </tr>
                ))}
                {demographics.byEmployment.map((d, i) => (
                  <tr key={`emp-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employment</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                    <td className="px-4 py-3 text-slate-700">{d.value}</td>
                    <td className="px-4 py-3 text-slate-600">{registrants.length > 0 ? Math.round((d.value / registrants.length) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}