-- Platform Recruitment MVP - canonical reconstruction and forward reconciliation
-- Converges both the canonical 2026-09-15 baseline and the partially applied DEV state.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preconditions and canonical application identity
-- ---------------------------------------------------------------------------

DO $preconditions$
BEGIN
  IF to_regclass('public.applications') IS NULL
     OR to_regclass('public.participants') IS NULL
     OR to_regclass('public.vacancy_definitions') IS NULL
     OR to_regclass('public.event_participations') IS NULL
     OR to_regclass('public.event_vacancies') IS NULL THEN
    RAISE EXCEPTION 'Platform Recruitment precondition failed: canonical baseline tables are missing';
  END IF;
END
$preconditions$;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS participant_id uuid,
  ADD COLUMN IF NOT EXISTS vacancy_definition_id uuid;

UPDATE public.applications a
SET participant_id = ep.participant_id,
    vacancy_definition_id = ev.vacancy_definition_id
FROM public.event_participations ep,
     public.event_vacancies ev
WHERE a.registrant_id = ep.id
  AND a.event_vacancy_id = ev.id
  AND (a.participant_id IS NULL OR a.vacancy_definition_id IS NULL);

DO $application_validation$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.applications
    WHERE participant_id IS NULL OR vacancy_definition_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Platform Recruitment precondition failed: an application cannot be mapped to canonical identities';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.event_participations ep ON ep.id = a.registrant_id
    JOIN public.event_vacancies ev ON ev.id = a.event_vacancy_id
    WHERE a.participant_id <> ep.participant_id
       OR a.vacancy_definition_id <> ev.vacancy_definition_id
       OR ep.event_id <> ev.event_id
  ) THEN
    RAISE EXCEPTION 'Platform Recruitment precondition failed: incoherent event application provenance exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.applications
    WHERE (registrant_id IS NULL) <> (event_vacancy_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Platform Recruitment precondition failed: partial event provenance exists';
  END IF;
END
$application_validation$;

DO $application_foreign_keys$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass
      AND conname = 'applications_participant_id_fkey'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_participant_id_fkey
      FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass
      AND conname = 'applications_vacancy_definition_id_fkey'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_vacancy_definition_id_fkey
      FOREIGN KEY (vacancy_definition_id) REFERENCES public.vacancy_definitions(id) ON DELETE RESTRICT;
  END IF;
END
$application_foreign_keys$;

ALTER TABLE public.applications
  ALTER COLUMN participant_id SET NOT NULL,
  ALTER COLUMN vacancy_definition_id SET NOT NULL,
  ALTER COLUMN registrant_id DROP NOT NULL,
  ALTER COLUMN event_vacancy_id DROP NOT NULL;

ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_registrant_event_vacancy_key,
  DROP CONSTRAINT IF EXISTS applications_event_provenance_pair_check;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_event_provenance_pair_check
  CHECK ((registrant_id IS NULL AND event_vacancy_id IS NULL)
      OR (registrant_id IS NOT NULL AND event_vacancy_id IS NOT NULL));

DROP INDEX IF EXISTS public.idx_applications_direct_active_unique;
CREATE UNIQUE INDEX idx_applications_direct_active_unique
  ON public.applications (participant_id, vacancy_definition_id)
  WHERE registrant_id IS NULL
    AND event_vacancy_id IS NULL
    AND application_status IN ('applied', 'shortlisted');

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_event_active_unique
  ON public.applications (registrant_id, event_vacancy_id)
  WHERE registrant_id IS NOT NULL
    AND event_vacancy_id IS NOT NULL
    AND application_status IN ('applied', 'shortlisted');

CREATE INDEX IF NOT EXISTS idx_applications_participant_id
  ON public.applications (participant_id);
CREATE INDEX IF NOT EXISTS idx_applications_vacancy_definition_id
  ON public.applications (vacancy_definition_id);

CREATE OR REPLACE FUNCTION public.enforce_application_canonical_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_participant_id uuid;
  v_definition_id uuid;
  v_participation_event_id uuid;
  v_offering_event_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.application_status <> 'applied' THEN
    RAISE EXCEPTION 'A formal application must start in applied status' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.participant_id IS DISTINCT FROM OLD.participant_id
    OR NEW.vacancy_definition_id IS DISTINCT FROM OLD.vacancy_definition_id
    OR NEW.registrant_id IS DISTINCT FROM OLD.registrant_id
    OR NEW.event_vacancy_id IS DISTINCT FROM OLD.event_vacancy_id
    OR NEW.source IS DISTINCT FROM OLD.source
  ) THEN
    RAISE EXCEPTION 'Application identity, channel, and provenance are immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.application_status IS DISTINCT FROM OLD.application_status
     AND NOT (
       (OLD.application_status = 'applied' AND NEW.application_status IN ('shortlisted', 'rejected', 'withdrawn'))
       OR (OLD.application_status = 'shortlisted' AND NEW.application_status IN ('rejected', 'withdrawn'))
     ) THEN
    RAISE EXCEPTION 'Application status transition is not permitted' USING ERRCODE = '23514';
  END IF;

  IF (NEW.registrant_id IS NULL) <> (NEW.event_vacancy_id IS NULL) THEN
    RAISE EXCEPTION 'Event participation and event offering must be supplied together' USING ERRCODE = '23514';
  END IF;

  IF NEW.registrant_id IS NULL THEN
    IF NEW.source <> 'online' THEN
      RAISE EXCEPTION 'Direct applications must use source online' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT ep.participant_id, ep.event_id
  INTO v_participant_id, v_participation_event_id
  FROM public.event_participations ep
  WHERE ep.id = NEW.registrant_id;

  SELECT ev.vacancy_definition_id, ev.event_id
  INTO v_definition_id, v_offering_event_id
  FROM public.event_vacancies ev
  WHERE ev.id = NEW.event_vacancy_id;

  IF v_participant_id IS NULL OR v_definition_id IS NULL
     OR NEW.participant_id <> v_participant_id
     OR NEW.vacancy_definition_id <> v_definition_id
     OR v_participation_event_id IS DISTINCT FROM v_offering_event_id THEN
    RAISE EXCEPTION 'Event application provenance is not coherent' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_enforce_application_canonical_identity ON public.applications;
CREATE TRIGGER trg_enforce_application_canonical_identity
BEFORE INSERT OR UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.enforce_application_canonical_identity();

-- ---------------------------------------------------------------------------
-- Platform publication lifecycle
-- ---------------------------------------------------------------------------

