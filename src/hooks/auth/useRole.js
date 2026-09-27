// Auth-context profile/role helpers, layered above AuthContext.

import { useAuth } from '../../contexts/AuthContext'
import { ROLES } from '../../domain/roles'

// The page doesn't need to know `useAuth` exists in many places.
// `useRole()` returns the signed-in user's role (or null).
export function useRole() {
  const { profile } = useAuth()
  return profile?.role ?? null
}

// Convenience for pages that need both the user object + role.
export function useSignedIn() {
  const { user, profile, loading } = useAuth()
  return { user, profile, role: profile?.role ?? null, loading, isSignedIn: !!user }
}

export { ROLES }