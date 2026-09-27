import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { participantService } from '../../services/participantService'
import { eventService } from '../../services/eventService'
import { eventVacancyService } from '../../services/eventVacancyService'
import { supabase } from '../../lib/supabase'
import { INTRO_KEY } from '../../components/public/JobSeekerIntro'
import { eventTypeDisplay } from '../../domain/eventTypes'
import { readQuestReturn, clearQuestReturn } from '../../lib/questReturn'
import { PixelStar, PixelBriefcase, PixelArrow } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'

// Lightweight discovery answers saved by the public Quest Board intro.
const PREFERENCE_MAP = { local: 'Local', overseas: 'Overseas', exploring: 'Both' }
const jobSeekerIntro = (() => {
  try {
    return JSON.parse(localStorage.getItem(INTRO_KEY) || 'null')
  } catch {
    return null
  }
})()

// The Quest the applicant came from (preserved across Google OAuth).
const questReturn = readQuestReturn()

const assistancePrograms = ['Career Coaching', 'Employment Facilitation', 'Livelihood Assistance', 'Skills Training', 'Overseas Employment Assistance', 'Special Program for Employment for Students (SPES)', 'Special Program for Assistance to Students (SPAS)', 'Government Internship Program (GIP)']

const assistanceProgramDescriptions = {
  'Special Program for Employment for Students (SPES)': 'DOLE youth employment-bridging program providing 20 days of temporary summer work for underprivileged but deserving students.',
  'Special Program for Assistance to Students (SPAS)': 'Province-initiated program providing 10 days of temporary work for underprivileged students in their own colleges or universities.',
  'Government Internship Program (GIP)': 'DOLE program placing fresh graduates in local or national government offices.',
}

const SPECIAL_SECTOR_OPTIONS = [
  { code: 'pwd', label: 'Person with Disability (PWD)', desc: 'Any form of physical, sensory, intellectual, or psychosocial disability' },
  { code: 'indigenous_person', label: 'Indigenous Person', desc: 'Member of an indigenous cultural community' },
  { code: '4ps_beneficiary', label: '4Ps Beneficiary', desc: 'Household beneficiary of Pantawid Pamilyang Pilipino Program' },
  { code: 'solo_parent', label: 'Solo Parent', desc: 'Raising children without a spouse or partner' },
  { code: 'displaced_ofw', label: 'Displaced OFW', desc: 'Repatriated or displaced overseas worker' },
  { code: 'displaced_worker', label: 'Displaced Worker', desc: 'Displaced from employment due to restructuring, disaster, or other causes' },
]

const STUDENT_EDUCATION_LEVELS = [
  'Junior High School Level', 'Senior High School Level', 'TVET Course',
  'College Level',
]

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

const shsStrands = [
  'STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'Academic', 'Technical-Professional (TechPro)'
]

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

const employmentStatusOptions = [
  'Unemployed', 'Fresh Graduate', 'Currently Employed', 'Self-Employed',
  'Student', 'Returning OFW', 'Homemaker', 'Not specified'
]

const contactSchema = z.string().trim()
  .regex(/^[0-9]+$/, 'Contact number must contain numbers only')
  .superRefine((val, ctx) => {
    const clean = val.replace(/\D/g, '')
    if (clean.startsWith('09')) {
      if (clean.length !== 11) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Contact number starting with 09 must be exactly 11 digits' })
      }
    } else if (clean.startsWith('9')) {
      if (clean.length !== 10) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Contact number starting with 9 must be exactly 10 digits' })
      }
    } else if (clean.length < 7 || clean.length > 11) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid contact number' })
    }
  })

// Philippine industry categories (shared by Previous industry + Desired industry).
const INDUSTRY_OPTIONS = [
  'Agriculture, Forestry & Fishing',
  'Mining & Quarrying',
  'Manufacturing',
  'Electricity, Gas, Steam & Air Conditioning',
  'Water Supply & Waste Management',
  'Construction',
  'Wholesale & Retail Trade',
  'Transportation & Storage',
  'Accommodation & Food Service',
  'Information & Communication (BPO / IT)',
  'Financial & Insurance Activities',
  'Real Estate Activities',
  'Professional, Scientific & Technical',
  'Administrative & Support Services',
  'Public Administration & Defense',
  'Education',
  'Human Health & Social Work',
  'Arts, Entertainment & Recreation',
  'Other Service Activities',
  'Households as Employers',
  'Overseas Employment'
].sort()

// Training programs across TESDA / DTI / DICT / CSC and partner providers.
const TRAINING_PROGRAM_OPTIONS = [
  'TESDA — Automotive Servicing NC II',
  'TESDA — Bookkeeping NC III',
  'TESDA — Bread and Pastry Production NC II',
  'TESDA — Caregiving NC II',
  'TESDA — Computer Systems Servicing NC II',
  'TESDA — Contact Center Services NC II',
  'TESDA — Cookery NC II',
  'TESDA — Electrical Installation and Maintenance NC II',
  'TESDA — Events Management Services NC III',
  'TESDA — Food and Beverage Services NC II',
  'TESDA — Housekeeping NC II',
  'TESDA — Shielded Metal Arc Welding (SMAW) NC I / NC II',
  'TESDA — Driving NC II',
  'TESDA — Hilot (Wellness Massage) NC II',
  'TESDA — Organic Agriculture Production NC II',
  'DTI — Digital Marketing Essentials',
  'DTI — Financial Literacy / Negosyo Seminar',
  'DTI — Product Development & Packaging',
  'DICT — Digital Jobs PH (FreeLancing 101, Digital Skills)',
  'DICT — Basic Computer Literacy',
  'CSC — Philippine Civil Service Review',
  'DOLE — Skills for Employment Scholarship Program',
  'DOLE — Tulong Panghanapbuhay (TUPAD) Training',
  'DOLE — Government Internship Program (GIP) Orientation',
  'PESO — Pre-Employment Orientation Seminar (PEOS)',
  'PESO — Career Coaching / Guidance',
  'Other / Not listed'
]

// Country suggestions for Returning OFW. Users may still enter a custom value.
const OFW_COUNTRY_OPTIONS = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast',
  'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar',
  'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe', 'Hong Kong', 'Macau'
].sort()

// Suggest skills based on the selected previous occupation.
const SKILLS_BY_OCCUPATION = {
  'sales': ['Customer service', 'Negotiation', 'Point-of-sale (POS)', 'Product knowledge', 'CRM software', 'Inventory'],
  'clerk': ['Data entry', 'MS Office', 'Filing & records', 'Typing', 'Bookkeeping basics', 'Email correspondence'],
  'driver': ['Professional driver license', 'Vehicle maintenance', 'Route planning', 'Defensive driving', 'GPS navigation'],
  'welder': ['SMAW / MIG / TIG welding', 'Blueprint reading', 'Metal fabrication', 'Safety compliance'],
  'cook': ['Food preparation', 'Kitchen safety', 'Menu planning', 'Food handling & sanitation', 'Plating'],
  'caregiver': ['Patient care', 'Vital signs monitoring', 'First aid / CPR', 'Elderly care', 'Medication reminders'],
  'construction': ['Heavy lifting', 'Power tools', 'Scaffolding safety', 'Blueprints', 'Masonry / carpentry'],
  'factory': ['Machine operation', 'Quality control', 'Assembly line', 'Safety protocols', 'Basic troubleshooting'],
  'teacher': ['Lesson planning', 'Classroom management', 'Curriculum design', 'Facilitation', 'Assessment'],
  'nurse': ['Patient assessment', 'Medication administration', 'Electronic health records', 'Care planning'],
  'accounting': ['Bookkeeping', 'Payroll', 'Financial reporting', 'QuickBooks / accounting software', 'Tax basics'],
  'call center': ['English communication', 'Typing speed', 'CRM / ticketing tools', 'Active listening', 'Complaint handling'],
  'virtual': ['MS Office', 'Scheduling & calendar management', 'Email management', 'Social media management', 'Data entry'],
  'bartender': ['Mixology', 'Customer service', 'Cash handling', 'Sanitation'],
  'sewing': ['Sewing machine operation', 'Pattern reading', 'Quality inspection', 'Fabric handling'],
}

