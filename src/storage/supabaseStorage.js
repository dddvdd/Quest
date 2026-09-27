// Supabase Storage implementation of the storageService contract.
// Replace this file (and the registration in main.jsx) with an R2-backed
// implementation to migrate away from Supabase Storage without touching
// application code.

import { supabase } from '../lib/supabase'

async function upload(bucket, path, file, opts = {}) {
  const { contentType, upsert = false } = opts
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType, upsert,
  })
  if (error) throw error
  return { path }
}

async function remove(bucket, paths) {
  const list = Array.isArray(paths) ? paths : [paths]
  const { error } = await supabase.storage.from(bucket).remove(list)
  if (error) throw error
}

async function createSignedUrl(bucket, path, expiresIn = 600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data?.signedUrl ?? null
}

function getPublicUrl(bucket, path) {
  return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl ?? null
}

export const supabaseStorage = {
  upload,
  remove,
  createSignedUrl,
  getPublicUrl,
}