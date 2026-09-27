import { EMPLOYMENT_INTELLIGENCE_METRICS, PROGRAM_METRIC_IDS } from '../domain/employmentIntelligenceMetrics.js'
import { normalizeAggregateResponse, normalizeProgramAggregateResponse, validateMetricRequest } from '../domain/employmentIntelligence.js'
import { AppError } from '../lib/errors.js'

async function readAggregate(args) {
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.rpc('get_employment_intelligence', args)
  if (error) throw new AppError('Employment intelligence is unavailable', { code: error.code })
  return data
}

async function readProgramAggregate(args) {
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.rpc('get_program_metrics', args)
  if (error) throw new AppError('Program intelligence is unavailable', { code: error.code })
  return data
}

// Injected aggregate transport makes the read-only contract independently testable.
// Authorization is enforced by the database, never by a client-supplied role.
export function createEmploymentIntelligenceService(reader = readAggregate, programReader = readProgramAggregate) {
  async function getMetrics(ids, options = {}) {
    const args = validateMetricRequest(ids, options)
    if (PROGRAM_METRIC_IDS.includes(ids[0])) {
      const payload = await programReader(args)
      return normalizeProgramAggregateResponse(payload, ids, options)
    }
    const payload = await reader(args)
    return normalizeAggregateResponse(payload, ids, options)
  }
  return {
    getMetrics,
    getMetric: (id, options) => getMetrics([id], options),
    getMetricSeries: (id, options = {}) => {
      if (!options.period) throw new TypeError('Supply a series period')
      return getMetrics([id], options)
    },
    getDimensionBreakdown: (id, dimension, options = {}) => getMetrics([id], { ...options, dimension }),
    getDataQualitySummary: async (options = {}) => {
      const ids = Object.values(EMPLOYMENT_INTELLIGENCE_METRICS).filter(metric => metric.is_data_quality).map(metric => metric.metric_id)
      if (!options.start && !options.end && !options.eventId) return getMetrics(ids, options)
      const snapshots = ids.filter(id => EMPLOYMENT_INTELLIGENCE_METRICS[id].date_basis === 'current_snapshot')
      const flows = ids.filter(id => !snapshots.includes(id))
      const [snapshot, flow] = await Promise.all([getMetrics(snapshots), getMetrics(flows, options)])
      return { version: flow.version, observed_on: flow.observed_on, cells: [...snapshot.cells, ...flow.cells] }
    },
  }
}
export const employmentIntelligenceService = createEmploymentIntelligenceService()
export const { getMetric, getMetricSeries, getDimensionBreakdown, getDataQualitySummary } = employmentIntelligenceService
