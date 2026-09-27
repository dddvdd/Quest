import { useEffect, useMemo, useRef, useState } from 'react'
import { INTELLIGENCE_SECTIONS, coverageNote, metricView } from '../../domain/employmentIntelligenceDashboard.js'
import { getMetricDefinition } from '../../domain/employmentIntelligenceMetrics.js'
import { validateMetricRequest } from '../../domain/employmentIntelligence.js'
import { createIntelligenceDashboardLoader } from '../../services/employmentIntelligenceDashboardService.js'
import { eventService } from '../../services/eventService'
import { MetricCard, MetricGrid, MetricState, DashboardSkeleton, DashboardError, BreakdownChart, SkillsTable, ApplicationSeries, PANEL, BUTTON } from '../../components/intelligence/IntelligencePanels.jsx'

const INPUT='min-h-[44px] min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300'
function initialFilters() {
  const today=new Date()
  return {start:today.getUTCFullYear()+'-01-01',end:new Date(today.getTime()+86400000).toISOString().slice(0,10),period:'month',eventId:''}
}

export default function EmploymentIntelligencePage() {
  const [sectionId,setSectionId]=useState('overview')
  const [filters,setFilters]=useState(initialFilters)
  const [draft,setDraft]=useState(()=>({start:filters.start,end:filters.end,period:filters.period}))
  const [filterError,setFilterError]=useState('')
  const [groups,setGroups]=useState({})
  const [revision,setRevision]=useState(0)
  const [events,setEvents]=useState({status:'idle',rows:[]})
  const loader=useRef(null)
  if (!loader.current) loader.current=createIntelligenceDashboardLoader()
  const eventsPromise=useRef(null)
  const section=INTELLIGENCE_SECTIONS.find(item=>item.id===sectionId)
  const plan=useMemo(()=>loader.current.plan(sectionId,filters),[sectionId,filters])
  useEffect(()=>{
    let alive=true
    setGroups(Object.fromEntries(plan.map(request=>[request.key,{status:'loading'}])))
    for (const request of plan) {
      loader.current.load(request).then(data=>{
        if (alive) setGroups(previous=>({...previous,[request.key]:{status:'ready',data}}))
      }).catch(()=>{
        if (alive) setGroups(previous=>({...previous,[request.key]:{status:'error'}}))
      })
    }
    return ()=>{alive=false}
  },[plan,revision])

  useEffect(()=>{
    if (sectionId!=='events') return
    let alive=true
    setEvents({status:'loading',rows:[]})
    if (!eventsPromise.current) eventsPromise.current=eventService.listForVacancyFilter()
    eventsPromise.current.then(rows=>{
      const safe=rows.map(event=>({id:event.id,name:event.event_name,date:event.event_date}))
      if (alive) setEvents({status:'ready',rows:safe})
    }).catch(()=>{
      eventsPromise.current=null
      if (alive) setEvents({status:'error',rows:[]})
    })
    return ()=>{alive=false}
  },[sectionId,revision])

  function applyFilters(event) {
    event.preventDefault()
    try {
      validateMetricRequest(['applications_submitted'],{start:draft.start,end:draft.end,period:draft.period})
      setFilters(previous=>({...previous,...draft}))
      setFilterError('')
    } catch {setFilterError('Choose valid start and end dates. The end date must be after the start date.')}
  }
  function retry(request) {loader.current.invalidate(request);setRevision(previous=>previous+1)}
  function renderGroup(request) {
    const group=groups[request.key]
    if (!group || group.status==='loading') return <DashboardSkeleton />
    if (group.status==='error') return <DashboardError retry={()=>retry(request)} />
    const response=group.data
    if (request.quality) return <>
      <p className="text-sm text-slate-600">Coverage describes structured records, not the absence of skills, career goals, requirements or employment.</p>
      <h3 className="font-semibold text-slate-900">Current structured-data snapshot</h3>
      <MetricGrid ids={response.cells.filter(cell=>getMetricDefinition(cell.metric_id).date_basis==='current_snapshot').map(cell=>cell.metric_id)} response={response} />
      <h3 className="font-semibold text-slate-900">Application cohort completeness · {filters.start} to before {filters.end}</h3>
      <MetricGrid ids={response.cells.filter(cell=>getMetricDefinition(cell.metric_id).date_basis!=='current_snapshot').map(cell=>cell.metric_id)} response={response} />
    </>
    if (request.key==='series') return <ApplicationSeries response={response} />
    if (request.options.dimension) {
      if (request.key==='skill') return <>
        <SkillsTable response={response} />
        <div className="grid gap-4 lg:grid-cols-2">{request.ids.filter(id=>id!=='skill_gap').map(id=><BreakdownChart key={id} id={id} response={response} />)}</div>
      </>
      return <div className="grid gap-4 lg:grid-cols-2">{request.ids.map(id=><BreakdownChart key={id} id={id} response={response} />)}</div>
    }
    if (sectionId==='funnel' && request.key==='flows') return <>
      <p className="text-sm leading-relaxed text-slate-600">Activity counts use their own submission, interview-result and hire dates. Conversion rates below use the submitted-application cohort and currently recorded linked results. Interest is separate from a formal application; interview records are separate from completed-interview lifecycle data.</p>
      <MetricGrid ids={request.ids.filter(id=>getMetricDefinition(id).measure==='count'&&id!=='candidate_interest_count')} response={response} />
      <MetricCard id="candidate_interest_count" cell={response.cells.find(cell=>cell.metric_id==='candidate_interest_count')} />
      <h3 className="font-semibold text-slate-900">Application cohort conversions</h3>
      <p className="text-sm text-slate-600">Observed using current records. Cohorts are not guaranteed to have completed follow-up; unlinked interview records are excluded.</p>
      <MetricGrid ids={request.ids.filter(id=>getMetricDefinition(id).measure==='rate')} response={response} />
    </>
    if (sectionId==='events') {
      const selected=events.rows.find(event=>event.id===filters.eventId)
      return <>
        <div className={PANEL+' overflow-x-auto'}><table className="w-full text-left text-sm">
          <caption className="mb-3 text-left font-semibold text-slate-900">Selected event activity</caption>
          <thead><tr className="border-b text-slate-600">{['Event scope','Date','Distinct persons','Applications','Interview records','Confirmed hires'].map(text=><th scope="col" key={text} className="px-2 py-3">{text}</th>)}</tr></thead>
          <tbody><tr className="text-slate-800"><th scope="row" className="px-2 py-3 font-medium">{selected?.name??'All events in selected dates'}</th><td className="px-2 py-3">{selected?.date??filters.start+' to before '+filters.end}</td>
            {['event_unique_participants','event_application_count','event_interview_count','event_hire_count'].map(id=><td className="px-2 py-3" key={id}>{metricView(id,response.cells.find(cell=>cell.metric_id===id)).display}</td>)}
          </tr></tbody>
        </table></div>
        <MetricGrid ids={request.ids} response={response} />
      </>
    }
    return <MetricGrid ids={request.ids} response={response} />
  }
  const snapshots=groups.snapshots?.data
  const note=sectionId==='supply' ? coverageNote('occupation_preference_coverage',snapshots)
    : sectionId==='demand' ? coverageNote('vacancy_occupation_coverage',snapshots)
      : sectionId==='skills' ? coverageNote('skill_coverage',snapshots)+' '+coverageNote('vacancy_required_skill_coverage',snapshots) : null
  return <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="border-b border-slate-200 pb-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-role-admin">Admin operations</p>
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Employment Intelligence</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">Figures reflect records currently captured in the PESO employment platform and should not be interpreted as complete provincial labor-market estimates.</p>
    </header>
    <form onSubmit={applyFilters} className={PANEL+' space-y-3'} aria-label="Date filters">
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2 text-sm font-medium text-slate-700">Start date<input type="date" className={INPUT} required value={draft.start} onChange={event=>setDraft(previous=>({...previous,start:event.target.value}))} /></label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">End date (exclusive)<input type="date" className={INPUT} required value={draft.end} onChange={event=>setDraft(previous=>({...previous,end:event.target.value}))} /></label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">Period grouping<select aria-label="Period grouping" className={INPUT} value={draft.period} onChange={event=>setDraft(previous=>({...previous,period:event.target.value}))}>
          <option value="day">Daily</option><option value="month">Monthly</option><option value="year">Yearly</option>
        </select></label>
        <button className={BUTTON} type="submit">Apply dates</button>
      </div>
      <p className="text-xs leading-relaxed text-slate-600">Flow metrics: {filters.start} to before {filters.end}. Current snapshots stay system-wide and do not change with dates. Period grouping applies to the application time series.</p>
      {filterError&&<p role="alert" className="text-sm text-red-700">{filterError}</p>}
    </form>
    <nav aria-label="Intelligence sections" className="flex flex-wrap gap-2">
      {INTELLIGENCE_SECTIONS.map(item=><button type="button" key={item.id} aria-pressed={item.id===sectionId} onClick={()=>setSectionId(item.id)}
        className={item.id===sectionId?'min-h-[44px] rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300':BUTTON}>{item.label}</button>)}
    </nav>
    <section aria-labelledby="intelligence-section-title" className="min-w-0 space-y-5">
      <h2 id="intelligence-section-title" className="text-xl font-bold text-slate-900">{section.label}</h2>
      <p className="text-sm text-slate-600">{section.snapshots||section.breakdowns||section.quality ? 'Current snapshot data is labeled separately from dated activity.' : 'Dated operational activity within the selected range.'}</p>
      {note&&<p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">{note}</p>}
      {sectionId==='events'&&<div className={PANEL}>
        <label className="grid max-w-xl gap-2 text-sm font-semibold text-slate-700">Event<select aria-label="Event" className={INPUT} value={filters.eventId} disabled={events.status!=='ready'} onChange={event=>setFilters(previous=>({...previous,eventId:event.target.value}))}>
          <option value="">All events</option>{events.rows.map(event=><option value={event.id} key={event.id}>{event.name} · {event.date}</option>)}
        </select></label>
        <p className="mt-2 text-sm text-slate-600">Event-date range applies. Registration, recorded attendance and outcomes are separate; no event success score is calculated.</p>
        {events.status==='error'&&<div role="alert" className="mt-3"><p className="text-sm text-slate-600">Event choices could not be loaded.</p><button className={BUTTON+' mt-2'} onClick={()=>setRevision(previous=>previous+1)}>Retry event choices</button></div>}
      </div>}
      {plan.map(request=><div className="min-w-0 space-y-4" key={request.key} aria-busy={groups[request.key]?.status==='loading'} aria-live="polite">{renderGroup(request)}</div>)}
      <p className="text-xs text-slate-600">Observed on {Object.values(groups).find(group=>group.data)?.data.observed_on??'—'} (UTC). Historical values can change when stored records are corrected.</p>
    </section>
    <aside className={PANEL} aria-label="Reporting availability">
      <h2 className="font-semibold text-slate-900">Reporting availability</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {['active_jobseekers','interviews_completed','special_sector_count','program_reach','jobseekers_by_residence','vacancy_salary_average'].map(id=><div key={id}>
          <h3 className="text-sm font-semibold text-slate-700">{getMetricDefinition(id).name}</h3><MetricState view={metricView(id)} />
        </div>)}
      </div>
      <p className="mt-4 text-sm text-slate-600">Sensitive aggregate reporting is awaiting disclosure-policy approval. Geographic intelligence needs validated location normalization. Program outcomes require verified participation records. Salary summaries require approved comparability methods.</p>
    </aside>
  </div>
}
