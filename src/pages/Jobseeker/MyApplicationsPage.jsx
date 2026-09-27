import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import RecruitmentHeader from '../../components/recruitment/RecruitmentHeader.jsx'
import { recruitmentService } from '../../services/recruitmentService.js'

const statusStyle = {
  applied: 'bg-blue-100 text-blue-900',
  shortlisted: 'bg-amber-100 text-amber-900',
  rejected: 'bg-red-100 text-red-900',
  withdrawn: 'bg-slate-200 text-slate-700',
}

export default function MyApplicationsPage() {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setApplications(await recruitmentService.listMyApplications() || []) }
    catch { setError('Your applications could not be loaded. Please try again.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function withdraw(application) {
    if (!window.confirm(`Withdraw your application for ${application.position}?`)) return
    setWorkingId(application.application_id)
    try { await recruitmentService.withdrawApplication(application.application_id); toast.success('Application withdrawn.'); await load() }
    catch (err) { toast.error(err.message) }
    finally { setWorkingId(null) }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <RecruitmentHeader />
      <main className="mx-auto max-w-5xl px-4 py-9 sm:px-6 sm:py-12">
        <div className="flex flex-col justify-between gap-4 border-b-2 border-slate-900 pb-7 sm:flex-row sm:items-end">
          <div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">My applications</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Formal online and event applications appear together. Event interest alone does not appear here.</p></div>
          <Link to="/jobs" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">Browse jobs</Link>
        </div>
        <section className="mt-7" aria-live="polite" aria-busy={loading}>
          {loading && <div className="h-44 animate-pulse rounded-2xl bg-slate-200" />}
          {!loading && error && <div role="alert" className="rounded-xl border-2 border-red-800 bg-red-50 p-6"><p className="font-bold text-red-950">{error}</p><button onClick={load} className="mt-4 min-h-11 rounded-lg border-2 border-red-900 bg-white px-4 text-sm font-bold">Try again</button></div>}
          {!loading && !error && applications.length === 0 && <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-xl font-bold">No formal applications yet</h2><p className="mt-2 text-sm text-slate-600">Apply from a published job or use the explicit Apply action for an event opportunity.</p></div>}
          {!loading && !error && applications.length > 0 && <ul className="space-y-3">{applications.map(application => (
            <li key={application.application_id} className="rounded-xl border-2 border-slate-900 bg-white p-5 shadow-[2px_3px_9px_rgb(15_23_42/0.1)]">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0"><h2 className="text-lg font-bold">{application.position}</h2><p className="font-semibold text-blue-700">{application.company_name}</p><p className="mt-2 text-xs text-slate-500">Submitted {new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(application.applied_at))}</p><p className="mt-1 text-xs font-semibold text-slate-600">{application.channel === 'event' ? `Event${application.event_name ? ` - ${application.event_name}` : ''}` : 'Online'}</p></div>
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize ${statusStyle[application.application_status] || 'bg-slate-100 text-slate-700'}`}>{application.application_status}</span>{application.can_withdraw && <button onClick={() => withdraw(application)} disabled={workingId === application.application_id} className="min-h-11 rounded-lg border-2 border-slate-900 bg-white px-4 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">{workingId === application.application_id ? 'Withdrawing...' : 'Withdraw'}</button>}</div>
              </div>
            </li>
          ))}</ul>}
        </section>
      </main>
    </div>
  )
}
