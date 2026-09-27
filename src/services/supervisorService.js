// Supervisor-scoped reads. RLS + jurisdiction filtering keeps visibility
// scoped to the supervisor's municipality (or all of Cagayan for
// provincial supervisors). Page logic stays here, not in pages.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import { eventService } from './eventService'

export async function fetchVisibleEvents({ isProvincial, jurisdiction }) {
  const all = await eventService.listAllOrdered()
  if (isProvincial) return all
  return (all || []).filter(e =>
    e.location && e.location.toLowerCase() === (jurisdiction || '').toLowerCase()
  )
}

// Returns counts of common metrics scoped to the supervisor's visible events.
// `selectedEvent` narrows to a single event; otherwise counts over all visible.
export async function fetchSummary({ selectedEvent, visibleEventIds }) {
  // Build the basic scoping filter (event_id eq or in)
  const eventScope = (q) => {
    if (selectedEvent) return q.eq('event_id', selectedEvent)
    if (visibleEventIds && visibleEventIds.length > 0) return q.in('event_id', visibleEventIds)
    return q
  }

  const [
    reg, checked, walk, iv, ref, ft, pwd, rw, ofw,
  ] = await Promise.all([
    eventScope(supabase.from('registrants').select('id', { count: 'exact', head: true })),
    eventScope(supabase.from('registrants').select('id', { count: 'exact', head: true }).eq('check_in_status', 'checked_in')),
    eventScope(supabase.from('registrants').select('id', { count: 'exact', head: true }).eq('registration_type', 'walkin')),
    eventScope(supabase.from('interview_logs').select('id', { count: 'exact', head: true })),
    eventScope(supabase.from('medical_referrals').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    eventScope(supabase.from('registrants').select('id', { count: 'exact', head: true }).eq('first_time_jobseeker', true)),
    eventScope(supabase.from('registrants').select('id', { count: 'exact', head: true }).eq('has_disability', true)),
    eventScope(supabase.from('registrants').select('id', { count: 'exact', head: true }).eq('returning_worker', true)),
    eventScope(supabase.from('registrants').select('id', { count: 'exact', head: true }).eq('returning_ofw', true)),
  ])
  // wrap errors
  for (const r of [reg, checked, walk, iv, ref, ft, pwd, rw, ofw]) {
    if (r.error) throw r.error
  }
  return {
    registered: reg.count || 0,
    checkedIn: checked.count || 0,
    walkIns: walk.count || 0,
    interviews: iv.count || 0,
    activeReferrals: ref.count || 0,
    firstTimeJobseekers: ft.count || 0,
    pwd: pwd.count || 0,
    returningWorkers: rw.count || 0,
    returningOfws: ofw.count || 0,
  }
}

// Detail fetchers for the overview-card modals.
export async function fetchOverviewCard({ card, selectedEvent, visibleEventIds }) {
  const eventFilter = (q) => {
    if (selectedEvent) return q.eq('event_id', selectedEvent)
    if (visibleEventIds && visibleEventIds.length > 0) return q.in('event_id', visibleEventIds)
    return q
  }
  if (card.table === 'interviews') {
    let q = supabase
      .from('interview_logs')
      .select(`id, interview_status, interview_date, company, position, interview_notes, event_id,
        registrants!inner(first_name, middle_name, last_name, email, contact_no, unique_id)`)
      .order('interview_date', { ascending: false })
    q = eventFilter(q)
    if (card.filterKey) q = q.eq(card.filterKey, card.filterValue)
    return unwrap(q, 'Could not load interviews')
  }
  if (card.table === 'referrals') {
    let q = supabase
      .from('medical_referrals')
      .select(`id, status, notes, created_at, event_id,
        registrants!inner(first_name, middle_name, last_name, email, contact_no, unique_id)`)
      .order('created_at', { ascending: false })
    q = eventFilter(q)
    if (card.filterKey) q = q.eq(card.filterKey, card.filterValue)
    return unwrap(q, 'Could not load referrals')
  }
  // Default: registrants table
  let q = supabase
    .from('registrants')
    .select(`unique_id, first_name, middle_name, last_name, email, contact_no,
      sex, civil_status, province, municipality_city, barangay,
      highest_educational_attainment, course_program, employment_preference,
      check_in_status, registration_type, created_at`)
    .order('last_name', { ascending: true })
  q = eventFilter(q)
  if (card.filterKey) q = q.eq(card.filterKey, card.filterValue)
  return unwrap(q, 'Could not load registrants')
}

// One-shot fetch of all supervisor-scoped report data, in one place.
export async function fetchReportData({ selectedEvent, visibleEventIds }) {
  const filterByEvent = (q) => {
    if (selectedEvent) return q.eq('event_id', selectedEvent)
    if (visibleEventIds && visibleEventIds.length > 0) return q.in('event_id', visibleEventIds)
    return q
  }

  const [reg, ints, refs, vacs] = await Promise.all([
    filterByEvent(supabase.from('registrants').select(`
      id, first_name, middle_name, last_name, email, sex, civil_status,
      municipality_city, province, barangay, highest_educational_attainment,
      employment_preference, check_in_status, registration_type,
      first_time_jobseeker, has_disability, returning_worker, returning_ofw,
      birthdate, event_id, created_at,
      events!inner(event_name, location)
    `)),
    filterByEvent(supabase.from('interview_logs').select(`
      id, interview_status, company, position, interview_date,
      event_id, registrants!inner(first_name, last_name, municipality_city),
      events!inner(event_name)
    `)),
    filterByEvent(supabase.from('medical_referrals').select(`
      id, status, created_at, event_id,
      registrants!inner(first_name, last_name)
    `)),
    filterByEvent(supabase.from('event_vacancies').select(`
      id, slots_offered, slots_filled, event_id,
      vacancy_definitions!inner(company_name, position),
      events!inner(event_name)
    `)),
  ])
  for (const r of [reg, ints, refs, vacs]) {
    if (r.error) throw r.error
  }
  return {
    registrants: reg.data || [],
    interviews: ints.data || [],
    referrals: refs.data || [],
    vacancies: vacs.data || [],
  }
}

export const supervisorService = {
  fetchVisibleEvents,
  fetchSummary,
  fetchOverviewCard,
  fetchReportData,
}