import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RecruitmentHeader from '../../components/recruitment/RecruitmentHeader.jsx'
import { recruitmentService } from '../../services/recruitmentService.js'

function JobCard({ job }) {
  return (
    <li className="border-b border-slate-200 py-6 first:pt-0 last:border-0">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{job.position}</h2>
          <p className="mt-1 font-semibold text-blue-700">{job.company_name}</p>
          <p className="mt-3 max-w-2xl line-clamp-2 text-sm leading-6 text-slate-600">{job.job_description}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
            {(job.place_of_assignment || job.municipality_city || job.province) && <span>{job.place_of_assignment || [job.municipality_city, job.province].filter(Boolean).join(', ')}</span>}
            {job.employment_type && <span>{job.employment_type}</span>}
            {job.work_arrangement && <span>{job.work_arrangement}</span>}
          </div>
        </div>
        <Link to={`/jobs/${job.id}`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-amber-400 px-5 text-sm font-black text-slate-900 shadow-[2px_3px_7px_rgb(15_23_42/0.2)] hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">View job</Link>
      </div>
    </li>
  )
}

export default function JobsPage() {
  const [query, setQuery] = useState('')
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(search = '') {
    setLoading(true); setError('')
    try { setJobs(await recruitmentService.listJobs(search) || []) }
    catch { setError('Published jobs could not be loaded. Check your connection and try again.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <RecruitmentHeader />
      <main className="mx-auto max-w-6xl px-4 py-9 sm:px-6 sm:py-12">
        <section className="border-b-2 border-slate-900 pb-7">
          <h1 className="max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">Find work from verified employers</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Browse jobs published for direct application through Trabaho. Job-fair opportunities remain available through their event pages.</p>
          <form onSubmit={(event) => { event.preventDefault(); load(query) }} className="mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row" role="search">
            <label htmlFor="job-search" className="sr-only">Search jobs</label>
            <input id="job-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search position, employer, or workplace" className="min-h-12 flex-1 rounded-lg border-2 border-slate-900 bg-white px-4 text-sm outline-none placeholder:text-slate-500 focus-visible:ring-4 focus-visible:ring-blue-300" />
            <button className="min-h-12 rounded-lg border-2 border-slate-900 bg-blue-700 px-6 text-sm font-bold text-white shadow-[2px_3px_7px_rgb(15_23_42/0.2)] hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">Search</button>
          </form>
        </section>

        <section className="mt-8" aria-live="polite" aria-busy={loading}>
          {loading && <div className="space-y-5" aria-label="Loading jobs">{[1, 2, 3].map(item => <div key={item} className="h-32 animate-pulse rounded-xl bg-slate-200" />)}</div>}
          {!loading && error && <div role="alert" className="rounded-xl border-2 border-red-800 bg-red-50 p-6"><h2 className="font-bold text-red-950">Jobs are unavailable</h2><p className="mt-1 text-sm text-red-900">{error}</p><button onClick={() => load(query)} className="mt-4 min-h-11 rounded-lg border-2 border-red-900 bg-white px-4 text-sm font-bold">Try again</button></div>}
          {!loading && !error && jobs.length === 0 && <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-xl font-bold">No published jobs found</h2><p className="mt-2 text-sm text-slate-600">Try a broader search or check again when employers publish new openings.</p></div>}
          {!loading && !error && jobs.length > 0 && <><p className="mb-5 text-sm font-semibold text-slate-600">{jobs.length} open job{jobs.length === 1 ? '' : 's'}</p><ul className="rounded-2xl border-2 border-slate-900 bg-white p-5 shadow-[2px_4px_12px_rgb(15_23_42/0.12)] sm:p-7">{jobs.map(job => <JobCard key={job.id} job={job} />)}</ul></>}
        </section>
      </main>
    </div>
  )
}
