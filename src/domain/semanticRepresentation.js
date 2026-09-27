// Semantic Representation Module (Phase 4A)
// Deterministic text serializers for embedding generation.
// NO embeddings, NO semantic vectors, NO LLM inference here.
// This module produces canonical text representations only.

import { createHash } from 'crypto'

export const SEMANTIC_VERSIONS = Object.freeze({
  JOBSEEKER: 'jobseeker-semantic-v1',
  VACANCY: 'vacancy-semantic-v1',
  OCCUPATION: 'occupation-semantic-v1',
  SKILL: 'skill-semantic-v1',
})

/**
 * Builds a deterministic, privacy-safe text representation of a jobseeker profile.
 * Excludes sensitive demographic information (name, email, phone, sex, civil status, etc.).
 * Includes only employment-relevant semantic information.
 * 
 * @param {Object} matchProfile - Jobseeker match profile from get_jobseeker_match_profile
 * @returns {string} Canonical text representation
 */
export function buildJobseekerEmbeddingText(matchProfile = {}) {
  const sections = []

  // Preferred occupations
  const occPrefs = Array.isArray(matchProfile.occupation_preferences) 
    ? matchProfile.occupation_preferences 
    : []
  if (occPrefs.length > 0) {
    sections.push('Preferred occupations:')
    for (const occ of occPrefs) {
      const priority = occ.priority === 1 ? ' (primary)' : 
                      occ.priority === 2 ? ' (secondary)' : ' (exploratory)'
      sections.push(`- ${occ.occupation_name || occ.occupation_id || 'Unknown'}${priority}`)
    }
    sections.push('')
  }

  // Skills
  const skills = Array.isArray(matchProfile.skills) ? matchProfile.skills : []
  if (skills.length > 0) {
    sections.push('Skills:')
    for (const skill of skills) {
      const parts = [skill.canonical_name || skill.skill_id || 'Unknown']
      if (skill.proficiency_level) parts.push(`— ${skill.proficiency_level}`)
      if (skill.years_experience) parts.push(`— ${skill.years_experience} years`)
      sections.push(`- ${parts.join(' ')}`)
    }
    sections.push('')
  }

  // Education
  const education = Array.isArray(matchProfile.education) ? matchProfile.education : []
  if (education.length > 0) {
    sections.push('Education:')
    for (const edu of education) {
      const parts = []
      if (edu.level_name) parts.push(edu.level_name)
      if (edu.field_of_study) parts.push(`in ${edu.field_of_study}`)
      if (edu.status) parts.push(`(${edu.status})`)
      sections.push(`- ${parts.join(' ')}`)
    }
    sections.push('')
  }

  // Work experience
  const workExp = Array.isArray(matchProfile.work_experiences) ? matchProfile.work_experiences : []
  if (workExp.length > 0) {
    sections.push('Experience:')
    for (const exp of workExp) {
      const parts = []
      if (exp.position_title) parts.push(exp.position_title)
      if (exp.company_name) parts.push(`at ${exp.company_name}`)
      if (exp.start_date) {
        const start = exp.start_date.slice(0, 7)
        const end = exp.is_current ? 'present' : (exp.end_date ? exp.end_date.slice(0, 7) : 'unknown')
        parts.push(`(${start} to ${end})`)
      }
      sections.push(`- ${parts.join(' ')}`)
    }
    sections.push('')
  }

  // Certifications
  const certs = Array.isArray(matchProfile.certifications) ? matchProfile.certifications : []
  if (certs.length > 0) {
    sections.push('Certifications:')
    for (const cert of certs) {
      const parts = [cert.canonical_name || cert.certification_id || 'Unknown']
      if (cert.is_valid === false) parts.push('(expired)')
      sections.push(`- ${parts.join(' ')}`)
    }
    sections.push('')
  }

  // Languages
  const langs = Array.isArray(matchProfile.languages) ? matchProfile.languages : []
  if (langs.length > 0) {
    sections.push('Languages:')
    for (const lang of langs) {
      const parts = [lang.name || lang.code || 'Unknown']
      if (lang.speaking_proficiency) parts.push(`speaking: ${lang.speaking_proficiency}`)
      if (lang.reading_proficiency) parts.push(`reading: ${lang.reading_proficiency}`)
      if (lang.writing_proficiency) parts.push(`writing: ${lang.writing_proficiency}`)
      sections.push(`- ${parts.join(', ')}`)
    }
    sections.push('')
  }

  // Industry preferences
  const indPrefs = Array.isArray(matchProfile.industry_preferences) 
    ? matchProfile.industry_preferences 
    : []
  if (indPrefs.length > 0) {
    sections.push('Target industries:')
    for (const ind of indPrefs) {
      const priority = ind.priority === 1 ? ' (primary)' : ' (secondary)'
      sections.push(`- ${ind.industry_name || ind.industry_id || 'Unknown'}${priority}`)
    }
    sections.push('')
  }

  // Employment type preferences
  const empPrefs = Array.isArray(matchProfile.employment_type_preferences)
    ? matchProfile.employment_type_preferences
    : []
  if (empPrefs.length > 0) {
    sections.push('Employment types:')
    for (const emp of empPrefs) {
      sections.push(`- ${emp.employment_type_name || emp.employment_type_id || 'Unknown'}`)
    }
    sections.push('')
  }

  // Work arrangement preferences
  const workPrefs = Array.isArray(matchProfile.work_arrangement_preferences)
    ? matchProfile.work_arrangement_preferences
    : []
  if (workPrefs.length > 0) {
    sections.push('Work arrangements:')
    for (const work of workPrefs) {
      sections.push(`- ${work.work_arrangement_name || work.work_arrangement_id || 'Unknown'}`)
    }
    sections.push('')
  }

  // Location preferences
  const locPrefs = Array.isArray(matchProfile.location_preferences)
    ? matchProfile.location_preferences
    : []
  if (locPrefs.length > 0) {
    sections.push('Location preferences:')
    for (const loc of locPrefs) {
      const parts = []
      if (loc.municipality_city) parts.push(loc.municipality_city)
      if (loc.province) parts.push(loc.province)
      sections.push(`- ${parts.join(', ')}`)
    }
    sections.push('')
  }

  // Career interests and professional summary (if available)
  if (matchProfile.career_interests) {
    sections.push(`Career interests: ${matchProfile.career_interests}`)
    sections.push('')
  }

  if (matchProfile.professional_summary) {
    sections.push(`Professional summary: ${matchProfile.professional_summary}`)
    sections.push('')
  }

  // Availability and salary
  if (matchProfile.availability_status) {
    sections.push(`Availability: ${matchProfile.availability_status}`)
  }

  if (matchProfile.desired_salary_min || matchProfile.desired_salary_max) {
    const salaryParts = []
    if (matchProfile.desired_salary_min) salaryParts.push(`min: ${matchProfile.desired_salary_min}`)
    if (matchProfile.desired_salary_max) salaryParts.push(`max: ${matchProfile.desired_salary_max}`)
    if (matchProfile.desired_salary_currency) salaryParts.push(matchProfile.desired_salary_currency)
    if (matchProfile.desired_salary_period) salaryParts.push(`per ${matchProfile.desired_salary_period}`)
    sections.push(`Salary期望: ${salaryParts.join(' ')}`)
  }

  return sections.join('\n').trim()
}

