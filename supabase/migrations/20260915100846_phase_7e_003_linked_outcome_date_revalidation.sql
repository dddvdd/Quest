BEGIN;
CREATE OR REPLACE FUNCTION program_internal.link_is_verified(p_outcome uuid,p_participant uuid) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.employment_outcomes o
  JOIN public.applications a ON a.id=o.application_id JOIN public.event_participations ep ON ep.id=a.registrant_id
  WHERE o.id=p_outcome AND ep.participant_id=p_participant AND o.outcome='hired'
   AND o.verified_by IS NOT NULL AND o.verification_date IS NOT NULL AND o.hired_at IS NOT NULL
   AND o.id=(SELECT x.id FROM public.employment_outcomes x WHERE x.application_id=o.application_id ORDER BY x.created_at DESC,x.id DESC LIMIT 1)
   AND NOT EXISTS(SELECT 1 FROM public.program_participation_outcomes linked
    JOIN public.program_participations pp ON pp.id=linked.program_participation_id
    WHERE linked.employment_outcome_id=o.id AND pp.participant_id=p_participant
     AND (linked.occurred_at AT TIME ZONE 'UTC')::date IS DISTINCT FROM o.hired_at))
$$;
COMMIT;
