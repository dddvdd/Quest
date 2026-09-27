-- Canonical forward reconciliation after controlled-pilot UAT.
--
-- Converges both:
--   1. the approved chain ending at 20260919044954; and
--   2. DEV where equivalent timestamp functions and an unsafe anonymous
--      employer policy were applied outside the migration ledger.
--
-- This migration intentionally does not recreate or depend on lost historical
-- migrations and does not change matching.

BEGIN;

DO $preconditions$
BEGIN
  IF to_regclass('public.employers') IS NULL
     OR to_regclass('public.vacancy_definitions') IS NULL
     OR to_regclass('public.applications') IS NULL THEN
    RAISE EXCEPTION 'Post-UAT reconciliation requires canonical recruitment tables';
  END IF;

  IF to_regprocedure('public.publish_vacancy(uuid)') IS NULL
     OR to_regprocedure('public.close_vacancy(uuid)') IS NULL
     OR to_regprocedure('public.list_platform_vacancies(text)') IS NULL
     OR to_regprocedure('public.get_platform_vacancy(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-UAT reconciliation requires canonical recruitment RPC signatures';
  END IF;

  IF NOT (
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class c
    WHERE c.oid = 'public.employers'::regclass
  ) THEN
    RAISE EXCEPTION 'Post-UAT reconciliation requires RLS on public.employers';
  END IF;
END
$preconditions$;

-- Remove the UAT policy/grant combination that exposed complete approved-
-- employer rows. Keep only the two public identity columns required by legacy
-- nested event display; platform discovery itself remains RPC-backed.
DROP POLICY IF EXISTS "Platform can view approved employers" ON public.employers;
DROP POLICY IF EXISTS "Anonymous view public employer identity" ON public.employers;

REVOKE ALL PRIVILEGES ON TABLE public.employers FROM anon;
GRANT SELECT (id, company_name) ON TABLE public.employers TO anon;

CREATE POLICY "Anonymous view public employer identity"
  ON public.employers
  FOR SELECT
  TO anon
  USING (is_active = true AND registration_status = 'approved');

-- Canonical publication operations explicitly maintain the platform timestamps.
-- The validation trigger remains authoritative for publication completeness and
-- the functions retain the approved owner/admin boundary and idempotent states.
CREATE OR REPLACE FUNCTION public.publish_vacancy(p_vacancy_definition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text := public.app_current_user_role_text();
  v_employer_id uuid;
  v_status text;
BEGIN
  SELECT vd.employer_id, vd.platform_status
  INTO v_employer_id, v_status
  FROM public.vacancy_definitions vd
  WHERE vd.id = p_vacancy_definition_id
  FOR UPDATE;

  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'Vacancy not found or missing employer ownership' USING ERRCODE = '22023';
  END IF;

  IF v_role <> 'admin' AND NOT EXISTS (
    SELECT 1
    FROM public.employers e
    WHERE e.id = v_employer_id
      AND e.registered_user_id = auth.uid()
      AND e.is_active = true
      AND e.registration_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Not authorized to publish this vacancy' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'published' THEN
    RETURN jsonb_build_object(
      'vacancy_definition_id', p_vacancy_definition_id,
      'status', 'published'
    );
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft vacancy can be published' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.platform_transition_authorized', 'true', true);
  UPDATE public.vacancy_definitions
  SET platform_status = 'published',
      published_at = now(),
      closed_at = NULL
  WHERE id = p_vacancy_definition_id;

  RETURN jsonb_build_object(
    'vacancy_definition_id', p_vacancy_definition_id,
    'status', 'published'
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.close_vacancy(p_vacancy_definition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text := public.app_current_user_role_text();
  v_employer_id uuid;
  v_status text;
BEGIN
  SELECT vd.employer_id, vd.platform_status
  INTO v_employer_id, v_status
  FROM public.vacancy_definitions vd
  WHERE vd.id = p_vacancy_definition_id
  FOR UPDATE;

  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'Vacancy not found or missing employer ownership' USING ERRCODE = '22023';
  END IF;

  IF v_role <> 'admin' AND NOT EXISTS (
    SELECT 1
    FROM public.employers e
    WHERE e.id = v_employer_id
      AND e.registered_user_id = auth.uid()
      AND e.is_active = true
      AND e.registration_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Not authorized to close this vacancy' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'closed' THEN
    RETURN jsonb_build_object(
      'vacancy_definition_id', p_vacancy_definition_id,
      'status', 'closed'
    );
  END IF;

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'Only a published vacancy can be closed' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.platform_transition_authorized', 'true', true);
  UPDATE public.vacancy_definitions
  SET platform_status = 'closed',
      closed_at = now()
  WHERE id = p_vacancy_definition_id;

  RETURN jsonb_build_object(
    'vacancy_definition_id', p_vacancy_definition_id,
    'status', 'closed'
  );
END
$function$;

-- Reassert the canonical RPC surface. CREATE OR REPLACE normally preserves ACLs,
-- but convergence must also be safe for a clean canonical database and for DEV.
REVOKE ALL ON FUNCTION public.publish_vacancy(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.close_vacancy(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.submit_application(uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.submit_event_application(uuid, uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.list_my_applications() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.list_employer_applications(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.withdraw_application(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_application_status(uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_vacancies_match_profiles(uuid[], uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_vacancy_candidate_match_profiles(uuid, uuid) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.publish_vacancy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_vacancy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_application(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_event_application(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_applications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_employer_applications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_application_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vacancies_match_profiles(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vacancy_candidate_match_profiles(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_platform_vacancies(text) FROM PUBLIC, service_role;
REVOKE ALL ON FUNCTION public.get_platform_vacancy(uuid) FROM PUBLIC, service_role;
GRANT EXECUTE ON FUNCTION public.list_platform_vacancies(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_vacancy(uuid) TO anon, authenticated;

-- Direct application writes remain RPC-only.
REVOKE ALL PRIVILEGES ON TABLE public.applications FROM anon;
REVOKE INSERT, DELETE ON TABLE public.applications FROM authenticated;

DO $postconditions$
DECLARE
  v_sensitive_column text;
BEGIN
  IF pg_catalog.has_table_privilege('anon', 'public.employers', 'SELECT') THEN
    RAISE EXCEPTION 'Post-UAT reconciliation failed: anon retains table-level employer SELECT';
  END IF;

  IF NOT pg_catalog.has_column_privilege('anon', 'public.employers', 'id', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('anon', 'public.employers', 'company_name', 'SELECT') THEN
    RAISE EXCEPTION 'Post-UAT reconciliation failed: public employer identity columns are unavailable';
  END IF;

  FOREACH v_sensitive_column IN ARRAY ARRAY[
    'contact_person', 'contact_number', 'email', 'registered_user_id',
    'tin', 'license_no', 'notes', 'employer_code', 'registration_status',
    'registration_source'
  ]
  LOOP
    IF pg_catalog.has_column_privilege(
      'anon', 'public.employers', v_sensitive_column, 'SELECT'
    ) THEN
      RAISE EXCEPTION 'Post-UAT reconciliation failed: anon can select sensitive employer column %',
        v_sensitive_column;
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege('anon', 'public.publish_vacancy(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', 'public.publish_vacancy(uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.publish_vacancy(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-UAT reconciliation failed: protected RPC ACLs are not canonical';
  END IF;

  IF NOT pg_catalog.has_function_privilege('anon', 'public.list_platform_vacancies(text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('anon', 'public.get_platform_vacancy(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-UAT reconciliation failed: anonymous discovery RPCs are unavailable';
  END IF;
END
$postconditions$;

COMMIT;
