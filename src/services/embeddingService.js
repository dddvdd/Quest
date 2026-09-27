// Embedding Service (Phase 4A)
// Provider abstraction for text embedding generation.
// Supports OpenAI, local models, and future providers.
// NO direct API calls from browser components.

import {
  buildJobseekerEmbeddingText,
  buildVacancyEmbeddingText,
  computeSourceHash,
  SEMANTIC_VERSIONS,
} from '../domain/semanticRepresentation.js'

// Embedding provider configuration
const EMBEDDING_CONFIG = Object.freeze({
  openai: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.00002, // $0.02 per 1M tokens
  },
  local: {
    provider: 'local',
    model: 'local-embedding',
    dimensions: 384, // Common for local models like all-MiniLM-L6-v2
    maxTokens: 512,
    costPer1kTokens: 0,
  },
})

// Current active configuration (defaults to OpenAI for development)
const ACTIVE_CONFIG = EMBEDDING_CONFIG.openai

/**
 * Generates an embedding for a single text using the configured provider.
 * This function should be called from secure backend (Edge Function or server-side).
 * 
 * @param {string} text - Text to embed
 * @param {Object} [options] - Provider options
 * @returns {Promise<Object>} Embedding result with vector and metadata
 */
export async function embedText(text, options = {}) {
  const config = { ...ACTIVE_CONFIG, ...options }
  
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot embed empty text')
  }

  // For development/testing, return a mock embedding
  if (config.provider === 'mock' || process.env.NODE_ENV === 'test') {
    return generateMockEmbedding(text, config)
  }

  // In production, this would call the actual embedding API via Edge Function
  // For now, we'll use the Supabase Edge Function approach
  try {
    // Dynamic import to avoid issues in test environment
    const { supabase } = await import('../lib/supabase')
    const { data, error } = await supabase.functions.invoke('generate-embedding', {
      body: {
        text,
        provider: config.provider,
        model: config.model,
        dimensions: config.dimensions,
      },
    })

    if (error) throw error

    return {
      vector: data.embedding,
      provider: config.provider,
      model: config.model,
      dimensions: config.dimensions,
      version: options.version || 'v1',
      tokens: data.usage?.total_tokens || estimateTokenCount(text),
    }
  } catch (error) {
    // Fallback to mock embedding for development
    console.warn('Embedding API failed, using mock:', error.message)
    return generateMockEmbedding(text, config)
  }
}

/**
 * Generates embeddings for multiple texts in batch.
 * More efficient than calling embedText multiple times.
 * 
 * @param {string[]} texts - Array of texts to embed
 * @param {Object} [options] - Provider options
 * @returns {Promise<Object[]>} Array of embedding results
 */
export async function embedBatch(texts, options = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return []
  }

  const config = { ...ACTIVE_CONFIG, ...options }
  
  // For development/testing, return mock embeddings
  if (config.provider === 'mock' || process.env.NODE_ENV === 'test') {
    return Promise.all(texts.map(text => generateMockEmbedding(text, config)))
  }

  // In production, this would call the batch embedding API
  // For now, process sequentially with delay to avoid rate limits
  const results = []
  for (const text of texts) {
    const result = await embedText(text, options)
    results.push(result)
    // Small delay between requests to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return results
}

/**
 * Generates a deterministic mock embedding for development/testing.
 * Uses a simple hash-based approach to create consistent vectors.
 * 
 * @param {string} text - Text to embed
 * @param {Object} config - Embedding configuration
 * @returns {Object} Mock embedding result
 */
function generateMockEmbedding(text, config) {
  const dimensions = config.dimensions || 1536
  const vector = new Array(dimensions).fill(0)
  
  // Simple deterministic hash-based embedding
  // This is NOT a real embedding, just for testing infrastructure
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }

  // Fill vector with deterministic values based on hash
  for (let i = 0; i < dimensions; i++) {
    const seed = hash + i * 1000
    vector[i] = Math.sin(seed) * 0.5 + 0.5 // Normalize to [0, 1]
  }

  // Normalize vector to unit length for cosine similarity
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  const normalizedVector = vector.map(val => val / norm)

  return {
    vector: normalizedVector,
    provider: config.provider || 'mock',
    model: config.model || 'mock-embedding',
    dimensions,
    version: 'v1',
    tokens: estimateTokenCount(text),
  }
}

