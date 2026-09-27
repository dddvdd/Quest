import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { employerService } from '../../services/employerService'
import { profileService } from '../../services/profileService'
import { INDUSTRY_OPTIONS, normalizeContactInput, contactMaxLen } from '../../lib/registerOptions'
import usePhAddress from '../../lib/usePhAddress'
import { PixelStar, PixelBriefcase, PixelArrow } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'

const PENDING_KEY = 'pending_employer_registration'
const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100'

export default function CompleteEmployerRegistration() {
  const { user, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const pending = (() => {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null')
    } catch {
      return null
    }
  })()

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: pending || {
      company_name: '',
      employer_type: 'local_direct',
      license_no: '',
      tin: '',
      business_structure: '',
      osh_classification: '',
      industry: '',
      contact_person: '',
      contact_number: '',
      email: '',
      building_street: '',
      province: '',
      municipality_city: '',
      barangay: '',
      has_cagayan_branch: false,
      branch_building_street: '',
      branch_province: '',
      branch_municipality_city: '',
      branch_barangay: '',
    },
  })

  const employerType = watch('employer_type')
  const hasCagayanBranch = watch('has_cagayan_branch')
  const province = watch('province')
  const municipality = watch('municipality_city')
  const branchProvince = watch('branch_province')
  const branchMunicipality = watch('branch_municipality_city')

  const ph = usePhAddress()
  const cleanContact = (watch('contact_number') || '').replace(/\D/g, '')
  const maxLen = contactMaxLen(cleanContact)

  useEffect(() => {
    if (province) { setValue('municipality_city', ''); setValue('barangay', ''); ph.loadMunicipalities(province) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province])

  useEffect(() => {
    if (municipality) { setValue('barangay', ''); ph.loadBarangays(municipality) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipality])

  useEffect(() => {
    if (branchProvince) { setValue('branch_municipality_city', ''); setValue('branch_barangay', ''); ph.loadMunicipalities(branchProvince) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchProvince])

  useEffect(() => {
    if (branchMunicipality) { setValue('branch_barangay', ''); ph.loadBarangays(branchMunicipality) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchMunicipality])

  if (loading) return <main className="grid min-h-screen place-items-center text-slate-600">Loading…</main>
  if (!user) return <Navigate to="/register-employer" replace />
  // Employers arriving without the pending blob (e.g. browser closed between
  // stages) may still complete Stage 2; blank defaults apply.
  if (!pending && profile?.role !== 'employer') return <Navigate to="/register-employer" replace />

  if (pending.email && user.email && pending.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return (
      <main className="mx-auto grid min-h-screen max-w-md place-items-center px-5">
        <div className="w-full rounded-2xl bg-white p-7 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-bold text-slate-900">Wrong Account</h1>
          <p className="mt-3 text-sm text-slate-600">
            You registered with <strong>{pending.email}</strong> but are signed in as <strong>{user.email}</strong>.
            Please sign out and log in with the email you used to register.
          </p>
          <Link to="/login" className="mt-6 inline-block rounded-lg bg-violet-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
            Go to Login
          </Link>
        </div>
      </main>
    )
  }

async function onSubmit(values) {
    setSubmitting(true)
    try {
      // Pending employers stay signed in; approval is gated on
      // employers.registration_status, not profiles.is_active.
      await profileService.updateSelf(user.id, {
        email: values.email,
        full_name: values.contact_person,
        role: 'employer',
      })

      // Compose a single-line address for the legacy `address` column, while
      // preserving the structured fields for staff/admin display.
      const fullAddress = [values.building_street, values.barangay, values.municipality_city, values.province].filter(Boolean).join(', ')
      const branchAddress = hasCagayanBranch
        ? [values.branch_building_street, values.branch_barangay, values.branch_municipality_city, values.branch_province].filter(Boolean).join(', ')
        : null

      await employerService.create({
        company_name: values.company_name,
        employer_type: values.employer_type,
        license_no: values.license_no || null,
        tin: values.tin || null,
        business_structure: values.business_structure || null,
        osh_classification: values.osh_classification || null,
        industry: values.industry,
        contact_person: values.contact_person,
        contact_number: values.contact_number,
        email: values.email,
        address: fullAddress,
        building_street: values.building_street || null,
        province: values.province || null,
        municipality_city: values.municipality_city || null,
        barangay: values.barangay || null,
        has_cagayan_branch: hasCagayanBranch,
        branch_building_street: values.branch_building_street || null,
        branch_province: values.branch_province || null,
        branch_municipality_city: values.branch_municipality_city || null,
        branch_barangay: values.branch_barangay || null,
        branch_address: branchAddress,
        registration_status: 'pending',
        registration_source: 'self_registered',
        registered_user_id: user.id,
      })

      localStorage.removeItem(PENDING_KEY)
      toast.success('Registration submitted! Awaiting approval from PESO.')
      navigate('/employer/dashboard')
    } catch (err) {
      toast.error(`Unexpected error: ${err.message}`)
      setSubmitting(false)
    }
  }

  return (
    <div className="theme-employer min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-700 text-white">
              <PixelBriefcase className="h-4 w-4" />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">Trabaho Caravan</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/" className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-violet-700">
              <PixelArrow className="h-3 w-3 rotate-180" /> Quest Board
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-violet-700 ring-1 ring-violet-100">
          <PixelStar className="h-2.5 w-2.5 text-amber-500" />
          Employer Registration
        </p>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">Complete Employer Registration</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your email is confirmed. Review your company details below — they will be reviewed by the admin.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <Field label="Company Name *" error={errors.company_name}>
            <input {...register('company_name', { required: 'Please enter your company name.' })} className={input} placeholder="Jollibee Foods Corporation" />
          </Field>

          <div>
            <label className="block text-sm font-medium text-slate-700">Employer Type *</label>
            <div className="mt-1 space-y-2">
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                <input type="radio" value="local_direct" {...register('employer_type')} className="h-4 w-4 text-violet-600" />
                <span className="text-sm font-medium text-slate-900">Direct Employer</span>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                <input type="radio" value="local_agency" {...register('employer_type')} className="h-4 w-4 text-violet-600" />
                <span className="text-sm font-medium text-slate-900">Recruitment Agency / HR / Third Party</span>
              </label>
            </div>
          </div>

          {employerType === 'local_agency' && (
            <Field label="POEA/DOLE License Number *" error={errors.license_no}>
              <input {...register('license_no', { validate: (v) => employerType !== 'local_agency' || (v && v.trim()) || 'Please enter your POEA/DOLE license number.' })} className={input} placeholder="POEA-NCR-12345" />
            </Field>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="TIN"><input {...register('tin')} className={input} placeholder="000-000-000-000" /></Field>
            <Field label="Business Structure *" error={errors.business_structure}>
              <select {...register('business_structure', { required: 'Please select a business structure.' })} className={input}>
                <option value="">Select structure</option>
                <option value="corporation">Corporation</option>
                <option value="partnership">Partnership</option>
                <option value="single_proprietorship">Single Proprietorship</option>
                <option value="cooperative">Cooperative</option>
              </select>
            </Field>
          </div>
          <Field label="Workplace Classification (OSH) *" error={errors.osh_classification}>
            <select {...register('osh_classification', { required: 'Please select a workplace classification.' })} className={input}>
              <option value="">Select classification</option>
              <option value="low_risk">Low-risk office / workplace (BOSH)</option>
              <option value="construction_heavy_industrial">Construction / Heavy Industrial (COSH)</option>
            </select>
          </Field>

          <Field label="Industry *" error={errors.industry}>
            <select {...register('industry', { required: 'Please select an industry.' })} className={input}>
              <option value="">Select industry</option>
              {INDUSTRY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Contact Person *" error={errors.contact_person}>
              <input {...register('contact_person', { required: 'Please enter the contact person.' })} className={input} placeholder="Full name of authorized representative" />
            </Field>
            <Field label="Contact Number *" error={errors.contact_number}>
              <input inputMode="tel" maxLength={maxLen} {...register('contact_number', {
                required: 'Please enter a contact number.',
                validate: (v) => { const d = (v || '').replace(/\D/g, ''); return (d.length >= 9 && d.length <= 15) || 'Enter a valid contact number.' },
                onChange: (e) => { e.target.value = normalizeContactInput(e.target.value) },
              })} className={input} placeholder="09XXXXXXXXX" />
            </Field>
            <Field label="Email *" error={errors.email}>
              <input {...register('email', {
                required: 'Please enter a contact email.',
                pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address.' },
              })} type="email" className={input} placeholder="company@example.com" />
            </Field>
          </div>

          {/* Company address */}
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Company Address</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Building / Street *" error={errors.building_street}>
                  <input {...register('building_street', { required: 'Please enter the building / street.' })} className={input} placeholder="Building name, street, lot/block no." />
                </Field>
              </div>
              <Field label="Province *" error={errors.province}>
                <select {...register('province', { required: 'Please select a province.' })} className={input}>
                  <option value="">Select province</option>
                  {ph.provinces.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="Municipality / City *" error={errors.municipality_city}>
                <select {...register('municipality_city', { required: 'Please select a municipality / city.' })} disabled={!province} className={input}>
                  <option value="">{province ? 'Select municipality / city' : 'Select a province first'}</option>
                  {ph.municipalities.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="Barangay *" error={errors.barangay}>
                <select {...register('barangay', { required: 'Please select a barangay.' })} disabled={!municipality} className={input}>
                  <option value="">{municipality ? 'Select barangay' : 'Select a municipality / city first'}</option>
                  {ph.barangays.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* Cagayan branch */}
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" {...register('has_cagayan_branch')} className="h-4 w-4 rounded text-violet-600" />
              Do you have a branch in Cagayan?
            </label>
            {hasCagayanBranch && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Branch Building / Street"><input {...register('branch_building_street')} className={input} placeholder="Branch building name, street" /></Field>
                </div>
                <Field label="Branch Province">
                  <select {...register('branch_province')} className={input}><option value="">Select province</option>{ph.provinces.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</select>
                </Field>
                <Field label="Branch Municipality / City">
                  <select {...register('branch_municipality_city')} disabled={!branchProvince} className={input}><option value="">{branchProvince ? 'Select municipality / city' : 'Select a province first'}</option>{ph.municipalities.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</select>
                </Field>
                <Field label="Branch Barangay">
                  <select {...register('branch_barangay')} disabled={!branchMunicipality} className={input}><option value="">{branchMunicipality ? 'Select barangay' : 'Select a municipality / city first'}</option>{ph.barangays.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</select>
                </Field>
              </div>
            )}
          </div>

          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-violet-700 py-3 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50">
            {submitting ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </form>
      </main>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
      {error?.message && <span className="mt-1 block text-xs font-medium text-red-600">{error.message}</span>}
    </label>
  )
}


