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
      .from('work_experiences')
      .select('*')
      .eq('participant_id', pid)
      .order('is_current', { ascending: false })
      .order('start_date', { ascending: false }),
    'Could not load work experiences'
  )
}

export async function create(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('work_experiences')
      .insert({ ...row, participant_id: pid })
      .select()
      .single(),
    'Could not save work experience'
  )
}

export async function update(id, row) {
  return unwrap(
    await supabase
      .from('work_experiences')
      .update(row)
      .eq('id', id)
      .select()
      .single(),
    'Could not update work experience'
  )
}

export async function remove(id) {
  return unwrap(
    await supabase
      .from('work_experiences')
      .delete()
      .eq('id', id),
    'Could not delete work experience'
  )
}

export const workExperienceService = { listMine, create, update, remove }
