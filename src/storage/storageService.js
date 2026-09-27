// Provider-agnostic storage surface. The rest of the app talks to this
// module; only `supabaseStorage.js` knows about Supabase Storage. Swap in
// an R2 implementation later without touching business logic.

export const STORAGE_BUCKETS = Object.freeze({
  RESUMES: 'resumes',
  ACCREDITATION_DOCUMENTS: 'accreditation-documents',
})

// Module-local provider reference. Set by setProvider() at app boot.
let _provider = null

export function setProvider(provider) {
  _provider = provider
}

function ensureProvider() {
  if (!_provider) throw new Error('storageService: no provider registered. Call setProvider() at app boot.')
  return _provider
}

/**
 * Upload a file.
 * @param {string} bucket Bucket id (see STORAGE_BUCKETS).
 * @param {string} path Object key inside the bucket.
 * @param {Blob|File} file Binary payload.
 * @param {{ contentType?: string, upsert?: boolean }} [opts]
 */
export function upload(bucket, path, file, opts = {}) {
  return ensureProvider().upload(bucket, path, file, opts)
}

export function remove(bucket, paths) {
  return ensureProvider().remove(bucket, paths)
}

/** Signed URL good for `expiresIn` seconds. */
export function createSignedUrl(bucket, path, expiresIn = 600) {
  return ensureProvider().createSignedUrl(bucket, path, expiresIn)
}

export function getPublicUrl(bucket, path) {
  return ensureProvider().getPublicUrl(bucket, path)
}