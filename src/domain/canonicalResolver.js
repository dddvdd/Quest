// Canonical Resolver (Phase 5A)
// Resolves AI-extracted terms to canonical database entities.
// NO direct database calls. Pure domain logic.
// Input: canonical vocabularies loaded by caller.
// Output: RESOLVED / AMBIGUOUS / UNRESOLVED with candidates.

export const RESOLUTION_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  AMBIGUOUS: 'AMBIGUOUS',
  UNRESOLVED: 'UNRESOLVED',
})

export const SUGGESTION_TYPE = Object.freeze({
  OCCUPATION: 'occupation',
  SKILL: 'skill',
  CERTIFICATION: 'certification',
  INDUSTRY: 'industry',
  EDUCATION: 'education_requirement',
  EXPERIENCE: 'experience_requirement',
  LANGUAGE: 'language',
})

/**
 * Normalizes a raw term for canonical lookup.
 * Lowercases, trims, removes extra whitespace and punctuation.
 *
 * @param {string} rawTerm - Raw extracted term
 * @returns {string} Normalized term
 */
export function normalizeTerm(rawTerm = '') {
  return rawTerm
    .toLowerCase()
    .trim()
    .replace(/[^\w\s/&-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

/**
 * Resolves a raw term against a canonical vocabulary.
 * Returns RESOLVED, AMBIGUOUS, or UNRESOLVED with candidates.
 *
 * @param {string} rawTerm - AI-extracted raw term
 * @param {Array} canonicalEntries - Array of { id, canonical_name, normalized_name }
 * @param {Array} [aliases] - Array of { alias, normalized_alias, occupation_id }
 * @returns {Object} Resolution result
 */
export function resolveRawTerm(rawTerm, canonicalEntries = [], aliases = []) {
  const normalized = normalizeTerm(rawTerm)
  if (!normalized) {
    return {
      raw_term: rawTerm,
      status: RESOLUTION_STATUS.UNRESOLVED,
      candidates: [],
      method: 'empty_input',
    }
  }

  // 1. Exact canonical name match
  const exactMatch = canonicalEntries.find(
    (e) => normalizeTerm(e.canonical_name) === normalized
  )
  if (exactMatch) {
    return {
      raw_term: rawTerm,
      status: RESOLUTION_STATUS.RESOLVED,
      candidates: [{
        id: exactMatch.id,
        canonical_name: exactMatch.canonical_name,
        confidence: 1.0,
        method: 'exact_canonical',
      }],
      method: 'exact_canonical',
    }
  }

  // 2. Normalized name match (in case normalized_name column differs)
  const normMatch = canonicalEntries.find(
    (e) => normalizeTerm(e.normalized_name) === normalized
  )
  if (normMatch) {
    return {
      raw_term: rawTerm,
      status: RESOLUTION_STATUS.RESOLVED,
      candidates: [{
        id: normMatch.id,
        canonical_name: normMatch.canonical_name,
        confidence: 1.0,
        method: 'normalized_canonical',
      }],
      method: 'normalized_canonical',
    }
  }

  // 3. Alias match
  const matchedAliases = aliases.filter(
    (a) => normalizeTerm(a.alias) === normalized || normalizeTerm(a.normalized_alias) === normalized
  )
  if (matchedAliases.length === 1) {
    const aliasEntry = matchedAliases[0]
    const canonical = canonicalEntries.find((e) => e.id === aliasEntry.occupation_id || e.id === aliasEntry.skill_id)
    return {
      raw_term: rawTerm,
      status: RESOLUTION_STATUS.RESOLVED,
      candidates: [{
        id: canonical?.id || aliasEntry.occupation_id || aliasEntry.skill_id,
        canonical_name: canonical?.canonical_name || rawTerm,
        confidence: 0.9,
        method: 'alias_match',
      }],
      method: 'alias_match',
    }
  }
  if (matchedAliases.length > 1) {
    const uniqueOccupierIds = [...new Set(matchedAliases.map((a) => a.occupation_id || a.skill_id))]
    if (uniqueOccupierIds.length === 1) {
      const canonical = canonicalEntries.find((e) => e.id === uniqueOccupierIds[0])
      return {
        raw_term: rawTerm,
        status: RESOLUTION_STATUS.RESOLVED,
        candidates: [{
          id: canonical?.id || uniqueOccupierIds[0],
          canonical_name: canonical?.canonical_name || rawTerm,
          confidence: 0.9,
          method: 'alias_match',
        }],
        method: 'alias_match',
      }
    }
    // Multiple distinct canonical targets from aliases
    const candidates = uniqueOccupierIds.map((cId) => {
      const c = canonicalEntries.find((e) => e.id === cId)
      return { id: cId, canonical_name: c?.canonical_name || rawTerm, confidence: 0.7, method: 'alias_ambiguous' }
    })
    return {
      raw_term: rawTerm,
      status: RESOLUTION_STATUS.AMBIGUOUS,
      candidates,
      method: 'alias_ambiguous',
    }
  }

  // 4. Substring / fuzzy containment match
  const containsMatches = canonicalEntries.filter((e) => {
    const cName = normalizeTerm(e.canonical_name)
    return cName.includes(normalized) || normalized.includes(cName)
  })
  if (containsMatches.length === 1) {
    return {
      raw_term: rawTerm,
      status: RESOLUTION_STATUS.RESOLVED,
      candidates: [{
        id: containsMatches[0].id,
        canonical_name: containsMatches[0].canonical_name,
        confidence: 0.75,
        method: 'substring_match',
      }],
      method: 'substring_match',
    }
  }
  if (containsMatches.length > 1) {
    return {
      raw_term: rawTerm,
      status: RESOLUTION_STATUS.AMBIGUOUS,
      candidates: containsMatches.map((e) => ({
        id: e.id,
        canonical_name: e.canonical_name,
        confidence: 0.6,
        method: 'substring_ambiguous',
      })),
      method: 'substring_ambiguous',
    }
  }

  // 5. No match
  return {
    raw_term: rawTerm,
    status: RESOLUTION_STATUS.UNRESOLVED,
    candidates: [],
    method: 'no_match',
  }
}

/**
 * Resolves a list of extracted terms against a canonical vocabulary.
 * Returns resolution results for each term.
 *
 * @param {Array<{ raw_term: string }>} suggestions - AI-extracted suggestions
 * @param {Array} canonicalEntries - Canonical entries from database
 * @param {Array} [aliases] - Aliases from database
 * @returns {Array} Resolution results
 */
export function resolveSuggestions(suggestions = [], canonicalEntries = [], aliases = []) {
  return suggestions.map((s) => {
    const resolution = resolveRawTerm(s.raw_term, canonicalEntries, aliases)
    return {
      ...s,
      resolution_status: resolution.status,
      canonical_id: resolution.candidates?.[0]?.id || null,
      canonical_name: resolution.candidates?.[0]?.canonical_name || null,
      candidate_matches: resolution.candidates || [],
      resolution_method: resolution.method,
    }
  })
}

/**
 * Validates that a resolved canonical_id exists in the trusted vocabulary.
 * Never trusts AI-invented IDs.
 *
 * @param {string} canonicalId - The proposed canonical ID
 * @param {Array} trustedEntries - Database-loaded canonical entries
 * @returns {boolean} True if the ID is trusted
 */
export function validateCanonicalId(canonicalId, trustedEntries = []) {
  if (!canonicalId) return false
  return trustedEntries.some((e) => e.id === canonicalId)
}
