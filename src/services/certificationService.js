import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import { getOrCreateParticipant } from './participantService'

async function participantId() {
  const p = await getOrCreateParticipant()
  return p.id
}

export async function listMine() {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_certifications')
      .select('*, certifications(id, canonical_name, normalized_name, issuing_organization, certification_type)')
      .eq('jobseeker_profile_id', pid)
      .order('created_at', { ascending: false }),
    'Could not load certifications'
  )
}

export async function create(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_certifications')
      .insert({ ...row, jobseeker_profile_id: pid })
      .select()
      .single(),
    'Could not save certification'
  )
}

export async function update(id, row) {
  return unwrap(
    await supabase
      .from('jobseeker_certifications')
      .update(row)
      .eq('id', id)
      .select()
      .single(),
    'Could not update certification'
  )
}

export async function remove(id) {
  return unwrap(
    await supabase
      .from('jobseeker_certifications')
      .delete()
      .eq('id', id),
    'Could not delete certification'
  )
}

export const certificationService = { listMine, create, update, remove }
