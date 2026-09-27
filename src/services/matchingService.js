import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import {
  getJobseekerMatchProfile,
  getVacancyMatchProfile,
  getVacanciesMatchProfiles,
} from './eligibilityService'
import { evaluateEligibility } from '../domain/eligibility'
import {
  scoreMatch,
  rankMatches,
  MODEL_VERSION,
  MATCHING_WEIGHTS_V1,
  MATCHING_REASON_CODES,
} from '../domain/matching'

/**
 * Retrieves the authorized candidate pool for a specific vacancy.
 * Ensures employers can only match against applicants or event participants.
 */
export async function getVacancyCandidateMatchProfiles(vacancyDefinitionId, eventVacancyId = null) {
  return unwrap(
    await supabase.rpc('get_vacancy_candidate_match_profiles', {
      p_vacancy_definition_id: vacancyDefinitionId,
      p_event_vacancy_id: eventVacancyId,
    }),
    'Could not load authorized candidate pool for vacancy'
  )
}

/**
 * Evaluates and scores a single Jobseeker × Vacancy pair.
 * 
 * @param {string} jobseekerProfileId UUID of candidate profile
 * @param {string} vacancyDefinitionId UUID of vacancy definition
 * @param {Object} [options] Evaluation options
 * @returns {Promise<Object>} Detailed match score result
 */
export async function scoreJobseekerVacancyPair(jobseekerProfileId, vacancyDefinitionId, options = {}) {
  const [jobseeker, vacancy] = await Promise.all([
    getJobseekerMatchProfile(jobseekerProfileId),
    getVacancyMatchProfile(vacancyDefinitionId, options.eventVacancyId || null),
  ])

  const eligibility = evaluateEligibility(jobseeker, vacancy, options)
  const match = scoreMatch(jobseeker, vacancy, eligibility, options)

  return {
    jobseeker,
    vacancy,
    ...match,
  }
}

/**
 * Ranks all available vacancies for a jobseeker.
 * Evaluates deterministic eligibility, fits, and data coverage.
 * Excludes ineligible vacancies by default.
 * 
 * @param {string} jobseekerProfileId UUID of candidate profile
 * @param {Object} [options] Filter options (e.g. eventId, vacancyDefinitionIds, includeIneligible)
 * @returns {Promise<Array<Object>>} Ranked list of matching vacancies
 */
export async function rankVacanciesForJobseeker(jobseekerProfileId, options = {}) {
  const [jobseeker, vacancies] = await Promise.all([
    getJobseekerMatchProfile(jobseekerProfileId),
    getVacanciesMatchProfiles(options.vacancyDefinitionIds || null, options.eventId || null),
  ])

  const scoredMatches = (vacancies || []).map(vacancy => {
    const eligibility = evaluateEligibility(jobseeker, vacancy, options)
    const match = scoreMatch(jobseeker, vacancy, eligibility, options)
    return {
      vacancy,
      ...match,
    }
  })

  return rankMatches(scoredMatches, {
    includeIneligible: options.includeIneligible === true,
    tieBreakerKey: 'id',
  })
}

/**
 * Ranks authorized candidates for an employer's vacancy.
 * Only evaluates candidates from the vacancy's authorized recruitment pipeline (applications + event selections).
 * Preserves candidate privacy and excludes ineligible candidates by default.
 * 
 * @param {string} vacancyDefinitionId UUID of vacancy definition
 * @param {Object} [options] Options (e.g. eventVacancyId, includeIneligible)
 * @returns {Promise<Array<Object>>} Ranked list of matching candidates
 */
export async function rankCandidatesForVacancy(vacancyDefinitionId, options = {}) {
  const [vacancy, candidatePool] = await Promise.all([
    getVacancyMatchProfile(vacancyDefinitionId, options.eventVacancyId || null),
    getVacancyCandidateMatchProfiles(vacancyDefinitionId, options.eventVacancyId || null),
  ])

  const scoredMatches = (candidatePool || []).map(item => {
    const jobseeker = item.profile
    const eligibility = evaluateEligibility(jobseeker, vacancy, options)
    const match = scoreMatch(jobseeker, vacancy, eligibility, options)

    return {
      candidate: {
        participant_id: jobseeker?.participant_id,
        first_name: jobseeker?.first_name,
        last_name: jobseeker?.last_name,
        candidate_source: item.candidate_source,
        application_status: item.application_status,
        applied_at: item.applied_at,
      },
      ...match,
    }
  })

  return rankMatches(scoredMatches, {
    includeIneligible: options.includeIneligible === true,
    tieBreakerKey: 'participant_id',
  })
}

export const matchingService = {
  scoreJobseekerVacancyPair,
  rankVacanciesForJobseeker,
  rankCandidatesForVacancy,
  getVacancyCandidateMatchProfiles,
  MODEL_VERSION,
  MATCHING_WEIGHTS_V1,
  MATCHING_REASON_CODES,
}
