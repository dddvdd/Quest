import { useEffect, useState } from 'react'
import { useParticipant, useJobseekerProfile } from '../../hooks/jobseeker/useJobseeker'
import { Link, NavLink } from 'react-router-dom'
import { PixelStar, PixelUser, PixelArrow, PixelBriefcase, PixelPin, PixelCal } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'
import { useAuth } from '../../contexts/AuthContext'
import { workExperienceService } from '../../services/workExperienceService'

function formatTotalWorkExperience(items) {
  const today = new Date()
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const totalMonths = items.reduce((total, item) => {
    if (!item.start_date) return total
    const start = new Date(`${item.start_date.slice(0, 7)}-01T00:00:00`)
    const end = item.is_current || !item.end_date
      ? currentMonth
      : new Date(`${item.end_date.slice(0, 7)}-01T00:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return total
    return total + ((end.getFullYear() - start.getFullYear()) * 12) + end.getMonth() - start.getMonth() + 1
  }, 0)
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  return `${years ? `${years} year${years === 1 ? '' : 's'}` : ''}${years && months ? ' and ' : ''}${months ? `${months} month${months === 1 ? '' : 's'}` : ''}` || '0 months'
}

function formatWorkExperienceDate(value) {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// My Job Seeker Profile — read view of the reusable participant profile
// with a clear "Edit Profile" entry into the existing /register editor.
export default function ProfilePage() {
  const { user } = useAuth()
  const { participant, loading: participantLoading } = useParticipant()
  const { profile, loading: profileLoading } = useJobseekerProfile(participant?.id)
  const [workExperiences, setWorkExperiences] = useState([])
  const missing = !participantLoading && !participant
  const loading = participantLoading || profileLoading

  useEffect(() => {
    if (!participant) return
    workExperienceService.listMine().then(setWorkExperiences).catch(() => setWorkExperiences([]))
  }, [participant])

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading your profile…</main>

  if (missing) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <PixelStar className="mx-auto h-4 w-4 text-amber-400" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">No Profile Yet</h1>
          <p className="mt-2 text-sm text-slate-500">Build your reusable Job Seeker Profile to start joining Quests.</p>
          <Link to="/register" className="mt-6 inline-block rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            Build My Profile
          </Link>
        </section>
      </main>
    )
  }

  const name = profile
    ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')
    : user?.user_metadata?.name || user?.email

  const Row = ({ label, value }) => (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400 sm:w-52">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value || '—'}</dd>
    </div>
  )

  const address = [profile?.barangay, profile?.municipality_city, profile?.province].filter(Boolean).join(', ')
  const latestWorkExperience = [...workExperiences].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
    return (b.start_date || '').localeCompare(a.start_date || '')
  })[0]
  const latestWorkExperienceLabel = latestWorkExperience
    ? `${latestWorkExperience.employer_name || 'Unknown company'} (${latestWorkExperience.position_title || 'Position not specified'}) | ${formatWorkExperienceDate(latestWorkExperience.start_date) || 'Start date not specified'}-${latestWorkExperience.is_current ? 'Present' : formatWorkExperienceDate(latestWorkExperience.end_date) || 'End date not specified'}`
    : ''
  const jobSeekerClassification = profile?.first_time_jobseeker
    ? 'First-time Jobseeker'
    : profile?.returning_ofw
      ? 'Returning OFW'
      : profile?.returning_worker
        ? 'Returning Worker'
        : profile?.experienced_worker
          ? 'Experienced Worker'
          : 'Not specified'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-blue-700">
            <PixelArrow className="h-3 w-3 rotate-180" /> Quest Board
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/pass" className="text-xs font-semibold text-slate-600 hover:text-slate-900">My Pass</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <div>
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700"><PixelStar className="h-2.5 w-2.5 text-amber-500" /> Job Seeker Profile</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">My Job Seeker Profile</h1>
            <p className="mt-1 text-sm text-slate-600">Your reusable profile — kept the same across every Quest you join.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
          <aside className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 lg:sticky lg:top-24">
            <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">Profile menu</p>
            <nav className="space-y-1" aria-label="Profile menu">
              <NavLink to="/jobseeker/recommendations" className={({ isActive }) => `group flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-blue-700 font-bold text-white' : 'font-semibold text-slate-700 hover:bg-blue-700 hover:text-white focus-visible:bg-blue-700 focus-visible:text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300`}>
                {({ isActive }) => <><PixelStar className={`h-3 w-3 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-300 group-focus-visible:text-amber-300'}`} /> Recommended Jobs</>}
              </NavLink>
              <NavLink to="/register" className={({ isActive }) => `group flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-blue-700 font-bold text-white' : 'font-semibold text-slate-700 hover:bg-blue-700 hover:text-white focus-visible:bg-blue-700 focus-visible:text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300`}>
                {({ isActive }) => <><PixelUser className={`h-3 w-3 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-300 group-focus-visible:text-amber-300'}`} /> Profile</>}
              </NavLink>
              <NavLink to="/jobseeker/work-experience" className={({ isActive }) => `group flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-blue-700 font-bold text-white' : 'font-semibold text-slate-700 hover:bg-blue-700 hover:text-white focus-visible:bg-blue-700 focus-visible:text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300`}>
                {({ isActive }) => <><PixelBriefcase className={`h-3 w-3 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-300 group-focus-visible:text-amber-300'}`} /> Work Experience</>}
              </NavLink>
              <NavLink to="/jobseeker/skill-set" className={({ isActive }) => `group flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-blue-700 font-bold text-white' : 'font-semibold text-slate-700 hover:bg-blue-700 hover:text-white focus-visible:bg-blue-700 focus-visible:text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300`}>
                {({ isActive }) => <><PixelStar className={`h-3 w-3 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-300 group-focus-visible:text-amber-300'}`} /> Skill Set</>}
              </NavLink>
              <NavLink to="/jobseeker/education" className={({ isActive }) => `group flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-blue-700 font-bold text-white' : 'font-semibold text-slate-700 hover:bg-blue-700 hover:text-white focus-visible:bg-blue-700 focus-visible:text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300`}>
                {({ isActive }) => <><PixelBriefcase className={`h-3 w-3 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-300 group-focus-visible:text-amber-300'}`} /> Education</>}
              </NavLink>
              <NavLink to="/jobseeker/certifications" className={({ isActive }) => `group flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-blue-700 font-bold text-white' : 'font-semibold text-slate-700 hover:bg-blue-700 hover:text-white focus-visible:bg-blue-700 focus-visible:text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300`}>
                {({ isActive }) => <><PixelStar className={`h-3 w-3 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-300 group-focus-visible:text-amber-300'}`} /> Certifications</>}
              </NavLink>
              <NavLink to="/jobseeker/languages" className={({ isActive }) => `group flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-blue-700 font-bold text-white' : 'font-semibold text-slate-700 hover:bg-blue-700 hover:text-white focus-visible:bg-blue-700 focus-visible:text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300`}>
                {({ isActive }) => <><PixelBriefcase className={`h-3 w-3 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-300 group-focus-visible:text-amber-300'}`} /> Languages</>}
              </NavLink>
              <NavLink to="/jobseeker/preferences" className={({ isActive }) => `group flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-blue-700 font-bold text-white' : 'font-semibold text-slate-700 hover:bg-blue-700 hover:text-white focus-visible:bg-blue-700 focus-visible:text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300`}>
                {({ isActive }) => <><PixelStar className={`h-3 w-3 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-300 group-focus-visible:text-amber-300'}`} /> Job Preferences</>}
              </NavLink>
              <NavLink to="/pass" className={({ isActive }) => `group flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-blue-700 font-bold text-white' : 'font-semibold text-slate-700 hover:bg-blue-700 hover:text-white focus-visible:bg-blue-700 focus-visible:text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300`}>
                {({ isActive }) => <><PixelCal className={`h-3 w-3 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-300 group-focus-visible:text-amber-300'}`} /> View My Pass</>}
              </NavLink>
            </nav>
          </aside>

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <header className="bg-blue-700 px-6 py-5 text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-blue-100">Job Seeker</p>
                <h2 className="mt-1 text-xl font-bold">{name}</h2>
                <p className="mt-1 font-mono text-xs font-semibold text-blue-100">{profile?.email || user?.email}</p>
              </div>
              <span className="rounded-full bg-white/20 px-3 py-1 font-mono text-xs font-bold text-white">{participant.public_pass_id}</span>
            </div>
          </header>

          <dl className="p-6">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700"><PixelPin className="h-3 w-3" /> Personal & Contact</p>
            <Row label="Full name" value={`${profile?.first_name || ''} ${profile?.middle_name || ''} ${profile?.last_name || ''}`.replace(/\s+/g, ' ').trim()} />
            <Row label="Birthdate" value={profile?.birthdate} />
            <Row label="Sex" value={profile?.sex} />
            <Row label="Civil status" value={profile?.civil_status} />
            <Row label="Address" value={address} />
            <Row label="Contact number" value={profile?.contact_no} />
            <Row label="Email" value={profile?.email} />

            <p className="mb-2 mt-6 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700"><PixelBriefcase className="h-3 w-3" /> Work & Skills</p>
            <Row label="Employment status" value={profile?.current_employment_status} />
            <Row label="Years of experience" value={formatTotalWorkExperience(workExperiences)} />
            <Row label="Previous occupation" value={latestWorkExperienceLabel} />
            <Row label="Skills" value={profile?.skills} />
            <Row label="Desired occupation" value={profile?.desired_occupation ? `${profile.desired_occupation}${profile.desired_industry ? ` (${profile.desired_industry})` : ''}` : ''} />
            <Row label="Desired salary" value={profile?.desired_salary} />
            <Row label="Willing to relocate" value={profile?.willing_to_relocate ? 'Yes' : 'No'} />

            <p className="mb-2 mt-6 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700"><PixelStar className="h-2.5 w-2.5" /> Classification & Education</p>
            <Row label="Job seeker classification" value={jobSeekerClassification} />
            <Row label="Interested in skills training" value={profile?.interested_in_skills_training ? `Yes${profile.preferred_training_program ? ` — ${profile.preferred_training_program}` : ''}` : 'No'} />
            <Row label="Person with disability" value={profile?.has_disability ? `Yes${profile.disability_type ? ` — ${profile.disability_type}` : ''}` : 'No'} />
            <Row label="Education" value={profile?.highest_educational_attainment || 'Select educational attainment'} />
            <Row label="Employment preference" value={profile?.employment_preference || 'Local'} />

            {profile?.resume_path && (
              <div className="mt-6 rounded-xl bg-slate-50 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500"><PixelCal className="h-3 w-3" /> Resume on file</p>
                <p className="mt-1 text-sm text-emerald-700">✓ A resume is attached to your profile.</p>
              </div>
            )}
          </dl>

          </section>
        </div>
      </main>
    </div>
  )
}
