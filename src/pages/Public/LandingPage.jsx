import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { eventService } from '../../services/eventService'
import { eventVacancyService } from '../../services/eventVacancyService'
import { eventTypeDisplay, questTag } from '../../domain/eventTypes'
import { PixelStar, PixelArrow, PixelBriefcase, PixelPin, PixelCal, PixelDivider } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'

// ---------------------------------------------------------------------------
// Role gateway data — semantic role colors come from the `role-*` tokens.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pixel-art employment scene — pure SVG rects, crisp edges, no assets.
// A small Cagayan skyline with a jobseeker walking toward opportunity.
// ---------------------------------------------------------------------------
function PixelScene() {
  return (
    <svg viewBox="0 0 96 44" className="crisp w-full max-w-md" role="img" aria-label="Pixel art scene of a jobseeker walking toward buildings">
      {/* sky grid accents */}
      <rect x="6" y="4" width="2" height="2" fill="#fbbf24" className="motion-float" />
      <rect x="14" y="9" width="1" height="1" fill="#94a3b8" />
      <rect x="88" y="3" width="1" height="1" fill="#94a3b8" />
      {/* sun */}
      <rect x="82" y="5" width="4" height="4" fill="#fbbf24" />
      <rect x="81" y="6" width="6" height="2" fill="#fbbf24" opacity="0.5" />
      {/* buildings */}
      <g>
        <rect x="30" y="10" width="16" height="26" fill="#312e81" />
        {[0, 1, 2].map(r => [0, 1, 2].map(c => (
          <rect key={`a${r}${c}`} x={33 + c * 4} y={13 + r * 5} width="2" height="3" fill="#c7d2fe" />
        )))}
        <rect x="48" y="16" width="12" height="20" fill="#5b21b6" />
        {[0, 1].map(r => [0, 1].map(c => (
          <rect key={`b${r}${c}`} x={50 + c * 4} y={19 + r * 5} width="2" height="3" fill="#ddd6fe" />
        )))}
        <rect x="62" y="22" width="10" height="14" fill="#1e40af" />
        <rect x="64" y="25" width="2" height="2" fill="#bfdbfe" />
        <rect x="68" y="25" width="2" height="2" fill="#bfdbfe" />
        <rect x="64" y="30" width="2" height="2" fill="#bfdbfe" />
      </g>
      {/* ground */}
      <rect x="0" y="36" width="96" height="8" fill="#166534" />
      <rect x="0" y="36" width="96" height="1" fill="#22c55e" />
      {[...Array(12)].map((_, i) => <rect key={`g${i}`} x={i * 8 + 3} y="40" width="2" height="1" fill="#14532d" />)}
      {/* jobseeker */}
      <g>
        <rect x="12" y="24" width="4" height="4" fill="#fcd34d" />
        <rect x="13" y="28" width="2" height="6" fill="#2563eb" />
        <rect x="11" y="29" width="2" height="4" fill="#1d4ed8" />
        <rect x="15" y="29" width="2" height="4" fill="#1d4ed8" />
        <rect x="11" y="34" width="2" height="2" fill="#1e293b" />
        <rect x="15" y="34" width="2" height="2" fill="#1e293b" />
        {/* briefcase in hand */}
        <rect x="17" y="31" width="3" height="2" fill="#7c3aed" />
      </g>
      {/* path dots toward buildings */}
      <rect x="24" y="38" width="2" height="2" fill="#facc15" opacity="0.85" />
      <rect x="30" y="42" width="2" height="2" fill="#facc15" opacity="0.55" />
    </svg>
  )
}

