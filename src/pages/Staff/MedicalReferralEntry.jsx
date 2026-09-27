import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'
import { interviewService } from '../../services/interviewService'
import { medicalService } from '../../services/medicalService'
import { REFERRAL_STATUS, REFERRAL_STATUS_LABEL, REFERRAL_STATUS_BADGE } from '../../domain/statuses'

const SERVICE_BADGE = {
  green: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-blue-100 text-blue-800',
  orange: 'bg-orange-100 text-orange-800',
  purple: 'bg-purple-100 text-purple-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  teal: 'bg-teal-100 text-teal-800',
  red: 'bg-red-100 text-red-800',
  pink: 'bg-pink-100 text-pink-800',
  slate: 'bg-slate-100 text-slate-700',
}

// ----- Pixel design tokens (shared with scanner/calendar/supervisor pages) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 bg-white pixel-shadow'
const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-slate-900 px-4 font-bold uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300'
const BTN_MINI = 'inline-flex min-h-[44px] items-center rounded-lg border-2 border-slate-900 px-3 text-xs font-bold uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300'

function servicesOf(ref) {
  return (ref.referral_services || []).map(rs => rs.medical_services).filter(Boolean)
}

export default function MedicalReferralEntry() {
  const { user } = useAuth()
  const [hots, setHots] = useState([])
  const [services, setServices] = useState([])
  const [referralsByReg, setReferralsByReg] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const [createLog, setCreateLog] = useState(null)
  const [createServiceIds, setCreateServiceIds] = useState([])
  const [createNotes, setCreateNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editRef, setEditRef] = useState(null)
  const [editServiceIds, setEditServiceIds] = useState([])
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState(REFERRAL_STATUS.PENDING)
  const [savingEdit, setSavingEdit] = useState(false)
  const [cancelRef, setCancelRef] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  const [viewRef, setViewRef] = useState(null)

  async function loadReferrals() {
    try {
      const rows = await medicalService.listReferrals()
      const map = {}
      ;(rows || []).forEach(r => {
        const existing = map[r.registrant_id]
        if (!existing) map[r.registrant_id] = r
        else if (existing.status === REFERRAL_STATUS.CANCELLED && r.status !== REFERRAL_STATUS.CANCELLED) map[r.registrant_id] = r
        else if (existing.status !== REFERRAL_STATUS.CANCELLED && r.status !== REFERRAL_STATUS.CANCELLED && new Date(r.created_at) > new Date(existing.created_at)) map[r.registrant_id] = r
      })
      setReferralsByReg(map)
    } catch (err) {
      toast.error(`Could not load referrals: ${err.message}`)
    }
  }

  useEffect(() => {
    let alive = true
    async function loadData() {
      try {
        const [hotsRes, servicesRes] = await Promise.all([
          interviewService.listHots(),
          medicalService.listServices(),
        ])
        if (!alive) return
        if (hotsRes) {
          const latest = {}
          ;(hotsRes || []).forEach(l => { if (!latest[l.registrants.id]) latest[l.registrants.id] = l })
          setHots(Object.values(latest))
        }
        if (servicesRes) setServices(servicesRes)
        setLoading(false)
        await loadReferrals()
      } catch (err) {
        toast.error(`Could not load: ${err.message}`)
        if (alive) setLoading(false)
      }
    }
    loadData()
    return () => { alive = false }
  }, [])

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let list = hots.map(log => ({ log, referral: referralsByReg[log.registrants.id] || null }))
    if (q) {
      list = list.filter(({ log }) => {
        const r = log.registrants || {}
        const name = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ').toLowerCase()
        return name.includes(q) || (r.unique_id || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q)
      })
    }
    return list
  }, [hots, referralsByReg, searchQuery])

  function openCreate(log) {
    setCreateLog(log)
    setCreateServiceIds([])
    setCreateNotes('')
  }

  function toggleCreateService(serviceId) {
    setCreateServiceIds(prev => prev.includes(serviceId) ? prev.filter(s => s !== serviceId) : [...prev, serviceId])
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!createLog) return
    if (createServiceIds.length === 0) {
      toast.error('Select at least one medical service before saving the referral.')
      return
    }
    setSubmitting(true)

    try {
      // Dedupe: one active referral per HOTS applicant
      const existing = await medicalService.findActiveReferral(createLog.registrants.id)
      if (existing) {
        toast.error(`This applicant already has a referral (${existing.status}). No new referral was created.`)
        await loadReferrals()
        setSubmitting(false)
        return
      }
      const referral = await medicalService.createReferral({
        registrant_id: createLog.registrants.id,
        interview_log_id: createLog.id,
        event_id: createLog.event_id || null,
        referred_by: user?.id,
        status: REFERRAL_STATUS.PENDING,
        notes: createNotes || null,
      })
      await medicalService.setReferralServices(referral.id, createServiceIds)
      toast.success('Medical referral created with selected services!')
      setCreateLog(null)
      setCreateServiceIds([])
      setCreateNotes('')
    } catch (err) {
      toast.warning(`Referral created, but services could not be saved: ${err.message}`)
    } finally {
      setSubmitting(false)
      await loadReferrals()
    }
  }

  function openEdit(ref) {
    setEditRef(ref)
    setEditServiceIds(servicesOf(ref).map(s => s.id))
    setEditNotes(ref.notes || '')
    setEditStatus(ref.status === REFERRAL_STATUS.CANCELLED ? REFERRAL_STATUS.CANCELLED : REFERRAL_STATUS.PENDING)
  }

  function toggleEditService(serviceId) {
    setEditServiceIds(prev => prev.includes(serviceId) ? prev.filter(s => s !== serviceId) : [...prev, serviceId])
  }

  async function saveEdit() {
    if (!editRef) return
    if (editServiceIds.length === 0) {
      toast.error('Select at least one medical service.')
      return
    }
    setSavingEdit(true)

    try {
      await medicalService.updateReferral(editRef.id, {
        notes: editNotes || null,
        status: editStatus,
      })

      const currentIds = servicesOf(editRef).map(s => s.id)
      const toRemove = currentIds.filter(id => !editServiceIds.includes(id))
      const toAdd = editServiceIds.filter(id => !currentIds.includes(id))

      if (toRemove.length) await medicalService.removeReferralServices(editRef.id, toRemove)
      if (toAdd.length) await medicalService.setReferralServices(editRef.id, toAdd)
      toast.success('Referral updated!')
      setEditRef(null)
    } catch (err) {
      toast.warning(`Notes saved, but services could not be updated: ${err.message}`)
    } finally {
      setSavingEdit(false)
      await loadReferrals()
    }
  }

  async function confirmCancel() {
    if (!cancelRef) return
    setCancelling(true)
    try {
      await medicalService.updateReferral(cancelRef.id, { status: REFERRAL_STATUS.CANCELLED })
      toast.success('Referral cancelled.')
      setCancelRef(null)
    } catch (err) {
      toast.error(`Cancel failed: ${err.message}`)
    } finally {
      setCancelling(false)
      await loadReferrals()
    }
  }

  const inputCls = 'w-full min-h-[44px] rounded-lg border-2 border-slate-900 bg-white px-3 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300'

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700">Medical Services</p>
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Medical Referrals</h1>
        <p className="mt-1 text-sm text-slate-600">HOTS applicants and their referral status. Referrals are only created with services selected — one referral per applicant.</p>
      </div>

      <div className={`p-4 sm:p-6 ${PANEL}`}>
        <input
          type="text"
          placeholder="Search applicant by name, unique ID, or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search applicants"
          className={`${inputCls} max-w-2xl`}
        />
        <p aria-live="polite" className="mt-4 font-mono text-xs font-bold uppercase tracking-widest text-slate-500">
          HOTS applicants & referrals ({rows.length})
        </p>

        {loading ? (
          <div className="py-6 text-center" role="status">
            <div className="flex items-center justify-center gap-1.5" aria-hidden>
              {[0, 1, 2].map(i => (
                <span key={i} className="pixel-blink inline-block h-2 w-2 bg-amber-400" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <p className="mt-2 font-mono text-xs font-bold uppercase tracking-widest text-slate-400">Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">No HOTS Applicants Found</p>
            <p className="mt-1 text-sm text-slate-500">Record a HOTS interview first — referred applicants will appear here.</p>
          </div>
        ) : (
          <div className="mt-2 max-h-[560px] space-y-2 overflow-y-auto">
            {rows.map(({ log, referral }) => {
              const r = log.registrants || {}
              const srv = referral ? servicesOf(referral) : []
              return (
                <div key={log.id} className="rounded-xl border-2 border-slate-900 bg-white p-4 pixel-shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">
                        {[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')}
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">HOTS</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono font-semibold text-blue-700">{r.unique_id}</span>
                        {' · '}{log.position} — {log.company} · {log.events?.event_name || 'No event'}
                        {' · '}{format(new Date(log.interview_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    {referral ? (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${REFERRAL_STATUS_BADGE[referral.status] || 'bg-slate-100 text-slate-700'}`}>
                        {REFERRAL_STATUS_LABEL[referral.status] || referral.status}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Not referred</span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {srv.length === 0 ? (
                        <span className="text-xs text-slate-400">No services yet</span>
                      ) : srv.map(s => (
                        <span key={s.id} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SERVICE_BADGE[s.color] || SERVICE_BADGE.slate}`}>{s.name}</span>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      {!referral && (
                        <button onClick={() => openCreate(log)} className={`${BTN_MINI} bg-amber-400 text-slate-900`}>Create</button>
                      )}
                      {referral && referral.status !== REFERRAL_STATUS.COMPLETED && (
                        <>
                          <button onClick={() => openEdit(referral)} className={`${BTN_MINI} bg-white text-slate-700`}>Edit</button>
                          {referral.status !== REFERRAL_STATUS.CANCELLED && (
                            <button onClick={() => setCancelRef(referral)} className={`${BTN_MINI} bg-red-600 text-white`}>Cancel</button>
                          )}
                        </>
                      )}
                      {referral && referral.status === REFERRAL_STATUS.COMPLETED && (
                        <button onClick={() => setViewRef(referral)} className={`${BTN_MINI} bg-white text-slate-700`}>View</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {createLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setCreateLog(null)}>
          <div role="dialog" aria-modal="true" aria-label="Create medical referral" className={`${PANEL} max-h-[90dvh] w-full max-w-md overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-black uppercase tracking-wide text-slate-900">Create Referral</h3>
              <button onClick={() => setCreateLog(null)} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl leading-none text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">×</button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              {[createLog.registrants.first_name, createLog.registrants.middle_name, createLog.registrants.last_name].filter(Boolean).join(' ')}
              {' · '}<span className="font-mono font-semibold text-blue-700">{createLog.registrants.unique_id}</span>
              {' · '}{createLog.position} — {createLog.company}
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Medical services *</p>
                {services.length === 0 ? (
                  <p className="text-sm text-slate-400">No services available. Run the migration to seed the service list.</p>
                ) : (
                  <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                    {services.map(service => (
                      <label key={service.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm text-slate-700 hover:border-blue-300">
                        <input type="checkbox" checked={createServiceIds.includes(service.id)} onChange={() => toggleCreateService(service.id)} className="h-4 w-4 rounded" />
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SERVICE_BADGE[service.color] || SERVICE_BADGE.slate}`}>{service.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Notes
                <textarea className={`${inputCls} mt-1`} rows={3} value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} />
              </label>
              <button disabled={submitting} className={`${BTN} w-full bg-amber-400 text-slate-900 disabled:opacity-50`}>
                {submitting ? 'Saving...' : 'Create Referral'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setEditRef(null)}>
          <div role="dialog" aria-modal="true" aria-label="Edit referral" className={`${PANEL} max-h-[90dvh] w-full max-w-md overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-black uppercase tracking-wide text-slate-900">Edit Referral</h3>
              <button onClick={() => setEditRef(null)} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl leading-none text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">×</button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              {[editRef.registrants?.first_name, editRef.registrants?.middle_name, editRef.registrants?.last_name].filter(Boolean).join(' ')}
              {' · '}<span className="font-mono font-semibold text-blue-700">{editRef.registrants?.unique_id}</span>
              {' · '}{REFERRAL_STATUS_LABEL[editRef.status] || editRef.status}
            </p>
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Medical services *</p>
              {services.length === 0 ? (
                <p className="text-sm text-slate-400">No services available.</p>
              ) : (
                <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                  {services.map(service => (
                    <label key={service.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm text-slate-700 hover:border-blue-300">
                      <input type="checkbox" checked={editServiceIds.includes(service.id)} onChange={() => toggleEditService(service.id)} className="h-4 w-4 rounded" />
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SERVICE_BADGE[service.color] || SERVICE_BADGE.slate}`}>{service.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Notes
              <textarea className={`${inputCls} mt-1`} rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Availment status
              <select className={`${inputCls} mt-1`} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value={REFERRAL_STATUS.PENDING}>Pending</option>
                <option value={REFERRAL_STATUS.CANCELLED}>Cancelled</option>
              </select>
            </label>
            <p className="mt-2 text-[11px] text-slate-400">Staff can set Pending or Cancelled. Marking as Completed is available to Medical/Admin only.</p>
            <button onClick={saveEdit} disabled={savingEdit} className={`${BTN} mt-4 w-full bg-amber-400 text-slate-900 disabled:opacity-50`}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Cancel confirm modal */}
      {cancelRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setCancelRef(null)}>
          <div role="dialog" aria-modal="true" aria-label="Cancel referral" className={`${PANEL} w-full max-w-sm p-6`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black uppercase tracking-wide text-slate-900">Cancel Referral?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Cancel the referral for{' '}
              <strong>{[cancelRef.registrants?.first_name, cancelRef.registrants?.middle_name, cancelRef.registrants?.last_name].filter(Boolean).join(' ')}</strong>{' '}
              ({cancelRef.registrants?.unique_id})? You can re-open it later via Edit.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => setCancelRef(null)} className={`${BTN} bg-white px-2 text-slate-700`}>Keep</button>
              <button onClick={confirmCancel} disabled={cancelling} className={`${BTN} border-red-800 bg-red-600 px-2 text-white disabled:opacity-50`}>
                {cancelling ? 'Cancelling...' : 'Cancel Referral'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View modal (completed referrals) */}
      {viewRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setViewRef(null)}>
          <div role="dialog" aria-modal="true" aria-label="Referral details" className={`${PANEL} w-full max-w-md p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-black uppercase tracking-wide text-slate-900">Referral Details</h3>
              <button onClick={() => setViewRef(null)} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl leading-none text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">×</button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Services</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {servicesOf(viewRef).length === 0 ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : servicesOf(viewRef).map(s => (
                    <span key={s.id} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SERVICE_BADGE[s.color] || SERVICE_BADGE.slate}`}>{s.name}</span>
                  ))}
                </dd>
              </div>
              <Detail label="Client" value={[viewRef.registrants?.first_name, viewRef.registrants?.middle_name, viewRef.registrants?.last_name].filter(Boolean).join(' ')} />
              <Detail label="Unique ID" value={viewRef.registrants?.unique_id} />
              <Detail label="Event" value={viewRef.events?.event_name || '—'} />
              <Detail label="Status" value={REFERRAL_STATUS_LABEL[viewRef.status] || viewRef.status} />
              <Detail label="Created" value={viewRef.created_at ? format(new Date(viewRef.created_at), 'MMM d, yyyy h:mm a') : '—'} />
              <Detail label="Notes" value={viewRef.notes || '—'} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  )
}