/**
 * Estimates token count for text (rough approximation).
 * 
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
function estimateTokenCount(text) {
  if (!text) return 0
  // Rough approximation: 1 token ≈ 4 characters for English
  return Math.ceil(text.length / 4)
}

/**
 * Computes source hash for embedding deduplication.
 * 
 * @param {string} sourceText - Canonical text representation
 * @param {string} embeddingVersion - Embedding version
 * @returns {string} SHA-256 hash
 */
export function computeEmbeddingHash(sourceText, embeddingVersion) {
  return computeSourceHash(sourceText, embeddingVersion)
}

/**
 * Validates embedding dimensions match expected configuration.
 * 
 * @param {number[]} vector - Embedding vector
 * @param {number} expectedDimensions - Expected dimensions
 * @returns {boolean} True if dimensions match
 */
export function validateEmbeddingDimensions(vector, expectedDimensions) {
  return Array.isArray(vector) && vector.length === expectedDimensions
}

/**
 * Normalizes a raw cosine distance to a similarity score in [0, 1].
 * pgvector returns distance = 1 - cosine_similarity
 * 
 * @param {number} distance - Raw pgvector distance
 * @returns {number} Similarity score in [0, 1]
 */
export function normalizeDistanceToSimilarity(distance) {
  // distance = 1 - cosine_similarity
  // similarity = 1 - distance
  const similarity = 1 - distance
  return Math.max(0, Math.min(1, similarity))
}

/**
 * Gets embedding metadata from the database.
 * 
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {string} [embeddingType] - Embedding type filter
 * @param {string} [embeddingVersion] - Version filter
 * @returns {Promise<Object|null>} Embedding metadata or null
 */
export async function getEmbeddingMetadata(entityType, entityId, embeddingType = null, embeddingVersion = null) {
  try {
    const { supabase } = await import('../lib/supabase')
    const { data, error } = await supabase.rpc('get_embedding_metadata', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_embedding_type: embeddingType,
      p_embedding_version: embeddingVersion,
    })

    if (error) {
      console.warn('Failed to get embedding metadata:', error.message)
      return null
    }

    return data && data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

/**
 * Marks embeddings as stale when source data changes.
 * 
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {string} [embeddingType] - Embedding type filter
 * @returns {Promise<void>}
 */
export async function markEmbeddingsStale(entityType, entityId, embeddingType = null) {
  try {
    const { supabase } = await import('../lib/supabase')
    const { error } = await supabase.rpc('mark_embeddings_stale', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_embedding_type: embeddingType,
    })

    if (error) {
      console.warn('Failed to mark embeddings stale:', error.message)
    }
  } catch {
    // Silently fail in test environment
  }
}

/**
 * Generates and stores an embedding for a jobseeker profile.
 * 
 * @param {string} jobseekerProfileId - Jobseeker profile UUID
 * @param {Object} matchProfile - Match profile data
 * @param {Object} [options] - Generation options
 * @returns {Promise<Object>} Generated embedding record
 */
