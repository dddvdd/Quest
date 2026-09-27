import { useState } from 'react'
import { toast } from 'sonner'
import { useStaffEventsAnyStatus } from '../../hooks/events/useEvents'
import { registrantService } from '../../services/registrantService'
import { interviewService } from '../../services/interviewService'
import { eventVacancyService } from '../../services/eventVacancyService'
import { applicationService } from '../../services/applicationService'
import { INTERVIEW_STATUS, INTERVIEW_STATUS_LABEL, INTERVIEW_STATUS_BADGE } from '../../domain/statuses'
import { format } from 'date-fns'
import { eventTypeDisplay } from '../../domain/eventTypes'

const INTERVIEW_STATUSES = [
  { value: INTERVIEW_STATUS.QUALIFIED, label: INTERVIEW_STATUS_LABEL[INTERVIEW_STATUS.QUALIFIED] },
  { value: INTERVIEW_STATUS.NOT_QUALIFIED, label: INTERVIEW_STATUS_LABEL[INTERVIEW_STATUS.NOT_QUALIFIED] },
  { value: INTERVIEW_STATUS.NEAR_HIRE, label: INTERVIEW_STATUS_LABEL[INTERVIEW_STATUS.NEAR_HIRE] },
  { value: INTERVIEW_STATUS.HOTS, label: INTERVIEW_STATUS_LABEL[INTERVIEW_STATUS.HOTS] },
]

// ----- Pixel design tokens (shared with scanner/calendar pages) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 bg-white pixel-shadow'
const BTN_BASE = 'inline-flex items-center justify-center rounded-lg border-2 border-slate-900 font-black uppercase tracking-wide pixel-shadow active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300'

