// Event-vacancy operations (the junction "an employer is offering this
// vacancy at this event"). Used by EventDetailPage (public listing),
// RegisterPage / WalkinPage (vacancy selection), EmployerDashboard
// (offering CRUD), and VacanciesManagement (admin CRUD).

import { supabase } from '../lib/supabase'
import { unwrap, unwrapRpc } from '../lib/errors'

const JOIN_DEFINITION_DETAIL =
  'id, slots_offered, slots_filled, notes, vacancy_definitions(company_name, position)'

const JOIN_FOR_REGISTRANT_DETAIL =
  'event_vacancies(vacancy_definitions(company_name, position))'

const JOIN_FOR_COMPANY_LOOKUP =
  'vacancy_definitions(employer_id, employers(company_name))'

const JOIN_FOR_POSITION_LOOKUP =
  'vacancy_definitions(id, position, employer_id)'

const JOIN_FOR_VACANCY_DETAIL =
  'id, slots_offered, slots_filled, notes, events(id, event_name, event_date)'

const JOIN_FOR_APPLICANTS = '*'

export async function listForEvent(eventId) {
  return listEventOfferings(eventId)
}

export async function listAllActive() {
  return listEventOfferings(null)
}

export async function listActiveForEvent(eventId) {
  return listEventOfferings(eventId)
}

async function listEventOfferings(eventId) {
  const rows = unwrapRpc(
    await supabase.rpc('list_event_vacancies', { p_event_id: eventId }),
    'Could not load event vacancies',
  )
  return (rows || []).map(row => ({
    id: row.id,
    event_id: row.event_id,
    slots_offered: row.slots_offered,
    slots_filled: row.slots_filled,
    application_deadline: row.application_deadline,
    vacancy_definitions: {
      id: row.vacancy_definition_id,
      company_name: row.company_name,
      position: row.position,
      job_description: row.job_description,
      qualifications: row.qualifications,
      place_of_assignment: row.place_of_assignment,
      salary_range: row.salary_range,
    },
  }))
}

export async function listForEmployer(employerId) {
  return unwrap(
    await supabase
      .from('vacancy_definitions')
      .select('*, event_vacancies(id, slots_offered, slots_filled, notes, events(id, event_name, event_date))')
      .eq('employer_id', employerId)
      .order('position', { ascending: true }),
    'Could not load vacancies'
  )
}

export async function listAllAdmin() {
  return unwrap(
    await supabase
      .from('vacancy_definitions')
      .select('*, event_vacancies(id, slots_offered, slots_filled, notes, events(id, event_name, event_date))')
      .order('company_name', { ascending: true }),
    'Could not load vacancies'
  )
}

export async function listSlotCounts() {
  return unwrap(
    await supabase.from('registrant_vacancies').select('event_vacancy_id'),
    'Could not load slot counts'
  )
}

// Counts of vacancies per event — used by EventsManagement's badge counts.
export async function countVacanciesByEvent() {
  return unwrap(
    await supabase.from('event_vacancies').select('event_id'),
    'Could not load vacancy counts'
  )
}

// Full event_vacancies rows for the admin reports — joined with their definition.
export async function listForReports() {
  return unwrap(
    await supabase
      .from('event_vacancies')
      .select(`*, vacancy_definitions!inner(company_name, position, qualifications), events(id, event_name)`),
    'Could not load event vacancies'
  )
}

export async function listCompanyParticipants(eventId) {
  return unwrap(
    await supabase
      .from('event_vacancies')
      .select(JOIN_FOR_COMPANY_LOOKUP)
      .eq('event_id', eventId),
    'Could not load participating companies'
  )
}

export async function listPositionsForCompanyInEvent(eventId, employerId) {
  return unwrap(
    await supabase
      .from('event_vacancies')
      .select(JOIN_FOR_POSITION_LOOKUP)
      .eq('event_id', eventId)
      .eq('vacancy_definitions.employer_id', employerId),
    'Could not load positions'
  )
}

export async function listForRegistrantDetail(registrantId) {
  // The `registrants` view exposes registrant_vacancies; we mirror its
  // shape so call-sites stay simple.
  return unwrap(
    await supabase
      .from('registrants')
      .select(`id, registrant_vacancies(${JOIN_FOR_REGISTRANT_DETAIL})`)
      .eq('id', registrantId)
      .maybeSingle(),
    'Could not load registrant details'
  )
}

export async function upsertOffering({ vacancyDefinitionId, eventId, slotsOffered, notes }) {
  return unwrap(
    await supabase
      .from('event_vacancies')
      .upsert(
        {
          vacancy_definition_id: vacancyDefinitionId,
          event_id: eventId,
          slots_offered: Number(slotsOffered) || 1,
          notes: notes || null,
        },
        { onConflict: 'vacancy_definition_id,event_id' }
      ),
    'Could not save offering'
  )
}

export async function updateOffering(id, { eventId, slotsOffered, notes }) {
  return unwrap(
    await supabase
      .from('event_vacancies')
      .update({
        event_id: eventId,
        slots_offered: Number(slotsOffered) || 1,
        notes: notes || null,
      })
      .eq('id', id),
    'Could not update offering'
  )
}

export async function updateFilledCount(id, slotsFilled) {
  return unwrap(
    await supabase.from('event_vacancies').update({ slots_filled: slotsFilled }).eq('id', id),
    'Could not update slot count'
  )
}

export async function removeOffering(id) {
  return unwrap(
    await supabase.from('event_vacancies').delete().eq('id', id),
    'Could not remove offering'
  )
}

export const eventVacancyService = {
  listForEvent,
  listAllActive,
  listActiveForEvent,
  listForEmployer,
  listAllAdmin,
  listSlotCounts,
  listCompanyParticipants,
  listPositionsForCompanyInEvent,
  listForRegistrantDetail,
  upsertOffering,
  updateOffering,
  updateFilledCount,
  removeOffering,
  countVacanciesByEvent,
  listForReports,
}

// Internal — keep the row shapes that callers rely on but aren't worth
// surfacing through the service.
export const _internal = {
  JOIN_FOR_VACANCY_DETAIL,
  JOIN_FOR_APPLICANTS,
  JOIN_DEFINITION_DETAIL,
}
