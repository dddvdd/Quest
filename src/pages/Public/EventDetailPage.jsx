import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useParticipant, useJobseekerProfile } from '../../hooks/jobseeker/useJobseeker'
import { eventService } from '../../services/eventService'
import { eventVacancyService } from '../../services/eventVacancyService'
import { participantService } from '../../services/participantService'
import { eventTypeDisplay, eventTypeBadgeClass } from '../../domain/eventTypes'
import JobSeekerIntro from '../../components/public/JobSeekerIntro'
import ThemeToggle from '../../components/ThemeToggle'
import { saveQuestReturn } from '../../lib/questReturn'
import { PixelStar, PixelArrow, PixelBriefcase, PixelPin, PixelCal, PixelClock } from '../../components/public/pixel'
import { recruitmentService } from '../../services/recruitmentService.js'

export default function EventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { user, profile: accountProfile } = useAuth()
  const [event, setEvent] = useState(null)
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)

  // Applicant state
  const [myRegistrations, setMyRegistrations] = useState(null) // null = not loaded yet
  const [selectedOffers, setSelectedOffers] = useState([])
  const [applying, setApplying] = useState(false)
  const [formalApplications, setFormalApplications] = useState([])
  const [formalApplyingId, setFormalApplyingId] = useState(null)

  const { participant } = useParticipant(Boolean(user))
  const { profile } = useJobseekerProfile(participant?.id)
  const hasProfile = !!profile

  useEffect(() => {
    let alive = true
    Promise.all([
      eventService.getById(eventId),
      eventVacancyService.listActiveForEvent(eventId),
    ]).then(([ev, offs]) => {
      if (!alive) return
      if (!ev) {
        setNotAvailable(true)
      } else {
        setEvent(ev)
        setOffers((offs || []).filter(o => o.vacancy_definitions))
      }
      setLoading(false)
    }).catch(() => { if (alive) { setLoading(false) } })
    return () => { alive = false }
  }, [eventId])

  useEffect(() => {
    setMyRegistrations(null)
    setSelectedOffers([])
    if (!user) return
    if (!participant?.id) return
    let alive = true
    participantService.listEventParticipations(participant.id)
      .then((data) => { if (alive) setMyRegistrations(data || []) })
      .catch(() => { if (alive) setMyRegistrations([]) })
    return () => { alive = false }
  }, [user, participant?.id])

  const profileComplete = hasProfile
  const thisRegistration = useMemo(
    () => myRegistrations?.find(r => r.event_id === eventId) || null,
    [myRegistrations, eventId]
  )
  const hasValidCheckIn = thisRegistration?.check_in_status === 'checked_in'
    && Boolean(thisRegistration?.check_in_time)

  useEffect(() => {
    if (!thisRegistration || accountProfile?.role !== 'applicant') { setFormalApplications([]); return }
    let alive = true
    recruitmentService.listMyApplications()
      .then(rows => { if (alive) setFormalApplications(rows || []) })
      .catch(() => { if (alive) setFormalApplications([]) })
    return () => { alive = false }
  }, [thisRegistration, accountProfile?.role])

  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading quest…</div>

  if (notAvailable || !event) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <PixelStar className="mx-auto h-4 w-4 text-amber-400" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">Quest Not Available</h1>
          <p className="mt-2 text-sm text-slate-500">This opportunity is no longer active or does not exist.</p>
          <Link to="/" className="mt-6 inline-block rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            Back to Quest Board
          </Link>
        </section>
      </main>
    )
  }

  const employers = [...new Set(offers.map(o => o.vacancy_definitions.company_name).filter(Boolean))]

  function preserveQuest(action) {
    saveQuestReturn({ eventId, returnTo: `/events?`, action })
  }

  function handleAnonymousApply() {
    preserveQuest('register')
    setIntroOpen(true)
  }

  function handleCompleteProfile() {
    preserveQuest('complete_profile')
    navigate('/register')
  }

  function toggleOffer(id) {
    setSelectedOffers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleApply() {
    if (!user || !profileComplete || applying) return
    setApplying(true)
    try {
      await participantService.registerForEvent(eventId, selectedOffers)
      const refreshed = await participantService.listEventParticipations(participant?.id)
      setMyRegistrations(refreshed || [])
      setSelectedOffers([])
    } catch (err) {
      console.error('Registration failed:', err)
      toast.error('Registration failed. Please check your connection and try again.')
    } finally {
      setApplying(false)
    }
  }

  async function handleFormalApply(offer) {
    if (!thisRegistration || !hasValidCheckIn || formalApplyingId) return
    setFormalApplyingId(offer.id)
    try {
      const result = await recruitmentService.submitEventApplication(thisRegistration.id, offer.id)
      toast.success(result?.status === 'existing' ? 'Your formal application already exists.' : 'Formal application submitted.')
      setFormalApplications(await recruitmentService.listMyApplications())
    } catch (err) {
      console.error('Formal application failed:', err)
      toast.error('Formal application could not be submitted. Confirm your event check-in with PESO staff and try again.')
    } finally {
      setFormalApplyingId(null)
    }
  }

  function formatTime(t) {
    if (!t) return null
    const [h, m] = String(t).slice(0, 5).split(':').map(Number)
    if (isNaN(h)) return null
    const ampm = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
  }

  const timeLabel = event.time_from && event.time_to
    ? `${formatTime(event.time_from)} – ${formatTime(event.time_to)}`
    : null

  const showApplyFlow = Boolean(user) && profileComplete && !thisRegistration && offers.length > 0

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-blue-700">
            <PixelArrow className="h-3 w-3 rotate-180" /> Quest Board
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!user && (
              <Link to="/login" className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Event header */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <span className={`inline-block rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ring-1 ${eventTypeBadgeClass(event.event_type)}`}>
            ◈ {eventTypeDisplay(event)}
          </span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{event.event_name}</h1>

          <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <div className="flex items-center gap-2"><PixelCal className="h-3.5 w-3.5 text-blue-700" /><dd>{format(new Date(event.event_date), 'MMMM d, yyyy')}</dd></div>
            {timeLabel && <div className="flex items-center gap-2"><PixelClock className="h-3.5 w-3.5 text-blue-700" /><dd>{timeLabel}</dd></div>}
            <div className="flex items-center gap-2"><PixelPin className="h-3.5 w-3.5 text-blue-700" /><dd>{event.location}{event.venue ? ` · ${event.venue}` : ''}</dd></div>
            {employers.length > 0 && (
              <div className="flex items-center gap-2"><PixelBriefcase className="h-3.5 w-3.5 text-blue-700" /><dd>{employers.length} participating employer{employers.length === 1 ? '' : 's'}</dd></div>
            )}
          </dl>

          {event.description && (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">{event.description}</p>
          )}

          {/* State-aware CTA */}
          <div className="mt-6">
            {!user && (
              <>
                <button
                  onClick={handleAnonymousApply}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 sm:w-auto"
                >
                  Register for this Quest <PixelArrow className="h-2.5 w-2.5" />
                </button>
                <p className="mt-2 text-xs text-slate-400">Free registration · We'll ask a couple of quick questions first.</p>
              </>
            )}

            {user && myRegistrations === null && (
              <p className="text-xs text-slate-400">Checking your profile…</p>
            )}

            {user && myRegistrations !== null && !profileComplete && (
              <>
                <button
                  onClick={handleCompleteProfile}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 sm:w-auto"
                >
                  Complete Your Profile <PixelArrow className="h-2.5 w-2.5" />
                </button>
                <p className="mt-2 text-xs text-slate-400">One-time setup — your profile is reused for every quest.</p>
              </>
            )}

            {user && profileComplete && thisRegistration && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>
                  You're Registered
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/pass" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800">
                    View My Participant Pass
                  </Link>
                  <Link to={`/participation/${thisRegistration.id}`} className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                    My Registration
                  </Link>
                  <Link to="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Browse More Quests
                  </Link>
                </div>
                <p className="mt-2 text-[11px] text-emerald-600">Your reusable Participant Pass is your QR credential at every Quest.</p>
              </div>
            )}
          </div>
        </section>

        {/* Opportunity-aware apply */}
        {showApplyFlow && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700">◈ Apply</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Choose your opportunities</h2>
            <p className="mt-1 text-sm text-slate-600">
              Your Job Seeker Profile will be used — no need to fill anything out again. Optionally select the positions you're interested in.
            </p>

            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {offers.map(o => {
                const d = o.vacancy_definitions
                const checked = selectedOffers.includes(o.id)
                return (
                  <li key={o.id}>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                      checked ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-blue-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOffer(o.id)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{d.position}</span>
                        <span className="block truncate text-xs text-slate-500">{d.company_name}</span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>

            <button
              onClick={handleApply}
              disabled={applying}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 sm:w-auto"
            >
              {applying ? 'Registering…' : 'Register for this Quest'} {!applying && <PixelArrow className="h-2.5 w-2.5" />}
            </button>
            <p className="mt-2 text-xs text-slate-400">
              {selectedOffers.length > 0
                ? `${selectedOffers.length} position${selectedOffers.length === 1 ? '' : 's'} selected — you can also register without selecting.`
                : 'You can register without selecting positions.'}
            </p>
          </section>
        )}

        {/* Participating employers */}
        {employers.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-slate-900">Participating Employers</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {employers.sort().map(name => (
                <span key={name} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
                  {name}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Available positions */}
        <section className="mt-8 pb-12">
          <h2 className="text-lg font-bold text-slate-900">Available Positions</h2>
          {offers.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
              <PixelStar className="mx-auto h-4 w-4 text-amber-400" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Positions Not Posted Yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Employers are still finalizing their line-up for this event. You can still register now — or check the Quest Board for events with open positions.
              </p>
              <Link to="/" className="mt-4 inline-block rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                Back to Quest Board
              </Link>
            </div>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {offers.map(o => {
                const d = o.vacancy_definitions
                const formalApplication = formalApplications.find(application => application.event_vacancy_id === o.id && ['applied', 'shortlisted'].includes(application.application_status))
                return (
                  <li key={o.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                    <p className="font-semibold text-slate-900">{d.position}</p>
                    <p className="mt-0.5 text-xs font-medium text-blue-700">{d.company_name}</p>
                    <dl className="mt-3 space-y-1 text-xs text-slate-500">
                      {d.place_of_assignment && (
                        <div className="flex items-center gap-1.5"><PixelPin className="h-2.5 w-2.5 text-slate-400" /><span>{d.place_of_assignment}</span></div>
                      )}
                      {d.salary_range && (
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700"><span aria-hidden className="text-emerald-600">₱</span><span>{d.salary_range}</span></div>
                      )}
                      {o.slots_offered > 0 && <p><strong className="text-slate-700">{o.slots_offered}</strong> opening{o.slots_offered === 1 ? '' : 's'}</p>}
                    </dl>
                    {d.qualifications && (
                      <details className="mt-3 border-t border-slate-100 pt-3">
                        <summary className="cursor-pointer min-h-[44px] flex items-center text-xs font-semibold text-slate-600 hover:text-blue-700">View requirements</summary>
                        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">{d.qualifications}</p>
                      </details>
                    )}
                    {thisRegistration && accountProfile?.role === 'applicant' && (
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        {formalApplication ? (
                          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Formal application: {formalApplication.application_status}</p>
                        ) : hasValidCheckIn ? (
                          <button type="button" onClick={() => handleFormalApply(o)} disabled={Boolean(formalApplyingId)} className="min-h-11 w-full rounded-lg border-2 border-slate-900 bg-amber-400 px-4 text-xs font-black text-slate-900 shadow-[2px_3px_7px_rgb(15_23_42/0.2)] disabled:opacity-50">
                            {formalApplyingId === o.id ? 'Applying...' : 'Apply formally'}
                          </button>
                        ) : (
                          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Formal application becomes available after event check-in.</p>
                        )}
                        <p className="mt-2 text-[11px] leading-4 text-slate-500">Your event interest is separate. This action sends a formal application to the employer.</p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      {/* Sticky mobile action bar */}
      {showApplyFlow && (
        <>
          <div aria-hidden className="h-20 sm:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-slate-900 bg-white/95 shadow-[0_-4px_0_0_rgb(251_191_36/0.9)] backdrop-blur sm:hidden">
            <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
              <p aria-live="polite" className="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-600">
                <PixelStar className="mr-1 inline h-2.5 w-2.5 text-amber-500" />
                {selectedOffers.length > 0
                  ? `${selectedOffers.length} position${selectedOffers.length === 1 ? '' : 's'} selected`
                  : 'Selecting positions is optional'}
              </p>
              <button
                onClick={handleApply}
                disabled={applying}
                className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-slate-900 bg-amber-400 px-5 text-sm font-black uppercase tracking-wide text-slate-900 pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
              >
                {applying ? 'Registering…' : 'Register'}
              </button>
            </div>
          </div>
        </>
      )}

      <JobSeekerIntro open={introOpen} onClose={() => setIntroOpen(false)} />
    </div>
  )
}
