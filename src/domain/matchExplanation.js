export const EXPLANATION_VERSION = 'explanation-v1'

export const EXPLANATION_DIRECTIONS = Object.freeze({
  JOBSEEKER_TO_VACANCY: 'jobseeker_to_vacancy',
  VACANCY_TO_CANDIDATE: 'vacancy_to_candidate',
})

export const EXPLANATION_DIMENSIONS = Object.freeze([
  'occupation',
  'skills',
  'experience',
  'education',
  'certifications',
  'languages',
  'industry',
  'location',
  'employment_type',
  'work_arrangement',
  'salary',
  'availability',
])

const DIMENSION_LABELS = Object.freeze({
  occupation: 'Occupation preference',
  skills: 'Skills',
  experience: 'Experience',
  education: 'Education',
  certifications: 'Certifications',
  languages: 'Languages',
  industry: 'Industry preference',
  location: 'Location',
  employment_type: 'Employment type',
  work_arrangement: 'Work arrangement',
  salary: 'Salary',
  availability: 'Availability',
})

const STATUS_MAP = Object.freeze({
  match: 'matched',
  partial_match: 'partially_matched',
  mismatch: 'not_matched',
  unknown: 'unknown',
  not_applicable: 'not_applicable',
})

const SAFE_DETAIL_KEYS = new Set([
  'deadline',
  'required_rank',
  'candidate_rank',
  'required_field',
  'candidate_field',
  'minimum_months',
  'candidate_months',
  'skill_id',
  'skill_name',
  'certification_id',
  'canonical_name',
  'language_id',
  'name',
  'candidate_min',
  'vacancy_max',
])

const safeDetails = (details) => {
  if (!details || typeof details !== 'object') return {}
  return Object.fromEntries(
    Object.entries(details).filter(([key, value]) => SAFE_DETAIL_KEYS.has(key) && value !== undefined),
  )
}

const pick = (source, keys) => {
  const result = {}
  for (const key of keys) {
    if (source?.[key] !== undefined) result[key] = source[key]
  }
  return result
}

const cleanList = (items, keys) => (Array.isArray(items) ? items.map((item) => pick(item, keys)) : [])

const checksFor = (eligibility, category) =>
  (eligibility?.checks || []).filter((check) => check.category === category)

const normalizeCheck = (check) => ({
  code: check.code,
  category: check.category,
  status: check.status,
  importance: check.importance,
  severity:
    check.status === 'fail' && check.importance === 'required'
      ? 'blocking'
      : check.status === 'unknown' && check.importance === 'required'
        ? 'conditional'
        : check.status === 'warning' || check.status === 'fail'
          ? 'warning'
          : check.status === 'pass'
            ? 'positive'
            : 'unknown',
  message: check.message,
  evidence: safeDetails(check.details),
})

const findCandidateMatch = (items, detail, idKey, nameKeys) =>
  (items || []).find((item) => {
    if (detail[idKey] != null && item[idKey] != null) return item[idKey] === detail[idKey]
    return nameKeys.some((key) => {
      const expected = detail[key]
      const actual = item[key]
      return expected && actual && String(expected).toLowerCase() === String(actual).toLowerCase()
    })
  })

const requirementEvidence = (checks, candidateItems, idKey, nameKeys, candidateKeys) =>
  checks.map((check) => {
    const detail = safeDetails(check.details)
    const candidate = findCandidateMatch(candidateItems, detail, idKey, nameKeys)
    return {
      code: check.code,
      status: check.status,
      importance: check.importance,
      ...detail,
      candidate: candidate ? pick(candidate, candidateKeys) : null,
    }
  })

