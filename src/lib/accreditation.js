// Employer accreditation requirement configuration.
// Conditions MUST stay in sync with the approval gate inside
// admin_approve_employer (migration_employer_accreditation.sql).

export const REQUIREMENTS = [
  { key: 'letter_of_intent', label: 'Letter of Intent', category: 'Application', applicable: () => true },
  { key: 'company_profile', label: 'Company Profile', category: 'Company Documents', applicable: () => true },
  { key: 'business_permit', label: 'Business Permit / Mayor’s Permit', category: 'Company Documents', applicable: () => true },
  { key: 'bir_2303', label: 'BIR Form 2303', category: 'Company Documents', applicable: () => true },
  { key: 'sec_registration', category: 'Business Registration', label: 'SEC Certification', applicable: (e) => ['corporation', 'partnership'].includes(e.business_structure) },
  { key: 'dti_registration', category: 'Business Registration', label: 'DTI Registration', applicable: (e) => e.business_structure === 'single_proprietorship' },
  { key: 'cda_registration', category: 'Business Registration', label: 'CDA Registration', applicable: (e) => e.business_structure === 'cooperative' },
  { key: 'philhealth_registration', category: 'Social Benefits', label: 'PhilHealth Registration', applicable: () => true },
  { key: 'pagibig_registration', category: 'Social Benefits', label: 'Pag-IBIG Membership Registration', applicable: () => true },
  { key: 'sss_registration', category: 'Social Benefits', label: 'SSS Registration', applicable: () => true },
  { key: 'dole_rule_1020', category: 'DOLE', label: 'DOLE Rule 1020 Registration', applicable: (e) => e.employer_type === 'local_direct' },
  { key: 'dole_do174', category: 'DOLE', label: 'DOLE DO 174 License', applicable: (e) => e.employer_type === 'local_agency' },
  { key: 'bosh_certificate', category: 'Occupational Safety', label: 'BOSH Certificate', applicable: (e) => e.osh_classification === 'low_risk' },
  { key: 'cosh_certificate', category: 'Occupational Safety', label: 'COSH Certificate', applicable: (e) => e.osh_classification === 'construction_heavy_industrial' },
  { key: 'philjobnet_certificate', category: 'PhilJobNet', label: 'PhilJobNet Certificate', applicable: () => true },
]

export const BUSINESS_STRUCTURES = [
  { value: 'corporation', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'single_proprietorship', label: 'Single Proprietorship' },
  { value: 'cooperative', label: 'Cooperative' },
]

export const OSH_CLASSIFICATIONS = [
  { value: 'low_risk', label: 'Low-risk office / workplace' },
  { value: 'construction_heavy_industrial', label: 'Construction / Heavy Industrial' },
]

export function applicableRequirements(employer, rows = []) {
  const byKey = Object.fromEntries(rows.map(r => [r.requirement_key, r]))
  return REQUIREMENTS
    .filter(r => r.applicable(employer))
    .map(r => ({ ...r, ...(byKey[r.key] || {}) }))
}

export const MAX_PDF_BYTES = 5 * 1024 * 1024 // matches existing resumes bucket

export function validatePdf(file) {
  if (file.type !== 'application/pdf') return 'Accepted format: PDF only.'
  if (file.size > MAX_PDF_BYTES) return 'Maximum file size is 5 MB.'
  return null
}

