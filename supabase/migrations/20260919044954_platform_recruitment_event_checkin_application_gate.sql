BEGIN;

-- Formal event applications are only valid after an auditable physical check-in.
-- This is intentionally an INSERT-only invariant so historical applications can
-- still move through their existing status lifecycle without fabricating attendance.
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
  v_valid_check_in boolean;
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

  SELECT ep.participant_id, ep.event_id,
         ep.check_in_status = 'checked_in' AND ep.check_in_time IS NOT NULL
  INTO v_participant_id, v_participation_event_id, v_valid_check_in
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

  IF TG_OP = 'INSERT' AND NOT COALESCE(v_valid_check_in, false) THEN
    RAISE EXCEPTION 'Formal event application requires completed event check-in' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

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
  v_valid_check_in boolean;
  v_application public.applications%ROWTYPE;
BEGIN
  SELECT ep.participant_id, ep.event_id,
         (p.auth_user_id = auth.uid()),
         ep.check_in_status = 'checked_in' AND ep.check_in_time IS NOT NULL
  INTO v_participant_id, v_event_id, v_owner, v_valid_check_in
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

  IF NOT COALESCE(v_valid_check_in, false) THEN
    RAISE EXCEPTION 'Formal event application requires completed event check-in' USING ERRCODE = '22023';
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

REVOKE ALL ON FUNCTION public.submit_event_application(uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_event_application(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.submit_event_application(uuid, uuid, text)
  IS 'Canonical explicit formal event application after verified physical event check-in; registration and interest remain separate.';

COMMIT;