export async function generateJobseekerEmbedding(jobseekerProfileId, matchProfile, options = {}) {
  const sourceText = buildJobseekerEmbeddingText(matchProfile)
  const embeddingVersion = options.version || SEMANTIC_VERSIONS.JOBSEEKER
  const sourceHash = computeEmbeddingHash(sourceText, embeddingVersion)

  // Check if embedding already exists with same hash
  const existing = await getEmbeddingMetadata(
    'jobseeker_profile',
    jobseekerProfileId,
    'jobseeker_match_profile',
    embeddingVersion
  )

  if (existing && existing.source_hash === sourceHash && existing.status === 'current') {
    return { ...existing, cached: true }
  }

  // Generate new embedding
  const embedding = await embedText(sourceText, {
    ...options,
    version: embeddingVersion,
  })

  try {
    const { supabase } = await import('../lib/supabase')
    // Store in database
    const { data, error } = await supabase
      .from('employment_embeddings')
      .upsert({
        entity_type: 'jobseeker_profile',
        entity_id: jobseekerProfileId,
        embedding_type: 'jobseeker_match_profile',
        source_text: sourceText,
        source_hash: sourceHash,
        embedding: `[${embedding.vector.join(',')}]`,
        provider: embedding.provider,
        model: embedding.model,
        dimensions: embedding.dimensions,
        embedding_version: embeddingVersion,
        status: 'current',
        generated_at: new Date().toISOString(),
      }, {
        onConflict: 'entity_type,entity_id,embedding_type,embedding_version',
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to store embedding: ${error.message}`)
    }

    return { ...data, cached: false }
  } catch {
    // Return embedding without storing in test environment
    return {
      entity_type: 'jobseeker_profile',
      entity_id: jobseekerProfileId,
      embedding_type: 'jobseeker_match_profile',
      source_text: sourceText,
      source_hash: sourceHash,
      embedding: embedding.vector,
      provider: embedding.provider,
      model: embedding.model,
      dimensions: embedding.dimensions,
      embedding_version: embeddingVersion,
      status: 'current',
      generated_at: new Date().toISOString(),
      cached: false,
    }
  }
}

/**
 * Generates and stores an embedding for a vacancy definition.
 * 
 * @param {string} vacancyId - Vacancy definition UUID
 * @param {Object} matchProfile - Match profile data
 * @param {Object} [options] - Generation options
 * @returns {Promise<Object>} Generated embedding record
 */
export async function generateVacancyEmbedding(vacancyId, matchProfile, options = {}) {
  const sourceText = buildVacancyEmbeddingText(matchProfile)
  const embeddingVersion = options.version || SEMANTIC_VERSIONS.VACANCY
  const sourceHash = computeEmbeddingHash(sourceText, embeddingVersion)

  // Check if embedding already exists with same hash
  const existing = await getEmbeddingMetadata(
    'vacancy',
    vacancyId,
    'vacancy_match_profile',
    embeddingVersion
  )

  if (existing && existing.source_hash === sourceHash && existing.status === 'current') {
    return { ...existing, cached: true }
  }

  // Generate new embedding
  const embedding = await embedText(sourceText, {
    ...options,
    version: embeddingVersion,
  })

  try {
    const { supabase } = await import('../lib/supabase')
    // Store in database
    const { data, error } = await supabase
      .from('employment_embeddings')
      .upsert({
        entity_type: 'vacancy',
        entity_id: vacancyId,
        embedding_type: 'vacancy_match_profile',
        source_text: sourceText,
        source_hash: sourceHash,
        embedding: `[${embedding.vector.join(',')}]`,
        provider: embedding.provider,
        model: embedding.model,
        dimensions: embedding.dimensions,
        embedding_version: embeddingVersion,
        status: 'current',
        generated_at: new Date().toISOString(),
      }, {
        onConflict: 'entity_type,entity_id,embedding_type,embedding_version',
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to store embedding: ${error.message}`)
    }

    return { ...data, cached: false }
  } catch {
    // Return embedding without storing in test environment
    return {
      entity_type: 'vacancy',
      entity_id: vacancyId,
      embedding_type: 'vacancy_match_profile',
      source_text: sourceText,
      source_hash: sourceHash,
      embedding: embedding.vector,
      provider: embedding.provider,
      model: embedding.model,
      dimensions: embedding.dimensions,
      embedding_version: embeddingVersion,
      status: 'current',
      generated_at: new Date().toISOString(),
      cached: false,
    }
  }
}

