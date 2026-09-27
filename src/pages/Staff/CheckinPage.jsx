import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { registrantService } from '../../services/registrantService'
import { checkInService } from '../../services/checkInService'
import { eventVacancyService } from '../../services/eventVacancyService'

// ----- Pixel design tokens (shared with scanner/calendar pages) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 bg-white pixel-shadow'

export default function CheckinPage() {
  const { registrantId } = useParams()
  const [registrant, setRegistrant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    async function loadData() {
      try {
        const [data, vacanciesWrap] = await Promise.all([
          registrantService.getById(registrantId),
          eventVacancyService.listForRegistrantDetail(registrantId),
        ])
        if (!alive) return
        // Mirror the original shape: registrant_vacancies as a sibling array.
        const rvs = (vacanciesWrap?.registrant_vacancies || []).map((rv) => rv)
        setRegistrant({ ...(data || {}), registrant_vacancies: rvs })
      } catch (err) {
        toast.error(`Could not fetch registrant details: ${err.message}`)
      } finally {
        if (alive) setLoading(false)
      }
    }

    loadData()
    return () => { alive = false }
  }, [registrantId])

  async function handleCheckin() {
    if (!registrant) return
    setSubmitting(true)
    try {
      const data = await checkInService.checkInRegistrant(registrant.id)
      toast.success('Successfully checked in applicant!')
      setRegistrant({ ...registrant, ...data })
    } catch (err) {
      toast.error(`Check-in failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[300px] place-items-center" role="status">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5" aria-hidden>
            {[0, 1, 2].map(i => (
              <span key={i} className="pixel-blink inline-block h-2.5 w-2.5 bg-amber-400" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Loading registrant…</p>
        </div>
      </div>
    )
  }

  if (!registrant) {
    return (
      <div className={`${PANEL} p-8 text-center`}>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">Not Found</p>
        <h2 className="mt-1 text-xl font-black uppercase tracking-wide text-slate-900">Registrant Not Found</h2>
        <p className="mt-2 text-slate-600">The requested registrant record could not be found.</p>
        <Link to="/staff/search" className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border-2 border-slate-900 bg-amber-400 px-4 text-xs font-bold uppercase tracking-wide text-slate-900 pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
          ← Back to Search
        </Link>
      </div>
    )
  }

  const name = [registrant.first_name, registrant.middle_name, registrant.last_name].filter(Boolean).join(' ')
  const address = [registrant.barangay, registrant.municipality_city, registrant.province].filter(Boolean).join(', ')
  const isCheckedIn = registrant.check_in_status === 'checked_in'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/staff/search" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-slate-900 bg-white px-4 text-xs font-bold uppercase tracking-wide text-slate-700 pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">
          ← Back to Search
        </Link>
      </div>

      <div className={`overflow-hidden ${PANEL}`}>
        <header className="bg-slate-900 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
              {registrant.registration_type === 'walkin' ? 'Walk-in' : 'Pre-registered'}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                isCheckedIn ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50' : 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50'
              }`}
            >
              {registrant.check_in_status.replace('_', ' ')}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold">{name}</h1>
          <p className="font-mono text-sm font-semibold text-blue-300">{registrant.unique_id}</p>
        </header>

        <div className="p-6 space-y-6">
          {/* Status Alert Banner */}
          {isCheckedIn ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <p className="font-bold flex items-center gap-2">✓ Applicant Checked In</p>
              <p className="mt-1 text-xs text-emerald-700">
                Check-in timestamp: {registrant.check_in_time ? new Date(registrant.check_in_time).toLocaleString() : 'N/A'}
              </p>
            </div>
          ) : (
            <button
              onClick={handleCheckin}
              disabled={submitting}
              className="w-full rounded-xl border-2 border-slate-900 bg-emerald-400 py-3.5 text-center font-black uppercase tracking-wide text-slate-900 pixel-shadow active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
            >
              {submitting ? 'Processing Check-in...' : 'Confirm Check-In Now'}
            </button>
          )}

          {/* Registrant details */}
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="rounded-xl bg-slate-50 p-4 space-y-2">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Personal Info</h3>
              <p><span className="text-slate-500">Birthdate:</span> {registrant.birthdate || 'N/A'}</p>
              <p><span className="text-slate-500">Sex:</span> {registrant.sex || 'N/A'}</p>
              <p><span className="text-slate-500">Civil Status:</span> {registrant.civil_status || 'N/A'}</p>
              <p><span className="text-slate-500">Address:</span> {address || 'N/A'}</p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 space-y-2">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Contact & Event</h3>
              <p><span className="text-slate-500">Email:</span> {registrant.email || 'N/A'}</p>
              <p><span className="text-slate-500">Contact #:</span> {registrant.contact_no || 'N/A'}</p>
              <p><span className="text-slate-500">Event:</span> {registrant.events?.event_name || 'Job Fair'}</p>
              <p><span className="text-slate-500">Location:</span> {registrant.events?.location || 'N/A'}</p>
            </div>
          </div>

          {/* Education & Employment */}
          <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-2">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Education & Preference</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <p><span className="text-slate-500">Education:</span> {registrant.highest_educational_attainment || 'N/A'}</p>
              <p><span className="text-slate-500">Course:</span> {registrant.course_program || 'N/A'}</p>
              <p><span className="text-slate-500">Employment Preference:</span> {registrant.employment_preference || 'N/A'}</p>
            </div>
          </div>

          {/* Applied Vacancies */}
          {registrant.registrant_vacancies?.length > 0 && (
            <div className="space-y-2 text-sm">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Applied Vacancies</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {registrant.registrant_vacancies.map(({ event_vacancies }, idx) => {
                  const def = event_vacancies?.vacancy_definitions ?? {}
                  return (
                    <div key={idx} className="rounded-xl border border-slate-200 p-3">
                      <p className="font-bold text-slate-800">{def.position}</p>
                      <p className="text-xs text-slate-500">{def.company_name}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}