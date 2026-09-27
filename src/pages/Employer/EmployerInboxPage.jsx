import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { recruitmentService } from '../../services/recruitmentService.js'

export default function EmployerInboxPage() {
  const { vacancyId } = useParams()
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setApplications(await recruitmentService.listEmployerApplications(vacancyId || null) || []) }
    catch (err) { setError(err.message || 'The application inbox could not be loaded.') }
    finally { setLoading(false) }
  }, [vacancyId])
  useEffect(() => { load() }, [load])

  const title = useMemo(() => vacancyId && applications[0]?.position ? applications[0].position : 'Application inbox', [applications, vacancyId])

  async function changeStatus(applicationId, status) {
    setWorkingId(applicationId)
    try { await recruitmentService.updateApplicationStatus(applicationId, status); toast.success(`Application ${status}.`); await load() }
    catch (err) { toast.error(err.message) }
    finally { setWorkingId(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b-2 border-slate-900 pb-6 sm:flex-row sm:items-end">
        <div><Link to={vacancyId ? '/employer/inbox' : '/employer/dashboard'} className="inline-flex min-h-11 items-center text-sm font-bold text-violet-700 underline-offset-4 hover:underline">{vacancyId ? 'All applications' : 'Employer dashboard'}</Link><h1 className="text-3xl font-black tracking-tight text-slate-900">{title}</h1><p className="mt-2 text-sm text-slate-600">Formal online and event applications for your vacancies. Event interest is not an application.</p></div>
        {!vacancyId && <Link to="/employer/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-slate-900 bg-white px-4 text-sm font-bold">Manage vacancies</Link>}
      </div>
      <section aria-live="polite" aria-busy={loading}>
        {loading && <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />}
        {!loading && error && <div role="alert" className="rounded-xl border-2 border-red-800 bg-red-50 p-6"><h2 className="font-bold text-red-950">Inbox unavailable</h2><p className="mt-1 text-sm text-red-900">{error}</p><button onClick={load} className="mt-4 min-h-11 rounded-lg border-2 border-red-900 bg-white px-4 text-sm font-bold">Try again</button></div>}
        {!loading && !error && applications.length === 0 && <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-xl font-bold">No formal applications yet</h2><p className="mt-2 text-sm text-slate-600">New online and explicit event applications will appear here.</p></div>}
        {!loading && !error && applications.length > 0 && <ul className="space-y-3">{applications.map(application => (
          <li key={application.application_id} className="rounded-xl border-2 border-slate-900 bg-white p-5 shadow-[2px_3px_9px_rgb(15_23_42/0.1)]">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0"><h2 className="text-lg font-bold">{application.first_name} {application.last_name}</h2>{!vacancyId && <Link to={`/employer/inbox/${application.vacancy_definition_id}`} className="font-semibold text-violet-700 underline-offset-4 hover:underline">{application.position}</Link>}<p className="mt-2 text-xs text-slate-500">Applied {new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(application.applied_at))}</p><p className="mt-1 text-xs font-semibold text-slate-600">{application.channel === 'event' ? `Event${application.event_name ? ` - ${application.event_name}` : ''}` : 'Online'}</p></div>
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold capitalize text-slate-700">{application.application_status}</span>{application.application_status === 'applied' && <button disabled={workingId === application.application_id} onClick={() => changeStatus(application.application_id, 'shortlisted')} className="min-h-11 rounded-lg border-2 border-slate-900 bg-amber-400 px-4 text-xs font-bold disabled:opacity-50">Shortlist</button>}{['applied', 'shortlisted'].includes(application.application_status) && <button disabled={workingId === application.application_id} onClick={() => changeStatus(application.application_id, 'rejected')} className="min-h-11 rounded-lg border-2 border-red-900 bg-white px-4 text-xs font-bold text-red-800 disabled:opacity-50">Reject</button>}</div>
            </div>
          </li>
        ))}</ul>}
      </section>
    </div>
  )
}