function skillsForOccupation(occupation) {
  const key = Object.keys(SKILLS_BY_OCCUPATION).find(k => (occupation || '').toLowerCase().includes(k))
  return key ? SKILLS_BY_OCCUPATION[key] : []
}

// event_id is only required when registering for a specific Quest.
function buildSchema(isQuestMode, maxYearsByAge = 99) {
  return z.object({
    first_name: z.string().trim().min(1, 'First name is required'),
    middle_name: z.string(),
    last_name: z.string().trim().min(1, 'Last name is required'),
    birthdate: z.string().min(1, 'Birthdate is required'),
    sex: z.string().min(1, 'Please select an option'),
    civil_status: z.string(),
    barangay: z.string().trim().min(1, 'Barangay is required'),
    municipality_city: z.string().trim().min(1, 'City / municipality is required'),
    province: z.string().trim().min(1, 'Province is required'),
    contact_no: contactSchema,
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address containing "@"'),
    current_employment_status: z.string(),
    previous_occupation: z.string(),
    previous_industry: z.string(),
    years_of_experience: z.string(),
    skills: z.string(),
    desired_occupation: z.string(),
    desired_industry: z.string(),
    desired_salary: z.string(),
    willing_to_relocate: z.boolean(),
    accommodation_needed: z.string(),
    employment_accommodation_notes: z.string(),
    first_time_jobseeker: z.boolean(),
    first_time_school: z.string(),
    first_time_graduation_year: z.string().refine(
      (val) => {
        if (!val) return true
        if (!/^\d{4}$/.test(val)) return false
        const yr = parseInt(val, 10)
        const current = new Date().getFullYear()
        return yr >= current - 100 && yr <= current
      },
      { message: 'Enter a valid 4-digit graduation year within the past 100 years' }
    ),
    first_time_ojt_experience: z.string(),
    returning_ofw: z.boolean(),
    returning_worker: z.boolean(),
    experienced_worker: z.boolean(),
    ofw_country_last_worked: z.string(),
    ofw_previous_employer: z.string(),
    ofw_previous_occupation: z.string(),
    ofw_years_abroad: z.string().refine(
      (val) => {
        if (!val) return true
        if (!/^\d{1,2}$/.test(val)) return false
        return parseInt(val, 10) <= Math.min(99, maxYearsByAge)
      },
      { message: 'Years abroad must be at most 2 digits and below your age minus 10' }
    ),
    ofw_date_returned: z.string(),
    ofw_reason_for_return: z.string(),
    rw_previous_work_location: z.string(),
    rw_previous_employer: z.string(),
    rw_previous_occupation: z.string(),
    rw_years_worked: z.string().refine(
      (val) => {
        if (!val) return true
        if (!/^\d{1,2}$/.test(val)) return false
        return parseInt(val, 10) <= Math.min(99, maxYearsByAge)
      },
      { message: 'Years worked must be at most 2 digits and below your age minus 10' }
    ),
    rw_date_returned: z.string(),
    rw_reason_for_return: z.string(),
    interested_in_skills_training: z.boolean(),
    preferred_training_program: z.string(),
    has_disability: z.boolean(),
    disability_type: z.string(),
    peso_assistance_programs: z.array(z.string()),
    highest_educational_attainment: z.string().min(1, 'Select your highest educational attainment'),
    course_program: z.string(),
    interview_location: z.string(),
    special_sectors: z.array(z.string()),
    is_currently_student: z.boolean(),
    current_school_name: z.string(),
    current_education_level: z.string(),
    current_grade_year_level: z.string(),
    current_program_or_strand: z.string(),
    expected_graduation_year: z.string().refine(
      (val) => {
        if (!val) return true
        if (!/^\d{4}$/.test(val)) return false
        const yr = parseInt(val, 10)
        const current = new Date().getFullYear()
        return yr >= current - 10 && yr <= current + 10
      },
      { message: 'Enter a valid 4-digit year' }
    ),
    data_subject_rights_agreed: z.literal(true, { error: 'Consent under the Data Privacy Act of 2012 (RA 10173) is required' }),
    ...(isQuestMode ? { event_id: z.string().uuid('Please choose an event') } : {}),
  })
}

const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100'

