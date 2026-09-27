// Registrant reads — the legacy `registrants` view is used by the
// manual-search/check-in flows for staff and by the registrant-management
// and reports pages for admins. Walk-in registration is its own RPC.

import { supabase } from '../lib/supabase'
import { unwrap, unwrapRpc } from '../lib/errors'

const LIST_COLUMNS =
  'id, event_id, unique_id, first_name, middle_name, last_name, email, contact_no, check_in_status, check_in_time, registration_type, events(event_name)'

const DETAIL_COLUMNS =
  '*, events(id, event_name, location, event_date), registrant_vacancies(event_vacancies(vacancy_definitions(company_name, position)))'

export async function listAll() {
  return unwrap(
    await supabase
      .from('registrants')
      .select(LIST_COLUMNS)
      .order('check_in_time', { ascending: false, nullsFirst: false }),
    'Could not load registrants'
  )
}

export async function listForEvent(eventId) {
  return unwrap(
    await supabase
      .from('registrants')
      .select(LIST_COLUMNS)
      .eq('event_id', eventId)
      .order('check_in_time', { ascending: false, nullsFirst: false }),
    'Could not load registrants'
  )
}

export async function searchForEvent(eventId, query) {
  return unwrap(
    await supabase
      .from('registrants')
      .select(LIST_COLUMNS)
      .eq('event_id', eventId)
      .or(
        `first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,unique_id.ilike.%${query}%,contact_no.ilike.%${query}%`
      )
      .order('created_at', { ascending: false })
      .limit(50),
    'Search failed'
  )
}

export async function search(query) {
  return unwrap(
    await supabase
      .from('registrants')
      .select(LIST_COLUMNS)
      .or(
        `unique_id.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`
      )
      .order('created_at', { ascending: false })
      .limit(10),
    'Search failed'
  )
}

export async function getById(id) {
  return unwrap(
    await supabase.from('registrants').select(DETAIL_COLUMNS).eq('id', id).maybeSingle(),
    'Could not load registrant'
  )
}

// Legacy decode helpers used by ScannerPage when resolving a non-pass QR.
export async function findLegacyById(id) {
  return unwrap(
    await supabase
      .from('registrants')
      .select('id, unique_id, first_name, middle_name, last_name, email, check_in_status, check_in_time, events(id, event_name)')
      .eq('id', id)
      .maybeSingle(),
    'Could not resolve registrant'
  )
}

export async function findLegacyByToken(token) {
  return unwrap(
    await supabase
      .from('registrants')
      .select('id, unique_id, first_name, middle_name, last_name, email, check_in_status, check_in_time, events(id, event_name)')
      .eq('qr_token', token)
      .maybeSingle(),
    'Could not resolve registrant'
  )
}

export async function findLegacyByString(text) {
  return unwrap(
    await supabase
      .from('registrants')
      .select('id, unique_id, first_name, middle_name, last_name, email, check_in_status, check_in_time, events(id, event_name)')
      .or(`id.eq.${text},unique_id.eq.${text},qr_token.eq.${text}`)
      .maybeSingle(),
    'Could not resolve registrant'
  )
}

export async function getParticipationForLegacy(legacyId) {
  return unwrap(
    await supabase
      .from('event_participations')
      .select('participant_id, events(id, event_name)')
      .eq('id', legacyId)
      .maybeSingle(),
    'Could not resolve legacy participation'
  )
}

// Staff walk-in registration creates a participant + participation in one
// SECURITY DEFINER RPC. The page just supplies the form payload.
export async function createWalkinRegistrant(payload) {
  return unwrapRpc(
    await supabase.rpc('create_walkin_registrant', payload),
    'Walk-in registration failed'
  )
}

export async function checkInByRegistrantId(id) {
  return unwrapRpc(
    await supabase.rpc('check_in_registrant', { registrant_uuid: id }),
    'Check-in failed'
  )
}

const ADMIN_FULL_SELECT = `
  *,
  events(id, event_name),
  registrant_vacancies(event_vacancies(vacancy_definitions(company_name, position)))
`

export async function listAllForAdmin() {
  return unwrap(
    await supabase
      .from('registrants')
      .select(ADMIN_FULL_SELECT)
      .order('created_at', { ascending: false }),
    'Could not load registrants'
  )
}

export async function updateRegistrant(id, patch) {
  return unwrap(
    await supabase.from('registrants').update(patch).eq('id', id),
    'Update failed'
  )
}

export async function markCheckedIn(id, byUserId) {
  return unwrap(
    await supabase
      .from('registrants')
      .update({ check_in_status: 'checked_in', check_in_time: new Date().toISOString(), check_in_by: byUserId || null })
      .eq('id', id),
    'Check-in failed'
  )
}

export async function removeRegistrant(id) {
  return unwrap(
    await supabase.from('registrants').delete().eq('id', id),
    'Delete failed'
  )
}

// Admin reports — full registrants with event + location for filtering.
export async function listForReports() {
  return unwrap(
    await supabase
      .from('registrants')
      .select(`*, events(id, event_name, location, event_date)`)
      .order('created_at', { ascending: false }),
    'Could not load registrants'
  )
}

export const registrantService = {
  listAll,
  listForEvent,
  searchForEvent,
  search,
  getById,
  findLegacyById,
  findLegacyByToken,
  findLegacyByString,
  getParticipationForLegacy,
  createWalkinRegistrant,
  checkInByRegistrantId,
  listAllForAdmin,
  updateRegistrant,
  markCheckedIn,
  removeRegistrant,
  listForReports,
}