--
-- PostgreSQL database dump
--



-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP SEQUENCE IF EXISTS public.employer_code_seq;

--
-- Supabase Extensions
--

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public; -- Omitted for Supabase compatibility


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: checkin_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.checkin_status AS ENUM (
    'pending',
    'checked_in'
);


--
-- Name: embedding_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.embedding_status AS ENUM (
    'current',
    'stale',
    'pending',
    'failed'
);


--
-- Name: embedding_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.embedding_type AS ENUM (
    'jobseeker_match_profile',
    'vacancy_match_profile',
    'occupation',
    'skill'
);


--
-- Name: entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.entity_type AS ENUM (
    'jobseeker_profile',
    'vacancy',
    'occupation',
    'skill'
);


--
-- Name: event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_status AS ENUM (
    'upcoming',
    'ongoing',
    'completed',
    'cancelled'
);


--
-- Name: event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_type AS ENUM (
    'job_fair',
    'recruitment_activity',
    'online'
);


--
-- Name: interview_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.interview_status AS ENUM (
    'not_qualified',
    'qualified',
    'near_hire',
    'hots'
);


--
-- Name: recruitment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recruitment_type AS ENUM (
    'local',
    'special'
);


--
-- Name: referral_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.referral_status AS ENUM (
    'pending',
    'completed',
    'cancelled'
);


--
-- Name: tc_user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tc_user_role AS ENUM (
    'applicant',
    'staff',
    'supervisor',
    'medical',
    'admin',
    'employer'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'applicant',
    'staff',
    'supervisor',
    'medical',
    'admin',
    'employer'
);


