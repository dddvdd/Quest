import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { eventTypeDisplay } from '../../domain/eventTypes'
import { applicableRequirements, validatePdf } from '../../lib/accreditation'
import { QRCodeSVG } from 'qrcode.react'
import { PixelClock } from '../../components/public/pixel'
import { employerService } from '../../services/employerService'
import { vacancyService } from '../../services/vacancyService'
import { eventVacancyService } from '../../services/eventVacancyService'
import { accreditationService } from '../../services/accreditationService'
import { employerApplicantsService } from '../../services/employerApplicantsService'
import { eventService } from '../../services/eventService'
import { referenceService } from '../../services/referenceService'
import { vacancyRequirementService } from '../../services/vacancyRequirementService'
import { recruitmentService } from '../../services/recruitmentService.js'
import { EMPLOYER_REGISTRATION_STATUS, EMPLOYER_REGISTRATION_STATUS_LABEL, EMPLOYER_REGISTRATION_STATUS_BADGE, ACCREDITATION_REQUIREMENT_STATUS, isEmployerAccredited } from '../../domain/statuses'
import { EMPLOYER_TYPE, BUSINESS_STRUCTURE, OSH_CLASSIFICATION } from '../../domain/employer'

// ----- PPESO pixel design tokens — Employer identity: role-employer (violet) -----
const PANEL = 'rounded-2xl border-2 border-slate-900 bg-white pixel-shadow'
const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-slate-900 font-bold uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300'
const BTN_MINI = 'inline-flex min-h-[40px] items-center justify-center rounded-lg border-2 border-slate-900 px-2.5 text-[11px] font-bold uppercase tracking-wide pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300'

// Small crisp pixel-art scene: company building ("Build your team").
function PixelBuilding() {
  return (
    <svg viewBox="0 0 40 32" className="crisp mx-auto h-16 w-auto" fill="currentColor" role="img" aria-label="Pixel art office building">
      <rect x="12" y="4" width="16" height="24" />
      <rect x="28" y="12" width="8" height="16" opacity="0.75" />
      <rect x="4" y="16" width="8" height="12" opacity="0.55" />
      <rect x="19" y="0" width="1" height="4" />
      <rect x="20" y="0" width="6" height="3" className="text-role-employer" />
      <rect x="15" y="8" width="3" height="3" fill="#ffffff" opacity="0.9" />
      <rect x="22" y="8" width="3" height="3" fill="#ffffff" opacity="0.9" />
      <rect x="15" y="14" width="3" height="3" fill="#ffffff" opacity="0.9" />
      <rect x="22" y="14" width="3" height="3" fill="#ffffff" opacity="0.35" />
      <rect x="18" y="22" width="4" height="6" className="text-role-employer" />
      <rect x="30" y="16" width="2" height="2" fill="#ffffff" opacity="0.9" />
      <rect x="34" y="16" width="2" height="2" fill="#ffffff" opacity="0.9" />
      <rect x="30" y="21" width="2" height="2" fill="#ffffff" opacity="0.35" />
    </svg>
  )
}

function PixelDesk() {
  return (
    <svg viewBox="0 0 40 26" className="crisp mx-auto h-12 w-auto" fill="currentColor" role="img" aria-label="Pixel art hiring desk">
      <circle cx="12" cy="6" r="4" className="text-role-employer" />
      <rect x="8" y="11" width="8" height="7" className="text-role-employer" />
      <rect x="2" y="18" width="34" height="3" />
      <rect x="4" y="21" width="2" height="5" />
      <rect x="32" y="21" width="2" height="5" />
      <rect x="24" y="13" width="7" height="4" fill="#ffffff" opacity="0.25" />
    </svg>
  )
}

function PixelCalScene() {
  return (
    <svg viewBox="0 0 32 30" className="crisp mx-auto h-14 w-auto" fill="currentColor" role="img" aria-label="Pixel art calendar">
      <rect x="2" y="4" width="28" height="24" />
      <rect x="6" y="1" width="3" height="6" />
      <rect x="23" y="1" width="3" height="6" />
      <rect x="2" y="10" width="28" height="2" fill="#ffffff" opacity="0.35" />
      <rect x="12" y="15" width="8" height="8" className="text-role-employer" />
    </svg>
  )
}

const emptyDefForm = {
  position: '',
  salary_range: '',
  place_of_assignment: '',
  qualifications: '',
  principal_name: '',
  available_slots: '',
  is_active: true,
  job_description: '',
  occupation_id: '',
  industry_id: '',
  employment_type_id: '',
  work_arrangement_id: '',
  salary_min: '',
  salary_max: '',
  salary_period: '',
  salary_negotiable: false,
  province: '',
  municipality_city: '',
}

const emptyOfferingForm = {
  event_id: '',
  slots_offered: 1,
  notes: '',
}