ALTER TABLE public.vacancy_definitions
  ADD COLUMN IF NOT EXISTS platform_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform_application_deadline timestamptz;

DO $publication_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vacancy_definitions'::regclass
      AND conname = 'vacancy_definitions_platform_status_check'
  ) THEN
    ALTER TABLE public.vacancy_definitions
      ADD CONSTRAINT vacancy_definitions_platform_status_check
      CHECK (platform_status IN ('draft', 'published', 'closed'));
  END IF;
END
$publication_constraint$;

CREATE OR REPLACE FUNCTION public.validate_vacancy_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_transition_authorized boolean :=
    COALESCE(current_setting('app.platform_transition_authorized', true), 'false') = 'true';
  v_role text := COALESCE(public.app_current_user_role_text(), '');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.platform_status IS DISTINCT FROM OLD.platform_status
     AND NOT v_transition_authorized AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'Use the controlled publication operations to change platform status' USING ERRCODE = '42501';
  END IF;

  IF NEW.platform_status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.platform_status IS DISTINCT FROM 'published') THEN
    IF NOT NEW.is_active THEN
      RAISE EXCEPTION 'Only an active vacancy can be published' USING ERRCODE = '23514';
    END IF;
    IF NEW.employer_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.employers e
      WHERE e.id = NEW.employer_id AND e.is_active = true AND e.registration_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'An active approved employer is required for publication' USING ERRCODE = '23514';
    END IF;
    IF btrim(COALESCE(NEW.position, '')) = '' THEN
      RAISE EXCEPTION 'Position is required for publication' USING ERRCODE = '23514';
    END IF;
    IF length(btrim(COALESCE(NEW.job_description, ''))) < 40 THEN
      RAISE EXCEPTION 'A meaningful job description of at least 40 characters is required' USING ERRCODE = '23514';
    END IF;
    IF NEW.work_arrangement_id IS NULL
       AND btrim(COALESCE(NEW.place_of_assignment, '')) = ''
       AND btrim(COALESCE(NEW.province, '')) = ''
       AND btrim(COALESCE(NEW.municipality_city, '')) = '' THEN
      RAISE EXCEPTION 'Work arrangement or workplace information is required' USING ERRCODE = '23514';
    END IF;
    IF NEW.available_slots IS NOT NULL AND NEW.available_slots <= 0 THEN
      RAISE EXCEPTION 'Available slots must be positive' USING ERRCODE = '23514';
    END IF;
    IF NEW.platform_application_deadline IS NOT NULL
       AND NEW.platform_application_deadline <= now() THEN
      RAISE EXCEPTION 'Application deadline must be in the future' USING ERRCODE = '23514';
    END IF;
    IF NEW.salary_min IS NOT NULL AND NEW.salary_min < 0
       OR NEW.salary_max IS NOT NULL AND NEW.salary_max < 0
       OR NEW.salary_min IS NOT NULL AND NEW.salary_max IS NOT NULL AND NEW.salary_min > NEW.salary_max
       OR (NEW.salary_min IS NOT NULL OR NEW.salary_max IS NOT NULL)
          AND (btrim(COALESCE(NEW.salary_currency, '')) = '' OR NEW.salary_period IS NULL) THEN
      RAISE EXCEPTION 'Supplied compensation must have valid bounds, currency, and period' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.vacancy_experience_requirements r
      WHERE r.vacancy_definition_id = NEW.id AND r.minimum_months < 0
    ) OR EXISTS (
      SELECT 1 FROM public.vacancy_skills r
      WHERE r.vacancy_definition_id = NEW.id AND r.minimum_years_experience < 0
    ) THEN
      RAISE EXCEPTION 'Structured requirement values must be valid' USING ERRCODE = '23514';
    END IF;
    NEW.published_at := now();
    NEW.closed_at := NULL;
  ELSIF NEW.platform_status = 'closed'
        AND (TG_OP = 'INSERT' OR OLD.platform_status IS DISTINCT FROM 'closed') THEN
    IF TG_OP = 'UPDATE' AND OLD.platform_status <> 'published' THEN
      RAISE EXCEPTION 'Only a published vacancy can be closed' USING ERRCODE = '23514';
    END IF;
    NEW.closed_at := now();
  ELSIF NEW.platform_status = 'draft' THEN
    NEW.published_at := NULL;
    NEW.closed_at := NULL;
  END IF;

  RETURN NEW;
END
$function$;

-- This wrapper avoids depending on enum type names while keeping trigger logic stable.
CREATE OR REPLACE FUNCTION public.app_current_user_role_text()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT p.role::text FROM public.profiles p
  WHERE p.id = auth.uid() AND p.is_active = true
$function$;

-- Recreate after the wrapper exists (function bodies resolve it at execution time).
DROP TRIGGER IF EXISTS trg_validate_vacancy_publication ON public.vacancy_definitions;
CREATE TRIGGER trg_validate_vacancy_publication
BEFORE INSERT OR UPDATE ON public.vacancy_definitions
FOR EACH ROW EXECUTE FUNCTION public.validate_vacancy_publication();

-- ---------------------------------------------------------------------------
-- Row security: published platform listings, owned drafts, scoped applications
-- ---------------------------------------------------------------------------

ALTER TABLE public.vacancy_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public view active vacancies" ON public.vacancy_definitions;
DROP POLICY IF EXISTS "Applicants view active vacancy definitions" ON public.vacancy_definitions;
DROP POLICY IF EXISTS "Public can view published vacancies" ON public.vacancy_definitions;
DROP POLICY IF EXISTS "Employers view own vacancies" ON public.vacancy_definitions;
DROP POLICY IF EXISTS "Employers manage own vacancies" ON public.vacancy_definitions;
DROP POLICY IF EXISTS "Approved employers manage own vacancies" ON public.vacancy_definitions;
DROP POLICY IF EXISTS "Staff view vacancy definitions" ON public.vacancy_definitions;
DROP POLICY IF EXISTS "Admins manage vacancy definitions" ON public.vacancy_definitions;

CREATE POLICY "Platform published vacancies are visible"
  ON public.vacancy_definitions FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND platform_status = 'published'
    AND published_at IS NOT NULL
    AND (platform_application_deadline IS NULL OR platform_application_deadline > now())
    AND EXISTS (
      SELECT 1 FROM public.employers e
      WHERE e.id = vacancy_definitions.employer_id
        AND e.is_active = true AND e.registration_status = 'approved'
    )
  );