--
-- Name: auto_link_employer(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auto_link_employer() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  emp_id uuid;
begin
  if new.employer_id is null and new.company_name is not null then
    select id into emp_id from public.employers
    where company_name = new.company_name limit 1;

    if emp_id is null then
      insert into public.employers (company_name, employer_type, registration_status)
      values (new.company_name, 'local_direct', 'approved')
      returning id into emp_id;
    end if;

    new.employer_id := emp_id;
  end if;
  return new;
end;
$$;


--
-- Name: create_profile_for_new_user(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.create_profile_for_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'applicant');
begin
  -- Only the self-service 'employer' role may be set from signup metadata.
  -- Anything else (including admin/staff/medical/supervisor) falls back to
  -- 'applicant'; privileged roles are assigned server-side by admin_create_user.
  if v_role not in ('applicant', 'employer') then
    v_role := 'applicant';
  end if;

  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    v_role::public.tc_user_role,
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


--
-- Name: current_user_role(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_user_role() RETURNS public.user_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role::text::public.user_role
  from public.profiles
  where id = (select auth.uid())
    and is_active = true
$$;


--
-- Name: is_event_staff(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_event_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select app.current_user_role() in ('staff', 'supervisor', 'medical', 'admin')
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: mark_embeddings_stale(public.entity_type, uuid, public.embedding_type); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_embeddings_stale(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type DEFAULT NULL::public.embedding_type) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.employment_embeddings
  set status = 'stale',
      updated_at = now()
  where
    entity_type = p_entity_type
    and entity_id = p_entity_id
    and (p_embedding_type is null or embedding_type = p_embedding_type)
    and status = 'current';
end;
$$;


--
-- Name: accept_ai_suggestion(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_ai_suggestion(p_suggestion_id uuid, p_edited_canonical_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;


--
-- Name: admin_approve_employer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_approve_employer(p_employer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_code text;
begin
  if app.current_user_role() <> 'admin' then
    raise exception 'Only admins may approve employers';
  end if;

  if exists (
    select 1
    from employer_accreditation_requirements r
    join employer_accreditation a on a.id = r.accreditation_id
    join employers e on e.id = a.employer_id
    where e.id = p_employer_id
      and r.status is distinct from 'approved'
      and (
        r.requirement_key in (
          'letter_of_intent','company_profile','business_permit','bir_2303',
          'philhealth_registration','pagibig_registration','sss_registration',
          'philjobnet_certificate')
        or (r.requirement_key = 'sec_registration'
            and e.business_structure in ('corporation','partnership'))
        or (r.requirement_key = 'dti_registration'
            and e.business_structure = 'single_proprietorship')
        or (r.requirement_key = 'cda_registration'
            and e.business_structure = 'cooperative')
        or (r.requirement_key = 'dole_rule_1020' and e.employer_type = 'local_direct')
        or (r.requirement_key = 'dole_do174'    and e.employer_type = 'local_agency')
        or (r.requirement_key = 'bosh_certificate'
            and e.osh_classification = 'low_risk')
        or (r.requirement_key = 'cosh_certificate'
            and e.osh_classification = 'construction_heavy_industrial')
      )
  ) then
    raise exception 'Cannot approve: not all applicable accreditation requirements are approved yet';
  end if;

  update employers
     set registration_status = 'approved',
         rejection_reason = null,
         updated_at = now()
   where id = p_employer_id;
  if not found then
    raise exception 'Employer % not found', p_employer_id;
  end if;

  -- Issue permanent Employer ID on first accreditation.
  if not exists (
    select 1 from employers
    where id = p_employer_id and employer_code is not null
  ) then
    loop
      v_code := 'EMP-' || lpad(nextval('employer_code_seq')::text, 6, '0');
      exit when not exists (select 1 from employers where employer_code = v_code);
    end loop;
    update employers set employer_code = v_code where id = p_employer_id;
  end if;

  update employer_accreditation
     set status = 'approved', approved_at = now(), updated_at = now()
   where employer_id = p_employer_id;

  select registered_user_id into v_user_id from employers where id = p_employer_id;
  if v_user_id is not null then
    update profiles set role = 'employer', is_active = true where id = v_user_id;
    if not found then
      raise exception 'Linked profile % missing for employer %', v_user_id, p_employer_id;
    end if;
  end if;
end;
$$;


--
-- Name: admin_create_user(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_user(p_email text, p_password text, p_full_name text DEFAULT NULL::text, p_role text DEFAULT 'staff'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
  v_role public.tc_user_role;
  v_caller_role text;
  v_password_hash text;
begin
  -- Only admins can create staff accounts.
  -- Read the caller's role directly as TEXT to avoid conflicts between the
  -- legacy "user_role" type and the current "tc_user_role" enum type.
  select coalesce(role::text, 'applicant') into v_caller_role
  from public.profiles
  where id = auth.uid() and is_active = true;

  if v_caller_role <> 'admin' then
    raise exception 'Only administrators can create users';
  end if;

  -- Validate role (applicant accounts are self-service via OAuth)
  if p_role not in ('staff', 'supervisor', 'medical', 'admin') then
    raise exception 'Invalid role "%". Allowed: staff, supervisor, medical, admin', p_role;
  end if;

  if p_email is null or p_password is null or length(p_password) < 6 then
    raise exception 'Email and a password of at least 6 characters are required';
  end if;

  v_role := p_role::public.tc_user_role;
  v_password_hash := public.hash_password(p_password);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    v_password_hash,
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', p_full_name),
    now(),
    now()
  )
  returning id into v_id;

  -- The on_auth_user_created trigger creates the profile (default role applicant).
  -- Promote it to the requested staff role.
  update public.profiles
  set role = v_role,
      is_active = true,
      full_name = coalesce(p_full_name, full_name)
  where id = v_id;

  return v_id;
end;
$$;


--
-- Name: admin_create_user(text, text, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_user(p_email text, p_password text, p_full_name text DEFAULT NULL::text, p_role text DEFAULT 'staff'::text, p_jurisdiction text DEFAULT NULL::text, p_is_provincial boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
  v_role public.tc_user_role;
  v_caller_role text;
  v_password_hash text;
begin
  -- Only admins can create staff accounts.
  select coalesce(role::text, 'applicant') into v_caller_role
  from public.profiles
  where id = auth.uid() and is_active = true;

  if v_caller_role <> 'admin' then
    raise exception 'Only administrators can create users';
  end if;

  -- Validate role: explicit allowlist prevents enum injection.
  -- Employers self-register via /register-employer (not admin-created).
  if p_role not in ('staff', 'supervisor', 'medical', 'admin') then
    raise exception 'Invalid role "%". Allowed: staff, supervisor, medical, admin', p_role;
  end if;

  if p_email is null or p_password is null or length(p_password) < 6 then
    raise exception 'Email and a password of at least 6 characters are required';
  end if;

  -- Jurisdiction/is_provincial only apply to supervisors
  if p_role <> 'supervisor' then
    p_jurisdiction := null;
    p_is_provincial := false;
  end if;

  v_role := p_role::public.tc_user_role;
  v_password_hash := public.hash_password(p_password);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    v_password_hash,
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', p_full_name),
    now(),
    now()
  )
  returning id into v_id;

  -- The on_auth_user_created trigger creates the profile (default role applicant).
  -- Promote it to the requested staff role + jurisdiction fields.
  update public.profiles
  set role = v_role,
      is_active = true,
      full_name = coalesce(p_full_name, full_name),
      jurisdiction = p_jurisdiction,
      is_provincial = p_is_provincial
  where id = v_id;

  return v_id;
end;
$$;


--
-- Name: admin_link_employer_account(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_link_employer_account(p_employer_id uuid, p_email text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_profile_id uuid;
  v_current_link uuid;
begin
  if app.current_user_role() <> 'admin' then
    raise exception 'Only admins may link employer accounts';
  end if;

  select id into v_profile_id
  from profiles
  where lower(email) = lower(trim(p_email))
  limit 1;
  if v_profile_id is null then
    raise exception 'No account found with that email';
  end if;

  select registered_user_id into v_current_link
  from employers where id = p_employer_id;
  if v_current_link is not null then
    raise exception 'This employer is already linked to an account';
  end if;

  if exists (select 1 from employers where registered_user_id = v_profile_id) then
    raise exception 'That account is already linked to another employer';
  end if;

  update employers
     set registered_user_id = v_profile_id,
         registration_status = case when registration_status = 'approved' then 'approved' else registration_status end,
         updated_at = now()
   where id = p_employer_id;

  return 'Linked';
end;
$$;


--
-- Name: admin_reject_employer(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reject_employer(p_employer_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
begin
  if app.current_user_role() <> 'admin' then
    raise exception 'Only admins may reject employers';
  end if;

  update employers
     set registration_status = 'rejected',
         rejection_reason = nullif(trim(p_reason), ''),
         updated_at = now()
   where id = p_employer_id;
  if not found then
    raise exception 'Employer % not found', p_employer_id;
  end if;

  -- Rejected employers lose portal access (same model as deactivated staff).
  select registered_user_id into v_user_id from employers where id = p_employer_id;
  if v_user_id is not null then
    update profiles set is_active = false where id = v_user_id;
  end if;
end;
$$;


--
-- Name: admin_reset_password(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_password(p_user_id uuid, p_password text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_caller_role text;
  v_password_hash text;
begin
  select coalesce(role::text, 'applicant') into v_caller_role
  from public.profiles
  where id = auth.uid() and is_active = true;

  if v_caller_role <> 'admin' then
    raise exception 'Only administrators can reset passwords';
  end if;

  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  v_password_hash := public.hash_password(p_password);

  update auth.users
  set encrypted_password = v_password_hash,
      updated_at = now()
  where id = p_user_id;
end;
$$;


--
-- Name: check_in_employer(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_in_employer(p_employer_code text, p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_employer_id uuid;
  v_company text;
  v_reg_status text;
  v_part_status text;
  v_event_status text;
begin
  if not (app.is_event_staff() or app.current_user_role() = 'admin') then
    raise exception 'Not authorized to check in employers';
  end if;

  select id, company_name, registration_status
    into v_employer_id, v_company, v_reg_status
  from employers where employer_code = upper(trim(p_employer_code));
  if v_employer_id is null then
    raise exception 'Employer ID not recognized';
  end if;
  if v_reg_status <> 'approved' then
    raise exception 'Employer is not accredited';
  end if;

  select status into v_event_status from events where id = p_event_id;
  if v_event_status is null then
    raise exception 'Activity not found';
  end if;
  if v_event_status not in ('upcoming','ongoing') then
    raise exception 'Check-in is closed for this activity';
  end if;

  select status into v_part_status
  from employer_event_participations
  where event_id = p_event_id and employer_id = v_employer_id;
  if v_part_status is null then
    raise exception 'Employer is not registered for this activity';
  end if;
  if v_part_status = 'cancelled' then
    raise exception 'Participation was cancelled';
  end if;
  if v_part_status = 'checked_in' then
    return jsonb_build_object('company', v_company, 'already_checked_in', true);
  end if;

  update employer_event_participations
     set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid()
   where event_id = p_event_id and employer_id = v_employer_id;

  return jsonb_build_object('company', v_company, 'already_checked_in', false);
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: event_participations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_participations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    event_id uuid,
    registration_type text DEFAULT 'preregistered'::text NOT NULL,
    registered_by uuid,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    check_in_status public.checkin_status DEFAULT 'pending'::public.checkin_status NOT NULL,
    check_in_time timestamp with time zone,
    check_in_by uuid,
    ticket_code text DEFAULT ('TC-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 10))) NOT NULL,
    qr_token uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_participations_registration_type_check CHECK ((registration_type = ANY (ARRAY['preregistered'::text, 'walkin'::text])))
);


--
-- Name: check_in_registrant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_in_registrant(registrant_uuid uuid) RETURNS public.event_participations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  updated_row public.event_participations;
begin
  if app.current_user_role() not in ('staff', 'admin') then raise exception 'Not authorized'; end if;
  update public.event_participations
     set check_in_status = 'checked_in', check_in_time = now(), check_in_by = auth.uid()
   where id = registrant_uuid and check_in_status = 'pending'
  returning * into updated_row;
  if updated_row.id is null then raise exception 'Registrant was not found or has already checked in'; end if;
  return updated_row;
end;
$$;


--
-- Name: create_pending_accreditation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_pending_accreditation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.registration_status = 'pending' then
    insert into employer_accreditation (employer_id) values (new.id)
    on conflict (employer_id) do nothing;
  end if;
  return null;
end;
$$;


--
-- Name: create_walkin_registrant(uuid, text, text, text, date, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text, text, boolean, boolean, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text, boolean, text, text[], boolean, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_walkin_registrant(p_event_id uuid, p_first_name text, p_middle_name text, p_last_name text, p_birthdate date, p_sex text, p_civil_status text, p_province text, p_municipality_city text, p_barangay text, p_contact_no text, p_email text, p_highest_educational_attainment text, p_course_program text, p_employment_preference text, p_interview_location text, p_first_time_jobseeker boolean, p_first_time_school text, p_first_time_graduation_year text, p_first_time_ojt_experience text, p_returning_ofw boolean, p_returning_worker boolean, p_ofw_country_last_worked text, p_ofw_previous_employer text, p_ofw_previous_occupation text, p_ofw_years_abroad text, p_ofw_date_returned text, p_ofw_reason_for_return text, p_rw_previous_work_location text, p_rw_previous_employer text, p_rw_previous_occupation text, p_rw_years_worked text, p_rw_date_returned text, p_rw_reason_for_return text, p_interested_in_skills_training boolean, p_preferred_training_program text, p_has_disability boolean, p_disability_type text, p_peso_assistance_programs text[], p_data_subject_rights_agreed boolean, p_vacancy_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_participant public.participants;
  v_participation public.event_participations;
begin
  -- Preserve existing staff/medical/admin authorization.
  if app.current_user_role() not in ('staff', 'medical', 'admin') then raise exception 'Not authorized'; end if;

  -- Create the participant (walk-in identity: no auth user, distinct public pass).
  insert into public.participants (auth_user_id, public_pass_id)
  values (null, 'QST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7)))
  returning * into v_participant;

  -- Reusable Job Seeker Profile with the classification details.
  -- Numeric-safe casts: invalid values become NULL, never crash the RPC.
  insert into public.jobseeker_profiles (
    participant_id, first_name, middle_name, last_name,
    birthdate, sex, civil_status, province, municipality_city, barangay,
    contact_no, email, highest_educational_attainment, course_program,
    employment_preference, interview_location,
    first_time_jobseeker, first_time_school, first_time_graduation_year, first_time_ojt_experience,
    returning_ofw, returning_worker,
    ofw_country_last_worked, ofw_previous_employer, ofw_previous_occupation,
    ofw_years_abroad, ofw_date_returned, ofw_reason_for_return,
    rw_previous_work_location, rw_previous_employer, rw_previous_occupation,
    rw_years_worked, rw_date_returned, rw_reason_for_return,
    interested_in_skills_training, preferred_training_program,
    has_disability, disability_type, peso_assistance_programs,
    data_subject_rights_agreed
  ) values (
    v_participant.id, p_first_name, p_middle_name, p_last_name,
    p_birthdate, p_sex, p_civil_status, p_province, p_municipality_city, p_barangay,
    p_contact_no, p_email, p_highest_educational_attainment, p_course_program,
    p_employment_preference, p_interview_location,
    p_first_time_jobseeker, p_first_time_school,
    case when p_first_time_graduation_year ~ '^[0-9]{4}$' then p_first_time_graduation_year::smallint else null end,
    p_first_time_ojt_experience,
    p_returning_ofw, p_returning_worker,
    p_ofw_country_last_worked, p_ofw_previous_employer, p_ofw_previous_occupation,
    case when p_ofw_years_abroad ~ '^[0-9]+(\.[0-9]+)?$' then p_ofw_years_abroad::numeric else null end,
    p_ofw_date_returned, p_ofw_reason_for_return,
    p_rw_previous_work_location, p_rw_previous_employer, p_rw_previous_occupation,
    case when p_rw_years_worked ~ '^[0-9]+(\.[0-9]+)?$' then p_rw_years_worked::numeric else null end,
    p_rw_date_returned, p_rw_reason_for_return,
    p_interested_in_skills_training, p_preferred_training_program,
    p_has_disability, p_disability_type, p_peso_assistance_programs,
    true
  );

  -- Event participation (walk-in is checked in immediately).
  insert into public.event_participations (
    participant_id, event_id, registration_type,
    check_in_status, check_in_time, check_in_by
  ) values (
    v_participant.id, p_event_id, 'walkin',
    'checked_in', now(), auth.uid()
  ) returning * into v_participation;

  -- Optional vacancy selection, with overseas/local preference.
  if p_vacancy_ids is not null and array_length(p_vacancy_ids, 1) > 0 then
    insert into public.participation_vacancies (participation_id, event_vacancy_id, preference_type)
    select v_participation.id, unnest(p_vacancy_ids),
           case when p_employment_preference = 'Overseas' then 'overseas' else 'local' end;
  end if;

  -- Return the Participant Pass info WalkinPage needs.
  return jsonb_build_object(
    'id', v_participation.id,
    'unique_id', v_participation.ticket_code,
    'qr_token', v_participation.qr_token,
    'event_id', v_participation.event_id,
    'check_in_time', v_participation.check_in_time,
    'first_name', p_first_name,
    'middle_name', p_middle_name,
    'last_name', p_last_name,
    'public_pass_id', v_participant.public_pass_id
  );
end;
$_$;


--
-- Name: edit_ai_suggestion(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.edit_ai_suggestion(p_suggestion_id uuid, p_edited_term text, p_edited_canonical_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;


--
-- Name: employer_signup_allowed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.employer_signup_allowed() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_recent integer;
begin
  select count(*) into v_recent
  from public.employers
  where registration_status = 'pending'
    and created_at > now() - interval '1 hour';

  return v_recent < 30;
end;
$$;


--
-- Name: enforce_jobseeker_profile_daily_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_jobseeker_profile_daily_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_save_date date := current_date;
begin
  -- Permit trusted database-side maintenance that has no auth context.
  if v_user_id is null then
    return new;
  end if;

  insert into public.jobseeker_profile_save_limits (auth_user_id, save_date, save_count)
  values (v_user_id, v_save_date, 1)
  on conflict (auth_user_id, save_date) do update
    set save_count = public.jobseeker_profile_save_limits.save_count + 1
    where public.jobseeker_profile_save_limits.save_count < 2;

  if not found then
    raise exception 'You can save your profile only twice per day. Please try again tomorrow.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


--
-- Name: get_embedding_metadata(public.entity_type, uuid, public.embedding_type, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_embedding_metadata(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type DEFAULT NULL::public.embedding_type, p_embedding_version text DEFAULT NULL::text) RETURNS TABLE(id uuid, source_hash text, provider text, model text, dimensions integer, embedding_version text, status public.embedding_status, error_message text, created_at timestamp with time zone, updated_at timestamp with time zone, generated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_employer_applicants(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_employer_applicants(p_event_vacancy_id uuid) RETURNS TABLE(id uuid, unique_id text, first_name text, middle_name text, last_name text, email text, contact_no text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    ep.id,
    ep.ticket_code::text as unique_id,
    jp.first_name,
    jp.middle_name,
    jp.last_name,
    jp.email,
    jp.contact_no
  from public.participation_vacancies pv
  join public.event_vacancies ev on ev.id = pv.event_vacancy_id
  join public.vacancy_definitions vd on vd.id = ev.vacancy_definition_id
  join public.employers emp on emp.id = vd.employer_id
  join public.event_participations ep on ep.id = pv.participation_id
  join public.participants p on p.id = ep.participant_id
  left join public.jobseeker_profiles jp on jp.participant_id = p.id
  where emp.registered_user_id = (select auth.uid())
    and ev.id = p_event_vacancy_id
$$;


--
-- Name: get_event_participating_employers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_event_participating_employers(p_event_id uuid) RETURNS TABLE(employer_code text, company_name text, industry text, vacancy_count bigint, on_site boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select e.employer_code,
         e.company_name,
         e.industry,
         (select count(*)
            from vacancy_definitions vd
            join event_vacancies ev on ev.vacancy_definition_id = vd.id
           where vd.employer_id = e.id and ev.event_id = get_event_participating_employers.p_event_id) as vacancy_count,
         (p.status = 'checked_in') as on_site
  from employer_event_participations p
  join employers e on e.id = p.employer_id
  where p.event_id = get_event_participating_employers.p_event_id
    and p.status in ('registered','checked_in')
  order by (p.status = 'checked_in') desc, e.company_name;
$$;


--
-- Name: participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    public_pass_id text DEFAULT ('QST-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 7))) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: get_or_create_participant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_participant() RETURNS public.participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_p public.participants;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_p from public.participants where auth_user_id = auth.uid();
  if not found then
    insert into public.participants (auth_user_id) values (auth.uid()) returning * into v_p;
  end if;
  return v_p;
end;
$$;


--
-- Name: hash_password(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hash_password(p_password text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_crypto_schema text;
  v_hash text;
begin
  select n.nspname into v_crypto_schema
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'gen_salt'
  limit 1;

  if v_crypto_schema is null then
    raise exception 'pgcrypto extension is not installed. Run: create extension if not exists pgcrypto;';
  end if;

  execute format('select %I.crypt($1, %I.gen_salt(''bf''))', v_crypto_schema, v_crypto_schema)
  into v_hash
  using p_password;

  return v_hash;
end;
$_$;


--
-- Name: list_pending_suggestions(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_pending_suggestions(p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_resolution_status text DEFAULT NULL::text) RETURNS TABLE(id uuid, run_id uuid, entity_type text, entity_id uuid, suggestion_type text, raw_term text, confidence numeric, provenance text, source_text_fragment text, source_intent text, resolution_status text, canonical_id uuid, canonical_name text, candidate_matches jsonb, resolution_method text, review_status text, importance text, minimum_months integer, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_caller_role text;
  v_caller_id uuid;
BEGIN
  v_caller_role := app.current_user_role();
  v_caller_id := auth.uid();

  RETURN QUERY
  SELECT
    s.id, s.run_id, s.entity_type, s.entity_id, s.suggestion_type,
    s.raw_term, s.confidence, s.provenance, s.source_text_fragment,
    s.source_intent, s.resolution_status, s.canonical_id, s.canonical_name,
    s.candidate_matches, s.resolution_method, s.review_status,
    s.importance, s.minimum_months, s.created_at
  FROM public.ai_extraction_suggestions s
  WHERE s.review_status = 'pending'
    AND (p_entity_type IS NULL OR s.entity_type = p_entity_type)
    AND (p_entity_id IS NULL OR s.entity_id = p_entity_id)
    AND (p_resolution_status IS NULL OR s.resolution_status = p_resolution_status)
    -- AUTHORIZATION filter (server-side only, never rely on frontend)
    AND (
      -- Admin: global access
      v_caller_role = 'admin'
      -- Staff: global employment data access (consistent with is_event_staff())
      OR v_caller_role = 'staff'
      -- Supervisor: global access (event-scoping deferred to application layer)
      OR v_caller_role = 'supervisor'
      -- Applicant: own jobseeker_profile suggestions ONLY (via participants.auth_user_id chain)
      OR (v_caller_role = 'applicant' AND s.entity_type = 'jobseeker_profile'
          AND EXISTS (
            SELECT 1 FROM public.jobseeker_profiles jp
            JOIN public.participants p ON p.id = jp.participant_id
            WHERE p.auth_user_id = v_caller_id
              AND jp.participant_id = s.entity_id
          ))
      -- Employer: own vacancy suggestions ONLY (via employers.registered_user_id)
      OR (v_caller_role = 'employer' AND s.entity_type = 'vacancy'
          AND EXISTS (SELECT 1 FROM public.vacancy_definitions vd
                      JOIN public.employers e ON e.id = vd.employer_id
                      WHERE vd.id = s.entity_id AND e.registered_user_id = v_caller_id))
    )
  ORDER BY s.created_at DESC;
END;
$$;


--
-- Name: FUNCTION list_pending_suggestions(p_entity_type text, p_entity_id uuid, p_resolution_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_pending_suggestions(p_entity_type text, p_entity_id uuid, p_resolution_status text) IS 'List pending AI suggestions with server-side authorization filtering. Returns source_intent for intent-aware display.';


--
-- Name: participate_in_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.participate_in_event(p_event_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_employer_id uuid;
  v_status text;
  v_event_status text;
begin
  select id, registration_status into v_employer_id, v_status
  from employers where registered_user_id = auth.uid();
  if v_employer_id is null then
    raise exception 'Employer profile not found';
  end if;
  if v_status <> 'approved' then
    raise exception 'Employer accreditation approval is required to participate in this activity';
  end if;

  select status into v_event_status from events where id = p_event_id;
  if v_event_status is null then
    raise exception 'Activity not found';
  end if;
  if v_event_status not in ('upcoming','ongoing') then
    raise exception 'This activity is not open for participation';
  end if;

  insert into employer_event_participations (event_id, employer_id)
  values (p_event_id, v_employer_id)
  on conflict (event_id, employer_id) do nothing;
end;
$$;


--
-- Name: interview_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interview_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registrant_id uuid NOT NULL,
    event_id uuid,
    interviewer_id uuid NOT NULL,
    "position" text NOT NULL,
    company text NOT NULL,
    interview_status public.interview_status NOT NULL,
    interview_notes text,
    interview_date timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    application_id uuid,
    employer_id uuid,
    vacancy_definition_id uuid
);


--
-- Name: COLUMN interview_logs.application_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.interview_logs.application_id IS 'Optional link to the application this interview is for. Can be null for walk-in or manual interviews.';


--
-- Name: COLUMN interview_logs.employer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.interview_logs.employer_id IS 'Link to employers table for reporting and tracking.';


--
-- Name: COLUMN interview_logs.vacancy_definition_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.interview_logs.vacancy_definition_id IS 'Position/vacancy the interview was for. Populated by record_interview_result(). Nullable for legacy free-text entries.';


--
-- Name: record_interview_result(uuid, uuid, uuid, uuid, public.interview_status, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_interview_result(p_registrant_id uuid, p_event_id uuid, p_employer_id uuid, p_vacancy_definition_id uuid, p_status public.interview_status, p_application_id uuid DEFAULT NULL::uuid, p_interview_notes text DEFAULT NULL::text) RETURNS public.interview_logs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_ep public.event_participations;
  v_vd public.vacancy_definitions;
  v_inserted public.interview_logs;
begin
  if app.current_user_role() not in ('staff', 'admin') then raise exception 'Not authorized'; end if;

  -- Participation must exist and belong to the given event.
  select * into v_ep from public.event_participations where id = p_registrant_id;
  if v_ep.id is null then raise exception 'Participation not found'; end if;
  if v_ep.event_id is distinct from p_event_id then raise exception 'Event does not match'; end if;

  -- Checked-in requirement: interviews are only recorded for checked-in participants.
  if v_ep.check_in_status is distinct from 'checked_in' then
    raise exception 'Participant must be checked in before recording an interview';
  end if;

  -- Optional application link: must belong to the same participation and event.
  if p_application_id is not null then
    if not exists (
      select 1
      from public.applications a
      join public.event_vacancies ev on ev.id = a.event_vacancy_id
      where a.id = p_application_id
        and a.registrant_id = v_ep.id
        and ev.event_id = p_event_id
    ) then
      raise exception 'Application does not belong to this participation and event';
    end if;
  end if;

  -- Vacancy definition must exist, be active, and belong to the employer.
  select * into v_vd from public.vacancy_definitions
    where id = p_vacancy_definition_id and is_active = true;
  if v_vd.id is null then raise exception 'Position not found'; end if;

  if v_vd.employer_id is distinct from p_employer_id then
    raise exception 'Position does not belong to the company';
  end if;

  -- The position must be offered at the event.
  if not exists (
    select 1 from public.event_vacancies ev
    where ev.event_id = p_event_id and ev.vacancy_definition_id = p_vacancy_definition_id
  ) then raise exception 'Position is not offered at this event'; end if;

  begin
    insert into public.interview_logs (
      registrant_id, event_id, interviewer_id,
      position, company,
      interview_status, interview_date,
      employer_id, vacancy_definition_id,
      application_id, interview_notes
    ) values (
      v_ep.id, p_event_id, auth.uid(),
      v_vd.position, v_vd.company_name,
      p_status, now(),
      v_vd.employer_id, v_vd.id,
      p_application_id, p_interview_notes
    )
    returning * into v_inserted;
  exception
    when unique_violation then
      raise exception 'Interview result already recorded for this applicant, company, position, and status.';
  end;

  return v_inserted;
end;
$$;


--
-- Name: record_vacancy_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_vacancy_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_source text;
begin
  if tg_op = 'UPDATE' and (
    old.position is distinct from new.position or
    old.salary_range is distinct from new.salary_range or
    old.qualifications is distinct from new.qualifications or
    old.available_slots is distinct from new.available_slots or
    old.is_active is distinct from new.is_active
  ) then
    select registration_source into v_source
    from employers where id = new.employer_id;

    insert into vacancy_history (vacancy_definition_id, changed_by, changed_source, snapshot)
    values (
      old.id,
      auth.uid(),
      v_source,
      jsonb_build_object(
        'position', old.position,
        'salary_range', old.salary_range,
        'qualifications', old.qualifications,
        'available_slots', old.available_slots,
        'is_active', old.is_active
      )
    );
  end if;
  return null;
end;
$$;


--
-- Name: register_for_event(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_for_event(p_event_id uuid, p_vacancy_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS public.event_participations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_participant public.participants;
  v_inserted public.event_participations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_participant from public.participants where auth_user_id = auth.uid();
  if not found then
    raise exception 'Complete your job seeker profile first.';
  end if;

  if not exists (
    select 1 from public.events e
    where e.id = p_event_id and e.status in ('upcoming', 'ongoing')
  ) then
    raise exception 'This Quest is not open for registration.';
  end if;

  begin
    insert into public.event_participations (participant_id, event_id, registration_type)
    values (v_participant.id, p_event_id, 'preregistered')
    returning * into v_inserted;
  exception
    when unique_violation then
      raise exception 'You are already registered for this Quest.';
  end;

  if p_vacancy_ids is not null and array_length(p_vacancy_ids, 1) > 0 then
    -- Preference derives from the reusable profile (Overseas -> overseas), never hardcoded.
    insert into public.participation_vacancies (participation_id, event_vacancy_id, preference_type)
    select v_inserted.id, unnest(p_vacancy_ids),
           case when jp.employment_preference = 'Overseas' then 'overseas' else 'local' end
    from public.jobseeker_profiles jp
    where jp.participant_id = v_participant.id;
  end if;

  return v_inserted;
end;
$$;


--
-- Name: resolve_login_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_login_email(p_identifier text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text;
  v_count integer;
begin
  if p_identifier is null or trim(p_identifier) = '' then
    raise exception 'Missing login identifier';
  end if;

  p_identifier := trim(p_identifier);

  -- Looks like an email: return it; the auth call validates it.
  if p_identifier ~ '@' then
    return lower(p_identifier);
  end if;

  -- Match by full name (exact, case-insensitive) among active portal accounts
  -- including employers (role='employer' with registration_status='approved')
  select count(*) into v_count
  from public.profiles
  where role in ('staff', 'supervisor', 'medical', 'admin', 'employer')
    and is_active = true
    and lower(full_name) = lower(p_identifier);

  if v_count = 0 then
    raise exception 'No active portal account found for that name';
  end if;
  if v_count > 1 then
    raise exception 'Multiple accounts share that name; please sign in with your email';
  end if;

  select email into v_email
  from public.profiles
  where role in ('staff', 'supervisor', 'medical', 'admin', 'employer')
    and is_active = true
    and lower(full_name) = lower(p_identifier);

  return v_email;
end;
$$;


--
-- Name: review_accreditation_requirement(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_accreditation_requirement(p_requirement_id uuid, p_status text, p_notes text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if app.current_user_role() <> 'admin' then
    raise exception 'Only admins may review accreditation documents';
  end if;
  if p_status not in ('approved','needs_correction','rejected') then
    raise exception 'Invalid review status';
  end if;

  update employer_accreditation_requirements
     set status = p_status,
         review_notes = p_notes,
         rejection_reason = case when p_status in ('needs_correction','rejected') then p_notes end,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_requirement_id;
  if not found then
    raise exception 'Requirement not found';
  end if;
end;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: jobseeker_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_profiles (
    participant_id uuid NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    last_name text NOT NULL,
    birthdate date,
    sex text,
    civil_status text,
    barangay text,
    municipality_city text,
    province text,
    contact_no text,
    email text NOT NULL,
    first_time_jobseeker boolean DEFAULT false NOT NULL,
    returning_ofw boolean DEFAULT false NOT NULL,
    returning_worker boolean DEFAULT false NOT NULL,
    interested_in_skills_training boolean DEFAULT false NOT NULL,
    preferred_training_program text,
    has_disability boolean DEFAULT false NOT NULL,
    disability_type text,
    peso_assistance_programs text[] DEFAULT '{}'::text[] NOT NULL,
    highest_educational_attainment text,
    course_program text,
    employment_preference text,
    resume_path text,
    data_subject_rights_agreed boolean DEFAULT false NOT NULL,
    interview_location text,
    current_employment_status text,
    previous_occupation text,
    previous_industry text,
    years_of_experience integer,
    skills text,
    desired_occupation text,
    desired_industry text,
    desired_salary text,
    willing_to_relocate boolean DEFAULT false NOT NULL,
    accommodation_needed text,
    employment_accommodation_notes text,
    first_time_school text,
    first_time_graduation_year smallint,
    first_time_ojt_experience text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ofw_country_last_worked text,
    ofw_previous_employer text,
    ofw_previous_occupation text,
    ofw_years_abroad numeric,
    ofw_date_returned date,
    ofw_reason_for_return text,
    rw_previous_work_location text,
    rw_previous_employer text,
    rw_previous_occupation text,
    rw_years_worked numeric,
    rw_date_returned date,
    rw_reason_for_return text,
    is_currently_student boolean DEFAULT false NOT NULL,
    current_school_name text,
    current_education_level text,
    current_grade_year_level text,
    current_program_or_strand text,
    expected_graduation_year smallint,
    availability_status text,
    available_start_date date,
    preferred_shift text,
    desired_salary_min numeric(12,2),
    desired_salary_max numeric(12,2),
    desired_salary_currency text DEFAULT 'PHP'::text,
    desired_salary_period text,
    career_interests text,
    professional_summary text,
    CONSTRAINT jobseeker_profiles_availability_status_check CHECK (((availability_status IS NULL) OR (availability_status = ANY (ARRAY['immediately'::text, 'specific_date'::text, 'notice_period'::text, 'not_currently_available'::text])))),
    CONSTRAINT jobseeker_profiles_current_education_level_check CHECK ((current_education_level = ANY (ARRAY['Junior High School'::text, 'Senior High School'::text, 'Technical-Vocational'::text, 'College / Undergraduate'::text, 'Graduate Studies'::text, 'Other'::text]))),
    CONSTRAINT jobseeker_profiles_employment_preference_check CHECK ((employment_preference = ANY (ARRAY['Local'::text, 'Overseas'::text, 'Both'::text]))),
    CONSTRAINT jobseeker_profiles_salary_period_check CHECK (((desired_salary_period IS NULL) OR (desired_salary_period = ANY (ARRAY['hourly'::text, 'daily'::text, 'weekly'::text, 'monthly'::text, 'annual'::text])))),
    CONSTRAINT jobseeker_profiles_salary_range_check CHECK (((desired_salary_min IS NULL) OR (desired_salary_max IS NULL) OR (desired_salary_min <= desired_salary_max))),
    CONSTRAINT jobseeker_profiles_sex_check CHECK ((sex = ANY (ARRAY['Male'::text, 'Female'::text, 'Other'::text, 'Prefer not to say'::text]))),
    CONSTRAINT profile_consent CHECK ((data_subject_rights_agreed = true))
);


--
-- Name: save_jobseeker_profile(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_jobseeker_profile(p_profile jsonb) RETURNS public.jobseeker_profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_participant public.participants;
  v_updated public.jobseeker_profiles;
  v_years_exp integer;
  v_ofw_years numeric;
  v_rw_years numeric;
  v_grad_year smallint;
  v_expected_grad_year smallint;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_participant from public.participants where auth_user_id = auth.uid();
  if not found then
    insert into public.participants (auth_user_id) values (auth.uid()) returning * into v_participant;
  end if;

  -- Numeric-tolerant casts
  v_years_exp := case when p_profile ->> 'years_of_experience' ~ '^[0-9]+$'
                      then (p_profile ->> 'years_of_experience')::integer else null end;
  v_ofw_years := case when p_profile ->> 'ofw_years_abroad' ~ '^[0-9]+(\.[0-9]+)?$'
                      then (p_profile ->> 'ofw_years_abroad')::numeric else null end;
  v_rw_years  := case when p_profile ->> 'rw_years_worked' ~ '^[0-9]+(\.[0-9]+)?$'
                      then (p_profile ->> 'rw_years_worked')::numeric else null end;
  v_grad_year := case when p_profile ->> 'first_time_graduation_year' ~ '^[0-9]{4}$'
                      then (p_profile ->> 'first_time_graduation_year')::smallint else null end;
  v_expected_grad_year := case when p_profile ->> 'expected_graduation_year' ~ '^[0-9]{4}$'
                      then (p_profile ->> 'expected_graduation_year')::smallint else null end;

  insert into public.jobseeker_profiles (
    participant_id, first_name, middle_name, last_name,
    birthdate, sex, civil_status, barangay, municipality_city, province,
    contact_no, email,
    first_time_jobseeker, returning_ofw, returning_worker,
    interested_in_skills_training, preferred_training_program,
    has_disability, disability_type, peso_assistance_programs,
    highest_educational_attainment, course_program, employment_preference,
    resume_path, data_subject_rights_agreed, interview_location,
    current_employment_status, previous_occupation, previous_industry,
    years_of_experience, skills, desired_occupation, desired_industry,
    desired_salary, willing_to_relocate,
    accommodation_needed, employment_accommodation_notes,
    first_time_school, first_time_graduation_year, first_time_ojt_experience,
    ofw_country_last_worked, ofw_previous_employer, ofw_previous_occupation,
    ofw_years_abroad, ofw_date_returned, ofw_reason_for_return,
    rw_previous_work_location, rw_previous_employer, rw_previous_occupation,
    rw_years_worked, rw_date_returned, rw_reason_for_return,
    is_currently_student, current_school_name, current_education_level,
    current_grade_year_level, current_program_or_strand, expected_graduation_year
  ) values (
    v_participant.id,
    p_profile ->> 'first_name', p_profile ->> 'middle_name', p_profile ->> 'last_name',
    nullif(p_profile ->> 'birthdate', '')::date, p_profile ->> 'sex', p_profile ->> 'civil_status',
    p_profile ->> 'barangay', p_profile ->> 'municipality_city', p_profile ->> 'province',
    p_profile ->> 'contact_no', p_profile ->> 'email',
    coalesce((p_profile ->> 'first_time_jobseeker')::boolean, false),
    coalesce((p_profile ->> 'returning_ofw')::boolean, false),
    coalesce((p_profile ->> 'returning_worker')::boolean, false),
    coalesce((p_profile ->> 'interested_in_skills_training')::boolean, false),
    p_profile ->> 'preferred_training_program',
    coalesce((p_profile ->> 'has_disability')::boolean, false),
    p_profile ->> 'disability_type',
    coalesce(array(select jsonb_array_elements_text(p_profile -> 'peso_assistance_programs')), '{}'::text[]),
    p_profile ->> 'highest_educational_attainment', p_profile ->> 'course_program',
    p_profile ->> 'employment_preference',
    p_profile ->> 'resume_path', true,
    p_profile ->> 'interview_location',
    p_profile ->> 'current_employment_status', p_profile ->> 'previous_occupation',
    p_profile ->> 'previous_industry',
    v_years_exp,
    p_profile ->> 'skills', p_profile ->> 'desired_occupation',
    p_profile ->> 'desired_industry', p_profile ->> 'desired_salary',
    coalesce((p_profile ->> 'willing_to_relocate')::boolean, false),
    p_profile ->> 'accommodation_needed', p_profile ->> 'employment_accommodation_notes',
    p_profile ->> 'first_time_school',
    v_grad_year,
    p_profile ->> 'first_time_ojt_experience',
    p_profile ->> 'ofw_country_last_worked', p_profile ->> 'ofw_previous_employer',
    p_profile ->> 'ofw_previous_occupation',
    v_ofw_years,
    nullif(p_profile ->> 'ofw_date_returned', '')::date,
    p_profile ->> 'ofw_reason_for_return',
    p_profile ->> 'rw_previous_work_location', p_profile ->> 'rw_previous_employer',
    p_profile ->> 'rw_previous_occupation',
    v_rw_years,
    nullif(p_profile ->> 'rw_date_returned', '')::date,
    p_profile ->> 'rw_reason_for_return',
    coalesce((p_profile ->> 'is_currently_student')::boolean, false),
    p_profile ->> 'current_school_name',
    p_profile ->> 'current_education_level',
    p_profile ->> 'current_grade_year_level',
    p_profile ->> 'current_program_or_strand',
    v_expected_grad_year
  )
  on conflict (participant_id) do update set
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    birthdate = excluded.birthdate,
    sex = excluded.sex,
    civil_status = excluded.civil_status,
    barangay = excluded.barangay,
    municipality_city = excluded.municipality_city,
    province = excluded.province,
    contact_no = excluded.contact_no,
    email = excluded.email,
    first_time_jobseeker = excluded.first_time_jobseeker,
    returning_ofw = excluded.returning_ofw,
    returning_worker = excluded.returning_worker,
    interested_in_skills_training = excluded.interested_in_skills_training,
    preferred_training_program = excluded.preferred_training_program,
    has_disability = excluded.has_disability,
    disability_type = excluded.disability_type,
    peso_assistance_programs = excluded.peso_assistance_programs,
    highest_educational_attainment = excluded.highest_educational_attainment,
    course_program = excluded.course_program,
    employment_preference = excluded.employment_preference,
    resume_path = excluded.resume_path,
    data_subject_rights_agreed = true,
    interview_location = excluded.interview_location,
    current_employment_status = excluded.current_employment_status,
    previous_occupation = excluded.previous_occupation,
    previous_industry = excluded.previous_industry,
    years_of_experience = excluded.years_of_experience,
    skills = excluded.skills,
    desired_occupation = excluded.desired_occupation,
    desired_industry = excluded.desired_industry,
    desired_salary = excluded.desired_salary,
    willing_to_relocate = excluded.willing_to_relocate,
    accommodation_needed = excluded.accommodation_needed,
    employment_accommodation_notes = excluded.employment_accommodation_notes,
    first_time_school = excluded.first_time_school,
    first_time_graduation_year = excluded.first_time_graduation_year,
    first_time_ojt_experience = excluded.first_time_ojt_experience,
    ofw_country_last_worked = excluded.ofw_country_last_worked,
    ofw_previous_employer = excluded.ofw_previous_employer,
    ofw_previous_occupation = excluded.ofw_previous_occupation,
    ofw_years_abroad = excluded.ofw_years_abroad,
    ofw_date_returned = excluded.ofw_date_returned,
    ofw_reason_for_return = excluded.ofw_reason_for_return,
    rw_previous_work_location = excluded.rw_previous_work_location,
    rw_previous_employer = excluded.rw_previous_employer,
    rw_previous_occupation = excluded.rw_previous_occupation,
    rw_years_worked = excluded.rw_years_worked,
    rw_date_returned = excluded.rw_date_returned,
    rw_reason_for_return = excluded.rw_reason_for_return,
    is_currently_student = excluded.is_currently_student,
    current_school_name = excluded.current_school_name,
    current_education_level = excluded.current_education_level,
    current_grade_year_level = excluded.current_grade_year_level,
    current_program_or_strand = excluded.current_program_or_strand,
    expected_graduation_year = excluded.expected_graduation_year
  returning * into v_updated;

  -- Sync special sectors: clear existing, insert new
  delete from public.jobseeker_special_sectors
    where participant_id = v_participant.id;

  if p_profile -> 'special_sectors' is not null and jsonb_array_length(p_profile -> 'special_sectors') > 0 then
    insert into public.jobseeker_special_sectors (participant_id, sector_id)
    select v_participant.id, s.id
    from public.special_worker_sectors s
    where s.code in (
      select jsonb_array_elements_text(p_profile -> 'special_sectors')
    )
    and s.is_active = true
    on conflict do nothing;
  end if;

  return v_updated;
end;
$_$;


--
-- Name: seed_accreditation_requirements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_accreditation_requirements() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into employer_accreditation_requirements (accreditation_id, requirement_key)
  select new.id, k
  from unnest(array[
    'letter_of_intent','company_profile','business_permit','bir_2303',
    'sec_registration','dti_registration','cda_registration',
    'philhealth_registration','pagibig_registration','sss_registration',
    'dole_rule_1020','dole_do174',
    'bosh_certificate','cosh_certificate',
    'philjobnet_certificate'
  ]) as k
  on conflict (accreditation_id, requirement_key) do nothing;
  return null;
end;
$$;


--
-- Name: set_updated_at_ai_extraction_runs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_ai_extraction_runs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_updated_at_ai_extraction_suggestions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_ai_extraction_suggestions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: staff_register_participant(uuid, uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_register_participant(p_participant_id uuid, p_event_id uuid, p_vacancy_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS public.event_participations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_inserted public.event_participations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Staff/medical/admin, or supervisor within the event's jurisdiction.
  if app.current_user_role() not in ('staff', 'medical', 'admin') then
    if not (
      (select app.current_user_role()) = 'supervisor'
      and public.supervisor_can_view_event(p_event_id)
    ) then
      raise exception 'Not authorized';
    end if;
  end if;

  -- Event must be open.
  if not exists (select 1 from public.events e where e.id = p_event_id and e.status in ('upcoming', 'ongoing')) then
    raise exception 'This Quest is not open for registration.';
  end if;

  -- Participant must exist (never create here).
  if not exists (select 1 from public.participants where id = p_participant_id) then
    raise exception 'Participant not found.';
  end if;

  -- Create the participation (unique (participant_id, event_id) enforced by
  -- the constraint event_participations_unique).
  begin
    insert into public.event_participations (participant_id, event_id, registration_type, registered_by)
    values (p_participant_id, p_event_id, 'preregistered', auth.uid())
    returning * into v_inserted;
  exception
    when unique_violation then
      raise exception 'This participant is already registered for this Quest.';
  end;

  -- Optional vacancy links.
  if p_vacancy_ids is not null and array_length(p_vacancy_ids, 1) > 0 then
    insert into public.participation_vacancies (participation_id, event_vacancy_id, preference_type)
    select v_inserted.id, unnest(p_vacancy_ids), 'local';
  end if;

  return v_inserted;
end;
$$;


--
-- Name: submit_accreditation_document(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_accreditation_document(p_requirement_id uuid, p_path text, p_filename text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_owner uuid;
  v_current text;
begin
  select e.registered_user_id, r.status into v_owner, v_current
  from employer_accreditation_requirements r
  join employer_accreditation a on a.id = r.accreditation_id
  join employers e on e.id = a.employer_id
  where r.id = p_requirement_id;

  if v_owner isnull or v_owner <> auth.uid() then
    raise exception 'Requirement not found';
  end if;
  if v_current = 'approved' then
    raise exception 'Approved documents cannot be replaced without PESO review';
  end if;

  update employer_accreditation_requirements
     set document_path = p_path,
         original_filename = p_filename,
         status = 'submitted',
         submitted_at = now(),
         reviewed_at = null,
         reviewed_by = null,
         review_notes = null,
         rejection_reason = null
   where id = p_requirement_id;
end;
$$;


--
-- Name: supervisor_can_view_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supervisor_can_view_event(p_event_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    coalesce((select role from public.profiles where id = (select auth.uid()) and is_active = true), 'applicant') <> 'supervisor'
    or coalesce((select is_provincial from public.profiles where id = (select auth.uid()) and is_active = true), false)
    or exists (
      select 1
      from public.events e
      join public.profiles p on p.id = (select auth.uid())
      where e.id = p_event_id
        and lower(coalesce(e.location, '')) = lower(p.jurisdiction)
    );
$$;


--
-- Name: supervisor_municipalities(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supervisor_municipalities() RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when coalesce(is_provincial, false) then null           -- all municipalities
    when jurisdiction is not null then array[jurisdiction]   -- exactly one
    else null
  end
  from public.profiles
  where id = (select auth.uid()) and is_active = true and role = 'supervisor';
$$;


--
-- Name: ai_extraction_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_extraction_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    extraction_type text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    extraction_version text DEFAULT 'ai-extraction-v1'::text NOT NULL,
    input_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    failure_reason text,
    request_count integer DEFAULT 1,
    input_tokens integer,
    output_tokens integer,
    latency_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE ai_extraction_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_extraction_runs IS 'Tracks each AI extraction invocation for auditing and cost analysis.';


--
-- Name: ai_extraction_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_extraction_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    suggestion_type text NOT NULL,
    raw_term text NOT NULL,
    confidence numeric(3,2),
    provenance text DEFAULT 'explicit'::text NOT NULL,
    source_text_fragment text,
    resolution_status text DEFAULT 'UNRESOLVED'::text,
    canonical_id uuid,
    canonical_name text,
    candidate_matches jsonb DEFAULT '[]'::jsonb,
    resolution_method text,
    review_status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    edited_term text,
    edited_canonical_id uuid,
    importance text,
    minimum_months integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    review_note text,
    source_intent text DEFAULT 'unknown'::text,
    CONSTRAINT ai_extraction_suggestions_source_intent_check CHECK ((source_intent = ANY (ARRAY['preference'::text, 'historical'::text, 'unknown'::text])))
);


--
-- Name: TABLE ai_extraction_suggestions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_extraction_suggestions IS 'AI-extracted employment suggestions awaiting human review and confirmation.';


--
-- Name: COLUMN ai_extraction_suggestions.review_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_extraction_suggestions.review_note IS 'Optional reviewer note for rejection, manual remapping, or admin correction.';


--
-- Name: COLUMN ai_extraction_suggestions.source_intent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_extraction_suggestions.source_intent IS 'Detected source intent: preference (career interest), historical (past work), or unknown. Determines whether occupation/industry writes go to preference tables.';


--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registrant_id uuid NOT NULL,
    event_vacancy_id uuid NOT NULL,
    application_status text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT applications_application_status_check CHECK ((application_status = ANY (ARRAY['applied'::text, 'shortlisted'::text, 'rejected'::text, 'withdrawn'::text])))
);


--
-- Name: TABLE applications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.applications IS 'Tracks actual job applications. Distinct from registrant_vacancies which tracks preferences.';


--
-- Name: COLUMN applications.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.source IS 'How the application was created: manual (staff at event), existing_vacancy_preference (migrated), online (self-service)';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    user_id uuid,
    action text NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    old_data jsonb,
    new_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: certifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    normalized_name text NOT NULL,
    issuing_organization text,
    certification_type text DEFAULT 'other'::text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: education_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.education_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    rank integer NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: employer_accreditation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employer_accreditation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employer_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_at timestamp with time zone,
    effective_date date,
    expiration_date date,
    renewal_status text DEFAULT 'not_renewable_yet'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employer_accreditation_renewal_status_check CHECK ((renewal_status = ANY (ARRAY['current'::text, 'due'::text, 'expired'::text, 'not_renewable_yet'::text]))),
    CONSTRAINT employer_accreditation_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: employer_accreditation_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employer_accreditation_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    accreditation_id uuid NOT NULL,
    requirement_key text NOT NULL,
    status text DEFAULT 'not_submitted'::text NOT NULL,
    document_path text,
    original_filename text,
    submitted_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    review_notes text,
    rejection_reason text,
    CONSTRAINT employer_accreditation_requirements_status_check CHECK ((status = ANY (ARRAY['not_submitted'::text, 'submitted'::text, 'approved'::text, 'needs_correction'::text, 'rejected'::text])))
);


--
-- Name: employer_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employer_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employer_event_participations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employer_event_participations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    employer_id uuid NOT NULL,
    status text DEFAULT 'registered'::text NOT NULL,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    checked_in_at timestamp with time zone,
    checked_in_by uuid,
    CONSTRAINT employer_event_participations_status_check CHECK ((status = ANY (ARRAY['registered'::text, 'checked_in'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: employers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text NOT NULL,
    industry text,
    contact_person text,
    contact_number text,
    email text,
    address text,
    pwd_friendly boolean DEFAULT false,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employer_type text DEFAULT 'local_direct'::text NOT NULL,
    license_no text,
    registration_status text DEFAULT 'approved'::text NOT NULL,
    registered_user_id uuid,
    rejection_reason text,
    building_street text,
    province text,
    municipality_city text,
    barangay text,
    has_cagayan_branch boolean DEFAULT false NOT NULL,
    branch_building_street text,
    branch_province text,
    branch_municipality_city text,
    branch_barangay text,
    branch_address text,
    tin text,
    business_structure text,
    osh_classification text,
    employer_code text,
    registration_source text,
    CONSTRAINT employers_business_structure_check CHECK ((business_structure = ANY (ARRAY['corporation'::text, 'partnership'::text, 'single_proprietorship'::text, 'cooperative'::text]))),
    CONSTRAINT employers_employer_type_check CHECK ((employer_type = ANY (ARRAY['local_direct'::text, 'local_agency'::text]))),
    CONSTRAINT employers_osh_classification_check CHECK ((osh_classification = ANY (ARRAY['low_risk'::text, 'construction_heavy_industrial'::text]))),
    CONSTRAINT employers_registration_source_check CHECK ((registration_source = ANY (ARRAY['admin'::text, 'self_registered'::text]))),
    CONSTRAINT employers_registration_status_check CHECK ((registration_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: TABLE employers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.employers IS 'Employer profiles. Linked to vacancy_definitions.';


--
-- Name: COLUMN employers.employer_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employers.employer_type IS 'local_direct = direct hire employer, local_agency = recruitment agency / HR / third party';


--
-- Name: COLUMN employers.license_no; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employers.license_no IS 'POEA/DOLE license number (required for agencies)';


--
-- Name: COLUMN employers.registration_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employers.registration_status IS 'pending = awaiting admin approval, approved = can access employer dashboard, rejected = denied';


--
-- Name: COLUMN employers.registered_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employers.registered_user_id IS 'FK to auth.users for the employer who registered this company';


--
-- Name: COLUMN employers.rejection_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employers.rejection_reason IS 'Optional reason when admin rejects an employer registration';


--
-- Name: employment_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employment_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type public.entity_type NOT NULL,
    entity_id uuid NOT NULL,
    embedding_type public.embedding_type NOT NULL,
    source_text text NOT NULL,
    source_hash text NOT NULL,
    embedding extensions.vector(1536),
    provider text DEFAULT 'openai'::text NOT NULL,
    model text DEFAULT 'text-embedding-3-small'::text NOT NULL,
    dimensions integer DEFAULT 1536 NOT NULL,
    embedding_version text DEFAULT 'jobseeker-semantic-v1'::text NOT NULL,
    status public.embedding_status DEFAULT 'pending'::public.embedding_status NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    generated_at timestamp with time zone,
    CONSTRAINT valid_embedding CHECK (((embedding IS NOT NULL) OR (status = 'failed'::public.embedding_status))),
    CONSTRAINT valid_source_hash CHECK ((length(source_hash) > 0))
);


--
-- Name: TABLE employment_embeddings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.employment_embeddings IS 'Versioned embedding storage for employment entities (jobseekers, vacancies, occupations, skills)';


--
-- Name: COLUMN employment_embeddings.entity_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_embeddings.entity_type IS 'Type of entity this embedding represents';


--
-- Name: COLUMN employment_embeddings.entity_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_embeddings.entity_id IS 'UUID of the entity in its respective table';


--
-- Name: COLUMN employment_embeddings.embedding_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_embeddings.embedding_type IS 'Semantic representation type for embedding';


--
-- Name: COLUMN employment_embeddings.source_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_embeddings.source_text IS 'Canonical serialized text used to generate embedding';


--
-- Name: COLUMN employment_embeddings.source_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_embeddings.source_hash IS 'SHA-256 hash of source_text + embedding_version for deduplication';


--
-- Name: COLUMN employment_embeddings.embedding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_embeddings.embedding IS 'Vector embedding in pgvector format';


--
-- Name: COLUMN employment_embeddings.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_embeddings.status IS 'Current status: current, stale, pending, failed';


--
-- Name: COLUMN employment_embeddings.generated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_embeddings.generated_at IS 'Timestamp when embedding was successfully generated';


--
-- Name: employment_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employment_outcomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    outcome text NOT NULL,
    hired_at date,
    position_held text,
    company text,
    salary text,
    start_date date,
    verified_by uuid,
    verification_notes text,
    verification_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employer_id uuid,
    CONSTRAINT employment_outcomes_outcome_check CHECK ((outcome = ANY (ARRAY['hired'::text, 'not_hired'::text, 'offer_declined'::text, 'withdrawn'::text, 'pending'::text])))
);


--
-- Name: TABLE employment_outcomes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.employment_outcomes IS 'Verified employment outcomes. Distinct from interview status (HOTs is an interview outcome, not a verified employment outcome).';


--
-- Name: COLUMN employment_outcomes.verified_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_outcomes.verified_by IS 'Staff member who verified the employment outcome';


--
-- Name: COLUMN employment_outcomes.verification_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_outcomes.verification_date IS 'Date when the outcome was verified';


--
-- Name: COLUMN employment_outcomes.employer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employment_outcomes.employer_id IS 'Link to employers table for reporting and tracking.';


--
-- Name: employment_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employment_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: event_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assignment_role text NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_assignments_assignment_role_check CHECK ((assignment_role = ANY (ARRAY['supervisor'::text, 'staff'::text, 'medical'::text])))
);


--
-- Name: event_vacancies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_vacancies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vacancy_definition_id uuid NOT NULL,
    event_id uuid NOT NULL,
    slots_offered integer DEFAULT 1 NOT NULL,
    slots_filled integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    application_deadline timestamp with time zone,
    CONSTRAINT event_vacancies_slots_filled_check CHECK ((slots_filled >= 0)),
    CONSTRAINT event_vacancies_slots_offered_check CHECK ((slots_offered >= 0))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_name text NOT NULL,
    event_date date NOT NULL,
    location text NOT NULL,
    description text,
    status public.event_status DEFAULT 'upcoming'::public.event_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    venue text,
    time_from time without time zone,
    time_to time without time zone,
    event_type public.event_type DEFAULT 'job_fair'::public.event_type NOT NULL,
    recruitment_type public.recruitment_type,
    CONSTRAINT events_event_type_check CHECK ((((event_type = 'recruitment_activity'::public.event_type) AND (recruitment_type = ANY (ARRAY['local'::public.recruitment_type, 'special'::public.recruitment_type]))) OR ((event_type = ANY (ARRAY['job_fair'::public.event_type, 'online'::public.event_type])) AND (recruitment_type IS NULL))))
);


--
-- Name: COLUMN events.event_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.event_type IS 'Kind of event: job_fair, recruitment_activity, or online.';


--
-- Name: COLUMN events.recruitment_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.recruitment_type IS 'For recruitment_activity events: local or special (overseas). NULL for other event types.';


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employment_outcome_id uuid NOT NULL,
    follow_up_type text NOT NULL,
    scheduled_date date,
    completed_date date,
    status text DEFAULT 'scheduled'::text NOT NULL,
    still_employed boolean,
    "position" text,
    salary text,
    employer_confirmed boolean,
    worker_confirmed boolean,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT follow_ups_follow_up_type_check CHECK ((follow_up_type = ANY (ARRAY['30_day'::text, '60_day'::text, '90_day'::text, '180_day'::text]))),
    CONSTRAINT follow_ups_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'unreachable'::text, 'declined'::text])))
);


--
-- Name: TABLE follow_ups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.follow_ups IS 'Post-hire follow-up tracking at 30/60/90/180 days.';


--
-- Name: COLUMN follow_ups.still_employed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow_ups.still_employed IS 'Whether the worker is still employed at the time of follow-up';


--
-- Name: COLUMN follow_ups.employer_confirmed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow_ups.employer_confirmed IS 'Employer confirmed the follow-up details';


--
-- Name: COLUMN follow_ups.worker_confirmed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow_ups.worker_confirmed IS 'Worker confirmed their status';


--
-- Name: industries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.industries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    normalized_name text NOT NULL,
    description text,
    parent_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: jobseeker_certifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_certifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jobseeker_profile_id uuid NOT NULL,
    certification_id uuid,
    credential_name_override text,
    issuing_organization_override text,
    credential_number text,
    date_issued date,
    expiration_date date,
    does_not_expire boolean DEFAULT false NOT NULL,
    verification_url text,
    verification_status text DEFAULT 'unverified'::text NOT NULL,
    source text DEFAULT 'self_reported'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jobseeker_cert_source_check CHECK ((source = ANY (ARRAY['self_reported'::text, 'admin_entered'::text, 'employer_reported'::text, 'legacy_backfill'::text, 'llm_inferred'::text]))),
    CONSTRAINT jobseeker_cert_verification_check CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'expired'::text, 'rejected'::text])))
);


--
-- Name: jobseeker_education; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_education (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jobseeker_profile_id uuid NOT NULL,
    education_level_id uuid NOT NULL,
    school_name text,
    field_of_study text,
    course_program text,
    start_date date,
    end_date date,
    graduation_year smallint,
    status text DEFAULT 'completed'::text NOT NULL,
    is_current boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jobseeker_education_status_check CHECK ((status = ANY (ARRAY['graduated'::text, 'completed'::text, 'undergraduate'::text, 'currently_enrolled'::text, 'incomplete'::text, 'dropped'::text])))
);


--
-- Name: jobseeker_employment_type_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_employment_type_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jobseeker_profile_id uuid NOT NULL,
    employment_type_id uuid NOT NULL,
    priority smallint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: jobseeker_industry_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_industry_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jobseeker_profile_id uuid NOT NULL,
    industry_id uuid NOT NULL,
    priority smallint DEFAULT 1 NOT NULL,
    source text DEFAULT 'self_reported'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jobseeker_ind_pref_source_check CHECK ((source = ANY (ARRAY['self_reported'::text, 'admin_entered'::text, 'employer_reported'::text, 'legacy_backfill'::text, 'llm_inferred'::text])))
);


--
-- Name: jobseeker_languages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_languages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jobseeker_profile_id uuid NOT NULL,
    language_id uuid NOT NULL,
    speaking_proficiency text,
    reading_proficiency text,
    writing_proficiency text,
    is_native boolean DEFAULT false NOT NULL,
    source text DEFAULT 'self_reported'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jobseeker_lang_reading_check CHECK (((reading_proficiency IS NULL) OR (reading_proficiency = ANY (ARRAY['none'::text, 'elementary'::text, 'intermediate'::text, 'advanced'::text, 'fluent'::text, 'native'::text])))),
    CONSTRAINT jobseeker_lang_source_check CHECK ((source = ANY (ARRAY['self_reported'::text, 'admin_entered'::text, 'employer_reported'::text, 'legacy_backfill'::text, 'llm_inferred'::text]))),
    CONSTRAINT jobseeker_lang_speaking_check CHECK (((speaking_proficiency IS NULL) OR (speaking_proficiency = ANY (ARRAY['none'::text, 'elementary'::text, 'intermediate'::text, 'advanced'::text, 'fluent'::text, 'native'::text])))),
    CONSTRAINT jobseeker_lang_writing_check CHECK (((writing_proficiency IS NULL) OR (writing_proficiency = ANY (ARRAY['none'::text, 'elementary'::text, 'intermediate'::text, 'advanced'::text, 'fluent'::text, 'native'::text]))))
);


--
-- Name: jobseeker_location_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_location_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jobseeker_profile_id uuid NOT NULL,
    region text,
    province text,
    municipality_city text,
    priority smallint DEFAULT 1 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: jobseeker_occupation_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_occupation_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jobseeker_profile_id uuid NOT NULL,
    occupation_id uuid NOT NULL,
    priority smallint DEFAULT 1 NOT NULL,
    preference_type text DEFAULT 'primary'::text NOT NULL,
    source text DEFAULT 'self_reported'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jobseeker_occ_pref_source_check CHECK ((source = ANY (ARRAY['self_reported'::text, 'admin_entered'::text, 'employer_reported'::text, 'legacy_backfill'::text, 'llm_inferred'::text]))),
    CONSTRAINT jobseeker_occ_pref_type_check CHECK ((preference_type = ANY (ARRAY['primary'::text, 'secondary'::text, 'exploratory'::text])))
);


--
-- Name: jobseeker_profile_save_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_profile_save_limits (
    auth_user_id uuid NOT NULL,
    save_date date DEFAULT CURRENT_DATE NOT NULL,
    save_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT jobseeker_profile_save_limits_count_check CHECK ((save_count >= 0))
);


--
-- Name: jobseeker_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jobseeker_profile_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    proficiency_level text,
    years_experience smallint,
    source text DEFAULT 'self_reported'::text NOT NULL,
    verification_status text DEFAULT 'unverified'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: jobseeker_special_sectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_special_sectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    sector_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: jobseeker_work_arrangement_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobseeker_work_arrangement_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jobseeker_profile_id uuid NOT NULL,
    work_arrangement_id uuid NOT NULL,
    priority smallint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: languages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.languages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    code_standard text DEFAULT 'iso_639_1'::text NOT NULL,
    CONSTRAINT languages_code_standard_check CHECK ((code_standard = ANY (ARRAY['iso_639_1'::text, 'iso_639_3'::text, 'internal'::text])))
);


--
-- Name: COLUMN languages.code_standard; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.languages.code_standard IS 'Standard the code follows: iso_639_1, iso_639_3, or internal';


--
-- Name: medical_referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registrant_id uuid NOT NULL,
    interview_log_id uuid,
    event_id uuid,
    referred_by uuid NOT NULL,
    status public.referral_status DEFAULT 'pending'::public.referral_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medical_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT 'slate'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: occupation_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.occupation_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occupation_id uuid NOT NULL,
    alias text NOT NULL,
    normalized_alias text NOT NULL,
    alias_type text DEFAULT 'common'::text NOT NULL,
    language_code text DEFAULT 'en'::text,
    source text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: occupation_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.occupation_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occupation_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    relationship_type text DEFAULT 'essential'::text NOT NULL,
    importance smallint,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: occupations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.occupations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    normalized_name text NOT NULL,
    description text,
    occupation_level smallint,
    parent_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: participation_vacancies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participation_vacancies (
    participation_id uuid NOT NULL,
    event_vacancy_id uuid NOT NULL,
    preference_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT participation_vacancies_preference_type_check CHECK ((preference_type = ANY (ARRAY['local'::text, 'overseas'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role public.tc_user_role DEFAULT 'applicant'::public.tc_user_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    jurisdiction text,
    is_provincial boolean DEFAULT false NOT NULL
);


--
-- Name: referral_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_services (
    referral_id uuid NOT NULL,
    service_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: registrant_vacancies; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.registrant_vacancies WITH (security_invoker='true') AS
 SELECT participation_id AS registrant_id,
    event_vacancy_id,
    preference_type,
    created_at
   FROM public.participation_vacancies pv;


--
-- Name: registrant_vacancies_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registrant_vacancies_legacy (
    registrant_id uuid NOT NULL,
    event_vacancy_id uuid NOT NULL,
    preference_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT registrant_vacancies_new_preference_type_check CHECK ((preference_type = ANY (ARRAY['local'::text, 'overseas'::text])))
);


--
-- Name: registrants; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.registrants WITH (security_invoker='true') AS
 SELECT ep.id,
    p.auth_user_id AS owner_id,
    ep.ticket_code AS unique_id,
    ep.event_id,
    jp.first_name,
    jp.middle_name,
    jp.last_name,
    jp.birthdate,
    jp.sex,
    jp.civil_status,
    jp.barangay,
    jp.municipality_city,
    jp.province,
    jp.contact_no,
    jp.email,
    jp.first_time_jobseeker,
    jp.returning_ofw,
    jp.returning_worker,
    jp.interested_in_skills_training,
    jp.preferred_training_program,
    jp.has_disability,
    jp.disability_type,
    jp.peso_assistance_programs,
    jp.highest_educational_attainment,
    jp.course_program,
    jp.employment_preference,
    jp.resume_path,
    jp.data_subject_rights_agreed,
    jp.interview_location,
    ep.check_in_status,
    ep.check_in_time,
    ep.check_in_by,
    ep.registration_type,
    ep.qr_token,
    ep.created_at,
    ep.updated_at,
    jp.current_employment_status,
    jp.previous_occupation,
    jp.previous_industry,
    jp.years_of_experience,
    jp.skills,
    jp.desired_occupation,
    jp.desired_industry,
    jp.desired_salary,
    jp.willing_to_relocate,
    jp.accommodation_needed,
    jp.employment_accommodation_notes,
    jp.first_time_school,
    jp.first_time_graduation_year,
    jp.first_time_ojt_experience
   FROM ((public.event_participations ep
     JOIN public.participants p ON ((p.id = ep.participant_id)))
     LEFT JOIN public.jobseeker_profiles jp ON ((jp.participant_id = p.id)));


--
-- Name: registrants_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registrants_legacy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    unique_id text DEFAULT ('TC-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 10))) NOT NULL,
    event_id uuid,
    first_name text NOT NULL,
    middle_name text,
    last_name text NOT NULL,
    birthdate date,
    sex text,
    civil_status text,
    barangay text,
    municipality_city text,
    province text,
    contact_no text,
    email text NOT NULL,
    first_time_jobseeker boolean DEFAULT false NOT NULL,
    returning_ofw boolean DEFAULT false NOT NULL,
    returning_worker boolean DEFAULT false NOT NULL,
    interested_in_skills_training boolean DEFAULT false NOT NULL,
    preferred_training_program text,
    has_disability boolean DEFAULT false NOT NULL,
    disability_type text,
    peso_assistance_programs text[] DEFAULT '{}'::text[] NOT NULL,
    highest_educational_attainment text,
    course_program text,
    employment_preference text,
    resume_path text,
    data_subject_rights_agreed boolean DEFAULT false NOT NULL,
    interview_location text,
    check_in_status public.checkin_status DEFAULT 'pending'::public.checkin_status NOT NULL,
    check_in_time timestamp with time zone,
    check_in_by uuid,
    registration_type text DEFAULT 'preregistered'::text NOT NULL,
    qr_token uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_employment_status text,
    previous_occupation text,
    previous_industry text,
    years_of_experience integer,
    skills text,
    desired_occupation text,
    desired_industry text,
    desired_salary text,
    willing_to_relocate boolean DEFAULT false,
    accommodation_needed text,
    employment_accommodation_notes text,
    first_time_school text,
    first_time_graduation_year smallint,
    first_time_ojt_experience text,
    CONSTRAINT consent_required CHECK ((data_subject_rights_agreed = true)),
    CONSTRAINT registrants_employment_preference_check CHECK ((employment_preference = ANY (ARRAY['Local'::text, 'Overseas'::text, 'Both'::text]))),
    CONSTRAINT registrants_registration_type_check CHECK ((registration_type = ANY (ARRAY['preregistered'::text, 'walkin'::text]))),
    CONSTRAINT registrants_sex_check CHECK ((sex = ANY (ARRAY['Male'::text, 'Female'::text, 'Other'::text, 'Prefer not to say'::text])))
);


--
-- Name: COLUMN registrants_legacy.current_employment_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.current_employment_status IS 'Current employment status: employed, unemployed, student, etc.';


--
-- Name: COLUMN registrants_legacy.previous_occupation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.previous_occupation IS 'Most recent occupation before this event';


--
-- Name: COLUMN registrants_legacy.previous_industry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.previous_industry IS 'Industry of previous occupation';


--
-- Name: COLUMN registrants_legacy.years_of_experience; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.years_of_experience IS 'Total years of work experience';


--
-- Name: COLUMN registrants_legacy.skills; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.skills IS 'Comma-separated list of skills';


--
-- Name: COLUMN registrants_legacy.desired_occupation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.desired_occupation IS 'Job role the applicant is seeking';


--
-- Name: COLUMN registrants_legacy.desired_industry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.desired_industry IS 'Industry the applicant wants to work in';


--
-- Name: COLUMN registrants_legacy.desired_salary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.desired_salary IS 'Expected salary range';


--
-- Name: COLUMN registrants_legacy.willing_to_relocate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.willing_to_relocate IS 'Whether applicant is willing to relocate for work';


--
-- Name: COLUMN registrants_legacy.accommodation_needed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.accommodation_needed IS 'Type of workplace accommodation needed (e.g., wheelchair ramp, sign language interpreter)';


--
-- Name: COLUMN registrants_legacy.employment_accommodation_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.employment_accommodation_notes IS 'Additional notes about accommodation requirements';


--
-- Name: COLUMN registrants_legacy.first_time_school; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.first_time_school IS 'School attended for first-time jobseekers';


--
-- Name: COLUMN registrants_legacy.first_time_graduation_year; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.first_time_graduation_year IS 'Year of graduation for first-time jobseekers';


--
-- Name: COLUMN registrants_legacy.first_time_ojt_experience; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registrants_legacy.first_time_ojt_experience IS 'On-the-job training experience for first-time jobseekers';


--
-- Name: returning_ofw_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.returning_ofw_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registrant_id uuid NOT NULL,
    country_last_worked text,
    previous_employer text,
    previous_occupation text,
    previous_industry text,
    date_departed date,
    date_returned date,
    years_abroad numeric(4,1),
    reason_for_return text,
    desired_local_occupation text,
    desired_industry text,
    wants_local_employment boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE returning_ofw_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.returning_ofw_profiles IS 'Extended profile for registrants who are Returning OFWs. Only meaningful when registrants.returning_ofw = true.';


--
-- Name: returning_worker_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.returning_worker_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registrant_id uuid NOT NULL,
    home_province text,
    home_municipality text,
    previous_work_region text,
    previous_work_province text,
    previous_work_city text,
    previous_employer text,
    previous_occupation text,
    previous_industry text,
    work_start_date date,
    work_end_date date,
    return_status text,
    date_returned date,
    expected_return_date date,
    reason_for_return text,
    wants_local_employment boolean DEFAULT false,
    desired_cagayan_occupation text,
    desired_industry text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT returning_worker_profiles_return_status_check CHECK ((return_status = ANY (ARRAY['already_returned'::text, 'returning'::text, 'planning_to_return'::text])))
);


--
-- Name: TABLE returning_worker_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.returning_worker_profiles IS 'Extended profile for registrants who are Returning Workers – Cagayan. home_province should be Cagayan, previous_work_province should NOT be Cagayan.';


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    normalized_name text NOT NULL,
    description text,
    skill_type text DEFAULT 'other'::text NOT NULL,
    parent_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: special_worker_sectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.special_worker_sectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: taxonomy_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    taxonomy_source_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    external_code text,
    external_id text,
    external_name text,
    mapping_type text DEFAULT 'exact'::text NOT NULL,
    confidence numeric(3,2),
    is_primary boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: taxonomy_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    version text,
    source_type text DEFAULT 'internal'::text NOT NULL,
    country_code text,
    source_url text,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vacancies_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacancies_legacy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    company_name text NOT NULL,
    "position" text NOT NULL,
    vacancies_count integer DEFAULT 1 NOT NULL,
    qualifications text,
    salary_range text,
    place_of_assignment text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vacancies_vacancies_count_check CHECK ((vacancies_count >= 0))
);


--
-- Name: vacancy_certification_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacancy_certification_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vacancy_definition_id uuid NOT NULL,
    certification_id uuid NOT NULL,
    importance text DEFAULT 'required'::text NOT NULL,
    must_be_valid boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vac_cert_req_importance_check CHECK ((importance = ANY (ARRAY['required'::text, 'preferred'::text])))
);


--
-- Name: vacancy_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacancy_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text NOT NULL,
    "position" text NOT NULL,
    qualifications text,
    salary_range text,
    place_of_assignment text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employer_id uuid,
    principal_name text,
    available_slots integer,
    created_by uuid,
    created_source text,
    job_description text,
    requirements_summary text,
    occupation_id uuid,
    industry_id uuid,
    employment_type_id uuid,
    work_arrangement_id uuid,
    salary_min numeric(12,2),
    salary_max numeric(12,2),
    salary_currency text DEFAULT 'PHP'::text,
    salary_period text,
    salary_negotiable boolean DEFAULT false,
    province text,
    municipality_city text,
    CONSTRAINT vacancy_def_salary_period_check CHECK (((salary_period IS NULL) OR (salary_period = ANY (ARRAY['hourly'::text, 'daily'::text, 'weekly'::text, 'monthly'::text, 'annual'::text])))),
    CONSTRAINT vacancy_def_salary_range_check CHECK (((salary_min IS NULL) OR (salary_max IS NULL) OR (salary_min <= salary_max))),
    CONSTRAINT vacancy_definitions_created_source_check CHECK ((created_source = ANY (ARRAY['admin'::text, 'employer'::text])))
);


--
-- Name: COLUMN vacancy_definitions.employer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vacancy_definitions.employer_id IS 'Link to employers table. Can be null for legacy data.';


--
-- Name: COLUMN vacancy_definitions.principal_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vacancy_definitions.principal_name IS 'For agencies: the company they are hiring for (their principal). NULL = direct hire (company is the principal).';


--
-- Name: vacancy_education_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacancy_education_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vacancy_definition_id uuid NOT NULL,
    education_level_id uuid NOT NULL,
    field_of_study text,
    importance text DEFAULT 'required'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vac_edu_req_importance_check CHECK ((importance = ANY (ARRAY['required'::text, 'preferred'::text])))
);


--
-- Name: vacancy_experience_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacancy_experience_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vacancy_definition_id uuid NOT NULL,
    occupation_id uuid,
    industry_id uuid,
    minimum_months smallint,
    importance text DEFAULT 'required'::text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vac_exp_req_importance_check CHECK ((importance = ANY (ARRAY['required'::text, 'preferred'::text])))
);


--
-- Name: vacancy_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacancy_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vacancy_definition_id uuid NOT NULL,
    changed_by uuid,
    changed_source text,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vacancy_language_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacancy_language_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vacancy_definition_id uuid NOT NULL,
    language_id uuid NOT NULL,
    minimum_speaking text,
    minimum_reading text,
    minimum_writing text,
    importance text DEFAULT 'required'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vac_lang_req_importance_check CHECK ((importance = ANY (ARRAY['required'::text, 'preferred'::text]))),
    CONSTRAINT vac_lang_req_reading_check CHECK (((minimum_reading IS NULL) OR (minimum_reading = ANY (ARRAY['none'::text, 'elementary'::text, 'intermediate'::text, 'advanced'::text, 'fluent'::text, 'native'::text])))),
    CONSTRAINT vac_lang_req_speaking_check CHECK (((minimum_speaking IS NULL) OR (minimum_speaking = ANY (ARRAY['none'::text, 'elementary'::text, 'intermediate'::text, 'advanced'::text, 'fluent'::text, 'native'::text])))),
    CONSTRAINT vac_lang_req_writing_check CHECK (((minimum_writing IS NULL) OR (minimum_writing = ANY (ARRAY['none'::text, 'elementary'::text, 'intermediate'::text, 'advanced'::text, 'fluent'::text, 'native'::text]))))
);


--
-- Name: vacancy_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacancy_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vacancy_definition_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    importance text DEFAULT 'required'::text NOT NULL,
    minimum_proficiency text,
    minimum_years_experience smallint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: work_arrangements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_arrangements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: work_experiences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_experiences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    employer_name text,
    position_title text,
    industry text,
    employment_relationship text,
    employment_arrangement text,
    work_schedule_type text,
    start_date date,
    end_date date,
    is_current boolean DEFAULT false NOT NULL,
    country text,
    province text,
    municipality_city text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    building_street text,
    CONSTRAINT work_experiences_employment_arrangement_check CHECK ((employment_arrangement = ANY (ARRAY['regular_permanent'::text, 'probationary'::text, 'fixed_term_contractual'::text, 'project_based'::text, 'casual'::text, 'seasonal'::text, 'temporary'::text, 'apprenticeship'::text, 'internship_ojt'::text, 'other'::text]))),
    CONSTRAINT work_experiences_employment_relationship_check CHECK ((employment_relationship = ANY (ARRAY['employee'::text, 'self_employed'::text, 'employer_business_owner'::text, 'freelance_gig_worker'::text, 'unpaid_family_worker'::text, 'other'::text]))),
    CONSTRAINT work_experiences_work_schedule_type_check CHECK ((work_schedule_type = ANY (ARRAY['full_time'::text, 'part_time'::text, 'on_call'::text, 'intermittent'::text, 'irregular'::text, 'as_needed'::text, 'other'::text])))
);


--
-- Name: ai_extraction_runs ai_extraction_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_extraction_runs
    ADD CONSTRAINT ai_extraction_runs_pkey PRIMARY KEY (id);


--
-- Name: ai_extraction_suggestions ai_extraction_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_extraction_suggestions
    ADD CONSTRAINT ai_extraction_suggestions_pkey PRIMARY KEY (id);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: applications applications_registrant_event_vacancy_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_registrant_event_vacancy_key UNIQUE (registrant_id, event_vacancy_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: certifications certifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certifications
    ADD CONSTRAINT certifications_pkey PRIMARY KEY (id);


--
-- Name: education_levels education_levels_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.education_levels
    ADD CONSTRAINT education_levels_code_key UNIQUE (code);


--
-- Name: education_levels education_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.education_levels
    ADD CONSTRAINT education_levels_pkey PRIMARY KEY (id);


--
-- Name: employer_accreditation employer_accreditation_employer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_accreditation
    ADD CONSTRAINT employer_accreditation_employer_id_key UNIQUE (employer_id);


--
-- Name: employer_accreditation employer_accreditation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_accreditation
    ADD CONSTRAINT employer_accreditation_pkey PRIMARY KEY (id);


--
-- Name: employer_accreditation_requirements employer_accreditation_requir_accreditation_id_requirement__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_accreditation_requirements
    ADD CONSTRAINT employer_accreditation_requir_accreditation_id_requirement__key UNIQUE (accreditation_id, requirement_key);


--
-- Name: employer_accreditation_requirements employer_accreditation_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_accreditation_requirements
    ADD CONSTRAINT employer_accreditation_requirements_pkey PRIMARY KEY (id);


--
-- Name: employer_event_participations employer_event_participations_event_id_employer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_event_participations
    ADD CONSTRAINT employer_event_participations_event_id_employer_id_key UNIQUE (event_id, employer_id);


--
-- Name: employer_event_participations employer_event_participations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_event_participations
    ADD CONSTRAINT employer_event_participations_pkey PRIMARY KEY (id);


--
-- Name: employers employers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employers
    ADD CONSTRAINT employers_pkey PRIMARY KEY (id);


--
-- Name: employment_embeddings employment_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_embeddings
    ADD CONSTRAINT employment_embeddings_pkey PRIMARY KEY (id);


--
-- Name: employment_outcomes employment_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_outcomes
    ADD CONSTRAINT employment_outcomes_pkey PRIMARY KEY (id);


--
-- Name: employment_types employment_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_types
    ADD CONSTRAINT employment_types_code_key UNIQUE (code);


--
-- Name: employment_types employment_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_types
    ADD CONSTRAINT employment_types_pkey PRIMARY KEY (id);


--
-- Name: event_assignments event_assignments_event_id_user_id_assignment_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_assignments
    ADD CONSTRAINT event_assignments_event_id_user_id_assignment_role_key UNIQUE (event_id, user_id, assignment_role);


--
-- Name: event_assignments event_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_assignments
    ADD CONSTRAINT event_assignments_pkey PRIMARY KEY (id);


--
-- Name: event_participations event_participations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participations
    ADD CONSTRAINT event_participations_pkey PRIMARY KEY (id);


--
-- Name: event_participations event_participations_qr_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participations
    ADD CONSTRAINT event_participations_qr_token_key UNIQUE (qr_token);


--
-- Name: event_participations event_participations_ticket_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participations
    ADD CONSTRAINT event_participations_ticket_code_key UNIQUE (ticket_code);


--
-- Name: event_participations event_participations_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participations
    ADD CONSTRAINT event_participations_unique UNIQUE (participant_id, event_id);


--
-- Name: event_vacancies event_vacancies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_vacancies
    ADD CONSTRAINT event_vacancies_pkey PRIMARY KEY (id);


--
-- Name: event_vacancies event_vacancies_vacancy_definition_id_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_vacancies
    ADD CONSTRAINT event_vacancies_vacancy_definition_id_event_id_key UNIQUE (vacancy_definition_id, event_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);


--
-- Name: industries industries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industries
    ADD CONSTRAINT industries_pkey PRIMARY KEY (id);


--
-- Name: interview_logs interview_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_logs
    ADD CONSTRAINT interview_logs_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_certifications jobseeker_certifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_certifications
    ADD CONSTRAINT jobseeker_certifications_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_education jobseeker_education_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_education
    ADD CONSTRAINT jobseeker_education_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_employment_type_preferences jobseeker_employment_type_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_employment_type_preferences
    ADD CONSTRAINT jobseeker_employment_type_preferences_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_industry_preferences jobseeker_industry_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_industry_preferences
    ADD CONSTRAINT jobseeker_industry_preferences_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_languages jobseeker_languages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_languages
    ADD CONSTRAINT jobseeker_languages_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_location_preferences jobseeker_location_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_location_preferences
    ADD CONSTRAINT jobseeker_location_preferences_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_occupation_preferences jobseeker_occupation_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_occupation_preferences
    ADD CONSTRAINT jobseeker_occupation_preferences_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_profile_save_limits jobseeker_profile_save_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_profile_save_limits
    ADD CONSTRAINT jobseeker_profile_save_limits_pkey PRIMARY KEY (auth_user_id, save_date);


--
-- Name: jobseeker_profiles jobseeker_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_profiles
    ADD CONSTRAINT jobseeker_profiles_pkey PRIMARY KEY (participant_id);


--
-- Name: jobseeker_skills jobseeker_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_skills
    ADD CONSTRAINT jobseeker_skills_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_skills jobseeker_skills_profile_skill_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_skills
    ADD CONSTRAINT jobseeker_skills_profile_skill_key UNIQUE (jobseeker_profile_id, skill_id);


--
-- Name: jobseeker_special_sectors jobseeker_special_sectors_participant_id_sector_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_special_sectors
    ADD CONSTRAINT jobseeker_special_sectors_participant_id_sector_id_key UNIQUE (participant_id, sector_id);


--
-- Name: jobseeker_special_sectors jobseeker_special_sectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_special_sectors
    ADD CONSTRAINT jobseeker_special_sectors_pkey PRIMARY KEY (id);


--
-- Name: jobseeker_work_arrangement_preferences jobseeker_work_arrangement_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_work_arrangement_preferences
    ADD CONSTRAINT jobseeker_work_arrangement_preferences_pkey PRIMARY KEY (id);


--
-- Name: languages languages_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.languages
    ADD CONSTRAINT languages_code_key UNIQUE (code);


--
-- Name: languages languages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.languages
    ADD CONSTRAINT languages_pkey PRIMARY KEY (id);


--
-- Name: medical_referrals medical_referrals_interview_log_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_referrals
    ADD CONSTRAINT medical_referrals_interview_log_id_key UNIQUE (interview_log_id);


--
-- Name: medical_referrals medical_referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_referrals
    ADD CONSTRAINT medical_referrals_pkey PRIMARY KEY (id);


--
-- Name: medical_services medical_services_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_services
    ADD CONSTRAINT medical_services_name_key UNIQUE (name);


--
-- Name: medical_services medical_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_services
    ADD CONSTRAINT medical_services_pkey PRIMARY KEY (id);


--
-- Name: occupation_aliases occupation_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occupation_aliases
    ADD CONSTRAINT occupation_aliases_pkey PRIMARY KEY (id);


--
-- Name: occupation_skills occupation_skills_occupation_skill_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occupation_skills
    ADD CONSTRAINT occupation_skills_occupation_skill_key UNIQUE (occupation_id, skill_id, relationship_type);


--
-- Name: occupation_skills occupation_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occupation_skills
    ADD CONSTRAINT occupation_skills_pkey PRIMARY KEY (id);


--
-- Name: occupations occupations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occupations
    ADD CONSTRAINT occupations_pkey PRIMARY KEY (id);


--
-- Name: participants participants_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: participants participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id);


--
-- Name: participants participants_public_pass_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_public_pass_id_key UNIQUE (public_pass_id);


--
-- Name: participation_vacancies participation_vacancies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participation_vacancies
    ADD CONSTRAINT participation_vacancies_pkey PRIMARY KEY (participation_id, event_vacancy_id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: referral_services referral_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_services
    ADD CONSTRAINT referral_services_pkey PRIMARY KEY (referral_id, service_id);


--
-- Name: registrant_vacancies_legacy registrant_vacancies_new_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrant_vacancies_legacy
    ADD CONSTRAINT registrant_vacancies_new_pkey PRIMARY KEY (registrant_id, event_vacancy_id);


--
-- Name: registrants_legacy registrants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrants_legacy
    ADD CONSTRAINT registrants_pkey PRIMARY KEY (id);


--
-- Name: registrants_legacy registrants_qr_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrants_legacy
    ADD CONSTRAINT registrants_qr_token_key UNIQUE (qr_token);


--
-- Name: registrants_legacy registrants_unique_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrants_legacy
    ADD CONSTRAINT registrants_unique_id_key UNIQUE (unique_id);


--
-- Name: returning_ofw_profiles returning_ofw_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returning_ofw_profiles
    ADD CONSTRAINT returning_ofw_profiles_pkey PRIMARY KEY (id);


--
-- Name: returning_ofw_profiles returning_ofw_profiles_registrant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returning_ofw_profiles
    ADD CONSTRAINT returning_ofw_profiles_registrant_id_key UNIQUE (registrant_id);


--
-- Name: returning_worker_profiles returning_worker_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returning_worker_profiles
    ADD CONSTRAINT returning_worker_profiles_pkey PRIMARY KEY (id);


--
-- Name: returning_worker_profiles returning_worker_profiles_registrant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returning_worker_profiles
    ADD CONSTRAINT returning_worker_profiles_registrant_id_key UNIQUE (registrant_id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: special_worker_sectors special_worker_sectors_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.special_worker_sectors
    ADD CONSTRAINT special_worker_sectors_code_key UNIQUE (code);


--
-- Name: special_worker_sectors special_worker_sectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.special_worker_sectors
    ADD CONSTRAINT special_worker_sectors_pkey PRIMARY KEY (id);


--
-- Name: taxonomy_mappings taxonomy_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_mappings
    ADD CONSTRAINT taxonomy_mappings_pkey PRIMARY KEY (id);


--
-- Name: taxonomy_sources taxonomy_sources_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_sources
    ADD CONSTRAINT taxonomy_sources_code_key UNIQUE (code);


--
-- Name: taxonomy_sources taxonomy_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_sources
    ADD CONSTRAINT taxonomy_sources_pkey PRIMARY KEY (id);


--
-- Name: employment_embeddings unique_entity_embedding; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_embeddings
    ADD CONSTRAINT unique_entity_embedding UNIQUE (entity_type, entity_id, embedding_type, embedding_version);


--
-- Name: vacancies_legacy vacancies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancies_legacy
    ADD CONSTRAINT vacancies_pkey PRIMARY KEY (id);


--
-- Name: vacancy_certification_requirements vacancy_certification_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_certification_requirements
    ADD CONSTRAINT vacancy_certification_requirements_pkey PRIMARY KEY (id);


--
-- Name: vacancy_definitions vacancy_definitions_company_name_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_definitions
    ADD CONSTRAINT vacancy_definitions_company_name_position_key UNIQUE (company_name, "position");


--
-- Name: vacancy_definitions vacancy_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_definitions
    ADD CONSTRAINT vacancy_definitions_pkey PRIMARY KEY (id);


--
-- Name: vacancy_education_requirements vacancy_education_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_education_requirements
    ADD CONSTRAINT vacancy_education_requirements_pkey PRIMARY KEY (id);


--
-- Name: vacancy_experience_requirements vacancy_experience_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_experience_requirements
    ADD CONSTRAINT vacancy_experience_requirements_pkey PRIMARY KEY (id);


--
-- Name: vacancy_history vacancy_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_history
    ADD CONSTRAINT vacancy_history_pkey PRIMARY KEY (id);


--
-- Name: vacancy_language_requirements vacancy_language_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_language_requirements
    ADD CONSTRAINT vacancy_language_requirements_pkey PRIMARY KEY (id);


--
-- Name: vacancy_skills vacancy_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_skills
    ADD CONSTRAINT vacancy_skills_pkey PRIMARY KEY (id);


--
-- Name: vacancy_skills vacancy_skills_vacancy_skill_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_skills
    ADD CONSTRAINT vacancy_skills_vacancy_skill_key UNIQUE (vacancy_definition_id, skill_id);


--
-- Name: work_arrangements work_arrangements_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_arrangements
    ADD CONSTRAINT work_arrangements_code_key UNIQUE (code);


--
-- Name: work_arrangements work_arrangements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_arrangements
    ADD CONSTRAINT work_arrangements_pkey PRIMARY KEY (id);


--
-- Name: work_experiences work_experiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_experiences
    ADD CONSTRAINT work_experiences_pkey PRIMARY KEY (id);


--
-- Name: accred_req_accreditation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accred_req_accreditation_idx ON public.employer_accreditation_requirements USING btree (accreditation_id);


--
-- Name: ai_extraction_runs_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_extraction_runs_entity_idx ON public.ai_extraction_runs USING btree (entity_type, entity_id);


--
-- Name: ai_extraction_runs_input_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_extraction_runs_input_hash_idx ON public.ai_extraction_runs USING btree (input_hash, status);


--
-- Name: ai_extraction_suggestions_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_extraction_suggestions_entity_idx ON public.ai_extraction_suggestions USING btree (entity_type, entity_id);


--
-- Name: ai_extraction_suggestions_review_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_extraction_suggestions_review_idx ON public.ai_extraction_suggestions USING btree (review_status, entity_type);


--
-- Name: ai_extraction_suggestions_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_extraction_suggestions_run_idx ON public.ai_extraction_suggestions USING btree (run_id);


--
-- Name: applications_event_vacancy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_event_vacancy_idx ON public.applications USING btree (event_vacancy_id);


--
-- Name: applications_registrant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_registrant_idx ON public.applications USING btree (registrant_id);


--
-- Name: applications_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_status_idx ON public.applications USING btree (application_status);


--
-- Name: certifications_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX certifications_active_idx ON public.certifications USING btree (is_active) WHERE is_active;


--
-- Name: certifications_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX certifications_normalized_name_unique ON public.certifications USING btree (normalized_name);


--
-- Name: certifications_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX certifications_type_idx ON public.certifications USING btree (certification_type);


--
-- Name: education_levels_rank_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX education_levels_rank_idx ON public.education_levels USING btree (rank);


--
-- Name: employers_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employers_code_unique ON public.employers USING btree (employer_code) WHERE (employer_code IS NOT NULL);


--
-- Name: employers_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employers_name_idx ON public.employers USING btree (company_name);


--
-- Name: employers_registered_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employers_registered_user_unique ON public.employers USING btree (registered_user_id) WHERE (registered_user_id IS NOT NULL);


--
-- Name: employment_outcomes_application_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employment_outcomes_application_idx ON public.employment_outcomes USING btree (application_id);


--
-- Name: employment_outcomes_employer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employment_outcomes_employer_idx ON public.employment_outcomes USING btree (employer_id);


--
-- Name: employment_outcomes_outcome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employment_outcomes_outcome_idx ON public.employment_outcomes USING btree (outcome);


--
-- Name: event_vacancies_definition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_vacancies_definition_idx ON public.event_vacancies USING btree (vacancy_definition_id);


--
-- Name: event_vacancies_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_vacancies_event_idx ON public.event_vacancies USING btree (event_id);


--
-- Name: follow_ups_outcome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_outcome_idx ON public.follow_ups USING btree (employment_outcome_id);


--
-- Name: follow_ups_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_status_idx ON public.follow_ups USING btree (status);


--
-- Name: follow_ups_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_type_idx ON public.follow_ups USING btree (follow_up_type);


--
-- Name: idx_employment_embeddings_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employment_embeddings_entity ON public.employment_embeddings USING btree (entity_type, entity_id);


--
-- Name: idx_employment_embeddings_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employment_embeddings_hash ON public.employment_embeddings USING btree (source_hash);


--
-- Name: idx_employment_embeddings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employment_embeddings_status ON public.employment_embeddings USING btree (status);


--
-- Name: idx_employment_embeddings_type_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employment_embeddings_type_version ON public.employment_embeddings USING btree (embedding_type, embedding_version);


--
-- Name: idx_employment_embeddings_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employment_embeddings_vector ON public.employment_embeddings USING hnsw (embedding extensions.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_jobseeker_cert_certification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_cert_certification ON public.jobseeker_certifications USING btree (certification_id);


--
-- Name: idx_jobseeker_cert_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_cert_profile ON public.jobseeker_certifications USING btree (jobseeker_profile_id);


--
-- Name: idx_jobseeker_education_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_education_level ON public.jobseeker_education USING btree (education_level_id);


--
-- Name: idx_jobseeker_education_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_education_profile ON public.jobseeker_education USING btree (jobseeker_profile_id);


--
-- Name: idx_jobseeker_emptype_pref_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_emptype_pref_profile ON public.jobseeker_employment_type_preferences USING btree (jobseeker_profile_id);


--
-- Name: idx_jobseeker_emptype_pref_profile_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_jobseeker_emptype_pref_profile_type ON public.jobseeker_employment_type_preferences USING btree (jobseeker_profile_id, employment_type_id);


--
-- Name: idx_jobseeker_ind_pref_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_ind_pref_profile ON public.jobseeker_industry_preferences USING btree (jobseeker_profile_id);


--
-- Name: idx_jobseeker_ind_pref_profile_ind; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_jobseeker_ind_pref_profile_ind ON public.jobseeker_industry_preferences USING btree (jobseeker_profile_id, industry_id);


--
-- Name: idx_jobseeker_lang_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_lang_profile ON public.jobseeker_languages USING btree (jobseeker_profile_id);


--
-- Name: idx_jobseeker_lang_profile_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_jobseeker_lang_profile_lang ON public.jobseeker_languages USING btree (jobseeker_profile_id, language_id);


--
-- Name: idx_jobseeker_loc_pref_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_loc_pref_profile ON public.jobseeker_location_preferences USING btree (jobseeker_profile_id);


--
-- Name: idx_jobseeker_occ_pref_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_occ_pref_profile ON public.jobseeker_occupation_preferences USING btree (jobseeker_profile_id);


--
-- Name: idx_jobseeker_occ_pref_profile_occ; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_jobseeker_occ_pref_profile_occ ON public.jobseeker_occupation_preferences USING btree (jobseeker_profile_id, occupation_id);


--
-- Name: idx_jobseeker_wa_pref_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobseeker_wa_pref_profile ON public.jobseeker_work_arrangement_preferences USING btree (jobseeker_profile_id);


--
-- Name: idx_jobseeker_wa_pref_profile_wa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_jobseeker_wa_pref_profile_wa ON public.jobseeker_work_arrangement_preferences USING btree (jobseeker_profile_id, work_arrangement_id);


--
-- Name: idx_vac_cert_req_vacancy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vac_cert_req_vacancy ON public.vacancy_certification_requirements USING btree (vacancy_definition_id);


--
-- Name: idx_vac_edu_req_vacancy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vac_edu_req_vacancy ON public.vacancy_education_requirements USING btree (vacancy_definition_id);


--
-- Name: idx_vac_exp_req_vacancy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vac_exp_req_vacancy ON public.vacancy_experience_requirements USING btree (vacancy_definition_id);


--
-- Name: idx_vac_lang_req_vacancy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vac_lang_req_vacancy ON public.vacancy_language_requirements USING btree (vacancy_definition_id);


--
-- Name: idx_vac_lang_req_vacancy_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_vac_lang_req_vacancy_lang ON public.vacancy_language_requirements USING btree (vacancy_definition_id, language_id);


--
-- Name: idx_vacancy_def_employment_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vacancy_def_employment_type ON public.vacancy_definitions USING btree (employment_type_id);


--
-- Name: idx_vacancy_def_industry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vacancy_def_industry ON public.vacancy_definitions USING btree (industry_id);


--
-- Name: idx_vacancy_def_occupation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vacancy_def_occupation ON public.vacancy_definitions USING btree (occupation_id);


--
-- Name: industries_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX industries_active_idx ON public.industries USING btree (is_active) WHERE is_active;


--
-- Name: industries_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX industries_normalized_name_unique ON public.industries USING btree (normalized_name);


--
-- Name: industries_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX industries_parent_idx ON public.industries USING btree (parent_id);


--
-- Name: interview_logs_employer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interview_logs_employer_idx ON public.interview_logs USING btree (employer_id);


--
-- Name: interview_logs_unique_result; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX interview_logs_unique_result ON public.interview_logs USING btree (registrant_id, event_id, interview_status, employer_id, vacancy_definition_id) WHERE ((employer_id IS NOT NULL) AND (vacancy_definition_id IS NOT NULL));


--
-- Name: interview_logs_vacancy_definition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interview_logs_vacancy_definition_idx ON public.interview_logs USING btree (vacancy_definition_id);


--
-- Name: interviews_application_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interviews_application_idx ON public.interview_logs USING btree (application_id);


--
-- Name: interviews_registrant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interviews_registrant_idx ON public.interview_logs USING btree (registrant_id);


--
-- Name: jobseeker_skills_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobseeker_skills_profile_idx ON public.jobseeker_skills USING btree (jobseeker_profile_id);


--
-- Name: jobseeker_skills_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobseeker_skills_skill_idx ON public.jobseeker_skills USING btree (skill_id);


--
-- Name: jobseeker_skills_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobseeker_skills_source_idx ON public.jobseeker_skills USING btree (source);


--
-- Name: jobseeker_special_sectors_participant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobseeker_special_sectors_participant_idx ON public.jobseeker_special_sectors USING btree (participant_id);


--
-- Name: occupation_aliases_alias_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX occupation_aliases_alias_idx ON public.occupation_aliases USING btree (normalized_alias);


--
-- Name: occupation_aliases_normalized_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX occupation_aliases_normalized_unique ON public.occupation_aliases USING btree (occupation_id, normalized_alias);


--
-- Name: occupation_aliases_occupation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX occupation_aliases_occupation_idx ON public.occupation_aliases USING btree (occupation_id);


--
-- Name: occupation_skills_occupation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX occupation_skills_occupation_idx ON public.occupation_skills USING btree (occupation_id);


--
-- Name: occupation_skills_relationship_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX occupation_skills_relationship_idx ON public.occupation_skills USING btree (relationship_type);


--
-- Name: occupation_skills_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX occupation_skills_skill_idx ON public.occupation_skills USING btree (skill_id);


--
-- Name: occupations_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX occupations_active_idx ON public.occupations USING btree (is_active) WHERE is_active;


--
-- Name: occupations_canonical_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX occupations_canonical_name_idx ON public.occupations USING btree (canonical_name);


--
-- Name: occupations_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX occupations_normalized_name_unique ON public.occupations USING btree (normalized_name);


--
-- Name: occupations_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX occupations_parent_idx ON public.occupations USING btree (parent_id);


--
-- Name: profiles_jurisdiction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_jurisdiction_idx ON public.profiles USING btree (jurisdiction);


--
-- Name: referral_services_referral_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_services_referral_idx ON public.referral_services USING btree (referral_id);


--
-- Name: referrals_registrant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_registrant_idx ON public.medical_referrals USING btree (registrant_id);


--
-- Name: registrants_checkin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registrants_checkin_idx ON public.registrants_legacy USING btree (check_in_status);


--
-- Name: registrants_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registrants_event_idx ON public.registrants_legacy USING btree (event_id);


--
-- Name: registrants_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registrants_name_idx ON public.registrants_legacy USING btree (last_name, first_name);


--
-- Name: returning_ofw_profiles_registrant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX returning_ofw_profiles_registrant_idx ON public.returning_ofw_profiles USING btree (registrant_id);


--
-- Name: returning_worker_profiles_registrant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX returning_worker_profiles_registrant_idx ON public.returning_worker_profiles USING btree (registrant_id);


--
-- Name: skills_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_active_idx ON public.skills USING btree (is_active) WHERE is_active;


--
-- Name: skills_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX skills_normalized_name_unique ON public.skills USING btree (normalized_name);


--
-- Name: skills_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_parent_idx ON public.skills USING btree (parent_id);


--
-- Name: skills_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_type_idx ON public.skills USING btree (skill_type);


--
-- Name: taxonomy_mappings_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_mappings_entity_idx ON public.taxonomy_mappings USING btree (entity_type, entity_id);


--
-- Name: taxonomy_mappings_entity_source_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX taxonomy_mappings_entity_source_code_unique ON public.taxonomy_mappings USING btree (entity_type, entity_id, taxonomy_source_id, external_code) WHERE (external_code IS NOT NULL);


--
-- Name: taxonomy_mappings_external_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_mappings_external_idx ON public.taxonomy_mappings USING btree (entity_type, external_code);


--
-- Name: taxonomy_mappings_is_primary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_mappings_is_primary_idx ON public.taxonomy_mappings USING btree (is_primary) WHERE is_primary;


--
-- Name: taxonomy_mappings_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_mappings_source_idx ON public.taxonomy_mappings USING btree (taxonomy_source_id);


--
-- Name: taxonomy_sources_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_sources_active_idx ON public.taxonomy_sources USING btree (is_active) WHERE is_active;


--
-- Name: taxonomy_sources_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_sources_code_idx ON public.taxonomy_sources USING btree (code);


--
-- Name: vacancies_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vacancies_event_idx ON public.vacancies_legacy USING btree (event_id);


--
-- Name: vacancy_definitions_employer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vacancy_definitions_employer_idx ON public.vacancy_definitions USING btree (employer_id);


--
-- Name: vacancy_history_vacancy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vacancy_history_vacancy_idx ON public.vacancy_history USING btree (vacancy_definition_id, created_at DESC);


--
-- Name: vacancy_skills_importance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vacancy_skills_importance_idx ON public.vacancy_skills USING btree (importance);


--
-- Name: vacancy_skills_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vacancy_skills_skill_idx ON public.vacancy_skills USING btree (skill_id);


--
-- Name: vacancy_skills_vacancy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vacancy_skills_vacancy_idx ON public.vacancy_skills USING btree (vacancy_definition_id);


--
-- Name: work_experiences_participant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_experiences_participant_idx ON public.work_experiences USING btree (participant_id);


--
-- Name: applications applications_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER applications_updated BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: certifications certifications_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER certifications_updated BEFORE UPDATE ON public.certifications FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: employers employers_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER employers_updated BEFORE UPDATE ON public.employers FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: employment_embeddings employment_embeddings_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER employment_embeddings_updated BEFORE UPDATE ON public.employment_embeddings FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: employment_outcomes employment_outcomes_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER employment_outcomes_updated BEFORE UPDATE ON public.employment_outcomes FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: event_participations event_participations_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER event_participations_updated BEFORE UPDATE ON public.event_participations FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: event_vacancies event_vacancies_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER event_vacancies_updated BEFORE UPDATE ON public.event_vacancies FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: events events_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: follow_ups follow_ups_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER follow_ups_updated BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: industries industries_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER industries_updated BEFORE UPDATE ON public.industries FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: interview_logs interviews_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER interviews_updated BEFORE UPDATE ON public.interview_logs FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_certifications jobseeker_certifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_certifications_updated_at BEFORE UPDATE ON public.jobseeker_certifications FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_education jobseeker_education_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_education_updated_at BEFORE UPDATE ON public.jobseeker_education FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_employment_type_preferences jobseeker_employment_type_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_employment_type_preferences_updated_at BEFORE UPDATE ON public.jobseeker_employment_type_preferences FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_industry_preferences jobseeker_industry_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_industry_preferences_updated_at BEFORE UPDATE ON public.jobseeker_industry_preferences FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_languages jobseeker_languages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_languages_updated_at BEFORE UPDATE ON public.jobseeker_languages FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_location_preferences jobseeker_location_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_location_preferences_updated_at BEFORE UPDATE ON public.jobseeker_location_preferences FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_occupation_preferences jobseeker_occupation_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_occupation_preferences_updated_at BEFORE UPDATE ON public.jobseeker_occupation_preferences FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_profiles jobseeker_profile_daily_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_profile_daily_limit AFTER INSERT OR UPDATE ON public.jobseeker_profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_jobseeker_profile_daily_limit();


--
-- Name: jobseeker_profiles jobseeker_profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_profiles_updated BEFORE UPDATE ON public.jobseeker_profiles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_skills jobseeker_skills_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_skills_updated BEFORE UPDATE ON public.jobseeker_skills FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: jobseeker_work_arrangement_preferences jobseeker_work_arrangement_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobseeker_work_arrangement_preferences_updated_at BEFORE UPDATE ON public.jobseeker_work_arrangement_preferences FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: medical_services medical_services_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER medical_services_updated BEFORE UPDATE ON public.medical_services FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: occupations occupations_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER occupations_updated BEFORE UPDATE ON public.occupations FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: participants participants_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER participants_updated BEFORE UPDATE ON public.participants FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: profiles profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: medical_referrals referrals_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER referrals_updated BEFORE UPDATE ON public.medical_referrals FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: registrants_legacy registrants_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER registrants_updated BEFORE UPDATE ON public.registrants_legacy FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: returning_ofw_profiles returning_ofw_profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER returning_ofw_profiles_updated BEFORE UPDATE ON public.returning_ofw_profiles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: returning_worker_profiles returning_worker_profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER returning_worker_profiles_updated BEFORE UPDATE ON public.returning_worker_profiles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: ai_extraction_runs set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ai_extraction_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ai_extraction_runs();


--
-- Name: ai_extraction_suggestions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ai_extraction_suggestions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ai_extraction_suggestions();


--
-- Name: skills skills_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER skills_updated BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: taxonomy_mappings taxonomy_mappings_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER taxonomy_mappings_updated BEFORE UPDATE ON public.taxonomy_mappings FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: taxonomy_sources taxonomy_sources_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER taxonomy_sources_updated BEFORE UPDATE ON public.taxonomy_sources FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: employers trg_create_accreditation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_create_accreditation AFTER INSERT OR UPDATE OF registration_status ON public.employers FOR EACH ROW EXECUTE FUNCTION public.create_pending_accreditation();


--
-- Name: employer_accreditation trg_seed_accreditation_requirements; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_accreditation_requirements AFTER INSERT ON public.employer_accreditation FOR EACH ROW EXECUTE FUNCTION public.seed_accreditation_requirements();


--
-- Name: vacancy_definitions trg_vacancy_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vacancy_history AFTER UPDATE ON public.vacancy_definitions FOR EACH ROW EXECUTE FUNCTION public.record_vacancy_history();


--
-- Name: vacancies_legacy vacancies_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vacancies_updated BEFORE UPDATE ON public.vacancies_legacy FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: vacancy_certification_requirements vacancy_certification_requirements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vacancy_certification_requirements_updated_at BEFORE UPDATE ON public.vacancy_certification_requirements FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: vacancy_definitions vacancy_definitions_auto_link; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vacancy_definitions_auto_link BEFORE INSERT ON public.vacancy_definitions FOR EACH ROW EXECUTE FUNCTION app.auto_link_employer();


--
-- Name: vacancy_definitions vacancy_definitions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vacancy_definitions_updated BEFORE UPDATE ON public.vacancy_definitions FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: vacancy_education_requirements vacancy_education_requirements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vacancy_education_requirements_updated_at BEFORE UPDATE ON public.vacancy_education_requirements FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: vacancy_experience_requirements vacancy_experience_requirements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vacancy_experience_requirements_updated_at BEFORE UPDATE ON public.vacancy_experience_requirements FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: vacancy_language_requirements vacancy_language_requirements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vacancy_language_requirements_updated_at BEFORE UPDATE ON public.vacancy_language_requirements FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: work_experiences work_experiences_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER work_experiences_updated BEFORE UPDATE ON public.work_experiences FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: ai_extraction_suggestions ai_extraction_suggestions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_extraction_suggestions
    ADD CONSTRAINT ai_extraction_suggestions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ai_extraction_runs(id) ON DELETE CASCADE;


--
-- Name: applications applications_event_vacancy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_event_vacancy_id_fkey FOREIGN KEY (event_vacancy_id) REFERENCES public.event_vacancies(id) ON DELETE CASCADE;


--
-- Name: applications applications_registrant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_registrant_id_fkey FOREIGN KEY (registrant_id) REFERENCES public.event_participations(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: employer_accreditation employer_accreditation_employer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_accreditation
    ADD CONSTRAINT employer_accreditation_employer_id_fkey FOREIGN KEY (employer_id) REFERENCES public.employers(id) ON DELETE CASCADE;


--
-- Name: employer_accreditation_requirements employer_accreditation_requirements_accreditation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_accreditation_requirements
    ADD CONSTRAINT employer_accreditation_requirements_accreditation_id_fkey FOREIGN KEY (accreditation_id) REFERENCES public.employer_accreditation(id) ON DELETE CASCADE;


--
-- Name: employer_accreditation_requirements employer_accreditation_requirements_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_accreditation_requirements
    ADD CONSTRAINT employer_accreditation_requirements_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: employer_event_participations employer_event_participations_checked_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_event_participations
    ADD CONSTRAINT employer_event_participations_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES public.profiles(id);


--
-- Name: employer_event_participations employer_event_participations_employer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_event_participations
    ADD CONSTRAINT employer_event_participations_employer_id_fkey FOREIGN KEY (employer_id) REFERENCES public.employers(id) ON DELETE CASCADE;


--
-- Name: employer_event_participations employer_event_participations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_event_participations
    ADD CONSTRAINT employer_event_participations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: employers employers_registered_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employers
    ADD CONSTRAINT employers_registered_user_id_fkey FOREIGN KEY (registered_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: employment_outcomes employment_outcomes_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_outcomes
    ADD CONSTRAINT employment_outcomes_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: employment_outcomes employment_outcomes_employer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_outcomes
    ADD CONSTRAINT employment_outcomes_employer_id_fkey FOREIGN KEY (employer_id) REFERENCES public.employers(id) ON DELETE SET NULL;


--
-- Name: employment_outcomes employment_outcomes_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_outcomes
    ADD CONSTRAINT employment_outcomes_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_assignments event_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_assignments
    ADD CONSTRAINT event_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);


--
-- Name: event_assignments event_assignments_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_assignments
    ADD CONSTRAINT event_assignments_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_assignments event_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_assignments
    ADD CONSTRAINT event_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_participations event_participations_check_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participations
    ADD CONSTRAINT event_participations_check_in_by_fkey FOREIGN KEY (check_in_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_participations event_participations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participations
    ADD CONSTRAINT event_participations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: event_participations event_participations_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participations
    ADD CONSTRAINT event_participations_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;


--
-- Name: event_participations event_participations_registered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participations
    ADD CONSTRAINT event_participations_registered_by_fkey FOREIGN KEY (registered_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_vacancies event_vacancies_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_vacancies
    ADD CONSTRAINT event_vacancies_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_vacancies event_vacancies_vacancy_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_vacancies
    ADD CONSTRAINT event_vacancies_vacancy_definition_id_fkey FOREIGN KEY (vacancy_definition_id) REFERENCES public.vacancy_definitions(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_employment_outcome_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_employment_outcome_id_fkey FOREIGN KEY (employment_outcome_id) REFERENCES public.employment_outcomes(id) ON DELETE CASCADE;


--
-- Name: industries industries_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industries
    ADD CONSTRAINT industries_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.industries(id) ON DELETE SET NULL;


--
-- Name: interview_logs interview_logs_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_logs
    ADD CONSTRAINT interview_logs_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE SET NULL;


--
-- Name: interview_logs interview_logs_employer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_logs
    ADD CONSTRAINT interview_logs_employer_id_fkey FOREIGN KEY (employer_id) REFERENCES public.employers(id) ON DELETE SET NULL;


--
-- Name: interview_logs interview_logs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_logs
    ADD CONSTRAINT interview_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: interview_logs interview_logs_interviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_logs
    ADD CONSTRAINT interview_logs_interviewer_id_fkey FOREIGN KEY (interviewer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: interview_logs interview_logs_registrant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_logs
    ADD CONSTRAINT interview_logs_registrant_id_fkey FOREIGN KEY (registrant_id) REFERENCES public.event_participations(id) ON DELETE CASCADE;


--
-- Name: interview_logs interview_logs_vacancy_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_logs
    ADD CONSTRAINT interview_logs_vacancy_definition_id_fkey FOREIGN KEY (vacancy_definition_id) REFERENCES public.vacancy_definitions(id) ON DELETE SET NULL;


--
-- Name: jobseeker_certifications jobseeker_cert_certification_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_certifications
    ADD CONSTRAINT jobseeker_cert_certification_fk FOREIGN KEY (certification_id) REFERENCES public.certifications(id);


--
-- Name: jobseeker_certifications jobseeker_cert_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_certifications
    ADD CONSTRAINT jobseeker_cert_profile_fk FOREIGN KEY (jobseeker_profile_id) REFERENCES public.jobseeker_profiles(participant_id) ON DELETE CASCADE;


--
-- Name: jobseeker_education jobseeker_education_level_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_education
    ADD CONSTRAINT jobseeker_education_level_fk FOREIGN KEY (education_level_id) REFERENCES public.education_levels(id);


--
-- Name: jobseeker_education jobseeker_education_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_education
    ADD CONSTRAINT jobseeker_education_profile_fk FOREIGN KEY (jobseeker_profile_id) REFERENCES public.jobseeker_profiles(participant_id) ON DELETE CASCADE;


--
-- Name: jobseeker_employment_type_preferences jobseeker_emptype_pref_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_employment_type_preferences
    ADD CONSTRAINT jobseeker_emptype_pref_profile_fk FOREIGN KEY (jobseeker_profile_id) REFERENCES public.jobseeker_profiles(participant_id) ON DELETE CASCADE;


--
-- Name: jobseeker_employment_type_preferences jobseeker_emptype_pref_type_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_employment_type_preferences
    ADD CONSTRAINT jobseeker_emptype_pref_type_fk FOREIGN KEY (employment_type_id) REFERENCES public.employment_types(id);


--
-- Name: jobseeker_industry_preferences jobseeker_ind_pref_industry_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_industry_preferences
    ADD CONSTRAINT jobseeker_ind_pref_industry_fk FOREIGN KEY (industry_id) REFERENCES public.industries(id);


--
-- Name: jobseeker_industry_preferences jobseeker_ind_pref_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_industry_preferences
    ADD CONSTRAINT jobseeker_ind_pref_profile_fk FOREIGN KEY (jobseeker_profile_id) REFERENCES public.jobseeker_profiles(participant_id) ON DELETE CASCADE;


--
-- Name: jobseeker_languages jobseeker_lang_language_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_languages
    ADD CONSTRAINT jobseeker_lang_language_fk FOREIGN KEY (language_id) REFERENCES public.languages(id);


--
-- Name: jobseeker_languages jobseeker_lang_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_languages
    ADD CONSTRAINT jobseeker_lang_profile_fk FOREIGN KEY (jobseeker_profile_id) REFERENCES public.jobseeker_profiles(participant_id) ON DELETE CASCADE;


--
-- Name: jobseeker_location_preferences jobseeker_loc_pref_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_location_preferences
    ADD CONSTRAINT jobseeker_loc_pref_profile_fk FOREIGN KEY (jobseeker_profile_id) REFERENCES public.jobseeker_profiles(participant_id) ON DELETE CASCADE;


--
-- Name: jobseeker_occupation_preferences jobseeker_occ_pref_occupation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_occupation_preferences
    ADD CONSTRAINT jobseeker_occ_pref_occupation_fk FOREIGN KEY (occupation_id) REFERENCES public.occupations(id);


--
-- Name: jobseeker_occupation_preferences jobseeker_occ_pref_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_occupation_preferences
    ADD CONSTRAINT jobseeker_occ_pref_profile_fk FOREIGN KEY (jobseeker_profile_id) REFERENCES public.jobseeker_profiles(participant_id) ON DELETE CASCADE;


--
-- Name: jobseeker_profiles jobseeker_profiles_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_profiles
    ADD CONSTRAINT jobseeker_profiles_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;


--
-- Name: jobseeker_skills jobseeker_skills_jobseeker_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_skills
    ADD CONSTRAINT jobseeker_skills_jobseeker_profile_id_fkey FOREIGN KEY (jobseeker_profile_id) REFERENCES public.jobseeker_profiles(participant_id) ON DELETE CASCADE;


--
-- Name: jobseeker_skills jobseeker_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_skills
    ADD CONSTRAINT jobseeker_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: jobseeker_special_sectors jobseeker_special_sectors_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_special_sectors
    ADD CONSTRAINT jobseeker_special_sectors_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;


--
-- Name: jobseeker_special_sectors jobseeker_special_sectors_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_special_sectors
    ADD CONSTRAINT jobseeker_special_sectors_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES public.special_worker_sectors(id) ON DELETE CASCADE;


--
-- Name: jobseeker_work_arrangement_preferences jobseeker_wa_pref_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_work_arrangement_preferences
    ADD CONSTRAINT jobseeker_wa_pref_profile_fk FOREIGN KEY (jobseeker_profile_id) REFERENCES public.jobseeker_profiles(participant_id) ON DELETE CASCADE;


--
-- Name: jobseeker_work_arrangement_preferences jobseeker_wa_pref_wa_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobseeker_work_arrangement_preferences
    ADD CONSTRAINT jobseeker_wa_pref_wa_fk FOREIGN KEY (work_arrangement_id) REFERENCES public.work_arrangements(id);


--
-- Name: medical_referrals medical_referrals_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_referrals
    ADD CONSTRAINT medical_referrals_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: medical_referrals medical_referrals_interview_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_referrals
    ADD CONSTRAINT medical_referrals_interview_log_id_fkey FOREIGN KEY (interview_log_id) REFERENCES public.interview_logs(id) ON DELETE CASCADE;


--
-- Name: medical_referrals medical_referrals_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_referrals
    ADD CONSTRAINT medical_referrals_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: medical_referrals medical_referrals_registrant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_referrals
    ADD CONSTRAINT medical_referrals_registrant_id_fkey FOREIGN KEY (registrant_id) REFERENCES public.event_participations(id) ON DELETE CASCADE;


--
-- Name: occupation_aliases occupation_aliases_occupation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occupation_aliases
    ADD CONSTRAINT occupation_aliases_occupation_id_fkey FOREIGN KEY (occupation_id) REFERENCES public.occupations(id) ON DELETE CASCADE;


--
-- Name: occupation_skills occupation_skills_occupation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occupation_skills
    ADD CONSTRAINT occupation_skills_occupation_id_fkey FOREIGN KEY (occupation_id) REFERENCES public.occupations(id) ON DELETE CASCADE;


--
-- Name: occupation_skills occupation_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occupation_skills
    ADD CONSTRAINT occupation_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: occupations occupations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occupations
    ADD CONSTRAINT occupations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.occupations(id) ON DELETE SET NULL;


--
-- Name: participants participants_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: participation_vacancies participation_vacancies_event_vacancy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participation_vacancies
    ADD CONSTRAINT participation_vacancies_event_vacancy_id_fkey FOREIGN KEY (event_vacancy_id) REFERENCES public.event_vacancies(id) ON DELETE CASCADE;


--
-- Name: participation_vacancies participation_vacancies_participation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participation_vacancies
    ADD CONSTRAINT participation_vacancies_participation_id_fkey FOREIGN KEY (participation_id) REFERENCES public.event_participations(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: referral_services referral_services_referral_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_services
    ADD CONSTRAINT referral_services_referral_id_fkey FOREIGN KEY (referral_id) REFERENCES public.medical_referrals(id) ON DELETE CASCADE;


--
-- Name: referral_services referral_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_services
    ADD CONSTRAINT referral_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.medical_services(id) ON DELETE CASCADE;


--
-- Name: registrant_vacancies_legacy registrant_vacancies_new_event_vacancy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrant_vacancies_legacy
    ADD CONSTRAINT registrant_vacancies_new_event_vacancy_id_fkey FOREIGN KEY (event_vacancy_id) REFERENCES public.event_vacancies(id) ON DELETE CASCADE;


--
-- Name: registrant_vacancies_legacy registrant_vacancies_new_registrant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrant_vacancies_legacy
    ADD CONSTRAINT registrant_vacancies_new_registrant_id_fkey FOREIGN KEY (registrant_id) REFERENCES public.registrants_legacy(id) ON DELETE CASCADE;


--
-- Name: registrants_legacy registrants_check_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrants_legacy
    ADD CONSTRAINT registrants_check_in_by_fkey FOREIGN KEY (check_in_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: registrants_legacy registrants_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrants_legacy
    ADD CONSTRAINT registrants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: registrants_legacy registrants_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrants_legacy
    ADD CONSTRAINT registrants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: returning_ofw_profiles returning_ofw_profiles_registrant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returning_ofw_profiles
    ADD CONSTRAINT returning_ofw_profiles_registrant_id_fkey FOREIGN KEY (registrant_id) REFERENCES public.event_participations(id) ON DELETE CASCADE;


--
-- Name: returning_worker_profiles returning_worker_profiles_registrant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returning_worker_profiles
    ADD CONSTRAINT returning_worker_profiles_registrant_id_fkey FOREIGN KEY (registrant_id) REFERENCES public.event_participations(id) ON DELETE CASCADE;


--
-- Name: skills skills_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.skills(id) ON DELETE SET NULL;


--
-- Name: taxonomy_mappings taxonomy_mappings_taxonomy_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_mappings
    ADD CONSTRAINT taxonomy_mappings_taxonomy_source_id_fkey FOREIGN KEY (taxonomy_source_id) REFERENCES public.taxonomy_sources(id) ON DELETE CASCADE;


--
-- Name: vacancy_certification_requirements vac_cert_req_certification_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_certification_requirements
    ADD CONSTRAINT vac_cert_req_certification_fk FOREIGN KEY (certification_id) REFERENCES public.certifications(id);


--
-- Name: vacancy_certification_requirements vac_cert_req_vacancy_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_certification_requirements
    ADD CONSTRAINT vac_cert_req_vacancy_fk FOREIGN KEY (vacancy_definition_id) REFERENCES public.vacancy_definitions(id) ON DELETE CASCADE;


--
-- Name: vacancy_education_requirements vac_edu_req_level_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_education_requirements
    ADD CONSTRAINT vac_edu_req_level_fk FOREIGN KEY (education_level_id) REFERENCES public.education_levels(id);


--
-- Name: vacancy_education_requirements vac_edu_req_vacancy_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_education_requirements
    ADD CONSTRAINT vac_edu_req_vacancy_fk FOREIGN KEY (vacancy_definition_id) REFERENCES public.vacancy_definitions(id) ON DELETE CASCADE;


--
-- Name: vacancy_experience_requirements vac_exp_req_industry_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_experience_requirements
    ADD CONSTRAINT vac_exp_req_industry_fk FOREIGN KEY (industry_id) REFERENCES public.industries(id);


--
-- Name: vacancy_experience_requirements vac_exp_req_occupation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_experience_requirements
    ADD CONSTRAINT vac_exp_req_occupation_fk FOREIGN KEY (occupation_id) REFERENCES public.occupations(id);


--
-- Name: vacancy_experience_requirements vac_exp_req_vacancy_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_experience_requirements
    ADD CONSTRAINT vac_exp_req_vacancy_fk FOREIGN KEY (vacancy_definition_id) REFERENCES public.vacancy_definitions(id) ON DELETE CASCADE;


--
-- Name: vacancy_language_requirements vac_lang_req_language_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_language_requirements
    ADD CONSTRAINT vac_lang_req_language_fk FOREIGN KEY (language_id) REFERENCES public.languages(id);


--
-- Name: vacancy_language_requirements vac_lang_req_vacancy_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_language_requirements
    ADD CONSTRAINT vac_lang_req_vacancy_fk FOREIGN KEY (vacancy_definition_id) REFERENCES public.vacancy_definitions(id) ON DELETE CASCADE;


--
-- Name: vacancies_legacy vacancies_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancies_legacy
    ADD CONSTRAINT vacancies_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: vacancy_definitions vacancy_def_employment_type_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_definitions
    ADD CONSTRAINT vacancy_def_employment_type_fk FOREIGN KEY (employment_type_id) REFERENCES public.employment_types(id);


--
-- Name: vacancy_definitions vacancy_def_industry_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_definitions
    ADD CONSTRAINT vacancy_def_industry_fk FOREIGN KEY (industry_id) REFERENCES public.industries(id);


--
-- Name: vacancy_definitions vacancy_def_occupation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_definitions
    ADD CONSTRAINT vacancy_def_occupation_fk FOREIGN KEY (occupation_id) REFERENCES public.occupations(id);


--
-- Name: vacancy_definitions vacancy_def_work_arrangement_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_definitions
    ADD CONSTRAINT vacancy_def_work_arrangement_fk FOREIGN KEY (work_arrangement_id) REFERENCES public.work_arrangements(id);


--
-- Name: vacancy_definitions vacancy_definitions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_definitions
    ADD CONSTRAINT vacancy_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: vacancy_definitions vacancy_definitions_employer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_definitions
    ADD CONSTRAINT vacancy_definitions_employer_id_fkey FOREIGN KEY (employer_id) REFERENCES public.employers(id) ON DELETE SET NULL;


--
-- Name: vacancy_history vacancy_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_history
    ADD CONSTRAINT vacancy_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id);


--
-- Name: vacancy_history vacancy_history_vacancy_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_history
    ADD CONSTRAINT vacancy_history_vacancy_definition_id_fkey FOREIGN KEY (vacancy_definition_id) REFERENCES public.vacancy_definitions(id) ON DELETE CASCADE;


--
-- Name: vacancy_skills vacancy_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_skills
    ADD CONSTRAINT vacancy_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: vacancy_skills vacancy_skills_vacancy_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_skills
    ADD CONSTRAINT vacancy_skills_vacancy_definition_id_fkey FOREIGN KEY (vacancy_definition_id) REFERENCES public.vacancy_definitions(id) ON DELETE CASCADE;


--
-- Name: work_experiences work_experiences_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_experiences
    ADD CONSTRAINT work_experiences_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;


--
-- Name: certifications Admins manage certifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage certifications" ON public.certifications TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: education_levels Admins manage education levels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage education levels" ON public.education_levels TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: employer_event_participations Admins manage employer participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage employer participations" ON public.employer_event_participations TO authenticated USING ((app.current_user_role() = 'admin'::public.user_role)) WITH CHECK ((app.current_user_role() = 'admin'::public.user_role));


--
-- Name: employers Admins manage employers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage employers" ON public.employers TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: employment_outcomes Admins manage employment outcomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage employment outcomes" ON public.employment_outcomes TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: employment_types Admins manage employment types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage employment types" ON public.employment_types TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: event_assignments Admins manage event assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage event assignments" ON public.event_assignments TO authenticated USING ((app.current_user_role() = 'admin'::public.user_role)) WITH CHECK ((app.current_user_role() = 'admin'::public.user_role));


--
-- Name: event_vacancies Admins manage event vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage event vacancies" ON public.event_vacancies TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: events Admins manage events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage events" ON public.events TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: ai_extraction_runs Admins manage extraction runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage extraction runs" ON public.ai_extraction_runs TO authenticated USING ((app.current_user_role() = 'admin'::public.user_role));


--
-- Name: ai_extraction_suggestions Admins manage extraction suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage extraction suggestions" ON public.ai_extraction_suggestions TO authenticated USING ((app.current_user_role() = 'admin'::public.user_role));


--
-- Name: follow_ups Admins manage follow-ups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage follow-ups" ON public.follow_ups TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: industries Admins manage industries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage industries" ON public.industries TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: interview_logs Admins manage interviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage interviews" ON public.interview_logs TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_certifications Admins manage jobseeker certifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage jobseeker certifications" ON public.jobseeker_certifications TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_education Admins manage jobseeker education; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage jobseeker education" ON public.jobseeker_education TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_employment_type_preferences Admins manage jobseeker employment type prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage jobseeker employment type prefs" ON public.jobseeker_employment_type_preferences TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_industry_preferences Admins manage jobseeker industry prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage jobseeker industry prefs" ON public.jobseeker_industry_preferences TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_languages Admins manage jobseeker languages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage jobseeker languages" ON public.jobseeker_languages TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_location_preferences Admins manage jobseeker location prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage jobseeker location prefs" ON public.jobseeker_location_preferences TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_occupation_preferences Admins manage jobseeker occupation prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage jobseeker occupation prefs" ON public.jobseeker_occupation_preferences TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_skills Admins manage jobseeker skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage jobseeker skills" ON public.jobseeker_skills TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_work_arrangement_preferences Admins manage jobseeker work arrangement prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage jobseeker work arrangement prefs" ON public.jobseeker_work_arrangement_preferences TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: languages Admins manage languages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage languages" ON public.languages TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: medical_services Admins manage medical services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage medical services" ON public.medical_services TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: occupation_aliases Admins manage occupation aliases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage occupation aliases" ON public.occupation_aliases TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: occupation_skills Admins manage occupation skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage occupation skills" ON public.occupation_skills TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: occupations Admins manage occupations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage occupations" ON public.occupations TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: participants Admins manage participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage participants" ON public.participants TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: participation_vacancies Admins manage participation vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage participation vacancies" ON public.participation_vacancies TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: event_participations Admins manage participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage participations" ON public.event_participations TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: jobseeker_profiles Admins manage profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage profiles" ON public.jobseeker_profiles TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: profiles Admins manage profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage profiles" ON public.profiles TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: referral_services Admins manage referral services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage referral services" ON public.referral_services TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: medical_referrals Admins manage referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage referrals" ON public.medical_referrals TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: registrants_legacy Admins manage registrants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage registrants" ON public.registrants_legacy TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: returning_ofw_profiles Admins manage returning_ofw profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage returning_ofw profiles" ON public.returning_ofw_profiles TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: returning_worker_profiles Admins manage returning_worker profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage returning_worker profiles" ON public.returning_worker_profiles TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: skills Admins manage skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage skills" ON public.skills TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: taxonomy_mappings Admins manage taxonomy mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage taxonomy mappings" ON public.taxonomy_mappings TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: taxonomy_sources Admins manage taxonomy sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage taxonomy sources" ON public.taxonomy_sources TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: vacancies_legacy Admins manage vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage vacancies" ON public.vacancies_legacy TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: vacancy_certification_requirements Admins manage vacancy certification reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage vacancy certification reqs" ON public.vacancy_certification_requirements TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: vacancy_definitions Admins manage vacancy definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage vacancy definitions" ON public.vacancy_definitions TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: vacancy_education_requirements Admins manage vacancy education reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage vacancy education reqs" ON public.vacancy_education_requirements TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: vacancy_experience_requirements Admins manage vacancy experience reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage vacancy experience reqs" ON public.vacancy_experience_requirements TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: vacancy_language_requirements Admins manage vacancy language reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage vacancy language reqs" ON public.vacancy_language_requirements TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: vacancy_skills Admins manage vacancy skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage vacancy skills" ON public.vacancy_skills TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: work_arrangements Admins manage work arrangements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage work arrangements" ON public.work_arrangements TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: employer_accreditation_requirements Admins view accreditation requirements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view accreditation requirements" ON public.employer_accreditation_requirements FOR SELECT TO authenticated USING ((app.current_user_role() = 'admin'::public.user_role));


--
-- Name: employer_accreditation Admins view accreditations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view accreditations" ON public.employer_accreditation FOR SELECT TO authenticated USING ((app.current_user_role() = 'admin'::public.user_role));


--
-- Name: audit_logs Admins view audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role));


--
-- Name: registrants_legacy Applicants create own registration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants create own registration" ON public.registrants_legacy FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = owner_id) AND (registration_type = 'preregistered'::text)));


--
-- Name: returning_ofw_profiles Applicants insert own returning_ofw profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants insert own returning_ofw profile" ON public.returning_ofw_profiles FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = registrant_id));


--
-- Name: returning_worker_profiles Applicants insert own returning_worker profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants insert own returning_worker profile" ON public.returning_worker_profiles FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = registrant_id));


--
-- Name: returning_ofw_profiles Applicants update own returning_ofw profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants update own returning_ofw profile" ON public.returning_ofw_profiles FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = registrant_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = registrant_id));


--
-- Name: returning_worker_profiles Applicants update own returning_worker profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants update own returning_worker profile" ON public.returning_worker_profiles FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = registrant_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = registrant_id));


--
-- Name: registrants_legacy Applicants update pending own registration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants update pending own registration" ON public.registrants_legacy FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = owner_id) AND (check_in_status = 'pending'::public.checkin_status))) WITH CHECK (((( SELECT auth.uid() AS uid) = owner_id) AND (check_in_status = 'pending'::public.checkin_status)));


--
-- Name: event_vacancies Applicants view active event vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view active event vacancies" ON public.event_vacancies FOR SELECT TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = 'applicant'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = event_vacancies.vacancy_definition_id) AND (vd.is_active = true))))));


--
-- Name: events Applicants view active events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view active events" ON public.events FOR SELECT TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = 'applicant'::public.user_role) AND (status = ANY (ARRAY['upcoming'::public.event_status, 'ongoing'::public.event_status]))));


--
-- Name: vacancy_certification_requirements Applicants view active vacancy certification reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view active vacancy certification reqs" ON public.vacancy_certification_requirements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_certification_requirements.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: vacancy_education_requirements Applicants view active vacancy education reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view active vacancy education reqs" ON public.vacancy_education_requirements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_education_requirements.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: vacancy_experience_requirements Applicants view active vacancy experience reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view active vacancy experience reqs" ON public.vacancy_experience_requirements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_experience_requirements.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: vacancy_language_requirements Applicants view active vacancy language reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view active vacancy language reqs" ON public.vacancy_language_requirements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_language_requirements.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: vacancy_skills Applicants view active vacancy skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view active vacancy skills" ON public.vacancy_skills FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_skills.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: registrants_legacy Applicants view own registration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view own registration" ON public.registrants_legacy FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: returning_ofw_profiles Applicants view own returning_ofw profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view own returning_ofw profile" ON public.returning_ofw_profiles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = registrant_id));


--
-- Name: returning_worker_profiles Applicants view own returning_worker profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applicants view own returning_worker profile" ON public.returning_worker_profiles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = registrant_id));


--
-- Name: event_vacancies Approved employers manage own event vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved employers manage own event vacancies" ON public.event_vacancies TO authenticated USING ((vacancy_definition_id IN ( SELECT vd.id
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = auth.uid()) AND (e.registration_status = 'approved'::text))))) WITH CHECK ((vacancy_definition_id IN ( SELECT vd.id
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = auth.uid()) AND (e.registration_status = 'approved'::text)))));


--
-- Name: employers Approved employers update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved employers update own profile" ON public.employers FOR UPDATE TO authenticated USING (((registered_user_id = auth.uid()) AND (registration_status = 'approved'::text))) WITH CHECK (((registered_user_id = auth.uid()) AND (registration_status = 'approved'::text)));


--
-- Name: event_vacancies Authenticated users view event vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users view event vacancies" ON public.event_vacancies FOR SELECT TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])) OR ((( SELECT app.current_user_role() AS current_user_role) = 'supervisor'::public.user_role) AND public.supervisor_can_view_event(event_id))));


--
-- Name: events Authenticated users view events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users view events" ON public.events FOR SELECT TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])) OR ((( SELECT app.current_user_role() AS current_user_role) = 'supervisor'::public.user_role) AND public.supervisor_can_view_event(id))));


--
-- Name: medical_services Authenticated users view medical services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users view medical services" ON public.medical_services FOR SELECT TO authenticated USING (true);


--
-- Name: vacancies_legacy Authenticated users view vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users view vacancies" ON public.vacancies_legacy FOR SELECT TO authenticated USING (true);


--
-- Name: certifications Certifications readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Certifications readable" ON public.certifications FOR SELECT TO authenticated USING (true);


--
-- Name: education_levels Education levels readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Education levels readable" ON public.education_levels FOR SELECT TO authenticated USING (true);


--
-- Name: vacancy_certification_requirements Employers manage own vacancy certification reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers manage own vacancy certification reqs" ON public.vacancy_certification_requirements TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_certification_requirements.vacancy_definition_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_certification_requirements.vacancy_definition_id)))));


--
-- Name: vacancy_education_requirements Employers manage own vacancy education reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers manage own vacancy education reqs" ON public.vacancy_education_requirements TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_education_requirements.vacancy_definition_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_education_requirements.vacancy_definition_id)))));


--
-- Name: vacancy_experience_requirements Employers manage own vacancy experience reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers manage own vacancy experience reqs" ON public.vacancy_experience_requirements TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_experience_requirements.vacancy_definition_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_experience_requirements.vacancy_definition_id)))));


--
-- Name: vacancy_language_requirements Employers manage own vacancy language reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers manage own vacancy language reqs" ON public.vacancy_language_requirements TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_language_requirements.vacancy_definition_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_language_requirements.vacancy_definition_id)))));


--
-- Name: vacancy_skills Employers manage own vacancy skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers manage own vacancy skills" ON public.vacancy_skills TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_skills.vacancy_definition_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((e.registered_user_id = ( SELECT auth.uid() AS uid)) AND (e.registration_status = 'approved'::text) AND (vd.id = vacancy_skills.vacancy_definition_id)))));


--
-- Name: employers Employers register own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers register own company" ON public.employers FOR INSERT TO authenticated WITH CHECK (((registered_user_id = auth.uid()) AND (registration_status = 'pending'::text) AND (employer_type = ANY (ARRAY['local_direct'::text, 'local_agency'::text]))));


--
-- Name: profiles Employers update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers update own profile" ON public.profiles FOR UPDATE TO authenticated USING (((id = auth.uid()) AND (role = 'employer'::public.tc_user_role))) WITH CHECK (((id = auth.uid()) AND (role = 'employer'::public.tc_user_role)));


--
-- Name: events Employers view active events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view active events" ON public.events FOR SELECT TO authenticated USING (((app.current_user_role() = 'employer'::public.user_role) AND (status = ANY (ARRAY['upcoming'::public.event_status, 'ongoing'::public.event_status]))));


--
-- Name: registrant_vacancies_legacy Employers view applicants for own offerings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view applicants for own offerings" ON public.registrant_vacancies_legacy FOR SELECT TO authenticated USING ((event_vacancy_id IN ( SELECT event_vacancies.id
   FROM public.event_vacancies
  WHERE (event_vacancies.vacancy_definition_id IN ( SELECT vacancy_definitions.id
           FROM public.vacancy_definitions
          WHERE (vacancy_definitions.employer_id IN ( SELECT employers.id
                   FROM public.employers
                  WHERE (employers.registered_user_id = auth.uid()))))))));


--
-- Name: participation_vacancies Employers view applicants for own vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view applicants for own vacancies" ON public.participation_vacancies FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.employers emp
     JOIN public.vacancy_definitions vd ON ((vd.employer_id = emp.id)))
     JOIN public.event_vacancies ev ON ((ev.vacancy_definition_id = vd.id)))
  WHERE ((emp.registered_user_id = auth.uid()) AND (ev.id = participation_vacancies.event_vacancy_id)))));


--
-- Name: employer_accreditation Employers view own accreditation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view own accreditation" ON public.employer_accreditation FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employers e
  WHERE ((e.id = employer_accreditation.employer_id) AND (e.registered_user_id = auth.uid())))));


--
-- Name: employer_accreditation_requirements Employers view own accreditation requirements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view own accreditation requirements" ON public.employer_accreditation_requirements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.employer_accreditation a
     JOIN public.employers e ON ((e.id = a.employer_id)))
  WHERE ((a.id = employer_accreditation_requirements.accreditation_id) AND (e.registered_user_id = auth.uid())))));


--
-- Name: events Employers view own event offerings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view own event offerings" ON public.events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.employers emp
     JOIN public.vacancy_definitions vd ON ((vd.employer_id = emp.id)))
     JOIN public.event_vacancies ev ON ((ev.vacancy_definition_id = vd.id)))
  WHERE ((emp.registered_user_id = auth.uid()) AND (ev.event_id = events.id)))));


--
-- Name: event_vacancies Employers view own event vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view own event vacancies" ON public.event_vacancies FOR SELECT TO authenticated USING ((vacancy_definition_id IN ( SELECT vacancy_definitions.id
   FROM public.vacancy_definitions
  WHERE (vacancy_definitions.employer_id IN ( SELECT employers.id
           FROM public.employers
          WHERE (employers.registered_user_id = auth.uid()))))));


--
-- Name: employer_event_participations Employers view own participation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view own participation" ON public.employer_event_participations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employers e
  WHERE ((e.id = employer_event_participations.employer_id) AND (e.registered_user_id = auth.uid())))));


--
-- Name: employers Employers view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view own profile" ON public.employers FOR SELECT TO authenticated USING ((registered_user_id = auth.uid()));


--
-- Name: vacancy_history Employers view own vacancy history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers view own vacancy history" ON public.vacancy_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.vacancy_definitions vd
     JOIN public.employers e ON ((e.id = vd.employer_id)))
  WHERE ((vd.id = vacancy_history.vacancy_definition_id) AND (e.registered_user_id = auth.uid())))));


