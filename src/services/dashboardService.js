// Admin dashboard reads — one service that aggregates all the metrics the
// admin landing page shows. The page itself stays focused on rendering.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

const REGISTRANTS_FULL_SELECT = `
  *,
  events(id, event_name),
  registrant_vacancies(event_vacancies(vacancy_definitions(position, company_name)))
`

const EVENT_MIN = 'id, event_name'

const PROFILES_MIN = 'id'

const INTERVIEW_MIN = 'id, interview_status, event_id, events(event_name)'

const APPLICATION_MIN = 'id, application_status, registrant_id'

const OUTCOME_MIN = 'outcome, applications!inner(registrant_id)'

export async function fetchDashboard() {
  const [regRes, evRes, staffRes, interviewsRes, outcomesRes, appsRes] = await Promise.all([
    supabase.from('registrants').select(REGISTRANTS_FULL_SELECT).order('created_at', { ascending: false }),
    supabase.from('events').select(EVENT_MIN),
    supabase.from('profiles').select(PROFILES_MIN).in('role', ['staff', 'supervisor', 'admin', 'medical']),
    supabase.from('interview_logs').select(INTERVIEW_MIN),
    supabase.from('employment_outcomes').select(OUTCOME_MIN),
    supabase.from('applications').select(APPLICATION_MIN),
  ])

  // ignore individual errors and let the caller decide
  return {
    registrants: unwrap(regRes, 'registrants') || [],
    events: unwrap(evRes, 'events') || [],
    staff: unwrap(staffRes, 'staff') || [],
    interviewLogs: unwrap(interviewsRes, 'interview_logs') || [],
    outcomes: unwrap(outcomesRes, 'outcomes') || [],
    applications: unwrap(appsRes, 'applications') || [],
  }
}

export const dashboardService = {
  fetchDashboard,
}