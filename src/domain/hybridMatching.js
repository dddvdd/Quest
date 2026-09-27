// Hybrid Semantic Matching Engine (Phase 4B)
// Combines deterministic structured scoring with semantic similarity.
// NO LLM inference, NO embedding generation here.
// Pure domain logic: deterministic + semantic → hybrid score.

import { ELIGIBILITY_STATUS } from './eligibility.js'

export const HYBRID_MODEL_VERSION = 'hybrid-v1'

export const SEMANTIC_MODEL_VERSION = 'semantic-v1'

/**
 * Hybrid weight configuration.
 * Deterministic remains dominant; semantic is a controlled secondary signal.
 * Sum must equal 1.0.
 */
export const HYBRID_WEIGHTS_V1 = Object.freeze({
  deterministic: 0.85,
  semantic: 0.15,
})

/**
 * Semantic similarity band labels for explanation.
 * Does NOT affect scoring; metadata only.
 */
export const SEMANTIC_BANDS = Object.freeze({
  STRONG: 'strong',
  MODERATE: 'moderate',
  WEAK: 'weak',
})

/**
 * Semantic status values for embedding availability.
 */
export const SEMANTIC_STATUS = Object.freeze({
  AVAILABLE: 'available',
  STALE: 'stale',
  MISSING: 'missing',
  FAILED: 'failed',
})

/**
 * Hybrid reason codes.
 */
export const HYBRID_REASON_CODES = Object.freeze({
  SEMANTIC_STRONG_MATCH: 'SEMANTIC_STRONG_MATCH',
  SEMANTIC_MODERATE_MATCH: 'SEMANTIC_MODERATE_MATCH',
  SEMANTIC_WEAK_MATCH: 'SEMANTIC_WEAK_MATCH',
  SEMANTIC_UNAVAILABLE: 'SEMANTIC_UNAVAILABLE',
  SEMANTIC_STALE: 'SEMANTIC_STALE',
  SEMANTIC_FAILED: 'SEMANTIC_FAILED',
  HYBRID_DETERMINISTIC_DOMINANT: 'HYBRID_DETERMINISTIC_DOMINANT',
  HYBRID_SEMANTIC_BOOST: 'HYBRID_SEMANTIC_BOOST',
  HYBRID_SEMANTIC_NEUTRAL: 'HYBRID_SEMANTIC_NEUTRAL',
})

/**
 * Determines semantic similarity band from normalized score.
 * 
 * @param {number} semanticScore - Score in [0, 100]
 * @returns {string} Band label
 */
export function getSemanticBand(semanticScore) {
  if (semanticScore >= 80) return SEMANTIC_BANDS.STRONG
  if (semanticScore >= 65) return SEMANTIC_BANDS.MODERATE
  return SEMANTIC_BANDS.WEAK
}

/**
 * Normalizes raw cosine similarity to a 0-100 score.
 * Input: similarity in [0, 1] where 1 = identical
 * Output: score in [0, 100]
 * 
 * @param {number} similarity - Cosine similarity in [0, 1]
 * @returns {number} Normalized score in [0, 100]
 */
export function normalizeSemanticScore(similarity) {
  if (similarity == null || Number.isNaN(similarity)) return 0
  const clamped = Math.max(0, Math.min(1, similarity))
  return Math.round(clamped * 100 * 100) / 100
}

/**
 * Derives semantic status from embedding metadata.
 * 
 * @param {Object|null} embeddingMetadata - From getEmbeddingMetadata or search result
 * @returns {string} SEMANTIC_STATUS value
 */
export function deriveSemanticStatus(embeddingMetadata) {
  if (!embeddingMetadata) return SEMANTIC_STATUS.MISSING
  if (embeddingMetadata.status === 'current') return SEMANTIC_STATUS.AVAILABLE
  if (embeddingMetadata.status === 'stale') return SEMANTIC_STATUS.STALE
  if (embeddingMetadata.status === 'failed') return SEMANTIC_STATUS.FAILED
  return SEMANTIC_STATUS.MISSING
}

/**
 * Computes hybrid score combining deterministic ranking with semantic similarity.
 * 
 * Core formula:
 *   hybrid_score = deterministic × 0.85 + semantic_score × 0.15
 * 
 * If semantic data is unavailable, falls back to deterministic score.
 * 
 * @param {Object} deterministicResult - Phase 3B scoreMatch result
 * @param {Object|null} semanticResult - { similarity, score, status }
 * @param {Object} [options] - { weights }
 * @returns {Object} Hybrid scoring result
 */
