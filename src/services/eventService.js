// Event (a.k.a. Quest / activity) operations. Centralises the queries
// that were duplicated across CalendarPage, EventDetailPage,
// RegisterPage, WalkinPage, ScannerPage, ManualSearchPage, InterviewLogPage,
// InterviewLogsManagement, RegistrantsManagement, EventsManagement,
// VacanciesManagement, EmployerDashboard, and CalendarPage role-actions.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import { EVENT_STATUS, isEventActive } from '../domain/statuses'

const PUBLIC_LIST_FIELDS =
  'id, event_name, event_date, time_from, time_to, location, venue, description, status, event_type, recruitment_type'

export async function listAllOrdered() {
  return unwrap(
    await supabase.from('events').select(PUBLIC_LIST_FIELDS).order('event_date'),
    'Could not load events'
  )
}

export async function listActive() {
  const all = await listAllOrdered()
  return (all || []).filter(e => isEventActive(e.status))
}

export async function listForStaff() {
  return unwrap(
    await supabase
      .from('events')
      .select(PUBLIC_LIST_FIELDS)
      .in('status', [EVENT_STATUS.UPCOMING, EVENT_STATUS.ONGOING])
      .order('event_date'),
    'Could not load events'
  )
}

export async function listForStaffAnyStatus() {
  return unwrap(
    await supabase.from('events').select(PUBLIC_LIST_FIELDS).order('event_date', { ascending: false }),
    'Could not load events'
  )
}

export async function getById(id) {
  return unwrap(
    await supabase
      .from('events')
      .select(PUBLIC_LIST_FIELDS)
      .eq('id', id)
      .maybeSingle(),
    'Could not load event'
  )
}

export async function listForVacancyFilter() {
  return unwrap(
    await supabase
      .from('events')
      .select('id, event_name, event_date, event_type, recruitment_type')
      .order('event_date', { ascending: false }),
    'Could not load events'
  )
}

export async function listAllAdmin() {
  return unwrap(
    await supabase.from('events').select('*').order('event_date', { ascending: false }),
    'Could not load events'
  )
}

export async function listStatsForAdmin() {
  return unwrap(
    await supabase
      .from('events')
      .select('id, event_date, time_from, time_to, status'),
    'Could not load event stats'
  )
}

// Counts of registrants per event — used by EventsManagement's badge counts.
export async function countRegistrantsByEvent() {
  return unwrap(
    await supabase.from('registrants').select('event_id'),
    'Could not load registrant counts'
  )
}

// Admin: insert / update / delete / auto-status transition.
export async function insert(event) {
  return unwrap(
    await supabase.from('events').insert(event).select('id').single(),
    'Could not create event'
  )
}

export async function update(id, patch) {
  return unwrap(
    await supabase.from('events').update(patch).eq('id', id),
    'Could not update event'
  )
}

export async function remove(id) {
  return unwrap(
    await supabase.from('events').delete().eq('id', id),
    'Could not delete event'
  )
}

export const eventService = {
  listAllOrdered,
  listActive,
  listForStaff,
  listForStaffAnyStatus,
  getById,
  listForVacancyFilter,
  listAllAdmin,
  listStatsForAdmin,
  insert,
  update,
  remove,
  countRegistrantsByEvent,
}