import { PROGRAM_STAGES, PROGRAM_OUTCOME_TYPES } from './employmentPrograms.js'

export const PROGRAM_STATUS_LABELS = Object.freeze({
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  cancelled: 'Cancelled',
})

export const PROGRAM_STAGE_LABELS = Object.freeze(
  Object.fromEntries(PROGRAM_STAGES.map(stage => [stage, stage[0].toUpperCase() + stage.slice(1)]))
)

export const OUTCOME_TYPE_LABELS = Object.freeze(
  Object.fromEntries(PROGRAM_OUTCOME_TYPES.map(type => [type, type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())]))
)

export function stageColor(stage) {
  const colors = {
    referred: 'bg-blue-100 text-blue-800',
    applied: 'bg-indigo-100 text-indigo-800',
    enrolled: 'bg-purple-100 text-purple-800',
    started: 'bg-amber-100 text-amber-800',
    completed: 'bg-green-100 text-green-800',
    withdrawn: 'bg-slate-100 text-slate-800',
    disqualified: 'bg-red-100 text-red-800',
    declined: 'bg-orange-100 text-orange-800',
  }
  return colors[stage] || 'bg-slate-100 text-slate-800'
}

export function statusColor(status) {
  const colors = {
    draft: 'bg-slate-100 text-slate-800',
    open: 'bg-green-100 text-green-800',
    closed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-red-100 text-red-800',
  }
  return colors[status] || 'bg-slate-100 text-slate-800'
}

export function allowedTransitions(workflow, fromStage) {
  if (!workflow || !workflow.transitions) return []
  if (fromStage === null) return workflow.initial ?? []
  return workflow.transitions[fromStage] ?? []
}

export function formatWorkflowDiagram(workflow) {
  if (!workflow) return []
  const nodes = new Set([...(workflow.initial ?? []), ...Object.keys(workflow.transitions ?? {})])
  const edges = []
  for (const [from, targets] of Object.entries(workflow.transitions ?? {})) {
    for (const to of targets) edges.push({ from, to })
  }
  return { nodes: [...nodes], edges }
}

export function isTerminalStage(stage) {
  return ['completed', 'withdrawn', 'disqualified', 'declined'].includes(stage)
}

export function outcomeRequiresEmploymentLink(outcomeType) {
  return outcomeType === 'employment'
}
