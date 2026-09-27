import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'
import { useStaffEventsAnyStatus } from '../../hooks/events/useEvents'
import { eventVacancyService } from '../../services/eventVacancyService'
import { registrantService } from '../../services/registrantService'
import { eventTypeDisplay } from '../../domain/eventTypes'
import usePhAddress from '../../lib/usePhAddress'

const assistancePrograms = ['Career Coaching', 'Employment Facilitation', 'Livelihood Assistance', 'Skills Training', 'Overseas Employment Assistance', 'Special Program for Employment for Students (SPES)', 'Special Program for Assistance to Students (SPAS)', 'Government Internship Program (GIP)']

const educationalAttainmentOptions = [
  'Elementary',
  'Junior High School Level',
  'Junior High School Graduate',
  'Senior High School Level',
  'Senior High School Graduate',
  'TVET Course',
  'TESDA National Certificate I',
  'TESDA National Certificate II',
  'TESDA National Certificate III',
  'TESDA National Certificate IV',
  'TESDA Diploma Program',
  'College Level',
  "Bachelor's Degree Graduate",
  "Master's Degree Candidate/ Graduate",
  "Doctor's Degree/ PhD Candidate/ Graduate"
]

const shsStrands = ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'Academic', 'Technical-Professional (TechPro)']

const tesdaCourses = [
  'Automotive Servicing NC I', 'Automotive Servicing NC II', 'Bookkeeping NC III',
  'Bread and Pastry Production NC II', 'Caregiving NC II', 'Computer Systems Servicing NC II',
  'Contact Center Services NC II', 'Cookery NC II', 'Electrical Installation and Maintenance NC II',
  'Events Management Services NC III', 'Food and Beverage Services NC II', 'Housekeeping NC II',
  'Shielded Metal Arc Welding (SMAW) NC I', 'Shielded Metal Arc Welding (SMAW) NC II'
]

const bachelorsCourses = [
  'Bachelor of Arts in Communication (BA Comm)', 'Bachelor of Arts in Political Science (AB PolSci)',
  'Bachelor of Elementary Education (BEEd)', 'Bachelor of Secondary Education (BSEd)',
  'Bachelor of Science in Accountancy (BSA)', 'Bachelor of Science in Architecture (BS Arch)',
  'Bachelor of Science in Business Administration (BSBA)', 'Bachelor of Science in Civil Engineering (BSCE)',
  'Bachelor of Science in Computer Engineering (BS CpE)', 'Bachelor of Science in Computer Science (BS CS)',
  'Bachelor of Science in Criminology (BS Criminology)', 'Bachelor of Science in Electrical Engineering (BSEE)',
  'Bachelor of Science in Hospitality Management (BSHM)', 'Bachelor of Science in Industrial Engineering (BSIE)',
  'Bachelor of Science in Information Technology (BS IT)', 'Bachelor of Science in Mechanical Engineering (BSME)',
  'Bachelor of Science in Medical Technology (BSMT)', 'Bachelor of Science in Nursing (BSN)',
  'Bachelor of Science in Pharmacy (BS Phar)', 'Bachelor of Science in Psychology (BS Psych)',
  'Bachelor of Science in Tourism Management (BSTM)'
]

// ----- Pixel design tokens (shared with scanner/calendar pages) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 bg-white pixel-shadow'
const BTN = 'inline-flex min-h-[48px] items-center justify-center rounded-lg border-2 border-slate-900 font-black uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300'

const inputCls = 'mt-1 w-full min-h-[48px] rounded-lg border-2 border-slate-900 bg-white px-3 py-3 text-base font-semibold outline-none focus-visible:ring-4 focus-visible:ring-amber-300'

