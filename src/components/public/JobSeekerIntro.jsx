import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { PixelStar } from './pixel'

export const INTRO_KEY = 'jobseeker_intro'

const PREFERENCES = [
  { value: 'local', label: 'Local Employment', hint: 'Jobs here in the Philippines' },
  { value: 'overseas', label: 'Overseas Employment', hint: 'Work opportunities abroad' },
  { value: 'exploring', label: "Either / I'm Exploring", hint: 'Open to both local and overseas' },
]

const INTERESTS = [
  'Administrative', 'Sales', 'Skilled Work', 'Construction',
  'Hospitality', 'IT / Technology', 'Healthcare', 'Other',
]

const EXPERIENCE = [
  { value: 'none', label: 'No experience yet' },
  { value: 'entry', label: 'Entry level' },
  { value: 'experienced', label: 'Experienced' },
  { value: 'returning', label: 'Returning to work' },
]

// Lightweight discovery questions shown at the commitment point, before
// Google sign-in. Answers are stored locally and used to prefill the
// existing applicant registration form — no database writes here.
export default function JobSeekerIntro({ open, onClose }) {
  const { signInWithGoogle } = useAuth()
  const [preference, setPreference] = useState('')
  const [interests, setInterests] = useState([])
  const [experience, setExperience] = useState('')

  if (!open) return null

  function toggleInterest(tag) {
    setInterests(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  async function handleContinue() {
    try {
      localStorage.setItem(INTRO_KEY, JSON.stringify({ preference, interests, experience }))
    } catch {
      // localStorage unavailable — proceed with sign-in anyway
    }
    const { error } = await signInWithGoogle()
    if (error) toast.error(error.message)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700">
              <PixelStar className="h-2.5 w-2.5 text-amber-500" /> Job Seeker Profile
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Before you continue...</h2>
            <p className="mt-1 text-sm text-slate-600">
              Tell us a little about yourself so we can help you discover opportunities that fit.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center text-xl leading-none text-slate-400 hover:text-slate-600">×</button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Employment preference */}
          <div>
            <p className="text-sm font-semibold text-slate-800">What are you looking for?</p>
            <div className="mt-2 grid gap-2">
              {PREFERENCES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPreference(p.value)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    preference === p.value
                      ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-200'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-semibold text-slate-900">{p.label}</span>
                  <span className="block text-xs text-slate-500">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Work interests */}
          <div>
            <p className="text-sm font-semibold text-slate-800">Work interests</p>
            <p className="text-xs text-slate-500">Select any that apply.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTERESTS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleInterest(tag)}
                  className={`rounded-full border px-3 py-2.5 text-xs font-medium transition-colors ${
                    interests.includes(tag)
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Experience */}
          <div>
            <p className="text-sm font-semibold text-slate-800">Experience</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {EXPERIENCE.map(e => (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => setExperience(e.value)}
                  className={`rounded-lg border px-3 py-3 text-xs font-medium transition-colors ${
                    experience === e.value
                      ? 'border-blue-600 bg-blue-50 text-blue-800 ring-1 ring-blue-200'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="text-sm font-bold text-slate-900">Save your opportunities</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Sign in to save your profile, continue applications, and keep track of your opportunities.
          </p>
          <button
            onClick={handleContinue}
            disabled={!preference}
            className="mt-3 min-h-11 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue with Google
          </button>
          {!preference && (
            <p className="mt-2 text-center text-xs text-slate-400">Choose what you're looking for to continue.</p>
          )}
        </div>
      </div>
    </div>
  )
}