--
-- Name: employment_types Employment types readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employment types readable" ON public.employment_types FOR SELECT TO authenticated USING (true);


--
-- Name: employer_event_participations Event staff view employer participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event staff view employer participations" ON public.employer_event_participations FOR SELECT TO authenticated USING ((app.is_event_staff() OR (app.current_user_role() = 'admin'::public.user_role)));


--
-- Name: interview_logs Event staff view interviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event staff view interviews" ON public.interview_logs FOR SELECT TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])) OR ((( SELECT app.current_user_role() AS current_user_role) = 'supervisor'::public.user_role) AND public.supervisor_can_view_event(event_id))));


--
-- Name: referral_services Event staff view referral services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event staff view referral services" ON public.referral_services FOR SELECT TO authenticated USING (( SELECT app.is_event_staff() AS is_event_staff));


--
-- Name: registrants_legacy Event staff view registrants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event staff view registrants" ON public.registrants_legacy FOR SELECT TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])) OR ((( SELECT app.current_user_role() AS current_user_role) = 'supervisor'::public.user_role) AND public.supervisor_can_view_event(event_id))));


--
-- Name: registrant_vacancies_legacy Event staff view vacancy choices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event staff view vacancy choices" ON public.registrant_vacancies_legacy FOR SELECT TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])) OR ((( SELECT app.current_user_role() AS current_user_role) = 'supervisor'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.registrants_legacy r
  WHERE ((r.id = registrant_vacancies_legacy.registrant_id) AND public.supervisor_can_view_event(r.event_id)))))));


