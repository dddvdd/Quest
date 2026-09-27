import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PixelBriefcase, PixelCal, PixelStar } from '../public/pixel'
import ThemeToggle from '../ThemeToggle'

const NAV_ITEMS = [
  { to: '/supervisor', end: true, label: 'Dashboard', Icon: PixelStar },
  { to: '/calendar', label: 'Calendar', Icon: PixelCal },
  { to: '/supervisor/reports', label: 'Reports & Pivots', Icon: PixelBriefcase },
]

export default function SupervisorLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/supervisor" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-slate-900 bg-role-supervisor text-white pixel-shadow-sm">
              <PixelBriefcase className="h-4 w-4" />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">
              Trabaho Caravan <span className="text-xs font-normal text-slate-500">| Supervisor Portal</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <ThemeToggle />
            <span className="hidden font-medium text-slate-600 sm:inline">
              {profile?.full_name || profile?.email} ({profile?.role})
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-lg border-2 border-slate-900 bg-white px-4 py-2 text-sm font-semibold text-slate-700 pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tab Navigation - pixel tabs with supervisor-pink active state */}
        <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {NAV_ITEMS.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex min-h-[44px] flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-bold uppercase tracking-wide transition-colors sm:text-sm ${
                  isActive
                    ? 'bg-role-supervisor/15 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-role-supervisor" />}
                  <Icon className="h-3 w-3 text-role-supervisor" /> {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