CREATE POLICY "Approved employers manage owned vacancy definitions"
  ON public.vacancy_definitions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employers e
    WHERE e.id = vacancy_definitions.employer_id
      AND e.registered_user_id = auth.uid()
      AND e.is_active = true AND e.registration_status = 'approved'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employers e
    WHERE e.id = vacancy_definitions.employer_id
      AND e.registered_user_id = auth.uid()
      AND e.is_active = true AND e.registration_status = 'approved'
  ));

CREATE POLICY "Event staff view vacancy definitions"
  ON public.vacancy_definitions FOR SELECT TO authenticated
  USING (app.is_event_staff());

CREATE POLICY "Admins manage vacancy definitions"
  ON public.vacancy_definitions FOR ALL TO authenticated
  USING (public.app_current_user_role_text() = 'admin')
  WITH CHECK (public.app_current_user_role_text() = 'admin');

DROP POLICY IF EXISTS "Applicants insert own applications" ON public.applications;
DROP POLICY IF EXISTS "Applicants view own applications" ON public.applications;
DROP POLICY IF EXISTS "Employers update own vacancy applications" ON public.applications;
DROP POLICY IF EXISTS "Employers view own vacancy applications" ON public.applications;
DROP POLICY IF EXISTS "Staff manage applications" ON public.applications;
DROP POLICY IF EXISTS "Staff view applications" ON public.applications;
DROP POLICY IF EXISTS "Admins manage applications" ON public.applications;

CREATE POLICY "Applicants view own canonical applications"
  ON public.applications FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id = applications.participant_id AND p.auth_user_id = auth.uid()
  ));

CREATE POLICY "Employers view owned formal applications"
  ON public.applications FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.vacancy_definitions vd
    JOIN public.employers e ON e.id = vd.employer_id
    WHERE vd.id = applications.vacancy_definition_id
      AND e.registered_user_id = auth.uid()
      AND e.is_active = true AND e.registration_status = 'approved'
  ));

CREATE POLICY "Event staff view scoped formal applications"
  ON public.applications FOR SELECT TO authenticated
  USING (
    app.is_event_staff()
    AND registrant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.event_participations ep
      WHERE ep.id = applications.registrant_id
        AND public.supervisor_can_view_event(ep.event_id)
    )
  );

CREATE POLICY "Event staff update scoped formal applications"
  ON public.applications FOR UPDATE TO authenticated
  USING (
    app.is_event_staff()
    AND registrant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.event_participations ep
      WHERE ep.id = applications.registrant_id
        AND public.supervisor_can_view_event(ep.event_id)
    )
  )
  WITH CHECK (
    app.is_event_staff()
    AND registrant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.event_participations ep
      WHERE ep.id = applications.registrant_id
        AND public.supervisor_can_view_event(ep.event_id)
    )
  );

CREATE POLICY "Admins manage canonical applications"
  ON public.applications FOR ALL TO authenticated
  USING (public.app_current_user_role_text() = 'admin')
  WITH CHECK (public.app_current_user_role_text() = 'admin');

REVOKE ALL ON TABLE public.applications FROM anon;
REVOKE INSERT, DELETE ON TABLE public.applications FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.applications TO authenticated;
GRANT ALL ON TABLE public.applications TO service_role;

GRANT SELECT ON TABLE public.vacancy_definitions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.vacancy_definitions TO authenticated;
GRANT ALL ON TABLE public.vacancy_definitions TO service_role;

REVOKE ALL ON FUNCTION public.app_current_user_role_text() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.app_current_user_role_text() TO authenticated;

-- ---------------------------------------------------------------------------
-- Controlled recruitment operations
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_application(
  p_vacancy_definition_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_participant_id uuid;
  v_application public.applications%ROWTYPE;
BEGIN
  IF public.app_current_user_role_text() <> 'applicant' THEN
    RAISE EXCEPTION 'Only an active applicant can submit an application' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_participant_id
  FROM public.participants p
  WHERE p.auth_user_id = auth.uid();
  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'No participant profile is linked to this account' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vacancy_definitions vd
    JOIN public.employers e ON e.id = vd.employer_id
    WHERE vd.id = p_vacancy_definition_id
      AND vd.is_active = true
      AND vd.platform_status = 'published'
      AND vd.published_at IS NOT NULL
      AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline > now())
      AND e.is_active = true AND e.registration_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Vacancy is not open for platform applications' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_application
  FROM public.applications a
  WHERE a.participant_id = v_participant_id
    AND a.vacancy_definition_id = p_vacancy_definition_id
    AND a.registrant_id IS NULL AND a.event_vacancy_id IS NULL
    AND a.application_status IN ('applied', 'shortlisted')
  ORDER BY a.applied_at DESC LIMIT 1;

  IF v_application.id IS NOT NULL THEN
    RETURN jsonb_build_object('application_id', v_application.id, 'status', 'existing');
  END IF;

  BEGIN
    INSERT INTO public.applications (
      participant_id, vacancy_definition_id, registrant_id, event_vacancy_id,
      application_status, source, notes
    ) VALUES (
      v_participant_id, p_vacancy_definition_id, NULL, NULL,
      'applied', 'online', NULLIF(btrim(p_notes), '')
    ) RETURNING * INTO v_application;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_application
    FROM public.applications a
    WHERE a.participant_id = v_participant_id
      AND a.vacancy_definition_id = p_vacancy_definition_id
      AND a.registrant_id IS NULL AND a.event_vacancy_id IS NULL
      AND a.application_status IN ('applied', 'shortlisted')
    ORDER BY a.applied_at DESC LIMIT 1;
    RETURN jsonb_build_object('application_id', v_application.id, 'status', 'existing');
  END;

  RETURN jsonb_build_object('application_id', v_application.id, 'status', 'created');
END
$function$;