const basicDimensionEvidence = (dimension) => {
  const evidence = dimension?.evidence || {}
  const allowed = {
    occupation: ['vacancy_occupation_id'],
    skills: ['vacancy_skills_count', 'candidate_skills_count'],
    experience: ['required_months', 'candidate_months'],
    education: ['required_rank', 'candidate_rank'],
    certifications: ['vacancy_cert_count', 'candidate_cert_count'],
    languages: ['vacancy_lang_count', 'candidate_lang_count'],
    industry: ['vacancy_industry_id', 'candidate_industry_count'],
    location: ['vacancy_location'],
    employment_type: ['vacancy_employment_type_id'],
    work_arrangement: ['vacancy_work_arrangement_id'],
    salary: ['candidate_salary_min', 'vacancy_salary_max'],
    availability: ['availability_status'],
  }
  return pick(evidence, allowed[dimension.dimension] || [])
}

const buildEvidence = (name, source, jobseeker, vacancy, eligibility) => {
  const engine = basicDimensionEvidence(source)

  if (name === 'occupation') {
    const preferences = cleanList(jobseeker?.occupation_preferences, [
      'occupation_id',
      'canonical_name',
      'priority',
      'preference_type',
    ])
    const desired = preferences.find((item) => item.occupation_id === vacancy?.occupation_id) || null
    return {
      engine,
      vacancy: pick(vacancy, ['occupation_id', 'occupation_name']),
      preferences,
      desired_occupation: desired,
      match_basis: desired ? 'explicit_preference' : 'none',
    }
  }

  if (name === 'skills') {
    const skills = jobseeker?.skills || []
    const requirements = requirementEvidence(
      checksFor(eligibility, 'skills'),
      skills,
      'skill_id',
      ['skill_name', 'canonical_name'],
      ['skill_id', 'skill_name', 'canonical_name', 'proficiency_level', 'years_experience', 'verification_status'],
    )
    const vacancyIds = new Set((vacancy?.skills || []).map((item) => item.skill_id).filter(Boolean))
    const vacancyNames = new Set(
      (vacancy?.skills || [])
        .flatMap((item) => [item.skill_name, item.canonical_name])
        .filter(Boolean)
        .map((value) => String(value).toLowerCase()),
    )
    const extra = skills.filter((item) => {
      if (item.skill_id && vacancyIds.has(item.skill_id)) return false
      return ![item.skill_name, item.canonical_name]
        .filter(Boolean)
        .some((value) => vacancyNames.has(String(value).toLowerCase()))
    })
    return {
      engine,
      requirements,
      required_matched: requirements.filter(
        (item) => item.importance === 'required' && item.status === 'pass',
      ),
      required_missing: requirements.filter(
        (item) => item.importance === 'required' && item.status === 'fail',
      ),
      required_unknown: requirements.filter(
        (item) => item.importance === 'required' && item.status === 'unknown',
      ),
      preferred_matched: requirements.filter(
        (item) => item.importance === 'preferred' && item.status === 'pass',
      ),
      preferred_missing: requirements.filter(
        (item) => item.importance === 'preferred' && ['fail', 'warning'].includes(item.status),
      ),
      additional_candidate_skills: cleanList(extra, [
        'skill_id',
        'skill_name',
        'canonical_name',
        'proficiency_level',
        'years_experience',
        'verification_status',
      ]),
    }
  }

  if (name === 'experience') {
    const checks = checksFor(eligibility, 'experience').map(normalizeCheck)
    return {
      engine,
      requirements: (vacancy?.experience_requirements || []).map((requirement) => ({
        ...pick(requirement, ['occupation_id', 'industry_id', 'minimum_months', 'minimum_years', 'importance']),
        occupation_specific: Boolean(requirement.occupation_id || requirement.industry_id),
      })),
      checks,
      result: checks.some((item) => item.status === 'fail')
        ? 'not_met'
        : checks.some((item) => item.status === 'unknown')
          ? 'unknown'
          : 'met',
      candidate_years_experience: jobseeker?.years_of_experience ?? null,
    }
  }

  if (name === 'education') {
    const checks = checksFor(eligibility, 'education').map(normalizeCheck)
    return {
      engine,
      requirements: cleanList(vacancy?.education_requirements, [
      'education_level_id',
      'level_code',
      'level_name',
      'rank',
      'field_of_study',
      'importance',
      ]),
      candidate_education: cleanList(jobseeker?.education, [
        'education_level_id',
        'level_code',
        'level_name',
        'rank',
        'field_of_study',
        'course_program',
      ]),
      checks,
      result: checks.some((item) => item.status === 'fail')
        ? 'not_met'
        : checks.some((item) => item.status === 'unknown')
          ? 'unknown'
          : 'met',
    }
  }

  if (name === 'certifications') {
    const requirements = requirementEvidence(
      checksFor(eligibility, 'certifications'),
      jobseeker?.certifications,
      'certification_id',
      ['canonical_name', 'name'],
      ['certification_id', 'canonical_name', 'name', 'expiry_date', 'verification_status'],
    )
    return {
      engine,
      requirements,
      matched: requirements.filter((item) => item.status === 'pass'),
      missing: requirements.filter((item) => ['fail', 'warning'].includes(item.status)),
      unknown: requirements.filter((item) => item.status === 'unknown'),
    }
  }

  if (name === 'languages') {
    const requirements = requirementEvidence(
      checksFor(eligibility, 'languages'),
      jobseeker?.languages,
      'language_id',
      ['name'],
      [
        'language_id',
        'name',
        'speaking_proficiency',
        'reading_proficiency',
        'writing_proficiency',
        'verification_status',
      ],
    )
    return {
      engine,
      requirements,
      matched: requirements.filter((item) => item.status === 'pass'),
      missing: requirements.filter((item) => ['fail', 'warning'].includes(item.status)),
      unknown: requirements.filter((item) => item.status === 'unknown'),
    }
  }

  if (name === 'industry') {
    const preferences = cleanList(jobseeker?.industry_preferences, ['industry_id', 'name', 'priority'])
    const desired = preferences.find((item) => item.industry_id === vacancy?.industry_id) || null
    return {
      engine,
      vacancy: pick(vacancy, ['industry_id', 'industry_name']),
      preferences,
      desired_industry: desired,
      match_basis: desired ? 'explicit_preference' : 'none',
    }
  }

  if (name === 'location') {
    return {
      engine,
      vacancy: pick(vacancy, ['province', 'municipality_city']),
      preferences: cleanList(jobseeker?.location_preferences, [
        'province',
        'municipality_city',
        'priority',
      ]),
      candidate_location: pick(jobseeker, ['province', 'municipality_city']),
      willing_to_relocate: jobseeker?.willing_to_relocate ?? null,
      checks: checksFor(eligibility, 'location').map(normalizeCheck),
    }
  }

  if (name === 'employment_type') {
    return {
      engine,
      vacancy: pick(vacancy, ['employment_type_id', 'employment_type_name']),
      preferences: cleanList(jobseeker?.employment_type_preferences, [
        'employment_type_id',
        'name',
        'priority',
      ]),
      checks: checksFor(eligibility, 'employment_type').map(normalizeCheck),
    }
  }

  if (name === 'work_arrangement') {
    return {
      engine,
      vacancy: pick(vacancy, ['work_arrangement_id', 'work_arrangement_name']),
      preferences: cleanList(jobseeker?.work_arrangement_preferences, [
        'work_arrangement_id',
        'name',
        'priority',
      ]),
      checks: checksFor(eligibility, 'work_arrangement').map(normalizeCheck),
    }
  }

  if (name === 'salary') {
    return {
      engine,
      vacancy: pick(vacancy, ['salary_min', 'salary_max', 'salary_currency', 'salary_period']),
      candidate: pick(jobseeker, [
        'desired_salary_min',
        'desired_salary_max',
        'desired_salary_currency',
        'desired_salary_period',
        'salary_negotiable',
      ]),
      checks: checksFor(eligibility, 'salary').map(normalizeCheck),
    }
  }

  if (name === 'availability') {
    return {
      engine,
      candidate: pick(jobseeker, ['availability_status', 'available_start_date', 'preferred_shift']),
      vacancy_start_timing: null,
      timing_status: 'unknown',
      checks: checksFor(eligibility, 'availability').map(normalizeCheck),
    }
  }

  return { engine }
}

