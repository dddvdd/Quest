import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import { getOrCreateParticipant } from './participantService'

async function participantId() {
  const p = await getOrCreateParticipant()
  return p.id
}

// --- Occupation preferences ---
export async function listOccupationPrefs() {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_occupation_preferences')
      .select('*, occupations(id, canonical_name, normalized_name)')
      .eq('jobseeker_profile_id', pid)
      .order('priority'),
    'Could not load occupation preferences'
  )
}

export async function createOccupationPref(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_occupation_preferences')
      .insert({ ...row, jobseeker_profile_id: pid })
      .select()
      .single(),
    'Could not save occupation preference'
  )
}

export async function removeOccupationPref(id) {
  return unwrap(
    await supabase
      .from('jobseeker_occupation_preferences')
      .delete()
      .eq('id', id),
    'Could not delete occupation preference'
  )
}

// --- Industry preferences ---
export async function listIndustryPrefs() {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_industry_preferences')
      .select('*, industries(id, canonical_name, normalized_name)')
      .eq('jobseeker_profile_id', pid)
      .order('priority'),
    'Could not load industry preferences'
  )
}

export async function createIndustryPref(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_industry_preferences')
      .insert({ ...row, jobseeker_profile_id: pid })
      .select()
      .single(),
    'Could not save industry preference'
  )
}

export async function removeIndustryPref(id) {
  return unwrap(
    await supabase
      .from('jobseeker_industry_preferences')
      .delete()
      .eq('id', id),
    'Could not delete industry preference'
  )
}

// --- Location preferences ---
export async function listLocationPrefs() {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_location_preferences')
      .select('*')
      .eq('jobseeker_profile_id', pid)
      .order('priority'),
    'Could not load location preferences'
  )
}

export async function createLocationPref(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_location_preferences')
      .insert({ ...row, jobseeker_profile_id: pid })
      .select()
      .single(),
    'Could not save location preference'
  )
}

export async function removeLocationPref(id) {
  return unwrap(
    await supabase
      .from('jobseeker_location_preferences')
      .delete()
      .eq('id', id),
    'Could not delete location preference'
  )
}

// --- Employment type preferences ---
export async function listEmploymentTypePrefs() {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_employment_type_preferences')
      .select('*, employment_types(id, code, name)')
      .eq('jobseeker_profile_id', pid)
      .order('priority'),
    'Could not load employment type preferences'
  )
}

export async function createEmploymentTypePref(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_employment_type_preferences')
      .insert({ ...row, jobseeker_profile_id: pid })
      .select()
      .single(),
    'Could not save employment type preference'
  )
}

export async function removeEmploymentTypePref(id) {
  return unwrap(
    await supabase
      .from('jobseeker_employment_type_preferences')
      .delete()
      .eq('id', id),
    'Could not delete employment type preference'
  )
}

// --- Work arrangement preferences ---
export async function listWorkArrangementPrefs() {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_work_arrangement_preferences')
      .select('*, work_arrangements(id, code, name)')
      .eq('jobseeker_profile_id', pid)
      .order('priority'),
    'Could not load work arrangement preferences'
  )
}

export async function createWorkArrangementPref(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_work_arrangement_preferences')
      .insert({ ...row, jobseeker_profile_id: pid })
      .select()
      .single(),
    'Could not save work arrangement preference'
  )
}

export async function removeWorkArrangementPref(id) {
  return unwrap(
    await supabase
      .from('jobseeker_work_arrangement_preferences')
      .delete()
      .eq('id', id),
    'Could not delete work arrangement preference'
  )
}

export const preferenceService = {
  listOccupationPrefs, createOccupationPref, removeOccupationPref,
  listIndustryPrefs, createIndustryPref, removeIndustryPref,
  listLocationPrefs, createLocationPref, removeLocationPref,
  listEmploymentTypePrefs, createEmploymentTypePref, removeEmploymentTypePref,
  listWorkArrangementPrefs, createWorkArrangementPref, removeWorkArrangementPref,
}
