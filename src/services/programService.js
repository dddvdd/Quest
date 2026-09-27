import { validateProgramEvidence, validateProgramWorkflow } from '../domain/employmentPrograms.js'
import { AppError } from '../lib/errors.js'

async function transport(operation, payload) {
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.rpc('manage_employment_program', { p_operation: operation, p_payload: payload })
  if (error) throw new AppError('Program operation is unavailable', { code: error.code })
  return data
}
// Private administrative interface; no page or employer matching path imports it.
export function createProgramService(call = transport) {
  const write = (operation, payload) => {
    if (!payload || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.request_id)) throw new TypeError('Stable retry request UUID required')
    return call(operation, payload)
  }
  const evidenceWrite = (operation, payload) => { validateProgramEvidence(payload); return write(operation, payload) }
  return {
    createProgram: payload => write('create_program', payload),
    createCycle: payload => { validateProgramWorkflow(payload.workflow); return write('create_cycle', payload) },
    createServiceType: payload => write('create_service_type', payload),
    recordParticipation: payload => evidenceWrite('record_participation', payload),
    recordTransition: payload => evidenceWrite('record_transition', payload),
    correctTransition: payload => evidenceWrite('correct_transition', payload),
    recordOutcome: payload => evidenceWrite('record_outcome', payload),
    recordServiceDelivery: payload => evidenceWrite('record_service_delivery', payload),
    getHistory: ({ participant_id = null, program_cycle_id = null, limit = 100 } = {}) => {
      if ((!participant_id && !program_cycle_id) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Supply a bounded person/cycle scope')
      return call('history', { participant_id, program_cycle_id, limit })
    },
  }
}
export const programService = createProgramService()
