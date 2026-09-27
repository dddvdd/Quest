import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PixelArrow } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'
import { preferenceService } from '../../services/preferenceService'
import { referenceService } from '../../services/referenceService'
import { participantService } from '../../services/participantService'
import { useParticipant, useJobseekerProfile } from '../../hooks/jobseeker/useJobseeker'

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Primary' },
  { value: 2, label: 'Secondary' },
  { value: 3, label: 'Exploratory' },
]

const AVAILABILITY_OPTIONS = [
  { value: 'immediately', label: 'Immediately' },
  { value: 'specific_date', label: 'Specific date' },
  { value: 'notice_period', label: 'Notice period' },
  { value: 'not_currently_available', label: 'Not currently available' },
]

const SALARY_PERIOD_OPTIONS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
]

const input = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

function Card({ title, description, children }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-5">{children}</div>
    </div>
  )
}

function Badge({ children }) {
  return <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{children}</span>
}

function useDebouncedValue(value, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export default function PreferencesPage() {
  const { participant, loading: participantLoading } = useParticipant()
  const { profile, loading: profileLoading } = useJobseekerProfile(participant?.id)

  // Occupation prefs
  const [occPrefs, setOccPrefs] = useState([])
  const [occLoading, setOccLoading] = useState(true)
  const [occQuery, setOccQuery] = useState('')
  const [occResults, setOccResults] = useState([])
  const [occSearchOpen, setOccSearchOpen] = useState(false)
  const [occPriority, setOccPriority] = useState(1)

  // Industry prefs
  const [indPrefs, setIndPrefs] = useState([])
  const [_indLoading, setIndLoading] = useState(true)
  const [industries, setIndustries] = useState([])
  const [indValue, setIndValue] = useState('')

  // Location prefs
  const [locPrefs, setLocPrefs] = useState([])
  const [_locLoading, setLocLoading] = useState(true)
  const [locForm, setLocForm] = useState({ province: '', municipality_city: '', is_primary: false })

  // Employment type prefs
  const [etPrefs, setEtPrefs] = useState([])
  const [_etLoading, setEtLoading] = useState(true)
  const [empTypes, setEmpTypes] = useState([])
  const [etValue, setEtValue] = useState('')

  // Work arrangement prefs
  const [waPrefs, setWaPrefs] = useState([])
  const [_waLoading, setWaLoading] = useState(true)
  const [workArrangements, setWorkArrangements] = useState([])
  const [waValue, setWaValue] = useState('')

  // Profile form
  const [profileSaving, setProfileSaving] = useState(false)
  const profileForm = useForm()
  const { register: registerProfile, handleSubmit: handleProfileSubmit, reset: resetProfile, watch } = profileForm
  const availStatus = watch('availability_status')

  const debouncedOccQuery = useDebouncedValue(occQuery)

  // --- Load all prefs + reference data ---
  useEffect(() => {
    let alive = true
    Promise.all([
      preferenceService.listOccupationPrefs(),
      preferenceService.listIndustryPrefs(),
      preferenceService.listLocationPrefs(),
      preferenceService.listEmploymentTypePrefs(),
      preferenceService.listWorkArrangementPrefs(),
      referenceService.listIndustries(),
      referenceService.listEmploymentTypes(),
      referenceService.listWorkArrangements(),
    ]).then(([occ, ind, loc, et, wa, indRef, etRef, waRef]) => {
      if (!alive) return
      setOccPrefs(occ || [])
      setIndPrefs(ind || [])
      setLocPrefs(loc || [])
      setEtPrefs(et || [])
      setWaPrefs(wa || [])
      setIndustries(indRef || [])
      setEmpTypes(etRef || [])
      setWorkArrangements(waRef || [])
    }).catch(() => {}).finally(() => {
      if (alive) {
        setOccLoading(false)
        setIndLoading(false)
        setLocLoading(false)
        setEtLoading(false)
        setWaLoading(false)
      }
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (profile) resetProfile({
      availability_status: profile.availability_status || '',
      available_start_date: profile.available_start_date || '',
      preferred_shift: profile.preferred_shift || '',
      desired_salary_min: profile.desired_salary_min ?? '',
      desired_salary_max: profile.desired_salary_max ?? '',
      desired_salary_period: profile.desired_salary_period || '',
      career_interests: profile.career_interests || '',
      professional_summary: profile.professional_summary || '',
    })
  }, [profile, resetProfile])

  // --- Occupation search ---
  useEffect(() => {
    if (debouncedOccQuery.length < 2) { setOccResults([]); return }
    let alive = true
    referenceService.searchOccupations(debouncedOccQuery)
      .then((rows) => { if (alive) setOccResults(rows || []) })
      .catch(() => {})
    return () => { alive = false }
  }, [debouncedOccQuery])

  async function addOccPref(occ) {
    try {
      const created = await preferenceService.createOccupationPref({
        occupation_id: occ.id,
        priority: occPriority,
      })
      setOccPrefs((prev) => [...prev, { ...created, occupations: occ }])
      setOccQuery('')
      setOccResults([])
      setOccSearchOpen(false)
      toast.success('Occupation preference added')
    } catch (e) {
      toast.error(e.message || 'Failed to add')
    }
  }

  async function removeOccPref(id) {
    try {
      await preferenceService.removeOccupationPref(id)
      setOccPrefs((prev) => prev.filter((p) => p.id !== id))
      toast.success('Removed')
    } catch (e) {
      toast.error(e.message || 'Failed to remove')
    }
  }

  // --- Industry ---
  async function addIndPref() {
    if (!indValue) return
    const ind = industries.find((i) => i.id === indValue)
    if (!ind) return
    try {
      const created = await preferenceService.createIndustryPref({ industry_id: ind.id, priority: indPrefs.length + 1 })
      setIndPrefs((prev) => [...prev, { ...created, industries: ind }])
      setIndValue('')
      toast.success('Industry preference added')
    } catch (e) {
      toast.error(e.message || 'Failed to add')
    }
  }

  async function removeIndPref(id) {
    try {
      await preferenceService.removeIndustryPref(id)
      setIndPrefs((prev) => prev.filter((p) => p.id !== id))
      toast.success('Removed')
    } catch (e) {
      toast.error(e.message || 'Failed to remove')
    }
  }

  // --- Location ---
  async function addLocPref() {
    if (!locForm.province && !locForm.municipality_city) return
    try {
      const created = await preferenceService.createLocationPref({
        province: locForm.province || null,
        municipality_city: locForm.municipality_city || null,
        is_primary: locForm.is_primary,
        priority: locPrefs.length + 1,
      })
      setLocPrefs((prev) => [...prev, created])
      setLocForm({ province: '', municipality_city: '', is_primary: false })
      toast.success('Location preference added')
    } catch (e) {
      toast.error(e.message || 'Failed to add')
    }
  }

  async function removeLocPref(id) {
    try {
      await preferenceService.removeLocationPref(id)
      setLocPrefs((prev) => prev.filter((p) => p.id !== id))
      toast.success('Removed')
    } catch (e) {
      toast.error(e.message || 'Failed to remove')
    }
  }

  // --- Employment type ---
  async function addEtPref() {
    if (!etValue) return
    const et = empTypes.find((t) => t.id === etValue)
    if (!et) return
    try {
      const created = await preferenceService.createEmploymentTypePref({ employment_type_id: et.id, priority: etPrefs.length + 1 })
      setEtPrefs((prev) => [...prev, { ...created, employment_types: et }])
      setEtValue('')
      toast.success('Employment type preference added')
    } catch (e) {
      toast.error(e.message || 'Failed to add')
    }
  }

  async function removeEtPref(id) {
    try {
      await preferenceService.removeEmploymentTypePref(id)
      setEtPrefs((prev) => prev.filter((p) => p.id !== id))
      toast.success('Removed')
    } catch (e) {
      toast.error(e.message || 'Failed to remove')
    }
  }

  // --- Work arrangement ---
  async function addWaPref() {
    if (!waValue) return
    const wa = workArrangements.find((a) => a.id === waValue)
    if (!wa) return
    try {
      const created = await preferenceService.createWorkArrangementPref({ work_arrangement_id: wa.id, priority: waPrefs.length + 1 })
      setWaPrefs((prev) => [...prev, { ...created, work_arrangements: wa }])
      setWaValue('')
      toast.success('Work arrangement preference added')
    } catch (e) {
      toast.error(e.message || 'Failed to add')
    }
  }

  async function removeWaPref(id) {
    try {
      await preferenceService.removeWorkArrangementPref(id)
      setWaPrefs((prev) => prev.filter((p) => p.id !== id))
      toast.success('Removed')
    } catch (e) {
      toast.error(e.message || 'Failed to remove')
    }
  }

  // --- Profile save ---
  async function saveProfile(values) {
    if (!profile) return
    setProfileSaving(true)
    try {
      await participantService.saveJobseekerProfile({
        ...profile,
        ...values,
        desired_salary_min: values.desired_salary_min === '' ? null : Number(values.desired_salary_min),
        desired_salary_max: values.desired_salary_max === '' ? null : Number(values.desired_salary_max),
      })
      toast.success('Availability & salary updated')
    } catch (e) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setProfileSaving(false)
    }
  }

  if (loading || participantLoading || profileLoading || occLoading) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading preferences…</main>
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

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Preferences</h1>
          <p className="mt-1 text-sm text-slate-500">Tell us what you're looking for so we can match you with the right opportunities.</p>
        </div>

        {/* --- Section 1: Occupation Preferences --- */}
        <Card title="Occupation Preferences" description="Which roles are you interested in? Search and add from our database.">
          {occPrefs.length > 0 ? (
            <div className="space-y-2">
              {occPrefs.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-slate-900">{p.occupations?.canonical_name || 'Unknown'}</span>
                    <Badge>{PRIORITY_OPTIONS.find((o) => o.value === p.priority)?.label || p.priority}</Badge>
                  </div>
                  <button onClick={() => removeOccPref(p.id)} className="ml-3 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No occupation preferences yet.</p>
          )}
          {!occSearchOpen ? (
            <button onClick={() => setOccSearchOpen(true)} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">+ Add Occupation</button>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <label className="block text-sm font-medium text-slate-700">
                  Priority
                  <select value={occPriority} onChange={(e) => setOccPriority(Number(e.target.value))} className={`${input} mt-1 w-40`}>
                    {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block flex-1 text-sm font-medium text-slate-700">
                  Search occupation
                  <input value={occQuery} onChange={(e) => setOccQuery(e.target.value)} className={`${input} mt-1`} placeholder="Type at least 2 characters…" autoFocus />
                </label>
              </div>
              {occResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  {occResults.map((occ) => (
                    <button key={occ.id} onClick={() => addOccPref(occ)} className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50">{occ.canonical_name}</button>
                  ))}
                </div>
              )}
              <button onClick={() => { setOccSearchOpen(false); setOccQuery(''); setOccResults([]) }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          )}
        </Card>

        {/* --- Section 2: Industry Preferences --- */}
        <Card title="Industry Preferences" description="Select the industries you'd prefer to work in.">
          {indPrefs.length > 0 ? (
            <div className="space-y-2">
              {indPrefs.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-900">{p.industries?.canonical_name || 'Unknown'}</span>
                  <button onClick={() => removeIndPref(p.id)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No industry preferences yet.</p>
          )}
          <div className="mt-3 flex gap-2">
            <select value={indValue} onChange={(e) => setIndValue(e.target.value)} className={`${input} flex-1`}>
              <option value="">Select industry…</option>
              {industries.map((i) => <option key={i.id} value={i.id}>{i.canonical_name}</option>)}
            </select>
            <button onClick={addIndPref} disabled={!indValue} className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">Add</button>
          </div>
        </Card>

        {/* --- Section 3: Location Preferences --- */}
        <Card title="Location Preferences" description="Where would you like to work? Mark one as your primary location.">
          {locPrefs.length > 0 ? (
            <div className="space-y-2">
              {locPrefs.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-slate-900">
                      {[p.municipality_city, p.province].filter(Boolean).join(', ') || 'Unknown'}
                    </span>
                    {p.is_primary && <Badge>Primary</Badge>}
                  </div>
                  <button onClick={() => removeLocPref(p.id)} className="ml-3 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No location preferences yet.</p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700">
              Province
              <input value={locForm.province} onChange={(e) => setLocForm((f) => ({ ...f, province: e.target.value }))} className={`${input} mt-1`} placeholder="Cagayan" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Municipality / City
              <input value={locForm.municipality_city} onChange={(e) => setLocForm((f) => ({ ...f, municipality_city: e.target.value }))} className={`${input} mt-1`} placeholder="Tuguegarao City" />
            </label>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                <input type="checkbox" checked={locForm.is_primary} onChange={(e) => setLocForm((f) => ({ ...f, is_primary: e.target.checked }))} className="h-4 w-4 rounded text-blue-600" />
                Primary location
              </label>
            </div>
          </div>
          <button onClick={addLocPref} disabled={!locForm.province && !locForm.municipality_city} className="mt-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">Add Location</button>
        </Card>

        {/* --- Section 4: Employment Type Preferences --- */}
        <Card title="Employment Type Preferences" description="What type of employment are you looking for?">
          {etPrefs.length > 0 ? (
            <div className="space-y-2">
              {etPrefs.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-900">{p.employment_types?.name || 'Unknown'}</span>
                  <button onClick={() => removeEtPref(p.id)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No employment type preferences yet.</p>
          )}
          <div className="mt-3 flex gap-2">
            <select value={etValue} onChange={(e) => setEtValue(e.target.value)} className={`${input} flex-1`}>
              <option value="">Select employment type…</option>
              {empTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={addEtPref} disabled={!etValue} className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">Add</button>
          </div>
        </Card>

        {/* --- Section 5: Work Arrangement Preferences --- */}
        <Card title="Work Arrangement Preferences" description="How do you prefer to work?">
          {waPrefs.length > 0 ? (
            <div className="space-y-2">
              {waPrefs.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-900">{p.work_arrangements?.name || 'Unknown'}</span>
                  <button onClick={() => removeWaPref(p.id)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No work arrangement preferences yet.</p>
          )}
          <div className="mt-3 flex gap-2">
            <select value={waValue} onChange={(e) => setWaValue(e.target.value)} className={`${input} flex-1`}>
              <option value="">Select work arrangement…</option>
              {workArrangements.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button onClick={addWaPref} disabled={!waValue} className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">Add</button>
          </div>
        </Card>

        {/* --- Section 6: Availability & Salary --- */}
        <Card title="Availability & Salary" description="Your availability status, preferred shift, and salary expectations.">
          <form onSubmit={handleProfileSubmit(saveProfile)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Availability
                <select {...registerProfile('availability_status')} className={`${input} mt-1`}>
                  <option value="">Select…</option>
                  {AVAILABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              {availStatus === 'specific_date' && (
                <label className="block text-sm font-medium text-slate-700">
                  Available start date
                  <input type="date" {...registerProfile('available_start_date')} className={`${input} mt-1`} />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Preferred shift
                <input {...registerProfile('preferred_shift')} className={`${input} mt-1`} placeholder="Morning, Night, etc." />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Desired salary (minimum)
                <input type="number" {...registerProfile('desired_salary_min')} className={`${input} mt-1`} placeholder="15000" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Desired salary (maximum)
                <input type="number" {...registerProfile('desired_salary_max')} className={`${input} mt-1`} placeholder="25000" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Salary period
                <select {...registerProfile('desired_salary_period')} className={`${input} mt-1`}>
                  <option value="">Select…</option>
                  {SALARY_PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Career interests
              <textarea rows={3} {...registerProfile('career_interests')} className={`${input} mt-1`} placeholder="Describe what kind of career you're pursuing…" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Professional summary
              <textarea rows={3} {...registerProfile('professional_summary')} className={`${input} mt-1`} placeholder="A brief summary of your experience and goals…" />
            </label>
            <button type="submit" disabled={profileSaving} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
              {profileSaving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </Card>
      </main>
    </div>
  )
}
