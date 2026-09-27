import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import RecruitmentHeader from '../../components/recruitment/RecruitmentHeader.jsx'
import MatchDetailsDialog from '../../components/matching/MatchDetailsDialog.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useParticipant } from '../../hooks/jobseeker/useJobseeker.js'
import { explainJobseekerVacancyPair } from '../../services/matchExplanationService.js'
import { recruitmentService } from '../../services/recruitmentService.js'
import { buildMatchPresentation, MATCH_PRESENTATION_KIND } from '../../domain/matchPresentation.js'

const money = (value, currency = 'PHP') => Number.isFinite(Number(value))
  ? new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value))
  : null

export default function JobDetailPage() {
  const { vacancyId } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { participant } = useParticipant(Boolean(user))
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [matchLoading, setMatchLoading] = useState(false)
  const [matchView, setMatchView] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setJob(await recruitmentService.getJob(vacancyId)) }
    catch { setError('This published job could not be loaded. It may have closed.') }
    finally { setLoading(false) }
  }, [vacancyId])
  useEffect(() => { load() }, [load])

  async function apply() {
    if (!user) { navigate('/login'); return }
    if (profile?.role !== 'applicant') { toast.error('Only jobseeker accounts can apply.'); return }
    setSubmitting(true)
    try {
      const result = await recruitmentService.submitApplication(vacancyId)
      toast.success(result?.status === 'existing' ? 'Your active application already exists.' : 'Application submitted.')
      navigate('/jobseeker/applications')
    } catch (err) { toast.error(err.message) }
    finally { setSubmitting(false) }
  }

  async function showMatch() {
    if (!user) { navigate('/login'); return }
    if (!participant?.id) { toast.error('Complete your jobseeker profile to view match details.'); return }
    setMatchLoading(true)
    try {
      const result = await explainJobseekerVacancyPair(participant.id, vacancyId)
      setMatchView(buildMatchPresentation({ kind: MATCH_PRESENTATION_KIND.JOB, vacancy: job, explanation: result.explanation, formatted: result.formatted }))
    } catch (err) { toast.error(err.message || 'Match details are unavailable.') }
    finally { setMatchLoading(false) }
  }

  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600">Loading job details...</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <RecruitmentHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {error || !job ? (
          <div role="alert" className="rounded-2xl border-2 border-slate-900 bg-white p-8 text-center shadow-[2px_4px_12px_rgb(15_23_42/0.12)]"><h1 className="text-2xl font-bold">Job unavailable</h1><p className="mt-2 text-sm text-slate-600">{error}</p><Link to="/jobs" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-5 font-bold text-white">Browse open jobs</Link></div>
        ) : (
          <>
            <Link to="/jobs" className="inline-flex min-h-11 items-center text-sm font-bold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">Back to jobs</Link>
            <article className="mt-3 overflow-hidden rounded-2xl border-2 border-slate-900 bg-white shadow-[2px_5px_14px_rgb(15_23_42/0.14)]">
              <header className="border-b-2 border-slate-900 bg-blue-50 p-6 sm:p-8">
                <p className="font-semibold text-blue-700">{job.company_name}</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{job.position}</h1>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
                  {job.employment_type && <span className="rounded-md border border-slate-300 bg-white px-2.5 py-1">{job.employment_type}</span>}
                  {job.work_arrangement && <span className="rounded-md border border-slate-300 bg-white px-2.5 py-1">{job.work_arrangement}</span>}
                  {(job.place_of_assignment || job.municipality_city || job.province) && <span className="rounded-md border border-slate-300 bg-white px-2.5 py-1">{job.place_of_assignment || [job.municipality_city, job.province].filter(Boolean).join(', ')}</span>}
                </div>
              </header>
              <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0 space-y-8">
                  <section><h2 className="text-xl font-bold">About the role</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{job.job_description}</p></section>
                  {(job.requirements_summary || job.qualifications) && <section><h2 className="text-xl font-bold">Requirements</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{job.requirements_summary || job.qualifications}</p></section>}
                </div>
                <aside className="h-fit rounded-xl border-2 border-slate-900 bg-slate-50 p-5">
                  <dl className="space-y-4 text-sm">
                    {(job.salary_min != null || job.salary_max != null) && <div><dt className="font-semibold text-slate-500">Compensation</dt><dd className="mt-1 font-bold">{job.salary_min != null && job.salary_max != null ? `${money(job.salary_min, job.salary_currency)} - ${money(job.salary_max, job.salary_currency)}` : money(job.salary_min ?? job.salary_max, job.salary_currency)}{job.salary_period ? ` / ${job.salary_period}` : ''}</dd></div>}
                    {job.application_deadline && <div><dt className="font-semibold text-slate-500">Apply by</dt><dd className="mt-1 font-bold">{new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(new Date(job.application_deadline))}</dd></div>}
                    {job.available_slots && <div><dt className="font-semibold text-slate-500">Openings</dt><dd className="mt-1 font-bold">{job.available_slots}</dd></div>}
                  </dl>
                  <div className="mt-6 grid gap-2">
                    <button type="button" onClick={showMatch} disabled={matchLoading || (user && profile?.role !== 'applicant')} className="min-h-12 rounded-lg border-2 border-slate-900 bg-white px-4 text-sm font-bold hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">{matchLoading ? 'Checking match...' : 'Match details'}</button>
                    <button type="button" onClick={apply} disabled={submitting || (user && profile?.role !== 'applicant')} className="min-h-12 rounded-lg border-2 border-slate-900 bg-amber-400 px-4 text-sm font-black text-slate-900 shadow-[2px_3px_7px_rgb(15_23_42/0.2)] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">{submitting ? 'Submitting...' : user ? 'Apply now' : 'Sign in to apply'}</button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">Match details explain fit. Applying is a separate action and sends a formal application.</p>
                </aside>
              </div>
            </article>
          </>
        )}
      </main>
      <MatchDetailsDialog view={matchView} onClose={() => setMatchView(null)} />
    </div>
  )
}