-- Remove the unsafe unledgered overload that accepted caller-selected event context.
DROP FUNCTION IF EXISTS public.submit_application(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.submit_event_application(
  p_event_participation_id uuid,
  p_event_vacancy_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_participant_id uuid;
  v_definition_id uuid;
  v_event_id uuid;
  v_owner boolean;
  v_application public.applications%ROWTYPE;
BEGIN
  SELECT ep.participant_id, ep.event_id,
         (p.auth_user_id = auth.uid())
  INTO v_participant_id, v_event_id, v_owner
  FROM public.event_participations ep
  JOIN public.participants p ON p.id = ep.participant_id
  WHERE ep.id = p_event_participation_id;

  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'Event participation not found' USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(v_owner, false) AND NOT (
    public.app_current_user_role_text() IN ('staff', 'supervisor', 'admin')
    AND public.supervisor_can_view_event(v_event_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to submit for this participation' USING ERRCODE = '42501';
  END IF;

  SELECT ev.vacancy_definition_id INTO v_definition_id
  FROM public.event_vacancies ev
  JOIN public.events e ON e.id = ev.event_id
  JOIN public.vacancy_definitions vd ON vd.id = ev.vacancy_definition_id
  JOIN public.employers emp ON emp.id = vd.employer_id
  WHERE ev.id = p_event_vacancy_id
    AND ev.event_id = v_event_id
    AND (ev.application_deadline IS NULL OR ev.application_deadline > now())
    AND e.status IN ('upcoming', 'ongoing')
    AND vd.is_active = true
    AND emp.is_active = true AND emp.registration_status = 'approved';

  IF v_definition_id IS NULL THEN
    RAISE EXCEPTION 'Event offering is not open or does not belong to this event' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_application
  FROM public.applications a
  WHERE a.registrant_id = p_event_participation_id
    AND a.event_vacancy_id = p_event_vacancy_id
    AND a.application_status IN ('applied', 'shortlisted')
  ORDER BY a.applied_at DESC LIMIT 1;

  IF v_application.id IS NOT NULL THEN
    RETURN jsonb_build_object('application_id', v_application.id, 'status', 'existing');
  END IF;

  BEGIN
    INSERT INTO public.applications (
      participant_id, vacancy_definition_id, registrant_id, event_vacancy_id,
      application_status, source, notes
    ) VALUES (
      v_participant_id, v_definition_id, p_event_participation_id, p_event_vacancy_id,
      'applied', 'event', NULLIF(btrim(p_notes), '')
    ) RETURNING * INTO v_application;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_application FROM public.applications a
    WHERE a.registrant_id = p_event_participation_id
      AND a.event_vacancy_id = p_event_vacancy_id
      AND a.application_status IN ('applied', 'shortlisted')
    ORDER BY a.applied_at DESC LIMIT 1;
    RETURN jsonb_build_object('application_id', v_application.id, 'status', 'existing');
  END;

  RETURN jsonb_build_object('application_id', v_application.id, 'status', 'created');
END
$function$;

CREATE OR REPLACE FUNCTION public.list_my_applications()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_participant_id uuid;
BEGIN
  SELECT p.id INTO v_participant_id
  FROM public.participants p
  WHERE p.auth_user_id = auth.uid();
  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'No participant profile is linked to this account' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'application_id', a.id,
    'vacancy_definition_id', a.vacancy_definition_id,
    'company_name', vd.company_name,
    'position', vd.position,
    'application_status', a.application_status,
    'source', a.source,
    'channel', CASE WHEN a.event_vacancy_id IS NULL THEN 'online' ELSE 'event' END,
    'applied_at', a.applied_at,
    'can_withdraw', a.application_status IN ('applied', 'shortlisted'),
    'event_vacancy_id', a.event_vacancy_id,
    'event_name', e.event_name
  )
  FROM public.applications a
  JOIN public.vacancy_definitions vd ON vd.id = a.vacancy_definition_id
  LEFT JOIN public.event_vacancies ev ON ev.id = a.event_vacancy_id
  LEFT JOIN public.events e ON e.id = ev.event_id
  WHERE a.participant_id = v_participant_id
  ORDER BY a.applied_at DESC, a.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_participant_id uuid;
  v_old_status text;
BEGIN
  SELECT p.id INTO v_participant_id
  FROM public.participants p WHERE p.auth_user_id = auth.uid();
  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'No participant profile is linked to this account' USING ERRCODE = '42501';
  END IF;

  SELECT a.application_status INTO v_old_status
  FROM public.applications a
  WHERE a.id = p_application_id AND a.participant_id = v_participant_id
  FOR UPDATE;
  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42501';
  END IF;
  IF v_old_status NOT IN ('applied', 'shortlisted') THEN
    RAISE EXCEPTION 'Application cannot be withdrawn from its current status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.applications SET application_status = 'withdrawn', updated_at = now()
  WHERE id = p_application_id;
  RETURN jsonb_build_object('application_id', p_application_id, 'status', 'withdrawn');
END
$function$;

CREATE OR REPLACE FUNCTION public.list_employer_applications(
  p_vacancy_definition_id uuid DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_employer_id uuid;
BEGIN
  SELECT e.id INTO v_employer_id
  FROM public.employers e
  WHERE e.registered_user_id = auth.uid()
    AND e.is_active = true AND e.registration_status = 'approved';
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'No active approved employer is linked to this account' USING ERRCODE = '42501';
  END IF;

  IF p_vacancy_definition_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vacancy_definitions vd
    WHERE vd.id = p_vacancy_definition_id AND vd.employer_id = v_employer_id
  ) THEN
    RAISE EXCEPTION 'Vacancy not found or not owned by this employer' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'application_id', a.id,
    'participant_id', a.participant_id,
    'first_name', jp.first_name,
    'last_name', jp.last_name,
    'vacancy_definition_id', a.vacancy_definition_id,
    'company_name', vd.company_name,
    'position', vd.position,
    'application_status', a.application_status,
    'channel', CASE WHEN a.event_vacancy_id IS NULL THEN 'online' ELSE 'event' END,
    'source', a.source,
    'applied_at', a.applied_at,
    'event_vacancy_id', a.event_vacancy_id,
    'event_name', e.event_name
  )
  FROM public.applications a
  JOIN public.vacancy_definitions vd ON vd.id = a.vacancy_definition_id
  JOIN public.jobseeker_profiles jp ON jp.participant_id = a.participant_id
  LEFT JOIN public.event_vacancies ev ON ev.id = a.event_vacancy_id
  LEFT JOIN public.events e ON e.id = ev.event_id
  WHERE vd.employer_id = v_employer_id
    AND (p_vacancy_definition_id IS NULL OR vd.id = p_vacancy_definition_id)
  ORDER BY a.applied_at DESC, a.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.update_application_status(
  p_application_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_employer_id uuid;
  v_old_status text;
BEGIN
  SELECT e.id INTO v_employer_id
  FROM public.employers e
  WHERE e.registered_user_id = auth.uid()
    AND e.is_active = true AND e.registration_status = 'approved';
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'No active approved employer is linked to this account' USING ERRCODE = '42501';
  END IF;

  SELECT a.application_status INTO v_old_status
  FROM public.applications a
  JOIN public.vacancy_definitions vd ON vd.id = a.vacancy_definition_id
  WHERE a.id = p_application_id AND vd.employer_id = v_employer_id
  FOR UPDATE OF a;
  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Application not found or not owned by this employer' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    (v_old_status = 'applied' AND p_new_status IN ('shortlisted', 'rejected'))
    OR (v_old_status = 'shortlisted' AND p_new_status = 'rejected')
  ) THEN
    RAISE EXCEPTION 'Application status transition is not permitted' USING ERRCODE = '22023';
  END IF;

  UPDATE public.applications SET application_status = p_new_status, updated_at = now()
  WHERE id = p_application_id;
  RETURN jsonb_build_object(
    'application_id', p_application_id,
    'old_status', v_old_status,
    'new_status', p_new_status
  );
END
$function$;

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
    SELECT 1 FROM public.employers e
    WHERE e.id = v_employer_id AND e.registered_user_id = auth.uid()
      AND e.is_active = true AND e.registration_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Not authorized to publish this vacancy' USING ERRCODE = '42501';
  END IF;
  IF v_status = 'published' THEN
    RETURN jsonb_build_object('vacancy_definition_id', p_vacancy_definition_id, 'status', 'published');
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft vacancy can be published' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.platform_transition_authorized', 'true', true);
  UPDATE public.vacancy_definitions SET platform_status = 'published'
  WHERE id = p_vacancy_definition_id;
  RETURN jsonb_build_object('vacancy_definition_id', p_vacancy_definition_id, 'status', 'published');
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
    SELECT 1 FROM public.employers e
    WHERE e.id = v_employer_id AND e.registered_user_id = auth.uid()
      AND e.is_active = true AND e.registration_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Not authorized to close this vacancy' USING ERRCODE = '42501';
  END IF;
  IF v_status = 'closed' THEN
    RETURN jsonb_build_object('vacancy_definition_id', p_vacancy_definition_id, 'status', 'closed');
  END IF;
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'Only a published vacancy can be closed' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.platform_transition_authorized', 'true', true);
  UPDATE public.vacancy_definitions SET platform_status = 'closed'
  WHERE id = p_vacancy_definition_id;
  RETURN jsonb_build_object('vacancy_definition_id', p_vacancy_definition_id, 'status', 'closed');
END
$function$;

-- Safe public platform discovery. The payload intentionally excludes internal fields.
CREATE OR REPLACE FUNCTION public.list_platform_vacancies(
  p_search text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', vd.id,
    'company_name', vd.company_name,
    'position', vd.position,
    'job_description', vd.job_description,
    'qualifications', vd.qualifications,
    'requirements_summary', vd.requirements_summary,
    'employment_type', et.name,
    'work_arrangement', wa.name,
    'place_of_assignment', vd.place_of_assignment,
    'province', vd.province,
    'municipality_city', vd.municipality_city,
    'salary_min', vd.salary_min,
    'salary_max', vd.salary_max,
    'salary_currency', vd.salary_currency,
    'salary_period', vd.salary_period,
    'salary_negotiable', vd.salary_negotiable,
    'available_slots', vd.available_slots,
    'platform_status', vd.platform_status,
    'published_at', vd.published_at,
    'application_deadline', vd.platform_application_deadline
  )
  FROM public.vacancy_definitions vd
  JOIN public.employers e ON e.id = vd.employer_id
  LEFT JOIN public.employment_types et ON et.id = vd.employment_type_id
  LEFT JOIN public.work_arrangements wa ON wa.id = vd.work_arrangement_id
  WHERE vd.is_active = true
    AND vd.platform_status = 'published'
    AND vd.published_at IS NOT NULL
    AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline > now())
    AND e.is_active = true AND e.registration_status = 'approved'
    AND (
      NULLIF(btrim(p_search), '') IS NULL
      OR vd.position ILIKE '%' || btrim(p_search) || '%'
      OR vd.company_name ILIKE '%' || btrim(p_search) || '%'
      OR vd.place_of_assignment ILIKE '%' || btrim(p_search) || '%'
    )
  ORDER BY vd.published_at DESC, vd.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_platform_vacancy(p_vacancy_definition_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT x.item
  FROM public.list_platform_vacancies(NULL) AS x(item)
  WHERE (x.item ->> 'id')::uuid = p_vacancy_definition_id
$function$;

CREATE OR REPLACE FUNCTION public.list_event_vacancies(p_event_id uuid)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', ev.id,
    'event_id', ev.event_id,
    'slots_offered', ev.slots_offered,
    'slots_filled', ev.slots_filled,
    'application_deadline', ev.application_deadline,
    'vacancy_definition_id', vd.id,
    'company_name', vd.company_name,
    'position', vd.position,
    'job_description', vd.job_description,
    'qualifications', vd.qualifications,
    'place_of_assignment', vd.place_of_assignment,
    'salary_range', vd.salary_range
  )
  FROM public.event_vacancies ev
  JOIN public.events e ON e.id = ev.event_id
  JOIN public.vacancy_definitions vd ON vd.id = ev.vacancy_definition_id
  JOIN public.employers emp ON emp.id = vd.employer_id
  WHERE (p_event_id IS NULL OR ev.event_id = p_event_id)
    AND e.status <> 'cancelled'
    AND vd.is_active = true
    AND emp.is_active = true AND emp.registration_status = 'approved'
  ORDER BY vd.company_name, vd.position, ev.id;
