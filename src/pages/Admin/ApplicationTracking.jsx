import { useEffect, useState, useMemo } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { eventTypeDisplay } from '../../domain/eventTypes'
import { applicationService } from '../../services/applicationService'
import { eventService } from '../../services/eventService'

const STATUS_OPTIONS = ['applied', 'shortlisted', 'rejected', 'withdrawn']
const STATUS_LABELS = { applied: 'Applied', shortlisted: 'Shortlisted', rejected: 'Rejected', withdrawn: 'Withdrawn' }
const STATUS_COLORS = {
  applied: 'bg-blue-100 text-blue-800',
  shortlisted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  withdrawn: 'bg-slate-100 text-slate-600',
}

export default function ApplicationTracking() {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [events, setEvents] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingApp, setEditingApp] = useState(null)
  const [formData, setFormData] = useState({ application_status: 'applied', notes: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [appData, evData] = await Promise.all([
        applicationService.listForReports(),
        eventService.listForVacancyFilter(),
      ])
      setApplications(appData || [])
      setEvents(evData || [])
    } catch (err) {
      toast.error(`Failed to load applications: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const filteredApplications = useMemo(() => {
    let result = applications
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(a =>
        a.registrants?.first_name?.toLowerCase().includes(q) ||
        a.registrants?.last_name?.toLowerCase().includes(q) ||
        a.registrants?.unique_id?.toLowerCase().includes(q) ||
        a.registrants?.email?.toLowerCase().includes(q) ||
        a.event_vacancies?.vacancy_definitions?.company_name?.toLowerCase().includes(q) ||
        a.event_vacancies?.vacancy_definitions?.position?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') result = result.filter(a => a.application_status === statusFilter)
    if (eventFilter !== 'all') result = result.filter(a => a.registrants?.event_id === eventFilter)
    return result
  }, [applications, searchQuery, statusFilter, eventFilter])

  const statusCounts = useMemo(() => {
    const counts = { all: applications.length }
    STATUS_OPTIONS.forEach(s => { counts[s] = applications.filter(a => a.application_status === s).length })
    return counts
  }, [applications])

  function openEditStatus(app) {
    setEditingApp(app)
    setFormData({ application_status: app.application_status, notes: app.notes || '' })
  }

  async function saveStatus() {
    if (!editingApp) return
    setSubmitting(true)
    try {
      await applicationService.update(editingApp.id, {
        application_status: formData.application_status,
        notes: formData.notes,
      })
      toast.success('Application updated')
      setShowModal(false)
      await loadData()
    } catch (err) {
      toast.error(`Failed to update: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function exportCSV() {
    const rows = filteredApplications.map(a => ({
      'Applicant': [a.registrants?.first_name, a.registrants?.middle_name, a.registrants?.last_name].filter(Boolean).join(' '),
      'Unique ID': a.registrants?.unique_id || '',
      'Email': a.registrants?.email || '',
      'Company': a.event_vacancies?.vacancy_definitions?.company_name || '',
      'Position': a.event_vacancies?.vacancy_definitions?.position || '',
      'Event': a.event_vacancies?.events?.event_name || '',
      'Status': STATUS_LABELS[a.application_status] || a.application_status,
      'Applied At': a.applied_at ? format(new Date(a.applied_at), 'MMM d, yyyy HH:mm') : '',
      'Notes': a.notes || '',
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `applications-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} applications`)
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="grid min-h-[400px] place-items-center text-slate-500">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Application Tracking</h1>
          <p className="text-sm text-slate-600">{filteredApplications.length} application(s)</p>
        </div>
        <button onClick={exportCSV} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</button>
      </div>

      {/* Status Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-5">
        {['all', ...STATUS_OPTIONS].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              statusFilter === status
                ? 'bg-blue-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {status === 'all' ? 'All' : STATUS_LABELS[status]} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search by name, ID, email, company, position..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All Events</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name} — {eventTypeDisplay(ev)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Applicant</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Applied</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredApplications.map(app => (
              <tr key={app.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{[app.registrants?.first_name, app.registrants?.middle_name, app.registrants?.last_name].filter(Boolean).join(' ')}</p>
                  <p className="font-mono text-xs text-blue-700">{app.registrants?.unique_id}</p>
                </td>
                <td className="px-4 py-3 text-slate-700">{app.event_vacancies?.vacancy_definitions?.company_name || '—'}</td>
                <td className="px-4 py-3 text-slate-700">{app.event_vacancies?.vacancy_definitions?.position || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{app.event_vacancies?.events?.event_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[app.application_status] || ''}`}>
                    {STATUS_LABELS[app.application_status] || app.application_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{app.applied_at ? format(new Date(app.applied_at), 'MMM d, yyyy') : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEditStatus(app)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit Status</button>
                </td>
              </tr>
            ))}
            {filteredApplications.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No applications found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {showModal && editingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Update Application Status</h2>
            <p className="text-sm text-slate-600 mb-4">
              {[editingApp.registrants?.first_name, editingApp.registrants?.middle_name, editingApp.registrants?.last_name].filter(Boolean).join(' ')} — {editingApp.event_vacancies?.vacancy_definitions?.company_name}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select className={inputCls} value={formData.application_status} onChange={(e) => setFormData({ ...formData, application_status: e.target.value })}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea className={inputCls} rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button onClick={saveStatus} disabled={submitting} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