export default function EmployerDashboard() {
  const { profile } = useAuth()
  const [employer, setEmployer] = useState(null)
  const [definitions, setDefinitions] = useState([])
  const [events, setEvents] = useState([])
  const [filledCounts, setFilledCounts] = useState({})
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [editDef, setEditDef] = useState(null)
  const [deleteDef, setDeleteDef] = useState(null)
  const [addToEventDef, setAddToEventDef] = useState(null)
  const [editOffering, setEditOffering] = useState(null)
  const [deleteOffering, setDeleteOffering] = useState(null)
  const [applicantsModal, setApplicantsModal] = useState(null)
  const [noEmployerRow, setNoEmployerRow] = useState(false)
  const [editCompanyOpen, setEditCompanyOpen] = useState(false)
  const [companyForm, setCompanyForm] = useState(null)
  const [accreditation, setAccreditation] = useState(null)
  const [uploadingKey, setUploadingKey] = useState(null)
  const [accredOpen, setAccredOpen] = useState(false)
  const [refOccupations, setRefOccupations] = useState([])
  const [refIndustries, setRefIndustries] = useState([])
  const [refEmploymentTypes, setRefEmploymentTypes] = useState([])
  const [refWorkArrangements, setRefWorkArrangements] = useState([])
  const [refSkills, setRefSkills] = useState([])
  const [refEducationLevels, setRefEducationLevels] = useState([])
  const [refCertifications, setRefCertifications] = useState([])
  const [refLanguages, setRefLanguages] = useState([])

  const [defForm, setDefForm] = useState(emptyDefForm)
  const [offeringForm, setOfferingForm] = useState(emptyOfferingForm)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [modalTab, setModalTab] = useState('job')
  const [reqSkills, setReqSkills] = useState([])
  const [reqEducation, setReqEducation] = useState([])
  const [reqExperience, setReqExperience] = useState([])
  const [reqCertifications, setReqCertifications] = useState([])
  const [reqLanguages, setReqLanguages] = useState([])
  const [publicationWorkingId, setPublicationWorkingId] = useState(null)

  const isAgency = employer?.employer_type === EMPLOYER_TYPE.LOCAL_AGENCY
  const isPending = employer?.registration_status === EMPLOYER_REGISTRATION_STATUS.PENDING

  useEffect(() => { if (profile?.id) loadData() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    try {
      const empData = await employerService.getByRegisteredUser(profile.id).catch((err) => {
        if (err?.code === 'PGRST116') { setNoEmployerRow(true); setLoading(false) }
        throw err
      })
      if (!empData) { setLoading(false); return }
      setEmployer(empData)
      setAccredOpen(empData.registration_status === EMPLOYER_REGISTRATION_STATUS.PENDING)

      const [defData, evData, linkData, accData] = await Promise.all([
        eventVacancyService.listForEmployer(empData.id),
        eventService.listForVacancyFilter(),
        eventVacancyService.listSlotCounts(),
        employerService.listAccreditation(empData.id),
      ])
      setAccreditation(accData || null)

      const counts = {}
      ;(linkData || []).forEach(l => { counts[l.event_vacancy_id] = (counts[l.event_vacancy_id] || 0) + 1 })
      // Slot recount writes require an approved employer under RLS.
      if (isEmployerAccredited(empData)) {
        const persist = []
        ;(defData || []).forEach(def => {
          ;(def.event_vacancies || []).forEach(ev => {
            if ((counts[ev.id] || 0) !== (ev.slots_filled || 0))
              persist.push(eventVacancyService.updateFilledCount(ev.id, counts[ev.id] || 0))
          })
        })
        if (persist.length) await Promise.all(persist)
      }

      setDefinitions(defData || [])
      setEvents(evData || [])
      setFilledCounts(counts)

      const [occData, indData, etData, waData, skData, elData, ceData, laData] = await Promise.all([
        referenceService.listOccupations().catch(() => []),
        referenceService.listIndustries().catch(() => []),
        referenceService.listEmploymentTypes().catch(() => []),
        referenceService.listWorkArrangements().catch(() => []),
        referenceService.listSkills().catch(() => []),
        referenceService.listEducationLevels().catch(() => []),
        referenceService.listCertifications().catch(() => []),
        referenceService.listLanguages().catch(() => []),
      ])
      setRefOccupations(occData || [])
      setRefIndustries(indData || [])
      setRefEmploymentTypes(etData || [])
      setRefWorkArrangements(waData || [])
      setRefSkills(skData || [])
      setRefEducationLevels(elData || [])
      setRefCertifications(ceData || [])
      setRefLanguages(laData || [])
    } catch (err) {
      if (!noEmployerRow) toast.error(`Failed to load: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => ({
    total: definitions.length,
    active: definitions.filter(d => d.is_active).length,
    applicants: Object.values(filledCounts).reduce((s, c) => s + c, 0),
    slots: definitions.reduce((s, d) => s + (d.event_vacancies || []).reduce((s2, ev) => s2 + (ev.slots_offered || 0), 0), 0),
  }), [definitions, filledCounts])

  async function loadRequirements(vacancyId) {
    const [sk, ed, ex, ce, la] = await Promise.all([
      vacancyRequirementService.listVacancySkills(vacancyId).catch(() => []),
      vacancyRequirementService.listEducationReqs(vacancyId).catch(() => []),
      vacancyRequirementService.listExperienceReqs(vacancyId).catch(() => []),
      vacancyRequirementService.listCertificationReqs(vacancyId).catch(() => []),
      vacancyRequirementService.listLanguageReqs(vacancyId).catch(() => []),
    ])
    setReqSkills(sk || [])
    setReqEducation(ed || [])
    setReqExperience(ex || [])
    setReqCertifications(ce || [])
    setReqLanguages(la || [])
  }

  async function saveRequirements(vacancyId) {
    const errs = []
    // Skills
    for (const r of reqSkills) {
      try {
        if (r._local && !r.id) {
          await vacancyRequirementService.createVacancySkill({ vacancy_definition_id: vacancyId, skill_id: r.skill_id, importance: r.importance, minimum_proficiency: r.minimum_proficiency || null, minimum_years_experience: r.minimum_years_experience || null })
        } else if (r._delete) {
          await vacancyRequirementService.removeVacancySkill(r.id)
        }
      } catch (e) { errs.push(`Skill: ${e.message}`) }
    }
    // Education
    for (const r of reqEducation) {
      try {
        if (r._local && !r.id) {
          await vacancyRequirementService.createEducationReq({ vacancy_definition_id: vacancyId, education_level_id: r.education_level_id, field_of_study: r.field_of_study || null, importance: r.importance, notes: r.notes || null })
        } else if (r._delete) {
          await vacancyRequirementService.removeEducationReq(r.id)
        }
      } catch (e) { errs.push(`Education: ${e.message}`) }
    }
    // Experience
    for (const r of reqExperience) {
      try {
        if (r._local && !r.id) {
          await vacancyRequirementService.createExperienceReq({ vacancy_definition_id: vacancyId, occupation_id: r.occupation_id || null, industry_id: r.industry_id || null, minimum_months: r.minimum_months || null, importance: r.importance, description: r.description || null })
        } else if (r._delete) {
          await vacancyRequirementService.removeExperienceReq(r.id)
        }
      } catch (e) { errs.push(`Experience: ${e.message}`) }
    }
    // Certifications
    for (const r of reqCertifications) {
      try {
        if (r._local && !r.id) {
          await vacancyRequirementService.createCertificationReq({ vacancy_definition_id: vacancyId, certification_id: r.certification_id, importance: r.importance, must_be_valid: r.must_be_valid || false, notes: r.notes || null })
        } else if (r._delete) {
          await vacancyRequirementService.removeCertificationReq(r.id)
        }
      } catch (e) { errs.push(`Certification: ${e.message}`) }
    }
    // Languages
    for (const r of reqLanguages) {
      try {
        if (r._local && !r.id) {
          await vacancyRequirementService.createLanguageReq({ vacancy_definition_id: vacancyId, language_id: r.language_id, minimum_speaking: r.minimum_speaking || null, minimum_reading: r.minimum_reading || null, minimum_writing: r.minimum_writing || null, importance: r.importance })
        } else if (r._delete) {
          await vacancyRequirementService.removeLanguageReq(r.id)
        }
      } catch (e) { errs.push(`Language: ${e.message}`) }
    }
    if (errs.length) toast.error(`Some requirements failed: ${errs.join('; ')}`)
  }

  function clearReqState() { setReqSkills([]); setReqEducation([]); setReqExperience([]); setReqCertifications([]); setReqLanguages([]) }

  async function handleCreate(e) {
    e.preventDefault(); setCreating(true)
    try {
      const created = await vacancyService.insert({
        company_name: employer.company_name, position: defForm.position,
        salary_range: defForm.salary_range || null, place_of_assignment: defForm.place_of_assignment || null,
        qualifications: defForm.qualifications || null, principal_name: isAgency ? (defForm.principal_name || null) : null,
        available_slots: defForm.available_slots ? Number(defForm.available_slots) : null, created_source: 'employer',
        is_active: defForm.is_active, employer_id: employer.id,
        job_description: defForm.job_description || null,
        occupation_id: defForm.occupation_id || null,
        industry_id: defForm.industry_id || null,
        employment_type_id: defForm.employment_type_id || null,
        work_arrangement_id: defForm.work_arrangement_id || null,
        salary_min: defForm.salary_min ? Number(defForm.salary_min) : null,
        salary_max: defForm.salary_max ? Number(defForm.salary_max) : null,
        salary_period: defForm.salary_period || null,
        salary_negotiable: defForm.salary_negotiable,
        province: defForm.province || null,
        municipality_city: defForm.municipality_city || null,
      })
      await saveRequirements(created.id)
      toast.success('Vacancy created!'); setCreateOpen(false); setDefForm(emptyDefForm); clearReqState(); setModalTab('job'); await loadData()
    } catch (err) {
      toast.error(`Create failed: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  function openEditDef(def) {
    setEditDef(def)
    setDefForm({ position: def.position, salary_range: def.salary_range || '', place_of_assignment: def.place_of_assignment || '',
      qualifications: def.qualifications || '', principal_name: def.principal_name || '', available_slots: def.available_slots ?? '', is_active: def.is_active,
      job_description: def.job_description || '', occupation_id: def.occupation_id || '', industry_id: def.industry_id || '',
      employment_type_id: def.employment_type_id || '', work_arrangement_id: def.work_arrangement_id || '',
      salary_min: def.salary_min ?? '', salary_max: def.salary_max ?? '', salary_period: def.salary_period || '',
      salary_negotiable: def.salary_negotiable || false, province: def.province || '', municipality_city: def.municipality_city || '' })
    setModalTab('job')
    loadRequirements(def.id)
  }

  async function saveDefinition() {
    setSaving(true)
    try {
      await vacancyService.update(editDef.id, {
        position: defForm.position, salary_range: defForm.salary_range || null,
        place_of_assignment: defForm.place_of_assignment || null, qualifications: defForm.qualifications || null,
        principal_name: isAgency ? (defForm.principal_name || null) : null,
        available_slots: defForm.available_slots ? Number(defForm.available_slots) : null, is_active: defForm.is_active,
        job_description: defForm.job_description || null,
        occupation_id: defForm.occupation_id || null,
        industry_id: defForm.industry_id || null,
        employment_type_id: defForm.employment_type_id || null,
        work_arrangement_id: defForm.work_arrangement_id || null,
        salary_min: defForm.salary_min ? Number(defForm.salary_min) : null,
        salary_max: defForm.salary_max ? Number(defForm.salary_max) : null,
        salary_period: defForm.salary_period || null,
        salary_negotiable: defForm.salary_negotiable,
        province: defForm.province || null,
        municipality_city: defForm.municipality_city || null,
      })
      await saveRequirements(editDef.id)
      toast.success('Updated!'); setEditDef(null); clearReqState(); await loadData()
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeleteDefinition() {
    if (!deleteDef) return; setDeleting(true)
    try {
      await vacancyService.remove(deleteDef.id)
      toast.success('Deleted.'); setDeleteDef(null); await loadData()
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  function openAddToEvent(def) { setAddToEventDef(def); setOfferingForm({ ...emptyOfferingForm, event_id: events[0]?.id || '' }) }

  async function handleAddOffering() {
    if (!addToEventDef || !offeringForm.event_id) return; setSaving(true)
    try {
      await eventVacancyService.upsertOffering({
        vacancyDefinitionId: addToEventDef.id,
        eventId: offeringForm.event_id,
        slotsOffered: offeringForm.slots_offered,
        notes: offeringForm.notes || null,
      })
      toast.success('Added!'); setAddToEventDef(null); await loadData()
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  function openEditOffering(ev, def) {
    setEditOffering({ offering: ev, definition: def })
    setOfferingForm({ event_id: ev.event_id, slots_offered: ev.slots_offered, notes: ev.notes || '' })
  }

  async function saveOffering() {
    if (!editOffering) return; setSaving(true)
    try {
      await eventVacancyService.updateOffering(editOffering.offering.id, {
        eventId: offeringForm.event_id,
        slotsOffered: offeringForm.slots_offered,
        notes: offeringForm.notes || null,
      })
      toast.success('Updated!'); setEditOffering(null); await loadData()
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeleteOffering() {
    if (!deleteOffering) return; setDeleting(true)
    try {
      await eventVacancyService.removeOffering(deleteOffering.id)
      toast.success('Removed.'); setDeleteOffering(null); await loadData()
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  async function loadApplicants(offering) {
    try {
      const data = await employerApplicantsService.listForOffering(offering.id)
      setApplicantsModal({ offering, applicants: data || [] })
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
  }

  async function changePublication(definition, action) {
    setPublicationWorkingId(definition.id)
    try {
      if (action === 'publish') await recruitmentService.publishVacancy(definition.id)
      else await recruitmentService.closeVacancy(definition.id)
      toast.success(action === 'publish' ? 'Vacancy published to Trabaho Jobs.' : 'Platform listing closed. Event offerings were not changed.')
      await loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPublicationWorkingId(null)
    }
  }

  function openEditCompany() {
    setCompanyForm({
      company_name: employer.company_name || '',
      industry: employer.industry || '',
      employer_type: employer.employer_type || EMPLOYER_TYPE.LOCAL_DIRECT,
      license_no: employer.license_no || '',
      contact_person: employer.contact_person || '',
      contact_number: employer.contact_number || '',
      tin: employer.tin || '',
      business_structure: employer.business_structure || '',
      osh_classification: employer.osh_classification || '',
    })
    setEditCompanyOpen(true)
  }

  async function saveCompany(e) {
    e.preventDefault(); setSaving(true)
    try {
      await employerService.updateSelf(employer.id, {
        company_name: companyForm.company_name,
        industry: companyForm.industry || null,
        employer_type: companyForm.employer_type,
        license_no: companyForm.license_no || null,
        contact_person: companyForm.contact_person || null,
        contact_number: companyForm.contact_number || null,
        tin: companyForm.tin || null,
        business_structure: companyForm.business_structure || null,
        osh_classification: companyForm.osh_classification || null,
      })
      toast.success('Company information updated'); setEditCompanyOpen(false); await loadData()
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadDoc(req, file) {
    if (!file) return
    const invalid = validatePdf(file)
    if (invalid) { toast.error(invalid); return }
    setUploadingKey(req.key)
    try {
      await accreditationService.submitDocument({
        employerId: employer.id,
        requirementId: req.id,
        file,
      })
      toast.success('Document submitted for review')
      await loadData()
    } catch (err) {
      toast.error(`Submit failed: ${err.message}`)
    } finally {
      setUploadingKey(null)
    }
  }

  async function viewDocument(path) {
    try {
      const url = await accreditationService.viewDocumentUrl(path)
      if (url) window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.error(`Cannot open document: ${err.message}`)
    }
  }

  const applicable = accreditation
    ? applicableRequirements(employer, accreditation.employer_accreditation_requirements || [])
    : []
  const approvedCount = applicable.filter(r => r.status === ACCREDITATION_REQUIREMENT_STATUS.APPROVED).length
  const accreditationBadge = employer?.registration_status === EMPLOYER_REGISTRATION_STATUS.APPROVED
    ? { label: EMPLOYER_REGISTRATION_STATUS_LABEL[EMPLOYER_REGISTRATION_STATUS.APPROVED], cls: EMPLOYER_REGISTRATION_STATUS_BADGE[EMPLOYER_REGISTRATION_STATUS.APPROVED] }
    : employer?.registration_status === EMPLOYER_REGISTRATION_STATUS.REJECTED
      ? { label: EMPLOYER_REGISTRATION_STATUS_LABEL[EMPLOYER_REGISTRATION_STATUS.REJECTED], cls: EMPLOYER_REGISTRATION_STATUS_BADGE[EMPLOYER_REGISTRATION_STATUS.REJECTED] }
      : { label: EMPLOYER_REGISTRATION_STATUS_LABEL[EMPLOYER_REGISTRATION_STATUS.PENDING], cls: EMPLOYER_REGISTRATION_STATUS_BADGE[EMPLOYER_REGISTRATION_STATUS.PENDING] }
  const statusIcon = {
    [ACCREDITATION_REQUIREMENT_STATUS.APPROVED]: '✓',
    [ACCREDITATION_REQUIREMENT_STATUS.SUBMITTED]: '⏳',
    [ACCREDITATION_REQUIREMENT_STATUS.NEEDS_CORRECTION]: '⚠',
    [ACCREDITATION_REQUIREMENT_STATUS.REJECTED]: '✗',
    [ACCREDITATION_REQUIREMENT_STATUS.NOT_SUBMITTED]: '○',
  }
  const statusColor = {
    [ACCREDITATION_REQUIREMENT_STATUS.APPROVED]: 'text-emerald-600',
    [ACCREDITATION_REQUIREMENT_STATUS.SUBMITTED]: 'text-blue-600',
    [ACCREDITATION_REQUIREMENT_STATUS.NEEDS_CORRECTION]: 'text-amber-600',
    [ACCREDITATION_REQUIREMENT_STATUS.REJECTED]: 'text-red-600',
    [ACCREDITATION_REQUIREMENT_STATUS.NOT_SUBMITTED]: 'text-slate-400',
  }

  const inputCls = 'w-full min-h-[44px] rounded-lg border-2 border-slate-900 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-violet-300'

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/70" />)}
        </div>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200/70" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(i => <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-200/70" />)}
        </div>
      </div>
    )
  }
  if (noEmployerRow) return <Navigate to="/register-employer/complete" replace />

  return (
    <div className="space-y-6">
      <div className={`p-6 ${PANEL}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-role-employer/15 text-xl font-black text-role-employer pixel-shadow-sm">{employer.company_name.charAt(0)}</div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-role-employer">PPESO · Employer Workspace</p>
            <h1 className="truncate text-2xl font-black uppercase tracking-tight text-slate-900">{employer.company_name}</h1>
            <p className="text-sm text-slate-600">
              {isAgency ? 'Recruitment Agency' : 'Direct Employer'}
              {employer.industry && ` · ${employer.industry}`}
              {employer.license_no && ` · License: ${employer.license_no}`}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {employer.employer_code && (
              <div className="hidden items-center gap-3 rounded-lg border-2 border-slate-900 bg-white p-3 pixel-shadow-sm sm:flex">
                <QRCodeSVG value={employer.employer_code} size={56} />
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-role-employer">Employer ID</p>
                  <p className="font-mono text-sm font-bold text-slate-700">{employer.employer_code}</p>
                  <p className="text-[10px] text-slate-400">Scan this QR code at the activity entrance.</p>
                </div>
              </div>
            )}
            <button onClick={openEditCompany} className={`${BTN} bg-white px-4 text-slate-700`}>Edit Company Info</button>
          </div>
        </div>
      </div>

      {isPending && (
        <div className="rounded-2xl border-2 border-slate-900 bg-amber-50 p-6 pixel-shadow-sm">
          <div className="flex items-start gap-4">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-white pixel-shadow-sm"><PixelClock className="h-4 w-4 text-amber-600" /></span>
            <div className="min-w-0">
              <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-700">Account Status</h2>
              <p className="text-lg font-bold text-amber-900">Awaiting PESO approval</p>
              <p className="mt-1 text-sm text-amber-800">
                Your employer account is registered and under accreditation review.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">What you can do now</p>
                  <ul className="mt-1.5 space-y-1 text-sm text-amber-800">
                    <li>✓ Complete your company information</li>
                    <li>✓ Submit accreditation documents</li>
                    <li>✓ Replace corrected documents</li>
                    <li>✓ View scheduled activities</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Available after approval</p>
                  <ul className="mt-1.5 space-y-1 text-sm text-slate-600">
                    <li>• Create and manage vacancies</li>
                    <li>• Participate in activities</li>
                    <li>• Offer vacancies to activities</li>
                    <li>• Check in with your Employer QR</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`p-6 ${PANEL}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black uppercase tracking-wide text-slate-900">Employer Accreditation</h2>
          <div className="flex items-center gap-2">
            <span className={`rounded-md border-2 border-slate-900 px-3 py-1 font-mono text-xs font-bold ${accreditationBadge.cls}`}>{accreditationBadge.label}</span>
            <button
              onClick={() => setAccredOpen(!accredOpen)}
              aria-expanded={accredOpen}
              aria-label={accredOpen ? 'Hide accreditation details' : 'Show accreditation details'}
              title={accredOpen ? 'Hide details' : 'Show details'}
              className={`${BTN} w-11 bg-white px-0 text-base text-slate-500`}
            >
              {accredOpen ? '−' : '+'}
            </button>
          </div>
        </div>
        {accredOpen && (
          <>
            {employer.registration_status !== EMPLOYER_REGISTRATION_STATUS.APPROVED && (
              <p className="mt-2 text-sm text-slate-600">
                Your employer registration has been received. Please complete your company information
                and submit the required accreditation documents below for PESO review. Job posting and
                job fair participation become available once you are accredited.
              </p>
            )}
        {applicable.length > 0 && (
          <>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-3 w-full max-w-sm overflow-hidden border-2 border-slate-900 bg-slate-100">
                <div className="h-full bg-role-employer transition-all" style={{ width: `${Math.round((approvedCount / applicable.length) * 100)}%` }} />
              </div>
              <span className="font-mono text-xs font-bold text-slate-600">{approvedCount} / {applicable.length} approved</span>
            </div>
            <ul className="mt-4 space-y-5">
              {Object.entries(applicable.reduce((groups, req) => {
                const cat = req.category || 'Other Requirements'
                ;(groups[cat] = groups[cat] || []).push(req)
                return groups
              }, {})).map(([cat, reqs]) => (
                <li key={cat}>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{cat}</p>
                  <ul className="mt-1 divide-y divide-slate-100">
                    {reqs.map(req => (
                      <li key={req.key} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className={`font-bold ${statusColor[req.status] || 'text-slate-400'}`}>{statusIcon[req.status] || '○'}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{req.label}</span>
                          {req.document_path ? (
                            <button onClick={() => viewDocument(req.document_path)} className={`${BTN_MINI} bg-white text-slate-700`}>View PDF</button>
                          ) : null}
                          {req.status !== ACCREDITATION_REQUIREMENT_STATUS.APPROVED && (
                            <label className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border-2 border-slate-900 bg-role-employer px-3 py-2 text-xs font-bold uppercase tracking-wide text-white pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-within:ring-4 focus-within:ring-violet-300 ${uploadingKey === req.key ? 'opacity-50' : ''}`}>
                              {uploadingKey === req.key ? 'Uploading…' : (req.document_path ? 'Replace PDF' : 'Upload PDF')}
                              <input type="file" accept="application/pdf" hidden onChange={(e) => { handleUploadDoc(req, e.target.files[0]); e.target.value = '' }} />
                            </label>
                          )}
                        </div>
                        <p className="ml-6 mt-0.5 text-[11px] text-slate-400">
                          Accepted format: PDF · Max 5 MB{req.original_filename ? ` · ${req.original_filename}` : ''}
                        </p>
                        {(req.status === ACCREDITATION_REQUIREMENT_STATUS.NEEDS_CORRECTION || req.status === ACCREDITATION_REQUIREMENT_STATUS.REJECTED) && req.review_notes && (
                          <p className={`ml-6 mt-1 rounded-lg px-3 py-2 text-xs ${req.status === ACCREDITATION_REQUIREMENT_STATUS.NEEDS_CORRECTION ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
                            PESO note ({req.status === ACCREDITATION_REQUIREMENT_STATUS.NEEDS_CORRECTION ? 'needs correction' : 'rejected'}): {req.review_notes}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[{ l: 'Open Jobs', v: stats.total, c: 'bg-role-employer' }, { l: 'Active', v: stats.active, c: 'bg-emerald-400' },
          { l: 'Applicants', v: stats.applicants, c: 'bg-amber-400' }, { l: 'Slots Offered', v: stats.slots, c: 'bg-blue-400' }
        ].map(s => (
          <div key={s.l} className={`p-4 ${PANEL}`}>
            <div className="flex items-start justify-between gap-2">
              <p aria-hidden className={`h-3.5 w-3.5 border-2 border-slate-900 ${s.c}`} />
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">{s.l}</p>
            </div>
            <p className="mt-1 text-3xl font-black text-slate-900">{s.v}</p>
          </div>
        ))}
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-role-employer">Recruitment</p>
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">My Vacancies</h2>
            <p className="mt-1 text-sm text-slate-600">Manage your current job openings and make them available for upcoming activities.</p>
          </div>
          {!isPending && (
            <div className="flex flex-wrap gap-2">
              <Link to="/employer/inbox" className={`${BTN} bg-white px-4 text-violet-900`}>Application Inbox</Link>
              <button onClick={() => { setDefForm(emptyDefForm); setCreateOpen(true) }} className={`${BTN} bg-role-employer px-4 text-white`}>+ Create Vacancy</button>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {definitions.map(def => (
          <article key={def.id} aria-labelledby={`vacancy-${def.id}-title`} className={`flex flex-col p-5 ${PANEL}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id={`vacancy-${def.id}-title`} className="truncate text-lg font-bold text-slate-900">{def.position}</h3>
                {def.principal_name && <p className="text-xs font-medium text-role-employer">Principal: {def.principal_name}</p>}
              </div>
              <span className={`flex-shrink-0 rounded-md border-2 border-slate-900 px-2.5 py-1 font-mono text-xs font-bold ${def.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{def.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${def.platform_status === 'published' ? 'bg-blue-100 text-blue-900' : def.platform_status === 'closed' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-900'}`}>Platform: {def.platform_status || 'draft'}</span>
              {def.platform_status === 'published' && <Link to={`/jobs/${def.id}`} className="text-xs font-bold text-blue-700 underline-offset-4 hover:underline">View listing</Link>}
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              {def.available_slots != null && <p className="font-semibold text-role-employer">{def.available_slots} current opening{def.available_slots === 1 ? '' : 's'}</p>}
              {def.salary_range && <p>{def.salary_range}</p>}
              {def.place_of_assignment && <p>{def.place_of_assignment}</p>}
              {def.qualifications && <p className="line-clamp-2">{def.qualifications}</p>}
              {def.updated_at && <p className="text-[10px] text-slate-400">Updated {format(new Date(def.updated_at), 'MMM d, yyyy')}</p>}
            </div>
            {def.event_vacancies?.length > 0 ? (
              <div className="mt-4 space-y-2">
                {def.event_vacancies.map(ev => {
                  const filled = filledCounts[ev.id] || 0
                  const pct = ev.slots_offered > 0 ? Math.min(100, Math.round((filled / ev.slots_offered) * 100)) : 0
                  return (
                    <div key={ev.id} className="rounded-lg border-2 border-slate-900 bg-white p-3 pixel-shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => loadApplicants(ev)} className="min-h-[36px] flex-1 text-left text-xs font-bold text-slate-700 underline-offset-2 hover:text-role-employer hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300">{ev.events?.event_name}</button>
                        <span className="font-mono text-xs font-bold">{filled}/{ev.slots_offered}</span>
                      </div>
                      {ev.events?.event_date && <p className="font-mono text-[10px] text-slate-400">{format(new Date(ev.events.event_date), 'MMM d, yyyy')}</p>}
                      <div className="mt-1.5 h-2 w-full overflow-hidden border border-slate-900 bg-slate-100">
                        <div className={`h-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-500' : 'bg-role-employer'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-2 flex justify-end gap-1.5">
                        {!isPending && (
                          <>
                            <button onClick={() => openEditOffering(ev, def)} className={`${BTN_MINI} bg-white text-slate-700`}>Edit</button>
                            <button onClick={() => setDeleteOffering(ev)} className={`${BTN_MINI} bg-red-600 text-white`}>Remove</button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : <p className="mt-4 rounded-lg border-2 border-dashed border-slate-300 p-3 text-center text-xs text-slate-400">Not offered at any event yet</p>}
            <Link
              to={`/employer/recommendations/${def.id}`}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-slate-900 bg-violet-50 px-3 text-xs font-bold uppercase tracking-wide text-violet-900 pixel-shadow-sm hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300"
            >
              Recommended Candidates
            </Link>
            <Link to={`/employer/inbox/${def.id}`} className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-slate-900 bg-white px-3 text-xs font-bold uppercase tracking-wide text-violet-900 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300">Formal applications</Link>
            {!isPending && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(def.platform_status || 'draft') === 'draft' && <button onClick={() => changePublication(def, 'publish')} disabled={publicationWorkingId === def.id} className={`${BTN_MINI} col-span-2 bg-blue-700 text-white disabled:opacity-50`}>{publicationWorkingId === def.id ? 'Publishing...' : 'Publish to Jobs'}</button>}
                {def.platform_status === 'published' && <button onClick={() => changePublication(def, 'close')} disabled={publicationWorkingId === def.id} className={`${BTN_MINI} col-span-2 bg-amber-400 text-slate-900 disabled:opacity-50`}>{publicationWorkingId === def.id ? 'Closing...' : 'Close platform listing'}</button>}
              </div>
            )}
            <div className="mt-auto flex gap-2 border-t-2 border-slate-100 pt-3">
              {!isPending && (
                <>
                  <button onClick={() => openAddToEvent(def)} className={`${BTN_MINI} flex-1 bg-role-employer text-white`}>Offer to Activity</button>
                  <button onClick={() => openEditDef(def)} className={`${BTN_MINI} bg-white text-slate-700`}>Edit</button>
                  <button onClick={() => setDeleteDef(def)} aria-label={`Delete vacancy ${def.position}`} className={`${BTN_MINI} border-red-800 bg-white px-2.5 text-red-600`}><span aria-hidden>✕</span></button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {definitions.length === 0 && (
        <div className={`p-8 text-center ${PANEL}`}>
          <PixelBuilding />
          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-400">No Vacancies Yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            {isPending
              ? 'Vacancy posting becomes available once PESO approves your accreditation.'
              : 'Post your first job opening, then offer it to an upcoming activity.'}
          </p>
          {!isPending && (
            <button onClick={() => { setDefForm(emptyDefForm); setCreateOpen(true) }} className={`${BTN} mt-4 bg-role-employer px-6 text-white`}>Create Your First Vacancy</button>
          )}
        </div>
      )}
      </section>

      {events.filter(ev => ev.status === 'upcoming').length > 0 ? (
        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Upcoming Activities</h2>
              <p className="mt-1 text-sm text-slate-600">Scheduled activities you can participate in.</p>
            </div>
            <Link to="/calendar" className={`${BTN} bg-white px-4 text-role-employer`}>Open Calendar</Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {events
              .filter(ev => ev.status === 'upcoming')
              .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
              .slice(0, 3)
              .map(ev => (
                <Link key={ev.id} to="/calendar" className={`p-5 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 ${PANEL}`}>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-role-employer">{format(new Date(ev.event_date), 'MMM d')}</p>
                  <p className="mt-1 truncate font-bold text-slate-900">{ev.event_name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{eventTypeDisplay(ev)} · {ev.location}</p>
                </Link>
              ))}
          </div>
        </section>
      ) : (
        <section className={`p-8 text-center ${PANEL}`}>
          <PixelCalScene />
          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-400">No Upcoming Activities</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Job fairs and recruitment activities will appear here once PESO schedules them.</p>
          <Link to="/calendar" className={`${BTN} mt-4 bg-white px-6 text-role-employer`}>View Full Calendar</Link>
        </section>
      )}

      {(createOpen || editDef) && (
        <Modal onClose={() => { setCreateOpen(false); setEditDef(null); clearReqState(); setModalTab('job') }} title={editDef ? 'Edit Vacancy' : 'Create Vacancy'}>
          <div className="mb-4 flex gap-1 rounded-lg border-2 border-slate-900 p-1">
            <button type="button" onClick={() => setModalTab('job')} className={`flex-1 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wide ${modalTab === 'job' ? 'bg-role-employer text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Job Info</button>
            <button type="button" onClick={() => setModalTab('requirements')} className={`flex-1 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wide ${modalTab === 'requirements' ? 'bg-role-employer text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Requirements</button>
          </div>
          <form onSubmit={editDef ? (e) => { e.preventDefault(); saveDefinition() } : handleCreate} className="space-y-4">
            {modalTab === 'job' && (<>
              <div><label className="block text-sm font-medium text-slate-700">Company</label><input disabled className={inputCls + ' bg-slate-50 text-slate-500'} value={employer.company_name} /></div>
              <div><label className="block text-sm font-medium text-slate-700">Position *</label><input required className={inputCls} value={defForm.position} onChange={(e) => setDefForm({ ...defForm, position: e.target.value })} /></div>
              {isAgency && <div><label className="block text-sm font-medium text-slate-700">Principal</label><input className={inputCls} value={defForm.principal_name} onChange={(e) => setDefForm({ ...defForm, principal_name: e.target.value })} placeholder="Company they're hiring for" /><p className="mt-1 text-xs text-slate-400">Leave empty if direct hire</p></div>}
              <div><label className="block text-sm font-medium text-slate-700">Job Description</label><textarea className={inputCls} rows={2} value={defForm.job_description} onChange={(e) => setDefForm({ ...defForm, job_description: e.target.value })} placeholder="Describe the role and responsibilities" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-slate-700">Occupation</label><select className={inputCls} value={defForm.occupation_id} onChange={(e) => setDefForm({ ...defForm, occupation_id: e.target.value })}><option value="">Select occupation</option>{refOccupations.map(o => <option key={o.id} value={o.id}>{o.canonical_name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-slate-700">Industry</label><select className={inputCls} value={defForm.industry_id} onChange={(e) => setDefForm({ ...defForm, industry_id: e.target.value })}><option value="">Select industry</option>{refIndustries.map(i => <option key={i.id} value={i.id}>{i.canonical_name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-slate-700">Employment Type</label><select className={inputCls} value={defForm.employment_type_id} onChange={(e) => setDefForm({ ...defForm, employment_type_id: e.target.value })}><option value="">Select type</option>{refEmploymentTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-slate-700">Work Arrangement</label><select className={inputCls} value={defForm.work_arrangement_id} onChange={(e) => setDefForm({ ...defForm, work_arrangement_id: e.target.value })}><option value="">Select arrangement</option>{refWorkArrangements.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-slate-700">Salary Range</label><input className={inputCls} value={defForm.salary_range} onChange={(e) => setDefForm({ ...defForm, salary_range: e.target.value })} placeholder="e.g. 15,000 - 20,000" /></div>
                <div><label className="block text-sm font-medium text-slate-700">Available Slots</label><input type="number" min="0" className={inputCls} value={defForm.available_slots} onChange={(e) => setDefForm({ ...defForm, available_slots: e.target.value })} placeholder="Current openings" /></div>
                <div><label className="block text-sm font-medium text-slate-700">Salary Min</label><input type="number" min="0" className={inputCls} value={defForm.salary_min} onChange={(e) => setDefForm({ ...defForm, salary_min: e.target.value })} placeholder="Minimum salary" /></div>
                <div><label className="block text-sm font-medium text-slate-700">Salary Max</label><input type="number" min="0" className={inputCls} value={defForm.salary_max} onChange={(e) => setDefForm({ ...defForm, salary_max: e.target.value })} placeholder="Maximum salary" /></div>
                <div><label className="block text-sm font-medium text-slate-700">Salary Period</label><select className={inputCls} value={defForm.salary_period} onChange={(e) => setDefForm({ ...defForm, salary_period: e.target.value })}><option value="">Select period</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="annual">Annual</option></select></div>
                <label className="flex items-center gap-2 text-sm text-slate-700 pt-6"><input type="checkbox" checked={defForm.salary_negotiable} onChange={(e) => setDefForm({ ...defForm, salary_negotiable: e.target.checked })} className="h-4 w-4 rounded" />Salary negotiable</label>
                <div className="col-span-2"><label className="block text-sm font-medium text-slate-700">Place of Assignment</label><input className={inputCls} value={defForm.place_of_assignment} onChange={(e) => setDefForm({ ...defForm, place_of_assignment: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-slate-700">Province</label><input className={inputCls} value={defForm.province} onChange={(e) => setDefForm({ ...defForm, province: e.target.value })} placeholder="e.g. Cagayan" /></div>
                <div><label className="block text-sm font-medium text-slate-700">City / Municipality</label><input className={inputCls} value={defForm.municipality_city} onChange={(e) => setDefForm({ ...defForm, municipality_city: e.target.value })} placeholder="e.g. Tuguegarao City" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700">Qualifications</label><textarea className={inputCls} rows={2} value={defForm.qualifications} onChange={(e) => setDefForm({ ...defForm, qualifications: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={defForm.is_active} onChange={(e) => setDefForm({ ...defForm, is_active: e.target.checked })} className="h-4 w-4 rounded" />Active</label>
            </>)}

            {modalTab === 'requirements' && (<>
              <p className="text-xs text-slate-500">Structured requirements enable machine-readable matching. All optional.</p>

              {/* Skills */}
              <ReqSection title="Skills">
                {reqSkills.filter(r => !r._delete).map((r, i) => (
                  <div key={r.id || `sk${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{r.skills?.canonical_name || refSkills.find(s => s.id === r.skill_id)?.canonical_name || 'Unknown'}</p>
                      <p className="text-[11px] text-slate-500">{r.importance}{r.minimum_proficiency ? ` · ${r.minimum_proficiency}` : ''}{r.minimum_years_experience ? ` · ${r.minimum_years_experience}yr` : ''}</p>
                    </div>
                    <button type="button" onClick={() => setReqSkills(prev => prev.filter((_, j) => j !== i))} className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                  </div>
                ))}
                <ReqSkillAdd refSkills={refSkills} onAdd={(sk) => setReqSkills(prev => [...prev, { ...sk, _local: true }])} existing={reqSkills.filter(r => !r._delete).map(r => r.skill_id)} />
              </ReqSection>

              {/* Education */}
              <ReqSection title="Education">
                {reqEducation.filter(r => !r._delete).map((r, i) => (
                  <div key={r.id || `ed${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{r.education_levels?.name || refEducationLevels.find(e => e.id === r.education_level_id)?.name || 'Unknown'}</p>
                      <p className="text-[11px] text-slate-500">{r.importance}{r.field_of_study ? ` · ${r.field_of_study}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => setReqEducation(prev => prev.filter((_, j) => j !== i))} className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                  </div>
                ))}
                <ReqEducationAdd refEducationLevels={refEducationLevels} onAdd={(ed) => setReqEducation(prev => [...prev, { ...ed, _local: true }])} />
              </ReqSection>

              {/* Experience */}
              <ReqSection title="Experience">
                {reqExperience.filter(r => !r._delete).map((r, i) => (
                  <div key={r.id || `ex${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{r.minimum_months ? `${Math.floor(r.minimum_months / 12)}y ${r.minimum_months % 12}m min` : 'No minimum'}</p>
                      <p className="text-[11px] text-slate-500">{r.importance}{r.description ? ` · ${r.description}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => setReqExperience(prev => prev.filter((_, j) => j !== i))} className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                  </div>
                ))}
                <ReqExperienceAdd refOccupations={refOccupations} refIndustries={refIndustries} onAdd={(ex) => setReqExperience(prev => [...prev, { ...ex, _local: true }])} />
              </ReqSection>

              {/* Certifications */}
              <ReqSection title="Certifications">
                {reqCertifications.filter(r => !r._delete).map((r, i) => (
                  <div key={r.id || `ce${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{r.certifications?.canonical_name || refCertifications.find(c => c.id === r.certification_id)?.canonical_name || 'Unknown'}</p>
                      <p className="text-[11px] text-slate-500">{r.importance}{r.must_be_valid ? ' · must be valid' : ''}</p>
                    </div>
                    <button type="button" onClick={() => setReqCertifications(prev => prev.filter((_, j) => j !== i))} className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                  </div>
                ))}
                <ReqCertAdd refCertifications={refCertifications} onAdd={(ce) => setReqCertifications(prev => [...prev, { ...ce, _local: true }])} existing={reqCertifications.filter(r => !r._delete).map(r => r.certification_id)} />
              </ReqSection>

              {/* Languages */}
              <ReqSection title="Languages">
                {reqLanguages.filter(r => !r._delete).map((r, i) => (
                  <div key={r.id || `la${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{r.languages?.name || refLanguages.find(l => l.id === r.language_id)?.name || 'Unknown'}</p>
                      <p className="text-[11px] text-slate-500">{r.importance}{r.minimum_speaking ? ` · speaking: ${r.minimum_speaking}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => setReqLanguages(prev => prev.filter((_, j) => j !== i))} className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                  </div>
                ))}
                <ReqLangAdd refLanguages={refLanguages} onAdd={(la) => setReqLanguages(prev => [...prev, { ...la, _local: true }])} existing={reqLanguages.filter(r => !r._delete).map(r => r.language_id)} />
              </ReqSection>
            </>)}

            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={defForm.is_active} onChange={(e) => setDefForm({ ...defForm, is_active: e.target.checked })} className="h-4 w-4 rounded" />Active</label>
            <button disabled={creating || saving} className={`${BTN} w-full bg-role-employer py-3 text-white disabled:opacity-50`}>{creating || saving ? 'Saving...' : 'Save'}</button>
          </form>
        </Modal>
      )}

      {addToEventDef && (
        <Modal onClose={() => setAddToEventDef(null)} title={`Offer "${addToEventDef.position}" at event`}>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-slate-700">Event *</label><select className={inputCls} value={offeringForm.event_id} onChange={(e) => setOfferingForm({ ...offeringForm, event_id: e.target.value })}><option value="">Select</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name} — {eventTypeDisplay(ev)}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-slate-700">Slots *</label><input type="number" min="1" className={inputCls} value={offeringForm.slots_offered} onChange={(e) => setOfferingForm({ ...offeringForm, slots_offered: e.target.value })} /></div>
            <div><label className="block text-sm font-medium text-slate-700">Notes</label><input className={inputCls} value={offeringForm.notes} onChange={(e) => setOfferingForm({ ...offeringForm, notes: e.target.value })} /></div>
            <button onClick={handleAddOffering} disabled={saving} className={`${BTN} w-full bg-role-employer py-3 text-white disabled:opacity-50`}>{saving ? 'Saving...' : 'Add'}</button>
          </div>
        </Modal>
      )}

      {editOffering && (
        <Modal onClose={() => setEditOffering(null)} title={`Edit — ${editOffering.definition.position}`}>
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Event: {editOffering.offering.events?.event_name}</p>
            <div><label className="block text-sm font-medium text-slate-700">Slots *</label><input type="number" min="1" className={inputCls} value={offeringForm.slots_offered} onChange={(e) => setOfferingForm({ ...offeringForm, slots_offered: e.target.value })} /></div>
            <div><label className="block text-sm font-medium text-slate-700">Notes</label><input className={inputCls} value={offeringForm.notes} onChange={(e) => setOfferingForm({ ...offeringForm, notes: e.target.value })} /></div>
            <button onClick={saveOffering} disabled={saving} className={`${BTN} w-full bg-role-employer py-3 text-white disabled:opacity-50`}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {deleteDef && (
        <Modal onClose={() => setDeleteDef(null)} title="Confirm Delete">
          <p className="text-sm text-slate-600">Delete <strong>{deleteDef.position}</strong>? This removes all event offerings too.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteDef(null)} className={`${BTN} bg-white py-3 text-slate-700`}>Cancel</button>
            <button onClick={confirmDeleteDefinition} disabled={deleting} className={`${BTN} border-red-800 bg-red-600 py-3 text-white disabled:opacity-50`}>{deleting ? 'Deleting...' : 'Delete'}</button>
          </div>
        </Modal>
      )}

      {deleteOffering && (
        <Modal onClose={() => setDeleteOffering(null)} title="Remove Offering">
          <p className="text-sm text-slate-600">Remove from <strong>{deleteOffering.events?.event_name}</strong>?</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteOffering(null)} className={`${BTN} bg-white py-3 text-slate-700`}>Cancel</button>
            <button onClick={confirmDeleteOffering} disabled={deleting} className={`${BTN} border-red-800 bg-red-600 py-3 text-white disabled:opacity-50`}>{deleting ? 'Removing...' : 'Remove'}</button>
          </div>
        </Modal>
      )}

      {editCompanyOpen && companyForm && (
        <Modal onClose={() => setEditCompanyOpen(false)} title="Edit Company Information">
          <form onSubmit={saveCompany} className="space-y-4">
            <div><label className="block text-sm font-medium text-slate-700">Company Name *</label><input required className={inputCls} value={companyForm.company_name} onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-slate-700">Employer Type</label>
                <select className={inputCls} value={companyForm.employer_type} onChange={(e) => setCompanyForm({ ...companyForm, employer_type: e.target.value })}>
                  <option value={EMPLOYER_TYPE.LOCAL_DIRECT}>Direct Employer</option>
                  <option value={EMPLOYER_TYPE.LOCAL_AGENCY}>Recruitment Agency</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-slate-700">Industry</label><input className={inputCls} value={companyForm.industry} onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })} /></div>
            </div>
            <div><label className="block text-sm font-medium text-slate-700">License No. (DOLE)</label><input className={inputCls} value={companyForm.license_no} onChange={(e) => setCompanyForm({ ...companyForm, license_no: e.target.value })} /></div>
            <div><label className="block text-sm font-medium text-slate-700">TIN</label><input className={inputCls} placeholder="000-000-000-000" value={companyForm.tin} onChange={(e) => setCompanyForm({ ...companyForm, tin: e.target.value })} /></div>
            <div className="grid grid-cols-1 gap-3">
              <div><label className="block text-sm font-medium text-slate-700">Business Structure *</label>
                <select required className={inputCls} value={companyForm.business_structure} onChange={(e) => setCompanyForm({ ...companyForm, business_structure: e.target.value })}>
                  <option value="">Select structure</option>
                  <option value={BUSINESS_STRUCTURE.CORPORATION}>Corporation</option>
                  <option value={BUSINESS_STRUCTURE.PARTNERSHIP}>Partnership</option>
                  <option value={BUSINESS_STRUCTURE.SINGLE_PROPRIETORSHIP}>Single Proprietorship</option>
                  <option value={BUSINESS_STRUCTURE.COOPERATIVE}>Cooperative</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-slate-700">Workplace Classification (OSH) *</label>
                <select required className={inputCls} value={companyForm.osh_classification} onChange={(e) => setCompanyForm({ ...companyForm, osh_classification: e.target.value })}>
                  <option value="">Select classification</option>
                  <option value={OSH_CLASSIFICATION.LOW_RISK}>Low-risk office / workplace</option>
                  <option value={OSH_CLASSIFICATION.CONSTRUCTION_HEAVY_INDUSTRIAL}>Construction / Heavy Industrial</option>
                </select>
              </div>
            </div>
            <div><label className="block text-sm font-medium text-slate-700">Contact Person</label><input className={inputCls} value={companyForm.contact_person} onChange={(e) => setCompanyForm({ ...companyForm, contact_person: e.target.value })} /></div>
            <div><label className="block text-sm font-medium text-slate-700">Contact Number</label><input className={inputCls} value={companyForm.contact_number} onChange={(e) => setCompanyForm({ ...companyForm, contact_number: e.target.value })} /></div>
            <button disabled={saving} className={`${BTN} w-full bg-role-employer py-3 text-white disabled:opacity-50`}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </form>
        </Modal>
      )}

      {applicantsModal && (
        <Modal onClose={() => setApplicantsModal(null)} title="Applicants">
          <p className="mb-3 text-sm text-slate-500">{applicantsModal.offering.events?.event_name} · {applicantsModal.applicants.length} applicant(s)</p>
          {applicantsModal.applicants.length === 0 ? (
            <div className="py-6 text-center"><PixelDesk /><p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-400">No Applicants Yet</p><p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">Applicants will appear here when they apply to this position at the event.</p></div>
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
    </div>
  )
}

function ReqSection({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border-2 border-slate-200">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-bold text-slate-800 hover:bg-slate-50">
        {title} <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="space-y-2 border-t border-slate-100 px-3 py-3">{children}</div>}
    </div>
  )
}

function ReqSkillAdd({ refSkills, onAdd, existing }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false)
  const [importance, setImportance] = useState('required')
  const [proficiency, setProficiency] = useState(''); const [years, setYears] = useState('')
  const results = q.length >= 2 ? refSkills.filter(s => s.canonical_name.toLowerCase().includes(q.toLowerCase()) && !existing.includes(s.id)) : []
  const exact = refSkills.find(s => s.canonical_name.toLowerCase() === q.toLowerCase() && !existing.includes(s.id))
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-300 p-2">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left text-xs font-semibold text-blue-700 hover:text-blue-800">+ Add skill</button>
      {open && (
        <div className="mt-2 space-y-2">
          <input className={inputCls + ' text-sm'} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills..." autoFocus />
          {results.length > 0 && (
            <ul className="max-h-32 overflow-auto rounded border border-slate-200 bg-white text-sm">
              {results.slice(0, 8).map(s => <li key={s.id}><button type="button" onClick={() => { setQ(s.canonical_name); }} className="w-full px-2 py-1.5 text-left hover:bg-slate-50">{s.canonical_name}</button></li>)}
            </ul>
          )}
          {q && !exact && results.length === 0 && <p className="text-[11px] text-amber-600">Skill not found in canonical list.</p>}
          {exact && (
            <div className="grid grid-cols-3 gap-2">
              <select className={inputCls + ' text-xs'} value={importance} onChange={(e) => setImportance(e.target.value)}>
                <option value="required">Required</option><option value="preferred">Preferred</option><option value="nice_to_have">Nice to have</option>
              </select>
              <select className={inputCls + ' text-xs'} value={proficiency} onChange={(e) => setProficiency(e.target.value)}>
                <option value="">Proficiency</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="expert">Expert</option>
              </select>
              <input type="number" min="0" max="50" className={inputCls + ' text-xs'} value={years} onChange={(e) => setYears(e.target.value)} placeholder="Years" />
            </div>
          )}
          {exact && <button type="button" onClick={() => { onAdd({ skill_id: exact.id, importance, minimum_proficiency: proficiency || null, minimum_years_experience: years ? Number(years) : null }); setQ(''); setProficiency(''); setYears('') }} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Add</button>}
        </div>
      )}
    </div>
  )
}

function ReqEducationAdd({ refEducationLevels, onAdd }) {
  const [open, setOpen] = useState(false)
  const [levelId, setLevelId] = useState(''); const [field, setField] = useState('')
  const [importance, setImportance] = useState('required'); const [notes, setNotes] = useState('')
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-300 p-2">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left text-xs font-semibold text-blue-700 hover:text-blue-800">+ Add education requirement</button>
      {open && (
        <div className="mt-2 space-y-2">
          <select className={inputCls + ' text-sm'} value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            <option value="">Select education level</option>{refEducationLevels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input className={inputCls + ' text-sm'} value={field} onChange={(e) => setField(e.target.value)} placeholder="Field of study (optional)" />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls + ' text-xs'} value={importance} onChange={(e) => setImportance(e.target.value)}>
              <option value="required">Required</option><option value="preferred">Preferred</option><option value="nice_to_have">Nice to have</option>
            </select>
            <input className={inputCls + ' text-xs'} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
          </div>
          <button type="button" onClick={() => { if (!levelId) return; onAdd({ education_level_id: levelId, field_of_study: field || null, importance, notes: notes || null }); setLevelId(''); setField(''); setNotes('') }} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Add</button>
        </div>
      )}
    </div>
  )
}

function ReqExperienceAdd({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState(''); const [desc, setDesc] = useState('')
  const [importance, setImportance] = useState('required')
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-300 p-2">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left text-xs font-semibold text-blue-700 hover:text-blue-800">+ Add experience requirement</button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[11px] font-semibold text-slate-500">Min months</label><input type="number" min="0" max="600" className={inputCls + ' text-sm'} value={months} onChange={(e) => setMonths(e.target.value)} placeholder="0 = no minimum" /></div>
            <select className={inputCls + ' text-sm'} value={importance} onChange={(e) => setImportance(e.target.value)}>
              <option value="required">Required</option><option value="preferred">Preferred</option>
            </select>
          </div>
          <input className={inputCls + ' text-sm'} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" />
          <button type="button" onClick={() => { onAdd({ minimum_months: months ? Number(months) : null, description: desc || null, importance }); setMonths(''); setDesc('') }} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Add</button>
        </div>
      )}
    </div>
  )
}

function ReqCertAdd({ refCertifications, onAdd, existing }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false)
  const [importance, setImportance] = useState('required'); const [valid, setValid] = useState(false); const [notes, setNotes] = useState('')
  const results = q.length >= 2 ? refCertifications.filter(c => c.canonical_name.toLowerCase().includes(q.toLowerCase()) && !existing.includes(c.id)) : []
  const exact = refCertifications.find(c => c.canonical_name.toLowerCase() === q.toLowerCase() && !existing.includes(c.id))
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-300 p-2">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left text-xs font-semibold text-blue-700 hover:text-blue-800">+ Add certification requirement</button>
      {open && (
        <div className="mt-2 space-y-2">
          <input className={inputCls + ' text-sm'} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search certifications..." autoFocus />
          {results.length > 0 && (
            <ul className="max-h-32 overflow-auto rounded border border-slate-200 bg-white text-sm">
              {results.slice(0, 8).map(c => <li key={c.id}><button type="button" onClick={() => setQ(c.canonical_name)} className="w-full px-2 py-1.5 text-left hover:bg-slate-50">{c.canonical_name}</button></li>)}
            </ul>
          )}
          {q && !exact && results.length === 0 && <p className="text-[11px] text-amber-600">Certification not found.</p>}
          {exact && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls + ' text-xs'} value={importance} onChange={(e) => setImportance(e.target.value)}>
                  <option value="required">Required</option><option value="preferred">Preferred</option><option value="nice_to_have">Nice to have</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={valid} onChange={(e) => setValid(e.target.checked)} className="h-3.5 w-3.5 rounded" />Must be valid</label>
              </div>
              <input className={inputCls + ' text-xs'} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
              <button type="button" onClick={() => { onAdd({ certification_id: exact.id, importance, must_be_valid: valid, notes: notes || null }); setQ(''); setNotes('') }} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Add</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReqLangAdd({ refLanguages, onAdd, existing }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false)
  const [importance, setImportance] = useState('required')
  const [speak, setSpeak] = useState(''); const [read, setRead] = useState(''); const [write, setWrite] = useState('')
  const results = q.length >= 2 ? refLanguages.filter(l => l.name.toLowerCase().includes(q.toLowerCase()) && !existing.includes(l.id)) : []
  const exact = refLanguages.find(l => l.name.toLowerCase() === q.toLowerCase() && !existing.includes(l.id))
  const PROF = ['basic', 'conversational', 'professional', 'native']
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-300 p-2">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left text-xs font-semibold text-blue-700 hover:text-blue-800">+ Add language requirement</button>
      {open && (
        <div className="mt-2 space-y-2">
          <input className={inputCls + ' text-sm'} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search languages..." autoFocus />
          {results.length > 0 && (
            <ul className="max-h-32 overflow-auto rounded border border-slate-200 bg-white text-sm">
              {results.slice(0, 8).map(l => <li key={l.id}><button type="button" onClick={() => setQ(l.name)} className="w-full px-2 py-1.5 text-left hover:bg-slate-50">{l.name}</button></li>)}
            </ul>
          )}
          {q && !exact && results.length === 0 && <p className="text-[11px] text-amber-600">Language not found.</p>}
          {exact && (
            <div className="space-y-2">
              <select className={inputCls + ' text-xs'} value={importance} onChange={(e) => setImportance(e.target.value)}>
                <option value="required">Required</option><option value="preferred">Preferred</option><option value="nice_to_have">Nice to have</option>
              </select>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-[10px] font-semibold text-slate-500">Speaking</label><select className={inputCls + ' text-xs'} value={speak} onChange={(e) => setSpeak(e.target.value)}><option value="">Any</option>{PROF.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                <div><label className="text-[10px] font-semibold text-slate-500">Reading</label><select className={inputCls + ' text-xs'} value={read} onChange={(e) => setRead(e.target.value)}><option value="">Any</option>{PROF.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                <div><label className="text-[10px] font-semibold text-slate-500">Writing</label><select className={inputCls + ' text-xs'} value={write} onChange={(e) => setWrite(e.target.value)}><option value="">Any</option>{PROF.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              </div>
              <button type="button" onClick={() => { onAdd({ language_id: exact.id, importance, minimum_speaking: speak || null, minimum_reading: read || null, minimum_writing: write || null }); setQ(''); setSpeak(''); setRead(''); setWrite('') }} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Add</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`${PANEL} max-h-[90dvh] w-full max-w-md overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black uppercase tracking-wide text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl leading-none text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
