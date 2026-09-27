import { EligibilityBadge, MatchScoreBadge } from './MatchScore.jsx'
import { Link } from 'react-router-dom'

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m3 8 3 3 7-7" />
    </svg>
  )
}

export default function RecommendationCard({ view, onOpen, detailHref = null }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-slate-900">{view.title}</h2>
          <p className="mt-1 text-sm font-semibold text-blue-700">{view.subtitle}</p>
        </div>
        <MatchScoreBadge score={view.score} label={view.score_label} help={view.score_help} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <EligibilityBadge status={view.eligibility_status} label={view.eligibility_label} />
        {view.employment_type && <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{view.employment_type}</span>}
        {view.work_arrangement && <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{view.work_arrangement}</span>}
      </div>

      <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        {view.location && <div><dt className="sr-only">Location</dt><dd>{view.location}</dd></div>}
        {view.salary && <div><dt className="sr-only">Salary</dt><dd className="font-semibold text-slate-800">{view.salary}</dd></div>}
      </dl>

      {view.strengths.length > 0 && (
        <section className="mt-5" aria-label="Top strengths">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Top strengths</h3>
          <ul className="mt-2 space-y-1.5">
            {view.strengths.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-snug text-slate-700">
                <CheckIcon /> <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.gaps.length > 0 && (
        <p className="mt-4 text-xs text-amber-800">
          <span className="font-bold">Needs attention:</span> {view.gaps[0]}
        </p>
      )}

      <div className="mt-auto grid gap-2 pt-5">
        {detailHref && <Link to={detailHref} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">View job</Link>}
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          className={`min-h-11 w-full rounded-lg px-4 py-2.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${detailHref ? 'border-2 border-slate-900 bg-white text-slate-900 hover:bg-slate-50' : 'bg-blue-700 text-white hover:bg-blue-800'}`}
        >
          View Match Details
        </button>
      </div>
    </article>
  )
}
