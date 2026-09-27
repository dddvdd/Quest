// Semantic Matching Service (Phase 4B)
// Integrates deterministic scoring with semantic similarity.
// Handles embedding retrieval, fallback, and hybrid ranking.

import { supabase } from '../lib/supabase'
import {
  getJobseekerMatchProfile,
  getVacancyMatchProfile,
  getVacanciesMatchProfiles,
} from './eligibilityService'
import { evaluateEligibility, ELIGIBILITY_STATUS } from '../domain/eligibility'
import {
  scoreMatch,
  MODEL_VERSION as DETERMINISTIC_MODEL_VERSION,
} from '../domain/matching'
import {
  computeHybridScore,
  rankHybridMatches,
  normalizeSemanticScore,
  deriveSemanticStatus,
  HYBRID_MODEL_VERSION,
  SEMANTIC_MODEL_VERSION,
  HYBRID_WEIGHTS_V1,
  SEMANTIC_STATUS,
  HYBRID_REASON_CODES,
} from '../domain/hybridMatching'

function deterministicResult(result, includeDimensions = false) {
  const summary = {
    model_version: DETERMINISTIC_MODEL_VERSION,
    fit_score: result.fit_score,
    coverage_score: result.coverage_score,
    ranking_score: result.ranking_score,
  }
  if (!includeDimensions) return summary
  return {
    ...summary,
    coverage_factor: result.coverage_factor,
    dimensions: result.dimensions,
    strengths: result.strengths,
    gaps: result.gaps,
    unknowns: result.unknowns,
  }
}

/**
 * Retrieves semantic similarity between a jobseeker and vacancy embeddings.
 * Returns null if either embedding is missing or stale.
 * 
 * @param {string} jobseekerProfileId - Jobseeker profile UUID
 * @param {string} vacancyId - Vacancy definition UUID
 * @param {Object} [options] - { embeddingVersion }
 * @returns {Promise<Object|null>} { similarity, score, status } or null
 */
export async function getSemanticSimilarity(jobseekerProfileId, vacancyId, options = {}) {
  try {
    // Load embeddings for both entities
    const [jobseekerEmb, vacancyEmb] = await Promise.all([
      supabase
        .from('employment_embeddings')
        .select('embedding, status, embedding_version, generated_at')
        .eq('entity_type', 'jobseeker_profile')
        .eq('entity_id', jobseekerProfileId)
        .eq('embedding_type', 'jobseeker_match_profile')
        .eq('embedding_version', options.embeddingVersion || 'jobseeker-semantic-v1')
        .in('status', ['current', 'stale'])
        .maybeSingle(),
      supabase
        .from('employment_embeddings')
        .select('embedding, status, embedding_version, generated_at')
        .eq('entity_type', 'vacancy')
        .eq('entity_id', vacancyId)
        .eq('embedding_type', 'vacancy_match_profile')
        .eq('embedding_version', options.embeddingVersion || 'vacancy-semantic-v1')
        .in('status', ['current', 'stale'])
        .maybeSingle(),
    ])

    // Check for errors
    if (jobseekerEmb.error || vacancyEmb.error) {
      return { similarity: null, score: null, status: SEMANTIC_STATUS.FAILED }
    }

    const jobseekerData = jobseekerEmb.data
    const vacancyData = vacancyEmb.data

    // Derive status from both embeddings
    const jobseekerStatus = deriveSemanticStatus(jobseekerData)
    const vacancyStatus = deriveSemanticStatus(vacancyData)

    // If either is missing or failed, return appropriate status
    if (jobseekerStatus === SEMANTIC_STATUS.MISSING || vacancyStatus === SEMANTIC_STATUS.MISSING) {
      return { similarity: null, score: null, status: SEMANTIC_STATUS.MISSING }
    }
    if (jobseekerStatus === SEMANTIC_STATUS.FAILED || vacancyStatus === SEMANTIC_STATUS.FAILED) {
      return { similarity: null, score: null, status: SEMANTIC_STATUS.FAILED }
    }
    if (jobseekerStatus === SEMANTIC_STATUS.STALE || vacancyStatus === SEMANTIC_STATUS.STALE) {
      return { similarity: null, score: null, status: SEMANTIC_STATUS.STALE }
    }

    // Both embeddings are current - compute cosine similarity
    const jobseekerVector = jobseekerData.embedding
    const vacancyVector = vacancyData.embedding

    if (!jobseekerVector || !vacancyVector) {
      return { similarity: null, score: null, status: SEMANTIC_STATUS.MISSING }
    }

    // Compute cosine similarity
    const similarity = computeCosineSimilarity(jobseekerVector, vacancyVector)
    const score = normalizeSemanticScore(similarity)

    return {
      similarity: Math.round(similarity * 10000) / 10000,
      score,
      status: SEMANTIC_STATUS.AVAILABLE,
      embedding_version: `${SEMANTIC_MODEL_VERSION}/${jobseekerData.embedding_version}+${vacancyData.embedding_version}`,
    }
  } catch (error) {
    console.warn('Semantic similarity retrieval failed:', error.message)
    return { similarity: null, score: null, status: SEMANTIC_STATUS.FAILED }
  }
}

