import { EligibilityBadge, MatchScoreBadge } from './MatchScore.jsx'

function EvidenceIcon({ gap = false }) {
  return (
    <svg viewBox="0 0 16 16" className={`mt-0.5 h-4 w-4 shrink-0 ${gap ? 'text-amber-700' : 'text-emerald-700'}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {gap ? <path d="M8 2v7m0 3v2" /> : <path d="m3 8 3 3 7-7" />}
    </svg>
  )
}

export default function CandidateMatchCard({ view, onOpen }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border-2 border-slate-900 bg-white p-5 pixel-shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-black leading-tight text-slate-900">{view.title}</h2>
          <p className="mt-1 text-sm font-semibold text-role-employer">{view.subtitle}</p>
        </div>
        <MatchScoreBadge score={view.score} label={view.score_label} help={view.score_help} tone="employer" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <EligibilityBadge status={view.eligibility_status} label={view.eligibility_label} />
        {view.candidate_source && <span className="rounded-md bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">{view.candidate_source}</span>}
        {view.application_status && <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{view.application_status}</span>}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Strengths</h3>
          {view.strengths.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {view.strengths.map((item) => <li key={item} className="flex gap-2 text-sm leading-snug text-slate-700"><EvidenceIcon /><span>{item}</span></li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-500">No confirmed strengths are available yet.</p>}
        </section>
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Gaps</h3>
          {view.gaps.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {view.gaps.map((item) => <li key={item} className="flex gap-2 text-sm leading-snug text-slate-700"><EvidenceIcon gap /><span>{item}</span></li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-500">No structured gaps are currently shown.</p>}
        </section>
      </div>

      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="mt-5 min-h-11 w-full rounded-lg border-2 border-slate-900 bg-role-employer px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300"
      >
        Why This Candidate?
      </button>
    </article>
  )
}