// Sign In: click opens a centered role-choice dialog (never hover).
// Jobseeker → existing Google auth; Partner → existing /login route.
function SignInMenu() {
  const navigate = useNavigate()
  const { signInWithGoogle } = useAuth()
  const [open, setOpen] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const triggerRef = useRef(null)
  const dialogRef = useRef(null)

  // Lock background scrolling only while the dialog is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Focus management: move focus into the dialog on open, restore it to the
  // trigger on close, and keep Tab cycling inside the dialog while open.
  useEffect(() => {
    if (!open) return
    const first = dialogRef.current?.querySelector('button[data-autofocus]')
    first?.focus()
    const trigger = triggerRef.current
    function onKeyDown(e) {
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll('button')
      if (!focusables.length) return
      const firstEl = focusables[0]
      const lastEl = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [open])

  async function handleJobseeker() {
    if (authBusy) return
    setAuthBusy(true)
    try {
      const { error } = await signInWithGoogle()
      // Rejections above jump straight to catch; resolved errors land here.
      if (error) {
        console.error('Jobseeker sign-in failed:', error.message)
        toast.error(error.message || 'Could not start Google sign-in. Please try again.')
      }
    } catch (err) {
      // Never leave the button stuck disabled — surface and recover.
      console.error('Jobseeker sign-in threw:', err)
      toast.error('Could not start Google sign-in. Please try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        Sign In
      </button>

      {/* Portal to <body>: the header's backdrop-blur makes it the containing
          block for position:fixed, which would clip the overlay to 64px. */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-title"
            className="my-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white pixel-shadow max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
              {/* Sticky header keeps title + close reachable while content scrolls */}
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-white pixel-shadow-sm">
                    <PixelBriefcase className="h-4 w-4" />
                  </span>
                  <h2 id="signin-title" className="text-lg font-bold tracking-tight text-slate-900">Sign in to PPESO</h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close sign-in dialog"
                  className="-mr-1 flex h-11 w-11 items-center justify-center text-xl leading-none text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              </div>

              <div className="px-6 py-5">
                <p className="text-sm text-slate-600">Choose how you want to access the employment platform.</p>

                <div className="mt-4 space-y-3">
                  <button
                    data-autofocus
                    onClick={handleJobseeker}
                    disabled={authBusy}
                    className="group flex w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-100/60 disabled:opacity-60 min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white">
                      <PixelBriefcase className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900">Jobseeker</span>
                      <span className="block text-xs leading-snug text-slate-600">Find jobs, manage your profile, and apply for opportunities.</span>
                    </span>
                    <PixelArrow className="h-2.5 w-2.5 flex-shrink-0 text-blue-700 transition-transform group-hover:translate-x-0.5" />
                  </button>

                  <button
                    onClick={() => navigate('/login')}
                    className="group flex w-full items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-left transition-colors hover:border-violet-400 hover:bg-violet-100/60 min-h-[44px] focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-violet-700 text-white">
                      <PixelBriefcase className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900">Partner</span>
                      <span className="block text-xs leading-snug text-slate-600">Employers and PPESO personnel.</span>
                    </span>
                    <PixelArrow className="h-2.5 w-2.5 flex-shrink-0 text-violet-700 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>

                <button
                  onClick={() => setOpen(false)}
                  className="mt-5 min-h-11 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:outline-none"
                >
                  Cancel
                </button>

                {authBusy && (
                  <p className="mt-3 text-center text-xs text-slate-500" role="status">Redirecting to Google…</p>
                )}
              </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [offers, setOffers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedOffer, setSelectedOffer] = useState(null)
  const offerDialogRef = useRef(null)

  useEffect(() => {
    if (!selectedOffer) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    offerDialogRef.current?.querySelector('button[data-autofocus]')?.focus()
    function onKeyDown(e) {
      if (e.key === 'Escape') setSelectedOffer(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedOffer])

useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [events, offers] = await Promise.all([
          eventService.listActive(),
          eventVacancyService.listAllActive(),
        ])
        if (!alive) return
        setEvents(events || [])
        setOffers(offers || [])
      } catch {
        if (!alive) return
        // Until the quest-board RLS migration is applied, anonymous reads are blocked.
        setLoadError('Live opportunities are unavailable right now. Please check back soon.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const offersByEvent = useMemo(() => {
    const map = {}
    for (const o of offers) {
      if (!map[o.event_id]) map[o.event_id] = { positions: [], employers: new Set(), slots: 0 }
      const def = o.vacancy_definitions
      if (!def) continue
      map[o.event_id].positions.push(o)
      if (def.company_name) map[o.event_id].employers.add(def.company_name)
      map[o.event_id].slots += o.slots_offered || 0
    }
    return map
  }, [offers])

  const q = query.trim().toLowerCase()

  const visibleEvents = useMemo(() => {
    if (!q) return events
    return events.filter(ev =>
      ev.event_name?.toLowerCase().includes(q) ||
      ev.location?.toLowerCase().includes(q) ||
      (offersByEvent[ev.id]?.positions || []).some(p =>
        p.vacancy_definitions.position?.toLowerCase().includes(q) ||
        p.vacancy_definitions.company_name?.toLowerCase().includes(q)
      )
    )
  }, [events, q, offersByEvent])

  const visibleOffers = useMemo(() => {
    let list = offers.filter(o => o.vacancy_definitions)
    const eventById = Object.fromEntries(events.map(e => [e.id, e]))
    list = list.map(o => ({ ...o, event: eventById[o.event_id] }))
    if (!q) return list
    return list.filter(o =>
      o.vacancy_definitions.position?.toLowerCase().includes(q) ||
      o.vacancy_definitions.company_name?.toLowerCase().includes(q) ||
      o.vacancy_definitions.place_of_assignment?.toLowerCase().includes(q) ||
      o.event?.event_name?.toLowerCase().includes(q)
    )
  }, [offers, events, q])

  const totalPositions = offers.length

  return (
    <div className="theme-site min-h-screen bg-slate-50 text-slate-800">
      {/* Header — PPESO organization + platform briefcase coexist */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/ppeso_logo.svg" alt="Provincial Public Employment Service Office logo" className="h-10 w-auto" />
            <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
            <span className="hidden items-center gap-2 sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-white pixel-shadow-sm">
                <PixelBriefcase className="h-4 w-4" />
              </span>
              <span className="text-base font-bold tracking-tight text-slate-900">Trabaho Caravan</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-4 text-sm font-medium text-slate-600 md:flex" aria-label="Primary">
            <a href="#quests" className="flex h-11 items-center hover:text-blue-700">Quest Board</a>
            <a href="#jobs" className="flex h-11 items-center hover:text-blue-700">Jobs</a>
            <a href="#events" className="flex h-11 items-center hover:text-blue-700">Events</a>
            <Link to="/calendar" className="flex h-11 items-center hover:text-blue-700">Calendar</Link>
            {user && <Link to="/jobseeker/recommendations" className="flex h-11 items-center font-semibold text-blue-700 hover:text-blue-900">Recommended Jobs</Link>}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <>
                <Link to="/profile" className="flex h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  My Profile
                </Link>
                <Link to="/pass" className="flex h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
                  My Pass
                </Link>
              </>
            ) : (
              <SignInMenu />
            )}
          </div>
        </div>
        <nav className="flex justify-around border-t border-slate-100 px-4 py-1 text-xs font-medium text-slate-600 md:hidden" aria-label="Primary mobile">
          <a href="#quests" className="flex h-11 min-w-16 items-center justify-center hover:text-blue-700">Quests</a>
          <a href="#jobs" className="flex h-11 min-w-16 items-center justify-center hover:text-blue-700">Jobs</a>
          <Link to="/calendar" className="flex h-11 min-w-16 items-center justify-center hover:text-blue-700">Calendar</Link>
          {user && <Link to="/jobseeker/recommendations" className="flex h-11 min-w-16 items-center justify-center font-semibold text-blue-700 hover:text-blue-900">Matches</Link>}
        </nav>
      </header>

      {/* Hero — editorial composition with pixel-art employment scene */}
      <section className="border-b border-slate-200 bg-white">
        <div className="pixel-grid-bg">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2">
            <div>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Connecting Cagayan's <span className="text-blue-700">jobseekers</span> and{' '}
                <span className="text-violet-700">employers.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base text-slate-600">
                The Provincial Public Employment Service Office brings job fairs, local recruitment,
                and opportunities together in one place — free and public for everyone in Cagayan.
              </p>

              <div className="mt-7 max-w-xl">
                <label className="relative block">
                  <span className="sr-only">Search jobs, companies, or positions</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search jobs, companies, or positions..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 pr-11 text-sm shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                  <PixelArrow className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-slate-400" />
                </label>
                {!loading && !loadError && (
                  <p className="mt-2 text-xs text-slate-600">
                    {totalPositions} open position{totalPositions === 1 ? '' : 's'} across {events.length} active opportunit{events.length === 1 ? 'y' : 'ies'} — no sign-in needed to browse.
                  </p>
                )}
              </div>
            </div>

            {/* Scene follows the headline + search on mobile so jobseekers reach
                the search without scrolling past decoration. */}
            <div className="order-last mx-auto w-full max-w-md lg:max-w-none">
              <PixelScene />
            </div>
          </div>
        </div>
        <PixelDivider className="justify-center pb-4" />
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {loading && (
          <div className="py-16 text-center" role="status">
            <div className="flex items-center justify-center gap-1.5" aria-hidden>
              {[0, 1, 2].map(i => (
                <span key={i} className="pixel-blink inline-block h-2.5 w-2.5 bg-amber-400" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">Loading opportunities…</p>
          </div>
        )}

        {loadError && !loading && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <p className="text-lg font-semibold text-slate-800">We're setting things up</p>
            <p className="mt-2 text-sm text-slate-500">{loadError}</p>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {/* Quest Board */}
            <section id="quests" className="mt-14 scroll-mt-28">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">Quest Board</h2>
                  <p className="mt-1 text-sm text-slate-600">Hiring events and recruitment activities you can join.</p>
                </div>
              </div>
              <PixelDivider className="mt-3" />

              {visibleEvents.length === 0 ? (
                <div className="mt-6 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
                  <PixelStar className="mx-auto h-4 w-4 text-amber-400" />
                  <p className="mt-3 text-lg font-semibold text-slate-900">
                    {q ? 'No quests match your search.' : 'No Active Quests Right Now'}
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                    {q
                      ? 'Try a different job title, company, or place.'
                      : 'New opportunities are added regularly. Explore available jobs below or check back for the next recruitment activity.'}
                  </p>
                </div>
              ) : (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleEvents.map(ev => {
                    const stats = offersByEvent[ev.id] || { positions: [], employers: new Set(), slots: 0 }
                    return (
                      <article key={ev.id} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700">
                          {questTag(ev)}
                        </p>
                        <h3 className="mt-2 text-lg font-bold leading-snug text-slate-900">{ev.event_name}</h3>
                        <p className="mt-1 text-xs font-medium text-slate-500">{eventTypeDisplay(ev)}</p>

                        <dl className="mt-4 space-y-1.5 text-xs text-slate-600">
                          {stats.employers.size > 0 && (
                            <div className="flex items-center gap-1.5"><PixelBriefcase className="h-3 w-3 text-slate-400" /><span><strong className="text-slate-900">{stats.employers.size}</strong> Employer{stats.employers.size === 1 ? '' : 's'}</span></div>
                          )}
                          {stats.positions.length > 0 && (
                            <div className="flex items-center gap-1.5"><PixelStar className="h-2.5 w-2.5 text-amber-400" /><span><strong className="text-slate-900">{stats.positions.length}</strong> Position{stats.positions.length === 1 ? '' : 's'}</span></div>
                          )}
                          <div className="flex items-center gap-1.5"><PixelPin className="h-3 w-3 text-slate-400" /><span>{ev.location}{ev.venue ? ` · ${ev.venue}` : ''}</span></div>
                          <div className="flex items-center gap-1.5"><PixelCal className="h-3 w-3 text-slate-400" /><span>{format(new Date(ev.event_date), 'MMMM d, yyyy')}</span></div>
                        </dl>

                        <div className="mt-auto pt-5">
                          <button
                            onClick={() => navigate(`/events/${ev.id}`)}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                          >
                            Explore Quest <PixelArrow className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Open Opportunities */}
            <section id="jobs" className="mt-14 scroll-mt-28">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Open Opportunities</h2>
              <p className="mt-1 text-sm text-slate-600">Positions posted by participating employers and agencies.</p>
              <PixelDivider className="mt-3" />

              {visibleOffers.length === 0 ? (
                <div className="mt-6 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
                  <PixelStar className="mx-auto h-4 w-4 text-amber-400" />
                  <p className="mt-3 text-lg font-semibold text-slate-900">
                    {q ? 'No jobs match your search.' : 'No Open Positions Right Now'}
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                    {q
                      ? 'Try a different job title, company, or place — or browse the Quest Board above.'
                      : 'Employers post positions as events approach. Check back soon or explore the Quest Board above.'}
                  </p>
                </div>
              ) : (
                <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleOffers.slice(0, 60).map(o => {
                    const d = o.vacancy_definitions
                    return (
                      <li key={o.id}>
                        <button
                          onClick={() => setSelectedOffer(o)}
                          aria-haspopup="dialog"
                          className="h-full w-full rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md"
                        >
                          <p className="font-semibold leading-snug text-slate-900">{d.position}</p>
                          <p className="mt-0.5 text-xs font-medium text-blue-700">{d.company_name}</p>
                          <dl className="mt-3 space-y-1 text-xs text-slate-500">
                            {d.place_of_assignment && (
                              <div className="flex items-center gap-1.5"><PixelPin className="h-2.5 w-2.5 text-slate-400" /><span>{d.place_of_assignment}</span></div>
                             )}
                            {d.salary_range && (
                              <div className="flex items-center gap-1.5 font-semibold text-slate-700"><span aria-hidden className="text-emerald-600">₱</span><span>{d.salary_range}</span></div>
                            )}
                            {o.slots_offered > 0 && <p><strong className="text-slate-700">{o.slots_offered}</strong> opening{o.slots_offered === 1 ? '' : 's'}</p>}
                            {o.event && (
                              <p className="pt-1 text-[11px] text-slate-500">
                                {o.event.event_name} · {eventTypeDisplay(o.event)}
                              </p>
                            )}
                          </dl>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Events anchor target (quest board IS the events list; keep for nav) */}
            <section id="events" className="mt-14 scroll-mt-28">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Events</h2>
              <p className="mt-1 text-sm text-slate-600">
                Job fairs, local recruitment activities, special overseas recruitment, and online matching — see the Quest Board above.
              </p>
              <PixelDivider className="mt-3" />
              <div className="mt-5 flex flex-wrap gap-2">
                {[...new Set(events.map(ev => eventTypeDisplay(ev)))].map(label => (
                  <span key={label} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">{label}</span>
                ))}
                {events.length === 0 && <span className="text-xs text-slate-500">No scheduled events at the moment.</span>}
              </div>
            </section>
          </>
        )}
      </main>

      {selectedOffer && createPortal(
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4"
          onClick={() => setSelectedOffer(null)}
        >
          <div
            ref={offerDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-details-title"
            className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white pixel-shadow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Job opportunity</p>
                <h2 id="job-details-title" className="mt-1 text-xl font-bold leading-tight text-slate-900">
                  {selectedOffer.vacancy_definitions.position}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-600">{selectedOffer.vacancy_definitions.company_name}</p>
              </div>
              <button
                data-autofocus
                onClick={() => setSelectedOffer(null)}
                aria-label="Close job details"
                className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <dl className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                {selectedOffer.vacancy_definitions.place_of_assignment && (
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Place of assignment</dt><dd className="mt-1">{selectedOffer.vacancy_definitions.place_of_assignment}</dd></div>
                )}
                {selectedOffer.vacancy_definitions.salary_range && (
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Salary</dt><dd className="mt-1 font-semibold text-emerald-700">{selectedOffer.vacancy_definitions.salary_range}</dd></div>
                )}
                {selectedOffer.slots_offered > 0 && (
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Openings</dt><dd className="mt-1">{selectedOffer.slots_offered}</dd></div>
                )}
                {selectedOffer.event && (
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Event</dt><dd className="mt-1">{selectedOffer.event.event_name}</dd></div>
                )}
              </dl>

              <section>
                <h3 className="text-sm font-bold text-slate-900">Qualifications</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {selectedOffer.vacancy_definitions.qualifications || 'Qualifications are not specified for this opportunity.'}
                </p>
              </section>

              {selectedOffer.event && (
                <button
                  onClick={() => navigate(`/events/${selectedOffer.event.id}`)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
                >
                  View event details <PixelArrow className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <div className="flex items-center gap-2.5">
            <img src="/ppeso_logo.svg" alt="" className="h-8 w-auto" aria-hidden="true" />
            <p className="text-xs text-slate-500">
              Trabaho Caravan · Public employment service by the Provincial PESO (PPESO)
            </p>
          </div>
          <Link to="/calendar" className="text-xs font-medium text-blue-700 hover:underline">View activity calendar</Link>
        </div>
      </footer>
    </div>
  )
}




