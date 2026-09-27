import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { authService } from '../../services/authService'
import { INDUSTRY_OPTIONS, normalizeContactInput, contactMaxLen } from '../../lib/registerOptions'
import usePhAddress from '../../lib/usePhAddress'
import { PixelStar, PixelBriefcase, PixelArrow } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'

const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100'

export default function EmployerRegisterPage() {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      company_name: '',
      employer_type: 'local_direct',
      license_no: '',
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
      password: '',
      confirm_password: '',
    }
  })

  const employerType = watch('employer_type')
  const hasCagayanBranch = watch('has_cagayan_branch')
  const province = watch('province')
  const municipality = watch('municipality_city')
  const branchProvince = watch('branch_province')
  const branchMunicipality = watch('branch_municipality_city')

  // Live password indicators
  const password = watch('password') || ''
  const confirmPassword = watch('confirm_password') || ''
  const pwLongEnough = password.length >= 6
  const pwEntered = password.length > 0
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword

  const ph = usePhAddress()
  const cleanContact = (watch('contact_number') || '').replace(/\D/g, '')
  const maxLen = contactMaxLen(cleanContact)

  useEffect(() => {
    if (province) {
      setValue('municipality_city', '')
      setValue('barangay', '')
      ph.loadMunicipalities(province)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province])

  useEffect(() => {
    if (municipality) {
      setValue('barangay', '')
      ph.loadBarangays(municipality)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipality])

  useEffect(() => {
    if (branchProvince) {
      setValue('branch_municipality_city', '')
      setValue('branch_barangay', '')
      ph.loadMunicipalities(branchProvince)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchProvince])

  useEffect(() => {
    if (branchMunicipality) {
      setValue('branch_barangay', '')
      ph.loadBarangays(branchMunicipality)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchMunicipality])

  async function onSubmit(values) {
    // Submission-level validation (defense in depth beyond field rules).
    if (!values.password || values.password.length < 6) { toast.error('Password must be at least 6 characters.'); return }
    if (!values.confirm_password) { toast.error('Please confirm your password.'); return }
    if (values.password !== values.confirm_password) { toast.error('Passwords do not match.'); return }

    setSubmitting(true)

try {
      const signupAllowed = await authService.employerSignupAllowed()
      if (signupAllowed === false) {
        toast.error('Too many employer registrations recently. Please try again in about an hour.')
        setSubmitting(false)
        return
      }

      await authService.signUpEmployer({
        email: values.email,
        password: values.password,
        fullName: values.contact_person,
        role: 'employer',
      })

      const { password: _password, confirm_password: _confirm_password, ...companyData } = values
      localStorage.setItem('pending_employer_registration', JSON.stringify(companyData))

      setDone(true)
      toast.success('Account created! Please confirm your email to continue.')
    } catch (err) {
      toast.error(`Unexpected error: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
            <span className="text-2xl">📧</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Confirm Your Email</h1>
          <p className="mt-3 text-sm text-slate-600">
            Registration created. Please confirm your email, then log in to complete your employer registration.
          </p>
          <Link to="/login" className="mt-6 inline-block rounded-lg bg-violet-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
            Go to Login
          </Link>
        </section>
      </main>
    )
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
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">Register Your Company</h1>
        <p className="mt-2 text-sm text-slate-600">
          Register your company to participate in job fairs. Only local employers and agencies are accepted.
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
                <div>
                  <span className="text-sm font-medium text-slate-900">Direct Employer</span>
                  <p className="text-xs text-slate-500">You are hiring directly for your own company</p>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                <input type="radio" value="local_agency" {...register('employer_type')} className="h-4 w-4 text-violet-600" />
                <div>
                  <span className="text-sm font-medium text-slate-900">Recruitment Agency / HR / Third Party</span>
                  <p className="text-xs text-slate-500">You recruit on behalf of other companies (principals)</p>
                </div>
              </label>
            </div>
            {errors.employer_type && <p className="mt-1 text-xs text-red-600">{errors.employer_type.message}</p>}
          </div>

          {employerType === 'local_agency' && (
            <Field label="POEA/DOLE License Number *" error={errors.license_no}>
              <input {...register('license_no', {
                validate: (v) => employerType !== 'local_agency' || (v && v.trim()) || 'Please enter your POEA/DOLE license number.',
              })} className={input} placeholder="POEA-NCR-12345" />
            </Field>
          )}

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
              <input
                inputMode="tel"
                maxLength={maxLen}
                {...register('contact_number', {
                  required: 'Please enter a contact number.',
                  validate: (v) => {
                    const d = (v || '').replace(/\D/g, '')
                    return (d.length >= 9 && d.length <= 15) || 'Enter a valid contact number.'
                  },
                  onChange: (e) => { e.target.value = normalizeContactInput(e.target.value) },
                })}
                className={input}
                placeholder="09XXXXXXXXX"
              />
            </Field>
            <Field label="Email *" error={errors.email}>
              <input {...register('email', {
                required: 'Please enter your email address.',
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
                  <Field label="Branch Building / Street">
                    <input {...register('branch_building_street')} className={input} placeholder="Branch building name, street" />
                  </Field>
                </div>
                <Field label="Branch Province">
                  <select {...register('branch_province')} className={input}>
                    <option value="">Select province</option>
                    {ph.provinces.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="Branch Municipality / City">
                  <select {...register('branch_municipality_city')} disabled={!branchProvince} className={input}>
                    <option value="">{branchProvince ? 'Select municipality / city' : 'Select a province first'}</option>
                    {ph.municipalities.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="Branch Barangay">
                  <select {...register('branch_barangay')} disabled={!branchMunicipality} className={input}>
                    <option value="">{branchMunicipality ? 'Select barangay' : 'Select a municipality / city first'}</option>
                    {ph.barangays.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>

          {/* ACCOUNT */}
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Account</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Password *" error={errors.password}>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  {...register('password', {
                    required: 'Please enter a password.',
                    minLength: { value: 6, message: 'Password must be at least 6 characters.' },
                  })}
                  className={input}
                  placeholder="Min. 6 characters"
                />
                <span className="mt-1.5 block space-y-0.5 text-xs">
                  <span className={`block font-medium ${pwEntered ? 'text-emerald-600' : 'text-slate-400'}`}>{pwEntered ? '✓' : '○'} Password entered</span>
                  <span className={`block font-medium ${pwLongEnough ? 'text-emerald-600' : password ? 'text-red-500' : 'text-slate-400'}`}>{pwLongEnough ? '✓' : '○'} At least 6 characters</span>
                </span>
              </Field>
              <Field label="Confirm Password *" error={errors.confirm_password}>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  {...register('confirm_password', {
                    required: 'Please confirm your password.',
                    validate: (v) => v === password || 'Passwords do not match.',
                  })}
                  className={input}
                  placeholder="Re-enter password"
                />
                {confirmPassword && (
                  <span className={`mt-1.5 block text-xs font-medium ${passwordsMatch ? 'text-emerald-600' : 'text-red-500'}`}>
                    {passwordsMatch ? '✓ Passwords match' : '✕ Passwords do not match.'}
                  </span>
                )}
              </Field>
            </div>
            <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
              <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} className="h-3.5 w-3.5 rounded" />
              Show passwords
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-violet-700 py-3 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Register as Employer'}
          </button>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-violet-700 hover:underline">Sign in</Link>
          </p>
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