--
-- Name: industries Industries readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Industries readable" ON public.industries FOR SELECT TO authenticated USING (true);


--
-- Name: employment_embeddings Jobseekers can view own embeddings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers can view own embeddings" ON public.employment_embeddings FOR SELECT USING (((entity_type = 'jobseeker_profile'::public.entity_type) AND (entity_id IN ( SELECT jp.participant_id
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE (p.auth_user_id = auth.uid())))));


--
-- Name: jobseeker_certifications Jobseekers manage own certifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers manage own certifications" ON public.jobseeker_certifications TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_certifications.jobseeker_profile_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_certifications.jobseeker_profile_id)))));


--
-- Name: jobseeker_education Jobseekers manage own education; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers manage own education" ON public.jobseeker_education TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_education.jobseeker_profile_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_education.jobseeker_profile_id)))));


--
-- Name: jobseeker_employment_type_preferences Jobseekers manage own employment type prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers manage own employment type prefs" ON public.jobseeker_employment_type_preferences TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_employment_type_preferences.jobseeker_profile_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_employment_type_preferences.jobseeker_profile_id)))));


--
-- Name: jobseeker_industry_preferences Jobseekers manage own industry prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers manage own industry prefs" ON public.jobseeker_industry_preferences TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_industry_preferences.jobseeker_profile_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_industry_preferences.jobseeker_profile_id)))));


