// AI Review Service (Phase 5B)
// Review, accept, reject, edit AI extraction suggestions.
// All writes go through RPC with authorization enforcement.

import { supabase } from '../lib/supabase.js'
import { unwrap } from '../lib/errors.js'

/**
 * List pending suggestions with optional filters.
 * @param {{ entityType?: string, entityId?: string, resolutionStatus?: string }} filters
 * @returns {Promise<Array>}
 */
export async function listPendingSuggestions({ entityType, entityId, resolutionStatus } = {}) {
  const { data, error } = await supabase.rpc('list_pending_suggestions', {
    p_entity_type: entityType || null,
    p_entity_id: entityId || null,
    p_resolution_status: resolutionStatus || null,
  })
  if (error) throw unwrap(error)
  return data || []
}

/**
 * Get a single suggestion by ID.
 * @param {string} suggestionId
 * @returns {Promise<object>}
 */
export async function getSuggestion(suggestionId) {
  const { data, error } = await supabase
    .from('ai_extraction_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .single()
  if (error) throw unwrap(error)
  return data
}

/**
 * Accept a suggestion. Optionally provide an edited canonical ID.
 * @param {string} suggestionId
 * @param {string} [editedCanonicalId]
 * @returns {Promise<object>}
 */
export async function acceptSuggestion(suggestionId, editedCanonicalId) {
  const { data, error } = await supabase.rpc('accept_ai_suggestion', {
    p_suggestion_id: suggestionId,
    p_edited_canonical_id: editedCanonicalId || null,
  })
  if (error) throw unwrap(error)
  return data
}

/**
 * Reject a suggestion with optional note.
 * @param {string} suggestionId
 * @param {string} [reviewNote]
 * @returns {Promise<object>}
 */
export async function rejectSuggestion(suggestionId, reviewNote) {
  const { data, error } = await supabase.rpc('reject_ai_suggestion', {
    p_suggestion_id: suggestionId,
    p_review_note: reviewNote || null,
  })
  if (error) throw unwrap(error)
  return data
}

/**
 * Edit a suggestion's term and canonical target, then accept.
 * @param {string} suggestionId
 * @param {string} editedTerm
 * @param {string} editedCanonicalId
 * @returns {Promise<object>}
 */
export async function editSuggestion(suggestionId, editedTerm, editedCanonicalId) {
  const { data, error } = await supabase.rpc('edit_ai_suggestion', {
    p_suggestion_id: suggestionId,
    p_edited_term: editedTerm,
    p_edited_canonical_id: editedCanonicalId,
  })
  if (error) throw unwrap(error)
  return data
}

/**
 * Batch accept multiple suggestions.
 * @param {string[]} suggestionIds
 * @returns {Promise<{ accepted: string[], failed: Array<{ id: string, error: string }> }>}
 */
export async function batchAcceptSuggestions(suggestionIds) {
  const results = await Promise.allSettled(
    suggestionIds.map((id) => acceptSuggestion(id))
  )

  const accepted = []
  const failed = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled' && !result.value.error) {
      accepted.push(suggestionIds[i])
    } else {
      failed.push({
        id: suggestionIds[i],
        error: result.status === 'rejected'
          ? result.reason?.message || 'Unknown error'
          : result.value.error,
      })
    }
  }

  return { accepted, failed }
}

/**
 * Batch reject multiple suggestions.
 * @param {string[]} suggestionIds
 * @param {string} [reviewNote]
 * @returns {Promise<{ rejected: string[], failed: Array<{ id: string, error: string }> }>}
 */
export async function batchRejectSuggestions(suggestionIds, reviewNote) {
  const results = await Promise.allSettled(
    suggestionIds.map((id) => rejectSuggestion(id, reviewNote))
  )

  const rejected = []
  const failed = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled' && !result.value.error) {
      rejected.push(suggestionIds[i])
    } else {
      failed.push({
        id: suggestionIds[i],
        error: result.status === 'rejected'
          ? result.reason?.message || 'Unknown error'
          : result.value.error,
      })
    }
  }

  return { rejected, failed }
}

export const aiReviewService = {
  listPendingSuggestions,
  getSuggestion,
  acceptSuggestion,
  rejectSuggestion,
  editSuggestion,
  batchAcceptSuggestions,
  batchRejectSuggestions,
}
