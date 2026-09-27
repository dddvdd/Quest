import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useStaffEventsAnyStatus } from '../../hooks/events/useEvents'
import { registrantService } from '../../services/registrantService'
import { checkInService } from '../../services/checkInService'
import { eventVacancyService } from '../../services/eventVacancyService'
import { interviewService } from '../../services/interviewService'
import { INTERVIEW_STATUS, INTERVIEW_STATUS_LABEL, INTERVIEW_STATUS_BADGE } from '../../domain/statuses'
import { eventTypeDisplay } from '../../domain/eventTypes'

const INTERVIEW_STATUSES = [
  { value: INTERVIEW_STATUS.NOT_QUALIFIED, label: INTERVIEW_STATUS_LABEL[INTERVIEW_STATUS.NOT_QUALIFIED] },
  { value: INTERVIEW_STATUS.QUALIFIED, label: INTERVIEW_STATUS_LABEL[INTERVIEW_STATUS.QUALIFIED] },
  { value: INTERVIEW_STATUS.NEAR_HIRE, label: INTERVIEW_STATUS_LABEL[INTERVIEW_STATUS.NEAR_HIRE] },
  { value: INTERVIEW_STATUS.HOTS, label: INTERVIEW_STATUS_LABEL[INTERVIEW_STATUS.HOTS] },
]

// ----- Pixel design tokens (shared with scanner/calendar pages) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 bg-white pixel-shadow'
const BTN_MINI = 'inline-flex min-h-[44px] items-center rounded-lg border-2 border-slate-900 px-3 text-xs font-bold uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300'
const INPUT = 'min-h-[48px] rounded-lg border-2 border-slate-900 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-amber-300'

