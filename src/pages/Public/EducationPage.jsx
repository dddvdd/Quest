import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PixelArrow, PixelBriefcase } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'
import { educationService } from '../../services/educationService'
import { referenceService } from '../../services/referenceService'

const STATUS_OPTIONS = [
  { value: 'graduated', label: 'Graduated' },
  { value: 'completed', label: 'Completed' },
  { value: 'undergraduate', label: 'Undergraduate' },
  { value: 'currently_enrolled', label: 'Currently Enrolled' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'dropped', label: 'Dropped' },
]

const EMPTY = {
  education_level_id: '',
  school_name: '',
  field_of_study: '',
  course_program: '',
  start_date: '',
  end_date: '',
  graduation_year: '',
  status: '',
  is_current: false,
}

const input = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

function formatMonthYear(value) {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).replace(' ', '/')
}

function toDateValue(value) {
  const normalized = String(value || '').trim().replace(/[-\s]+/g, '/')
  if (!normalized) return null
  const match = normalized.match(/^([A-Za-z]+|\d{1,2})\s*\/\s*(\d{4})$/)
  if (!match) return null
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const month = /^\d+$/.test(match[1]) ? Number(match[1]) - 1 : monthNames.indexOf(match[1].toLowerCase())
  const year = Number(match[2])
  if (month < 0 || month > 11 || year < 1) return null
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}

function formatPeriod(item) {
  const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : null
  const s = fmt(item.start_date)
  const e = item.is_current ? 'Present' : fmt(item.end_date)
  if (s && e) return `${s} – ${e}`
  if (s) return s
  return '—'
}

function labelOf(options, value) {
  return options.find(o => o.value === value)?.label || value || '—'
}

export default function EducationPage() {
  const [items, setItems] = useState([])
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const form = useForm({ defaultValues: EMPTY })
  const { register, handleSubmit, reset, watch, formState: { errors: _errors } } = form
  const isCurrent = watch('is_current')

  useEffect(() => {
    let alive = true
    Promise.all([
      educationService.listMine(),
      referenceService.listEducationLevels(),
    ])
      .then(([eduRows, lvlRows]) => {
        if (alive) {
          setItems(eduRows || [])
          setLevels(lvlRows || [])
        }
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  function startAdd() { setEditing('new'); reset(EMPTY) }
  function startEdit(item) { setEditing(item); reset({ ...EMPTY, ...item, education_level_id: item.education_level_id || item.education_levels?.id || '', start_date: formatMonthYear(item.start_date), end_date: formatMonthYear(item.end_date), graduation_year: item.graduation_year ?? '' }) }
  function cancel() { setEditing(null) }

  async function onSubmit(values) {
    setSaving(true)
    try {
      const startDate = toDateValue(values.start_date)
      const endDate = values.is_current ? null : toDateValue(values.end_date)
      if (values.start_date && !startDate) throw new Error('Start date must use the format MM/YYYY, for example 03/2026')
      if (values.end_date && !values.is_current && !endDate) throw new Error('End date must use the format MM/YYYY, for example 03/2026')
      const payload = {
        education_level_id: values.education_level_id || null,
        school_name: values.school_name,
        field_of_study: values.field_of_study,
        course_program: values.course_program,
        start_date: startDate,
        end_date: endDate,
        graduation_year: values.graduation_year ? Number(values.graduation_year) : null,
        status: values.status || null,
        is_current: values.is_current,
      }
      if (editing === 'new') {
        const created = await educationService.create(payload)
        setItems((prev) => [created, ...prev])
        toast.success('Education added')
      } else {
        const updated = await educationService.update(editing.id, payload)
        setItems((prev) => prev.map(i => i.id === editing.id ? updated : i))
        toast.success('Education updated')
      }
      setEditing(null)
    } catch (e) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this education record?')) return
    try {
      await educationService.remove(id)
      setItems((prev) => prev.filter(i => i.id !== id))
      toast.success('Deleted')
    } catch (e) {
      toast.error(e.message || 'Failed to delete')
    }
  }

  const sortedItems = [...items].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
    return (b.graduation_year || 0) - (a.graduation_year || 0)
  })

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading education records…</main>

  if (editing) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-8 sm:px-6" role="presentation">
        <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center">
          <div className="w-full rounded-2xl bg-white shadow-xl ring-1 ring-slate-200" role="dialog" aria-modal="true" aria-labelledby="education-modal-title">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <h1 id="education-modal-title" className="text-lg font-bold text-slate-900">{editing === 'new' ? 'Add Education' : 'Edit Education'}</h1>
              <button type="button" onClick={cancel} className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">Education level
                  <select {...register('education_level_id')} className={`${input} mt-1`}>
                    <option value="">Select level</option>
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">School name
                  <input {...register('school_name')} className={`${input} mt-1`} placeholder="University of the Philippines" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Field of study
                  <input {...register('field_of_study')} className={`${input} mt-1`} placeholder="Computer Science" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Course / Program
                  <input {...register('course_program')} className={`${input} mt-1`} placeholder="BS Computer Science" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium text-slate-700">Start date
                  <input type="text" placeholder="MM/YYYY (03/2026)" {...register('start_date')} className={`${input} mt-1`} />
                </label>
                <label className="block text-sm font-medium text-slate-700">End date
                  <input type="text" placeholder="MM/YYYY (03/2026)" {...register('end_date')} disabled={isCurrent} className={`${input} mt-1 ${isCurrent ? 'bg-slate-100' : ''}`} />
                </label>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" {...register('is_current')} className="h-4 w-4 rounded text-blue-600" />
                    Currently studying here
                  </label>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">Status
                  <select {...register('status')} className={`${input} mt-1`}>
                    <option value="">Select status</option>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">Graduation year
                  <input type="number" min="1900" max="2099" {...register('graduation_year')} className={`${input} mt-1`} placeholder="2026" />
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                  {saving ? 'Saving…' : editing === 'new' ? 'Add Education' : 'Save Changes'}
                </button>
                <button type="button" onClick={cancel} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/profile" className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            <PixelArrow className="h-4 w-4 rotate-180" /> Profile
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Education</h1>
            <p className="mt-1 text-sm text-slate-500">Your educational background. This helps us match you with suitable programs.</p>
          </div>
          <button onClick={startAdd} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            + Add
          </button>
        </div>

        {sortedItems.length === 0 ? (
          <div className="mt-12 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
            <PixelBriefcase className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">No education records yet.</p>
            <p className="mt-1 text-xs text-slate-400">Add your educational background to strengthen your profile.</p>
            <button onClick={startAdd} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Add First Entry
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {sortedItems.map(item => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{item.school_name || 'Unknown school'}</p>
                    {item.course_program && <p className="text-sm text-slate-600">{item.course_program}</p>}
                    {item.field_of_study && <p className="text-xs text-slate-500">Field: {item.field_of_study}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{formatPeriod(item)}</span>
                      {item.education_levels?.name && <span>{item.education_levels.name}</span>}
                      {item.status && <span>{labelOf(STATUS_OPTIONS, item.status)}</span>}
                      {item.graduation_year && <span>Graduated {item.graduation_year}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => startEdit(item)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