$function$;

-- SECURITY DEFINER functions are closed by default and opened only to their callers.
REVOKE ALL ON FUNCTION public.submit_application(uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.submit_event_application(uuid, uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.list_my_applications() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.withdraw_application(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.list_employer_applications(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_application_status(uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.publish_vacancy(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.close_vacancy(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_application(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_event_application(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_applications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_employer_applications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_application_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_vacancy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_vacancy(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_platform_vacancies(text) FROM PUBLIC, service_role;
REVOKE ALL ON FUNCTION public.get_platform_vacancy(uuid) FROM PUBLIC, service_role;
REVOKE ALL ON FUNCTION public.list_event_vacancies(uuid) FROM PUBLIC, service_role;
GRANT EXECUTE ON FUNCTION public.list_platform_vacancies(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_vacancy(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_vacancies(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Matching retrieval reconciliation (scoring code and weights are unchanged)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_jobseeker_match_profile(p_jobseeker_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_result jsonb;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
  END IF;
  v_role := public.app_current_user_role_text();

  IF v_role = 'admin' THEN
    NULL;
  ELSIF v_role IN ('staff', 'supervisor') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.event_participations ep
      WHERE ep.participant_id = p_jobseeker_profile_id
        AND public.supervisor_can_view_event(ep.event_id)
    ) THEN
      RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'applicant' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = p_jobseeker_profile_id AND p.auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'employer' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.vacancy_definitions vd ON vd.id = a.vacancy_definition_id
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE a.participant_id = p_jobseeker_profile_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
      UNION ALL
      SELECT 1
      FROM public.participation_vacancies pv
      JOIN public.event_participations ep ON ep.id = pv.participation_id
      JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
      JOIN public.vacancy_definitions vd ON vd.id = ev.vacancy_definition_id
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE ep.participant_id = p_jobseeker_profile_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
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
      SELECT jsonb_agg(jsonb_build_object(
        'id', je.id, 'education_level_id', je.education_level_id,
        'level_code', el.code, 'level_name', el.name, 'rank', el.rank,
        'school_name', je.school_name, 'field_of_study', je.field_of_study,
        'course_program', je.course_program, 'status', je.status,
        'graduation_year', je.graduation_year
      ) ORDER BY el.rank DESC)
      FROM public.jobseeker_education je
      JOIN public.education_levels el ON el.id = je.education_level_id
      WHERE je.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'skills', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', js.id, 'skill_id', js.skill_id, 'canonical_name', s.canonical_name,
        'skill_type', s.skill_type, 'proficiency_level', js.proficiency_level,
        'years_experience', js.years_experience, 'verification_status', js.verification_status
      ))
      FROM public.jobseeker_skills js
      JOIN public.skills s ON s.id = js.skill_id
      WHERE js.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'certifications', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', jc.id, 'certification_id', jc.certification_id,
        'canonical_name', c.canonical_name,
        'issuing_organization', COALESCE(jc.issuing_organization_override, c.issuing_organization),
        'certification_type', c.certification_type, 'does_not_expire', jc.does_not_expire,
        'expiration_date', jc.expiration_date, 'date_issued', jc.date_issued,
        'verification_status', jc.verification_status
      ))
      FROM public.jobseeker_certifications jc
      LEFT JOIN public.certifications c ON c.id = jc.certification_id
      WHERE jc.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'languages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', jl.id, 'language_id', jl.language_id, 'code', l.code, 'name', l.name,
        'speaking_proficiency', jl.speaking_proficiency,
        'reading_proficiency', jl.reading_proficiency,
        'writing_proficiency', jl.writing_proficiency, 'is_native', jl.is_native
      ))
      FROM public.jobseeker_languages jl
      JOIN public.languages l ON l.id = jl.language_id
      WHERE jl.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'work_experiences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', we.id, 'employer_name', we.employer_name,
        'position_title', we.position_title, 'industry', we.industry,
        'start_date', we.start_date, 'end_date', we.end_date,
        'is_current', we.is_current, 'description', we.description
      ) ORDER BY COALESCE(we.end_date, '9999-12-31'::date) DESC)
      FROM public.work_experiences we
      WHERE we.participant_id = jp.participant_id
    ), '[]'::jsonb),
    'occupation_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'occupation_id', op.occupation_id, 'canonical_name', o.canonical_name,
        'priority', op.priority, 'preference_type', op.preference_type
      ) ORDER BY op.priority)
      FROM public.jobseeker_occupation_preferences op
      JOIN public.occupations o ON o.id = op.occupation_id
      WHERE op.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'industry_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'industry_id', ip.industry_id, 'canonical_name', i.canonical_name,
        'priority', ip.priority
      ) ORDER BY ip.priority)
      FROM public.jobseeker_industry_preferences ip
      JOIN public.industries i ON i.id = ip.industry_id
      WHERE ip.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'employment_type_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'employment_type_id', ep.employment_type_id, 'code', et.code,
        'name', et.name, 'priority', ep.priority
      ) ORDER BY ep.priority)
      FROM public.jobseeker_employment_type_preferences ep
      JOIN public.employment_types et ON et.id = ep.employment_type_id
      WHERE ep.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'work_arrangement_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'work_arrangement_id', wp.work_arrangement_id, 'code', wa.code,
        'name', wa.name, 'priority', wp.priority
      ) ORDER BY wp.priority)
      FROM public.jobseeker_work_arrangement_preferences wp
      JOIN public.work_arrangements wa ON wa.id = wp.work_arrangement_id
      WHERE wp.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'location_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'province', lp.province, 'municipality_city', lp.municipality_city,
        'region', lp.region, 'is_primary', lp.is_primary, 'priority', lp.priority
      ) ORDER BY lp.priority)
      FROM public.jobseeker_location_preferences lp
      WHERE lp.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.jobseeker_profiles jp
  WHERE jp.participant_id = p_jobseeker_profile_id;

  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_vacancy_match_profile(
  p_vacancy_definition_id uuid,
  p_event_vacancy_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_result jsonb;
  v_deadline timestamptz;
  v_visible boolean := false;
  v_role text := public.app_current_user_role_text();
BEGIN
  IF p_event_vacancy_id IS NOT NULL THEN
    SELECT ev.application_deadline INTO v_deadline
    FROM public.event_vacancies ev
    JOIN public.events e ON e.id = ev.event_id
    WHERE ev.id = p_event_vacancy_id
      AND ev.vacancy_definition_id = p_vacancy_definition_id
      AND e.status <> 'cancelled';
    v_visible := FOUND;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = p_vacancy_definition_id
        AND vd.is_active = true
        AND vd.platform_status = 'published'
        AND vd.published_at IS NOT NULL
        AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline > now())
        AND e.is_active = true AND e.registration_status = 'approved'
    ) INTO v_visible;
  END IF;

  IF NOT v_visible AND v_role = 'employer' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = p_vacancy_definition_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
    ) INTO v_visible;
  ELSIF NOT v_visible AND v_role = 'admin' THEN
    v_visible := true;
  END IF;

  IF NOT v_visible THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', vd.id,
    'employer_id', vd.employer_id,
    'company_name', vd.company_name,
    'position', vd.position,
    'is_active', vd.is_active,
    'application_deadline', CASE WHEN p_event_vacancy_id IS NULL
      THEN vd.platform_application_deadline ELSE v_deadline END,
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
    'salary_currency', COALESCE(vd.salary_currency, 'PHP'),
    'salary_period', vd.salary_period,
    'salary_negotiable', COALESCE(vd.salary_negotiable, false),
    'province', vd.province,
    'municipality_city', vd.municipality_city,
    'place_of_assignment', vd.place_of_assignment,
    'qualifications', vd.qualifications,
    'education_requirements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ve.id, 'education_level_id', ve.education_level_id,
        'level_code', el.code, 'level_name', el.name, 'rank', el.rank,
        'field_of_study', ve.field_of_study, 'importance', ve.importance, 'notes', ve.notes
      ))
      FROM public.vacancy_education_requirements ve
      JOIN public.education_levels el ON el.id = ve.education_level_id
      WHERE ve.vacancy_definition_id = vd.id
    ), '[]'::jsonb),
    'experience_requirements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vx.id, 'occupation_id', vx.occupation_id, 'industry_id', vx.industry_id,
        'minimum_months', vx.minimum_months, 'importance', vx.importance,
        'description', vx.description
      ))
      FROM public.vacancy_experience_requirements vx
      WHERE vx.vacancy_definition_id = vd.id
    ), '[]'::jsonb),
    'skills', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vs.id, 'skill_id', vs.skill_id, 'canonical_name', s.canonical_name,
        'skill_type', s.skill_type, 'importance', vs.importance,
        'minimum_proficiency', vs.minimum_proficiency,
        'minimum_years_experience', vs.minimum_years_experience
      ))
      FROM public.vacancy_skills vs
      JOIN public.skills s ON s.id = vs.skill_id
      WHERE vs.vacancy_definition_id = vd.id
    ), '[]'::jsonb),
    'certification_requirements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vc.id, 'certification_id', vc.certification_id,
        'canonical_name', c.canonical_name, 'importance', vc.importance,
        'must_be_valid', vc.must_be_valid, 'notes', vc.notes
      ))
      FROM public.vacancy_certification_requirements vc
      JOIN public.certifications c ON c.id = vc.certification_id
      WHERE vc.vacancy_definition_id = vd.id
    ), '[]'::jsonb),
    'language_requirements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vl.id, 'language_id', vl.language_id, 'code', l.code, 'name', l.name,
        'importance', vl.importance, 'minimum_speaking', vl.minimum_speaking,
        'minimum_reading', vl.minimum_reading, 'minimum_writing', vl.minimum_writing
      ))
      FROM public.vacancy_language_requirements vl
      JOIN public.languages l ON l.id = vl.language_id
      WHERE vl.vacancy_definition_id = vd.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.vacancy_definitions vd
  LEFT JOIN public.occupations o ON o.id = vd.occupation_id
  LEFT JOIN public.industries i ON i.id = vd.industry_id
  LEFT JOIN public.employment_types et ON et.id = vd.employment_type_id
  LEFT JOIN public.work_arrangements wa ON wa.id = vd.work_arrangement_id
  WHERE vd.id = p_vacancy_definition_id;

  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_vacancies_match_profiles(
  p_vacancy_definition_ids uuid[] DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_results jsonb;
BEGIN
  IF p_event_id IS NULL THEN
    SELECT jsonb_agg(public.get_vacancy_match_profile(vd.id, NULL) ORDER BY vd.id)
    INTO v_results
    FROM public.vacancy_definitions vd
    JOIN public.employers emp ON emp.id = vd.employer_id
    WHERE (p_vacancy_definition_ids IS NULL OR vd.id = ANY(p_vacancy_definition_ids))
      AND vd.is_active = true
      AND vd.platform_status = 'published'
      AND vd.published_at IS NOT NULL
      AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline > now())
      AND emp.is_active = true AND emp.registration_status = 'approved';
  ELSE
    SELECT jsonb_agg(public.get_vacancy_match_profile(ev.vacancy_definition_id, ev.id) ORDER BY ev.id)
    INTO v_results
    FROM public.event_vacancies ev
    JOIN public.events e ON e.id = ev.event_id
    JOIN public.vacancy_definitions vd ON vd.id = ev.vacancy_definition_id
    JOIN public.employers emp ON emp.id = vd.employer_id
    WHERE ev.event_id = p_event_id
      AND (p_vacancy_definition_ids IS NULL OR ev.vacancy_definition_id = ANY(p_vacancy_definition_ids))
      AND e.status <> 'cancelled'
      AND vd.is_active = true
      AND emp.is_active = true AND emp.registration_status = 'approved';
  END IF;

  RETURN COALESCE(v_results, '[]'::jsonb);
