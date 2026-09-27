import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'
import { eventTypeDisplay } from '../../domain/eventTypes'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { PixelArrow, PixelPin } from '../../components/public/pixel'
import { supervisorService } from '../../services/supervisorService'

// ----- Pixel design tokens (shared with scanner/calendar/jobseeker pages) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 bg-white pixel-shadow'
const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-slate-900 px-4 font-bold uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300'
const SWATCH = { blue: 'bg-blue-400', green: 'bg-emerald-400', amber: 'bg-amber-400', purple: 'bg-purple-400', red: 'bg-red-400', teal: 'bg-teal-400', indigo: 'bg-indigo-400', orange: 'bg-orange-400', pink: 'bg-pink-400' }

export default function SupervisorDashboard() {
  const { profile } = useAuth()
  const [summary, setSummary] = useState({
    registered: 0,
    checkedIn: 0,
    walkIns: 0,
    interviews: 0,
    activeReferrals: 0,
    firstTimeJobseekers: 0,
    pwd: 0,
    returningWorkers: 0,
    returningOfws: 0,
  })
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [events, setEvents] = useState([])

  // Modal state
  const [modalOpen, setModalOpen] = useState(null)
  const [modalData, setModalData] = useState([])
  const [modalLoading, setModalLoading] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [modalFilters, setModalFilters] = useState({})

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

  const fetchSummary = useCallback(async (visibleEventIds) => {
    setLoading(true)
    try {
      const stats = await supervisorService.fetchSummary({ selectedEvent, visibleEventIds })
      setSummary({
        registered: stats.registered,
        checkedIn: stats.checkedIn,
        walkIns: stats.walkIns,
        interviews: stats.interviews,
        activeReferrals: stats.activeReferrals,
        firstTimeJobseekers: stats.firstTimeJobseekers,
        pwd: stats.pwd,
        returningWorkers: stats.returningWorkers,
        returningOfws: stats.returningOfws,
      })
    } catch (err) {
      console.error('Failed to fetch summary:', err)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [selectedEvent])

  useEffect(() => {
    fetchVisibleEvents().then(ev => {
      setEvents(ev)
      const eventIds = ev.map(e => e.id)
      fetchSummary(eventIds)
    })
  }, [fetchVisibleEvents, fetchSummary])

  // Build query for overview cards (may hit different tables).
  // Delegates to supervisorService — the page only picks the right card config.
  function buildOverviewQuery(card) {
    // Card shape is what supervisorService.fetchOverviewCard expects:
    //   { table, filterKey, filterValue }
    return supervisorService.fetchOverviewCard({
      card,
      selectedEvent,
      visibleEventIds: events.map(e => e.id),
    })
  }

// Open modal — fetch data for the selected card
  async function openModal(card) {
    setModalOpen(card)
    setModalSearch('')
    setModalFilters({})
    setModalLoading(true)
    try {
      const data = await buildOverviewQuery(card)
      setModalData(data || [])
    } catch (err) {
      console.error('Failed to load modal data:', err)
      toast.error(`Failed to load data: ${err.message}`)
    } finally {
      setModalLoading(false)
    }
  }

  // Export CSV from modal data
  function exportModalCsv(card) {
    if (!modalData || modalData.length === 0) return

    let rows
    if (card.table === 'interviews') {
      rows = modalData.map(r => ({
        'Unique ID': r.registrants?.unique_id || '',
        'Name': [r.registrants?.first_name, r.registrants?.middle_name, r.registrants?.last_name].filter(Boolean).join(' '),
        'Email': r.registrants?.email || '',
        'Contact': r.registrants?.contact_no || '',
        'Company': r.company || '',
        'Position': r.position || '',
        'Status': r.interview_status || '',
        'Date': r.interview_date ? format(new Date(r.interview_date), 'MMM d, yyyy HH:mm') : '',
        'Notes': r.interview_notes || '',
      }))
    } else if (card.table === 'referrals') {
      rows = modalData.map(r => ({
        'Unique ID': r.registrants?.unique_id || '',
        'Name': [r.registrants?.first_name, r.registrants?.middle_name, r.registrants?.last_name].filter(Boolean).join(' '),
        'Email': r.registrants?.email || '',
        'Contact': r.registrants?.contact_no || '',
        'Status': r.status || '',
        'Notes': r.notes || '',
        'Date': r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy HH:mm') : '',
      }))
    } else {
      rows = modalData.map(r => ({
        'Unique ID': r.unique_id || '',
        'First Name': r.first_name || '',
        'Middle Name': r.middle_name || '',
        'Last Name': r.last_name || '',
        'Email': r.email || '',
        'Contact': r.contact_no || '',
        'Sex': r.sex || '',
        'Civil Status': r.civil_status || '',
        'Province': r.province || '',
        'Municipality': r.municipality_city || '',
        'Barangay': r.barangay || '',
        'Education': r.highest_educational_attainment || '',
        'Course/Program': r.course_program || '',
        'Employment Preference': r.employment_preference || '',
        'Check-in Status': r.check_in_status || '',
        'Registration Type': r.registration_type || '',
        'Registered': r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy HH:mm') : '',
      }))
    }

    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${card.fileName}-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${modalData.length} records as CSV`)
  }

  // Derive filter options from modalData
  function getUniqueValues(data, key) {
    const vals = [...new Set(data.map(r => r[key]).filter(Boolean))].sort()
    return vals
  }

  const filterOptions = useMemo(() => {
    if (!modalOpen || modalData.length === 0) return {}

    if (modalOpen.table === 'interviews') {
      return {
        company: getUniqueValues(modalData, 'company'),
        position: getUniqueValues(modalData, 'position'),
        interview_status: getUniqueValues(modalData, 'interview_status'),
      }
    }
    if (modalOpen.table === 'referrals') {
      return {
        status: getUniqueValues(modalData, 'status'),
      }
    }
    // registrants-based cards
    return {
      municipality_city: getUniqueValues(modalData, 'municipality_city'),
      province: getUniqueValues(modalData, 'province'),
    }
  }, [modalData, modalOpen])

  // Filter modal data by search + dropdown filters
  const filteredModalData = useMemo(() => {
    let data = modalData

    // Apply dropdown filters
    Object.entries(modalFilters).forEach(([key, val]) => {
      if (val) data = data.filter(r => r[key] === val)
    })

    // Apply search
    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase()
      if (modalOpen?.table === 'interviews') {
        data = data.filter(r =>
          (r.registrants?.first_name || '').toLowerCase().includes(q) ||
          (r.registrants?.last_name || '').toLowerCase().includes(q) ||
          (r.registrants?.unique_id || '').toLowerCase().includes(q) ||
          (r.registrants?.email || '').toLowerCase().includes(q) ||
          (r.company || '').toLowerCase().includes(q) ||
          (r.position || '').toLowerCase().includes(q)
        )
      } else if (modalOpen?.table === 'referrals') {
        data = data.filter(r =>
          (r.registrants?.first_name || '').toLowerCase().includes(q) ||
          (r.registrants?.last_name || '').toLowerCase().includes(q) ||
          (r.registrants?.unique_id || '').toLowerCase().includes(q) ||
          (r.registrants?.email || '').toLowerCase().includes(q)
        )
      } else {
        data = data.filter(r =>
          (r.unique_id || '').toLowerCase().includes(q) ||
          (r.first_name || '').toLowerCase().includes(q) ||
          (r.last_name || '').toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q) ||
          (r.municipality_city || '').toLowerCase().includes(q) ||
          (r.barangay || '').toLowerCase().includes(q)
        )
      }
    }

    return data
  }, [modalData, modalSearch, modalFilters, modalOpen])

  const overviewCards = [
    { label: 'Registered', value: summary.registered, icon: '👥', color: 'blue', table: 'registrants', fileName: 'registered' },
    { label: 'Checked In', value: summary.checkedIn, icon: '✅', color: 'green', table: 'registrants', filterKey: 'check_in_status', filterValue: 'checked_in', fileName: 'checked-in' },
    { label: 'Walk-ins', value: summary.walkIns, icon: '📝', color: 'amber', table: 'registrants', filterKey: 'registration_type', filterValue: 'walkin', fileName: 'walk-ins' },
    { label: 'Interviews', value: summary.interviews, icon: '📋', color: 'purple', table: 'interviews', fileName: 'interviews' },
    { label: 'Active Referrals', value: summary.activeReferrals, icon: '🩺', color: 'red', table: 'referrals', filterKey: 'status', filterValue: 'pending', fileName: 'active-referrals' },
  ]

  const demographicCards = [
    { label: 'First-Time Jobseekers', value: summary.firstTimeJobseekers, icon: '🆕', color: 'teal', filterKey: 'first_time_jobseeker', filterValue: true, fileName: 'first-time-jobseekers' },
    { label: 'PWD', value: summary.pwd, icon: '♿', color: 'indigo', filterKey: 'has_disability', filterValue: true, fileName: 'pwd' },
    { label: 'Returning Workers', value: summary.returningWorkers, icon: '🔄', color: 'orange', filterKey: 'returning_worker', filterValue: true, fileName: 'returning-workers' },
    { label: 'Returning OFW', value: summary.returningOfws, icon: '✈️', color: 'pink', filterKey: 'returning_ofw', filterValue: true, fileName: 'returning-ofw' },
  ]

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50" role="status">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5" aria-hidden>
            {[0, 1, 2].map(i => (
              <span key={i} className="pixel-blink inline-block h-2.5 w-2.5 bg-role-supervisor" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Loading dashboard…</p>
        </div>
      </main>
    )
  }

  return (
    <div className="space-y-6">
      <div className={`${PANEL} flex flex-col gap-3 bg-white p-4 sm:flex-row sm:items-center sm:justify-between`}>
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <PixelPin className="h-3.5 w-3.5 shrink-0 text-role-supervisor" />
          {isProvincial
            ? 'Provincial Supervisor — viewing ALL municipalities'
            : `Municipal Supervisor — viewing ${supervisorJurisdiction} only`}
        </p>
        <div className="min-w-0 w-full sm:w-auto sm:max-w-sm">
          <select
            value={selectedEvent || ''}
            onChange={e => setSelectedEvent(e.target.value || null)}
            aria-label="Filter by event"
            className="min-h-[44px] w-full min-w-0 max-w-full rounded-lg border-2 border-slate-900 bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"
          >
            <option value="">All Events in Jurisdiction</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.event_name} — {format(new Date(ev.event_date), 'MMM d, yyyy')} ({eventTypeDisplay(ev)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Overview Cards */}
      <section aria-label="Overview">
        <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {overviewCards.map(card => (
            <button
              key={card.label}
              type="button"
              onClick={() => openModal(card)}
              className={`${PANEL} p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">{card.label}</p>
                  <p className="mt-1 text-3xl font-black text-slate-900">{card.value.toLocaleString()}</p>
                </div>
                <span aria-hidden className={`h-4 w-4 shrink-0 border-2 border-slate-900 ${SWATCH[card.color] || 'bg-slate-300'}`} />
              </div>
              <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">View list <PixelArrow className="h-2 w-2" /></p>
            </button>
          ))}
        </div>
      </section>

      {/* Demographic Cards */}
      <section aria-label="Jobseeker demographics">
        <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">Jobseeker Demographics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {demographicCards.map(card => (
            <button
              key={card.label}
              type="button"
              onClick={() => openModal(card)}
              className={`${PANEL} flex flex-col justify-between p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">{card.label}</p>
                  <p className="mt-1 text-3xl font-black text-slate-900">{card.value.toLocaleString()}</p>
                </div>
                <span aria-hidden className={`h-4 w-4 shrink-0 border-2 border-slate-900 ${SWATCH[card.color] || 'bg-slate-300'}`} />
              </div>
              <p className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">View list <PixelArrow className="h-2 w-2" /></p>
            </button>
          ))}
        </div>
      </section>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setModalOpen(null)}>
          <div
            className={`${PANEL} flex max-h-[90dvh] w-full max-w-4xl flex-col`}
            role="dialog"
            aria-modal="true"
            aria-label={`${modalOpen.label} list`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b-2 border-slate-900 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className={`h-5 w-5 shrink-0 border-2 border-slate-900 ${SWATCH[modalOpen.color] || 'bg-slate-300'}`} />
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black uppercase tracking-wide text-slate-900">{modalOpen.label}</h3>
                  <p aria-live="polite" className="font-mono text-[11px] font-bold text-slate-500">{filteredModalData.length} record(s)</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => exportModalCsv(modalOpen)}
                  disabled={modalData.length === 0}
                  className={`${BTN} bg-role-supervisor px-3 text-xs text-white disabled:opacity-50`}
                >
                  Export CSV
                </button>
                <button
                  onClick={() => setModalOpen(null)}
                  aria-label="Close"
                  className="grid h-11 w-11 place-items-center rounded-lg text-xl leading-none text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Search + Filters */}
            <div className="space-y-3 border-b border-slate-200 px-4 py-3 sm:px-6">
              <input
                type="search"
                placeholder="Search by name, ID, email…"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="w-full rounded-lg border-2 border-slate-900 bg-white px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-pink-300 sm:max-w-md"
              />
              {Object.keys(filterOptions).length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {modalOpen?.table === 'interviews' && (
                    <>
                      <select
                        value={modalFilters.company || ''}
                        onChange={e => setModalFilters(f => ({ ...f, company: e.target.value }))}
                        className="min-h-[44px] rounded-lg border-2 border-slate-900 bg-white px-2 text-xs font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"
                      >
                        <option value="">All Companies</option>
                        {filterOptions.company?.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <select
                        value={modalFilters.position || ''}
                        onChange={e => setModalFilters(f => ({ ...f, position: e.target.value }))}
                        className="min-h-[44px] rounded-lg border-2 border-slate-900 bg-white px-2 text-xs font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"
                      >
                        <option value="">All Positions</option>
                        {filterOptions.position?.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <select
                        value={modalFilters.interview_status || ''}
                        onChange={e => setModalFilters(f => ({ ...f, interview_status: e.target.value }))}
                        className="min-h-[44px] rounded-lg border-2 border-slate-900 bg-white px-2 text-xs font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"
                      >
                        <option value="">All Statuses</option>
                        {filterOptions.interview_status?.map(v => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
                      </select>
                    </>
                  )}
                  {modalOpen?.table === 'referrals' && (
                    <select
                      value={modalFilters.status || ''}
                      onChange={e => setModalFilters(f => ({ ...f, status: e.target.value }))}
                      className="min-h-[44px] rounded-lg border-2 border-slate-900 bg-white px-2 text-xs font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"
                    >
                      <option value="">All Statuses</option>
                      {filterOptions.status?.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                  {modalOpen?.table === 'registrants' && (
                    <>
                      <select
                        value={modalFilters.municipality_city || ''}
                        onChange={e => setModalFilters(f => ({ ...f, municipality_city: e.target.value }))}
                        className="min-h-[44px] rounded-lg border-2 border-slate-900 bg-white px-2 text-xs font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"
                      >
                        <option value="">All Municipalities</option>
                        {filterOptions.municipality_city?.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <select
                        value={modalFilters.province || ''}
                        onChange={e => setModalFilters(f => ({ ...f, province: e.target.value }))}
                        className="min-h-[44px] rounded-lg border-2 border-slate-900 bg-white px-2 text-xs font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"
                      >
                        <option value="">All Provinces</option>
                        {filterOptions.province?.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </>
                  )}
                  {Object.values(modalFilters).some(Boolean) && (
                    <button
                      onClick={() => setModalFilters({})}
                      className={`${BTN} bg-white px-3 text-xs text-red-600`}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto px-6 py-2">
              {modalLoading ? (
                <div className="py-12 text-center" role="status">
                  <div className="flex items-center justify-center gap-1.5" aria-hidden>
                    {[0, 1, 2].map(i => (
                      <span key={i} className="pixel-blink inline-block h-2 w-2 bg-role-supervisor" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Loading records…</p>
                </div>
              ) : filteredModalData.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">No records found</p>
                  <p className="mt-1 text-sm text-slate-500">Try a different search term or clear the filters above.</p>
                </div>
              ) : modalOpen?.table === 'interviews' ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">Registrant</th>
                      <th className="px-3 py-2">Company</th>
                      <th className="px-3 py-2">Position</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredModalData.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{[r.registrants?.first_name, r.registrants?.middle_name, r.registrants?.last_name].filter(Boolean).join(' ')}</p>
                          <p className="font-mono text-xs text-blue-700">{r.registrants?.unique_id || ''}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{r.company || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{r.position || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            r.interview_status === 'hots' ? 'bg-blue-100 text-blue-800' :
                            r.interview_status === 'qualified' ? 'bg-emerald-100 text-emerald-800' :
                            r.interview_status === 'near_hire' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {r.interview_status?.replace('_', ' ') || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                          {r.interview_date ? format(new Date(r.interview_date), 'MMM d, yyyy h:mm a') : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate">{r.interview_notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : modalOpen?.table === 'referrals' ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">Registrant</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredModalData.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{[r.registrants?.first_name, r.registrants?.middle_name, r.registrants?.last_name].filter(Boolean).join(' ')}</p>
                          <p className="font-mono text-xs text-blue-700">{r.registrants?.unique_id || ''}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            r.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                            r.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {r.status || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                          {r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy h:mm a') : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 max-w-[300px] truncate">{r.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Contact</th>
                      <th className="px-3 py-2">Municipality</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredModalData.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                          {[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.unique_id || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">
                          <div>{r.email || '—'}</div>
                          <div className="text-xs text-slate-400">{r.contact_no || ''}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {r.municipality_city || '—'}
                          {r.barangay && <span className="text-xs text-slate-400">, {r.barangay}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            r.check_in_status === 'checked_in' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {r.check_in_status === 'checked_in' ? 'Checked In' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            r.registration_type === 'walkin' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {r.registration_type === 'walkin' ? 'Walk-in' : 'Pre-registered'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}