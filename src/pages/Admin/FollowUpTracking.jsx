import { useEffect, useState, useMemo } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { employmentService } from '../../services/employmentService'

const FOLLOW_UP_TYPES = ['30_day', '60_day', '90_day', '180_day']
const FOLLOW_UP_LABELS = { '30_day': '30-Day', '60_day': '60-Day', '90_day': '90-Day', '180_day': '180-Day' }
const STATUS_OPTIONS = ['scheduled', 'completed', 'unreachable', 'declined']
const STATUS_LABELS = { scheduled: 'Scheduled', completed: 'Completed', unreachable: 'Unreachable', declined: 'Declined' }
const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  unreachable: 'bg-amber-100 text-amber-800',
  declined: 'bg-red-100 text-red-800',
}

export default function FollowUpTracking() {
  const [followUps, setFollowUps] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingFollowUp, setEditingFollowUp] = useState(null)
  const [formData, setFormData] = useState({
    status: 'scheduled',
    completed_date: '',
    still_employed: null,
    position: '',
    salary: '',
    employer_confirmed: null,
    worker_confirmed: null,
    remarks: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const rows = await employmentService.listFollowUps()
      setFollowUps(rows || [])
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const filteredFollowUps = useMemo(() => {
    let result = followUps
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(f =>
        f.employment_outcomes?.applications?.registrants?.first_name?.toLowerCase().includes(q) ||
        f.employment_outcomes?.applications?.registrants?.last_name?.toLowerCase().includes(q) ||
        f.employment_outcomes?.applications?.registrants?.unique_id?.toLowerCase().includes(q)
      )
    }
    if (typeFilter !== 'all') result = result.filter(f => f.follow_up_type === typeFilter)
    if (statusFilter !== 'all') result = result.filter(f => f.status === statusFilter)
    return result
  }, [followUps, searchQuery, typeFilter, statusFilter])

  function openEdit(fu) {
    setEditingFollowUp(fu)
    setFormData({
      status: fu.status || 'scheduled',
      completed_date: fu.completed_date || '',
      still_employed: fu.still_employed,
      position: fu.position || '',
      salary: fu.salary || '',
      employer_confirmed: fu.employer_confirmed,
      worker_confirmed: fu.worker_confirmed,
      remarks: fu.remarks || '',
    })
    setShowModal(true)
  }

  async function handleUpdate() {
    if (!editingFollowUp) return
    setSubmitting(true)
    try {
      await employmentService.updateFollowUp(editingFollowUp.id, formData)
      toast.success('Follow-up updated')
      setShowModal(false)
      await loadData()
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function exportCSV() {
    const rows = filteredFollowUps.map(f => ({
      'Applicant': [f.employment_outcomes?.applications?.registrants?.first_name, f.employment_outcomes?.applications?.registrants?.last_name].filter(Boolean).join(' '),
      'Unique ID': f.employment_outcomes?.applications?.registrants?.unique_id || '',
      'Company': f.employment_outcomes?.applications?.event_vacancies?.vacancy_definitions?.company_name || '',
      'Follow-up Type': FOLLOW_UP_LABELS[f.follow_up_type] || f.follow_up_type,
      'Scheduled': f.scheduled_date || '',
      'Status': STATUS_LABELS[f.status] || f.status,
      'Still Employed': f.still_employed === true ? 'Yes' : f.still_employed === false ? 'No' : '',
      'Remarks': f.remarks || '',
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `follow-ups-${format(new Date(), 'yyyy-MM-dd')}.csv`; link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} follow-ups`)
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="grid min-h-[400px] place-items-center text-slate-500">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Follow-Up Tracking</h1>
          <p className="text-sm text-slate-600">{filteredFollowUps.length} follow-up(s)</p>
        </div>
        <button onClick={exportCSV} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search by name or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="all">All Types</option>
          {FOLLOW_UP_TYPES.map(t => <option key={t} value={t}>{FOLLOW_UP_LABELS[t]}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Applicant</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Still Employed</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredFollowUps.map(fu => (
              <tr key={fu.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {[fu.employment_outcomes?.applications?.registrants?.first_name, fu.employment_outcomes?.applications?.registrants?.last_name].filter(Boolean).join(' ')}
                </td>
                <td className="px-4 py-3 text-slate-700">{fu.employment_outcomes?.applications?.event_vacancies?.vacancy_definitions?.company_name || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{FOLLOW_UP_LABELS[fu.follow_up_type] || fu.follow_up_type}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{fu.scheduled_date || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[fu.status] || ''}`}>
                    {STATUS_LABELS[fu.status] || fu.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {fu.still_employed === true ? 'Yes' : fu.still_employed === false ? 'No' : '—'}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(fu)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                </td>
              </tr>
            ))}
            {filteredFollowUps.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No follow-ups found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {showModal && editingFollowUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Update Follow-Up</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select className={inputCls} value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Completed Date</label>
                <input type="date" className={inputCls} value={formData.completed_date} onChange={(e) => setFormData({ ...formData, completed_date: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Still Employed</label>
                <select className={inputCls} value={formData.still_employed === true ? 'true' : formData.still_employed === false ? 'false' : ''} onChange={(e) => setFormData({ ...formData, still_employed: e.target.value === 'true' ? true : e.target.value === 'false' ? false : null })}>
                  <option value="">Not answered</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Remarks</label>
                <textarea className={inputCls} rows={3} value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button onClick={handleUpdate} disabled={submitting} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
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
