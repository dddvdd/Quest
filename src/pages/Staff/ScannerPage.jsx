import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useStaffEvents } from '../../hooks/events/useEvents'
import { useQrScanner } from '../../hooks/checkin/useQrScanner'
import { participantResolver, RESOLUTION } from '../../domain/participantResolver'
import { participationService } from '../../services/participationService'
import { checkInService } from '../../services/checkInService'
import { participantService } from '../../services/participantService'
import { PixelStar } from '../../components/public/pixel'

const RESULT_DISPLAY_MS = 3000

// Scanner states (scanResult):
//   null / 'no_quest' → no current Quest selected
//   'processing'      → QR decoded, resolving
//   'invalid'         → QR didn't resolve to anything
//   'not_found'       → participant not found
//   'not_registered'  → participant found, no participation for current Quest
//   'registered'      → participant + pending participation found → →
//   'already_checked' → already checked in
//   'success'         → just checked in
//   'error'           → unexpected system error

// ----- Pixel design tokens (mobile-first) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 pixel-shadow'
const BTN = 'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-lg border-2 border-slate-900 px-5 text-sm font-black uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
const BTN_YELLOW = `${BTN} bg-amber-400 text-slate-900`
const BTN_GHOST = `${BTN} bg-white text-slate-800`
const BTN_GREEN = `${BTN} bg-emerald-400 text-slate-900`
const BTN_RED = `${BTN} bg-red-600 text-white`

const RESULT_TONES = {
  ready: { panel: 'bg-white', box: 'bg-slate-100 text-slate-500' },
  processing: { panel: 'bg-blue-50', box: 'bg-blue-100 text-blue-700' },
  no_quest: { panel: 'bg-amber-50', box: 'bg-amber-100 text-amber-700' },
  invalid: { panel: 'bg-red-50', box: 'bg-red-100 text-red-600' },
  not_found: { panel: 'bg-red-50', box: 'bg-red-100 text-red-600' },
  not_registered: { panel: 'bg-blue-50', box: 'bg-blue-100 text-blue-700' },
  registered: { panel: 'bg-emerald-50', box: 'bg-emerald-100 text-emerald-700' },
  already_checked: { panel: 'bg-amber-50', box: 'bg-amber-100 text-amber-700' },
  success: { panel: 'bg-emerald-50', box: 'bg-emerald-100 text-emerald-700' },
  error: { panel: 'bg-red-50', box: 'bg-slate-100 text-slate-600' },
}