--
-- Name: jobseeker_languages Jobseekers manage own languages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers manage own languages" ON public.jobseeker_languages TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_languages.jobseeker_profile_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_languages.jobseeker_profile_id)))));


--
-- Name: jobseeker_location_preferences Jobseekers manage own location prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers manage own location prefs" ON public.jobseeker_location_preferences TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_location_preferences.jobseeker_profile_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_location_preferences.jobseeker_profile_id)))));


--
-- Name: jobseeker_occupation_preferences Jobseekers manage own occupation prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers manage own occupation prefs" ON public.jobseeker_occupation_preferences TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_occupation_preferences.jobseeker_profile_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_occupation_preferences.jobseeker_profile_id)))));


--
-- Name: jobseeker_skills Jobseekers manage own skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers manage own skills" ON public.jobseeker_skills TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_skills.jobseeker_profile_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_skills.jobseeker_profile_id)))));


--
-- Name: jobseeker_work_arrangement_preferences Jobseekers manage own work arrangement prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Jobseekers manage own work arrangement prefs" ON public.jobseeker_work_arrangement_preferences TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_work_arrangement_preferences.jobseeker_profile_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.jobseeker_profiles jp
     JOIN public.participants p ON ((p.id = jp.participant_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (jp.participant_id = jobseeker_work_arrangement_preferences.jobseeker_profile_id)))));


