import { getMetricDefinition } from './employmentIntelligenceMetrics.js'
import { validateMetricRequest } from './employmentIntelligence.js'

export const INTELLIGENCE_SECTIONS = [
  { id: 'overview', label: 'Overview', snapshots: ['unique_jobseekers','active_vacancies','active_approved_employers'],
    flows: ['event_vacancy_offerings','applications_submitted','interviews_recorded','hires_recorded'] },
  { id: 'supply', label: 'Jobseeker Supply', snapshots: ['unique_jobseekers','occupation_preference_coverage','skill_coverage'],
    breakdowns: [
      ['occupation',['jobseekers_by_preferred_occupation','vacancies_by_occupation']],
      ['industry',['jobseekers_by_preferred_industry','vacancies_by_industry']],
      ['employment_type',['jobseekers_by_employment_type']],
      ['work_arrangement',['jobseekers_by_work_arrangement']],
    ] },
  { id: 'demand', label: 'Vacancy Demand', snapshots: ['unique_vacancy_definitions','active_vacancies','vacancy_occupation_coverage'],
    flows: ['event_vacancy_offerings'], breakdowns: [
      ['occupation',['vacancies_by_occupation']],['industry',['vacancies_by_industry']],
      ['employment_type',['vacancies_by_employment_type']],['work_arrangement',['vacancies_by_work_arrangement']],
    ] },
  { id: 'skills', label: 'Skills Supply & Demand', snapshots: ['skill_coverage','vacancy_required_skill_coverage'],
    breakdowns: [['skill',['skills_supply','skills_demand_required','skills_demand_preferred','skill_gap']]] },
  { id: 'funnel', label: 'Application Funnel',
    flows: ['applications_submitted','interviews_recorded','hires_recorded','candidate_interest_count','application_to_recorded_interview_rate','application_to_confirmed_hire_rate','recorded_interview_to_confirmed_hire_rate'],
    series: ['applications_submitted'] },
  { id: 'events', label: 'Event Performance', eventFilter: true,
    flows: ['event_participation_count','event_unique_participants','event_vacancy_offerings','event_application_count','event_interview_count','event_hire_count','employer_participation_count','event_employers_checked_in'] },
  { id: 'employers', label: 'Employer Activity', snapshots: ['active_approved_employers','employers_with_vacancies'],
    flows: ['employer_participation_count','event_employers_checked_in'] },
  { id: 'quality', label: 'Data Quality', quality: true },
]

const COPY = {
  unique_jobseekers: 'Distinct participants with a current jobseeker profile.',
  active_vacancies: 'Job definitions currently marked active; this does not establish an unexpired event offering.',
  unique_vacancy_definitions: 'Distinct reusable job definitions, including inactive definitions.',
  active_approved_employers: 'Employers currently marked active with approved registration.',
  event_vacancy_offerings: 'Job offerings at events in the selected event-date range; a definition can appear at several events.',
  applications_submitted: 'Formal applications submitted in the selected dates, including those later rejected or withdrawn.',
  interviews_recorded: 'Interview result records dated in the selected range; several results can belong to one application.',
  hires_recorded: 'Latest recorded hired outcomes with reviewer, verification date and hire date evidence.',
  candidate_interest_count: 'Recorded event interests in the selected dates. These are separate from formal applications.',
}

// This is a display subset, never a second availability registry.
export function planIntelligenceRequests(sectionId, filters) {
  const section = INTELLIGENCE_SECTIONS.find(item => item.id === sectionId)
  if (!section) throw new TypeError('Unknown dashboard section')
  const requests = []
  const flow = { start: filters.start, end: filters.end }
  if (section.eventFilter && filters.eventId) flow.eventId = filters.eventId
  const add = (key, ids = [], options = {}) => {
    const available = ids.filter(id => getMetricDefinition(id).status === 'available')
    if (!available.length) return
    validateMetricRequest(available, options)
    requests.push({ key, ids: available, options })
  }
  add('snapshots',section.snapshots)
  add('flows',section.flows,flow)
  for (const [dimension, ids] of section.breakdowns ?? []) add(dimension,ids,{dimension})
  add('series',section.series,{...flow,period:filters.period})
  if (section.quality) requests.push({ key:'quality',quality:true,options:flow })
  return requests
}

const format = value => new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(value)
export function metricView(id, cell) {
  const definition = getMetricDefinition(id)
  const base = { id, name: definition.name, measure: definition.measure,
    help: COPY[id] ?? definition.limitations[0], limitations: [...definition.limitations],
    grain: definition.grain.replaceAll('_',' '),
    dateBasis: ({current_snapshot:'Current snapshot','participants.created_at':'Person registration date',
      'vacancy_definitions.created_at':'Job definition creation date','events.event_date':'Event date',
      'participation_vacancies.created_at':'Interest recorded date','applications.applied_at':'Application submission date',
      'interview_logs.interview_date':'Interview result date','employment_outcomes.hired_at':'Recorded hire date',
      'program_participation_events.occurred_at':'Occurrence date (UTC)',
      'follow_ups.completed_date':'Follow-up completion date'})[definition.date_basis] ?? 'Date definition unavailable',
    denominatorContext: definition.denominator?.replaceAll('applied_at','submission-date') ?? null }
  if (definition.status === 'policy_pending' || cell?.status === 'policy_pending') return {...base,state:'policy_pending',display:'Awaiting policy'}
  if (definition.status === 'unavailable') return {...base,state:'unavailable',display:'Unavailable'}
  if (cell?.suppressed) return {...base,state:'suppressed',display:'Withheld'}
  if (!cell) return {...base,state:'no_data',display:'No data'}
  if (cell.status === 'not_applicable') return {...base,state:'not_applicable',display:'Not applicable',numerator:null,denominator:null}
  const components={numerator:Number.isSafeInteger(cell.numerator)?cell.numerator:null,
    denominator:Number.isSafeInteger(cell.denominator)?cell.denominator:null}
  if (cell.value == null) return {...base,...components,state:'unknown',display:'Not available'}
  if (typeof cell.value !== 'number' || !Number.isFinite(cell.value) || cell.value < 0) throw new TypeError('Invalid display value')
  const display = definition.measure === 'rate' ? format(cell.value * 100) + '%'
    : definition.measure === 'percent' ? format(cell.value) + '%'
      : definition.measure === 'ratio' ? format(cell.value) + ' : 1' : format(cell.value)
  return { ...base,...components,state:'numeric',display,value:cell.value }
}

// Only normalized aggregate fields survive into cards, tables and charts.
export function breakdownRows(id, response) {
  if (getMetricDefinition(id).status !== 'available') return []
  return (response?.cells ?? []).filter(cell => cell.metric_id === id).map(cell => ({
    key: cell.dimension.key, label: cell.dimension.label, ...metricView(id,cell),
  })).sort((a,b) => (b.value ?? -1) - (a.value ?? -1) || a.label.localeCompare(b.label,'en'))
}
export function coverageNote(id, response) {
  const cell=response?.cells.find(item=>item.metric_id===id)
  if (!cell || cell.value == null) return 'Structured-data coverage is not available. Interpret this breakdown cautiously.'
  return `${getMetricDefinition(id).name}: ${metricView(id,cell).display} structured-data coverage (${cell.numerator} / ${cell.denominator}). Missing records mean information is not yet structured; interpret this breakdown cautiously.`
}
