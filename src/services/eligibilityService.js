import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import { evaluateEligibility, ELIGIBILITY_STATUS, CHECK_STATUS, REASON_CODES } from '../domain/eligibility'

/**
 * Loads the structured matching payload for a jobseeker profile.
 * Single round-trip RPC.
 */
export async function getJobseekerMatchProfile(jobseekerProfileId) {
  return unwrap(
    await supabase.rpc('get_jobseeker_match_profile', {
      p_jobseeker_profile_id: jobseekerProfileId,
    }),
    'Could not load jobseeker match profile'
  )
}

/**
 * Loads the structured matching payload for a vacancy definition.
 * Single round-trip RPC.
 */
export async function getVacancyMatchProfile(vacancyDefinitionId, eventVacancyId = null) {
  return unwrap(
    await supabase.rpc('get_vacancy_match_profile', {
      p_vacancy_definition_id: vacancyDefinitionId,
      p_event_vacancy_id: eventVacancyId,
    }),
    'Could not load vacancy match profile'
  )
}

/**
 * Loads multiple structured vacancy matching payloads in a single batched call.
 * Eliminates N+1 query patterns for 1 x N matching.
 */
export async function getVacanciesMatchProfiles(vacancyDefinitionIds = null, eventId = null) {
  return unwrap(
    await supabase.rpc('get_vacancies_match_profiles', {
      p_vacancy_definition_ids: vacancyDefinitionIds,
      p_event_id: eventId,
    }),
    'Could not load vacancies match profiles'
  )
}

/**
 * Evaluates deterministic eligibility between a jobseeker and a vacancy.
 * 
 * @param {string} jobseekerProfileId UUID of jobseeker profile
 * @param {string} vacancyDefinitionId UUID of vacancy definition
 * @param {Object} [options] Evaluation options (e.g. eventVacancyId, currentDate)
 * @returns {Promise<Object>} Detailed eligibility evaluation result
 */
export async function checkEligibility(jobseekerProfileId, vacancyDefinitionId, options = {}) {
  const [jobseeker, vacancy] = await Promise.all([
    getJobseekerMatchProfile(jobseekerProfileId),
    getVacancyMatchProfile(vacancyDefinitionId, options.eventVacancyId || null),
  ])

  return evaluateEligibility(jobseeker, vacancy, options)
}

/**
 * Pure evaluation function using in-memory data objects.
 */
export function checkEligibilityDirect(jobseekerData, vacancyData, options = {}) {
  return evaluateEligibility(jobseekerData, vacancyData, options)
}

/**
 * Batched eligibility evaluation for 1 candidate across multiple vacancies.
 * Makes exactly 2 DB queries regardless of vacancy count.
 * 
 * @param {string} jobseekerProfileId UUID of candidate
 * @param {string[]|null} [vacancyDefinitionIds] Optional array of vacancy UUIDs (null = all active)
 * @param {Object} [options] Options (e.g. eventId, currentDate)
 * @returns {Promise<Array<{ vacancy: Object, eligibility: Object }>>}
 */
export async function batchCheckEligibility(jobseekerProfileId, vacancyDefinitionIds = null, options = {}) {
  const [jobseeker, vacancies] = await Promise.all([
    getJobseekerMatchProfile(jobseekerProfileId),
    getVacanciesMatchProfiles(vacancyDefinitionIds, options.eventId || null),
  ])

  const results = (vacancies || []).map(vacancy => ({
    vacancy,
    eligibility: evaluateEligibility(jobseeker, vacancy, options),
  }))

  return results
}

export const eligibilityService = {
  getJobseekerMatchProfile,
  getVacancyMatchProfile,
  getVacanciesMatchProfiles,
  checkEligibility,
  checkEligibilityDirect,
  batchCheckEligibility,
  ELIGIBILITY_STATUS,
  CHECK_STATUS,
  REASON_CODES,
}
