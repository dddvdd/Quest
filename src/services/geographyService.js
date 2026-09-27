import { validateGeographyContext, normalizeGeographyLabel, validateMappingTransition } from '../domain/geography.js'
import { AppError } from '../lib/errors.js'

const UNIT_FIELDS = 'id,reference_version_id,official_code,name,normalized_name,geographic_level,structural_kind,parent_id,coding_parent_id,parent_code,coding_parent_code,correspondence_code,city_class,status'
const MAPPING_FIELDS = 'id,source_context,source_entity_id,source_field,raw_value,normalized_value,source_hash,reference_version_id,mapped_geography_unit_id,mapping_status,mapping_method,reviewed_by,reviewed_at,revision,previous_mapping_id'
async function transport(operation, args) {
  const { supabase } = await import('../lib/supabase')
  let request
  if (operation === 'current') request = supabase.from('geography_reference_versions').select('id,reference_system,version_code,reference_date,publication_date,publication_reference,source_url,source_sha256').eq('is_current', true).single()
  if (operation === 'search') {
    request = supabase.from('geography_units').select(UNIT_FIELDS).eq('reference_version_id', args.versionId).eq('normalized_name', args.label)
    if (args.parentId) request = request.eq('parent_id', args.parentId)
    if (args.level) request = request.eq('geographic_level', args.level)
    request = request.order('official_code').limit(100)
  }
  if (operation === 'mappings') request = supabase.from('geography_mappings').select(MAPPING_FIELDS).eq('source_context', args.context).eq('source_entity_id', args.entityId).order('revision', { ascending: false }).limit(100)
  if (operation === 'candidates') request = supabase.rpc('get_geography_mapping_candidates', args)
  if (operation === 'save') request = supabase.rpc('save_geography_mapping', args)
  const { data, error } = await request
  if (error) throw new AppError('Geography operation is unavailable', { code: error.code })
  return data
}
// Reference reads are public. All entity-management calls are admin-authorized by PostgreSQL.
export function createGeographyService(reader = transport) {
  async function read(operation, args) {
    const payload = await reader(operation, args)
    const fields = operation === 'current' ? 'id,reference_system,version_code,reference_date,publication_date,publication_reference,source_url,source_sha256'
      : operation === 'search' ? UNIT_FIELDS : operation === 'candidates' ? 'status,reason,candidate_ids,source_hash,reference_version_id' : MAPPING_FIELDS
    const select = value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid geography response')
      return Object.fromEntries(fields.split(',').filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]))
    }
    return Array.isArray(payload) ? payload.map(select) : select(payload)
  }
  return {
    getCurrentReferenceVersion: () => read('current', {}),
    searchGeographyUnits: ({ versionId, label, parentId, level } = {}) => {
      const normalized = normalizeGeographyLabel(label)
      if (!versionId || !normalized || (level && !['Reg', 'Prov', 'City', 'Mun', 'SubMun', 'Bgy'].includes(level))) throw new TypeError('Supply reference version and exact label')
      return read('search', { versionId, label: normalized, parentId, level })
    },
    getEntityMappings: (context, entityId) => {
      if (!entityId) throw new TypeError('Source identity required')
      // Validating a real field also rejects inherited context keys.
      const field = context === 'event_geography' ? 'location' : 'province'
      validateGeographyContext(context, field)
      return read('mappings', { context, entityId })
    },
    getMappingCandidates: (context, entityId, field) => {
      validateGeographyContext(context, field)
      if (!entityId) throw new TypeError('Source identity required')
      return read('candidates', { p_context: context, p_entity: entityId, p_field: field })
    },
    saveMapping: ({ context, entityId, field, status, targetId = null, sourceHash, previousId = null, previousStatus = null, evidenceChanged = false, note = null }) => {
      validateGeographyContext(context, field)
      validateMappingTransition(previousStatus, status, { evidenceChanged })
      if (!entityId || !/^[0-9a-f]{64}$/.test(sourceHash) || (note != null && (typeof note !== 'string' || note.length > 500))) throw new TypeError('Invalid mapping evidence')
      return read('save', { p_context: context, p_entity: entityId, p_field: field, p_status: status, p_target: targetId, p_hash: sourceHash, p_previous: previousId, p_note: note })
    },
  }
}
export const geographyService = createGeographyService()
