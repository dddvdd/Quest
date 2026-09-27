import { supabase } from '../lib/supabase'
import { unwrapRpc } from '../lib/errors'

export const recruitmentService = {
  async listJobs(search = null) {
    return unwrapRpc(
      await supabase.rpc('list_platform_vacancies', { p_search: search || null }),
      'Could not load published jobs',
    )
  },

  async getJob(vacancyDefinitionId) {
    return unwrapRpc(
      await supabase.rpc('get_platform_vacancy', { p_vacancy_definition_id: vacancyDefinitionId }),
      'Could not load this job',
    )
  },

  async submitApplication(vacancyDefinitionId, notes = null) {
    return unwrapRpc(
      await supabase.rpc('submit_application', {
        p_vacancy_definition_id: vacancyDefinitionId,
        p_notes: notes || null,
      }),
      'Could not submit the application',
    )
  },

  async submitEventApplication(eventParticipationId, eventVacancyId, notes = null) {
    return unwrapRpc(
      await supabase.rpc('submit_event_application', {
        p_event_participation_id: eventParticipationId,
        p_event_vacancy_id: eventVacancyId,
        p_notes: notes || null,
      }),
      'Could not submit the formal event application',
    )
  },

  async listMyApplications() {
    return unwrapRpc(await supabase.rpc('list_my_applications'), 'Could not load your applications')
  },

  async withdrawApplication(applicationId) {
    return unwrapRpc(
      await supabase.rpc('withdraw_application', { p_application_id: applicationId }),
      'Could not withdraw the application',
    )
  },

  async listEmployerApplications(vacancyDefinitionId = null) {
    return unwrapRpc(
      await supabase.rpc('list_employer_applications', {
        p_vacancy_definition_id: vacancyDefinitionId || null,
      }),
      'Could not load the application inbox',
    )
  },

  async updateApplicationStatus(applicationId, newStatus) {
    return unwrapRpc(
      await supabase.rpc('update_application_status', {
        p_application_id: applicationId,
        p_new_status: newStatus,
      }),
      'Could not update the application',
    )
  },

  async publishVacancy(vacancyDefinitionId) {
    return unwrapRpc(
      await supabase.rpc('publish_vacancy', { p_vacancy_definition_id: vacancyDefinitionId }),
      'Could not publish the vacancy',
    )
  },

  async closeVacancy(vacancyDefinitionId) {
    return unwrapRpc(
      await supabase.rpc('close_vacancy', { p_vacancy_definition_id: vacancyDefinitionId }),
      'Could not close the vacancy',
    )
  },
}
