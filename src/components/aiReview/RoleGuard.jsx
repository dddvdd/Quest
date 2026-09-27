import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.jsx'

const AI_REVIEW_ROLES = ['admin', 'staff', 'supervisor', 'applicant', 'employer']

export default function RoleGuard({ children, roles = AI_REVIEW_ROLES }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return <main className="grid min-h-screen place-items-center text-slate-600">Loading review access...</main>
  }

  if (profile?.role === 'medical') {
    return <Navigate to="/" replace />
  }

  if (!roles.includes(profile?.role)) {
    return <Navigate to="/" replace />
  }

  return children
}
