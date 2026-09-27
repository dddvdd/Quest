-- Phase 5D - authoritative Phase 3 matching profile RPC source
-- Private RPC definitions include the Phase 5D.1 authorization correction.
-- Public vacancy RPC payloads are captured without scoring or JSON changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_jobseeker_match_profile(p_jobseeker_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
  END IF;

  v_role := app.current_user_role()::text;

  IF v_role IN ('admin', 'staff', 'supervisor') THEN
    NULL;
  ELSIF v_role = 'applicant' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.jobseeker_profiles jp
      JOIN public.participants p ON p.id = jp.participant_id
      WHERE jp.participant_id = p_jobseeker_profile_id
        AND p.auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'employer' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.event_vacancies ev ON ev.id = a.event_vacancy_id
      JOIN public.event_participations ep ON ep.id = a.registrant_id
      JOIN public.vacancy_definitions vd ON vd.id = ev.vacancy_definition_id
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE ep.participant_id = p_jobseeker_profile_id
        AND e.registered_user_id = auth.uid()
        AND e.registration_status = 'approved'
      UNION ALL
      SELECT 1
      FROM public.participation_vacancies pv
      JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
      JOIN public.event_participations ep ON ep.id = pv.participation_id
      JOIN public.vacancy_definitions vd ON vd.id = ev.vacancy_definition_id
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE ep.participant_id = p_jobseeker_profile_id
        AND e.registered_user_id = auth.uid()
        AND e.registration_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'participant_id', jp.participant_id,
    'first_name', jp.first_name,
    'last_name', jp.last_name,
    'province', jp.province,
    'municipality_city', jp.municipality_city,
    'willing_to_relocate', COALESCE(jp.willing_to_relocate, false),
    'availability_status', jp.availability_status,
    'available_start_date', jp.available_start_date,
    'preferred_shift', jp.preferred_shift,
    'desired_salary_min', jp.desired_salary_min,
    'desired_salary_max', jp.desired_salary_max,
    'desired_salary_currency', COALESCE(jp.desired_salary_currency, 'PHP'),
    'desired_salary_period', jp.desired_salary_period,
    'highest_educational_attainment', jp.highest_educational_attainment,
    'education', COALESCE((
      SELECT json_agg(json_build_object(
        'id', je.id,
        'education_level_id', je.education_level_id,
        'level_code', el.code,
        'level_name', el.name,
        'rank', el.rank,
        'school_name', je.school_name,
        'field_of_study', je.field_of_study,
        'course_program', je.course_program,
        'status', je.status,
        'graduation_year', je.graduation_year
      ) ORDER BY el.rank DESC)
      FROM jobseeker_education je
      JOIN education_levels el ON el.id = je.education_level_id
      WHERE je.jobseeker_profile_id = jp.participant_id
    ), '[]'::json),
    'skills', COALESCE((
      SELECT json_agg(json_build_object(
        'id', js.id,
        'skill_id', js.skill_id,
        'canonical_name', s.canonical_name,
        'skill_type', s.skill_type,
        'proficiency_level', js.proficiency_level,
        'years_experience', js.years_experience,
        'verification_status', js.verification_status
      ))
      FROM jobseeker_skills js
      JOIN skills s ON s.id = js.skill_id
      WHERE js.jobseeker_profile_id = jp.participant_id
    ), '[]'::json),
    'certifications', COALESCE((
      SELECT json_agg(json_build_object(
        'id', jc.id,
        'certification_id', jc.certification_id,
        'canonical_name', c.canonical_name,
        'issuing_organization', COALESCE(jc.issuing_organization_override, c.issuing_organization),
        'certification_type', c.certification_type,
        'does_not_expire', jc.does_not_expire,
        'expiration_date', jc.expiration_date,
        'date_issued', jc.date_issued,
        'verification_status', jc.verification_status
      ))
      FROM jobseeker_certifications jc
      LEFT JOIN certifications c ON c.id = jc.certification_id
      WHERE jc.jobseeker_profile_id = jp.participant_id
    ), '[]'::json),
    'languages', COALESCE((
      SELECT json_agg(json_build_object(
        'id', jl.id,
        'language_id', jl.language_id,
        'code', l.code,
        'name', l.name,
        'speaking_proficiency', jl.speaking_proficiency,
        'reading_proficiency', jl.reading_proficiency,
        'writing_proficiency', jl.writing_proficiency,
        'is_native', jl.is_native
      ))
      FROM jobseeker_languages jl
      JOIN languages l ON l.id = jl.language_id
      WHERE jl.jobseeker_profile_id = jp.participant_id
    ), '[]'::json),
    'work_experiences', COALESCE((
      SELECT json_agg(json_build_object(
        'id', we.id,
        'employer_name', we.employer_name,
        'position_title', we.position_title,
        'industry', we.industry,
        'start_date', we.start_date,
        'end_date', we.end_date,
        'is_current', we.is_current,
        'description', we.description
      ) ORDER BY COALESCE(we.end_date, '9999-12-31'::date) DESC)
      FROM work_experiences we
      WHERE we.participant_id = jp.participant_id
    ), '[]'::json),
    'occupation_preferences', COALESCE((
      SELECT json_agg(json_build_object(
        'occupation_id', op.occupation_id,
        'canonical_name', o.canonical_name,
        'priority', op.priority,
        'preference_type', op.preference_type
      ) ORDER BY op.priority ASC)
      FROM jobseeker_occupation_preferences op
      JOIN occupations o ON o.id = op.occupation_id
      WHERE op.jobseeker_profile_id = jp.participant_id
    ), '[]'::json),
    'industry_preferences', COALESCE((
      SELECT json_agg(json_build_object(
        'industry_id', ip.industry_id,
        'canonical_name', i.canonical_name,
        'priority', ip.priority
      ) ORDER BY ip.priority ASC)
      FROM jobseeker_industry_preferences ip
      JOIN industries i ON i.id = ip.industry_id
      WHERE ip.jobseeker_profile_id = jp.participant_id
    ), '[]'::json),
    'employment_type_preferences', COALESCE((
      SELECT json_agg(json_build_object(
        'employment_type_id', ep.employment_type_id,
        'code', et.code,
        'name', et.name,
        'priority', ep.priority
      ) ORDER BY ep.priority ASC)
      FROM jobseeker_employment_type_preferences ep
      JOIN employment_types et ON et.id = ep.employment_type_id
      WHERE ep.jobseeker_profile_id = jp.participant_id
    ), '[]'::json),
    'work_arrangement_preferences', COALESCE((
      SELECT json_agg(json_build_object(
        'work_arrangement_id', wp.work_arrangement_id,
        'code', wa.code,
        'name', wa.name,
        'priority', wp.priority
      ) ORDER BY wp.priority ASC)
      FROM jobseeker_work_arrangement_preferences wp
      JOIN work_arrangements wa ON wa.id = wp.work_arrangement_id
      WHERE wp.jobseeker_profile_id = jp.participant_id
    ), '[]'::json),
    'location_preferences', COALESCE((
      SELECT json_agg(json_build_object(
        'province', lp.province,
        'municipality_city', lp.municipality_city,
        'region', lp.region,
        'is_primary', lp.is_primary,
        'priority', lp.priority
      ) ORDER BY lp.priority ASC)
      FROM jobseeker_location_preferences lp
      WHERE lp.jobseeker_profile_id = jp.participant_id
    ), '[]'::json)
  ) INTO v_result
  FROM jobseeker_profiles jp
  WHERE jp.participant_id = p_jobseeker_profile_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_vacancy_match_profile(p_vacancy_definition_id uuid, p_event_vacancy_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_deadline timestamptz;
BEGIN
  -- If event_vacancy_id provided, fetch deadline
  IF p_event_vacancy_id IS NOT NULL THEN
    SELECT ev.application_deadline INTO v_deadline
    FROM event_vacancies ev
    WHERE ev.id = p_event_vacancy_id;
  END IF;

  SELECT json_build_object(
    'id', vd.id,
    'employer_id', vd.employer_id,
    'company_name', vd.company_name,
    'position', vd.position,
    'is_active', vd.is_active,
    'application_deadline', v_deadline,
    'occupation_id', vd.occupation_id,
    'occupation_name', o.canonical_name,
    'industry_id', vd.industry_id,
    'industry_name', i.canonical_name,
    'employment_type_id', vd.employment_type_id,
    'employment_type_name', et.name,
    'work_arrangement_id', vd.work_arrangement_id,
    'work_arrangement_name', wa.name,
    'salary_min', vd.salary_min,
    'salary_max', vd.salary_max,
    'salary_currency', 'PHP',
    'salary_period', vd.salary_period,
    'salary_negotiable', COALESCE(vd.salary_negotiable, false),
    'province', vd.province,
    'municipality_city', vd.municipality_city,
    'place_of_assignment', vd.place_of_assignment,
    'qualifications', vd.qualifications,
    'education_requirements', COALESCE((
      SELECT json_agg(json_build_object(
        'id', ve.id,
        'education_level_id', ve.education_level_id,
        'level_code', el.code,
        'level_name', el.name,
        'rank', el.rank,
        'field_of_study', ve.field_of_study,
        'importance', ve.importance,
        'notes', ve.notes
      ))
      FROM vacancy_education_requirements ve
      JOIN education_levels el ON el.id = ve.education_level_id
      WHERE ve.vacancy_definition_id = vd.id
    ), '[]'::json),
    'experience_requirements', COALESCE((
      SELECT json_agg(json_build_object(
        'id', vx.id,
        'occupation_id', vx.occupation_id,
        'industry_id', vx.industry_id,
        'minimum_months', vx.minimum_months,
        'importance', vx.importance,
        'description', vx.description
      ))
      FROM vacancy_experience_requirements vx
      WHERE vx.vacancy_definition_id = vd.id
    ), '[]'::json),
    'skills', COALESCE((
      SELECT json_agg(json_build_object(
        'id', vs.id,
        'skill_id', vs.skill_id,
        'canonical_name', s.canonical_name,
        'skill_type', s.skill_type,
        'importance', vs.importance,
        'minimum_proficiency', vs.minimum_proficiency,
        'minimum_years_experience', vs.minimum_years_experience
      ))
      FROM vacancy_skills vs
      JOIN skills s ON s.id = vs.skill_id
      WHERE vs.vacancy_definition_id = vd.id
    ), '[]'::json),
    'certification_requirements', COALESCE((
      SELECT json_agg(json_build_object(
        'id', vc.id,
        'certification_id', vc.certification_id,
        'canonical_name', c.canonical_name,
        'importance', vc.importance,
        'must_be_valid', vc.must_be_valid,
        'notes', vc.notes
      ))
      FROM vacancy_certification_requirements vc
      JOIN certifications c ON c.id = vc.certification_id
      WHERE vc.vacancy_definition_id = vd.id
    ), '[]'::json),
    'language_requirements', COALESCE((
      SELECT json_agg(json_build_object(
        'id', vl.id,
        'language_id', vl.language_id,
        'code', l.code,
        'name', l.name,
        'importance', vl.importance,
        'minimum_speaking', vl.minimum_speaking,
        'minimum_reading', vl.minimum_reading,
        'minimum_writing', vl.minimum_writing
      ))
      FROM vacancy_language_requirements vl
      JOIN languages l ON l.id = vl.language_id
      WHERE vl.vacancy_definition_id = vd.id
    ), '[]'::json)
  ) INTO v_result
  FROM vacancy_definitions vd
  LEFT JOIN occupations o ON o.id = vd.occupation_id
  LEFT JOIN industries i ON i.id = vd.industry_id
  LEFT JOIN employment_types et ON et.id = vd.employment_type_id
  LEFT JOIN work_arrangements wa ON wa.id = vd.work_arrangement_id
  WHERE vd.id = p_vacancy_definition_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_vacancies_match_profiles(p_vacancy_definition_ids uuid[] DEFAULT NULL::uuid[], p_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
DECLARE
  v_results jsonb;
BEGIN
  SELECT json_agg(
    public.get_vacancy_match_profile(vd.id, ev.id)
  ) INTO v_results
  FROM vacancy_definitions vd
  LEFT JOIN event_vacancies ev ON ev.vacancy_definition_id = vd.id AND (p_event_id IS NULL OR ev.event_id = p_event_id)
  WHERE (p_vacancy_definition_ids IS NULL OR vd.id = ANY(p_vacancy_definition_ids))
    AND vd.is_active = true;

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_vacancy_candidate_match_profiles(p_vacancy_definition_id uuid, p_event_vacancy_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_results jsonb;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized to view candidate pool for this vacancy' USING ERRCODE = '42501';
  END IF;

  v_role := app.current_user_role()::text;

  IF v_role IN ('admin', 'staff', 'supervisor') THEN
    NULL;
  ELSIF v_role = 'employer' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = p_vacancy_definition_id
        AND e.registered_user_id = auth.uid()
        AND e.registration_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Unauthorized to view candidate pool for this vacancy' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized to view candidate pool for this vacancy' USING ERRCODE = '42501';
  END IF;

  WITH authorized_candidates AS (
    -- 1. Formal applications
    SELECT
      ep.participant_id,
      'application'::text AS candidate_source,
      a.application_status,
      a.applied_at
    FROM applications a
    JOIN event_vacancies ev ON ev.id = a.event_vacancy_id
    JOIN event_participations ep ON ep.id = a.registrant_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR ev.id = p_event_vacancy_id)
      AND ep.participant_id IS NOT NULL

    UNION ALL

    -- 2. Event vacancy interest / selection (if not already applied)
    SELECT
      ep.participant_id,
      'event_interest'::text AS candidate_source,
      'interested'::text AS application_status,
      pv.created_at AS applied_at
    FROM participation_vacancies pv
    JOIN event_vacancies ev ON ev.id = pv.event_vacancy_id
    JOIN event_participations ep ON ep.id = pv.participation_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR ev.id = p_event_vacancy_id)
      AND ep.participant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM applications a2
        WHERE a2.event_vacancy_id = ev.id AND a2.registrant_id = ep.id
      )
  ),
  deduped_candidates AS (
    SELECT DISTINCT ON (ac.participant_id)
      ac.participant_id,
      ac.candidate_source,
      ac.application_status,
      ac.applied_at
    FROM authorized_candidates ac
    ORDER BY ac.participant_id, (CASE ac.candidate_source WHEN 'application' THEN 1 ELSE 2 END)
  )
  SELECT json_agg(
    json_build_object(
      'candidate_source', dc.candidate_source,
      'application_status', dc.application_status,
      'applied_at', dc.applied_at,
      'profile', public.get_jobseeker_match_profile(dc.participant_id)
    )
  ) INTO v_results
  FROM deduped_candidates dc;

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_jobseeker_match_profile(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_jobseeker_match_profile(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_vacancy_candidate_match_profiles(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_vacancy_candidate_match_profiles(uuid, uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_vacancy_match_profile(uuid, uuid)
  TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vacancies_match_profiles(uuid[], uuid)
  TO PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_jobseeker_match_profile(uuid)
  IS 'Authoritative Phase 3 private jobseeker matching profile RPC, corrected in Phase 5D.1.';
COMMENT ON FUNCTION public.get_vacancy_match_profile(uuid, uuid)
  IS 'Authoritative Phase 3 public vacancy matching payload RPC.';
COMMENT ON FUNCTION public.get_vacancies_match_profiles(uuid[], uuid)
  IS 'Authoritative Phase 3 public batch vacancy matching payload RPC.';
COMMENT ON FUNCTION public.get_vacancy_candidate_match_profiles(uuid, uuid)
  IS 'Authoritative Phase 3 private authorized candidate-pool RPC, corrected in Phase 5D.1.';

COMMIT;

