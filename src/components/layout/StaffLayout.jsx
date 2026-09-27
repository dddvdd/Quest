import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PixelBriefcase } from '../public/pixel'
import ThemeToggle from '../ThemeToggle'

const STAFF_TABS = [
  { to: '/calendar', label: 'Calendar' },
  { to: '/staff/scanner', label: 'QR Scanner' },
  { to: '/staff/search', label: 'Manual Search' },
  { to: '/staff/walkin', label: 'Walk-in Registration' },
  { to: '/staff/interview-log', label: 'Interview Log' },
  { to: '/staff/medical-referral', label: 'Medical Referral' },
]

export default function StaffLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navbar — matches the landing page header language */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/staff/scanner" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white">
              <PixelBriefcase className="h-4 w-4" />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">
              Trabaho Caravan <span className="text-xs font-normal text-slate-500">| Staff Portal</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <ThemeToggle />
            <span className="hidden sm:inline font-medium text-slate-600">
              {profile?.full_name || profile?.email} ({profile?.role})
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tab Navigation — landing-style subtle tabs with amber accent */}
        <nav className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {STAFF_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}