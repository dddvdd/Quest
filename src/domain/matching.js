// Weighted Matching & Ranking Engine (Phase 3B)
// Pure, deterministic, transparent fit scoring and ranking.
// NO embeddings, NO semantic vectors, NO LLM inference.

import {
  evaluateEligibility,
  ELIGIBILITY_STATUS,
  DEFAULT_EDUCATION_RANKS,
  SKILL_PROFICIENCY_MAP,
} from './eligibility.js'

export const MODEL_VERSION = 'deterministic-v1'

export const MATCHING_WEIGHTS_V1 = Object.freeze({
  occupation: 20,
  skills: 25,
  experience: 10,
  education: 8,
  certifications: 5,
  languages: 4,
  industry: 4,
  location: 7,
  employment_type: 4,
  work_arrangement: 4,
  salary: 4,
  availability: 5,
})

export const MATCHING_REASON_CODES = Object.freeze({
  // Occupation
  OCCUPATION_PRIMARY_MATCH: 'OCCUPATION_PRIMARY_MATCH',
  OCCUPATION_SECONDARY_MATCH: 'OCCUPATION_SECONDARY_MATCH',
  OCCUPATION_EXPLORATORY_MATCH: 'OCCUPATION_EXPLORATORY_MATCH',
  OCCUPATION_RELATED: 'OCCUPATION_RELATED',
  OCCUPATION_NO_MATCH: 'OCCUPATION_NO_MATCH',
  OCCUPATION_UNKNOWN: 'OCCUPATION_UNKNOWN',
  OCCUPATION_NOT_SPECIFIED: 'OCCUPATION_NOT_SPECIFIED',

  // Skills
  SKILL_REQUIRED_STRONG_MATCH: 'SKILL_REQUIRED_STRONG_MATCH',
  SKILL_PREFERRED_MATCH: 'SKILL_PREFERRED_MATCH',
  SKILL_NICE_TO_HAVE_MATCH: 'SKILL_NICE_TO_HAVE_MATCH',
  SKILL_PARTIAL_COVERAGE: 'SKILL_PARTIAL_COVERAGE',
  SKILL_NO_REQUIREMENT: 'SKILL_NO_REQUIREMENT',
  SKILL_DATA_UNKNOWN: 'SKILL_DATA_UNKNOWN',

  // Experience
  EXPERIENCE_MEETS_MINIMUM: 'EXPERIENCE_MEETS_MINIMUM',
  EXPERIENCE_EXCEEDS_MINIMUM: 'EXPERIENCE_EXCEEDS_MINIMUM',
  EXPERIENCE_BELOW_MINIMUM: 'EXPERIENCE_BELOW_MINIMUM',
  EXPERIENCE_NO_REQUIREMENT: 'EXPERIENCE_NO_REQUIREMENT',
  EXPERIENCE_UNKNOWN: 'EXPERIENCE_UNKNOWN',

  // Education
  EDUCATION_LEVEL_MATCH: 'EDUCATION_LEVEL_MATCH',
  EDUCATION_FIELD_MATCH: 'EDUCATION_FIELD_MATCH',
  EDUCATION_PARTIAL_MATCH: 'EDUCATION_PARTIAL_MATCH',
  EDUCATION_NO_REQUIREMENT: 'EDUCATION_NO_REQUIREMENT',
  EDUCATION_UNKNOWN: 'EDUCATION_UNKNOWN',

  // Certifications
  CERTIFICATION_REQUIRED_MATCH: 'CERTIFICATION_REQUIRED_MATCH',
  CERTIFICATION_PREFERRED_MATCH: 'CERTIFICATION_PREFERRED_MATCH',
  CERTIFICATION_PREFERRED_MISSING: 'CERTIFICATION_PREFERRED_MISSING',
  CERTIFICATION_NO_REQUIREMENT: 'CERTIFICATION_NO_REQUIREMENT',

  // Languages
  LANGUAGE_STRONG_MATCH: 'LANGUAGE_STRONG_MATCH',
  LANGUAGE_PARTIAL_MATCH: 'LANGUAGE_PARTIAL_MATCH',
  LANGUAGE_NO_REQUIREMENT: 'LANGUAGE_NO_REQUIREMENT',

  // Industry
  INDUSTRY_MATCH: 'INDUSTRY_MATCH',
  INDUSTRY_MISMATCH: 'INDUSTRY_MISMATCH',
  INDUSTRY_NO_PREFERENCE: 'INDUSTRY_NO_PREFERENCE',

  // Location
  LOCATION_EXACT_MATCH: 'LOCATION_EXACT_MATCH',
  LOCATION_PROVINCE_MATCH: 'LOCATION_PROVINCE_MATCH',
  LOCATION_RELOCATION_MATCH: 'LOCATION_RELOCATION_MATCH',
  LOCATION_MISMATCH: 'LOCATION_MISMATCH',
  LOCATION_UNKNOWN: 'LOCATION_UNKNOWN',

  // Employment Type
  EMPLOYMENT_TYPE_MATCH: 'EMPLOYMENT_TYPE_MATCH',
  EMPLOYMENT_TYPE_MISMATCH: 'EMPLOYMENT_TYPE_MISMATCH',
  EMPLOYMENT_TYPE_NEUTRAL: 'EMPLOYMENT_TYPE_NEUTRAL',

  // Work Arrangement
  WORK_ARRANGEMENT_MATCH: 'WORK_ARRANGEMENT_MATCH',
  WORK_ARRANGEMENT_MISMATCH: 'WORK_ARRANGEMENT_MISMATCH',
  WORK_ARRANGEMENT_NEUTRAL: 'WORK_ARRANGEMENT_NEUTRAL',

  // Salary
  SALARY_RANGE_MATCH: 'SALARY_RANGE_MATCH',
  SALARY_PARTIAL_OVERLAP: 'SALARY_PARTIAL_OVERLAP',
  SALARY_MISMATCH: 'SALARY_MISMATCH',
  SALARY_UNKNOWN: 'SALARY_UNKNOWN',

  // Availability
  AVAILABILITY_IMMEDIATE: 'AVAILABILITY_IMMEDIATE',
  AVAILABILITY_COMPATIBLE: 'AVAILABILITY_COMPATIBLE',
  AVAILABILITY_LOW: 'AVAILABILITY_LOW',
  AVAILABILITY_UNKNOWN: 'AVAILABILITY_UNKNOWN',
})

