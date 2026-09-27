import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PixelArrow, PixelStar } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'
import { useParticipant, useJobseekerProfile } from '../../hooks/jobseeker/useJobseeker'
import { participantService } from '../../services/participantService'
import { referenceService } from '../../services/referenceService'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/errors'

const inputCls = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const PROFICIENCY = ['beginner', 'intermediate', 'advanced', 'expert']

async function loadJobseekerSkills(profileId) {
  return unwrap(
    await supabase
      .from('jobseeker_skills')
      .select('id, skill_id, proficiency_level, years_experience, skills(id, canonical_name, skill_type)')
      .eq('jobseeker_profile_id', profileId)
      .order('created_at'),
    'Could not load skills'
  )
}

async function addJobseekerSkill(profileId, skillId, proficiency, years) {
  return unwrap(
    await supabase
      .from('jobseeker_skills')
      .insert({
        jobseeker_profile_id: profileId,
        skill_id: skillId,
        proficiency_level: proficiency || null,
        years_experience: years ? Number(years) : null,
        source: 'user',
        verification_status: 'unverified',
      })
      .select('id, skill_id, proficiency_level, years_experience, skills(id, canonical_name, skill_type)')
      .single(),
    'Could not add skill'
  )
}

async function removeJobseekerSkill(rowId) {
  return unwrap(
    await supabase.from('jobseeker_skills').delete().eq('id', rowId),
    'Could not remove skill'
  )
}

export default function SkillSetPage() {
  const { participant, loading: participantLoading } = useParticipant()
  const { profile, loading: profileLoading } = useJobseekerProfile(participant?.id)
  const [rows, setRows] = useState([])
  const [skills, setSkills] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [proficiency, setProficiency] = useState('')
  const [years, setYears] = useState('')
  const [saving, setSaving] = useState(false)
  const profileId = participant?.id

  useEffect(() => {
    if (profile) setSkills(profile.skills || '')
  }, [profile])

  useEffect(() => {
    if (!profileId) return
    loadJobseekerSkills(profileId).then(setRows).catch(() => setRows([]))
  }, [profileId])

  useEffect(() => {
    if (!searchOpen || query.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      referenceService.listSkills(query).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, searchOpen])

  const existingIds = new Set(rows.map(r => r.skill_id))
  const available = results.filter(s => !existingIds.has(s.id))

  const addSkill = useCallback(async (skill) => {
    if (!profileId) return
    setSaving(true)
    try {
      const row = await addJobseekerSkill(profileId, skill.id, proficiency, years)
      setRows(prev => [...prev, row])
      setQuery(''); setResults([]); setProficiency(''); setYears('')
      toast.success(`Added ${skill.canonical_name}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }, [profileId, proficiency, years])

  const removeSkill = useCallback(async (rowId, name) => {
    if (!profileId) return
    setSaving(true)
    try {
      await removeJobseekerSkill(rowId)
      setRows(prev => prev.filter(r => r.id !== rowId))
      toast.success(`Removed ${name}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }, [profileId])

  async function saveLegacySkills(event) {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    try {
      await participantService.saveJobseekerProfile({ ...profile, skills: skills.trim() || null })
      toast.success('Skill set updated')
    } catch (error) {
      toast.error(error.message || 'Could not save skill set')
    } finally {
      setSaving(false)
    }
  }

  if (participantLoading || profileLoading) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading your skill set...</main>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/profile" className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            <PixelArrow className="h-4 w-4 rotate-180" /> Profile
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700"><PixelStar className="h-2.5 w-2.5 text-amber-500" /> Job Seeker Profile</p>
            <h1 className="mt-2 text-xl font-bold text-slate-900">Skill Set</h1>
            <p className="mt-1 text-sm text-slate-500">Add canonical skills for better job matching.</p>
          </div>
        </div>

        {/* Structured skills */}
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <h2 className="text-sm font-bold text-slate-900">Structured Skills</h2>
          <p className="mt-1 text-xs text-slate-500">Select skills from the canonical list for machine-readable matching.</p>

          {rows.length > 0 && (
            <div className="mt-4 space-y-2">
              {rows.map(row => (
                <div key={row.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{row.skills?.canonical_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-500">
                      {row.proficiency_level || 'No proficiency set'}{row.years_experience != null ? ` · ${row.years_experience} yr${row.years_experience === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <button onClick={() => removeSkill(row.id, row.skills?.canonical_name)} disabled={saving} className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Remove</button>
                </div>
              ))}
            </div>
          )}

          {/* Add skill */}
          <div className="mt-4 rounded-lg border-2 border-dashed border-slate-300 p-4">
            <button onClick={() => setSearchOpen(!searchOpen)} className="w-full text-left text-sm font-semibold text-blue-700 hover:text-blue-800">
              + Add a skill
            </button>
            {searchOpen && (
              <div className="mt-3 space-y-3">
                <div className="relative">
                  <input
                    className={inputCls}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search skills (e.g. Excel, welding...)"
                    autoFocus
                  />
                  {available.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {available.map(skill => (
                        <li key={skill.id}>
                          <button
                            type="button"
                            onClick={() => { setQuery(skill.canonical_name); setResults([]) }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <span className="font-medium text-slate-800">{skill.canonical_name}</span>
                            <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{skill.skill_type}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {query.length >= 2 && results.length === 0 && (
                  <p className="text-xs text-amber-600">No matching skills found. Try a different search term.</p>
                )}
                {query && available.find(s => s.canonical_name === query) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">Proficiency</label>
                      <select className={inputCls + ' text-sm'} value={proficiency} onChange={(e) => setProficiency(e.target.value)}>
                        <option value="">Select</option>
                        {PROFICIENCY.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">Years of Experience</label>
                      <input type="number" min="0" max="50" className={inputCls + ' text-sm'} value={years} onChange={(e) => setYears(e.target.value)} placeholder="Optional" />
                    </div>
                  </div>
                )}
                {query && available.find(s => s.canonical_name === query) && (
                  <button
                    onClick={() => {
                      const skill = available.find(s => s.canonical_name === query)
                      if (skill) addSkill(skill)
                    }}
                    disabled={saving}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {saving ? 'Adding...' : 'Add Skill'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Legacy text skills */}
        <form onSubmit={saveLegacySkills} className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <label className="block text-sm font-medium text-slate-700">
            Skills (text)
            <textarea value={skills} onChange={(event) => setSkills(event.target.value)} rows={4} className={`${inputCls} mt-1`} placeholder="Free-form skills description" />
          </label>
          <p className="mt-2 text-xs text-slate-500">Kept for human readability. Use structured skills above for matching.</p>
          <div className="mt-5 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
