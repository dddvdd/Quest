// Event participation (Quest) reads/writes. Distinct from the legacy
// `registrants` view: this works with the participant/event_participations
// tables added by migration_participant_architecture.sql.

import { supabase } from '../lib/supabase'
import { unwrap, unwrapRpc } from '../lib/errors'

const PARTICIPATION_BASE =
  'id, participant_id, event_id, ticket_code, check_in_status'

export async function listForEventStaff(eventId) {
  return unwrap(
    await supabase
      .from('event_participations')
      .select('check_in_status')
      .eq('event_id', eventId),
    'Could not load event participation'
  )
}

export async function findForParticipantAndEvent(participantId, eventId) {
  return unwrap(
    await supabase
      .from('event_participations')
      .select('id, check_in_status, check_in_time, check_in_by')
      .eq('participant_id', participantId)
      .eq('event_id', eventId)
      .maybeSingle(),
    'Could not load participation'
  )
}

// Full participations for a participant — used by /pass to render the
// "My Quests" list with vacancies and check-in status.
export async function listForParticipantWithDetails(participantId) {
  return unwrap(
    await supabase
      .from('event_participations')
      .select('id, event_id, check_in_status, check_in_time, registration_type, events(id, event_name, event_date, location), participation_vacancies(event_vacancies(vacancy_definitions(company_name, position)))')
      .eq('participant_id', participantId)
      .order('created_at', { ascending: false }),
    'Could not load your quests'
  )
}

// One participation by id, with the full UI surface — used by /participation.
export async function getByIdWithDetails(participationId) {
  return unwrap(
    await supabase
      .from('event_participations')
      .select('id, event_id, registration_type, check_in_status, check_in_time, events(id, event_name, event_date, location), participants(id, public_pass_id), participation_vacancies(event_vacancies(vacancy_definitions(company_name, position)))')
      .eq('id', participationId)
      .maybeSingle(),
    'Could not load registration'
  )
}

export const participationService = {
  listForEventStaff,
  findForParticipantAndEvent,
  listForParticipantWithDetails,
  getByIdWithDetails,
  _PARTICIPATION_BASE: PARTICIPATION_BASE,
}

export { unwrapRpc }