--
-- Name: languages Languages readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Languages readable" ON public.languages FOR SELECT TO authenticated USING (true);


--
-- Name: medical_referrals Medical and staff view referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Medical and staff view referrals" ON public.medical_referrals FOR SELECT TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])) OR ((( SELECT app.current_user_role() AS current_user_role) = 'supervisor'::public.user_role) AND public.supervisor_can_view_event(event_id))));


--
-- Name: medical_referrals Medical update referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Medical update referrals" ON public.medical_referrals FOR UPDATE TO authenticated USING ((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['medical'::public.user_role, 'admin'::public.user_role]))) WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['medical'::public.user_role, 'admin'::public.user_role])));


--
-- Name: occupation_aliases Occupation aliases readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Occupation aliases readable" ON public.occupation_aliases FOR SELECT TO authenticated USING (true);


--
-- Name: occupation_skills Occupation skills readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Occupation skills readable" ON public.occupation_skills FOR SELECT TO authenticated USING (true);


--
-- Name: occupations Occupations readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Occupations readable" ON public.occupations FOR SELECT TO authenticated USING (true);


--
-- Name: jobseeker_special_sectors Participants manage own special sectors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants manage own special sectors" ON public.jobseeker_special_sectors TO authenticated USING ((participant_id IN ( SELECT participants.id
   FROM public.participants
  WHERE (participants.auth_user_id = auth.uid())))) WITH CHECK ((participant_id IN ( SELECT participants.id
   FROM public.participants
  WHERE (participants.auth_user_id = auth.uid()))));


