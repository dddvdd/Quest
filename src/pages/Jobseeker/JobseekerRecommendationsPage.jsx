import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from '../../components/ThemeToggle.jsx'
import MatchDetailsDialog from '../../components/matching/MatchDetailsDialog.jsx'
import RecommendationCard from '../../components/matching/RecommendationCard.jsx'
import RecommendationSkeleton from '../../components/matching/RecommendationSkeleton.jsx'
import { PixelArrow, PixelBriefcase, PixelStar } from '../../components/public/pixel.jsx'
import { useParticipant } from '../../hooks/jobseeker/useJobseeker.js'
import { getJobseekerRecommendations } from '../../services/matchExplanationService.js'

export default function JobseekerRecommendationsPage() {
  const { participant, loading: participantLoading, error: participantError } = useParticipant()
  const [recommendations, setRecommendations] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadRecommendations = useCallback(async () => {
    if (!participant?.id) return
    setLoading(true)
    setError(null)
    try {
      setRecommendations(await getJobseekerRecommendations(participant.id))
    } catch {
      setError('We could not load your recommendations. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [participant?.id])

  useEffect(() => {
    loadRecommendations()
  }, [loadRecommendations])

  const closeDetails = useCallback(() => setSelected(null), [])
  const isLoading = participantLoading || loading
  const safeError = participantError
    ? 'We could not load your jobseeker profile. Please try again.'
    : error

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex min-h-11 items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">
            <PixelArrow className="h-3 w-3 rotate-180" /> Quest Board
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/profile" className="flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">My Profile</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-6 border-b-2 border-slate-900 pb-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700"><PixelStar className="h-3 w-3 text-amber-500" /> Profile-based matches</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Recommended Jobs</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Jobs that align with the structured employment information in your profile. Required qualifications still determine eligibility.</p>
          </div>
          <aside className="rounded-xl border-2 border-slate-900 bg-blue-50 p-4 text-sm leading-5 text-blue-950 pixel-shadow-sm" aria-label="About match scores">
            <span className="font-bold text-slate-900">Match score</span> compares your profile with each job. It helps explain fit and is not a hiring decision.
          </aside>
        </div>

        <section className="mt-7" aria-live="polite" aria-busy={isLoading}>
          {isLoading && <RecommendationSkeleton />}

          {!isLoading && safeError && (
            <div role="alert" className="rounded-2xl border-2 border-red-900 bg-red-50 p-8 text-center pixel-shadow-sm">
              <h2 className="text-lg font-bold text-red-950">Recommendations are unavailable</h2>
              <p className="mt-2 text-sm text-red-900">{safeError}</p>
              {participant?.id && <button type="button" onClick={loadRecommendations} className="mt-5 min-h-11 rounded-lg border-2 border-slate-900 bg-white px-5 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300">Try again</button>}
            </div>
          )}

          {!isLoading && !safeError && recommendations.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <PixelBriefcase className="mx-auto h-7 w-7 text-blue-700" />
              <h2 className="mt-4 text-xl font-bold">No eligible recommendations yet</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Complete your job preferences and qualifications, then check again as new vacancies are published.</p>
              <Link to="/jobseeker/preferences" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">Review job preferences</Link>
            </div>
          )}

          {!isLoading && !safeError && recommendations.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {recommendations.map((recommendation) => (
                <RecommendationCard key={recommendation.id} view={recommendation.view} detailHref={`/jobs/${recommendation.id}`} onOpen={() => setSelected(recommendation)} />
              ))}
            </div>
          )}
        </section>
      </main>

      <MatchDetailsDialog view={selected?.view || null} onClose={closeDetails} />
    </div>
  )
}
