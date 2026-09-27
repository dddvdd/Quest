// Employer taxonomy. Mirrors `employers.employer_type`,
// `employers.business_structure`, `employers.osh_classification`, and
// `employer_accreditation_requirements.status`. Database values unchanged.

export const EMPLOYER_TYPE = {
  LOCAL_DIRECT: 'local_direct',
  LOCAL_AGENCY: 'local_agency',
}

export const EMPLOYER_TYPE_LABEL = {
  [EMPLOYER_TYPE.LOCAL_DIRECT]: 'Direct Employer',
  [EMPLOYER_TYPE.LOCAL_AGENCY]: 'Recruitment Agency',
}

export const BUSINESS_STRUCTURE = {
  CORPORATION: 'corporation',
  PARTNERSHIP: 'partnership',
  SINGLE_PROPRIETORSHIP: 'single_proprietorship',
  COOPERATIVE: 'cooperative',
}

export const BUSINESS_STRUCTURE_LABEL = {
  [BUSINESS_STRUCTURE.CORPORATION]: 'Corporation',
  [BUSINESS_STRUCTURE.PARTNERSHIP]: 'Partnership',
  [BUSINESS_STRUCTURE.SINGLE_PROPRIETORSHIP]: 'Single Proprietorship',
  [BUSINESS_STRUCTURE.COOPERATIVE]: 'Cooperative',
}

export const OSH_CLASSIFICATION = {
  LOW_RISK: 'low_risk',
  CONSTRUCTION_HEAVY_INDUSTRIAL: 'construction_heavy_industrial',
}

export const OSH_CLASSIFICATION_LABEL = {
  [OSH_CLASSIFICATION.LOW_RISK]: 'Low-risk office / workplace',
  [OSH_CLASSIFICATION.CONSTRUCTION_HEAVY_INDUSTRIAL]: 'Construction / Heavy Industrial',
}