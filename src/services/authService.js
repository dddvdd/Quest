// Authentication operations. Thin wrapper over supabase.auth — keeps
// AuthContext small and lets pages use named operations.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

export async function getSession() {
  return unwrap(
    await supabase.auth.getSession(),
    'Could not restore session'
  )
}

export async function signInWithPassword(email, password) {
  return unwrap(
    await supabase.auth.signInWithPassword({ email, password }),
    'Sign-in failed'
  )
}

export async function signUpEmployer({ email, password, fullName, role }) {
  return unwrap(
    await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    }),
    'Registration failed'
  )
}

export async function employerSignupAllowed() {
  return unwrap(
    await supabase.rpc('employer_signup_allowed'),
    'Could not check signup availability'
  )
}

export async function signInWithGoogle(redirectTo) {
  return unwrap(
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    }),
    'Google sign-in failed'
  )
}

export async function signOut() {
  return unwrap(await supabase.auth.signOut(), 'Sign-out failed')
}

export function onAuthStateChange(handler) {
  return supabase.auth.onAuthStateChange(handler)
}

export const authService = {
  getSession,
  signInWithPassword,
  signUpEmployer,
  employerSignupAllowed,
  signInWithGoogle,
  signOut,
  onAuthStateChange,
}