import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

export async function listOccupations(search = '') {
  let q = supabase.from('occupations').select('id, canonical_name, normalized_name').eq('is_active', true).order('canonical_name')
  if (search) q = q.or(`canonical_name.ilike.%${search}%,normalized_name.ilike.%${search}%`)
  return unwrap(q.limit(50), 'Could not load occupations')
}

export async function listOccupationAliases(occupationId) {
  return unwrap(
    await supabase
      .from('occupation_aliases')
      .select('alias, normalized_alias, alias_type')
      .eq('occupation_id', occupationId),
    'Could not load occupation aliases'
  )
}

export async function searchOccupations(search) {
  if (!search || search.length < 2) return []
  const aliases = await unwrap(
    await supabase
      .from('occupation_aliases')
      .select('occupation_id, alias')
      .ilike('normalized_alias', `%${search.toLowerCase()}%`)
      .limit(20),
    'Could not search occupations'
  )
  if (!aliases?.length) return []
  const occIds = [...new Set(aliases.map(a => a.occupation_id))]
  return unwrap(
    await supabase
      .from('occupations')
      .select('id, canonical_name')
      .in('id', occIds)
      .limit(20),
    'Could not load matching occupations'
  )
}

export async function listSkills(search = '') {
  let q = supabase.from('skills').select('id, canonical_name, normalized_name, skill_type').eq('is_active', true).order('canonical_name')
  if (search) q = q.or(`canonical_name.ilike.%${search}%,normalized_name.ilike.%${search}%`)
  return unwrap(q.limit(50), 'Could not load skills')
}

export async function listCertifications(search = '') {
  let q = supabase.from('certifications').select('id, canonical_name, normalized_name, issuing_organization, certification_type').eq('is_active', true).order('canonical_name')
  if (search) q = q.or(`canonical_name.ilike.%${search}%,normalized_name.ilike.%${search}%`)
  return unwrap(q.limit(50), 'Could not load certifications')
}

export async function listLanguages(search = '') {
  let q = supabase.from('languages').select('id, code, name, code_standard').eq('is_active', true).order('name')
  if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
  return unwrap(q.limit(50), 'Could not load languages')
}

export async function listIndustries() {
  return unwrap(
    await supabase
      .from('industries')
      .select('id, canonical_name, normalized_name')
      .eq('is_active', true)
      .order('canonical_name'),
    'Could not load industries'
  )
}

export async function listEducationLevels() {
  return unwrap(
    await supabase
      .from('education_levels')
      .select('id, code, name, rank')
      .order('rank'),
    'Could not load education levels'
  )
}

export async function listEmploymentTypes() {
  return unwrap(
    await supabase
      .from('employment_types')
      .select('id, code, name')
      .order('name'),
    'Could not load employment types'
  )
}

export async function listWorkArrangements() {
  return unwrap(
    await supabase
      .from('work_arrangements')
      .select('id, code, name')
      .order('name'),
    'Could not load work arrangements'
  )
}

export const referenceService = {
  listOccupations, listOccupationAliases, searchOccupations,
  listSkills, listCertifications, listLanguages,
  listIndustries, listEducationLevels, listEmploymentTypes, listWorkArrangements,
}
