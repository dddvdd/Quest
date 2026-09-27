import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { participationService } from '../../services/participationService'
import { participantService } from '../../services/participantService'
import { PixelStar, PixelArrow, PixelBriefcase } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'

// Registration Confirmation — the applicant's reusable Participant Pass is
// the ONLY QR credential. There is no separate event ticket QR.
export default function ParticipationPage() {
  const params = useParams()
  const participationId = params.participationId || params.registrantId
  const [participation, setParticipation] = useState(null)
  const [participant, setParticipant] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const qrRef = useRef(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const ep = await participationService.getByIdWithDetails(participationId)
        if (!alive) return
        setParticipation(ep || null)
        if (ep?.participants) setParticipant(ep.participants)
        if (ep?.participants?.id) {
          const row = await participantService.fetchJobseekerProfile(ep.participants.id)
          if (!alive) return
          setProfile(row)
        }
      } catch (err) {
        toast.error(`Could not load your registration: ${err.message}`)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [participationId])

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading your registration…</main>

  if (!participation || !participant) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <PixelStar className="mx-auto h-4 w-4 text-amber-400" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">Registration Not Found</h1>
          <p className="mt-2 text-sm text-slate-500">This registration could not be found.</p>
          <Link to="/" className="mt-6 inline-block rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            Back to Quest Board
          </Link>
        </section>
      </main>
    )
  }

  const name = profile
    ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')
    : ''
  const passId = participant.public_pass_id
  const qrValue = JSON.stringify({ pass: passId })
  const offers = (participation?.participation_vacancies || []).map(pv => pv.event_vacancies).filter(Boolean)

  function downloadPass() {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `participant-pass-${passId}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-blue-700">
            <PixelArrow className="h-3 w-3 rotate-180" /> Quest Board
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/pass" className="text-xs font-semibold text-slate-600 hover:text-slate-900">My Pass</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <p className="flex items-center gap-2 text-sm font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span> You're Registered</p>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <header className="bg-blue-700 px-6 py-5 text-white">
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-100">Registration Confirmed</p>
            <h1 className="mt-1 text-xl font-bold">{participation.events?.event_name || 'Quest'}</h1>
            <p className="mt-1 text-xs text-blue-100">
              {participation.events?.location} · {participation.events?.event_date}
            </p>
          </header>

          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Participant</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">{name}</h2>
              <p className="mt-1 font-mono text-xs font-semibold text-blue-700">{profile?.email || ''}</p>

              <dl className="mt-5 space-y-2 text-sm">
                <div><dt className="text-xs text-slate-400">Check-in status</dt><dd className="font-semibold capitalize text-slate-800">{participation.check_in_status.replace('_', ' ')}</dd></div>
                <div><dt className="text-xs text-slate-400">Registration type</dt><dd className="font-semibold capitalize text-slate-800">{participation.registration_type}</dd></div>
              </dl>

              {offers.length > 0 && (
                <div className="mt-5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400"><PixelBriefcase className="h-3 w-3" /> Selected opportunities</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {offers.map((ev, i) => (
                      <li key={i}>{ev?.vacancy_definitions?.position} — {ev?.vacancy_definitions?.company_name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 p-5">
              <div ref={qrRef} className="grid place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-4">
                <QRCodeSVG value={qrValue} size={180} level="M" includeMargin />
              </div>
              <p className="mt-3 font-mono text-base font-bold text-slate-800">{passId}</p>
              <p className="mt-1 max-w-[220px] text-center text-[11px] text-slate-500">
                Your reusable Participant Pass — this QR is the same at every Quest.
              </p>
            </div>
          </div>

          <div className="grid gap-3 border-t border-slate-100 p-6 sm:grid-cols-3">
            <button onClick={downloadPass} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">Download Pass</button>
            <Link to="/pass" className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">View My Pass</Link>
            <Link to="/" className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Browse More Quests</Link>
          </div>
        </section>
      </main>
    </div>
  )
}