BEGIN;

-- Read-only aggregate API. Existing RLS and table ACLs remain authoritative.
CREATE OR REPLACE FUNCTION public.get_employment_intelligence(
  p_metric_ids text[], p_start date DEFAULT NULL, p_end date DEFAULT NULL,
  p_period text DEFAULT NULL, p_dimension text DEFAULT NULL, p_event_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_metric text;
  v_definition jsonb;
  v_registry constant jsonb := '{"unique_participants":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"unique_jobseekers":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"jobseekers_registered":{"status":"available","measure":"count","date_basis":"participants.created_at","dimensions":[],"event_scope":false},"active_jobseekers":{"status":"unavailable","measure":"count","date_basis":"unavailable","dimensions":[],"event_scope":false},"unique_vacancy_definitions":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"active_vacancies":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"vacancies_posted":{"status":"available","measure":"count","date_basis":"vacancy_definitions.created_at","dimensions":[],"event_scope":false},"event_vacancy_offerings":{"status":"available","measure":"count","date_basis":"events.event_date","dimensions":[],"event_scope":true},"jobseekers_by_preferred_occupation":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["occupation"],"event_scope":false},"jobseekers_by_preferred_industry":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["industry"],"event_scope":false},"skills_supply":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["skill"],"event_scope":false},"skills_demand_required":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["skill"],"event_scope":false},"skills_demand_preferred":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["skill"],"event_scope":false},"skill_gap":{"status":"available","measure":"ratio","date_basis":"current_snapshot","dimensions":["skill"],"event_scope":false},"vacancies_by_occupation":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["occupation"],"event_scope":false},"vacancies_by_industry":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["industry"],"event_scope":false},"vacancies_by_employment_type":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["employment_type"],"event_scope":false},"vacancies_by_work_arrangement":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["work_arrangement"],"event_scope":false},"jobseekers_by_employment_type":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["employment_type"],"event_scope":false},"jobseekers_by_work_arrangement":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":["work_arrangement"],"event_scope":false},"candidate_interest_count":{"status":"available","measure":"count","date_basis":"participation_vacancies.created_at","dimensions":[],"event_scope":true},"applications_submitted":{"status":"available","measure":"count","date_basis":"applications.applied_at","dimensions":[],"event_scope":true},"interviews_recorded":{"status":"available","measure":"count","date_basis":"interview_logs.interview_date","dimensions":[],"event_scope":true},"interviews_completed":{"status":"unavailable","measure":"count","date_basis":"unavailable","dimensions":[],"event_scope":false},"hires_recorded":{"status":"available","measure":"count","date_basis":"employment_outcomes.hired_at","dimensions":[],"event_scope":true},"application_to_recorded_interview_rate":{"status":"available","measure":"rate","date_basis":"applications.applied_at","dimensions":[],"event_scope":true},"application_to_confirmed_hire_rate":{"status":"available","measure":"rate","date_basis":"applications.applied_at","dimensions":[],"event_scope":true},"recorded_interview_to_confirmed_hire_rate":{"status":"available","measure":"rate","date_basis":"applications.applied_at","dimensions":[],"event_scope":true},"event_participation_count":{"status":"available","measure":"count","date_basis":"events.event_date","dimensions":[],"event_scope":true},"event_unique_participants":{"status":"available","measure":"count","date_basis":"events.event_date","dimensions":[],"event_scope":true},"event_application_count":{"status":"available","measure":"count","date_basis":"events.event_date","dimensions":[],"event_scope":true},"event_interview_count":{"status":"available","measure":"count","date_basis":"events.event_date","dimensions":[],"event_scope":true},"event_hire_count":{"status":"available","measure":"count","date_basis":"events.event_date","dimensions":[],"event_scope":true},"employer_participation_count":{"status":"available","measure":"count","date_basis":"events.event_date","dimensions":[],"event_scope":true},"event_employers_checked_in":{"status":"available","measure":"count","date_basis":"events.event_date","dimensions":[],"event_scope":true},"active_approved_employers":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"employers_with_vacancies":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"follow_ups_completed":{"status":"available","measure":"count","date_basis":"follow_ups.completed_date","dimensions":[],"event_scope":false},"jobseekers_without_occupation_preference":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"jobseekers_without_skills":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"vacancies_without_canonical_occupation":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"vacancies_without_salary":{"status":"available","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"applications_without_final_outcome":{"status":"available","measure":"count","date_basis":"applications.applied_at","dimensions":[],"event_scope":true},"occupation_preference_coverage":{"status":"available","measure":"percent","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"skill_coverage":{"status":"available","measure":"percent","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"vacancy_occupation_coverage":{"status":"available","measure":"percent","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"vacancy_salary_coverage":{"status":"available","measure":"percent","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"vacancy_required_skill_coverage":{"status":"available","measure":"percent","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"application_outcome_coverage":{"status":"available","measure":"percent","date_basis":"applications.applied_at","dimensions":[],"event_scope":true},"jobseekers_by_residence":{"status":"unavailable","measure":"count","date_basis":"current_snapshot","dimensions":["residence_municipality"],"event_scope":false},"jobseekers_by_preferred_location":{"status":"unavailable","measure":"count","date_basis":"current_snapshot","dimensions":["preferred_work_municipality"],"event_scope":false},"vacancies_by_work_location":{"status":"unavailable","measure":"count","date_basis":"current_snapshot","dimensions":["vacancy_work_municipality"],"event_scope":false},"vacancy_salary_average":{"status":"unavailable","measure":"average","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"jobseeker_salary_median":{"status":"unavailable","measure":"median","date_basis":"current_snapshot","dimensions":[],"event_scope":false},"program_reach":{"status":"unavailable","measure":"count","date_basis":"unavailable","dimensions":[],"event_scope":false},"special_sector_count":{"status":"policy_pending","measure":"count","date_basis":"current_snapshot","dimensions":[],"event_scope":false}}'::jsonb;
  v_cells jsonb := '[]'::jsonb;
  v_result jsonb;
  v_query text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.role::text='admin' AND pr.is_active=true
  ) THEN
    RAISE EXCEPTION 'Government analytics requires an active administrator' USING ERRCODE='42501';
  END IF;
  IF p_metric_ids IS NULL OR cardinality(p_metric_ids) NOT BETWEEN 1 AND 20
     OR (SELECT count(DISTINCT id) FROM unnest(p_metric_ids) id) <> cardinality(p_metric_ids)
     OR array_position(p_metric_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Request 1 to 20 distinct metric IDs' USING ERRCODE='22023';
  END IF;
  IF (p_start IS NULL) <> (p_end IS NULL) OR p_start >= p_end
     OR (p_period IS NOT NULL AND (p_period NOT IN ('day','month','year') OR p_start IS NULL))
     OR (p_start IS NOT NULL AND (p_start < DATE '0001-01-01' OR p_end > DATE '9999-12-31')) THEN
    RAISE EXCEPTION 'Invalid half-open date range or period' USING ERRCODE='22023';
  END IF;

  FOREACH v_metric IN ARRAY p_metric_ids LOOP
    v_definition := v_registry -> v_metric;
    IF v_definition IS NULL THEN RAISE EXCEPTION 'Unknown metric' USING ERRCODE='22023'; END IF;
    IF v_definition->>'date_basis'='current_snapshot' AND (p_start IS NOT NULL OR p_period IS NOT NULL)
       OR p_event_id IS NOT NULL AND NOT (v_definition->>'event_scope')::boolean
       OR p_dimension IS NOT NULL AND NOT (v_definition->'dimensions' ? p_dimension)
       OR v_metric='skill_gap' AND p_dimension IS DISTINCT FROM 'skill' THEN
      RAISE EXCEPTION 'Unsupported scope, series or dimension' USING ERRCODE='22023';
    END IF;
    IF v_definition->>'status' <> 'available' THEN
      v_cells := v_cells || jsonb_build_array(jsonb_build_object(
        'metric_id',v_metric,'period',NULL,'dimension',NULL,'value',NULL,'numerator',NULL,'denominator',NULL,
        'suppressed',v_definition->>'status'='policy_pending','status',v_definition->>'status'));
      CONTINUE;
    END IF;

    -- Query fragments are server-authored constants selected by the registry.
    -- Only bound parameters carry request values; no client SQL is interpolated.
    CASE v_metric
    WHEN 'unique_participants' THEN v_query := $source$
      SELECT p.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.participants p
      WHERE (true)
    $source$;
    WHEN 'unique_jobseekers' THEN v_query := $source$
      SELECT p.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.participants p JOIN public.jobseeker_profiles jp ON jp.participant_id=p.id
      WHERE (true)
    $source$;
    WHEN 'jobseekers_registered' THEN v_query := $source$
      SELECT p.id AS unit_id, (p.created_at AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.participants p JOIN public.jobseeker_profiles jp ON jp.participant_id=p.id
      WHERE (true)
    $source$;
    WHEN 'unique_vacancy_definitions' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd
      WHERE (true)
    $source$;
    WHEN 'active_vacancies' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd
      WHERE (vd.is_active = true)
    $source$;
    WHEN 'vacancies_posted' THEN v_query := $source$
      SELECT vd.id AS unit_id, (vd.created_at AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd
      WHERE (true)
    $source$;
    WHEN 'event_vacancy_offerings' THEN v_query := $source$
      SELECT ev.id AS unit_id, e.event_date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.event_vacancies ev JOIN public.events e ON e.id=ev.event_id
      WHERE (($5 IS NULL OR e.id=$5))
    $source$;
    WHEN 'event_participation_count' THEN v_query := $source$
      SELECT ep.id AS unit_id, e.event_date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.event_participations ep JOIN public.events e ON e.id=ep.event_id
      WHERE (($5 IS NULL OR e.id=$5))
    $source$;
    WHEN 'event_unique_participants' THEN v_query := $source$
      SELECT ep.participant_id AS unit_id, e.event_date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.event_participations ep JOIN public.events e ON e.id=ep.event_id
      WHERE (($5 IS NULL OR e.id=$5))
    $source$;
    WHEN 'event_application_count' THEN v_query := $source$
      SELECT a.id AS unit_id, e.event_date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id JOIN public.events e ON e.id=ev.event_id
      WHERE (($5 IS NULL OR e.id=$5))
    $source$;
    WHEN 'event_interview_count' THEN v_query := $source$
      SELECT il.id AS unit_id, e.event_date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.interview_logs il JOIN public.events e ON e.id=il.event_id
      WHERE (($5 IS NULL OR e.id=$5))
    $source$;
    WHEN 'event_hire_count' THEN v_query := $source$
      SELECT a.id AS unit_id, e.event_date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id JOIN public.events e ON e.id=ev.event_id JOIN latest_outcomes lo ON lo.application_id=a.id
      WHERE (($5 IS NULL OR e.id=$5) AND lo.outcome='hired' AND lo.verified_by IS NOT NULL AND lo.verification_date IS NOT NULL AND lo.hired_at IS NOT NULL)
    $source$;
    WHEN 'candidate_interest_count' THEN v_query := $source$
      SELECT md5(pv.participation_id::text || ':' || pv.event_vacancy_id::text)::uuid AS unit_id, (pv.created_at AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.participation_vacancies pv JOIN public.event_vacancies ev ON ev.id=pv.event_vacancy_id
      WHERE (($5 IS NULL OR ev.event_id=$5))
    $source$;
    WHEN 'applications_submitted' THEN v_query := $source$
      SELECT a.id AS unit_id, (a.applied_at AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id
      WHERE (($5 IS NULL OR ev.event_id=$5))
    $source$;
    WHEN 'interviews_recorded' THEN v_query := $source$
      SELECT il.id AS unit_id, (il.interview_date AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.interview_logs il
      WHERE (($5 IS NULL OR il.event_id=$5))
    $source$;
    WHEN 'hires_recorded' THEN v_query := $source$
      SELECT a.id AS unit_id, lo.hired_at AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id JOIN latest_outcomes lo ON lo.application_id=a.id
      WHERE (($5 IS NULL OR ev.event_id=$5) AND lo.outcome='hired' AND lo.verified_by IS NOT NULL AND lo.verification_date IS NOT NULL AND lo.hired_at IS NOT NULL)
    $source$;
    WHEN 'application_to_recorded_interview_rate' THEN v_query := $source$
      SELECT a.id AS unit_id, (a.applied_at AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (EXISTS (SELECT 1 FROM public.interview_logs il WHERE il.application_id=a.id)) AS success, (true) AS denominator_member
      FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id
      WHERE (($5 IS NULL OR ev.event_id=$5))
    $source$;
    WHEN 'application_to_confirmed_hire_rate' THEN v_query := $source$
      SELECT a.id AS unit_id, (a.applied_at AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (EXISTS (SELECT 1 FROM latest_outcomes lo WHERE lo.application_id=a.id AND lo.outcome='hired' AND lo.verified_by IS NOT NULL AND lo.verification_date IS NOT NULL AND lo.hired_at IS NOT NULL)) AS success, (true) AS denominator_member
      FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id
      WHERE (($5 IS NULL OR ev.event_id=$5))
    $source$;
    WHEN 'recorded_interview_to_confirmed_hire_rate' THEN v_query := $source$
      SELECT a.id AS unit_id, (a.applied_at AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (EXISTS (SELECT 1 FROM latest_outcomes lo WHERE lo.application_id=a.id AND lo.outcome='hired' AND lo.verified_by IS NOT NULL AND lo.verification_date IS NOT NULL AND lo.hired_at IS NOT NULL)) AS success, (true) AS denominator_member
      FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id
      WHERE (($5 IS NULL OR ev.event_id=$5) AND EXISTS (SELECT 1 FROM public.interview_logs il WHERE il.application_id=a.id))
    $source$;
    WHEN 'employer_participation_count' THEN v_query := $source$
      SELECT ee.id AS unit_id, e.event_date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.employer_event_participations ee JOIN public.events e ON e.id=ee.event_id
      WHERE (($5 IS NULL OR e.id=$5) AND ee.status <> 'cancelled')
    $source$;
    WHEN 'event_employers_checked_in' THEN v_query := $source$
      SELECT ee.id AS unit_id, e.event_date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.employer_event_participations ee JOIN public.events e ON e.id=ee.event_id
      WHERE (($5 IS NULL OR e.id=$5) AND ee.status = 'checked_in')
    $source$;
    WHEN 'active_approved_employers' THEN v_query := $source$
      SELECT em.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.employers em
      WHERE (em.is_active = true AND em.registration_status='approved')
    $source$;
    WHEN 'employers_with_vacancies' THEN v_query := $source$
      SELECT vd.employer_id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd
      WHERE (vd.employer_id IS NOT NULL)
    $source$;
    WHEN 'follow_ups_completed' THEN v_query := $source$
      SELECT fu.id AS unit_id, (fu.completed_date AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.follow_ups fu
      WHERE (fu.status='completed' AND fu.completed_date IS NOT NULL)
    $source$;
    WHEN 'skills_supply' THEN v_query := $source$
      SELECT js.jobseeker_profile_id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.canonical_name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.jobseeker_skills js JOIN public.skills t ON t.id=js.skill_id
      WHERE ((js.source IN ('self_reported','admin_entered','employer_reported') OR (js.source = 'llm_inferred' AND EXISTS (SELECT 1 FROM public.ai_extraction_suggestions s WHERE s.entity_type = 'jobseeker_profile' AND s.entity_id = js.jobseeker_profile_id AND s.suggestion_type = 'skill' AND s.review_status = 'accepted' AND s.reviewed_by IS NOT NULL AND s.reviewed_at IS NOT NULL AND COALESCE(s.edited_canonical_id,s.canonical_id) = js.skill_id))))
    $source$;
    WHEN 'skills_demand_required' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.canonical_name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_skills vs JOIN public.vacancy_definitions vd ON vd.id=vs.vacancy_definition_id JOIN public.skills t ON t.id=vs.skill_id
      WHERE (vd.is_active = true AND vs.importance='required')
    $source$;
    WHEN 'skills_demand_preferred' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.canonical_name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_skills vs JOIN public.vacancy_definitions vd ON vd.id=vs.vacancy_definition_id JOIN public.skills t ON t.id=vs.skill_id
      WHERE (vd.is_active = true AND vs.importance='preferred')
    $source$;
    WHEN 'jobseekers_by_preferred_occupation' THEN v_query := $source$
      SELECT op.jobseeker_profile_id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.canonical_name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.jobseeker_occupation_preferences op JOIN public.occupations t ON t.id=op.occupation_id
      WHERE ((op.source IN ('self_reported','admin_entered','employer_reported') OR (op.source = 'llm_inferred' AND EXISTS (SELECT 1 FROM public.ai_extraction_suggestions s WHERE s.entity_type = 'jobseeker_profile' AND s.entity_id = op.jobseeker_profile_id AND s.suggestion_type = 'occupation' AND s.review_status = 'accepted' AND s.reviewed_by IS NOT NULL AND s.reviewed_at IS NOT NULL AND COALESCE(s.edited_canonical_id,s.canonical_id) = op.occupation_id))))
    $source$;
    WHEN 'jobseekers_by_preferred_industry' THEN v_query := $source$
      SELECT ip.jobseeker_profile_id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.canonical_name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.jobseeker_industry_preferences ip JOIN public.industries t ON t.id=ip.industry_id
      WHERE ((ip.source IN ('self_reported','admin_entered','employer_reported') OR (ip.source = 'llm_inferred' AND EXISTS (SELECT 1 FROM public.ai_extraction_suggestions s WHERE s.entity_type = 'jobseeker_profile' AND s.entity_id = ip.jobseeker_profile_id AND s.suggestion_type = 'industry' AND s.review_status = 'accepted' AND s.reviewed_by IS NOT NULL AND s.reviewed_at IS NOT NULL AND COALESCE(s.edited_canonical_id,s.canonical_id) = ip.industry_id))))
    $source$;
    WHEN 'vacancies_by_occupation' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.canonical_name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd JOIN public.occupations t ON t.id=vd.occupation_id
      WHERE (vd.is_active = true)
    $source$;
    WHEN 'vacancies_by_industry' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.canonical_name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd JOIN public.industries t ON t.id=vd.industry_id
      WHERE (vd.is_active = true)
    $source$;
    WHEN 'vacancies_by_employment_type' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd JOIN public.employment_types t ON t.id=vd.employment_type_id
      WHERE (vd.is_active = true)
    $source$;
    WHEN 'vacancies_by_work_arrangement' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd JOIN public.work_arrangements t ON t.id=vd.work_arrangement_id
      WHERE (vd.is_active = true)
    $source$;
    WHEN 'jobseekers_by_employment_type' THEN v_query := $source$
      SELECT pref.jobseeker_profile_id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.jobseeker_employment_type_preferences pref JOIN public.employment_types t ON t.id=pref.employment_type_id
      WHERE (true)
    $source$;
    WHEN 'jobseekers_by_work_arrangement' THEN v_query := $source$
      SELECT pref.jobseeker_profile_id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.jobseeker_work_arrangement_preferences pref JOIN public.work_arrangements t ON t.id=pref.work_arrangement_id
      WHERE (true)
    $source$;
    WHEN 'jobseekers_without_occupation_preference' THEN v_query := $source$
      SELECT p.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.participants p JOIN public.jobseeker_profiles jp ON jp.participant_id=p.id
      WHERE (NOT EXISTS (SELECT 1 FROM public.jobseeker_occupation_preferences op WHERE op.jobseeker_profile_id=jp.participant_id AND (op.source IN ('self_reported','admin_entered','employer_reported') OR (op.source = 'llm_inferred' AND EXISTS (SELECT 1 FROM public.ai_extraction_suggestions s WHERE s.entity_type = 'jobseeker_profile' AND s.entity_id = op.jobseeker_profile_id AND s.suggestion_type = 'occupation' AND s.review_status = 'accepted' AND s.reviewed_by IS NOT NULL AND s.reviewed_at IS NOT NULL AND COALESCE(s.edited_canonical_id,s.canonical_id) = op.occupation_id)))))
    $source$;
    WHEN 'jobseekers_without_skills' THEN v_query := $source$
      SELECT p.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.participants p JOIN public.jobseeker_profiles jp ON jp.participant_id=p.id
      WHERE (NOT EXISTS (SELECT 1 FROM public.jobseeker_skills js WHERE js.jobseeker_profile_id=jp.participant_id AND (js.source IN ('self_reported','admin_entered','employer_reported') OR (js.source = 'llm_inferred' AND EXISTS (SELECT 1 FROM public.ai_extraction_suggestions s WHERE s.entity_type = 'jobseeker_profile' AND s.entity_id = js.jobseeker_profile_id AND s.suggestion_type = 'skill' AND s.review_status = 'accepted' AND s.reviewed_by IS NOT NULL AND s.reviewed_at IS NOT NULL AND COALESCE(s.edited_canonical_id,s.canonical_id) = js.skill_id)))))
    $source$;
    WHEN 'vacancies_without_canonical_occupation' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd
      WHERE (vd.is_active = true AND vd.occupation_id IS NULL)
    $source$;
    WHEN 'vacancies_without_salary' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.vacancy_definitions vd
      WHERE (vd.is_active = true AND NOT COALESCE((vd.salary_min IS NOT NULL AND vd.salary_max IS NOT NULL AND vd.salary_min >= 0 AND vd.salary_max >= vd.salary_min AND NULLIF(btrim(vd.salary_currency),'') IS NOT NULL AND NULLIF(btrim(vd.salary_period),'') IS NOT NULL),false))
    $source$;
    WHEN 'applications_without_final_outcome' THEN v_query := $source$
      SELECT a.id AS unit_id, (a.applied_at AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id
      WHERE (($5 IS NULL OR ev.event_id=$5) AND NOT EXISTS (SELECT 1 FROM latest_outcomes lo WHERE lo.application_id=a.id AND lo.outcome IN ('hired','not_hired','offer_declined','withdrawn')))
    $source$;
    WHEN 'occupation_preference_coverage' THEN v_query := $source$
      SELECT p.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (EXISTS (SELECT 1 FROM public.jobseeker_occupation_preferences op WHERE op.jobseeker_profile_id=jp.participant_id AND (op.source IN ('self_reported','admin_entered','employer_reported') OR (op.source = 'llm_inferred' AND EXISTS (SELECT 1 FROM public.ai_extraction_suggestions s WHERE s.entity_type = 'jobseeker_profile' AND s.entity_id = op.jobseeker_profile_id AND s.suggestion_type = 'occupation' AND s.review_status = 'accepted' AND s.reviewed_by IS NOT NULL AND s.reviewed_at IS NOT NULL AND COALESCE(s.edited_canonical_id,s.canonical_id) = op.occupation_id))))) AS success, (true) AS denominator_member
      FROM public.participants p JOIN public.jobseeker_profiles jp ON jp.participant_id=p.id
      WHERE (true)
    $source$;
    WHEN 'skill_coverage' THEN v_query := $source$
      SELECT p.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (EXISTS (SELECT 1 FROM public.jobseeker_skills js WHERE js.jobseeker_profile_id=jp.participant_id AND (js.source IN ('self_reported','admin_entered','employer_reported') OR (js.source = 'llm_inferred' AND EXISTS (SELECT 1 FROM public.ai_extraction_suggestions s WHERE s.entity_type = 'jobseeker_profile' AND s.entity_id = js.jobseeker_profile_id AND s.suggestion_type = 'skill' AND s.review_status = 'accepted' AND s.reviewed_by IS NOT NULL AND s.reviewed_at IS NOT NULL AND COALESCE(s.edited_canonical_id,s.canonical_id) = js.skill_id))))) AS success, (true) AS denominator_member
      FROM public.participants p JOIN public.jobseeker_profiles jp ON jp.participant_id=p.id
      WHERE (true)
    $source$;
    WHEN 'vacancy_occupation_coverage' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (vd.occupation_id IS NOT NULL) AS success, (true) AS denominator_member
      FROM public.vacancy_definitions vd
      WHERE (vd.is_active = true)
    $source$;
    WHEN 'vacancy_salary_coverage' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (COALESCE((vd.salary_min IS NOT NULL AND vd.salary_max IS NOT NULL AND vd.salary_min >= 0 AND vd.salary_max >= vd.salary_min AND NULLIF(btrim(vd.salary_currency),'') IS NOT NULL AND NULLIF(btrim(vd.salary_period),'') IS NOT NULL),false)) AS success, (true) AS denominator_member
      FROM public.vacancy_definitions vd
      WHERE (vd.is_active = true)
    $source$;
    WHEN 'vacancy_required_skill_coverage' THEN v_query := $source$
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (EXISTS (SELECT 1 FROM public.vacancy_skills vs WHERE vs.vacancy_definition_id=vd.id AND vs.importance='required')) AS success, (true) AS denominator_member
      FROM public.vacancy_definitions vd
      WHERE (vd.is_active = true)
    $source$;
    WHEN 'application_outcome_coverage' THEN v_query := $source$
      SELECT a.id AS unit_id, (a.applied_at AT TIME ZONE 'UTC')::date AS occurred_on, NULL::uuid AS category_id,
             NULL::text AS category_label, (EXISTS (SELECT 1 FROM latest_outcomes lo WHERE lo.application_id=a.id AND lo.outcome IN ('hired','not_hired','offer_declined','withdrawn'))) AS success, (true) AS denominator_member
      FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id
      WHERE (($5 IS NULL OR ev.event_id=$5))
    $source$;
    WHEN 'skill_gap' THEN v_query := $source$
      SELECT js.jobseeker_profile_id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.canonical_name AS category_label, (true) AS success, (false) AS denominator_member
      FROM public.jobseeker_skills js JOIN public.skills t ON t.id=js.skill_id
      WHERE ((js.source IN ('self_reported','admin_entered','employer_reported') OR (js.source = 'llm_inferred' AND EXISTS (SELECT 1 FROM public.ai_extraction_suggestions s WHERE s.entity_type = 'jobseeker_profile' AND s.entity_id = js.jobseeker_profile_id AND s.suggestion_type = 'skill' AND s.review_status = 'accepted' AND s.reviewed_by IS NOT NULL AND s.reviewed_at IS NOT NULL AND COALESCE(s.edited_canonical_id,s.canonical_id) = js.skill_id))))
      UNION ALL
      SELECT vd.id AS unit_id, NULL::date AS occurred_on, t.id AS category_id,
             t.canonical_name AS category_label, (false) AS success, (true) AS denominator_member
      FROM public.vacancy_skills vs JOIN public.vacancy_definitions vd ON vd.id=vs.vacancy_definition_id JOIN public.skills t ON t.id=vs.skill_id
      WHERE (vd.is_active = true AND vs.importance='required')
    $source$;
    ELSE RAISE EXCEPTION 'Unsupported metric' USING ERRCODE='22023';
    END CASE;
    EXECUTE $aggregate$WITH latest_outcomes AS NOT MATERIALIZED (
  SELECT DISTINCT ON (eo.application_id) eo.application_id,eo.outcome,eo.hired_at,eo.verified_by,eo.verification_date
  FROM public.employment_outcomes eo ORDER BY eo.application_id,eo.created_at DESC,eo.id DESC
), facts AS ($aggregate$ || v_query || $aggregate$
), scoped AS (
      SELECT unit_id,success,denominator_member,
        CASE WHEN $3 IS NULL THEN NULL::date ELSE date_trunc($3,occurred_on::timestamp)::date END AS period,
        CASE WHEN $4 IS NULL THEN NULL::uuid ELSE category_id END AS category_id,
        CASE WHEN $4 IS NULL THEN NULL::text
          WHEN category_label ~* '@|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9][0-9 ()+-]{7,}[0-9]'
            OR length(category_label)>160 THEN 'Invalid category'
          ELSE category_label END AS category_label
      FROM facts
      WHERE $1 IS NULL OR (occurred_on>=$1 AND occurred_on<$2)
    ), totals AS (
      SELECT period,category_id,category_label,
        count(DISTINCT unit_id) FILTER (WHERE success)::bigint AS numerator,
        count(DISTINCT unit_id) FILTER (WHERE denominator_member)::bigint AS denominator
      FROM scoped GROUP BY period,category_id,category_label
    ), nonempty_totals AS (
      SELECT * FROM totals
      UNION ALL
      SELECT NULL::date,NULL::uuid,NULL::text,0::bigint,0::bigint
      WHERE $3 IS NULL AND $4 IS NULL AND NOT EXISTS (SELECT 1 FROM totals)
    ), valued AS (
      SELECT *, CASE $6
        WHEN 'count' THEN numerator::numeric
        WHEN 'percent' THEN numerator::numeric * 100 / NULLIF(denominator,0)
        ELSE numerator::numeric / NULLIF(denominator,0) END AS value
      FROM nonempty_totals
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'metric_id',$7,'period',period,
      'dimension',CASE WHEN $4 IS NULL THEN NULL ELSE jsonb_build_object(
        'name',$4,'key',md5(category_id::text),'label',category_label) END,
      'numerator',numerator,'denominator',CASE WHEN $6='count' THEN NULL ELSE denominator END,
      'value',value,'suppressed',false,'status',CASE WHEN value IS NULL THEN 'zero_denominator' ELSE 'available' END
    ) ORDER BY period NULLS FIRST,category_label,category_id),'[]'::jsonb) FROM valued;
    $aggregate$ INTO v_result USING p_start,p_end,p_period,p_dimension,p_event_id,v_definition->>'measure',v_metric;
    v_cells := v_cells || v_result;
    IF jsonb_array_length(v_cells)>10000 THEN
      RAISE EXCEPTION 'Aggregate result exceeds cell limit' USING ERRCODE='54000';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('version','employment-intelligence-v1',
    'observed_on',(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,'cells',v_cells);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_employment_intelligence(text[],date,date,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employment_intelligence(text[],date,date,text,text,uuid) TO authenticated;
COMMENT ON FUNCTION public.get_employment_intelligence(text[],date,date,text,text,uuid)
  IS 'Phase 7A admin-only read-only government aggregates. All sensitive cells withheld pending policy.';
COMMIT;
