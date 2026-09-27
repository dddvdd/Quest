import { Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { ROLES } from './domain/roles'
import { ROLE_HOME } from './domain/statuses'
import LandingPage from './pages/Public/LandingPage'

function App() {
  const { user, profile, loading, signOut } = useAuth()

  if (loading) return <main className="grid min-h-screen place-items-center text-slate-600">Loading your account…</main>
  if (user && profile?.is_active) {
    if (profile.role === ROLES.APPLICANT) {
      // Applicants browse the Quest Board at "/". Only the employer-registration
      // completion edge is redirected; everything else shows the public landing.
      if (localStorage.getItem('pending_employer_registration')) return <Navigate to="/register-employer/complete" replace />
      return <LandingPage />
    }
    // Other roles: route from the centralised ROLE_HOME table (domain/statuses).
    if (profile.role === ROLES.EMPLOYER && localStorage.getItem('pending_employer_registration')) {
      return <Navigate to="/register-employer/complete" replace />
    }
    const home = ROLE_HOME[profile.role]
    if (home) return <Navigate to={home} replace />
    return <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-6 text-center"><section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"><h1 className="text-2xl font-bold">Portal Access</h1><p className="mt-3 text-slate-600">You are signed in as {profile.role}.</p><button onClick={() => signOut()} className="mt-6 rounded-lg border border-slate-300 px-4 py-2 font-medium">Sign out</button></section></main>
  }

  // Public Quest Board — anonymous visitors can explore without signing in.
  return <LandingPage />
}

export default App