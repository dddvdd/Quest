// Admin RPCs that don't belong in any other aggregate:
//   - admin_create_user (portal account provisioning)
//   - admin_reset_password
//   - resolve_login_email (called from auth flow)

import { supabase } from '../lib/supabase'
import { unwrapRpc } from '../lib/errors'

export async function createUser(payload) {
  return unwrapRpc(
    await supabase.rpc('admin_create_user', payload),
    'Could not create user'
  )
}

export async function resetPassword(userId, password) {
  return unwrapRpc(
    await supabase.rpc('admin_reset_password', { p_user_id: userId, p_password: password }),
    'Password reset failed'
  )
}

export async function resolveLoginEmail(identifier) {
  return unwrapRpc(
    await supabase.rpc('resolve_login_email', { p_identifier: identifier }),
    'Login identifier not found'
  )
}

export const adminService = {
  createUser,
  resetPassword,
  resolveLoginEmail,
}