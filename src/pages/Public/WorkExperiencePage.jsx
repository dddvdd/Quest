import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PixelArrow, PixelBriefcase } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'
import { workExperienceService } from '../../services/workExperienceService'
import { participantService } from '../../services/participantService'
import { useParticipant, useJobseekerProfile } from '../../hooks/jobseeker/useJobseeker'

const EMPLOYMENT_STATUS_OPTIONS = ['Unemployed', 'Fresh Graduate', 'Currently Employed', 'Self-Employed', 'Student', 'Returning OFW', 'Homemaker', 'Not specified']
const INDUSTRY_OPTIONS = ['Accommodation & Food Service', 'Administrative & Support Services', 'Agriculture, Forestry & Fishing', 'Arts, Entertainment & Recreation', 'Construction', 'Education', 'Electricity, Gas, Steam & Air Conditioning', 'Financial & Insurance Activities', 'Households as Employers', 'Human Health & Social Work', 'Information & Communication (BPO / IT)', 'Manufacturing', 'Mining & Quarrying', 'Other Service Activities', 'Overseas Employment', 'Professional, Scientific & Technical', 'Public Administration & Defense', 'Real Estate Activities', 'Transportation & Storage', 'Water Supply & Waste Management', 'Wholesale & Retail Trade']
const RELATIONSHIP_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'self_employed', label: 'Self-Employed' },
  { value: 'employer_business_owner', label: 'Employer / Business Owner' },
  { value: 'freelance_gig_worker', label: 'Freelance / Gig Worker' },
  { value: 'unpaid_family_worker', label: 'Unpaid Family Worker' },
  { value: 'other', label: 'Other' },
]

const ARRANGEMENT_OPTIONS = [
  { value: 'regular_permanent', label: 'Regular / Permanent' },
  { value: 'probationary', label: 'Probationary' },
  { value: 'fixed_term_contractual', label: 'Fixed-Term / Contractual' },
  { value: 'project_based', label: 'Project-Based' },
  { value: 'casual', label: 'Casual' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'apprenticeship', label: 'Apprenticeship' },
  { value: 'internship_ojt', label: 'Internship / OJT' },
  { value: 'other', label: 'Other' },
]

const SCHEDULE_OPTIONS = [
  { value: 'full_time', label: 'Full-Time' },
  { value: 'part_time', label: 'Part-Time' },
  { value: 'on_call', label: 'On-Call' },
  { value: 'intermittent', label: 'Intermittent' },
  { value: 'irregular', label: 'Irregular' },
  { value: 'as_needed', label: 'As Needed' },
  { value: 'other', label: 'Other' },
]

const EMPTY = {
  employer_name: '',
  position_title: '',
  industry: '',
  employment_relationship: '',
  employment_arrangement: '',
  work_schedule_type: '',
  start_date: '',
  end_date: '',
  is_current: false,
  country: '',
  building_street: '',
  province: '',
  municipality_city: '',
  description: '',
}

const input = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

function formatSalaryInput(event) {
  event.target.value = event.target.value.replace(/\d[\d,]*/g, (number) => {
    const digits = number.replace(/,/g, '')
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  })
}

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

function formatLaborForceDuration(items) {
  const today = new Date()
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const totalMonths = items.reduce((total, item) => {
    if (!item.start_date) return total
    const start = new Date(`${item.start_date.slice(0, 7)}-01T00:00:00`)
    if (Number.isNaN(start.getTime())) return total
    const end = item.is_current || !item.end_date
      ? currentMonth
      : new Date(`${item.end_date.slice(0, 7)}-01T00:00:00`)
    if (Number.isNaN(end.getTime()) || end < start) return total
    return total + ((end.getFullYear() - start.getFullYear()) * 12) + end.getMonth() - start.getMonth() + 1
  }, 0)

  if (!totalMonths) return 'Total Work Experience: 0 months'
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const parts = []
  if (years) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`)
  if (months) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`)
  return `Total Work Experience: ${parts.join(' and ')}`
}

