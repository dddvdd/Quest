import { EMPLOYMENT_INTELLIGENCE_VERSION, PROGRAM_METRIC_IDS, getMetricDefinition } from './employmentIntelligenceMetrics.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRIVATE_LABEL = /@|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\+?\d[\d ()-]{7,}\d/i
const OPTION_KEYS = ['start', 'end', 'period', 'dimension', 'eventId', 'programId', 'cycleId', 'allPrograms']

export function validateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Expected ISO calendar date')
  const date = new Date(value + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new TypeError('Invalid calendar date')
  return value
}

export function groupPeriod(value, period) {
  validateDate(value)
  if (period === 'day') return value
  if (period === 'month') return value.slice(0, 7) + '-01'
  if (period === 'year') return value.slice(0, 4) + '-01-01'
  throw new TypeError('Unsupported period')
}

export function calculateMetricValue(numerator, denominator, measure) {
  if (!Number.isSafeInteger(numerator) || numerator < 0) throw new TypeError('Invalid aggregate numerator')
  if (measure === 'count') return numerator
  if (!['rate', 'percent', 'ratio'].includes(measure)) throw new TypeError('Unsupported aggregate measure')
  if (!Number.isSafeInteger(denominator) || denominator < 0) throw new TypeError('Invalid aggregate denominator')
  if (measure !== 'ratio' && numerator > denominator) throw new TypeError('Numerator exceeds cohort denominator')
  if (denominator === 0) return null
  return numerator / denominator * (measure === 'percent' ? 100 : 1)
}

// Until an administrative disclosure policy exists, every sensitive cell is withheld.
// Values and components are never retained in a suppressed return object.
export function suppressSensitiveAggregate() {
  return { value: null, numerator: null, denominator: null, suppressed: true, status: 'policy_pending' }
}

export function validateMetricRequest(metricIds, options = {}) {
  if (!Array.isArray(metricIds) || metricIds.length < 1 || metricIds.length > 20 || new Set(metricIds).size !== metricIds.length) {
    throw new TypeError('Request 1 to 20 distinct metric IDs')
  }
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !OPTION_KEYS.includes(key))) {
    throw new TypeError('Unsupported analytics options')
  }
  const definitions = metricIds.map(getMetricDefinition)
  const programRequest = metricIds.some(id => PROGRAM_METRIC_IDS.includes(id))
  if (programRequest && metricIds.some(id => !PROGRAM_METRIC_IDS.includes(id))) throw new TypeError('Request one analytics family at a time')
  const programScope = options.programId != null || options.cycleId != null || options.allPrograms != null
  if (programRequest) {
    if (!programScope) throw new TypeError('Supply an explicit program scope')
    if (options.allPrograms != null && (options.allPrograms !== true || options.programId != null || options.cycleId != null)) throw new TypeError('Invalid all-program scope')
    for (const key of ['programId', 'cycleId']) if (options[key] != null && !UUID.test(options[key])) throw new TypeError('Invalid program scope UUID')
    if (options.period != null || options.dimension != null || options.eventId != null) throw new TypeError('Unsupported program grouping')
  } else if (programScope) throw new TypeError('Program scope requires program metrics')
  if ((options.start == null) !== (options.end == null)) throw new TypeError('Supply both date boundaries')
  if (options.start != null) {
    validateDate(options.start)
    validateDate(options.end)
    if (options.start >= options.end) throw new TypeError('Use a nonempty half-open date range')
    if (!programRequest && definitions.some(metric => metric.date_basis === 'current_snapshot')) throw new TypeError('Snapshots do not support historical ranges')
  }
  if (options.period != null) {
    if (!['day', 'month', 'year'].includes(options.period) || !options.start) throw new TypeError('Series requires period and date boundaries')
    if (definitions.some(metric => metric.date_basis === 'current_snapshot')) throw new TypeError('Snapshot series unavailable')
  }
  if (options.eventId != null && (!UUID.test(options.eventId) || definitions.some(metric => !metric.event_scope))) {
    throw new TypeError('Event scope unavailable for this metric')
  }
  if (options.dimension != null && definitions.some(metric => !metric.dimensions.includes(options.dimension))) {
    throw new TypeError('Unsupported dimension for this metric')
  }
  if (metricIds.includes('skill_gap') && options.dimension !== 'skill') throw new TypeError('Skill ratio requires the shared skill dimension')
  if (programRequest) return { p_program_id: options.programId ?? null, p_cycle_id: options.cycleId ?? null,
    p_start_date: options.start ?? null, p_end_date: options.end ?? null }
  return {
    p_metric_ids: [...metricIds], p_start: options.start ?? null, p_end: options.end ?? null,
    p_period: options.period ?? null, p_dimension: options.dimension ?? null, p_event_id: options.eventId ?? null,
  }
}

