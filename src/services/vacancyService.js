// Vacancy-definition operations. Used by EmployerDashboard,
// VacanciesManagement, EventDetailPage, RegisterPage, WalkinPage.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

export async function insert(definition) {
  return unwrap(
    await supabase.from('vacancy_definitions').insert(definition).select('id').single(),
    'Could not create vacancy'
  )
}

export async function update(id, patch) {
  return unwrap(
    await supabase.from('vacancy_definitions').update(patch).eq('id', id),
    'Could not update vacancy'
  )
}

export async function remove(id) {
  return unwrap(
    await supabase.from('vacancy_definitions').delete().eq('id', id),
    'Could not delete vacancy'
  )
}

export async function findExistingMatch({ companyName, position, qualifications, salaryRange, placeOfAssignment, isActive }) {
  return unwrap(
    await supabase
      .from('vacancy_definitions')
      .select('id, company_name, position, qualifications, salary_range, place_of_assignment, is_active')
      .eq('company_name', companyName)
      .eq('position', position)
      .eq('qualifications', qualifications || '')
      .eq('salary_range', salaryRange || '')
      .eq('place_of_assignment', placeOfAssignment || '')
      .eq('is_active', !!isActive)
      .maybeSingle(),
    'Could not match vacancy'
  )
}

export async function listHistory(definitionId, limit = 10) {
  return unwrap(
    await supabase
      .from('vacancy_history')
      .select('*, profiles(full_name)')
      .eq('vacancy_definition_id', definitionId)
      .order('created_at', { ascending: false })
      .limit(limit),
    'Could not load history'
  )
}

// Bulk load of all vacancy definitions — used by the CSV importer to
// dedupe by (company, position) before inserting new ones.
export async function findExistingMatchBulk() {
  return unwrap(
    await supabase
      .from('vacancy_definitions')
      .select('id, company_name, position, qualifications, salary_range, place_of_assignment, is_active'),
    'Could not load existing definitions'
  )
}

export const vacancyService = {
  insert,
  update,
  remove,
  findExistingMatch,
  findExistingMatchBulk,
  listHistory,
}