export default function WorkExperiencePage() {
  const { participant, loading: participantLoading } = useParticipant()
  const { profile, loading: profileLoading } = useJobseekerProfile(participant?.id)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null = list, 'new' = adding, {id} = editing
  const [saving, setSaving] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const form = useForm({ defaultValues: EMPTY })
  const profileForm = useForm()
  const { register, handleSubmit, reset, watch, formState: { errors: _errors } } = form
  const { register: registerProfile, handleSubmit: handleProfileSubmit, reset: resetProfile } = profileForm
  const isCurrent = watch('is_current')

  useEffect(() => {
    if (profile) resetProfile({
      current_employment_status: profile.current_employment_status || '',
      years_of_experience: profile.years_of_experience ?? '',
      previous_occupation: profile.previous_occupation || '',
      previous_industry: profile.previous_industry || '',
      skills: profile.skills || '',
      desired_occupation: profile.desired_occupation || '',
      desired_industry: profile.desired_industry || '',
      desired_salary: profile.desired_salary || '',
      willing_to_relocate: !!profile.willing_to_relocate,
    })
  }, [profile, resetProfile])

  useEffect(() => {
    let alive = true
    workExperienceService.listMine()
      .then((rows) => { if (alive) setItems(rows || []) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  function startAdd() { setEditing('new'); reset(EMPTY) }
  function startEdit(item) { setEditing(item); reset({ ...EMPTY, ...item, start_date: formatMonthYear(item.start_date), end_date: formatMonthYear(item.end_date) }) }
  function cancel() { setEditing(null) }

  async function onSubmit(values) {
    setSaving(true)
    try {
      const startDate = toDateValue(values.start_date)
      const endDate = values.is_current ? null : toDateValue(values.end_date)
      if (values.start_date && !startDate) throw new Error('Start date must use the format MM/YYYY, for example 03/2026')
      if (values.end_date && !values.is_current && !endDate) throw new Error('End date must use the format MM/YYYY, for example 03/2026')
      const payload = {
        ...values,
        employment_relationship: values.employment_relationship || null,
        employment_arrangement: values.employment_arrangement || null,
        work_schedule_type: values.work_schedule_type || null,
        start_date: startDate,
        end_date: endDate,
      }
      if (editing === 'new') {
        const created = await workExperienceService.create(payload)
        setItems((prev) => [created, ...prev])
        toast.success('Work experience added')
      } else {
        const updated = await workExperienceService.update(editing.id, payload)
        setItems((prev) => prev.map(i => i.id === editing.id ? updated : i))
        toast.success('Work experience updated')
      }
      setEditing(null)
    } catch (e) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function saveProfileDetails(values) {
    if (!profile) return
    setProfileSaving(true)
    try {
      await participantService.saveJobseekerProfile({
        ...profile,
        ...values,
        years_of_experience: values.years_of_experience === '' ? null : Number(values.years_of_experience),
      })
      toast.success('Work and skills profile updated')
    } catch (e) {
      toast.error(e.message || 'Failed to save work and skills profile')
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this work experience?')) return
    try {
      await workExperienceService.remove(id)
      setItems((prev) => prev.filter(i => i.id !== id))
      toast.success('Deleted')
    } catch (e) {
      toast.error(e.message || 'Failed to delete')
    }
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

  const sortedItems = [...items].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
    return (b.start_date || '').localeCompare(a.start_date || '')
  })

  if (loading || participantLoading || profileLoading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading work experiences…</main>

  // --- Edit / Add form ---
  if (editing) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-8 sm:px-6" role="presentation">
        <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center">
          <div className="w-full rounded-2xl bg-white shadow-xl ring-1 ring-slate-200" role="dialog" aria-modal="true" aria-labelledby="experience-modal-title">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <h1 id="experience-modal-title" className="text-lg font-bold text-slate-900">{editing === 'new' ? 'Add Work Experience' : 'Edit Work Experience'}</h1>
              <button type="button" onClick={cancel} className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Employer name
                <input {...register('employer_name')} className={`${input} mt-1`} placeholder="ABC Corporation" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Position title
                <input {...register('position_title')} className={`${input} mt-1`} placeholder="Sales Associate" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Industry
                <select {...register('industry')} className={`${input} mt-1`}>
                  <option value="">Select industry</option>
                  {INDUSTRY_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Employment relationship
                <select {...register('employment_relationship')} className={`${input} mt-1`}>
                  <option value="">Select…</option>
                  {RELATIONSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Employment arrangement
                <select {...register('employment_arrangement')} className={`${input} mt-1`}>
                  <option value="">Select…</option>
                  {ARRANGEMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Work schedule
                <select {...register('work_schedule_type')} className={`${input} mt-1`}>
                  <option value="">Select…</option>
                  {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
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
                  Currently working here
                </label>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Full Address of work</p>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Street / building
                <input {...register('building_street')} className={`${input} mt-1`} placeholder="Street, building, barangay" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Municipality / city
                <input {...register('municipality_city')} className={`${input} mt-1`} placeholder="Municipality or city" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Province
                <input {...register('province')} className={`${input} mt-1`} placeholder="Cagayan" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Country
                <input {...register('country')} className={`${input} mt-1`} placeholder="Philippines" />
              </label>
              </div>
            </div>
            <label className="block text-sm font-medium text-slate-700">Job description or accomplishments
              <textarea rows={4} {...register('description')} className={`${input} mt-1`} placeholder="Describe your responsibilities, achievements, or key contributions" />
            </label>
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                {saving ? 'Saving…' : editing === 'new' ? 'Add Experience' : 'Save Changes'}
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

  // --- List view ---
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
            <h1 className="text-xl font-bold text-slate-900">Work Experience</h1>
            <p className="mt-1 text-sm text-slate-500">Your employment history. This helps us match you with suitable programs.</p>
            <div className="mt-3 rounded-xl bg-blue-50 px-4 py-3 ring-1 ring-blue-100" aria-live="polite">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Total Work Experience</p>
              <p className="mt-1 text-lg font-bold text-blue-900">{formatLaborForceDuration(items).replace('Total Work Experience: ', '')}</p>
            </div>
          </div>
          <button onClick={startAdd} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            + Add
          </button>
        </div>

        <form onSubmit={handleProfileSubmit(saveProfileDetails)} className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900">Employment preferences</h2>
          <p className="mt-1 text-sm text-slate-500">Keep your employment status and relocation preference up to date.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Current employment status<select {...registerProfile('current_employment_status')} className={`${input} mt-1`}><option value="">Select</option>{EMPLOYMENT_STATUS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="block text-sm font-medium text-slate-700">Desired occupation<input {...registerProfile('desired_occupation')} className={`${input} mt-1`} placeholder="Administrative Assistant" /></label>
            <label className="block text-sm font-medium text-slate-700">Desired industry<select {...registerProfile('desired_industry')} className={`${input} mt-1`}><option value="">Select</option>{INDUSTRY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="block text-sm font-medium text-slate-700">Desired salary<input {...registerProfile('desired_salary', { onChange: formatSalaryInput })} inputMode="numeric" className={`${input} mt-1`} placeholder="50,000" /></label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" {...registerProfile('willing_to_relocate')} className="h-4 w-4 rounded" />Willing to relocate for work</label>
          <button type="submit" disabled={profileSaving} className="mt-5 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{profileSaving ? 'Saving…' : 'Save'}</button>
        </form>

        {sortedItems.length === 0 ? (
          <div className="mt-12 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
            <PixelBriefcase className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">No work experience recorded yet.</p>
            <p className="mt-1 text-xs text-slate-400">Add your employment history to strengthen your profile.</p>
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
                    <p className="text-sm font-bold text-slate-900">{item.position_title || 'Untitled position'}</p>
                    <p className="text-sm text-slate-600">{item.employer_name || 'Unknown employer'}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{formatPeriod(item)}</span>
                      {item.employment_relationship && <span>{labelOf(RELATIONSHIP_OPTIONS, item.employment_relationship)}</span>}
                      {item.employment_arrangement && <span>{labelOf(ARRANGEMENT_OPTIONS, item.employment_arrangement)}</span>}
                      {item.work_schedule_type && <span>{labelOf(SCHEDULE_OPTIONS, item.work_schedule_type)}</span>}
                    </div>
                    {item.industry && <p className="mt-1 text-xs text-slate-400">Industry: {item.industry}</p>}
                    {[item.building_street, item.municipality_city, item.province, item.country].filter(Boolean).length > 0 && (
                      <p className="mt-1 text-xs text-slate-400">{[item.building_street, item.municipality_city, item.province, item.country].filter(Boolean).join(', ')}</p>
                    )}
                    {item.description && <p className="mt-2 text-xs text-slate-500 line-clamp-2">{item.description}</p>}
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