const reasonRank = Object.freeze({ blocking: 0, conditional: 1, warning: 2, positive: 3, unknown: 4 })

const compareReasons = (left, right) =>
  reasonRank[left.severity] - reasonRank[right.severity] ||
  right.weight - left.weight ||
  right.score_contribution - left.score_contribution ||
  left.code.localeCompare(right.code)

const buildReason = (check, dimensions) => {
  const dimension = dimensions.find((item) => item.dimension === check.category)
  return {
    code: check.code,
    dimension: check.category,
    severity: check.severity,
    importance: check.importance,
    weight: dimension?.weight || 0,
    score_contribution: dimension?.weighted_score || 0,
    key: check.code.toLowerCase(),
    message: check.message,
    evidence: check.evidence,
  }
}

const buildReasons = (eligibilityReasons, dimensions) => {
  const dimensionNames = new Set(EXPLANATION_DIMENSIONS)
  const strengths = eligibilityReasons
    .filter((reason) => reason.severity === 'positive' && dimensionNames.has(reason.category))
    .map((reason) => buildReason(reason, dimensions))

  const gaps = eligibilityReasons
    .filter((reason) => ['blocking', 'conditional', 'warning'].includes(reason.severity))
    .map((reason) => buildReason(reason, dimensions))

  for (const dimension of dimensions) {
    if (eligibilityReasons.some((reason) => reason.category === dimension.dimension)) continue
    const code = dimension.reason_codes[0]
    if (!code) continue
    const reason = {
      code,
      dimension: dimension.dimension,
      severity:
        dimension.status === 'matched'
          ? 'positive'
          : dimension.status === 'unknown' || dimension.status === 'not_applicable'
            ? 'conditional'
            : 'warning',
      importance: 'informational',
      weight: dimension.weight,
      score_contribution: dimension.weighted_score,
      key: code.toLowerCase(),
      message: null,
      evidence: dimension.evidence.engine,
    }
    if (reason.severity === 'positive') strengths.push(reason)
    else gaps.push(reason)
  }

  return {
    strengths: strengths.sort(compareReasons),
    gaps: gaps.sort(compareReasons),
  }
}