END
$function$;

CREATE OR REPLACE FUNCTION public.get_vacancy_candidate_match_profiles(
  p_vacancy_definition_id uuid,
  p_event_vacancy_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_results jsonb;
  v_role text := public.app_current_user_role_text();
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_event_vacancy_id IS NOT NULL THEN
    SELECT ev.event_id INTO v_event_id FROM public.event_vacancies ev
    WHERE ev.id = p_event_vacancy_id AND ev.vacancy_definition_id = p_vacancy_definition_id;
    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'Event offering does not match the vacancy' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_role = 'employer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = p_vacancy_definition_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Not authorized for this candidate pool' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'admin' THEN
    NULL;
  ELSIF v_role IN ('staff', 'supervisor') AND v_event_id IS NOT NULL
        AND public.supervisor_can_view_event(v_event_id) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized for this candidate pool' USING ERRCODE = '42501';
  END IF;

  WITH authorized_candidates AS (
    SELECT a.participant_id, 'application'::text AS candidate_source,
           a.application_status, a.applied_at
    FROM public.applications a
    WHERE a.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR a.event_vacancy_id = p_event_vacancy_id)

    UNION ALL

    SELECT ep.participant_id, 'event_interest'::text, 'interested'::text, pv.created_at
    FROM public.participation_vacancies pv
    JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
    JOIN public.event_participations ep ON ep.id = pv.participation_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR ev.id = p_event_vacancy_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.applications a2
        WHERE a2.participant_id = ep.participant_id
          AND a2.vacancy_definition_id = p_vacancy_definition_id
          AND (p_event_vacancy_id IS NULL OR a2.event_vacancy_id = p_event_vacancy_id)
      )
  ), deduped AS (
    SELECT DISTINCT ON (participant_id) *
    FROM authorized_candidates
    ORDER BY participant_id, CASE candidate_source WHEN 'application' THEN 1 ELSE 2 END, applied_at DESC
  )
  SELECT jsonb_agg(jsonb_build_object(
    'candidate_source', d.candidate_source,
    'application_status', d.application_status,
    'applied_at', d.applied_at,
    'profile', public.get_jobseeker_match_profile(d.participant_id)
  )) INTO v_results
  FROM deduped d;

  RETURN COALESCE(v_results, '[]'::jsonb);