function clamp(value, min = 0, max = 1) {
  if (value == null || Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function calculateWorkExperienceMonths(workExperiences, { occupationId, industryId } = {}) {
  if (!Array.isArray(workExperiences) || workExperiences.length === 0) return 0
  const now = new Date()
  let totalMonths = 0

  for (const exp of workExperiences) {
    if (occupationId && exp.occupation_id && exp.occupation_id !== occupationId) continue
    if (industryId && exp.industry_id && exp.industry_id !== industryId) continue

    if (!exp.start_date) continue
    const start = new Date(`${exp.start_date.slice(0, 7)}-01T00:00:00`)
    const end = (exp.is_current || !exp.end_date)
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(`${exp.end_date.slice(0, 7)}-01T00:00:00`)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) continue
    const months = ((end.getFullYear() - start.getFullYear()) * 12) + end.getMonth() - start.getMonth() + 1
    totalMonths += Math.max(0, months)
  }

  return totalMonths
}

/**
 * Evaluates the 12 structured matching dimensions for an eligible or conditionally eligible pair.
 */
export function scoreMatch(jobseeker = {}, vacancy = {}, eligibilityResult = null, options = {}) {
  const eligibility = eligibilityResult || evaluateEligibility(jobseeker, vacancy, options)
  const weights = options.weights || MATCHING_WEIGHTS_V1

  const dimensions = []
  const strengths = []
  const gaps = []
  const unknowns = []

  // -------------------------------------------------------------
  // 1. OCCUPATION (Weight: 20)
  // -------------------------------------------------------------
  {
    const weight = weights.occupation ?? 20
    const vacOccId = vacancy.occupation_id
    const occPrefs = Array.isArray(jobseeker.occupation_preferences) ? jobseeker.occupation_preferences : []

    let rawScore = null
    let status = 'unknown'
    let evaluable = false
    const reasonCodes = []
    const evidence = { vacancy_occupation_id: vacOccId, candidate_preferences: occPrefs }

    if (!vacOccId) {
      status = 'not_applicable'
      reasonCodes.push(MATCHING_REASON_CODES.OCCUPATION_NOT_SPECIFIED)
    } else if (occPrefs.length === 0) {
      status = 'unknown'
      reasonCodes.push(MATCHING_REASON_CODES.OCCUPATION_UNKNOWN)
      unknowns.push('Occupation preference not specified')
    } else {
      evaluable = true
      const exactMatch = occPrefs.find(p => p.occupation_id === vacOccId)
      if (exactMatch) {
        if (exactMatch.priority === 1 || exactMatch.preference_type === 'primary') {
          rawScore = 1.0
          status = 'match'
          reasonCodes.push(MATCHING_REASON_CODES.OCCUPATION_PRIMARY_MATCH)
          strengths.push('Primary preferred occupation matches vacancy')
        } else if (exactMatch.priority === 2 || exactMatch.preference_type === 'secondary') {
          rawScore = 0.8
          status = 'partial_match'
          reasonCodes.push(MATCHING_REASON_CODES.OCCUPATION_SECONDARY_MATCH)
          strengths.push('Secondary preferred occupation matches vacancy')
        } else {
          rawScore = 0.6
          status = 'partial_match'
          reasonCodes.push(MATCHING_REASON_CODES.OCCUPATION_EXPLORATORY_MATCH)
        }
      } else {
        rawScore = 0.0
        status = 'mismatch'
        reasonCodes.push(MATCHING_REASON_CODES.OCCUPATION_NO_MATCH)
        gaps.push('Vacancy occupation does not match candidate preferred occupations')
      }
    }

    dimensions.push({
      dimension: 'occupation',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence,
    })
  }

  // -------------------------------------------------------------
  // 2. SKILLS (Weight: 25)
  // -------------------------------------------------------------
  {
    const weight = weights.skills ?? 25
    const vacSkills = Array.isArray(vacancy.skills) ? vacancy.skills : []
    const candSkills = Array.isArray(jobseeker.skills) ? jobseeker.skills : []

    let rawScore = null
    let status = 'match'
    let evaluable = false
    const reasonCodes = []
    const evidence = { vacancy_skills_count: vacSkills.length, candidate_skills_count: candSkills.length }

    if (vacSkills.length === 0) {
      rawScore = 1.0
      status = 'not_applicable'
      evaluable = true
      reasonCodes.push(MATCHING_REASON_CODES.SKILL_NO_REQUIREMENT)
    } else if (candSkills.length === 0) {
      rawScore = 0.0
      status = 'unknown'
      evaluable = true
      reasonCodes.push(MATCHING_REASON_CODES.SKILL_DATA_UNKNOWN)
      unknowns.push('Candidate has no structured skills on file')
    } else {
      evaluable = true
      let totalMultiplier = 0
      let earnedPoints = 0

      for (const vs of vacSkills) {
        const mult = vs.importance === 'required' ? 3.0 : (vs.importance === 'preferred' ? 1.5 : 1.0)
        totalMultiplier += mult

        const matched = candSkills.find(cs =>
          (vs.skill_id && cs.skill_id === vs.skill_id) ||
          (vs.canonical_name && cs.canonical_name && cs.canonical_name.toLowerCase() === vs.canonical_name.toLowerCase())
        )

        if (matched) {
          let itemScore = 1.0
          if (vs.minimum_proficiency && matched.proficiency_level) {
            const reqRank = SKILL_PROFICIENCY_MAP[vs.minimum_proficiency.toLowerCase()] || 0
            const candRank = SKILL_PROFICIENCY_MAP[matched.proficiency_level.toLowerCase()] || 0
            if (candRank > reqRank) itemScore = 1.0
            else if (candRank < reqRank) itemScore = 0.5
          }
          if (vs.minimum_years_experience != null && matched.years_experience != null) {
            if (Number(matched.years_experience) >= Number(vs.minimum_years_experience)) {
              itemScore = Math.min(1.0, itemScore + 0.05)
            }
          }
          earnedPoints += mult * itemScore
        }
      }

      rawScore = totalMultiplier > 0 ? clamp(earnedPoints / totalMultiplier) : 1.0
      if (rawScore >= 0.9) {
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.SKILL_REQUIRED_STRONG_MATCH)
        strengths.push('Candidate satisfies required and preferred skills strongly')
      } else if (rawScore >= 0.5) {
        status = 'partial_match'
        reasonCodes.push(MATCHING_REASON_CODES.SKILL_PARTIAL_COVERAGE)
      } else {
        status = 'mismatch'
        reasonCodes.push(MATCHING_REASON_CODES.SKILL_PARTIAL_COVERAGE)
        gaps.push('Candidate only covers a subset of vacancy skills')
      }
    }

    dimensions.push({
      dimension: 'skills',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence,
    })
  }

  // -------------------------------------------------------------
  // 3. EXPERIENCE (Weight: 10)
  // -------------------------------------------------------------
  {
    const weight = weights.experience ?? 10
    const expReqs = Array.isArray(vacancy.experience_requirements) ? vacancy.experience_requirements : []
    const workExps = Array.isArray(jobseeker.work_experiences) ? jobseeker.work_experiences : []

    let rawScore = null
    let status = 'match'
    let evaluable = false
    const reasonCodes = []
    const evidence = {}

    if (expReqs.length === 0) {
      rawScore = 1.0
      status = 'not_applicable'
      evaluable = true
      reasonCodes.push(MATCHING_REASON_CODES.EXPERIENCE_NO_REQUIREMENT)
    } else {
      evaluable = true
      let requiredMonths = 0
      for (const r of expReqs) {
        if ((r.minimum_months ?? 0) > requiredMonths) requiredMonths = r.minimum_months
      }

      let candMonths = calculateWorkExperienceMonths(workExps)
      if (candMonths === 0 && jobseeker.years_of_experience) {
        candMonths = Number(jobseeker.years_of_experience) * 12
      }
      evidence.required_months = requiredMonths
      evidence.candidate_months = candMonths

      if (requiredMonths === 0) {
        rawScore = 1.0
        reasonCodes.push(MATCHING_REASON_CODES.EXPERIENCE_MEETS_MINIMUM)
      } else if (candMonths >= requiredMonths) {
        rawScore = 1.0
        if (candMonths >= requiredMonths * 1.5) {
          reasonCodes.push(MATCHING_REASON_CODES.EXPERIENCE_EXCEEDS_MINIMUM)
          strengths.push(`Experience (${candMonths} mo) exceeds minimum required (${requiredMonths} mo)`)
        } else {
          reasonCodes.push(MATCHING_REASON_CODES.EXPERIENCE_MEETS_MINIMUM)
        }
      } else {
        rawScore = clamp(candMonths / requiredMonths)
        status = 'partial_match'
        reasonCodes.push(MATCHING_REASON_CODES.EXPERIENCE_BELOW_MINIMUM)
      }
    }

    dimensions.push({
      dimension: 'experience',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence,
    })
  }

  // -------------------------------------------------------------
  // 4. EDUCATION (Weight: 8)
  // -------------------------------------------------------------
  {
    const weight = weights.education ?? 8
    const eduReqs = Array.isArray(vacancy.education_requirements) ? vacancy.education_requirements : []
    const candEdus = Array.isArray(jobseeker.education) ? jobseeker.education : []

    let rawScore = null
    let status = 'match'
    let evaluable = false
    const reasonCodes = []
    const evidence = {}

    if (eduReqs.length === 0) {
      rawScore = 1.0
      status = 'not_applicable'
      evaluable = true
      reasonCodes.push(MATCHING_REASON_CODES.EDUCATION_NO_REQUIREMENT)
    } else {
      evaluable = true
      let reqRank = 0
      let reqFos = null
      for (const r of eduReqs) {
        const rk = r.rank ?? DEFAULT_EDUCATION_RANKS[r.level_code] ?? 0
        if (rk > reqRank) {
          reqRank = rk
          reqFos = r.field_of_study
        }
      }

      let candRank = 0
      let candFos = null
      for (const e of candEdus) {
        const rk = e.rank ?? DEFAULT_EDUCATION_RANKS[e.level_code] ?? 0
        if (rk > candRank) {
          candRank = rk
          candFos = e.field_of_study || e.course_program
        }
      }

      evidence.required_rank = reqRank
      evidence.candidate_rank = candRank

      if (candRank >= reqRank) {
        if (reqFos && candFos && (candFos.toLowerCase().includes(reqFos.toLowerCase()) || reqFos.toLowerCase().includes(candFos.toLowerCase()))) {
          rawScore = 1.0
          status = 'match'
          reasonCodes.push(MATCHING_REASON_CODES.EDUCATION_FIELD_MATCH)
          strengths.push(`Degree and field of study matched: ${candFos}`)
        } else if (reqFos && !candFos) {
          rawScore = 0.85
          status = 'partial_match'
          reasonCodes.push(MATCHING_REASON_CODES.EDUCATION_LEVEL_MATCH)
        } else {
          rawScore = 1.0
          status = 'match'
          reasonCodes.push(MATCHING_REASON_CODES.EDUCATION_LEVEL_MATCH)
        }
      } else {
        rawScore = reqRank > 0 ? clamp(candRank / reqRank) : 0.5
        status = 'partial_match'
        reasonCodes.push(MATCHING_REASON_CODES.EDUCATION_PARTIAL_MATCH)
      }
    }

    dimensions.push({
      dimension: 'education',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence,
    })
  }

  // -------------------------------------------------------------
  // 5. CERTIFICATIONS (Weight: 5)
  // -------------------------------------------------------------
  {
    const weight = weights.certifications ?? 5
    const certReqs = Array.isArray(vacancy.certification_requirements) ? vacancy.certification_requirements : []
    const candCerts = Array.isArray(jobseeker.certifications) ? jobseeker.certifications : []

    let rawScore = null
    let status = 'match'
    let evaluable = false
    const reasonCodes = []
    const evidence = { vacancy_cert_count: certReqs.length, candidate_cert_count: candCerts.length }

    if (certReqs.length === 0) {
      rawScore = 1.0
      status = 'not_applicable'
      evaluable = true
      reasonCodes.push(MATCHING_REASON_CODES.CERTIFICATION_NO_REQUIREMENT)
    } else {
      evaluable = true
      let matchedCount = 0
      for (const vc of certReqs) {
        const found = candCerts.find(cc =>
          (vc.certification_id && cc.certification_id === vc.certification_id) ||
          (vc.canonical_name && cc.canonical_name && cc.canonical_name.toLowerCase() === vc.canonical_name.toLowerCase())
        )
        if (found) matchedCount++
      }

      rawScore = clamp(matchedCount / certReqs.length)
      if (rawScore === 1.0) {
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.CERTIFICATION_PREFERRED_MATCH)
        strengths.push('All requested certifications held')
      } else if (rawScore > 0) {
        status = 'partial_match'
        reasonCodes.push(MATCHING_REASON_CODES.CERTIFICATION_PREFERRED_MATCH)
      } else {
        status = 'mismatch'
        reasonCodes.push(MATCHING_REASON_CODES.CERTIFICATION_PREFERRED_MISSING)
      }
    }

    dimensions.push({
      dimension: 'certifications',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence,
    })
  }

  // -------------------------------------------------------------
  // 6. LANGUAGES (Weight: 4)
  // -------------------------------------------------------------
  {
    const weight = weights.languages ?? 4
    const langReqs = Array.isArray(vacancy.language_requirements) ? vacancy.language_requirements : []
    const candLangs = Array.isArray(jobseeker.languages) ? jobseeker.languages : []

    let rawScore = null
    let status = 'match'
    let evaluable = false
    const reasonCodes = []
    const evidence = { vacancy_lang_count: langReqs.length, candidate_lang_count: candLangs.length }

    if (langReqs.length === 0) {
      rawScore = 1.0
      status = 'not_applicable'
      evaluable = true
      reasonCodes.push(MATCHING_REASON_CODES.LANGUAGE_NO_REQUIREMENT)
    } else {
      evaluable = true
      let earned = 0
      for (const vl of langReqs) {
        const found = candLangs.find(cl =>
          (vl.language_id && cl.language_id === vl.language_id) ||
          (vl.code && cl.code && cl.code.toLowerCase() === vl.code.toLowerCase()) ||
          (vl.name && cl.name && cl.name.toLowerCase() === vl.name.toLowerCase())
        )
        if (found) {
          earned += 1.0
        }
      }
      rawScore = clamp(earned / langReqs.length)
      if (rawScore >= 0.9) {
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.LANGUAGE_STRONG_MATCH)
        strengths.push('Language requirements satisfied')
      } else {
        status = 'partial_match'
        reasonCodes.push(MATCHING_REASON_CODES.LANGUAGE_PARTIAL_MATCH)
      }
    }

    dimensions.push({
      dimension: 'languages',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence,
    })
  }

  // -------------------------------------------------------------
  // 7. INDUSTRY (Weight: 4)
  // -------------------------------------------------------------
  {
    const weight = weights.industry ?? 4
    const vacIndId = vacancy.industry_id
    const indPrefs = Array.isArray(jobseeker.industry_preferences) ? jobseeker.industry_preferences : []

    let rawScore = null
    let status = 'unknown'
    let evaluable = false
    const reasonCodes = []
    const evidence = { vacancy_industry_id: vacIndId, candidate_industry_count: indPrefs.length }

    if (!vacIndId) {
      status = 'not_applicable'
      reasonCodes.push(MATCHING_REASON_CODES.INDUSTRY_NO_PREFERENCE)
    } else if (indPrefs.length === 0) {
      status = 'unknown'
      reasonCodes.push(MATCHING_REASON_CODES.INDUSTRY_NO_PREFERENCE)
    } else {
      evaluable = true
      const matched = indPrefs.find(ip => ip.industry_id === vacIndId)
      if (matched) {
        rawScore = matched.priority === 1 ? 1.0 : 0.75
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.INDUSTRY_MATCH)
        strengths.push('Target industry matches candidate preference')
      } else {
        rawScore = 0.1
        status = 'mismatch'
        reasonCodes.push(MATCHING_REASON_CODES.INDUSTRY_MISMATCH)
      }
    }

    dimensions.push({
      dimension: 'industry',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence,
    })
  }

  // -------------------------------------------------------------
  // 8. LOCATION (Weight: 7)
  // -------------------------------------------------------------
  {
    const weight = weights.location ?? 7
    const vacProv = (vacancy.province || '').trim().toLowerCase()
    const vacCity = (vacancy.municipality_city || '').trim().toLowerCase()

    const candLocs = Array.isArray(jobseeker.location_preferences)
      ? jobseeker.location_preferences.map(l => ({
          province: (l.province || '').trim().toLowerCase(),
          city: (l.municipality_city || '').trim().toLowerCase(),
        }))
      : []

    if (candLocs.length === 0 && (jobseeker.province || jobseeker.municipality_city)) {
      candLocs.push({
        province: (jobseeker.province || '').trim().toLowerCase(),
        city: (jobseeker.municipality_city || '').trim().toLowerCase(),
      })
    }

    let rawScore = null
    let status = 'unknown'
    let evaluable = false
    const reasonCodes = []
    const evidence = { vacancy_location: `${vacancy.municipality_city || ''}, ${vacancy.province || ''}` }

    if (!vacProv && !vacCity) {
      status = 'not_applicable'
      reasonCodes.push(MATCHING_REASON_CODES.LOCATION_UNKNOWN)
    } else if (candLocs.length === 0) {
      status = 'unknown'
      reasonCodes.push(MATCHING_REASON_CODES.LOCATION_UNKNOWN)
      unknowns.push('Candidate preferred location not specified')
    } else {
      evaluable = true
      const exactMatch = candLocs.some(l => (!vacProv || l.province === vacProv) && (!vacCity || l.city === vacCity))
      const provMatch = candLocs.some(l => vacProv && l.province === vacProv)

      if (exactMatch) {
        rawScore = 1.0
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.LOCATION_EXACT_MATCH)
        strengths.push('Location is an exact municipality match')
      } else if (provMatch) {
        rawScore = 0.85
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.LOCATION_PROVINCE_MATCH)
      } else if (jobseeker.willing_to_relocate) {
        rawScore = 0.75
        status = 'partial_match'
        reasonCodes.push(MATCHING_REASON_CODES.LOCATION_RELOCATION_MATCH)
      } else {
        rawScore = 0.2
        status = 'mismatch'
        reasonCodes.push(MATCHING_REASON_CODES.LOCATION_MISMATCH)
        gaps.push('Location differs and candidate is not willing to relocate')
      }
    }

    dimensions.push({
      dimension: 'location',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence,
    })
  }

  // -------------------------------------------------------------
  // 9. EMPLOYMENT TYPE (Weight: 4)
  // -------------------------------------------------------------
  {
    const weight = weights.employment_type ?? 4
    const vacEtId = vacancy.employment_type_id
    const candEtPrefs = Array.isArray(jobseeker.employment_type_preferences)
      ? jobseeker.employment_type_preferences.map(p => p.employment_type_id || p)
      : []

    let rawScore = null
    let status = 'unknown'
    let evaluable = false
    const reasonCodes = []

    if (!vacEtId) {
      status = 'not_applicable'
      reasonCodes.push(MATCHING_REASON_CODES.EMPLOYMENT_TYPE_NEUTRAL)
    } else if (candEtPrefs.length === 0) {
      status = 'unknown'
      reasonCodes.push(MATCHING_REASON_CODES.EMPLOYMENT_TYPE_NEUTRAL)
    } else {
      evaluable = true
      if (candEtPrefs.includes(vacEtId)) {
        rawScore = 1.0
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.EMPLOYMENT_TYPE_MATCH)
      } else {
        rawScore = 0.2
        status = 'mismatch'
        reasonCodes.push(MATCHING_REASON_CODES.EMPLOYMENT_TYPE_MISMATCH)
      }
    }

    dimensions.push({
      dimension: 'employment_type',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence: { vacancy_employment_type_id: vacEtId },
    })
  }

  // -------------------------------------------------------------
  // 10. WORK ARRANGEMENT (Weight: 4)
  // -------------------------------------------------------------
  {
    const weight = weights.work_arrangement ?? 4
    const vacWaId = vacancy.work_arrangement_id
    const candWaPrefs = Array.isArray(jobseeker.work_arrangement_preferences)
      ? jobseeker.work_arrangement_preferences.map(p => p.work_arrangement_id || p)
      : []

    let rawScore = null
    let status = 'unknown'
    let evaluable = false
    const reasonCodes = []

    if (!vacWaId) {
      status = 'not_applicable'
      reasonCodes.push(MATCHING_REASON_CODES.WORK_ARRANGEMENT_NEUTRAL)
    } else if (candWaPrefs.length === 0) {
      status = 'unknown'
      reasonCodes.push(MATCHING_REASON_CODES.WORK_ARRANGEMENT_NEUTRAL)
    } else {
      evaluable = true
      if (candWaPrefs.includes(vacWaId)) {
        rawScore = 1.0
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.WORK_ARRANGEMENT_MATCH)
      } else {
        rawScore = 0.2
        status = 'mismatch'
        reasonCodes.push(MATCHING_REASON_CODES.WORK_ARRANGEMENT_MISMATCH)
      }
    }

    dimensions.push({
      dimension: 'work_arrangement',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence: { vacancy_work_arrangement_id: vacWaId },
    })
  }

  // -------------------------------------------------------------
  // 11. SALARY (Weight: 4)
  // -------------------------------------------------------------
  {
    const weight = weights.salary ?? 4
    const vacMin = vacancy.salary_min != null ? Number(vacancy.salary_min) : null
    const vacMax = vacancy.salary_max != null ? Number(vacancy.salary_max) : null
    const candMin = jobseeker.desired_salary_min != null ? Number(jobseeker.desired_salary_min) : null
    const candMax = jobseeker.desired_salary_max != null ? Number(jobseeker.desired_salary_max) : null
    const vacPeriod = (vacancy.salary_period || 'monthly').toLowerCase()
    const candPeriod = (jobseeker.desired_salary_period || 'monthly').toLowerCase()

    let rawScore = null
    let status = 'unknown'
    let evaluable = false
    const reasonCodes = []

    if (candMin == null && candMax == null) {
      status = 'unknown'
      reasonCodes.push(MATCHING_REASON_CODES.SALARY_UNKNOWN)
    } else if (vacMin == null && vacMax == null) {
      status = 'not_applicable'
      reasonCodes.push(MATCHING_REASON_CODES.SALARY_UNKNOWN)
    } else if (vacPeriod !== candPeriod) {
      status = 'unknown'
      reasonCodes.push(MATCHING_REASON_CODES.SALARY_UNKNOWN)
      unknowns.push(`Salary period differs (${candPeriod} vs ${vacPeriod})`)
    } else {
      evaluable = true
      if (vacMax != null && candMin != null) {
        if (candMin <= (vacMin ?? vacMax)) {
          rawScore = 1.0
          status = 'match'
          reasonCodes.push(MATCHING_REASON_CODES.SALARY_RANGE_MATCH)
        } else if (candMin <= vacMax) {
          rawScore = 0.9
          status = 'match'
          reasonCodes.push(MATCHING_REASON_CODES.SALARY_RANGE_MATCH)
        } else if (vacancy.salary_negotiable) {
          rawScore = 0.5
          status = 'partial_match'
          reasonCodes.push(MATCHING_REASON_CODES.SALARY_PARTIAL_OVERLAP)
        } else {
          rawScore = 0.1
          status = 'mismatch'
          reasonCodes.push(MATCHING_REASON_CODES.SALARY_MISMATCH)
        }
      } else {
        rawScore = 1.0
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.SALARY_RANGE_MATCH)
      }
    }

    dimensions.push({
      dimension: 'salary',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence: { candidate_salary_min: candMin, vacancy_salary_max: vacMax },
    })
  }

  // -------------------------------------------------------------
  // 12. AVAILABILITY (Weight: 5)
  // -------------------------------------------------------------
  {
    const weight = weights.availability ?? 5
    const st = (jobseeker.availability_status || '').trim().toLowerCase()

    let rawScore = null
    let status = 'unknown'
    let evaluable = false
    const reasonCodes = []

    if (!st) {
      status = 'unknown'
      reasonCodes.push(MATCHING_REASON_CODES.AVAILABILITY_UNKNOWN)
    } else {
      evaluable = true
      if (st === 'immediately') {
        rawScore = 1.0
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.AVAILABILITY_IMMEDIATE)
        strengths.push('Candidate is available to start immediately')
      } else if (st === 'specific_date' || st === 'notice_period') {
        rawScore = 0.85
        status = 'match'
        reasonCodes.push(MATCHING_REASON_CODES.AVAILABILITY_COMPATIBLE)
      } else if (st === 'not_currently_available') {
        rawScore = 0.1
        status = 'mismatch'
        reasonCodes.push(MATCHING_REASON_CODES.AVAILABILITY_LOW)
        gaps.push('Candidate marked as not currently looking for work')
      } else {
        rawScore = 0.7
        status = 'partial_match'
        reasonCodes.push(MATCHING_REASON_CODES.AVAILABILITY_COMPATIBLE)
      }
    }

    dimensions.push({
      dimension: 'availability',
      weight,
      status,
      evaluable,
      raw_score: rawScore,
      weighted_score: evaluable ? clamp(rawScore) * weight : 0,
      reason_codes: reasonCodes,
      evidence: { availability_status: st },
    })
  }

  // -------------------------------------------------------------
  // AGGREGATE SCORES
  // -------------------------------------------------------------
  const totalConfiguredWeight = Object.values(weights).reduce((sum, w) => sum + w, 0)
  const evaluableWeight = dimensions
    .filter(d => d.evaluable)
    .reduce((sum, d) => sum + d.weight, 0)

  const totalEarnedWeightedScore = dimensions
    .filter(d => d.evaluable)
    .reduce((sum, d) => sum + d.weighted_score, 0)

  // Fit score (0-100): quality of match across evaluable dimensions
  const fitScore = evaluableWeight > 0
    ? (totalEarnedWeightedScore / evaluableWeight) * 100
    : 0

  // Coverage score (0-100): % of configured weight for which meaningful comparison data exists
  const coverageScore = totalConfiguredWeight > 0
    ? (evaluableWeight / totalConfiguredWeight) * 100
    : 0

  // Coverage factor: scales from 0.5 (at 0% coverage) to 1.0 (at 100% coverage)
  const coverageFactor = 0.5 + (0.5 * (coverageScore / 100))

  // Ranking score: combines fit quality with confidence/coverage
  const rankingScore = fitScore * coverageFactor

  return {
    model_version: MODEL_VERSION,
    eligibility,
    fit_score: Math.round(fitScore * 100) / 100,
    coverage_score: Math.round(coverageScore * 100) / 100,
    ranking_score: Math.round(rankingScore * 100) / 100,
    coverage_factor: Math.round(coverageFactor * 1000) / 1000,
    dimensions,
    strengths,
    gaps,
    unknowns,
  }
}

