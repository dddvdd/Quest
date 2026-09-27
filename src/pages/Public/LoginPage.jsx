import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { PixelStar, PixelArrow, PixelBriefcase } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'

// Staff / Admin / Supervisor / Medical / Employer portal sign-in.
// Applicants do NOT sign in here — they register through the Quest Board's
// Google flow. The "I am an applicant" link is kept as an escape hatch for
// lost applicants, pointing them back to the public Quest Board.
export default function LoginPage() {
  const { signInWithPassword } = useAuth()
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    const { error } = await signInWithPassword(credential.trim(), password)
    setSubmitting(false)
    if (error) return toast.error(error.message)
    // Role-based redirect happens automatically in App.jsx once the profile loads.
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-white">
              <PixelBriefcase className="h-4 w-4" />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">Trabaho Caravan</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/" className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-blue-700">
              <PixelArrow className="h-3 w-3 rotate-180" /> Quest Board
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center px-5 py-8">
        <form onSubmit={submit} className="w-full rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700 ring-1 ring-blue-100">
            <PixelStar className="h-2.5 w-2.5 text-amber-500" />
            Provincial Public Employment Service Office (PPESO)
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">Staff &amp; Partner Portal</h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in with your event-team account to open the portal.
          </p>

          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                required
                type="email"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder="you@company.com"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              Employer, PESO Manager, Medical and Staff accounts sign in with email.
            </p>
          </div>

          <button
            disabled={submitting}
            className="mt-6 min-h-11 w-full rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in to the portal'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-4 w-full text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            ← I am an applicant
          </button>

          <div className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-500">
            Are you an employer or agency?{' '}
            <Link to="/register-employer" className="font-semibold text-blue-700 hover:underline">Register here</Link>
          </div>
        </form>
      </main>
    </div>
  )
}