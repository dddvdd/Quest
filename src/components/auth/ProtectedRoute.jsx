import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function ProtectedRoute({ roles }) {
  const { user, profile, loading } = useAuth()

  if (loading) return <main className="grid min-h-screen place-items-center text-slate-600">Loading your account…</main>
  if (!user) return <Navigate to="/login" replace />
  if (!profile?.is_active) return <main className="grid min-h-screen place-items-center px-6 text-center text-slate-700">Your account is not active. Please contact the event administrator.</main>
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />

  return <Outlet />
}
