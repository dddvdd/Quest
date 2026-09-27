// Accreditation document upload + review. Wraps the storage abstraction
// (so PDFs can move from Supabase Storage to R2 later) and the
// SECURITY DEFINER RPCs.

import { supabase } from '../lib/supabase'
import { unwrapRpc, unwrap } from '../lib/errors'
import { upload as storageUpload } from '../storage/storageService'
import { STORAGE_BUCKETS } from '../storage/storageService'
import { createSignedUrl as storageSignedUrl } from '../storage/storageService'
import { remove as storageRemove } from '../storage/storageService'

export async function submitDocument({ employerId, requirementId, file }) {
  const path = `${employerId}/${requirementId}.pdf`
  await storageUpload(STORAGE_BUCKETS.ACCREDITATION_DOCUMENTS, path, file, {
    contentType: 'application/pdf',
    upsert: true,
  })
  return unwrapRpc(
    await supabase.rpc('submit_accreditation_document', {
      p_requirement_id: requirementId,
      p_path: path,
      p_filename: file.name,
    }),
    'Submit failed'
  )
}

export async function reviewDocument({ requirementId, status, notes }) {
  return unwrapRpc(
    await supabase.rpc('review_accreditation_requirement', {
      p_requirement_id: requirementId,
      p_status: status,
      p_notes: status === 'approved' ? null : (notes || null),
    }),
    'Review failed'
  )
}

export async function viewDocumentUrl(path) {
  return storageSignedUrl(STORAGE_BUCKETS.ACCREDITATION_DOCUMENTS, path, 600)
}

export async function deleteDocument(path) {
  return storageRemove(STORAGE_BUCKETS.ACCREDITATION_DOCUMENTS, [path])
}

export const accreditationService = {
  submitDocument,
  reviewDocument,
  viewDocumentUrl,
  deleteDocument,
}

export { unwrap }