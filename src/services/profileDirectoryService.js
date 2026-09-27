// Profile directory queries used by CalendarPage (admin personnel pool)
// and other admin surfaces. Distinct from auth's profile (which is the
// signed-in user) — this lists other portal accounts.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

export async function listStaffPool() {
  return unwrap(
    await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['supervisor', 'staff', 'medical'])
      .eq('is_active', true),
    'Could not load staff pool'
  )
}

export const profileDirectoryService = {
  listStaffPool,
}