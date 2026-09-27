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
      .from('jobseeker_education')
      .select('*, education_levels(id, code, name, rank)')
      .eq('jobseeker_profile_id', pid)
      .order('is_current', { ascending: false })
      .order('graduation_year', { ascending: false }),
    'Could not load education'
  )
}

export async function create(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_education')
      .insert({ ...row, jobseeker_profile_id: pid })
      .select()
      .single(),
    'Could not save education'
  )
}

export async function update(id, row) {
  return unwrap(
    await supabase
      .from('jobseeker_education')
      .update(row)
      .eq('id', id)
      .select()
      .single(),
    'Could not update education'
  )
}

export async function remove(id) {
  return unwrap(
    await supabase
      .from('jobseeker_education')
      .delete()
      .eq('id', id),
    'Could not delete education'
  )
}

export const educationService = { listMine, create, update, remove }
