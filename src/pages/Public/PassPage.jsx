import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../../contexts/AuthContext'
import { useParticipant } from '../../hooks/jobseeker/useJobseeker'
import { participantService } from '../../services/participantService'
import { participationService } from '../../services/participationService'
import { PixelStar, PixelArrow, PixelBriefcase, PixelCal } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'

// Persistent Participant Pass — identifies WHO the person is, independent of
// any single event. The QR contains ONLY the opaque public pass id, never
// name/birthdate/contact/resume. Quest participations are shown alongside as
// context, but they never alter the pass itself.
export default function PassPage() {
  const { user } = useAuth()
  const { participant, loading: participantLoading } = useParticipant()
  const [profile, setProfile] = useState(null)
  const [participations, setParticipations] = useState([])
  const [missing, setMissing] = useState(false)
  const qrRef = useRef(null)

  useEffect(() => {
    if (!participant) {
      if (!participantLoading) setMissing(true)
      return
    }
    let alive = true
    Promise.all([
      participantService.fetchJobseekerProfile(participant.id),
      participationService.listForParticipantWithDetails(participant.id),
    ]).then(([profileRow, parts]) => {
      if (!alive) return
      setProfile(profileRow)
      setParticipations(parts || [])
    }).catch(() => { if (alive) { setProfile(null); setParticipations([]) } })
    return () => { alive = false }
  }, [participant, participantLoading])

  if (participantLoading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading your pass…</main>

  if (missing || !participant) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <PixelStar className="mx-auto h-4 w-4 text-amber-400" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">No Pass Yet</h1>
          <p className="mt-2 text-sm text-slate-500">Create your Job Seeker Profile first — your Participant Pass is issued with it.</p>
          <Link to="/register" className="mt-6 inline-block rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            Build My Profile
          </Link>
        </section>
      </main>
    )
  }

  const name = profile
    ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')
    : user?.user_metadata?.name || user?.email

  // Opaque payload: only the public pass id. Nothing sensitive is encoded.
  const qrValue = JSON.stringify({ pass: participant.public_pass_id })

  function downloadPass() {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `participant-pass-${participant.public_pass_id}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-blue-700">
            <PixelArrow className="h-3 w-3 rotate-180" /> Quest Board
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/profile" className="text-xs font-semibold text-slate-600 hover:text-slate-900">Edit Profile</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700"><PixelStar className="h-2.5 w-2.5 text-amber-500" /> Participant Pass</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">Your Permanent Participant Identity</h1>
        <p className="mt-1 text-sm text-slate-600">Scan this at any Quest — one identity, reused across all events.</p>

        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <header className="bg-blue-700 px-6 py-4 text-white">
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-100">Job Seeker</p>
            <h2 className="mt-1 text-xl font-bold">{name}</h2>
            <p className="mt-1 font-mono text-xs font-semibold text-blue-100">{profile?.email || ''}</p>
          </header>
          <div className="p-6">
            <div ref={qrRef} className="mx-auto grid w-fit place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-5">
              <QRCodeSVG value={qrValue} size={200} level="M" includeMargin />
            </div>
            <p className="mt-4 text-center font-mono text-lg font-bold text-slate-800">{participant.public_pass_id}</p>
            <p className="mx-auto mt-2 max-w-sm text-center text-xs text-slate-500">
              This QR contains only your public Pass ID — no name, birthdate, contact, or other personal data is encoded.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button onClick={downloadPass} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">Download Pass</button>
              <button onClick={() => window.print()} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Print Pass</button>
            </div>
          </div>
        </section>

        {/* Quest participations */}
        {participations.length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><PixelBriefcase className="h-4 w-4 text-blue-700" /> My Quests</h2>
            <div className="mt-3 space-y-3">
              {participations.map(ep => {
                const offers = (ep.participation_vacancies || []).map(pv => pv.event_vacancies).filter(Boolean)
                return (
                  <div key={ep.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{ep.events?.event_name || 'Quest'}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${
                        ep.check_in_status === 'checked_in' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>{ep.check_in_status.replace('_', ' ')}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      <PixelCal className="inline h-2.5 w-2.5" /> {ep.events?.event_date} · {ep.events?.location}
                    </p>
                    {offers.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {offers.map((ev, i) => (
                          <li key={i} className="text-xs text-slate-600">
                            <PixelStar className="inline h-2 w-2 text-amber-400" /> {ev?.vacancy_definitions?.position} — {ev?.vacancy_definitions?.company_name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}