END
$function$;

CREATE OR REPLACE FUNCTION public.search_similar_vacancies(
  p_jobseeker_embedding extensions.vector(1536),
  p_embedding_version text DEFAULT 'vacancy-semantic-v1',
  p_limit integer DEFAULT 10,
  p_min_similarity double precision DEFAULT 0.3
)
RETURNS TABLE (
  vacancy_id uuid,
  semantic_similarity double precision,
  embedding_version text,
  model text,
  generated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ee.entity_id,
         1 - (ee.embedding OPERATOR(extensions.<=>) p_jobseeker_embedding),
         ee.embedding_version, ee.model, ee.generated_at
  FROM public.employment_embeddings ee
  JOIN public.vacancy_definitions vd ON vd.id = ee.entity_id
  JOIN public.employers emp ON emp.id = vd.employer_id
  WHERE ee.entity_type = 'vacancy'
    AND ee.embedding_type = 'vacancy_match_profile'
    AND ee.embedding_version = p_embedding_version
    AND ee.status = 'current' AND ee.embedding IS NOT NULL
    AND vd.is_active = true
    AND vd.platform_status = 'published'
    AND vd.published_at IS NOT NULL
    AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline > now())
    AND emp.is_active = true AND emp.registration_status = 'approved'
    AND (1 - (ee.embedding OPERATOR(extensions.<=>) p_jobseeker_embedding)) >= p_min_similarity
  ORDER BY ee.embedding OPERATOR(extensions.<=>) p_jobseeker_embedding
  LIMIT GREATEST(0, LEAST(p_limit, 100));