export function normalizeProgramAggregateResponse(payload, metricIds, options = {}) {
  validateMetricRequest(metricIds, options)
  if (!metricIds.every(id => PROGRAM_METRIC_IDS.includes(id)) || !payload || payload.version !== 'program-metrics-v2' ||
      !Array.isArray(payload.cells) || payload.cells.length !== PROGRAM_METRIC_IDS.length) throw new TypeError('Invalid program aggregate response')
  const observedOn = validateDate(payload.observed_on)
  if (payload.cycle_id !== (options.cycleId ?? null) || payload.date_start !== (options.start ?? null) ||
      payload.date_end !== (options.end ?? null) ||
      (options.programId != null ? payload.program_id !== options.programId :
        options.cycleId != null ? !UUID.test(payload.program_id ?? '') : payload.program_id !== null)) throw new TypeError('Program response scope mismatch')
  const seen = new Set()
  const cells = payload.cells.map(cell => {
    if (!cell || !PROGRAM_METRIC_IDS.includes(cell.metric_id) || seen.has(cell.metric_id)) throw new TypeError('Unexpected or duplicate program cell')
    seen.add(cell.metric_id)
    const definition = getMetricDefinition(cell.metric_id)
    const datedSnapshot = options.start != null && definition.date_basis === 'current_snapshot'
    if (cell.suppressed !== false || cell.denominator !== null) throw new TypeError('Invalid program cell contract')
    if (datedSnapshot) {
      if (cell.status !== 'not_applicable' || cell.value !== null || cell.numerator !== null) throw new TypeError('Historical program snapshot unavailable')
    } else if (cell.status !== 'available' || !Number.isSafeInteger(cell.numerator) || cell.numerator < 0 || cell.value !== cell.numerator) {
      throw new TypeError('Invalid program count')
    }
    return { metric_id: cell.metric_id, measure: definition.measure, period: null, dimension: null,
      date_basis: definition.date_basis, scope: datedSnapshot ? 'historical_snapshot_unavailable' :
        definition.date_basis === 'current_snapshot' ? 'current_program_snapshot' : 'program_flow_cohort',
      program_id: payload.program_id, cycle_id: payload.cycle_id,
      value: definition.status === 'available' && !datedSnapshot ? cell.value : null,
      numerator: definition.status === 'available' && !datedSnapshot ? cell.numerator : null,
      denominator: null, suppressed: false,
      status: datedSnapshot ? 'not_applicable' : definition.status === 'available' ? 'available' : 'unavailable' }
  }).filter(cell => metricIds.includes(cell.metric_id))
  return { version: EMPLOYMENT_INTELLIGENCE_VERSION, observed_on: observedOn,
    program_id: payload.program_id, cycle_id: payload.cycle_id,
    date_start: payload.date_start, date_end: payload.date_end, cells }
}

export function normalizeAggregateResponse(payload, metricIds, options = {}) {
  validateMetricRequest(metricIds, options)
  if (!payload || payload.version !== EMPLOYMENT_INTELLIGENCE_VERSION || !Array.isArray(payload.cells) || payload.cells.length > 10000) {
    throw new TypeError('Invalid aggregate response')
  }
  const observedOn = validateDate(payload.observed_on)
  const seen = new Set()
  const cells = payload.cells.map(cell => {
    if (!cell || !metricIds.includes(cell.metric_id)) throw new TypeError('Unexpected response metric')
    const definition = getMetricDefinition(cell.metric_id)
    let period = null
    if (options.period && definition.status === 'available') {
      period = validateDate(cell.period)
      if (groupPeriod(period, options.period) !== period ||
          period < groupPeriod(options.start, options.period) || period >= options.end) throw new TypeError('Invalid response period')
    } else if (cell.period != null) throw new TypeError('Unexpected response period')
    let dimension = null
    if (options.dimension && definition.status === 'available') {
      if (!cell.dimension || cell.dimension.name !== options.dimension ||
          !/^[a-f0-9]{32}$/.test(cell.dimension.key) || typeof cell.dimension.label !== 'string' ||
          !cell.dimension.label.trim() || cell.dimension.label.length > 160 || PRIVATE_LABEL.test(cell.dimension.label)) {
        throw new TypeError('Invalid canonical dimension')
      }
      dimension = { name: options.dimension, key: cell.dimension.key, label: cell.dimension.label }
    } else if (cell.dimension != null) throw new TypeError('Unexpected response dimension')
    const cellKey = JSON.stringify([cell.metric_id, period, dimension?.key])
    if (seen.has(cellKey)) throw new TypeError('Duplicate aggregate cell')
    seen.add(cellKey)
    const base = { metric_id: cell.metric_id, measure: definition.measure, period, dimension,
      date_basis: definition.date_basis,
      scope: definition.date_basis === 'current_snapshot' ? 'current_system_snapshot'
        : options.eventId ? 'selected_event_cohort' : 'system_flow_cohort' }
    if (definition.privacy_classification === 'sensitive') return { ...base, ...suppressSensitiveAggregate() }
    if (definition.status !== 'available') {
      return { ...base, value: null, numerator: null, denominator: null, suppressed: false, status: 'unavailable' }
    }
    if (cell.suppressed !== false || !['available', 'zero_denominator'].includes(cell.status)) throw new TypeError('Invalid aggregate status')
    const value = calculateMetricValue(cell.numerator, cell.denominator, definition.measure)
    if (cell.value !== value || cell.status !== (value === null ? 'zero_denominator' : 'available')) {
      // PostgreSQL numeric arithmetic can serialize a different final IEEE-754 digit.
      if (!(typeof value === 'number' && typeof cell.value === 'number' &&
            Math.abs(cell.value - value) <= Number.EPSILON * Math.max(1, Math.abs(value)) &&
            cell.status === 'available')) throw new TypeError('Aggregate formula mismatch')
    }
    return { ...base, value: cell.value, numerator: cell.numerator,
      denominator: definition.measure === 'count' ? null : cell.denominator,
      suppressed: false, status: value === null ? 'zero_denominator' : 'available' }
  })
  for (const id of metricIds) {
    if (!cells.some(cell => cell.metric_id === id) && !options.dimension && !options.period) throw new TypeError('Missing aggregate metric')
  }
  return { version: EMPLOYMENT_INTELLIGENCE_VERSION, observed_on: observedOn, cells }
}