export function computeHybridScore(deterministicResult, semanticResult = null, options = {}) {
  const weights = options.weights || HYBRID_WEIGHTS_V1
  let deterministicRankingScore = deterministicResult?.ranking_score ?? 0
  if (Number.isNaN(deterministicRankingScore)) deterministicRankingScore = 0

  // No semantic data available
  if (!semanticResult || semanticResult.status !== SEMANTIC_STATUS.AVAILABLE) {
    const status = semanticResult?.status || SEMANTIC_STATUS.MISSING
    const reasonCode = status === SEMANTIC_STATUS.STALE
      ? HYBRID_REASON_CODES.SEMANTIC_STALE
      : status === SEMANTIC_STATUS.FAILED
        ? HYBRID_REASON_CODES.SEMANTIC_FAILED
        : HYBRID_REASON_CODES.SEMANTIC_UNAVAILABLE

    return {
      model_version: HYBRID_MODEL_VERSION,
      deterministic_weight: weights.deterministic,
      semantic_weight: weights.semantic,
      score: Math.round(deterministicRankingScore * 100) / 100,
      semantic_status: status,
      semantic_score: null,
      semantic_band: null,
      reason_codes: [reasonCode, HYBRID_REASON_CODES.HYBRID_DETERMINISTIC_DOMINANT],
      fallback: true,
    }
  }

  const semanticScore = semanticResult.score ?? 0
  const semanticSimilarity = semanticResult.similarity ?? 0

  // Hybrid formula
  const hybridScore = (deterministicRankingScore * weights.deterministic) + (semanticScore * weights.semantic)
  const roundedScore = Math.round(hybridScore * 100) / 100

  // Determine reason codes
  const reasonCodes = []
  const band = getSemanticBand(semanticScore)

  if (band === SEMANTIC_BANDS.STRONG) {
    reasonCodes.push(HYBRID_REASON_CODES.SEMANTIC_STRONG_MATCH)
  } else if (band === SEMANTIC_BANDS.MODERATE) {
    reasonCodes.push(HYBRID_REASON_CODES.SEMANTIC_MODERATE_MATCH)
  } else {
    reasonCodes.push(HYBRID_REASON_CODES.SEMANTIC_WEAK_MATCH)
  }

  // Determine if semantic boosted or was neutral relative to deterministic
  if (semanticScore > deterministicRankingScore) {
    reasonCodes.push(HYBRID_REASON_CODES.HYBRID_SEMANTIC_BOOST)
  } else {
    reasonCodes.push(HYBRID_REASON_CODES.HYBRID_SEMANTIC_NEUTRAL)
  }

  return {
    model_version: HYBRID_MODEL_VERSION,
    deterministic_weight: weights.deterministic,
    semantic_weight: weights.semantic,
    score: roundedScore,
    semantic_status: SEMANTIC_STATUS.AVAILABLE,
    semantic_score: semanticScore,
    semantic_similarity: Math.round(semanticSimilarity * 10000) / 10000,
    semantic_band: band,
    reason_codes: reasonCodes,
    fallback: false,
  }
}

/**
 * Ranks hybrid results deterministically.
 * Preserves eligibility gate: INELIGIBLE always ranks last.
 * 
 * @param {Array<Object>} matches - Array of hybrid match results
 * @param {Object} [options] - { includeIneligible, tieBreakerKey }
 * @returns {Array<Object>} Sorted matches
 */
export function rankHybridMatches(matches = [], options = {}) {
  const includeIneligible = options.includeIneligible === true
  const tieBreakerKey = options.tieBreakerKey || 'id'

  const filtered = includeIneligible
    ? [...matches]
    : matches.filter(m => (m.eligibility?.status || m.status) !== ELIGIBILITY_STATUS.INELIGIBLE)

  return filtered.sort((a, b) => {
    // 1. Eligibility priority
    const statusA = a.eligibility?.status || a.status || ELIGIBILITY_STATUS.ELIGIBLE
    const statusB = b.eligibility?.status || b.status || ELIGIBILITY_STATUS.ELIGIBLE
    const statusOrder = {
      [ELIGIBILITY_STATUS.ELIGIBLE]: 3,
      [ELIGIBILITY_STATUS.CONDITIONALLY_ELIGIBLE]: 2,
      [ELIGIBILITY_STATUS.INELIGIBLE]: 1,
    }
    const prioDiff = (statusOrder[statusB] || 0) - (statusOrder[statusA] || 0)
    if (prioDiff !== 0) return prioDiff

    // 2. Hybrid score DESC
    const hybridA = a.hybrid?.score ?? 0
    const hybridB = b.hybrid?.score ?? 0
    const hybridDiff = hybridB - hybridA
    if (Math.abs(hybridDiff) > 0.0001) return hybridDiff

    // 3. Deterministic ranking score DESC (fallback)
    const rankA = a.deterministic?.ranking_score ?? a.ranking_score ?? 0
    const rankB = b.deterministic?.ranking_score ?? b.ranking_score ?? 0
    const rankDiff = rankB - rankA
    if (Math.abs(rankDiff) > 0.0001) return rankDiff

    // 4. Coverage score DESC
    const covA = a.deterministic?.coverage_score ?? a.coverage_score ?? 0
    const covB = b.deterministic?.coverage_score ?? b.coverage_score ?? 0
    const covDiff = covB - covA
    if (Math.abs(covDiff) > 0.0001) return covDiff

    // 5. Stable tie breaker
    const idA = a.vacancy?.id || a.candidate?.participant_id || a[tieBreakerKey] || ''
    const idB = b.vacancy?.id || b.candidate?.participant_id || b[tieBreakerKey] || ''
    return String(idA).localeCompare(String(idB))
  })
}

/**
 * Validates that hybrid weights sum to 1.0.
 * 
 * @param {Object} weights - Weight configuration
 * @returns {boolean} True if valid
 */
export function validateHybridWeights(weights) {
  if (!weights) return false
  const sum = (weights.deterministic || 0) + (weights.semantic || 0)
  return Math.abs(sum - 1.0) < 0.0001
}

/**
 * Validates hybrid score is within valid bounds.
 * 
 * @param {Object} hybridResult - computeHybridScore result
 * @returns {boolean} True if all scores in [0, 100]
 */
export function validateHybridBounds(hybridResult) {
  if (!hybridResult) return false
  const { score, semantic_score } = hybridResult
  if (score < 0 || score > 100) return false
  if (semantic_score != null && (semantic_score < 0 || semantic_score > 100)) return false
  return true
}