function ensureArray(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

export default function WalkinPage() {
  const { events } = useStaffEventsAnyStatus()
  const [vacancies, setVacancies] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [createdRegistrant, setCreatedRegistrant] = useState(null)

  const { provinces, municipalities, barangays, loadMunicipalities, loadBarangays } = usePhAddress()

  const defaults = {
    event_id: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    birthdate: '',
    sex: '',
    civil_status: '',
    province: '',
    municipality_city: '',
    barangay: '',
    contact_no: '',
    email: '',
    highest_educational_attainment: '',
    course_program: '',
    employment_preference: 'Local',
    interview_location: '',
    first_time_jobseeker: false,
    first_time_school: '',
    first_time_graduation_year: '',
    first_time_ojt_experience: '',
    returning_ofw: false,
    returning_worker: false,
    ofw_country_last_worked: '',
    ofw_previous_employer: '',
    ofw_previous_occupation: '',
    ofw_years_abroad: '',
    ofw_date_returned: '',
    ofw_reason_for_return: '',
    rw_previous_work_location: '',
    rw_previous_employer: '',
    rw_previous_occupation: '',
    rw_years_worked: '',
    rw_date_returned: '',
    rw_reason_for_return: '',
    interested_in_skills_training: false,
    preferred_training_program: '',
    has_disability: false,
    disability_type: '',
    peso_assistance_programs: [],
    data_subject_rights_agreed: true,
    selected_vacancies: [],
  }

  const [form, setForm] = useState(defaults)

  const isReturning = form.returning_ofw || form.returning_worker

  const cleanContact = (form.contact_no || '').replace(/\D/g, '')
  const contactMaxLen = cleanContact.startsWith('9') && !cleanContact.startsWith('09') ? 10 : 11

  const isElemOrJuniorHigh = ['Elementary', 'Junior High School Level', 'Junior High School Graduate'].includes(form.highest_educational_attainment)
  const isSeniorHigh = ['Senior High School Level', 'Senior High School Graduate'].includes(form.highest_educational_attainment)
  const isTesda = ['TVET Course', 'TESDA National Certificate I', 'TESDA National Certificate II', 'TESDA National Certificate III', 'TESDA National Certificate IV', 'TESDA Diploma Program'].includes(form.highest_educational_attainment)
  const isCollegeOrBachelor = ['College Level', "Bachelor's Degree Graduate"].includes(form.highest_educational_attainment)
  const isPostgraduate = ["Master's Degree Candidate/ Graduate", "Doctor's Degree/ PhD Candidate/ Graduate"].includes(form.highest_educational_attainment)

  const courseSuggestions = useMemo(() => {
    if (isSeniorHigh) return shsStrands
    if (isTesda) return tesdaCourses
    if (isCollegeOrBachelor) return bachelorsCourses
    return []
  }, [isSeniorHigh, isTesda, isCollegeOrBachelor])

  const safeProvinces = useMemo(() => ensureArray(provinces), [provinces])
  const safeMunicipalities = useMemo(() => ensureArray(municipalities), [municipalities])
  const safeBarangays = useMemo(() => ensureArray(barangays), [barangays])
  const safeVacancies = useMemo(() => ensureArray(vacancies), [vacancies])

  // Auto-select first active event when events arrive.
  useEffect(() => {
    if (!form.event_id && events.length) {
      const active = events.find(e => e.status === 'upcoming' || e.status === 'ongoing') || events[0]
      setForm((prev) => ({ ...prev, event_id: active.id, interview_location: active.location || '' }))
    }
  }, [events]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form.province) return
    loadMunicipalities(form.province)
  }, [form.province, loadMunicipalities])

  useEffect(() => {
    if (!form.municipality_city) return
    loadBarangays(form.municipality_city)
  }, [form.municipality_city, loadBarangays])

  useEffect(() => {
    if (!form.event_id) { setVacancies([]); return }
    let alive = true
    eventVacancyService.listActiveForEvent(form.event_id)
      .then((rows) => { if (alive) setVacancies(rows || []) })
      .catch(() => { if (alive) setVacancies([]) })
    return () => { alive = false }
  }, [form.event_id])

  useEffect(() => {
    if (form.first_time_jobseeker) {
      setForm((prev) => ({ ...prev, returning_ofw: false, returning_worker: false }))
    }
  }, [form.first_time_jobseeker])

  useEffect(() => {
    if (isReturning) {
      setForm((prev) => ({ ...prev, first_time_jobseeker: false }))
    }
  }, [isReturning])

  useEffect(() => {
    if (isElemOrJuniorHigh) {
      setForm((prev) => ({ ...prev, course_program: '' }))
    }
  }, [isElemOrJuniorHigh])

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleContactChange(e) {
    let val = e.target.value.replace(/\D/g, '')
    const limit = val.startsWith('9') && !val.startsWith('09') ? 10 : 11
    if (val.length > limit) val = val.slice(0, limit)
    setForm((prev) => ({ ...prev, contact_no: val }))
  }

  function togglePesoProgram(program) {
    setForm((prev) => {
      const exists = prev.peso_assistance_programs.includes(program)
      return {
        ...prev,
        peso_assistance_programs: exists
          ? prev.peso_assistance_programs.filter((p) => p !== program)
          : [...prev.peso_assistance_programs, program],
      }
    })
  }

  function handleVacancyToggle(vacancyId) {
    setForm((prev) => {
      const exists = prev.selected_vacancies.includes(vacancyId)
      return {
        ...prev,
        selected_vacancies: exists ? prev.selected_vacancies.filter((id) => id !== vacancyId) : [...prev.selected_vacancies, vacancyId],
      }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('First name and last name are required.'); return
    }

    const cleaned = form.contact_no.trim()
    if (cleaned) {
      if (!/^[0-9]+$/.test(cleaned)) { toast.error('Contact number must contain numbers only.'); return }
      if (cleaned.startsWith('09') && cleaned.length !== 11) { toast.error('Contact number starting with 09 must be exactly 11 digits.'); return }
      if (cleaned.startsWith('9') && !cleaned.startsWith('09') && cleaned.length !== 10) { toast.error('Contact number starting with 9 must be exactly 10 digits.'); return }
      if (!cleaned.startsWith('9') && !cleaned.startsWith('09') && (cleaned.length < 7 || cleaned.length > 11)) { toast.error('Enter a valid contact number.'); return }
    }

    setSubmitting(true)

    try {
      const data = await registrantService.createWalkinRegistrant({
        p_event_id: form.event_id || null,
        p_first_name: form.first_name.trim(),
        p_middle_name: form.middle_name.trim() || null,
        p_last_name: form.last_name.trim(),
        p_birthdate: form.birthdate || null,
        p_sex: form.sex || null,
        p_civil_status: form.civil_status || null,
        p_province: form.province || null,
        p_municipality_city: form.municipality_city || null,
        p_barangay: form.barangay || null,
        p_contact_no: cleaned || null,
        p_email: form.email.trim() || null,
        p_highest_educational_attainment: form.highest_educational_attainment || null,
        p_course_program: form.course_program.trim() || null,
        p_employment_preference: form.employment_preference,
        p_interview_location: form.interview_location.trim() || null,
        p_first_time_jobseeker: form.first_time_jobseeker,
        p_first_time_school: form.first_time_school.trim() || null,
        p_first_time_graduation_year: form.first_time_graduation_year || null,
        p_first_time_ojt_experience: form.first_time_ojt_experience.trim() || null,
        p_returning_ofw: form.returning_ofw,
        p_returning_worker: form.returning_worker,
        p_ofw_country_last_worked: form.ofw_country_last_worked.trim() || null,
        p_ofw_previous_employer: form.ofw_previous_employer.trim() || null,
        p_ofw_previous_occupation: form.ofw_previous_occupation.trim() || null,
        p_ofw_years_abroad: form.ofw_years_abroad || null,
        p_ofw_date_returned: form.ofw_date_returned || null,
        p_ofw_reason_for_return: form.ofw_reason_for_return.trim() || null,
        p_rw_previous_work_location: form.rw_previous_work_location.trim() || null,
        p_rw_previous_employer: form.rw_previous_employer.trim() || null,
        p_rw_previous_occupation: form.rw_previous_occupation.trim() || null,
        p_rw_years_worked: form.rw_years_worked || null,
        p_rw_date_returned: form.rw_date_returned || null,
        p_rw_reason_for_return: form.rw_reason_for_return.trim() || null,
        p_interested_in_skills_training: form.interested_in_skills_training,
        p_preferred_training_program: form.preferred_training_program.trim() || null,
        p_has_disability: form.has_disability,
        p_disability_type: form.disability_type.trim() || null,
        p_peso_assistance_programs: form.peso_assistance_programs,
        p_data_subject_rights_agreed: form.data_subject_rights_agreed,
        p_vacancy_ids: form.selected_vacancies,
      })

      toast.success(`Walk-in registrant checked in! ID: ${data.unique_id}`)
      setCreatedRegistrant(data)
    } catch (err) {
      toast.error(`Walk-in registration failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setCreatedRegistrant(null)
    setForm({
      ...defaults,
      event_id: events[0]?.id || '',
      interview_location: events[0]?.location || '',
    })
  }

  if (createdRegistrant) {
    const cName = [createdRegistrant.first_name, createdRegistrant.middle_name, createdRegistrant.last_name].filter(Boolean).join(' ')
    const passId = createdRegistrant.public_pass_id
    const qrValue = JSON.stringify({ pass: passId })

    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className={`p-6 text-center ${PANEL}`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border-2 border-slate-900 bg-emerald-400 text-slate-900 pixel-shadow-sm text-2xl font-black">âœ“</div>
          <h2 className="mt-3 text-2xl font-black uppercase tracking-tight text-slate-900">Registration Complete!</h2>
          <p className="mt-1 text-sm text-slate-600">Applicant has been auto-checked in to the job fair.</p>
          <div className="mt-6 rounded-xl bg-slate-50 p-6 space-y-3 text-left">
            <div><p className="text-xs text-slate-500 font-medium">Applicant Name</p><p className="text-xl font-bold text-slate-900">{cName}</p></div>
            <div><p className="text-xs text-slate-500 font-medium">Participant Pass</p><p className="font-mono text-lg font-bold text-blue-700">{passId}</p></div>
            <div><p className="text-xs text-slate-500 font-medium">Check-in Timestamp</p><p className="text-sm font-semibold text-emerald-700">{new Date(createdRegistrant.check_in_time).toLocaleString()}</p></div>
          </div>
          <div className="my-6 grid place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-4">
            <QRCodeSVG value={qrValue} size={180} level="M" includeMargin />
          </div>
          <p className="-mt-3 mb-4 text-xs text-slate-500">Reusable Participant Pass â scanned at any Quest.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => window.print()} className={`${BTN} bg-amber-400 py-3 text-slate-900`}>Print Pass</button>
            <button onClick={handleReset} className={`${BTN} bg-white py-3 font-bold text-slate-700`}>Register Another Walk-In</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700">On-Site Registration</p>
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Walk-in Registration</h1>
        <p className="mt-1 text-sm text-slate-600">Register and instantly check in on-site walk-in applicants.</p>
      </div>

      <form onSubmit={handleSubmit} className={`space-y-7 p-5 sm:p-8 ${PANEL}`}>
        {/* Event Selection */}
        {events.length > 0 && (
          <Section title="Event">
            <label className="block text-sm font-medium">
              Choose an event
              <select value={form.event_id} onChange={(e) => { handleChange('event_id', e.target.value); const ev = events.find((ev) => String(ev.id) === e.target.value); if (ev?.location) handleChange('interview_location', ev.location) }} className={inputCls}>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.event_name} ({eventTypeDisplay(ev)})</option>)}
              </select>
            </label>
          </Section>
        )}

        {/* Personal Information */}
        <Section title="Personal information">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="First name *">
              <input required type="text" value={form.first_name} onChange={(e) => handleChange('first_name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Middle name">
              <input type="text" value={form.middle_name} onChange={(e) => handleChange('middle_name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Last name *">
              <input required type="text" value={form.last_name} onChange={(e) => handleChange('last_name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Birthdate">
              <input type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={form.birthdate} onChange={(e) => handleChange('birthdate', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Sex">
              <select value={form.sex} onChange={(e) => handleChange('sex', e.target.value)} className={inputCls}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </Field>
            <Field label="Civil status">
              <select value={form.civil_status} onChange={(e) => handleChange('civil_status', e.target.value)} className={inputCls}>
                <option value="">Select</option>
                <option>Single</option>
                <option>Married</option>
                <option>Widowed</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* Address and contact */}
        <Section title="Address and contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Province">
              <select value={form.province} onChange={(e) => { handleChange('province', e.target.value); handleChange('municipality_city', ''); handleChange('barangay', '') }} className={inputCls}>
                <option value="">Select a province</option>
                {safeProvinces.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Municipality / city">
              <select value={form.municipality_city} onChange={(e) => handleChange('municipality_city', e.target.value)} disabled={!form.province} className={inputCls}>
                <option value="">{form.province ? 'Select a municipality / city' : 'Select a province first'}</option>
                {safeMunicipalities.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Barangay">
              <select value={form.barangay} onChange={(e) => handleChange('barangay', e.target.value)} disabled={!form.municipality_city} className={inputCls}>
                <option value="">{form.municipality_city ? 'Select a barangay' : 'Select a municipality / city first'}</option>
                {safeBarangays.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Contact number">
              <input inputMode="tel" maxLength={contactMaxLen} value={form.contact_no} onChange={handleContactChange} className={inputCls} />
            </Field>
            <Field label="Email address">
              <input type="email" placeholder="applicant@example.com" value={form.email} onChange={(e) => handleChange('email', e.target.value)} className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* Job seeker classification */}
        <Section title="Job seeker classification">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">Select one</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => { setForm(p => ({ ...p, first_time_jobseeker: true, returning_ofw: false, returning_worker: false, first_time_school: '', first_time_graduation_year: '', first_time_ojt_experience: '' })) }}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-center transition-all ${form.first_time_jobseeker ? 'border-blue-700 bg-blue-50 shadow-sm' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold bg-blue-100 text-blue-700">1</span>
              <div>
                <p className="text-sm font-bold">First-time Jobseeker</p>
                <p className="text-xs text-slate-500">Never been employed before</p>
              </div>
              {form.first_time_jobseeker && <span className="rounded-full bg-blue-700 px-2.5 py-0.5 text-[10px] font-bold text-white">SELECTED</span>}
            </button>
            <button
              type="button"
              onClick={() => { setForm(p => ({ ...p, first_time_jobseeker: false, returning_ofw: true, returning_worker: false })) }}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-center transition-all ${form.returning_ofw ? 'border-purple-700 bg-purple-50 shadow-sm' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold bg-purple-100 text-purple-700">âœˆ</span>
              <div>
                <p className="text-sm font-bold">Returning OFW</p>
                <p className="text-xs text-slate-500">Worked overseas and returned</p>
              </div>
              {form.returning_ofw && <span className="rounded-full bg-purple-700 px-2.5 py-0.5 text-[10px] font-bold text-white">SELECTED</span>}
            </button>
            <button
              type="button"
              onClick={() => { setForm(p => ({ ...p, first_time_jobseeker: false, returning_ofw: false, returning_worker: true })) }}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-center transition-all ${form.returning_worker ? 'border-amber-700 bg-amber-50 shadow-sm' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold bg-amber-100 text-amber-700">â†©</span>
              <div>
                <p className="text-sm font-bold">Returning Worker</p>
                <p className="text-xs text-slate-500">Worked outside province and returned</p>
              </div>
              {form.returning_worker && <span className="rounded-full bg-amber-700 px-2.5 py-0.5 text-[10px] font-bold text-white">SELECTED</span>}
            </button>
          </div>

          {/* First-time details */}
          {form.first_time_jobseeker && <div className="mt-5 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-100"><p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-700 text-[10px] text-white">1</span> First-time Jobseeker Details</p><div className="grid gap-4 sm:grid-cols-3"><Field label="School attended"><input type="text" value={form.first_time_school} onChange={(e) => handleChange('first_time_school', e.target.value)} className={inputCls} placeholder="e.g. CSU Carig"/></Field><Field label="Graduation year"><input type="text" inputMode="numeric" maxLength={4} value={form.first_time_graduation_year} onChange={(e) => { let v = e.target.value.replace(/\D/g, '').slice(0, 4); handleChange('first_time_graduation_year', v) }} className={inputCls} placeholder="e.g. 2020"/></Field><Field label="OJT / internship experience"><input type="text" value={form.first_time_ojt_experience} onChange={(e) => handleChange('first_time_ojt_experience', e.target.value)} className={inputCls} placeholder="e.g. 200 hrs at LGU"/></Field></div></div>}

          {/* OFW details */}
          {form.returning_ofw && <div className="mt-5 rounded-xl bg-purple-50 p-4 ring-1 ring-purple-100"><p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-700 text-[10px] text-white">âœˆ</span> Returning OFW Details</p><div className="grid gap-4 sm:grid-cols-2"><Field label="Country last worked"><input type="text" value={form.ofw_country_last_worked} onChange={(e) => handleChange('ofw_country_last_worked', e.target.value)} className={inputCls} placeholder="e.g. Japan, UAE, Saudi Arabia"/></Field><Field label="Previous employer"><input type="text" value={form.ofw_previous_employer} onChange={(e) => handleChange('ofw_previous_employer', e.target.value)} className={inputCls} placeholder="Company name"/></Field><Field label="Previous occupation"><input type="text" value={form.ofw_previous_occupation} onChange={(e) => handleChange('ofw_previous_occupation', e.target.value)} className={inputCls} placeholder="Job title abroad"/></Field><Field label="Years abroad"><input type="text" inputMode="numeric" maxLength={2} value={form.ofw_years_abroad} onChange={(e) => { let v = e.target.value.replace(/\D/g, '').slice(0, 2); handleChange('ofw_years_abroad', v) }} className={inputCls} placeholder="e.g. 3"/></Field><Field label="Date returned"><input type="date" value={form.ofw_date_returned} onChange={(e) => handleChange('ofw_date_returned', e.target.value)} className={inputCls}/></Field><Field label="Reason for return"><input type="text" value={form.ofw_reason_for_return} onChange={(e) => handleChange('ofw_reason_for_return', e.target.value)} className={inputCls} placeholder="e.g. Contract ended, family, medical"/></Field></div></div>}

          {/* Worker details */}
          {form.returning_worker && <div className="mt-5 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100"><p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-700 text-[10px] text-white">â†©</span> Returning Worker Details</p><div className="grid gap-4 sm:grid-cols-2"><Field label="Previous work location"><input type="text" value={form.rw_previous_work_location} onChange={(e) => handleChange('rw_previous_work_location', e.target.value)} className={inputCls} placeholder="e.g. Manila, Cavite, Baguio"/></Field><Field label="Previous employer"><input type="text" value={form.rw_previous_employer} onChange={(e) => handleChange('rw_previous_employer', e.target.value)} className={inputCls} placeholder="Company name"/></Field><Field label="Previous occupation"><input type="text" value={form.rw_previous_occupation} onChange={(e) => handleChange('rw_previous_occupation', e.target.value)} className={inputCls} placeholder="Job title"/></Field><Field label="Years worked"><input type="text" inputMode="numeric" maxLength={2} value={form.rw_years_worked} onChange={(e) => { let v = e.target.value.replace(/\D/g, '').slice(0, 2); handleChange('rw_years_worked', v) }} className={inputCls} placeholder="e.g. 5"/></Field><Field label="Date returned"><input type="date" value={form.rw_date_returned} onChange={(e) => handleChange('rw_date_returned', e.target.value)} className={inputCls}/></Field><Field label="Reason for return"><input type="text" value={form.rw_reason_for_return} onChange={(e) => handleChange('rw_reason_for_return', e.target.value)} className={inputCls} placeholder="e.g. Contract ended, family, relocation"/></Field></div></div>}

          <div className="mt-6"><Check label="Interested in skills training" checked={form.interested_in_skills_training} onChange={(v) => handleChange('interested_in_skills_training', v)} /></div>
          {form.interested_in_skills_training && (
            <Field label="Preferred training program">
              <input type="text" value={form.preferred_training_program} onChange={(e) => handleChange('preferred_training_program', e.target.value)} className={inputCls} />
            </Field>
          )}
          <div className="mt-4">
            <Check label="Person with disability" checked={form.has_disability} onChange={(v) => handleChange('has_disability', v)} />
            {form.has_disability && (
              <Field label="Disability type">
                <input type="text" value={form.disability_type} onChange={(e) => handleChange('disability_type', e.target.value)} className={inputCls} placeholder="Please input what is indicated in your PWD ID" />
              </Field>
            )}
          </div>
          <p className="mt-5 text-sm font-medium">PESO assistance programs</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {assistancePrograms.map((program) => (
              <Check key={program} label={program} checked={form.peso_assistance_programs.includes(program)} onChange={() => togglePesoProgram(program)} />
            ))}
          </div>
        </Section>

        {/* Education and preference */}
        <Section title="Education and preference">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Highest educational attainment">
              <select value={form.highest_educational_attainment} onChange={(e) => handleChange('highest_educational_attainment', e.target.value)} className={inputCls}>
                <option value="">Select educational attainment</option>
                {educationalAttainmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Course / program">
              <input
                list="walkin-course-suggestions"
                disabled={isElemOrJuniorHigh}
                value={form.course_program}
                onChange={(e) => handleChange('course_program', e.target.value)}
                placeholder={isElemOrJuniorHigh ? 'Not applicable for Elementary / Junior High' : 'Select or type course / program / strand'}
                className={`${inputCls} ${isElemOrJuniorHigh ? 'cursor-not-allowed bg-slate-100 text-slate-400' : ''}`}
              />
              {!isElemOrJuniorHigh && courseSuggestions.length > 0 && (
                <datalist id="walkin-course-suggestions">
                  {courseSuggestions.map((item) => <option key={item} value={item} />)}
                </datalist>
              )}
              {isPostgraduate && <p className="mt-1.5 text-xs font-medium text-blue-700">Please spell out your degree (e.g., Master of Arts in Education).</p>}
            </Field>
            <Field label="Employment preference">
              <select value={form.employment_preference} onChange={(e) => handleChange('employment_preference', e.target.value)} className={inputCls}>
                <option value="Local">Local</option>
                <option value="Overseas">Overseas</option>
                <option value="Both">Both</option>
              </select>
            </Field>
            <Field label="Interview location">
              <input value={form.interview_location} onChange={(e) => handleChange('interview_location', e.target.value)} placeholder="Preferred location, if applicable" className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* Preferred vacancies */}
        <Section title="Preferred job vacancies (optional)">
          {!safeVacancies.length ? (
            <p className="text-sm text-slate-500">No active vacancies have been posted for this event.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {safeVacancies.map((vac) => {
                const def = vac.vacancy_definitions ?? {}
                return (
                  <label key={vac.id} className="flex cursor-pointer gap-3 rounded-lg border-2 border-slate-900 bg-white p-3.5 pixel-shadow-sm">
                    <input type="checkbox" checked={form.selected_vacancies.includes(vac.id)} onChange={() => handleVacancyToggle(vac.id)} className="mt-0.5 h-5 w-5 accent-blue-700 shrink-0" />
                    <span>
                      <span className="block font-medium">{def.position}</span>
                      <span className="block text-sm text-slate-600">{def.company_name}{def.place_of_assignment ? ` · ${def.place_of_assignment}` : ''}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </Section>

        <button
          type="submit"
          disabled={submitting}
          className={`${BTN} w-full bg-amber-400 py-3.5 text-slate-900 text-base disabled:opacity-60`}
        >
          {submitting ? 'Registering & Checking in...' : 'Register Walk-in & Check-In Now'}
        </button>
      </form>
    </div>
  )
}

function Section({ title, children }) {
  return <fieldset className="border-b border-slate-200 pb-7 last:border-0 last:pb-0"><legend className="mb-4 text-lg font-bold">{title}</legend>{children}</fieldset>
}

function Field({ label, children }) {
  return <label className="block text-sm font-medium text-slate-700">{label}{children}</label>
}

function Check({ label, checked, onChange, disabled = false }) {
  return (
    <label className={`flex items-center gap-2 text-sm text-slate-700 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="h-5 w-5 accent-blue-700" />
      {label}
    </label>
  )
}