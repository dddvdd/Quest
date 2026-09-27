const isJobseeker = (direction) => direction === 'jobseeker_to_vacancy'

const subject = (direction) => (isJobseeker(direction) ? 'You' : 'The candidate')

const possessive = (direction) => (isJobseeker(direction) ? 'your' : "the candidate's")

const evidenceName = (reason) =>
  reason.evidence?.skill_name || reason.evidence?.canonical_name || reason.evidence?.name || null

const lowerFirst = (value) => (value ? value.charAt(0).toLowerCase() + value.slice(1) : value)

const adaptMessage = (message, direction) => {
  if (!message) return null
  if (isJobseeker(direction)) {
    return message.replace(/^Candidate's /, 'Your ').replace(/^Candidate /, 'You ')
  }
  return message
}

const formatReason = (reason, direction) => {
  const who = subject(direction)
  const whose = possessive(direction)
  const name = evidenceName(reason)

  switch (reason.code) {
    case 'REQUIRED_SKILL_PRESENT':
    case 'PREFERRED_SKILL_PRESENT':
      return `${who} match${isJobseeker(direction) ? '' : 'es'} ${name || 'a listed skill'}.`
    case 'REQUIRED_SKILL_MISSING':
    case 'PREFERRED_SKILL_MISSING':
      return `${name || 'A listed skill'} is not shown in ${whose} skills.`
    case 'SKILL_PROFICIENCY_BELOW_MINIMUM':
      return `${name || 'A listed skill'} is below the requested proficiency.`
    case 'SKILL_EXPERIENCE_BELOW_MINIMUM':
      return `${name || 'A listed skill'} has less experience than requested.`
    case 'EXPERIENCE_REQUIRED_MET':
    case 'EXPERIENCE_PREFERRED_MET':
      return `${who} meet${isJobseeker(direction) ? '' : 's'} the stated experience level.`
    case 'EXPERIENCE_REQUIRED_NOT_MET':
    case 'EXPERIENCE_PREFERRED_NOT_MET':
      return `${who} do${isJobseeker(direction) ? '' : 'es'} not meet the stated experience level.`
    case 'REQUIRED_CERTIFICATION_PRESENT':
    case 'PREFERRED_CERTIFICATION_PRESENT':
      return `${name || 'A listed certification'} appears in ${whose} profile.`
    case 'REQUIRED_CERTIFICATION_MISSING':
    case 'PREFERRED_CERTIFICATION_MISSING':
      return `${name || 'A required certification'} is not shown in ${whose} profile.`
    case 'LANGUAGE_REQUIREMENT_MET':
    case 'PREFERRED_LANGUAGE_MET':
      return `${who} meet${isJobseeker(direction) ? '' : 's'} the ${name || 'listed'} language requirement.`
    case 'LANGUAGE_REQUIREMENT_NOT_MET':
    case 'PREFERRED_LANGUAGE_NOT_MET':
      return `${who} do${isJobseeker(direction) ? '' : 'es'} not meet the ${name || 'listed'} language requirement.`
    case 'SALARY_EXPECTATION_ABOVE_RANGE':
      return `The requested salary is above the vacancy range.`
    case 'SALARY_COMPATIBLE':
      return `The requested salary is compatible with the vacancy range.`
    case 'SALARY_COMPARISON_UNKNOWN':
      return `Salary compatibility cannot be determined from the available data.`
    case 'LOCATION_MATCH':
    case 'LOCATION_PROVINCE_MATCH':
      return `${whose.charAt(0).toUpperCase() + whose.slice(1)} location preference matches the vacancy.`
    case 'LOCATION_MISMATCH':
      return `${whose.charAt(0).toUpperCase() + whose.slice(1)} location preference does not match the vacancy.`
    case 'AVAILABLE':
      return `${who} indicate${isJobseeker(direction) ? '' : 's'} availability.`
    default: {
      const adapted = adaptMessage(reason.message, direction)
      return adapted ? `${adapted.replace(/[.]+$/, '')}.` : `${lowerFirst(reason.key).replaceAll('_', ' ')}.`
    }
  }
}

const skillSummary = (explanation, direction) => {
  const skills = explanation.dimensions.find((item) => item.dimension === 'skills')
  const required = skills?.evidence?.requirements?.filter((item) => item.importance === 'required') || []
  if (!required.length) return null
  const matched = required.filter((item) => item.status === 'pass').length
  return `${subject(direction)} match${isJobseeker(direction) ? '' : 'es'} ${matched} of ${required.length} required skills.`
}

export function formatMatchExplanation(explanation) {
  const direction = explanation.direction
  const headline =
    explanation.recommendation_status === 'not_eligible'
      ? 'Not eligible under current requirements.'
      : explanation.recommendation_status === 'needs_review'
        ? 'Additional information is needed to confirm eligibility.'
        : isJobseeker(direction)
          ? 'Why this job matches your profile.'
          : 'Why this candidate matches the vacancy.'

  const summary =
    explanation.recommendation_status === 'not_eligible'
      ? 'One or more required qualifications are not met.'
      : skillSummary(explanation, direction) ||
        `${subject(direction)} have${isJobseeker(direction) ? '' : 's'} a ${explanation.scores.coverage_score ?? 0}% evaluated match coverage.`

  return {
    headline,
    summary,
    strengths: explanation.top_strengths.map((reason) => formatReason(reason, direction)),
    gaps: explanation.top_gaps.map((reason) => formatReason(reason, direction)),
    semantic:
      explanation.semantic.note_key === 'semantic_similarity_secondary'
        ? 'Semantic similarity contributes a secondary signal to the structured match.'
        : explanation.semantic.note_key === 'semantic_does_not_override_ineligibility'
          ? 'Semantic similarity does not override unmet required qualifications.'
          : 'Semantic similarity is unavailable; the result uses the deterministic score.',
  }
}