/**
 * Ranks a list of match results deterministically.
 * 
 * @param {Array<Object>} matches Array of { vacancy, jobseeker, eligibility, fit_score, coverage_score, ranking_score }
 * @param {Object} [options] { includeIneligible: boolean, tieBreakerKey: 'vacancy_id' | 'participant_id' }
 * @returns {Array<Object>} Ranked matches
 */
export function rankMatches(matches = [], options = {}) {
  const includeIneligible = options.includeIneligible === true
  const tieBreakerKey = options.tieBreakerKey || 'id'

  const filtered = includeIneligible
    ? [...matches]
    : matches.filter(m => (m.eligibility?.status || m.status) !== ELIGIBILITY_STATUS.INELIGIBLE)

  return filtered.sort((a, b) => {
    // 1. Eligibility priority (eligible > conditionally_eligible > ineligible)
    const statusA = a.eligibility?.status || a.status || ELIGIBILITY_STATUS.ELIGIBLE
    const statusB = b.eligibility?.status || b.status || ELIGIBILITY_STATUS.ELIGIBLE
    const statusOrder = {
      [ELIGIBILITY_STATUS.ELIGIBLE]: 3,
      [ELIGIBILITY_STATUS.CONDITIONALLY_ELIGIBLE]: 2,
      [ELIGIBILITY_STATUS.INELIGIBLE]: 1,
    }
    const prioDiff = (statusOrder[statusB] || 0) - (statusOrder[statusA] || 0)
    if (prioDiff !== 0) return prioDiff

    // 2. Ranking Score DESC
    const rankDiff = (b.ranking_score || 0) - (a.ranking_score || 0)
    if (Math.abs(rankDiff) > 0.0001) return rankDiff

    // 3. Coverage Score DESC
    const covDiff = (b.coverage_score || 0) - (a.coverage_score || 0)
    if (Math.abs(covDiff) > 0.0001) return covDiff

    // 4. Fit Score DESC
    const fitDiff = (b.fit_score || 0) - (a.fit_score || 0)
    if (Math.abs(fitDiff) > 0.0001) return fitDiff

    // 5. Stable tie breaker key
    const idA = a.vacancy?.id || a.jobseeker?.participant_id || a[tieBreakerKey] || ''
    const idB = b.vacancy?.id || b.jobseeker?.participant_id || b[tieBreakerKey] || ''
    return String(idA).localeCompare(String(idB))
  })
}
