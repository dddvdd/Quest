import { useState, useCallback } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import ThemeToggle from '../ThemeToggle'
import { PixelBriefcase } from '../public/pixel'

const RAIL_WIDTH = 68
const SIDEBAR_WIDTH = 260

const adminNavItems = [
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/admin/intelligence', label: 'Employment Intelligence', icon: 'reports' },
  { to: '/admin/reports', label: 'Reports', icon: 'reports' },
  { to: '/admin/registrants', label: 'Registrants', icon: 'registrants' },
  { to: '/admin/users', label: 'Users', icon: 'user' },
  { to: '/admin/events', label: 'Events', icon: 'calendar' },
  { to: '/admin/vacancies', label: 'Vacancies', icon: 'briefcase' },
  { to: '/admin/review', label: 'AI Review', icon: 'review' },
  { to: '/admin/interviews', label: 'Interviews', icon: 'bubble' },
  { to: '/admin/applications', label: 'Applications', icon: 'doc' },
  { to: '/admin/outcomes', label: 'Outcomes', icon: 'flag' },
  { to: '/admin/employers', label: 'Employers', icon: 'building' },
  { to: '/admin/programs', label: 'Programs', icon: 'flag' },
  { to: '/admin/follow-ups', label: 'Follow-ups', icon: 'bell' },
]

const employerNavItems = [
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/employer/dashboard', label: 'My Vacancies', icon: 'briefcase' },
  { to: '/employer/ai-review', label: 'AI Review', icon: 'review' },
]

// Crisp pixel glyph set (rect-only SVGs) — replaces emoji nav icons so the
// sidebar speaks the same 2D pixel language as the rest of PPESO.
function PixIcon({ name }) {
  const p = { shapeRendering: 'crispEdges', 'aria-hidden': true }
  const art = {
    calendar: (
      <>
        <rect x="1" y="3" width="14" height="12" />
        <rect x="4" y="0" width="2" height="4" />
        <rect x="10" y="0" width="2" height="4" />
        <rect x="2" y="7" width="12" height="1" fill="#ffffff" opacity=".35" />
        <rect x="3" y="10" width="4" height="3" fill="#ffffff" opacity=".85" />
      </>
    ),
    dashboard: (
      <>
        <rect x="1" y="1" width="6" height="6" />
        <rect x="9" y="1" width="6" height="6" opacity=".55" />
        <rect x="1" y="9" width="6" height="6" opacity=".55" />
        <rect x="9" y="9" width="6" height="6" />
      </>
    ),
    reports: (
      <>
        <rect x="2" y="8" width="3" height="7" />
        <rect x="6.5" y="4" width="3" height="11" />
        <rect x="11" y="1" width="3" height="14" />
      </>
    ),
    registrants: (
      <>
        <rect x="2" y="2" width="4" height="4" />
        <rect x="1" y="7" width="6" height="7" />
        <rect x="10" y="3" width="3" height="3" opacity=".6" />
        <rect x="9" y="8" width="6" height="6" opacity=".6" />
      </>
    ),
    user: (
      <>
        <rect x="5" y="1" width="6" height="6" />
        <rect x="3" y="8" width="10" height="7" />
      </>
    ),
    briefcase: (
      <>
        <rect x="6" y="2" width="4" height="3" opacity=".7" />
        <rect x="2" y="5" width="12" height="9" />
        <rect x="7" y="8" width="2" height="2" fill="#ffffff" opacity=".85" />
      </>
    ),
    bubble: (
      <>
        <rect x="1" y="2" width="14" height="9" />
        <rect x="4" y="11" width="4" height="3" />
        <rect x="3" y="5" width="8" height="1" fill="#ffffff" opacity=".7" />
        <rect x="3" y="8" width="5" height="1" fill="#ffffff" opacity=".7" />
      </>
    ),
    doc: (
      <>
        <rect x="3" y="1" width="10" height="14" />
        <rect x="5" y="4" width="6" height="1" fill="#ffffff" opacity=".7" />
        <rect x="5" y="7" width="6" height="1" fill="#ffffff" opacity=".7" />
        <rect x="5" y="10" width="4" height="1" fill="#ffffff" opacity=".7" />
      </>
    ),
    review: (
      <>
        <rect x="2" y="1" width="12" height="14" />
        <rect x="4" y="4" width="5" height="1" fill="#ffffff" opacity=".75" />
        <rect x="4" y="7" width="8" height="1" fill="#ffffff" opacity=".55" />
        <rect x="4" y="10" width="2" height="2" fill="#ffffff" opacity=".85" />
        <rect x="7" y="11" width="4" height="1" fill="#ffffff" opacity=".85" />
      </>
    ),
    flag: (
      <>
        <rect x="3" y="1" width="2" height="14" />
        <rect x="5" y="2" width="9" height="5" />
        <rect x="7" y="4" width="3" height="1" fill="#ffffff" opacity=".7" />
      </>
    ),
    building: (
      <>
        <rect x="4" y="1" width="8" height="14" />
        <rect x="6" y="3" width="2" height="2" fill="#ffffff" opacity=".85" />
        <rect x="9" y="3" width="2" height="2" fill="#ffffff" opacity=".85" />
        <rect x="6" y="7" width="2" height="2" fill="#ffffff" opacity=".85" />
        <rect x="9" y="7" width="2" height="2" fill="#ffffff" opacity=".35" />
        <rect x="7" y="12" width="3" height="3" fill="#ffffff" opacity=".6" />
      </>
    ),
    bell: (
      <>
        <rect x="4" y="2" width="8" height="8" />
        <rect x="3" y="10" width="10" height="2" />
        <rect x="7" y="13" width="2" height="2" />
      </>
    ),
  }
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5 shrink-0" fill="currentColor" {...p}>
      {art[name] || art.dashboard}
    </svg>
  )
}

