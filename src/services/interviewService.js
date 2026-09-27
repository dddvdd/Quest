// Interview-result operations. Used by InterviewLogPage,
// InterviewLogsManagement, ManualSearchPage (interview-result modal),
// and AdminReports.

import { supabase } from '../lib/supabase'
import { unwrap, unwrapRpc } from '../lib/errors'

export async function record(payload) {
  return unwrapRpc(
    await supabase.rpc('record_interview_result', payload),
    'Could not save interview result'
  )
}

export async function listForRegistrant(registrantId, eventId) {
  return unwrap(
    await supabase
      .from('interview_logs')
      .select('id, position, company, interview_status, interview_date, interviewer_id, profiles(full_name)')
      .eq('registrant_id', registrantId)
      .eq('event_id', eventId)
      .order('interview_date', { ascending: false }),
    'Could not load interview logs'
  )
}

export async function listForRegistrantWithContext(registrantId) {
  return unwrap(
    await supabase
      .from('interview_logs')
      .select('*, events(id, event_name), profiles(full_name), applications(id, event_vacancies(vacancy_definitions(company_name, position)))')
      .eq('registrant_id', registrantId)
      .order('interview_date', { ascending: false }),
    'Could not load interview logs'
  )
}

// Used by AdminReports.
export async function listAll() {
  return unwrap(
    await supabase.from('interview_logs').select('*'),
    'Could not load interview logs'
  )
}

// Admin reports — interviews joined with applicant demographics.
export async function listForReports() {
  return unwrap(
    await supabase
      .from('interview_logs')
      .select(`*, events(id, event_name), registrants!inner(employment_preference, municipality_city, province)`),
    'Could not load interviews'
  )
}

// HOTS applicants + their profiles — feeds the MedicalReferralEntry page.
export async function listHots() {
  return unwrap(
    await supabase
      .from('interview_logs')
      .select('id, company, position, interview_date, event_id, registrants(id, unique_id, first_name, middle_name, last_name, email, contact_no), events(id, event_name)')
      .eq('interview_status', 'hots')
      .order('interview_date', { ascending: false }),
    'Could not load HOTS records'
  )
}

// Admin interview logs page — full join with registrant, event, interviewer.
export async function listForManagement() {
  return unwrap(
    await supabase
      .from('interview_logs')
      .select('*, registrants(id, unique_id, first_name, middle_name, last_name, email, contact_no), events(id, event_name), profiles(full_name)')
      .order('interview_date', { ascending: false }),
    'Could not load interview logs'
  )
}

export const interviewService = {
  record,
  listForRegistrant,
  listForRegistrantWithContext,
  listAll,
  listForReports,
  listForManagement,
  listHots,
}