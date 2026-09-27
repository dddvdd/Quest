import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { authService } from '../services/authService'
import { profileService } from '../services/profileService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(user) {
    if (!user) {
      setProfile(null)
      return
    }
    const data = await profileService.fetchCurrent(user.id).catch((err) => {
      console.error('Unable to load the user profile:', err.message)
      return null
    })
    setProfile(data ?? null)
  }

  useEffect(() => {
    let mounted = true

    async function initialise() {
      const { session: currentSession } = await authService.getSession()
      if (!mounted) return

      // If there's a session but no profile, or profile is inactive, sign out.
      if (currentSession?.user) {
        const inactive = await profileService.isProfileInactive(currentSession.user.id).catch(() => true)
        if (inactive) {
          await authService.signOut()
          return
        }
      }

      setSession(currentSession)
      await loadProfile(currentSession?.user)
      if (mounted) setLoading(false)
    }

    initialise()
    const { data: { subscription } } = authService.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_IN' && nextSession?.user) {
        loadProfile(nextSession.user)
      }
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithGoogle() {
    return authService.signInWithGoogle(`${window.location.origin}/register`)
  }

  async function signInWithPassword(email, password) {
    return authService.signInWithPassword(email, password)
  }

  async function signOut() {
    return authService.signOut()
  }

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signInWithGoogle,
    signInWithPassword,
    signOut,
  }), [session, profile, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}