/**
 * Builds a deterministic text representation of a vacancy definition.
 * Includes employment-relevant semantic information only.
 * 
 * @param {Object} matchProfile - Vacancy match profile from get_vacancy_match_profile
 * @returns {string} Canonical text representation
 */
export function buildVacancyEmbeddingText(matchProfile = {}) {
  const sections = []

  // Position and occupation
  if (matchProfile.position) {
    sections.push(`Position: ${matchProfile.position}`)
  }

  if (matchProfile.occupation_name) {
    sections.push(`Occupation: ${matchProfile.occupation_name}`)
  }

  if (matchProfile.company_name) {
    sections.push(`Company: ${matchProfile.company_name}`)
  }

  sections.push('')

  // Job description
  if (matchProfile.job_description) {
    sections.push('Description:')
    sections.push(matchProfile.job_description)
    sections.push('')
  }

  // Requirements summary
  if (matchProfile.requirements_summary) {
    sections.push('Requirements summary:')
    sections.push(matchProfile.requirements_summary)
    sections.push('')
  }

  // Required skills
  const reqSkills = Array.isArray(matchProfile.skills) 
    ? matchProfile.skills.filter(s => s.importance === 'required')
    : []
  if (reqSkills.length > 0) {
    sections.push('Required skills:')
    for (const skill of reqSkills) {
      const parts = [skill.canonical_name || skill.skill_id || 'Unknown']
      if (skill.minimum_proficiency) parts.push(`(min: ${skill.minimum_proficiency})`)
      if (skill.minimum_years_experience) parts.push(`(${skill.minimum_years_experience} years)`)
      sections.push(`- ${parts.join(' ')}`)
    }
    sections.push('')
  }

  // Preferred skills
  const prefSkills = Array.isArray(matchProfile.skills)
    ? matchProfile.skills.filter(s => s.importance === 'preferred')
    : []
  if (prefSkills.length > 0) {
    sections.push('Preferred skills:')
    for (const skill of prefSkills) {
      sections.push(`- ${skill.canonical_name || skill.skill_id || 'Unknown'}`)
    }
    sections.push('')
  }

  // Nice-to-have skills
  const niceSkills = Array.isArray(matchProfile.skills)
    ? matchProfile.skills.filter(s => s.importance === 'nice_to_have')
    : []
  if (niceSkills.length > 0) {
    sections.push('Nice-to-have skills:')
    for (const skill of niceSkills) {
      sections.push(`- ${skill.canonical_name || skill.skill_id || 'Unknown'}`)
    }
    sections.push('')
  }

  // Education requirements
  const eduReqs = Array.isArray(matchProfile.education_requirements)
    ? matchProfile.education_requirements
    : []
  if (eduReqs.length > 0) {
    sections.push('Education requirements:')
    for (const edu of eduReqs) {
      const parts = []
      if (edu.level_name) parts.push(edu.level_name)
      if (edu.field_of_study) parts.push(`in ${edu.field_of_study}`)
      if (edu.importance === 'required') parts.push('(required)')
      else if (edu.importance === 'preferred') parts.push('(preferred)')
      sections.push(`- ${parts.join(' ')}`)
    }
    sections.push('')
  }

  // Experience requirements
  const expReqs = Array.isArray(matchProfile.experience_requirements)
    ? matchProfile.experience_requirements
    : []
  if (expReqs.length > 0) {
    sections.push('Experience requirements:')
    for (const exp of expReqs) {
      const parts = []
      if (exp.minimum_months) parts.push(`${exp.minimum_months} months minimum`)
      if (exp.occupation_name) parts.push(`in ${exp.occupation_name}`)
      if (exp.importance === 'required') parts.push('(required)')
      sections.push(`- ${parts.join(' ')}`)
    }
    sections.push('')
  }

  // Certification requirements
  const certReqs = Array.isArray(matchProfile.certification_requirements)
    ? matchProfile.certification_requirements
    : []
  if (certReqs.length > 0) {
    sections.push('Certification requirements:')
    for (const cert of certReqs) {
      const parts = [cert.canonical_name || cert.certification_id || 'Unknown']
      if (cert.importance === 'required') parts.push('(required)')
      else if (cert.importance === 'preferred') parts.push('(preferred)')
      sections.push(`- ${parts.join(' ')}`)
    }
    sections.push('')
  }

  // Language requirements
  const langReqs = Array.isArray(matchProfile.language_requirements)
    ? matchProfile.language_requirements
    : []
  if (langReqs.length > 0) {
    sections.push('Language requirements:')
    for (const lang of langReqs) {
      const parts = [lang.name || lang.code || 'Unknown']
      if (lang.importance === 'required') parts.push('(required)')
      else if (lang.importance === 'preferred') parts.push('(preferred)')
      sections.push(`- ${parts.join(' ')}`)
    }
    sections.push('')
  }

  // Industry
  if (matchProfile.industry_name) {
    sections.push(`Industry: ${matchProfile.industry_name}`)
  }

  // Employment type
  if (matchProfile.employment_type_name) {
    sections.push(`Employment type: ${matchProfile.employment_type_name}`)
  }

  // Work arrangement
  if (matchProfile.work_arrangement_name) {
    sections.push(`Work arrangement: ${matchProfile.work_arrangement_name}`)
  }

  // Location
  if (matchProfile.municipality_city || matchProfile.province) {
    const locationParts = []
    if (matchProfile.municipality_city) locationParts.push(matchProfile.municipality_city)
    if (matchProfile.province) locationParts.push(matchProfile.province)
    sections.push(`Location: ${locationParts.join(', ')}`)
  }

  // Salary
  if (matchProfile.salary_min || matchProfile.salary_max) {
    const salaryParts = []
    if (matchProfile.salary_min) salaryParts.push(`min: ${matchProfile.salary_min}`)
    if (matchProfile.salary_max) salaryParts.push(`max: ${matchProfile.salary_max}`)
    if (matchProfile.salary_period) salaryParts.push(`per ${matchProfile.salary_period}`)
    sections.push(`Salary: ${salaryParts.join(' ')}`)
  }

  return sections.join('\n').trim()
}

