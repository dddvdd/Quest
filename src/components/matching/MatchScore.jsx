const eligibilityStyles = {
  eligible: 'border-emerald-700 bg-emerald-50 text-emerald-800',
  conditionally_eligible: 'border-amber-700 bg-amber-50 text-amber-900',
  ineligible: 'border-red-700 bg-red-50 text-red-800',
}

export function EligibilityBadge({ status, label }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${eligibilityStyles[status] || 'border-slate-400 bg-slate-100 text-slate-700'}`}
    >
      {label}
    </span>
  )
}

export function MatchScoreBadge({ score, label, help, tone = 'jobseeker' }) {
  const accent = tone === 'employer' ? 'text-role-employer' : 'text-blue-700'
  return (
    <div className="shrink-0 text-right" aria-label={`${label}. ${help}`} title={help}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Match score</p>
      <p className={`font-mono text-2xl font-black tabular-nums ${accent}`}>
        {score == null ? '-' : score} <span className="text-sm text-slate-400">/ 100</span>
      </p>
    </div>
  )
}