export default function ManualSearchPage() {
  const { events } = useStaffEventsAnyStatus()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('all')
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState(null)

  // Interview result modal state
  const [interviewReg, setInterviewReg] = useState(null)
  const [interviewCompanies, setInterviewCompanies] = useState([])
  const [interviewPositions, setInterviewPositions] = useState([])
  const [interviewCompanyId, setInterviewCompanyId] = useState('')
  const [interviewPositionId, setInterviewPositionId] = useState('')
  const [interviewStatus, setInterviewStatus] = useState('')
  const [interviewSubmitting, setInterviewSubmitting] = useState(false)
  const [interviewLogs, setInterviewLogs] = useState([])
  const [interviewLoading, setInterviewLoading] = useState(false)

  useEffect(() => {
    let alive = true
    registrantService.listAll()
      .then((rows) => { if (alive) setResults(rows || []) })
      .catch(() => { if (alive) setResults([]) })
    return () => { alive = false }
  }, [])

  async function handleSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setLoading(true)
    try {
      const rows = selectedEvent === 'all'
        ? await registrantService.search(q)
        : await registrantService.searchForEvent(selectedEvent, q)
      setResults(rows || [])
      if (!rows?.length) toast.info('No matching registrants found.')
    } catch (err) {
      toast.error(`Search failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  function refreshResultsForEvent(eventId) {
    const promise = eventId === 'all'
      ? registrantService.listAll()
      : registrantService.listForEvent(eventId)
    promise.then((rows) => setResults(rows || [])).catch(() => setResults([]))
  }

  async function handleQuickCheckin(registrantId) {
    setActionId(registrantId)
    try {
      await checkInService.checkInRegistrant(registrantId)
      toast.success('Successfully checked in!')
      setResults((prev) =>
        prev.map((item) =>
          item.id === registrantId
            ? { ...item, check_in_status: 'checked_in', check_in_time: new Date().toISOString() }
            : item
        )
      )
    } catch (err) {
      toast.error(`Check-in failed: ${err.message}`)
    } finally {
      setActionId(null)
    }
  }

  function handleEventChange(e) {
    const val = e.target.value
    setSelectedEvent(val)
    refreshResultsForEvent(val)
  }

  async function openInterviewModal(reg) {
    setInterviewReg(reg)
    setInterviewCompanyId('')
    setInterviewPositionId('')
    setInterviewStatus('')
    setInterviewPositions([])
    setInterviewLogs([])
    setInterviewLoading(true)

    try {
      const rows = await eventVacancyService.listCompanyParticipants(reg.event_id)
      const seen = new Set()
      const companies = []
      ;(rows || []).forEach(ev => {
        const vd = ev?.vacancy_definitions
        const emp = vd?.employers
        if (vd?.employer_id && emp?.company_name && !seen.has(vd.employer_id)) {
          seen.add(vd.employer_id)
          companies.push({ id: vd.employer_id, company_name: emp.company_name })
        }
      })
      setInterviewCompanies(companies.sort((a, b) => a.company_name.localeCompare(b.company_name)))
    } catch (err) {
      toast.error(`Could not load companies: ${err.message}`)
    }

    await loadInterviewLogs(reg)
    setInterviewLoading(false)
  }

  async function handleCompanyChange(companyId) {
    setInterviewCompanyId(companyId)
    setInterviewPositionId('')
    setInterviewPositions([])
    if (!companyId || !interviewReg?.event_id) return
    try {
      const rows = await eventVacancyService.listPositionsForCompanyInEvent(interviewReg.event_id, companyId)
      const positions = (rows || [])
        .map(ev => ev?.vacancy_definitions)
        .filter(vd => vd?.id && vd?.position)
        .sort((a, b) => a.position.localeCompare(b.position))
      setInterviewPositions(positions)
    } catch (err) {
      toast.error(`Could not load positions: ${err.message}`)
    }
  }

  async function loadInterviewLogs(reg) {
    try {
      const rows = await interviewService.listForRegistrant(reg.id, reg.event_id)
      setInterviewLogs(rows || [])
    } catch (err) {
      toast.error(`Could not load interview logs: ${err.message}`)
      setInterviewLogs([])
    }
  }

  async function handleSaveInterview() {
    if (!interviewReg || !interviewCompanyId || !interviewPositionId || !interviewStatus) return
    setInterviewSubmitting(true)
    try {
      await interviewService.record({
        p_registrant_id: interviewReg.id,
        p_event_id: interviewReg.event_id,
        p_employer_id: interviewCompanyId,
        p_vacancy_definition_id: interviewPositionId,
        p_status: interviewStatus,
      })
      toast.success('Interview result recorded!')
      await loadInterviewLogs(interviewReg)
      setInterviewPositionId('')
      setInterviewStatus('')
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('already recorded')) {
        toast.error('Interview result already recorded for this applicant, company, position, and status.')
      } else {
        toast.error('Unable to save interview result. Please try again.')
      }
    } finally {
      setInterviewSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700">Registrant Lookup</p>
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Manual Search</h1>
        <p className="mt-1 text-sm text-slate-600">Search by applicant name, unique ID, email address, or contact number.</p>
      </div>

      {/* Search + Event Filter */}
      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          placeholder="Enter name, unique ID, email, or contact number..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search registrants"
          className={`flex-1 ${INPUT}`}
        />
        <select
          value={selectedEvent}
          onChange={handleEventChange}
          aria-label="Filter by event"
          className={`sm:max-w-xs ${INPUT}`}
        >
          <option value="all">All Events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.event_name} — {eventTypeDisplay(ev)}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex min-h-[48px] items-center justify-center rounded-lg border-2 border-slate-900 bg-amber-400 px-6 text-sm font-black uppercase tracking-wide text-slate-900 pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Registrants list */}
      <div>
        <div className="mb-3">
          <h2 aria-live="polite" className="font-mono text-xs font-bold uppercase tracking-widest text-slate-500">
            Registrants <span className="ml-1 font-normal text-slate-400">({results.length})</span>
          </h2>
        </div>
        <div className="space-y-2">
          {results.length === 0 ? (
            <div className={`${PANEL} px-6 py-8 text-center`}>
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">No Registrants Found</p>
              <p className="mt-1 text-sm text-slate-500">Try a different search term, or register the applicant as a walk-in.</p>
            </div>
          ) : (
            results.map((reg) => {
              const name = [reg.first_name, reg.middle_name, reg.last_name].filter(Boolean).join(' ')
              const isCheckedIn = reg.check_in_status === 'checked_in'

              return (
                <div
                  key={reg.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-2 border-slate-900 bg-white p-4 pixel-shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900">{name}</h3>
                      <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        {reg.unique_id}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${
                          isCheckedIn ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {reg.check_in_status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{reg.email || 'No email'}</span>
                      <span>{reg.contact_no || 'No contact'}</span>
                      <span>{reg.events?.event_name || 'Job Fair'}</span>
                      {isCheckedIn && reg.check_in_time && (
                        <span className="text-emerald-600">Checked in {new Date(reg.check_in_time).toLocaleString()}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      to={`/staff/checkin/${reg.id}`}
                      className={`${BTN_MINI} bg-white text-slate-700`}
                    >
                      Details
                    </Link>
                    {!isCheckedIn && (
                      <button
                        onClick={() => handleQuickCheckin(reg.id)}
                        disabled={actionId === reg.id}
                        className={`${BTN_MINI} bg-emerald-400 text-slate-900 disabled:opacity-50`}
                      >
                        {actionId === reg.id ? 'Checking in...' : 'Check-In'}
                      </button>
                    )}
                    {isCheckedIn && (
                      <button
                        onClick={() => openInterviewModal(reg)}
                        disabled={actionId === reg.id}
                        className={`${BTN_MINI} bg-amber-400 text-slate-900 disabled:opacity-50`}
                      >
                        Interview Result
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Interview Result modal */}
      {interviewReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setInterviewReg(null)}>
          <div role="dialog" aria-modal="true" aria-label="Interview result" className={`${PANEL} max-h-[90dvh] w-full max-w-md overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-black uppercase tracking-wide text-slate-900">Interview Result</h3>
              <button onClick={() => setInterviewReg(null)} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl leading-none text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">Ã—</button>
            </div>

            {/* Applicant */}
            <div className="mb-4 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">Applicant</p>
              <p className="text-lg font-bold text-slate-900">
                {[interviewReg.first_name, interviewReg.middle_name, interviewReg.last_name].filter(Boolean).join(' ')}
              </p>
              <p className="font-mono text-xs font-semibold text-blue-700">
                {interviewReg.unique_id} · {interviewReg.events?.event_name || 'No event'}
              </p>
            </div>

            {interviewLoading ? (
              <div className="py-6 text-center" role="status"><div className="flex items-center justify-center gap-1.5" aria-hidden>{[0, 1, 2].map(i => <span key={i} className="pixel-blink inline-block h-2 w-2 bg-amber-400" style={{ animationDelay: `${i * 0.15}s` }} />)}</div><p className="mt-2 font-mono text-xs font-bold uppercase tracking-widest text-slate-400">Loading...</p></div>
            ) : (
              <div className="space-y-4">
                {/* Company */}
                <div>
                  <label className="block text-sm font-medium text-slate-700">Company *</label>
                  <select
                    className={`mt-1 w-full min-h-[48px] rounded-lg border-2 border-slate-900 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-amber-300`}
                    value={interviewCompanyId}
                    onChange={(e) => handleCompanyChange(e.target.value)}
                    required
                  >
                    <option value="">Select Company</option>
                    {interviewCompanies.map(c => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-sm font-medium text-slate-700">Position *</label>
                  <select
                    className={`mt-1 w-full min-h-[48px] rounded-lg border-2 border-slate-900 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-amber-300 disabled:bg-slate-50 disabled:text-slate-400`}
                    value={interviewPositionId}
                    onChange={(e) => setInterviewPositionId(e.target.value)}
                    disabled={!interviewCompanyId}
                    required
                  >
                    <option value="">{interviewCompanyId ? 'Select Position' : 'Select a company first'}</option>
                    {interviewPositions.map(p => (
                      <option key={p.id} value={p.id}>{p.position}</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-slate-700">Interview Result *</label>
                  <select
                    className={`mt-1 w-full min-h-[48px] rounded-lg border-2 border-slate-900 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-amber-300`}
                    value={interviewStatus}
                    onChange={(e) => setInterviewStatus(e.target.value)}
                    required
                  >
                    <option value="">Select Result</option>
                    {INTERVIEW_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Existing interview logs */}
                {interviewLogs.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Interview Results</p>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {interviewLogs.map(log => (
                        <div key={log.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{log.company}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${INTERVIEW_STATUS_BADGE[log.interview_status] || 'bg-slate-100 text-slate-700'}`}>
                              {INTERVIEW_STATUSES.find(s => s.value === log.interview_status)?.label || log.interview_status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{log.position}</p>
                          {log.interview_date && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              {new Date(log.interview_date).toLocaleString()}
                              {log.profiles?.full_name ? ` · ${log.profiles.full_name}` : ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setInterviewReg(null)}
                    className={`${BTN_MINI} bg-white px-4 text-slate-700`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveInterview}
                    disabled={interviewSubmitting || !interviewCompanyId || !interviewPositionId || !interviewStatus}
                    className={`${BTN_MINI} bg-amber-400 px-4 text-slate-900 disabled:opacity-50`}
                  >
                    {interviewSubmitting ? 'Saving...' : 'Save Result'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}