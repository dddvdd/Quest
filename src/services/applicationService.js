// Applications (jobseeker → event-vacancy link). Used by AdminReports,
// InterviewLogPage (linking interview to application).

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

export async function listForRegistrant(registrantId) {
  return unwrap(
    await supabase
      .from('applications')
      .select('id, application_status, event_vacancies(event_id, vacancy_definitions(company_name, position))')
      .eq('registrant_id', registrantId)
      .order('created_at', { ascending: false }),
    'Could not load applications'
  )
}

export async function listAll() {
  return unwrap(
    await supabase.from('applications').select('*'),
    'Could not load applications'
  )
}

export async function listForEventWithRegistrants(eventId) {
  return unwrap(
    await supabase
      .from('applications')
      .select('id, application_status, registrant_id, event_vacancies(event_id, vacancy_definitions(company_name, position)), registrants(id, first_name, last_name, unique_id, email, contact_no)')
      .eq('event_vacancies.event_id', eventId),
    'Could not load applications'
  )
}

// Admin reports — applications joined with registrants + event_vacancies.
export async function listForReports() {
  return unwrap(
    await supabase
      .from('applications')
      .select(`
        *, registrants(id, unique_id, first_name, middle_name, last_name, event_id, check_in_status, has_disability, returning_ofw, returning_worker, first_time_jobseeker),
        event_vacancies(id, vacancy_definitions(company_name, position), events(id, event_name))
      `),
    'Could not load applications'
  )
}

export const applicationService = {
  listForRegistrant,
  listAll,
  listForEventWithRegistrants,
  listForReports,
  update: (id, patch) => unwrap(
    supabase.from('applications').update(patch).eq('id', id),
    'Update failed'
  ),
}