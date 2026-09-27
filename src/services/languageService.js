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
      .from('jobseeker_languages')
      .select('*, languages(id, code, name, code_standard)')
      .eq('jobseeker_profile_id', pid)
      .order('is_native', { ascending: false }),
    'Could not load languages'
  )
}

export async function create(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_languages')
      .insert({ ...row, jobseeker_profile_id: pid })
      .select()
      .single(),
    'Could not save language'
  )
}

export async function update(id, row) {
  return unwrap(
    await supabase
      .from('jobseeker_languages')
      .update(row)
      .eq('id', id)
      .select()
      .single(),
    'Could not update language'
  )
}

export async function remove(id) {
  return unwrap(
    await supabase
      .from('jobseeker_languages')
      .delete()
      .eq('id', id),
    'Could not delete language'
  )
}

export const languageService = { listMine, create, update, remove }
