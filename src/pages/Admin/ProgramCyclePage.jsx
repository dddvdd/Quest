import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { programService } from '../../services/programService.js'
import { PANEL, BUTTON } from '../../components/intelligence/IntelligencePanels.jsx'
import { stageColor, statusColor, formatWorkflowDiagram, PROGRAM_STAGE_LABELS } from '../../domain/programOperations.js'

export default function ProgramCyclePage() {
  const { cycleId } = useParams()
  const [cycle, setCycle] = useState({ status: 'loading', data: null })
  const [participants, setParticipants] = useState({ status: 'loading', rows: [] })
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState({ status: 'idle', data: null })
  const [transitionError, setTransitionError] = useState('')

  const loadParticipants = useCallback(() => {
    import('../../lib/supabase.js').then(({ supabase }) =>
      supabase.from('program_participations').select('id, participant_id, current_status, last_event_id, source, created_at, updated_at').eq('program_cycle_id', cycleId).order('created_at', { ascending: false })
    ).then(({ data, error }) => {
      if (error) setParticipants({ status: 'error', rows: [] })
      else setParticipants({ status: 'ready', rows: data ?? [] })
    })
  }, [cycleId])

  useEffect(() => {
    let alive = true
    import('../../lib/supabase.js').then(({ supabase }) =>
      supabase.from('employment_program_cycles').select('*, employment_programs(id, code, name)').eq('id', cycleId).single()
    ).then(({ data, error }) => {
      if (!alive) return
      if (error) setCycle({ status: 'error', data: null })
      else setCycle({ status: 'ready', data })
    })
    loadParticipants()
    return () => { alive = false }
  }, [cycleId, loadParticipants])

  function loadHistory(participationId) {
    setSelected(participationId)
    setHistory({ status: 'loading', data: null })
    setTransitionError('')
    programService.getHistory({ participant_id: participants.rows.find(r => r.id === participationId)?.participant_id, program_cycle_id: cycleId, limit: 50 })
      .then(data => setHistory({ status: 'ready', data }))
      .catch(() => setHistory({ status: 'error', data: null }))
  }

  if (cycle.status === 'loading') return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className={PANEL + ' min-h-48 motion-safe:animate-pulse'} role="status"><span className="sr-only">Loading cycle</span></div>
    </div>
  )

  if (cycle.status === 'error' || !cycle.data) return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className={PANEL} role="alert"><p className="text-sm text-red-700">Cycle not found.</p></div>
    </div>
  )

  const c = cycle.data
  const program = c.employment_programs
  const workflow = c.workflow
  const diagram = formatWorkflowDiagram(workflow)

  return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="border-b border-slate-200 pb-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-role-admin">
          <Link to="/admin/programs" className="hover:underline">Programs</Link> /
          {program && <Link to={`/admin/programs/${program.id}`} className="hover:underline"> {program.code}</Link>} /
          {c.cycle_code}
        </p>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{c.title}</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={PANEL}><h3 className="text-sm font-semibold text-slate-700">Cycle Code</h3><p className="mt-2 font-mono text-lg text-slate-900">{c.cycle_code}</p></div>
        <div className={PANEL}><h3 className="text-sm font-semibold text-slate-700">Dates</h3><p className="mt-2 text-lg text-slate-900">{c.start_date} to {c.end_date}</p></div>
        <div className={PANEL}>
          <h3 className="text-sm font-semibold text-slate-700">Status</h3>
          <p className="mt-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(c.status)}`}>{c.status}</span></p>
        </div>
        <div className={PANEL}><h3 className="text-sm font-semibold text-slate-700">Capacity</h3><p className="mt-2 text-lg text-slate-900">{c.capacity ?? 'Unlimited'}</p></div>
      </div>

      <section aria-label="Workflow configuration" className={PANEL}>
        <h2 className="font-semibold text-slate-900">Workflow</h2>
        <p className="mt-1 text-sm text-slate-600">Configured stages and permitted transitions for this cycle.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {diagram.nodes.map(node => (
            <span key={node} className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${stageColor(node)}`}>
              {PROGRAM_STAGE_LABELS[node] ?? node}
            </span>
          ))}
        </div>
        {diagram.edges.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Workflow transition rules</caption>
              <thead><tr className="border-b text-slate-600"><th scope="col" className="px-2 py-2">From</th><th scope="col" className="px-2 py-2">Allowed Next</th></tr></thead>
              <tbody>
                {Object.entries(workflow.transitions ?? {}).map(([from, targets]) => (
                  <tr key={from} className="border-b border-slate-100">
                    <td className="px-2 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stageColor(from)}`}>{PROGRAM_STAGE_LABELS[from] ?? from}</span></td>
                    <td className="px-2 py-2 flex flex-wrap gap-1">{targets.map(t => <span key={t} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stageColor(t)}`}>{PROGRAM_STAGE_LABELS[t] ?? t}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {c.application_start && (
        <div className={PANEL}>
          <h3 className="text-sm font-semibold text-slate-700">Application Window</h3>
          <p className="mt-2 text-slate-800">{c.application_start} to {c.application_end}</p>
        </div>
      )}

      <section aria-label="Participants">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Participants ({participants.rows.length})</h2>
        {participants.status === 'loading' && <div className={PANEL + ' min-h-24 motion-safe:animate-pulse'} role="status"><span className="sr-only">Loading participants</span></div>}
        {participants.status === 'ready' && participants.rows.length === 0 && (
          <div className={PANEL}><p className="text-sm text-slate-600">No participants enrolled in this cycle yet.</p></div>
        )}
        {participants.status === 'ready' && participants.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Cycle participants</caption>
              <thead>
                <tr className="border-b text-slate-600">
                  <th scope="col" className="px-3 py-3">Current Stage</th>
                  <th scope="col" className="px-3 py-3">Source</th>
                  <th scope="col" className="px-3 py-3">Recorded</th>
                  <th scope="col" className="px-3 py-3">Updated</th>
                  <th scope="col" className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {participants.rows.map(row => (
                  <tr key={row.id} className={`border-b border-slate-100 ${selected === row.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stageColor(row.current_status)}`}>{PROGRAM_STAGE_LABELS[row.current_status] ?? row.current_status}</span></td>
                    <td className="px-3 py-3 text-slate-700 max-w-48 truncate">{row.source}</td>
                    <td className="px-3 py-3 text-slate-700">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-slate-700">{new Date(row.updated_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3">
                      <button type="button" className={BUTTON} onClick={() => loadHistory(row.id)}>
                        View History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && history.status !== 'idle' && (
        <section aria-label="Transition history" className={PANEL}>
          <h2 className="font-semibold text-slate-900">Transition History</h2>
          {history.status === 'loading' && <p className="mt-3 text-sm text-slate-600">Loading history...</p>}
          {history.status === 'error' && <p className="mt-3 text-sm text-red-700">Could not load history.</p>}
          {history.status === 'ready' && history.data && (
            <div className="mt-3">
              {Array.isArray(history.data) && history.data.length > 0 ? history.data.map(participation => (
                <div key={participation.id}>
                  <p className="text-sm text-slate-600">Current: <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stageColor(participation.current_status)}`}>{PROGRAM_STAGE_LABELS[participation.current_status]}</span></p>
                  {participation.events && participation.events.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <caption className="sr-only">Immutable transition history</caption>
                        <thead><tr className="border-b text-slate-600">
                          <th scope="col" className="px-2 py-2">Rev</th>
                          <th scope="col" className="px-2 py-2">Kind</th>
                          <th scope="col" className="px-2 py-2">From</th>
                          <th scope="col" className="px-2 py-2">To</th>
                          <th scope="col" className="px-2 py-2">Occurred</th>
                          <th scope="col" className="px-2 py-2">Source</th>
                          <th scope="col" className="px-2 py-2">Evidence</th>
                          <th scope="col" className="px-2 py-2">Verified</th>
                          <th scope="col" className="px-2 py-2">Correction</th>
                        </tr></thead>
                        <tbody>
                          {participation.events.map(event => (
                            <tr key={event.id} className={`border-b border-slate-100 ${event.event_kind === 'correction' ? 'bg-amber-50' : ''}`}>
                              <td className="px-2 py-2 tabular-nums">{event.revision}</td>
                              <td className="px-2 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${event.event_kind === 'correction' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{event.event_kind}</span></td>
                              <td className="px-2 py-2">{event.from_stage ? <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stageColor(event.from_stage)}`}>{PROGRAM_STAGE_LABELS[event.from_stage]}</span> : '—'}</td>
                              <td className="px-2 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stageColor(event.stage)}`}>{PROGRAM_STAGE_LABELS[event.stage]}</span></td>
                              <td className="px-2 py-2">{new Date(event.occurred_at).toLocaleString()}</td>
                              <td className="px-2 py-2 max-w-32 truncate">{event.source}</td>
                              <td className="px-2 py-2 max-w-32 truncate">{event.evidence_type}</td>
                              <td className="px-2 py-2"><span className={`text-xs font-semibold ${event.verification_status === 'verified' ? 'text-green-700' : 'text-slate-600'}`}>{event.verification_status}</span></td>
                              <td className="px-2 py-2 text-xs text-slate-600">{event.correction_reason ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {participation.outcomes && participation.outcomes.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-slate-700">Linked Outcomes</h3>
                      <p className="mt-1 text-xs text-slate-600">Employment outcome observed after participation. No causal claim.</p>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <caption className="sr-only">Linked verified outcomes</caption>
                          <thead><tr className="border-b text-slate-600">
                            <th scope="col" className="px-2 py-2">Type</th>
                            <th scope="col" className="px-2 py-2">Occurred</th>
                            <th scope="col" className="px-2 py-2">Verified</th>
                            <th scope="col" className="px-2 py-2">Employment Linked</th>
                            <th scope="col" className="px-2 py-2">Causal Attribution</th>
                          </tr></thead>
                          <tbody>
                            {participation.outcomes.map(outcome => (
                              <tr key={outcome.id} className="border-b border-slate-100">
                                <td className="px-2 py-2">{outcome.outcome_type}</td>
                                <td className="px-2 py-2">{new Date(outcome.occurred_at).toLocaleString()}</td>
                                <td className="px-2 py-2"><span className={`text-xs font-semibold ${outcome.verification_status === 'verified' ? 'text-green-700' : 'text-slate-600'}`}>{outcome.verification_status}</span></td>
                                <td className="px-2 py-2">{outcome.linked_employment_current_verified ?? '—'}</td>
                                <td className="px-2 py-2 text-xs font-semibold text-slate-600">{String(outcome.causal_attribution)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )) : <p className="mt-3 text-sm text-slate-600">No history records found.</p>}
            </div>
          )}
        </section>
      )}

      {transitionError && <div className={PANEL} role="alert"><p className="text-sm text-red-700">{transitionError}</p></div>}
    </div>
  )
}