function ensureArray(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

export default function RegisterPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [events, setEvents] = useState([])
  const [vacancies, setVacancies] = useState([])
  const [selectedVacancies, setSelectedVacancies] = useState([])
  const [provinces, setProvinces] = useState([])
  const [municipalities, setMunicipalities] = useState([])
  const [barangays, setBarangays] = useState([])
  const [loading, setLoading] = useState(true)
  const [profileRow, setProfileRow] = useState(undefined) // undefined = loading, null = none yet
  const [step, setStep] = useState('edit') // edit -> review -> saved
  const [reviewData, setReviewData] = useState(null)

  // Profile Setup unless arriving from a Quest (?event= or preserved return state).
  const searchEvent = searchParams.get('event') || ''
  const isQuestMode = Boolean(questReturn?.returnTo || searchEvent)

  const form = useForm({
    defaultValues: {
      first_name: '',
      middle_name: '',
      last_name: '',
      birthdate: '',
      sex: '',
      civil_status: '',
      barangay: '',
      municipality_city: '',
      province: '',
      contact_no: '',
      email: user?.email ?? '',
      current_employment_status: '',
      previous_occupation: '',
      previous_industry: '',
      years_of_experience: '',
      skills: '',
      desired_occupation: '',
      desired_industry: '',
      desired_salary: '',
      willing_to_relocate: false,
      accommodation_needed: '',
      employment_accommodation_notes: '',
      first_time_jobseeker: false,
      first_time_school: '',
      first_time_graduation_year: '',
      first_time_ojt_experience: '',
      returning_ofw: false,
      returning_worker: false,
      experienced_worker: false,
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
      employment_preference: PREFERENCE_MAP[jobSeekerIntro?.preference] ?? 'Local',
      highest_educational_attainment: '',
      course_program: '',
      interview_location: '',
      special_sectors: [],
      is_currently_student: false,
      current_school_name: '',
      current_education_level: '',
      current_grade_year_level: '',
      current_program_or_strand: '',
      expected_graduation_year: '',
      data_subject_rights_agreed: false,
      event_id: searchEvent,
    },
  })
  const { register, handleSubmit, watch, setError, setValue, reset, formState: { errors, isSubmitting, dirtyFields } } = form

  // Subscribe to dirty fields so delayed profile hydration preserves edits.
  void dirtyFields

  // Autofill from the Google account, then overlay anything already saved
  // in the participant's reusable profile (never an event registration).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const meta = user.user_metadata ?? {}
    const google = {
      first_name: meta.given_name ?? '',
      last_name: meta.family_name ?? '',
      email: user.email ?? '',
    }
    ;(async () => {
      const pData = await participantService.getOrCreateParticipant().catch(() => null)
      const row = pData ? await participantService.fetchJobseekerProfile(pData.id).catch(() => null) : null
      // Load special sectors for this participant
      let savedSectors = []
      if (pData) {
        const { data: sectorRows } = await supabase
          .from('jobseeker_special_sectors')
          .select('special_worker_sectors(code)')
          .eq('participant_id', pData.id)
        savedSectors = (sectorRows || []).map(r => r.special_worker_sectors?.code).filter(Boolean)
        if (row?.has_disability && !savedSectors.includes('pwd')) savedSectors.push('pwd')
      }
      if (cancelled) return
      setProfileRow(row)
      if (row) {
        // Saved data wins over Google hints; Google fills the gaps.
        reset({
          first_name: row.first_name || google.first_name,
          middle_name: row.middle_name || '',
          last_name: row.last_name || google.last_name,
          birthdate: row.birthdate || '',
          sex: row.sex || '',
          civil_status: row.civil_status || '',
          barangay: row.barangay || '',
          municipality_city: row.municipality_city || '',
          province: row.province || '',
          contact_no: row.contact_no || '',
          email: row.email || google.email,
          current_employment_status: row.current_employment_status || '',
          previous_occupation: row.previous_occupation || '',
          previous_industry: row.previous_industry || '',
          years_of_experience: row.years_of_experience != null ? String(row.years_of_experience) : '',
          skills: row.skills || '',
          desired_occupation: row.desired_occupation || '',
          desired_industry: row.desired_industry || '',
          desired_salary: row.desired_salary || '',
          willing_to_relocate: !!row.willing_to_relocate,
          accommodation_needed: row.accommodation_needed || '',
          employment_accommodation_notes: row.employment_accommodation_notes || '',
          first_time_jobseeker: !!row.first_time_jobseeker,
          first_time_school: row.first_time_school || '',
          first_time_graduation_year: row.first_time_graduation_year != null ? String(row.first_time_graduation_year) : '',
          first_time_ojt_experience: row.first_time_ojt_experience || '',
          returning_ofw: !!row.returning_ofw,
          returning_worker: !!row.returning_worker,
          experienced_worker: !!row.experienced_worker,
          ofw_country_last_worked: row.ofw_country_last_worked || '',
          ofw_previous_employer: row.ofw_previous_employer || '',
          ofw_previous_occupation: row.ofw_previous_occupation || '',
          ofw_years_abroad: row.ofw_years_abroad != null ? String(row.ofw_years_abroad) : '',
          ofw_date_returned: row.ofw_date_returned || '',
          ofw_reason_for_return: row.ofw_reason_for_return || '',
          rw_previous_work_location: row.rw_previous_work_location || '',
          rw_previous_employer: row.rw_previous_employer || '',
          rw_previous_occupation: row.rw_previous_occupation || '',
          rw_years_worked: row.rw_years_worked != null ? String(row.rw_years_worked) : '',
          rw_date_returned: row.rw_date_returned || '',
          rw_reason_for_return: row.rw_reason_for_return || '',
          interested_in_skills_training: !!row.interested_in_skills_training || (row.peso_assistance_programs ?? []).includes('Skills Training'),
          preferred_training_program: row.preferred_training_program || '',
          has_disability: !!row.has_disability,
          disability_type: row.disability_type || '',
          peso_assistance_programs: (row.peso_assistance_programs ?? []).includes('Skills Training') || !row.interested_in_skills_training
            ? row.peso_assistance_programs ?? []
            : [...(row.peso_assistance_programs ?? []), 'Skills Training'],
          highest_educational_attainment: row.highest_educational_attainment || '',
          course_program: row.course_program || '',
          interview_location: row.interview_location || '',
          special_sectors: savedSectors,
          is_currently_student: !!row.is_currently_student,
          current_school_name: row.current_school_name || '',
          current_education_level: row.current_education_level || '',
          current_grade_year_level: row.current_grade_year_level || '',
          current_program_or_strand: row.current_program_or_strand || '',
          expected_graduation_year: row.expected_graduation_year != null ? String(row.expected_graduation_year) : '',
          data_subject_rights_agreed: true,
          event_id: searchEvent,
        }, { keepDirtyValues: true })
      } else if (google.first_name || google.last_name) {
        seedEmptyField('first_name', google.first_name)
        seedEmptyField('last_name', google.last_name)
        seedEmptyField('email', google.email)
        // Fall back to parsing the display name when split names are missing.
        if (!google.first_name && !google.last_name && meta.name) {
          const parts = meta.name.trim().split(/\s+/)
          seedEmptyField('first_name', parts[0] ?? '')
          seedEmptyField('last_name', parts[parts.length - 1] ?? '')
          if (parts.length > 2) seedEmptyField('middle_name', parts.slice(1, -1).join(' '))
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { cancelled = true }
  }, [user?.id])

  // If the applicant already has a reusable profile AND came from a Quest,
  // skip setup entirely — they apply directly from the Quest page.
  useEffect(() => {
    if (!user || !questReturn?.returnTo || profileRow === undefined) return
    if (profileRow) {
      const returnTo = questReturn.returnTo
      clearQuestReturn()
      navigate(returnTo, { replace: true })
    }
  }, [user, profileRow, navigate])

  function seedEmptyField(name, value) {
    if (!value || form.getFieldState(name).isDirty || form.getValues(name)) return
    setValue(name, value, { shouldDirty: false })
  }

  const eventId = watch('event_id')
  const assistanceProgramsSelected = watch('peso_assistance_programs') || []
  const trainingWanted = assistanceProgramsSelected.includes('Skills Training')
  const firstTimeJobseeker = watch('first_time_jobseeker')
  const returningOfw = watch('returning_ofw')
  const returningWorker = watch('returning_worker')
  const experiencedWorker = watch('experienced_worker')
  const [showOfwCountrySuggestions, setShowOfwCountrySuggestions] = useState(false)
  const ofwCountryQuery = watch('ofw_country_last_worked') || ''
  const filteredOfwCountries = useMemo(() => OFW_COUNTRY_OPTIONS
    .filter(country => country.toLowerCase().includes(ofwCountryQuery.toLowerCase()))
    .slice(0, 8), [ofwCountryQuery])
  const birthdate = watch('birthdate')
  const province = watch('province')
  const municipality = watch('municipality_city')
  const barangay = watch('barangay')
  const contactNo = watch('contact_no') ?? ''
  const previousOccupation = watch('previous_occupation')
  const highestEducationalAttainment = watch('highest_educational_attainment')
  const specialSectors = watch('special_sectors')
  const isCurrentlyStudent = watch('is_currently_student')
  const currentEducationLevel = watch('current_education_level')
  const currentProgramOrStrand = watch('current_program_or_strand')

  useEffect(() => {
    if (isCurrentlyStudent) seedEmptyField('current_employment_status', 'Student')
  }, [isCurrentlyStudent, setValue, form])


  const isReturning = returningOfw || returningWorker
  const age = (() => { if (!birthdate) return null; const d = new Date(birthdate); if (isNaN(d)) return null; const now = new Date(); return now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0) })()
  const maxYearsByAge = age != null ? Math.max(0, Math.min(99, age - 10)) : 99

  const cleanContact = contactNo.replace(/\D/g, '')
  const contactMaxLen = cleanContact.startsWith('9') && !cleanContact.startsWith('09') ? 10 : 11

  const isElemOrJuniorHigh = [
    'Elementary', 'Junior High School Level', 'Junior High School Graduate'
  ].includes(highestEducationalAttainment)
  const isSeniorHigh = ['Senior High School Level', 'Senior High School Graduate'].includes(highestEducationalAttainment)
  const isTesda = [
    'TVET Course', 'TESDA National Certificate I', 'TESDA National Certificate II',
    'TESDA National Certificate III', 'TESDA National Certificate IV', 'TESDA Diploma Program'
  ].includes(highestEducationalAttainment)
  const isCollegeOrBachelor = ['College Level', "Bachelor's Degree Graduate"].includes(highestEducationalAttainment)
  const isPostgraduate = [
    "Master's Degree Candidate/ Graduate", "Doctor's Degree/ PhD Candidate/ Graduate"
  ].includes(highestEducationalAttainment)
  const schoolAttendedLabel = isTesda
    ? 'Training Institution Attended'
    : isCollegeOrBachelor || isPostgraduate
      ? 'University/College Attended'
      : 'School Attended'

  const currentSchoolName = watch('current_school_name') || ''


  useEffect(() => {
    if (!isCurrentlyStudent) return
    seedEmptyField('highest_educational_attainment', currentEducationLevel)
    seedEmptyField('course_program', currentProgramOrStrand)
  }, [isCurrentlyStudent, currentEducationLevel, currentProgramOrStrand, setValue, watch])

  useEffect(() => {
    if (!isCurrentlyStudent) return
    seedEmptyField('first_time_school', currentSchoolName)
  }, [isCurrentlyStudent, currentSchoolName, setValue])

  const hasDisability = (specialSectors || []).includes('pwd')

  const courseSuggestions = useMemo(() => {
    if (isSeniorHigh) return shsStrands
    if (isTesda) return tesdaCourses
    if (isCollegeOrBachelor) return bachelorsCourses
    return []
  }, [isSeniorHigh, isTesda, isCollegeOrBachelor])

  useEffect(() => {
    let alive = true
    eventService.listActive()
      .then((rows) => { if (alive) { setEvents(ensureArray(rows)); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    async function loadProvinces() {
      const urls = [
        'https://psgc.cloud/api/v2/provinces',
        'https://psgc.gitlab.io/philippine-addresses/api/provinces.json'
      ]
      for (const url of urls) {
        try {
          const res = await fetch(url)
          if (res.ok) {
            const json = await res.json()
            const list = ensureArray(json)
            if (list.length > 0) { setProvinces(list); return }
          }
        } catch (err) {
          console.warn(`Failed fetching provinces from ${url}:`, err)
        }
      }
      setProvinces([])
      toast.error('Could not load the province list. Please refresh and try again.')
    }
    void loadProvinces()
  }, [])

  useEffect(() => {
    setMunicipalities([])
    setBarangays([])

    const provincesList = ensureArray(provinces)
    const selectedProvince = provincesList.find((item) => item?.name === province)
    if (!selectedProvince?.code) return

    async function loadMunicipalities() {
      const code = encodeURIComponent(selectedProvince.code)
      const urls = [
        `https://psgc.cloud/api/v2/provinces/${code}/cities-municipalities`,
        `https://psgc.gitlab.io/philippine-addresses/api/provinces/${code}/cities-municipalities.json`
      ]
      for (const url of urls) {
        try {
          const res = await fetch(url)
          if (res.ok) {
            const json = await res.json()
            const list = ensureArray(json)
            if (list.length > 0) { setMunicipalities(list); return }
          }
        } catch (err) {
          console.warn(`Failed fetching municipalities from ${url}:`, err)
        }
      }
      setMunicipalities([])
      toast.error('Could not load cities and municipalities. Please try again.')
    }
    void loadMunicipalities()
  }, [province, provinces, setValue])

  useEffect(() => {
    setBarangays([])

    const municipalitiesList = ensureArray(municipalities)
    const selectedMunicipality = municipalitiesList.find((item) => item?.name === municipality)
    if (!selectedMunicipality?.code) return

    async function loadBarangays() {
      const code = encodeURIComponent(selectedMunicipality.code)
      const urls = [
        `https://psgc.cloud/api/v2/cities-municipalities/${code}/barangays`,
        `https://psgc.gitlab.io/philippine-addresses/api/cities-municipalities/${code}/barangays.json`
      ]
      for (const url of urls) {
        try {
          const res = await fetch(url)
          if (res.ok) {
            const json = await res.json()
            const list = ensureArray(json)
            if (list.length > 0) { setBarangays(list); return }
          }
        } catch (err) {
          console.warn(`Failed fetching barangays from ${url}:`, err)
        }
      }
      setBarangays([])
      toast.error('Could not load barangays. Please try again.')
    }
    void loadBarangays()
  }, [municipality, municipalities, setValue])


  useEffect(() => {
    setSelectedVacancies([])
    if (!eventId) { setVacancies([]); return }
    let alive = true
    eventVacancyService.listActiveForEvent(eventId)
      .then((rows) => { if (alive) setVacancies(ensureArray(rows)) })
      .catch((err) => { if (alive) toast.error(`Could not load vacancies: ${err.message}`) })
    return () => { alive = false }
  }, [eventId])

  const safeEvents = useMemo(() => ensureArray(events), [events])
  const safeProvinces = useMemo(() => ensureArray(provinces), [provinces])
  const safeMunicipalities = useMemo(() => ensureArray(municipalities), [municipalities])
  const safeBarangays = useMemo(() => ensureArray(barangays), [barangays])
  const safeVacancies = useMemo(() => ensureArray(vacancies), [vacancies])

  const chosenEvent = useMemo(() => safeEvents.find((event) => event?.id === eventId), [safeEvents, eventId])

  useEffect(() => {
    seedEmptyField('interview_location', chosenEvent?.location)
  }, [chosenEvent, setValue])

  function toggleVacancy(id) { setSelectedVacancies((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) }

  function toggleSector(code) {
    const current = form.getValues('special_sectors') || []
    const next = current.includes(code) ? current.filter(c => c !== code) : [...current, code]
    setValue('special_sectors', next)
    if (code === 'pwd') setValue('has_disability', next.includes('pwd'))
  }

  function toggleAssistanceProgram(program) {
    const current = form.getValues('peso_assistance_programs') || []
    const next = current.includes(program) ? current.filter(value => value !== program) : [...current, program]
    setValue('peso_assistance_programs', next, { shouldDirty: true, shouldTouch: true })
    if (program === 'Skills Training') setValue('interested_in_skills_training', next.includes(program), { shouldDirty: true, shouldTouch: true })
  }

  // ---------- STEP 1: validate + move to review ----------
  function goReview(values) {
    const checked = buildSchema(isQuestMode, maxYearsByAge).safeParse(values)
    if (!checked.success) {
      checked.error.issues.forEach((issue) => setError(issue.path[0], { message: issue.message }))
      toast.error('Please complete the highlighted fields.')
      // Long form — bring the first problem field into view instead of
      // making jobseekers hunt for it.
      requestAnimationFrame(() => {
        document.querySelector('span.text-red-600')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }
    setReviewData(checked.data)
    setStep('review')
    window.scrollTo({ top: 0 })
  }

  // ---------- STEP 2: confirmed — persist ----------
  async function confirmSave() {
    if (!reviewData) return
    setSubmittingGuard(true)
    try {
      const v = reviewData
      // Shared profile payload (never overwrites event/check-in fields).
      const basePayload = {
        first_name: v.first_name,
        middle_name: v.middle_name || null,
        last_name: v.last_name,
        birthdate: v.birthdate || null,
        sex: v.sex || null,
        civil_status: v.civil_status || null,
        barangay: v.barangay || null,
        municipality_city: v.municipality_city || null,
        province: v.province || null,
        contact_no: v.contact_no || null,
        email: v.email,
        current_employment_status: v.current_employment_status || profileRow?.current_employment_status || null,
        previous_occupation: v.previous_occupation || profileRow?.previous_occupation || null,
        previous_industry: v.previous_industry || profileRow?.previous_industry || null,
        years_of_experience: v.years_of_experience ? parseInt(v.years_of_experience, 10) : profileRow?.years_of_experience ?? null,
        skills: v.skills || profileRow?.skills || null,
        desired_occupation: v.desired_occupation || profileRow?.desired_occupation || null,
        desired_industry: v.desired_industry || profileRow?.desired_industry || null,
        desired_salary: v.desired_salary || profileRow?.desired_salary || null,
        willing_to_relocate: v.willing_to_relocate ?? profileRow?.willing_to_relocate ?? false,
        accommodation_needed: v.accommodation_needed || null,
        employment_accommodation_notes: v.employment_accommodation_notes || null,
        first_time_jobseeker: v.first_time_jobseeker,
        first_time_school: v.first_time_school || null,
        first_time_graduation_year: v.first_time_graduation_year ? parseInt(v.first_time_graduation_year, 10) : null,
        first_time_ojt_experience: v.first_time_ojt_experience || null,
        returning_ofw: v.returning_ofw,
        returning_worker: v.returning_worker,
        experienced_worker: v.experienced_worker,
        ofw_country_last_worked: v.ofw_country_last_worked || null,
        ofw_previous_employer: v.ofw_previous_employer || null,
        ofw_previous_occupation: v.ofw_previous_occupation || null,
        ofw_years_abroad: v.ofw_years_abroad ? parseFloat(v.ofw_years_abroad) : null,
        ofw_date_returned: v.ofw_date_returned || null,
        ofw_reason_for_return: v.ofw_reason_for_return || null,
        rw_previous_work_location: v.rw_previous_work_location || null,
        rw_previous_employer: v.rw_previous_employer || null,
        rw_previous_occupation: v.rw_previous_occupation || null,
        rw_years_worked: v.rw_years_worked ? parseFloat(v.rw_years_worked) : null,
        rw_date_returned: v.rw_date_returned || null,
        rw_reason_for_return: v.rw_reason_for_return || null,
        interested_in_skills_training: v.interested_in_skills_training,
        preferred_training_program: v.preferred_training_program || null,
        has_disability: (v.special_sectors ?? []).includes('pwd'),
        disability_type: v.disability_type || null,
        peso_assistance_programs: v.peso_assistance_programs ?? [],
        highest_educational_attainment: v.highest_educational_attainment || null,
        course_program: v.course_program || null,
        interview_location: v.interview_location || null,
        data_subject_rights_agreed: true,
        special_sectors: v.special_sectors ?? [],
        is_currently_student: v.is_currently_student,
        current_school_name: v.current_school_name || null,
        current_education_level: v.current_education_level || null,
        current_grade_year_level: v.current_grade_year_level || null,
        current_program_or_strand: v.current_program_or_strand || null,
        expected_graduation_year: v.expected_graduation_year ? parseInt(v.expected_graduation_year, 10) : null,
      }

      const profilePayload = {
        ...basePayload,
      }
      await participantService.saveJobseekerProfile(profilePayload)

      toast.success(profileRow ? 'Your Job Seeker Profile has been updated!' : 'Your Job Seeker Profile has been created!')
      try { localStorage.removeItem(INTRO_KEY) } catch { /* ignore */ }

      if (isQuestMode) {
        if (questReturn?.returnTo) {
          const returnTo = questReturn.returnTo
          clearQuestReturn()
          navigate(returnTo, { replace: true })
        } else if (v.event_id) {
          navigate(`/events/${v.event_id}`, { replace: true })
        } else {
          setStep('saved')
        }
      } else {
        setStep('saved')
      }
    } catch (err) {
      toast.error(err?.message || 'Unable to save your profile. Please try again.')
    } finally {
      setSubmittingGuard(false)
    }
  }

  const [submittingGuard, setSubmittingGuard] = useState(false)
  const submitting = isSubmitting || submittingGuard
  // Reusable profiles are never locked by event check-in. Event-specific
  // check-in state lives on event_participations and does not affect this form.
  const profileLocked = false

  if (loading || profileRow === undefined) return <main className="grid min-h-screen place-items-center text-slate-600">Loading your profile…</main>

  // ---------- STEP 3: saved confirmation ----------
  if (step === 'saved') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-600">✓</span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Profile Saved!</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your Job Seeker Profile is ready. It will be reused every time you join a Quest — no need to fill this out again.
          </p>
          <button onClick={() => navigate('/')} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white hover:bg-blue-800">
            Explore the Quest Board <PixelArrow className="h-2.5 w-2.5" />
          </button>
          <Link to="/pass" className="mt-3 block w-full rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            View My Participant Pass
          </Link>
        </section>
      </main>
    )
  }

  // ---------- REVIEW STEP ----------
  if (step === 'review' && reviewData) {
    const d = reviewData
    const Row = ({ label, value }) => (
      <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 sm:flex-row sm:items-baseline sm:gap-3">
        <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400 sm:w-52">{label}</dt>
        <dd className="text-sm font-medium text-slate-800">{value || '—'}</dd>
      </div>
    )
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700"><PixelBriefcase className="h-3.5 w-3.5" /> Step 2 of 2 · Review</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Is this information correct?</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600">Please review your details carefully. Your profile is reused for every Quest you join.</p>

        <dl className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-700">Personal</p>
          <Row label="Full name" value={`${d.first_name} ${d.middle_name} ${d.last_name}`.replace(/\s+/g, ' ').trim()} />
          <Row label="Birthdate" value={d.birthdate} />
          <Row label="Sex" value={d.sex} />
          <Row label="Civil status" value={d.civil_status} />
          <Row label="Address" value={[d.barangay, d.municipality_city, d.province].filter(Boolean).join(', ')} />
          <Row label="Contact number" value={d.contact_no} />
          <Row label="Email" value={d.email} />

          <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-blue-700">Classification & Education</p>
          <Row label="First-time jobseeker" value={d.first_time_jobseeker ? 'Yes' : 'No'} />
          {d.first_time_jobseeker && <Row label="School" value={d.first_time_school ? `${d.first_time_school}${d.first_time_graduation_year ? ` (${d.first_time_graduation_year})` : ''}` : ''} />}
          <Row label="Returning OFW" value={d.returning_ofw ? 'Yes' : 'No'} />
          {d.returning_ofw && <Row label="OFW details" value={[d.ofw_country_last_worked ? `Country: ${d.ofw_country_last_worked}` : '', d.ofw_previous_employer ? `Employer: ${d.ofw_previous_employer}` : '', d.ofw_previous_occupation ? `Occupation: ${d.ofw_previous_occupation}` : '', d.ofw_years_abroad ? `${d.ofw_years_abroad} yr(s) abroad` : ''].filter(Boolean).join(' · ')} />}
          <Row label="Returning Worker" value={d.returning_worker ? 'Yes' : 'No'} />
          <Row label="Experienced Worker" value={d.experienced_worker ? 'Yes' : 'No'} />
          {d.returning_worker && <Row label="Worker details" value={[d.rw_previous_work_location ? `Location: ${d.rw_previous_work_location}` : '', d.rw_previous_employer ? `Employer: ${d.rw_previous_employer}` : '', d.rw_previous_occupation ? `Occupation: ${d.rw_previous_occupation}` : '', d.rw_years_worked ? `${d.rw_years_worked} yr(s) worked` : ''].filter(Boolean).join(' · ')} />}
          <Row label="Interested in training" value={d.interested_in_skills_training ? `Yes${d.preferred_training_program ? ` — ${d.preferred_training_program}` : ''}` : 'No'} />
          <Row label="Person with disability" value={d.has_disability ? `Yes${d.disability_type ? ` — ${d.disability_type}` : ''}${d.accommodation_needed ? ` · Accommodation: ${d.accommodation_needed}` : ''}` : 'No'} />
          <Row label="Education" value={d.highest_educational_attainment ? `${d.highest_educational_attainment}${d.course_program ? ` — ${d.course_program}` : ''}` : ''} />
          <Row label="Employment preference" value={d.employment_preference} />
          <Row label="PESO programs" value={(d.peso_assistance_programs ?? []).join(', ')} />
          {isQuestMode && <Row label="Quest / Event" value={safeEvents.find(e => e.id === d.event_id)?.event_name} />}
          {isQuestMode && selectedVacancies.length > 0 && <Row label="Selected opportunities" value={`${selectedVacancies.length} position(s)`} />}
        </dl>

        {/* Data Privacy Act of 2012 (RA 10173) notice */}
        <div className="mt-6 rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100">
          <p className="flex items-center gap-1.5 text-sm font-bold text-blue-900"><PixelStar className="h-3 w-3 text-amber-500" /> Data Privacy Notice — Republic Act No. 10173</p>
          <p className="mt-2 text-xs leading-relaxed text-blue-800">
            By confirming, you authorize the Provincial Public Employment Service Office (PPESO) to collect and process the personal
            information you provided solely for job-matching, referral, and employment-facilitation purposes, in accordance
            with the <strong>Data Privacy Act of 2012 (RA 10173)</strong>. Your data is kept secure and is shared only with
            participating employers for positions you applied to. You have the right to be informed, to object to processing,
            to access your data, to request rectification or erasure, and to claim compensation for damages pursuant to the Act.
            Questions may be directed to the PESO Provincial Office, Tuguegarao City, Cagayan.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button onClick={() => setStep('edit')} disabled={submitting} className="min-h-11 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            ← Edit My Details
          </button>
          <button onClick={confirmSave} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
            {submitting ? 'Saving…' : isQuestMode ? 'Confirm & Register' : 'Confirm & Save Profile'} {!submitting && <PixelArrow className="h-2.5 w-2.5" />}
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">Nothing is saved until you press Confirm.</p>
      </main>
    )
  }

  // ---------- EDIT STEP ----------
  // Dead-end only exists in Quest mode without events; Profile Setup always works.
  if (isQuestMode && !safeEvents.length) {
    const exitQuestMode = () => {
      clearQuestReturn()
      // Strip ?event= so we fall back to pure Profile Setup.
      const url = new URL(window.location.href)
      url.searchParams.delete('event')
      window.location.replace(url.pathname + url.search)
    }
    return <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-6 text-center"><section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"><h1 className="text-2xl font-bold">No Active Quests Right Now</h1><p className="mt-3 text-slate-600">New opportunities are added regularly.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{questReturn?.returnTo && <button onClick={() => navigate(questReturn.returnTo)} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Back to your Quest</button>}<button onClick={exitQuestMode} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Continue with Profile Setup</button><button onClick={() => navigate('/')} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Quest Board</button><button onClick={() => signOut()} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Sign out</button></div></section></main>
  }

  const chips = isQuestMode
    ? ['01 Quest', '02 Personal', '03 Contact', '04 Work & Skills', '05 Preferences', '06 Education', '07 Opportunities', '08 Consent']
    : ['01 Personal', '02 Contact', '03 Work & Skills', '04 Classification', '05 Education', '06 Data Consent']

  return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
    {(jobSeekerIntro || questReturn?.returnTo) && (
      <div className="mb-6 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
        <p className="flex items-center gap-1.5 text-sm font-bold text-blue-900"><PixelStar className="h-3 w-3 text-amber-500" /> Welcome, {user?.user_metadata?.full_name || user?.email}.</p>
        <p className="mt-0.5 text-xs text-blue-700">Complete your profile once — it is reused for every Quest.{questReturn?.returnTo ? " We'll take you back to your Quest afterwards." : ''}</p>
      </div>
    )}
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700"><PixelBriefcase className="h-3.5 w-3.5" /> Job Seeker Profile</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{isQuestMode ? 'Register for this Quest' : 'Build Your Job Seeker Profile'}</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600">Your profile helps you apply faster and keeps your information in one place.</p>
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {chips.map(s => <span key={s} className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">{s}</span>)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <button onClick={() => signOut()} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Sign out</button>
      </div>
    </div>
    {questReturn?.returnTo && (
      <p className="-mt-3 mb-5 text-xs text-slate-400">
        Resuming from:{' '}<button onClick={() => navigate(questReturn.returnTo)} className="font-medium text-blue-700 hover:underline">back to your Quest</button> — you won't lose your progress here if you leave.
      </p>
    )}

    <form onSubmit={handleSubmit(goReview)} className="space-y-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8" readOnly={profileLocked}>
    {isQuestMode && <Section title="Quest"><label className="block text-sm font-medium">Choose an event<select {...register('event_id')} disabled={profileLocked} className={input}><option value="">Select an event</option>{safeEvents.map((event) => <option key={event.id} value={event.id}>{event.event_name} — {event.event_date} ({event.location}) — {eventTypeDisplay(event)}</option>)}</select></label><Error error={errors.event_id}/>{chosenEvent && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Venue: {chosenEvent.location}</p>}</Section>}
    <Section title="Personal information"><div className="grid gap-4 sm:grid-cols-3"><Field label="First name" required error={errors.first_name}><input {...register('first_name')} disabled={profileLocked} className={input}/></Field><Field label="Middle name"><input {...register('middle_name')} disabled={profileLocked} className={input}/></Field><Field label="Last name" required error={errors.last_name}><input {...register('last_name')} disabled={profileLocked} className={input}/></Field><Field label="Birthdate" required error={errors.birthdate}><input type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} {...register('birthdate')} disabled={profileLocked} className={input}/></Field><Field label="Sex" required error={errors.sex}><select {...register('sex')} disabled={profileLocked} className={input}><option value="">Select</option><option>Male</option><option>Female</option></select></Field><Field label="Civil status"><select {...register('civil_status')} disabled={profileLocked} className={input}><option value="">Select</option><option>Single</option><option>Married</option><option>Widowed</option></select></Field></div></Section>
    <Section title="Address and contact"><div className="grid gap-4 sm:grid-cols-2"><Field label="Province" required error={errors.province}><select {...register('province')} value={province || ''} disabled={profileLocked} className={input}><option value="">Select a province</option>{province && !safeProvinces.some(item => item.name === province) && <option value={province}>{province}</option>}{safeProvinces.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}</select></Field><Field label="Municipality / city" required error={errors.municipality_city}><select {...register('municipality_city')} value={municipality || ''} disabled={!province || profileLocked} className={input}><option value="">{province ? 'Select a municipality / city' : 'Select a province first'}</option>{municipality && !safeMunicipalities.some(item => item.name === municipality) && <option value={municipality}>{municipality}</option>}{safeMunicipalities.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}</select></Field><Field label="Barangay" required error={errors.barangay}><select {...register('barangay')} value={barangay || ''} disabled={!municipality || profileLocked} className={input}><option value="">{municipality ? 'Select a barangay' : 'Select a municipality / city first'}</option>{barangay && !safeBarangays.some(item => item.name === barangay) && <option value={barangay}>{barangay}</option>}{safeBarangays.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}</select></Field><Field label="Contact number" required error={errors.contact_no}><input inputMode="tel" maxLength={contactMaxLen} {...register('contact_no', { onChange: (e) => { let val = e.target.value.replace(/\D/g, ''); const limit = val.startsWith('9') && !val.startsWith('09') ? 10 : 11; if (val.length > limit) { val = val.slice(0, limit); } e.target.value = val; } })} disabled={profileLocked} className={input}/></Field><Field label="Email" required error={errors.email}><input type="email" {...register('email')} disabled={profileLocked} className={input}/></Field></div></Section>
    <Section title="Education and preference">
      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          <Check label="I am currently a student" register={register('is_currently_student')} disabled={profileLocked}/>
        </div>
        {isCurrentlyStudent && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="School name"><input {...register('current_school_name')} disabled={profileLocked} className={input} placeholder="Cagayan State University"/></Field>
            <Field label="Education level"><select {...register('current_education_level')} disabled={profileLocked} className={input}><option value="">Select level</option>{STUDENT_EDUCATION_LEVELS.map(o => <option key={o} value={o}>{o}</option>)}</select></Field>
            <Field label="Grade / year level"><input {...register('current_grade_year_level')} disabled={profileLocked} className={input} placeholder="3rd Year, Grade 11"/></Field>
            <Field label="Program / strand / course"><input {...register('current_program_or_strand')} disabled={profileLocked} className={input} placeholder="BS Computer Science, STEM"/></Field>
            <Field label="Expected graduation year" error={errors.expected_graduation_year}><input inputMode="numeric" maxLength={4} {...register('expected_graduation_year', { onChange: (e) => { let val = e.target.value.replace(/\D/g, ''); if (val.length > 4) val = val.slice(0, 4); e.target.value = val } })} disabled={profileLocked} className={input} placeholder="2027"/></Field>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Highest educational attainment" required error={errors.highest_educational_attainment}><select {...register('highest_educational_attainment')} disabled={profileLocked} className={input}><option value="">Select educational attainment</option>{educationalAttainmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Course / program" error={errors.course_program}><input list="course-program-suggestions" disabled={profileLocked} {...register('course_program')} placeholder="Select or type course / program / strand" className={input}/>{!isElemOrJuniorHigh && courseSuggestions.length > 0 && <datalist id="course-program-suggestions">{courseSuggestions.map((item) => <option key={item} value={item}/>)}</datalist>}{isPostgraduate && <p className="mt-1.5 text-xs font-medium text-blue-700">Please spell out your degree (e.g., Master of Arts in Education).</p>}</Field><Field label={schoolAttendedLabel}><input {...register('first_time_school')} disabled={profileLocked} className={input} placeholder="Cagayan State University- Carig"/></Field><Field label="Graduation year" error={errors.first_time_graduation_year}><input inputMode="numeric" maxLength={4} {...register('first_time_graduation_year', { onChange: (e) => { let val = e.target.value.replace(/\D/g, ''); if (val.length > 4) val = val.slice(0, 4); e.target.value = val } })} disabled={profileLocked} className={input} placeholder="2020"/></Field><Field label="Employment preference"><select {...register('employment_preference')} disabled={profileLocked} className={input}><option value="Local">Local</option><option value="Overseas">Overseas</option><option value="Both">Both</option></select></Field><Field label="Interview location"><input {...register('interview_location')} disabled={profileLocked} className={input} placeholder="Preferred location, if applicable"/></Field></div>
    </Section>
    <Section title="Job seeker classification">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">Select one</p>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { key: 'first_time', label: 'First-time Jobseeker', desc: 'Never been employed before', icon: '1', color: 'bg-blue-50 text-blue-800 ring-blue-200', activeColor: 'bg-blue-600 text-white' },
          { key: 'ofw', label: 'Returning OFW', desc: 'Worked overseas and returned', icon: '✈', color: 'bg-purple-50 text-purple-800 ring-purple-200', activeColor: 'bg-purple-600 text-white' },
          { key: 'worker', label: 'Returning Worker', desc: 'Worked outside province and returned', icon: '↩', color: 'bg-amber-50 text-amber-800 ring-amber-200', activeColor: 'bg-amber-600 text-white' },
          { key: 'experienced', label: 'Experienced Worker', desc: 'Previously employed within Cagayan, now looking for a new job', icon: '✓', color: 'bg-emerald-50 text-emerald-800 ring-emerald-200', activeColor: 'bg-emerald-600 text-white' },
        ].map(opt => {
          const checked = (opt.key === 'first_time' && firstTimeJobseeker) || (opt.key === 'ofw' && returningOfw) || (opt.key === 'worker' && returningWorker) || (opt.key === 'experienced' && experiencedWorker)
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                const sameSelection = checked
                if (sameSelection) return

                if (isCurrentlyStudent && !['first_time', 'experienced'].includes(opt.key)) return

                setValue('first_time_jobseeker', opt.key === 'first_time', { shouldDirty: true })
                setValue('returning_ofw', opt.key === 'ofw', { shouldDirty: true })
                setValue('returning_worker', opt.key === 'worker', { shouldDirty: true })
                setValue('experienced_worker', opt.key === 'experienced', { shouldDirty: true })

                // Classification changes preserve education and work-history entries.
              }}
              disabled={profileLocked || (isCurrentlyStudent && !['first_time', 'experienced'].includes(opt.key))}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-center transition-all ${
                checked ? 'border-blue-700 bg-blue-50 shadow-sm' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
              } ${isCurrentlyStudent && !['first_time', 'experienced'].includes(opt.key) ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${
                opt.key === 'first_time' ? 'bg-blue-100 text-blue-700' : opt.key === 'ofw' ? 'bg-purple-100 text-purple-700' : opt.key === 'worker' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}>{opt.icon}</span>
              <div>
                <p className="text-sm font-bold">{opt.label}</p>
                <p className="text-xs text-slate-500">{opt.desc}</p>
              </div>
              {checked && <span className="rounded-full bg-blue-700 px-2.5 py-0.5 text-[10px] font-bold text-white">SELECTED</span>}
            </button>
          )
        })}
      </div>

      {/* Returning OFW details */}
      {returningOfw && <div className="mt-5 rounded-xl bg-purple-50 p-4 ring-1 ring-purple-100"><p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-700 text-[10px] text-white">✈</span> Returning OFW Details</p><div className="grid gap-4 sm:grid-cols-2"><Field label="Country last worked"><div className="relative"><input {...register('ofw_country_last_worked', { onChange: () => setShowOfwCountrySuggestions(true) })} disabled={profileLocked} className={input} placeholder="e.g. Japan, UAE, Saudi Arabia" autoComplete="off" onFocus={() => setShowOfwCountrySuggestions(true)} onBlur={() => setTimeout(() => setShowOfwCountrySuggestions(false), 150)} aria-autocomplete="list" aria-expanded={showOfwCountrySuggestions}/>{showOfwCountrySuggestions && !profileLocked && filteredOfwCountries.length > 0 && <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-300 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900" role="listbox">{filteredOfwCountries.map(country => <button key={country} type="button" className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-blue-300" onMouseDown={(event) => event.preventDefault()} onClick={() => { setValue('ofw_country_last_worked', country, { shouldDirty: true }); setShowOfwCountrySuggestions(false) }}>{country}</button>)}</div>}</div></Field><Field label="Date returned"><input type="date" {...register('ofw_date_returned')} disabled={profileLocked} className={input}/></Field><Field label="Reason for return"><input {...register('ofw_reason_for_return')} disabled={profileLocked} className={input} placeholder="e.g. Contract ended, family, medical"/></Field></div></div>}

      {/* Returning Worker details */}
      {returningWorker && <div className="mt-5 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100"><p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-700 text-[10px] text-white">↩</span> Returning Worker Details</p><div className="grid gap-4 sm:grid-cols-2"><Field label="Date returned"><input type="date" {...register('rw_date_returned')} disabled={profileLocked} className={input}/></Field><Field label="Reason for return"><input {...register('rw_reason_for_return')} disabled={profileLocked} className={input} placeholder="e.g. Contract ended, family, relocation"/></Field></div></div>}

      <div className="mt-6">
        <p className="mb-1 text-sm font-medium text-slate-700">Special Worker Sectors</p>
        <p className="mb-3 text-xs text-slate-500">Select all that apply. This helps us match you with relevant programs.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SPECIAL_SECTOR_OPTIONS.map(opt => {
            const checked = (specialSectors || []).includes(opt.code)
            return (
              <label key={opt.code} className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors ${checked ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={profileLocked}
                  onChange={() => toggleSector(opt.code)}
                  className="mt-0.5 h-4 w-4 rounded text-blue-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-800">{opt.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{opt.desc}</span>
                </span>
              </label>
            )
          })}
        </div>
        {hasDisability && <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Disability type"><input {...register('disability_type')} disabled={profileLocked} className={input} placeholder="Please input what is indicated in your PWD ID"/></Field><Field label="Work accommodation needed"><input {...register('accommodation_needed')} disabled={profileLocked} className={input} placeholder="e.g. Sign language interpreter"/></Field><Field label="Accommodation notes"><textarea rows={2} {...register('employment_accommodation_notes')} disabled={profileLocked} className={input}/></Field></div>}
      </div>
      <p className="mt-5 text-sm font-medium">PESO assistance programs</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{assistancePrograms.map((program) => program === 'Skills Training' ? <label key={program} className={`flex items-center gap-2 text-sm text-slate-700 ${profileLocked ? 'cursor-not-allowed opacity-50' : ''}`}><input type="checkbox" checked={trainingWanted} onChange={() => toggleAssistanceProgram(program)} disabled={profileLocked} className="h-4 w-4 rounded"/>{program}</label> : assistanceProgramDescriptions[program] ? <label key={program} className={`flex items-start gap-2 text-sm text-slate-700 ${profileLocked ? 'cursor-not-allowed opacity-50' : ''}`}><input type="checkbox" {...register('peso_assistance_programs')} value={program} disabled={profileLocked} className="mt-0.5 h-4 w-4 shrink-0 rounded"/><span><span className="font-medium">{program}</span><span className="mt-0.5 block text-xs text-slate-500">{assistanceProgramDescriptions[program]}</span></span></label> : <Check key={program} label={program} register={register('peso_assistance_programs')} value={program} disabled={profileLocked}/>)}</div>
      {trainingWanted && <Field label="Preferred training program"><input {...register('preferred_training_program')} list="training-program-suggestions" disabled={profileLocked} className={input} placeholder="Select or type a training program"/><datalist id="training-program-suggestions">{TRAINING_PROGRAM_OPTIONS.map(t => <option key={t} value={t}/>)}</datalist></Field>}
    </Section>
    {isQuestMode && <Section title="Preferred job vacancies (optional)">{!eventId ? <p className="text-sm text-slate-500">Choose an event to see its vacancies.</p> : !safeVacancies.length ? <p className="text-sm text-slate-500">No active vacancies have been posted for this event.</p> : <div className="grid gap-3 sm:grid-cols-2">{safeVacancies.map((vacancy) => { const def = vacancy.vacancy_definitions ?? {}; return <label key={vacancy.id} className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 hover:border-blue-300"><input type="checkbox" checked={selectedVacancies.includes(vacancy.id)} onChange={() => toggleVacancy(vacancy.id)} disabled={profileLocked} className="mt-1 h-4 w-4"/><span><span className="block font-medium">{def.position}</span><span className="block text-sm text-slate-600">{def.company_name}{def.place_of_assignment ? ` · ${def.place_of_assignment}` : ''}</span></span></label> })}</div>}</Section>}
    <Section title="Data privacy consent">
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-900">Data Privacy Consent — Republic Act No. 10173 (Data Privacy Act of 2012)</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        I voluntarily provide my personal information and consent to its collection, recording, organization, storage, updating,
        use, and disclosure by the Provincial Public Employment Service Office (PPESO)
        exclusively for job-matching, employment referral, labor-market reporting, and related employment-facilitation purposes.
        I understand that my information may be shared with participating employers only for positions I have applied for, and
        that it will be protected with appropriate security measures.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        Under RA 10173, I have the right to be informed, to object to processing, to access and obtain a copy of my data, to
        request rectification or erasure of inaccurate or unlawfully processed data, to suspend withdrawal of consent, and to
        claim compensation in case of damages. I may exercise these rights by contacting the PESO Provincial Office,
        Tuguegarao City, Cagayan. I certify that the information I provided is true, complete, and accurate to the best of my knowledge.
      </p>
      <label className={`mt-3 flex items-start gap-2 text-sm text-slate-800 ${profileLocked ? 'cursor-not-allowed opacity-60' : ''}`}><input type="checkbox" {...register('data_subject_rights_agreed')} disabled={profileLocked} className="mt-0.5 h-4 w-4"/><span>I have read and understood this notice, and I consent to the processing of my personal data in accordance with RA 10173. <span className="text-red-500">*</span></span></label>
      <Error error={errors.data_subject_rights_agreed}/>
    </div></Section>
    <button disabled={submitting || profileLocked} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Please wait…' : isQuestMode ? 'Review My Registration' : 'Review My Profile'}</button>
    <p className="text-center text-xs text-slate-400">You'll review everything before anything is saved.</p>
  </form></main>
}
function Section({ title, children }) { return <fieldset className="border-b border-slate-200 pb-7 last:border-0 last:pb-0"><legend className="mb-4 text-lg font-bold">{title}</legend>{children}</fieldset> }
function Field({ label, error, children, required = false }) { return <label className="block text-sm font-medium text-slate-700">{label}{required && <span className="ml-0.5 text-red-500">*</span>}{children}<Error error={error}/></label> }
function Error({ error }) { return error?.message ? <span className="mt-1 block text-xs font-medium text-red-600">{error.message}</span> : null }
function Check({ label, register: registration, value, disabled = false }) { return <label className={`flex items-center gap-2 text-sm text-slate-700 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}><input type="checkbox" {...registration} value={value} disabled={disabled} className="h-4 w-4 rounded"/>{label}</label> }