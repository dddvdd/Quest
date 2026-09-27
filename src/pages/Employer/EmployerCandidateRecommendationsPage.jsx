import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CandidateMatchCard from '../../components/matching/CandidateMatchCard.jsx'
import MatchDetailsDialog from '../../components/matching/MatchDetailsDialog.jsx'
import RecommendationSkeleton from '../../components/matching/RecommendationSkeleton.jsx'
import { getEmployerCandidateRecommendations } from '../../services/matchExplanationService.js'

export default function EmployerCandidateRecommendationsPage() {
  const { vacancyId } = useParams()
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadRecommendations = useCallback(async () => {
    if (!vacancyId) return
    setLoading(true)
    setError(null)
    try {
      setResult(await getEmployerCandidateRecommendations(vacancyId))
    } catch {
      setError('We could not load candidates for this vacancy. Check your access and try again.')
    } finally {
      setLoading(false)
    }
  }, [vacancyId])

  useEffect(() => {
    loadRecommendations()
  }, [loadRecommendations])

  const closeDetails = useCallback(() => setSelected(null), [])
  const recommendations = result?.recommendations || []

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <Link to="/employer/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-violet-800 hover:text-violet-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300">Back to My Vacancies</Link>

      <div className="mt-4 grid gap-6 border-b-2 border-slate-900 pb-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-violet-700">Authorized candidate pool</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Recommended Candidates</h1>
          <p className="mt-2 text-base font-bold text-slate-700">{result?.vacancy?.position || (loading ? 'Loading vacancy...' : 'Vacancy')}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Eligible applicants and event participants ranked against this vacancy using existing structured matching evidence.</p>
        </div>
        <aside className="rounded-xl border-2 border-slate-900 bg-violet-50 p-4 text-sm leading-5 text-violet-950 pixel-shadow-sm" aria-label="About candidate match scores">
          <span className="font-bold text-slate-900">Match score</span> compares recorded qualifications and preferences with this vacancy. It supports review and is not a hiring decision.
        </aside>
      </div>

      <section className="mt-7" aria-live="polite" aria-busy={loading}>
        {loading && <RecommendationSkeleton employer />}

        {!loading && error && (
          <div role="alert" className="rounded-2xl border-2 border-red-900 bg-red-50 p-8 text-center pixel-shadow-sm">
            <h2 className="text-lg font-bold text-red-950">Candidates are unavailable</h2>
            <p className="mt-2 text-sm text-red-900">{error}</p>
            <button type="button" onClick={loadRecommendations} className="mt-5 min-h-11 rounded-lg border-2 border-slate-900 bg-white px-5 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300">Try again</button>
          </div>
        )}

        {!loading && !error && recommendations.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <h2 className="text-xl font-bold text-slate-900">No eligible candidates yet</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Candidates appear here after they apply or express interest at an event and meet the vacancy eligibility gate.</p>
          </div>
        )}

        {!loading && !error && recommendations.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {recommendations.map((recommendation) => (
              <CandidateMatchCard key={recommendation.id} view={recommendation.view} onOpen={() => setSelected(recommendation)} />
            ))}
          </div>
        )}
      </section>

      <MatchDetailsDialog view={selected?.view || null} onClose={closeDetails} />
    </main>
  )
}
