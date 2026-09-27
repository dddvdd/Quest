// Event-assignment operations (admin assigning supervisor/staff/medical
// to events). Used by CalendarPage's admin actions.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

export async function listForEvent(eventId) {
  return unwrap(
    await supabase
      .from('event_assignments')
      .select('*, profiles(full_name)')
      .eq('event_id', eventId),
    'Could not load assignments'
  )
}

export async function assign({ eventId, userId, assignmentRole, assignedBy }) {
  return unwrap(
    await supabase
      .from('event_assignments')
      .insert({ event_id: eventId, user_id: userId, assignment_role: assignmentRole, assigned_by: assignedBy }),
    'Could not assign'
  )
}

export async function unassign(id) {
  return unwrap(
    await supabase.from('event_assignments').delete().eq('id', id),
    'Could not remove assignment'
  )
}

export const eventAssignmentService = {
  listForEvent,
  assign,
  unassign,
}