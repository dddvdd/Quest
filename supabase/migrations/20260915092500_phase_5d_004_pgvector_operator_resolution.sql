-- Phase 5D - pgvector operator resolution under the hardened search path

BEGIN;

CREATE OR REPLACE FUNCTION public.search_similar_candidates(
  p_vacancy_embedding vector(1536),
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
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized to search candidates for this vacancy' USING ERRCODE = '42501';
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
      RAISE EXCEPTION 'Unauthorized to search candidates for this vacancy' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized to search candidates for this vacancy' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH authorized_candidates AS (
    SELECT
      ep.participant_id,
      'application'::text AS candidate_source
    FROM public.applications a
    JOIN public.event_vacancies ev ON ev.id = a.event_vacancy_id
    JOIN public.event_participations ep ON ep.id = a.registrant_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR ev.id = p_event_vacancy_id)
      AND ep.participant_id IS NOT NULL

    UNION ALL

    SELECT
      ep.participant_id,
      'event_interest'::text AS candidate_source
    FROM public.participation_vacancies pv
    JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
    JOIN public.event_participations ep ON ep.id = pv.participation_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR ev.id = p_event_vacancy_id)
      AND ep.participant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.applications a2
        WHERE a2.event_vacancy_id = ev.id
          AND a2.registrant_id = ep.id
      )
  ),
  deduped_candidates AS (
    SELECT DISTINCT ON (ac.participant_id)
      ac.participant_id,
      ac.candidate_source
    FROM authorized_candidates ac
    ORDER BY
      ac.participant_id,
      CASE ac.candidate_source WHEN 'application' THEN 1 ELSE 2 END
  )
  SELECT
    ee.entity_id,
    1 - (ee.embedding OPERATOR(extensions.<=>) p_vacancy_embedding),
    ee.embedding_version,
    ee.model,
    ee.generated_at,
    dc.candidate_source
  FROM deduped_candidates dc
  JOIN public.employment_embeddings ee
    ON ee.entity_id = dc.participant_id
   AND ee.entity_type = 'jobseeker_profile'
   AND ee.embedding_type = 'jobseeker_match_profile'
   AND ee.embedding_version = p_embedding_version
   AND ee.status = 'current'
   AND ee.embedding IS NOT NULL
  WHERE (1 - (ee.embedding OPERATOR(extensions.<=>) p_vacancy_embedding)) >= p_min_similarity
  ORDER BY ee.embedding OPERATOR(extensions.<=>) p_vacancy_embedding
  LIMIT p_limit;
END;
$function$;

COMMENT ON FUNCTION public.search_similar_candidates(vector, uuid, uuid, text, integer, double precision)
  IS 'Phase 5D authorized semantic retrieval with explicitly qualified pgvector cosine operator.';

COMMIT;