export default function ScannerPage() {
  const { events } = useStaffEvents()
  const [currentEvent, setCurrentEvent] = useState(null)      // {id, event_name}
  const [participant, setParticipant] = useState(null)         // {pass_id, name, ...}
  const [participation, setParticipation] = useState(null)     // event_participation row
  const [scanResult, setScanResult] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [scanHistory, setScanHistory] = useState([])

  const decodingRef = useRef(false)          // one decode resolving at a time
  const cooldownAtRef = useRef(0)            // last finished scan timestamp
  const resetTimerRef = useRef(null)
  const finishScanRef = useRef(null)
  const currentEventRef = useRef(currentEvent)

  // Keep refs fresh so the long-lived camera instance always reads the
  // latest event without being torn down and restarted.
  currentEventRef.current = currentEvent

  // Auto-select the first active event if none chosen.
  useEffect(() => {
    if (!currentEvent && events.length) setCurrentEvent(events[0])
  }, [events, currentEvent])

  const handleDecoded = useCallback(async (decodedText) => {
    if (decodingRef.current) return
    if (Date.now() - cooldownAtRef.current < RESULT_DISPLAY_MS) return
    decodingRef.current = true
    setScanResult(null)
    setParticipant(null)
    setParticipation(null)
    setProcessing(true)

    try {
      const currentEvent = currentEventRef.current
      if (!currentEvent) {
        finishScanRef.current?.('no_quest')
        return
      }

      const decoded = participantResolver.decodeQrPayload(decodedText)

      // Employer gate check-in (EMP-000123).
      if (decoded.kind === RESOLUTION.EMPLOYER) {
        let result, err
        try {
          result = await participantResolver.checkInEmployerGate(decoded.employerCode, currentEvent.id)
        } catch (e) { err = e }
        const employerCard = { name: result?.company || decoded.employerCode, passId: decoded.employerCode }
        setParticipant(employerCard)
        if (err) finishScanRef.current?.('invalid', employerCard, err.message)
        else if (result?.already_checked_in) finishScanRef.current?.('already_checked', employerCard)
        else finishScanRef.current?.('success', employerCard)
        return
      }

      const resolved = await participantResolver.resolveParticipant(decodedText)
      if (resolved.kind === RESOLUTION.NOT_FOUND || !resolved.participantId) {
        finishScanRef.current?.('not_found', null, 'QR did not resolve to a known participant')
        return
      }

      const ep = await participationService.findForParticipantAndEvent(resolved.participantId, currentEvent.id)
      setParticipant({
        name: resolved.name || 'Unknown',
        passId: resolved.passId,
        id: resolved.participantId,
      })

      if (ep) {
        setParticipation(ep)
        if (ep.check_in_status === 'checked_in') {
          finishScanRef.current?.('already_checked', { ...ep, ...resolved })
        } else {
          finishScanRef.current?.('registered', { ...ep, ...resolved })
        }
      } else {
        finishScanRef.current?.('not_registered', { participantId: resolved.participantId, ...resolved })
      }
    } catch (err) {
      finishScanRef.current?.('error', null, err.message)
    } finally {
      decodingRef.current = false
    }
  }, [])

  const { start: startCamera, stop: stopScanner, cameraError, isScanning, starting } = useQrScanner({
    elementId: 'qr-reader',
    onDecode: handleDecoded,
  })

  // Stop stream + timers when leaving the page.
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null }
    }
  }, [])

  // ----- Actions -----
  async function handleCheckIn() {
    if (!participation || !participant) return
    try {
      const checkedIn = await checkInService.checkInParticipation(participation.id)
      toast.success(`Checked in ${participant.name}!`)
      setParticipation({ ...participation, check_in_status: 'checked_in', check_in_time: checkedIn?.check_in_time })
      finishScanRef.current?.('success', { ...participant, ...checkedIn })
    } catch (err) {
      toast.error(`Check-in failed: ${err.message}`)
    }
  }

  async function handleRegister() {
    if (!currentEvent || !participant) return
    try {
      const ep = await participantService.staffRegisterParticipant(participant.id, currentEvent.id)
      toast.success(`Registered ${participant.name} for ${currentEvent.event_name}!`)
      setParticipation({ id: ep.id, check_in_status: 'pending', check_in_time: null, check_in_by: null })
      finishScanRef.current?.('registered', { ...participant, check_in_status: 'pending' })
    } catch (err) {
      toast.error(`Registration failed: ${err.message}`)
    }
  }

  // ----- Result finish -----
  function finishScan(type, data, error = null) {
    cooldownAtRef.current = Date.now()
    setProcessing(false)
    setScanResult(type)
    addScanHistory(type, data, error)
    if (type === 'success') toast.success(`Checked in ${data?.name || participant?.name || 'applicant'}!`)
    else if (type === 'error') toast.error(`Check-in failed: ${error ?? 'Unexpected error'}`)
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => {
      setParticipant(null)
      setParticipation(null)
      setScanResult(null)
      resetTimerRef.current = null
    }, RESULT_DISPLAY_MS)
  }
  finishScanRef.current = finishScan

  function addScanHistory(type, data, error = null) {
    const entry = { id: Date.now(), type, timestamp: new Date().toISOString(), registrant: data, error }
    setScanHistory(prev => [entry, ...prev].slice(0, 20))
  }

  function handleStopCamera() {
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null }
    stopScanner()
    cooldownAtRef.current = 0
    setProcessing(false); setParticipant(null); setParticipation(null); setScanResult(null)
  }
  function handleDismissResult() {
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null }
    cooldownAtRef.current = 0
    setParticipant(null); setParticipation(null); setScanResult(null)
  }
  function handleClearHistory() { setScanHistory([]) }

  const successCount = useMemo(() => scanHistory.filter(s => s.type === 'success').length, [scanHistory])
  const duplicateCount = useMemo(() => scanHistory.filter(s => s.type === 'already_checked').length, [scanHistory])
  const invalidCount = useMemo(() => scanHistory.filter(s => ['invalid','not_found','error'].includes(s.type)).length, [scanHistory])

  const state = processing ? 'processing'
    : scanResult || 'ready'
  const tone = RESULT_TONES[state]

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 lg:max-w-5xl">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700">
            <PixelStar className="h-2.5 w-2.5 text-amber-500" /> Staff Tools
          </p>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 sm:text-3xl">QR Scanner</h1>
        </div>
        {isScanning && (
          <span className={`inline-flex items-center gap-1.5 rounded-md border-2 border-slate-900 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest pixel-shadow-sm ${processing ? 'bg-blue-100 text-blue-800' : 'bg-emerald-400 text-slate-900'}`}>
            <span className="inline-block h-1.5 w-1.5 bg-current" aria-hidden /> {processing ? 'Checking' : 'Live'}
          </span>
        )}
      </div>

      {/* Quest / Event context selector */}
      <div className={`${PANEL} bg-white p-3`}>
        <label htmlFor="quest-select" className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Current Quest
        </label>
        <select
          id="quest-select"
          value={currentEvent?.id || ''}
          onChange={(e) => {
            const ev = events.find(x => x.id === e.target.value) || null
            setCurrentEvent(ev)
            setParticipant(null)
            setParticipation(null)
            setScanResult(null)
          }}
          className="min-h-[48px] w-full rounded-lg border-2 border-slate-900 bg-amber-50 px-3 text-sm font-bold text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
        >
          {events.length === 0 && <option value="">No active Quests</option>}
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name}</option>)}
        </select>
      </div>

      {/* Mobile order: camera → result → controls → history. Desktop: camera+controls left, result+history right. */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">

        {/* ---- A · Camera viewport (dominant on mobile) ---- */}
        <section className={`${PANEL} order-1 overflow-hidden bg-slate-950 scanner-shell lg:order-1`}>
          <div className="relative mx-auto h-[58dvh] max-h-[620px] min-h-[340px] w-full lg:aspect-video lg:h-auto">
            <div id="qr-reader" className="absolute inset-0" />

            {/* Pixel scan frame — yellow corners + stepped scanline */}
            {!cameraError && (
              <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="relative aspect-square h-[68%] max-h-full">
                  <span className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-amber-400" />
                  <span className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-amber-400" />
                  <span className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-amber-400" />
                  <span className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-amber-400" />
                  {isScanning && !processing && <span className="pixel-scanline absolute inset-x-3 h-1 bg-amber-400/80" />}
                </div>
              </div>
            )}

            {/* Initializing */}
            {starting && !isScanning && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/90 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1.5" aria-hidden>
                    {[0, 1, 2].map(i => (
                      <span key={i} className="pixel-blink inline-block h-2.5 w-2.5 bg-amber-400" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-amber-400">Starting camera…</p>
                </div>
              </div>
            )}

            {/* Camera error / insecure origin */}
            {cameraError && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/95 p-5 text-center">
                <div className="max-w-sm">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-lg border-2 border-slate-900 bg-red-100 pixel-shadow-sm text-3xl font-black text-red-600" aria-hidden>!</span>
                  <p className="mt-3 text-lg font-black uppercase tracking-wide text-red-400">
                    {cameraError.fatal ? 'Camera Blocked' : 'Camera Error'}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">{cameraError.msg}</p>
                  {!cameraError.fatal && (
                    <button onClick={startCamera} className={`${BTN_YELLOW} mt-4 px-8`}>Retry</button>
                  )}
                </div>
              </div>
            )}

            {/* Camera off */}
            {!isScanning && !starting && !cameraError && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/90 p-5 text-center">
                <div>
                  <p className="text-xl font-black uppercase tracking-wide text-white">Camera Stopped</p>
                  <button onClick={startCamera} className={`${BTN_YELLOW} mt-4 px-8 text-base`}>▶ Start Scan</button>
                </div>
              </div>
            )}

            {/* Status ribbon */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-slate-950/85 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest">
              <span className="text-amber-400">{processing ? 'Checking…' : isScanning ? '● Scanning' : 'Camera Off'}</span>
              <span className="truncate text-slate-400">{currentEvent ? currentEvent.event_name : 'No quest selected'}</span>
            </div>
          </div>
        </section>

        {/* ---- B · Result card (immediately visible after a scan) ---- */}
        <section className={`${PANEL} order-2 p-5 lg:order-3 ${tone.panel}`} aria-live="polite">
          {(() => {
            const name = participant?.name || null
            const passId = participant?.passId || null
            const evName = currentEvent?.event_name || null
            const checkInTime = participation?.check_in_time ? new Date(participation.check_in_time).toLocaleString() : null
            const iconBox = `mx-auto grid h-16 w-16 place-items-center rounded-lg border-2 border-slate-900 pixel-shadow-sm text-3xl font-black ${tone.box}`

            return (
              <div className="text-center">
                {/* READY */}
                {state === 'ready' && (
                  <>
                    <span className={iconBox} aria-hidden>▣</span>
                    <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Ready to Scan</p>
                    <p className="mt-1 text-sm text-slate-600">Point the camera at a Participant Pass.</p>
                  </>
                )}

                {/* PROCESSING */}
                {state === 'processing' && (
                  <>
                    <span className={`${iconBox} pixel-blink`} aria-hidden>⋯</span>
                    <p className="mt-3 text-xl font-black uppercase tracking-wide text-blue-700">Checking Pass…</p>
                  </>
                )}

                {/* NO QUEST SELECTED */}
                {state === 'no_quest' && (
                  <>
                    <span className={iconBox} aria-hidden>!</span>
                    <p className="mt-3 text-xl font-black uppercase tracking-wide text-amber-700">No Quest Selected</p>
                    <p className="mt-1 text-sm text-amber-800">Pick a Quest above before scanning a pass.</p>
                  </>
                )}

                {/* INVALID QR */}
                {state === 'invalid' && (
                  <>
                    <span className={iconBox} aria-hidden>✕</span>
                    <p className="mt-3 text-xl font-black uppercase tracking-wide text-red-700">Invalid Pass</p>
                    <p className="mt-1 text-sm text-red-800">This QR is not a valid participant pass.</p>
                  </>
                )}

                {/* PARTICIPANT NOT FOUND */}
                {state === 'not_found' && (
                  <>
                    <span className={iconBox} aria-hidden>✕</span>
                    <p className="mt-3 text-xl font-black uppercase tracking-wide text-red-700">Not Found</p>
                    <p className="mt-1 text-sm text-red-800">No participant matches this QR.</p>
                    <Link to="/staff/walkin" className={`${BTN_YELLOW} mt-4 w-full sm:w-auto sm:min-w-[220px]`}>Register as Walk-In</Link>
                  </>
                )}

                {/* NOT REGISTERED — register action */}
                {state === 'not_registered' && (
                  <>
                    <span className={iconBox} aria-hidden>?</span>
                    <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-blue-700">Participant Found — Not Registered</p>
                    <p className="mt-1 break-words text-2xl font-black text-slate-900">{name}</p>
                    {passId && <p className="mt-1 font-mono text-sm font-bold tracking-wider text-blue-700">{passId}</p>}
                    {evName && <p className="mt-1 text-xs text-slate-600">Quest: <strong>{evName}</strong></p>}
                    <button onClick={handleRegister} className={`${BTN_YELLOW} mt-4 w-full sm:w-auto sm:min-w-[240px]`}>Register for This Quest</button>
                  </>
                )}

                {/* REGISTERED — pending, check-in action */}
                {state === 'registered' && (
                  <>
                    <span className={iconBox} aria-hidden>✓</span>
                    <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-emerald-700">Participant Found — Registered</p>
                    <p className="mt-1 break-words text-2xl font-black text-slate-900">{name}</p>
                    {passId && <p className="mt-1 font-mono text-sm font-bold tracking-wider text-emerald-700">{passId}</p>}
                    {evName && <p className="mt-1 text-xs text-slate-600">Quest: <strong>{evName}</strong></p>}
                    <button onClick={handleCheckIn} className={`${BTN_GREEN} mt-4 w-full sm:w-auto sm:min-w-[220px]`}>Check In</button>
                  </>
                )}

                {/* ALREADY CHECKED IN */}
                {state === 'already_checked' && (
                  <>
                    <span className={iconBox} aria-hidden>!</span>
                    <p className="mt-3 text-xl font-black uppercase tracking-wide text-amber-700">Already Checked In</p>
                    <p className="mt-1 break-words text-2xl font-black text-slate-900">{name}</p>
                    {passId && <p className="mt-1 font-mono text-sm font-bold tracking-wider text-amber-700">{passId}</p>}
                    {checkInTime && <p className="mt-1 text-xs text-amber-800">Checked in at {checkInTime}</p>}
                  </>
                )}

                {/* SUCCESS — just checked in */}
                {state === 'success' && (
                  <>
                    <span className={iconBox} aria-hidden>✓</span>
                    <p className="mt-3 text-xl font-black uppercase tracking-wide text-emerald-700">Checked In!</p>
                    <p className="mt-1 break-words text-2xl font-black text-slate-900">{name}</p>
                    {passId && <p className="mt-1 font-mono text-sm font-bold tracking-wider text-emerald-700">{passId}</p>}
                    {checkInTime && <p className="mt-1 text-xs text-emerald-800">{checkInTime}</p>}
                  </>
                )}

                {/* ERROR */}
                {state === 'error' && (
                  <>
                    <span className={iconBox} aria-hidden>⚠</span>
                    <p className="mt-3 text-xl font-black uppercase tracking-wide text-red-700">Check-in Failed</p>
                    <p className="mt-1 text-sm text-red-800">Unable to process this pass. Please try again.</p>
                    {name && <p className="mt-1 text-xs text-slate-500">Participant: {name}</p>}
                  </>
                )}

                {/* Next-scan escape hatch (auto-resets after 3s anyway) */}
                {state !== 'ready' && state !== 'processing' && (
                  <button onClick={handleDismissResult} className={`${BTN_GHOST} mt-4 min-h-[44px] px-4 text-xs`}>Next Scan →</button>
                )}
              </div>
            )
          })()}
        </section>

        {/* ---- C · Controls ---- */}
        <section className="order-3 space-y-2 lg:order-2">
          <p className="flex items-start gap-2 text-xs font-semibold leading-relaxed text-slate-600">
            Hold the phone steady about 15–25 cm from the Participant Pass QR code until it beeps green.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {isScanning ? (
              <button onClick={handleStopCamera} className={`${BTN_RED} col-span-2`}>■ Stop Camera</button>
            ) : (
              <button onClick={startCamera} disabled={starting} className={`${BTN_YELLOW} col-span-2 disabled:opacity-60`}>
                {starting ? 'Starting…' : '▶ Start Scan'}
              </button>
            )}
            <Link to="/staff/search" className={`${BTN_GHOST} col-span-2`}>⌨ Manual Search</Link>
          </div>
        </section>

        {/* ---- D · Scan history ---- */}
        {scanHistory.length > 0 && (
          <section className={`${PANEL} order-4 bg-white p-4 lg:order-4`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Scan Log</h2>
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold">
                <span className="rounded-md border-2 border-slate-900 bg-emerald-100 px-1.5 py-0.5 text-emerald-800">✓{successCount}</span>
                <span className="rounded-md border-2 border-slate-900 bg-amber-100 px-1.5 py-0.5 text-amber-800">⚠{duplicateCount}</span>
                <span className="rounded-md border-2 border-slate-900 bg-red-100 px-1.5 py-0.5 text-red-700">✗{invalidCount}</span>
                <button onClick={handleClearHistory} className="ml-1 min-h-[32px] rounded-md border-2 border-slate-900 bg-white px-2 font-bold uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">Clear</button>
              </div>
            </div>
            <ul className="max-h-72 space-y-2 overflow-y-auto lg:max-h-96">
              {scanHistory.map(scan => {
                const sn = scan.registrant?.name || scan.registrant?.first_name || null
                const sp = scan.registrant?.passId || null
                const time = new Date(scan.timestamp).toLocaleTimeString()
                const ok = scan.type === 'success'
                const dup = scan.type === 'already_checked'
                return (
                  <li key={scan.id} className="flex items-center gap-3 rounded-lg border-2 border-slate-200 px-3 py-2">
                    <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border-2 border-slate-900 text-sm font-black ${ok ? 'bg-emerald-400 text-slate-900' : dup ? 'bg-amber-400 text-slate-900' : 'bg-red-500 text-white'}`}>
                      {ok ? '✓' : dup ? '⚠' : '✕'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{sn || 'Unknown'}</p>
                      <p className="truncate font-mono text-[11px] text-slate-500">{sp || scan.error || 'Invalid pass'}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-slate-400">{time}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}