--
-- Name: work_experiences Participants manage own work experiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants manage own work experiences" ON public.work_experiences TO authenticated USING ((participant_id IN ( SELECT participants.id
   FROM public.participants
  WHERE (participants.auth_user_id = auth.uid())))) WITH CHECK ((participant_id IN ( SELECT participants.id
   FROM public.participants
  WHERE (participants.auth_user_id = auth.uid()))));


--
-- Name: employers Pending employers update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pending employers update own profile" ON public.employers FOR UPDATE TO authenticated USING (((registered_user_id = auth.uid()) AND (registration_status = 'pending'::text))) WITH CHECK (((registered_user_id = auth.uid()) AND (registration_status = 'pending'::text)));


--
-- Name: event_vacancies Public view active event vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public view active event vacancies" ON public.event_vacancies FOR SELECT TO anon USING (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_vacancies.event_id) AND (e.status = ANY (ARRAY['upcoming'::public.event_status, 'ongoing'::public.event_status]))))) AND (EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = event_vacancies.vacancy_definition_id) AND (vd.is_active = true))))));


--
-- Name: events Public view active events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public view active events" ON public.events FOR SELECT TO anon USING ((status = ANY (ARRAY['upcoming'::public.event_status, 'ongoing'::public.event_status])));


--
-- Name: vacancy_certification_requirements Public view active vacancy certification reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public view active vacancy certification reqs" ON public.vacancy_certification_requirements FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_certification_requirements.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: vacancy_education_requirements Public view active vacancy education reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public view active vacancy education reqs" ON public.vacancy_education_requirements FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_education_requirements.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: vacancy_experience_requirements Public view active vacancy experience reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public view active vacancy experience reqs" ON public.vacancy_experience_requirements FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_experience_requirements.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: vacancy_language_requirements Public view active vacancy language reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public view active vacancy language reqs" ON public.vacancy_language_requirements FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_language_requirements.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: vacancy_skills Public view active vacancy skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public view active vacancy skills" ON public.vacancy_skills FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.vacancy_definitions vd
  WHERE ((vd.id = vacancy_skills.vacancy_definition_id) AND (vd.is_active = true)))));


--
-- Name: skills Skills readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Skills readable" ON public.skills FOR SELECT TO authenticated USING (true);


--
-- Name: interview_logs Staff add interviews as self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff add interviews as self" ON public.interview_logs FOR INSERT TO authenticated WITH CHECK (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'admin'::public.user_role])) AND (interviewer_id = ( SELECT auth.uid() AS uid))));


--
-- Name: referral_services Staff add referral services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff add referral services" ON public.referral_services FOR INSERT TO authenticated WITH CHECK ((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])));


--
-- Name: medical_referrals Staff add referrals as self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff add referrals as self" ON public.medical_referrals FOR INSERT TO authenticated WITH CHECK (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])) AND (referred_by = ( SELECT auth.uid() AS uid))));


--
-- Name: referral_services Staff delete referral services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete referral services" ON public.referral_services FOR DELETE TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])) AND ((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['medical'::public.user_role, 'admin'::public.user_role])) OR (EXISTS ( SELECT 1
   FROM public.medical_referrals r
  WHERE ((r.id = referral_services.referral_id) AND (r.status <> 'completed'::public.referral_status)))))));


--
-- Name: medical_referrals Staff edit open referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff edit open referrals" ON public.medical_referrals FOR UPDATE TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = 'staff'::public.user_role) AND (status <> 'completed'::public.referral_status))) WITH CHECK (((( SELECT app.current_user_role() AS current_user_role) = 'staff'::public.user_role) AND (status <> 'completed'::public.referral_status)));


--
-- Name: employment_outcomes Staff manage employment outcomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage employment outcomes" ON public.employment_outcomes TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) AND (EXISTS ( SELECT 1
   FROM ((public.applications a
     JOIN public.registrants_legacy r ON ((r.id = a.registrant_id)))
     JOIN public.events e ON ((e.id = r.event_id)))
  WHERE ((a.id = employment_outcomes.application_id) AND public.supervisor_can_view_event(e.id))))));


--
-- Name: follow_ups Staff manage follow-ups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage follow-ups" ON public.follow_ups TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) AND (EXISTS ( SELECT 1
   FROM (((public.employment_outcomes eo
     JOIN public.applications a ON ((a.id = eo.application_id)))
     JOIN public.registrants_legacy r ON ((r.id = a.registrant_id)))
     JOIN public.events e ON ((e.id = r.event_id)))
  WHERE ((eo.id = follow_ups.employment_outcome_id) AND public.supervisor_can_view_event(e.id))))));


--
-- Name: ai_extraction_runs Staff read extraction runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read extraction runs" ON public.ai_extraction_runs FOR SELECT TO authenticated USING ((app.current_user_role() = ANY (ARRAY['admin'::public.user_role, 'staff'::public.user_role, 'supervisor'::public.user_role])));


--
-- Name: ai_extraction_suggestions Staff read extraction suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read extraction suggestions" ON public.ai_extraction_suggestions FOR SELECT TO authenticated USING ((app.current_user_role() = ANY (ARRAY['admin'::public.user_role, 'staff'::public.user_role, 'supervisor'::public.user_role])));


--
-- Name: employers Staff view employers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view employers" ON public.employers FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) OR (( SELECT app.current_user_role() AS current_user_role) = 'admin'::public.user_role)));


--
-- Name: employment_outcomes Staff view employment outcomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view employment outcomes" ON public.employment_outcomes FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) AND (EXISTS ( SELECT 1
   FROM ((public.applications a
     JOIN public.registrants_legacy r ON ((r.id = a.registrant_id)))
     JOIN public.events e ON ((e.id = r.event_id)))
  WHERE ((a.id = employment_outcomes.application_id) AND public.supervisor_can_view_event(e.id))))));


--
-- Name: follow_ups Staff view follow-ups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view follow-ups" ON public.follow_ups FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) AND (EXISTS ( SELECT 1
   FROM (((public.employment_outcomes eo
     JOIN public.applications a ON ((a.id = eo.application_id)))
     JOIN public.registrants_legacy r ON ((r.id = a.registrant_id)))
     JOIN public.events e ON ((e.id = r.event_id)))
  WHERE ((eo.id = follow_ups.employment_outcome_id) AND public.supervisor_can_view_event(e.id))))));


--
-- Name: jobseeker_certifications Staff view jobseeker certifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view jobseeker certifications" ON public.jobseeker_certifications FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: jobseeker_education Staff view jobseeker education; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view jobseeker education" ON public.jobseeker_education FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: jobseeker_employment_type_preferences Staff view jobseeker employment type prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view jobseeker employment type prefs" ON public.jobseeker_employment_type_preferences FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: jobseeker_industry_preferences Staff view jobseeker industry prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view jobseeker industry prefs" ON public.jobseeker_industry_preferences FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: jobseeker_languages Staff view jobseeker languages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view jobseeker languages" ON public.jobseeker_languages FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: jobseeker_location_preferences Staff view jobseeker location prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view jobseeker location prefs" ON public.jobseeker_location_preferences FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: jobseeker_occupation_preferences Staff view jobseeker occupation prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view jobseeker occupation prefs" ON public.jobseeker_occupation_preferences FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: jobseeker_skills Staff view jobseeker skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view jobseeker skills" ON public.jobseeker_skills FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: jobseeker_work_arrangement_preferences Staff view jobseeker work arrangement prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view jobseeker work arrangement prefs" ON public.jobseeker_work_arrangement_preferences FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: participants Staff view participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view participants" ON public.participants FOR SELECT TO authenticated USING (app.is_event_staff());


--
-- Name: participation_vacancies Staff view participation vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view participation vacancies" ON public.participation_vacancies FOR SELECT TO authenticated USING (app.is_event_staff());


--
-- Name: event_participations Staff view participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view participations" ON public.event_participations FOR SELECT TO authenticated USING (((( SELECT app.current_user_role() AS current_user_role) = ANY (ARRAY['staff'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])) OR ((( SELECT app.current_user_role() AS current_user_role) = 'supervisor'::public.user_role) AND public.supervisor_can_view_event(event_id))));


--
-- Name: jobseeker_profiles Staff view profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view profiles" ON public.jobseeker_profiles FOR SELECT TO authenticated USING (app.is_event_staff());


--
-- Name: returning_ofw_profiles Staff view returning_ofw profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view returning_ofw profiles" ON public.returning_ofw_profiles FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) AND (EXISTS ( SELECT 1
   FROM (public.registrants_legacy r
     JOIN public.events e ON ((e.id = r.event_id)))
  WHERE ((r.id = returning_ofw_profiles.registrant_id) AND public.supervisor_can_view_event(e.id))))));


--
-- Name: returning_worker_profiles Staff view returning_worker profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view returning_worker profiles" ON public.returning_worker_profiles FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) AND (EXISTS ( SELECT 1
   FROM (public.registrants_legacy r
     JOIN public.events e ON ((e.id = r.event_id)))
  WHERE ((r.id = returning_worker_profiles.registrant_id) AND public.supervisor_can_view_event(e.id))))));


--
-- Name: jobseeker_special_sectors Staff view special sectors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view special sectors" ON public.jobseeker_special_sectors FOR SELECT TO authenticated USING ((app.current_user_role() = ANY (ARRAY['staff'::public.user_role, 'supervisor'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])));


--
-- Name: vacancy_certification_requirements Staff view vacancy certification reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view vacancy certification reqs" ON public.vacancy_certification_requirements FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: vacancy_education_requirements Staff view vacancy education reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view vacancy education reqs" ON public.vacancy_education_requirements FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: vacancy_experience_requirements Staff view vacancy experience reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view vacancy experience reqs" ON public.vacancy_experience_requirements FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: vacancy_history Staff view vacancy history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view vacancy history" ON public.vacancy_history FOR SELECT TO authenticated USING ((app.is_event_staff() OR (app.current_user_role() = 'admin'::public.user_role)));


--
-- Name: vacancy_language_requirements Staff view vacancy language reqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view vacancy language reqs" ON public.vacancy_language_requirements FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: vacancy_skills Staff view vacancy skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view vacancy skills" ON public.vacancy_skills FOR SELECT TO authenticated USING ((( SELECT app.is_event_staff() AS is_event_staff) = true));


--
-- Name: work_experiences Staff view work experiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view work experiences" ON public.work_experiences FOR SELECT TO authenticated USING ((app.current_user_role() = ANY (ARRAY['staff'::public.user_role, 'supervisor'::public.user_role, 'medical'::public.user_role, 'admin'::public.user_role])));


--
-- Name: employment_embeddings Staff/Admin can view all embeddings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff/Admin can view all embeddings" ON public.employment_embeddings FOR SELECT USING ((app.current_user_role() = ANY (ARRAY['staff'::public.user_role, 'supervisor'::public.user_role, 'admin'::public.user_role])));


--
-- Name: taxonomy_mappings Taxonomy mappings readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Taxonomy mappings readable" ON public.taxonomy_mappings FOR SELECT TO authenticated USING (true);


--
-- Name: taxonomy_sources Taxonomy sources readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Taxonomy sources readable" ON public.taxonomy_sources FOR SELECT TO authenticated USING (true);


--
-- Name: jobseeker_profiles Users manage own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own profile" ON public.jobseeker_profiles TO authenticated USING ((participant_id IN ( SELECT participants.id
   FROM public.participants
  WHERE (participants.auth_user_id = auth.uid())))) WITH CHECK ((participant_id IN ( SELECT participants.id
   FROM public.participants
  WHERE (participants.auth_user_id = auth.uid()))));


--
-- Name: profiles Users read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: participants Users update own participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own participant" ON public.participants FOR UPDATE TO authenticated USING ((auth_user_id = auth.uid())) WITH CHECK ((auth_user_id = auth.uid()));


--
-- Name: event_assignments Users view own event assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own event assignments" ON public.event_assignments FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: participants Users view own participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own participant" ON public.participants FOR SELECT TO authenticated USING ((auth_user_id = auth.uid()));


--
-- Name: participation_vacancies Users view own participation vacancies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own participation vacancies" ON public.participation_vacancies FOR SELECT TO authenticated USING ((participation_id IN ( SELECT ep.id
   FROM (public.event_participations ep
     JOIN public.participants p ON ((p.id = ep.participant_id)))
  WHERE (p.auth_user_id = auth.uid()))));


--
-- Name: event_participations Users view own participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own participations" ON public.event_participations FOR SELECT TO authenticated USING ((participant_id IN ( SELECT participants.id
   FROM public.participants
  WHERE (participants.auth_user_id = auth.uid()))));


--
-- Name: work_arrangements Work arrangements readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Work arrangements readable" ON public.work_arrangements FOR SELECT TO authenticated USING (true);


--
-- Name: ai_extraction_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_extraction_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_extraction_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_extraction_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: certifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

--
-- Name: education_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.education_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: employer_accreditation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employer_accreditation ENABLE ROW LEVEL SECURITY;

--
-- Name: employer_accreditation_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employer_accreditation_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: employer_event_participations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employer_event_participations ENABLE ROW LEVEL SECURITY;

--
-- Name: employers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;

--
-- Name: employment_embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employment_embeddings ENABLE ROW LEVEL SECURITY;

--
-- Name: employment_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employment_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: employment_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employment_types ENABLE ROW LEVEL SECURITY;

--
-- Name: event_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: event_participations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_participations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_vacancies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_vacancies ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: industries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;

--
-- Name: interview_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interview_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_certifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_certifications ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_education; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_education ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_employment_type_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_employment_type_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_industry_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_industry_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_languages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_languages ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_location_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_location_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_occupation_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_occupation_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_profile_save_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_profile_save_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_special_sectors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_special_sectors ENABLE ROW LEVEL SECURITY;

--
-- Name: jobseeker_work_arrangement_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobseeker_work_arrangement_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: languages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;

--
-- Name: medical_referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medical_referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: medical_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medical_services ENABLE ROW LEVEL SECURITY;

--
-- Name: occupation_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.occupation_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: occupation_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.occupation_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: occupations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.occupations ENABLE ROW LEVEL SECURITY;

--
-- Name: participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

--
-- Name: participation_vacancies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.participation_vacancies ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_services ENABLE ROW LEVEL SECURITY;

--
-- Name: registrant_vacancies_legacy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registrant_vacancies_legacy ENABLE ROW LEVEL SECURITY;

--
-- Name: registrants_legacy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registrants_legacy ENABLE ROW LEVEL SECURITY;

--
-- Name: returning_ofw_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.returning_ofw_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: returning_worker_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.returning_worker_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: special_worker_sectors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.special_worker_sectors ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.taxonomy_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.taxonomy_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: vacancies_legacy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vacancies_legacy ENABLE ROW LEVEL SECURITY;

--
-- Name: vacancy_certification_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vacancy_certification_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: vacancy_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vacancy_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: vacancy_education_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vacancy_education_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: vacancy_experience_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vacancy_experience_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: vacancy_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vacancy_history ENABLE ROW LEVEL SECURITY;

--
-- Name: vacancy_language_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vacancy_language_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: vacancy_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vacancy_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: work_arrangements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_arrangements ENABLE ROW LEVEL SECURITY;