const numberOrNull = (value) => (Number.isFinite(value) ? value : null)

export function buildMatchExplanation({
  direction,
  jobseeker,
  vacancy,
  eligibility,
  deterministic,
  semantic,
  hybrid,
}) {
  if (!Object.values(EXPLANATION_DIRECTIONS).includes(direction)) {
    throw new TypeError(`Unsupported explanation direction: ${direction}`)
  }
  if (!eligibility || !deterministic || !Array.isArray(deterministic.dimensions)) {
    throw new TypeError('Eligibility and a complete deterministic match result are required')
  }

  const sourceDimensions = new Map(deterministic.dimensions.map((item) => [item.dimension, item]))
  const dimensions = EXPLANATION_DIMENSIONS.map((name) => {
    const source = sourceDimensions.get(name)
    if (!source) throw new TypeError(`Missing deterministic dimension: ${name}`)
    const salaryDataMissing =
      name === 'salary' &&
      ((jobseeker?.desired_salary_min == null && jobseeker?.desired_salary_max == null) ||
        (vacancy?.salary_min == null && vacancy?.salary_max == null))
    const status = salaryDataMissing ? 'unknown' : STATUS_MAP[source.status] || 'unknown'
    const evidence = buildEvidence(name, source, jobseeker, vacancy, eligibility)
    const evidenceSummary = { reason_codes: [...(source.reason_codes || [])], engine: evidence.engine }
    return {
      dimension: name,
      key: DIMENSION_LABELS[name],
      status,
      evaluable: Boolean(source.evaluable),
      weight: source.weight,
      raw_score: numberOrNull(source.raw_score),
      weighted_score: numberOrNull(source.weighted_score),
      reason_codes: [...(source.reason_codes || [])],
      matched_evidence: ['matched', 'partially_matched'].includes(status) ? [evidenceSummary] : [],
      missing_evidence: status === 'not_matched' ? [evidenceSummary] : [],
      unknown_evidence: status === 'unknown' ? [evidenceSummary] : [],
      evidence,
    }
  })

  const eligibilityReasons = (eligibility.checks || []).map(normalizeCheck)
  const reasons = buildReasons(eligibilityReasons, dimensions)
  const semanticAvailable = semantic?.status === 'available' && Number.isFinite(semantic?.score)
  const hybridFallback = hybrid?.fallback ?? !semanticAvailable
  const hybridWeights = hybrid
    ? {
        deterministic: hybrid.deterministic_weight ?? hybrid.weights?.deterministic ?? null,
        semantic: hybrid.semantic_weight ?? hybrid.weights?.semantic ?? null,
      }
    : null

  return {
    explanation_version: EXPLANATION_VERSION,
    direction,
    recommendation_status:
      eligibility.status === 'ineligible'
        ? 'not_eligible'
        : eligibility.status === 'conditionally_eligible'
          ? 'needs_review'
          : 'eligible',
    versions: {
      eligibility: eligibility.model_version ?? null,
      matching: deterministic.model_version ?? null,
      semantic: semantic?.model_version ?? null,
      hybrid: hybrid?.model_version ?? null,
    },
    eligibility: {
      status: eligibility.status,
      blocking_reasons: [...(eligibility.blocking_reasons || [])],
      warnings: [...(eligibility.warnings || [])],
      reasons: eligibilityReasons,
    },
    scores: {
      fit_score: numberOrNull(deterministic.fit_score),
      coverage_score: numberOrNull(deterministic.coverage_score),
      ranking_score: numberOrNull(deterministic.ranking_score),
      semantic_score: numberOrNull(semantic?.score),
      hybrid_score: numberOrNull(hybrid?.score),
    },
    strengths: reasons.strengths,
    gaps: reasons.gaps,
    dimensions,
    top_strengths: reasons.strengths.slice(0, 5),
    top_gaps: reasons.gaps.slice(0, 5),
    semantic: {
      model_version: semantic?.model_version ?? null,
      embedding_version: semantic?.embedding_version ?? null,
      status: semantic?.status ?? 'missing',
      available: semanticAvailable,
      score: numberOrNull(semantic?.score),
      similarity: numberOrNull(semantic?.similarity),
      weight: hybridWeights?.semantic ?? 0,
      contribution:
        semanticAvailable && Number.isFinite(hybridWeights?.semantic)
          ? semantic.score * hybridWeights.semantic
          : 0,
      note_key:
        eligibility.status === 'ineligible'
          ? 'semantic_does_not_override_ineligibility'
          : semanticAvailable
            ? 'semantic_similarity_secondary'
            : 'semantic_unavailable',
      eligibility_override: false,
    },
    hybrid: {
      model_version: hybrid?.model_version ?? null,
      score: numberOrNull(hybrid?.score),
      weights: hybridWeights,
      fallback: Boolean(hybridFallback),
      deterministic_contribution:
        Number.isFinite(deterministic.ranking_score) && hybridFallback
          ? deterministic.ranking_score
          : Number.isFinite(deterministic.ranking_score) && Number.isFinite(hybridWeights?.deterministic)
            ? deterministic.ranking_score * hybridWeights.deterministic
          : numberOrNull(deterministic.ranking_score),
      structured_fit_primary: true,
      eligibility_override: false,
      reason_codes: [...(hybrid?.reason_codes || hybrid?.reasons || [])],
    },
  }
}
