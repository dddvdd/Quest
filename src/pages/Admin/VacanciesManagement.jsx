import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { vacancyService } from '../../services/vacancyService'
import { eventVacancyService } from '../../services/eventVacancyService'
import { eventService } from '../../services/eventService'
import { employerService } from '../../services/employerService'
import { employerApplicantsService } from '../../services/employerApplicantsService'
import { format } from 'date-fns'
import { eventTypeDisplay } from '../../domain/eventTypes'

const emptyDefForm = {
  employer_id: '',
  company_name: '',
  position: '',
  salary_range: '',
  place_of_assignment: '',
  qualifications: '',
  principal_name: '',
  available_slots: '',
  is_active: true,
}

const emptyOfferingForm = {
  event_id: '',
  slots_offered: 1,
  notes: '',
}

// A single master definition can be offered at many events.
// Cards show each event offering with a fill-rate bar.

export default function VacanciesManagement() {
  const [definitions, setDefinitions] = useState([])
  const [events, setEvents] = useState([])
  const [employers, setEmployers] = useState([])
  const [filledCounts, setFilledCounts] = useState({})
  const [filterEvent, setFilterEvent] = useState('all')
  const [loading, setLoading] = useState(true)

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [editDef, setEditDef] = useState(null)
  const [history, setHistory] = useState([])
  const [deleteDef, setDeleteDef] = useState(null)
  const [addToEventDef, setAddToEventDef] = useState(null)
  const [editOffering, setEditOffering] = useState(null)
  const [deleteOffering, setDeleteOffering] = useState(null)
  const [applicantsModal, setApplicantsModal] = useState(null)

  // Forms
  const [defForm, setDefForm] = useState(emptyDefForm)
  const [offeringForm, setOfferingForm] = useState(emptyOfferingForm)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Bulk import
  const [importing, setImporting] = useState(false)
  const [importReport, setImportReport] = useState(null)
  const fileInputRef = useRef(null)

  const TEMPLATE_HEADERS = ['Company Name', 'Position', 'Slots', 'Salary Range', 'Place of Assignment', 'Qualifications', 'Active', 'Event', 'Principal']

  useEffect(() => {
    loadData()
  }, [])

async function loadData() {
    try {
      const [defData, evData, linkData, empData] = await Promise.all([
        eventVacancyService.listAllAdmin(),
        eventService.listForVacancyFilter(),
        eventVacancyService.listSlotCounts(),
        employerService.listByCompany(),
      ])

      // Compute actual filled counts (source of truth) and persist to slots_filled
      const counts = {}
      ;(linkData || []).forEach(l => { counts[l.event_vacancy_id] = (counts[l.event_vacancy_id] || 0) + 1 })

      const persist = []
      ;(defData || []).forEach(def => {
        ;(def.event_vacancies || []).forEach(ev => {
          if ((counts[ev.id] || 0) !== (ev.slots_filled || 0)) {
            persist.push(eventVacancyService.updateFilledCount(ev.id, counts[ev.id] || 0))
          }
        })
      })
      if (persist.length) await Promise.all(persist)

      setDefinitions(defData || [])
      setEvents(evData || [])
      setEmployers(empData || [])
      setFilledCounts(counts)
    } catch (err) {
      toast.error(`Failed to load vacancies: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (filterEvent === 'all') return definitions
    return definitions.filter(def => (def.event_vacancies || []).some(ev => ev.event_id === filterEvent))
  }, [definitions, filterEvent])

  // ---------- Definitions ----------
async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    try {
      await vacancyService.insert({
        employer_id: defForm.employer_id || null,
        company_name: defForm.company_name,
        position: defForm.position,
        salary_range: defForm.salary_range || null,
        place_of_assignment: defForm.place_of_assignment || null,
        qualifications: defForm.qualifications || null,
        principal_name: defForm.principal_name || null,
        available_slots: defForm.available_slots ? Number(defForm.available_slots) : null,
        created_source: 'admin',
        is_active: defForm.is_active,
      })
      toast.success('Vacancy definition created!')
      setCreateOpen(false)
      setDefForm(emptyDefForm)
      await loadData()
    } catch (err) {
      toast.error(`Create failed: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  function openEditDef(def) {
    setEditDef(def)
    setDefForm({
      employer_id: def.employer_id || '',
      company_name: def.company_name,
      position: def.position,
      salary_range: def.salary_range || '',
      place_of_assignment: def.place_of_assignment || '',
      qualifications: def.qualifications || '',
      principal_name: def.principal_name || '',
      available_slots: def.available_slots ?? '',
      is_active: def.is_active,
    })
    loadHistory(def.id)
  }

async function loadHistory(id) {
    try {
      const rows = await vacancyService.listHistory(id)
      setHistory(rows || [])
    } catch (err) {
      toast.error(`Could not load history: ${err.message}`)
    }
  }

  async function saveDefinition() {
    setSaving(true)
    try {
      await vacancyService.update(editDef.id, {
        employer_id: defForm.employer_id || null,
        company_name: defForm.company_name,
        position: defForm.position,
        salary_range: defForm.salary_range || null,
        place_of_assignment: defForm.place_of_assignment || null,
        qualifications: defForm.qualifications || null,
        principal_name: defForm.principal_name || null,
        available_slots: defForm.available_slots ? Number(defForm.available_slots) : null,
        created_source: 'admin',
        is_active: defForm.is_active,
      })
      toast.success('Definition updated!')
      setEditDef(null)
      await loadData()
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeleteDefinition() {
    if (!deleteDef) return
    setDeleting(true)
    try {
      await vacancyService.remove(deleteDef.id)
      toast.success('Definition deleted (and its event offerings).')
      setDeleteDef(null)
      await loadData()
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  // ---------- Event offerings ----------
  function openAddToEvent(def) {
    setAddToEventDef(def)
    setOfferingForm({ ...emptyOfferingForm, event_id: events[0]?.id || '' })
  }

  async function handleAddOffering() {
    if (!addToEventDef || !offeringForm.event_id) return
    setSaving(true)
try {
      await eventVacancyService.upsertOffering({
        vacancyDefinitionId: addToEventDef.id,
        eventId: offeringForm.event_id,
        slotsOffered: offeringForm.slots_offered,
        notes: offeringForm.notes || null,
      })
      toast.success('Offering added to event!')
      setAddToEventDef(null)
      await loadData()
    } catch (err) {
      toast.error(`Add to event failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  function openEditOffering(ev, def) {
    setEditOffering({ offering: ev, definition: def })
    setOfferingForm({
      event_id: ev.event_id,
      slots_offered: ev.slots_offered,
      notes: ev.notes || '',
    })
  }

  async function saveOffering() {
    if (!editOffering) return
    setSaving(true)
    try {
      await eventVacancyService.updateOffering(editOffering.offering.id, {
        eventId: offeringForm.event_id,
        slotsOffered: offeringForm.slots_offered,
        notes: offeringForm.notes || null,
      })
      toast.success('Offering updated!')
      setEditOffering(null)
      await loadData()
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeleteOffering() {
    if (!deleteOffering) return
    setDeleting(true)
    try {
      await eventVacancyService.removeOffering(deleteOffering.id)
      toast.success('Offering removed.')
      setDeleteOffering(null)
      await loadData()
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  // ---------- Applicants per offering ----------
  async function loadApplicants(offering) {
    try {
      const data = await employerApplicantsService.listForOffering(offering.id)
      setApplicantsModal({ offering, applicants: (data || []).map(d => ({
        id: d.registrant_id || d.id,
        first_name: d.first_name, middle_name: d.middle_name, last_name: d.last_name,
        email: d.email, contact_no: d.contact_no, unique_id: d.unique_id,
      })) })
    } catch (err) {
      toast.error(`Failed to load applicants: ${err.message}`)
    }
  }

  // ---------- Bulk CSV ----------
  function handleDownloadTemplate() {
    const exampleRows = [
      ['Jollibee Foods Corporation', 'Service Crew', '15', 'Php 12,000 - 15,000', 'Tuguegarao City', 'At least SHS graduate', 'yes', 'Trabaho Caravan 2026 - Tuguegarao', ''],
      ['Jollibee Foods Corporation', 'Service Crew', '10', 'Php 12,000 - 15,000', 'Tuguegarao City', 'At least SHS graduate', 'yes', 'Trabaho Caravan 2026 - Aparri', ''],
      ['SM Retail Inc.', 'Sales Associate', '10', 'Php 13,000 - 16,000', 'SM City Tuguegarao', 'College level, good communication skills', 'yes', '', ''],
    ]
    const csv = Papa.unparse([TEMPLATE_HEADERS, ...exampleRows])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'vacancy-template.csv'
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Template downloaded. Leave the Event column blank to only create the definition; fill it to also offer it at that event.')
  }

  function getField(row, aliases) {
    for (const key of Object.keys(row)) {
      const norm = key.trim().toLowerCase()
      if (aliases.includes(norm)) return (row[key] ?? '').toString().trim()
    }
    return ''
  }

  function parseActive(v) {
    const s = String(v || '').trim().toLowerCase()
    if (['no', 'n', 'false', '0', 'inactive'].includes(s)) return false
    return true
  }

  async function processImportFile(file) {
    if (!file) return
    setImporting(true)
    setImportReport(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: async (result) => {
        const rows = result.data || []
        const errors = []
        let insertedDefs = 0
        let insertedOffers = 0

        if (!rows.length) {
          setImporting(false)
          setImportReport({ inserted: 0, insertedOffers: 0, errors: ['The CSV file is empty.'] })
          return
        }

        const companyAliases = ['company', 'company name', 'company_name', 'employer']
        const positionAliases = ['position', 'job title', 'position title', 'job position']
        const slotsAliases = ['slots', 'no. of slots', 'vacancies', 'vacancies count', 'vacancies_count', 'count', 'vacancy count', 'number of slots']
        const salaryAliases = ['salary', 'salary range', 'salary_range']
        const placeAliases = ['place', 'place of assignment', 'place_of_assignment', 'location', 'work location']
        const qualificationsAliases = ['qualifications', 'qualification', 'requirements']
        const activeAliases = ['active', 'is active', 'is_active', 'status', 'enabled']
        const eventAliases = ['event', 'event name', 'event_name', 'job fair', 'jobfair']
        const principalAliases = ['principal', 'principal_name', 'hiring company']

        const eventByName = {}
        events.forEach(ev => { eventByName[ev.event_name.trim().toLowerCase()] = ev })

try {
          // Map existing definitions by company+position key
          const existing = await vacancyService.findExistingMatchBulk()
          if (!Array.isArray(existing)) throw new Error('Could not load existing definitions')
          const defByKey = {}
          ;(existing || []).forEach(d => { defByKey[`${d.company_name.toLowerCase()}|${d.position.toLowerCase()}`] = d })

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            const rowNum = i + 2
            const company = getField(row, companyAliases)
            const position = getField(row, positionAliases)

            if (!company || !position) {
              errors.push(`Row ${rowNum}: Company and Position are required.`)
              continue
            }

            const key = `${company.toLowerCase()}|${position.toLowerCase()}`
            let defId = defByKey[key]?.id

            if (!defId) {
              try {
                const created = await vacancyService.insert({
                  company_name: company,
                  position,
                  salary_range: getField(row, salaryAliases) || null,
                  place_of_assignment: getField(row, placeAliases) || null,
                  qualifications: getField(row, qualificationsAliases) || null,
                  principal_name: getField(row, principalAliases) || null,
                  is_active: parseActive(getField(row, activeAliases)),
                })
                defId = created.id
                insertedDefs++
                defByKey[key] = { id: defId }
              } catch (err) {
                errors.push(`Row ${rowNum}: ${err.message}`)
                continue
              }
            }

            // Optional event offering
            const eventName = getField(row, eventAliases)
            if (eventName) {
              const event = eventByName[eventName.toLowerCase()]
              if (!event) {
                errors.push(`Row ${rowNum}: Event "${eventName}" not found.`)
                continue
              }
              const slots = parseInt(getField(row, slotsAliases), 10)
              if (isNaN(slots) || slots < 1) {
                errors.push(`Row ${rowNum}: Slots must be a positive number (got "${getField(row, slotsAliases) || 'blank'}").`)
                continue
              }
              try {
                await eventVacancyService.upsertOffering({
                  vacancyDefinitionId: defId,
                  eventId: event.id,
                  slotsOffered: slots,
                  notes: null,
                })
                insertedOffers++
              } catch (err) {
                errors.push(`Row ${rowNum}: ${err.message}`)
              }
            }
          }
        } catch (err) {
          errors.push(`Import error: ${err.message}`)
        }

        setImporting(false)
        setImportReport({ inserted: insertedDefs, insertedOffers, errors })
        if (insertedDefs || insertedOffers) toast.success(`Imported ${insertedDefs} definition(s), ${insertedOffers} event offering(s).`)
        loadData()
      },
      error: (err) => {
        setImporting(false)
        setImportReport({ inserted: 0, insertedOffers: 0, errors: [`Could not read CSV: ${err.message}`] })
      },
    })
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="grid min-h-[300px] place-items-center text-slate-500">Loading vacancies...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vacancy Management</h1>
          <p className="text-sm text-slate-600">{filtered.length} definition(s) · one definition can appear at many events</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleDownloadTemplate} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">⬇ Download Template</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {importing ? 'Importing...' : '⬆ Import CSV'}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processImportFile(f); e.target.value = '' }} />
          <button onClick={() => { setDefForm(emptyDefForm); setCreateOpen(true) }} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">+ Create Definition</button>
        </div>
      </div>

      {/* Filter by event */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Filter by event</label>
        <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} className={`${inputCls} max-w-md`}>
          <option value="all">All Events</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name}{ev.event_date ? ` (${format(new Date(ev.event_date), 'MMM d, yyyy')})` : ''} — {eventTypeDisplay(ev)}</option>)}
        </select>
      </div>

      {/* Definitions grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map(def => (
          <div key={def.id} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900 truncate">{def.position}</h3>
                {def.principal_name && <p className="text-sm font-medium text-purple-700">{def.principal_name}</p>}
                <p className="text-sm font-medium text-blue-700">{def.company_name}</p>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${def.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                {def.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="mt-2 space-y-1 text-xs text-slate-600">
              {def.salary_range && <p>💰 {def.salary_range}</p>}
              {def.place_of_assignment && <p>📍 {def.place_of_assignment}</p>}
              {def.qualifications && <p className="text-slate-500 line-clamp-2">🎓 {def.qualifications}</p>}
            </div>

            {/* Event offerings with fill rates */}
            {def.event_vacancies?.length > 0 ? (
              <div className="mt-4 space-y-2">
                {def.event_vacancies.map(ev => {
                  const filled = filledCounts[ev.id] || 0
                  const pct = ev.slots_offered > 0 ? Math.min(100, Math.round((filled / ev.slots_offered) * 100)) : 0
                  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-500'
                  return (
                    <div key={ev.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => loadApplicants(ev)} className="text-left text-xs font-semibold text-slate-700 hover:text-blue-700 hover:underline" title="View applicants">
                          📅 {ev.events?.event_name || 'Event'}
                        </button>
                        <span className="text-xs font-bold text-slate-700">{filled}/{ev.slots_offered}</span>
                      </div>
                      {ev.events?.event_date && <p className="mt-0.5 text-[10px] text-slate-400">{format(new Date(ev.events.event_date), 'MMM d, yyyy')}</p>}
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-2 flex justify-between text-[10px]">
                        <span className="text-slate-400">{ev.slots_filled || 0} filled · {pct}%</span>
                        <div className="flex gap-1.5">
                          <button onClick={() => openEditOffering(ev, def)} className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 hover:bg-blue-100">Edit</button>
                          <button onClick={() => setDeleteOffering(ev)} className="rounded bg-red-50 px-2 py-0.5 font-semibold text-red-700 hover:bg-red-100">Remove</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">Not offered at any event yet</p>
            )}

            <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
              <button onClick={() => openAddToEvent(def)} className="flex-1 rounded-lg bg-blue-700 py-2 text-xs font-semibold text-white hover:bg-blue-800">+ Add to Event</button>
              <button onClick={() => openEditDef(def)} className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
              <button onClick={() => setDeleteDef(def)} className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No vacancy definitions found for this filter.</p>}

      {/* Create / Edit Definition Modal */}
      {(createOpen || editDef) && (
        <Modal onClose={() => { setCreateOpen(false); setEditDef(null) }} title={editDef ? 'Edit Definition' : 'Create Definition'}>
          <form onSubmit={editDef ? (e) => { e.preventDefault(); saveDefinition() } : handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Employer *</label>
                <select required className={inputCls} value={defForm.employer_id} onChange={(e) => {
                  const emp = employers.find(em => em.id === e.target.value)
                  setDefForm({ ...defForm, employer_id: e.target.value, company_name: emp?.company_name || '' })
                }}>
                  <option value="">Select employer</option>
                  {employers.map(em => <option key={em.id} value={em.id}>{em.company_name} ({em.employer_type === 'local_agency' ? 'Agency' : 'Direct'})</option>)}
                </select>
              </div>
              <Field label="Position *"><input required className={inputCls} value={defForm.position} onChange={(e) => setDefForm({ ...defForm, position: e.target.value })} /></Field>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Principal (for agencies)</label>
              <input className={inputCls} value={defForm.principal_name} onChange={(e) => setDefForm({ ...defForm, principal_name: e.target.value })} placeholder="Company the agency is hiring for (leave empty if direct)" />
            </div>
            <Field label="Salary range"><input className={inputCls} value={defForm.salary_range} onChange={(e) => setDefForm({ ...defForm, salary_range: e.target.value })} /></Field>
            <Field label="Available slots"><input type="number" min="0" className={inputCls} value={defForm.available_slots} onChange={(e) => setDefForm({ ...defForm, available_slots: e.target.value })} placeholder="Current openings" /></Field>
            <Field label="Place of assignment"><input className={inputCls} value={defForm.place_of_assignment} onChange={(e) => setDefForm({ ...defForm, place_of_assignment: e.target.value })} /></Field>
            <Field label="Qualifications"><textarea className={inputCls} rows={2} value={defForm.qualifications} onChange={(e) => setDefForm({ ...defForm, qualifications: e.target.value })} /></Field>
            {editDef && history.length > 0 && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Change History</p>
                <ul className="mt-1.5 space-y-1 text-[11px] text-slate-600">
                  {history.map(h => (
                    <li key={h.id}>
                      {format(new Date(h.created_at), 'MMM d, yyyy')} — {h.snapshot.available_slots ?? '—'} openings · {h.snapshot.salary_range || 'no salary'} · updated by {h.profiles?.full_name || 'PESO'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={defForm.is_active} onChange={(e) => setDefForm({ ...defForm, is_active: e.target.checked })} className="h-4 w-4 rounded" />
              Active
            </label>
            <button disabled={creating || saving} className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {creating || saving ? 'Saving...' : 'Save'}
            </button>
          </form>
        </Modal>
      )}

      {/* Add to Event Modal */}
      {addToEventDef && (
        <Modal onClose={() => setAddToEventDef(null)} title={`Offer "${addToEventDef.position}" at an event`}>
          <div className="space-y-4">
            <Field label="Event *">
              <select className={inputCls} value={offeringForm.event_id} onChange={(e) => setOfferingForm({ ...offeringForm, event_id: e.target.value })}>
                <option value="">Select event</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name} — {eventTypeDisplay(ev)}</option>)}
              </select>
            </Field>
            <Field label="Slots offered *"><input type="number" min="1" className={inputCls} value={offeringForm.slots_offered} onChange={(e) => setOfferingForm({ ...offeringForm, slots_offered: e.target.value })} /></Field>
            <Field label="Notes"><input className={inputCls} value={offeringForm.notes} onChange={(e) => setOfferingForm({ ...offeringForm, notes: e.target.value })} /></Field>
            <button onClick={handleAddOffering} disabled={saving} className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {saving ? 'Saving...' : 'Add to Event'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit Offering Modal */}
      {editOffering && (
        <Modal onClose={() => setEditOffering(null)} title={`Edit Offering — ${editOffering.definition.position}`}>
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Event: {editOffering.offering.events?.event_name}</p>
            <Field label="Slots offered *"><input type="number" min="1" className={inputCls} value={offeringForm.slots_offered} onChange={(e) => setOfferingForm({ ...offeringForm, slots_offered: e.target.value })} /></Field>
            <Field label="Notes"><input className={inputCls} value={offeringForm.notes} onChange={(e) => setOfferingForm({ ...offeringForm, notes: e.target.value })} /></Field>
            <button onClick={saveOffering} disabled={saving} className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Definition Modal */}
      {deleteDef && (
        <Modal onClose={() => setDeleteDef(null)} title="Confirm Delete">
          <p className="text-sm text-slate-600">
            Delete <strong>{deleteDef.position}</strong> at <strong>{deleteDef.company_name}</strong>? This also removes all of its event offerings and applicant links.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteDef(null)} className="rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={confirmDeleteDefinition} disabled={deleting} className="rounded-lg bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Offering Modal */}
      {deleteOffering && (
        <Modal onClose={() => setDeleteOffering(null)} title="Remove Offering">
          <p className="text-sm text-slate-600">
            Remove this vacancy offering from <strong>{deleteOffering.events?.event_name}</strong>? Applicant links to it will also be removed.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteOffering(null)} className="rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={confirmDeleteOffering} disabled={deleting} className="rounded-lg bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {deleting ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </Modal>
      )}

      {/* Applicants Modal */}
      {applicantsModal && (
        <Modal onClose={() => setApplicantsModal(null)} title="Applicants">
          <p className="mb-3 text-sm text-slate-500">
            {applicantsModal.offering.events?.event_name} · {applicantsModal.applicants.length} applicant(s)
          </p>
          {applicantsModal.applicants.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No applicants selected this offering yet.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {applicantsModal.applicants.map(app => (
                <div key={app.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="font-semibold text-slate-900">{[app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ')}</p>
                  <p className="text-xs text-slate-500">{app.unique_id} · {app.email || 'no email'} · {app.contact_no || 'no contact'}</p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Import Report Modal */}
      {importReport && (
        <Modal onClose={() => setImportReport(null)} title="CSV Import Report">
          <div className={`mb-4 rounded-xl p-4 text-sm font-bold ${importReport.errors.length === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            {importReport.inserted} definition(s) · {importReport.insertedOffers} event offering(s) · {importReport.errors.length} error(s)
          </div>
          {importReport.errors.length > 0 && (
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {importReport.errors.map((e, i) => <p key={i} className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{e}</p>)}
            </div>
          )}
          <div className="mt-4">
            <button onClick={() => setImportReport(null)} className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800">Done</button>
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

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  )
}

