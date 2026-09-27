import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { eventTypeDisplay } from '../../domain/eventTypes'
import { interviewService } from '../../services/interviewService'
import { eventService } from '../../services/eventService'
import { employerService } from '../../services/employerService'

const INTERVIEW_STATUSES = [
  { value: 'qualified', label: 'Qualified' },
  { value: 'not_qualified', label: 'Not Qualified' },
  { value: 'near_hire', label: 'Near Hires' },
  { value: 'hots', label: 'Hired On The Spot' },
]
const STATUS_COLORS = {
  qualified: 'bg-emerald-100 text-emerald-800',
  not_qualified: 'bg-red-100 text-red-800',
  near_hire: 'bg-amber-100 text-amber-800',
  hots: 'bg-blue-100 text-blue-800',
}

export default function InterviewLogsManagement() {
  const [logs, setLogs] = useState([])
  const [events, setEvents] = useState([])
  const [employers, setEmployers] = useState([])
  const [filterEvent, setFilterEvent] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [employerFilter, setEmployerFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewLog, setViewLog] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [logs, events, employers] = await Promise.all([
        interviewService.listForManagement(),
        eventService.listForVacancyFilter(),
        employerService.listByCompany(),
      ])
      setLogs(logs || [])
      setEvents(events || [])
      setEmployers(employers || [])
    } catch (err) {
      toast.error(`Failed to load interview logs: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let data = logs
    if (filterEvent !== 'all') data = data.filter(l => l.event_id === filterEvent)
    if (filterStatus !== 'all') data = data.filter(l => l.interview_status === filterStatus)
    if (employerFilter !== 'all') data = data.filter(l => l.employer_id === employerFilter)
    if (companyFilter.trim()) data = data.filter(l => (l.company || '').toLowerCase().includes(companyFilter.trim().toLowerCase()))
    return data
  }, [logs, filterEvent, filterStatus, employerFilter, companyFilter])

  function exportCSV() {
    const rows = filtered.map(l => ({
      unique_id: l.registrants?.unique_id || '',
      name: [l.registrants?.first_name, l.registrants?.middle_name, l.registrants?.last_name].filter(Boolean).join(' '),
      email: l.registrants?.email || '',
      event: l.events?.event_name || '',
      company: l.company,
      position: l.position,
      status: INTERVIEW_STATUSES.find(s => s.value === l.interview_status)?.label || l.interview_status,
      interviewer: l.profiles?.full_name || '',
      interview_date: l.interview_date ? format(new Date(l.interview_date), 'yyyy-MM-dd HH:mm:ss') : '',
      notes: l.interview_notes || '',
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `interview-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="grid min-h-[300px] place-items-center text-slate-500">Loading interview logs...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Interview Logs Management</h1>
          <p className="text-sm text-slate-600">{filtered.length} log(s)</p>
        </div>
        <button onClick={exportCSV} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-4">
        <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} className={inputCls}>
          <option value="all">All Events</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name} — {eventTypeDisplay(ev)}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputCls}>
          <option value="all">All Statuses</option>
          {INTERVIEW_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={employerFilter} onChange={(e) => setEmployerFilter(e.target.value)} className={inputCls}>
          <option value="all">All Employers</option>
          {employers.map(em => <option key={em.id} value={em.id}>{em.company_name}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filter by company..."
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className={`${inputCls} w-full`}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Registrant</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Interviewer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{[log.registrants?.first_name, log.registrants?.middle_name, log.registrants?.last_name].filter(Boolean).join(' ')}</p>
                    <p className="font-mono text-xs text-blue-700">{log.registrants?.unique_id}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{log.events?.event_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{log.company}</td>
                  <td className="px-4 py-3 text-slate-700">{log.position}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[log.interview_status] || 'bg-slate-100 text-slate-700'}`}>
                      {INTERVIEW_STATUSES.find(s => s.value === log.interview_status)?.label || log.interview_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{log.profiles?.full_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{log.interview_date ? format(new Date(log.interview_date), 'MMM d, yyyy h:mm a') : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setViewLog(log)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No interview logs found for this filter.</p>}
      </div>

      {/* View modal */}
      {viewLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewLog(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Interview Details</h3>
              <button onClick={() => setViewLog(null)} className="text-xl leading-none text-slate-400 hover:text-slate-600">×</button>
            </div>
            <div className="space-y-3 text-sm">
              <Detail label="Registrant" value={[viewLog.registrants?.first_name, viewLog.registrants?.middle_name, viewLog.registrants?.last_name].filter(Boolean).join(' ')} />
              <Detail label="Unique ID" value={viewLog.registrants?.unique_id} />
              <Detail label="Event" value={viewLog.events?.event_name || '—'} />
              <Detail label="Company" value={viewLog.company} />
              <Detail label="Position" value={viewLog.position} />
              <Detail label="Status" value={INTERVIEW_STATUSES.find(s => s.value === viewLog.interview_status)?.label || viewLog.interview_status} />
              <Detail label="Interviewer" value={viewLog.profiles?.full_name || '—'} />
              <Detail label="Date" value={viewLog.interview_date ? format(new Date(viewLog.interview_date), 'MMM d, yyyy h:mm a') : '—'} />
              <Detail label="Notes" value={viewLog.interview_notes || '—'} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  )
}