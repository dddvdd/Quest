// Medical services + referral operations. Used by MedicalReferralEntry
// (staff referrals page) and MedicalDashboard.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

export async function listServices() {
  return unwrap(
    await supabase
      .from('medical_services')
      .select('id, name, color')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    'Could not load services'
  )
}

export async function listReferrals() {
  return unwrap(
    await supabase
      .from('medical_referrals')
      .select('id, status, notes, created_at, event_id, registrant_id, registrants(id, unique_id, first_name, middle_name, last_name), events(id, event_name), referral_services(medical_services(id, name, color))')
      .order('created_at', { ascending: false }),
    'Could not load referrals'
  )
}

// Medical dashboard — full referral view (registrant details + interview + services).
export async function listReferralsFull() {
  return unwrap(
    await supabase
      .from('medical_referrals')
      .select('*, registrants(id, unique_id, first_name, middle_name, last_name, email, contact_no, barangay, municipality_city, province), interview_logs(id, company, position, interview_status, interview_date), events(id, event_name), profiles(full_name), referral_services(medical_services(id, name, color))')
      .order('created_at', { ascending: false }),
    'Could not load referrals'
  )
}

export async function findActiveReferral(registrantId) {
  return unwrap(
    await supabase
      .from('medical_referrals')
      .select('id, status')
      .eq('registrant_id', registrantId)
      .in('status', ['pending', 'completed'])
      .limit(1)
      .maybeSingle(),
    'Could not check existing referrals'
  )
}

export async function createReferral(payload) {
  return unwrap(
    await supabase
      .from('medical_referrals')
      .insert(payload)
      .select('id')
      .single(),
    'Could not create referral'
  )
}

export async function setReferralServices(referralId, serviceIds) {
  if (!serviceIds.length) return
  return unwrap(
    await supabase
      .from('referral_services')
      .insert(serviceIds.map(serviceId => ({ referral_id: referralId, service_id: serviceId }))),
    'Could not save referral services'
  )
}

export async function removeReferralServices(referralId, serviceIds) {
  if (!serviceIds.length) return
  return unwrap(
    await supabase.from('referral_services').delete().eq('referral_id', referralId).in('service_id', serviceIds),
    'Could not remove referral services'
  )
}

export async function updateReferral(referralId, patch) {
  return unwrap(
    await supabase.from('medical_referrals').update(patch).eq('id', referralId),
    'Could not update referral'
  )
}

export const medicalService = {
  listServices,
  listReferrals,
  listReferralsFull,
  findActiveReferral,
  createReferral,
  setReferralServices,
  removeReferralServices,
  updateReferral,
}