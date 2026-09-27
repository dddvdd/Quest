// Resume storage helpers — used by RegisterPage + WalkinPage.

import { upload as storageUpload } from '../storage/storageService'
import { remove as storageRemove } from '../storage/storageService'
import { createSignedUrl as storageSignedUrl } from '../storage/storageService'
import { STORAGE_BUCKETS } from '../storage/storageService'

export function uploadResume({ userId, file }) {
  const path = `${userId}/${crypto.randomUUID()}.pdf`
  return storageUpload(STORAGE_BUCKETS.RESUMES, path, file, {
    contentType: 'application/pdf',
    upsert: false,
  }).then(() => path)
}

export function rollbackResume(path) {
  if (!path) return Promise.resolve()
  return storageRemove(STORAGE_BUCKETS.RESUMES, [path]).catch(() => {})
}

export function viewResumeUrl(path) {
  return storageSignedUrl(STORAGE_BUCKETS.RESUMES, path, 600)
}

export const resumeStorage = {
  uploadResume,
  rollbackResume,
  viewResumeUrl,
}