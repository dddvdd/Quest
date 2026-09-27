import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

// --- Education requirements ---
export async function listEducationReqs(vacancyId) {
  return unwrap(
    await supabase
      .from('vacancy_education_requirements')
      .select('*, education_levels(id, code, name)')
      .eq('vacancy_definition_id', vacancyId)
      .order('created_at'),
    'Could not load education requirements'
  )
}

export async function createEducationReq(row) {
  return unwrap(
    await supabase
      .from('vacancy_education_requirements')
      .insert(row)
      .select()
      .single(),
    'Could not save education requirement'
  )
}

export async function removeEducationReq(id) {
  return unwrap(
    await supabase.from('vacancy_education_requirements').delete().eq('id', id),
    'Could not delete education requirement'
  )
}

// --- Experience requirements ---
export async function listExperienceReqs(vacancyId) {
  return unwrap(
    await supabase
      .from('vacancy_experience_requirements')
      .select('*, occupations(id, canonical_name), industries(id, canonical_name)')
      .eq('vacancy_definition_id', vacancyId)
      .order('created_at'),
    'Could not load experience requirements'
  )
}

export async function createExperienceReq(row) {
  return unwrap(
    await supabase
      .from('vacancy_experience_requirements')
      .insert(row)
      .select()
      .single(),
    'Could not save experience requirement'
  )
}

export async function removeExperienceReq(id) {
  return unwrap(
    await supabase.from('vacancy_experience_requirements').delete().eq('id', id),
    'Could not delete experience requirement'
  )
}

// --- Certification requirements ---
export async function listCertificationReqs(vacancyId) {
  return unwrap(
    await supabase
      .from('vacancy_certification_requirements')
      .select('*, certifications(id, canonical_name, issuing_organization)')
      .eq('vacancy_definition_id', vacancyId)
      .order('created_at'),
    'Could not load certification requirements'
  )
}

export async function createCertificationReq(row) {
  return unwrap(
    await supabase
      .from('vacancy_certification_requirements')
      .insert(row)
      .select()
      .single(),
    'Could not save certification requirement'
  )
}

export async function removeCertificationReq(id) {
  return unwrap(
    await supabase.from('vacancy_certification_requirements').delete().eq('id', id),
    'Could not delete certification requirement'
  )
}

// --- Language requirements ---
export async function listLanguageReqs(vacancyId) {
  return unwrap(
    await supabase
      .from('vacancy_language_requirements')
      .select('*, languages(id, code, name)')
      .eq('vacancy_definition_id', vacancyId)
      .order('created_at'),
    'Could not load language requirements'
  )
}

export async function createLanguageReq(row) {
  return unwrap(
    await supabase
      .from('vacancy_language_requirements')
      .insert(row)
      .select()
      .single(),
    'Could not save language requirement'
  )
}

export async function removeLanguageReq(id) {
  return unwrap(
    await supabase.from('vacancy_language_requirements').delete().eq('id', id),
    'Could not delete language requirement'
  )
}

// --- Vacancy skills (already exists in vacancy_skills, just add helper) ---
export async function listVacancySkills(vacancyId) {
  return unwrap(
    await supabase
      .from('vacancy_skills')
      .select('*, skills(id, canonical_name, skill_type)')
      .eq('vacancy_definition_id', vacancyId)
      .order('importance'),
    'Could not load vacancy skills'
  )
}

export async function createVacancySkill(row) {
  return unwrap(
    await supabase
      .from('vacancy_skills')
      .insert(row)
      .select()
      .single(),
    'Could not save vacancy skill'
  )
}

export async function removeVacancySkill(id) {
  return unwrap(
    await supabase.from('vacancy_skills').delete().eq('id', id),
    'Could not delete vacancy skill'
  )
}

export const vacancyRequirementService = {
  listEducationReqs, createEducationReq, removeEducationReq,
  listExperienceReqs, createExperienceReq, removeExperienceReq,
  listCertificationReqs, createCertificationReq, removeCertificationReq,
  listLanguageReqs, createLanguageReq, removeLanguageReq,
  listVacancySkills, createVacancySkill, removeVacancySkill,
}
