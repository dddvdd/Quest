import { EligibilityBadge, MatchScoreBadge } from './MatchScore.jsx'

const dimensionTone = {
  matched: 'bg-emerald-50 text-emerald-800',
  partially_matched: 'bg-blue-50 text-blue-800',
  not_matched: 'bg-amber-50 text-amber-900',
  unknown: 'bg-slate-100 text-slate-700',
  not_applicable: 'bg-slate-100 text-slate-500',
}

function EvidenceList({ title, items, tone }) {
  if (!items.length) return null
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className={`rounded-lg px-3 py-2 text-sm leading-snug ${tone}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default function MatchExplanationPanel({ view }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="match-summary-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <EligibilityBadge status={view.eligibility_status} label={view.eligibility_label} />
            <h3 id="match-summary-heading" className="mt-3 text-xl font-bold text-slate-900">{view.headline}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{view.summary}</p>
          </div>
          <MatchScoreBadge score={view.score} label={view.score_label} help={view.score_help} tone={view.kind === 'candidate' ? 'employer' : 'jobseeker'} />
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">{view.score_help}</p>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <EvidenceList title="Strengths" items={view.strengths} tone="bg-emerald-50 text-emerald-900" />
        <EvidenceList title="Gaps" items={view.gaps} tone="bg-amber-50 text-amber-900" />
      </div>

      <section aria-labelledby="match-breakdown-heading">
        <h3 id="match-breakdown-heading" className="text-lg font-bold text-slate-900">Match breakdown</h3>
        <p className="mt-1 text-sm text-slate-600">Open a section to review the structured evidence behind it.</p>
        <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
          {view.dimensions.map((dimension) => (
            <details key={dimension.key} className="group bg-white">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-300">
                <span className="font-semibold text-slate-900">{dimension.label}</span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${dimensionTone[dimension.status] || dimensionTone.unknown}`}>
                    {dimension.status_label}
                  </span>
                  <svg viewBox="0 0 16 16" className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
                </span>
              </summary>
              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                {dimension.groups.length > 0 && (
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {dimension.groups.map((group) => (
                      <div key={group.label}>
                        <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{group.label}</dt>
                        <dd className="mt-1.5">
                          <ul className="space-y-1 text-sm text-slate-800">
                            {group.items.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className={`${dimension.groups.length ? 'mt-4' : ''} text-sm leading-relaxed text-slate-600`}>{dimension.note}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3" aria-label="Additional profile similarity">
        <h3 className="text-sm font-bold text-blue-900">Additional profile similarity</h3>
        <p className="mt-1 text-sm leading-relaxed text-blue-800">{view.semantic_note}</p>
      </section>
    </div>
  )
}