/**
 * Computes cosine similarity between two vectors.
 * 
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} Cosine similarity in [-1, 1]
 */
function computeCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

/**
 * Hybrid ranking for jobseekers against vacancies.
 * Combines deterministic eligibility + scoring with semantic similarity.
 * 
 * @param {string} jobseekerProfileId - UUID of candidate
 * @param {Object} [options] - { eventId, vacancyDefinitionIds, includeIneligible, weights }
 * @returns {Promise<Array<Object>>} Hybrid-ranked vacancies
 */
export async function rankVacanciesHybrid(jobseekerProfileId, options = {}) {
  // Step 1: Load profiles
  const [jobseeker, vacancies] = await Promise.all([
    getJobseekerMatchProfile(jobseekerProfileId),
    getVacanciesMatchProfiles(options.vacancyDefinitionIds || null, options.eventId || null),
  ])

  // Step 2: Deterministic eligibility + scoring
  const deterministicResults = (vacancies || []).map(vacancy => {
    const eligibility = evaluateEligibility(jobseeker, vacancy, options)
    const match = scoreMatch(jobseeker, vacancy, eligibility, options)
    return {
      vacancy,
      ...match,
    }
  })

  // Step 3: Separate eligible from ineligible
  const eligibleResults = deterministicResults.filter(
    r => r.eligibility?.status !== ELIGIBILITY_STATUS.INELIGIBLE
  )
  const ineligibleResults = deterministicResults.filter(
    r => r.eligibility?.status === ELIGIBILITY_STATUS.INELIGIBLE
  )

  // Step 4: Get semantic similarity for eligible pairs
  const hybridResults = await Promise.all(
    eligibleResults.map(async result => {
      const semantic = await getSemanticSimilarity(
        jobseekerProfileId,
        result.vacancy?.id,
        options
      )

      const hybrid = computeHybridScore(result, semantic, { weights: options.weights })

      return {
        vacancy: result.vacancy,
        eligibility: result.eligibility,
        fit_score: result.fit_score,
        coverage_score: result.coverage_score,
        ranking_score: result.ranking_score,
        deterministic: deterministicResult(result, options.includeExplanationContext),
        semantic: {
          model_version: SEMANTIC_MODEL_VERSION,
          status: semantic?.status || SEMANTIC_STATUS.MISSING,
          similarity: semantic?.similarity || null,
          score: semantic?.score || null,
        },
        hybrid,
      }
    })
  )

  // Step 5: Rank hybrid results
  const rankedHybrid = rankHybridMatches(hybridResults, {
    includeIneligible: false,
    tieBreakerKey: 'id',
  })

  // Step 6: Append ineligible at bottom if requested
  let finalResults = rankedHybrid
  if (options.includeIneligible) {
    const ineligibleHybrid = ineligibleResults.map(r => ({
      vacancy: r.vacancy,
      eligibility: r.eligibility,
      fit_score: r.fit_score,
      coverage_score: r.coverage_score,
      ranking_score: r.ranking_score,
      deterministic: deterministicResult(r, options.includeExplanationContext),
      semantic: {
        model_version: SEMANTIC_MODEL_VERSION,
        status: SEMANTIC_STATUS.MISSING,
        similarity: null,
        score: null,
      },
      hybrid: {
        model_version: HYBRID_MODEL_VERSION,
        score: r.ranking_score,
        fallback: true,
        reason_codes: [HYBRID_REASON_CODES.SEMANTIC_UNAVAILABLE, HYBRID_REASON_CODES.HYBRID_DETERMINISTIC_DOMINANT],
      },
    }))
    finalResults = [...rankedHybrid, ...ineligibleHybrid]
  }

  return options.includeExplanationContext
    ? { jobseeker, results: finalResults }
    : finalResults
}