/**
 * Builds a deterministic text representation of an occupation.
 * 
 * @param {Object} occupation - Occupation record
 * @returns {string} Canonical text representation
 */
export function buildOccupationEmbeddingText(occupation = {}) {
  const sections = []

  if (occupation.name) {
    sections.push(`Occupation: ${occupation.name}`)
  }

  if (occupation.description) {
    sections.push(`Description: ${occupation.description}`)
  }

  if (occupation.also_known_as && Array.isArray(occupation.also_known_as)) {
    sections.push(`Also known as: ${occupation.also_known_as.join(', ')}`)
  }

  if (occupation.industry_name) {
    sections.push(`Industry: ${occupation.industry_name}`)
  }

  return sections.join('\n').trim()
}

/**
 * Builds a deterministic text representation of a skill.
 * 
 * @param {Object} skill - Skill record
 * @returns {string} Canonical text representation
 */
export function buildSkillEmbeddingText(skill = {}) {
  const sections = []

  if (skill.name) {
    sections.push(`Skill: ${skill.name}`)
  }

  if (skill.description) {
    sections.push(`Description: ${skill.description}`)
  }

  if (skill.category) {
    sections.push(`Category: ${skill.category}`)
  }

  if (skill.also_known_as && Array.isArray(skill.also_known_as)) {
    sections.push(`Also known as: ${skill.also_known_as.join(', ')}`)
  }

  return sections.join('\n').trim()
}

