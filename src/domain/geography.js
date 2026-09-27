export const GEOGRAPHY_MODEL_VERSION = 'geography-v1'
export const GEOGRAPHY_CONTEXT_FIELDS = Object.freeze({
  residence_geography: Object.freeze(['province', 'municipality_city', 'barangay']),
  preferred_work_geography: Object.freeze(['region', 'province', 'municipality_city']),
  vacancy_geography: Object.freeze(['province', 'municipality_city']),
  employer_geography: Object.freeze(['province', 'municipality_city', 'barangay']),
  employer_branch_geography: Object.freeze(['province', 'municipality_city', 'barangay']),
  event_geography: Object.freeze(['location']),
})
const LEVELS = { region: ['Reg'], province: ['Prov'], municipality_city: ['City', 'Mun'], barangay: ['Bgy'], location: ['Reg', 'Prov', 'City', 'Mun'] }
const PARENTS = { province: ['region'], municipality_city: ['region', 'province'], barangay: ['region', 'province', 'municipality_city'] }
const EDGES = new Set(['Reg:Prov', 'Reg:City', 'Reg:Mun', 'Reg:special_city_grouping', 'Reg:special_geographic_area', 'Prov:City', 'Prov:Mun', 'special_city_grouping:City', 'special_geographic_area:Mun', 'City:SubMun', 'City:Bgy', 'Mun:Bgy', 'SubMun:Bgy'])

export function normalizeGeographyLabel(value) {
  if (value == null) return null
  if (typeof value !== 'string') throw new TypeError('Geography label must be text')
  return value.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim() || null
}
export function validateGeographyContext(context, field) {
  if (!Object.hasOwn(GEOGRAPHY_CONTEXT_FIELDS, context) || !GEOGRAPHY_CONTEXT_FIELDS[context].includes(field)) throw new TypeError('Unsupported geography context or field')
}
export function selectGeographySnapshot(context, source) {
  if (!Object.hasOwn(GEOGRAPHY_CONTEXT_FIELDS, context)) throw new TypeError('Unsupported geography context')
  return Object.fromEntries(GEOGRAPHY_CONTEXT_FIELDS[context].map(field => {
    const value = source[field] ?? null
    normalizeGeographyLabel(value)
    return [field, value]
  }))
}
export function validateReferenceHierarchy(units) {
  const byId = new Map(), codes = new Set()
  for (const u of units) {
    if (!u.id || byId.has(u.id) || codes.has(u.official_code) || !/^[0-9]{10}$/.test(u.official_code) || !normalizeGeographyLabel(u.name)) throw new TypeError('Invalid or duplicate reference unit')
    byId.set(u.id, u); codes.add(u.official_code)
  }
  for (const u of units) {
    for (const link of ['parent_id', 'coding_parent_id']) {
      let p = u[link], seen = new Set([u.id])
      while (p) {
        if (seen.has(p)) throw new TypeError('Hierarchy cycle')
        seen.add(p)
        if (!byId.has(p)) throw new TypeError('Orphan parent')
        p = byId.get(p)[link]
      }
    }
    const p = byId.get(u.parent_id)
    if ((!p && u.structural_kind !== 'Reg') || (p && !EDGES.has(`${p.structural_kind}:${u.structural_kind}`))) throw new TypeError('Impossible hierarchy edge')
    if (['HUC', 'ICC'].includes(u.city_class) && p?.structural_kind !== 'Reg') throw new TypeError('Independent city cannot have a province parent')
  }
  return true
}
function labelMatches(u, label, aliases) {
  return normalizeGeographyLabel(u.name) === label || aliases.some(a => a.geography_unit_id === u.id && a.reference_version_id === u.reference_version_id && a.is_active && normalizeGeographyLabel(a.alias) === label)
}
export function validateHierarchyMatch(unit, snapshot, field, units, aliases = []) {
  if (field === 'barangay' && !normalizeGeographyLabel(snapshot.municipality_city)) return false
  const byId = new Map(units.map(u => [u.id, u])), ancestors = [], seen = new Set([unit.id])
  let parent = unit.parent_id
  while (parent) {
    if (seen.has(parent) || !byId.has(parent)) throw new TypeError('Invalid hierarchy')
    seen.add(parent); const u = byId.get(parent); ancestors.push(u); parent = u.parent_id
  }
  return (PARENTS[field] || []).every(f => {
    const label = normalizeGeographyLabel(snapshot[f])
    return !label || ancestors.some(u => LEVELS[f].includes(u.geographic_level) && labelMatches(u, label, aliases))
  })
}
export function buildMappingSuggestion({ context, field, source, units, aliases = [], referenceVersionId }) {
  validateGeographyContext(context, field)
  const snapshot = selectGeographySnapshot(context, source), label = normalizeGeographyLabel(snapshot[field])
  if (!label) return { status: 'not_applicable', reason: 'missing_value', candidate_ids: [] }
  const hits = units.filter(u => u.reference_version_id === referenceVersionId && LEVELS[field].includes(u.geographic_level) && labelMatches(u, label, aliases))
  const valid = hits.filter(u => validateHierarchyMatch(u, snapshot, field, units, aliases)).sort((a, b) => a.official_code.localeCompare(b.official_code))
  const missingParent = field === 'barangay' && !normalizeGeographyLabel(snapshot.municipality_city)
  return { status: valid.length === 1 ? 'suggested' : valid.length > 1 ? 'ambiguous' : 'unresolved',
    reason: missingParent ? 'missing_parent' : hits.length && !valid.length ? 'parent_conflict' : !hits.length ? 'no_exact_match' : valid.length > 1 ? 'duplicate_name' : 'deterministic_exact',
    candidate_ids: valid.map(u => u.id) }
}
export function validateMappingTransition(previous, next, { evidenceChanged = false } = {}) {
  const states = ['suggested', 'ambiguous', 'unresolved', 'not_applicable', 'confirmed']
  if (!states.includes(next) || (previous != null && !states.includes(previous))) throw new TypeError('Unknown review state')
  if (next === 'confirmed' && (previous == null || evidenceChanged)) throw new TypeError('Confirmation requires review of existing current evidence')
  if (previous === 'confirmed' && !evidenceChanged) throw new TypeError('Confirmed history cannot be rewritten')
  return true
}
export function identifyReferenceChanges(oldUnits, newUnits) {
  const next = new Map(newUnits.map(u => [u.official_code, u]))
  return oldUnits.flatMap(u => {
    const n = next.get(u.official_code), reasons = []
    if (!n) reasons.push('retired')
    else {
      if (u.name !== n.name) reasons.push('renamed')
      if (u.parent_code !== n.parent_code || u.structural_kind !== n.structural_kind || u.city_class !== n.city_class) reasons.push('reparented_or_reclassified')
    }
    return reasons.length ? [{ official_code: u.official_code, reasons, review_required: true }] : []
  })
}