/**
 * Hybrid ranking for candidates against a vacancy.
 * Respects Phase 3B authorized candidate pool privacy.
 * 
 * @param {string} vacancyDefinitionId - UUID of vacancy
 * @param {Object} [options] - { eventVacancyId, includeIneligible, weights }
 * @returns {Promise<Array<Object>>} Hybrid-ranked candidates
 */
export async function rankCandidatesHybrid(vacancyDefinitionId, options = {}) {
  // Step 1: Load vacancy and authorized candidate pool
  const { getVacancyCandidateMatchProfiles } = await import('./matchingService')
  
  const [vacancy, candidatePool] = await Promise.all([
    getVacancyMatchProfile(vacancyDefinitionId, options.eventVacancyId || null),
    getVacancyCandidateMatchProfiles(vacancyDefinitionId, options.eventVacancyId || null),
  ])

  // Step 2: Deterministic eligibility + scoring
  const deterministicResults = (candidatePool || []).map(item => {
    const jobseeker = item.profile
    const eligibility = evaluateEligibility(jobseeker, vacancy, options)
    const match = scoreMatch(jobseeker, vacancy, eligibility, options)

    return {
      candidate: {
        participant_id: jobseeker?.participant_id,
        first_name: jobseeker?.first_name,
        last_name: jobseeker?.last_name,
        candidate_source: item.candidate_source,
        application_status: item.application_status,
        applied_at: item.applied_at,
      },
      jobseeker_profile_id: jobseeker?.participant_id,
      jobseeker,
      ...match,
    }
  })

  // Step 3: Separate eligible from ineligible
  const eligibleResults = deterministicResults.filter(
    r => r.eligibility?.status !== ELIGIBILITY_STATUS.INELIGIBLE
  )
  const ineligibleResults = deterministicResults.filter(
    r => r.eligibility?.status === ELIGIBILITY_STATUS.INELIGIBLE
  )

  // Step 4: Get semantic similarity for eligible pairs
  const hybridResults = await Promise.all(
    eligibleResults.map(async result => {
      const semantic = await getSemanticSimilarity(
        result.jobseeker_profile_id,
        vacancyDefinitionId,
        options
      )

      const hybrid = computeHybridScore(result, semantic, { weights: options.weights })

      return {
        candidate: result.candidate,
        eligibility: result.eligibility,
        fit_score: result.fit_score,
        coverage_score: result.coverage_score,
        ranking_score: result.ranking_score,
        deterministic: deterministicResult(result, options.includeExplanationContext),
        semantic: {
          model_version: SEMANTIC_MODEL_VERSION,
          status: semantic?.status || SEMANTIC_STATUS.MISSING,
          similarity: semantic?.similarity || null,
          score: semantic?.score || null,
        },
        hybrid,
        ...(options.includeExplanationContext ? { jobseeker: result.jobseeker } : {}),
      }
    })
  )

  // Step 5: Rank hybrid results
  const rankedHybrid = rankHybridMatches(hybridResults, {
    includeIneligible: false,
    tieBreakerKey: 'participant_id',
  })

  // Step 6: Append ineligible at bottom if requested
  let finalResults = rankedHybrid
  if (options.includeIneligible) {
    const ineligibleHybrid = ineligibleResults.map(r => ({
      candidate: r.candidate,
      eligibility: r.eligibility,
      fit_score: r.fit_score,
      coverage_score: r.coverage_score,
      ranking_score: r.ranking_score,
      deterministic: deterministicResult(r, options.includeExplanationContext),
      semantic: {
        model_version: SEMANTIC_MODEL_VERSION,
        status: SEMANTIC_STATUS.MISSING,
        similarity: null,
        score: null,
      },
      hybrid: {
        model_version: HYBRID_MODEL_VERSION,
        score: r.ranking_score,
        fallback: true,
        reason_codes: [HYBRID_REASON_CODES.SEMANTIC_UNAVAILABLE, HYBRID_REASON_CODES.HYBRID_DETERMINISTIC_DOMINANT],
      },
      ...(options.includeExplanationContext ? { jobseeker: r.jobseeker } : {}),
    }))
    finalResults = [...rankedHybrid, ...ineligibleHybrid]
  }

  return options.includeExplanationContext
    ? { vacancy, results: finalResults }
    : finalResults
}

