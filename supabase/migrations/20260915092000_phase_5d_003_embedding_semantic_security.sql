-- Phase 5D - semantic candidate retrieval and embedding integrity hardening

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
    1 - (ee.embedding <=> p_vacancy_embedding),
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
  WHERE (1 - (ee.embedding <=> p_vacancy_embedding)) >= p_min_similarity
  ORDER BY ee.embedding <=> p_vacancy_embedding
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_similar_candidates(vector, uuid, uuid, text, integer, double precision)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.search_similar_candidates(vector, uuid, uuid, text, integer, double precision)
  TO authenticated;

DROP POLICY IF EXISTS "System can insert embeddings" ON public.employment_embeddings;
DROP POLICY IF EXISTS "System can update embeddings" ON public.employment_embeddings;
DROP POLICY IF EXISTS "Staff/Admin can delete embeddings" ON public.employment_embeddings;

DROP POLICY IF EXISTS "Employers can view vacancy embeddings" ON public.employment_embeddings;
CREATE POLICY "Employers can view owned vacancy embeddings"
  ON public.employment_embeddings
  FOR SELECT
  TO authenticated
  USING (
    entity_type = 'vacancy'
    AND EXISTS (
      SELECT 1
      FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = employment_embeddings.entity_id
        AND e.registered_user_id = auth.uid()
        AND e.registration_status = 'approved'
    )
  );

REVOKE ALL ON TABLE public.employment_embeddings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.employment_embeddings FROM authenticated;
GRANT SELECT ON TABLE public.employment_embeddings TO authenticated;
GRANT ALL ON TABLE public.employment_embeddings TO service_role;

CREATE OR REPLACE FUNCTION public.get_embedding_metadata(
  p_entity_type entity_type,
  p_entity_id uuid,
  p_embedding_type embedding_type DEFAULT NULL,
  p_embedding_version text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_hash text,
  provider text,
  model text,
  dimensions integer,
  embedding_version text,
  status embedding_status,
  error_message text,
  created_at timestamptz,
  updated_at timestamptz,
  generated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ee.id,
    ee.source_hash,
    ee.provider,
    ee.model,
    ee.dimensions,
    ee.embedding_version,
    ee.status,
    ee.error_message,
    ee.created_at,
    ee.updated_at,
    ee.generated_at
  FROM public.employment_embeddings ee
  WHERE ee.entity_type = p_entity_type
    AND ee.entity_id = p_entity_id
    AND (p_embedding_type IS NULL OR ee.embedding_type = p_embedding_type)
    AND (p_embedding_version IS NULL OR ee.embedding_version = p_embedding_version);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_embedding_metadata(entity_type, uuid, embedding_type, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_embedding_metadata(entity_type, uuid, embedding_type, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_embeddings_stale(
  p_entity_type entity_type,
  p_entity_id uuid,
  p_embedding_type embedding_type DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  UPDATE public.employment_embeddings
  SET status = 'stale',
      updated_at = now()
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND (p_embedding_type IS NULL OR embedding_type = p_embedding_type)
    AND status = 'current';
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_embeddings_stale(entity_type, uuid, embedding_type)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_embeddings_stale(entity_type, uuid, embedding_type)
  TO service_role;

COMMENT ON FUNCTION public.search_similar_candidates(vector, uuid, uuid, text, integer, double precision)
  IS 'Phase 5D authorized semantic retrieval over application and event-interest candidate pools.';
COMMENT ON FUNCTION public.get_embedding_metadata(entity_type, uuid, embedding_type, text)
  IS 'Phase 5D trusted-backend-only embedding metadata lookup.';
COMMENT ON FUNCTION public.mark_embeddings_stale(entity_type, uuid, embedding_type)
  IS 'Phase 5D internal/service embedding invalidation primitive.';

COMMIT;
