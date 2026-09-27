export const MATCH_PRESENTATION_KIND = Object.freeze({
  JOB: 'job',
  CANDIDATE: 'candidate',
})

const ELIGIBILITY_LABELS = Object.freeze({
  eligible: 'Eligible',
  conditionally_eligible: 'Needs review',
  ineligible: 'Not eligible under current requirements',
})

const DIMENSION_STATUS_LABELS = Object.freeze({
  matched: 'Matched',
  partially_matched: 'Partial match',
  not_matched: 'Gap',
  unknown: 'Not enough information',
  not_applicable: 'Not applicable',
})

const SOURCE_LABELS = Object.freeze({
  application: 'Applied',
  event_interest: 'Expressed interest at event',
})

const compact = (values) => values.filter((value) => value != null && value !== '')

const unique = (values) => [...new Set(compact(values))]

const textName = (item) => item?.canonical_name || item?.skill_name || item?.name || null

const titleCase = (value) =>
  value
    ? String(value)
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : null

const formatMoney = (value, currency = 'PHP') => {
  if (!Number.isFinite(Number(value))) return null
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: currency || 'PHP',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

const formatSalaryRange = (source) => {
  const min = formatMoney(source?.salary_min, source?.salary_currency)
  const max = formatMoney(source?.salary_max, source?.salary_currency)
  const range = min && max ? `${min}-${max}` : min ? `From ${min}` : max ? `Up to ${max}` : null
  return range ? `${range}${source?.salary_period ? ` / ${source.salary_period}` : ''}` : null
}

const group = (label, values) => {
  const items = unique(values)
  return items.length ? { label, items } : null
}

const skillGroups = (evidence) =>
  compact([
    group('Required skills matched', (evidence.required_matched || []).map(textName)),
    group('Required skills missing', (evidence.required_missing || []).map(textName)),
    group('Required skills needing review', (evidence.required_unknown || []).map(textName)),
    group('Preferred skills matched', (evidence.preferred_matched || []).map(textName)),
    group('Preferred skills missing', (evidence.preferred_missing || []).map(textName)),
  ])

const qualificationGroups = (evidence, noun) =>
  compact([
    group(`${noun} matched`, (evidence.matched || []).map(textName)),
    group(`${noun} missing`, (evidence.missing || []).map(textName)),
    group(`${noun} needing review`, (evidence.unknown || []).map(textName)),
  ])

const dimensionContent = (dimension, direction) => {
  const evidence = dimension.evidence || {}
  const candidateLabel = direction === 'jobseeker_to_vacancy' ? 'Your profile' : 'Candidate profile'
  const defaultNote = {
    matched: 'The available structured evidence aligns.',
    partially_matched: 'Some structured evidence aligns, with a remaining difference.',
    not_matched: 'The available structured evidence does not align.',
    unknown: 'Not enough structured information is available.',
    not_applicable: 'This vacancy does not provide a requirement for this dimension.',
  }[dimension.status]

  switch (dimension.dimension) {
    case 'occupation': {
      const desired = evidence.desired_occupation?.canonical_name
      return {
        groups: compact([
          group('Vacancy occupation', [evidence.vacancy?.occupation_name]),
          group('Recorded occupation preference', [desired]),
        ]),
        note: desired ? defaultNote : 'No explicit occupation preference is recorded for this vacancy.',
      }
    }
    case 'skills':
      return { groups: skillGroups(evidence), note: defaultNote }
    case 'experience': {
      const required = evidence.engine?.required_months
      const candidate = evidence.engine?.candidate_months
      return {
        groups: compact([
          group('Required experience', [Number.isFinite(required) ? `${required} months` : null]),
          group(
            direction === 'jobseeker_to_vacancy' ? 'Your relevant experience' : 'Candidate relevant experience',
            [Number.isFinite(candidate) ? `${candidate} months` : null],
          ),
        ]),
        note:
          evidence.result === 'met'
            ? 'The recorded experience meets the requirement.'
            : evidence.result === 'not_met'
              ? 'The recorded experience is below the requirement.'
              : 'Not enough structured experience information is available.',
      }
    }
    case 'education':
      return {
        groups: compact([
          group(
            'Education required',
            (evidence.requirements || []).map((item) =>
              compact([item.level_name, item.field_of_study]).join(' - '),
            ),
          ),
          group(
            `${candidateLabel} education`,
            (evidence.candidate_education || []).map((item) =>
              compact([item.level_name, item.field_of_study || item.course_program]).join(' - '),
            ),
          ),
        ]),
        note:
          evidence.result === 'met'
            ? 'The recorded education meets the requirement.'
            : evidence.result === 'not_met'
              ? 'The recorded education does not meet the requirement.'
              : 'The education requirement needs review.',
      }
    case 'certifications':
      return { groups: qualificationGroups(evidence, 'Certifications'), note: defaultNote }
    case 'languages':
      return { groups: qualificationGroups(evidence, 'Languages'), note: defaultNote }
    case 'industry':
      return {
        groups: compact([
          group('Vacancy industry', [evidence.vacancy?.industry_name]),
          group('Recorded industry preference', [evidence.desired_industry?.name]),
        ]),
        note: evidence.desired_industry
          ? defaultNote
          : 'No explicit industry preference is recorded for this vacancy.',
      }
    case 'location': {
      const vacancyLocation = compact([
        evidence.vacancy?.municipality_city,
        evidence.vacancy?.province,
      ]).join(', ')
      const candidateLocation = compact([
        evidence.candidate_location?.municipality_city,
        evidence.candidate_location?.province,
      ]).join(', ')
      return {
        groups: compact([
          group('Vacancy location', [vacancyLocation]),
          group(direction === 'jobseeker_to_vacancy' ? 'Your location' : 'Candidate location', [candidateLocation]),
        ]),
        note: defaultNote,
      }
    }
    case 'employment_type':
      return {
        groups: compact([
          group('Vacancy employment type', [evidence.vacancy?.employment_type_name]),
          group('Recorded preferences', (evidence.preferences || []).map((item) => item.name)),
        ]),
        note: defaultNote,
      }
    case 'work_arrangement':
      return {
        groups: compact([
          group('Vacancy work arrangement', [evidence.vacancy?.work_arrangement_name]),
          group('Recorded preferences', (evidence.preferences || []).map((item) => item.name)),
        ]),
        note: defaultNote,
      }
    case 'salary': {
      const vacancySalary = formatSalaryRange(evidence.vacancy)
      const candidateSalary = formatSalaryRange({
        salary_min: evidence.candidate?.desired_salary_min,
        salary_max: evidence.candidate?.desired_salary_max,
        salary_currency: evidence.candidate?.desired_salary_currency,
        salary_period: evidence.candidate?.desired_salary_period,
      })
      return {
        groups: compact([
          group('Vacancy salary', [vacancySalary]),
          group(direction === 'jobseeker_to_vacancy' ? 'Your salary preference' : 'Candidate salary preference', [candidateSalary]),
        ]),
        note:
          dimension.status === 'matched'
            ? 'The salary preference overlaps with the listed vacancy range.'
            : dimension.status === 'not_matched'
              ? `${direction === 'jobseeker_to_vacancy' ? 'Your' : "The candidate's"} preferred salary is above the listed vacancy range.`
              : 'Salary compatibility cannot be evaluated because salary information is incomplete.',
      }
    }
    case 'availability':
      return {
        groups: compact([
          group(
            direction === 'jobseeker_to_vacancy' ? 'Your availability' : 'Candidate availability',
            [titleCase(evidence.candidate?.availability_status)],
          ),
        ]),
        note:
          evidence.timing_status === 'unknown'
            ? 'The vacancy does not provide structured start timing, so timing compatibility is unknown.'
            : defaultNote,
      }
    default:
      return { groups: [], note: defaultNote }
  }
}

export function buildMatchPresentation({ kind, vacancy, candidate, explanation, formatted }) {
  if (!Object.values(MATCH_PRESENTATION_KIND).includes(kind)) {
    throw new TypeError(`Unsupported match presentation kind: ${kind}`)
  }
  if (!explanation || !formatted) throw new TypeError('Explanation and formatted evidence are required')

  const score = explanation.scores.hybrid_score ?? explanation.scores.ranking_score
  const location = compact([vacancy?.municipality_city, vacancy?.province]).join(', ') || null
  const title = kind === MATCH_PRESENTATION_KIND.JOB
    ? vacancy?.position || 'Untitled vacancy'
    : compact([candidate?.first_name, candidate?.last_name]).join(' ') || 'Candidate'
  const subtitle = kind === MATCH_PRESENTATION_KIND.JOB
    ? vacancy?.company_name || 'Employer not listed'
    : vacancy?.position || 'Vacancy'
  const dimensionStatus = new Map(explanation.dimensions.map((item) => [item.dimension, item.status]))
  const gaps = Array.isArray(explanation.top_gaps)
    ? formatted.gaps.filter((_, index) => dimensionStatus.get(explanation.top_gaps[index]?.dimension) !== 'not_applicable')
    : formatted.gaps

  return {
    kind,
    title,
    subtitle,
    location,
    employment_type: vacancy?.employment_type_name || null,
    work_arrangement: vacancy?.work_arrangement_name || null,
    salary: formatSalaryRange(vacancy),
    candidate_source: kind === MATCH_PRESENTATION_KIND.CANDIDATE
      ? SOURCE_LABELS[candidate?.candidate_source] || null
      : null,
    application_status: kind === MATCH_PRESENTATION_KIND.CANDIDATE
      ? titleCase(candidate?.application_status)
      : null,
    score: Number.isFinite(score) ? score : null,
    score_label: Number.isFinite(score) ? `Match score: ${score} out of 100` : 'Match score unavailable',
    score_help:
      kind === MATCH_PRESENTATION_KIND.JOB
        ? 'This score compares your structured profile with the job requirements. It combines structured matching with a smaller semantic similarity signal. It is not a hiring decision.'
        : "This score compares the candidate's structured profile with this vacancy's requirements. It is not a hiring decision.",
    eligibility_status: explanation.eligibility.status,
    eligibility_label: ELIGIBILITY_LABELS[explanation.eligibility.status] || 'Status unavailable',
    headline: formatted.headline,
    summary: formatted.summary,
    strengths: formatted.strengths.slice(0, 3),
    gaps: gaps.slice(0, 3),
    semantic_note: formatted.semantic,
    semantic_available: explanation.semantic.available,
    dimensions: explanation.dimensions.map((dimension) => {
      const content = dimensionContent(dimension, explanation.direction)
      return {
        key: dimension.dimension,
        label: dimension.key,
        status: dimension.status,
        status_label: DIMENSION_STATUS_LABELS[dimension.status] || 'Not enough information',
        groups: content.groups,
        note: content.note,
      }
    }),
  }
}

