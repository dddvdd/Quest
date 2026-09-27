export const PROGRAM_MODEL_VERSION = 'program-foundation-v1'
export const PROGRAM_STAGES = Object.freeze(['referred', 'applied', 'enrolled', 'started', 'completed', 'withdrawn', 'disqualified', 'declined'])
export const PROGRAM_OUTCOME_TYPES = Object.freeze(['employment', 'training_completion', 'education_continuation', 'certification', 'placement', 'other'])
export const PROGRAM_STAGE_LABELS = Object.freeze(Object.fromEntries(PROGRAM_STAGES.map(stage => [stage, stage[0].toUpperCase() + stage.slice(1)])))
const object = value => value && typeof value === 'object' && !Array.isArray(value)
export function validateProgramWorkflow(workflow) {
  if (!object(workflow) || Object.keys(workflow).some(key => !['initial', 'transitions'].includes(key)) || !Array.isArray(workflow.initial) || !workflow.initial.length || !object(workflow.transitions)) throw new TypeError('Explicit cycle workflow required')
  const stages = value => Array.isArray(value) && new Set(value).size === value.length && value.every(stage => PROGRAM_STAGES.includes(stage))
  if (!stages(workflow.initial)) throw new TypeError('Invalid initial stages')
  for (const [from, targets] of Object.entries(workflow.transitions)) {
    if (!PROGRAM_STAGES.includes(from) || !stages(targets) || targets.includes(from)) throw new TypeError('Invalid cycle transition')
  }
  return true
}
export function validateProgramTransition(workflow, from, to) {
  validateProgramWorkflow(workflow)
  if (!PROGRAM_STAGES.includes(to) || (from !== null && !PROGRAM_STAGES.includes(from))) throw new TypeError('Invalid program stage')
  const allowed = from === null ? workflow.initial : Object.hasOwn(workflow.transitions, from) ? workflow.transitions[from] : []
  if (!allowed.includes(to)) throw new TypeError('Transition is not permitted by this cycle workflow')
  return true
}
export function validateProgramEvidence({ occurred_at, source, evidence_type, evidence_reference, verification_status = 'reported' }) {
  if (typeof occurred_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(occurred_at) || !Number.isFinite(Date.parse(occurred_at)) || new Date(`${occurred_at.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== occurred_at.slice(0, 10)) throw new TypeError('Actual occurrence timestamp required')
  for (const value of [source, evidence_type, evidence_reference]) if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new TypeError('Evidence provenance required')
  if (!['reported', 'verified'].includes(verification_status)) throw new TypeError('Invalid verification status')
  return true
}
export function validateProgramCorrection(event, expectedId, replacementStage, workflow) {
  if (!event || event.id !== expectedId) throw new TypeError('Only the current event can be corrected')
  return validateProgramTransition(workflow, event.from_stage ?? null, replacementStage)
}
// Diagnostic grain helpers only; these do not enable a numeric analytics metric.
export function countDistinctProgramParticipants(participations) {
  return new Set(participations.map(value => value.participant_id)).size
}
export function describeProgramOutcome(outcome) {
  if (!object(outcome) || !PROGRAM_OUTCOME_TYPES.includes(outcome.outcome_type)) throw new TypeError('Invalid program outcome')
  const verified = outcome.verification_status === 'verified' && (!outcome.employment_outcome_id || outcome.linked_employment_current_verified === true)
  return { outcome_type: outcome.outcome_type, verified, employment_observed: verified && outcome.outcome_type === 'employment', causal_attribution: false }
}
export const PROGRAM_METRIC_PROPOSALS = Object.freeze(['program_referrals', 'program_applications', 'program_enrollments', 'program_starts', 'program_completions', 'program_withdrawals', 'program_participants_unique'].map(id => Object.freeze({ id, status: 'unavailable', reason: 'Stage/cohort semantics, privacy approval and aggregate RPC activation required' })))