export default function InterviewLogPage() {
  const { events } = useStaffEventsAnyStatus()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const [registrant, setRegistrant] = useState(null)
  const [logs, setLogs] = useState([])
  const [companies, setCompanies] = useState([])
  const [positions, setPositions] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  const [form, setForm] = useState({ event_id: '', company_id: '', vacancy_id: '', interview_status: '', interview_notes: '', application_id: '' })
  const [submitting, setSubmitting] = useState(false)
  const [applications, setApplications] = useState([])

  async function handleSearch(e) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    try {
      const rows = await registrantService.search(q)
      setSearchResults(rows || [])
      if (!rows?.length) toast.info('No matching registrant found.')
    } catch (err) {
      toast.error(`Search failed: ${err.message}`)
    } finally {
      setSearching(false)
    }
  }

  async function selectRegistrant(reg) {
    setRegistrant(reg)
    setSearchResults([])
    setSearchQuery('')
    setForm({ event_id: reg.event_id || events[0]?.id || '', company_id: '', vacancy_id: '', interview_status: '', interview_notes: '', application_id: '' })
    setCompanies([])
    setPositions([])
    await loadLogs(reg.id)
    await loadApplications(reg.id)
    await loadCompanies(reg.event_id || events[0]?.id || '')
  }

  async function loadLogs(registrantId) {
    setLoadingLogs(true)
    try {
      const rows = await interviewService.listForRegistrantWithContext(registrantId)
      setLogs(rows || [])
    } catch (err) {
      toast.error(`Could not load interview logs: ${err.message}`)
      setLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }

  async function loadApplications(registrantId) {
    try {
      const rows = await applicationService.listForRegistrant(registrantId)
      setApplications(rows || [])
    } catch {
      setApplications([])
    }
  }

  async function loadCompanies(eventId) {
    if (!eventId) { setCompanies([]); setPositions([]); return }
    try {
      const rows = await eventVacancyService.listCompanyParticipants(eventId)
      const seen = new Set()
      const list = []
      ;(rows || []).forEach(ev => {
        const vd = ev?.vacancy_definitions
        const emp = vd?.employers
        if (vd?.employer_id && emp?.company_name && !seen.has(vd.employer_id)) {
          seen.add(vd.employer_id)
          list.push({ id: vd.employer_id, company_name: emp.company_name })
        }
      })
      setCompanies(list.sort((a, b) => a.company_name.localeCompare(b.company_name)))
      setPositions([])
    } catch (err) {
      toast.error(`Could not load companies: ${err.message}`)
    }
  }

  async function handleCompanyChange(companyId) {
    setForm(f => ({ ...f, company_id: companyId, vacancy_id: '' }))
    setPositions([])
    if (!companyId || !form.event_id) return
    try {
      const rows = await eventVacancyService.listPositionsForCompanyInEvent(form.event_id, companyId)
      const positions = (rows || [])
        .map(ev => ev?.vacancy_definitions)
        .filter(vd => vd?.id && vd?.position)
        .sort((a, b) => a.position.localeCompare(b.position))
      setPositions(positions)
    } catch (err) {
      toast.error(`Could not load positions: ${err.message}`)
    }
  }

  async function handleEventChange(eventId) {
    setForm(f => ({ ...f, event_id: eventId, company_id: '', vacancy_id: '', application_id: '' }))
    await loadCompanies(eventId)
  }

  const isCheckedIn = registrant?.check_in_status === 'checked_in'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!registrant) return
    setSubmitting(true)

    try {
      await interviewService.record({
        p_registrant_id: registrant.id,
        p_event_id: form.event_id,
        p_employer_id: form.company_id,
        p_vacancy_definition_id: form.vacancy_id,
        p_status: form.interview_status,
        p_application_id: form.application_id || null,
        p_interview_notes: form.interview_notes || null,
      })

      if (form.interview_status === INTERVIEW_STATUS.HOTS) {
        toast.info('HOTS interview recorded. Create the medical referral via the Medical Referral tab.')
      } else {
        toast.success('Interview log saved!')
      }

      setForm(f => ({ ...f, company_id: '', vacancy_id: '', interview_status: '', interview_notes: '', application_id: '' }))
      setPositions([])
      await loadLogs(registrant.id)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function resetRegistrant() {
    setRegistrant(null)
    setLogs([])
    setApplications([])
    setCompanies([])
    setPositions([])
  }

  const inputCls = 'w-full min-h-[48px] rounded-lg border-2 border-slate-900 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-amber-300'
  const name = registrant ? [registrant.first_name, registrant.middle_name, registrant.last_name].filter(Boolean).join(' ') : ''

  const eventApps = applications.filter(a => String(a.event_vacancies?.event_id) === String(form.event_id))

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700">Interview Tracking</p>
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Interview Log</h1>
        <p className="mt-1 text-sm text-slate-600">Record interview results. For HOTS applicants, create the medical referral in the Medical Referral tab.</p>
      </div>

      {!registrant ? (
        <div className={`p-6 ${PANEL}`}>
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:max-w-2xl">
            <input
              type="text"
              placeholder="Search by unique ID, name, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search registrants"
              className="min-h-[48px] flex-1 rounded-lg border-2 border-slate-900 bg-white px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
            />
            <button type="submit" disabled={searching || !searchQuery.trim()} className="inline-flex min-h-[48px] items-center justify-center rounded-lg border-2 border-slate-900 bg-amber-400 px-6 text-sm font-black uppercase tracking-wide text-slate-900 pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {searchResults.map(reg => (
              <button
                key={reg.id}
                onClick={() => selectRegistrant(reg)}
                className="flex w-full flex-col items-start gap-1 rounded-xl border-2 border-slate-900 bg-white p-4 text-left pixel-shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
              >
                <span className="font-bold text-slate-900">
                  {[reg.first_name, reg.middle_name, reg.last_name].filter(Boolean).join(' ')}
                </span>
                <span className="text-xs text-slate-500">
                  <span className="font-mono font-semibold text-blue-700">{reg.unique_id}</span>
                  {' · '}{reg.email || 'no email'} · {reg.events?.event_name || 'No event'}
                  {' · '}<span className={reg.check_in_status === 'checked_in' ? 'font-semibold text-emerald-600' : 'font-semibold text-amber-600'}>
                    {reg.check_in_status === 'checked_in' ? 'Checked in' : 'Not checked in'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className={`p-6 ${PANEL}`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-black uppercase tracking-wide text-slate-900">{name}</h2>
                  <p className="font-mono text-xs font-semibold text-blue-700">{registrant.unique_id}</p>
                </div>
                <button onClick={resetRegistrant} className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border-2 border-slate-900 bg-white px-3 text-xs font-bold uppercase tracking-wide text-slate-600 pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">← Change</button>
              </div>

              {!isCheckedIn && (
                <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                  This applicant has not checked in. Interviews can only be recorded for checked-in applicants.
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Event">
                  <select className={inputCls} value={form.event_id} onChange={(e) => handleEventChange(e.target.value)}>
                    <option value="">Select event</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name} — {eventTypeDisplay(ev)}</option>)}
                  </select>
                </Field>

                <Field label="Company / Agency *">
                  <select className={inputCls} value={form.company_id} onChange={(e) => handleCompanyChange(e.target.value)} disabled={!form.event_id}>
                    <option value="">{form.event_id ? 'Select company' : 'Select an event first'}</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </select>
                </Field>

                <Field label="Position *">
                  <select className={inputCls} value={form.vacancy_id} onChange={(e) => setForm(f => ({ ...f, vacancy_id: e.target.value }))} disabled={!form.company_id}>
                    <option value="">{form.company_id ? 'Select position' : 'Select a company first'}</option>
                    {positions.map(p => <option key={p.id} value={p.id}>{p.position}</option>)}
                  </select>
                </Field>

                <Field label="Interview status *">
                  <select className={inputCls} value={form.interview_status} onChange={(e) => setForm(f => ({ ...f, interview_status: e.target.value }))}>
                    <option value="">Select status</option>
                    {INTERVIEW_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>

                <Field label="Notes">
                  <textarea className={inputCls} rows={3} value={form.interview_notes} onChange={(e) => setForm(f => ({ ...f, interview_notes: e.target.value }))} />
                </Field>

                {eventApps.length > 0 && (
                  <Field label="Link to Application (optional)">
                    <select className={inputCls} value={form.application_id} onChange={(e) => setForm(f => ({ ...f, application_id: e.target.value }))}>
                      <option value="">No application linked</option>
                      {eventApps.map(app => (
                        <option key={app.id} value={app.id}>
                          {app.event_vacancies?.vacancy_definitions?.company_name || ''} — {app.event_vacancies?.vacancy_definitions?.position || ''} ({app.application_status})
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <button
                  type="submit"
                  disabled={submitting || !isCheckedIn || !form.event_id || !form.company_id || !form.vacancy_id || !form.interview_status}
                  className={`${BTN_BASE} w-full bg-amber-400 py-3.5 text-slate-900 disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {submitting ? 'Saving...' : 'Save Interview Log'}
                </button>
              </form>
            </div>

            <div className={`p-6 ${PANEL}`}>
              <h3 className="mb-4 font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Existing interview logs</h3>
              {loadingLogs ? (
                <div className="py-6 text-center" role="status">
                  <div className="flex items-center justify-center gap-1.5" aria-hidden>
                    {[0, 1, 2].map(i => (
                      <span key={i} className="pixel-blink inline-block h-2 w-2 bg-amber-400" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-xs font-bold uppercase tracking-widest text-slate-400">Loading…</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">No Logs Yet</p>
                  <p className="mt-1 text-sm text-slate-500">Saved interview results for this applicant will appear here.</p>
                </div>
              ) : (
                <div className="max-h-[420px] space-y-3 overflow-y-auto">
                  {logs.map(log => (
                    <div key={log.id} className="rounded-xl border-2 border-slate-900 bg-white p-4 pixel-shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{log.position} <span className="font-normal text-slate-500">— {log.company}</span></p>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${INTERVIEW_STATUS_BADGE[log.interview_status] || 'bg-slate-100 text-slate-700'}`}>
                          {INTERVIEW_STATUSES.find(s => s.value === log.interview_status)?.label || log.interview_status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {log.events?.event_name || 'No event'} · Interviewer: {log.profiles?.full_name || '—'} · {format(new Date(log.interview_date), 'MMM d, yyyy h:mm a')}
                      </p>
                      {log.interview_notes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{log.interview_notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  )
}