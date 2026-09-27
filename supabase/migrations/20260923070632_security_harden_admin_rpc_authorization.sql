-- Migration: 20260923053000_security_harden_admin_rpc_authorization.sql
-- Description: Fail closed when admin RPCs are invoked without an active, authenticated
-- admin profile. Eliminate SQL three-valued logic bypass on auth.uid() IS NULL.
-- Remove obsolete unledgered 4-argument admin_create_user overload to resolve
-- PostgREST PGRST203 ambiguity while maintaining full backward-compatibility via
-- canonical 6-argument function with default parameters.

BEGIN;

-- 1. Remove ambiguous 4-argument overload.
-- The canonical 6-argument function with DEFAULT parameters satisfies both
-- 4-argument and 6-argument callers without PostgREST ambiguity.
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text);

-- 2. Define canonical, fail-closed admin_create_user (6 arguments)
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text DEFAULT NULL::text,
  p_role text DEFAULT 'staff'::text,
  p_jurisdiction text DEFAULT NULL::text,
  p_is_provincial boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_role public.tc_user_role;
  v_caller_role text;
  v_password_hash text;
BEGIN
  -- Strict, null-safe admin authorization check
  SELECT coalesce(role::text, 'applicant') INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid() AND is_active = true;

  IF auth.uid() IS NULL OR v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  -- Validate role: explicit allowlist prevents enum injection.
  -- Employers self-register separately.
  IF p_role NOT IN ('staff', 'supervisor', 'medical', 'admin') THEN
    RAISE EXCEPTION 'Invalid role "%". Allowed: staff, supervisor, medical, admin', p_role;
  END IF;

  IF p_email IS NULL OR p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Email and a password of at least 6 characters are required';
  END IF;

  -- Jurisdiction/is_provincial only apply to supervisors
  IF p_role <> 'supervisor' THEN
    p_jurisdiction := NULL;
    p_is_provincial := false;
  END IF;

  v_role := p_role::public.tc_user_role;
  v_password_hash := public.hash_password(p_password);

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES (
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
  RETURNING id INTO v_id;

  UPDATE public.profiles
  SET role = v_role,
      is_active = true,
      full_name = coalesce(p_full_name, full_name),
      jurisdiction = p_jurisdiction,
      is_provincial = p_is_provincial
  WHERE id = v_id;

  RETURN v_id;
END;
$function$;

-- 3. Define canonical, fail-closed admin_approve_employer
CREATE OR REPLACE FUNCTION public.admin_approve_employer(p_employer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_code text;
  v_caller_role text;
BEGIN
  -- Strict, null-safe admin authorization check
  v_caller_role := app.current_user_role();

  IF auth.uid() IS NULL OR v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM employer_accreditation_requirements r
    JOIN employer_accreditation a ON a.id = r.accreditation_id
    JOIN employers e ON e.id = a.employer_id
    WHERE e.id = p_employer_id
      AND r.status IS DISTINCT FROM 'approved'
      AND (
        r.requirement_key IN (
          'letter_of_intent','company_profile','business_permit','bir_2303',
          'philhealth_registration','pagibig_registration','sss_registration',
          'philjobnet_certificate'
        )
        OR (r.requirement_key = 'sec_registration'
            AND e.business_structure IN ('corporation','partnership'))
        OR (r.requirement_key = 'dti_registration'
            AND e.business_structure = 'single_proprietorship')
        OR (r.requirement_key = 'cda_registration'
            AND e.business_structure = 'cooperative')
        OR (r.requirement_key = 'dole_rule_1020' AND e.employer_type = 'local_direct')
        OR (r.requirement_key = 'dole_do174' AND e.employer_type = 'local_agency')
        OR (r.requirement_key = 'bosh_certificate'
            AND e.osh_classification = 'low_risk')
        OR (r.requirement_key = 'cosh_certificate'
            AND e.osh_classification = 'construction_heavy_industrial')
      )
  ) THEN
    RAISE EXCEPTION 'Cannot approve: not all applicable accreditation requirements are approved yet';
  END IF;

  UPDATE employers
  SET registration_status = 'approved',
      rejection_reason = NULL,
      updated_at = now()
  WHERE id = p_employer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employer % not found', p_employer_id;
  END IF;

  -- Issue permanent Employer ID on first accreditation.
  IF NOT EXISTS (
    SELECT 1 FROM employers
    WHERE id = p_employer_id AND employer_code IS NOT NULL
  ) THEN
    LOOP
      v_code := 'EMP-' || lpad(nextval('employer_code_seq')::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM employers WHERE employer_code = v_code);
    END LOOP;
    UPDATE employers SET employer_code = v_code WHERE id = p_employer_id;
  END IF;

  UPDATE employer_accreditation
  SET status = 'approved', approved_at = now(), updated_at = now()
  WHERE employer_id = p_employer_id;

  SELECT registered_user_id INTO v_user_id
  FROM employers
  WHERE id = p_employer_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE profiles SET role = 'employer', is_active = true WHERE id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked profile % missing for employer %', v_user_id, p_employer_id;
    END IF;
  END IF;
END;
$function$;

-- 4. RPC ACL Hardening: Only authenticated administrators via UI sessions
REVOKE EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, boolean) FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_approve_employer(uuid) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_employer(uuid) TO authenticated;

COMMIT;