--
-- Name: work_experiences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_experiences ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION current_user_role(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION app.current_user_role() FROM PUBLIC;
GRANT ALL ON FUNCTION app.current_user_role() TO authenticated;


--
-- Name: FUNCTION is_event_staff(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION app.is_event_staff() FROM PUBLIC;
GRANT ALL ON FUNCTION app.is_event_staff() TO authenticated;


--
-- Name: FUNCTION accept_ai_suggestion(p_suggestion_id uuid, p_edited_canonical_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.accept_ai_suggestion(p_suggestion_id uuid, p_edited_canonical_id uuid) TO anon;
GRANT ALL ON FUNCTION public.accept_ai_suggestion(p_suggestion_id uuid, p_edited_canonical_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.accept_ai_suggestion(p_suggestion_id uuid, p_edited_canonical_id uuid) TO service_role;


--
-- Name: FUNCTION admin_approve_employer(p_employer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_approve_employer(p_employer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_approve_employer(p_employer_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.admin_approve_employer(p_employer_id uuid) TO authenticated;


--
-- Name: FUNCTION admin_create_user(p_email text, p_password text, p_full_name text, p_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_create_user(p_email text, p_password text, p_full_name text, p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_create_user(p_email text, p_password text, p_full_name text, p_role text) TO anon;
GRANT ALL ON FUNCTION public.admin_create_user(p_email text, p_password text, p_full_name text, p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_create_user(p_email text, p_password text, p_full_name text, p_role text) TO service_role;


--
-- Name: FUNCTION admin_create_user(p_email text, p_password text, p_full_name text, p_role text, p_jurisdiction text, p_is_provincial boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_create_user(p_email text, p_password text, p_full_name text, p_role text, p_jurisdiction text, p_is_provincial boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_create_user(p_email text, p_password text, p_full_name text, p_role text, p_jurisdiction text, p_is_provincial boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_create_user(p_email text, p_password text, p_full_name text, p_role text, p_jurisdiction text, p_is_provincial boolean) TO service_role;


--
-- Name: FUNCTION admin_link_employer_account(p_employer_id uuid, p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_link_employer_account(p_employer_id uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_link_employer_account(p_employer_id uuid, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_link_employer_account(p_employer_id uuid, p_email text) TO service_role;


--
-- Name: FUNCTION admin_reject_employer(p_employer_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_reject_employer(p_employer_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_reject_employer(p_employer_id uuid, p_reason text) TO service_role;
GRANT ALL ON FUNCTION public.admin_reject_employer(p_employer_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION admin_reset_password(p_user_id uuid, p_password text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_reset_password(p_user_id uuid, p_password text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_reset_password(p_user_id uuid, p_password text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_reset_password(p_user_id uuid, p_password text) TO service_role;


--
-- Name: FUNCTION check_in_employer(p_employer_code text, p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_in_employer(p_employer_code text, p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_in_employer(p_employer_code text, p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_in_employer(p_employer_code text, p_event_id uuid) TO service_role;


--
-- Name: TABLE event_participations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_participations TO anon;
GRANT ALL ON TABLE public.event_participations TO authenticated;
GRANT ALL ON TABLE public.event_participations TO service_role;


--
-- Name: FUNCTION check_in_registrant(registrant_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_in_registrant(registrant_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_in_registrant(registrant_uuid uuid) TO anon;
GRANT ALL ON FUNCTION public.check_in_registrant(registrant_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_in_registrant(registrant_uuid uuid) TO service_role;


--
-- Name: FUNCTION create_pending_accreditation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_pending_accreditation() TO anon;
GRANT ALL ON FUNCTION public.create_pending_accreditation() TO authenticated;
GRANT ALL ON FUNCTION public.create_pending_accreditation() TO service_role;


--
-- Name: FUNCTION create_walkin_registrant(p_event_id uuid, p_first_name text, p_middle_name text, p_last_name text, p_birthdate date, p_sex text, p_civil_status text, p_province text, p_municipality_city text, p_barangay text, p_contact_no text, p_email text, p_highest_educational_attainment text, p_course_program text, p_employment_preference text, p_interview_location text, p_first_time_jobseeker boolean, p_first_time_school text, p_first_time_graduation_year text, p_first_time_ojt_experience text, p_returning_ofw boolean, p_returning_worker boolean, p_ofw_country_last_worked text, p_ofw_previous_employer text, p_ofw_previous_occupation text, p_ofw_years_abroad text, p_ofw_date_returned text, p_ofw_reason_for_return text, p_rw_previous_work_location text, p_rw_previous_employer text, p_rw_previous_occupation text, p_rw_years_worked text, p_rw_date_returned text, p_rw_reason_for_return text, p_interested_in_skills_training boolean, p_preferred_training_program text, p_has_disability boolean, p_disability_type text, p_peso_assistance_programs text[], p_data_subject_rights_agreed boolean, p_vacancy_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_walkin_registrant(p_event_id uuid, p_first_name text, p_middle_name text, p_last_name text, p_birthdate date, p_sex text, p_civil_status text, p_province text, p_municipality_city text, p_barangay text, p_contact_no text, p_email text, p_highest_educational_attainment text, p_course_program text, p_employment_preference text, p_interview_location text, p_first_time_jobseeker boolean, p_first_time_school text, p_first_time_graduation_year text, p_first_time_ojt_experience text, p_returning_ofw boolean, p_returning_worker boolean, p_ofw_country_last_worked text, p_ofw_previous_employer text, p_ofw_previous_occupation text, p_ofw_years_abroad text, p_ofw_date_returned text, p_ofw_reason_for_return text, p_rw_previous_work_location text, p_rw_previous_employer text, p_rw_previous_occupation text, p_rw_years_worked text, p_rw_date_returned text, p_rw_reason_for_return text, p_interested_in_skills_training boolean, p_preferred_training_program text, p_has_disability boolean, p_disability_type text, p_peso_assistance_programs text[], p_data_subject_rights_agreed boolean, p_vacancy_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_walkin_registrant(p_event_id uuid, p_first_name text, p_middle_name text, p_last_name text, p_birthdate date, p_sex text, p_civil_status text, p_province text, p_municipality_city text, p_barangay text, p_contact_no text, p_email text, p_highest_educational_attainment text, p_course_program text, p_employment_preference text, p_interview_location text, p_first_time_jobseeker boolean, p_first_time_school text, p_first_time_graduation_year text, p_first_time_ojt_experience text, p_returning_ofw boolean, p_returning_worker boolean, p_ofw_country_last_worked text, p_ofw_previous_employer text, p_ofw_previous_occupation text, p_ofw_years_abroad text, p_ofw_date_returned text, p_ofw_reason_for_return text, p_rw_previous_work_location text, p_rw_previous_employer text, p_rw_previous_occupation text, p_rw_years_worked text, p_rw_date_returned text, p_rw_reason_for_return text, p_interested_in_skills_training boolean, p_preferred_training_program text, p_has_disability boolean, p_disability_type text, p_peso_assistance_programs text[], p_data_subject_rights_agreed boolean, p_vacancy_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.create_walkin_registrant(p_event_id uuid, p_first_name text, p_middle_name text, p_last_name text, p_birthdate date, p_sex text, p_civil_status text, p_province text, p_municipality_city text, p_barangay text, p_contact_no text, p_email text, p_highest_educational_attainment text, p_course_program text, p_employment_preference text, p_interview_location text, p_first_time_jobseeker boolean, p_first_time_school text, p_first_time_graduation_year text, p_first_time_ojt_experience text, p_returning_ofw boolean, p_returning_worker boolean, p_ofw_country_last_worked text, p_ofw_previous_employer text, p_ofw_previous_occupation text, p_ofw_years_abroad text, p_ofw_date_returned text, p_ofw_reason_for_return text, p_rw_previous_work_location text, p_rw_previous_employer text, p_rw_previous_occupation text, p_rw_years_worked text, p_rw_date_returned text, p_rw_reason_for_return text, p_interested_in_skills_training boolean, p_preferred_training_program text, p_has_disability boolean, p_disability_type text, p_peso_assistance_programs text[], p_data_subject_rights_agreed boolean, p_vacancy_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_walkin_registrant(p_event_id uuid, p_first_name text, p_middle_name text, p_last_name text, p_birthdate date, p_sex text, p_civil_status text, p_province text, p_municipality_city text, p_barangay text, p_contact_no text, p_email text, p_highest_educational_attainment text, p_course_program text, p_employment_preference text, p_interview_location text, p_first_time_jobseeker boolean, p_first_time_school text, p_first_time_graduation_year text, p_first_time_ojt_experience text, p_returning_ofw boolean, p_returning_worker boolean, p_ofw_country_last_worked text, p_ofw_previous_employer text, p_ofw_previous_occupation text, p_ofw_years_abroad text, p_ofw_date_returned text, p_ofw_reason_for_return text, p_rw_previous_work_location text, p_rw_previous_employer text, p_rw_previous_occupation text, p_rw_years_worked text, p_rw_date_returned text, p_rw_reason_for_return text, p_interested_in_skills_training boolean, p_preferred_training_program text, p_has_disability boolean, p_disability_type text, p_peso_assistance_programs text[], p_data_subject_rights_agreed boolean, p_vacancy_ids uuid[]) TO service_role;


--
-- Name: FUNCTION edit_ai_suggestion(p_suggestion_id uuid, p_edited_term text, p_edited_canonical_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.edit_ai_suggestion(p_suggestion_id uuid, p_edited_term text, p_edited_canonical_id uuid) TO anon;
GRANT ALL ON FUNCTION public.edit_ai_suggestion(p_suggestion_id uuid, p_edited_term text, p_edited_canonical_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.edit_ai_suggestion(p_suggestion_id uuid, p_edited_term text, p_edited_canonical_id uuid) TO service_role;


--
-- Name: FUNCTION employer_signup_allowed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.employer_signup_allowed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.employer_signup_allowed() TO anon;
GRANT ALL ON FUNCTION public.employer_signup_allowed() TO authenticated;
GRANT ALL ON FUNCTION public.employer_signup_allowed() TO service_role;


--
-- Name: FUNCTION enforce_jobseeker_profile_daily_limit(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_jobseeker_profile_daily_limit() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_jobseeker_profile_daily_limit() TO anon;
GRANT ALL ON FUNCTION public.enforce_jobseeker_profile_daily_limit() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_jobseeker_profile_daily_limit() TO service_role;


--
-- Name: FUNCTION get_embedding_metadata(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type, p_embedding_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_embedding_metadata(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type, p_embedding_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_embedding_metadata(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type, p_embedding_version text) TO authenticated;
GRANT ALL ON FUNCTION public.get_embedding_metadata(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type, p_embedding_version text) TO service_role;


--
-- Name: FUNCTION get_employer_applicants(p_event_vacancy_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_employer_applicants(p_event_vacancy_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_employer_applicants(p_event_vacancy_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_employer_applicants(p_event_vacancy_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_employer_applicants(p_event_vacancy_id uuid) TO service_role;


--
-- Name: FUNCTION get_event_participating_employers(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_event_participating_employers(p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_event_participating_employers(p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_event_participating_employers(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_event_participating_employers(p_event_id uuid) TO service_role;


--
-- Name: TABLE participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.participants TO anon;
GRANT ALL ON TABLE public.participants TO authenticated;
GRANT ALL ON TABLE public.participants TO service_role;


--
-- Name: FUNCTION get_or_create_participant(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_or_create_participant() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_or_create_participant() TO anon;
GRANT ALL ON FUNCTION public.get_or_create_participant() TO authenticated;
GRANT ALL ON FUNCTION public.get_or_create_participant() TO service_role;


--
-- Name: FUNCTION hash_password(p_password text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.hash_password(p_password text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hash_password(p_password text) TO service_role;


--
-- Name: FUNCTION list_pending_suggestions(p_entity_type text, p_entity_id uuid, p_resolution_status text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.list_pending_suggestions(p_entity_type text, p_entity_id uuid, p_resolution_status text) TO anon;
GRANT ALL ON FUNCTION public.list_pending_suggestions(p_entity_type text, p_entity_id uuid, p_resolution_status text) TO authenticated;
GRANT ALL ON FUNCTION public.list_pending_suggestions(p_entity_type text, p_entity_id uuid, p_resolution_status text) TO service_role;


--
-- Name: FUNCTION mark_embeddings_stale(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_embeddings_stale(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_embeddings_stale(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type) TO authenticated;
GRANT ALL ON FUNCTION public.mark_embeddings_stale(p_entity_type public.entity_type, p_entity_id uuid, p_embedding_type public.embedding_type) TO service_role;


--
-- Name: FUNCTION participate_in_event(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.participate_in_event(p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.participate_in_event(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.participate_in_event(p_event_id uuid) TO service_role;


--
-- Name: TABLE interview_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.interview_logs TO anon;
GRANT ALL ON TABLE public.interview_logs TO authenticated;
GRANT ALL ON TABLE public.interview_logs TO service_role;


--
-- Name: FUNCTION record_interview_result(p_registrant_id uuid, p_event_id uuid, p_employer_id uuid, p_vacancy_definition_id uuid, p_status public.interview_status, p_application_id uuid, p_interview_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_interview_result(p_registrant_id uuid, p_event_id uuid, p_employer_id uuid, p_vacancy_definition_id uuid, p_status public.interview_status, p_application_id uuid, p_interview_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_interview_result(p_registrant_id uuid, p_event_id uuid, p_employer_id uuid, p_vacancy_definition_id uuid, p_status public.interview_status, p_application_id uuid, p_interview_notes text) TO anon;
GRANT ALL ON FUNCTION public.record_interview_result(p_registrant_id uuid, p_event_id uuid, p_employer_id uuid, p_vacancy_definition_id uuid, p_status public.interview_status, p_application_id uuid, p_interview_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.record_interview_result(p_registrant_id uuid, p_event_id uuid, p_employer_id uuid, p_vacancy_definition_id uuid, p_status public.interview_status, p_application_id uuid, p_interview_notes text) TO service_role;


--
-- Name: FUNCTION record_vacancy_history(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_vacancy_history() TO anon;
GRANT ALL ON FUNCTION public.record_vacancy_history() TO authenticated;
GRANT ALL ON FUNCTION public.record_vacancy_history() TO service_role;


--
-- Name: FUNCTION register_for_event(p_event_id uuid, p_vacancy_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.register_for_event(p_event_id uuid, p_vacancy_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_for_event(p_event_id uuid, p_vacancy_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.register_for_event(p_event_id uuid, p_vacancy_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.register_for_event(p_event_id uuid, p_vacancy_ids uuid[]) TO service_role;


--
-- Name: FUNCTION resolve_login_email(p_identifier text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_login_email(p_identifier text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_login_email(p_identifier text) TO anon;
GRANT ALL ON FUNCTION public.resolve_login_email(p_identifier text) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_login_email(p_identifier text) TO service_role;


--
-- Name: FUNCTION review_accreditation_requirement(p_requirement_id uuid, p_status text, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.review_accreditation_requirement(p_requirement_id uuid, p_status text, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.review_accreditation_requirement(p_requirement_id uuid, p_status text, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.review_accreditation_requirement(p_requirement_id uuid, p_status text, p_notes text) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: TABLE jobseeker_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_profiles TO anon;
GRANT ALL ON TABLE public.jobseeker_profiles TO authenticated;
GRANT ALL ON TABLE public.jobseeker_profiles TO service_role;


--
-- Name: FUNCTION save_jobseeker_profile(p_profile jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_jobseeker_profile(p_profile jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_jobseeker_profile(p_profile jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_jobseeker_profile(p_profile jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_jobseeker_profile(p_profile jsonb) TO service_role;


--
-- Name: FUNCTION seed_accreditation_requirements(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.seed_accreditation_requirements() TO anon;
GRANT ALL ON FUNCTION public.seed_accreditation_requirements() TO authenticated;
GRANT ALL ON FUNCTION public.seed_accreditation_requirements() TO service_role;


--
-- Name: FUNCTION set_updated_at_ai_extraction_runs(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at_ai_extraction_runs() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at_ai_extraction_runs() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at_ai_extraction_runs() TO service_role;


--
-- Name: FUNCTION set_updated_at_ai_extraction_suggestions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at_ai_extraction_suggestions() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at_ai_extraction_suggestions() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at_ai_extraction_suggestions() TO service_role;


--
-- Name: FUNCTION staff_register_participant(p_participant_id uuid, p_event_id uuid, p_vacancy_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.staff_register_participant(p_participant_id uuid, p_event_id uuid, p_vacancy_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_register_participant(p_participant_id uuid, p_event_id uuid, p_vacancy_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.staff_register_participant(p_participant_id uuid, p_event_id uuid, p_vacancy_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.staff_register_participant(p_participant_id uuid, p_event_id uuid, p_vacancy_ids uuid[]) TO service_role;


--
-- Name: FUNCTION submit_accreditation_document(p_requirement_id uuid, p_path text, p_filename text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_accreditation_document(p_requirement_id uuid, p_path text, p_filename text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_accreditation_document(p_requirement_id uuid, p_path text, p_filename text) TO authenticated;
GRANT ALL ON FUNCTION public.submit_accreditation_document(p_requirement_id uuid, p_path text, p_filename text) TO service_role;


--
-- Name: FUNCTION supervisor_can_view_event(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.supervisor_can_view_event(p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.supervisor_can_view_event(p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.supervisor_can_view_event(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.supervisor_can_view_event(p_event_id uuid) TO service_role;


--
-- Name: FUNCTION supervisor_municipalities(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.supervisor_municipalities() FROM PUBLIC;
GRANT ALL ON FUNCTION public.supervisor_municipalities() TO anon;
GRANT ALL ON FUNCTION public.supervisor_municipalities() TO authenticated;
GRANT ALL ON FUNCTION public.supervisor_municipalities() TO service_role;


--
-- Name: TABLE ai_extraction_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_extraction_runs TO anon;
GRANT ALL ON TABLE public.ai_extraction_runs TO authenticated;
GRANT ALL ON TABLE public.ai_extraction_runs TO service_role;


--
-- Name: TABLE ai_extraction_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_extraction_suggestions TO anon;
GRANT ALL ON TABLE public.ai_extraction_suggestions TO authenticated;
GRANT ALL ON TABLE public.ai_extraction_suggestions TO service_role;


--
-- Name: TABLE applications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.applications TO authenticated;
GRANT ALL ON TABLE public.applications TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: SEQUENCE audit_logs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.audit_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.audit_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.audit_logs_id_seq TO service_role;


--
-- Name: TABLE certifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.certifications TO anon;
GRANT ALL ON TABLE public.certifications TO authenticated;
GRANT ALL ON TABLE public.certifications TO service_role;


--
-- Name: TABLE education_levels; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.education_levels TO anon;
GRANT ALL ON TABLE public.education_levels TO authenticated;
GRANT ALL ON TABLE public.education_levels TO service_role;


--
-- Name: TABLE employer_accreditation; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employer_accreditation TO anon;
GRANT ALL ON TABLE public.employer_accreditation TO authenticated;
GRANT ALL ON TABLE public.employer_accreditation TO service_role;


--
-- Name: TABLE employer_accreditation_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employer_accreditation_requirements TO anon;
GRANT ALL ON TABLE public.employer_accreditation_requirements TO authenticated;
GRANT ALL ON TABLE public.employer_accreditation_requirements TO service_role;


--
-- Name: SEQUENCE employer_code_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.employer_code_seq TO anon;
GRANT ALL ON SEQUENCE public.employer_code_seq TO authenticated;
GRANT ALL ON SEQUENCE public.employer_code_seq TO service_role;


--
-- Name: TABLE employer_event_participations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employer_event_participations TO anon;
GRANT ALL ON TABLE public.employer_event_participations TO authenticated;
GRANT ALL ON TABLE public.employer_event_participations TO service_role;


--
-- Name: TABLE employers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employers TO authenticated;
GRANT ALL ON TABLE public.employers TO service_role;


--
-- Name: TABLE employment_embeddings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employment_embeddings TO service_role;
GRANT SELECT ON TABLE public.employment_embeddings TO authenticated;


--
-- Name: TABLE employment_outcomes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employment_outcomes TO anon;
GRANT ALL ON TABLE public.employment_outcomes TO authenticated;
GRANT ALL ON TABLE public.employment_outcomes TO service_role;


--
-- Name: TABLE employment_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employment_types TO anon;
GRANT ALL ON TABLE public.employment_types TO authenticated;
GRANT ALL ON TABLE public.employment_types TO service_role;


--
-- Name: TABLE event_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_assignments TO anon;
GRANT ALL ON TABLE public.event_assignments TO authenticated;
GRANT ALL ON TABLE public.event_assignments TO service_role;


--
-- Name: TABLE event_vacancies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_vacancies TO anon;
GRANT ALL ON TABLE public.event_vacancies TO authenticated;
GRANT ALL ON TABLE public.event_vacancies TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: TABLE follow_ups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.follow_ups TO anon;
GRANT ALL ON TABLE public.follow_ups TO authenticated;
GRANT ALL ON TABLE public.follow_ups TO service_role;


--
-- Name: TABLE industries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.industries TO anon;
GRANT ALL ON TABLE public.industries TO authenticated;
GRANT ALL ON TABLE public.industries TO service_role;


--
-- Name: TABLE jobseeker_certifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_certifications TO anon;
GRANT ALL ON TABLE public.jobseeker_certifications TO authenticated;
GRANT ALL ON TABLE public.jobseeker_certifications TO service_role;


--
-- Name: TABLE jobseeker_education; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_education TO anon;
GRANT ALL ON TABLE public.jobseeker_education TO authenticated;
GRANT ALL ON TABLE public.jobseeker_education TO service_role;


--
-- Name: TABLE jobseeker_employment_type_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_employment_type_preferences TO anon;
GRANT ALL ON TABLE public.jobseeker_employment_type_preferences TO authenticated;
GRANT ALL ON TABLE public.jobseeker_employment_type_preferences TO service_role;


--
-- Name: TABLE jobseeker_industry_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_industry_preferences TO anon;
GRANT ALL ON TABLE public.jobseeker_industry_preferences TO authenticated;
GRANT ALL ON TABLE public.jobseeker_industry_preferences TO service_role;


--
-- Name: TABLE jobseeker_languages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_languages TO anon;
GRANT ALL ON TABLE public.jobseeker_languages TO authenticated;
GRANT ALL ON TABLE public.jobseeker_languages TO service_role;


--
-- Name: TABLE jobseeker_location_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_location_preferences TO anon;
GRANT ALL ON TABLE public.jobseeker_location_preferences TO authenticated;
GRANT ALL ON TABLE public.jobseeker_location_preferences TO service_role;


--
-- Name: TABLE jobseeker_occupation_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_occupation_preferences TO anon;
GRANT ALL ON TABLE public.jobseeker_occupation_preferences TO authenticated;
GRANT ALL ON TABLE public.jobseeker_occupation_preferences TO service_role;


--
-- Name: TABLE jobseeker_profile_save_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_profile_save_limits TO anon;
GRANT ALL ON TABLE public.jobseeker_profile_save_limits TO authenticated;
GRANT ALL ON TABLE public.jobseeker_profile_save_limits TO service_role;


--
-- Name: TABLE jobseeker_skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_skills TO anon;
GRANT ALL ON TABLE public.jobseeker_skills TO authenticated;
GRANT ALL ON TABLE public.jobseeker_skills TO service_role;


--
-- Name: TABLE jobseeker_special_sectors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_special_sectors TO anon;
GRANT ALL ON TABLE public.jobseeker_special_sectors TO authenticated;
GRANT ALL ON TABLE public.jobseeker_special_sectors TO service_role;


--
-- Name: TABLE jobseeker_work_arrangement_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobseeker_work_arrangement_preferences TO anon;
GRANT ALL ON TABLE public.jobseeker_work_arrangement_preferences TO authenticated;
GRANT ALL ON TABLE public.jobseeker_work_arrangement_preferences TO service_role;


--
-- Name: TABLE languages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.languages TO anon;
GRANT ALL ON TABLE public.languages TO authenticated;
GRANT ALL ON TABLE public.languages TO service_role;


--
-- Name: TABLE medical_referrals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.medical_referrals TO anon;
GRANT ALL ON TABLE public.medical_referrals TO authenticated;
GRANT ALL ON TABLE public.medical_referrals TO service_role;


--
-- Name: TABLE medical_services; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.medical_services TO anon;
GRANT ALL ON TABLE public.medical_services TO authenticated;
GRANT ALL ON TABLE public.medical_services TO service_role;


--
-- Name: TABLE occupation_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.occupation_aliases TO anon;
GRANT ALL ON TABLE public.occupation_aliases TO authenticated;
GRANT ALL ON TABLE public.occupation_aliases TO service_role;


--
-- Name: TABLE occupation_skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.occupation_skills TO anon;
GRANT ALL ON TABLE public.occupation_skills TO authenticated;
GRANT ALL ON TABLE public.occupation_skills TO service_role;


--
-- Name: TABLE occupations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.occupations TO anon;
GRANT ALL ON TABLE public.occupations TO authenticated;
GRANT ALL ON TABLE public.occupations TO service_role;


--
-- Name: TABLE participation_vacancies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.participation_vacancies TO anon;
GRANT ALL ON TABLE public.participation_vacancies TO authenticated;
GRANT ALL ON TABLE public.participation_vacancies TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE referral_services; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_services TO anon;
GRANT ALL ON TABLE public.referral_services TO authenticated;
GRANT ALL ON TABLE public.referral_services TO service_role;


--
-- Name: TABLE registrant_vacancies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registrant_vacancies TO anon;
GRANT ALL ON TABLE public.registrant_vacancies TO authenticated;
GRANT ALL ON TABLE public.registrant_vacancies TO service_role;


--
-- Name: TABLE registrant_vacancies_legacy; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registrant_vacancies_legacy TO anon;
GRANT ALL ON TABLE public.registrant_vacancies_legacy TO authenticated;
GRANT ALL ON TABLE public.registrant_vacancies_legacy TO service_role;


--
-- Name: TABLE registrants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registrants TO anon;
GRANT ALL ON TABLE public.registrants TO authenticated;
GRANT ALL ON TABLE public.registrants TO service_role;


--
-- Name: TABLE registrants_legacy; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registrants_legacy TO anon;
GRANT ALL ON TABLE public.registrants_legacy TO authenticated;
GRANT ALL ON TABLE public.registrants_legacy TO service_role;


--
-- Name: TABLE returning_ofw_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.returning_ofw_profiles TO anon;
GRANT ALL ON TABLE public.returning_ofw_profiles TO authenticated;
GRANT ALL ON TABLE public.returning_ofw_profiles TO service_role;


--
-- Name: TABLE returning_worker_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.returning_worker_profiles TO anon;
GRANT ALL ON TABLE public.returning_worker_profiles TO authenticated;
GRANT ALL ON TABLE public.returning_worker_profiles TO service_role;


--
-- Name: TABLE skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skills TO anon;
GRANT ALL ON TABLE public.skills TO authenticated;
GRANT ALL ON TABLE public.skills TO service_role;


--
-- Name: TABLE special_worker_sectors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.special_worker_sectors TO anon;
GRANT ALL ON TABLE public.special_worker_sectors TO authenticated;
GRANT ALL ON TABLE public.special_worker_sectors TO service_role;


--
-- Name: TABLE taxonomy_mappings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.taxonomy_mappings TO anon;
GRANT ALL ON TABLE public.taxonomy_mappings TO authenticated;
GRANT ALL ON TABLE public.taxonomy_mappings TO service_role;


--
-- Name: TABLE taxonomy_sources; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.taxonomy_sources TO anon;
GRANT ALL ON TABLE public.taxonomy_sources TO authenticated;
GRANT ALL ON TABLE public.taxonomy_sources TO service_role;


--
-- Name: TABLE vacancies_legacy; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vacancies_legacy TO anon;
GRANT ALL ON TABLE public.vacancies_legacy TO authenticated;
GRANT ALL ON TABLE public.vacancies_legacy TO service_role;


--
-- Name: TABLE vacancy_certification_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vacancy_certification_requirements TO anon;
GRANT ALL ON TABLE public.vacancy_certification_requirements TO authenticated;
GRANT ALL ON TABLE public.vacancy_certification_requirements TO service_role;


--
-- Name: TABLE vacancy_definitions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vacancy_definitions TO anon;
GRANT ALL ON TABLE public.vacancy_definitions TO authenticated;
GRANT ALL ON TABLE public.vacancy_definitions TO service_role;


--
-- Name: TABLE vacancy_education_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vacancy_education_requirements TO anon;
GRANT ALL ON TABLE public.vacancy_education_requirements TO authenticated;
GRANT ALL ON TABLE public.vacancy_education_requirements TO service_role;


--
-- Name: TABLE vacancy_experience_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vacancy_experience_requirements TO anon;
GRANT ALL ON TABLE public.vacancy_experience_requirements TO authenticated;
GRANT ALL ON TABLE public.vacancy_experience_requirements TO service_role;


--
-- Name: TABLE vacancy_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vacancy_history TO anon;
GRANT ALL ON TABLE public.vacancy_history TO authenticated;
GRANT ALL ON TABLE public.vacancy_history TO service_role;


--
-- Name: TABLE vacancy_language_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vacancy_language_requirements TO anon;
GRANT ALL ON TABLE public.vacancy_language_requirements TO authenticated;
GRANT ALL ON TABLE public.vacancy_language_requirements TO service_role;


--
-- Name: TABLE vacancy_skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vacancy_skills TO anon;
GRANT ALL ON TABLE public.vacancy_skills TO authenticated;
GRANT ALL ON TABLE public.vacancy_skills TO service_role;


--
-- Name: TABLE work_arrangements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.work_arrangements TO anon;
GRANT ALL ON TABLE public.work_arrangements TO authenticated;
GRANT ALL ON TABLE public.work_arrangements TO service_role;


--
-- Name: TABLE work_experiences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.work_experiences TO anon;
GRANT ALL ON TABLE public.work_experiences TO authenticated;
GRANT ALL ON TABLE public.work_experiences TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



