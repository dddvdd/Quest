import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { eventService } from '../../services/eventService'
import { eventVacancyService } from '../../services/eventVacancyService'
import { format } from 'date-fns'
import {
  EVENT_TYPE_OPTIONS,
  RECRUITMENT_TYPE_OPTIONS,
  eventTypeDisplay,
  eventTypeBadgeClass,
} from '../../domain/eventTypes'

// Cagayan (Region II) — 1 city + 28 municipalities
const CAGAYAN_MUNICIPALITIES = [
  'Tuguegarao City',
  'Abulug',
  'Alcala',
  'Allacapan',
  'Amulung',
  'Aparri',
  'Baggao',
  'Ballesteros',
  'Buguey',
  'Calayan',
  'Camalaniugan',
  'Claveria',
  'Enrile',
  'Gattaran',
  'Gonzaga',
  'Iguig',
  'Lal-lo',
  'Lasam',
  'Pamplona',
  'Peñablanca',
  'Piat',
  'Rizal',
  'Sanchez-Mira',
  'Santa Ana',
  'Santa Praxedes',
  'Santa Teresita',
  'Santo Niño',
  'Solana',
  'Tuao',
].sort()

const STATUS_OPTIONS = ['upcoming', 'ongoing', 'completed', 'cancelled']
const STATUS_LABELS = { upcoming: 'Upcoming', ongoing: 'Ongoing', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLORS = {
  upcoming: 'bg-blue-100 text-blue-800',
  ongoing: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-slate-200 text-slate-800',
  cancelled: 'bg-red-100 text-red-800',
}

const emptyForm = { event_name: '', event_date: '', time_from: '09:00', time_to: '16:00', venue: '', location: 'Tuguegarao City', description: '', status: 'upcoming', event_type: 'job_fair', recruitment_type: '' }

function formatTime(t) {
  if (!t) return null
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  if (isNaN(h)) return null
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

// Convert "HH:MM" (or "HH:MM:SS") to minutes past midnight; null if unset/invalid.
function parseMinutes(t) {
  if (!t) return null
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

// Auto-status with a SENSE OF TIME:
//   - date in the future            -> upcoming
//   - date in the past              -> completed
//   - today, before time_from       -> upcoming  (not started yet)
//   - today, between from and to    -> ongoing
//   - today, after time_to          -> completed (already ended)
//   - no times set on today         -> ongoing
// Handling: windows that cross midnight (time_from > time_to) wrap around.
// A manually 'cancelled' event is never overridden.
function computeAutoStatus(event) {
  if (event.status === 'cancelled') return event.status
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const eventDate = format(new Date(event.event_date), 'yyyy-MM-dd')

  if (eventDate < today) return 'completed'
  if (eventDate > today) return 'upcoming'

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const from = parseMinutes(event.time_from)
  const to = parseMinutes(event.time_to)

  if (from != null && to != null) {
    if (from <= to) {
      if (nowMinutes < from) return 'upcoming'
      if (nowMinutes >= to) return 'completed'
      return 'ongoing'
    }
    // crosses midnight (e.g. 21:00 – 02:00)
    if (nowMinutes >= from || nowMinutes < to) return 'ongoing'
    return 'upcoming'
  }
  if (from != null) return nowMinutes >= from ? 'ongoing' : 'upcoming'
  if (to != null) return nowMinutes >= to ? 'completed' : 'ongoing'
  return 'ongoing'
}

export default function EventsManagement() {
  const [events, setEvents] = useState([])
  const [registrantCounts, setRegistrantCounts] = useState({})
  const [vacancyCounts, setVacancyCounts] = useState({})
  const [loading, setLoading] = useState(true)

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [viewEvent, setViewEvent] = useState(null)
  const [editEvent, setEditEvent] = useState(null)
  const [deleteEvent, setDeleteEvent] = useState(null)

  // Forms
  const [createForm, setCreateForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)
  const [editForm, setEditForm] = useState(emptyForm)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadData()
    // Re-evaluate statuses as time passes (e.g. upcoming -> ongoing -> completed)
    const interval = setInterval(() => { syncStatuses() }, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [rawEvents, regData, vacData] = await Promise.all([
        eventService.listAllAdmin(),
        eventService.countRegistrantsByEvent(),
        eventVacancyService.countVacanciesByEvent(),
      ])

      // Auto-update status by date (keeps 'cancelled' as-is), persist changes.
      const toPersist = []
      const updatedEvents = rawEvents.map(ev => {
        const autoStatus = computeAutoStatus(ev)
        if (autoStatus !== ev.status) {
          toPersist.push(eventService.update(ev.id, { status: autoStatus }))
          return { ...ev, status: autoStatus }
        }
        return ev
      })
      if (toPersist.length) await Promise.all(toPersist)

      const regCounts = {}
      ;(regData.data || []).forEach(r => { regCounts[r.event_id] = (regCounts[r.event_id] || 0) + 1 })
      const vacCounts = {}
      ;(vacData.data || []).forEach(v => { vacCounts[v.event_id] = (vacCounts[v.event_id] || 0) + 1 })

      setEvents(updatedEvents)
      setRegistrantCounts(regCounts)
      setVacancyCounts(vacCounts)
    } catch (err) {
      toast.error(`Failed to load events: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function syncStatuses() {
    try {
      const data = await eventService.listStatsForAdmin()
      if (!data) return

      const toPersist = []
      const changes = new Map()
      data.forEach(ev => {
        const autoStatus = computeAutoStatus(ev)
        if (autoStatus !== ev.status) {
          changes.set(ev.id, autoStatus)
          toPersist.push(eventService.update(ev.id, { status: autoStatus }))
        }
      })
      if (toPersist.length) {
        await Promise.all(toPersist)
        setEvents(prev => prev.map(ev => changes.has(ev.id) ? { ...ev, status: changes.get(ev.id) } : ev))
      }
    } catch (err) {
      console.error('Status sync failed:', err)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    try {
      await eventService.insert({
        event_name: createForm.event_name,
        event_date: createForm.event_date,
        time_from: createForm.time_from || null,
        time_to: createForm.time_to || null,
        venue: createForm.venue.trim() || null,
        location: createForm.location,
        description: createForm.description || null,
        status: createForm.status,
        event_type: createForm.event_type,
        recruitment_type: createForm.event_type === 'recruitment_activity' ? createForm.recruitment_type || null : null,
      })
      toast.success('Event created!')
      setCreateOpen(false)
      setCreateForm(emptyForm)
      await loadData()
    } catch (err) {
      toast.error(`Create failed: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  function openEdit(event) {
    setEditEvent(event)
    setEditForm({
      event_name: event.event_name,
      event_date: event.event_date,
      time_from: event.time_from ? event.time_from.slice(0, 5) : '09:00',
      time_to: event.time_to ? event.time_to.slice(0, 5) : '16:00',
      venue: event.venue || '',
      location: event.location,
      description: event.description || '',
      status: event.status,
      event_type: event.event_type || 'job_fair',
      recruitment_type: event.recruitment_type || '',
    })
  }

  async function saveEdit() {
    setSavingEdit(true)
    try {
      await eventService.update(editEvent.id, {
        event_name: editForm.event_name,
        event_date: editForm.event_date,
        time_from: editForm.time_from || null,
        time_to: editForm.time_to || null,
        venue: editForm.venue.trim() || null,
        location: editForm.location,
        description: editForm.description || null,
        status: editForm.status,
        event_type: editForm.event_type,
        recruitment_type: editForm.event_type === 'recruitment_activity' ? editForm.recruitment_type || null : null,
      })
      toast.success('Event updated!')
      setEditEvent(null)
      await loadData()
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setSavingEdit(false)
    }
  }

  async function changeStatus(event, status) {
    try {
      await eventService.update(event.id, { status })
      toast.success(`Event marked ${STATUS_LABELS[status]}`)
      await loadData()
    } catch (err) {
      toast.error(`Status update failed: ${err.message}`)
    }
  }

  async function confirmDelete() {
    if (!deleteEvent) return
    setDeleting(true)
    try {
      await eventService.remove(deleteEvent.id)
      toast.success('Event deleted.')
      setDeleteEvent(null)
      await loadData()
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  // Cagayan-only municipality/city dropdown. Keeps the current value visible as
  // an extra option if it is a legacy location outside Cagayan.
  function LocationSelect({ value, onChange, className }) {
    const options = [...new Set([...CAGAYAN_MUNICIPALITIES, value])].sort()
    return (
      <select required className={className} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    )
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="grid min-h-[300px] place-items-center text-slate-500">Loading events...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Event Management</h1>
          <p className="text-sm text-slate-600">{events.length} event(s)</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
          + Create Event
        </button>
      </div>

      {/* Events grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map(event => (
          <div key={event.id} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">{event.event_name}</h3>
              <select
                value={event.status}
                onChange={(e) => changeStatus(event, e.target.value)}
                className={`rounded-full px-2 py-1 text-xs font-bold focus:outline-none ${STATUS_COLORS[event.status] || 'bg-slate-100 text-slate-700'}`}
                title="Change status"
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>

            <div className="mt-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${eventTypeBadgeClass(event.event_type)}`}>
                {eventTypeDisplay(event)}
              </span>
            </div>

            <div className="mt-2 space-y-1 text-sm text-slate-600">
              <p>📅 {format(new Date(event.event_date), 'MMMM d, yyyy')}</p>
              {(event.time_from || event.time_to) && (
                <p>🕘 {formatTime(event.time_from) || '—'} – {formatTime(event.time_to) || '—'}</p>
              )}
              <p>📍 {event.location}</p>
              {event.venue && <p className="text-xs font-medium text-slate-700">🏢 Venue: {event.venue}</p>}
              {event.description && <p className="text-xs text-slate-500 line-clamp-2">{event.description}</p>}
            </div>

            <div className="mt-4 flex gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                👤 {registrantCounts[event.id] || 0} registrants
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                💼 {vacancyCounts[event.id] || 0} vacancies
              </span>
            </div>

            <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
              <button onClick={() => setViewEvent(event)} className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">View</button>
              <button onClick={() => openEdit(event)} className="flex-1 rounded-lg bg-blue-700 py-2 text-xs font-semibold text-white hover:bg-blue-800">Edit</button>
              <button onClick={() => setDeleteEvent(event)} className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {events.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">No events yet. Create one to get started.</p>
      )}

      {/* Create Event Modal */}
      {createOpen && (
        <Modal onClose={() => setCreateOpen(false)} title="Create Event">
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Event name *"><input required className={inputCls} value={createForm.event_name} onChange={(e) => setCreateForm({ ...createForm, event_name: e.target.value })} /></Field>
            <Field label="Event Type">
              <select className={inputCls} value={createForm.event_type} onChange={(e) => setCreateForm({ ...createForm, event_type: e.target.value, recruitment_type: e.target.value === 'recruitment_activity' ? createForm.recruitment_type : '' })}>
                {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            {createForm.event_type === 'recruitment_activity' && (
              <Field label="Recruitment Activity Type">
                <select required className={inputCls} value={createForm.recruitment_type} onChange={(e) => setCreateForm({ ...createForm, recruitment_type: e.target.value })}>
                  <option value="">Select...</option>
                  {RECRUITMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date *"><input required type="date" className={inputCls} value={createForm.event_date} onChange={(e) => setCreateForm({ ...createForm, event_date: e.target.value })} /></Field>
              <Field label="Status">
                <select className={inputCls} value={createForm.status} onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </Field>
              <Field label="Time from">
                <input type="time" className={inputCls} value={createForm.time_from} onChange={(e) => setCreateForm({ ...createForm, time_from: e.target.value })} />
              </Field>
              <Field label="Time to">
                <input type="time" className={inputCls} value={createForm.time_to} onChange={(e) => setCreateForm({ ...createForm, time_to: e.target.value })} />
              </Field>
            </div>
            <Field label="Venue">
              <input className={inputCls} placeholder="e.g. Cagayan Sports Complex" value={createForm.venue} onChange={(e) => setCreateForm({ ...createForm, venue: e.target.value })} />
            </Field>
            <Field label="Municipality / City (Cagayan) *">
              <LocationSelect className={inputCls} value={createForm.location} onChange={(v) => setCreateForm({ ...createForm, location: v })} />
            </Field>
            <Field label="Description">
              <textarea className={inputCls} rows={3} value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} />
            </Field>
            <button disabled={creating} className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Event'}
            </button>
          </form>
        </Modal>
      )}

      {/* View Event Modal */}
      {viewEvent && (
        <Modal onClose={() => setViewEvent(null)} title="Event Details">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">{viewEvent.event_name}</h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_COLORS[viewEvent.status]}`}>{STATUS_LABELS[viewEvent.status]}</span>
            </div>
            <Detail label="Date" value={format(new Date(viewEvent.event_date), 'MMMM d, yyyy')} />
            <Detail label="Event Type" value={eventTypeDisplay(viewEvent)} />
            <Detail label="Time" value={formatTime(viewEvent.time_from) && formatTime(viewEvent.time_to) ? `${formatTime(viewEvent.time_from)} – ${formatTime(viewEvent.time_to)}` : (formatTime(viewEvent.time_from) || formatTime(viewEvent.time_to) || '—')} />
            <Detail label="Venue" value={viewEvent.venue || '—'} />
            <Detail label="Municipality / City" value={viewEvent.location} />
            <Detail label="Description" value={viewEvent.description || '—'} />
            <Detail label="Registrants" value={registrantCounts[viewEvent.id] || 0} />
            <Detail label="Vacancies" value={vacancyCounts[viewEvent.id] || 0} />
            <Detail label="Created" value={format(new Date(viewEvent.created_at), 'MMM d, yyyy h:mm a')} />
          </div>
        </Modal>
      )}

      {/* Edit Event Modal */}
      {editEvent && (
        <Modal onClose={() => setEditEvent(null)} title="Edit Event">
          <div className="space-y-4">
            <Field label="Event name *"><input className={inputCls} value={editForm.event_name} onChange={(e) => setEditForm({ ...editForm, event_name: e.target.value })} /></Field>
            <Field label="Event Type">
              <select className={inputCls} value={editForm.event_type} onChange={(e) => setEditForm({ ...editForm, event_type: e.target.value, recruitment_type: e.target.value === 'recruitment_activity' ? editForm.recruitment_type : '' })}>
                {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            {editForm.event_type === 'recruitment_activity' && (
              <Field label="Recruitment Activity Type">
                <select required className={inputCls} value={editForm.recruitment_type} onChange={(e) => setEditForm({ ...editForm, recruitment_type: e.target.value })}>
                  <option value="">Select...</option>
                  {RECRUITMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date *"><input type="date" className={inputCls} value={editForm.event_date} onChange={(e) => setEditForm({ ...editForm, event_date: e.target.value })} /></Field>
              <Field label="Status">
                <select className={inputCls} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </Field>
              <Field label="Time from">
                <input type="time" className={inputCls} value={editForm.time_from} onChange={(e) => setEditForm({ ...editForm, time_from: e.target.value })} />
              </Field>
              <Field label="Time to">
                <input type="time" className={inputCls} value={editForm.time_to} onChange={(e) => setEditForm({ ...editForm, time_to: e.target.value })} />
              </Field>
            </div>
            <Field label="Venue">
              <input className={inputCls} placeholder="e.g. Cagayan Sports Complex" value={editForm.venue} onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })} />
            </Field>
            <Field label="Municipality / City (Cagayan) *">
              <LocationSelect className={inputCls} value={editForm.location} onChange={(v) => setEditForm({ ...editForm, location: v })} />
            </Field>
            <Field label="Description">
              <textarea className={inputCls} rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </Field>
            <button onClick={saveEdit} disabled={savingEdit} className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Event Modal */}
      {deleteEvent && (
        <Modal onClose={() => setDeleteEvent(null)} title="Confirm Delete">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <strong>{deleteEvent.event_name}</strong>? This will also delete its vacancies. This action cannot be undone.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteEvent(null)} className="rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={confirmDelete} disabled={deleting} className="rounded-lg bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-600">×</button>
        </div>
        {children}
      </div>
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

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  )
}