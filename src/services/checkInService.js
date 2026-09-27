// Check-in RPC wrapper. The ScannerPage, WalkinPage, CheckinPage and
// ManualSearchPage all call into the same `check_in_registrant` SECURITY
// DEFINER RPC. Centralising avoids each page importing supabase directly.

import { supabase } from '../lib/supabase'
import { unwrapRpc } from '../lib/errors'
import { participantService } from './participantService'
import { registrantService } from './registrantService'

// Standard pre-registered check-in: participation row uuid.
export function checkInParticipation(participationUuid) {
  return participantService.checkInRegistrant(participationUuid)
}

// Convenience for staff manual check-in on a legacy `registrants` row.
export function checkInRegistrant(id) {
  return registrantService.checkInByRegistrantId(id)
}

// Employer gate check-in (QR reads `EMP-000123`).
export function checkInEmployer(employerCode, eventId) {
  return unwrapRpc(
    supabase.rpc('check_in_employer', {
      p_employer_code: employerCode,
      p_event_id: eventId,
    }),
    'Employer check-in failed'
  )
}

export const checkInService = {
  checkInParticipation,
  checkInRegistrant,
  checkInEmployer,
}