// 16-bit mecha stripe — segmented red/blue/yellow divider. Admin identity
// decoration only; purely decorative and hidden from assistive tech.
function GundamStripe() {
  return (
    <div aria-hidden className="flex h-1 shrink-0">
      {[...Array(30)].map((_, i) => (
        <span key={i} className={`flex-1 ${i % 3 === 0 ? 'bg-role-admin' : i % 3 === 1 ? 'bg-blue-600' : 'bg-yellow-400'}`} />
      ))}
    </div>
  )
}

// Shared nav renderer — labels shown in the drawer and expanded sidebar,
// icon tiles in the collapsed rail.
// Active state: violet Employer tile vs Admin's high-contrast command tile
// (white surface, heavy outline, red bar + red glyph, yellow corner tick).
function NavList({ items, showLabels, isEmployer }) {
  const activeTile = isEmployer
    ? 'border-slate-900 bg-role-employer/15 text-violet-800 pixel-shadow-sm'
    : 'border-slate-900 bg-white text-slate-900 pixel-shadow-sm'
  const idle = 'border-transparent text-slate-600 hover:bg-slate-100'
  return (
    <nav className="space-y-1 px-2" aria-label={isEmployer ? 'Employer portal' : 'Admin portal'}>
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/employer/dashboard' || item.to === '/admin/dashboard'}
          title={item.label}
          className={({ isActive }) =>
            `relative flex min-h-[44px] items-center gap-3 rounded-lg border-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 ${
              showLabels ? '' : 'justify-center border-transparent px-0'
            } ${isActive ? (isEmployer ? `${activeTile} focus-visible:ring-violet-300` : `${activeTile} focus-visible:ring-blue-300`) : `${idle} focus-visible:ring-blue-300`}`
          }
        >
          {({ isActive }) => (
            <>
              {/* Admin command accents: red spine, yellow corner tick */}
              {isActive && isEmployer && showLabels && (
                <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-full bg-role-employer" />
              )}
              {isActive && !isEmployer && showLabels && (
                <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-full bg-role-admin" />
              )}
              {isActive && !isEmployer && (
                <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 bg-yellow-400" />
              )}
              <span className={isActive && !isEmployer ? 'text-role-admin' : undefined}>
                <PixIcon name={item.icon} />
              </span>
              {showLabels && <span className="truncate">{item.label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)   // desktop sidebar (click-toggled)
  const [mobileOpen, setMobileOpen] = useState(false) // mobile drawer

  const isEmployer = profile?.role === 'employer'
  const navItems = isEmployer ? employerNavItems : adminNavItems
  const portalName = isEmployer ? 'Employer Portal' : 'Admin Portal'
  const homeLink = isEmployer ? '/employer/dashboard' : '/admin/dashboard'
  const displayName = isEmployer ? (profile?.full_name || 'Employer') : (profile?.full_name || 'Admin')
  // Role-tinted focus rings: violet for Employer, technical blue for Admin.
  const FOCUS_RING = isEmployer ? 'focus-visible:ring-violet-300' : 'focus-visible:ring-blue-300'

  const handleSignOut = useCallback(async () => {
    await signOut()
    navigate('/login')
  }, [signOut, navigate])

  // Brand tile — Employer keeps its violet mark; Admin gets the mecha
  // command emblem: near-black shield with a mechanical yellow briefcase.
  const brandTile = (
    <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 ${isEmployer ? 'bg-role-employer/15 text-role-employer' : 'bg-slate-900 text-yellow-400'} ${expanded ? '' : 'pixel-shadow-sm'}`}>
      <PixelBriefcase className="h-4 w-4" />
    </span>
  )

  // Command status lights — tiny mechanical indicators (Admin only).
  const statusLights = !isEmployer && (
    <span aria-hidden className="ml-auto flex shrink-0 items-center gap-1 pr-1">
      <span className="h-1.5 w-1.5 bg-role-admin" />
      <span className="h-1.5 w-1.5 bg-blue-600" />
      <span className="h-1.5 w-1.5 bg-yellow-400" />
    </span>
  )

  return (
    <div className={`relative min-h-screen bg-slate-50 ${isEmployer ? 'theme-employer' : ''}`}>
      {/* ---------- Desktop sidebar (md+) : explicit toggle, no hover dependency ---------- */}
      <aside
        className="fixed left-0 top-0 z-40 hidden h-screen flex-col overflow-hidden border-r-2 border-slate-900 bg-white transition-all duration-200 ease-out md:flex"
        style={{ width: expanded ? SIDEBAR_WIDTH : RAIL_WIDTH }}
        aria-label={`${portalName} navigation`}
      >
        {!isEmployer && <GundamStripe />}
        <div className="flex h-16 shrink-0 items-center gap-2 px-2">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            title={expanded ? 'Collapse navigation' : 'Expand navigation'}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none ${FOCUS_RING} focus-visible:ring-4`}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" shapeRendering="crispEdges" aria-hidden>
              {expanded
                ? <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" fill="none" />
                : <><rect x="1" y="2" width="14" height="2" /><rect x="1" y="7" width="14" height="2" /><rect x="1" y="12" width="14" height="2" /></>}
            </svg>
          </button>
          {/* Brand shows only when expanded — the 68px rail fits the toggle alone. */}
          {expanded && (
            <Link to={homeLink} className={`flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none ${FOCUS_RING} focus-visible:ring-4`}>
              {brandTile}
              <span className="truncate text-sm font-bold text-slate-800">{portalName}</span>
              {statusLights}
            </Link>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <NavList items={navItems} showLabels={expanded} isEmployer={isEmployer} />
        </div>

        {!isEmployer && <GundamStripe />}
        <div className="shrink-0 p-2">
          <button
            type="button"
            onClick={handleSignOut}
            title="Sign Out"
            className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-slate-100 focus-visible:outline-none ${FOCUS_RING} focus-visible:ring-4 ${expanded ? '' : 'justify-center'}`}
          >
            <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-slate-900 text-xs font-black text-white ${isEmployer ? 'bg-role-employer' : 'bg-slate-700'}`}>
              {displayName.charAt(0).toUpperCase()}
            </span>
            {expanded && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{displayName}</span>
                <span className={`block truncate text-xs font-bold uppercase tracking-wide ${isEmployer ? 'text-role-employer' : 'text-role-admin'}`}>Sign out</span>
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* ---------- Mobile top bar (<md) ---------- */}
      <header className="sticky top-0 z-40 border-b-2 border-slate-900 bg-white md:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-3">
          <Link to={homeLink} className={`flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none ${FOCUS_RING} focus-visible:ring-4`}>
            {brandTile}
            <span className="truncate text-sm font-bold text-slate-800">{portalName}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
              className={`grid h-11 w-11 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-none ${FOCUS_RING} focus-visible:ring-4`}
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" shapeRendering="crispEdges" aria-hidden>
                <rect x="1" y="2" width="14" height="2" />
                <rect x="1" y="7" width="14" height="2" />
                <rect x="1" y="12" width="14" height="2" />
              </svg>
            </button>
          </div>
        </div>
        {!isEmployer && <GundamStripe />}
      </header>

      {/* ---------- Mobile drawer ---------- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[80vw] flex-col border-r-2 border-slate-900 bg-white">
            {!isEmployer && <GundamStripe />}
            <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-3">
              <span className="flex min-w-0 items-center gap-2">
                {brandTile}
                <span className="truncate text-sm font-bold text-slate-800">{portalName}</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none ${FOCUS_RING} focus-visible:ring-4`}
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <NavList items={navItems} showLabels isEmployer={isEmployer} />
            </div>
            <div className="shrink-0 space-y-2 p-3">
              <div className="flex items-center gap-2">
                <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-slate-900 text-xs font-black text-white bg-slate-700">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{displayName}</span>
                  <span className="block truncate text-xs text-slate-500">{profile?.role}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border-2 border-slate-900 bg-white px-4 text-sm font-bold uppercase tracking-wide text-slate-700 pixel-shadow-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none ${FOCUS_RING} focus-visible:ring-4`}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Main content ---------- */}
      <div
        className="min-h-screen transition-all duration-200 max-md:!ml-0"
        style={{ marginLeft: expanded ? SIDEBAR_WIDTH : RAIL_WIDTH }}
      >
        <Outlet />
      </div>
    </div>
  )
}
