// Employer aggregate. Spans `employers`, `employer_event_participations`,
// `employer_accreditation`, `employer_accreditation_requirements`. The
// page-specific accreditation/submission logic stays in accreditation.js
// (configuration-driven), but the data access lives here.

import { supabase } from '../lib/supabase'
import { unwrap, unwrapRpc } from '../lib/errors'
import { isEmployerAccredited } from '../domain/statuses'

export async function listAll() {
  return unwrap(
    await supabase.from('employers').select('*').order('created_at', { ascending: false }),
    'Could not load employers'
  )
}

export async function listByCompany() {
  return unwrap(
    await supabase.from('employers').select('id, company_name, employer_type').order('company_name'),
    'Could not load employers'
  )
}

export async function getByRegisteredUser(userId) {
  return unwrap(
    await supabase.from('employers').select('*').eq('registered_user_id', userId).maybeSingle(),
    'Employer profile not found'
  )
}

export async function getById(id) {
  return unwrap(
    await supabase.from('employers').select('*').eq('id', id).maybeSingle(),
    'Employer not found'
  )
}

export async function create(employer) {
  return unwrap(
    await supabase.from('employers').insert({ ...employer, registration_status: 'approved', registration_source: 'admin' }).select('id').single(),
    'Could not create employer'
  )
}

export async function update(id, patch) {
  return unwrap(
    await supabase.from('employers').update(patch).eq('id', id),
    'Could not update employer'
  )
}

export async function updateSelf(id, patch) {
  return unwrap(
    await supabase.from('employers').update(patch).eq('id', id),
    'Update failed'
  )
}

export async function remove(id) {
  return unwrap(
    await supabase.from('employers').delete().eq('id', id),
    'Could not delete employer'
  )
}

// --- Event participation (employer side) ----------------------------

export async function getEventParticipationStatus(employerId, eventId) {
  return unwrap(
    await supabase
      .from('employer_event_participations')
      .select('status, registered_at')
      .eq('employer_id', employerId)
      .eq('event_id', eventId)
      .maybeSingle(),
    'Could not load participation'
  )
}

export async function participateInEvent(eventId) {
  return unwrapRpc(
    await supabase.rpc('participate_in_event', { p_event_id: eventId }),
    'Could not record participation'
  )
}

export async function listOwnDefinitions(employerId) {
  return unwrap(
    await supabase
      .from('vacancy_definitions')
      .select('id, position, available_slots')
      .eq('employer_id', employerId)
      .eq('is_active', true)
      .order('position'),
    'Could not load vacancies'
  )
}

export async function listEventEmployers(eventId) {
  return unwrapRpc(
    await supabase.rpc('get_event_participating_employers', { p_event_id: eventId }),
    'Could not load participating employers'
  )
}

export async function listAccreditation(employerId) {
  return unwrap(
    await supabase
      .from('employer_accreditation')
      .select('*, employer_accreditation_requirements(*)')
      .eq('employer_id', employerId)
      .maybeSingle(),
    'Could not load accreditation'
  )
}

// --- Admin RPCs ------------------------------------------------------

export async function approve(employerId) {
  return unwrapRpc(
    await supabase.rpc('admin_approve_employer', { p_employer_id: employerId }),
    'Approval failed'
  )
}

export async function reject(employerId, reason) {
  return unwrapRpc(
    await supabase.rpc('admin_reject_employer', { p_employer_id: employerId, p_reason: reason || null }),
    'Rejection failed'
  )
}

export async function linkAccount(employerId, email) {
  return unwrapRpc(
    await supabase.rpc('admin_link_employer_account', { p_employer_id: employerId, p_email: email }),
    'Link failed'
  )
}

export async function resetPassword(userId, password) {
  return unwrapRpc(
    await supabase.rpc('admin_reset_password', { p_user_id: userId, p_password: password }),
    'Password reset failed'
  )
}

export const employerService = {
  listAll,
  listByCompany,
  getByRegisteredUser,
  getById,
  create,
  update,
  updateSelf,
  remove,
  getEventParticipationStatus,
  participateInEvent,
  listOwnDefinitions,
  listEventEmployers,
  listAccreditation,
  approve,
  reject,
  linkAccount,
  resetPassword,
  isAccredited: isEmployerAccredited,
}