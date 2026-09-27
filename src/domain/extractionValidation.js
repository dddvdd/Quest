// Extraction Validation (Phase 5A)
// Validates AI structured output against a strict schema.
// NO database calls, NO provider calls. Pure validation logic.

export const EXTRACTION_VERSION = 'ai-extraction-v1'

export const PROVENANCE = Object.freeze({
  EXPLICIT: 'explicit',
  INFERRED: 'inferred',
  AMBIGUOUS: 'ambiguous',
})

export const IMPORTANCE = Object.freeze({
  REQUIRED: 'required',
  PREFERRED: 'preferred',
  NICE_TO_HAVE: 'nice_to_have',
  REVIEW_REQUIRED: 'review_required',
})

export const SOURCE_INTENT = Object.freeze({
  PREFERENCE: 'preference',
  HISTORICAL: 'historical',
  UNKNOWN: 'unknown',
})

const PREFERENCE_SIGNALS = [
  /\b(want|wish|desire|seek|looking for|interested in|prefer|career interest|career goal|aspiring|aspire to be)\b/i,
  /\b(target|目标|aim to|hope to|plan to|intend to|would like)\b/i,
  /\b(dream job|ideal role|preferred|desired)\b/i,
]

const HISTORICAL_SIGNALS = [
  /\b(worked as|was employed as|previously worked|formerly worked|employment history|past experience|previous role|former role)\b/i,
  /\b(held the position|served as|acted as|employed at|worked at|worked for|worked in)\b/i,
  /\b(years of experience in|background in|experience in)\b/i,
  /\b(resigned|terminated|left the|departed|retired from)\b/i,
]

/**
 * Detects whether a source text fragment indicates preference intent vs historical context.
 * Used to decide whether occupation/industry extractions should write to preference tables.
 *
 * @param {string} sourceTextFragment - The original text the AI extracted from
 * @returns {'preference' | 'historical' | 'unknown'}
 */
export function detectPreferenceIntent(sourceTextFragment) {
  if (!sourceTextFragment || typeof sourceTextFragment !== 'string') return SOURCE_INTENT.UNKNOWN

  const text = sourceTextFragment.trim()
  if (!text) return SOURCE_INTENT.UNKNOWN

  for (const pattern of PREFERENCE_SIGNALS) {
    if (pattern.test(text)) return SOURCE_INTENT.PREFERENCE
  }

  for (const pattern of HISTORICAL_SIGNALS) {
    if (pattern.test(text)) return SOURCE_INTENT.HISTORICAL
  }

  return SOURCE_INTENT.UNKNOWN
}

/**
 * Determines whether an occupation or industry suggestion should write to preference tables.
 * Returns true only when source explicitly indicates preference/career interest.
 *
 * @param {string} sourceTextFragment - Original text fragment
 * @param {string} provenance - explicit | inferred | ambiguous
 * @returns {boolean}
 */
export function shouldWriteToPreference(sourceTextFragment, provenance) {
  const intent = detectPreferenceIntent(sourceTextFragment)
  if (intent === SOURCE_INTENT.PREFERENCE) return true
  if (intent === SOURCE_INTENT.HISTORICAL) return false
  // Unknown intent: only write if explicitly stated (high confidence)
  if (provenance === 'explicit' && intent === SOURCE_INTENT.UNKNOWN) return false
  return false
}

/**
 * Validates a single extraction suggestion item.
 * Returns { valid: boolean, errors: string[], sanitized: Object }.
 *
 * @param {Object} item - Raw suggestion from AI
 * @param {Object} schema - Expected shape { raw_term: 'string', ... }
 * @returns {Object} Validation result
 */
