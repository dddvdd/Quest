// Employer-applicants RPC (used by EmployerDashboard "View applicants"
// modal). Distinct from interview logs.

import { supabase } from '../lib/supabase'
import { unwrapRpc } from '../lib/errors'

export async function listForOffering(eventVacancyId) {
  return unwrapRpc(
    await supabase.rpc('get_employer_applicants', { p_event_vacancy_id: eventVacancyId }),
    'Could not load applicants'
  )
}

export const employerApplicantsService = {
  listForOffering,
}