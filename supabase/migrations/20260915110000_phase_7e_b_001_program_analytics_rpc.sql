BEGIN;
-- Effective-event program metrics aggregate RPC.
--
-- Effective-event rule (proven from Phase 7E-A schema):
--   An event is effective when no later correction references it
--   through corrected_event_id. The CHECK constraint
--   (event_kind='correction')=(corrected_event_id IS NOT NULL)
--   guarantees corrections always mark their target.
--
-- Metric grain (event-count):
--   count(*) = number of effective transition events in scope.
--   This counts transition OCCURRENCES, not unique participations.
--   A workflow that revisits a stage (started → withdrawn → started)
--   produces two effective started events.
--
-- Outcome semantics:
--   program_participation_outcomes is immutable (before UPDATE/DELETE
--   trigger). link_is_verified validates the employment outcome is:
--   (a) hired, (b) verified, (c) same person, (d) most recent for
--   that application, (e) not already linked with mismatched date.
--   No outcome correction/superseding mechanism exists in Phase 7E-A.
--
-- Date support:
--   Half-open range: occurred_at >= start, occurred_at < end.
--   Snapshot metrics reject incompatible date filters.
--
-- Authorization:
--   SECURITY INVOKER calling program_internal.is_admin() (SECURITY DEFINER).
--   Active admin required. Non-admin gets 42501.

CREATE OR REPLACE FUNCTION public.get_program_metrics(
  p_program_id uuid DEFAULT NULL,
  p_cycle_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
DECLARE
  v_program_id uuid := p_program_id;
  v_cycle_id uuid := p_cycle_id;
  result jsonb;
BEGIN
  IF NOT program_internal.is_admin() THEN RAISE EXCEPTION 'Active admin required' USING ERRCODE='42501'; END IF;

  -- Scope validation: reject conflicting program/cycle.
  IF v_cycle_id IS NOT NULL AND v_program_id IS NOT NULL THEN
   IF NOT EXISTS(
    SELECT 1 FROM public.employment_program_cycles c
    WHERE c.id = v_cycle_id AND c.program_id = v_program_id
   ) THEN RAISE EXCEPTION 'Cycle % does not belong to program %', v_cycle_id, v_program_id USING ERRCODE='22023'; END IF;
  ELSIF v_cycle_id IS NOT NULL THEN
   SELECT c.program_id INTO v_program_id
   FROM public.employment_program_cycles c WHERE c.id = v_cycle_id;
   IF v_program_id IS NULL THEN RAISE EXCEPTION 'Cycle not found'; END IF;
  ELSIF v_program_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.employment_programs WHERE employment_programs.id = v_program_id) THEN RAISE EXCEPTION 'Program not found'; END IF;
  END IF;

  -- Date validation: reject snapshot-incompatible date filters.
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
   IF p_start_date >= p_end_date THEN RAISE EXCEPTION 'Start must be before end'; END IF;
  ELSIF (p_start_date IS NULL) != (p_end_date IS NULL) THEN
   RAISE EXCEPTION 'Supply both date boundaries or neither';
  END IF;

  WITH scope_participations AS (
   SELECT pp.id, pp.participant_id, pp.program_cycle_id
   FROM public.program_participations pp
   WHERE (v_cycle_id IS NULL OR pp.program_cycle_id = v_cycle_id)
    AND (v_program_id IS NULL OR pp.program_cycle_id IN (
     SELECT c.id FROM public.employment_program_cycles c WHERE c.program_id = v_program_id))
  ),
  -- Effective events: not superseded by any correction.
  effective_events AS (
   SELECT e.id AS event_id, e.program_participation_id, e.stage, e.occurred_at, e.event_kind
   FROM public.program_participation_events e
   JOIN scope_participations pp ON pp.id = e.program_participation_id
   WHERE NOT EXISTS(
    SELECT 1 FROM public.program_participation_events superseding
    WHERE superseding.corrected_event_id = e.id
   )
   AND (p_start_date IS NULL OR e.occurred_at >= p_start_date)
   AND (p_end_date IS NULL OR e.occurred_at < p_end_date)
  ),
  stage_counts AS (
   SELECT
    count(*) FILTER (WHERE stage = 'referred') AS referrals,
    count(*) FILTER (WHERE stage = 'applied') AS applications,
    count(*) FILTER (WHERE stage = 'enrolled') AS enrollments,
    count(*) FILTER (WHERE stage = 'started') AS starts,
    count(*) FILTER (WHERE stage = 'completed') AS completions,
    count(*) FILTER (WHERE stage = 'withdrawn') AS withdrawals,
    count(*) FILTER (WHERE stage = 'disqualified') AS disqualifications
   FROM effective_events
  ),
  participant_counts AS (
   SELECT count(DISTINCT participant_id) AS unique_participants
   FROM scope_participations
  ),
  verified_employment AS (
   SELECT count(DISTINCT pp.participant_id) AS with_verified_employment
   FROM scope_participations pp
   JOIN public.program_participation_outcomes o ON o.program_participation_id = pp.id
   WHERE o.outcome_type = 'employment' AND o.verification_status = 'verified'
    AND o.employment_outcome_id IS NOT NULL
    AND program_internal.link_is_verified(o.employment_outcome_id, pp.participant_id)
  )
  SELECT jsonb_build_object(
   'version', 'program-metrics-v1',
   'observed_on', to_char(current_date, 'YYYY-MM-DD'),
   'program_id', v_program_id,
   'cycle_id', v_cycle_id,
   'date_start', p_start_date,
   'date_end', p_end_date,
   'cells', jsonb_build_array(
    jsonb_build_object('metric_id', 'program_referrals', 'numerator', s.referrals, 'denominator', null, 'value', s.referrals, 'status', 'available', 'suppressed', false),
    jsonb_build_object('metric_id', 'program_applications', 'numerator', s.applications, 'denominator', null, 'value', s.applications, 'status', 'available', 'suppressed', false),
    jsonb_build_object('metric_id', 'program_enrollments', 'numerator', s.enrollments, 'denominator', null, 'value', s.enrollments, 'status', 'available', 'suppressed', false),
    jsonb_build_object('metric_id', 'program_starts', 'numerator', s.starts, 'denominator', null, 'value', s.starts, 'status', 'available', 'suppressed', false),
    jsonb_build_object('metric_id', 'program_completions', 'numerator', s.completions, 'denominator', null, 'value', s.completions, 'status', 'available', 'suppressed', false),
    jsonb_build_object('metric_id', 'program_withdrawals', 'numerator', s.withdrawals, 'denominator', null, 'value', s.withdrawals, 'status', 'available', 'suppressed', false),
    jsonb_build_object('metric_id', 'program_disqualifications', 'numerator', s.disqualifications, 'denominator', null, 'value', s.disqualifications, 'status', 'available', 'suppressed', false),
    jsonb_build_object('metric_id', 'unique_program_participants', 'numerator', p.unique_participants, 'denominator', null, 'value', p.unique_participants, 'status', 'available', 'suppressed', false),
    jsonb_build_object('metric_id', 'program_participants_with_verified_employment', 'numerator', ve.with_verified_employment, 'denominator', null, 'value', ve.with_verified_employment, 'status', 'available', 'suppressed', false)
   )
  ) INTO result
  FROM stage_counts s, participant_counts p, verified_employment ve;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_program_metrics(uuid, uuid, date, date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_program_metrics(uuid, uuid, date, date) TO authenticated;
COMMENT ON FUNCTION public.get_program_metrics(uuid, uuid, date, date) IS 'Admin-only stage-specific program metrics. Effective-event correction-aware counting. No causal claims. Employment outcome is observational only.';
COMMIT;
