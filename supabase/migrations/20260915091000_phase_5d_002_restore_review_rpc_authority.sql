-- Phase 5D - canonical recovery of Phase 5B.2 review RPC authority
-- The malformed 20260914093711 historical artifact remains preserved as evidence.
-- These definitions come from the validated live functions captured before Phase 5D
-- and match artifacts/phase-5b-2/remote-after.json executable bodies.

BEGIN;

CREATE OR REPLACE FUNCTION public.accept_ai_suggestion(p_suggestion_id uuid, p_edited_canonical_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_suggestion RECORD;
  v_reviewer uuid;
  v_reviewer_role text;
  v_final_canonical_id uuid;
  v_target text;
  v_should_write_preference boolean;
  v_wrote_canonical boolean DEFAULT false;
BEGIN
  v_reviewer := auth.uid();

  IF v_reviewer IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  v_reviewer_role := app.current_user_role();

  -- Lock before status check and all consequential work.
  SELECT * INTO v_suggestion
  FROM public.ai_extraction_suggestions
  WHERE id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Suggestion not found');
  END IF;

  -- CONCURRENT SAFETY: Must be pending (first-writer-wins)
  IF v_suggestion.review_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'error', 'Already reviewed',
      'current_status', v_suggestion.review_status,
      'reviewed_by', v_suggestion.reviewed_by
    );
  END IF;

  -- AUTHORIZATION
  IF v_reviewer_role = 'admin' THEN
    NULL;
  ELSIF v_reviewer_role = 'staff' THEN
    NULL;
  ELSIF v_reviewer_role = 'supervisor' THEN
    NULL;
  ELSIF v_reviewer_role = 'applicant' THEN
    IF v_suggestion.entity_type != 'jobseeker_profile' THEN
      RETURN jsonb_build_object('error', 'Jobseekers can only review their own suggestions');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.jobseeker_profiles jp
      JOIN public.participants p ON p.id = jp.participant_id
      WHERE p.auth_user_id = v_reviewer
        AND jp.participant_id = v_suggestion.entity_id
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized to review this suggestion');
    END IF;
  ELSIF v_reviewer_role = 'employer' THEN
    IF v_suggestion.entity_type != 'vacancy' THEN
      RETURN jsonb_build_object('error', 'Employers can only review vacancy suggestions');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = v_suggestion.entity_id AND e.registered_user_id = v_reviewer
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized to review this vacancy suggestion');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Unauthorized role');
  END IF;

  -- Resolve canonical ID
  v_final_canonical_id := COALESCE(p_edited_canonical_id, v_suggestion.canonical_id);
  v_target := v_suggestion.suggestion_type;

  IF v_final_canonical_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No canonical ID resolved');
  END IF;

  IF NOT (
    (v_suggestion.entity_type = 'jobseeker_profile' AND v_target IN ('skill', 'certification', 'occupation', 'industry'))
    OR (v_suggestion.entity_type = 'vacancy' AND v_target IN ('skill', 'certification', 'occupation', 'industry', 'education_requirement', 'experience_requirement', 'language'))
  ) OR v_target IS NULL OR v_suggestion.entity_type IS NULL THEN
    RETURN jsonb_build_object('error', 'Unsupported canonical write target');
  END IF;

  -- Validate canonical exists in the appropriate table
  IF v_target = 'skill' THEN
    IF NOT EXISTS (SELECT 1 FROM public.skills WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical skill ID');
    END IF;
  ELSIF v_target = 'certification' THEN
    IF NOT EXISTS (SELECT 1 FROM public.certifications WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical certification ID');
    END IF;
  ELSIF v_target IN ('occupation', 'experience_requirement') THEN
    IF NOT EXISTS (SELECT 1 FROM public.occupations WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical occupation ID');
    END IF;
  ELSIF v_target = 'industry' THEN
    IF NOT EXISTS (SELECT 1 FROM public.industries WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical industry ID');
    END IF;
  ELSIF v_target = 'education_requirement' THEN
    IF NOT EXISTS (SELECT 1 FROM public.education_levels WHERE id = v_final_canonical_id) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical education level ID');
    END IF;
  ELSIF v_target = 'language' THEN
    IF NOT EXISTS (SELECT 1 FROM public.languages WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical language ID');
    END IF;
  END IF;

  -- CANONICAL WRITES (with intent check for preference tables)
  IF v_suggestion.entity_type = 'jobseeker_profile' THEN

    IF v_target = 'skill' THEN
      INSERT INTO public.jobseeker_skills (jobseeker_profile_id, skill_id, source)
      VALUES (v_suggestion.entity_id, v_final_canonical_id, 'llm_inferred')
      ON CONFLICT (jobseeker_profile_id, skill_id) DO NOTHING;
      v_wrote_canonical := FOUND;

    ELSIF v_target = 'certification' THEN
      IF v_suggestion.provenance = 'explicit' THEN
        INSERT INTO public.jobseeker_certifications (jobseeker_profile_id, certification_id, source, verification_status)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, 'llm_inferred', 'unverified')
        ON CONFLICT DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Certifications require explicit provenance');
      END IF;

    ELSIF v_target = 'occupation' THEN
      v_should_write_preference := (
        v_suggestion.source_intent = 'preference'
        OR (
          v_suggestion.source_intent = 'unknown'
          AND v_suggestion.provenance = 'explicit'
          AND v_suggestion.source_text_fragment IS NOT NULL
          AND NOT (
            v_suggestion.source_text_fragment ~* '\b(worked as|was employed as|previously worked|formerly worked|employment history|past experience|previous role|former role|held the position|served as|employed at|worked at|worked for|worked in|years of experience|background in|experience in|resigned|terminated|left the|departed|retired from)\b'
          )
        )
      );

      IF v_should_write_preference THEN
        INSERT INTO public.jobseeker_occupation_preferences (jobseeker_profile_id, occupation_id, preference_type, source)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, 'exploratory', 'llm_inferred')
        ON CONFLICT (jobseeker_profile_id, occupation_id) DO NOTHING;
        v_wrote_canonical := FOUND;
      END IF;

    ELSIF v_target = 'industry' THEN
      v_should_write_preference := (
        v_suggestion.source_intent = 'preference'
        OR (
          v_suggestion.source_intent = 'unknown'
          AND v_suggestion.provenance = 'explicit'
          AND v_suggestion.source_text_fragment IS NOT NULL
          AND NOT (
            v_suggestion.source_text_fragment ~* '\b(worked as|was employed as|previously worked|formerly worked|employment history|past experience|previous role|former role|held the position|served as|employed at|worked at|worked for|worked in|years of experience|background in|experience in|resigned|terminated|left the|departed|retired from)\b'
          )
        )
      );

      IF v_should_write_preference THEN
        INSERT INTO public.jobseeker_industry_preferences (jobseeker_profile_id, industry_id, source)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, 'llm_inferred')
        ON CONFLICT (jobseeker_profile_id, industry_id) DO NOTHING;
        v_wrote_canonical := FOUND;
      END IF;
    END IF;

  ELSIF v_suggestion.entity_type = 'vacancy' THEN
    IF v_target = 'occupation' THEN
      UPDATE public.vacancy_definitions
      SET occupation_id = v_final_canonical_id
      WHERE id = v_suggestion.entity_id
        AND occupation_id IS DISTINCT FROM v_final_canonical_id;
      v_wrote_canonical := FOUND;
    ELSIF v_target = 'industry' THEN
      UPDATE public.vacancy_definitions
      SET industry_id = v_final_canonical_id
      WHERE id = v_suggestion.entity_id
        AND industry_id IS DISTINCT FROM v_final_canonical_id;
      v_wrote_canonical := FOUND;
    ELSIF v_target = 'skill' THEN
      INSERT INTO public.vacancy_skills (vacancy_definition_id, skill_id, importance)
      VALUES (v_suggestion.entity_id, v_final_canonical_id, COALESCE(v_suggestion.importance, 'required'))
      ON CONFLICT (vacancy_definition_id, skill_id) DO NOTHING;
      v_wrote_canonical := FOUND;
    ELSIF v_target = 'education_requirement' THEN
      IF v_suggestion.importance IN ('required', 'preferred') THEN
        INSERT INTO public.vacancy_education_requirements (vacancy_definition_id, education_level_id, importance)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, v_suggestion.importance)
        ON CONFLICT DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Education importance must be required or preferred');
      END IF;
    ELSIF v_target = 'experience_requirement' THEN
      IF v_suggestion.importance IN ('required', 'preferred') THEN
        INSERT INTO public.vacancy_experience_requirements (vacancy_definition_id, occupation_id, minimum_months, importance)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, v_suggestion.minimum_months, v_suggestion.importance)
        ON CONFLICT DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Experience importance must be required or preferred');
      END IF;
    ELSIF v_target = 'certification' THEN
      IF v_suggestion.importance IN ('required', 'preferred') THEN
        INSERT INTO public.vacancy_certification_requirements (vacancy_definition_id, certification_id, importance)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, v_suggestion.importance)
        ON CONFLICT DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Certification importance must be required or preferred');
      END IF;
    ELSIF v_target = 'language' THEN
      IF v_suggestion.importance IN ('required', 'preferred') THEN
        INSERT INTO public.vacancy_language_requirements (vacancy_definition_id, language_id, importance)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, v_suggestion.importance)
        ON CONFLICT (vacancy_definition_id, language_id) DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Language importance must be required or preferred');
      END IF;
    END IF;
  END IF;

  -- Lock remains held through canonical write, review status, and invalidation.
  UPDATE public.ai_extraction_suggestions
  SET review_status = 'accepted',
      reviewed_by = v_reviewer,
      reviewed_at = now(),
      edited_canonical_id = v_final_canonical_id
  WHERE id = p_suggestion_id
    AND review_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review status changed while suggestion lock held' USING ERRCODE = '40001';
  END IF;

  -- Invalidate affected embeddings ONLY if canonical data actually changed
  -- Historical accepts (no canonical write) do NOT stale embeddings
  IF v_wrote_canonical THEN
    IF v_suggestion.entity_type = 'jobseeker_profile' THEN
      PERFORM public.mark_embeddings_stale('jobseeker_profile', v_suggestion.entity_id, NULL);
    ELSIF v_suggestion.entity_type = 'vacancy' THEN
      PERFORM public.mark_embeddings_stale('vacancy', v_suggestion.entity_id, NULL);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'suggestion_id', p_suggestion_id,
    'canonical_id', v_final_canonical_id,
    'review_status', 'accepted',
    'preference_written', v_should_write_preference,
    'wrote_canonical', v_wrote_canonical,
    'embedding_staled', v_wrote_canonical
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_ai_suggestion(p_suggestion_id uuid, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_suggestion RECORD;
  v_reviewer uuid;
  v_reviewer_role text;
BEGIN
  v_reviewer := auth.uid();

  IF v_reviewer IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  v_reviewer_role := app.current_user_role();

  SELECT * INTO v_suggestion
  FROM public.ai_extraction_suggestions
  WHERE id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Suggestion not found');
  END IF;

  -- CONCURRENT SAFETY
  IF v_suggestion.review_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'error', 'Already reviewed',
      'current_status', v_suggestion.review_status,
      'reviewed_by', v_suggestion.reviewed_by
    );
  END IF;

  -- AUTHORIZATION (same as accept)
  IF v_reviewer_role = 'admin' THEN
    NULL;
  ELSIF v_reviewer_role = 'staff' THEN
    NULL;
  ELSIF v_reviewer_role = 'supervisor' THEN
    NULL;
  ELSIF v_reviewer_role = 'applicant' THEN
    IF v_suggestion.entity_type != 'jobseeker_profile' THEN
      RETURN jsonb_build_object('error', 'Jobseekers can only review their own suggestions');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.jobseeker_profiles jp
      JOIN public.participants p ON p.id = jp.participant_id
      WHERE p.auth_user_id = v_reviewer
        AND jp.participant_id = v_suggestion.entity_id
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
  ELSIF v_reviewer_role = 'employer' THEN
    IF v_suggestion.entity_type != 'vacancy' THEN
      RETURN jsonb_build_object('error', 'Employers can only review vacancy suggestions');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = v_suggestion.entity_id AND e.registered_user_id = v_reviewer
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Unauthorized role');
  END IF;

  -- CONCURRENT SAFETY: atomic update with pending check
  UPDATE public.ai_extraction_suggestions
  SET review_status = 'rejected',
      reviewed_by = v_reviewer,
      reviewed_at = now(),
      review_note = p_review_note
  WHERE id = p_suggestion_id
    AND review_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review status changed while suggestion lock held' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'suggestion_id', p_suggestion_id,
    'review_status', 'rejected'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.edit_ai_suggestion(p_suggestion_id uuid, p_edited_term text, p_edited_canonical_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_suggestion RECORD;
  v_reviewer uuid;
  v_reviewer_role text;
  v_result jsonb;
BEGIN
  v_reviewer := auth.uid();

  IF v_reviewer IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  v_reviewer_role := app.current_user_role();

  SELECT * INTO v_suggestion
  FROM public.ai_extraction_suggestions
  WHERE id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Suggestion not found');
  END IF;

  -- CONCURRENT SAFETY
  IF v_suggestion.review_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'error', 'Already reviewed',
      'current_status', v_suggestion.review_status,
      'reviewed_by', v_suggestion.reviewed_by
    );
  END IF;

  -- AUTHORIZATION (same as accept)
  IF v_reviewer_role = 'admin' THEN
    NULL;
  ELSIF v_reviewer_role = 'staff' THEN
    NULL;
  ELSIF v_reviewer_role = 'supervisor' THEN
    NULL;
  ELSIF v_reviewer_role = 'applicant' THEN
    IF v_suggestion.entity_type != 'jobseeker_profile' THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.jobseeker_profiles jp
      JOIN public.participants p ON p.id = jp.participant_id
      WHERE p.auth_user_id = v_reviewer
        AND jp.participant_id = v_suggestion.entity_id
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
  ELSIF v_reviewer_role = 'employer' THEN
    IF v_suggestion.entity_type != 'vacancy' THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = v_suggestion.entity_id AND e.registered_user_id = v_reviewer
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Unauthorized role');
  END IF;

  IF p_edited_canonical_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No edited canonical ID supplied');
  END IF;

  -- Same transaction: accept re-enters our row lock and validates before writing.
  v_result := public.accept_ai_suggestion(p_suggestion_id, p_edited_canonical_id);
  IF v_result->>'success' IS DISTINCT FROM 'true' THEN
    RETURN v_result; -- accept returned before any mutation; no edit metadata written.
  END IF;

  UPDATE public.ai_extraction_suggestions
  SET edited_term = p_edited_term,
      edited_canonical_id = p_edited_canonical_id
  WHERE id = p_suggestion_id AND review_status = 'accepted'
    AND reviewed_by = v_reviewer;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted suggestion missing during edit' USING ERRCODE = '40001';
  END IF;
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.accept_ai_suggestion(uuid, uuid)
  IS 'Phase 5B.2 transaction-safe review RPC restored as valid Phase 5D authority.';
COMMENT ON FUNCTION public.reject_ai_suggestion(uuid, text)
  IS 'Phase 5B.2 transaction-safe review RPC restored as valid Phase 5D authority.';
COMMENT ON FUNCTION public.edit_ai_suggestion(uuid, text, uuid)
  IS 'Phase 5B.2 transaction-safe review RPC restored as valid Phase 5D authority.';

COMMIT;

