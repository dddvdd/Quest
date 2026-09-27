import { useEffect, useState, useMemo } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { employmentService } from '../../services/employmentService'
import { employerService } from '../../services/employerService'

const OUTCOME_OPTIONS = ['pending', 'hired', 'not_hired', 'offer_declined', 'withdrawn']
const OUTCOME_LABELS = { pending: 'Pending', hired: 'Hired', not_hired: 'Not Hired', offer_declined: 'Offer Declined', withdrawn: 'Withdrawn' }
const OUTCOME_COLORS = {
  pending: 'bg-amber-100 text-amber-800',
  hired: 'bg-emerald-100 text-emerald-800',
  not_hired: 'bg-red-100 text-red-800',
  offer_declined: 'bg-slate-100 text-slate-600',
  withdrawn: 'bg-blue-100 text-blue-800',
}

export default function EmploymentOutcomes() {
  const [outcomes, setOutcomes] = useState([])
  const [employers, setEmployers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('all')
  const [employerFilter, setEmployerFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingOutcome, setEditingOutcome] = useState(null)
  const [formData, setFormData] = useState({
    outcome: 'pending',
    hired_at: '',
    position_held: '',
    company: '',
    salary: '',
    start_date: '',
    verification_notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [outcomeData, empData] = await Promise.all([
        employmentService.listOutcomes(),
        employerService.listByCompany(),
      ])
      setOutcomes(outcomeData || [])
      setEmployers(empData || [])
    } catch (err) {
      toast.error(`Failed to load: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const filteredOutcomes = useMemo(() => {
    let result = outcomes
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(o =>
        o.applications?.registrants?.first_name?.toLowerCase().includes(q) ||
        o.applications?.registrants?.last_name?.toLowerCase().includes(q) ||
        o.applications?.registrants?.unique_id?.toLowerCase().includes(q) ||
        o.company?.toLowerCase().includes(q) ||
        o.position_held?.toLowerCase().includes(q)
      )
    }
    if (outcomeFilter !== 'all') result = result.filter(o => o.outcome === outcomeFilter)
    if (employerFilter !== 'all') result = result.filter(o => o.employer_id === employerFilter)
    return result
  }, [outcomes, searchQuery, outcomeFilter, employerFilter])

  const outcomeCounts = useMemo(() => {
    const counts = { all: outcomes.length }
    OUTCOME_OPTIONS.forEach(s => { counts[s] = outcomes.filter(o => o.outcome === s).length })
    return counts
  }, [outcomes])

  function openEdit(o) {
    setEditingOutcome(o)
    setFormData({
      outcome: o.outcome || 'pending',
      hired_at: o.hired_at || '',
      position_held: o.position_held || '',
      company: o.company || '',
      salary: o.salary || '',
      start_date: o.start_date || '',
      verification_notes: o.verification_notes || '',
    })
    setShowModal(true)
  }

  async function handleUpdate() {
    if (!editingOutcome) return
    setSubmitting(true)
    try {
      await employmentService.updateOutcome(editingOutcome.id, {
        outcome: formData.outcome,
        hired_at: formData.hired_at || null,
        position_held: formData.position_held || null,
        company: formData.company || null,
        salary: formData.salary || null,
        start_date: formData.start_date || null,
        verification_notes: formData.verification_notes || null,
        verified_by: editingOutcome.verified_by || null,
        verification_date: formData.outcome !== 'pending' ? new Date().toISOString() : null,
      })
      toast.success('Outcome updated')
      setShowModal(false)
      await loadData()
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function exportCSV() {
    const rows = filteredOutcomes.map(o => ({
      'Applicant': [o.applications?.registrants?.first_name, o.applications?.registrants?.last_name].filter(Boolean).join(' '),
      'Unique ID': o.applications?.registrants?.unique_id || '',
      'Company': o.applications?.event_vacancies?.vacancy_definitions?.company_name || '',
      'Position': o.position_held || '',
      'Outcome': OUTCOME_LABELS[o.outcome] || o.outcome,
      'Hired Date': o.hired_at || '',
      'Salary': o.salary || '',
      'Verified': o.verification_date ? format(new Date(o.verification_date), 'MMM d, yyyy') : '',
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `employment-outcomes-${format(new Date(), 'yyyy-MM-dd')}.csv`; link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} outcomes`)
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="grid min-h-[400px] place-items-center text-slate-500">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employment Outcomes</h1>
          <p className="text-sm text-slate-600">{filteredOutcomes.length} outcome(s)</p>
        </div>
        <button onClick={exportCSV} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-6">
        {['all', ...OUTCOME_OPTIONS].map(status => (
          <button
            key={status}
            onClick={() => setOutcomeFilter(status)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              outcomeFilter === status ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {status === 'all' ? 'All' : OUTCOME_LABELS[status]} ({outcomeCounts[status] || 0})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={employerFilter} onChange={(e) => setEmployerFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="all">All Employers</option>
          {employers.map(em => <option key={em.id} value={em.id}>{em.company_name}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search by name, ID, company, position..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Applicant</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Salary</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOutcomes.map(o => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {[o.applications?.registrants?.first_name, o.applications?.registrants?.last_name].filter(Boolean).join(' ')}
                </td>
                <td className="px-4 py-3 text-slate-700">{o.applications?.event_vacancies?.vacancy_definitions?.company_name || '—'}</td>
                <td className="px-4 py-3 text-slate-700">{o.position_held || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME_COLORS[o.outcome] || ''}`}>
                    {OUTCOME_LABELS[o.outcome] || o.outcome}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{o.salary || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{o.verification_date ? format(new Date(o.verification_date), 'MMM d, yyyy') : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(o)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                </td>
              </tr>
            ))}
            {filteredOutcomes.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No outcomes found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && editingOutcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Update Employment Outcome</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Outcome</label>
                <select className={inputCls} value={formData.outcome} onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}>
                  {OUTCOME_OPTIONS.map(s => <option key={s} value={s}>{OUTCOME_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Hired Date</label>
                <input type="date" className={inputCls} value={formData.hired_at} onChange={(e) => setFormData({ ...formData, hired_at: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Position Held</label>
                <input className={inputCls} value={formData.position_held} onChange={(e) => setFormData({ ...formData, position_held: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Company</label>
                <input className={inputCls} value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Salary</label>
                <input className={inputCls} value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Start Date</label>
                <input type="date" className={inputCls} value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Verification Notes</label>
                <textarea className={inputCls} rows={3} value={formData.verification_notes} onChange={(e) => setFormData({ ...formData, verification_notes: e.target.value })} />
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