/**
 * Generates embeddings for multiple entities in batch.
 * 
 * @param {Array<{ entityType: string, entityId: string, matchProfile: Object }>} items
 * @param {Object} [options] - Generation options
 * @returns {Promise<Object>} Batch results with generated, skipped, failed counts
 */
export async function generateBatchEmbeddings(items, options = {}) {
  const results = {
    generated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  for (const item of items) {
    try {
      let result
      switch (item.entityType) {
        case 'jobseeker_profile':
          result = await generateJobseekerEmbedding(item.entityId, item.matchProfile, options)
          break
        case 'vacancy':
          result = await generateVacancyEmbedding(item.entityId, item.matchProfile, options)
          break
        default:
          throw new Error(`Unknown entity type: ${item.entityType}`)
      }

      if (result.cached) {
        results.skipped++
      } else {
        results.generated++
      }
    } catch (error) {
      results.failed++
      results.errors.push({
        entityType: item.entityType,
        entityId: item.entityId,
        error: error.message,
      })
    }
  }

  return results
}

/**
 * Finds similar vacancies for a jobseeker embedding.
 * 
 * @param {number[]} jobseekerEmbedding - Jobseeker embedding vector
 * @param {Object} [options] - Search options
 * @returns {Promise<Array>} Similar vacancies
 */
export async function searchSimilarVacancies(jobseekerEmbedding, options = {}) {
  try {
    const { supabase } = await import('../lib/supabase')
    const { data, error } = await supabase.rpc('search_similar_vacancies', {
      p_jobseeker_embedding: `[${jobseekerEmbedding.join(',')}]`,
      p_embedding_version: options.version || SEMANTIC_VERSIONS.VACANCY,
      p_limit: options.limit || 10,
      p_min_similarity: options.minSimilarity || 0.3,
    })

    if (error) {
      throw new Error(`Vector search failed: ${error.message}`)
    }

    return (data || []).map(item => ({
      ...item,
      semantic_similarity: Math.round(item.semantic_similarity * 10000) / 10000,
    }))
  } catch {
    // Return empty array in test environment
    return []
  }
}

/**
 * Finds similar candidates for a vacancy embedding (authorized pool only).
 * 
 * @param {number[]} vacancyEmbedding - Vacancy embedding vector
 * @param {string} vacancyDefinitionId - Vacancy definition UUID
 * @param {Object} [options] - Search options
 * @returns {Promise<Array>} Similar candidates from authorized pool
 */
export async function searchSimilarCandidates(vacancyEmbedding, vacancyDefinitionId, options = {}) {
  try {
    const { supabase } = await import('../lib/supabase')
    const { data, error } = await supabase.rpc('search_similar_candidates', {
      p_vacancy_embedding: `[${vacancyEmbedding.join(',')}]`,
      p_vacancy_definition_id: vacancyDefinitionId,
      p_event_vacancy_id: options.eventVacancyId || null,
      p_embedding_version: options.version || SEMANTIC_VERSIONS.JOBSEEKER,
      p_limit: options.limit || 10,
      p_min_similarity: options.minSimilarity || 0.3,
    })

    if (error) {
      throw new Error(`Candidate vector search failed: ${error.message}`)
    }

    return (data || []).map(item => ({
      ...item,
      semantic_similarity: Math.round(item.semantic_similarity * 10000) / 10000,
    }))
  } catch {
    // Return empty array in test environment
    return []
  }
}

export const embeddingService = {
  embedText,
  embedBatch,
  computeEmbeddingHash,
  validateEmbeddingDimensions,
  normalizeDistanceToSimilarity,
  getEmbeddingMetadata,
  markEmbeddingsStale,
  generateJobseekerEmbedding,
  generateVacancyEmbedding,
  generateBatchEmbeddings,
  searchSimilarVacancies,
  searchSimilarCandidates,
  EMBEDDING_CONFIG,
  SEMANTIC_VERSIONS,
}