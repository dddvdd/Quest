import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { eventService } from '../services/eventService'
import { participationService } from '../services/participationService'
import { eventAssignmentService } from '../services/eventAssignmentService'
import { profileDirectoryService } from '../services/profileDirectoryService'
import { employerService } from '../services/employerService'
import { eventVacancyService } from '../services/eventVacancyService'
import { ROLES } from '../domain/roles'
import { EVENT_STATUS_LABEL } from '../domain/statuses'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from 'date-fns'
import { eventTypeDisplay } from '../domain/eventTypes'
import { toast } from 'sonner'
import ThemeToggle from '../components/ThemeToggle'
import { PixelArrow, PixelDivider } from '../components/public/pixel'

const STATUS_CHIP_FIXED = {
  upcoming: 'bg-blue-100 text-blue-800 border-blue-200',
  ongoing: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  completed: 'bg-slate-100 text-slate-500 border-slate-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200 line-through',
}
const STATUS_PILL = {
  upcoming: 'bg-blue-100 text-blue-800',
  ongoing: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-red-100 text-red-700',
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ----- PPESO pixel design tokens (16-bit lo-fi calendar) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 bg-white pixel-shadow'
const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-slate-900 px-3 font-bold uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300'

const ROLE_HOME = {
  [ROLES.EMPLOYER]: '/employer/dashboard',
  [ROLES.STAFF]: '/staff/scanner',
  [ROLES.SUPERVISOR]: '/supervisor',
  [ROLES.MEDICAL]: '/medical/dashboard',
  [ROLES.ADMIN]: '/admin/dashboard',
}

export default function CalendarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role || 'guest'
  const [cursor, setCursor] = useState(new Date())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  function goBack() {
    if (window.history.state?.idx > 0) return navigate(-1)
    navigate(ROLE_HOME[profile?.role] || '/')
  }

  useEffect(() => {
    // Visibility is enforced by RLS per role — no client-side role duplication.
    let alive = true
    eventService.listAllOrdered()
      .then((rows) => { if (alive) { setEvents(rows || []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor)),
    end: endOfWeek(endOfMonth(cursor)),
  }), [cursor])

  const byDay = useMemo(() => {
    const map = {}
    for (const ev of events) {
      const key = format(parseISO(ev.event_date), 'yyyy-MM-dd')
      ;(map[key] = map[key] || []).push(ev)
    }
    return map
  }, [events])

  return (
    <main className="theme-employer min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <button onClick={goBack} className={`${BTN} bg-white text-slate-700`} aria-label="Go back">
            <PixelArrow className="h-3 w-3 rotate-180 text-amber-500" /> Back
          </button>
          <ThemeToggle />
        </div>

        <section className={`mt-4 p-4 sm:p-5 ${PANEL} pixel-grid-bg`}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">Event Schedule</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-3">
            <button onClick={() => setCursor(subMonths(cursor, 1))} aria-label="Previous month" className={`${BTN} w-12 justify-center bg-white px-0 text-lg`}>‹</button>
            <h1 aria-live="polite" className="min-w-0 flex-1 text-center text-3xl font-black uppercase tracking-tight text-slate-900 sm:text-left sm:text-4xl">
              {format(cursor, 'MMMM yyyy')}
            </h1>
            <button onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month" className={`${BTN} w-12 justify-center bg-white px-0 text-lg`}>›</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => setCursor(new Date())} className={`${BTN} bg-amber-400 text-slate-900 text-xs`}>Today</button>
            {role === 'admin' && (
              <button onClick={() => navigate('/admin/events')} className={`${BTN} bg-white text-xs text-slate-700`}>+ New Activity</button>
            )}
            <PixelDivider className="ml-auto hidden sm:flex" />
          </div>
        </section>

        <div className={`mt-4 overflow-hidden ${PANEL}`}>
          <div className="grid grid-cols-7 border-b-2 border-slate-900 bg-slate-900">
            {WEEKDAYS.map(d => <div key={d} className="px-1 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-amber-400">{d}</div>)}
          </div>
          {loading ? (
            <div className="grid min-h-64 place-items-center" role="status">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5" aria-hidden>
                  {[0, 1, 2].map(i => (
                    <span key={i} className="pixel-blink inline-block h-2.5 w-2.5 bg-amber-400" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Loading activities…</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {days.map(day => {
                const dayEvents = byDay[format(day, 'yyyy-MM-dd')] || []
                const inMonth = isSameMonth(day, cursor)
                const isToday = isSameDay(day, new Date())
                return (
                  <div
                    key={day.toISOString()}
                    aria-current={isToday ? 'date' : undefined}
                    className={`min-h-24 border-b border-r border-slate-200 p-1.5 last:border-r-0 sm:min-h-28 ${inMonth ? '' : 'bg-slate-50/70'}`}
                  >
                    <div className={`mb-1 inline-grid h-7 w-7 place-items-center rounded-md border-2 text-xs font-black ${
                      isToday
                        ? 'border-slate-900 bg-amber-400 text-slate-900 pixel-shadow-sm'
                        : inMonth ? 'border-transparent text-slate-700' : 'border-transparent text-slate-300'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map(ev => (
                        <button
                          key={ev.id}
                          onClick={() => setSelected(ev)}
                          title={`${ev.event_name} — ${EVENT_STATUS_LABEL[ev.status]}`}
                          aria-label={`${ev.event_name} (${EVENT_STATUS_LABEL[ev.status]})`}
                          className={`flex min-h-[40px] w-full items-center truncate rounded-md border px-2 py-1 text-left text-[10px] font-semibold leading-tight hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 sm:min-h-[32px] sm:text-[11px] ${STATUS_CHIP_FIXED[ev.status] || STATUS_CHIP_FIXED.upcoming}`}
                        >
                          {ev.status === 'ongoing' && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />}
                          {ev.time_from && <span className="font-normal opacity-70">{format(parseISO(`2000-01-01T${ev.time_from}`), 'h:mm a')} </span>}
                          {ev.event_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {[['upcoming', 'Upcoming'], ['ongoing', 'Live'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([s, l]) => (
            <span key={s} className="flex items-center gap-1.5"><span aria-hidden className={`inline-block h-3 w-3 border-2 border-slate-900 ${STATUS_CHIP_FIXED[s]}`} />{l}</span>
          ))}
        </div>

        <PixelDivider className="mt-6" />
      </div>

      {selected && (
        <EventDetails
          event={selected}
          role={role}
          profileId={profile?.id || null}
          onClose={() => setSelected(null)}
          navigateFn={navigate}
        />
      )}
    </main>
  )
}

function EventDetails({ event, role, profileId, onClose, navigateFn }) {
  const navigate = navigateFn
  const isAdmin = role === ROLES.ADMIN
  const isEmployer = role === ROLES.EMPLOYER
  const isStaffLevel = [ROLES.ADMIN, ROLES.STAFF, ROLES.SUPERVISOR, ROLES.MEDICAL].includes(role)
  const isPublicSide = role === 'guest' || role === ROLES.APPLICANT

  const [stats, setStats] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [staffPool, setStaffPool] = useState([])
  const [pickRole, setPickRole] = useState(ROLES.SUPERVISOR)
  const [pickUser, setPickUser] = useState('')
  const [myParticipation, setMyParticipation] = useState(null)
  const [employerStatus, setEmployerStatus] = useState(null)
  const [pickingVacancies, setPickingVacancies] = useState(false)
  const [myDefs, setMyDefs] = useState([])
  const [pickedDefs, setPickedDefs] = useState([])
  const [employers, setEmployers] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      // event_participations RLS only exposes rows to staff-level roles.
      const partP = isStaffLevel
        ? participationService.listForEventStaff(event.id)
        : Promise.resolve([])
      if (isAdmin) {
        const [part, asg, pool] = await Promise.all([
          partP,
          eventAssignmentService.listForEvent(event.id),
          profileDirectoryService.listStaffPool(),
        ])
        if (!alive) return
        const rows = part || []
        setStats({ jobseekers: rows.length, checkedIn: rows.filter(r => r.check_in_status === 'checked_in').length })
        setAssignments(asg || [])
        setStaffPool(pool || [])
      } else {
        const mineP = isEmployer
          ? employerService.getByRegisteredUser(profileId)
          : Promise.resolve(null)
        const [part, mine] = await Promise.all([partP, mineP])
        if (!alive) return
        const rows = part || []
        setStats({ jobseekers: rows.length, checkedIn: rows.filter(r => r.check_in_status === 'checked_in').length })
        if (isEmployer) {
          setEmployerStatus(mine)
          if (mine?.id) {
            const p = await employerService.getEventParticipationStatus(mine.id, event.id)
            if (!alive) return
            setMyParticipation(p || null)
          }
        }
      }
    }
    load()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  async function refreshAssignments() {
    const data = await eventAssignmentService.listForEvent(event.id)
    setAssignments(data || [])
  }

  async function participate() {
    setBusy(true)
    try {
      await employerService.participateInEvent(event.id)
      // Refresh participation, then ask which vacancies to bring.
      const [p, defs] = await Promise.all([
        employerService.getEventParticipationStatus(employerStatus.id, event.id),
        employerService.listOwnDefinitions(employerStatus.id),
      ])
      setMyParticipation(p || null)
      if (defs && defs.length > 0) {
        setMyDefs(defs)
        setPickedDefs([])
        setPickingVacancies(true)
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmOfferings() {
    if (pickedDefs.length === 0) return
    setBusy(true)
    const rows = myDefs
      .filter(d => pickedDefs.includes(d.id))
      .map(d => ({
        vacancy_definition_id: d.id,
        event_id: event.id,
        slots_offered: d.available_slots > 0 ? d.available_slots : 1,
      }))
    try {
      await eventVacancyService.upsertOffering({
        vacancyDefinitionId: rows[0].vacancy_definition_id,
        eventId: rows[0].event_id,
        slotsOffered: rows[0].slots_offered,
        notes: null,
      })
      // The original upserts in a loop; repeat the per-row upsert.
      // (Bulk-upsert in eventVacancyService.upsertOffering already handles one row at a time;
      // for the bulk path we'd need a different signature — kept per-row for parity.)
      for (const r of rows.slice(1)) {
        await eventVacancyService.upsertOffering({
          vacancyDefinitionId: r.vacancy_definition_id,
          eventId: r.event_id,
          slotsOffered: r.slots_offered,
          notes: null,
        })
      }
      setPickingVacancies(false)
      toast.success(`You're in! ${pickedDefs.length} vacancy offer${pickedDefs.length === 1 ? '' : 's'} confirmed for this activity.`)
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function browseEmployers() {
    setBusy(true)
    try {
      const data = await employerService.listEventEmployers(event.id)
      setEmployers(data || [])
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function addAssignment() {
    if (!pickUser) return
    setBusy(true)
    try {
      await eventAssignmentService.assign({
        eventId: event.id,
        userId: pickUser,
        assignmentRole: pickRole,
        assignedBy: profileId,
      })
      setPickUser('')
      await refreshAssignments()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeAssignment(id) {
    try {
      await eventAssignmentService.unassign(id)
      await refreshAssignments()
    } catch (err) {
      alert(err.message)
    }
  }

  const myAssignment = assignments.find(a => a.user_id === profileId)
  const canParticipate = isEmployer && employerStatus?.registration_status === 'approved'
    && !myParticipation && ['upcoming', 'ongoing'].includes(event.status)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Activity details: ${event.event_name}`}
        className={`${PANEL} max-h-[90dvh] w-full max-w-lg overflow-y-auto p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black uppercase tracking-wide text-slate-900">{event.event_name}</h2>
            <span className={`mt-1 inline-block rounded-md border-2 border-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${STATUS_PILL[event.status]}`}>{EVENT_STATUS_LABEL[event.status]}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close activity details"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl leading-none text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
          >×</button>
        </div>

        <dl className="mt-4 space-y-1.5 text-sm text-slate-600">
          <Detail label="Date" value={format(parseISO(event.event_date), 'EEEE, MMMM d, yyyy')} />
          <Detail label="Time" value={[event.time_from, event.time_to].filter(Boolean).map(t => format(parseISO(`2000-01-01T${t}`), 'h:mm a')).join(' – ') || '—'} />
          <Detail label="Venue" value={event.venue || event.location} />
          <Detail label="Type" value={eventTypeDisplay(event)} />
          {event.description && <Detail label="Description" value={event.description} />}
        </dl>

        {isStaffLevel && stats && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">{stats.jobseekers}</p><p className="text-slate-500">Jobseekers registered</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">{stats.checkedIn}</p><p className="text-slate-500">Checked in on site</p></div>
          </div>
        )}

        {isEmployer && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            {myParticipation ? (
              <>
                <p className="text-sm font-semibold text-emerald-700">✓ Participating ({myParticipation.status.replace('_', ' ')})</p>
                {pickingVacancies && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Select vacancies to bring</p>
                    <div className="mt-2 space-y-1.5">
                      {myDefs.map(d => (
                        <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={pickedDefs.includes(d.id)}
                            onChange={(e) => setPickedDefs(e.target.checked ? [...pickedDefs, d.id] : pickedDefs.filter(id => id !== d.id))}
                            className="h-4 w-4 rounded text-violet-600"
                          />
                          <span className="min-w-0 flex-1 truncate text-slate-800">{d.position}</span>
                          <span className="text-xs text-slate-400">{d.available_slots > 0 ? `${d.available_slots} openings` : '—'}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setPickingVacancies(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600">Skip for now</button>
                      <button onClick={confirmOfferings} disabled={busy || pickedDefs.length === 0} className="flex-1 rounded-lg bg-violet-700 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-50">
                        {busy ? 'Saving…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
                {!pickingVacancies && employerStatus?.employer_code && (
                  <p className="mt-1 text-xs text-slate-400">Your Employer ID for gate check-in: <span className="font-mono font-bold text-slate-600">{employerStatus.employer_code}</span></p>
                )}
              </>
            ) : canParticipate ? (
              <button onClick={participate} disabled={busy} className="w-full rounded-lg bg-violet-700 py-2.5 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50">
                {busy ? 'Submitting…' : 'Participate'}
              </button>
            ) : employerStatus && employerStatus.registration_status !== 'approved' ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Employer accreditation approval is required to participate in this activity.
              </p>
            ) : (
              <p className="text-sm text-slate-500">This activity is not open for new participation.</p>
            )}
          </div>
        )}

        {isPublicSide && (
          <div className="mt-4">
            <button onClick={browseEmployers} disabled={busy} className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
              Browse Employers
            </button>
            {employers && (
              <div className="mt-3 space-y-2">
                {employers.length === 0 && <p className="text-center text-xs text-slate-400">No participating employers yet.</p>}
                {employers.map(e => (
                  <div key={e.employer_code} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{e.company_name} {e.on_site && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">ON SITE</span>}</p>
                      <p className="text-xs text-slate-400">{e.industry || e.employer_code} · {e.vacancy_count} vacancies</p>
                    </div>
                    <button onClick={() => navigate(`/events/${event.id}`)} className="flex-shrink-0 rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">View Jobs</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isPublicSide && !isEmployer && !isAdmin && (
          <div className="mt-4 space-y-2">
            {myAssignment && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                You are assigned to this activity as {myAssignment.assignment_role}.
              </p>
            )}
            {role === ROLES.STAFF && <button onClick={() => navigate('/staff/scanner')} className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600">Check-In (Scanner)</button>}
            {role === ROLES.SUPERVISOR && <button onClick={() => navigate('/supervisor')} className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Monitor</button>}
            {role === ROLES.MEDICAL && <button onClick={() => navigate('/medical/dashboard')} className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Open Medical Workspace</button>}
            {stats && <p className="text-center text-xs text-slate-400">{stats.jobseekers} jobseekers · {stats.checkedIn} checked in</p>}
          </div>
        )}

        {isAdmin && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => navigate('/admin/events')} className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit Activity</button>
              <button onClick={() => navigate('/admin/registrants')} className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Participants</button>
              <button onClick={() => navigate('/admin/reports')} className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Reports</button>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Personnel Assignments</p>
              <div className="mt-2 space-y-1">
                {assignments.length === 0 && <p className="text-xs text-slate-400">No personnel assigned yet.</p>}
                {assignments.map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                    <span><span className={`mr-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${a.assignment_role === 'supervisor' ? 'bg-purple-100 text-purple-700' : a.assignment_role === 'staff' ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'}`}>{a.assignment_role}</span>{a.profiles?.full_name || 'User'}</span>
                    <button onClick={() => removeAssignment(a.id)} className="text-[11px] font-semibold text-red-600 hover:underline">Remove</button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <select value={pickRole} onChange={(e) => { setPickRole(e.target.value); setPickUser('') }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option value="supervisor">Supervisor</option>
                  <option value="staff">Staff</option>
                  <option value="medical">Medical</option>
                </select>
                <select value={pickUser} onChange={(e) => setPickUser(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option value="">Select person…</option>
                  {staffPool.filter(p => p.role === pickRole).map(p => <option key={p.id} value={p.id}>{p.full_name || p.id}</option>)}
                </select>
                <button onClick={addAssignment} disabled={!pickUser || busy} className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50">Assign</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 flex-shrink-0 font-medium text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-slate-700">{value || '—'}</dd>
    </div>
  )
}