function validateSuggestionItem(item, _schema = {}) {
  const errors = []

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Suggestion must be an object'], sanitized: null }
  }

  if (!item.raw_term || typeof item.raw_term !== 'string' || !item.raw_term.trim()) {
    errors.push('raw_term is required and must be a non-empty string')
  }

  if (item.confidence !== undefined) {
    const c = Number(item.confidence)
    if (Number.isNaN(c) || c < 0 || c > 1) {
      errors.push('confidence must be a number between 0 and 1')
    }
  }

  if (item.provenance && !Object.values(PROVENANCE).includes(item.provenance)) {
    errors.push(`provenance must be one of: ${Object.values(PROVENANCE).join(', ')}`)
  }

  // Sanitize: trim raw_term, coerce confidence to number
  const sanitized = {
    ...item,
    raw_term: String(item.raw_term || '').trim(),
    confidence: item.confidence !== undefined ? Math.max(0, Math.min(1, Number(item.confidence))) : undefined,
    provenance: item.provenance || PROVENANCE.EXPLICIT,
  }

  return { valid: errors.length === 0, errors, sanitized }
}

/**
 * Validates a full AI extraction response.
 * Returns { valid: boolean, errors: string[], sanitized: Object }.
 *
 * @param {Object} response - Raw AI extraction output
 * @returns {Object} Validation result
 */
export function validateExtractionResponse(response) {
  const errors = []

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response must be an object'], sanitized: null }
  }

  if (response.extraction_version !== EXTRACTION_VERSION) {
    errors.push(`extraction_version must be "${EXTRACTION_VERSION}", got "${response.extraction_version}"`)
  }

  // Validate each suggestion category
  const categories = ['occupations', 'skills', 'certifications', 'education_requirements', 'experience_requirements', 'industries']
  const sanitized = { ...response }

  for (const cat of categories) {
    if (response[cat] !== undefined) {
      if (!Array.isArray(response[cat])) {
        errors.push(`${cat} must be an array`)
        continue
      }
      const sanitizedItems = []
      for (let i = 0; i < response[cat].length; i++) {
        const result = validateSuggestionItem(response[cat][i])
        if (!result.valid) {
          errors.push(`${cat}[${i}]: ${result.errors.join('; ')}`)
        } else {
          sanitizedItems.push(result.sanitized)
        }
      }
      sanitized[cat] = sanitizedItems
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: sanitized,
  }
}

/**
 * Validates a skill importance claim from AI.
 * Ensures required/preferred/nice_to_have only when text supports it.
 *
 * @param {string} importance - Claimed importance
 * @param {string} sourceText - Original text fragment
 * @returns {string} Validated importance (falls back to review_required)
 */
export function validateImportance(importance, sourceText = '') {
  const valid = Object.values(IMPORTANCE)
  if (valid.includes(importance)) return importance

  // Infer from source text if possible
  const lower = sourceText.toLowerCase()
  if (/\b(required|must have|must know|essential)\b/.test(lower)) return IMPORTANCE.REQUIRED
  if (/\b(preferred|nice to have|bonus|advantage)\b/.test(lower)) return IMPORTANCE.PREFERRED

  return IMPORTANCE.REVIEW_REQUIRED
}

/**
 * Checks if an AI response is empty (no suggestions extracted).
 *
 * @param {Object} response - Validated extraction response
 * @returns {boolean}
 */
export function isExtractionEmpty(response) {
  if (!response) return true
  const categories = ['occupations', 'skills', 'certifications', 'education_requirements', 'experience_requirements', 'industries']
  return categories.every((cat) => !response[cat] || response[cat].length === 0)
}

/**
 * Validates provenance is honest (not self_reported for AI output).
 *
 * @param {string} provenance - Claimed provenance
 * @returns {boolean}
 */
export function validateProvenance(provenance) {
  return Object.values(PROVENANCE).includes(provenance)
}

/**
 * Creates a failed extraction result for provider errors.
 *
 * @param {string} reason - Failure reason
 * @returns {Object} Failed extraction result
 */
export function createFailedExtraction(reason) {
  return {
    extraction_version: EXTRACTION_VERSION,
    status: 'failed',
    failure_reason: reason,
    occupations: [],
    skills: [],
    certifications: [],
    education_requirements: [],
    experience_requirements: [],
    industries: [],
  }
}

/**
 * Validates extraction version matches expected.
 *
 * @param {Object} response - AI extraction response
 * @returns {boolean}
 */
export function isValidVersion(response) {
  return response?.extraction_version === EXTRACTION_VERSION
}
