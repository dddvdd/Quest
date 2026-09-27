export default function RecommendationSkeleton({ count = 3, employer = false }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading recommendations">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`h-72 animate-pulse rounded-2xl bg-slate-200/70 ${employer ? 'border-2 border-slate-300' : ''}`} />
      ))}
    </div>
  )
}
