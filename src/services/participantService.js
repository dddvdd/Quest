// Participant aggregate: jobseeker-side reads/writes that span the
// `participants`, `jobseeker_profiles`, `event_participations`,
// `registrants` view and the participant-resolution RPCs.

import { supabase } from '../lib/supabase'
import { unwrap, unwrapRpc } from '../lib/errors'

// --- RPC wrappers (the participant resolver protocol) ----------------

export async function getOrCreateParticipant() {
  return unwrapRpc(
    await supabase.rpc('get_or_create_participant'),
    'Could not load your participant record'
  )
}

export async function saveJobseekerProfile(profile) {
  return unwrapRpc(
    await supabase.rpc('save_jobseeker_profile', { p_profile: profile }),
    'Could not save profile'
  )
}

// --- Profile reads ----------------------------------------------------

export async function fetchJobseekerProfile(participantId) {
  return unwrap(
    await supabase
      .from('jobseeker_profiles')
      .select('*')
      .eq('participant_id', participantId)
      .maybeSingle(),
    'Could not load profile'
  )
}

// --- Participant read by QR pass -------------------------------------

const PARTICIPANT_BY_PASS =
  'id, public_pass_id'

export async function findParticipantByPass(passId) {
  return unwrap(
    await supabase
      .from('participants')
      .select(PARTICIPANT_BY_PASS)
      .eq('public_pass_id', passId)
      .maybeSingle(),
    'Could not resolve participant'
  )
}

export async function findParticipantById(id) {
  return unwrap(
    await supabase
      .from('participants')
      .select(PARTICIPANT_BY_PASS)
      .eq('id', id)
      .maybeSingle(),
    'Could not resolve participant'
  )
}

export async function fetchJobseekerProfileByParticipantId(participantId) {
  return unwrap(
    await supabase
      .from('jobseeker_profiles')
      .select('first_name, middle_name, last_name')
      .eq('participant_id', participantId)
      .limit(1),
    'Could not load participant profile'
  )
}

// --- Event participation reads ---------------------------------------

export async function listEventParticipations(participantId) {
  return unwrap(
    await supabase
      .from('event_participations')
      .select('id, event_id, ticket_code, check_in_status, check_in_time, check_in_by')
      .eq('participant_id', participantId)
      .order('created_at', { ascending: false }),
    'Could not load your registrations'
  )
}

export async function findEventParticipation(participantId, eventId) {
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

export async function hasProfile(participantId) {
  const row = await unwrap(
    await supabase
      .from('jobseeker_profiles')
      .select('participant_id')
      .eq('participant_id', participantId)
      .limit(1),
    'Could not check profile'
  )
  return (row?.length ?? 0) > 0
}

// --- Check-in / register RPCs ----------------------------------------

export async function checkInRegistrant(registrantUuid) {
  return unwrapRpc(
    await supabase.rpc('check_in_registrant', { registrant_uuid: registrantUuid }),
    'Check-in failed'
  )
}

export async function registerForEvent(eventId, vacancyIds) {
  return unwrapRpc(
    await supabase.rpc('register_for_event', {
      p_event_id: eventId,
      p_vacancy_ids: vacancyIds,
    }),
    'Registration failed'
  )
}

export async function staffRegisterParticipant(participantId, eventId) {
  return unwrapRpc(
    await supabase.rpc('staff_register_participant', {
      p_participant_id: participantId,
      p_event_id: eventId,
    }),
    'Registration failed'
  )
}

export const participantService = {
  getOrCreateParticipant,
  saveJobseekerProfile,
  fetchJobseekerProfile,
  findParticipantByPass,
  findParticipantById,
  fetchJobseekerProfileByParticipantId,
  listEventParticipations,
  findEventParticipation,
  hasProfile,
  checkInRegistrant,
  registerForEvent,
  staffRegisterParticipant,
}
