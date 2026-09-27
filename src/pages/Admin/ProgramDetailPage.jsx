import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { employmentIntelligenceService } from '../../services/employmentIntelligenceService.js'
import { PROGRAM_METRIC_IDS } from '../../domain/employmentIntelligenceMetrics.js'
import { validateMetricRequest } from '../../domain/employmentIntelligence.js'
import { PANEL, MetricCard } from '../../components/intelligence/IntelligencePanels.jsx'
import { statusColor } from '../../domain/programOperations.js'

export default function ProgramDetailPage() {
  const { programId } = useParams()
  const [program, setProgram] = useState({ status: 'loading', data: null })
  const [cycles, setCycles] = useState({ status: 'loading', rows: [] })
  const [metrics, setMetrics] = useState({ status: 'loading', data: null })
  const [draft, setDraft] = useState({ cycleId: '', start: '', end: '' })
  const [filters, setFilters] = useState({ cycleId: '', start: '', end: '' })
  const [filterError, setFilterError] = useState('')

  function applyFilters(event) {
    event.preventDefault()
    try {
      validateMetricRequest(PROGRAM_METRIC_IDS, {
        programId, ...(draft.cycleId ? { cycleId: draft.cycleId } : {}),
        ...(draft.start || draft.end ? { start: draft.start, end: draft.end } : {}),
      })
      setFilterError('')
      setFilters({ ...draft })
    } catch {
      setFilterError('Choose both dates, with the end date after the start date, or leave both dates empty.')
    }
  }

  useEffect(() => {
    let alive = true
    import('../../lib/supabase.js').then(({ supabase }) =>
      supabase.from('employment_programs').select('*').eq('id', programId).single()
    ).then(({ data, error }) => {
      if (!alive) return
      if (error) setProgram({ status: 'error', data: null })
      else setProgram({ status: 'ready', data })
    })
    return () => { alive = false }
  }, [programId])

  useEffect(() => {
    let alive = true
    import('../../lib/supabase.js').then(({ supabase }) =>
      supabase.from('employment_program_cycles').select('id, cycle_code, title, start_date, end_date, status, capacity, created_at').eq('program_id', programId).order('created_at', { ascending: false })
    ).then(({ data, error }) => {
      if (!alive) return
      if (error) setCycles({ status: 'error', rows: [] })
      else setCycles({ status: 'ready', rows: data ?? [] })
    })
    return () => { alive = false }
  }, [programId])

  useEffect(() => {
    let alive = true
    setMetrics({ status: 'loading', data: null })
    employmentIntelligenceService.getMetrics(PROGRAM_METRIC_IDS, {
      programId, ...(filters.cycleId ? { cycleId: filters.cycleId } : {}),
      ...(filters.start ? { start: filters.start, end: filters.end } : {}),
    }).then(data => {
      if (!alive) return
      setMetrics({ status: 'ready', data })
    }).catch(() => {
      if (alive) setMetrics({ status: 'error', data: null })
    })
    return () => { alive = false }
  }, [programId, filters])

  if (program.status === 'loading') return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className={PANEL + ' min-h-48 motion-safe:animate-pulse'} role="status"><span className="sr-only">Loading program</span></div>
    </div>
  )

  if (program.status === 'error' || !program.data) return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className={PANEL} role="alert"><p className="text-sm text-red-700">Program not found.</p></div>
    </div>
  )

  const p = program.data

  return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="border-b border-slate-200 pb-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-role-admin">
          <Link to="/admin/programs" className="hover:underline">Programs</Link> / {p.code}
        </p>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{p.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{p.description || 'No description provided.'}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={PANEL}><h3 className="text-sm font-semibold text-slate-700">Code</h3><p className="mt-2 font-mono text-lg text-slate-900">{p.code}</p></div>
        <div className={PANEL}><h3 className="text-sm font-semibold text-slate-700">Type</h3><p className="mt-2 text-lg text-slate-900">{p.program_type}</p></div>
        <div className={PANEL}><h3 className="text-sm font-semibold text-slate-700">Agency</h3><p className="mt-2 text-lg text-slate-900">{p.implementing_agency}</p></div>
        <div className={PANEL}>
          <h3 className="text-sm font-semibold text-slate-700">Status</h3>
          <p className="mt-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${p.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{p.is_active ? 'Active' : 'Inactive'}</span></p>
        </div>
      </div>

        <section aria-label="Program metrics">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Program Metrics</h2>
          <p className="mb-4 text-sm text-slate-600">Operational lifecycle event counts include reported and verified records after corrections. Repeated legitimate stage visits can count more than once. Verified employment observed after participation is observational, with no causal claim.</p>
          <form onSubmit={applyFilters} className={PANEL + ' mb-4 space-y-3'}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="min-w-0 text-sm font-semibold">Cycle
                <select className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal" value={draft.cycleId} onChange={event => setDraft({ ...draft, cycleId: event.target.value })}>
                  <option value="">All program cycles</option>
                  {cycles.rows.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.cycle_code} — {cycle.title}</option>)}
                </select>
              </label>
              <label className="min-w-0 text-sm font-semibold">Start date (UTC, inclusive)
                <input type="date" className="mt-1 block w-full min-w-0 rounded border border-slate-300 p-2 font-normal" value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} />
              </label>
              <label className="min-w-0 text-sm font-semibold">End date (UTC, exclusive)
                <input type="date" className="mt-1 block w-full min-w-0 rounded border border-slate-300 p-2 font-normal" value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} />
              </label>
            </div>
            <p className="text-sm text-slate-600">Dates filter event occurrences using UTC boundaries. Current snapshots are not applicable to date ranges. Leave both dates empty for current snapshots.</p>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Apply filters</button>
              <button type="button" className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={() => { const next = { ...draft, start: '', end: '' }; setDraft(next); setFilters(next); setFilterError('') }}>Clear dates</button>
            </div>
            {filterError && <p role="alert" className="text-sm text-red-700">{filterError}</p>}
          </form>
          {metrics.status === 'loading' && <p role="status">Loading program metrics…</p>}
          {metrics.status === 'error' && <p role="alert" className="text-sm text-red-700">Program metrics could not be loaded. Apply filters to retry.</p>}
          {metrics.status === 'ready' && metrics.data && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.data.cells.map(cell => (
              <MetricCard key={cell.metric_id} id={cell.metric_id} cell={cell} />
            ))}
          </div>}
        </section>

      <section aria-label="Program cycles">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Cycles</h2>
        {cycles.status === 'loading' && <div className={PANEL + ' min-h-24 motion-safe:animate-pulse'} role="status"><span className="sr-only">Loading cycles</span></div>}
        {cycles.status === 'ready' && cycles.rows.length === 0 && (
          <div className={PANEL}><p className="text-sm text-slate-600">No cycles created for this program yet.</p></div>
        )}
        {cycles.status === 'ready' && cycles.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Program cycles</caption>
              <thead>
                <tr className="border-b text-slate-600">
                  <th scope="col" className="px-3 py-3">Cycle</th>
                  <th scope="col" className="px-3 py-3">Title</th>
                  <th scope="col" className="px-3 py-3">Start</th>
                  <th scope="col" className="px-3 py-3">End</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Capacity</th>
                </tr>
              </thead>
              <tbody>
                {cycles.rows.map(cycle => (
                  <tr key={cycle.id} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">
                      <Link to={`/admin/program-cycles/${cycle.id}`} className="text-blue-700 hover:underline">{cycle.cycle_code}</Link>
                    </td>
                    <td className="px-3 py-3 text-slate-800">{cycle.title}</td>
                    <td className="px-3 py-3 text-slate-700">{cycle.start_date}</td>
                    <td className="px-3 py-3 text-slate-700">{cycle.end_date}</td>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(cycle.status)}`}>{cycle.status}</span></td>
                    <td className="px-3 py-3 text-slate-700">{cycle.capacity ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