/**
 * Single pair hybrid scoring.
 * 
 * @param {string} jobseekerProfileId - Jobseeker UUID
 * @param {string} vacancyDefinitionId - Vacancy UUID
 * @param {Object} [options] - { eventVacancyId, weights }
 * @returns {Promise<Object>} Full hybrid result
 */
export async function scorePairHybrid(jobseekerProfileId, vacancyDefinitionId, options = {}) {
  const [jobseeker, vacancy] = await Promise.all([
    getJobseekerMatchProfile(jobseekerProfileId),
    getVacancyMatchProfile(vacancyDefinitionId, options.eventVacancyId || null),
  ])

  const eligibility = evaluateEligibility(jobseeker, vacancy, options)
  const deterministic = scoreMatch(jobseeker, vacancy, eligibility, options)

  const semantic = await getSemanticSimilarity(
    jobseekerProfileId,
    vacancyDefinitionId,
    options
  )

  const hybrid = computeHybridScore(deterministic, semantic, { weights: options.weights })

  return {
    jobseeker,
    vacancy,
    eligibility,
    deterministic: {
      model_version: DETERMINISTIC_MODEL_VERSION,
      fit_score: deterministic.fit_score,
      coverage_score: deterministic.coverage_score,
      ranking_score: deterministic.ranking_score,
    },
    semantic: {
      model_version: SEMANTIC_MODEL_VERSION,
      status: semantic?.status || SEMANTIC_STATUS.MISSING,
      similarity: semantic?.similarity || null,
      score: semantic?.score || null,
    },
    hybrid,
  }
}

/**
 * Refreshes stale embeddings for jobseekers or vacancies.
 * Does NOT call embedding API directly; marks for regeneration.
 * 
 * @param {string} entityType - 'jobseeker_profile' or 'vacancy'
 * @param {string} entityId - Entity UUID
 * @returns {Promise<void>}
 */
export async function markEmbeddingForRefresh(entityType, entityId) {
  const embeddingType = entityType === 'jobseeker_profile'
    ? 'jobseeker_match_profile'
    : 'vacancy_match_profile'

  await supabase.rpc('mark_embeddings_stale', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_embedding_type: embeddingType,
  })
}

export const semanticMatchingService = {
  getSemanticSimilarity,
  rankVacanciesHybrid,
  rankCandidatesHybrid,
  scorePairHybrid,
  markEmbeddingForRefresh,
  HYBRID_MODEL_VERSION,
  SEMANTIC_MODEL_VERSION,
  HYBRID_WEIGHTS_V1,
  SEMANTIC_STATUS,
  HYBRID_REASON_CODES,
}