/**
 * Computes a stable SHA-256 hash of source text + embedding version.
 * Used for deduplication and cost control.
 * 
 * @param {string} sourceText - Canonical text representation
 * @param {string} embeddingVersion - Embedding version string
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function computeSourceHash(sourceText, embeddingVersion) {
  const content = `${sourceText}\n${embeddingVersion}`
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Validates that sensitive demographic data is not present in embedding text.
 * Returns true if the text is privacy-safe.
 * 
 * @param {string} embeddingText - Text to validate
 * @returns {Object} { safe: boolean, violations: string[] }
 */
export function validatePrivacySafety(embeddingText) {
  const violations = []
  const text = embeddingText.toLowerCase()

  // Check for sensitive patterns
  const sensitivePatterns = [
    { pattern: /\b(name|first_name|last_name)\s*[:=]/i, label: 'name field' },
    { pattern: /\b(email|e-mail)\s*[:=]/i, label: 'email' },
    { pattern: /\b(phone|contact|mobile)\s*[:=]/i, label: 'phone/contact' },
    { pattern: /\b(address|barangay|street)\s*[:=]/i, label: 'address' },
    { pattern: /\b(sex|gender)\s*[:=]/i, label: 'sex/gender' },
    { pattern: /\b(civil_status|marital_status)\s*[:=]/i, label: 'civil status' },
    { pattern: /\b(disability|pwd|special_needs)\s*[:=]/i, label: 'disability' },
    { pattern: /\b(4ps|pantawid|solo_parent)\s*[:=]/i, label: '4Ps/solo parent' },
    { pattern: /\b(religion|faith|denomination)\s*[:=]/i, label: 'religion' },
    { pattern: /\b(political|party|affiliation)\s*[:=]/i, label: 'political' },
  ]

  for (const { pattern, label } of sensitivePatterns) {
    if (pattern.test(text)) {
      violations.push(label)
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  }
}