END
$function$;

-- DEV carried an unledgered jsonb-returning variant while the canonical
-- September-15 function returned rows. PostgreSQL cannot replace a return
-- type in place, so remove this exact overload and recreate it below.
DROP FUNCTION IF EXISTS public.search_similar_candidates(
  extensions.vector, uuid, uuid, text, integer, double precision
);

CREATE FUNCTION public.search_similar_candidates(
  p_vacancy_embedding extensions.vector(1536),
  p_vacancy_definition_id uuid,
  p_event_vacancy_id uuid DEFAULT NULL,
  p_embedding_version text DEFAULT 'jobseeker-semantic-v1',
  p_limit integer DEFAULT 10,
  p_min_similarity double precision DEFAULT 0.3
)
RETURNS TABLE (
  jobseeker_profile_id uuid,
  semantic_similarity double precision,
  embedding_version text,
  model text,
  generated_at timestamptz,
  candidate_source text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text := public.app_current_user_role_text();
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_event_vacancy_id IS NOT NULL THEN
    SELECT ev.event_id INTO v_event_id FROM public.event_vacancies ev
    WHERE ev.id = p_event_vacancy_id AND ev.vacancy_definition_id = p_vacancy_definition_id;
    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'Event offering does not match the vacancy' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_role = 'employer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = p_vacancy_definition_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Not authorized for this candidate pool' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'admin' THEN
    NULL;
  ELSIF v_role IN ('staff', 'supervisor') AND v_event_id IS NOT NULL
        AND public.supervisor_can_view_event(v_event_id) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized for this candidate pool' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH authorized_candidates AS (
    SELECT a.participant_id, 'application'::text AS source
    FROM public.applications a
    WHERE a.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR a.event_vacancy_id = p_event_vacancy_id)
    UNION ALL
    SELECT ep.participant_id, 'event_interest'::text
    FROM public.participation_vacancies pv
    JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
    JOIN public.event_participations ep ON ep.id = pv.participation_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR ev.id = p_event_vacancy_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.applications a2
        WHERE a2.participant_id = ep.participant_id
          AND a2.vacancy_definition_id = p_vacancy_definition_id
          AND (p_event_vacancy_id IS NULL OR a2.event_vacancy_id = p_event_vacancy_id)
      )
  ), deduped AS (
    SELECT DISTINCT ON (participant_id) participant_id, source
    FROM authorized_candidates
    ORDER BY participant_id, CASE source WHEN 'application' THEN 1 ELSE 2 END
  )
  SELECT ee.entity_id,
         1 - (ee.embedding OPERATOR(extensions.<=>) p_vacancy_embedding),
         ee.embedding_version, ee.model, ee.generated_at, d.source
  FROM deduped d
  JOIN public.employment_embeddings ee
    ON ee.entity_id = d.participant_id
   AND ee.entity_type = 'jobseeker_profile'
   AND ee.embedding_type = 'jobseeker_match_profile'
   AND ee.embedding_version = p_embedding_version
   AND ee.status = 'current' AND ee.embedding IS NOT NULL
  WHERE (1 - (ee.embedding OPERATOR(extensions.<=>) p_vacancy_embedding)) >= p_min_similarity
  ORDER BY ee.embedding OPERATOR(extensions.<=>) p_vacancy_embedding
  LIMIT GREATEST(0, LEAST(p_limit, 100));
END
$function$;

REVOKE ALL ON FUNCTION public.get_jobseeker_match_profile(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_vacancy_match_profile(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_vacancies_match_profiles(uuid[], uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_vacancy_candidate_match_profiles(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.search_similar_vacancies(extensions.vector, text, integer, double precision) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.search_similar_candidates(extensions.vector, uuid, uuid, text, integer, double precision) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_jobseeker_match_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vacancy_match_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vacancies_match_profiles(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vacancy_candidate_match_profiles(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_similar_vacancies(extensions.vector, text, integer, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_similar_candidates(extensions.vector, uuid, uuid, text, integer, double precision) TO authenticated;

COMMENT ON FUNCTION public.submit_application(uuid, text)
  IS 'Canonical self-service direct application; participant identity is derived from auth.uid().';
COMMENT ON FUNCTION public.submit_event_application(uuid, uuid, text)
  IS 'Canonical explicit formal event application; interest remains separate.';
COMMENT ON FUNCTION public.list_event_vacancies(uuid)
  IS 'Narrow event-scoped discovery without globally exposing draft vacancy definitions.';
COMMENT ON FUNCTION public.get_vacancies_match_profiles(uuid[], uuid)
  IS 'Canonical platform/event matching retrieval with one exact offering per event result.';
COMMENT ON FUNCTION public.search_similar_candidates(extensions.vector, uuid, uuid, text, integer, double precision)
  IS 'Authorized semantic candidate retrieval over canonical applications and event interests.';

COMMIT;
